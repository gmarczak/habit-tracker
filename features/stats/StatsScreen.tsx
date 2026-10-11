"use client";

import Link from "next/link";
import { useMemo } from "react";
import { sectionTitle } from "@/components/ui/styles";
import { useSnapshot, useToday } from "@/lib/data/hooks";
import { habitRates, perfectDayStreak, weekReview, weeklyTrend } from "@/lib/domain/stats";
import { dayOfMonth, formatWeekdayShort, plural } from "@/lib/format";
import { HabitBadge } from "@/lib/ui/icons";

function pct(share: number | null): string {
  return share === null ? "—" : `${Math.round(share * 100)}%`;
}

export function StatsScreen() {
  const { data: snapshot } = useSnapshot();
  const today = useToday(snapshot);

  const data = useMemo(() => {
    if (!snapshot || !today) return null;
    const { habits, entries, pauses, settings } = snapshot;
    return {
      week: weekReview(habits, entries, pauses, today, today, settings.weekStart),
      trend: weeklyTrend(habits, entries, pauses, today, settings.weekStart, 12),
      perfectStreak: perfectDayStreak(habits, entries, pauses, today, settings.weekStart),
      rates: habitRates(habits, entries, pauses, today, settings.weekStart, 30),
    };
  }, [snapshot, today]);

  if (!snapshot || !today || !data) return <main className="px-6 pt-7 text-muted">Ładuję…</main>;

  const hasHabits = snapshot.habits.some((h) => h.archivedAt === null);
  if (!hasHabits) {
    return (
      <main className="flex flex-col gap-3 px-6 pt-7">
        <h1 className="font-serif text-[30px] font-semibold">Statystyki</h1>
        <p className="text-muted">Statystyki pojawią się, gdy dodasz pierwszy nawyk i zaczniesz odhaczać.</p>
      </main>
    );
  }

  const { week, trend, perfectStreak, rates } = data;
  const maxTrend = 1;

  return (
    <main className="flex flex-col gap-8 px-6 pt-7">
      <h1 className="font-serif text-[30px] font-semibold leading-tight">Statystyki</h1>

      <section aria-labelledby="week-title" className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 id="week-title" className={sectionTitle}>
            Ten tydzień
          </h2>
          <span className="text-sm text-muted">{week.total ? `${week.done} z ${week.total} wykonań` : "brak wymaganych"}</span>
        </div>
        <div className="grid grid-cols-7 gap-2" role="list" aria-label="Dni tygodnia">
          {week.days.map((d) => {
            const share = d.total ? d.done / d.total : 0;
            const future = d.date > today;
            return (
              <div
                key={d.date}
                role="listitem"
                aria-label={`${formatWeekdayShort(d.date)} ${dayOfMonth(d.date)}: ${future ? "jeszcze przed nami" : d.total ? `${d.done} z ${d.total}` : "nic wymaganego"}`}
                className="flex flex-col items-center gap-1.5"
              >
                <div className="flex h-24 w-full items-end overflow-hidden rounded-xl bg-surface">
                  <div className="w-full rounded-xl bg-accent transition-[height]" style={{ height: `${future ? 0 : Math.max(share * 100, d.done ? 8 : 0)}%` }} />
                </div>
                <span className={`text-[11px] font-semibold ${d.date === today ? "text-text" : "text-muted"}`}>{formatWeekdayShort(d.date)}</span>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-surface px-4 py-3">
            <p className="text-xs font-semibold text-muted">Idealne dni w tym tygodniu</p>
            <p className="mt-0.5 text-xl font-bold">{week.perfectDays}</p>
          </div>
          <div className="rounded-2xl bg-surface px-4 py-3">
            <p className="text-xs font-semibold text-muted">Seria idealnych dni</p>
            <p className="mt-0.5 text-xl font-bold text-accent">
              {perfectStreak} {plural(perfectStreak, "dzień", "dni", "dni")}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted">Idealny dzień: wszystkie nawyki wymagane tego dnia zrobione (pominięte się nie liczą).</p>
      </section>

      <section aria-labelledby="trend-title" className="flex flex-col gap-3">
        <h2 id="trend-title" className={sectionTitle}>
          Ostatnie 12 tygodni
        </h2>
        <figure className="flex flex-col gap-2">
          <div className="flex h-32 items-end gap-1.5" role="img" aria-label={`Udział zrobionych w wymaganych, tydzień po tygodniu: ${trend.map((t) => pct(t.share)).join(", ")}`}>
            {trend.map((t, i) => (
              <div key={t.weekStart} className="flex h-full flex-1 flex-col justify-end">
                <div
                  className={`w-full rounded-md ${i === trend.length - 1 ? "bg-accent" : "bg-accent/60"}`}
                  style={{ height: `${t.share === null ? 0 : Math.max((t.share / maxTrend) * 100, 3)}%` }}
                />
              </div>
            ))}
          </div>
          <figcaption className="flex justify-between text-xs text-muted">
            <span>12 tyg. temu</span>
            <span>ten tydzień · {pct(trend.at(-1)?.share ?? null)}</span>
          </figcaption>
        </figure>
      </section>

      <section aria-labelledby="habits-title" className="flex flex-col gap-1">
        <h2 id="habits-title" className={`${sectionTitle} pb-1`}>
          Nawyki · ostatnie 30 dni
        </h2>
        <ul>
          {rates.map(({ habit, rate }) => (
            <li key={habit.id}>
              <Link href={`/habits/${habit.id}`} className="flex items-center gap-3 border-b border-border py-3">
                <HabitBadge icon={habit.icon} color={habit.color} name={habit.name} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="truncate font-semibold">{habit.name}</span>
                  <span className="h-1.5 w-full rounded-full bg-surface" aria-hidden="true">
                    <span className="block h-1.5 rounded-full bg-accent" style={{ width: `${(rate ?? 0) * 100}%` }} />
                  </span>
                </span>
                <span className="w-12 shrink-0 text-right text-sm font-bold tabular-nums">{pct(rate)}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="pt-2 text-xs text-muted">Skuteczność = zrobione dni wymagane / wszystkie dni wymagane, bez pominięć i pauz. Od najsłabszego.</p>
      </section>
    </main>
  );
}
