// Edge Function: send-reminders. Wywoływana co 5 minut przez pg_cron (migracja reminders_cron).
// Źródło do bundla: `npm run build:functions` tworzy index.ts (z wbudowaną logiką z lib/domain).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { addDays, localDate, type WeekStart } from "../../../lib/domain/dates";
import type { DayNote, Entry, Habit, Pause } from "../../../lib/domain/model";
import { messagesFor, type ReminderRow } from "./logic";

declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Promise<Response>): void };

type Row = Record<string, unknown>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // Sekret crona i klucze VAPID są w Supabase Vault; funkcja push_config sprawdza sekret.
  const secret = req.headers.get("x-cron-secret") ?? "";
  const { data: config, error: configError } = await supabase.rpc("push_config", { p_secret: secret }).single();
  if (configError || !config) return json({ error: "unauthorized" }, 401);
  const { vapid_public, vapid_private, vapid_subject } = config as {
    vapid_public: string | null;
    vapid_private: string | null;
    vapid_subject: string | null;
  };
  // Brak któregoś sekretu w Vault: czytelny błąd zamiast wyjątku i 500 co 5 minut.
  const missing = Object.entries({ vapid_public, vapid_private, vapid_subject })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) return json({ error: "not_configured", missing }, 503);
  try {
    webpush.setVapidDetails(vapid_subject!, vapid_public!, vapid_private!);
  } catch (e) {
    return json({ error: "invalid_vapid_config", detail: e instanceof Error ? e.message : String(e) }, 503);
  }

  // Tryb testowy (tylko z sekretem crona): {"test_user_id": "..."} wysyła próbne powiadomienie na urządzenia użytkownika.
  const body = (await req.json().catch(() => ({}))) as { test_user_id?: unknown };
  if (typeof body.test_user_id === "string") {
    const { data: subs } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", body.test_user_id);
    const payload = JSON.stringify({ title: "Nawyki", body: "Testowe powiadomienie — przypomnienia działają.", url: "/", tag: "test" });
    const results: { status: number | string }[] = [];
    for (const s of (subs ?? []) as Row[]) {
      try {
        const res = await webpush.sendNotification(
          { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
          payload,
          { TTL: 600 },
        );
        results.push({ status: res.statusCode });
      } catch (err) {
        results.push({ status: (err as { statusCode?: number }).statusCode ?? String(err) });
      }
    }
    return json({ test: true, subscriptions: results.length, results });
  }

  const { data: reminders, error } = await supabase.from("reminders").select("id, user_id, kind, habit_id, local_time").eq("enabled", true);
  if (error) return json({ error: error.message }, 500);

  const byUser = new Map<string, ReminderRow[]>();
  for (const r of reminders as Row[]) {
    const list = byUser.get(r.user_id as string) ?? [];
    list.push({ id: r.id as string, kind: (r.kind as ReminderRow["kind"]) ?? (r.habit_id ? "habit" : "summary"), habitId: (r.habit_id as string | null) ?? null, localTime: String(r.local_time).slice(0, 5) });
    byUser.set(r.user_id as string, list);
  }

  const now = new Date();
  let sent = 0;
  let removed = 0;
  let failed = 0;

  for (const [userId, userReminders] of byUser) {
    const { data: profile } = await supabase.from("profiles").select("timezone, day_start_hour, week_start").eq("id", userId).single();
    if (!profile) continue;
    const today = localDate(now, profile.timezone, profile.day_start_hour);
    const since = addDays(today, -14);

    const [habitsRes, plansRes, entriesRes, pausesRes, subsRes, notesRes] = await Promise.all([
      // także zarchiwizowane w ostatnich dniach: podsumowanie tygodnia liczy je w dniach sprzed archiwizacji (jak aplikacja)
      supabase.from("habits").select("*").eq("user_id", userId).or(`archived_at.is.null,archived_at.gte.${since}`),
      supabase.from("habit_plans").select("*").eq("user_id", userId),
      supabase.from("habit_entries").select("habit_id, entry_date, value, skipped, note").eq("user_id", userId).gte("entry_date", since),
      supabase.from("habit_pauses").select("habit_id, start_date, end_date").eq("user_id", userId).gte("end_date", since),
      supabase.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", userId),
      // notatka albo nastrój to też zapis: dzień nie liczy się do ciszy
      supabase.from("day_notes").select("note_date, mood").eq("user_id", userId).gte("note_date", since),
    ]);
    const subs = (subsRes.data ?? []) as Row[];
    if (subs.length === 0) continue;

    const plans = (plansRes.data ?? []) as Row[];
    const habits: Habit[] = ((habitsRes.data ?? []) as Row[]).map((h) => ({
      id: h.id as string,
      name: h.name as string,
      kind: h.kind as Habit["kind"],
      unit: (h.unit as string | null) ?? null,
      icon: (h.icon as string | null) ?? null,
      color: "green",
      categoryId: null,
      timeOfDay: (h.time_of_day as Habit["timeOfDay"]) ?? null,
      source: (h.source as Habit["source"]) ?? null,
      cue: (h.cue as string | null) ?? null,
      goal: h.goal === "quit" ? "quit" : "build",
      startDate: h.start_date as string,
      sortOrder: h.sort_order as number,
      archivedAt: (h.archived_at as string | null) ?? null,
      archivedOn: h.archived_at ? localDate(new Date(h.archived_at as string), profile.timezone, profile.day_start_hour) : null,
      plans: plans
        .filter((p) => p.habit_id === h.id)
        .map((p) => ({
          validFrom: p.valid_from as string,
          frequency: p.frequency as Habit["plans"][number]["frequency"],
          weekdays: (p.weekdays as number[] | null) ?? null,
          timesPerWeek: (p.times_per_week as number | null) ?? null,
          intervalDays: (p.interval_days as number | null) ?? null,
          targetValue: Number(p.target_value),
        }))
        .sort((a, b) => (a.validFrom < b.validFrom ? -1 : 1)),
    }));
    const entries: Entry[] = ((entriesRes.data ?? []) as Row[]).map((e) => ({
      habitId: e.habit_id as string,
      date: e.entry_date as string,
      value: e.value === null ? null : Number(e.value),
      skipped: Boolean(e.skipped),
      note: (e.note as string | null) ?? null,
    }));
    const pauses: Pause[] = ((pausesRes.data ?? []) as Row[]).map((p) => ({
      habitId: (p.habit_id as string | null) ?? null,
      startDate: p.start_date as string,
      endDate: p.end_date as string,
    }));
    const notes: DayNote[] = ((notesRes.data ?? []) as Row[]).map((n) => ({
      date: n.note_date as string,
      note: null,
      mood: (n.mood as number | null) ?? null,
    }));

    const messages = messagesFor(
      { timeZone: profile.timezone, dayStartHour: profile.day_start_hour, weekStart: profile.week_start as WeekStart, habits, entries, pauses, notes },
      userReminders,
      now,
    );

    for (const m of messages) {
      // Idempotencja: jedno powiadomienie na przypomnienie na dzień lokalny.
      const { data: claimed } = await supabase
        .from("notification_log")
        .upsert({ reminder_id: m.reminderId, local_date: m.localDate }, { onConflict: "reminder_id,local_date", ignoreDuplicates: true })
        .select("reminder_id");
      if (!claimed || claimed.length === 0) continue;

      const payload = JSON.stringify({ title: m.title, body: m.body, url: m.url, tag: m.tag, badge: m.badge });
      let delivered = 0;
      for (const s of subs) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } }, payload, { TTL: 3600 });
          sent++;
          delivered++;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint as string);
            removed++;
          } else {
            failed++;
            console.error("push failed", status, (err as { body?: string }).body ?? String(err));
          }
        }
      }
      // Nic nie dotarło (np. chwilowy błąd usługi push): zwolnij dzień, kolejne uruchomienie w oknie spróbuje ponownie
      if (delivered === 0) await supabase.from("notification_log").delete().eq("reminder_id", m.reminderId).eq("local_date", m.localDate);
      // eslint-disable-next-line no-restricted-syntax -- znacznik czasu, nie data dnia
      await supabase.from("push_subscriptions").update({ last_used_at: now.toISOString() }).eq("user_id", userId);
    }
  }

  return json({ users: byUser.size, sent, removed, failed });
});
