import { diffDays, isoWeekday, type LocalDate } from "./dates";
import type { Entry, Habit, Pause, Plan } from "./model";

/** Plan obowiązujący w danym dniu (ostatnia wersja z validFrom <= date). */
export function planOn(habit: Habit, date: LocalDate): Plan | null {
  let found: Plan | null = null;
  for (const plan of habit.plans) {
    if (plan.validFrom <= date) found = plan;
    else break;
  }
  return found;
}

export function isPaused(pauses: readonly Pause[], habitId: string, date: LocalDate): boolean {
  return pauses.some(
    (p) => (p.habitId === null || p.habitId === habitId) && p.startDate <= date && date <= p.endDate,
  );
}

/**
 * Czy nawyk jest w tym dniu wymagany:
 * - "before_start" – przed startem nawyku albo pierwszym planem
 * - "paused"       – dzień w pauzie/urlopie
 * - "required"     – plan dzienny wymaga go tego dnia
 * - "not_required" – plan dzienny go tego dnia nie wymaga
 * - "flexible"     – plan tygodniowy: można zrobić dowolnego dnia
 */
export type Requirement = "before_start" | "paused" | "required" | "not_required" | "flexible";

export function requirementOn(habit: Habit, pauses: readonly Pause[], date: LocalDate): Requirement {
  if (date < habit.startDate) return "before_start";
  const plan = planOn(habit, date);
  if (!plan) return "before_start";
  if (isPaused(pauses, habit.id, date)) return "paused";
  switch (plan.frequency) {
    case "daily":
      return "required";
    case "weekdays":
      return (plan.weekdays ?? []).includes(isoWeekday(date)) ? "required" : "not_required";
    case "every_n_days": {
      const n = plan.intervalDays ?? 1;
      return diffDays(plan.validFrom, date) % n === 0 ? "required" : "not_required";
    }
    case "weekly_count":
      return "flexible";
  }
}

/** Wynik pojedynczego wpisu względem celu planu. */
export type EntryOutcome = "done" | "partial" | "skipped" | "none";

export function entryOutcome(entry: Entry | undefined, plan: Plan | null): EntryOutcome {
  if (!entry) return "none";
  if (entry.skipped) return "skipped";
  const value = entry.value ?? 0;
  const target = plan?.targetValue ?? 1;
  if (value >= target) return "done";
  return value > 0 ? "partial" : "none";
}

/** Mapa wpisów jednego nawyku po dacie. */
export function entriesByDate(entries: readonly Entry[], habitId: string): Map<LocalDate, Entry> {
  const map = new Map<LocalDate, Entry>();
  for (const e of entries) if (e.habitId === habitId) map.set(e.date, e);
  return map;
}
