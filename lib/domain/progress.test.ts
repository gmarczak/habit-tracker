import { describe, expect, it } from "vitest";
import type { Entry, Habit, Pause, Plan } from "./model";
import { completionRate, currentWeekProgress, dayState, streakOf } from "./progress";
import { requirementOn } from "./schedule";

// Kalendarz: 2026-10-05 to poniedziałek, 2026-10-11 niedziela.
const TODAY = "2026-10-11";

function plan(p: Partial<Plan> & Pick<Plan, "frequency">, validFrom = "2026-09-01"): Plan {
  return { validFrom, weekdays: null, timesPerWeek: null, intervalDays: null, targetValue: 1, ...p };
}

function habit(plans: Plan[], startDate = "2026-09-01", over: Partial<Habit> = {}): Habit {
  return {
    id: "h1",
    name: "Test",
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
    plans,
    ...over,
  };
}

const done = (date: string, value = 1): Entry => ({ habitId: "h1", date, value, skipped: false, note: null });
const skip = (date: string): Entry => ({ habitId: "h1", date, value: null, skipped: true, note: null });
const days = (...ds: string[]) => ds.map((d) => done(d));

const daily = habit([plan({ frequency: "daily" })]);

describe("seria dzienna", () => {
  it("liczy kolejne dni do dziś", () => {
    expect(streakOf(daily, days("2026-10-09", "2026-10-10", "2026-10-11"), [], TODAY, 1).current).toBe(3);
  });

  it("dzisiejszy brak nie przerywa serii przed końcem dnia", () => {
    expect(streakOf(daily, days("2026-10-09", "2026-10-10"), [], TODAY, 1).current).toBe(2);
  });

  it("wczorajszy brak przerywa", () => {
    expect(streakOf(daily, days("2026-10-08", "2026-10-09", "2026-10-11"), [], TODAY, 1).current).toBe(1);
  });

  it("pominięcie i pauza są neutralne", () => {
    const entries = [...days("2026-10-07", "2026-10-08"), skip("2026-10-09"), done("2026-10-11")];
    const pauses: Pause[] = [{ habitId: null, startDate: "2026-10-10", endDate: "2026-10-10" }];
    expect(streakOf(daily, entries, pauses, TODAY, 1).current).toBe(3);
  });

  it("częściowe wykonanie przerywa serię (cel 20, zrobione 12)", () => {
    const reading = habit([plan({ frequency: "daily", targetValue: 20 })], "2026-09-01", { kind: "count", unit: "strony" });
    const entries = [done("2026-10-08", 20), done("2026-10-09", 12), done("2026-10-10", 25), done("2026-10-11", 20)];
    expect(streakOf(reading, entries, [], TODAY, 1).current).toBe(2);
    expect(dayState(reading, entries, [], "2026-10-09", TODAY)).toBe("partial");
  });

  it("częściowe dziś jest jeszcze w toku", () => {
    const reading = habit([plan({ frequency: "daily", targetValue: 20 })]);
    const entries = [done("2026-10-10", 20), done("2026-10-11", 5)];
    expect(streakOf(reading, entries, [], TODAY, 1).current).toBe(1);
    expect(dayState(reading, entries, [], TODAY, TODAY)).toBe("pending");
  });

  it("wybrane dni: dni niewymagane nie przerywają", () => {
    // pon, śr, pt
    const h = habit([plan({ frequency: "weekdays", weekdays: [1, 3, 5] })]);
    const entries = days("2026-10-05", "2026-10-07", "2026-10-09");
    expect(streakOf(h, entries, [], TODAY, 1).current).toBe(3);
    expect(requirementOn(h, [], "2026-10-11")).toBe("not_required");
  });

  it("co N dni liczy od początku planu", () => {
    const h = habit([plan({ frequency: "every_n_days", intervalDays: 3 }, "2026-10-01")], "2026-10-01");
    expect(requirementOn(h, [], "2026-10-01")).toBe("required");
    expect(requirementOn(h, [], "2026-10-02")).toBe("not_required");
    expect(requirementOn(h, [], "2026-10-04")).toBe("required");
    expect(streakOf(h, days("2026-10-01", "2026-10-04", "2026-10-07", "2026-10-10"), [], TODAY, 1).current).toBe(4);
  });

  it("co N dni: zmiana samego celu nie przesuwa dni, zmiana N zaczyna rytm od nowa", () => {
    const base = plan({ frequency: "every_n_days", intervalDays: 3 }, "2026-10-01");
    const target = habit([base, { ...base, validFrom: "2026-10-05", targetValue: 2 }], "2026-10-01");
    expect(["2026-10-05", "2026-10-06", "2026-10-07"].map((d) => requirementOn(target, [], d))).toEqual(["not_required", "not_required", "required"]);
    const interval = habit([base, { ...base, validFrom: "2026-10-05", intervalDays: 2 }], "2026-10-01");
    expect(["2026-10-05", "2026-10-06", "2026-10-07"].map((d) => requirementOn(interval, [], d))).toEqual(["required", "not_required", "required"]);
  });

  it("zmiana planu w tej samej jednostce nie przerywa serii", () => {
    const h = habit([plan({ frequency: "daily" }), plan({ frequency: "weekdays", weekdays: [1, 2, 3, 4, 5] }, "2026-10-10")]);
    // sob 10.10 i ndz 11.10 niewymagane w nowym planie
    expect(streakOf(h, days("2026-10-07", "2026-10-08", "2026-10-09"), [], TODAY, 1).current).toBe(3);
  });

  it("najlepsza seria pamięta przeszłość", () => {
    const entries = days("2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-10-10", "2026-10-11");
    const s = streakOf(daily, entries, [], TODAY, 1);
    expect(s).toEqual({ current: 2, best: 4, unit: "days" });
  });

  it("przed startem nawyku nic nie liczy", () => {
    const h = habit([plan({ frequency: "daily" }, "2026-10-11")], "2026-10-11");
    expect(dayState(h, [], [], "2026-10-10", TODAY)).toBe("before_start");
    expect(streakOf(h, [], [], TODAY, 1).current).toBe(0);
  });
});

describe("seria tygodniowa (3 razy w tygodniu)", () => {
  const weekly = habit([plan({ frequency: "weekly_count", timesPerWeek: 3 })]);

  it("liczy tygodnie zaliczone", () => {
    const entries = days(
      "2026-09-21", "2026-09-23", "2026-09-25", // tydz. 21.09
      "2026-09-28", "2026-09-29", "2026-10-01", // tydz. 28.09
      "2026-10-05", "2026-10-06", "2026-10-11", // tydz. 05.10 (bieżący)
    );
    const s = streakOf(weekly, entries, [], TODAY, 1);
    expect(s.unit).toBe("weeks");
    expect(s.current).toBe(3);
  });

  it("podniesienie X w trakcie tygodnia nie psuje tygodnia już zaliczonego", () => {
    const raised = habit([plan({ frequency: "weekly_count", timesPerWeek: 3 }), plan({ frequency: "weekly_count", timesPerWeek: 4 }, TODAY)]);
    const entries = days("2026-09-28", "2026-09-29", "2026-10-01", "2026-10-05", "2026-10-06", "2026-10-07");
    expect(currentWeekProgress(raised, entries, [], TODAY, 1)).toMatchObject({ done: 3, required: 3, result: "met" });
    expect(streakOf(raised, entries, [], "2026-10-12", 1).current).toBe(2);
  });

  it("bieżący niezaliczony tydzień jest neutralny", () => {
    const entries = days("2026-09-28", "2026-09-29", "2026-10-01", "2026-10-06");
    expect(streakOf(weekly, entries, [], "2026-10-08", 1).current).toBe(1);
    expect(currentWeekProgress(weekly, entries, [], "2026-10-08", 1)).toMatchObject({ done: 1, required: 3, result: "neutral" });
  });

  it("niezaliczony miniony tydzień przerywa", () => {
    const entries = days("2026-09-21", "2026-09-23", "2026-09-25", "2026-09-28", "2026-10-05", "2026-10-06", "2026-10-07");
    expect(streakOf(weekly, entries, [], TODAY, 1).current).toBe(1);
  });

  it("pierwszy niepełny tydzień: cel proporcjonalny (start w czwartek -> 2 z 4 dni)", () => {
    const h = habit([plan({ frequency: "weekly_count", timesPerWeek: 3 }, "2026-10-01")], "2026-10-01");
    const entries = days("2026-10-02", "2026-10-03", "2026-10-06", "2026-10-07", "2026-10-08");
    const s = streakOf(h, entries, [], TODAY, 1);
    expect(s.current).toBe(2);
    const w = currentWeekProgress(h, entries, [], "2026-10-03", 1);
    expect(w.required).toBe(2);
  });

  it("pauza w środku tygodnia zmniejsza cel proporcjonalnie", () => {
    const pauses: Pause[] = [{ habitId: "h1", startDate: "2026-09-28", endDate: "2026-10-01" }];
    // zostają 3 dni -> wymagane ceil(3*3/7) = 2
    const entries = days("2026-10-02", "2026-10-03", "2026-10-05", "2026-10-06", "2026-10-07");
    expect(streakOf(weekly, entries, pauses, TODAY, 1).current).toBe(2);
  });

  it("tydzień od niedzieli zmienia granice tygodni", () => {
    const entries = days("2026-10-04", "2026-10-05", "2026-10-06"); // ndz-wt
    expect(currentWeekProgress(weekly, entries, [], "2026-10-07", 7).done).toBe(3);
    expect(currentWeekProgress(weekly, entries, [], "2026-10-07", 1).done).toBe(2);
  });
});

describe("zmiana jednostki planu zaczyna serię od zera", () => {
  it("codziennie -> 3 razy w tygodniu", () => {
    const h = habit([plan({ frequency: "daily" }), plan({ frequency: "weekly_count", timesPerWeek: 3 }, "2026-10-05")]);
    const entries = days("2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-06");
    const s = streakOf(h, entries, [], TODAY, 1);
    expect(s.unit).toBe("weeks");
    expect(s.current).toBe(0); // tydzień 05.10: 1 z 3, bieżący -> neutralny; poprzedni to plan dzienny -> granica
  });

  it("3 razy w tygodniu -> codziennie", () => {
    const h = habit([plan({ frequency: "weekly_count", timesPerWeek: 3 }), plan({ frequency: "daily" }, "2026-10-10")]);
    const entries = days("2026-10-05", "2026-10-06", "2026-10-07", "2026-10-10", "2026-10-11");
    expect(streakOf(h, entries, [], TODAY, 1)).toMatchObject({ current: 2, unit: "days" });
  });
});

describe("skuteczność", () => {
  it("wymagane dni bez pominięć i bez niedokończonego dziś", () => {
    const entries = [...days("2026-10-05", "2026-10-06", "2026-10-08"), skip("2026-10-09")];
    // 05..10 wymagane: 05 ok, 06 ok, 07 brak, 08 ok, 09 pominięte (poza), 10 brak; 11 dziś bez wykonania (poza)
    expect(completionRate(daily, entries, [], "2026-10-05", TODAY, TODAY, 1)).toBeCloseTo(3 / 5);
  });

  it("brak okazji -> null", () => {
    const h = habit([plan({ frequency: "daily" }, "2026-10-11")], "2026-10-11");
    expect(completionRate(h, [], [], "2026-10-01", TODAY, TODAY, 1)).toBeNull();
  });

  it("plan tygodniowy liczy rozstrzygnięte tygodnie", () => {
    const weekly = habit([plan({ frequency: "weekly_count", timesPerWeek: 2 })]);
    const entries = days("2026-09-21", "2026-09-22", "2026-09-28", "2026-10-05", "2026-10-06");
    // tydz. 21.09 ok, 28.09 nie, 05.10 ok (bieżący, zaliczony)
    expect(completionRate(weekly, entries, [], "2026-09-21", TODAY, TODAY, 1)).toBeCloseTo(2 / 3);
  });
});

describe("stan dnia", () => {
  it("rozróżnia stany", () => {
    const entries = [done("2026-10-09"), skip("2026-10-08")];
    expect(dayState(daily, entries, [], "2026-10-12", TODAY)).toBe("future");
    expect(dayState(daily, entries, [], "2026-10-09", TODAY)).toBe("done");
    expect(dayState(daily, entries, [], "2026-10-08", TODAY)).toBe("skipped");
    expect(dayState(daily, entries, [], "2026-10-10", TODAY)).toBe("missed");
    expect(dayState(daily, entries, [], TODAY, TODAY)).toBe("pending");
    const weekly = habit([plan({ frequency: "weekly_count", timesPerWeek: 3 })]);
    expect(dayState(weekly, [], [], "2026-10-10", TODAY)).toBe("open");
  });
});
