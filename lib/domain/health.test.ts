import { describe, expect, it } from "vitest";
import { healthAverage, healthValue, parseIngestBody, type HealthDay } from "./health";

describe("parseIngestBody", () => {
  it("przyjmuje liczby i polski zapis z Shortcuts", () => {
    expect(parseIngestBody({ steps: 8234, water_ml: "1 500", distance_km: "5,27", exercise_min: "12 " })).toEqual({
      ok: true,
      value: { date: null, metrics: { steps: 8234, water_ml: 1500, distance_km: 5.27, exercise_min: 12 } },
    });
  });

  it("bierze dzień z daty ISO z godziną i ignoruje nieznane pola", () => {
    const r = parseIngestBody({ date: "2026-10-22T21:00:00+02:00", steps: 100, heart_rate: 60 });
    expect(r).toEqual({ ok: true, value: { date: "2026-10-22", metrics: { steps: 100 } } });
  });

  it("puste pola pomija, zaokrągla do 0,01", () => {
    expect(parseIngestBody({ date: "", steps: "", mindful_min: 10.456 })).toEqual({ ok: true, value: { date: null, metrics: { mindful_min: 10.46 } } });
  });

  it("odrzuca złe dane", () => {
    expect(parseIngestBody([1]).ok).toBe(false);
    expect(parseIngestBody(null).ok).toBe(false);
    expect(parseIngestBody({}).ok).toBe(false);
    expect(parseIngestBody({ heart_rate: 60 }).ok).toBe(false);
    expect(parseIngestBody({ steps: "dużo" }).ok).toBe(false);
    expect(parseIngestBody({ steps: -5 }).ok).toBe(false);
    expect(parseIngestBody({ steps: 1, date: "23.10.2026" }).ok).toBe(false);
  });
});

describe("wartości z Apple Zdrowie", () => {
  const days: HealthDay[] = [
    { date: "2026-10-23", metric: "steps", value: 4312 },
    { date: "2026-10-22", metric: "steps", value: 9000 },
    { date: "2026-10-20", metric: "steps", value: 7000 },
    { date: "2026-10-10", metric: "steps", value: 100 }, // poza oknem 7 dni
    { date: "2026-10-22", metric: "water_ml", value: 1500 },
  ];

  it("wartość dnia albo null", () => {
    expect(healthValue(days, "steps", "2026-10-23")).toBe(4312);
    expect(healthValue(days, "steps", "2026-10-21")).toBeNull();
  });

  it("średnia z ostatnich 7 dni bez dziś, tylko z dni z danymi", () => {
    expect(healthAverage(days, "steps", "2026-10-23", 7)).toBe(8000);
    expect(healthAverage(days, "mindful_min", "2026-10-23", 7)).toBeNull();
  });
});
