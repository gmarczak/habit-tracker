/**
 * Czysta logika przypomnień (bez Deno i bez sieci), testowana w Vitest i wbudowywana do funkcji Edge.
 */
import { localDate, type LocalDate, type WeekStart } from "../../../lib/domain/dates";
import type { Entry, Habit, Pause, ReminderKind } from "../../../lib/domain/model";
import { PART_LABELS, isLastDayOfWeek, weeklyMessage, weeklySummary, yesterdayGap } from "../../../lib/domain/nudges";
import { buildDay } from "../../../lib/domain/today";

export type ReminderRow = { id: string; kind: ReminderKind; habitId: string | null; localTime: string };
export type UserContext = {
  timeZone: string;
  dayStartHour: number;
  weekStart: WeekStart;
  habits: Habit[];
  entries: Entry[];
  pauses: Pause[];
};
export type Message = { reminderId: string; localDate: LocalDate; title: string; body: string; url: string; tag: string };

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

export function isDue(reminderTime: string, nowMinutes: number): boolean {
  const diff = nowMinutes - toMinutes(reminderTime);
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
  const due = reminders.filter((r) => isDue(r.localTime, nowMin));
  if (due.length === 0) return [];

  const view = buildDay(user.habits, user.entries, user.pauses, today, today, user.weekStart);
  const open = [...view.todo, ...view.thisWeek];
  const out: Message[] = [];

  for (const r of due) {
    const base = { reminderId: r.id, localDate: today };
    switch (r.kind) {
      case "summary": {
        if (open.length === 0) break;
        out.push({
          ...base,
          title: open.length === 1 ? "Został jeden nawyk" : `Zostały ${open.length} nawyki na dziś`,
          body: list(open.map((i) => i.habit.name)),
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
        out.push({ ...base, title: `${PART_LABELS[r.kind]}: ${part.length === 1 ? "1 nawyk" : `${part.length} nawyki`}`, body: list(part.map((i) => i.habit.name)), url: "/", tag: `part-${r.kind}` });
        break;
      }
      case "yesterday": {
        const gap = yesterdayGap(user.habits, user.entries, user.pauses, today, user.weekStart);
        if (!gap) break;
        out.push({
          ...base,
          title: gap.missing.length === 1 ? "Wczoraj został 1 nawyk" : `Wczoraj zostały ${gap.missing.length} nawyki`,
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
          body: item.week ? `${item.week.done} z ${item.week.required} w tym tygodniu` : "Czas na dzisiejszy nawyk.",
          url: "/",
          tag: `habit-${item.habit.id}`,
        });
        break;
      }
    }
  }
  return out;
}
