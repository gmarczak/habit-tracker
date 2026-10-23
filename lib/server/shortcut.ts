import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { supabaseEnv } from "@/lib/db/env";

/** Klucz ze Skrótu: nagłówek `Authorization: Bearer ht_…`. */
export function bearerToken(request: Request): string | null {
  return request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;
}

/** Klient bez sesji: RPC dla Skrótów same sprawdzają klucz (w bazie tylko jego skrót). */
export function shortcutClient() {
  const { url, key } = supabaseEnv();
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const missingToken = () => Response.json({ error: "Brak klucza: nagłówek Authorization: Bearer <klucz>" }, { status: 401 });
