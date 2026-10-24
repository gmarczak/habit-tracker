/**
 * Czysta logika przypomnień (bez Deno i bez sieci), testowana w Vitest i wbudowywana do funkcji Edge.
 */
import { localDate, type LocalDate, type WeekStart } from "../../../lib/domain/dates";
import type { Entry, Habit, Pause, ReminderKind } from "../../../lib/domain/model";
import { PART_LABELS, isLastDayOfWeek, weeklyMessage, weeklySummary, yesterdayGap } from "../../../lib/domain/nudges";
import { badgeCount, buildDay } from "../../../lib/domain/today";
import { habitCount, habitsLeft } from "../../../lib/domain/words";

export type ReminderRow = { id: string; kind: ReminderKind; habitId: string | null; localTime: string };
export type UserContext = {
  timeZone: string;
  dayStartHour: number;
  weekStart: WeekStart;
  habits: Habit[];
  entries: Entry[];
  pauses: Pause[];
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

/** Co wysłać (albo nic) dla przypomnień jednego użytkownika w chwili `now`. */
export function messagesFor(user: UserContext, reminders: ReminderRow[], now: Date): Message[] {
  const nowMin = localMinutes(now, user.timeZone);
  const today = localDate(now, user.timeZone, user.dayStartHour);
  const due = reminders.filter((r) => isDue(r.localTime, nowMin, user.dayStartHour));
  if (due.length === 0) return [];

  const view = buildDay(user.habits, user.entries, user.pauses, today, today, user.weekStart);
  // Nawyki z Apple Zdrowie odhacza Skrót (zwykle wieczorem) — nie przypominamy o nich.
  const open = [...view.todo, ...view.thisWeek].filter((i) => !i.habit.source);
  const out: Message[] = [];

  for (const r of due) {
    const base = { reminderId: r.id, localDate: today, badge: badgeCount(view) };
    switch (r.kind) {
      case "summary": {
        // „Na dziś” tylko wymagane dziś (jak liczba na ikonie); tygodniowe osobno, z postępem
        const forToday = open.filter((i) => !i.week);
        const forWeek = open.filter((i) => i.week);
        if (open.length === 0) break;
        const weekText = forWeek.map((i) => `${i.habit.name} ${i.week!.done}/${i.week!.required}`).join(", ");
        out.push({
          ...base,
          title: forToday.length === 0 ? "W tym tygodniu jeszcze" : forToday.length === 1 ? "Został jeden nawyk" : `${habitsLeft(forToday.length)} na dziś`,
          body:
            forToday.length === 0
              ? weekText
              : `${list(forToday.map((i) => i.habit.name))}${forWeek.length ? ` · w tym tygodniu: ${weekText}` : ""}`,
          url: "/",
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
          url: `/?date=${gap.date}`,
          tag: "yesterday",
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
