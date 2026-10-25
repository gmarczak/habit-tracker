"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DataFallback } from "@/components/ui/DataFallback";
import { btnPrimary, btnQuiet, btnSecondary } from "@/components/ui/styles";
import { DayNote } from "@/features/today/DayNote";
import { EntrySheet } from "@/features/today/EntrySheet";
import { useEntryMutation, useSnapshot, useToday } from "@/lib/data/hooks";
import type { Snapshot } from "@/lib/data/snapshot";
import { addDays, isLocalDate, type LocalDate } from "@/lib/domain/dates";
import { buildDay, type TodayItem } from "@/lib/domain/today";
import { formatDayLong, formatNumber } from "@/lib/format";
import { HabitBadge } from "@/lib/ui/icons";

/**
 * Przegląd dnia: nawyki po kolei, jeden na ekranie, z dwiema dużymi odpowiedziami.
 * Wieczorem (albo rano za wczoraj) domyka dzień w kilka sekund; na koniec nastrój i notatka.
 */
export function DayReview({ dateParam }: { dateParam: string | null }) {
  const { data: snapshot, isPending, refetch } = useSnapshot();
  const today = useToday(snapshot);
  if (!snapshot || !today) return <DataFallback pending={isPending} onRetry={() => void refetch()} />;
  // Tylko ostatni tydzień, jak w pasku dni na ekranie Dziś
  const date = dateParam && isLocalDate(dateParam) && dateParam <= today && dateParam >= addDays(today, -6) ? dateParam : today;
  return <Review key={date} snapshot={snapshot} date={date} today={today} />;
}

/** Kolejność ustalona na wejściu: odpowiedź nie przestawia kart (zrobiony nawyk nie znika spod palca). */
function queueOf(snapshot: Snapshot, date: LocalDate, today: LocalDate): string[] {
  const view = buildDay(snapshot.habits, snapshot.entries, snapshot.pauses, date, today, snapshot.settings.weekStart);
  return [...view.todo, ...view.thisWeek, ...view.quit].map((i) => i.habit.id);
}

function Review({ snapshot, date, today }: { snapshot: Snapshot; date: LocalDate; today: LocalDate }) {
  const [queue] = useState(() => queueOf(snapshot, date, today));
  const [index, setIndex] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const mutation = useEntryMutation();

  const view = useMemo(
    () => buildDay(snapshot.habits, snapshot.entries, snapshot.pauses, date, today, snapshot.settings.weekStart),
    [snapshot, date, today],
  );
  const items = new Map([...view.todo, ...view.thisWeek, ...view.done, ...view.quit].map((i) => [i.habit.id, i]));
  // Nawyk usunięty albo zarchiwizowany w trakcie przeglądu po prostu wypada z kolejki
  const live = queue.filter((id) => items.has(id));
  const item = index < live.length ? items.get(live[index]!)! : null;
  const isToday = date === today;
  const next = () => setIndex((i) => i + 1);

  function answer(change: "done" | "not" | "skip" | "slip" | "clean") {
    if (!item) return;
    const { habit, plan, entry } = item;
    const base = { habitId: habit.id, date };
    if (change === "done") mutation.mutate({ ...base, kind: "set", value: habit.kind === "check" ? 1 : plan.targetValue });
    if (change === "slip") mutation.mutate({ ...base, kind: "set", value: 1 });
    if (change === "skip") mutation.mutate({ ...base, kind: "skip" });
    // „Nie dziś” i „Czysto” cofają ewentualną wcześniejszą odpowiedź (np. po powrocie strzałką)
    if ((change === "not" || change === "clean") && entry) mutation.mutate({ ...base, kind: "clear" });
    next();
  }

  const dayNote = snapshot.notes.find((n) => n.date === date);

  return (
    <main className="flex min-h-[calc(100dvh-7rem)] flex-col gap-5 px-4 pt-4">
      <div className="flex items-center justify-between">
        <Link href="/" className="-ml-1 flex h-11 items-center gap-1 text-[17px] text-accent">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Dziś
        </Link>
        {item && (
          <span className="text-[15px] tabular-nums text-muted" aria-live="polite">
            {index + 1} z {live.length}
          </span>
        )}
      </div>

      <header>
        <h1 className="font-serif text-[34px] font-bold leading-tight">Przegląd dnia</h1>
        <p className="text-[15px] text-muted first-letter:uppercase">{isToday ? "dziś, " : ""}{formatDayLong(date)}</p>
      </header>

      {live.length > 0 && (
        <div className="flex gap-1" aria-hidden="true">
          {live.map((id, i) => (
            <span key={id} className={`h-1 flex-1 rounded-full ${i < index ? "bg-accent" : i === index ? "bg-control" : "bg-fill"}`} />
          ))}
        </div>
      )}

      {item ? (
        <Card item={item} onAnswer={answer} onExact={() => setSheetOpen(true)} />
      ) : (
        <Finished snapshot={snapshot} date={date} today={today} hadQueue={live.length > 0} />
      )}

      {item && index > 0 && (
        <button type="button" onClick={() => setIndex((i) => i - 1)} className={`${btnQuiet} self-center`}>
          ‹ Poprzedni nawyk
        </button>
      )}

      {!item && (
        <DayNote key={date} date={date} note={dayNote?.note ?? null} mood={dayNote?.mood ?? null} />
      )}

      {item && sheetOpen && (
        <EntrySheet
          open
          onClose={() => {
            setSheetOpen(false);
            next();
          }}
          habit={item.habit}
          plan={item.plan}
          entry={item.entry}
          date={date}
          today={today}
        />
      )}
    </main>
  );
}

function Card({ item, onAnswer, onExact }: { item: TodayItem; onAnswer: (a: "done" | "not" | "skip" | "slip" | "clean") => void; onExact: () => void }) {
  const { habit, plan, entry, week, state } = item;
  const unit = habit.kind === "duration" ? "min" : (habit.unit ?? "");
  const quit = habit.goal === "quit";
  const status = quit
    ? state === "missed"
      ? "Zaznaczona wpadka"
      : null
    : state === "done"
      ? "Zrobione"
      : state === "skipped"
        ? "Pominięte"
        : entry && habit.kind !== "check" && (entry.value ?? 0) > 0
          ? `Na razie ${formatNumber(entry.value ?? 0)} z ${formatNumber(plan.targetValue)} ${unit}`
          : null;

  return (
    <section aria-live="polite" className="flex flex-1 flex-col items-center justify-center gap-6 rounded-2xl bg-surface px-5 py-8 text-center">
      <HabitBadge icon={habit.icon} color={habit.color} name={habit.name} size="lg" />
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-[28px] font-bold leading-tight">{habit.name}</h2>
        <p className="text-[15px] text-muted">
          {quit
            ? "Był dziś czysty dzień?"
            : week
              ? `${week.done} z ${week.required || plan.timesPerWeek} w tym tygodniu`
              : habit.kind === "check"
                ? "Zrobione?"
                : `Cel: ${formatNumber(plan.targetValue)} ${unit}`}
        </p>
        {status && <p className="text-[13px] font-semibold text-accent">{status}</p>}
      </div>

      <div className="grid w-full grid-cols-2 gap-3">
        {quit ? (
          <>
            <button type="button" onClick={() => onAnswer("slip")} className={btnSecondary}>
              <span className="text-danger">Wpadka</span>
            </button>
            <button type="button" onClick={() => onAnswer("clean")} className={btnPrimary}>
              Czysto
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => onAnswer("not")} className={btnSecondary}>
              Nie dziś
            </button>
            <button type="button" onClick={() => onAnswer("done")} className={btnPrimary}>
              Zrobione
            </button>
          </>
        )}
      </div>

      {!quit && (
        <div className="flex flex-wrap items-center justify-center gap-x-4">
          {habit.kind !== "check" && (
            <button type="button" onClick={onExact} className={btnQuiet}>
              Wpisz ile
            </button>
          )}
          <button type="button" onClick={() => onAnswer("skip")} className={btnQuiet}>
            Pomiń (nie liczy się)
          </button>
        </div>
      )}
    </section>
  );
}

function Finished({ snapshot, date, today, hadQueue }: { snapshot: Snapshot; date: LocalDate; today: LocalDate; hadQueue: boolean }) {
  const view = buildDay(snapshot.habits, snapshot.entries, snapshot.pauses, date, today, snapshot.settings.weekStart);
  const { done, total } = view.progress;
  return (
    <section className="flex flex-col items-center gap-2 rounded-2xl bg-surface px-5 py-8 text-center">
      <p className="font-serif text-[28px] font-bold">{hadQueue ? "Dzień domknięty" : "Nic nie czeka"}</p>
      <p className="text-[15px] text-muted">
        {total > 0 ? `Zrobione ${done} z ${total} wymaganych.` : "Tego dnia nic nie było wymagane."}
        {hadQueue ? "" : " Wszystko na ten dzień jest już odhaczone."}
      </p>
      <Link href="/" className={`${btnPrimary} mt-2 w-full`}>
        Gotowe
      </Link>
    </section>
  );
}
