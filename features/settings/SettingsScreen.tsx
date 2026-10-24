"use client";

import { useQuery } from "@tanstack/react-query";
import { AudioLines, Bell, CalendarClock, CircleUserRound, Download, Folder, HeartPulse, Plane, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { DataFallback } from "@/components/ui/DataFallback";
import { useSnapshot, useToday } from "@/lib/data/hooks";
import { fetchTokenStatus } from "@/lib/data/mutations";
import { supabaseBrowser } from "@/lib/db/client";
import type { HabitColor } from "@/lib/domain/model";
import { formatDayMonth } from "@/lib/format";
import { tokenKey } from "./ShortcutKey";

type Row = { href: string; title: string; Icon: LucideIcon; color: HabitColor; value?: string };

/** Ustawienia jak w iPhonie: grupy wierszy z kolorową ikoną, wartością i strzałką; każdy otwiera podstronę. */
export function SettingsScreen() {
  const { data: snapshot, isPending, refetch } = useSnapshot();
  const today = useToday(snapshot);
  const token = useQuery({ queryKey: tokenKey, queryFn: () => fetchTokenStatus(supabaseBrowser()) });

  if (!snapshot || !today) return <DataFallback pending={isPending} onRetry={() => void refetch()} />;

  const enabledReminders = snapshot.reminders.filter((r) => r.enabled).length;
  const vacation = snapshot.pauses
    .filter((p) => p.habitId === null && p.endDate >= today && p.startDate !== p.endDate)
    .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))[0];
  const zone = snapshot.settings.timeZone.split("/").pop()?.replace(/_/g, " ") ?? snapshot.settings.timeZone;

  const groups: Row[][] = [
    [
      { href: "/settings/reminders", title: "Przypomnienia", Icon: Bell, color: "rose", value: enabledReminders ? `Wł.: ${enabledReminders}` : "Wył." },
      {
        href: "/settings/health",
        title: "Apple Zdrowie",
        Icon: HeartPulse,
        color: "rose",
        // „Połączone” dopiero, gdy Skrót coś przysłał; sam klucz może służyć tylko Siri
        value: token.data ? ((snapshot.health ?? []).length > 0 ? "Połączone" : "Czeka na dane") : token.isSuccess ? "Wył." : undefined,
      },
      { href: "/settings/siri", title: "Siri i Skróty", Icon: AudioLines, color: "violet", value: token.data ? "Wł." : token.isSuccess ? "Wył." : undefined },
    ],
    [
      { href: "/settings/day", title: "Dzień i tydzień", Icon: CalendarClock, color: "blue", value: zone },
      { href: "/settings/vacation", title: "Urlop", Icon: Plane, color: "teal", value: vacation ? `od ${formatDayMonth(vacation.startDate)}` : undefined },
      { href: "/settings/categories", title: "Kategorie", Icon: Folder, color: "amber", value: snapshot.categories.length ? String(snapshot.categories.length) : undefined },
    ],
    [
      { href: "/settings/data", title: "Twoje dane", Icon: Download, color: "green", value: "Eksport" },
      { href: "/settings/account", title: "Konto", Icon: CircleUserRound, color: "slate", value: snapshot.email ?? undefined },
    ],
  ];

  return (
    <main className="flex flex-col gap-7 px-4 pt-6 pb-6">
      <h1 className="font-serif text-[34px] font-bold leading-tight">Ustawienia</h1>
      {groups.map((rows, i) => (
        <ul key={i} className="ios-group pl-3">
          {rows.map(({ href, title, Icon, color, value }) => (
            <li key={href}>
              <Link href={href} className="flex min-h-11 items-center gap-3 border-b-[0.5px] border-border py-2">
                <span aria-hidden="true" className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] text-white" style={{ background: `var(--c-${color}-bg)` }}>
                  <Icon size={18} strokeWidth={2.2} />
                </span>
                <span className="flex-1 text-[17px]">{title}</span>
                {value && <span className="max-w-[45%] truncate text-[17px] text-muted">{value}</span>}
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-control">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      ))}
      <p className="text-center text-xs text-muted">
        Nawyki 2.0 ·{" "}
        <Link href="/habits" className="underline underline-offset-2">
          zarządzaj nawykami
        </Link>
      </p>
    </main>
  );
}
