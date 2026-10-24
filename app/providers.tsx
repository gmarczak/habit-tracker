"use client";

import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient, onlineManager } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { entryMutationKey, entryScope, snapshotKey } from "@/lib/data/hooks";
import { NetworkError, SessionError, saveEntry, type EntryChange } from "@/lib/data/mutations";
import { supabaseBrowser } from "@/lib/db/client";
import { signOutFlow } from "@/lib/db/session";

const CACHE_VERSION = "v2-2"; // v2-2: snapshot.health (zmiana kasuje też kolejkę offline — tylko przy niezgodnym kształcie danych)

/*
 * Stan sieci: TanStack zakłada „online”, dopóki nie przyjdzie zdarzenie „offline” — aplikacja otwarta
 * bez zasięgu go nie dostaje. Dlatego stan bierzemy z navigator.onLine (też po powrocie do aplikacji),
 * a zapis dnia, który nie dotarł do serwera (Wi-Fi bez internetu, słaby zasięg), przełącza na „offline”:
 * zapis czeka wtedy w kolejce (i w IndexedDB) zamiast przepaść. Co 20 s próbujemy ponownie.
 */
if (typeof window !== "undefined") {
  onlineManager.setEventListener((setOnline) => {
    const sync = () => setOnline(navigator.onLine);
    const probe = window.setInterval(() => {
      if (!onlineManager.isOnline() && navigator.onLine) setOnline(true);
    }, 20_000);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearInterval(probe);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  });
}

/*
 * Zapis, który wisi (słaby zasięg, odświeżanie sesji bez internetu), po 8 s trafia do kolejki — wstrzymany
 * zapis przetrwa zamknięcie aplikacji, a wiszący nie. Powtórka jest bezpieczna: set/clear są idempotentne,
 * a dopisanie ma id żądania.
 */
const SAVE_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new NetworkError("Serwer nie odpowiada — zapis poczeka w kolejce.")), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function makeClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: 1000 * 60 * 60 * 24 * 7, retry: 1, networkMode: "offlineFirst" },
      mutations: { networkMode: "online", retry: false },
    },
  });
  client.setMutationDefaults(entryMutationKey, {
    mutationFn: async (change: EntryChange) => {
      const supabase = supabaseBrowser();
      try {
        await withTimeout(
          (async () => {
            // Bez ważnej sesji zapis poszedłby jako anonimowy i przepadł: niech czeka w kolejce
            const { data } = await supabase.auth.getSession();
            if (!data.session) throw new SessionError("Sesja wygasła — zapis poczeka na połączenie.");
            await saveEntry(supabase, change);
          })(),
          SAVE_TIMEOUT_MS,
        );
      } catch (error) {
        if (error instanceof NetworkError) onlineManager.setOnline(false);
        throw error;
      }
    },
    // Bez sieci zapis nie przepada: czeka (wstrzymany) do powrotu połączenia. Błąd serwera — od razu.
    retry: (_count, error) => error instanceof NetworkError,
    retryDelay: 1000,
    scope: entryScope,
  });
  return client;
}

const persister =
  typeof window === "undefined"
    ? undefined
    : createAsyncStoragePersister({
        storage: {
          getItem: async (key) => (await get<string>(key)) ?? null,
          setItem: (key, value) => set(key, value),
          removeItem: (key) => del(key),
        },
        key: "habit-tracker-cache",
        throttleTime: 500,
      });

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(makeClient);

  // Po wysłaniu kolejki offline pobierz stan z serwera (optymistyczny cache mógł się rozjechać).
  // Jedno opróżnianie naraz: kolejne „online” w czasie awarii nie mnożą pełnych przeładowań.
  const flush = useRef<Promise<unknown> | null>(null);
  const drain = useCallback(() => {
    flush.current ??= client
      .resumePausedMutations()
      .then(() => client.invalidateQueries({ queryKey: snapshotKey }))
      .finally(() => {
        flush.current = null;
      });
  }, [client]);
  useEffect(
    () =>
      onlineManager.subscribe((online) => {
        if (online) drain();
      }),
    [drain],
  );

  // Sesja zniknęła poza aplikacją (wylogowanie albo zmiana hasła na innym urządzeniu): do logowania.
  // Kolejka zapisów zostaje w IndexedDB i wyśle się po ponownym zalogowaniu.
  useEffect(() => {
    const { data } = supabaseBrowser().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && !signOutFlow.active) window.location.replace("/login");
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }
  }, []);

  if (!persister) return null;
  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        buster: CACHE_VERSION,
        maxAge: 1000 * 60 * 60 * 24 * 7,
        // W IndexedDB przetrwają tylko zapisy dnia — dla nich jest funkcja w setMutationDefaults
        dehydrateOptions: { shouldDehydrateMutation: (m) => m.state.isPaused && m.options.mutationKey?.[0] === entryMutationKey[0] },
      }}
      // Bez czekania: ekran pokazuje dane z IndexedDB od razu, a kolejka wysyła się w tle
      onSuccess={drain}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
