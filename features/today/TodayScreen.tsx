"use client";

import { useQueryClient } from "@tanstack/react-query";
import { clear as clearIdb } from "idb-keyval";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { NewHabitDialog } from "@/features/habits/NewHabitDialog";
import { snapshotKey, useSnapshot, useToday } from "@/lib/data/hooks";
import { syncTimeZone } from "@/lib/data/mutations";
import { supabaseBrowser } from "@/lib/db/client";
import type { LocalDate } from "@/lib/domain/dates";
import { buildDay } from "@/lib/domain/today";
import { formatDayMonth, formatWeekday } from "@/lib/format";
import { DayHeader } from "./DayHeader";
import { HabitRow } from "./HabitRow";
import { WeekStrip } from "./WeekStrip";

export function TodayScreen() {
  const qc = useQueryClient();
  const router = useRouter();
  const { data: snapshot, isPending, error, refetch } = useSnapshot();
  const today = useToday(snapshot);
  const [picked, setPicked] = useState<LocalDate | null>(null);
  const [adding, setAdding] = useState(false);
  const date = picked && today && picked <= today ? picked : today;

  // Pierwsze logowanie: strefa czasowa profilu = strefa urządzenia.
  useEffect(() => {
    if (!snapshot) return;
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    void syncTimeZone(supabaseBrowser(), snapshot.userId, device).then((changed) => {
      if (changed) void qc.invalidateQueries({ queryKey: snapshotKey });
    });
  }, [snapshot?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const view = useMemo(
    () =>
      snapshot && date && today
        ? buildDay(snapshot.habits, snapshot.entries, snapshot.pauses, date, today, snapshot.settings.weekStart)
        : null,
    [snapshot, date, today],
  );

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    qc.clear();
    await clearIdb();
    router.replace("/login");
  }

  if (isPending) {
    return <main className="mx-auto max-w-lg px-5 py-8 text-muted">Ładuję…</main>;
  }
  if (error || !snapshot || !view || !today || !date) {
    return (
      <main className="mx-auto flex max-w-lg flex-col gap-3 px-5 py-8">
        <p>Nie udało się wczytać danych.</p>
        <button type="button" onClick={() => void refetch()} className="h-11 rounded-xl bg-accent px-4 font-semibold text-accent-contrast">
          Spróbuj ponownie
        </button>
      </main>
    );
  }

  const hasHabits = snapshot.habits.some((h) => h.archivedAt === null);
  const isToday = date === today;

  const open = [...view.todo, ...view.thisWeek];

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col pb-32">
      <div className="flex flex-col gap-[18px] px-6 pt-7">
        <DayHeader
          label={isToday ? formatWeekday(date) : `Uzupełniasz · ${formatWeekday(date)}`}
          title={formatDayMonth(date)}
          progress={view.progress}
        />
        <WeekStrip today={today} selected={date} onSelect={(d) => setPicked(d === today ? null : d)} snapshot={snapshot} />
      </div>

      <div className="flex flex-col px-6 pt-3.5">
        {!hasHabits && (
          <section className="mt-4 flex flex-col items-start gap-3">
            <p className="font-serif text-xl font-semibold">Zacznij od jednego nawyku.</p>
            <p className="text-muted">Wystarczy nazwa i jak często. Resztę dopasujesz później.</p>
            <button type="button" onClick={() => setAdding(true)} className="mt-1 h-12 rounded-full bg-accent px-6 font-semibold text-accent-contrast">
              Dodaj nawyk
            </button>
          </section>
        )}

        {open.length > 0 && (
          <ul aria-label="Do zrobienia">
            {open.map((item) => (
              <li key={item.habit.id}>
                <HabitRow item={item} date={date} compact={false} />
              </li>
            ))}
          </ul>
        )}

        {view.done.length > 0 && (
          <section aria-labelledby="done-heading">
            <h2 id="done-heading" className="pb-1 pt-5 font-serif text-lg font-semibold">
              Zrobione
            </h2>
            <ul>
              {view.done.map((item) => (
                <li key={item.habit.id}>
                  <HabitRow item={item} date={date} compact />
                </li>
              ))}
            </ul>
          </section>
        )}

        {hasHabits && open.length + view.done.length === 0 && <p className="mt-4 text-muted">Tego dnia nic nie jest zaplanowane.</p>}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-bg pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between px-6">
          <button type="button" onClick={() => void signOut()} className="h-11 min-w-16 text-xs font-medium text-muted">
            Wyloguj
          </button>
          <button
            type="button"
            aria-label="Dodaj nawyk"
            onClick={() => setAdding(true)}
            className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-accent text-accent-contrast"
          >
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <span className="min-w-16" aria-hidden="true" />
        </div>
      </div>

      <NewHabitDialog open={adding} onClose={() => setAdding(false)} today={today} />
    </main>
  );
}
