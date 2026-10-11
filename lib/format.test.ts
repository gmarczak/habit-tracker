import { describe, expect, it } from "vitest";
import { describePlan, formatDayLong, formatStreak, formatWeekdayShort, plural } from "./format";

describe("formatowanie po polsku", () => {
  it("odmienia liczebniki", () => {
    const t = (n: number) => plural(n, "tydzień", "tygodnie", "tygodni");
    expect([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 112, 122].map(t)).toEqual([
      "tydzień", "tygodnie", "tygodnie", "tygodni", "tygodni", "tygodni", "tygodni",
      "tygodni", "tygodnie", "tygodni", "tygodni", "tygodnie",
    ]);
  });

  it("serie w dniach i tygodniach", () => {
    expect(formatStreak({ current: 1, best: 1, unit: "days" })).toBe("1 dzień");
    expect(formatStreak({ current: 34, best: 34, unit: "days" })).toBe("34 dni");
    expect(formatStreak({ current: 3, best: 3, unit: "weeks" })).toBe("3 tygodnie");
  });

  it("opisuje harmonogram", () => {
    const base = { validFrom: "2026-10-01", weekdays: null, timesPerWeek: null, intervalDays: null, targetValue: 1 };
    expect(describePlan({ ...base, frequency: "daily" }, "check", null)).toBe("codziennie");
    expect(describePlan({ ...base, frequency: "weekdays", weekdays: [5, 1, 3] }, "check", null)).toBe("pn, śr, pt");
    expect(describePlan({ ...base, frequency: "weekdays", weekdays: [1, 2, 3, 4, 5] }, "check", null)).toBe("w dni robocze");
    expect(describePlan({ ...base, frequency: "weekly_count", timesPerWeek: 1 }, "check", null)).toBe("1 raz w tygodniu");
    expect(describePlan({ ...base, frequency: "weekly_count", timesPerWeek: 3 }, "check", null)).toBe("3 razy w tygodniu");
    expect(describePlan({ ...base, frequency: "every_n_days", intervalDays: 2 }, "check", null)).toBe("co 2 dni");
    expect(describePlan({ ...base, frequency: "daily", targetValue: 20 }, "count", "strony")).toBe("20 strony · codziennie");
    expect(describePlan({ ...base, frequency: "daily", targetValue: 10 }, "duration", null)).toBe("10 min · codziennie");
  });

  it("daty", () => {
    expect(formatDayLong("2026-10-11")).toBe("niedziela, 11 października");
    expect(formatWeekdayShort("2026-10-12")).toBe("PN");
  });
});
