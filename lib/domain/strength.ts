import { addDays, type LocalDate } from "./dates";
import type { Entry, Habit, Pause } from "./model";
import { entriesByDate, entryOutcome, isPaused, planOn, requirementOn } from "./schedule";

/*
 * Siła nawyku (jak w Loop Habit Tracker): wygładzanie wykładnicze 0..1.
 * Każdy wymagany dzień przesuwa wynik w stronę 1 (zrobione) albo 0 (nie), więc jedna przerwa
 * tylko go obniża, zamiast zerować jak seria. Okres półtrwania ~13 wymaganych dni;
 * przy planie „X razy w tygodniu” liczy się każdy dzień, ale z wolniejszą zmianą (częstość X/7).
 * Neutralne: przed startem, pauza, pominięcie, dni niewymagane, dzisiejszy niedokończony dzień.
 */
export function habitStrength(habit: Habit, entries: readonly Entry[], pauses: readonly Pause[], today: LocalDate): number {
  const byDate = entriesByDate(entries, habit.id);
  let score = 0;
  for (let d = habit.startDate; d <= today; d = addDays(d, 1)) {
    const plan = planOn(habit, d);
    if (!plan || isPaused(pauses, habit.id, d)) continue;
    const entry = byDate.get(d);
    if (entry?.skipped) continue;

    const weekly = plan.frequency === "weekly_count";
    if (!weekly && requirementOn(habit, pauses, d) !== "required") continue;

    let value: number;
    if (habit.goal === "quit") value = entryOutcome(entry, plan, "quit") === "done" ? 1 : 0;
    else if (habit.kind === "check") value = entry && (entry.value ?? 0) > 0 ? 1 : 0;
    else value = Math.min(1, (entry?.value ?? 0) / (plan.targetValue || 1));

    if (d === today && value < 1 && habit.goal !== "quit") continue; // dzień jeszcze trwa

    const frequency = weekly ? (plan.timesPerWeek ?? 1) / 7 : 1;
    const keep = 0.5 ** (Math.sqrt(frequency) / 13);
    score = score * keep + value * (1 - keep);
  }
  return score;
}
