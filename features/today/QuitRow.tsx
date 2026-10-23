"use client";

import { useEntryMutation } from "@/lib/data/hooks";
import type { LocalDate } from "@/lib/domain/dates";
import type { TodayItem } from "@/lib/domain/today";
import { formatStreak } from "@/lib/format";
import { HabitBadge } from "@/lib/ui/icons";

/**
 * Nawyk „rzucam”: dzień jest czysty, dopóki nie zaznaczysz wpadki.
 * Wpadka = wpis z wartością 1; „Cofnij” usuwa wpis.
 */
export function QuitRow({ item, date, isToday }: { item: TodayItem; date: LocalDate; isToday: boolean }) {
  const mutation = useEntryMutation();
  const { habit, state, streak } = item;
  const slipped = state === "missed";

  const detail = slipped
    ? isToday
      ? "Wpadka dzisiaj — jutro liczysz od nowa"
      : "Wpadka tego dnia"
    : streak.current > 0
      ? `Bez wpadki: ${formatStreak(streak)}`
      : "Czysty dzień";

  function toggle() {
    if (slipped) mutation.mutate({ habitId: habit.id, date, kind: "clear" });
    else mutation.mutate({ habitId: habit.id, date, kind: "set", value: 1 });
  }

  return (
    <div className="flex items-center gap-3 border-b-[0.5px] border-border py-2.5">
      <HabitBadge icon={habit.icon} color={habit.color} name={habit.name} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="w-full truncate text-[17px] font-semibold">{habit.name}</span>
        <span className={`text-[13px] ${slipped ? "text-danger" : "font-semibold text-accent"}`}>{detail}</span>
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={slipped}
        aria-label={slipped ? `${habit.name}: cofnij wpadkę` : `${habit.name}: zaznacz wpadkę`}
        className={`inline-flex h-11 shrink-0 items-center justify-center rounded-full px-4 text-sm font-semibold ${
          slipped ? "border-[1.5px] border-control text-muted" : "border-[1.5px] border-danger text-danger"
        }`}
      >
        {slipped ? "Cofnij" : "Wpadka"}
      </button>
    </div>
  );
}
