"use client";

import { useToast } from "@/components/ui/Toast";
import { useEntryMutation } from "@/lib/data/hooks";
import type { LocalDate } from "@/lib/domain/dates";
import { isAnsweredNo, type TodayItem } from "@/lib/domain/today";
import { habitCount } from "@/lib/domain/words";
import { restoreTimer, takeTimer } from "./HabitTimer";

/** Co odhacza „Wszystko zrobione”: wymagane tego dnia, bez tych, na które padła odpowiedź „nie dziś”. */
export function markAllCandidates(todo: readonly TodayItem[]): TodayItem[] {
  return todo.filter((i) => !isAnsweredNo(i));
}

/**
 * „Wszystko zrobione”: pełny cel każdego z `items` (plany tygodniowe zostają — to nie codzienne).
 * Pomyłkę poprawia się gestem na wierszu albo cofa całość z komunikatu.
 */
export function useMarkAllDone() {
  const mutation = useEntryMutation();
  const toast = useToast();
  return (items: readonly TodayItem[], day: LocalDate) => {
    if (items.length === 0) return;
    // Minutnik nie dopisze minut ponad cel; jego stan wraca przy „Cofnij”
    const timers = items.map(({ habit }) => (habit.kind === "duration" ? takeTimer(habit.id, day) : null));
    for (const { habit, plan } of items)
      mutation.mutate({ habitId: habit.id, date: day, kind: "set", value: habit.kind === "check" ? 1 : plan.targetValue });
    toast({
      message: `Odhaczono ${habitCount(items.length)}`,
      actionLabel: "Cofnij",
      durationMs: 8000,
      onAction: () => {
        // Wraca stan sprzed: częściowa ilość albo brak wpisu, i minutnik
        items.forEach(({ habit, entry }, i) => {
          mutation.mutate(entry ? { habitId: habit.id, date: day, kind: "set", value: entry.value ?? 0 } : { habitId: habit.id, date: day, kind: "clear" });
          restoreTimer(habit.id, day, timers[i] ?? null);
        });
      },
    });
  };
}

/** „Nie zrobiłem” dla listy (np. wczorajszych braków): wpis 0 = odpowiedź, rano już nie pyta. Z „Cofnij”. */
export function useMarkAllNo() {
  const mutation = useEntryMutation();
  const toast = useToast();
  return (items: readonly TodayItem[], day: LocalDate) => {
    if (items.length === 0) return;
    for (const { habit } of items) mutation.mutate({ habitId: habit.id, date: day, kind: "set", value: 0 });
    toast({
      message: `Zapisano: ${habitCount(items.length)} bez wykonania`,
      actionLabel: "Cofnij",
      onAction: () => {
        for (const { habit, entry } of items)
          mutation.mutate(entry ? { habitId: habit.id, date: day, kind: "set", value: entry.value ?? 0 } : { habitId: habit.id, date: day, kind: "clear" });
      },
    });
  };
}
