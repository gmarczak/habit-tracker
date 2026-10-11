"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { HabitEditor, type HabitPreset } from "@/features/habits/HabitEditor";
import { useSnapshot, useToday } from "@/lib/data/hooks";

type AddHabit = (preset?: HabitPreset) => void;
const AddHabitContext = createContext<AddHabit>(() => {});
export const useAddHabit = () => useContext(AddHabitContext);

const NAV = [
  { href: "/", label: "Dziś", d: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12l3 3 5-6" },
  { href: "/habits", label: "Nawyki", d: "M4 6h16M4 12h16M4 18h10" },
  { href: "/stats", label: "Statystyki", d: "M5 20V10M12 20V4M19 20v-7" },
  { href: "/settings", label: "Ustawienia", d: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: snapshot } = useSnapshot();
  const today = useToday(snapshot);
  const [adding, setAdding] = useState<{ preset?: HabitPreset } | null>(null);

  const open: AddHabit = useCallback((preset) => setAdding({ preset }), []);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const link = (item: (typeof NAV)[number]) => (
    <Link
      key={item.href}
      href={item.href}
      aria-current={isActive(item.href) ? "page" : undefined}
      className={`flex min-w-16 flex-col items-center gap-1 text-xs ${isActive(item.href) ? "font-bold text-text" : "font-medium text-muted"}`}
    >
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={item.d} />
      </svg>
      {item.label}
    </Link>
  );

  return (
    <AddHabitContext.Provider value={open}>
      <div className="mx-auto min-h-dvh max-w-lg pb-[calc(5.5rem+env(safe-area-inset-bottom))]">{children}</div>

      <nav
        aria-label="Główna nawigacja"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3"
      >
        <div className="mx-auto flex max-w-lg items-center justify-around px-2">
          {link(NAV[0])}
          {link(NAV[1])}
          <button
            type="button"
            aria-label="Dodaj nawyk"
            onClick={() => open()}
            className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-accent text-accent-contrast"
          >
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          {link(NAV[2])}
          {link(NAV[3])}
        </div>
      </nav>

      <Modal open={adding !== null} onClose={() => setAdding(null)} title="Nowy nawyk">
        {adding && snapshot && today && (
          <HabitEditor
            snapshot={snapshot}
            today={today}
            preset={adding.preset}
            onCancel={() => setAdding(null)}
            onDone={() => {
              setAdding(null);
              if (pathname !== "/" && pathname !== "/habits") router.push("/");
            }}
          />
        )}
      </Modal>
    </AddHabitContext.Provider>
  );
}
