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
      return diffDays(cadenceAnchor(habit, plan), date) % n === 0 ? "required" : "not_required";
    }
    case "weekly_count":
      return "flexible";
  }
}
function cadenceAnchor(habit, plan) {
  let anchor = plan.validFrom;
  for (let i = habit.plans.indexOf(plan) - 1; i >= 0; i--) {
    const prev = habit.plans[i];
    if (prev.frequency !== "every_n_days" || prev.intervalDays !== plan.intervalDays) break;
    anchor = prev.validFrom;
  }
  return anchor;
}
function entryOutcome(entry, plan, goal = "build") {
  if (goal === "quit") {
    if (!entry) return "done";
    if (entry.skipped) return "skipped";
    return (entry.value ?? 0) > 0 ? "none" : "done";
  }
  if (!entry) return "none";
  if (entry.skipped) return "skipped";
  const value = entry.value ?? 0;
  const target = plan?.targetValue ?? 1;
  if (value >= target) return "done";
  return value > 0 ? "partial" : "none";
}
var indexCache = /* @__PURE__ */ new WeakMap();
function entriesByDate(entries, habitId) {
  let index = indexCache.get(entries);
  if (!index) {
    index = /* @__PURE__ */ new Map();
    for (const e of entries) {
      let byDate = index.get(e.habitId);
      if (!byDate) index.set(e.habitId, byDate = /* @__PURE__ */ new Map());
      byDate.set(e.date, e);
    }
    indexCache.set(entries, index);
  }
  return index.get(habitId) ?? EMPTY;
}
var EMPTY = /* @__PURE__ */ new Map();

// lib/domain/progress.ts
function ctx(habit, entries, pauses, today, weekStart) {
  return { habit, byDate: entriesByDate(entries, habit.id), pauses, today, weekStart };
}
function dayState(habit, entries, pauses, date, today) {
  if (date > today) return "future";
  const req = requirementOn(habit, pauses, date);
  if (req === "before_start") return "before_start";
  if (habit.goal === "quit") {
    const entry = entriesByDate(entries, habit.id).get(date);
    if (entry?.skipped) return "skipped";
    if (entry && (entry.value ?? 0) > 0) return "missed";
    if (req === "paused") return "paused";
    if (req === "not_required") return "not_required";
    return "done";
  }
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
  const timesPerWeek = Math.min(...covered.map((d) => planOn(c.habit, d)?.timesPerWeek ?? 1));
  let available = 0;
  let done = 0;
  for (const d of covered) {
    const outcome = entryOutcome(c.byDate.get(d), planOn(c.habit, d), c.habit.goal);
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
    const outcome = entryOutcome(c.byDate.get(d), plan, c.habit.goal);
    if (outcome === "done") streak++;
    else if (outcome === "skipped" || d === c.today && c.habit.goal !== "quit") continue;
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
    const outcome = entryOutcome(c.byDate.get(d), plan, c.habit.goal);
    if (outcome === "done") best = Math.max(best, ++run);
    else if (outcome === "skipped" || d === c.today && c.habit.goal !== "quit") continue;
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
function completionRate(habit, entries, pauses, from, to, today, weekStart) {
  const c = ctx(habit, entries, pauses, today, weekStart);
  const end = to <= today ? to : today;
  let chances = 0;
  let wins = 0;
  const weeksSeen = /* @__PURE__ */ new Set();
  for (let d = from > habit.startDate ? from : habit.startDate; d <= end; d = addDays(d, 1)) {
    const plan = planOn(habit, d);
    if (!plan) continue;
    if (unitOf(plan.frequency) === "weeks") {
      const ws = startOfWeek(d, weekStart);
      if (weeksSeen.has(ws)) continue;
      weeksSeen.add(ws);
      const week = evaluateWeek(c, ws);
      if (week.result === "met" || week.result === "failed") {
        chances++;
        if (week.result === "met") wins++;
      }
      continue;
    }
    const req = requirementOn(habit, pauses, d);
    if (req !== "required") continue;
    const outcome = entryOutcome(c.byDate.get(d), plan, c.habit.goal);
    if (outcome === "skipped") continue;
    if (d === today && outcome !== "done" && habit.goal !== "quit") continue;
    chances++;
    if (outcome === "done") wins++;
  }
  return chances === 0 ? null : wins / chances;
}

// lib/domain/today.ts
function buildDay(habits, entries, pauses, date, today, weekStart) {
  const view = { date, todo: [], thisWeek: [], done: [], quit: [], progress: { done: 0, total: 0 } };
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
      entry: entriesByDate(entries, habit.id).get(date),
      streak: streakOf(habit, entries, pauses, today, weekStart),
      week: req === "flexible" ? currentWeekProgress(habit, entries, pauses, date, weekStart) : null
    };
    if (req === "required") {
      if (state !== "skipped") view.progress.total++;
      if (state === "done") view.progress.done++;
    }
    if (habit.goal === "quit") view.quit.push(item);
    else if (state === "done" || state === "skipped") view.done.push(item);
    else if (req === "flexible") {
      if (item.week?.result !== "met") view.thisWeek.push(item);
      else view.done.push(item);
    } else view.todo.push(item);
  }
  return view;
}
function dayProgress(habits, entries, pauses, date, history = false) {
  const progress = { done: 0, total: 0, settled: 0 };
  for (const habit of habits) {
    if (habit.archivedAt !== null && !(history && habit.archivedOn && date < habit.archivedOn)) continue;
    if (requirementOn(habit, pauses, date) !== "required" || !planOn(habit, date)) continue;
    const state = dayState(habit, entries, pauses, date, date);
    if (state !== "skipped") progress.total++;
    if (state === "done") progress.done++;
    if (state === "done" || state === "missed") progress.settled++;
  }
  return progress;
}
function badgeCount(view) {
  return view.todo.length;
}

// lib/domain/stats.ts
function dayTotals(habits, entries, pauses, date) {
  return { date, ...dayProgress(habits, entries, pauses, date, true) };
}
function isPerfect(d) {
  return d.total > 0 && d.done === d.total;
}
function weekReview(habits, entries, pauses, anyDayInWeek, today, weekStart) {
  const first = startOfWeek(anyDayInWeek, weekStart);
  const days = Array.from({ length: 7 }, (_, i) => addDays(first, i)).map(
    (d) => d > today ? { date: d, done: 0, total: 0 } : dayTotals(habits, entries, pauses, d)
  );
  return {
    days,
    done: days.reduce((s, d) => s + d.done, 0),
    total: days.reduce((s, d) => s + (d.date === today ? d.settled ?? d.done : d.total), 0),
    perfectDays: days.filter(isPerfect).length
  };
}

// lib/domain/nudges.ts
var PART_LABELS = { morning: "Rano", day: "W ci\u0105gu dnia", evening: "Wieczorem" };
function yesterdayGap(habits, entries, pauses, today, weekStart) {
  const date = addDays(today, -1);
  const view = buildDay(habits, entries, pauses, date, today, weekStart);
  if (view.progress.total === 0 || view.todo.length === 0) return null;
  return { date, missing: view.todo, done: view.progress.done, total: view.progress.total };
}
function isLastDayOfWeek(date, weekStart) {
  return addDays(startOfWeek(date, weekStart), 6) === date;
}
function weeklySummary(habits, entries, pauses, today, weekStart) {
  const first = startOfWeek(today, weekStart);
  const review = weekReview(habits, entries, pauses, today, today, weekStart);
  const active = habits.filter((h) => h.archivedAt === null && h.startDate <= today);
  const rated = [];
  const weekly = [];
  for (const habit of active) {
    const plan = planOn(habit, today);
    if (!plan) continue;
    if (unitOf(plan.frequency) === "weeks") {
      const w = currentWeekProgress(habit, entries, pauses, today, weekStart);
      if (w.required > 0) weekly.push({ name: habit.name, done: w.done, required: w.required });
      continue;
    }
    const rate = completionRate(habit, entries, pauses, first, today, today, weekStart);
    if (rate !== null) rated.push({ name: habit.name, rate });
  }
  const sorted = [...rated].sort((a, b) => b.rate - a.rate);
  const best = sorted.length >= 2 && sorted[0].rate > sorted[sorted.length - 1].rate ? sorted[0] : null;
  const worst = best ? sorted[sorted.length - 1] : null;
  return {
    weekStart: first,
    share: review.total === 0 ? null : review.done / review.total,
    perfectDays: review.perfectDays,
    daysSoFar: review.days.filter((d) => d.date <= today && d.total > 0).length,
    best,
    worst,
    weekly
  };
}
function weeklyMessage(s) {
  if (s.share === null && s.weekly.length === 0) return null;
  const pct = (x) => `${Math.round(x * 100)}%`;
  const parts = [];
  if (s.share !== null) parts.push(`Idealne dni: ${s.perfectDays} z ${s.daysSoFar}`);
  if (s.best && s.worst) parts.push(`Najlepiej: ${s.best.name} (${pct(s.best.rate)})`, `Do poprawy: ${s.worst.name} (${pct(s.worst.rate)})`);
  for (const w of s.weekly) parts.push(`${w.name} ${w.done}/${w.required}`);
  return { title: s.share === null ? "Tw\xF3j tydzie\u0144" : `Tw\xF3j tydzie\u0144: ${pct(s.share)}`, body: parts.join(" \xB7 ") };
}

// lib/domain/words.ts
function plural(n, one, few, many) {
  if (n === 1) return one;
  const mod10 = n % 10;
  const mod100 = n % 100;
  return Number.isInteger(n) && mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
}
function habitCount(n) {
  return `${n} ${plural(n, "nawyk", "nawyki", "nawyk\xF3w")}`;
}
function habitsLeft(n, capital = true) {
  const verb = plural(n, "zosta\u0142", "zosta\u0142y", "zosta\u0142o");
  return `${capital ? verb.charAt(0).toUpperCase() + verb.slice(1) : verb} ${habitCount(n)}`;
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
  const open = [...view.todo, ...view.thisWeek].filter((i) => !i.habit.source);
  const out = [];
  for (const r of due) {
    const base = { reminderId: r.id, localDate: today, badge: badgeCount(view) };
    switch (r.kind) {
      case "summary": {
        if (open.length === 0) break;
        out.push({
          ...base,
          title: open.length === 1 ? "Zosta\u0142 jeden nawyk" : `${habitsLeft(open.length)} na dzi\u015B`,
          body: list(open.map((i) => i.habit.name)),
          url: "/",
          tag: "summary"
        });
        break;
      }
      case "morning":
      case "day":
      case "evening": {
        const part = open.filter((i) => i.habit.timeOfDay === r.kind);
        if (part.length === 0) break;
        out.push({ ...base, title: `${PART_LABELS[r.kind]}: ${habitCount(part.length)}`, body: list(part.map((i) => i.habit.name)), url: "/", tag: `part-${r.kind}` });
        break;
      }
      case "yesterday": {
        const gap = yesterdayGap(user.habits, user.entries, user.pauses, today, user.weekStart);
        if (!gap) break;
        out.push({
          ...base,
          title: `Wczoraj ${habitsLeft(gap.missing.length, false)}`,
          body: `${list(gap.missing.map((i) => i.habit.name))} \u2014 uzupe\u0142nij, je\u015Bli zrobi\u0142e\u015B.`,
          url: `/?date=${gap.date}`,
          tag: "yesterday"
        });
        break;
      }
      case "weekly": {
        if (!isLastDayOfWeek(today, user.weekStart)) break;
        const msg = weeklyMessage(weeklySummary(user.habits, user.entries, user.pauses, today, user.weekStart));
        if (!msg) break;
        out.push({ ...base, ...msg, url: "/stats", tag: "weekly" });
        break;
      }
      case "habit": {
        const item = open.find((i) => i.habit.id === r.habitId);
        if (!item) break;
        out.push({
          ...base,
          title: item.habit.name,
          body: item.week ? `${item.week.done} z ${item.week.required} w tym tygodniu` : item.habit.cue ? `${item.habit.cue.charAt(0).toUpperCase()}${item.habit.cue.slice(1)} \u2014 czas na ten nawyk.` : "Czas na dzisiejszy nawyk.",
          url: "/",
          tag: `habit-${item.habit.id}`
        });
        break;
      }
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
  const { data: reminders, error } = await supabase.from("reminders").select("id, user_id, kind, habit_id, local_time").eq("enabled", true);
  if (error) return json({ error: error.message }, 500);
  const byUser = /* @__PURE__ */ new Map();
  for (const r of reminders) {
    const list2 = byUser.get(r.user_id) ?? [];
    list2.push({ id: r.id, kind: r.kind ?? (r.habit_id ? "habit" : "summary"), habitId: r.habit_id ?? null, localTime: String(r.local_time).slice(0, 5) });
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
      // także zarchiwizowane w ostatnich dniach: podsumowanie tygodnia liczy je w dniach sprzed archiwizacji (jak aplikacja)
      supabase.from("habits").select("*").eq("user_id", userId).or(`archived_at.is.null,archived_at.gte.${since}`),
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
      timeOfDay: h.time_of_day ?? null,
      source: h.source ?? null,
      cue: h.cue ?? null,
      goal: h.goal === "quit" ? "quit" : "build",
      startDate: h.start_date,
      sortOrder: h.sort_order,
      archivedAt: h.archived_at ?? null,
      archivedOn: h.archived_at ? localDate(new Date(h.archived_at), profile.timezone, profile.day_start_hour) : null,
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
      const payload = JSON.stringify({ title: m.title, body: m.body, url: m.url, tag: m.tag, badge: m.badge });
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
