"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DataFallback } from "@/components/ui/DataFallback";
import { useToast } from "@/components/ui/Toast";
import { btnPrimary, btnQuiet, groupHeader } from "@/components/ui/styles";
import { useAddHabit } from "@/features/shell/AppShell";
import { useAction, useSnapshot, useToday } from "@/lib/data/hooks";
import { archiveGap, deleteHabit, reorderHabits, restoreHabit } from "@/lib/data/mutations";
import type { Snapshot } from "@/lib/data/snapshot";
import type { Habit } from "@/lib/domain/model";
import { streakOf } from "@/lib/domain/progress";
import { planOn } from "@/lib/domain/schedule";
import { describePlan, formatStreak } from "@/lib/format";
import { habitStrength } from "@/lib/domain/strength";
import { HabitBadge } from "@/lib/ui/icons";
import { StrengthRing } from "./StrengthRing";

function withOrder(snapshot: Snapshot, ids: string[]): Snapshot {
  const pos = new Map(ids.map((id, i) => [id, i]));
  return { ...snapshot, habits: snapshot.habits.map((h) => (pos.has(h.id) ? { ...h, sortOrder: pos.get(h.id)! } : h)) };
}

export function HabitsScreen() {
  const { data: snapshot, isPending, refetch } = useSnapshot();
  const today = useToday(snapshot);
  const addHabit = useAddHabit();
  const toast = useToast();
  const [reordering, setReordering] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  // Kolejne przesunięcia idą po kolei (każde wysyła całą kolejność)
  const reorder = useAction(reorderHabits, withOrder, { scope: "reorder", toastErrors: true });
  const restore = useAction((s, v: { id: string; gap: ReturnType<typeof archiveGap> }) => restoreHabit(s, v.id, v.gap), undefined, { toastErrors: true });
  // Usunięcie rusza po zniknięciu komunikatu — ekran mógł się już zmienić, więc błąd też jako komunikat
  const remove = useAction((s, id: string) => deleteHabit(s, id), undefined, { toastErrors: true });

  const active = useMemo(
    () => (snapshot?.habits ?? []).filter((h) => h.archivedAt === null).sort((a, b) => a.sortOrder - b.sortOrder),
    [snapshot],
  );
  const archived = (snapshot?.habits ?? []).filter((h) => h.archivedAt !== null && !hiddenIds.includes(h.id));
  // Seria i siła liczone raz na zmianę danych (nie przy każdym przełączeniu kolejności)
  const stats = useMemo(() => {
    if (!snapshot || !today) return new Map<string, { streak: ReturnType<typeof streakOf>; strength: number }>();
    return new Map(
      active.map((h) => [
        h.id,
        {
          streak: streakOf(h, snapshot.entries, snapshot.pauses, today, snapshot.settings.weekStart),
          strength: habitStrength(h, snapshot.entries, snapshot.pauses, today),
        },
      ]),
    );
  }, [active, snapshot, today]);

  if (!snapshot || !today) return <DataFallback pending={isPending} onRetry={() => void refetch()} />;

  const groups: { title: string | null; habits: Habit[] }[] = reordering
    ? [{ title: null, habits: active }]
    : [
        ...snapshot.categories
          .map((c) => ({ title: c.name, habits: active.filter((h) => h.categoryId === c.id) }))
          .filter((g) => g.habits.length > 0),
        { title: snapshot.categories.length ? "Bez kategorii" : null, habits: active.filter((h) => !h.categoryId) },
      ].filter((g) => g.habits.length > 0);

  function move(index: number, delta: -1 | 1) {
    const ids = active.map((h) => h.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorder.mutate(ids);
  }

  function restoreFromArchive(habit: Habit) {
    // Dwa aktywne nawyki o tej samej nazwie: Siri i Skrót nie wiedziałyby, który odhaczyć
    const clash = active.some((h) => h.name.trim().toLowerCase() === habit.name.trim().toLowerCase());
    if (clash) return toast({ message: `Masz już aktywny nawyk „${habit.name}” — zmień nazwę jednego z nich.` });
    restore.mutate({ id: habit.id, gap: archiveGap(habit, snapshot!.entries, today!) });
  }

  function deleteForever(habit: Habit) {
    setHiddenIds((ids) => [...ids, habit.id]);
    toast({
      message: `Usunięto „${habit.name}” z całą historią`,
      actionLabel: "Cofnij",
      onAction: () => setHiddenIds((ids) => ids.filter((x) => x !== habit.id)),
      onExpire: () => remove.mutate(habit.id, { onError: () => setHiddenIds((ids) => ids.filter((x) => x !== habit.id)) }),
    });
  }

  return (
    <main className="flex flex-col gap-6 px-4 pt-6">
      <header className="flex items-end justify-between gap-4">
        <h1 className="font-serif text-[34px] font-bold leading-tight">Nawyki</h1>
        {active.length > 1 && (
          <button type="button" onClick={() => setReordering((r) => !r)} className={btnQuiet} aria-pressed={reordering}>
            {reordering ? "Gotowe" : "Zmień kolejność"}
          </button>
        )}
      </header>

      {active.length === 0 && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-muted">Nie masz aktywnych nawyków.</p>
          <button type="button" onClick={() => addHabit()} className={btnPrimary}>
            Dodaj nawyk
          </button>
        </div>
      )}

      {groups.map((group) => (
        <section key={group.title ?? "all"} aria-label={group.title ?? "Aktywne nawyki"}>
          {group.title && <h2 className={groupHeader}>{group.title}</h2>}
          <ul className="ios-group">
            {group.habits.map((habit) => {
              const plan = planOn(habit, today) ?? habit.plans.at(-1);
              const { streak, strength } = stats.get(habit.id)!;
              const index = active.findIndex((h) => h.id === habit.id);
              return (
                <li key={habit.id} className="flex items-center gap-3 border-b-[0.5px] border-border py-3.5">
                  {reordering ? (
                    <>
                      <HabitBadge icon={habit.icon} color={habit.color} name={habit.name} />
                      <span className="flex-1 truncate text-[17px] font-semibold">{habit.name}</span>
                      <button type="button" aria-label={`Przesuń wyżej: ${habit.name}`} disabled={index === 0} onClick={() => move(index, -1)} className="h-11 w-11 rounded-full border-[1.5px] border-control disabled:opacity-30">
                        ↑
                      </button>
                      <button type="button" aria-label={`Przesuń niżej: ${habit.name}`} disabled={index === active.length - 1} onClick={() => move(index, 1)} className="h-11 w-11 rounded-full border-[1.5px] border-control disabled:opacity-30">
                        ↓
                      </button>
                    </>
                  ) : (
                    <Link href={`/habits/${habit.id}`} className="flex min-w-0 flex-1 items-center gap-3.5">
                      <HabitBadge icon={habit.icon} color={habit.color} name={habit.name} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[17px] font-medium">{habit.name}</span>
                        <span className="truncate text-[13px] text-muted">
                          {plan ? describePlan(plan, habit.kind, habit.unit) : ""}
                          {habit.source ? " · Apple Zdrowie" : ""}
                          {streak.current > 0 ? ` · seria ${formatStreak(streak)}` : ""}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5" aria-label={`Siła nawyku ${Math.round(strength * 100)}%`}>
                        <StrengthRing value={strength} color={habit.color} size={22} />
                        <span className="w-9 text-right text-[13px] font-semibold tabular-nums text-muted">{Math.round(strength * 100)}%</span>
                      </span>
                      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted">
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {archived.length > 0 && (
        <section aria-labelledby="archive-title">
          <button
            type="button"
            id="archive-title"
            aria-expanded={showArchive}
            onClick={() => setShowArchive((s) => !s)}
            className={`${groupHeader} flex h-11 items-center gap-1.5`}
          >
            Archiwum ({archived.length})
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={showArchive ? "rotate-180" : ""}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {showArchive && (
            <ul className="ios-group">
              {archived.map((habit) => (
                <li key={habit.id} className="flex items-center gap-3 border-b-[0.5px] border-border py-3">
                  <HabitBadge icon={habit.icon} color={habit.color} name={habit.name} size="sm" />
                  <Link href={`/habits/${habit.id}`} className="flex-1 truncate font-medium text-done">
                    {habit.name}
                  </Link>
                  <button
                    type="button"
                    onClick={() => restoreFromArchive(habit)}
                    className="h-11 rounded-full px-3 text-sm font-semibold text-accent"
                  >
                    Przywróć
                  </button>
                  <button type="button" onClick={() => deleteForever(habit)} className="h-11 rounded-full px-3 text-sm font-semibold text-danger">
                    Usuń
                  </button>
                </li>
              ))}
            </ul>
          )}
          {showArchive && <p className="pt-2 text-xs text-muted">Zarchiwizowane nawyki nie pojawiają się na ekranie Dziś, ale ich historia zostaje. Usunięcie kasuje ją na zawsze.</p>}
        </section>
      )}
    </main>
  );
}
