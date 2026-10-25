"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { btnPrimarySm, btnQuiet, btnSecondarySm } from "@/components/ui/styles";
import { useAction } from "@/lib/data/hooks";
import { BREAK_REASON, addDayOff, addPause, deletePause, withDayOff, withPause, withoutPause } from "@/lib/data/mutations";
import type { Snapshot } from "@/lib/data/snapshot";
import type { LocalDate } from "@/lib/domain/dates";
import type { PauseRecord } from "@/lib/domain/model";
import { easiestHabit, type Absence, type DayGap } from "@/lib/domain/nudges";
import { dayOfMonth, formatDayLong, formatDayMonth, formatNumber, habitsLeft, plural } from "@/lib/format";
import { useMarkAllNo } from "./markAll";

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

/** „13–21 października” albo „28 września – 3 października”. */
export function formatRange(from: LocalDate, to: LocalDate): string {
  if (from === to) return formatDayMonth(from);
  return from.slice(0, 7) === to.slice(0, 7) ? `${dayOfMonth(from)}–${formatDayMonth(to)}` : `${formatDayMonth(from)} – ${formatDayMonth(to)}`;
}

/**
 * Karta „Wczoraj zostało…” na ekranie Dziś: uzupełnij (przegląd tamtego dnia, jak z porannego powiadomienia),
 * „nie zrobiłem” (odpowiedź, rano już nie pyta), dzień wolny albo ukryj na ten dzień.
 */
export function YesterdayCard({ gap }: { gap: DayGap }) {
  const [hidden, setHidden] = useState(true);
  const dayOff = useAction((s, date: LocalDate) => addDayOff(s, date), withDayOff);
  const markNo = useMarkAllNo();

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
    <section aria-labelledby="yesterday-title" className="mt-4 flex flex-col gap-3 rounded-xl bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="yesterday-title" className="text-[17px] font-semibold">
            {`Wczoraj ${habitsLeft(count, false)}`}
          </h2>
          <p className="text-sm text-muted">{names(gap)}</p>
        </div>
        <button type="button" onClick={dismiss} aria-label="Ukryj" className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center text-muted">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <Link href={`/review?date=${gap.date}`} className={btnPrimarySm}>
        Uzupełnij
      </Link>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => markNo(gap.missing, gap.date)} className={btnSecondarySm}>
          Nie zrobiłem
        </button>
        <button type="button" disabled={dayOff.isPending} onClick={() => dayOff.mutate(gap.date)} className={btnSecondarySm}>
          Miałem wolne
        </button>
      </div>
    </section>
  );
}

const COMEBACK_KEY = "comeback-dismissed";

/**
 * Powrót po kilku dniach bez zapisu: zamiast listy zaległości trzy wyjścia — przerwa (dni neutralne, serie trwają),
 * uzupełnienie w siatce tygodnia albo start od dziś. Do tego jeden, najłatwiejszy nawyk na dziś.
 */
export function ComebackCard({ away, snapshot, today }: { away: Absence; snapshot: Snapshot; today: LocalDate }) {
  const [hidden, setHidden] = useState(true);
  const toast = useToast();
  const undo = useAction((s, id: string) => deletePause(s, id), withoutPause, { toastErrors: true });
  const markBreak = useAction(
    (s, a: Absence) => addPause(s, { habitId: null, startDate: a.from, endDate: a.to, reason: BREAK_REASON }),
    (snap, a: Absence) => withPause(snap, { habitId: null, startDate: a.from, endDate: a.to, reason: BREAK_REASON }),
    { toastErrors: true },
  );

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        setHidden(localStorage.getItem(COMEBACK_KEY) === away.from);
      } catch {
        setHidden(false);
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [away.from]);

  if (hidden) return null;

  function startToday() {
    try {
      localStorage.setItem(COMEBACK_KEY, away.from);
    } catch {
      // bez pamięci przeglądarki karta wróci po odświeżeniu
    }
    setHidden(true);
  }

  function takeBreak() {
    // Karta znika od razu (pauza w cache kończy ciszę), więc komunikat po obietnicy, nie w callbacku obserwatora
    markBreak
      .mutateAsync(away)
      .then((id) =>
        toast({
          message: `Przerwa ${formatRange(away.from, away.to)} — serie trwają dalej`,
          actionLabel: "Cofnij",
          durationMs: 8000,
          onAction: () => undo.mutate(id),
        }),
      )
      .catch(() => {}); // błąd pokazuje useAction (toastErrors)
  }

  const easy = easiestHabit(snapshot.habits, snapshot.entries, snapshot.pauses, today, snapshot.settings.weekStart);
  const amount = easy && easy.habit.kind !== "check" ? ` ${formatNumber(easy.plan.targetValue)} ${easy.habit.kind === "duration" ? "min" : (easy.habit.unit ?? "")}` : "";

  return (
    <section aria-labelledby="comeback-title" className="mt-4 flex flex-col gap-3 rounded-xl bg-surface p-4">
      <div>
        <h2 id="comeback-title" className="text-[17px] font-semibold">
          {`Wracasz po ${away.days} ${plural(away.days, "dniu", "dniach", "dniach")}`}
        </h2>
        <p className="text-sm text-muted">{`Bez zapisów: ${formatRange(away.from, away.to)}. Nic straconego.`}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={markBreak.isPending} onClick={takeBreak} className={btnPrimarySm}>
          To była przerwa
        </button>
        <Link href="/review/week" className={btnSecondarySm}>
          Uzupełnij
        </Link>
      </div>
      {easy && (
        <p className="text-[15px]">
          Na dziś wystarczy jeden: <span className="font-semibold">{`${easy.habit.name}${amount}`.trimEnd()}</span>
        </p>
      )}
      <button type="button" onClick={startToday} className={`${btnQuiet} -ml-4 -mt-2 self-start`}>
        Zacznij od dziś
      </button>
    </section>
  );
}

/** Globalna pauza obejmująca dzień (urlop albo „dzień wolny”). */
export function pauseOn(snapshot: Snapshot, date: LocalDate): PauseRecord | undefined {
  return snapshot.pauses.find((p) => p.habitId === null && p.startDate <= date && date <= p.endDate);
}

/** Dzień w pauzie: informacja i cofnięcie jednodniowego „dnia wolnego” albo przerwy oznaczonej po powrocie. */
export function DayOffCard({ pause, isToday }: { pause: PauseRecord; isToday: boolean }) {
  const undo = useAction((s, id: string) => deletePause(s, id), withoutPause);
  const single = pause.startDate === pause.endDate;
  const pending = pause.id.startsWith("day-off-") || pause.id.startsWith("pending-");
  if (pause.reason === BREAK_REASON && !single) {
    return (
      <section className="mt-4 flex flex-col gap-2 rounded-xl bg-surface p-5">
        <h2 className="font-serif text-lg font-bold">Przerwa</h2>
        <p className="text-sm text-muted">{`${formatRange(pause.startDate, pause.endDate)}: nawyki się nie liczą — serie trwają dalej.`}</p>
        <button type="button" disabled={pending || undo.isPending} onClick={() => undo.mutate(pause.id)} className={`${btnQuiet} -ml-4 self-start text-accent`}>
          Cofnij przerwę
        </button>
      </section>
    );
  }
  return (
    <section className="mt-4 flex flex-col gap-2 rounded-xl bg-surface p-5">
      <h2 className="font-serif text-lg font-bold">{single ? (isToday ? "Dziś masz wolne" : "Dzień wolny") : "Urlop"}</h2>
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
    <div className="mt-6 flex flex-col items-center gap-0.5">
      <button type="button" disabled={dayOff.isPending} onClick={() => dayOff.mutate(date)} className={btnQuiet}>
        {isToday ? "Dzień wolny" : "Ten dzień był wolny"}
      </button>
      <p className="text-center text-[12px] text-muted">Choroba, wyjazd — serie się nie przerywają</p>
    </div>
  );
}
