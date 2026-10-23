"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { supabaseBrowser, type Supabase } from "@/lib/db/client";
import { localDate, type LocalDate } from "@/lib/domain/dates";
import { entryFromChange, withEntry, type EntryChange } from "./mutations";
import { fetchSnapshot, type Snapshot } from "./snapshot";

export const snapshotKey = ["snapshot"] as const;
export const entryMutationKey = ["entry"] as const;
/** Zapisy dnia idą po kolei (także po powrocie sieci): „+1, +1, cofnij” dociera w tej kolejności. */
export const entryScope = { id: "entries" } as const;

export const OFFLINE_MESSAGE = "Brak sieci — tej zmiany nie zapisano. Odhaczanie działa offline, reszta po powrocie sieci.";

export function useSnapshot() {
  return useQuery({
    queryKey: snapshotKey,
    queryFn: () => fetchSnapshot(supabaseBrowser()),
    staleTime: 60_000,
  });
}

/** Dzisiejsza data użytkownika; odświeża się co minutę i po powrocie do karty. */
export function useToday(snapshot: Snapshot | undefined): LocalDate | null {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  if (!snapshot) return null;
  return localDate(now, snapshot.settings.timeZone, snapshot.settings.dayStartHour);
}

/**
 * Zapis dnia: cache zmienia się od razu, serwer potwierdza w tle.
 * Funkcja zapisu jest zarejestrowana w providers.tsx (setMutationDefaults),
 * dzięki czemu zapis wstrzymany bez sieci przetrwa zamknięcie aplikacji i wróci po odzyskaniu sieci.
 */
export function useEntryMutation() {
  const qc = useQueryClient();
  return useMutation<void, Error, EntryChange, { previous: Snapshot | undefined }>({
    mutationKey: entryMutationKey,
    scope: entryScope,
    onMutate: async (change) => {
      await qc.cancelQueries({ queryKey: snapshotKey });
      const previous = qc.getQueryData<Snapshot>(snapshotKey);
      if (previous) {
        const before = previous.entries.find((e) => e.habitId === change.habitId && e.date === change.date);
        qc.setQueryData<Snapshot>(snapshotKey, withEntry(previous, change.habitId, change.date, entryFromChange(change, before)));
      }
      return { previous };
    },
    onError: (_error, _change, context) => {
      if (context?.previous) qc.setQueryData(snapshotKey, context.previous);
    },
  });
}

/**
 * Pozostałe zapisy (nawyki, kategorie, pauzy, ustawienia): wymagają sieci,
 * po sukcesie odświeżają cały snapshot. Opcjonalna zmiana optymistyczna cache.
 * Bez sieci nie czekają w kolejce (nie przetrwałyby zamknięcia aplikacji): od razu błąd,
 * cofnięcie zmiany optymistycznej i komunikat.
 */
export function useAction<TInput, TResult = void>(
  run: (supabase: Supabase, input: TInput) => Promise<TResult>,
  optimistic?: (snapshot: Snapshot, input: TInput) => Snapshot,
) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation<TResult, Error, TInput, { previous: Snapshot | undefined }>({
    networkMode: "always",
    mutationFn: async (input) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error(OFFLINE_MESSAGE);
      return run(supabaseBrowser(), input);
    },
    onMutate: async (input) => {
      const previous = qc.getQueryData<Snapshot>(snapshotKey);
      if (optimistic && previous) {
        await qc.cancelQueries({ queryKey: snapshotKey });
        qc.setQueryData<Snapshot>(snapshotKey, optimistic(previous, input));
      }
      return { previous };
    },
    onError: (error, _i, context) => {
      if (optimistic && context?.previous) qc.setQueryData(snapshotKey, context.previous);
      if (error.message === OFFLINE_MESSAGE) toast({ message: OFFLINE_MESSAGE });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: snapshotKey }),
  });
}
