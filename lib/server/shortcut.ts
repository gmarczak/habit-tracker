import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { supabaseEnv } from "@/lib/db/env";

/** Klucz ze Skrótu: nagłówek `Authorization: Bearer ht_…` (sam klucz bez „Bearer” też przechodzi). */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization")?.trim() ?? "";
  return header.match(/^Bearer\s+(\S+)$/i)?.[1] ?? header.match(/^(ht_\S+)$/)?.[1] ?? null;
}

/** Klient bez sesji: RPC dla Skrótów same sprawdzają klucz (w bazie tylko jego skrót). */
export function shortcutClient() {
  const { url, key } = supabaseEnv();
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Błąd dla Skrótu: `message` to tekst, który Skrót pokazuje albo czyta Siri. */
export const fail = (status: number, text: string) => Response.json({ error: text, message: text }, { status });

export const missingToken = () => fail(401, "Brak klucza: nagłówek Authorization: Bearer <klucz>");

/** Kody błędów z funkcji w bazie wspólne dla Skrótów. */
export const SHORTCUT_ERRORS: Record<string, [number, string]> = {
  invalid_token: [401, "Zły albo wyłączony klucz"],
  date_in_future: [400, "Ten dzień jeszcze się nie zaczął"],
  date_too_old: [400, "Data starsza niż 30 dni"],
  date_before_start: [400, "Nawyk jeszcze wtedy nie istniał"],
  bad_value: [400, "Zła wartość"],
  metrics_not_object: [400, "Oczekuję obiektu JSON"],
};
