import { parseLogBody } from "@/lib/domain/health";
import { formatNumber } from "@/lib/format";
import { bearerToken, missingToken, shortcutClient } from "@/lib/server/shortcut";

/**
 * Siri, Action Button, NFC i Apple Watch przez Skróty.
 * GET  → { habits: [{ name, kind, unit }] } — do menu „Wybierz z listy”
 * POST → { habit: "Medytacja", value?: 10, date?: "RRRR-MM-DD" } — odhacza po nazwie;
 *        odpowiedź ma pole `message` do odczytania przez Siri.
 */
export async function GET(request: Request) {
  const token = bearerToken(request);
  if (!token) return missingToken();
  const { data, error } = await shortcutClient().rpc("token_habits", { p_token: token });
  if (error) return error.message === "invalid_token" ? Response.json({ error: "Zły albo wyłączony klucz" }, { status: 401 }) : Response.json({ error: "Nie udało się" }, { status: 500 });
  return Response.json({ habits: data });
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return missingToken();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Treść musi być JSON-em" }, { status: 400 });
  }
  const parsed = parseLogBody(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const { habit, value, date } = parsed.value;

  const { data, error } = await shortcutClient().rpc("log_habit", {
    p_token: token,
    p_habit: habit,
    ...(value !== null ? { p_value: value } : {}),
    ...(date ? { p_date: date } : {}),
  });

  if (error) {
    const known: Record<string, [number, string]> = {
      invalid_token: [401, "Zły albo wyłączony klucz"],
      habit_not_found: [404, `Nie ma nawyku „${habit}”`],
      habit_ambiguous: [409, `„${habit}” pasuje do kilku nawyków — podaj pełną nazwę`],
      date_in_future: [400, "Data z przyszłości"],
      date_too_old: [400, "Data starsza niż 30 dni"],
      date_before_start: [400, "Nawyk jeszcze wtedy nie istniał"],
      bad_value: [400, "Zła wartość"],
    };
    const [status, message] = known[error.message] ?? [500, "Nie udało się zapisać"];
    return Response.json({ error: message, message }, { status });
  }

  const r = data as { habit: string; value: number; target: number; done: boolean };
  const message = r.done
    ? r.target > 1
      ? `${r.habit}: ${formatNumber(r.value)} z ${formatNumber(r.target)} — zrobione`
      : `${r.habit} — zrobione`
    : `${r.habit}: ${formatNumber(r.value)} z ${formatNumber(r.target)}`;
  return Response.json({ ...r, message });
}
