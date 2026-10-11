"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCreateHabit } from "@/lib/data/hooks";
import { newHabitSchema, type NewHabit } from "@/lib/data/mutations";
import type { LocalDate } from "@/lib/domain/dates";
import type { Frequency, HabitKind } from "@/lib/domain/model";

type Props = { open: boolean; onClose: () => void; today: LocalDate };

const WEEKDAYS = [
  { n: 1, label: "Pn" },
  { n: 2, label: "Wt" },
  { n: 3, label: "Śr" },
  { n: 4, label: "Cz" },
  { n: 5, label: "Pt" },
  { n: 6, label: "Sb" },
  { n: 7, label: "Nd" },
] as const;

const KINDS: { value: HabitKind; label: string }[] = [
  { value: "check", label: "Tak / nie" },
  { value: "count", label: "Ilość" },
  { value: "duration", label: "Czas" },
];

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "daily", label: "Codziennie" },
  { value: "weekdays", label: "Wybrane dni" },
  { value: "weekly_count", label: "X razy w tygodniu" },
  { value: "every_n_days", label: "Co kilka dni" },
];

const field = "h-12 rounded-xl border border-border bg-surface px-4 text-base";

export function NewHabitDialog({ open, onClose, today }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const create = useCreateHabit();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<HabitKind>("check");
  const [unit, setUnit] = useState("");
  const [target, setTarget] = useState("1");
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [timesPerWeek, setTimesPerWeek] = useState("3");
  const [intervalDays, setIntervalDays] = useState("2");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function reset() {
    setName("");
    setKind("check");
    setUnit("");
    setTarget("1");
    setFrequency("daily");
    setWeekdays([1, 2, 3, 4, 5]);
    setTimesPerWeek("3");
    setIntervalDays("2");
    setErrors({});
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const input: NewHabit = {
      name,
      kind,
      unit: kind === "count" ? unit : null,
      targetValue: kind === "check" ? 1 : Number(target.replace(",", ".")),
      frequency,
      weekdays: frequency === "weekdays" ? weekdays : null,
      timesPerWeek: frequency === "weekly_count" ? Number(timesPerWeek) : null,
      intervalDays: frequency === "every_n_days" ? Number(intervalDays) : null,
      startDate: today,
    };
    const parsed = newHabitSchema.safeParse(input);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    try {
      await create.mutateAsync(parsed.data);
      reset();
      onClose();
    } catch (error) {
      setErrors({ form: error instanceof Error ? error.message : "Nie udało się zapisać." });
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="new-habit-title"
      className="m-auto max-h-[90dvh] w-[min(30rem,calc(100%-2rem))] rounded-3xl border border-border bg-bg p-0 text-text backdrop:bg-black/50"
    >
      <form onSubmit={submit} className="flex flex-col gap-5 p-6" noValidate>
        <h2 id="new-habit-title" className="text-xl font-bold">
          Nowy nawyk
        </h2>

        <label className="flex flex-col gap-1.5">
          <span className="font-medium">Nazwa</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="np. Czytanie" className={field} />
          {errors.name && <span className="text-sm text-danger">{errors.name}</span>}
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 font-medium">Jak mierzysz?</legend>
          <div className="grid grid-cols-3 gap-2">
            {KINDS.map((k) => (
              <label key={k.value} className={`flex h-11 items-center justify-center rounded-xl border text-sm font-medium ${kind === k.value ? "border-accent bg-surface" : "border-border"}`}>
                <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="sr-only" />
                {k.label}
              </label>
            ))}
          </div>
        </fieldset>

        {kind !== "check" && (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-medium">Cel dzienny</span>
              <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} className={field} />
              {errors.targetValue && <span className="text-sm text-danger">Podaj liczbę większą od zera</span>}
            </label>
            {kind === "count" ? (
              <label className="flex flex-col gap-1.5">
                <span className="font-medium">Jednostka</span>
                <input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={20} placeholder="np. strony" className={field} />
                {errors.unit && <span className="text-sm text-danger">{errors.unit}</span>}
              </label>
            ) : (
              <div className="flex flex-col justify-end pb-3 text-muted">minut</div>
            )}
          </div>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="font-medium">Jak często?</span>
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} className={field}>
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        {frequency === "weekdays" && (
          <fieldset>
            <legend className="sr-only">Dni tygodnia</legend>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map((d) => {
                const on = weekdays.includes(d.n);
                return (
                  <button
                    key={d.n}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setWeekdays(on ? weekdays.filter((x) => x !== d.n) : [...weekdays, d.n].sort())}
                    className={`h-11 rounded-xl border text-sm font-semibold ${on ? "border-accent bg-accent text-accent-contrast" : "border-border"}`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            {errors.weekdays && <span className="text-sm text-danger">{errors.weekdays}</span>}
          </fieldset>
        )}

        {frequency === "weekly_count" && (
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">Ile razy w tygodniu?</span>
            <input type="number" min={1} max={7} value={timesPerWeek} onChange={(e) => setTimesPerWeek(e.target.value)} className={field} />
            {errors.timesPerWeek && <span className="text-sm text-danger">Od 1 do 7</span>}
          </label>
        )}

        {frequency === "every_n_days" && (
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">Co ile dni?</span>
            <input type="number" min={2} max={365} value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)} className={field} />
            {errors.intervalDays && <span className="text-sm text-danger">Od 2 do 365</span>}
          </label>
        )}

        {errors.form && <p className="text-sm text-danger">{errors.form}</p>}

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className="h-12 rounded-xl border border-border font-medium">
            Anuluj
          </button>
          <button type="submit" disabled={create.isPending} className="h-12 rounded-xl bg-accent font-semibold text-accent-contrast disabled:opacity-60">
            {create.isPending ? "Zapisuję…" : "Dodaj"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
