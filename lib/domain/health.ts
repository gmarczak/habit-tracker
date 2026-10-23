import { isLocalDate, type LocalDate } from "./dates";

/** Dane z Apple Zdrowie, które mogą wypełniać nawyk. Klucze = habits.source i pola w żądaniu /api/ingest. */
export const HEALTH_METRICS = ["steps", "distance_km", "exercise_min", "active_kcal", "mindful_min", "water_ml", "workouts"] as const;
export type HealthMetric = (typeof HEALTH_METRICS)[number];

export const METRIC_INFO: Record<HealthMetric, { label: string; unit: string; health: string; defaultMin: number }> = {
  steps: { label: "Kroki", unit: "kroków", health: "Kroki", defaultMin: 7000 },
  distance_km: { label: "Dystans marszu i biegu", unit: "km", health: "Dystans marszu i biegu (km)", defaultMin: 5 },
  exercise_min: { label: "Minuty ćwiczeń", unit: "min", health: "Minuty ćwiczeń", defaultMin: 30 },
  active_kcal: { label: "Aktywna energia", unit: "kcal", health: "Aktywna energia", defaultMin: 400 },
  mindful_min: { label: "Minuty uważności", unit: "min", health: "Minuty uważności", defaultMin: 10 },
  water_ml: { label: "Woda", unit: "ml", health: "Woda (ml)", defaultMin: 2000 },
  workouts: { label: "Treningi", unit: "treningów", health: "Treningi (liczba)", defaultMin: 1 },
};

export function isHealthMetric(value: unknown): value is HealthMetric {
  return typeof value === "string" && (HEALTH_METRICS as readonly string[]).includes(value);
}

export type IngestBody = { date: LocalDate | null; metrics: Partial<Record<HealthMetric, number>> };

/** Liczba z Shortcuts: number albo tekst w polskim formacie („8 234”, „1,5”). */
function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\s  ]/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/**
 * Treść żądania ze Skrótu: płaski słownik, np. { "date": "2026-10-23", "steps": 8234, "water_ml": "1 500" }.
 * Nieznane pola są ignorowane; brak żadnej znanej danej to błąd.
 */
export function parseIngestBody(body: unknown): { ok: true; value: IngestBody } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, error: "Oczekuję obiektu JSON" };
  const record = body as Record<string, unknown>;

  let date: LocalDate | null = null;
  if (record.date !== undefined && record.date !== null && record.date !== "") {
    const text = typeof record.date === "string" ? record.date.slice(0, 10) : "";
    if (!isLocalDate(text)) return { ok: false, error: "Pole date ma format RRRR-MM-DD" };
    date = text;
  }

  const metrics: Partial<Record<HealthMetric, number>> = {};
  for (const key of HEALTH_METRICS) {
    if (record[key] === undefined || record[key] === null || record[key] === "") continue;
    const n = toNumber(record[key]);
    if (n === null || n < 0) return { ok: false, error: `Pole ${key} musi być liczbą ≥ 0` };
    metrics[key] = Math.round(n * 100) / 100;
  }
  if (Object.keys(metrics).length === 0) return { ok: false, error: `Brak danych. Pola: ${HEALTH_METRICS.join(", ")}` };
  return { ok: true, value: { date, metrics } };
}
