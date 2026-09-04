import { describe, expect, test } from "bun:test";
import type { Matrix } from "../src/matrix.ts";
import type { State } from "../src/state.ts";
import { checkState, computeMaxComponent, computeMaxPivot, computePlan } from "../src/compat.ts";

// platform をpivotとした架空の2component(moduleA/moduleB)で、実運用(kubernetes×addon群)と同じ形の
// 「上限がぴったり現在値」シナリオを再現するfixture。
function fixtureMatrix(): Matrix {
  return {
    version: 1,
    pivot: "platform",
    releases: {},
    components: {
      moduleA: {
        "1.6": { requires: { platform: "2.0..2.3" } },
        "1.7": { requires: { platform: "2.2..2.4" } },
        "1.8": { requires: { platform: "2.4..2.6" } },
      },
      moduleB: {
        "3.1": { requires: { platform: "2.0..2.3" } },
        "3.2": { requires: { platform: "2.3..2.4" } },
        "3.3": { requires: { platform: "2.4..2.6" } },
      },
    },
  };
}

function fixtureState(): State {
  return { platform: "v2.4.1", moduleA: "1.7.0", moduleB: "3.2.0" };
}

describe("checkState", () => {
  test("現在Stateが全component妥当ならOK", () => {
    const result = checkState(fixtureMatrix(), fixtureState());
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  test("未収録は互換扱いにせず違反として報告する", () => {
    const matrix = fixtureMatrix();
    const state = { ...fixtureState(), moduleC: "9.9.0" };
    const result = checkState(matrix, state);
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([{ component: "moduleC", version: "9.9.0", reason: "unrecorded" }]);
  });

  test("範囲外は違反として報告する", () => {
    const matrix = fixtureMatrix();
    const state = { ...fixtureState(), platform: "v2.7.0" }; // moduleA 1.7/moduleB 3.2どちらも2.7を含まない
    const result = checkState(matrix, state);
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.component).sort()).toEqual(["moduleA", "moduleB"]);
    expect(result.violations.every((v) => v.reason === "out-of-range")).toBe(true);
  });
});

describe("computeMaxPivot", () => {
  test("全componentのレンジ交差を返す(現状ちょうど上限)", () => {
    const result = computeMaxPivot(fixtureMatrix(), fixtureState());
    expect(result.errors).toEqual([]);
    expect(result.value).toBe("2.4");
    // moduleA(2.2..2.4)とmoduleB(2.3..2.4)、両方がmax=2.4で律速
    expect(result.limitedBy.map((b) => b.component).sort()).toEqual(["moduleA", "moduleB"]);
  });

  test("未収録componentがあれば安全な上限を主張せずerrorsを返す", () => {
    const state = { ...fixtureState(), moduleC: "9.9.0" };
    const result = computeMaxPivot(fixtureMatrix(), state);
    expect(result.value).toBeUndefined();
    expect(result.errors.length).toBe(1);
  });
});

describe("computeMaxComponent", () => {
  test("現在のpivotを含む最も高いバージョンを返す", () => {
    const result = computeMaxComponent(fixtureMatrix(), fixtureState(), "moduleA");
    // platform=2.4を含むのは1.7(2.2..2.4)と1.8(2.4..2.6)。より高い1.8を返す
    expect(result.value).toBe("1.8");
    expect(result.errors).toEqual([]);
  });

  test("対応バージョンが無ければerrors", () => {
    const state = { ...fixtureState(), platform: "v9.9.9" };
    const result = computeMaxComponent(fixtureMatrix(), state, "moduleA");
    expect(result.value).toBeUndefined();
    expect(result.errors.length).toBe(1);
  });
});

describe("computePlan", () => {
  test("既に対応済みなら現状維持のまま1step(pivotのみ)", () => {
    // moduleA(2.2..2.4)/moduleB(2.3..2.4)は現状のままplatform 2.4のみなら十分
    const result = computePlan(fixtureMatrix(), fixtureState(), "platform", "2.4");
    expect(result.ok).toBe(true);
    expect(result.steps).toEqual([{ component: "platform", from: "v2.4.1", to: "2.4" }]);
  });

  test("毎ホップ妥当な経路を返す(両componentの更新が必要)", () => {
    const result = computePlan(fixtureMatrix(), fixtureState(), "platform", "2.6");
    expect(result.ok).toBe(true);
    expect(result.steps).toEqual([
      { component: "moduleA", from: "1.7.0", to: "1.8" },
      { component: "moduleB", from: "3.2.0", to: "3.3" },
      { component: "platform", from: "v2.4.1", to: "2.6" },
    ]);
  });

  test("現在値とtargetを同時に満たす既知バージョンが無ければ到達不可", () => {
    const matrix = fixtureMatrix();
    // moduleBの1つ上のバージョンを「2.5..2.6」に差し替え、現在(2.4)をカバーしない穴を作る
    matrix.components.moduleB!["3.3"] = { requires: { platform: "2.5..2.6" } };
    const result = computePlan(matrix, fixtureState(), "platform", "2.6");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("moduleB");
  });

  test("非pivot componentへの直接plan: 現在pivotが対応範囲内なら1step", () => {
    const result = computePlan(fixtureMatrix(), fixtureState(), "moduleA", "1.8");
    expect(result.ok).toBe(true);
    expect(result.steps).toEqual([{ component: "moduleA", from: "1.7.0", to: "1.8" }]);
  });

  test("非pivot componentへの直接plan: 現在pivotが対応範囲外なら到達不可理由を返す", () => {
    // moduleA 1.6は platform 2.0..2.3のみ対応。現在platformは2.4なので直接setできない
    const result = computePlan(fixtureMatrix(), fixtureState(), "moduleA", "1.6");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("platform");
  });
});
