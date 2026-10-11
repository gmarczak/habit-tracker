import type { StreakUnit } from "./model";

export const MILESTONES: Record<StreakUnit, readonly number[]> = {
  days: [7, 30, 100, 365],
  weeks: [4, 12, 26, 52],
};

/** Kamień milowy osiągnięty przy przejściu serii z `before` na `after` (tylko przy wzroście). */
export function reachedMilestone(unit: StreakUnit, before: number, after: number): number | null {
  if (after <= before) return null;
  const hit = MILESTONES[unit].filter((m) => before < m && after >= m);
  return hit.length ? (hit[hit.length - 1] as number) : null;
}
