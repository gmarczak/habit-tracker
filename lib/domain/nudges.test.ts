import { describe, expect, it } from "vitest";
import type { Entry, Habit, Plan } from "./model";
import { groupByPart, isLastDayOfWeek, weeklyMessage, weeklySummary, yesterdayGap } from "./nudges";
import { buildDay } from "./today";

const daily: Plan = { validFrom: "2026-10-05", frequency: "daily", weekdays: null, timesPerWeek: null, intervalDays: null, targetValue: 1 };
const h = (id: string, name: string, over: Partial<Habit> = {}): Habit => ({
  id, name, kind: "check", unit: null, icon: null, color: "green", categoryId: null, timeOfDay: null, startDate: "2026-10-05", sortOrder: 0, archivedAt: null, plans: [daily], ...over,
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
    expect(s.share).toBeCloseTo(9 / 14);
    expect(s.perfectDays).toBe(2);
    expect(s.best).toEqual({ name: "Łóżko", rate: 1 });
    expect(s.worst).toEqual({ name: "Medytacja", rate: 2 / 6 }); // niedziela jeszcze trwa: niezrobione dziś się nie liczy
    expect(s.weekly).toEqual([{ name: "Basen", done: 2, required: 3 }]);
    expect(weeklyMessage(s)).toEqual({
      title: "Twój tydzień: 64%",
      body: "Idealne dni: 2 z 7 · Najlepiej: Łóżko (100%) · Do poprawy: Medytacja (33%) · Basen 2/3",
    });
  });
});
