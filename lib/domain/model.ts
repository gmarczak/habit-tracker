import type { LocalDate, WeekStart } from "./dates";

export type HabitKind = "check" | "count" | "duration";
export type Frequency = "daily" | "weekdays" | "weekly_count" | "every_n_days";

/** Wersja planu obowiązująca od `validFrom` do dnia przed następną wersją. */
export type Plan = {
  validFrom: LocalDate;
  frequency: Frequency;
  /** ISO 1..7, tylko dla "weekdays" */
  weekdays: number[] | null;
  /** tylko dla "weekly_count" */
  timesPerWeek: number | null;
  /** tylko dla "every_n_days" */
  intervalDays: number | null;
  targetValue: number;
};

export type Habit = {
  id: string;
  name: string;
  kind: HabitKind;
  unit: string | null;
  emoji: string | null;
  color: string;
  categoryId: string | null;
  startDate: LocalDate;
  sortOrder: number;
  archivedAt: string | null;
  /** posortowane rosnąco po validFrom */
  plans: Plan[];
};

export type Entry = {
  habitId: string;
  date: LocalDate;
  value: number | null;
  skipped: boolean;
  note: string | null;
};

export type Pause = {
  /** null = wszystkie nawyki */
  habitId: string | null;
  startDate: LocalDate;
  endDate: LocalDate;
};

export type Settings = {
  timeZone: string;
  weekStart: WeekStart;
  dayStartHour: number;
};

/** Plany dzienne liczą serię w dniach, "X razy w tygodniu" w tygodniach. */
export type StreakUnit = "days" | "weeks";

export function unitOf(frequency: Frequency): StreakUnit {
  return frequency === "weekly_count" ? "weeks" : "days";
}
