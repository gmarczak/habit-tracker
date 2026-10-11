"use client";

import { useEffect } from "react";
import { plural } from "@/lib/format";
import type { StreakUnit } from "@/lib/domain/model";

export type CelebrationInfo = { habitName: string; value: number; unit: StreakUnit };

/** Krótkie świętowanie kamienia milowego. Znika samo; ruch wyłączony przy prefers-reduced-motion. */
export function Celebration({ info, onDone }: { info: CelebrationInfo; onDone: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDone, 3200);
    return () => window.clearTimeout(id);
  }, [info, onDone]);

  const unitText = info.unit === "days" ? plural(info.value, "dzień", "dni", "dni") : plural(info.value, "tydzień", "tygodnie", "tygodni");

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center px-6">
      <div className="pointer-events-auto flex max-w-sm flex-col items-center gap-2 rounded-[28px] bg-accent px-8 py-7 text-center text-accent-contrast shadow-xl motion-safe:animate-[pop_420ms_cubic-bezier(.2,1.4,.4,1)]">
        <span className="font-serif text-5xl font-semibold leading-none">{info.value}</span>
        <span className="text-lg font-semibold">{unitText} z rzędu</span>
        <span className="text-sm opacity-90">{info.habitName} — tak trzymaj.</span>
        <button type="button" onClick={onDone} className="mt-2 h-10 rounded-full px-4 text-sm font-semibold underline underline-offset-4">
          Dzięki
        </button>
      </div>
    </div>
  );
}
