/**
 * Awaria w przeglądarce: rozpoznanie, zgłoszenie i ochrona przed pętlą odświeżania.
 * Czysta logika (bez DOM) — używa jej ekran awarii i /api/client-error.
 */

export type CrashKind = "chunk" | "render";

export type CrashReport = {
  message: string;
  stack: string | null;
  digest: string | null;
  url: string;
  userAgent: string;
  kind: CrashKind;
};

const LIMITS = { message: 1000, stack: 8000, digest: 100, url: 500, userAgent: 500 } as const;

/**
 * Nie doczytał się plik JS albo CSS (nowe wdrożenie, aktualizacja service workera, zerwane połączenie).
 * Pomaga pełne odświeżenie: strona pobierze pliki z bieżącego wdrożenia.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "ChunkLoadError") return true;
  return /Loading (?:CSS )?chunk [\w/.-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    error.message,
  );
}

export function crashReport(error: unknown, url: string, userAgent: string): CrashReport {
  const e = error instanceof Error ? error : null;
  const digest = e && "digest" in e && typeof e.digest === "string" ? e.digest : null;
  return {
    message: (e ? `${e.name}: ${e.message}` : String(error)).slice(0, LIMITS.message),
    stack: e?.stack?.slice(0, LIMITS.stack) ?? null,
    digest: digest?.slice(0, LIMITS.digest) ?? null,
    url: url.slice(0, LIMITS.url),
    userAgent: userAgent.slice(0, LIMITS.userAgent),
    kind: isChunkLoadError(error) ? "chunk" : "render",
  };
}

const text = (v: unknown, max: number): string | null => (typeof v === "string" && v.length > 0 ? v.slice(0, max) : null);

/** Zgłoszenie z sieci: tylko znane pola, przycięte do limitów; null, gdy brak treści błędu. */
export function parseCrashReport(body: unknown): CrashReport | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const message = text(b.message, LIMITS.message);
  if (!message) return null;
  return {
    message,
    stack: text(b.stack, LIMITS.stack),
    digest: text(b.digest, LIMITS.digest),
    url: text(b.url, LIMITS.url) ?? "",
    userAgent: text(b.userAgent, LIMITS.userAgent) ?? "",
    kind: b.kind === "chunk" ? "chunk" : "render",
  };
}

/** Najwyżej jedno automatyczne odświeżenie na minutę: gdy błąd wraca po przeładowaniu, zostaje ekran z przyciskami. */
export const AUTO_RELOAD_WINDOW_MS = 60_000;

export function mayAutoReload(lastReloadAt: number | null, now: number): boolean {
  return lastReloadAt === null || now - lastReloadAt > AUTO_RELOAD_WINDOW_MS;
}
