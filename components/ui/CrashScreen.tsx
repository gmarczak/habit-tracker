"use client";

import { useEffect } from "react";
import { btnPrimary, btnSecondary } from "@/components/ui/styles";
import { crashReport, isChunkLoadError, mayAutoReload } from "@/lib/crash";

const RELOAD_KEY = "crash-auto-reload-at";

function lastAutoReload(): number | null {
  try {
    const at = Number(sessionStorage.getItem(RELOAD_KEY));
    return Number.isFinite(at) && at > 0 ? at : null;
  } catch {
    return null;
  }
}

/** Zapisuje czas odświeżenia; false, gdy przeglądarka nie pozwala (wtedy bez auto-odświeżania, żeby nie zapętlić). */
function markAutoReload(now: number): boolean {
  try {
    sessionStorage.setItem(RELOAD_KEY, String(now));
    return sessionStorage.getItem(RELOAD_KEY) === String(now);
  } catch {
    return false;
  }
}

/**
 * Zamiast białej strony Next.js „This page couldn’t load”. Zgłasza błąd (/api/client-error),
 * a gdy nie doczytał się plik aplikacji (nowe wdrożenie, aktualizacja service workera), sam odświeża stronę raz.
 */
export function CrashScreen({ error }: { error: unknown }) {
  useEffect(() => {
    const report = crashReport(error, `${window.location.pathname}${window.location.search}`, navigator.userAgent);
    // Zgłoszenie bez sesji i bez czekania: ma dojść także wtedy, gdy zepsuła się właśnie sesja
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
      keepalive: true,
    }).catch(() => {});

    const now = Date.now();
    if (isChunkLoadError(error) && mayAutoReload(lastAutoReload(), now) && markAutoReload(now)) window.location.reload();
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-5 bg-bg px-6 text-text">
      <div className="flex flex-col gap-2">
        <h1 className="font-serif text-[28px] font-bold leading-tight">Coś się zacięło</h1>
        <p className="text-[15px] text-muted">
          Odśwież stronę albo wróć do ekranu Dziś. Jeśli brakuje któregoś odhaczenia sprzed chwili, zaznacz je jeszcze raz.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <button type="button" onClick={() => window.location.reload()} className={btnPrimary}>
          Odśwież
        </button>
        {/* eslint-disable-next-line @next/next/no-location-assign-relative-destination -- po awarii pełne załadowanie, nie router */}
        <button type="button" onClick={() => window.location.assign("/")} className={btnSecondary}>
          Wróć do ekranu Dziś
        </button>
      </div>
    </main>
  );
}
