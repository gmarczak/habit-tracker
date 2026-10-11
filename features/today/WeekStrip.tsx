"use client";

import { useMemo } from "react";
import type { Snapshot } from "@/lib/data/snapshot";
import { addDays, type LocalDate } from "@/lib/domain/dates";
import { buildDay } from "@/lib/domain/today";
import { dayOfMonth, formatDayLong, formatWeekdayShort } from "@/lib/format";

type Props = { today: LocalDate; selected: LocalDate; onSelect: (date: LocalDate) => void; snapshot: Snapshot };

/** Ostatnie 7 dni; kropka = dzień domknięty, dotknięcie = uzupełnianie wstecz. */
export function WeekStrip({ today, selected, onSelect, snapshot }: Props) {
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((date) => {
      const { progress } = buildDay(snapshot.habits, snapshot.entries, snapshot.pauses, date, today, snapshot.settings.weekStart);
      return { date, complete: progress.total > 0 && progress.done === progress.total, empty: progress.total === 0 };
    });
  }, [today, snapshot]);

  return (
    <nav aria-label="Ostatnie 7 dni" className="grid grid-cols-7 gap-1.5">
      {days.map(({ date, complete, empty }) => {
        const active = date === selected;
        return (
          <button
            key={date}
            type="button"
            onClick={() => onSelect(date)}
            aria-pressed={active}
            aria-label={`${formatDayLong(date)}${complete ? ", wszystko zrobione" : ""}`}
            className={`flex flex-col items-center gap-1.5 rounded-[14px] py-2 ${active ? "bg-surface" : ""}`}
          >
            <span className={`text-[11px] ${active ? "font-bold text-text" : "font-semibold text-muted"}`}>{formatWeekdayShort(date)}</span>
            <span className={`text-[15px] ${active ? "font-bold" : "font-semibold"}`}>{dayOfMonth(date)}</span>
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${empty ? "bg-transparent" : complete ? "bg-accent" : active ? "bg-text" : "bg-dot-off"}`}
            />
          </button>
        );
      })}
    </nav>
  );
}
