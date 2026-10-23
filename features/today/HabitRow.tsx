"use client";

import { useRef, useState } from "react";
import { useEntryMutation } from "@/lib/data/hooks";
import type { LocalDate } from "@/lib/domain/dates";
import { METRIC_INFO } from "@/lib/domain/health";
import type { TodayItem } from "@/lib/domain/today";
import { formatNumber, formatStreak } from "@/lib/format";
import { HabitBadge } from "@/lib/ui/icons";
import { EntrySheet } from "./EntrySheet";

const LONG_PRESS_MS = 450;

/** Nawyk z Apple Zdrowie: skąd i od kiedy się odhaczy (np. „auto od 7000 kroków”). */
function autoText(habit: TodayItem["habit"]): string | null {
  if (!habit.source) return null;
  const info = METRIC_INFO[habit.source];
  return habit.kind === "check" && habit.sourceMin ? `auto od ${formatNumber(habit.sourceMin)} ${info.unit}` : `auto · ${info.label.toLowerCase()}`;
}

function haptic() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(12);
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}

/** Wiersz B1: monogram, nazwa + szczegół, przycisk akcji po prawej. Zrobione: bez ramki, pełne kółko. */
export function HabitRow({ item, date, compact }: { item: TodayItem; date: LocalDate; compact: boolean }) {
  const mutation = useEntryMutation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);

  const { habit, plan, entry, state, streak, week } = item;
  const value = entry && !entry.skipped ? (entry.value ?? 0) : 0;
  const target = plan.targetValue;
  const isDone = state === "done";
  const isSkipped = state === "skipped";
  const unit = habit.kind === "duration" ? "min" : (habit.unit ?? "");

  /** Główny gest: tak/nie przełącza, ilość dodaje 1, czas zalicza pełny cel. */
  function primary() {
    if (isSkipped) return mutation.mutate({ habitId: habit.id, date, kind: "clear" });
    if (habit.kind === "check") {
      if (isDone) return mutation.mutate({ habitId: habit.id, date, kind: "clear" });
      haptic();
      return mutation.mutate({ habitId: habit.id, date, kind: "set", value: 1 });
    }
    if (habit.kind === "count" && !isDone) {
      const next = value + 1;
      if (next >= target) haptic();
      return mutation.mutate({ habitId: habit.id, date, kind: "set", value: next });
    }
    if (isDone) return setSheetOpen(true);
    haptic();
    return mutation.mutate({ habitId: habit.id, date, kind: "set", value: target });
  }

  function startPress() {
    longPressed.current = false;
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      setSheetOpen(true);
    }, LONG_PRESS_MS);
  }
  function cancelPress() {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }

  const streakText = streak.current > 0 ? `seria ${formatStreak(streak)}` : null;
  const progressText =
    week !== null
      ? `${week.done} z ${week.required || plan.timesPerWeek} w tym tygodniu`
      : habit.kind === "check"
        ? null
        : `${formatNumber(value)} z ${formatNumber(target)} ${unit}`.trim();

  const weekMet = week?.result === "met" && !isDone;
  const title =
    isDone && habit.kind !== "check" && week === null ? `${habit.name} · ${formatNumber(value)} z ${formatNumber(target)} ${unit}`.trim() : habit.name;
  const detail = isSkipped
    ? "Pominięte"
    : isDone
      ? streakText
      : [progressText, autoText(habit), streakText].filter(Boolean).join(" · ") ||
        (streak.best > 0 ? `Wracasz — rekord: ${formatStreak({ ...streak, current: streak.best })}` : "Zaczynasz nową serię");

  const actionLabel =
    habit.kind === "count" && !isDone && !isSkipped
      ? `${habit.name}: dodaj 1 (${formatNumber(value)} z ${formatNumber(target)})`
      : weekMet
        ? `${habit.name}: tydzień zaliczony, odhacz kolejny raz`
        : `${habit.name}: ${isDone || isSkipped ? "cofnij" : "odhacz"}`;

  return (
    <div className={`flex items-center gap-3 border-b-[0.5px] border-border ${compact ? "py-2" : "py-2.5"}`}>
      <HabitBadge icon={habit.icon} color={habit.color} name={habit.name} size={compact ? "sm" : "md"} />

      <button type="button" onClick={() => setSheetOpen(true)} className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
        <span className={`w-full truncate ${compact ? "text-[17px] text-done" : "text-[17px] font-medium"}`}>{title}</span>
        {detail && <span className={`text-[13px] ${(isDone || weekMet) && !isSkipped ? "font-semibold text-accent" : "text-muted"}`}>{detail}</span>}
      </button>

      <button
        type="button"
        aria-label={actionLabel}
        aria-pressed={isDone}
        onClick={() => {
          if (!longPressed.current) primary();
        }}
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onContextMenu={(e) => {
          e.preventDefault();
          setSheetOpen(true);
        }}
        className={`flex h-11 shrink-0 select-none items-center justify-center rounded-full text-[15px] font-bold transition-colors ${
          isDone
            ? "w-11 bg-accent text-accent-contrast"
            : weekMet
              ? "w-11 border-2 border-accent text-accent"
              : isSkipped
              ? "w-11 border-[1.5px] border-control text-muted"
              : habit.kind === "count"
                ? "min-w-14 bg-fill px-3 text-accent"
                : "w-11 border-2 border-control"
        }`}
      >
        {isDone || weekMet ? <CheckIcon /> : isSkipped ? "–" : habit.kind === "count" ? "+1" : null}
      </button>

      <EntrySheet open={sheetOpen} onClose={() => setSheetOpen(false)} habit={habit} plan={plan} entry={entry} date={date} />
    </div>
  );
}
