"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DataFallback } from "@/components/ui/DataFallback";
import { btnPrimary, btnQuiet, btnSecondary } from "@/components/ui/styles";
import { DayNote, MOODS } from "@/features/today/DayNote";
import { EntrySheet } from "@/features/today/EntrySheet";
import { clearTimer } from "@/features/today/HabitTimer";
import { useMarkAllDone } from "@/features/today/markAll";
import { useAction, useEntryMutation, useSnapshot, useToday } from "@/lib/data/hooks";
import { saveDayNote, withDayNote, type DayNoteInput } from "@/lib/data/mutations";
import type { Snapshot } from "@/lib/data/snapshot";
import { addDays, isLocalDate, type LocalDate } from "@/lib/domain/dates";
import { awaitsAnswer, buildDay, type TodayItem } from "@/lib/domain/today";
import { formatDayLong, formatNumber } from "@/lib/format";
import { HabitBadge } from "@/lib/ui/icons";

/** Jak daleko wstecz da się domknąć dzień (starsze dni zamyka „To była przerwa” albo siatka tygodnia). */
const MAX_DAYS_BACK = 13;

/**
 * Przegląd dnia: najpierw „Wszystko zrobione” albo „Po kolei”, potem nawyki jeden po drugim,
 * wszystkie „rzucam” na jednej karcie i na koniec nastrój jednym dotknięciem.
 * Rano za wczoraj (z powiadomienia) zamyka dzień w kilka sekund.
 */
export function DayReview({ dateParam }: { dateParam: string | null }) {
  const { data: snapshot, isPending, refetch } = useSnapshot();
  const today = useToday(snapshot);
  if (!snapshot || !today) return <DataFallback pending={isPending} onRetry={() => void refetch()} />;
  const date = dateParam && isLocalDate(dateParam) && dateParam <= today && dateParam >= addDays(today, -MAX_DAYS_BACK) ? dateParam : today;
  return <Review key={date} snapshot={snapshot} date={date} today={today} />;
}

type Step = { kind: "habit"; id: string } | { kind: "quit" } | { kind: "mood" };

/**
 * Kolejka ustalona na wejściu: odpowiedź nie przestawia kart (zrobiony nawyk nie znika spod palca).
 * Tylko nawyki bez odpowiedzi: najpierw codzienne (dziś wieczorne na koniec), potem plany tygodniowe,
 * które „Wszystko zrobione” pomija. Nastrój tylko, gdy jeszcze go nie ma.
 */
function queueOf(snapshot: Snapshot, date: LocalDate, today: LocalDate): { build: string[]; daily: number; quit: string[]; mood: boolean } {
  const view = buildDay(snapshot.habits, snapshot.entries, snapshot.pauses, date, today, snapshot.settings.weekStart);
  const isToday = date === today;
  const rank = (i: TodayItem) => (i.week ? 2 : isToday && i.habit.timeOfDay === "evening" ? 1 : 0);
  const build = [...view.todo, ...view.thisWeek].filter((i) => awaitsAnswer(i, isToday)).sort((a, b) => rank(a) - rank(b));
  const mood = snapshot.notes.find((n) => n.date === date)?.mood ?? null;
  return {
    build: build.map((i) => i.habit.id),
    daily: build.filter((i) => !i.week).length,
    quit: view.quit.filter((i) => !i.entry).map((i) => i.habit.id),
    mood: mood === null,
  };
}

function dayLabel(date: LocalDate, today: LocalDate): string {
  if (date === today) return "Dziś";
  if (date === addDays(today, -1)) return "Wczoraj";
  return formatDayLong(date);
}

function names(items: readonly TodayItem[]): string {
  const list = items.map((i) => i.habit.name);
  return list.length <= 4 ? list.join(", ") : `${list.slice(0, 4).join(", ")} i ${list.length - 4} więcej`;
}

function Review({ snapshot, date, today }: { snapshot: Snapshot; date: LocalDate; today: LocalDate }) {
  const [queue] = useState(() => queueOf(snapshot, date, today));
  const [started, setStarted] = useState(queue.daily < 2);
  const [index, setIndex] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const mutation = useEntryMutation();
  const markAllDone = useMarkAllDone();
  const isToday = date === today;

  const view = useMemo(
    () => buildDay(snapshot.habits, snapshot.entries, snapshot.pauses, date, today, snapshot.settings.weekStart),
    [snapshot, date, today],
  );
  const items = new Map([...view.todo, ...view.thisWeek, ...view.done, ...view.quit].map((i) => [i.habit.id, i]));
  // Nawyk usunięty albo zarchiwizowany w trakcie przeglądu po prostu wypada z kolejki
  const buildItems = queue.build.flatMap((id) => items.get(id) ?? []);
  const quitItems = queue.quit.flatMap((id) => items.get(id) ?? []);
  const steps: Step[] = [
    ...buildItems.map((i) => ({ kind: "habit" as const, id: i.habit.id })),
    ...(quitItems.length > 0 ? [{ kind: "quit" as const }] : []),
    ...(queue.mood ? [{ kind: "mood" as const }] : []),
  ];
  const step = index < steps.length ? steps[index]! : null;
  const item = step?.kind === "habit" ? items.get(step.id)! : null;
  const next = () => setIndex((i) => i + 1);

  function answer(change: "done" | "not" | "skip" | "later") {
    if (!item) return;
    const { habit, plan, entry } = item;
    const base = { habitId: habit.id, date };
    if (change === "done") {
      if (habit.kind === "duration") clearTimer(habit.id, date);
      mutation.mutate({ ...base, kind: "set", value: habit.kind === "check" ? 1 : plan.targetValue });
    }
    // „Nie dziś” zapisuje odpowiedź (wpis 0, częściowy postęp zostaje): rano przegląd i powiadomienie już nie pytają
    if (change === "not") mutation.mutate({ ...base, kind: "set", value: entry && !entry.skipped ? (entry.value ?? 0) : 0 });
    if (change === "skip") mutation.mutate({ ...base, kind: "skip" });
    next();
  }

  // „Wszystko zrobione” odhacza codzienne; plany tygodniowe (np. 2× w tygodniu) przegląd zadaje potem osobno
  const daily = buildItems.filter((i) => !i.week);
  const weekly = buildItems.filter((i) => i.week);

  function allDone() {
    markAllDone(daily, date);
    setStarted(true);
    setIndex(daily.length);
  }

  const dayNote = snapshot.notes.find((n) => n.date === date);
  const showStart = !started && daily.length >= 2;

  return (
    <main className="flex min-h-[calc(100dvh-7rem)] flex-col gap-5 px-4 pt-4">
      <div className="flex items-center justify-between">
        <Link href="/" className="-ml-1 flex h-11 items-center gap-1 text-[17px] text-accent">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Dziś
        </Link>
        {step && !showStart && (
          <span className="text-[15px] tabular-nums text-muted" aria-live="polite">
            {index + 1} z {steps.length}
          </span>
        )}
      </div>

      <header>
        <h1 className="font-serif text-[34px] font-bold leading-tight">Przegląd dnia</h1>
        <p className="text-[15px] text-muted first-letter:uppercase">
          {isToday ? "dziś, " : ""}
          {formatDayLong(date)}
        </p>
      </header>

      {steps.length > 0 && !showStart && (
        <div className="flex gap-1" aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s.kind === "habit" ? s.id : s.kind} className={`h-1 flex-1 rounded-full ${i < index ? "bg-accent" : i === index ? "bg-control" : "bg-fill"}`} />
          ))}
        </div>
      )}

      {showStart ? (
        <StartCard label={dayLabel(date, today)} items={daily} later={weekly} onAllDone={allDone} onOneByOne={() => setStarted(true)} />
      ) : item ? (
        <Card item={item} isToday={isToday} onAnswer={answer} onExact={() => setSheetOpen(true)} />
      ) : step?.kind === "quit" ? (
        <QuitCard items={quitItems} date={date} isToday={isToday} onDone={next} />
      ) : step?.kind === "mood" ? (
        <MoodCard date={date} note={dayNote?.note ?? null} onDone={next} />
      ) : (
        <Finished snapshot={snapshot} date={date} today={today} hadQueue={steps.length > 0} />
      )}

      {step && !showStart && index > 0 && (
        <button type="button" onClick={() => setIndex((i) => i - 1)} className={`${btnQuiet} self-center`}>
          ‹ Wstecz
        </button>
      )}

      {!step && !showStart && <DayNote key={date} date={date} note={dayNote?.note ?? null} mood={dayNote?.mood ?? null} />}

      {item && sheetOpen && (
        <EntrySheet
          open
          onClose={() => setSheetOpen(false)}
          onSaved={next}
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

/** Pierwsza karta przy kilku nawykach: codzienne jednym dotknięciem (z „Cofnij”) albo po kolei. */
function StartCard({
  label,
  items,
  later,
  onAllDone,
  onOneByOne,
}: {
  label: string;
  items: readonly TodayItem[];
  later: readonly TodayItem[];
  onAllDone: () => void;
  onOneByOne: () => void;
}) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 rounded-2xl bg-surface px-5 py-8 text-center">
      <div className="flex flex-col gap-2">
        <h2 className="font-serif text-[28px] font-bold leading-tight">{label} do domknięcia</h2>
        <p className="text-[15px] text-muted">{names(items)}</p>
        {later.length > 0 && <p className="text-[13px] text-muted">{`Potem osobno: ${names(later)}`}</p>}
      </div>
      <div className="flex w-full flex-col gap-3">
        <button type="button" onClick={onAllDone} className={btnPrimary}>
          Wszystko zrobione
        </button>
        <button type="button" onClick={onOneByOne} className={btnSecondary}>
          Po kolei
        </button>
      </div>
      <p className="text-[13px] text-muted">Pomyłkę cofniesz z komunikatu na dole albo poprawisz na liście.</p>
    </section>
  );
}

function Card({
  item,
  isToday,
  onAnswer,
  onExact,
}: {
  item: TodayItem;
  isToday: boolean;
  onAnswer: (a: "done" | "not" | "skip" | "later") => void;
  onExact: () => void;
}) {
  const { habit, plan, entry, week, state } = item;
  const unit = habit.kind === "duration" ? "min" : (habit.unit ?? "");
  const status =
    state === "done"
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
          {week
            ? `${week.done} z ${week.required || plan.timesPerWeek} w tym tygodniu`
            : habit.kind === "check"
              ? "Zrobione?"
              : `Cel: ${formatNumber(plan.targetValue)} ${unit}`}
        </p>
        {(habit.cue || habit.why) && (
          <p className="line-clamp-2 text-[13px] text-muted">
            {[habit.cue && `${habit.cue.charAt(0).toUpperCase()}${habit.cue.slice(1)}`, habit.why && `„${habit.why}”`].filter(Boolean).join(" · ")}
          </p>
        )}
        {status && <p className="text-[13px] font-semibold text-accent">{status}</p>}
      </div>

      <div className="grid w-full grid-cols-2 gap-3">
        <button type="button" onClick={() => onAnswer("not")} className={btnSecondary}>
          Nie dziś
        </button>
        <button type="button" onClick={() => onAnswer("done")} className={btnPrimary}>
          Zrobione
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-4">
        {isToday && (
          <button type="button" onClick={() => onAnswer("later")} className={btnQuiet}>
            Jeszcze nie
          </button>
        )}
        {habit.kind !== "check" && (
          <button type="button" onClick={onExact} className={btnQuiet}>
            Wpisz ile
          </button>
        )}
        <button type="button" onClick={() => onAnswer("skip")} className={btnQuiet}>
          Pomiń (nie liczy się)
        </button>
      </div>
    </section>
  );
}

/** Wszystkie „rzucam” na jednej karcie: domyślnie czysto, wpadkę zaznacza się przy konkretnym nawyku. */
function QuitCard({ items, date, isToday, onDone }: { items: readonly TodayItem[]; date: LocalDate; isToday: boolean; onDone: () => void }) {
  const mutation = useEntryMutation();
  const [slips, setSlips] = useState<ReadonlySet<string>>(() => new Set(items.filter((i) => (i.entry?.value ?? 0) > 0).map((i) => i.habit.id)));

  function toggle(id: string) {
    setSlips((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function save() {
    // Czysty dzień zapisany jawnie (wpis 0): przegląd i powiadomienia nie pytają drugi raz
    for (const { habit } of items) mutation.mutate({ habitId: habit.id, date, kind: "set", value: slips.has(habit.id) ? 1 : 0 });
    onDone();
  }

  return (
    <section aria-live="polite" className="flex flex-1 flex-col justify-center gap-5 rounded-2xl bg-surface px-5 py-8">
      <h2 className="text-center font-serif text-[28px] font-bold leading-tight">{isToday ? "Dziś bez wpadki?" : "Bez wpadki?"}</h2>
      <ul className="flex flex-col">
        {items.map(({ habit }) => {
          const slipped = slips.has(habit.id);
          return (
            <li key={habit.id} className="flex items-center gap-3 border-b-[0.5px] border-border py-2.5 last:border-b-0">
              <HabitBadge icon={habit.icon} color={habit.color} name={habit.name} />
              <span className="min-w-0 flex-1 truncate text-[17px] font-medium">{habit.name}</span>
              <button
                type="button"
                aria-pressed={slipped}
                onClick={() => toggle(habit.id)}
                className={`inline-flex h-11 shrink-0 items-center justify-center rounded-full px-4 text-sm font-semibold ${slipped ? "bg-danger text-white" : "bg-fill text-danger"}`}
              >
                Wpadka
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={save} className={btnPrimary}>
        {slips.size === 0 ? "Wszystko czysto" : "Zapisz"}
      </button>
    </section>
  );
}

/** Nastrój jednym dotknięciem (do statystyk „co idzie w parze z lepszym dniem”); notatka potem, opcjonalnie. */
function MoodCard({ date, note, onDone }: { date: LocalDate; note: string | null; onDone: () => void }) {
  const save = useAction((s, input: DayNoteInput) => saveDayNote(s, input), withDayNote, { scope: "day-note", toastErrors: true });
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 rounded-2xl bg-surface px-5 py-8 text-center">
      <h2 className="font-serif text-[28px] font-bold leading-tight">Jak minął dzień?</h2>
      <div className="grid w-full grid-cols-5 gap-2" role="radiogroup" aria-label="Nastrój dnia">
        {MOODS.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={false}
            aria-label={label}
            onClick={() => {
              save.mutate({ date, text: note ?? "", mood: value });
              onDone();
            }}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl bg-fill text-text active:opacity-70"
          >
            <Icon size={30} strokeWidth={1.8} aria-hidden="true" />
            <span className="text-[11px] text-muted">{label}</span>
          </button>
        ))}
      </div>
      <button type="button" onClick={onDone} className={btnQuiet}>
        Pomiń
      </button>
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
        {hadQueue ? "" : " Na każdy nawyk jest już odpowiedź."}
      </p>
      <Link href="/" className={`${btnPrimary} mt-2 w-full`}>
        Gotowe
      </Link>
    </section>
  );
}
