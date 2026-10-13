import { addDays, eachDay, startOfWeek, type LocalDate, type WeekStart } from "./dates";
import { unitOf, type Entry, type Habit, type Pause, type StreakUnit } from "./model";
import { entriesByDate, entryOutcome, isPaused, planOn, requirementOn } from "./schedule";

/*
 * Reguły (uzgodnione w planie remasteru):
 * - Seria w dniach (plany dzienne): kolejne wymagane dni z osiągniętym celem.
 *   Pominięte, pauza i dni niewymagane są neutralne. Częściowo (wartość < cel) przerywa.
 *   Dzisiejszy brak nie przerywa serii do końca dnia.
 * - Seria w tygodniach ("X razy w tygodniu"): tydzień zaliczony, gdy zrobione >= wymagane.
 *   Wymagane = ceil(X * dostępne dni / 7); dostępne = dni tygodnia objęte planem tygodniowym,
 *   bez pauz i pominięć. Bieżący tydzień jest neutralny, dopóki nie zostanie zaliczony.
 * - Zmiana jednostki (dni <-> tygodnie) zaczyna serię od zera; zmiana planu w tej samej
 *   jednostce (np. codziennie -> wybrane dni) serii nie przerywa.
 */

type Ctx = {
  habit: Habit;
  byDate: Map<LocalDate, Entry>;
  pauses: readonly Pause[];
  today: LocalDate;
  weekStart: WeekStart;
};

function ctx(habit: Habit, entries: readonly Entry[], pauses: readonly Pause[], today: LocalDate, weekStart: WeekStart): Ctx {
  return { habit, byDate: entriesByDate(entries, habit.id), pauses, today, weekStart };
}

// ---------- stan pojedynczego dnia ----------

export type DayState =
  | "future"
  | "before_start"
  | "paused"
  | "not_required"
  | "done"
  | "partial"
  | "skipped"
  | "missed" // wymagany, minął, nie zrobiony
  | "pending" // wymagany dziś, jeszcze nie zrobiony
  | "open"; // plan tygodniowy, ten dzień bez wykonania

export function dayState(
  habit: Habit,
  entries: readonly Entry[],
  pauses: readonly Pause[],
  date: LocalDate,
  today: LocalDate,
): DayState {
  if (date > today) return "future";
  const req = requirementOn(habit, pauses, date);
  if (req === "before_start") return "before_start";
  if (habit.goal === "quit") {
    const entry = entriesByDate(entries, habit.id).get(date);
    if (entry?.skipped) return "skipped";
    if (entry && (entry.value ?? 0) > 0) return "missed"; // wpadka, także dziś
    if (req === "paused") return "paused";
    if (req === "not_required") return "not_required";
    return "done";
  }
  const outcome = entryOutcome(entriesByDate(entries, habit.id).get(date), planOn(habit, date));
  if (outcome === "done") return "done";
  if (outcome === "skipped") return "skipped";
  if (req === "paused") return "paused";
  if (outcome === "partial") return req === "required" && date === today ? "pending" : "partial";
  if (req === "not_required") return "not_required";
  if (req === "flexible") return "open";
  return date === today ? "pending" : "missed";
}

// ---------- tygodnie ----------

export type WeekResult = "met" | "failed" | "neutral" | "boundary";

export type WeekProgress = {
  weekStart: LocalDate;
  done: number;
  required: number;
  result: WeekResult;
};

export function evaluateWeek(c: Ctx, weekStartDate: LocalDate): WeekProgress {
  const days = eachDay(weekStartDate, addDays(weekStartDate, 6));
  const covered = days.filter((d) => d >= c.habit.startDate && planOn(c.habit, d)?.frequency === "weekly_count");
  if (covered.length === 0) return { weekStart: weekStartDate, done: 0, required: 0, result: "boundary" };

  const lastCovered = covered[covered.length - 1] as LocalDate;
  const timesPerWeek = planOn(c.habit, lastCovered)?.timesPerWeek ?? 1;
  let available = 0;
  let done = 0;
  for (const d of covered) {
    const outcome = entryOutcome(c.byDate.get(d), planOn(c.habit, d), c.habit.goal);
    if (outcome === "done") done++;
    if (outcome !== "skipped" && !isPaused(c.pauses, c.habit.id, d)) available++;
  }
  if (available === 0) return { weekStart: weekStartDate, done, required: 0, result: "neutral" };

  const required = Math.ceil((timesPerWeek * available) / 7);
  const isCurrent = weekStartDate <= c.today && c.today <= addDays(weekStartDate, 6);
  const result: WeekResult = done >= required ? "met" : isCurrent ? "neutral" : "failed";
  return { weekStart: weekStartDate, done, required, result };
}

export function currentWeekProgress(
  habit: Habit,
  entries: readonly Entry[],
  pauses: readonly Pause[],
  today: LocalDate,
  weekStart: WeekStart,
): WeekProgress {
  const c = ctx(habit, entries, pauses, today, weekStart);
  return evaluateWeek(c, startOfWeek(today, weekStart));
}

// ---------- serie ----------

export type Streak = { current: number; best: number; unit: StreakUnit };

function currentDays(c: Ctx): number {
  let streak = 0;
  for (let d = c.today; d >= c.habit.startDate; d = addDays(d, -1)) {
    const plan = planOn(c.habit, d);
    if (!plan || unitOf(plan.frequency) !== "days") break;
    const req = requirementOn(c.habit, c.pauses, d);
    if (req === "paused" || req === "not_required") continue;
    const outcome = entryOutcome(c.byDate.get(d), plan, c.habit.goal);
    if (outcome === "done") streak++;
    else if (outcome === "skipped" || (d === c.today && c.habit.goal !== "quit")) continue;
    else break;
  }
  return streak;
}

function currentWeeks(c: Ctx): number {
  let streak = 0;
  for (let ws = startOfWeek(c.today, c.weekStart); ; ws = addDays(ws, -7)) {
    const week = evaluateWeek(c, ws);
    if (week.result === "met") streak++;
    else if (week.result === "neutral") continue;
    else break;
  }
  return streak;
}

function bestDays(c: Ctx): number {
  let best = 0;
  let run = 0;
  for (let d = c.habit.startDate; d <= c.today; d = addDays(d, 1)) {
    const plan = planOn(c.habit, d);
    if (!plan || unitOf(plan.frequency) !== "days") {
      run = 0;
      continue;
    }
    const req = requirementOn(c.habit, c.pauses, d);
    if (req === "paused" || req === "not_required") continue;
    const outcome = entryOutcome(c.byDate.get(d), plan, c.habit.goal);
    if (outcome === "done") best = Math.max(best, ++run);
    else if (outcome === "skipped" || (d === c.today && c.habit.goal !== "quit")) continue;
    else run = 0;
  }
  return best;
}

function bestWeeks(c: Ctx): number {
  let best = 0;
  let run = 0;
  const last = startOfWeek(c.today, c.weekStart);
  for (let ws = startOfWeek(c.habit.startDate, c.weekStart); ws <= last; ws = addDays(ws, 7)) {
    const week = evaluateWeek(c, ws);
    if (week.result === "met") best = Math.max(best, ++run);
    else if (week.result !== "neutral") run = 0;
  }
  return best;
}

export function streakOf(
  habit: Habit,
  entries: readonly Entry[],
  pauses: readonly Pause[],
  today: LocalDate,
  weekStart: WeekStart,
): Streak {
  const c = ctx(habit, entries, pauses, today, weekStart);
  const plan = planOn(habit, today) ?? habit.plans[habit.plans.length - 1] ?? null;
  const unit: StreakUnit = plan ? unitOf(plan.frequency) : "days";
  if (today < habit.startDate) return { current: 0, best: 0, unit };
  return unit === "days"
    ? { current: currentDays(c), best: bestDays(c), unit }
    : { current: currentWeeks(c), best: bestWeeks(c), unit };
}

// ---------- skuteczność ----------

/**
 * Skuteczność w oknie [from, to] (to <= dziś): zaliczone okazje / wszystkie okazje.
 * Okazja w planie dziennym = wymagany dzień (bez pominiętych, pauz i niedokończonego dziś).
 * Okazja w planie tygodniowym = tydzień rozstrzygnięty (zaliczony albo nie), którego
 * pierwszy dzień objęty planem leży w oknie. Zwraca null, gdy nie było żadnej okazji.
 */
export function completionRate(
  habit: Habit,
  entries: readonly Entry[],
  pauses: readonly Pause[],
  from: LocalDate,
  to: LocalDate,
  today: LocalDate,
  weekStart: WeekStart,
): number | null {
  const c = ctx(habit, entries, pauses, today, weekStart);
  const end = to <= today ? to : today;
  let chances = 0;
  let wins = 0;
  const weeksSeen = new Set<LocalDate>();

  for (let d = from > habit.startDate ? from : habit.startDate; d <= end; d = addDays(d, 1)) {
    const plan = planOn(habit, d);
    if (!plan) continue;
    if (unitOf(plan.frequency) === "weeks") {
      const ws = startOfWeek(d, weekStart);
      if (weeksSeen.has(ws)) continue;
      weeksSeen.add(ws);
      const week = evaluateWeek(c, ws);
      if (week.result === "met" || week.result === "failed") {
        chances++;
        if (week.result === "met") wins++;
      }
      continue;
    }
    const req = requirementOn(habit, pauses, d);
    if (req !== "required") continue;
    const outcome = entryOutcome(c.byDate.get(d), plan, c.habit.goal);
    if (outcome === "skipped") continue;
    if (d === today && outcome !== "done" && habit.goal !== "quit") continue;
    chances++;
    if (outcome === "done") wins++;
  }
  return chances === 0 ? null : wins / chances;
}
