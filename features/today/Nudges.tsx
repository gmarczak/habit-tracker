"use client";

import { useEffect, useState } from "react";
import { btnPrimary, btnQuiet, btnSecondary } from "@/components/ui/styles";
import { useAction } from "@/lib/data/hooks";
import { addDayOff, deletePause, withDayOff, withoutPause } from "@/lib/data/mutations";
import type { Snapshot } from "@/lib/data/snapshot";
import type { LocalDate } from "@/lib/domain/dates";
import type { PauseRecord } from "@/lib/domain/model";
import type { DayGap } from "@/lib/domain/nudges";
import { formatDayLong } from "@/lib/format";

const DISMISS_KEY = "yesterday-dismissed";

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

function names(gap: DayGap): string {
  const list = gap.missing.map((i) => i.habit.name);
  return list.length <= 3 ? list.join(", ") : `${list.slice(0, 3).join(", ")} i ${list.length - 3} więcej`;
}

/** Karta „Wczoraj zostało…” na ekranie Dziś: uzupełnij, oznacz jako wolne albo ukryj na ten dzień. */
export function YesterdayCard({ gap, onFill }: { gap: DayGap; onFill: () => void }) {
  const [hidden, setHidden] = useState(true);
  const dayOff = useAction((s, date: LocalDate) => addDayOff(s, date), withDayOff);

  useEffect(() => {
    const id = window.setTimeout(() => setHidden(readDismissed() === gap.date), 0);
    return () => window.clearTimeout(id);
  }, [gap.date]);

  if (hidden) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, gap.date);
    } catch {
      // bez pamięci przeglądarki karta wróci po odświeżeniu
    }
    setHidden(true);
  }

  const count = gap.missing.length;
  return (
    <section aria-labelledby="yesterday-title" className="mt-4 flex flex-col gap-3 rounded-3xl bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="yesterday-title" className="font-serif text-lg font-semibold">
            {count === 1 ? "Wczoraj został 1 nawyk" : `Wczoraj zostały ${count} nawyki`}
          </h2>
          <p className="text-sm text-muted">{names(gap)}</p>
        </div>
        <button type="button" onClick={dismiss} aria-label="Ukryj" className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center text-muted">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onFill} className={btnPrimary}>
          Uzupełnij wczoraj
        </button>
        <button type="button" disabled={dayOff.isPending} onClick={() => dayOff.mutate(gap.date)} className={btnSecondary}>
          Miałem wolne
        </button>
      </div>
    </section>
  );
}

/** Globalna pauza obejmująca dzień (urlop albo „dzień wolny”). */
export function pauseOn(snapshot: Snapshot, date: LocalDate): PauseRecord | undefined {
  return snapshot.pauses.find((p) => p.habitId === null && p.startDate <= date && date <= p.endDate);
}

/** Dzień w pauzie: informacja i cofnięcie jednodniowego „dnia wolnego”. */
export function DayOffCard({ pause, isToday }: { pause: PauseRecord; isToday: boolean }) {
  const undo = useAction((s, id: string) => deletePause(s, id), withoutPause);
  const single = pause.startDate === pause.endDate;
  const pending = pause.id.startsWith("day-off-");
  return (
    <section className="mt-4 flex flex-col gap-2 rounded-3xl bg-surface p-5">
      <h2 className="font-serif text-lg font-semibold">{single ? (isToday ? "Dziś masz wolne" : "Dzień wolny") : "Urlop"}</h2>
      <p className="text-sm text-muted">
        {single ? "Nawyki tego dnia się nie liczą — serie trwają dalej." : `Pauza wszystkich nawyków do ${formatDayLong(pause.endDate)}. Zmienisz ją w Ustawieniach.`}
      </p>
      {single && (
        <button type="button" disabled={pending || undo.isPending} onClick={() => undo.mutate(pause.id)} className={`${btnQuiet} -ml-4 self-start text-accent`}>
          {isToday ? "Cofnij — jednak dziś działam" : "Cofnij dzień wolny"}
        </button>
      )}
    </section>
  );
}

/** Szybkie „dzień wolny” na dole listy. */
export function DayOffButton({ date, isToday }: { date: LocalDate; isToday: boolean }) {
  const dayOff = useAction((s, d: LocalDate) => addDayOff(s, d), withDayOff);
  return (
    <button type="button" disabled={dayOff.isPending} onClick={() => dayOff.mutate(date)} className={`${btnQuiet} mt-6 self-center`}>
      {isToday ? "Dziś wolne (choroba, wyjazd) — bez zrywania serii" : "Ten dzień był wolny"}
    </button>
  );
}
