import type { StreakUnit } from "./model";

export const MILESTONES: Record<StreakUnit, readonly number[]> = {
  days: [7, 30, 100, 365],
  weeks: [4, 12, 26, 52],
};

/**
 * Kamień milowy osiągnięty właśnie teraz: seria urosła o jeden i trafiła w próg.
 * Skok o więcej (cofnięta wpadka, uzupełniony dzień łączący dwie serie) to powrót do serii, którą już było widać.
 */
export function reachedMilestone(unit: StreakUnit, before: number, after: number): number | null {
  return after === before + 1 && MILESTONES[unit].includes(after) ? after : null;
}
