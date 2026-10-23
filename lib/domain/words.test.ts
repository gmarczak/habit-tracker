import { describe, expect, it } from "vitest";
import { metricUnit, metricUnitOf } from "./health";
import { habitCount, habitsLeft, plural } from "./words";

describe("odmiana", () => {
  it("nawyki: 1, 2–4, 5+, 12–14, 22", () => {
    expect([1, 3, 5, 12, 22, 25].map(habitCount)).toEqual(["1 nawyk", "3 nawyki", "5 nawyków", "12 nawyków", "22 nawyki", "25 nawyków"]);
    expect(habitsLeft(1)).toBe("Został 1 nawyk");
    expect(habitsLeft(3)).toBe("Zostały 3 nawyki");
    expect(habitsLeft(5, false)).toBe("zostało 5 nawyków");
  });

  it("ułamek bierze formę dopełniacza", () => {
    expect(plural(2.5, "kilometr", "kilometry", "kilometrów")).toBe("kilometrów");
  });

  it("jednostki z Apple Zdrowie po liczbie i po „z”/„od”", () => {
    expect([1, 2, 5].map((n) => metricUnit("workouts", n))).toEqual(["trening", "treningi", "treningów"]);
    expect(metricUnit("steps", 4312)).toBe("kroków");
    expect(metricUnitOf("workouts", 1)).toBe("treningu");
    expect(metricUnitOf("steps", 7000)).toBe("kroków");
    expect(metricUnit("distance_km", 3)).toBe("km");
  });
});
