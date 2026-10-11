import { describe, expect, it } from "vitest";
import { formatDayLong, formatStreak, formatWeekdayShort, plural } from "./format";

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

  it("daty", () => {
    expect(formatDayLong("2026-10-11")).toBe("niedziela, 11 października");
    expect(formatWeekdayShort("2026-10-12")).toBe("PN");
  });
});
