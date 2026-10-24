import { describe, expect, it } from "vitest";
import type { Entry, Habit, Plan } from "./model";
import { habitRates, isPerfect, moodInsights, notedDays, perfectDayStreak, weekReview, weekdayShares, weeklyTrend } from "./stats";

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
    expect(t[1]?.share).toBeCloseTo(2 / 12); // dzisiejsze niezrobione jeszcze nie są porażką
  });

  it("poniedziałek rano: otwarte dziś nawyki nie dają 0% ani spadku", () => {
    const monday = "2026-10-12";
    const lastWeek = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"].flatMap((d) => [e("a", d), e("b", d)]);
    const r = weekReview(habits, lastWeek, [], monday, monday, 1);
    expect(r.total).toBe(0);
    expect(r.days[0]).toMatchObject({ date: monday, done: 0, total: 2 });
    expect(weeklyTrend(habits, lastWeek, [], monday, 1, 2).map((w) => w.share)).toEqual([1, null]);
  });

  it("archiwum nie przepisuje przeszłości: nawyk liczy się do dnia archiwizacji", () => {
    const archived: Habit = { ...habit("b", plan({ frequency: "daily" })), archivedAt: "2026-10-09T18:00:00Z", archivedOn: "2026-10-09" };
    const entries = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"].map((d) => e("a", d));
    const r = weekReview([habits[0]!, archived], entries, [], TODAY, TODAY, 1);
    expect(r.days.map((d) => `${d.done}/${d.total}`)).toEqual(["1/2", "1/2", "1/2", "1/2", "1/1", "1/1", "0/1"]);
    expect(perfectDayStreak([habits[0]!, archived], entries, [], TODAY, 1)).toBe(2);
  });

  it("wpadka „rzucam” dziś liczy się od razu, otwarte „buduję” jeszcze nie", () => {
    const quit: Habit = { ...habit("q", plan({ frequency: "daily" })), goal: "quit" };
    const r = weekReview([habits[0]!, quit], [{ ...e("q", TODAY) }], [], TODAY, TODAY, 1);
    expect(r.days.at(-1)).toMatchObject({ done: 0, total: 2, settled: 1 });
    expect(r.total - r.days.slice(0, 6).reduce((s, d) => s + d.total, 0)).toBe(1);
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

describe("nastrój a nawyki", () => {
  it("średnia i różnica nastroju w dni z nawykiem i bez", () => {
    const days = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06"];
    const notes = days.map((date, i) => ({ date, note: null, mood: i < 3 ? 5 : 2 }));
    // „a” zrobione w dni z nastrojem 5, „b” odwrotnie
    const entries = [...days.slice(0, 3).map((d) => e("a", d)), ...days.slice(3).map((d) => e("b", d))];
    const r = moodInsights(notes, habits, entries, [], TODAY, 60, 3);
    expect(r.count).toBe(6);
    expect(r.average).toBe(3.5);
    expect(r.links.map((l) => [l.habit.id, l.diff])).toEqual([
      ["a", 3],
      ["b", -3],
    ]);
  });

  it("plan tygodniowy: dni bez wykonania to dni bez nawyku", () => {
    const gym = habit("gym", plan({ frequency: "weekly_count", timesPerWeek: 3 }));
    const days = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06"];
    const notes = days.map((date, i) => ({ date, note: null, mood: i % 2 ? 2 : 5 }));
    const r = moodInsights(notes, [gym], days.filter((_, i) => i % 2 === 0).map((d) => e("gym", d)), [], TODAY, 60, 3);
    expect(r.links.map((l) => [l.habit.id, l.diff])).toEqual([["gym", 3]]);
  });

  it("pomija nawyki z za małą liczbą dni i dni bez nastroju", () => {
    const notes = [{ date: "2026-10-01", note: "tylko tekst", mood: null }, { date: "2026-10-02", note: null, mood: 4 }];
    const r = moodInsights(notes, habits, [e("a", "2026-10-02")], [], TODAY);
    expect(r.count).toBe(1);
    expect(r.links).toEqual([]);
  });
});
