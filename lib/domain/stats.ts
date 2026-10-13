import { addDays, startOfWeek, type LocalDate, type WeekStart } from "./dates";
import type { DayNote, Entry, Habit, Pause } from "./model";
import { completionRate } from "./progress";
import { buildDay } from "./today";

/*
 * Statystyki globalne. Dzień liczy się z nawyków wymaganych tego dnia (jak pierścień na ekranie Dziś):
 * pominięte i pauzy nie wchodzą do mianownika, plany tygodniowe nie wchodzą do bilansu dnia.
 */

export type DayTotals = { date: LocalDate; done: number; total: number };

export function dayTotals(
  habits: readonly Habit[],
  entries: readonly Entry[],
  pauses: readonly Pause[],
  date: LocalDate,
  today: LocalDate,
  weekStart: WeekStart,
): DayTotals {
  const { progress } = buildDay(habits, entries, pauses, date, today, weekStart);
  return { date, ...progress };
}

/** Idealny dzień: był przynajmniej jeden wymagany nawyk i wszystkie są zrobione (pominięte się nie liczą). */
export function isPerfect(d: DayTotals): boolean {
  return d.total > 0 && d.done === d.total;
}

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
    d > today ? { date: d, done: 0, total: 0 } : dayTotals(habits, entries, pauses, d, today, weekStart),
  );
  return {
    days,
    done: days.reduce((s, d) => s + d.done, 0),
    total: days.reduce((s, d) => s + d.total, 0),
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
    const t = dayTotals(habits, entries, pauses, d, today, weekStart);
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
    .filter((n) => n.date <= today)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, limit)
    .map((n) => ({ ...dayTotals(habits, entries, pauses, n.date, today, weekStart), note: n.note }));
}
