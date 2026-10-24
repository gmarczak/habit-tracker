import { addDays, isoWeekday, startOfWeek, type LocalDate, type WeekStart } from "./dates";
import type { DayNote, Entry, Habit, Pause } from "./model";
import { completionRate, dayState } from "./progress";
import { dayProgress } from "./today";

/*
 * Statystyki globalne. Dzień liczy się z nawyków wymaganych tego dnia (jak pierścień na ekranie Dziś):
 * pominięte i pauzy nie wchodzą do mianownika, plany tygodniowe nie wchodzą do bilansu dnia.
 * Nawyk przeniesiony do archiwum liczy się w dniach sprzed archiwizacji, więc archiwum nie przepisuje przeszłości.
 */

/** `settled` – ile z `total` ma już pewny wynik (zrobione albo wpadka „rzucam”); reszta dziś jeszcze czeka. */
export type DayTotals = { date: LocalDate; done: number; total: number; settled?: number };

export function dayTotals(
  habits: readonly Habit[],
  entries: readonly Entry[],
  pauses: readonly Pause[],
  date: LocalDate,
): DayTotals {
  return { date, ...dayProgress(habits, entries, pauses, date, true) };
}

/** Idealny dzień: był przynajmniej jeden wymagany nawyk i wszystkie są zrobione (pominięte się nie liczą). */
export function isPerfect(d: DayTotals): boolean {
  return d.total > 0 && d.done === d.total;
}

/** `done`/`total` tygodnia bez dzisiejszych jeszcze otwartych nawyków (dzień trwa); `days` pokazuje stan bieżący. */
export type WeekReview = { days: DayTotals[]; done: number; total: number; perfectDays: number };

export function weekReview(
  habits: readonly Habit[],
  entries: readonly Entry[],
  pauses: readonly Pause[],
  anyDayInWeek: LocalDate,
  today: LocalDate,
  weekStart: WeekStart,
): WeekReview {
  const first = startOfWeek(anyDayInWeek, weekStart);
  const days = Array.from({ length: 7 }, (_, i) => addDays(first, i)).map((d) =>
    d > today ? { date: d, done: 0, total: 0 } : dayTotals(habits, entries, pauses, d),
  );
  return {
    days,
    done: days.reduce((s, d) => s + d.done, 0),
    total: days.reduce((s, d) => s + (d.date === today ? (d.settled ?? d.done) : d.total), 0),
    perfectDays: days.filter(isPerfect).length,
  };
}

/** Udział zrobionych w wymaganych, tydzień po tygodniu (najstarszy pierwszy). null = brak wymaganych. */
export function weeklyTrend(
  habits: readonly Habit[],
  entries: readonly Entry[],
  pauses: readonly Pause[],
  today: LocalDate,
  weekStart: WeekStart,
  weeks = 12,
): { weekStart: LocalDate; share: number | null }[] {
  const current = startOfWeek(today, weekStart);
  return Array.from({ length: weeks }, (_, i) => addDays(current, -7 * (weeks - 1 - i))).map((ws) => {
    const r = weekReview(habits, entries, pauses, ws, today, weekStart);
    return { weekStart: ws, share: r.total === 0 ? null : r.done / r.total };
  });
}

/** Seria idealnych dni kończąca się dziś (dzisiejszy niedokończony dzień jej nie przerywa). */
export function perfectDayStreak(
  habits: readonly Habit[],
  entries: readonly Entry[],
  pauses: readonly Pause[],
  today: LocalDate,
  weekStart: WeekStart,
  limit = 400,
): number {
  let streak = 0;
  for (let i = 0; i < limit; i++) {
    const d = addDays(today, -i);
    const t = dayTotals(habits, entries, pauses, d);
    if (t.total === 0) {
      if (habits.every((h) => h.startDate > d)) break;
      continue;
    }
    if (isPerfect(t)) streak++;
    else if (d === today) continue;
    else break;
  }
  return streak;
}

/** Skuteczność każdego aktywnego nawyku w ostatnich `days` dniach, od najsłabszego. */
export function habitRates(
  habits: readonly Habit[],
  entries: readonly Entry[],
  pauses: readonly Pause[],
  today: LocalDate,
  weekStart: WeekStart,
  days = 30,
): { habit: Habit; rate: number | null }[] {
  const from = addDays(today, -(days - 1));
  return habits
    .filter((h) => h.archivedAt === null)
    .map((habit) => ({ habit, rate: completionRate(habit, entries, pauses, from, today, today, weekStart) }))
    .sort((a, b) => (a.rate ?? 2) - (b.rate ?? 2));
}

/** Ostatnie notatki dni z wynikiem dnia (od najnowszej), żeby widzieć, co towarzyszy słabszym dniom. */
export function notedDays(
  notes: readonly DayNote[],
  habits: readonly Habit[],
  entries: readonly Entry[],
  pauses: readonly Pause[],
  today: LocalDate,
  weekStart: WeekStart,
  limit = 10,
): (DayTotals & { note: string })[] {
  return [...notes]
    .filter((n): n is DayNote & { note: string } => n.date <= today && Boolean(n.note))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, limit)
    .map((n) => ({ ...dayTotals(habits, entries, pauses, n.date), note: n.note }));
}

/**
 * Udział zrobionych w wymaganych według dnia tygodnia (ISO 1..7) z ostatnich `weeks` pełnych tygodni
 * (bez dzisiejszego, niedokończonego dnia). null = w ten dzień nic nie było wymagane.
 */
export function weekdayShares(
  habits: readonly Habit[],
  entries: readonly Entry[],
  pauses: readonly Pause[],
  today: LocalDate,
  weeks = 8,
): { weekday: number; share: number | null }[] {
  const sums = Array.from({ length: 7 }, () => ({ done: 0, total: 0 }));
  for (let i = 1; i <= weeks * 7; i++) {
    const d = addDays(today, -i);
    const t = dayTotals(habits, entries, pauses, d);
    const s = sums[isoWeekday(d) - 1]!;
    s.done += t.done;
    s.total += t.total;
  }
  return sums.map((s, i) => ({ weekday: i + 1, share: s.total === 0 ? null : s.done / s.total }));
}

export type MoodLink = { habit: Habit; withHabit: number; without: number; diff: number; days: number };

/**
 * Nastrój a nawyki z ostatnich `days` dni: średni nastrój oraz — dla nawyków z co najmniej `minEach`
 * dniami w obu grupach — różnica średniego nastroju w dni zrobione i niezrobione (od największej).
 * Dni neutralne (pauza, pominięcie, niewymagane, dzisiejszy niedokończony) się nie liczą.
 * Plan tygodniowy: dzień bez wykonania to dzień „bez nawyku”.
 */
export function moodInsights(
  notes: readonly DayNote[],
  habits: readonly Habit[],
  entries: readonly Entry[],
  pauses: readonly Pause[],
  today: LocalDate,
  days = 60,
  minEach = 3,
): { average: number | null; count: number; links: MoodLink[] } {
  const from = addDays(today, -(days - 1));
  const moods = notes.filter((n): n is DayNote & { mood: number } => typeof n.mood === "number" && n.date >= from && n.date <= today);
  if (moods.length === 0) return { average: null, count: 0, links: [] };
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  const links: MoodLink[] = [];
  for (const habit of habits.filter((h) => h.archivedAt === null)) {
    const done: number[] = [];
    const missed: number[] = [];
    for (const m of moods) {
      const state = dayState(habit, entries, pauses, m.date, today);
      if (state === "done") done.push(m.mood);
      else if (m.date === today && state !== "missed") continue; // dzień trwa (wpadka „rzucam” dziś jest już pewna)
      else if (state === "missed" || state === "partial" || state === "open") missed.push(m.mood);
    }
    if (done.length >= minEach && missed.length >= minEach) {
      const withHabit = mean(done);
      const without = mean(missed);
      links.push({ habit, withHabit, without, diff: withHabit - without, days: done.length + missed.length });
    }
  }
  links.sort((a, b) => b.diff - a.diff);
  return { average: mean(moods.map((m) => m.mood)), count: moods.length, links };
}
