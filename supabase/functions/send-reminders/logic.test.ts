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
  timeOfDay: null,
  goal: "build",
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

  it("okno liczy się od początku dnia użytkownika i od siatki crona", () => {
    // koniec dnia o 3:00: 02:30 nie wysyła się drugi raz o 3:00 (to już nowy dzień), 23:30 nadrabia po północy
    expect(isDue("02:30", 2 * 60 + 30, 3)).toBe(true);
    expect(isDue("02:30", 3 * 60, 3)).toBe(false);
    expect(isDue("23:30", 20, 3)).toBe(true);
    // 23:57 przy cronie co 5 minut: od 23:55
    expect(isDue("23:57", 23 * 60 + 55)).toBe(true);
  });

  it("podsumowanie wymienia tylko niezrobione", () => {
    const m = messagesFor(user, [{ id: "r1", kind: "summary" as const, habitId: null, localTime: "20:00" }], at2005);
    expect(m).toEqual([{ reminderId: "r1", localDate: "2026-10-11", title: "Został jeden nawyk", body: "Spacer", url: "/review", tag: "summary", badge: 1 }]);
  });

  it("podsumowanie: „na dziś” tylko wymagane dziś, tygodniowe osobno z postępem", () => {
    const gym: Habit = { ...habit("g", "Siłownia"), plans: [{ ...plan, frequency: "weekly_count", timesPerWeek: 3 }] };
    const m = messagesFor({ ...user, habits: [...user.habits, gym] }, [{ id: "r1", kind: "summary" as const, habitId: null, localTime: "20:00" }], at2005);
    expect(m.map((x) => [x.title, x.body, x.badge])).toEqual([["Został jeden nawyk", "Spacer · w tym tygodniu: Siłownia 0/3", 1]]);
  });

  it("cisza, gdy wszystko zrobione albo jeszcze nie pora", () => {
    const done = { ...user, entries: [...user.entries, { habitId: "b", date: "2026-10-11", value: 1, skipped: false, note: null }] };
    expect(messagesFor(done, [{ id: "r1", kind: "summary" as const, habitId: null, localTime: "20:00" }], at2005)).toEqual([]);
    expect(messagesFor(user, [{ id: "r1", kind: "summary" as const, habitId: null, localTime: "21:00" }], at2005)).toEqual([]);
  });

  it("przypomnienie nawyku tylko gdy niezrobiony", () => {
    const reminders = [
      { id: "ra", kind: "habit" as const, habitId: "a", localTime: "20:00" },
      { id: "rb", kind: "habit" as const, habitId: "b", localTime: "20:00" },
    ];
    expect(messagesFor(user, reminders, at2005).map((m) => m.reminderId)).toEqual(["rb"]);
  });

  it("nawyki z Apple Zdrowie pomija (odhaczy je Skrót), ale liczy na ikonie", () => {
    const auto = { ...user, habits: [habit("a", "Czytanie"), { ...habit("b", "Spacer"), source: "steps" as const, sourceMin: 7000 }] };
    expect(messagesFor(auto, [{ id: "r1", kind: "summary" as const, habitId: null, localTime: "20:00" }], at2005)).toEqual([]);
    expect(messagesFor(auto, [{ id: "rb", kind: "habit" as const, habitId: "b", localTime: "20:00" }], at2005)).toEqual([]);
    const two = { ...auto, habits: [...auto.habits, habit("c", "Medytacja")] };
    const m = messagesFor(two, [{ id: "r1", kind: "summary" as const, habitId: null, localTime: "20:00" }], at2005);
    expect(m.map((x) => [x.body, x.badge])).toEqual([["Medytacja", 2]]);
  });

  it("przypomnienie nawyku używa wyzwalacza", () => {
    const withCue = { ...user, habits: [habit("a", "Czytanie"), { ...habit("b", "Spacer"), cue: "po obiedzie" }] };
    const m = messagesFor(withCue, [{ id: "rb", kind: "habit" as const, habitId: "b", localTime: "20:00" }], at2005);
    expect(m.map((x) => x.body)).toEqual(["Po obiedzie — czas na ten nawyk."]);
  });

  it("pora dnia: tylko nawyki z tej pory, które czekają", () => {
    const parts = {
      ...user,
      habits: [{ ...habit("a", "Czytanie"), timeOfDay: "evening" as const }, { ...habit("b", "Spacer"), timeOfDay: "evening" as const }, { ...habit("c", "Woda"), timeOfDay: "day" as const }],
    };
    const m = messagesFor(parts, [{ id: "re", kind: "evening", habitId: null, localTime: "20:00" }], at2005);
    expect(m.map((x) => [x.title, x.body])).toEqual([["Wieczorem: 1 nawyk", "Spacer"]]);
    expect(messagesFor(parts, [{ id: "rm", kind: "morning", habitId: null, localTime: "20:00" }], at2005)).toEqual([]);
  });

  it("wczoraj niedomknięte: lista i link do uzupełnienia", () => {
    // 11.10: Czytanie zrobione, Spacer nie → rano 12.10 przypomnienie o Spacerze
    const morning = new Date("2026-10-12T07:05:00Z"); // 9:05 w Warszawie
    const m = messagesFor(user, [{ id: "ry", kind: "yesterday", habitId: null, localTime: "09:00" }], morning);
    expect(m).toEqual([{ reminderId: "ry", localDate: "2026-10-12", title: "Wczoraj został 1 nawyk", body: "Spacer — uzupełnij, jeśli zrobiłeś.", url: "/review?date=2026-10-11", tag: "yesterday", badge: 2 }]);
    const closed = { ...user, entries: [...user.entries, { habitId: "b", date: "2026-10-11", value: null, skipped: true, note: null }] };
    expect(messagesFor(closed, [{ id: "ry", kind: "yesterday", habitId: null, localTime: "09:00" }], morning)).toEqual([]);
  });

  it("podsumowanie tygodnia tylko w ostatnim dniu tygodnia", () => {
    const weekly = [{ id: "rw", kind: "weekly" as const, habitId: null, localTime: "20:00" }];
    const sunday = messagesFor(user, weekly, at2005); // 11.10.2026 to niedziela
    expect(sunday).toHaveLength(1);
    expect(sunday[0]!.title).toMatch(/^Twój tydzień/);
    expect(sunday[0]!.url).toBe("/stats");
    expect(messagesFor(user, weekly, new Date("2026-10-10T18:05:00Z"))).toEqual([]); // sobota
    expect(messagesFor({ ...user, weekStart: 7 }, weekly, new Date("2026-10-10T18:05:00Z"))).toHaveLength(1); // tydzień od niedzieli: sobota jest ostatnia
  });
});
