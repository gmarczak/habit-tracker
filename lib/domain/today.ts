import { addDays, type LocalDate, type WeekStart } from "./dates";
import { unitOf, type Entry, type Habit, type Pause, type Plan } from "./model";
import { currentWeekProgress, dayState, streakOf, type DayState, type Streak, type WeekProgress } from "./progress";
import { entriesByDate, entryOutcome, planOn, requirementOn } from "./schedule";

export type TodayItem = {
  habit: Habit;
  plan: Plan;
  state: DayState;
  entry: Entry | undefined;
  streak: Streak;
  /** tylko dla planów tygodniowych */
  week: WeekProgress | null;
  /** poprzedni wymagany dzień wypadł, a ten jeszcze czeka: drugi brak z rzędu przerwie serię */
  missedLast: boolean;
};

/** Odpowiedź „nie dziś”: wpis 0 przy nawyku „buduję” (dzień rozstrzygnięty jako niezrobiony). */
export function isAnsweredNo(item: Pick<TodayItem, "habit" | "entry">): boolean {
  return item.habit.goal === "build" && !!item.entry && !item.entry.skipped && (item.entry.value ?? 0) === 0;
}

/**
 * Nawyk czeka na odpowiedź (przegląd, „wczoraj zostało”, licznik do domknięcia).
 * Za miniony dzień każdy wpis jest odpowiedzią; dziś częściowy postęp jeszcze czeka na resztę.
 */
export function awaitsAnswer(item: Pick<TodayItem, "habit" | "entry">, isToday: boolean): boolean {
  if (!item.entry) return true;
  if (item.entry.skipped || item.habit.goal === "quit") return false;
  return isToday && (item.entry.value ?? 0) > 0;
}

/**
 * Poprzedni wymagany dzień (do tygodnia wstecz) wypadł: odpowiedź „nie”, częściowo albo brak wpisu w dniu,
 * w którym zapisano coś innego. Dzień bez żadnego zapisu to niewiadoma (mogło być zrobione, tylko niezapisane).
 */
export function missedPrevious(habit: Habit, entries: readonly Entry[], pauses: readonly Pause[], date: LocalDate): boolean {
  if (habit.goal === "quit") return false;
  for (let d = addDays(date, -1), i = 0; i < 7 && d >= habit.startDate; d = addDays(d, -1), i++) {
    const plan = planOn(habit, d);
    if (!plan || unitOf(plan.frequency) !== "days") return false;
    const req = requirementOn(habit, pauses, d);
    if (req === "paused" || req === "not_required") continue;
    if (req !== "required") return false;
    const entry = entriesByDate(entries, habit.id).get(d);
    const outcome = entryOutcome(entry, plan);
    // pominięcie jest neutralne jak w serii: patrzymy na wcześniejszy dzień
    if (outcome === "skipped") continue;
    if (outcome === "done") return false;
    return entry !== undefined || entries.some((e) => e.date === d);
  }
  return false;
}

export type TodayView = {
  date: LocalDate;
  /** wymagane dziś i jeszcze nie zrobione (w tym częściowo i „nie dziś”); najpierw te, które wczoraj wypadły */
  todo: TodayItem[];
  /** plany tygodniowe: tydzień jeszcze niezaliczony i dziś nie zrobione */
  thisWeek: TodayItem[];
  /** zrobione dziś (także tygodniowe) oraz świadomie pominięte */
  done: TodayItem[];
  /** nawyki „rzucam”: czysto albo wpadka; poza listami do zrobienia */
  quit: TodayItem[];
  /** pierścień dnia: tylko nawyki „buduję” wymagane dziś, bez pominiętych („rzucam” ma własną serię) */
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
      entry: entriesByDate(entries, habit.id).get(date),
      streak: streakOf(habit, entries, pauses, today, weekStart),
      week: req === "flexible" ? currentWeekProgress(habit, entries, pauses, date, weekStart) : null,
      missedLast: req === "required" && state !== "done" && state !== "skipped" && missedPrevious(habit, entries, pauses, date),
    };

    // „Rzucam” bez wpisu jest czysty z automatu: nie podbija pierścienia dnia, w którym nic nie zrobiono
    if (req === "required" && habit.goal !== "quit") {
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
  // „Nie odpuszczaj dwa razy”: wczoraj wypadło → na górę (sort stabilny, reszta w kolejności użytkownika)
  view.todo.sort((a, b) => Number(b.missedLast) - Number(a.missedLast));
  return view;
}

/**
 * Sam pierścień dnia (bez serii i tygodni) — to samo co `buildDay(...).progress`, ale tanio.
 * Dla statystyk i paska tygodnia, które liczą wiele dni naraz.
 * `history`: nawyk zarchiwizowany liczy się w dniach przed archiwizacją (statystyki nie zmieniają przeszłości).
 */
export function dayProgress(
  habits: readonly Habit[],
  entries: readonly Entry[],
  pauses: readonly Pause[],
  date: LocalDate,
  history = false,
): { done: number; total: number; settled: number } {
  const progress = { done: 0, total: 0, settled: 0 };
  for (const habit of habits) {
    if (habit.goal === "quit") continue;
    if (habit.archivedAt !== null && !(history && habit.archivedOn && date < habit.archivedOn)) continue;
    if (requirementOn(habit, pauses, date) !== "required" || !planOn(habit, date)) continue;
    const state = dayState(habit, entries, pauses, date, date);
    if (state !== "skipped") progress.total++;
    if (state === "done") progress.done++;
    if (state === "done") progress.settled++;
  }
  return progress;
}

/** Liczba na ikonie aplikacji: wymagane dziś i jeszcze nie zrobione (bez planów tygodniowych i „rzucam”). */
export function badgeCount(view: TodayView): number {
  return view.todo.length;
}
