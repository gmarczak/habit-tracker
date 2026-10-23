"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { btnDanger, btnPrimary, btnSecondary } from "@/components/ui/styles";
import { useAction } from "@/lib/data/hooks";
import { fetchTokenStatus, newApiToken, revokeApiToken } from "@/lib/data/mutations";
import { supabaseBrowser } from "@/lib/db/client";

export const tokenKey = ["api-token"] as const;

function formatStamp(iso: string): string {
  return new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** Osobisty klucz dla Skrótów (Apple Zdrowie, Siri, NFC): status, utworzenie, wyłączenie. Jeden klucz do wszystkiego. */
export function ShortcutKey() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: tokenKey, queryFn: () => fetchTokenStatus(supabaseBrowser()) });
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = useAction((s) => newApiToken(s));
  const revoke = useAction((s) => revokeApiToken(s));

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setError("Nie udało się skopiować — zaznacz tekst i skopiuj ręcznie.");
    }
  }

  function makeToken() {
    setError(null);
    create.mutate(undefined, {
      onSuccess: (t) => {
        setToken(t);
        setCopied(false);
        void qc.invalidateQueries({ queryKey: tokenKey });
      },
      onError: (e) => setError(e.message),
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {status.data ? (
        <p className="text-sm">
          Klucz aktywny od {formatStamp(status.data.createdAt)}.{" "}
          {status.data.lastUsedAt ? `Ostatnio użyty: ${formatStamp(status.data.lastUsedAt)}.` : "Skrót jeszcze go nie użył."}
        </p>
      ) : (
        status.isSuccess && <p className="text-sm text-muted">Brak klucza — utwórz go, żeby Skróty mogły łączyć się z aplikacją.</p>
      )}

      {token && (
        <div className="flex flex-col gap-2 rounded-xl border-[1.5px] border-accent px-4 py-3">
          <span className="text-sm font-semibold">Twój klucz — widać go tylko teraz</span>
          <code className="break-all text-sm">{token}</code>
          <button type="button" onClick={() => void copy(token)} className={`${btnSecondary} self-start`}>
            {copied ? "Skopiowano" : "Kopiuj klucz"}
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
      {status.data && !token && <p className="text-xs text-muted">Jeden klucz działa we wszystkich Skrótach. „Nowy klucz” unieważnia poprzedni — trzeba go wtedy podmienić w Skrótach.</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
