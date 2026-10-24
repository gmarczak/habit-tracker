import { z } from "zod";
import type { Supabase } from "@/lib/db/client";
import { addDays, isLocalDate, type LocalDate, type WeekStart } from "@/lib/domain/dates";
import { HEALTH_METRICS } from "@/lib/domain/health";
import { HABIT_COLORS, TIMES_OF_DAY, type Entry, type Habit, type Plan, type ReminderKind } from "@/lib/domain/model";
import type { Snapshot } from "./snapshot";

/** Zapytanie nie dotarło do serwera (brak zasięgu, Wi-Fi bez internetu). Zapis dnia czeka wtedy w kolejce. */
export class NetworkError extends Error {}
/** Serwer nie widzi sesji (wygasła bez sieci, wylogowanie na innym urządzeniu). Zapis dnia też czeka. */
export class SessionError extends NetworkError {}

/** Kody błędów z funkcji w bazie → zrozumiały komunikat. */
const ERROR_TEXT: Record<string, string> = {
  date_in_future: "Ten dzień jeszcze się nie zaczął.",
  date_before_start: "Ten dzień jest przed startem nawyku.",
  habit_not_found: "Nie ma już tego nawyku — odśwież aplikację.",
  not_authenticated: "Sesja wygasła — zaloguj się ponownie.",
  habit_id_taken: "Nie udało się zapisać — spróbuj ponownie.",
  bad_value: "Zła wartość.",
};

function check<T extends { error: { message: string; code?: string } | null; status?: number }>(result: T): T {
  if (!result.error) return result;
  if (result.status === 0) throw new NetworkError("Brak połączenia z serwerem — spróbuj ponownie.");
  if (result.status === 401 || result.error.code === "PGRST301" || result.error.code === "PGRST303")
    throw new SessionError("Sesja wygasła — zaloguj się ponownie.");
  const text = ERROR_TEXT[result.error.message];
  if (text) throw new Error(text);
  if (result.error.code === "23505") throw new Error(/name/.test(result.error.message) ? "Taka nazwa już istnieje." : "To już jest zapisane — odśwież aplikację.");
  throw new Error(result.error.message);
}

// ---------- czyste aktualizacje cache (optymistycznie, przed odpowiedzią serwera) ----------

/** Zastępuje wpis (habit, dzień) albo go usuwa, gdy `entry` jest null. */
export function withEntry(snapshot: Snapshot, habitId: string, date: LocalDate, entry: Entry | null): Snapshot {
  const rest = snapshot.entries.filter((e) => !(e.habitId === habitId && e.date === date));
  return { ...snapshot, entries: entry ? [...rest, entry] : rest };
}

// ---------- zapis dnia ----------

/**
 * set – dokładna wartość; add – dopisanie do tego, co jest na serwerze („+1”, minuty z minutnika),
 * więc nie nadpisuje tego, co w międzyczasie dodała Siri albo Skrót.
 */
export type EntryChange =
  | { habitId: string; date: LocalDate; kind: "set"; value: number; note?: string | null }
  | { habitId: string; date: LocalDate; kind: "add"; delta: number; requestId: string }
  | { habitId: string; date: LocalDate; kind: "skip"; note?: string | null }
  | { habitId: string; date: LocalDate; kind: "clear" };

export function entryFromChange(change: EntryChange, previous: Entry | undefined): Entry | null {
  if (change.kind === "clear") return null;
  const note = "note" in change && change.note !== undefined ? change.note : (previous?.note ?? null);
  if (change.kind === "add") {
    const base = previous && !previous.skipped ? (previous.value ?? 0) : 0;
    return { habitId: change.habitId, date: change.date, value: base + change.delta, skipped: false, note };
  }
  return change.kind === "skip"
    ? { habitId: change.habitId, date: change.date, value: null, skipped: true, note }
    : { habitId: change.habitId, date: change.date, value: change.value, skipped: false, note };
}

export async function saveEntry(supabase: Supabase, change: EntryChange): Promise<void> {
  if (change.kind === "clear") {
    check(await supabase.rpc("clear_entry", { p_habit_id: change.habitId, p_date: change.date }));
    return;
  }
  if (change.kind === "add") {
    check(await supabase.rpc("add_entry", { p_habit_id: change.habitId, p_date: change.date, p_delta: change.delta, p_request: change.requestId }));
    return;
  }
  check(
    await supabase.rpc("set_entry", {
      p_habit_id: change.habitId,
      p_date: change.date,
      p_value: change.kind === "set" ? change.value : 0,
      p_skipped: change.kind === "skip",
      // undefined = notatka bez zmian; null = usuń (serwer traktuje pusty tekst jako usunięcie)
      ...(change.note !== undefined ? { p_note: change.note ?? "" } : {}),
    }),
  );
}

// ---------- nawyk: formularz ----------

const planShape = {
  targetValue: z.number({ error: "Wpisz liczbę, np. 10" }).positive("Cel musi być większy od zera").max(9_999_999, "Za duży cel"),
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
    source: z.enum(HEALTH_METRICS).nullable().optional(),
    sourceMin: z.number({ error: "Wpisz liczbę, np. 7000" }).positive("Próg musi być większy od zera").max(99_999_999, "Za duży próg").nullable().optional(),
    cue: z.string().trim().max(80, "Maks. 80 znaków").nullable().optional(),
    why: z.string().trim().max(120, "Maks. 120 znaków").nullable().optional(),
    ...planShape,
  })
  .superRefine((v, ctx) => {
    if (v.goal === "quit" && (v.kind !== "check" || v.frequency !== "daily"))
      ctx.addIssue({ code: "custom", path: ["goal"], message: "Nawyk „rzucam” jest codzienny i typu tak/nie" });
    if (v.source && v.goal === "quit")
      ctx.addIssue({ code: "custom", path: ["source"], message: "Nawyk „rzucam” wpisujesz tylko ręcznie" });
    if (v.source && v.kind === "check" && !v.sourceMin)
      ctx.addIssue({ code: "custom", path: ["sourceMin"], message: "Podaj próg, np. 7000 kroków" });
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

function sourceColumns(v: HabitForm) {
  const source = v.goal === "build" ? (v.source ?? null) : null;
  return {
    source,
    source_min: source && v.kind === "check" ? (v.sourceMin ?? null) : null,
    cue: v.cue?.trim() || null,
    why: v.why?.trim() || null,
  };
}

/** Nowy nawyk jednym wywołaniem. `id` nadaje formularz raz, więc ponowny zapis po zerwanym połączeniu nie zrobi duplikatu. */
export async function createHabit(supabase: Supabase, input: HabitForm, id: string = crypto.randomUUID()): Promise<string> {
  const v = habitFormSchema.parse(input);
  const extra = sourceColumns(v);
  const { data } = check(
    await supabase.rpc("add_habit", {
      p_id: id,
      p_name: v.name,
      p_kind: v.kind,
      p_unit: v.kind === "duration" ? "min" : v.kind === "count" ? v.unit : null,
      p_icon: v.icon,
      p_color: v.color,
      p_category_id: v.categoryId,
      ...planArgs(v),
      ...(v.startDate ? { p_start_date: v.startDate } : {}),
      p_goal: v.goal,
      p_time_of_day: v.timeOfDay,
      p_source: extra.source,
      p_source_min: extra.source_min,
      p_cue: extra.cue,
      p_why: extra.why,
    }),
  );
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
        ...sourceColumns(v),
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

/**
 * Dni, które nawyk spędził w archiwum (od dnia archiwizacji do wczoraj): po przywróceniu stają się pauzą,
 * więc nie przerywają serii i nie obniżają skuteczności („historia zostaje”). null = nie ma czego wypełniać.
 */
export function archiveGap(habit: Pick<Habit, "id" | "archivedOn">, entries: readonly Entry[], today: LocalDate): { startDate: LocalDate; endDate: LocalDate } | null {
  if (!habit.archivedOn) return null;
  // dzień archiwizacji zostaje, jeśli coś tego dnia zapisano
  const start = entries.some((e) => e.habitId === habit.id && e.date === habit.archivedOn) ? addDays(habit.archivedOn, 1) : habit.archivedOn;
  const end = addDays(today, -1);
  return start <= end ? { startDate: start, endDate: end } : null;
}

export async function restoreHabit(supabase: Supabase, habitId: string, gap: { startDate: LocalDate; endDate: LocalDate } | null): Promise<void> {
  if (gap) await addPause(supabase, { habitId, ...gap, reason: "Archiwum" });
  await setArchived(supabase, habitId, false);
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

/** Kategoria o tej nazwie; jeśli już jest (np. po ponownym zapisie formularza), zwraca istniejącą. */
export async function createCategory(supabase: Supabase, name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Podaj nazwę kategorii");
  if (trimmed.length > 40) throw new Error("Nazwa kategorii: maks. 40 znaków");
  const existing = check(await supabase.from("categories").select("id").eq("name", trimmed).maybeSingle()).data;
  if (existing) return existing.id;
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

/**
 * Koniec pauzy albo urlopu: przyszła pauza znika, trwająca kończy się wczoraj
 * (dni, które już minęły, zostają neutralne — serie i statystyki się nie zmieniają).
 */
export async function endPause(supabase: Supabase, pause: { id: string; startDate: LocalDate }, today: LocalDate): Promise<void> {
  if (pause.startDate >= today) return deletePause(supabase, pause.id);
  check(await supabase.from("habit_pauses").update({ end_date: addDays(today, -1) }).eq("id", pause.id));
}

export function withPauseEnded(snapshot: Snapshot, pause: { id: string; startDate: LocalDate }, today: LocalDate): Snapshot {
  if (pause.startDate >= today) return withoutPause(snapshot, pause.id);
  return { ...snapshot, pauses: snapshot.pauses.map((p) => (p.id === pause.id ? { ...p, endDate: addDays(today, -1) } : p)) };
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

export type DayNoteInput = { date: LocalDate; text: string; mood: number | null };

/** Zapis notatki dnia (tekst i nastrój 1..5); bez tekstu i nastroju wiersz znika. */
export async function saveDayNote(supabase: Supabase, input: DayNoteInput): Promise<void> {
  if (!isLocalDate(input.date)) throw new Error("Zła data");
  const note = input.text.trim();
  if (note.length > 1000) throw new Error("Notatka może mieć najwyżej 1000 znaków");
  if (input.mood !== null && !(Number.isInteger(input.mood) && input.mood >= 1 && input.mood <= 5)) throw new Error("Nastrój od 1 do 5");
  if (!note && input.mood === null) {
    check(await supabase.from("day_notes").delete().eq("note_date", input.date));
    return;
  }
  check(
    await supabase
      .from("day_notes")
      .upsert({ note_date: input.date, note: note || null, mood: input.mood, updated_at: new Date().toISOString() }, { onConflict: "user_id,note_date" }), // eslint-disable-line no-restricted-syntax -- znacznik czasu
  );
}

export function withDayNote(snapshot: Snapshot, input: DayNoteInput): Snapshot {
  const rest = snapshot.notes.filter((n) => n.date !== input.date);
  const note = input.text.trim() || null;
  return { ...snapshot, notes: note || input.mood !== null ? [...rest, { date: input.date, note, mood: input.mood }] : rest };
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

// ---------- Apple Zdrowie: klucz dla Skrótu ----------

export type TokenStatus = { createdAt: string; lastUsedAt: string | null } | null;

export async function fetchTokenStatus(supabase: Supabase): Promise<TokenStatus> {
  const { data } = check(await supabase.from("api_tokens").select("created_at, last_used_at").maybeSingle());
  return data ? { createdAt: data.created_at, lastUsedAt: data.last_used_at } : null;
}

/** Nowy klucz (poprzedni przestaje działać). Jawny klucz widać tylko teraz. */
export async function newApiToken(supabase: Supabase): Promise<string> {
  const { data } = check(await supabase.rpc("new_api_token"));
  return data as string;
}

export async function revokeApiToken(supabase: Supabase): Promise<void> {
  check(await supabase.rpc("revoke_api_token"));
}
