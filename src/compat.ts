// check/max/plan の中核ロジック。
// トポロジーはpivot1つを中心とした星型のみをv1でサポートする(matrix.pivotで宣言)。
// 全Dependencyは「component@version は pivotのバージョンXX..YYを要求する」という形。

import type { Matrix } from "./matrix.ts";
import { getRange } from "./matrix.ts";
import type { State } from "./state.ts";
import { compareMinor, toMinorKey } from "./version.ts";
import { rangeContains, type Range } from "./range.ts";

export interface Violation {
  component: string;
  version: string;
  reason: "unrecorded" | "out-of-range";
  range?: Range;
}

export interface CheckResult {
  ok: boolean;
  pivot: string;
  pivotVersion: string;
  violations: Violation[];
}

// 未収録(matrixに行が無い)は「互換」扱いにせず、常に違反として報告する。
export function checkState(matrix: Matrix, state: State): CheckResult {
  const pivot = matrix.pivot;
  const pivotVersion = state[pivot];
  if (pivotVersion === undefined) {
    throw new Error(`pivot component "${pivot}" の現在バージョンが state にありません(config.yaml を確認してください)`);
  }
  const violations: Violation[] = [];
  for (const [name, version] of Object.entries(state)) {
    if (name === pivot) continue;
    const range = getRange(matrix, name, version, pivot);
    if (!range) {
      violations.push({ component: name, version, reason: "unrecorded" });
      continue;
    }
    if (!rangeContains(range, pivotVersion)) {
      violations.push({ component: name, version, reason: "out-of-range", range });
    }
  }
  return { ok: violations.length === 0, pivot, pivotVersion, violations };
}

export interface MaxResult {
  component: string;
  value?: string;
  limitedBy: { component: string; range: Range }[];
  errors: string[];
}

// max <pivot>: 他の全componentの現在バージョンのレンジを交差させる。
// 1つでも未収録のcomponentがあれば、安全な上限を主張できないためvalueを返さずerrorsで報告する。
export function computeMaxPivot(matrix: Matrix, state: State): MaxResult {
  const pivot = matrix.pivot;
  const errors: string[] = [];
  const limitedBy: { component: string; range: Range }[] = [];
  let min: string | undefined;
  let max: string | undefined;
  for (const [name, version] of Object.entries(state)) {
    if (name === pivot) continue;
    const range = getRange(matrix, name, version, pivot);
    if (!range) {
      errors.push(`${name}@${version} は matrix 未収録のため上限を計算できません(先に "depctl matrix add" してください)`);
      continue;
    }
    limitedBy.push({ component: name, range });
    if (max === undefined || compareMinor(range.max, max) < 0) max = range.max;
    if (min === undefined || compareMinor(range.min, min) > 0) min = range.min;
  }
  if (errors.length > 0) return { component: pivot, limitedBy, errors };
  return { component: pivot, value: max, limitedBy, errors: [] };
}

// max <非pivot component>: 現在のpivotバージョンを含む範囲を持つ、最も高いバージョンを探す。
export function computeMaxComponent(matrix: Matrix, state: State, component: string): MaxResult {
  const pivot = matrix.pivot;
  const pivotVersion = state[pivot];
  if (pivotVersion === undefined) {
    throw new Error(`pivot component "${pivot}" の現在バージョンが state にありません`);
  }
  const versions = matrix.components[component] ?? {};
  let best: string | undefined;
  for (const v of Object.keys(versions)) {
    const range = getRange(matrix, component, v, pivot);
    if (range && rangeContains(range, pivotVersion) && (best === undefined || compareMinor(v, best) > 0)) {
      best = v;
    }
  }
  if (best === undefined) {
    return {
      component,
      limitedBy: [],
      errors: [`現在の ${pivot} ${toMinorKey(pivotVersion)} に対応する ${component} のバージョンが matrix にありません`],
    };
  }
  return { component, value: best, limitedBy: [], errors: [] };
}

export interface PlanStep {
  component: string;
  from: string;
  to: string;
}

export interface PlanResult {
  ok: boolean;
  steps: PlanStep[];
  reason?: string;
}

// plan --set <component>=<version>
// 不変条件: 遷移列の「毎ホップ」で、その時点の全component(そのホップで動かした側+他は現状維持)が
// Matrix上妥当でなければならない(端点だけが妥当ならよい、ではない)。
export function computePlan(matrix: Matrix, state: State, targetComponent: string, targetVersion: string): PlanResult {
  const pivot = matrix.pivot;
  if (targetComponent === pivot) {
    return planPivot(matrix, state, toMinorKey(targetVersion));
  }
  return planComponent(matrix, state, targetComponent, toMinorKey(targetVersion));
}

function planPivot(matrix: Matrix, state: State, target: string): PlanResult {
  const pivot = matrix.pivot;
  const currentRaw = state[pivot];
  if (currentRaw === undefined) {
    throw new Error(`pivot component "${pivot}" の現在バージョンが state にありません`);
  }
  const current = toMinorKey(currentRaw);
  const steps: PlanStep[] = [];
  const componentNames = Object.keys(state)
    .filter((n) => n !== pivot)
    .sort();

  for (const name of componentNames) {
    const curV = state[name]!;
    const curRange = getRange(matrix, name, curV, pivot);
    if (curRange && rangeContains(curRange, target)) {
      continue; // 現状のバージョンのままtargetをカバーできる
    }

    // 「現在のpivot」と「targetのpivot」の両方を含む、後退しない既知バージョンを探す。
    // 同一バージョンが両ホップ(このcomponentを上げるホップ、pivotを上げるホップ)で使われるため、
    // 両方を含む必要がある。
    const versions = Object.keys(matrix.components[name] ?? {}).sort(compareMinor);
    let picked: string | undefined;
    for (const v of versions) {
      if (compareMinor(v, curV) < 0) continue;
      const r = getRange(matrix, name, v, pivot);
      if (!r) continue;
      if (rangeContains(r, current) && rangeContains(r, target)) {
        picked = v;
        break;
      }
    }
    if (!picked) {
      return {
        ok: false,
        steps: [],
        reason: `${name}: 現在の ${pivot} ${current} と目標 ${target} を同時に満たす既知バージョンがありません(matrix add で調査結果を追加してください)`,
      };
    }
    steps.push({ component: name, from: curV, to: picked });
  }

  steps.push({ component: pivot, from: currentRaw, to: target });
  return { ok: true, steps };
}

function planComponent(matrix: Matrix, state: State, component: string, target: string): PlanResult {
  const pivot = matrix.pivot;
  const pivotVersionRaw = state[pivot];
  if (pivotVersionRaw === undefined) {
    throw new Error(`pivot component "${pivot}" の現在バージョンが state にありません`);
  }
  const pivotVersion = toMinorKey(pivotVersionRaw);
  const range = getRange(matrix, component, target, pivot);
  if (!range) {
    return { ok: false, steps: [], reason: `${component}@${target} は matrix 未収録です` };
  }
  if (!rangeContains(range, pivotVersion)) {
    return {
      ok: false,
      steps: [],
      reason:
        `${component}@${target} の対応範囲(${range.min}..${range.max})に現在の ${pivot} ${pivotVersion} が含まれません。` +
        `先に "depctl plan --set ${pivot}=<version>" で ${pivot} 側の移行を検討してください`,
    };
  }
  const curV = state[component];
  return { ok: true, steps: [{ component, from: curV ?? "(unknown)", to: target }] };
}
