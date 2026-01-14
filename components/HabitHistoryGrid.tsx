"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";

type HabitHistoryGridProps = {
  habitId: string;
  initialCompletedDates: string[];
  days?: number;
};

const toISODate = (d: Date) => d.toISOString().split("T")[0];

export default function HabitHistoryGrid({
  habitId,
  initialCompletedDates,
  days = 30,
}: HabitHistoryGridProps) {
  const router = useRouter();
  const supabase = createClient();

  const [completedDates, setCompletedDates] = useState<string[]>(
    Array.from(new Set(initialCompletedDates))
  );
  const [pendingDate, setPendingDate] = useState<string | null>(null);

  const dates = useMemo(() => {
    const result: string[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      result.push(toISODate(d));
    }
    return result;
  }, [days]);

  const completedSet = useMemo(() => new Set(completedDates), [completedDates]);

  const toggleDate = async (date: string) => {
    if (pendingDate) return;

    setPendingDate(date);

    const isDone = completedSet.has(date);
    const next = isDone
      ? completedDates.filter((x) => x !== date)
      : [...completedDates, date];

    // optimistic UI
    setCompletedDates(next);

    try {
      if (!isDone) {
        const { error } = await supabase
          .from("habit_logs")
          .insert({ habit_id: habitId, completed_date: date });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("habit_logs")
          .delete()
          .eq("habit_id", habitId)
          .eq("completed_date", date);
        if (error) throw error;
      }

      router.refresh();
    } catch (e) {
      // rollback
      setCompletedDates(completedDates);
      console.error(e);
      alert("Nie udało się zapisać zmiany.");
    } finally {
      setPendingDate(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm text-gray-400 uppercase tracking-wider font-semibold">
          Historia ({days} dni)
        </h3>
        <div className="text-xs text-gray-500">Kliknij dzień, aby zmienić</div>
      </div>

      <div className="grid grid-cols-10 gap-2">
        {dates.map((date) => {
          const isDone = completedSet.has(date);
          const isPending = pendingDate === date;

          return (
            <button
              key={date}
              type="button"
              onClick={() => toggleDate(date)}
              disabled={!!pendingDate}
              title={date}
              className={`
                h-7 w-full rounded-md border transition-all
                ${isDone ? "bg-green-500/90 border-green-400" : "bg-gray-900 border-gray-800"}
                ${isPending ? "opacity-60" : "hover:scale-[1.03]"}
              `}
            />
          );
        })}
      </div>

      <div className="text-xs text-gray-500">
        Zielone = wykonane, szare = niewykonane
      </div>
    </div>
  );
}
