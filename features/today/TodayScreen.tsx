"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Onboarding } from "@/features/onboarding/Onboarding";
import { ReminderPrompt } from "@/features/reminders/ReminderPrompt";
import { snapshotKey, useSnapshot, useToday } from "@/lib/data/hooks";
import { syncTimeZone } from "@/lib/data/mutations";
import { supabaseBrowser } from "@/lib/db/client";
import type { LocalDate } from "@/lib/domain/dates";
import { reachedMilestone } from "@/lib/domain/milestones";
import { buildDay } from "@/lib/domain/today";
import { formatDayMonth, formatWeekday } from "@/lib/format";
import { Celebration, type CelebrationInfo } from "./Celebration";
import { DayHeader } from "./DayHeader";
import { HabitRow } from "./HabitRow";
import { WeekStrip } from "./WeekStrip";

export function TodayScreen() {
  const qc = useQueryClient();
  const { data: snapshot, isPending, error, refetch } = useSnapshot();
  const today = useToday(snapshot);
  const [picked, setPicked] = useState<LocalDate | null>(null);
  const [celebration, setCelebration] = useState<CelebrationInfo | null>(null);
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

  // Kamienie milowe: porównanie serii z poprzednim renderem (tylko wzrost).
  const lastStreaks = useRef<Map<string, number> | null>(null);
  useEffect(() => {
    if (!view) return;
    const items = [...view.todo, ...view.thisWeek, ...view.done];
    const prev = lastStreaks.current;
    let hit: CelebrationInfo | null = null;
    for (const item of items) {
      const before = prev?.get(item.habit.id);
      if (before === undefined) continue;
      const m = reachedMilestone(item.streak.unit, before, item.streak.current);
      if (m) hit = { habitName: item.habit.name, value: m, unit: item.streak.unit };
    }
    lastStreaks.current = new Map(items.map((i) => [i.habit.id, i.streak.current]));
    if (hit) {
      const info = hit;
      const id = window.setTimeout(() => setCelebration(info), 0);
      return () => window.clearTimeout(id);
    }
  }, [view]);

  const closeCelebration = useCallback(() => setCelebration(null), []);

  if (isPending) return <TodaySkeleton />;
  if (error || !snapshot || !view || !today || !date) {
    return (
      <main className="flex flex-col gap-3 px-6 py-8">
        <p>Nie udało się wczytać danych. Sprawdź połączenie.</p>
        <button type="button" onClick={() => void refetch()} className="h-12 self-start rounded-full bg-accent px-6 font-semibold text-accent-contrast">
          Spróbuj ponownie
        </button>
      </main>
    );
  }

  const hasHabits = snapshot.habits.some((h) => h.archivedAt === null);
  const isToday = date === today;
  const open = [...view.todo, ...view.thisWeek];
  const allDone = view.progress.total > 0 && view.progress.done === view.progress.total && view.todo.length === 0;

  return (
    <main className="flex flex-col">
      <div className="flex flex-col gap-[18px] px-6 pt-7">
        <DayHeader
          label={isToday ? formatWeekday(date) : `Uzupełniasz · ${formatWeekday(date)}`}
          title={formatDayMonth(date)}
          progress={view.progress}
        />
        {hasHabits && <WeekStrip today={today} selected={date} onSelect={(d) => setPicked(d === today ? null : d)} snapshot={snapshot} />}
      </div>

      <div className="flex flex-col px-6 pt-3.5">
        {!hasHabits && <Onboarding today={today} />}

        {hasHabits && isToday && <ReminderPrompt snapshot={snapshot} />}

        {allDone && (
          <p className="mt-4 rounded-2xl bg-surface px-5 py-4 font-serif text-lg font-semibold">
            {isToday ? "Wszystko na dziś zrobione." : "Ten dzień jest domknięty."}
          </p>
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

      {celebration && <Celebration info={celebration} onDone={closeCelebration} />}
    </main>
  );
}

function TodaySkeleton() {
  return (
    <main className="flex flex-col gap-6 px-6 pt-7" aria-busy="true" aria-label="Ładowanie">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-3 w-20 rounded bg-surface" />
          <div className="h-8 w-48 rounded bg-surface" />
        </div>
        <div className="h-16 w-16 rounded-full bg-surface" />
      </div>
      <div className="h-16 rounded-2xl bg-surface" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3.5">
          <div className="h-10 w-10 rounded-full bg-surface" />
          <div className="h-5 flex-1 rounded bg-surface" />
          <div className="h-11 w-11 rounded-full bg-surface" />
        </div>
      ))}
    </main>
  );
}
