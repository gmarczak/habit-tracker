// WYGENEROWANE z src.ts przez npm run build:functions. Nie edytuj ręcznie.

// supabase/functions/send-reminders/src.ts
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// lib/domain/dates.ts
var DAY_MS = 864e5;
function pad(n, len = 2) {
  return String(n).padStart(len, "0");
}
function toUtcMs(date) {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
function fromUtcMs(ms) {
  const t = new Date(ms);
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
function localDate(now, timeZone, dayStartHour = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  const date = `${pad(get("year"), 4)}-${pad(get("month"))}-${pad(get("day"))}`;
  return get("hour") < dayStartHour ? addDays(date, -1) : date;
}
function addDays(date, days) {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}
function diffDays(from, to) {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}
function isoWeekday(date) {
  const d = new Date(toUtcMs(date)).getUTCDay();
  return d === 0 ? 7 : d;
}
function startOfWeek(date, weekStart = 1) {
  const wd = isoWeekday(date);
  const offset = weekStart === 1 ? wd - 1 : wd % 7;
  return addDays(date, -offset);
}
function eachDay(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// lib/domain/model.ts
function unitOf(frequency) {
  return frequency === "weekly_count" ? "weeks" : "days";
}

// lib/domain/schedule.ts
function planOn(habit, date) {
  let found = null;
  for (const plan of habit.plans) {
    if (plan.validFrom <= date) found = plan;
    else break;
  }
  return found;
}
function isPaused(pauses, habitId, date) {
  return pauses.some(
    (p) => (p.habitId === null || p.habitId === habitId) && p.startDate <= date && date <= p.endDate
  );
}
function requirementOn(habit, pauses, date) {
  if (date < habit.startDate) return "before_start";
  const plan = planOn(habit, date);
  if (!plan) return "before_start";
  if (isPaused(pauses, habit.id, date)) return "paused";
  switch (plan.frequency) {
    case "daily":
      return "required";
    case "weekdays":
      return (plan.weekdays ?? []).includes(isoWeekday(date)) ? "required" : "not_required";
    case "every_n_days": {
      const n = plan.intervalDays ?? 1;
      return diffDays(plan.validFrom, date) % n === 0 ? "required" : "not_required";
    }
    case "weekly_count":
      return "flexible";
  }
}
function entryOutcome(entry, plan) {
  if (!entry) return "none";
  if (entry.skipped) return "skipped";
  const value = entry.value ?? 0;
  const target = plan?.targetValue ?? 1;
  if (value >= target) return "done";
  return value > 0 ? "partial" : "none";
}
function entriesByDate(entries, habitId) {
  const map = /* @__PURE__ */ new Map();
  for (const e of entries) if (e.habitId === habitId) map.set(e.date, e);
  return map;
}

// lib/domain/progress.ts
function ctx(habit, entries, pauses, today, weekStart) {
  return { habit, byDate: entriesByDate(entries, habit.id), pauses, today, weekStart };
}
function dayState(habit, entries, pauses, date, today) {
  if (date > today) return "future";
  const req = requirementOn(habit, pauses, date);
  if (req === "before_start") return "before_start";
  const outcome = entryOutcome(entriesByDate(entries, habit.id).get(date), planOn(habit, date));
  if (outcome === "done") return "done";
  if (outcome === "skipped") return "skipped";
  if (req === "paused") return "paused";
  if (outcome === "partial") return req === "required" && date === today ? "pending" : "partial";
  if (req === "not_required") return "not_required";
  if (req === "flexible") return "open";
  return date === today ? "pending" : "missed";
}
function evaluateWeek(c, weekStartDate) {
  const days = eachDay(weekStartDate, addDays(weekStartDate, 6));
  const covered = days.filter((d) => d >= c.habit.startDate && planOn(c.habit, d)?.frequency === "weekly_count");
  if (covered.length === 0) return { weekStart: weekStartDate, done: 0, required: 0, result: "boundary" };
  const lastCovered = covered[covered.length - 1];
  const timesPerWeek = planOn(c.habit, lastCovered)?.timesPerWeek ?? 1;
  let available = 0;
  let done = 0;
  for (const d of covered) {
    const outcome = entryOutcome(c.byDate.get(d), planOn(c.habit, d));
    if (outcome === "done") done++;
    if (outcome !== "skipped" && !isPaused(c.pauses, c.habit.id, d)) available++;
  }
  if (available === 0) return { weekStart: weekStartDate, done, required: 0, result: "neutral" };
  const required = Math.ceil(timesPerWeek * available / 7);
  const isCurrent = weekStartDate <= c.today && c.today <= addDays(weekStartDate, 6);
  const result = done >= required ? "met" : isCurrent ? "neutral" : "failed";
  return { weekStart: weekStartDate, done, required, result };
}
function currentWeekProgress(habit, entries, pauses, today, weekStart) {
  const c = ctx(habit, entries, pauses, today, weekStart);
  return evaluateWeek(c, startOfWeek(today, weekStart));
}
function currentDays(c) {
  let streak = 0;
  for (let d = c.today; d >= c.habit.startDate; d = addDays(d, -1)) {
    const plan = planOn(c.habit, d);
    if (!plan || unitOf(plan.frequency) !== "days") break;
    const req = requirementOn(c.habit, c.pauses, d);
    if (req === "paused" || req === "not_required") continue;
    const outcome = entryOutcome(c.byDate.get(d), plan);
    if (outcome === "done") streak++;
    else if (outcome === "skipped" || d === c.today) continue;
    else break;
  }
  return streak;
}
function currentWeeks(c) {
  let streak = 0;
  for (let ws = startOfWeek(c.today, c.weekStart); ; ws = addDays(ws, -7)) {
    const week = evaluateWeek(c, ws);
    if (week.result === "met") streak++;
    else if (week.result === "neutral") continue;
    else break;
  }
  return streak;
}
function bestDays(c) {
  let best = 0;
  let run = 0;
  for (let d = c.habit.startDate; d <= c.today; d = addDays(d, 1)) {
    const plan = planOn(c.habit, d);
    if (!plan || unitOf(plan.frequency) !== "days") {
      run = 0;
      continue;
    }
    const req = requirementOn(c.habit, c.pauses, d);
    if (req === "paused" || req === "not_required") continue;
    const outcome = entryOutcome(c.byDate.get(d), plan);
    if (outcome === "done") best = Math.max(best, ++run);
    else if (outcome === "skipped" || d === c.today) continue;
    else run = 0;
  }
  return best;
}
function bestWeeks(c) {
  let best = 0;
  let run = 0;
  const last = startOfWeek(c.today, c.weekStart);
  for (let ws = startOfWeek(c.habit.startDate, c.weekStart); ws <= last; ws = addDays(ws, 7)) {
    const week = evaluateWeek(c, ws);
    if (week.result === "met") best = Math.max(best, ++run);
    else if (week.result !== "neutral") run = 0;
  }
  return best;
}
function streakOf(habit, entries, pauses, today, weekStart) {
  const c = ctx(habit, entries, pauses, today, weekStart);
  const plan = planOn(habit, today) ?? habit.plans[habit.plans.length - 1] ?? null;
  const unit = plan ? unitOf(plan.frequency) : "days";
  if (today < habit.startDate) return { current: 0, best: 0, unit };
  return unit === "days" ? { current: currentDays(c), best: bestDays(c), unit } : { current: currentWeeks(c), best: bestWeeks(c), unit };
}

// lib/domain/today.ts
function buildDay(habits, entries, pauses, date, today, weekStart) {
  const view = { date, todo: [], thisWeek: [], done: [], progress: { done: 0, total: 0 } };
  const active = habits.filter((h) => h.archivedAt === null).sort((a, b) => a.sortOrder - b.sortOrder);
  for (const habit of active) {
    const req = requirementOn(habit, pauses, date);
    if (req === "before_start" || req === "paused" || req === "not_required") continue;
    const plan = planOn(habit, date);
    if (!plan) continue;
    const state = dayState(habit, entries, pauses, date, date);
    const item = {
      habit,
      plan,
      state,
      entry: entries.find((e) => e.habitId === habit.id && e.date === date),
      streak: streakOf(habit, entries, pauses, today, weekStart),
      week: req === "flexible" ? currentWeekProgress(habit, entries, pauses, date, weekStart) : null
    };
    if (req === "required") {
      if (state !== "skipped") view.progress.total++;
      if (state === "done") view.progress.done++;
    }
    if (state === "done" || state === "skipped") view.done.push(item);
    else if (req === "flexible") {
      if (item.week?.result !== "met") view.thisWeek.push(item);
      else view.done.push(item);
    } else view.todo.push(item);
  }
  return view;
}

// supabase/functions/send-reminders/logic.ts
function localMinutes(now, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
var WINDOW_MINUTES = 60;
function isDue(reminderTime, nowMinutes) {
  const diff = nowMinutes - toMinutes(reminderTime);
  return diff >= 0 && diff < WINDOW_MINUTES;
}
function list(names) {
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} i ${names.length - 3} wi\u0119cej`;
}
function messagesFor(user, reminders, now) {
  const nowMin = localMinutes(now, user.timeZone);
  const today = localDate(now, user.timeZone, user.dayStartHour);
  const due = reminders.filter((r) => isDue(r.localTime, nowMin));
  if (due.length === 0) return [];
  const view = buildDay(user.habits, user.entries, user.pauses, today, today, user.weekStart);
  const open = [...view.todo, ...view.thisWeek];
  const out = [];
  for (const r of due) {
    if (r.habitId === null) {
      if (open.length === 0) continue;
      const names = open.map((i) => i.habit.name);
      out.push({
        reminderId: r.id,
        localDate: today,
        title: open.length === 1 ? "Zosta\u0142 jeden nawyk" : `Zosta\u0142y ${open.length} nawyki na dzi\u015B`,
        body: list(names),
        url: "/",
        tag: "summary"
      });
    } else {
      const item = open.find((i) => i.habit.id === r.habitId);
      if (!item) continue;
      out.push({
        reminderId: r.id,
        localDate: today,
        title: item.habit.name,
        body: item.week ? `${item.week.done} z ${item.week.required} w tym tygodniu` : "Czas na dzisiejszy nawyk.",
        url: "/",
        tag: `habit-${item.habit.id}`
      });
    }
  }
  return out;
}

// supabase/functions/send-reminders/src.ts
var json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false }
  });
  const secret = req.headers.get("x-cron-secret") ?? "";
  const { data: config, error: configError } = await supabase.rpc("push_config", { p_secret: secret }).single();
  if (configError || !config) return json({ error: "unauthorized" }, 401);
  const { vapid_public, vapid_private, vapid_subject } = config;
  const missing = Object.entries({ vapid_public, vapid_private, vapid_subject }).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) return json({ error: "not_configured", missing }, 503);
  try {
    webpush.setVapidDetails(vapid_subject, vapid_public, vapid_private);
  } catch (e) {
    return json({ error: "invalid_vapid_config", detail: e instanceof Error ? e.message : String(e) }, 503);
  }
  const body = await req.json().catch(() => ({}));
  if (typeof body.test_user_id === "string") {
    const { data: subs } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", body.test_user_id);
    const payload = JSON.stringify({ title: "Nawyki", body: "Testowe powiadomienie \u2014 przypomnienia dzia\u0142aj\u0105.", url: "/", tag: "test" });
    const results = [];
    for (const s of subs ?? []) {
      try {
        const res = await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 600 }
        );
        results.push({ status: res.statusCode });
      } catch (err) {
        results.push({ status: err.statusCode ?? String(err) });
      }
    }
    return json({ test: true, subscriptions: results.length, results });
  }
  const { data: reminders, error } = await supabase.from("reminders").select("id, user_id, habit_id, local_time").eq("enabled", true);
  if (error) return json({ error: error.message }, 500);
  const byUser = /* @__PURE__ */ new Map();
  for (const r of reminders) {
    const list2 = byUser.get(r.user_id) ?? [];
    list2.push({ id: r.id, habitId: r.habit_id ?? null, localTime: String(r.local_time).slice(0, 5) });
    byUser.set(r.user_id, list2);
  }
  const now = /* @__PURE__ */ new Date();
  let sent = 0;
  let removed = 0;
  for (const [userId, userReminders] of byUser) {
    const { data: profile } = await supabase.from("profiles").select("timezone, day_start_hour, week_start").eq("id", userId).single();
    if (!profile) continue;
    const today = localDate(now, profile.timezone, profile.day_start_hour);
    const since = addDays(today, -14);
    const [habitsRes, plansRes, entriesRes, pausesRes, subsRes] = await Promise.all([
      supabase.from("habits").select("*").eq("user_id", userId).is("archived_at", null),
      supabase.from("habit_plans").select("*").eq("user_id", userId),
      supabase.from("habit_entries").select("habit_id, entry_date, value, skipped, note").eq("user_id", userId).gte("entry_date", since),
      supabase.from("habit_pauses").select("habit_id, start_date, end_date").eq("user_id", userId).gte("end_date", since),
      supabase.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", userId)
    ]);
    const subs = subsRes.data ?? [];
    if (subs.length === 0) continue;
    const plans = plansRes.data ?? [];
    const habits = (habitsRes.data ?? []).map((h) => ({
      id: h.id,
      name: h.name,
      kind: h.kind,
      unit: h.unit ?? null,
      icon: h.icon ?? null,
      color: "green",
      categoryId: null,
      startDate: h.start_date,
      sortOrder: h.sort_order,
      archivedAt: null,
      plans: plans.filter((p) => p.habit_id === h.id).map((p) => ({
        validFrom: p.valid_from,
        frequency: p.frequency,
        weekdays: p.weekdays ?? null,
        timesPerWeek: p.times_per_week ?? null,
        intervalDays: p.interval_days ?? null,
        targetValue: Number(p.target_value)
      })).sort((a, b) => a.validFrom < b.validFrom ? -1 : 1)
    }));
    const entries = (entriesRes.data ?? []).map((e) => ({
      habitId: e.habit_id,
      date: e.entry_date,
      value: e.value === null ? null : Number(e.value),
      skipped: Boolean(e.skipped),
      note: e.note ?? null
    }));
    const pauses = (pausesRes.data ?? []).map((p) => ({
      habitId: p.habit_id ?? null,
      startDate: p.start_date,
      endDate: p.end_date
    }));
    const messages = messagesFor(
      { timeZone: profile.timezone, dayStartHour: profile.day_start_hour, weekStart: profile.week_start, habits, entries, pauses },
      userReminders,
      now
    );
    for (const m of messages) {
      const { data: claimed } = await supabase.from("notification_log").upsert({ reminder_id: m.reminderId, local_date: m.localDate }, { onConflict: "reminder_id,local_date", ignoreDuplicates: true }).select("reminder_id");
      if (!claimed || claimed.length === 0) continue;
      const payload = JSON.stringify({ title: m.title, body: m.body, url: m.url, tag: m.tag });
      for (const s of subs) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
          sent++;
        } catch (err) {
          const status = err.statusCode;
          if (status === 404 || status === 410) {
            await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
            removed++;
          }
        }
      }
      await supabase.from("push_subscriptions").update({ last_used_at: now.toISOString() }).eq("user_id", userId);
    }
  }
  return json({ users: byUser.size, sent, removed });
});
