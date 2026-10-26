import { parseCrashReport } from "@/lib/crash";
import { shortcutClient } from "@/lib/server/shortcut";

const MAX_BYTES = 16_000;

/**
 * Błąd z przeglądarki (ekran „Coś się zacięło”): do logów Vercela i do tabeli client_errors.
 * Bez sesji i poza proxy.ts — zgłoszenie ma dojść także wtedy, gdy zepsuła się właśnie sesja.
 * Logi Vercela na planie Hobby żyją godzinę, dlatego zapis także w bazie (limit w report_client_error).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = JSON.parse((await request.text()).slice(0, MAX_BYTES));
  } catch {
    return new Response(null, { status: 400 });
  }
  const report = parseCrashReport(body);
  if (!report) return new Response(null, { status: 400 });

  console.error("[client-error]", JSON.stringify(report));
  const { error } = await shortcutClient().rpc("report_client_error", {
    p_message: report.message,
    p_kind: report.kind,
    p_url: report.url,
    p_user_agent: report.userAgent,
    ...(report.stack ? { p_stack: report.stack } : {}),
    ...(report.digest ? { p_digest: report.digest } : {}),
  });
  if (error) console.error("[client-error] zapis do bazy:", error.message);
  return new Response(null, { status: 204 });
}
