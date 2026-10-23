"use client";

import Link from "next/link";
import { useState } from "react";
import { groupHeader, sectionTitle } from "@/components/ui/styles";
import { useSnapshot, useToday } from "@/lib/data/hooks";
import { HEALTH_METRICS, METRIC_INFO } from "@/lib/domain/health";
import { formatNumber } from "@/lib/format";
import { ShortcutKey } from "./ShortcutKey";

/** Apple Zdrowie przez Skróty: klucz, adres i instrukcja. Garmin i Fitatu zapisują do Zdrowia, Skrót przesyła dzienne sumy. */
export function HealthSync({ showTitle = true }: { showTitle?: boolean }) {
  const { data: snapshot } = useSnapshot();
  const today = useToday(snapshot);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!snapshot) return null;
  const todayValues = today ? (snapshot.health ?? []).filter((d) => d.date === today) : [];
  const endpoint = typeof window === "undefined" ? "/api/ingest" : `${window.location.origin}/api/ingest`;
  const linked = snapshot.habits.filter((h) => h.archivedAt === null && h.source);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setError("Nie udało się skopiować — zaznacz tekst i skopiuj ręcznie.");
    }
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

      <ShortcutKey />
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
              <button type="button" onClick={() => void copy(endpoint)} className="shrink-0 font-semibold text-accent">
                {copied ? "Skopiowano" : "Kopiuj"}
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
