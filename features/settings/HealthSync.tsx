"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { btnDanger, btnPrimary, btnSecondary, groupHeader, sectionTitle } from "@/components/ui/styles";
import { useAction, useSnapshot, useToday } from "@/lib/data/hooks";
import { fetchTokenStatus, newApiToken, revokeApiToken } from "@/lib/data/mutations";
import { supabaseBrowser } from "@/lib/db/client";
import { HEALTH_METRICS, METRIC_INFO } from "@/lib/domain/health";
import { formatNumber } from "@/lib/format";

export const tokenKey = ["api-token"] as const;

function formatStamp(iso: string): string {
  return new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** Apple Zdrowie przez Skróty: klucz, adres i instrukcja. Garmin i Fitatu zapisują do Zdrowia, Skrót przesyła dzienne sumy. */
export function HealthSync({ showTitle = true }: { showTitle?: boolean }) {
  const { data: snapshot } = useSnapshot();
  const today = useToday(snapshot);
  const qc = useQueryClient();
  const status = useQuery({ queryKey: tokenKey, queryFn: () => fetchTokenStatus(supabaseBrowser()) });
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = useAction((s) => newApiToken(s));
  const revoke = useAction((s) => revokeApiToken(s));

  if (!snapshot) return null;
  const todayValues = today ? (snapshot.health ?? []).filter((d) => d.date === today) : [];
  const endpoint = typeof window === "undefined" ? "/api/ingest" : `${window.location.origin}/api/ingest`;
  const linked = snapshot.habits.filter((h) => h.archivedAt === null && h.source);

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setError("Nie udało się skopiować — zaznacz tekst i skopiuj ręcznie.");
    }
  }

  function makeToken() {
    setError(null);
    create.mutate(undefined, {
      onSuccess: (t) => {
        setToken(t);
        setCopied(null);
        void qc.invalidateQueries({ queryKey: tokenKey });
      },
      onError: (e) => setError(e.message),
    });
  }

  return (
    <section aria-labelledby="health-title" className="flex flex-col gap-4">
      <h2 id="health-title" className={showTitle ? sectionTitle : "sr-only"}>
        Apple Zdrowie
      </h2>
      <p className="text-sm text-muted">
        Garmin Connect, Fitatu i inne aplikacje zapisują dane do Zdrowia na iPhonie. Skrót wysyła tu dzienne sumy, a nawyki z ustawionym źródłem
        odhaczają się same.
      </p>

      {todayValues.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className={groupHeader}>Dziś z Apple Zdrowie</h3>
          <ul className="ios-group">
            {todayValues.map((d) => (
              <li key={d.metric} className="flex items-center justify-between gap-3 border-b-[0.5px] border-border py-3 text-[15px]">
                <span>{METRIC_INFO[d.metric].label}</span>
                <span className="font-semibold tabular-nums">
                  {formatNumber(d.value)} {METRIC_INFO[d.metric].unit}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {linked.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border rounded-xl bg-surface px-4">
          {linked.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <span className="font-semibold">{h.name}</span>
              <span className="text-muted">
                {METRIC_INFO[h.source!].label}
                {h.kind === "check" && h.sourceMin ? ` ≥ ${formatNumber(h.sourceMin)} ${METRIC_INFO[h.source!].unit}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-surface px-4 py-3 text-sm">
          Żaden nawyk nie ma jeszcze źródła. Ustawisz je w edycji nawyku (
          <Link href="/habits" className="underline underline-offset-2">
            Nawyki
          </Link>
          ) → „Z Apple Zdrowie”.
        </p>
      )}

      {status.data ? (
        <p className="text-sm">
          Klucz aktywny od {formatStamp(status.data.createdAt)}.{" "}
          {status.data.lastUsedAt ? `Ostatnie dane: ${formatStamp(status.data.lastUsedAt)}.` : "Skrót jeszcze nic nie wysłał."}
        </p>
      ) : (
        status.isSuccess && <p className="text-sm text-muted">Brak klucza — utwórz go, żeby Skrót mógł wysyłać dane.</p>
      )}

      {token && (
        <div className="flex flex-col gap-2 rounded-xl border-[1.5px] border-accent px-4 py-3">
          <span className="text-sm font-semibold">Twój klucz — widać go tylko teraz</span>
          <code className="break-all text-sm">{token}</code>
          <button type="button" onClick={() => void copy(token, "token")} className={`${btnSecondary} self-start`}>
            {copied === "token" ? "Skopiowano" : "Kopiuj klucz"}
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={create.isPending} onClick={makeToken} className={btnPrimary}>
          {create.isPending ? "Tworzę…" : status.data ? "Nowy klucz" : "Utwórz klucz"}
        </button>
        {status.data && (
          <button
            type="button"
            disabled={revoke.isPending}
            onClick={() =>
              revoke.mutate(undefined, {
                onSuccess: () => {
                  setToken(null);
                  void qc.invalidateQueries({ queryKey: tokenKey });
                },
                onError: (e) => setError(e.message),
              })
            }
            className={btnDanger}
          >
            Wyłącz
          </button>
        )}
      </div>
      {status.data && !token && <p className="text-xs text-muted">„Nowy klucz” unieważnia poprzedni — trzeba go wtedy podmienić w Skrócie.</p>}
      {error && <p className="text-sm text-danger">{error}</p>}

      <details className="rounded-xl bg-surface px-4 py-3 text-sm">
        <summary className="cursor-pointer font-semibold">Jak zrobić Skrót (5 minut)</summary>
        <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5">
          <li>
            Skróty → <b>+</b>. Dla każdej danej, której używasz: <b>Znajdź próbki zdrowotne</b> (typ np. Kroki, „Data rozpoczęcia jest dzisiaj”), a pod
            spodem <b>Oblicz statystyki</b> → Suma.
          </li>
          <li>
            <b>Pobierz zawartość adresu URL</b>:
            <span className="mt-1 flex items-center gap-2">
              <code className="break-all">{endpoint}</code>
              <button type="button" onClick={() => void copy(endpoint, "url")} className="shrink-0 font-semibold text-accent">
                {copied === "url" ? "Skopiowano" : "Kopiuj"}
              </button>
            </span>
            Metoda <b>POST</b>, nagłówek <code>Authorization</code> = <code>Bearer </code> + klucz, treść <b>JSON</b> — pola typu Liczba z wynikami statystyk:
          </li>
        </ol>
        <ul className="mt-2 flex flex-col gap-1 pl-5">
          {HEALTH_METRICS.map((m) => (
            <li key={m}>
              <code>{m}</code> — {METRIC_INFO[m].health}
            </li>
          ))}
        </ul>
        <ol start={3} className="mt-2 flex list-decimal flex-col gap-2 pl-5">
          <li>
            Automatyzacja → <b>Pora dnia</b>, np. 21:30 (i drugi raz przed końcem dnia) → ten Skrót → <b>Uruchom natychmiast</b>.
          </li>
        </ol>
        <p className="mt-3 text-muted">
          Dzień liczy aplikacja według Twojej strefy. Wysyłanie kilka razy dziennie jest bezpieczne: tak/nie odhacza się po przekroczeniu progu, a
          ilość/czas bierze największą sumę z dnia. Pominiętych dni Skrót nie rusza.
        </p>
      </details>
    </section>
  );
}
