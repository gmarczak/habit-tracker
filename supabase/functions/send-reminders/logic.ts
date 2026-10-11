/**
 * Czysta logika przypomnień (bez Deno i bez sieci), testowana w Vitest i wbudowywana do funkcji Edge.
 */
import { localDate, type LocalDate, type WeekStart } from "../../../lib/domain/dates";
import type { Entry, Habit, Pause } from "../../../lib/domain/model";
import { buildDay } from "../../../lib/domain/today";

export type ReminderRow = { id: string; habitId: string | null; localTime: string };
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
    if (r.habitId === null) {
      if (open.length === 0) continue;
      const names = open.map((i) => i.habit.name);
      out.push({
        reminderId: r.id,
        localDate: today,
        title: open.length === 1 ? "Został jeden nawyk" : `Zostały ${open.length} nawyki na dziś`,
        body: list(names),
        url: "/",
        tag: "summary",
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
        tag: `habit-${item.habit.id}`,
      });
    }
  }
  return out;
}
