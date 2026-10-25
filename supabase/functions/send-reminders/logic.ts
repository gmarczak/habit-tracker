/**
 * Czysta logika przypomnień (bez Deno i bez sieci), testowana w Vitest i wbudowywana do funkcji Edge.
 */
import { diffDays, localDate, startOfWeek, type LocalDate, type WeekStart } from "../../../lib/domain/dates";
import type { DayNote, Entry, Habit, Pause, ReminderKind } from "../../../lib/domain/model";
import { PART_LABELS, absence, easiestHabit, isLastDayOfWeek, manualDates, weeklyMessage, weeklySummary, yesterdayGap } from "../../../lib/domain/nudges";
import { badgeCount, buildDay, isAnsweredNo, type TodayItem } from "../../../lib/domain/today";
import { habitCount, habitsLeft } from "../../../lib/domain/words";

export type ReminderRow = { id: string; kind: ReminderKind; habitId: string | null; localTime: string };
export type UserContext = {
  timeZone: string;
  dayStartHour: number;
  weekStart: WeekStart;
  habits: Habit[];
  entries: Entry[];
  pauses: Pause[];
  /** notatki dnia (nastrój też jest zapisem: dzień nie jest „cichy”) */
  notes?: DayNote[];
};
/** badge: liczba na ikonie aplikacji (niezrobione wymagane dziś) */
export type Message = { reminderId: string; localDate: LocalDate; title: string; body: string; url: string; tag: string; badge: number };

/** Minuty od północy w strefie użytkownika. */
export function localMinutes(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Przypomnienie jest „na czasie” przez godzinę od ustawionej godziny (nadrabia przerwy crona). */
export const WINDOW_MINUTES = 60;
/** Cron co 5 minut: godzina spoza siatki (np. 23:57) liczy się od najbliższego wcześniejszego uruchomienia. */
const CRON_STEP = 5;

/**
 * Minuty liczone od początku dnia użytkownika (`dayStartHour`), nie od północy: okno nie przechodzi
 * na następny dzień (02:30 przy końcu dnia o 3:00 nie wyśle się drugi raz o 3:00 z listą nowego dnia),
 * a 23:30 przy końcu dnia o 3:00 nadrabia też po północy.
 */
export function isDue(reminderTime: string, nowMinutes: number, dayStartHour = 0): boolean {
  const rel = (minutes: number) => (minutes - dayStartHour * 60 + 1440) % 1440;
  const at = rel(toMinutes(reminderTime));
  const diff = rel(nowMinutes) - (at - (at % CRON_STEP));
  return diff >= 0 && diff < WINDOW_MINUTES;
}

function list(names: string[]): string {
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} i ${names.length - 3} więcej`;
}

/** Po tylu dniach ciszy zamiast zwykłych przypomnień idzie jedno łagodne dziennie. */
export const QUIET_AFTER_DAYS = 2;
/** Po tygodniu ciszy łagodne przypomnienie co trzeci dzień i w pierwszy dzień tygodnia. */
const SPARSE_AFTER_DAYS = 7;

function easyText(item: TodayItem): string {
  const { habit, plan } = item;
  const amount = habit.kind === "check" ? "" : ` ${plan.targetValue} ${habit.kind === "duration" ? "min" : (habit.unit ?? "")}`.trimEnd();
  const cue = habit.cue ? ` — ${habit.cue}` : "";
  return `${habit.name}${amount}${cue}`;
}

/**
 * Cisza w zapisach: zamiast „Zostało N” i „Wczoraj zostało N” jedno krótkie przypomnienie o porze porannej
 * (albo wieczornej, gdy poranne wyłączone) z najłatwiejszym nawykiem. Podsumowanie tygodnia zostaje.
 */
function quietMessage(user: UserContext, today: LocalDate, days: number): { title: string; body: string } | null {
  const newWeek = startOfWeek(today, user.weekStart) === today;
  if (days >= SPARSE_AFTER_DAYS && !newWeek && diffDays("2026-01-01", today) % 3 !== 0) return null;
  const easy = easiestHabit(user.habits, user.entries, user.pauses, today, user.weekStart);
  if (!easy) return null;
  return days >= SPARSE_AFTER_DAYS && newWeek
    ? { title: "Nowy tydzień, czysta karta", body: `Dziś wystarczy jedno: ${easyText(easy)}` }
    : { title: "Dziś wystarczy jedno", body: easyText(easy) };
}

/** Co wysłać (albo nic) dla przypomnień jednego użytkownika w chwili `now`. */
export function messagesFor(user: UserContext, reminders: ReminderRow[], now: Date): Message[] {
  const nowMin = localMinutes(now, user.timeZone);
  const today = localDate(now, user.timeZone, user.dayStartHour);
  const due = reminders.filter((r) => isDue(r.localTime, nowMin, user.dayStartHour));
  if (due.length === 0) return [];

  const view = buildDay(user.habits, user.entries, user.pauses, today, today, user.weekStart);
  // Nawyki z Apple Zdrowie odhacza Skrót (zwykle wieczorem) — nie przypominamy o nich. „Nie dziś” to już odpowiedź.
  const open = [...view.todo, ...view.thisWeek].filter((i) => !i.habit.source && !isAnsweredNo(i));
  const out: Message[] = [];

  const notes = user.notes ?? [];
  const silence = absence(user.habits, user.entries, user.pauses, notes, today, 60);
  // Wpisy ze Skrótu Apple Zdrowie nie znaczą, że ktoś otworzył aplikację
  const activeToday = manualDates(user.habits, user.entries, notes).has(today);
  const quiet = silence !== null && silence.days >= QUIET_AFTER_DAYS && !activeToday;
  // Łagodne przypomnienie niesie poranne, potem wieczorne, a bez nich najwcześniejsze inne (tygodniowe zostaje swoje)
  const carrier =
    reminders.find((r) => r.kind === "yesterday") ??
    reminders.find((r) => r.kind === "summary") ??
    [...reminders].filter((r) => r.kind !== "weekly").sort((a, b) => a.localTime.localeCompare(b.localTime))[0];

  for (const r of due) {
    const base = { reminderId: r.id, localDate: today, badge: badgeCount(view) };
    if (quiet && r.kind !== "weekly") {
      const msg = r.id === carrier?.id ? quietMessage(user, today, silence.days) : null;
      if (msg) out.push({ ...base, ...msg, url: "/", tag: "comeback" });
      continue;
    }
    switch (r.kind) {
      case "summary": {
        // „Na dziś” tylko wymagane dziś (jak liczba na ikonie); tygodniowe osobno, z postępem
        const forToday = open.filter((i) => !i.week);
        const forWeek = open.filter((i) => i.week);
        if (open.length === 0) break;
        const weekText = forWeek.map((i) => `${i.habit.name} ${i.week!.done}/${i.week!.required}`).join(", ");
        // Wczoraj wypadło: drugi brak z rzędu przerwie serię
        const again = forToday.filter((i) => i.missedLast);
        out.push({
          ...base,
          title:
            again.length > 0
              ? `Nie odpuść dwa razy: ${list(again.map((i) => i.habit.name))}`
              : forToday.length === 0
                ? "W tym tygodniu jeszcze"
                : forToday.length === 1
                  ? "Został jeden nawyk"
                  : `${habitsLeft(forToday.length)} na dziś`,
          body:
            forToday.length === 0
              ? weekText
              : `${list(forToday.map((i) => i.habit.name))}${forWeek.length ? ` · w tym tygodniu: ${weekText}` : ""}`,
          url: "/review",
          tag: "summary",
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
          body: `${list(gap.missing.map((i) => i.habit.name))} — uzupełnij, jeśli zrobiłeś.`,
          url: `/review?date=${gap.date}`,
          tag: "yesterday",
        });
        break;
      }
      case "weekly": {
        if (!isLastDayOfWeek(today, user.weekStart)) break;
        const msg = weeklyMessage(weeklySummary(user.habits, user.entries, user.pauses, today, user.weekStart));
        if (!msg) break;
        out.push({ ...base, ...msg, url: "/review/week", tag: "weekly" });
        break;
      }
      case "habit": {
        const item = open.find((i) => i.habit.id === r.habitId);
        if (!item) break;
        out.push({
          ...base,
          title: item.habit.name,
          body: item.week
            ? `${item.week.done} z ${item.week.required} w tym tygodniu`
            : item.habit.cue
              ? `${item.habit.cue.charAt(0).toUpperCase()}${item.habit.cue.slice(1)} — czas na ten nawyk.`
              : "Czas na dzisiejszy nawyk.",
          url: "/",
          tag: `habit-${item.habit.id}`,
        });
        break;
      }
    }
  }
  return out;
}
