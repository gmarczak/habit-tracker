"use client";

import Link from "next/link";
import { useMemo } from "react";
import { sectionTitle } from "@/components/ui/styles";
import { DataFallback } from "@/components/ui/DataFallback";
import { useSnapshot, useToday } from "@/lib/data/hooks";
import { habitRates, moodInsights, notedDays, perfectDayStreak, weekReview, weekdayShares, weeklyTrend } from "@/lib/domain/stats";
import { dayOfMonth, formatDayLong, formatWeekdayShort, plural } from "@/lib/format";
import { MOODS } from "@/features/today/DayNote";
import { HabitBadge } from "@/lib/ui/icons";

const WEEKDAYS = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"];

function Tile({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-surface px-4 py-3">
      <p className="text-[13px] font-semibold text-muted">{label}</p>
      <p className={`mt-0.5 text-xl font-bold ${accent ? "text-accent" : ""}`}>{value}</p>
      {hint && <p className="text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

function MoodFace({ value }: { value: number }) {
  const { Icon, label } = MOODS[Math.min(4, Math.max(0, Math.round(value) - 1))]!;
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-fill text-accent" aria-label={label}>
      <Icon size={28} strokeWidth={2} aria-hidden="true" />
    </span>
  );
}

function pct(share: number | null): string {
  return share === null ? "—" : `${Math.round(share * 100)}%`;
}

export function StatsScreen() {
  const { data: snapshot, isPending, refetch } = useSnapshot();
  const today = useToday(snapshot);

  const data = useMemo(() => {
    if (!snapshot || !today) return null;
    const { habits, entries, pauses, settings } = snapshot;
    return {
      week: weekReview(habits, entries, pauses, today, today, settings.weekStart),
      trend: weeklyTrend(habits, entries, pauses, today, settings.weekStart, 12),
      perfectStreak: perfectDayStreak(habits, entries, pauses, today, settings.weekStart),
      rates: habitRates(habits, entries, pauses, today, settings.weekStart, 30),
      notes: notedDays(snapshot.notes, habits, entries, pauses, today, settings.weekStart),
      weekdays: weekdayShares(habits, entries, pauses, today, 8),
      mood: moodInsights(snapshot.notes, habits, entries, pauses, today, 60),
    };
  }, [snapshot, today]);

  if (!snapshot || !today || !data) return <DataFallback pending={isPending} onRetry={() => void refetch()} />;

  const hasHabits = snapshot.habits.some((h) => h.archivedAt === null);
  if (!hasHabits) {
    return (
      <main className="flex flex-col gap-3 px-4 pt-6">
        <h1 className="font-serif text-[34px] font-bold">Statystyki</h1>
        <p className="text-muted">Statystyki pojawią się, gdy dodasz pierwszy nawyk i zaczniesz odhaczać.</p>
      </main>
    );
  }

  const { week, trend, perfectStreak, rates, notes, weekdays, mood } = data;
  // Dzisiejsze otwarte nawyki nie wchodzą do procentu, dopóki dzień trwa
  const todayOpen = week.days.some((d) => d.date === today && d.total > (d.settled ?? d.done));
  const last = trend.at(-1)?.share ?? null;
  const prev = trend.at(-2)?.share ?? null;
  const delta = last !== null && prev !== null ? Math.round((last - prev) * 100) : null;
  const known = trend.filter((t) => t.share !== null).map((t) => t.share as number);
  const average = known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
  const ranked = weekdays.filter((w): w is { weekday: number; share: number } => w.share !== null).sort((a, b) => b.share - a.share);
  const best = ranked.length >= 2 && ranked[0]!.share > ranked.at(-1)!.share ? ranked[0]! : null;
  const worst = best ? ranked.at(-1)! : null;

  return (
    <main className="flex flex-col gap-8 px-4 pt-6">
      <h1 className="font-serif text-[34px] font-bold leading-tight">Statystyki</h1>

      <section aria-labelledby="week-title" className="flex flex-col gap-3">
        <h2 id="week-title" className={sectionTitle}>
          Ten tydzień
        </h2>
        <div className="flex flex-col gap-4 rounded-xl bg-surface p-4">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.02em] text-muted">Zrobione z wymaganych</p>
            <p className="font-serif text-[34px] font-bold leading-tight tabular-nums">{week.total ? pct(week.done / week.total) : "—"}</p>
            <p className="text-[13px] text-muted">
              {week.total
                ? `${week.done} z ${week.total} ${week.total === 1 ? "wykonania" : "wykonań"}${todayOpen ? " · dziś jeszcze trwa" : ""}`
                : todayOpen
                  ? "dzień trwa — procent pojawi się po pierwszym odhaczeniu"
                  : "brak wymaganych"}
              {delta !== null && (
                <span className={delta >= 0 ? "text-positive" : "text-danger"}>
                  {" "}
                  · {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} pkt proc. vs poprzedni
                </span>
              )}
            </p>
          </div>
          <div className="grid grid-cols-7 gap-2" role="list" aria-label="Dni tygodnia">
            {week.days.map((d) => {
              const share = d.total ? d.done / d.total : 0;
              const future = d.date > today;
              const perfect = d.total > 0 && d.done === d.total;
              return (
                <div
                  key={d.date}
                  role="listitem"
                  aria-label={`${formatWeekdayShort(d.date)} ${dayOfMonth(d.date)}: ${future ? "jeszcze przed nami" : d.total ? `${d.done} z ${d.total}` : "nic wymaganego"}`}
                  className="flex flex-col items-center gap-1.5"
                >
                  <div className="flex h-24 w-full items-end overflow-hidden rounded-lg bg-fill">
                    <div
                      className="w-full rounded-lg transition-[height]"
                      style={{ height: `${future ? 0 : Math.max(share * 100, d.done ? 8 : 0)}%`, background: perfect ? "var(--c-green-bg)" : "var(--accent)" }}
                    />
                  </div>
                  <span className={`text-[11px] font-semibold ${d.date === today ? "text-accent" : "text-muted"}`}>{formatWeekdayShort(d.date)}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Tile label="Idealne dni" value={String(week.perfectDays)} hint="w tym tygodniu" />
          <Tile label="Seria idealnych" value={`${perfectStreak} ${plural(perfectStreak, "dzień", "dni", "dni")}`} accent />
          {best && <Tile label="Najlepiej idzie" value={WEEKDAYS[best.weekday - 1]!} hint={`${pct(best.share)} · ostatnie 8 tyg.`} />}
          {worst && <Tile label="Najtrudniej" value={WEEKDAYS[worst.weekday - 1]!} hint={`${pct(worst.share)} · ostatnie 8 tyg.`} />}
        </div>
        <p className="px-1 text-xs text-muted">Idealny dzień: wszystkie nawyki wymagane tego dnia zrobione (pominięte się nie liczą). Zielony słupek = idealny dzień.</p>
      </section>

      <section aria-labelledby="trend-title" className="flex flex-col gap-3">
        <h2 id="trend-title" className={sectionTitle}>
          Ostatnie 12 tygodni
        </h2>
        <figure className="flex flex-col gap-2 rounded-xl bg-surface p-4">
          <div className="flex h-32 items-end gap-1.5" role="img" aria-label={`Udział zrobionych w wymaganych, tydzień po tygodniu: ${trend.map((t) => pct(t.share)).join(", ")}`}>
            {trend.map((t, i) => (
              <div key={t.weekStart} className="flex h-full flex-1 flex-col justify-end">
                <div
                  className={`w-full rounded-md ${t.share === null ? "bg-fill" : i === trend.length - 1 ? "bg-accent" : "bg-accent/60"}`}
                  style={{ height: t.share === null ? "4px" : `${Math.max(t.share * 100, 3)}%` }}
                />
              </div>
            ))}
          </div>
          <figcaption className="flex justify-between text-xs text-muted">
            <span>{trend.length - 1} tyg. temu</span>
            <span>
              średnio {pct(average)} · ten tydzień {pct(trend.at(-1)?.share ?? null)}
            </span>
          </figcaption>
        </figure>
      </section>

      <section aria-labelledby="habits-title" className="flex flex-col gap-1">
        <h2 id="habits-title" className={`${sectionTitle} pb-1`}>
          Nawyki · ostatnie 30 dni
        </h2>
        <ul className="ios-group">
          {rates.map(({ habit, rate }) => (
            <li key={habit.id}>
              <Link href={`/habits/${habit.id}`} className="flex items-center gap-3 border-b-[0.5px] border-border py-3">
                <HabitBadge icon={habit.icon} color={habit.color} name={habit.name} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="truncate font-semibold">{habit.name}</span>
                  <span className="h-1.5 w-full rounded-full bg-fill" aria-hidden="true">
                    <span className="block h-1.5 rounded-full" style={{ width: `${(rate ?? 0) * 100}%`, background: `var(--c-${habit.color}-bg)` }} />
                  </span>
                </span>
                <span className="w-12 shrink-0 text-right text-sm font-bold tabular-nums">{pct(rate)}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="pt-2 text-xs text-muted">Skuteczność = zrobione dni wymagane / wszystkie dni wymagane, bez pominięć i pauz. Od najsłabszego.</p>
      </section>
      <section aria-labelledby="mood-title" className="flex flex-col gap-3">
        <h2 id="mood-title" className={sectionTitle}>
          Nastrój · ostatnie 60 dni
        </h2>
        {mood.average === null ? (
          <p className="text-sm text-muted">Oceniaj nastrój na ekranie Dziś (jedno dotknięcie). Po kilku dniach zobaczysz tu, które nawyki idą w parze z lepszym dniem.</p>
        ) : (
          <>
            <div className="flex items-center gap-4 rounded-xl bg-surface p-4">
              <MoodFace value={mood.average} />
              <div>
                <p className="font-serif text-[28px] font-bold leading-tight tabular-nums">{mood.average.toFixed(1).replace(".", ",")} / 5</p>
                <p className="text-[13px] text-muted">średnio z {mood.count} {plural(mood.count, "dnia", "dni", "dni")}</p>
              </div>
            </div>
            {mood.links.length > 0 ? (
              <ul className="ios-group">
                {mood.links.map((l) => (
                  <li key={l.habit.id} className="flex items-center gap-3 border-b-[0.5px] border-border py-3">
                    <HabitBadge icon={l.habit.icon} color={l.habit.color} name={l.habit.name} size="sm" />
                    <span className="flex-1 truncate">{l.habit.name}</span>
                    <span className={`text-[15px] font-semibold tabular-nums ${l.diff >= 0 ? "text-positive" : "text-danger"}`}>
                      {l.diff >= 0 ? "+" : "−"}
                      {Math.abs(l.diff).toFixed(1).replace(".", ",")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Za mało dni, żeby porównać nawyki — potrzeba co najmniej 3 dni z nawykiem i 3 bez.</p>
            )}
            {mood.links.length > 0 && (
              <p className="px-1 text-xs text-muted">Różnica średniego nastroju w dni, gdy nawyk był zrobiony, i gdy nie. To korelacja, nie dowód — ale dobra podpowiedź.</p>
            )}
          </>
        )}
      </section>

      {notes.length > 0 && (
        <section aria-labelledby="notes-title" className="flex flex-col gap-1">
          <h2 id="notes-title" className={sectionTitle}>
            Notatki dni
          </h2>
          <p className="pb-2 text-sm text-muted">Wynik dnia obok notatki — łatwiej zauważyć, co psuje gorsze dni.</p>
          <ul className="ios-group flex flex-col">
            {notes.map((n) => (
              <li key={n.date} className="flex items-start justify-between gap-3 border-b-[0.5px] border-border py-3">
                <div className="min-w-0">
                  <p className="text-sm text-muted">{formatDayLong(n.date)}</p>
                  <p className="whitespace-pre-wrap">{n.note}</p>
                </div>
                <span className={`shrink-0 font-semibold tabular-nums ${n.total > 0 && n.done / n.total < 0.5 ? "text-danger" : "text-accent"}`}>
                  {n.total > 0 ? `${n.done}/${n.total}` : "—"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
