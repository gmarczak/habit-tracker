import { describe, expect, it } from "vitest";
import type { Habit, Plan } from "../../../lib/domain/model";
import { isDue, localMinutes, messagesFor, type UserContext } from "./logic";

const plan: Plan = { validFrom: "2026-09-01", frequency: "daily", weekdays: null, timesPerWeek: null, intervalDays: null, targetValue: 1 };
const habit = (id: string, name: string): Habit => ({
  id,
  name,
  kind: "check",
  unit: null,
  icon: null,
  color: "green",
  categoryId: null,
  startDate: "2026-09-01",
  sortOrder: 0,
  archivedAt: null,
  plans: [plan],
});

const user: UserContext = {
  timeZone: "Europe/Warsaw",
  dayStartHour: 0,
  weekStart: 1,
  habits: [habit("a", "Czytanie"), habit("b", "Spacer")],
  entries: [{ habitId: "a", date: "2026-10-11", value: 1, skipped: false, note: null }],
  pauses: [],
};

// 18:05 UTC = 20:05 w Warszawie (CEST)
const at2005 = new Date("2026-10-11T18:05:00Z");

describe("przypomnienia", () => {
  it("czas lokalny i okno", () => {
    expect(localMinutes(at2005, "Europe/Warsaw")).toBe(20 * 60 + 5);
    expect(isDue("20:00", 20 * 60 + 5)).toBe(true);
    expect(isDue("20:00", 19 * 60 + 59)).toBe(false);
    expect(isDue("20:00", 21 * 60)).toBe(false);
  });

  it("podsumowanie wymienia tylko niezrobione", () => {
    const m = messagesFor(user, [{ id: "r1", habitId: null, localTime: "20:00" }], at2005);
    expect(m).toEqual([{ reminderId: "r1", localDate: "2026-10-11", title: "Został jeden nawyk", body: "Spacer", url: "/", tag: "summary" }]);
  });

  it("cisza, gdy wszystko zrobione albo jeszcze nie pora", () => {
    const done = { ...user, entries: [...user.entries, { habitId: "b", date: "2026-10-11", value: 1, skipped: false, note: null }] };
    expect(messagesFor(done, [{ id: "r1", habitId: null, localTime: "20:00" }], at2005)).toEqual([]);
    expect(messagesFor(user, [{ id: "r1", habitId: null, localTime: "21:00" }], at2005)).toEqual([]);
  });

  it("przypomnienie nawyku tylko gdy niezrobiony", () => {
    const reminders = [
      { id: "ra", habitId: "a", localTime: "20:00" },
      { id: "rb", habitId: "b", localTime: "20:00" },
    ];
    expect(messagesFor(user, reminders, at2005).map((m) => m.reminderId)).toEqual(["rb"]);
  });
});
