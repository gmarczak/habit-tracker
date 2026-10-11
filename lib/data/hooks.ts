"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/db/client";
import { localDate, type LocalDate } from "@/lib/domain/dates";
import { createHabit, entryFromChange, withEntry, type EntryChange, type NewHabit } from "./mutations";
import { fetchSnapshot, type Snapshot } from "./snapshot";

export const snapshotKey = ["snapshot"] as const;
export const entryMutationKey = ["entry"] as const;

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

export function useCreateHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewHabit) => createHabit(supabaseBrowser(), input),
    onSuccess: () => qc.invalidateQueries({ queryKey: snapshotKey }),
  });
}
