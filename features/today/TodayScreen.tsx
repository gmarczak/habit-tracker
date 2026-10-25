"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { btnSecondarySm, groupHeader } from "@/components/ui/styles";
import { Onboarding } from "@/features/onboarding/Onboarding";
import { ReminderPrompt } from "@/features/reminders/ReminderPrompt";
import { snapshotKey, useEntryMutation, useSnapshot, useToday } from "@/lib/data/hooks";
import { syncTimeZone } from "@/lib/data/mutations";
import { supabaseBrowser } from "@/lib/db/client";
import { isLocalDate, type LocalDate } from "@/lib/domain/dates";
import { reachedMilestone } from "@/lib/domain/milestones";
import { PART_LABELS, groupByPart, yesterdayGap } from "@/lib/domain/nudges";
import { buildDay, type TodayItem } from "@/lib/domain/today";
import { habitCount } from "@/lib/domain/words";
import { formatDayMonth, formatWeekday } from "@/lib/format";
import { Celebration, type CelebrationInfo } from "./Celebration";
import { DayHeader } from "./DayHeader";
import { HabitRow } from "./HabitRow";
import { DayNote } from "./DayNote";
import { restoreTimer, takeTimer } from "./HabitTimer";
import { DayOffButton, DayOffCard, YesterdayCard, pauseOn } from "./Nudges";
import { QuitRow } from "./QuitRow";
import { WeekStrip } from "./WeekStrip";

export function TodayScreen() {
  const qc = useQueryClient();
  const toast = useToast();
  const mutation = useEntryMutation();
  const { data: snapshot, isPending, refetch } = useSnapshot();
  const today = useToday(snapshot);
  // Dzień wybrany do uzupełnienia; ważny tylko w dniu, w którym go wybrano (rano znów otwiera się „dziś”)
  const [pick, setPick] = useState<{ date: LocalDate; on: LocalDate } | null>(null);
  const [celebration, setCelebration] = useState<CelebrationInfo | null>(null);
  const date = pick && today && pick.on === today && pick.date <= today ? pick.date : today;
  const setPicked = (d: LocalDate | null) => setPick(d && today && d !== today ? { date: d, on: today } : null);

  // Link z powiadomienia „wczoraj niedomknięte”: /?date=RRRR-MM-DD otwiera ten dzień do uzupełnienia
  const urlHandled = useRef(false);
  useEffect(() => {
    if (!today || urlHandled.current) return;
    urlHandled.current = true;
    const fromUrl = new URLSearchParams(window.location.search).get("date");
    if (!fromUrl || !isLocalDate(fromUrl)) return;
    window.history.replaceState(null, "", window.location.pathname);
    const id = window.setTimeout(() => setPick(fromUrl < today ? { date: fromUrl, on: today } : null), 0);
    return () => window.clearTimeout(id);
  }, [today]);

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
    const items = [...view.todo, ...view.thisWeek, ...view.done, ...view.quit];
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

  /**
   * „Wszystko zrobione”: cały cel każdego nawyku wymaganego tego dnia (plany tygodniowe zostają — to nie codzienne).
   * Pomyłkę poprawia się gestem na wierszu albo cofa całość z komunikatu.
   */
  function markAllDone(items: TodayItem[], day: LocalDate) {
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
  }

  if (isPending) return <TodaySkeleton />;
  // Błąd odświeżenia przy danych z cache (np. Wi-Fi bez internetu) nie zasłania ekranu
  if (!snapshot || !view || !today || !date) {
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
  const groups = groupByPart(open);
  const grouped = groups.some((g) => g.part !== null);
  const dayPause = pauseOn(snapshot, date);
  const gap = isToday && hasHabits ? yesterdayGap(snapshot.habits, snapshot.entries, snapshot.pauses, today, snapshot.settings.weekStart) : null;
  const allDone = view.progress.total > 0 && view.progress.done === view.progress.total && view.todo.length === 0;

  const dayNote = snapshot.notes.find((n) => n.date === date);

  return (
    <main className="flex flex-col">
      <div className="flex flex-col gap-4 px-4 pt-6">
        <DayHeader
          label={isToday ? formatWeekday(date) : `Uzupełniasz · ${formatWeekday(date)}`}
          title={formatDayMonth(date)}
          progress={view.progress}
        />
        {hasHabits && <WeekStrip today={today} selected={date} onSelect={setPicked} snapshot={snapshot} />}
        {open.length > 0 && view.todo.length < 2 && (
          <Link href={isToday ? "/review" : `/review?date=${date}`} className={`${btnSecondarySm} w-full`}>
            Przegląd dnia · {open.length} do domknięcia
          </Link>
        )}
        {view.todo.length >= 2 && (
          <div className="grid grid-cols-2 gap-2">
            <Link href={isToday ? "/review" : `/review?date=${date}`} className={`${btnSecondarySm} h-auto! min-h-11 py-1.5 leading-tight`}>
              Przegląd dnia
            </Link>
            <button type="button" onClick={() => markAllDone(view.todo, date)} className={`${btnSecondarySm} h-auto! min-h-11 py-1.5 leading-tight`}>
              Wszystko zrobione
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col px-4 pt-2">
        {!hasHabits && <Onboarding today={today} />}

        {gap && <YesterdayCard gap={gap} onFill={() => setPicked(gap.date)} />}

        {hasHabits && isToday && <ReminderPrompt snapshot={snapshot} />}

        {hasHabits && dayPause && <DayOffCard key={dayPause.id} pause={dayPause} isToday={isToday} />}

        {allDone && (
          <p className="mt-4 rounded-xl bg-surface px-5 py-4 font-serif text-lg font-bold">
            {isToday ? "Wszystko na dziś zrobione." : "Ten dzień jest domknięty."}
          </p>
        )}

        {open.length > 0 && !grouped && (
          <ul aria-label="Do zrobienia" className="ios-group mt-4 overflow-hidden">
            {open.map((item) => (
              <li key={item.habit.id}>
                <HabitRow item={item} date={date} today={today} compact={false} />
              </li>
            ))}
          </ul>
        )}

        {open.length > 0 &&
          grouped &&
          groups.map((g) => {
            const title = g.part ? PART_LABELS[g.part] : "Kiedykolwiek";
            return (
              <section key={g.part ?? "any"} aria-label={title}>
                <h2 className={`${groupHeader} pt-6`}>{title}</h2>
                <ul className="ios-group overflow-hidden">
                  {g.items.map((item) => (
                    <li key={item.habit.id}>
                      <HabitRow item={item} date={date} today={today} compact={false} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

        {view.quit.length > 0 && (
          <section aria-labelledby="quit-heading">
            <h2 id="quit-heading" className={`${groupHeader} pt-6`}>
              Rzucam
            </h2>
            <ul className="ios-group">
              {view.quit.map((item) => (
                <li key={item.habit.id}>
                  <QuitRow item={item} date={date} isToday={isToday} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {view.done.length > 0 && (
          <section aria-labelledby="done-heading">
            <h2 id="done-heading" className={`${groupHeader} pt-6`}>
              Zrobione
            </h2>
            <ul className="ios-group overflow-hidden">
              {view.done.map((item) => (
                <li key={item.habit.id}>
                  <HabitRow item={item} date={date} today={today} compact />
                </li>
              ))}
            </ul>
          </section>
        )}

        {hasHabits && !dayPause && open.length + view.done.length + view.quit.length === 0 && <p className="mt-4 text-muted">Tego dnia nic nie jest zaplanowane.</p>}

        {hasHabits && (
          <DayNote
            key={date}
            date={date}
            note={dayNote?.note ?? null}
            mood={dayNote?.mood ?? null}
          />
        )}

        {hasHabits && !dayPause && view.progress.total > 0 && !allDone && <DayOffButton date={date} isToday={isToday} />}
      </div>

      {celebration && <Celebration info={celebration} onDone={closeCelebration} />}
    </main>
  );
}

function TodaySkeleton() {
  return (
    <main className="flex flex-col gap-6 px-4 pt-6" aria-busy="true" aria-label="Ładowanie">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-3 w-20 rounded bg-surface" />
          <div className="h-8 w-48 rounded bg-surface" />
        </div>
        <div className="h-16 w-16 rounded-full bg-surface" />
      </div>
      <div className="h-16 rounded-xl bg-surface" />
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
