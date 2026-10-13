import type { LocalDate, WeekStart } from "./dates";
import type { Entry, Habit, Pause, Plan } from "./model";
import { currentWeekProgress, dayState, streakOf, type DayState, type Streak, type WeekProgress } from "./progress";
import { planOn, requirementOn } from "./schedule";

export type TodayItem = {
  habit: Habit;
  plan: Plan;
  state: DayState;
  entry: Entry | undefined;
  streak: Streak;
  /** tylko dla planów tygodniowych */
  week: WeekProgress | null;
};

export type TodayView = {
  date: LocalDate;
  /** wymagane dziś i jeszcze nie zrobione (w tym częściowo) */
  todo: TodayItem[];
  /** plany tygodniowe: tydzień jeszcze niezaliczony i dziś nie zrobione */
  thisWeek: TodayItem[];
  /** zrobione dziś (także tygodniowe) oraz świadomie pominięte */
  done: TodayItem[];
  /** nawyki „rzucam”: czysto albo wpadka; poza listami do zrobienia */
  quit: TodayItem[];
  /** pierścień dnia: tylko nawyki wymagane dziś, bez pominiętych */
  progress: { done: number; total: number };
};

/**
 * Buduje ekran dla dowolnego dnia `date` <= `today` (pasek 7 dni pozwala cofnąć się wstecz).
 * Pomija archiwalne, niewymagane tego dnia, w pauzie i przed startem.
 */
export function buildDay(
  habits: readonly Habit[],
  entries: readonly Entry[],
  pauses: readonly Pause[],
  date: LocalDate,
  today: LocalDate,
  weekStart: WeekStart,
): TodayView {
  const view: TodayView = { date, todo: [], thisWeek: [], done: [], quit: [], progress: { done: 0, total: 0 } };

  const active = habits.filter((h) => h.archivedAt === null).sort((a, b) => a.sortOrder - b.sortOrder);
  for (const habit of active) {
    const req = requirementOn(habit, pauses, date);
    if (req === "before_start" || req === "paused" || req === "not_required") continue;
    const plan = planOn(habit, date);
    if (!plan) continue;

    // Oglądany dzień traktujemy jak "dziś": brak to "do zrobienia", nie "przegapione" (uzupełnianie wstecz).
    const state = dayState(habit, entries, pauses, date, date);
    const item: TodayItem = {
      habit,
      plan,
      state,
      entry: entries.find((e) => e.habitId === habit.id && e.date === date),
      streak: streakOf(habit, entries, pauses, today, weekStart),
      week: req === "flexible" ? currentWeekProgress(habit, entries, pauses, date, weekStart) : null,
    };

    if (req === "required") {
      if (state !== "skipped") view.progress.total++;
      if (state === "done") view.progress.done++;
    }

    if (habit.goal === "quit") view.quit.push(item);
    else if (state === "done" || state === "skipped") view.done.push(item);
    else if (req === "flexible") {
      if (item.week?.result !== "met") view.thisWeek.push(item);
      else view.done.push(item);
    } else view.todo.push(item);
  }
  return view;
}
