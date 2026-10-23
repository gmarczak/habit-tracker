import { describe, expect, it } from "vitest";
import type { Entry, Habit, Plan } from "./model";
import { habitRates, isPerfect, notedDays, perfectDayStreak, weekReview, weekdayShares, weeklyTrend } from "./stats";

const TODAY = "2026-10-11"; // niedziela; tydzień od pn 2026-10-05

const plan = (p: Partial<Plan> & Pick<Plan, "frequency">): Plan => ({
  validFrom: "2026-09-01",
  weekdays: null,
  timesPerWeek: null,
  intervalDays: null,
  targetValue: 1,
  ...p,
});
const habit = (id: string, p: Plan, startDate = "2026-09-01"): Habit => ({
  id,
  name: id,
  kind: "check",
  unit: null,
  icon: null,
  color: "green",
  categoryId: null,
  timeOfDay: null,
  goal: "build",
  startDate,
  sortOrder: 0,
  archivedAt: null,
  plans: [{ ...p, validFrom: startDate }],
});
const e = (habitId: string, date: string, skipped = false): Entry => ({ habitId, date, value: skipped ? null : 1, skipped, note: null });

const habits = [habit("a", plan({ frequency: "daily" })), habit("b", plan({ frequency: "daily" }))];

describe("statystyki", () => {
  it("przegląd tygodnia liczy dni i idealne dni", () => {
    const entries = [e("a", "2026-10-05"), e("b", "2026-10-05"), e("a", "2026-10-06"), e("a", "2026-10-07"), e("b", "2026-10-07", true)];
    const r = weekReview(habits, entries, [], TODAY, TODAY, 1);
    expect(r.days.map((d) => `${d.done}/${d.total}`)).toEqual(["2/2", "1/2", "1/1", "0/2", "0/2", "0/2", "0/2"]);
    expect(r.perfectDays).toBe(2); // pon i śr (pominięte nie liczy się do mianownika)
    expect(r.done).toBe(4);
  });

  it("dni w przyszłości są puste", () => {
    const r = weekReview(habits, [], [], "2026-10-08", "2026-10-08", 1);
    expect(r.days.slice(4).every((d) => d.total === 0)).toBe(true);
  });

  it("seria idealnych dni; dzisiejszy niedokończony jej nie przerywa", () => {
    const entries = ["2026-10-08", "2026-10-09", "2026-10-10"].flatMap((d) => [e("a", d), e("b", d)]);
    expect(perfectDayStreak(habits, entries, [], TODAY, 1)).toBe(3);
    expect(perfectDayStreak(habits, [...entries, e("a", TODAY), e("b", TODAY)], [], TODAY, 1)).toBe(4);
  });

  it("seria idealnych dni kończy się na starcie nawyków", () => {
    const fresh = [habit("a", plan({ frequency: "daily" }), "2026-10-10")];
    expect(perfectDayStreak(fresh, [e("a", "2026-10-10"), e("a", TODAY)], [], TODAY, 1)).toBe(2);
  });

  it("trend tygodniowy", () => {
    const t = weeklyTrend(habits, [e("a", "2026-10-05"), e("b", "2026-10-05")], [], TODAY, 1, 2);
    expect(t.map((w) => w.weekStart)).toEqual(["2026-09-28", "2026-10-05"]);
    expect(t[0]?.share).toBe(0);
    expect(t[1]?.share).toBeCloseTo(2 / 14);
  });

  it("isPerfect wymaga choć jednego nawyku", () => {
    expect(isPerfect({ date: TODAY, done: 0, total: 0 })).toBe(false);
  });

  it("skuteczność nawyków od najsłabszego", () => {
    const entries = ["2026-10-10", "2026-10-09"].map((d) => e("a", d));
    const rates = habitRates(habits, entries, [], TODAY, 1, 2);
    expect(rates.map((r) => r.habit.id)).toEqual(["b", "a"]);
    expect(rates[1]?.rate).toBe(1); // 10.10 zrobione, dziś niedokończone pomijane
  });
});

describe("notatki dni", () => {
  it("najnowsze pierwsze, z wynikiem dnia, bez przyszłych", () => {
    const notes = [
      { date: "2026-10-09", note: "Spałem 5 godzin" },
      { date: "2026-10-10", note: "Wyjazd" },
      { date: "2026-10-20", note: "przyszłość" },
    ];
    const out = notedDays(notes, habits, [e("a", "2026-10-09")], [], TODAY, 1);
    expect(out.map((d) => [d.date, d.note, d.done, d.total])).toEqual([
      ["2026-10-10", "Wyjazd", 0, 2],
      ["2026-10-09", "Spałem 5 godzin", 1, 2],
    ]);
  });
});

describe("dni tygodnia", () => {
  it("liczy udział z ostatnich pełnych tygodni, bez dzisiejszego dnia", () => {
    // 2 tygodnie przed niedzielą 11.10: pn 28.09 – sb 10.10 (+ nd 4.10). Poniedziałki pełne, wtorki puste.
    const entries = [
      e("a", "2026-09-28"), e("b", "2026-09-28"), e("a", "2026-10-05"), e("b", "2026-10-05"),
      e("a", "2026-10-04"), // niedziela 4.10: 1 z 2
      e("a", "2026-10-11"), e("b", "2026-10-11"), // dziś — nie liczy się
    ];
    const shares = weekdayShares(habits, entries, [], TODAY, 2);
    expect(shares.find((s) => s.weekday === 1)?.share).toBe(1);
    expect(shares.find((s) => s.weekday === 2)?.share).toBe(0);
    expect(shares.find((s) => s.weekday === 7)?.share).toBe(0.25); // nd 4.10 1/2 i nd 27.09 0/2
  });

  it("null, gdy w dany dzień nic nie było wymagane", () => {
    const weekdaysOnly = [habit("w", plan({ frequency: "weekdays", weekdays: [1, 2, 3, 4, 5] }))];
    const shares = weekdayShares(weekdaysOnly, [], [], TODAY, 2);
    expect(shares.find((s) => s.weekday === 6)?.share).toBeNull();
    expect(shares.find((s) => s.weekday === 1)?.share).toBe(0);
  });
});
