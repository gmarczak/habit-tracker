"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DataFallback } from "@/components/ui/DataFallback";
import { useToast } from "@/components/ui/Toast";
import { btnQuiet, btnSecondarySm, groupHeader } from "@/components/ui/styles";
import { EntrySheet } from "@/features/today/EntrySheet";
import { clearTimer } from "@/features/today/HabitTimer";
import { useAction, useEntryMutation, useSnapshot, useToday } from "@/lib/data/hooks";
import { LIGHTER_REASON, addPause, changeTarget, deletePause, withPause, withoutPause } from "@/lib/data/mutations";
import type { Snapshot } from "@/lib/data/snapshot";
import { addDays, eachDay, startOfWeek, type LocalDate } from "@/lib/domain/dates";
import { unitOf, type Habit, type Plan } from "@/lib/domain/model";
import { dayState, type DayState } from "@/lib/domain/progress";
import { entriesByDate, planOn, requirementOn } from "@/lib/domain/schedule";
import { dayProgress } from "@/lib/domain/today";
import { dayOfMonth, formatDayLong, formatNumber, formatWeekdayShort } from "@/lib/format";
import { HabitBadge } from "@/lib/ui/icons";

const LONG_PRESS_MS = 450;

/**
 * Siatka tygodnia: nawyki w wierszach, ostatnie 7 dni w kolumnach. Kilka dni nadrabia się stukając w kratki,
 * zamiast przeklikiwać każdy dzień osobno. Na dole propozycje „na lżej” dla nawyków, które w tym tygodniu nie szły.
 */
export function WeekGrid() {
  const { data: snapshot, isPending, refetch } = useSnapshot();
  const today = useToday(snapshot);
  if (!snapshot || !today) return <DataFallback pending={isPending} onRetry={() => void refetch()} />;
  return <Grid snapshot={snapshot} today={today} />;
}

type Sheet = { habit: Habit; date: LocalDate };

function Grid({ snapshot, today }: { snapshot: Snapshot; today: LocalDate }) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const days = eachDay(addDays(today, -6), today);
  const active = snapshot.habits.filter((h) => h.archivedAt === null && h.startDate <= today).sort((a, b) => a.sortOrder - b.sortOrder);
  const build = active.filter((h) => h.goal === "build");
  const quit = active.filter((h) => h.goal === "quit");

  // Bilans 7 dni jak pierścień dnia; dzisiejsze otwarte jeszcze nie obniżają wyniku
  const totals = days.map((d) => ({ d, ...dayProgress(snapshot.habits, snapshot.entries, snapshot.pauses, d, true) }));
  const done = totals.reduce((s, t) => s + t.done, 0);
  const total = totals.reduce((s, t) => s + (t.d === today ? t.done : t.total), 0);

  const sheetPlan = sheet ? planOn(sheet.habit, sheet.date) : null;

  return (
    <main className="flex flex-col gap-4 px-4 pt-4 pb-6">
      <Link href="/" className="-ml-1 flex h-11 items-center gap-1 self-start text-[17px] text-accent">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        Dziś
      </Link>

      <header>
        <h1 className="font-serif text-[34px] font-bold leading-tight">Tydzień</h1>
        <p className="text-[15px] text-muted">
          {total > 0 ? `Ostatnie 7 dni: ${done} z ${total} wymaganych (${Math.round((done / total) * 100)}%)` : "Ostatnie 7 dni"}
        </p>
      </header>

      <p className="text-[13px] text-muted">Stuknij kratkę: zrobione → nie → puste. Przytrzymaj, żeby wpisać dokładnie albo pominąć.</p>

      <div className="rounded-xl bg-surface px-3 py-2">
        <div className="grid grid-cols-7 gap-1 pb-1" aria-hidden="true">
          {days.map((d) => (
            <div key={d} className={`flex flex-col items-center text-[11px] font-semibold ${d === today ? "text-accent" : "text-muted"}`}>
              <span>{formatWeekdayShort(d)}</span>
              <span className="text-[15px] tabular-nums">{dayOfMonth(d)}</span>
            </div>
          ))}
        </div>
        {build.map((h) => (
          <HabitWeek key={h.id} habit={h} days={days} today={today} snapshot={snapshot} onLong={(date) => setSheet({ habit: h, date })} />
        ))}
        {quit.length > 0 && (
          <>
            <h2 className={`${groupHeader} -mx-1 pt-3`}>Rzucam · stuknij dzień z wpadką</h2>
            {quit.map((h) => (
              <HabitWeek key={h.id} habit={h} days={days} today={today} snapshot={snapshot} onLong={() => {}} />
            ))}
          </>
        )}
        {build.length + quit.length === 0 && <p className="py-4 text-center text-muted">Nie masz jeszcze aktywnych nawyków.</p>}
      </div>

      <Lighter snapshot={snapshot} today={today} days={days} />

      {sheet && sheetPlan && (
        <EntrySheet
          open
          onClose={() => setSheet(null)}
          habit={sheet.habit}
          plan={sheetPlan}
          entry={entriesByDate(snapshot.entries, sheet.habit.id).get(sheet.date)}
          date={sheet.date}
          today={today}
        />
      )}
    </main>
  );
}

const INACTIVE: readonly DayState[] = ["before_start", "not_required", "paused", "future"];

function HabitWeek({ habit, days, today, snapshot, onLong }: { habit: Habit; days: LocalDate[]; today: LocalDate; snapshot: Snapshot; onLong: (date: LocalDate) => void }) {
  const byDate = entriesByDate(snapshot.entries, habit.id);
  const states = days.map((d) => dayState(habit, snapshot.entries, snapshot.pauses, d, today));
  const quit = habit.goal === "quit";
  const doneCount = states.filter((s) => s === "done").length;
  const counted = states.filter((s) => !INACTIVE.includes(s) && s !== "skipped").length;
  // Plan „X razy w tygodniu”: licznik względem X, nie 7 dni
  const weekly = planOn(habit, today)?.frequency === "weekly_count" ? (planOn(habit, today)?.timesPerWeek ?? null) : null;
  return (
    <div className="border-t-[0.5px] border-border py-2 first-of-type:border-t-0">
      <div className="flex items-center gap-2 pb-1.5">
        <HabitBadge icon={habit.icon} color={habit.color} name={habit.name} size="sm" />
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{habit.name}</span>
        {!quit && (weekly !== null || counted > 0) && <span className="text-[13px] tabular-nums text-muted">{`${doneCount}/${weekly ?? counted}`}</span>}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d, i) => (
          <Cell key={d} habit={habit} date={d} state={states[i]!} entry={byDate.get(d)} onLong={() => onLong(d)} />
        ))}
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}

function Cell({
  habit,
  date,
  state,
  entry,
  onLong,
}: {
  habit: Habit;
  date: LocalDate;
  state: DayState;
  entry: { value: number | null; skipped: boolean } | undefined;
  onLong: () => void;
}) {
  const mutation = useEntryMutation();
  const timer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const quit = habit.goal === "quit";
  const inactive = INACTIVE.includes(state);
  const saidNo = !quit && !!entry && !entry.skipped && (entry.value ?? 0) === 0;
  const plan = planOn(habit, date);

  function tap() {
    const base = { habitId: habit.id, date };
    if (quit) return mutation.mutate(state === "missed" ? { ...base, kind: "clear" } : { ...base, kind: "set", value: 1 });
    // zrobione → nie (wpis 0) → puste → zrobione; w planie tygodniowym „nie” nic nie znaczy: zrobione ↔ puste
    if (state === "done") return mutation.mutate(plan?.frequency === "weekly_count" ? { ...base, kind: "clear" } : { ...base, kind: "set", value: 0 });
    if (saidNo) return mutation.mutate({ ...base, kind: "clear" });
    if (habit.kind === "duration") clearTimer(habit.id, date);
    mutation.mutate({ ...base, kind: "set", value: habit.kind === "check" ? 1 : (plan?.targetValue ?? 1) });
  }

  const label = quit
    ? state === "missed"
      ? "wpadka"
      : inactive
        ? "nie dotyczy"
        : "czysto"
    : state === "done"
      ? "zrobione"
      : state === "partial"
        ? `częściowo, ${formatNumber(entry?.value ?? 0)}`
        : state === "skipped"
          ? "pominięte"
          : saidNo
            ? "nie"
            : inactive
              ? state === "paused"
                ? "pauza"
                : "nie dotyczy"
              : "puste";

  if (inactive) {
    return (
      <span role="img" aria-label={`${habit.name}, ${formatDayLong(date)}: ${label}`} className="flex h-10 items-center justify-center">
        <span className={`h-1.5 w-1.5 rounded-full ${state === "paused" ? "bg-control" : "bg-fill"}`} />
      </span>
    );
  }

  const look = quit
    ? state === "missed"
      ? "bg-danger text-white"
      : "bg-fill text-muted"
    : state === "done"
      ? "bg-accent text-accent-contrast"
      : state === "partial"
        ? "border-2 border-accent text-accent text-[11px] font-bold"
        : state === "skipped"
          ? "border-[1.5px] border-control text-muted"
          : saidNo
            ? "bg-fill text-muted"
            : "border-2 border-control";

  return (
    <button
      type="button"
      aria-label={`${habit.name}, ${formatDayLong(date)}: ${label}`}
      onClick={() => {
        if (!longPressed.current) tap();
      }}
      onPointerDown={() => {
        longPressed.current = false;
        if (quit) return;
        timer.current = window.setTimeout(() => {
          longPressed.current = true;
          onLong();
        }, LONG_PRESS_MS);
      }}
      onPointerUp={() => timer.current !== null && window.clearTimeout(timer.current)}
      onPointerLeave={() => timer.current !== null && window.clearTimeout(timer.current)}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!quit) onLong();
      }}
      className="flex h-10 select-none items-center justify-center"
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-full text-[15px] font-bold transition-colors ${look}`}>
        {quit ? (state === "missed" ? "!" : <CheckIcon />) : state === "done" ? <CheckIcon /> : state === "partial" ? formatNumber(entry?.value ?? 0) : state === "skipped" ? "–" : saidNo ? "×" : null}
      </span>
    </button>
  );
}

// ---------- na lżej ----------

const LIGHTER_KEY = "lighter-dismissed";

type Weak = { habit: Habit; plan: Plan; done: number; required: number };

/**
 * Codzienne „buduję”, które w tym tygodniu szły słabo (poniżej połowy, licząc tylko dni z jakimkolwiek zapisem,
 * żeby cisza w aplikacji nie udawała porażki). Zamiast archiwum: mniejszy cel albo tydzień pauzy.
 */
function weakHabits(snapshot: Snapshot, today: LocalDate, days: LocalDate[]): Weak[] {
  const logged = new Set<LocalDate>([...snapshot.entries.map((e) => e.date), ...snapshot.notes.map((n) => n.date)]);
  const past = days.filter((d) => d < today && logged.has(d));
  const out: Weak[] = [];
  for (const habit of snapshot.habits) {
    const plan = planOn(habit, today);
    if (habit.archivedAt !== null || habit.goal !== "build" || !plan || unitOf(plan.frequency) !== "days") continue;
    let required = 0;
    let done = 0;
    for (const d of past) {
      if (requirementOn(habit, snapshot.pauses, d) !== "required") continue;
      const state = dayState(habit, snapshot.entries, snapshot.pauses, d, today);
      if (state === "skipped") continue;
      required++;
      if (state === "done") done++;
    }
    if (required >= 3 && done / required < 0.5) out.push({ habit, plan, done, required });
  }
  return out;
}

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LIGHTER_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function smallerTarget(plan: Plan): number {
  return Math.max(1, Math.round(plan.targetValue * 0.6));
}

function Lighter({ snapshot, today, days }: { snapshot: Snapshot; today: LocalDate; days: LocalDate[] }) {
  const [dismissed, setDismissed] = useState<string[] | null>(null);
  const toast = useToast();
  const week = startOfWeek(today, snapshot.settings.weekStart);
  const undoPause = useAction((s, id: string) => deletePause(s, id), withoutPause, { toastErrors: true });
  const pause = useAction(
    (s, habitId: string) => addPause(s, { habitId, startDate: today, endDate: addDays(today, 6), reason: LIGHTER_REASON }),
    (snap, habitId: string) => withPause(snap, { habitId, startDate: today, endDate: addDays(today, 6), reason: LIGHTER_REASON }),
    { toastErrors: true },
  );
  const target = useAction((s, v: { habitId: string; plan: Plan; value: number }) => changeTarget(s, v.habitId, v.plan, v.value), undefined, { toastErrors: true });

  useEffect(() => {
    const id = window.setTimeout(() => setDismissed(readDismissed()), 0);
    return () => window.clearTimeout(id);
  }, []);

  if (dismissed === null) return null;
  const weak = weakHabits(snapshot, today, days).filter((w) => !dismissed.includes(`${w.habit.id}:${week}`));
  if (weak.length === 0) return null;

  function keep(habitId: string) {
    const next = [...new Set([...readDismissed(), `${habitId}:${week}`])].slice(-50);
    try {
      localStorage.setItem(LIGHTER_KEY, JSON.stringify(next));
    } catch {
      // bez pamięci przeglądarki karta wróci po odświeżeniu
    }
    setDismissed(next);
  }

  return (
    <section aria-labelledby="lighter-title" className="flex flex-col gap-2">
      <h2 id="lighter-title" className={groupHeader}>
        Na lżej
      </h2>
      {weak.map(({ habit, plan, done, required }) => {
        const unit = habit.kind === "duration" ? "min" : (habit.unit ?? "");
        const smaller = smallerTarget(plan);
        return (
          <div key={habit.id} className="flex flex-col gap-3 rounded-xl bg-surface p-4">
            <div className="flex items-center gap-3">
              <HabitBadge icon={habit.icon} color={habit.color} name={habit.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-semibold">{habit.name}</p>
                <p className="text-[13px] text-muted">{`${done} z ${required} w dniach z zapisem. Za dużo na teraz?`}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {habit.kind !== "check" && smaller < plan.targetValue && (
                <button
                  type="button"
                  disabled={target.isPending}
                  onClick={() =>
                    target.mutate(
                      { habitId: habit.id, plan, value: smaller },
                      {
                        onSuccess: () => {
                          keep(habit.id);
                          toast({
                            message: `${habit.name}: cel ${formatNumber(smaller)} ${unit} od dziś`,
                            actionLabel: "Cofnij",
                            onAction: () => target.mutate({ habitId: habit.id, plan, value: plan.targetValue }),
                          });
                        },
                      },
                    )
                  }
                  className={btnSecondarySm}
                >
                  {`Mniejszy cel ${formatNumber(plan.targetValue)} → ${formatNumber(smaller)} ${unit}`.trim()}
                </button>
              )}
              <button
                type="button"
                disabled={pause.isPending}
                onClick={() =>
                  pause.mutate(habit.id, {
                    onSuccess: (id) => {
                      keep(habit.id);
                      toast({ message: `${habit.name}: tydzień pauzy, seria czeka`, actionLabel: "Cofnij", onAction: () => undoPause.mutate(id) });
                    },
                  })
                }
                className={btnSecondarySm}
              >
                Tydzień pauzy
              </button>
              <button type="button" onClick={() => keep(habit.id)} className={btnQuiet}>
                Zostaw
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
