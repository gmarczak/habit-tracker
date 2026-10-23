"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { btnPrimary, btnSecondary, field, label, labelText, sectionTitle } from "@/components/ui/styles";
import { enablePush } from "@/features/reminders/push";
import { useAction, useSnapshot, useToday } from "@/lib/data/hooks";
import { addPause, deletePause, deleteReminder, setArchived, upsertReminder } from "@/lib/data/mutations";
import { addDays, type LocalDate } from "@/lib/domain/dates";
import { METRIC_INFO, healthAverage, healthValue } from "@/lib/domain/health";
import type { Habit } from "@/lib/domain/model";
import { completionRate, streakOf } from "@/lib/domain/progress";
import { planOn } from "@/lib/domain/schedule";
import { describePlan, formatDayLong, formatNumber, formatStreak } from "@/lib/format";
import { HabitBadge } from "@/lib/ui/icons";
import { HabitEditor } from "./HabitEditor";
import { MonthCalendar } from "./MonthCalendar";
import { YearHeatmap } from "./YearHeatmap";

function pct(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

export function HabitDetail({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const { data: snapshot, isPending } = useSnapshot();
  const today = useToday(snapshot);
  const [editing, setEditing] = useState(false);
  const [pausing, setPausing] = useState(false);

  const archive = useAction((s, v: { id: string; archived: boolean }) => setArchived(s, v.id, v.archived));
  const removePause = useAction((s, pauseId: string) => deletePause(s, pauseId));

  if (isPending || !today) return <main className="px-4 pt-6 text-muted">Ładuję…</main>;
  const habit = snapshot?.habits.find((h) => h.id === id);
  if (!snapshot || !habit) {
    return (
      <main className="flex flex-col gap-3 px-4 pt-6">
        <p>Nie ma takiego nawyku.</p>
        <Link href="/habits" className="font-semibold text-accent">
          Wróć do listy
        </Link>
      </main>
    );
  }

  const { entries, pauses, settings } = snapshot;
  const plan = planOn(habit, today) ?? habit.plans.at(-1);
  const streak = streakOf(habit, entries, pauses, today, settings.weekStart);
  const rate30 = completionRate(habit, entries, pauses, addDays(today, -29), today, today, settings.weekStart);
  const rate90 = completionRate(habit, entries, pauses, addDays(today, -89), today, today, settings.weekStart);
  const doneTotal = entries.filter((e) => e.habitId === habit.id && !e.skipped && (e.value ?? 0) >= (planOn(habit, e.date)?.targetValue ?? 1)).length;
  const notes = entries
    .filter((e) => e.habitId === habit.id && e.note)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 30);
  const habitPauses = snapshot.pauses.filter((p) => p.habitId === habit.id && p.endDate >= today);
  const isArchived = habit.archivedAt !== null;
  const health = snapshot.health ?? [];
  const metric = habit.source ? METRIC_INFO[habit.source] : null;
  const measuredToday = habit.source ? healthValue(health, habit.source, today) : null;
  const measuredAvg = habit.source ? healthAverage(health, habit.source, today, 7) : null;

  function archiveHabit() {
    archive.mutate({ id: habit!.id, archived: true });
    toast({
      message: `„${habit!.name}” w archiwum`,
      actionLabel: "Cofnij",
      onAction: () => archive.mutate({ id: habit!.id, archived: false }),
    });
    router.push("/habits");
  }

  return (
    <main className="flex flex-col gap-7 px-4 pt-4">
      <Link href="/habits" className="-ml-1 flex h-11 items-center gap-1 self-start text-sm font-medium text-muted">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        Nawyki
      </Link>

      <header className="flex items-center gap-4">
        <HabitBadge icon={habit.icon} color={habit.color} name={habit.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-[30px] font-bold leading-tight">{habit.name}</h1>
          <p className="text-sm text-muted">
            {plan ? describePlan(plan, habit.kind, habit.unit) : ""}
            {habit.source ? ` · z Apple Zdrowie (${METRIC_INFO[habit.source].label.toLowerCase()})` : ""}
            {isArchived ? " · w archiwum" : ""}
          </p>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-3">
        <Stat label="Seria" value={formatStreak(streak)} accent />
        <Stat label="Rekord" value={formatStreak({ ...streak, current: streak.best })} />
        <Stat label="Skuteczność 30 dni" value={pct(rate30)} />
        <Stat label="Skuteczność 90 dni" value={pct(rate90)} />
        <Stat label="Zrobione łącznie" value={String(doneTotal)} />
        <Stat label="Od" value={formatDayLong(habit.startDate).split(", ")[1] ?? habit.startDate} />
        {metric && (
          <>
            <Stat label={`Dziś · ${metric.label.toLowerCase()}`} value={measuredToday === null ? "—" : `${formatNumber(Math.round(measuredToday))} ${metric.unit}`} />
            <Stat label="Średnio z 7 dni" value={measuredAvg === null ? "—" : `${formatNumber(Math.round(measuredAvg))} ${metric.unit}`} />
          </>
        )}
      </dl>
      {metric && measuredToday === null && measuredAvg === null && (
        <p className="-mt-4 px-1 text-xs text-muted">Wartości pojawią się, gdy Skrót z Ustawień → Apple Zdrowie wyśle pierwsze dane.</p>
      )}

      <section aria-labelledby="cal-title" className="flex flex-col gap-3">
        <h2 id="cal-title" className={sectionTitle}>
          Kalendarz
        </h2>
        <div className="rounded-xl bg-surface p-3" style={habitTint(habit)}>
          <MonthCalendar habit={habit} entries={entries} pauses={pauses} today={today} weekStart={settings.weekStart} />
        </div>
      </section>

      <section aria-labelledby="year-title" className="flex flex-col gap-3">
        <h2 id="year-title" className={sectionTitle}>
          Rok
        </h2>
        <div className="rounded-xl bg-surface p-3" style={habitTint(habit)}>
          <YearHeatmap habit={habit} entries={entries} pauses={pauses} today={today} weekStart={settings.weekStart} />
        </div>
      </section>

      {!isArchived && <HabitReminder habit={habit} />}

      <section aria-labelledby="pause-title" className="flex flex-col gap-2">
        <h2 id="pause-title" className={sectionTitle}>
          Pauza
        </h2>
        <p className="text-sm text-muted">Dni pauzy są neutralne: nie przerywają serii i nie obniżają skuteczności.</p>
        {habitPauses.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3">
            <span className="text-sm">
              {formatDayLong(p.startDate)} – {formatDayLong(p.endDate)}
              {p.reason ? ` · ${p.reason}` : ""}
            </span>
            <button type="button" onClick={() => removePause.mutate(p.id)} className="h-11 shrink-0 px-2 text-sm font-semibold text-danger">
              Usuń
            </button>
          </div>
        ))}
        {!isArchived && (
          <button type="button" onClick={() => setPausing(true)} className={`${btnSecondary} self-start`}>
            Zaplanuj pauzę
          </button>
        )}
      </section>

      {notes.length > 0 && (
        <section aria-labelledby="notes-title" className="flex flex-col gap-2">
          <h2 id="notes-title" className={sectionTitle}>
            Notatki
          </h2>
          <ul className="ios-group flex flex-col">
            {notes.map((n) => (
              <li key={n.date} className="border-b-[0.5px] border-border py-3">
                <p className="text-xs font-semibold text-muted first-letter:uppercase">{formatDayLong(n.date)}</p>
                <p className="whitespace-pre-line">{n.note}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-3 pb-4">
        {isArchived ? (
          <button type="button" onClick={() => archive.mutate({ id: habit.id, archived: false })} className={btnPrimary}>
            Przywróć z archiwum
          </button>
        ) : (
          <>
            <button type="button" onClick={() => setEditing(true)} className={btnPrimary}>
              Edytuj nawyk
            </button>
            <button type="button" onClick={archiveHabit} className={btnSecondary}>
              Przenieś do archiwum
            </button>
          </>
        )}
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title="Edytuj nawyk">
        {editing && <HabitEditor snapshot={snapshot} today={today} habit={habit} onCancel={() => setEditing(false)} onDone={() => setEditing(false)} />}
      </Modal>
      <Modal open={pausing} onClose={() => setPausing(false)} title="Pauza" subtitle={habit.name}>
        {pausing && <PauseForm habitId={habit.id} today={today} onDone={() => setPausing(false)} />}
      </Modal>
    </main>
  );
}

function Stat({ label: text, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-surface px-4 py-3">
      <dt className="text-xs font-semibold text-muted">{text}</dt>
      <dd className={`mt-0.5 text-xl font-bold ${accent ? "text-accent" : ""}`}>{value}</dd>
    </div>
  );
}

export function PauseForm({ habitId, today, onDone }: { habitId: string | null; today: LocalDate; onDone: () => void }) {
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(addDays(today, 6));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = useAction(addPause);

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate({ habitId, startDate: start, endDate: end, reason }, { onSuccess: onDone, onError: (err) => setError(err.message) });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          <span className={labelText}>Od</span>
          <input type="date" value={start} min={today} onChange={(e) => setStart(e.target.value)} className={field} required />
        </label>
        <label className={label}>
          <span className={labelText}>Do</span>
          <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className={field} required />
        </label>
      </div>
      <label className={label}>
        <span className={labelText}>Powód (opcjonalnie)</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="np. urlop, choroba" className={field} />
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={save.isPending} className={btnPrimary}>
        {save.isPending ? "Zapisuję…" : "Zapisz pauzę"}
      </button>
    </form>
  );
}

function HabitReminder({ habit }: { habit: Habit }) {
  const { data: snapshot } = useSnapshot();
  const reminder = snapshot?.reminders.find((r) => r.habitId === habit.id);
  const [time, setTime] = useState(reminder?.localTime ?? "09:00");
  const [error, setError] = useState<string | null>(null);
  const save = useAction(async (supabase, localTime: string) => {
    await enablePush(supabase);
    await upsertReminder(supabase, { id: reminder?.id, kind: "habit", habitId: habit.id, localTime, enabled: true });
  });
  const remove = useAction((s, rid: string) => deleteReminder(s, rid));

  return (
    <section aria-labelledby="rem-title" className="flex flex-col gap-2">
      <h2 id="rem-title" className={sectionTitle}>
        Przypomnienie
      </h2>
      <p className="text-sm text-muted">Powiadomienie o tej godzinie, tylko w dni, gdy nawyk jest wymagany i jeszcze nie zrobiony.</p>
      <div className="flex items-center gap-3">
        <input type="time" aria-label="Godzina przypomnienia" value={time} onChange={(e) => setTime(e.target.value)} className={`${field} w-32`} />
        <button
          type="button"
          disabled={save.isPending}
          onClick={() => save.mutate(time, { onError: (e) => setError(e.message), onSuccess: () => setError(null) })}
          className={btnSecondary}
        >
          {reminder ? "Zmień" : "Włącz"}
        </button>
        {reminder && (
          <button type="button" onClick={() => remove.mutate(reminder.id)} className="h-11 px-2 text-sm font-semibold text-danger">
            Wyłącz
          </button>
        )}
      </div>
      {reminder && <p className="text-sm text-accent">Włączone · {reminder.localTime}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </section>
  );
}

/** Kalendarz i mapa roku w kolorze nawyku (podmiana akcentu tylko w tym fragmencie). */
function habitTint(habit: Habit): CSSProperties {
  return { "--accent": `var(--c-${habit.color}-bg)` } as CSSProperties;
}
