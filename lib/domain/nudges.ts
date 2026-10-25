import { addDays, startOfWeek, type LocalDate, type WeekStart } from "./dates";
import { plural } from "./words";
import type { DayNote, Entry, Habit, Pause, TimeOfDay } from "./model";
import { completionRate, currentWeekProgress } from "./progress";
import { unitOf } from "./model";
import { planOn } from "./schedule";
import { weekReview } from "./stats";
import { habitStrength } from "./strength";
import { awaitsAnswer, buildDay, dayProgress, type TodayItem } from "./today";

// ---------- pory dnia ----------

export const PART_LABELS: Record<TimeOfDay, string> = { morning: "Rano", day: "W ciągu dnia", evening: "Wieczorem" };
const PART_ORDER: (TimeOfDay | null)[] = ["morning", "day", "evening", null];

export type PartGroup = { part: TimeOfDay | null; items: TodayItem[] };

/** Grupy w kolejności rano → dzień → wieczór → kiedykolwiek; puste grupy pominięte. */
export function groupByPart(items: readonly TodayItem[]): PartGroup[] {
  return PART_ORDER.map((part) => ({ part, items: items.filter((i) => i.habit.timeOfDay === part) })).filter((g) => g.items.length > 0);
}

// ---------- wczoraj niedomknięte ----------

export type DayGap = { date: LocalDate; missing: TodayItem[]; done: number; total: number };

/**
 * Wymagane wczoraj nawyki bez żadnej odpowiedzi (ani zrobione, ani pominięte, ani „nie”). null, gdy wczoraj
 * jest domknięte albo nic nie było wymagane. Plany tygodniowe się nie liczą — można je nadrobić innego dnia.
 */
export function yesterdayGap(
  habits: readonly Habit[],
  entries: readonly Entry[],
  pauses: readonly Pause[],
  today: LocalDate,
  weekStart: WeekStart,
): DayGap | null {
  const date = addDays(today, -1);
  const view = buildDay(habits, entries, pauses, date, today, weekStart);
  const missing = view.todo.filter((i) => awaitsAnswer(i, false));
  if (view.progress.total === 0 || missing.length === 0) return null;
  return { date, missing, done: view.progress.done, total: view.progress.total };
}

// ---------- powrót po przerwie ----------

/**
 * Ciąg dni kończący się wczoraj bez żadnego zapisu, choć nawyki „buduję” były wymagane.
 * `days` liczy tylko dni z wymaganymi nawykami (weekend przy planie pn–pt nie wydłuża przerwy); from..to to cały zakres.
 */
export type Absence = { from: LocalDate; to: LocalDate; days: number };

/**
 * Cisza przed dziś: dni z wymaganymi nawykami „buduję”, w których nie ma żadnego wpisu (także „nie” i pominięcia)
 * ani notatki dnia. Kończy ją wpis, notatka albo pauza wszystkich nawyków (przerwa już opisana).
 * Wpisy z Apple Zdrowie (Skrót zapisuje je sam) nie są aktywnością. Dni bez wymaganych nawyków są neutralne.
 * `maxDays` ogranicza, jak daleko patrzymy wstecz.
 */
export function absence(
  habits: readonly Habit[],
  entries: readonly Entry[],
  pauses: readonly Pause[],
  notes: readonly DayNote[],
  today: LocalDate,
  maxDays = 60,
): Absence | null {
  const logged = manualDates(habits, entries, notes);
  const to = addDays(today, -1);
  let from: LocalDate | null = null;
  let days = 0;
  for (let d = to, i = 0; i < maxDays; d = addDays(d, -1), i++) {
    if (logged.has(d) || pauses.some((p) => p.habitId === null && p.startDate <= d && d <= p.endDate)) break;
    if (dayProgress(habits, entries, pauses, d, true).total > 0) {
      from = d;
      days++;
    }
  }
  return from ? { from, to, days } : null;
}

/** Dni, w których użytkownik coś zapisał sam (wpis nawyku bez Apple Zdrowie albo notatka/nastrój). */
export function manualDates(habits: readonly Habit[], entries: readonly Entry[], notes: readonly DayNote[]): Set<LocalDate> {
  const auto = new Set(habits.filter((h) => h.source).map((h) => h.id));
  return new Set<LocalDate>([...entries.filter((e) => !auto.has(e.habitId)).map((e) => e.date), ...notes.map((n) => n.date)]);
}

/**
 * Najłatwiejszy start po przerwie: codzienny nawyk „buduję” wymagany dziś, najmocniejszy
 * (najdłużej trzymany), a przy remisie z najmniejszym celem.
 */
export function easiestHabit(habits: readonly Habit[], entries: readonly Entry[], pauses: readonly Pause[], today: LocalDate, weekStart: WeekStart): TodayItem | null {
  const view = buildDay(habits, entries, pauses, today, today, weekStart);
  const candidates = view.todo.filter((i) => !i.entry);
  if (candidates.length === 0) return null;
  const score = new Map(candidates.map((i) => [i.habit.id, habitStrength(i.habit, entries, pauses, today)]));
  return [...candidates].sort((a, b) => score.get(b.habit.id)! - score.get(a.habit.id)! || a.plan.targetValue - b.plan.targetValue)[0]!;
}

// ---------- podsumowanie tygodnia ----------

export type WeeklySummary = {
  weekStart: LocalDate;
  /** zrobione / wymagane w dniach tygodnia do dziś; null = nic nie było wymagane */
  share: number | null;
  perfectDays: number;
  daysSoFar: number;
  best: { name: string; rate: number } | null;
  worst: { name: string; rate: number } | null;
  weekly: { name: string; done: number; required: number }[];
  /** odhaczenia nawyków „buduję” w tym tygodniu, dni z jakimkolwiek wpisem i najczęściej robiony nawyk */
  logged: { checks: number; days: number; top: { name: string; count: number } | null };
};

/** Ostatni dzień tygodnia (wtedy wysyłamy podsumowanie). */
export function isLastDayOfWeek(date: LocalDate, weekStart: WeekStart): boolean {
  return addDays(startOfWeek(date, weekStart), 6) === date;
}

export function weeklySummary(
  habits: readonly Habit[],
  entries: readonly Entry[],
  pauses: readonly Pause[],
  today: LocalDate,
  weekStart: WeekStart,
): WeeklySummary {
  const first = startOfWeek(today, weekStart);
  const review = weekReview(habits, entries, pauses, today, today, weekStart);
  const active = habits.filter((h) => h.archivedAt === null && h.startDate <= today);

  const rated: { name: string; rate: number }[] = [];
  const weekly: WeeklySummary["weekly"] = [];
  for (const habit of active) {
    const plan = planOn(habit, today);
    // „Rzucam” bez wpisów ma zawsze 100%: nie wygrywa z nawykami, które naprawdę trzeba było zrobić
    if (!plan || habit.goal === "quit") continue;
    if (unitOf(plan.frequency) === "weeks") {
      const w = currentWeekProgress(habit, entries, pauses, today, weekStart);
      if (w.required > 0) weekly.push({ name: habit.name, done: w.done, required: w.required });
      continue;
    }
    const rate = completionRate(habit, entries, pauses, first, today, today, weekStart);
    if (rate !== null) rated.push({ name: habit.name, rate });
  }

  // Najlepszy i najsłabszy tylko, gdy jest co porównać
  const sorted = [...rated].sort((a, b) => b.rate - a.rate);
  const best = sorted.length >= 2 && sorted[0]!.rate > sorted[sorted.length - 1]!.rate ? sorted[0]! : null;
  const worst = best ? sorted[sorted.length - 1]! : null;

  const ids = new Set(active.filter((h) => h.goal !== "quit").map((h) => h.id));
  const inWeek = entries.filter((e) => e.date >= first && e.date <= today);
  const checks = inWeek.filter((e) => ids.has(e.habitId) && !e.skipped && (e.value ?? 0) > 0);
  const counts = new Map<string, number>();
  for (const e of checks) counts.set(e.habitId, (counts.get(e.habitId) ?? 0) + 1);
  const topId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const top = topId ? { name: active.find((h) => h.id === topId[0])!.name, count: topId[1] } : null;

  return {
    weekStart: first,
    share: review.total === 0 ? null : review.done / review.total,
    perfectDays: review.perfectDays,
    daysSoFar: review.days.filter((d) => d.date <= today && d.total > 0).length,
    best,
    worst,
    weekly,
    logged: { checks: checks.length, days: new Set(inWeek.map((e) => e.date)).size, top },
  };
}

export function weeklyMessage(s: WeeklySummary): { title: string; body: string } | null {
  if (s.share === null && s.weekly.length === 0) return null;
  // Słaby albo rzadko zapisywany tydzień: zamiast procentów i „do poprawy” to, co się udało, i czysta karta
  if (s.share !== null && (s.logged.days <= 3 || s.share < 0.5)) {
    const { checks, days, top } = s.logged;
    if (checks === 0) return { title: "Nowy tydzień od jutra", body: "Czysta karta. Wystarczy jeden nawyk dziennie, żeby ruszyć." };
    const parts = [`${checks} ${plural(checks, "odhaczenie", "odhaczenia", "odhaczeń")} w ${days} ${plural(days, "dzień", "dni", "dni")}`];
    if (top && top.count > 1) parts.push(`Najczęściej: ${top.name} ${top.count}×`);
    for (const w of s.weekly) parts.push(`${w.name} ${w.done}/${w.required}`);
    parts.push("Od jutra nowy tydzień");
    return { title: "Twój tydzień", body: parts.join(" · ") };
  }
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const parts: string[] = [];
  if (s.share !== null) parts.push(`Idealne dni: ${s.perfectDays} z ${s.daysSoFar}`);
  if (s.best && s.worst) parts.push(`Najlepiej: ${s.best.name} (${pct(s.best.rate)})`, `Do poprawy: ${s.worst.name} (${pct(s.worst.rate)})`);
  for (const w of s.weekly) parts.push(`${w.name} ${w.done}/${w.required}`);
  return { title: s.share === null ? "Twój tydzień" : `Twój tydzień: ${pct(s.share)}`, body: parts.join(" · ") };
}
