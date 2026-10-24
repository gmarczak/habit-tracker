import { addDays, type LocalDate } from "./dates";
import type { Entry, Habit, Pause } from "./model";
import { entriesByDate, entryOutcome, isPaused, planOn, requirementOn } from "./schedule";

/*
 * Siła nawyku (jak w Loop Habit Tracker): wygładzanie wykładnicze 0..1.
 * Każdy wymagany dzień przesuwa wynik w stronę 1 (zrobione) albo 0 (nie), więc jedna przerwa
 * tylko go obniża, zamiast zerować jak seria. Okres półtrwania ~13 wymaganych dni.
 * Plan „X razy w tygodniu”: każdy dzień ocenia ostatnie dwa tygodnie (zrobione / wymagane w tym oknie),
 * więc plan wykonany co do joty dochodzi do 100%, a 2 z 3 razy do ~67%.
 * Neutralne: przed startem, pauza, pominięcie, dni niewymagane, dzisiejszy niedokończony dzień.
 */
const WINDOW = 14;
const KEEP = 0.5 ** (1 / 13);

export function habitStrength(habit: Habit, entries: readonly Entry[], pauses: readonly Pause[], today: LocalDate): number {
  const byDate = entriesByDate(entries, habit.id);
  let score = 0;
  // Okno planu tygodniowego liczone przesuwnie (każdy dzień raz): zrobione i wymagane×7 w ostatnich WINDOW dniach
  const slots: { done: number; times: number }[] = [];
  let windowDone = 0;
  let windowTimes = 0;

  for (let d = habit.startDate; d <= today; d = addDays(d, 1)) {
    const plan = planOn(habit, d);
    const paused = plan !== null && isPaused(pauses, habit.id, d);
    const entry = byDate.get(d);

    const slot = { done: 0, times: 0 };
    if (plan?.frequency === "weekly_count" && !paused && !entry?.skipped) {
      slot.done = entryOutcome(entry, plan) === "done" ? 1 : 0;
      slot.times = plan.timesPerWeek ?? 1;
    }
    slots.push(slot);
    windowDone += slot.done;
    windowTimes += slot.times;
    if (slots.length > WINDOW) {
      const old = slots.shift()!;
      windowDone -= old.done;
      windowTimes -= old.times;
    }

    if (!plan || paused) continue;
    if (entry?.skipped) continue;

    const weekly = plan.frequency === "weekly_count";
    if (!weekly && requirementOn(habit, pauses, d) !== "required") continue;

    let value: number;
    if (weekly) value = windowTimes === 0 ? 0 : Math.min(1, (windowDone * 7) / windowTimes);
    else if (habit.goal === "quit") value = entryOutcome(entry, plan, "quit") === "done" ? 1 : 0;
    else if (habit.kind === "check") value = entry && (entry.value ?? 0) > 0 ? 1 : 0;
    else value = Math.min(1, (entry?.value ?? 0) / (plan.targetValue || 1));

    if (d === today && value < 1 && habit.goal !== "quit") continue; // dzień jeszcze trwa

    score = score * KEEP + value * (1 - KEEP);
  }
  return score;
}
