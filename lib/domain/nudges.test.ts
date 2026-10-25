import { describe, expect, it } from "vitest";
import type { Entry, Habit, Plan } from "./model";
import { absence, easiestHabit, groupByPart, isLastDayOfWeek, weeklyMessage, weeklySummary, yesterdayGap } from "./nudges";
import { buildDay } from "./today";

const daily: Plan = { validFrom: "2026-10-05", frequency: "daily", weekdays: null, timesPerWeek: null, intervalDays: null, targetValue: 1 };
const h = (id: string, name: string, over: Partial<Habit> = {}): Habit => ({
  id, name, kind: "check", unit: null, icon: null, color: "green", categoryId: null, timeOfDay: null, goal: "build", startDate: "2026-10-05", sortOrder: 0, archivedAt: null, plans: [daily], ...over,
});
const done = (habitId: string, date: string): Entry => ({ habitId, date, value: 1, skipped: false, note: null });

describe("pory dnia", () => {
  it("grupuje rano → dzień → wieczór → kiedykolwiek, bez pustych", () => {
    const habits = [h("a", "Czytanie", { timeOfDay: "evening" }), h("b", "Łóżko", { timeOfDay: "morning" }), h("c", "Spacer")];
    const view = buildDay(habits, [], [], "2026-10-12", "2026-10-12", 1);
    expect(groupByPart(view.todo).map((g) => [g.part, g.items.map((i) => i.habit.name)])).toEqual([
      ["morning", ["Łóżko"]],
      ["evening", ["Czytanie"]],
      [null, ["Spacer"]],
    ]);
  });
});

describe("wczoraj", () => {
  const habits = [h("a", "Czytanie"), h("b", "Spacer"), h("gym", "Basen", { plans: [{ ...daily, frequency: "weekly_count", timesPerWeek: 3 }] })];
  it("lista brakujących, bez planów tygodniowych", () => {
    const gap = yesterdayGap(habits, [done("a", "2026-10-12")], [], "2026-10-13", 1);
    expect(gap?.date).toBe("2026-10-12");
    expect(gap?.missing.map((i) => i.habit.name)).toEqual(["Spacer"]);
  });
  it("odpowiedź „nie” (wpis 0) domyka dzień: rano już nie pyta", () => {
    const no = { habitId: "b", date: "2026-10-12", value: 0, skipped: false, note: null };
    expect(yesterdayGap(habits, [done("a", "2026-10-12"), no], [], "2026-10-13", 1)).toBeNull();
    // częściowy postęp za wczoraj to też odpowiedź
    expect(yesterdayGap(habits, [{ ...no, value: 3 }], [], "2026-10-13", 1)?.missing.map((i) => i.habit.name)).toEqual(["Czytanie"]);
  });

  it("null gdy domknięte, pominięte albo dzień wolny", () => {
    expect(yesterdayGap(habits, [done("a", "2026-10-12"), done("b", "2026-10-12")], [], "2026-10-13", 1)).toBeNull();
    expect(yesterdayGap(habits, [done("a", "2026-10-12"), { habitId: "b", date: "2026-10-12", value: null, skipped: true, note: null }], [], "2026-10-13", 1)).toBeNull();
    expect(yesterdayGap(habits, [], [{ habitId: null, startDate: "2026-10-12", endDate: "2026-10-12" }], "2026-10-13", 1)).toBeNull();
  });
});

describe("podsumowanie tygodnia", () => {
  it("ostatni dzień tygodnia", () => {
    expect(isLastDayOfWeek("2026-10-11", 1)).toBe(true); // niedziela
    expect(isLastDayOfWeek("2026-10-10", 1)).toBe(false);
    expect(isLastDayOfWeek("2026-10-10", 7)).toBe(true); // sobota przy tygodniu od niedzieli
  });

  it("procent, najlepszy i najsłabszy, cele tygodniowe", () => {
    const habits = [h("a", "Łóżko"), h("b", "Medytacja"), h("gym", "Basen", { plans: [{ ...daily, frequency: "weekly_count", timesPerWeek: 3 }] })];
    const week = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];
    const entries = [...week.map((d) => done("a", d)), done("b", "2026-10-05"), done("b", "2026-10-06"), done("gym", "2026-10-06"), done("gym", "2026-10-08")];
    const s = weeklySummary(habits, entries, [], "2026-10-11", 1);
    expect(s.share).toBeCloseTo(9 / 13); // niedziela jeszcze trwa: niezrobione dziś nie obniża procentu
    expect(s.perfectDays).toBe(2);
    expect(s.best).toEqual({ name: "Łóżko", rate: 1 });
    expect(s.worst).toEqual({ name: "Medytacja", rate: 2 / 6 }); // niedziela jeszcze trwa: niezrobione dziś się nie liczy
    expect(s.weekly).toEqual([{ name: "Basen", done: 2, required: 3 }]);
    expect(weeklyMessage(s)).toEqual({
      title: "Twój tydzień: 69%",
      body: "Idealne dni: 2 z 7 · Najlepiej: Łóżko (100%) · Do poprawy: Medytacja (33%) · Basen 2/3",
    });
  });

  it("„rzucam” bez wpisów nie jest „najlepszy”", () => {
    const habits = [h("a", "Łóżko"), h("b", "Medytacja"), h("q", "Rzucam palenie", { goal: "quit" })];
    const week = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"];
    const entries = [...week.map((d) => done("a", d)), ...week.slice(0, 4).map((d) => done("b", d))];
    const s = weeklySummary(habits, entries, [], "2026-10-11", 1);
    expect(s.best?.name).toBe("Łóżko");
    expect(s.worst?.name).toBe("Medytacja");
    expect(s.share).toBeCloseTo(10 / 12);
  });

  it("rzadko zapisywany tydzień: co się udało zamiast procentów", () => {
    const habits = [h("a", "Medytacja"), h("b", "Spacer"), h("c", "Czytanie"), h("q", "Rzucam palenie", { goal: "quit" })];
    const entries = [done("a", "2026-10-08"), done("b", "2026-10-08"), done("a", "2026-10-09"), done("a", "2026-10-11"), done("c", "2026-10-11")];
    const s = weeklySummary(habits, entries, [], "2026-10-11", 1);
    expect(s.logged).toEqual({ checks: 5, days: 3, top: { name: "Medytacja", count: 3 } });
    expect(weeklyMessage(s)).toEqual({ title: "Twój tydzień", body: "5 odhaczeń w 3 dni · Najczęściej: Medytacja 3× · Od jutra nowy tydzień" });
    expect(weeklyMessage(weeklySummary(habits, [], [], "2026-10-11", 1))?.title).toBe("Nowy tydzień od jutra");
  });
});

describe("powrót po przerwie", () => {
  const habits = [h("a", "Medytacja"), h("b", "Spacer"), h("q", "Rzucam", { goal: "quit" })];
  it("liczy dni ciszy do wczoraj, przerywa wpis, notatka albo pauza wszystkich nawyków", () => {
    const entries = [done("a", "2026-10-12")];
    expect(absence(habits, entries, [], [], "2026-10-22")).toEqual({ from: "2026-10-13", to: "2026-10-21", days: 9 });
    expect(absence(habits, [...entries, done("b", "2026-10-21")], [], [], "2026-10-22")).toBeNull();
    expect(absence(habits, entries, [], [{ date: "2026-10-18", note: null, mood: 3 }], "2026-10-22")).toEqual({ from: "2026-10-19", to: "2026-10-21", days: 3 });
    expect(absence(habits, entries, [{ habitId: null, startDate: "2026-10-13", endDate: "2026-10-21" }], [], "2026-10-22")).toBeNull();
    // pauza jednego nawyku to nie przerwa w zapisywaniu
    expect(absence(habits, entries, [{ habitId: "a", startDate: "2026-10-13", endDate: "2026-10-21" }], [], "2026-10-22")?.days).toBe(9);
  });

  it("dni bez wymaganych nawyków są neutralne, „rzucam” się nie liczy", () => {
    const weekdays = [h("a", "Praca", { plans: [{ ...daily, frequency: "weekdays", weekdays: [1, 2, 3, 4, 5] }] }), h("q", "Rzucam", { goal: "quit" })];
    // pon 19.10 – pt 23.10 bez wpisów, wcześniej weekend: cisza od poniedziałku
    expect(absence(weekdays, [done("a", "2026-10-16")], [], [], "2026-10-24")).toEqual({ from: "2026-10-19", to: "2026-10-23", days: 5 });
    expect(absence([h("q", "Rzucam", { goal: "quit" })], [], [], [], "2026-10-24")).toBeNull();
  });

  it("najłatwiejszy start: najmocniejszy nawyk bez dzisiejszego wpisu", () => {
    const entries = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"].map((d) => done("b", d));
    expect(easiestHabit(habits, entries, [], "2026-10-12", 1)?.habit.name).toBe("Spacer");
    expect(easiestHabit(habits, [...entries, done("b", "2026-10-12")], [], "2026-10-12", 1)?.habit.name).toBe("Medytacja");
  });
});
