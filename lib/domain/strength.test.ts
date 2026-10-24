import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import type { Entry, Habit, Plan } from "./model";
import { habitStrength } from "./strength";

const TODAY = "2026-10-31";
const START = "2026-09-01";
const plan = (p: Partial<Plan> = {}): Plan => ({ validFrom: START, frequency: "daily", weekdays: null, timesPerWeek: null, intervalDays: null, targetValue: 1, ...p });
const habit = (over: Partial<Habit> = {}): Habit => ({
  id: "h", name: "h", kind: "check", unit: null, icon: null, color: "green", categoryId: null, timeOfDay: null, goal: "build",
  startDate: START, sortOrder: 0, archivedAt: null, plans: [plan()], ...over,
});
const done = (date: string, value = 1): Entry => ({ habitId: "h", date, value, skipped: false, note: null });
const days = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};

describe("siła nawyku", () => {
  it("rośnie przy codziennym robieniu i zbliża się do 100%", () => {
    const s = habitStrength(habit(), days(START, TODAY).map((d) => done(d)), [], TODAY);
    expect(s).toBeGreaterThan(0.75);
    expect(s).toBeLessThan(1);
  });

  it("jedna przerwa tylko lekko obniża (seria by się wyzerowała)", () => {
    const all = days(START, TODAY);
    const full = habitStrength(habit(), all.map((d) => done(d)), [], TODAY);
    const oneMiss = habitStrength(habit(), all.filter((d) => d !== "2026-10-30").map((d) => done(d)), [], TODAY);
    expect(oneMiss).toBeLessThan(full);
    expect(full - oneMiss).toBeLessThan(0.06);
  });

  it("dzisiejszy niedokończony dzień i pauza są neutralne", () => {
    const upToYesterday = days(START, "2026-10-30").map((d) => done(d));
    expect(habitStrength(habit(), upToYesterday, [], TODAY)).toBe(habitStrength(habit(), upToYesterday, [], "2026-10-30"));
    const paused = habitStrength(habit(), days(START, "2026-10-20").map((d) => done(d)), [{ habitId: "h", startDate: "2026-10-21", endDate: TODAY }], TODAY);
    expect(paused).toBe(habitStrength(habit(), days(START, "2026-10-20").map((d) => done(d)), [], "2026-10-20"));
  });

  it("ilość liczy się częściowo, a bez wpisów siła to 0", () => {
    const counted = habit({ kind: "count", unit: "stron", plans: [plan({ targetValue: 10 })] });
    const half = habitStrength(counted, days(START, TODAY).map((d) => done(d, 5)), [], TODAY);
    const fullCount = habitStrength(counted, days(START, TODAY).map((d) => done(d, 10)), [], TODAY);
    expect(half).toBeCloseTo(fullCount / 2, 2); // dzisiejsze 5 z 10 jeszcze się nie liczy
    expect(habitStrength(habit(), [], [], TODAY)).toBe(0);
  });

  it("plan tygodniowy wykonany co do joty dochodzi do 100%, jak codzienny", () => {
    const weekly = (x: number) => habit({ plans: [plan({ frequency: "weekly_count", timesPerWeek: x })] });
    const daily = habitStrength(habit(), days(START, TODAY).map((d) => done(d)), [], TODAY);
    const three = habitStrength(weekly(3), days(START, TODAY).filter((_, i) => i % 7 < 3).map((d) => done(d)), [], TODAY);
    const once = habitStrength(weekly(1), days(START, TODAY).filter((_, i) => i % 7 === 4).map((d) => done(d)), [], TODAY);
    expect(three).toBeGreaterThan(daily - 0.05);
    expect(once).toBeGreaterThan(daily - 0.1);
  });

  it("plan tygodniowy: 2 z 3 razy to około dwóch trzecich, nic to zero", () => {
    const weekly = habit({ plans: [plan({ frequency: "weekly_count", timesPerWeek: 3 })] });
    const longStart = "2025-10-01";
    const twoOfThree = habitStrength({ ...weekly, startDate: longStart, plans: [plan({ validFrom: longStart, frequency: "weekly_count", timesPerWeek: 3 })] },
      days(longStart, TODAY).filter((_, i) => i % 7 < 2).map((d) => done(d)), [], TODAY);
    expect(twoOfThree).toBeGreaterThan(0.6);
    expect(twoOfThree).toBeLessThan(0.72);
    expect(habitStrength(weekly, [], [], TODAY)).toBe(0);
  });
});
