import type { Tables } from "@/lib/db/database.types";
import type { Supabase } from "@/lib/db/client";
import type { WeekStart } from "@/lib/domain/dates";
import {
  HABIT_COLORS,
  type Category,
  type Entry,
  type Habit,
  type HabitColor,
  type PauseRecord,
  type Plan,
  type Reminder,
  type Settings,
} from "@/lib/domain/model";

/**
 * Cała historia użytkownika w jednym obiekcie. Rok używania to kilka tysięcy wierszy,
 * więc trzymamy ją w kliencie, a serie i statystyki liczy lib/domain.
 */
export type Snapshot = {
  userId: string;
  email: string | null;
  settings: Settings;
  habits: Habit[];
  entries: Entry[];
  pauses: PauseRecord[];
  categories: Category[];
  reminders: Reminder[];
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

function toColor(value: string): HabitColor {
  return (HABIT_COLORS as readonly string[]).includes(value) ? (value as HabitColor) : "green";
}

export function toHabit(row: Tables<"habits">, plans: Tables<"habit_plans">[]): Habit {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    unit: row.unit,
    icon: row.icon,
    color: toColor(row.color),
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

  const [profile, habits, plans, entries, pauses, categories, reminders] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", auth.user.id).single(),
    supabase.from("habits").select("*").order("sort_order"),
    supabase.from("habit_plans").select("*"),
    allEntries(supabase),
    supabase.from("habit_pauses").select("*").order("start_date"),
    supabase.from("categories").select("*").order("sort_order"),
    supabase.from("reminders").select("*").order("local_time"),
  ]);
  for (const r of [profile, habits, plans, pauses, categories, reminders]) if (r.error) throw r.error;

  return {
    userId: auth.user.id,
    email: auth.user.email ?? null,
    settings: {
      timeZone: profile.data!.timezone,
      weekStart: profile.data!.week_start as WeekStart,
      dayStartHour: profile.data!.day_start_hour,
    },
    habits: (habits.data ?? []).map((h) => toHabit(h, plans.data ?? [])),
    entries: entries.map(toEntry),
    pauses: (pauses.data ?? []).map((p) => ({
      id: p.id,
      habitId: p.habit_id,
      startDate: p.start_date,
      endDate: p.end_date,
      reason: p.reason,
    })),
    categories: (categories.data ?? []).map((c) => ({ id: c.id, name: c.name, sortOrder: c.sort_order })),
    reminders: (reminders.data ?? []).map((r) => ({
      id: r.id,
      habitId: r.habit_id,
      localTime: r.local_time.slice(0, 5),
      enabled: r.enabled,
    })),
  };
}
