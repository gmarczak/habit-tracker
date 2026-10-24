import { parseLogBody } from "@/lib/domain/health";
import { formatNumber } from "@/lib/format";
import { SHORTCUT_ERRORS, bearerToken, fail, missingToken, shortcutClient } from "@/lib/server/shortcut";

/**
 * Siri, Action Button, NFC i Apple Watch przez Skróty.
 * GET  → { habits: [{ id, name, kind, unit }] } — do menu „Wybierz z listy” (habit może być też id)
 * POST → { habit: "Medytacja", value?: 10, date?: "RRRR-MM-DD" } — odhacza po nazwie;
 *        odpowiedź ma pole `message` do odczytania przez Siri.
 */
export async function GET(request: Request) {
  const token = bearerToken(request);
  if (!token) return missingToken();
  const { data, error } = await shortcutClient().rpc("token_habits", { p_token: token });
  if (error) return error.message === "invalid_token" ? fail(...SHORTCUT_ERRORS.invalid_token!) : fail(500, "Nie udało się");
  return Response.json({ habits: data });
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return missingToken();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Treść musi być JSON-em");
  }
  const parsed = parseLogBody(body);
  if (!parsed.ok) return fail(400, parsed.error);
  const { habit, value, date } = parsed.value;

  const { data, error } = await shortcutClient().rpc("log_habit", {
    p_token: token,
    p_habit: habit,
    ...(value !== null ? { p_value: value } : {}),
    ...(date ? { p_date: date } : {}),
  });

  if (error) {
    const known: Record<string, [number, string]> = {
      ...SHORTCUT_ERRORS,
      habit_not_found: [404, `Nie ma nawyku „${habit}”`],
      habit_ambiguous: [409, `„${habit}” pasuje do kilku nawyków — podaj pełną nazwę`],
    };
    return fail(...(known[error.message] ?? [500, "Nie udało się zapisać"]));
  }

  const r = data as { habit: string; value: number; target: number; done: boolean };
  const message = r.done
    ? r.target > 1
      ? `${r.habit}: ${formatNumber(r.value)} z ${formatNumber(r.target)} — zrobione`
      : `${r.habit} — zrobione`
    : `${r.habit}: ${formatNumber(r.value)} z ${formatNumber(r.target)}`;
  return Response.json({ ...r, message });
}
