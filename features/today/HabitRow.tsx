"use client";

import { useRef, useState } from "react";
import { useEntryMutation, useSnapshot } from "@/lib/data/hooks";
import type { LocalDate } from "@/lib/domain/dates";
import { METRIC_INFO, healthValue, metricUnit, metricUnitOf } from "@/lib/domain/health";
import { planOn } from "@/lib/domain/schedule";
import { isAnsweredNo, type TodayItem } from "@/lib/domain/today";
import { formatNumber, formatStreak } from "@/lib/format";
import { HabitBadge } from "@/lib/ui/icons";
import { EntrySheet } from "./EntrySheet";
import { clearTimer } from "./HabitTimer";
import { SwipeRow, type SwipeAction } from "./SwipeRow";

const LONG_PRESS_MS = 450;

/**
 * Nawyk z Apple Zdrowie: prawdziwa wartość dnia („4 312 z 7 000 kroków”),
 * a zanim Skrót coś przyśle — od kiedy się odhaczy („auto od 7 000 kroków”).
 */
function autoText(habit: TodayItem["habit"], measured: number | null): string | null {
  if (!habit.source || habit.kind !== "check") return habit.source ? `auto · ${METRIC_INFO[habit.source].label.toLowerCase()}` : null;
  const min = habit.sourceMin;
  if (measured !== null)
    return min ? `${formatNumber(measured)} z ${formatNumber(min)} ${metricUnitOf(habit.source, min)}` : `${formatNumber(measured)} ${metricUnit(habit.source, measured)}`;
  return min ? `auto od ${formatNumber(min)} ${metricUnitOf(habit.source, min)}` : null;
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
export function HabitRow({ item, date, today, compact }: { item: TodayItem; date: LocalDate; today: LocalDate; compact: boolean }) {
  const mutation = useEntryMutation();
  // Arkusz zapamiętuje dzień, w którym go otwarto: po północy dalej zapisuje do tego dnia
  const [sheetDate, setSheetDate] = useState<LocalDate | null>(null);
  const openSheet = () => setSheetDate(date);
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);

  const { habit, plan, entry, state, streak, week } = item;
  const { data: snapshot } = useSnapshot();
  const measured = habit.source && snapshot ? healthValue(snapshot.health ?? [], habit.source, date) : null;
  const value = entry && !entry.skipped ? (entry.value ?? 0) : 0;
  const target = plan.targetValue;
  const isDone = state === "done";
  const isSkipped = state === "skipped";
  // „Nie dziś” z przeglądu albo karty „Wczoraj”: wpis 0, dzień rozstrzygnięty
  const saidNo = !isDone && !isSkipped && isAnsweredNo(item);
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
      if (value + 1 >= target) haptic();
      // +1 liczy serwer, więc nie nadpisze tego, co w międzyczasie dodała Siri albo Skrót
      return mutation.mutate({ habitId: habit.id, date, kind: "add", delta: 1, requestId: crypto.randomUUID() });
    }
    if (isDone) return openSheet();
    haptic();
    clearTimer(habit.id, date);
    return mutation.mutate({ habitId: habit.id, date, kind: "set", value: target });
  }

  /** Gesty: w prawo — zrobione w całości (także ilość i czas), w lewo — pomiń albo cofnij wpis */
  function settle(kind: "done" | "skip" | "clear") {
    const base = { habitId: habit.id, date };
    if (habit.kind === "duration") clearTimer(habit.id, date);
    if (kind === "done") {
      haptic();
      return mutation.mutate({ ...base, kind: "set", value: habit.kind === "check" ? 1 : target });
    }
    return mutation.mutate(kind === "skip" ? { ...base, kind: "skip" } : { ...base, kind: "clear" });
  }
  const toRight: SwipeAction | undefined = isDone ? undefined : { label: "Zrobione", tone: "accent", run: () => settle("done") };
  const toLeft: SwipeAction =
    isDone || isSkipped || saidNo ? { label: "Cofnij", tone: "neutral", run: () => settle("clear") } : { label: "Pomiń", tone: "neutral", run: () => settle("skip") };

  function startPress() {
    longPressed.current = false;
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      openSheet();
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
    isDone && habit.kind !== "check" && week === null
      ? `${habit.name} · ${formatNumber(value)} z ${formatNumber(target)} ${unit}`.trim()
      : isDone && habit.source && measured !== null
        ? `${habit.name} · ${formatNumber(measured)} ${metricUnit(habit.source, measured)}`
        : habit.name;
  const detail = isSkipped
    ? "Pominięte"
    : isDone
      ? streakText
      : saidNo
        ? "Nie dziś"
        : item.missedLast
          ? `Wczoraj przerwa — dziś nie odpuść${streak.current > 0 ? ` · ${streakText}` : ""}`
          : [habit.cue, progressText, autoText(habit, measured), streakText].filter(Boolean).join(" · ") ||
            (streak.best > 0 ? `Wracasz — rekord: ${formatStreak({ ...streak, current: streak.best })}` : "Zaczynasz nową serię");

  const actionLabel =
    habit.kind === "count" && !isDone && !isSkipped
      ? `${habit.name}: dodaj 1 (${formatNumber(value)} z ${formatNumber(target)})`
      : weekMet
        ? `${habit.name}: tydzień zaliczony, odhacz kolejny raz`
        : isDone && habit.kind !== "check"
          ? `${habit.name}: zrobione, zmień wpis`
          : `${habit.name}: ${isDone || isSkipped ? "cofnij" : "odhacz"}`;

  return (
    <>
      <SwipeRow toRight={toRight} toLeft={toLeft} onSwipeStart={cancelPress} className="border-b-[0.5px] border-border">
        <div className={`flex items-center gap-3 ${compact ? "py-2" : "py-2.5"}`}>
          <HabitBadge icon={habit.icon} color={habit.color} name={habit.name} size={compact ? "sm" : "md"} />

          <button type="button" onClick={openSheet} className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
            <span className={`w-full truncate ${compact ? "text-[17px] text-done" : "text-[17px] font-medium"}`}>{title}</span>
            {detail && (
              <span
                className={`text-[13px] ${
                  (isDone || weekMet) && !isSkipped ? "font-semibold text-accent" : item.missedLast && !saidNo && !isDone && !isSkipped ? "font-semibold" : "text-muted"
                }`}
              >
                {detail}
              </span>
            )}
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
              openSheet();
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
        </div>
      </SwipeRow>

      <EntrySheet
        open={sheetDate !== null}
        onClose={() => setSheetDate(null)}
        habit={habit}
        plan={sheetDate && sheetDate !== date ? (planOn(habit, sheetDate) ?? plan) : plan}
        entry={sheetDate && sheetDate !== date ? snapshot?.entries.find((e) => e.habitId === habit.id && e.date === sheetDate) : entry}
        date={sheetDate ?? date}
        today={today}
      />
    </>
  );
}
