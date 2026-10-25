"use client";

import { useState } from "react";
import { btnPrimary, btnSecondary } from "@/components/ui/styles";
import { useAddHabit } from "@/features/shell/AppShell";
import { useAction } from "@/lib/data/hooks";
import { createHabit, type HabitForm } from "@/lib/data/mutations";
import type { LocalDate } from "@/lib/domain/dates";
import { HabitBadge } from "@/lib/ui/icons";
import { TEMPLATES } from "./templates";

/** Pierwsze uruchomienie: wybierz kilka gotowych nawyków albo dodaj własny. */
export function Onboarding({ today }: { today: LocalDate }) {
  const addHabit = useAddHabit();
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Jedno id na szablon: ponowne „Dodaj” po błędzie dokończy, a nie zdubluje już dodane nawyki
  const [habitIds] = useState(() => new Map(TEMPLATES.map((t) => [t.id, crypto.randomUUID()])));

  const create = useAction(async (supabase, ids: string[]) => {
    for (const id of ids) {
      const t = TEMPLATES.find((x) => x.id === id);
      if (!t) continue;
      const form: HabitForm = {
        name: t.name,
        kind: t.kind ?? "check",
        unit: t.unit ?? null,
        icon: t.icon ?? null,
        color: t.color ?? "green",
        categoryId: null,
        timeOfDay: t.timeOfDay ?? null,
        goal: t.goal ?? "build",
        startDate: today,
        targetValue: t.targetValue ?? 1,
        frequency: t.frequency ?? "daily",
        weekdays: t.weekdays ?? null,
        timesPerWeek: t.timesPerWeek ?? null,
        intervalDays: t.intervalDays ?? null,
        source: t.source ?? null,
        sourceMin: t.sourceMin ?? null,
      };
      await createHabit(supabase, form, habitIds.get(t.id));
    }
  });

  return (
    <section className="flex flex-col gap-5 pt-2" aria-labelledby="onboarding-title">
      <div>
        <h2 id="onboarding-title" className="font-serif text-2xl font-bold">
          Od czego zaczynasz?
        </h2>
        <p className="mt-1 text-muted">Wybierz 2–3 nawyki. Lepiej mało i codziennie niż dużo i wcale. Każdy możesz potem zmienić.</p>
      </div>
      <ul className="ios-group flex flex-col">
        {TEMPLATES.map((t) => {
          const on = picked.includes(t.id);
          return (
            <li key={t.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => setPicked(on ? picked.filter((x) => x !== t.id) : [...picked, t.id])}
                className="flex w-full items-center gap-3.5 border-b-[0.5px] border-border py-3.5 text-left"
              >
                <HabitBadge icon={t.icon ?? null} color={t.color ?? "green"} name={t.name} />
                <span className="flex flex-1 flex-col">
                  <span className="text-[17px] font-semibold">{t.name}</span>
                  <span className="text-[13px] text-muted">{t.summary}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={`flex h-11 w-11 items-center justify-center rounded-full ${on ? "bg-accent text-accent-contrast" : "border-[1.5px] border-control"}`}
                >
                  {on && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12l5 5 9-10" />
                    </svg>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          disabled={picked.length === 0 || create.isPending}
          onClick={() =>
            create.mutate(picked, {
              onSuccess: () => setPicked([]),
              onError: (e) => setError(e.message),
            })
          }
          className={btnPrimary}
        >
          {create.isPending ? "Dodaję…" : picked.length ? `Dodaj wybrane (${picked.length})` : "Wybierz nawyki"}
        </button>
        <button type="button" onClick={() => addHabit()} className={btnSecondary}>
          Własny nawyk
        </button>
      </div>
    </section>
  );
}
