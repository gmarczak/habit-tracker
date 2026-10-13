import { z } from "zod";
import type { Supabase } from "@/lib/db/client";
import { isLocalDate, type LocalDate, type WeekStart } from "@/lib/domain/dates";
import { HABIT_COLORS, TIMES_OF_DAY, type Entry, type Plan, type ReminderKind } from "@/lib/domain/model";
import type { Snapshot } from "./snapshot";

function check<T extends { error: { message: string } | null }>(result: T): T {
  if (result.error) throw new Error(result.error.message);
  return result;
}

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
    check(await supabase.rpc("clear_entry", { p_habit_id: change.habitId, p_date: change.date }));
    return;
  }
  check(
    await supabase.rpc("set_entry", {
      p_habit_id: change.habitId,
      p_date: change.date,
      p_value: change.kind === "set" ? change.value : 0,
      p_skipped: change.kind === "skip",
      ...(change.note !== undefined && change.note !== null ? { p_note: change.note } : {}),
    }),
  );
}

// ---------- nawyk: formularz ----------

const planShape = {
  targetValue: z.number().positive("Cel musi być większy od zera"),
  frequency: z.enum(["daily", "weekdays", "weekly_count", "every_n_days"]),
  weekdays: z.array(z.number().int().min(1).max(7)).nullable(),
  timesPerWeek: z.number().int().min(1).max(7).nullable(),
  intervalDays: z.number().int().min(2).max(365).nullable(),
};

export const habitFormSchema = z
  .object({
    name: z.string().trim().min(1, "Podaj nazwę").max(80, "Maks. 80 znaków"),
    kind: z.enum(["check", "count", "duration"]),
    unit: z.string().trim().max(20).nullable(),
    icon: z.string().regex(/^[a-z0-9-]{1,32}$/).nullable(),
    color: z.enum(HABIT_COLORS),
    categoryId: z.string().uuid().nullable(),
    timeOfDay: z.enum(TIMES_OF_DAY).nullable(),
    goal: z.enum(["build", "quit"]),
    startDate: z.string().refine(isLocalDate).nullable(),
    ...planShape,
  })
  .superRefine((v, ctx) => {
    if (v.goal === "quit" && (v.kind !== "check" || v.frequency !== "daily"))
      ctx.addIssue({ code: "custom", path: ["goal"], message: "Nawyk „rzucam” jest codzienny i typu tak/nie" });
    if (v.kind === "count" && !v.unit) ctx.addIssue({ code: "custom", path: ["unit"], message: "Podaj jednostkę, np. strony" });
    if (v.frequency === "weekdays" && !v.weekdays?.length)
      ctx.addIssue({ code: "custom", path: ["weekdays"], message: "Wybierz przynajmniej jeden dzień" });
    if (v.frequency === "weekly_count" && !v.timesPerWeek)
      ctx.addIssue({ code: "custom", path: ["timesPerWeek"], message: "Od 1 do 7" });
    if (v.frequency === "every_n_days" && !v.intervalDays)
      ctx.addIssue({ code: "custom", path: ["intervalDays"], message: "Od 2 do 365" });
  });

export type HabitForm = z.infer<typeof habitFormSchema>;

function planArgs(v: Pick<HabitForm, "kind" | keyof typeof planShape>) {
  return {
    p_frequency: v.frequency,
    p_weekdays: v.frequency === "weekdays" ? v.weekdays : null,
    p_times_per_week: v.frequency === "weekly_count" ? v.timesPerWeek : null,
    p_interval_days: v.frequency === "every_n_days" ? v.intervalDays : null,
    p_target_value: v.kind === "check" ? 1 : v.targetValue,
  };
}

export async function createHabit(supabase: Supabase, input: HabitForm): Promise<string> {
  const v = habitFormSchema.parse(input);
  const { data } = check(
    await supabase.rpc("add_habit", {
      p_name: v.name,
      p_kind: v.kind,
      p_unit: v.kind === "duration" ? "min" : v.kind === "count" ? v.unit : null,
      p_icon: v.icon,
      p_color: v.color,
      p_category_id: v.categoryId,
      ...planArgs(v),
      ...(v.startDate ? { p_start_date: v.startDate } : {}),
    }),
  );
  if (v.timeOfDay || v.goal === "quit")
    check(await supabase.from("habits").update({ time_of_day: v.timeOfDay, goal: v.goal }).eq("id", data as string));
  return data as string;
}

/** Czy plan z formularza różni się od obowiązującego (wtedy tworzymy nową wersję od dziś). */
export function planChanged(current: Plan, v: Pick<HabitForm, "kind" | keyof typeof planShape>): boolean {
  const next = planArgs(v);
  const sameDays = (a: number[] | null, b: number[] | null) => JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort());
  return (
    current.frequency !== next.p_frequency ||
    !sameDays(current.weekdays, next.p_weekdays) ||
    (current.timesPerWeek ?? null) !== next.p_times_per_week ||
    (current.intervalDays ?? null) !== next.p_interval_days ||
    current.targetValue !== next.p_target_value
  );
}

export async function updateHabit(supabase: Supabase, habitId: string, currentPlan: Plan | null, input: HabitForm): Promise<void> {
  const v = habitFormSchema.parse(input);
  check(
    await supabase
      .from("habits")
      .update({
        name: v.name,
        icon: v.icon,
        color: v.color,
        category_id: v.categoryId,
        time_of_day: v.timeOfDay,
        unit: v.kind === "duration" ? "min" : v.kind === "count" ? v.unit : null,
      })
      .eq("id", habitId),
  );
  if (!currentPlan || planChanged(currentPlan, v)) {
    const args = planArgs(v);
    check(
      await supabase.rpc("change_plan", {
        p_habit_id: habitId,
        p_frequency: args.p_frequency,
        p_weekdays: args.p_weekdays as number[],
        p_times_per_week: args.p_times_per_week as number,
        p_interval_days: args.p_interval_days as number,
        p_target_value: args.p_target_value,
      }),
    );
  }
}

export async function setArchived(supabase: Supabase, habitId: string, archived: boolean): Promise<void> {
  check(await supabase.from("habits").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", habitId)); // eslint-disable-line no-restricted-syntax -- znacznik czasu, nie data dnia
}

export async function deleteHabit(supabase: Supabase, habitId: string): Promise<void> {
  check(await supabase.from("habits").delete().eq("id", habitId));
}

export async function reorderHabits(supabase: Supabase, ids: string[]): Promise<void> {
  check(await supabase.rpc("reorder_habits", { p_ids: ids }));
}

// ---------- kategorie ----------

export async function createCategory(supabase: Supabase, name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Podaj nazwę kategorii");
  const { data } = check(await supabase.from("categories").insert({ name: trimmed }).select("id").single());
  return data!.id;
}

export async function deleteCategory(supabase: Supabase, id: string): Promise<void> {
  check(await supabase.from("categories").delete().eq("id", id));
}

// ---------- pauzy ----------

export async function addPause(
  supabase: Supabase,
  pause: { habitId: string | null; startDate: LocalDate; endDate: LocalDate; reason: string | null },
): Promise<void> {
  if (!isLocalDate(pause.startDate) || !isLocalDate(pause.endDate) || pause.endDate < pause.startDate)
    throw new Error("Koniec pauzy nie może być przed jej początkiem");
  check(
    await supabase.from("habit_pauses").insert({
      habit_id: pause.habitId,
      start_date: pause.startDate,
      end_date: pause.endDate,
      reason: pause.reason?.trim() || null,
    }),
  );
}

export async function deletePause(supabase: Supabase, id: string): Promise<void> {
  check(await supabase.from("habit_pauses").delete().eq("id", id));
}

export const DAY_OFF_REASON = "Dzień wolny";

/** „Dzień wolny”: jednodniowa pauza wszystkich nawyków — dzień neutralny, seria się nie przerywa. */
export async function addDayOff(supabase: Supabase, date: LocalDate): Promise<void> {
  await addPause(supabase, { habitId: null, startDate: date, endDate: date, reason: DAY_OFF_REASON });
}

export function withDayOff(snapshot: Snapshot, date: LocalDate): Snapshot {
  return { ...snapshot, pauses: [...snapshot.pauses, { id: `day-off-${date}`, habitId: null, startDate: date, endDate: date, reason: DAY_OFF_REASON }] };
}

export function withoutPause(snapshot: Snapshot, id: string): Snapshot {
  return { ...snapshot, pauses: snapshot.pauses.filter((p) => p.id !== id) };
}

// ---------- notatka do dnia ----------

/** Zapis notatki dnia; pusty tekst usuwa notatkę. */
export async function saveDayNote(supabase: Supabase, date: LocalDate, text: string): Promise<void> {
  if (!isLocalDate(date)) throw new Error("Zła data");
  const note = text.trim();
  if (note.length > 1000) throw new Error("Notatka może mieć najwyżej 1000 znaków");
  if (!note) {
    check(await supabase.from("day_notes").delete().eq("note_date", date));
    return;
  }
  check(await supabase.from("day_notes").upsert({ note_date: date, note, updated_at: new Date().toISOString() }, { onConflict: "user_id,note_date" })); // eslint-disable-line no-restricted-syntax -- znacznik czasu
}

export function withDayNote(snapshot: Snapshot, input: { date: LocalDate; text: string }): Snapshot {
  const rest = snapshot.notes.filter((n) => n.date !== input.date);
  const note = input.text.trim();
  return { ...snapshot, notes: note ? [...rest, { date: input.date, note }] : rest };
}

// ---------- ustawienia ----------

export type SettingsForm = { timeZone: string; weekStart: WeekStart; dayStartHour: number };

export async function updateSettings(supabase: Supabase, userId: string, s: SettingsForm): Promise<void> {
  check(
    await supabase
      .from("profiles")
      .update({ timezone: s.timeZone, week_start: s.weekStart, day_start_hour: s.dayStartHour })
      .eq("id", userId),
  );
}

/** Ustawia strefę czasową profilu na strefę urządzenia, jeśli profil jej nigdy nie zmieniał. */
export async function syncTimeZone(supabase: Supabase, userId: string, deviceTimeZone: string): Promise<boolean> {
  const { data, error } = await supabase.from("profiles").select("timezone, created_at, updated_at").eq("id", userId).single();
  if (error || !data) return false;
  if (data.timezone === deviceTimeZone || data.created_at !== data.updated_at) return false;
  const { error: updError } = await supabase.from("profiles").update({ timezone: deviceTimeZone }).eq("id", userId);
  return !updError;
}

export async function deleteAccount(supabase: Supabase): Promise<void> {
  check(await supabase.rpc("delete_my_account"));
}

// ---------- przypomnienia ----------

export async function upsertReminder(
  supabase: Supabase,
  reminder: { id?: string; kind: ReminderKind; habitId: string | null; localTime: string; enabled: boolean },
): Promise<void> {
  if (!/^\d{2}:\d{2}$/.test(reminder.localTime)) throw new Error("Godzina w formacie GG:MM");
  if ((reminder.kind === "habit") !== (reminder.habitId !== null)) throw new Error("Przypomnienie nawyku wymaga nawyku");
  if (reminder.id) {
    check(
      await supabase.from("reminders").update({ local_time: reminder.localTime, enabled: reminder.enabled }).eq("id", reminder.id),
    );
  } else {
    check(
      await supabase
        .from("reminders")
        .insert({ kind: reminder.kind, habit_id: reminder.habitId, local_time: reminder.localTime, enabled: reminder.enabled }),
    );
  }
}

export async function deleteReminder(supabase: Supabase, id: string): Promise<void> {
  check(await supabase.from("reminders").delete().eq("id", id));
}

export async function savePushSubscription(supabase: Supabase, sub: PushSubscriptionJSON, userAgent: string): Promise<void> {
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("Niepełna subskrypcja push");
  check(
    await supabase.from("push_subscriptions").upsert(
      { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, user_agent: userAgent.slice(0, 300) },
      { onConflict: "endpoint" },
    ),
  );
}

export async function deletePushSubscription(supabase: Supabase, endpoint: string): Promise<void> {
  check(await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint));
}
