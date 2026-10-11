import { z } from "zod";
import type { Supabase } from "@/lib/db/client";
import type { Database } from "@/lib/db/database.types";
import { isLocalDate, type LocalDate } from "@/lib/domain/dates";
import type { Entry } from "@/lib/domain/model";
import type { Snapshot } from "./snapshot";

// ---------- czyste aktualizacje cache (optymistycznie, przed odpowiedzią serwera) ----------

/** Zastępuje wpis (habit, dzień) albo go usuwa, gdy `entry` jest null. */
export function withEntry(snapshot: Snapshot, habitId: string, date: LocalDate, entry: Entry | null): Snapshot {
  const rest = snapshot.entries.filter((e) => !(e.habitId === habitId && e.date === date));
  return { ...snapshot, entries: entry ? [...rest, entry] : rest };
}

// ---------- zapis dnia ----------

export type EntryChange =
  | { habitId: string; date: LocalDate; kind: "set"; value: number; note?: string | null }
  | { habitId: string; date: LocalDate; kind: "skip"; note?: string | null }
  | { habitId: string; date: LocalDate; kind: "clear" };

export function entryFromChange(change: EntryChange, previous: Entry | undefined): Entry | null {
  if (change.kind === "clear") return null;
  const note = "note" in change && change.note !== undefined ? change.note : (previous?.note ?? null);
  return change.kind === "skip"
    ? { habitId: change.habitId, date: change.date, value: null, skipped: true, note }
    : { habitId: change.habitId, date: change.date, value: change.value, skipped: false, note };
}

export async function saveEntry(supabase: Supabase, change: EntryChange): Promise<void> {
  if (change.kind === "clear") {
    const { error } = await supabase.rpc("clear_entry", { p_habit_id: change.habitId, p_date: change.date });
    if (error) throw error;
    return;
  }
  const { error } = await supabase.rpc("set_entry", {
    p_habit_id: change.habitId,
    p_date: change.date,
    p_value: change.kind === "set" ? change.value : 0,
    p_skipped: change.kind === "skip",
    ...(change.note !== undefined && change.note !== null ? { p_note: change.note } : {}),
  });
  if (error) throw error;
}

// ---------- nowy nawyk ----------

export const newHabitSchema = z
  .object({
    name: z.string().trim().min(1, "Podaj nazwę").max(80, "Maks. 80 znaków"),
    kind: z.enum(["check", "count", "duration"]),
    unit: z.string().trim().max(20).nullable(),
    targetValue: z.number().positive(),
    frequency: z.enum(["daily", "weekdays", "weekly_count", "every_n_days"]),
    weekdays: z.array(z.number().int().min(1).max(7)).nullable(),
    timesPerWeek: z.number().int().min(1).max(7).nullable(),
    intervalDays: z.number().int().min(2).max(365).nullable(),
    startDate: z.string().refine(isLocalDate).nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "count" && !v.unit) ctx.addIssue({ code: "custom", path: ["unit"], message: "Podaj jednostkę, np. strony" });
    if (v.frequency === "weekdays" && !v.weekdays?.length)
      ctx.addIssue({ code: "custom", path: ["weekdays"], message: "Wybierz przynajmniej jeden dzień" });
    if (v.frequency === "weekly_count" && !v.timesPerWeek)
      ctx.addIssue({ code: "custom", path: ["timesPerWeek"], message: "Ile razy w tygodniu?" });
    if (v.frequency === "every_n_days" && !v.intervalDays)
      ctx.addIssue({ code: "custom", path: ["intervalDays"], message: "Co ile dni?" });
  });

export type NewHabit = z.infer<typeof newHabitSchema>;

export async function createHabit(supabase: Supabase, input: NewHabit): Promise<string> {
  const v = newHabitSchema.parse(input);
  // Generator typów Supabase nie oznacza argumentów funkcji jako nullable, choć SQL przyjmuje null.
  const args = {
    p_name: v.name,
    p_kind: v.kind,
    p_unit: v.kind === "duration" ? "min" : v.kind === "count" ? v.unit : null,
    p_emoji: null,
    p_color: null,
    p_category_id: null,
    p_frequency: v.frequency,
    p_weekdays: v.frequency === "weekdays" ? v.weekdays : null,
    p_times_per_week: v.frequency === "weekly_count" ? v.timesPerWeek : null,
    p_interval_days: v.frequency === "every_n_days" ? v.intervalDays : null,
    p_target_value: v.kind === "check" ? 1 : v.targetValue,
    ...(v.startDate ? { p_start_date: v.startDate } : {}),
  } as unknown as Database["public"]["Functions"]["create_habit"]["Args"];
  const { data, error } = await supabase.rpc("create_habit", args);
  if (error) throw error;
  return data;
}

/** Ustawia strefę czasową profilu na strefę urządzenia, jeśli profil jej nigdy nie zmieniał. */
export async function syncTimeZone(supabase: Supabase, userId: string, deviceTimeZone: string): Promise<boolean> {
  const { data, error } = await supabase.from("profiles").select("timezone, created_at, updated_at").eq("id", userId).single();
  if (error || !data) return false;
  if (data.timezone === deviceTimeZone || data.created_at !== data.updated_at) return false;
  const { error: updError } = await supabase.from("profiles").update({ timezone: deviceTimeZone }).eq("id", userId);
  return !updError;
}
