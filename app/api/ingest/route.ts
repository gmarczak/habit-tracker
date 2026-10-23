import { parseIngestBody } from "@/lib/domain/health";
import { bearerToken, missingToken, shortcutClient } from "@/lib/server/shortcut";

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
    return Response.json({ error: "Treść musi być JSON-em" }, { status: 400 });
  }
  const parsed = parseIngestBody(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await shortcutClient().rpc("ingest_metrics", {
    p_token: token,
    p_metrics: parsed.value.metrics,
    ...(parsed.value.date ? { p_date: parsed.value.date } : {}),
  });

  if (error) {
    if (error.message === "invalid_token") return Response.json({ error: "Zły albo wyłączony klucz" }, { status: 401 });
    if (["date_in_future", "date_too_old", "metrics_not_object"].includes(error.message))
      return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: "Nie udało się zapisać" }, { status: 500 });
  }
  return Response.json(data);
}
