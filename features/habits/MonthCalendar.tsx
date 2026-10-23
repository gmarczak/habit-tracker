"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { btnDanger, btnSecondary } from "@/components/ui/styles";
import { EntrySheet } from "@/features/today/EntrySheet";
import { useEntryMutation } from "@/lib/data/hooks";
import { addDays, eachDay, startOfWeek, type LocalDate, type WeekStart } from "@/lib/domain/dates";
import type { Entry, Habit, Pause } from "@/lib/domain/model";
import { dayState, type DayState } from "@/lib/domain/progress";
import { planOn } from "@/lib/domain/schedule";
import { formatDayLong } from "@/lib/format";

const STATE_LABEL: Record<DayState, string> = {
  done: "zrobione",
  partial: "częściowo",
  skipped: "pominięte",
  missed: "niezrobione",
  pending: "do zrobienia",
  paused: "pauza",
  not_required: "niewymagane",
  before_start: "przed startem",
  future: "",
  open: "bez wykonania",
};

function stateLabel(state: DayState, quit: boolean): string {
  if (quit && state === "done") return "czysto";
  if (quit && state === "missed") return "wpadka";
  return STATE_LABEL[state];
}

/** Dzień nawyku „rzucam”: zaznacz albo cofnij wpadkę (tak jak na ekranie Dziś). */
function QuitDaySheet({ habit, date, slipped, onClose }: { habit: Habit; date: LocalDate; slipped: boolean; onClose: () => void }) {
  const mutation = useEntryMutation();
  return (
    <Modal open onClose={onClose} title={habit.name} subtitle={formatDayLong(date)}>
      <div className="flex flex-col gap-3">
        <p className="text-[15px] text-muted">{slipped ? "Tego dnia zaznaczona jest wpadka." : "Ten dzień jest czysty."}</p>
        {slipped ? (
          <button
            type="button"
            className={btnSecondary}
            onClick={() => {
              mutation.mutate({ habitId: habit.id, date, kind: "clear" });
              onClose();
            }}
          >
            Cofnij wpadkę — czysty dzień
          </button>
        ) : (
          <button
            type="button"
            className={btnDanger}
            onClick={() => {
              mutation.mutate({ habitId: habit.id, date, kind: "set", value: 1 });
              onClose();
            }}
          >
            Zaznacz wpadkę
          </button>
        )}
      </div>
    </Modal>
  );
}

const MONTHS = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];

function cellClass(state: DayState): string {
  switch (state) {
    case "done":
      return "bg-accent text-accent-contrast font-bold";
    case "partial":
      return "border-2 border-accent text-text font-semibold";
    case "missed":
      return "border-[1.5px] border-control text-muted";
    case "pending":
      return "border-2 border-dashed border-control text-text";
    case "skipped":
    case "paused":
      return "bg-fill text-muted";
    default:
      return "text-muted";
  }
}

/** `today` – do którego dnia liczyć (dla archiwum: dzień archiwizacji); `appToday` – prawdziwe dziś aplikacji. */
type Props = { habit: Habit; entries: readonly Entry[]; pauses: readonly Pause[]; today: LocalDate; appToday?: LocalDate; weekStart: WeekStart };

/** Miesiąc w siatce; dotknięcie dnia (od startu do dziś) otwiera arkusz dnia („rzucam”: wpadka albo czysty dzień). */
export function MonthCalendar({ habit, entries, pauses, today, appToday = today, weekStart }: Props) {
  const quit = habit.goal === "quit";
  const [month, setMonth] = useState(today.slice(0, 7)); // "YYYY-MM"
  const [editing, setEditing] = useState<LocalDate | null>(null);

  const cells = useMemo(() => {
    const first = `${month}-01`;
    const [y, m] = month.split("-").map(Number) as [number, number];
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const last = `${month}-${String(lastDay).padStart(2, "0")}`;
    const gridStart = startOfWeek(first, weekStart);
    const lead = eachDay(gridStart, addDays(first, -1)).map(() => null);
    return [...lead, ...eachDay(first, last).map((d) => ({ date: d, state: dayState(habit, entries, pauses, d, today) }))];
  }, [month, habit, entries, pauses, today, weekStart]);

  const shift = (delta: number) => {
    const [y, m] = month.split("-").map(Number) as [number, number];
    const t = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(`${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  const [y, m] = month.split("-").map(Number) as [number, number];
  const canNext = month < today.slice(0, 7);
  const canPrev = month > habit.startDate.slice(0, 7);
  const heads = weekStart === 1 ? ["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"] : ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "Sb"];

  const editingPlan = editing ? planOn(habit, editing) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button type="button" aria-label="Poprzedni miesiąc" disabled={!canPrev} onClick={() => shift(-1)} className="h-11 w-11 rounded-full text-xl disabled:opacity-30">
          ‹
        </button>
        <span className="font-semibold capitalize" aria-live="polite">
          {MONTHS[m - 1]} {y}
        </span>
        <button type="button" aria-label="Następny miesiąc" disabled={!canNext} onClick={() => shift(1)} className="h-11 w-11 rounded-full text-xl disabled:opacity-30">
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center" role="grid" aria-label="Kalendarz nawyku">
        {heads.map((h) => (
          <span key={h} className="pb-1 text-[11px] font-semibold text-muted" role="columnheader">
            {h}
          </span>
        ))}
        {cells.map((cell, i) =>
          cell === null ? (
            <span key={`empty-${i}`} />
          ) : (
            <button
              key={cell.date}
              type="button"
              disabled={cell.state === "future" || cell.state === "before_start"}
              onClick={() => setEditing(cell.date)}
              aria-label={`${formatDayLong(cell.date)}${stateLabel(cell.state, quit) ? `, ${stateLabel(cell.state, quit)}` : ""}`}
              className={`mx-auto flex aspect-square w-full max-w-11 items-center justify-center rounded-full text-sm ${cellClass(cell.state)} ${
                cell.date === today ? "ring-2 ring-text ring-offset-2 ring-offset-bg" : ""
              }`}
            >
              {Number(cell.date.slice(8))}
            </button>
          ),
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legenda">
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-accent" /> {quit ? "czysto" : "zrobione"}
        </li>
        {!quit && (
          <li className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border-2 border-accent" /> częściowo
          </li>
        )}
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-fill" /> pominięte / pauza
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full border-[1.5px] border-control" /> {quit ? "wpadka" : "niezrobione"}
        </li>
      </ul>
      {editing && quit && (
        <QuitDaySheet
          habit={habit}
          date={editing}
          slipped={dayState(habit, entries, pauses, editing, today) === "missed"}
          onClose={() => setEditing(null)}
        />
      )}
      {editing && !quit && editingPlan && (
        <EntrySheet
          open
          onClose={() => setEditing(null)}
          habit={habit}
          plan={editingPlan}
          entry={entries.find((e) => e.habitId === habit.id && e.date === editing)}
          date={editing}
          today={appToday}
        />
      )}
    </div>
  );
}
