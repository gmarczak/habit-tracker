"use client";

import { useMemo, type ReactNode } from "react";
import type { Snapshot } from "@/lib/data/snapshot";
import { addDays, type LocalDate } from "@/lib/domain/dates";
import { dayProgress } from "@/lib/domain/today";
import { dayOfMonth, formatDayLong, formatWeekdayShort } from "@/lib/format";

type Props = { today: LocalDate; selected: LocalDate; onSelect: (date: LocalDate) => void; snapshot: Snapshot };

/** Ostatnie 7 dni z pierścieniem postępu każdego dnia; dotknięcie = uzupełnianie wstecz. */
export function WeekStrip({ today, selected, onSelect, snapshot }: Props) {
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((date) => {
      const { done, total } = dayProgress(snapshot.habits, snapshot.entries, snapshot.pauses, date);
      return { date, done, total };
    });
  }, [today, snapshot]);

  return (
    <nav aria-label="Ostatnie 7 dni" className="grid grid-cols-7 gap-1">
      {days.map(({ date, done, total }) => {
        const active = date === selected;
        const complete = total > 0 && done === total;
        return (
          <button
            key={date}
            type="button"
            onClick={() => onSelect(date)}
            aria-pressed={active}
            aria-label={`${formatDayLong(date)}${total > 0 ? `, ${done} z ${total}` : ""}${complete ? ", wszystko zrobione" : ""}`}
            className="flex flex-col items-center gap-1 py-1"
          >
            <span className={`text-[11px] font-semibold uppercase ${date === today ? "text-accent" : "text-muted"}`}>{formatWeekdayShort(date)}</span>
            <DayRing done={done} total={total} active={active}>
              {dayOfMonth(date)}
            </DayRing>
          </button>
        );
      })}
    </nav>
  );
}

/** Dzień jak w Aktywności: pierścień postępu wokół numeru; pełny = zielony, wybrany dzień wypełniony. */
function DayRing({ done, total, active, children }: { done: number; total: number; active: boolean; children: ReactNode }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const share = total === 0 ? 0 : done / total;
  const complete = total > 0 && done === total;
  return (
    <span className="relative flex h-10 w-10 items-center justify-center">
      <svg aria-hidden="true" viewBox="0 0 40 40" className="absolute inset-0 h-10 w-10">
        {active && <circle cx="20" cy="20" r="15" fill="var(--accent)" />}
        {total > 0 && (
          <>
            <circle cx="20" cy="20" r={r} fill="none" stroke="var(--dot-off)" strokeOpacity="0.6" strokeWidth="3" />
            <circle
              cx="20"
              cy="20"
              r={r}
              fill="none"
              stroke={complete ? "var(--c-green-bg)" : "var(--accent)"}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${share * c} ${c}`}
              transform="rotate(-90 20 20)"
            />
          </>
        )}
      </svg>
      <span className={`relative text-[15px] tabular-nums ${active ? "font-semibold text-accent-contrast" : "font-medium"}`}>{children}</span>
    </span>
  );
}
