"use client";

import { useEffect, useState } from "react";
import { btnPrimary, btnQuiet, field } from "@/components/ui/styles";
import { useAction } from "@/lib/data/hooks";
import { upsertReminder } from "@/lib/data/mutations";
import type { Snapshot } from "@/lib/data/snapshot";
import { enablePush, pushSupport } from "./push";

const DISMISS_KEY = "reminder-prompt-dismissed-v1";

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Przypomnienia są domyślnie wyłączone. Ta karta zachęca do włączenia wieczornego podsumowania,
 * gdy użytkownik ma już nawyki; "Nie teraz" ukrywa ją na stałe (włączysz w Ustawieniach).
 */
export function ReminderPrompt({ snapshot }: { snapshot: Snapshot }) {
  const [visible, setVisible] = useState(false);
  const [time, setTime] = useState("20:00");
  const [error, setError] = useState<string | null>(null);

  const hasSummary = snapshot.reminders.some((r) => r.kind === "summary" && r.enabled);
  const hasHabits = snapshot.habits.some((h) => h.archivedAt === null);

  useEffect(() => {
    const support = pushSupport();
    const show = hasHabits && !hasSummary && !dismissed() && (support === "supported" || support === "ios-needs-install");
    const id = window.setTimeout(() => setVisible(show), 0);
    return () => window.clearTimeout(id);
  }, [hasHabits, hasSummary]);

  const enable = useAction(async (supabase, localTime: string) => {
    await enablePush(supabase);
    const existing = snapshot.reminders.find((r) => r.kind === "summary");
    await upsertReminder(supabase, { id: existing?.id, kind: "summary", habitId: null, localTime, enabled: true });
  });

  if (!visible) return null;

  const iosInstall = pushSupport() === "ios-needs-install";

  function hide() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // brak dostępu do pamięci przeglądarki: karta wróci przy następnym uruchomieniu
    }
    setVisible(false);
  }

  return (
    <section aria-labelledby="reminder-title" className="mt-4 flex flex-col gap-3 rounded-xl bg-surface p-5">
      <h2 id="reminder-title" className="font-serif text-lg font-bold">
        Przypomnieć Ci wieczorem?
      </h2>
      {iosInstall ? (
        <p className="text-sm text-muted">
          Na iPhonie przypomnienia działają po dodaniu aplikacji do ekranu głównego: Udostępnij → „Do ekranu początkowego”. Potem otwórz ją z ikony.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted">Jedno powiadomienie z nawykami, których jeszcze nie odhaczyłeś. Gdy wszystko zrobione — cisza.</p>
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">Godzina</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`${field} w-32!`} />
          </label>
        </>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={hide} className={`${btnQuiet} shrink-0 whitespace-nowrap`}>
          Nie teraz
        </button>
        {!iosInstall && (
          <button
            type="button"
            disabled={enable.isPending}
            onClick={() =>
              enable.mutate(time, {
                // włączone raz: karta nie wraca, nawet gdy później wyłączysz podsumowanie w Ustawieniach
                onSuccess: hide,
                onError: (e) => setError(e.message),
              })
            }
            className={btnPrimary}
          >
            {enable.isPending ? "Włączam…" : "Włącz"}
          </button>
        )}
      </div>
    </section>
  );
}
