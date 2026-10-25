"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { sectionTitle } from "@/components/ui/styles";
import { tokenKey } from "@/features/settings/ShortcutKey";
import { fetchTokenStatus } from "@/lib/data/mutations";
import { supabaseBrowser } from "@/lib/db/client";
import type { Habit } from "@/lib/domain/model";

/**
 * Odhaczanie po otwarciu innej aplikacji (Fitatu, Duolingo…). Aplikacja w przeglądarce nie widzi innych aplikacji,
 * ale automatyzacja „Aplikacja” w Skrótach na iPhonie tak: wysyła wtedy ten nawyk do /api/log.
 * Nawyk wskazujemy po id, więc zmiana nazwy nie psuje automatyzacji.
 */
export function AppTrigger({ habit }: { habit: Habit }) {
  const token = useQuery({ queryKey: tokenKey, queryFn: () => fetchTokenStatus(supabaseBrowser()) });
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endpoint = typeof window === "undefined" ? "/api/log" : `${window.location.origin}/api/log`;
  const unit = habit.kind === "duration" ? "min" : (habit.unit ?? "");

  async function copy(text: string) {
    setError(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
    } catch {
      setError("Nie udało się skopiować — zaznacz tekst i skopiuj ręcznie.");
    }
  }

  const copyButton = (text: string) => (
    <button type="button" onClick={() => void copy(text)} className="inline-flex min-h-11 shrink-0 items-center px-2 font-semibold text-accent">
      {copied === text ? "Skopiowano" : "Kopiuj"}
    </button>
  );

  return (
    <section aria-labelledby="app-trigger-title" className="flex flex-col gap-2">
      <h2 id="app-trigger-title" className={sectionTitle}>
        Po otwarciu aplikacji
      </h2>
      <p className="text-sm text-muted">
        Np. „{habit.name}” odhaczy się sam, gdy otworzysz Fitatu albo Duolingo. Robi to automatyzacja w Skrótach na iPhonie — ta aplikacja nie widzi
        innych aplikacji, Skróty tak.
      </p>

      <details className="rounded-xl bg-surface px-4 py-3 text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Jak ustawić (2 minuty)</summary>
        <ol className="mt-2 flex list-decimal flex-col gap-2.5 pl-5">
          <li>
            Skróty → <b>Automatyzacja</b> → <b>+</b> → <b>Aplikacja</b>.
          </li>
          <li>
            <b>Wybierz</b> aplikację (np. Fitatu), zaznacz <b>Jest otwierana</b> (albo <b>Jest zamykana</b>, jeśli wolisz po skończeniu), potem{" "}
            <b>Uruchom natychmiast</b> i wyłącz <b>Powiadamiaj przy uruchomieniu</b> → <b>Dalej</b> → <b>Nowy pusty skrót</b>.
          </li>
          <li>
            <span>
              Dodaj czynność <b>Pobierz zawartość adresu URL</b> z adresem:
            </span>
            <span className="mt-1 flex items-center gap-2">
              <code className="flex-1 break-all">{endpoint}</code>
              {copyButton(endpoint)}
            </span>
          </li>
          <li>
            Rozwiń czynność (strzałka): metoda <b>POST</b>, nagłówek <code>Authorization</code> = <code>Bearer </code> + klucz{" "}
            {token.isSuccess && !token.data ? (
              <>
                — nie masz jeszcze klucza,{" "}
                <Link href="/settings/siri" className="font-semibold text-accent underline underline-offset-2">
                  utwórz go w Ustawieniach
                </Link>
              </>
            ) : (
              "(ten sam, którego używasz dla Siri i Apple Zdrowie)"
            )}
            .
          </li>
          <li>
            <span>
              Treść żądania <b>JSON</b>, pole <code>habit</code> (Tekst) z wartością:
            </span>
            <span className="mt-1 flex items-center gap-2">
              <code className="flex-1 break-all">{habit.id}</code>
              {copyButton(habit.id)}
            </span>
            <span className="mt-1 block text-muted">To identyfikator tego nawyku — zadziała także po zmianie nazwy.</span>
          </li>
        </ol>
        <p className="mt-3 text-muted">
          {habit.kind === "check"
            ? "Każde otwarcie odhacza nawyk na dziś; kolejne otwarcia tego samego dnia niczego nie dublują."
            : habit.kind === "count"
              ? `Uwaga: przy nawyku ilościowym każde otwarcie doda 1 ${unit}. Jeśli ma się liczyć tylko „skorzystałem”, ustaw nawyk jako tak/nie.`
              : "Uwaga: przy nawyku czasowym każde otwarcie dopisze cały cel. Jeśli ma się liczyć tylko „skorzystałem”, ustaw nawyk jako tak/nie."}
        </p>
        {error && <p className="mt-2 text-danger">{error}</p>}
      </details>
    </section>
  );
}
