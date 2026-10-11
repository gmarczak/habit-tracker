import type { Tables } from "@/lib/db/database.types";
import type { Supabase } from "@/lib/db/client";
import type { WeekStart } from "@/lib/domain/dates";
import type { Entry, Habit, Pause, Plan, Settings } from "@/lib/domain/model";

/**
 * Cała historia użytkownika w jednym obiekcie. Rok używania to kilka tysięcy wierszy,
 * więc trzymamy ją w kliencie, a serie i statystyki liczy lib/domain.
 */
export type Snapshot = {
  userId: string;
  settings: Settings;
  habits: Habit[];
  entries: Entry[];
  pauses: Pause[];
};

export function toPlan(row: Tables<"habit_plans">): Plan {
  return {
    validFrom: row.valid_from,
    frequency: row.frequency,
    weekdays: row.weekdays,
    timesPerWeek: row.times_per_week,
    intervalDays: row.interval_days,
    targetValue: Number(row.target_value),
  };
}

export function toHabit(row: Tables<"habits">, plans: Tables<"habit_plans">[]): Habit {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    unit: row.unit,
    emoji: row.emoji,
    color: row.color,
    categoryId: row.category_id,
    startDate: row.start_date,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at,
    plans: plans
      .filter((p) => p.habit_id === row.id)
      .map(toPlan)
      .sort((a, b) => (a.validFrom < b.validFrom ? -1 : 1)),
  };
}

export function toEntry(row: Pick<Tables<"habit_entries">, "habit_id" | "entry_date" | "value" | "skipped" | "note">): Entry {
  return {
    habitId: row.habit_id,
    date: row.entry_date,
    value: row.value === null ? null : Number(row.value),
    skipped: row.skipped,
    note: row.note,
  };
}

const PAGE = 1000;

/** PostgREST zwraca maks. 1000 wierszy na zapytanie, więc wpisy pobieramy stronami. */
async function allEntries(supabase: Supabase): Promise<Tables<"habit_entries">[]> {
  const out: Tables<"habit_entries">[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("habit_entries")
      .select("*")
      .order("entry_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < PAGE) return out;
  }
}

export async function fetchSnapshot(supabase: Supabase): Promise<Snapshot> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw authError ?? new Error("not_authenticated");

  const [profile, habits, plans, entries, pauses] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", auth.user.id).single(),
    supabase.from("habits").select("*").order("sort_order"),
    supabase.from("habit_plans").select("*"),
    allEntries(supabase),
    supabase.from("habit_pauses").select("*"),
  ]);
  for (const r of [profile, habits, plans, pauses]) if (r.error) throw r.error;

  return {
    userId: auth.user.id,
    settings: {
      timeZone: profile.data!.timezone,
      weekStart: profile.data!.week_start as WeekStart,
      dayStartHour: profile.data!.day_start_hour,
    },
    habits: (habits.data ?? []).map((h) => toHabit(h, plans.data ?? [])),
    entries: entries.map(toEntry),
    pauses: (pauses.data ?? []).map((p) => ({ habitId: p.habit_id, startDate: p.start_date, endDate: p.end_date })),
  };
}
