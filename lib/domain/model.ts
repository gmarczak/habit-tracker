import type { LocalDate, WeekStart } from "./dates";
import type { HealthMetric } from "./health";

export type HabitKind = "check" | "count" | "duration";

export const HABIT_COLORS = ["green", "blue", "violet", "amber", "rose", "teal", "slate"] as const;
export type HabitColor = (typeof HABIT_COLORS)[number];
export type Frequency = "daily" | "weekdays" | "weekly_count" | "every_n_days";

/** build – buduję (odhaczam, gdy zrobione); quit – rzucam (dzień bez wpisu = czysto, wpis = wpadka). */
export type Goal = "build" | "quit";

/** Pora dnia nawyku; null = kiedykolwiek. */
export const TIMES_OF_DAY = ["morning", "day", "evening"] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

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
  /** klucz ikony liniowej z lib/ui/icons */
  icon: string | null;
  color: HabitColor;
  categoryId: string | null;
  timeOfDay: TimeOfDay | null;
  goal: Goal;
  startDate: LocalDate;
  sortOrder: number;
  archivedAt: string | null;
  /** dana z Apple Zdrowie, która sama wypełnia nawyk; brak = tylko ręcznie */
  source?: HealthMetric | null;
  /** próg dla nawyku tak/nie (np. 7000 kroków) */
  sourceMin?: number | null;
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

export type Category = { id: string; name: string; sortOrder: number };

export type DayNote = { date: LocalDate; note: string };

export type PauseRecord = Pause & { id: string; reason: string | null };

/**
 * summary – wieczorne podsumowanie wszystkiego, co zostało; habit – jeden nawyk;
 * morning/day/evening – nawyki z tej pory dnia; yesterday – rano, gdy wczoraj coś zostało;
 * weekly – podsumowanie tygodnia w jego ostatnim dniu.
 */
export const REMINDER_KINDS = ["summary", "habit", "morning", "day", "evening", "yesterday", "weekly"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export type Reminder = { id: string; kind: ReminderKind; habitId: string | null; localTime: string; enabled: boolean };
