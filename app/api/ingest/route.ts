import { parseIngestBody } from "@/lib/domain/health";
import { SHORTCUT_ERRORS, bearerToken, fail, missingToken, shortcutClient } from "@/lib/server/shortcut";

/**
 * Dzienne sumy z Apple Zdrowie wysyłane przez Skrót na iPhonie.
 * Nagłówek `Authorization: Bearer ht_…` (klucz z Ustawień), treść np. { "steps": 8234, "water_ml": 1500 }.
 * Bez sesji: klucz sprawdza RPC ingest_metrics (w bazie tylko jego skrót).
 */
export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return missingToken();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Treść musi być JSON-em");
  }
  const parsed = parseIngestBody(body);
  if (!parsed.ok) return fail(400, parsed.error);

  const { data, error } = await shortcutClient().rpc("ingest_metrics", {
    p_token: token,
    p_metrics: parsed.value.metrics,
    ...(parsed.value.date ? { p_date: parsed.value.date } : {}),
  });

  if (error) return fail(...(SHORTCUT_ERRORS[error.message] ?? [500, "Nie udało się zapisać"]));
  return Response.json(data);
}
