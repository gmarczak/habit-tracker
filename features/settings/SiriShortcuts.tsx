"use client";

import { useState } from "react";
import { groupHeader } from "@/components/ui/styles";
import type { Snapshot } from "@/lib/data/snapshot";
import { ShortcutKey } from "./ShortcutKey";

/** Odhaczanie bez otwierania aplikacji: Siri, Action Button, naklejka NFC, Apple Watch — wszystko przez Skróty i /api/log. */
export function SiriShortcuts({ snapshot }: { snapshot: Snapshot }) {
  const [copied, setCopied] = useState<string | null>(null);
  const endpoint = typeof window === "undefined" ? "/api/log" : `${window.location.origin}/api/log`;
  const habits = snapshot.habits.filter((h) => h.archivedAt === null && h.goal === "build");

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
    } catch {
      setCopied(null);
    }
  }

  return (
    <section className="flex flex-col gap-5">
      <p className="text-sm text-muted">
        Odhaczaj bez otwierania aplikacji: „Hej Siri, medytacja zrobiona”, przycisk czynności, naklejka NFC przy łóżku albo zegarek. Ilość dodaje się
        (np. +10 stron), czas domyślnie dopisuje cały cel.
      </p>

      <div className="flex flex-col gap-1.5">
        <h2 className={groupHeader}>Klucz</h2>
        <div className="rounded-xl bg-surface p-4">
          <ShortcutKey />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <h2 className={groupHeader}>Adres</h2>
        <div className="flex items-center gap-2 rounded-xl bg-surface px-4 py-3 text-sm">
          <code className="flex-1 break-all">{endpoint}</code>
          <button type="button" onClick={() => void copy(endpoint)} className="inline-flex min-h-11 shrink-0 items-center px-2 font-semibold text-accent">
            {copied === endpoint ? "Skopiowano" : "Kopiuj"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <h2 className={groupHeader}>Skrót na jeden nawyk (Siri)</h2>
        <ol className="flex list-decimal flex-col gap-2 rounded-xl bg-surface py-3 pl-9 pr-4 text-sm">
          <li>
            Skróty → <b>+</b> → <b>Pobierz zawartość adresu URL</b>: adres jak wyżej, metoda <b>POST</b>.
          </li>
          <li>
            Nagłówek <code>Authorization</code> = <code>Bearer </code> + klucz. Treść <b>JSON</b>: pole <code>habit</code> (tekst) = nazwa nawyku. Dla ilości możesz dodać{" "}
            <code>value</code> (liczba), np. 10 stron.
          </li>
          <li>
            <b>Pobierz wartość słownika</b> <code>message</code> → <b>Pokaż wynik</b> — Siri powie np. „Medytacja — zrobione”.
          </li>
          <li>
            Nazwij skrót tak, jak chcesz mówić, np. <b>Medytacja zrobiona</b>. Gotowe: „Hej Siri, medytacja zrobiona”.
          </li>
        </ol>
      </div>

      <div className="flex flex-col gap-1.5">
        <h2 className={groupHeader}>Jeden skrót na wszystkie nawyki</h2>
        <ol className="flex list-decimal flex-col gap-2 rounded-xl bg-surface py-3 pl-9 pr-4 text-sm">
          <li>
            <b>Pobierz zawartość adresu URL</b> (metoda <b>GET</b>, ten sam nagłówek) → <b>Pobierz wartość słownika</b> <code>habits</code>.
          </li>
          <li>
            <b>Powtórz z każdym</b> → wartość <code>name</code>, potem <b>Wybierz z listy</b>.
          </li>
          <li>
            Wybrany nawyk wyślij jak wyżej (POST, <code>habit</code> = wybrany element).
          </li>
        </ol>
      </div>

      <div className="flex flex-col gap-1.5">
        <h2 className={groupHeader}>Przycisk czynności, NFC, zegarek</h2>
        <ul className="flex list-disc flex-col gap-2 rounded-xl bg-surface py-3 pl-9 pr-4 text-sm">
          <li>
            <b>Przycisk czynności</b> (iPhone 15 Pro i nowsze): Ustawienia iPhone’a → Przycisk czynności → Skrót → wybierz skrót.
          </li>
          <li>
            <b>Naklejka NFC</b>: Skróty → Automatyzacja → <b>NFC</b> → przyłóż naklejkę → wybierz skrót → <b>Uruchom natychmiast</b>. Np. naklejka przy macie do
            medytacji albo na półce z książkami.
          </li>
          <li>
            <b>Apple Watch</b>: w szczegółach skrótu włącz <b>Pokaż na Apple Watch</b> — odhaczysz z zegarka.
          </li>
        </ul>
      </div>

      {habits.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h2 className={groupHeader}>Twoje nawyki — dotknij, by skopiować nazwę</h2>
          <ul className="ios-group">
            {habits.map(({ id, name }) => (
              <li key={id}>
                <button type="button" onClick={() => void copy(name)} className="flex w-full items-center justify-between border-b-[0.5px] border-border py-3 text-left">
                  <span>{name}</span>
                  <span className="text-[13px] text-accent">{copied === name ? "Skopiowano" : "Kopiuj"}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="px-4 text-xs text-muted">Wielkość liter nie ma znaczenia; wystarczy też jednoznaczny początek nazwy (min. 3 litery).</p>
        </div>
      )}
    </section>
  );
}
