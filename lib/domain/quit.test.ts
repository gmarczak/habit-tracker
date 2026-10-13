import { describe, expect, it } from "vitest";
import type { Entry, Habit, Plan } from "./model";
import { yesterdayGap } from "./nudges";
import { completionRate, dayState, streakOf } from "./progress";
import { buildDay } from "./today";

const daily: Plan = { validFrom: "2026-10-01", frequency: "daily", weekdays: null, timesPerWeek: null, intervalDays: null, targetValue: 1 };
const sweets: Habit = {
  id: "q", name: "Bez słodyczy", kind: "check", unit: null, icon: null, color: "rose", categoryId: null, timeOfDay: null, goal: "quit",
  startDate: "2026-10-01", sortOrder: 0, archivedAt: null, plans: [daily],
};
const slip = (date: string): Entry => ({ habitId: "q", date, value: 1, skipped: false, note: null });

describe("nawyk „rzucam”", () => {
  it("dzień bez wpisu to czysty dzień, wpadka to porażka — także dziś", () => {
    expect(dayState(sweets, [], [], "2026-10-05", "2026-10-13")).toBe("done");
    expect(dayState(sweets, [slip("2026-10-05")], [], "2026-10-05", "2026-10-13")).toBe("missed");
    expect(dayState(sweets, [slip("2026-10-13")], [], "2026-10-13", "2026-10-13")).toBe("missed");
    expect(dayState(sweets, [], [{ habitId: null, startDate: "2026-10-06", endDate: "2026-10-06" }], "2026-10-06", "2026-10-13")).toBe("paused");
  });

  it("seria to dni bez wpadki; dzisiejsza wpadka ją zeruje", () => {
    expect(streakOf(sweets, [], [], "2026-10-13", 1)).toEqual({ current: 13, best: 13, unit: "days" });
    expect(streakOf(sweets, [slip("2026-10-10")], [], "2026-10-13", 1)).toEqual({ current: 3, best: 9, unit: "days" });
    expect(streakOf(sweets, [slip("2026-10-13")], [], "2026-10-13", 1).current).toBe(0);
  });

  it("skuteczność liczy wpadki", () => {
    expect(completionRate(sweets, [slip("2026-10-10")], [], "2026-10-07", "2026-10-13", "2026-10-13", 1)).toBeCloseTo(6 / 7);
  });

  it("na ekranie dnia osobna lista, pierścień liczy czyste dni, „wczoraj” jej nie wymienia", () => {
    const view = buildDay([sweets], [], [], "2026-10-13", "2026-10-13", 1);
    expect(view.quit.map((i) => i.habit.id)).toEqual(["q"]);
    expect(view.todo).toEqual([]);
    expect(view.progress).toEqual({ done: 1, total: 1 });
    expect(buildDay([sweets], [slip("2026-10-13")], [], "2026-10-13", "2026-10-13", 1).progress).toEqual({ done: 0, total: 1 });
    expect(yesterdayGap([sweets], [slip("2026-10-12")], [], "2026-10-13", 1)).toBeNull();
  });
});
