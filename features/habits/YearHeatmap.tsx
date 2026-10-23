"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { addDays, startOfWeek, type LocalDate, type WeekStart } from "@/lib/domain/dates";
import type { Entry, Habit, Pause } from "@/lib/domain/model";
import { dayState } from "@/lib/domain/progress";
import { plural } from "@/lib/format";

type Props = { habit: Habit; entries: readonly Entry[]; pauses: readonly Pause[]; today: LocalDate; weekStart: WeekStart };

const FILL: Record<string, string> = {
  done: "var(--accent)",
  partial: "color-mix(in srgb, var(--accent) 45%, transparent)",
  missed: "var(--dot-off)",
  pending: "var(--dot-off)",
};

/** Ostatnie 53 tygodnie, kolumna = tydzień. Kolor tylko dla dni wymaganych lub z wykonaniem. */
export function YearHeatmap({ habit, entries, pauses, today, weekStart }: Props) {
  const { weeks, doneCount } = useMemo(() => {
    const first = addDays(startOfWeek(today, weekStart), -52 * 7);
    let done = 0;
    const cols = Array.from({ length: 53 }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => {
        const date = addDays(first, w * 7 + d);
        const state = dayState(habit, entries, pauses, date, today);
        if (state === "done") done++;
        return { date, state };
      }),
    );
    return { weeks: cols, doneCount: done };
  }, [habit, entries, pauses, today, weekStart]);

  // Najnowsze tygodnie widoczne od razu — tylko przy pierwszym pokazaniu i zmianie dnia, nie przy każdym odświeżeniu
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [today]);
  const summary = `${doneCount} ${plural(doneCount, "dzień", "dni", "dni")} ${habit.goal === "quit" ? "bez wpadki" : plural(doneCount, "zrobiony", "zrobione", "zrobionych")}`;

  return (
    <figure className="flex flex-col gap-2">
      <div ref={scroller} className="overflow-x-auto pb-1" role="img" aria-label={`Ostatni rok: ${summary}`}>
        <div className="flex w-max gap-[3px]">
          {weeks.map((col, i) => (
            <div key={i} className="flex flex-col gap-[3px]">
              {col.map((cell) => (
                <span
                  key={cell.date}
                  className="block h-[11px] w-[11px] rounded-[3px]"
                  style={{ background: FILL[cell.state] ?? "var(--fill)", opacity: cell.state === "future" ? 0 : 1 }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <figcaption className="text-xs text-muted">Ostatnie 12 miesięcy · {summary}</figcaption>
    </figure>
  );
}
