"use client";

import { useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { btnPrimary, btnSecondary, chip, field, label, labelText } from "@/components/ui/styles";
import { useEntryMutation } from "@/lib/data/hooks";
import type { LocalDate } from "@/lib/domain/dates";
import type { Entry, Habit, Plan } from "@/lib/domain/model";
import { formatDayLong } from "@/lib/format";
import { HabitTimer, clearTimer, hasTimer } from "./HabitTimer";

/** `today` – dzisiejszy dzień aplikacji (strefa i godzina końca dnia z profilu); minutnik tylko dla dziś. */
type Props = { open: boolean; onClose: () => void; habit: Habit; plan: Plan; entry: Entry | undefined; date: LocalDate; today: LocalDate };

/** Arkusz dnia: dokładna wartość, pominięcie, notatka, wyczyszczenie. */
export function EntrySheet(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} title={props.habit.name} subtitle={formatDayLong(props.date)}>
      {props.open && <EntryForm {...props} />}
    </Modal>
  );
}

function EntryForm({ onClose, habit, plan, entry, date, today }: Props) {
  const mutation = useEntryMutation();
  const canTime = habit.kind === "duration" && habit.goal === "build" && date === today;
  // Minutnik rozpoczęty przed północą wraca do swojego dnia, nawet gdy to już wczoraj
  const [timing, setTiming] = useState(() => habit.kind === "duration" && hasTimer(habit.id, date));
  const [value, setValue] = useState(entry && !entry.skipped && entry.value !== null ? String(entry.value) : "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [invalid, setInvalid] = useState(false);
  const noteValue = note.trim() === "" ? null : note.trim();
  const unit = habit.kind === "duration" ? "min" : (habit.unit ?? "");

  function save(event: FormEvent) {
    event.preventDefault();
    const parsed = habit.kind === "check" ? 1 : Number(value.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0 || (habit.kind !== "check" && value.trim() === "")) {
      setInvalid(true);
      return;
    }
    clearTimer(habit.id, date);
    mutation.mutate({ habitId: habit.id, date, kind: "set", value: parsed, note: noteValue });
    onClose();
  }

  const current = entry && !entry.skipped ? (entry.value ?? 0) : 0;
  const steps = habit.kind === "count" ? [1, 2, 3, 5] : habit.kind === "duration" ? [5, 10, 15, 30] : [];

  // Dopisanie liczy serwer (do tego, co jest tam teraz — także z Siri); notatkę zapisuje zmiana z dokładną wartością
  function add(n: number) {
    if (noteValue !== (entry?.note ?? null)) mutation.mutate({ habitId: habit.id, date, kind: "set", value: current + n, note: noteValue });
    else mutation.mutate({ habitId: habit.id, date, kind: "add", delta: n, requestId: crypto.randomUUID() });
    onClose();
  }

  function finishTimer(minutes: number) {
    mutation.mutate({ habitId: habit.id, date, kind: "add", delta: minutes, requestId: crypto.randomUUID() });
    onClose();
  }

  if (timing) {
    return <HabitTimer habitId={habit.id} date={date} minutes={plan.targetValue} color={habit.color} onFinish={finishTimer} onBack={() => setTiming(false)} />;
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      {canTime && (
        <button type="button" onClick={() => setTiming(true)} className={btnPrimary}>
          Minutnik · {plan.targetValue} min
        </button>
      )}
      {steps.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className={labelText}>
            Dodaj szybko{" "}
            <span className="font-normal text-muted">
              teraz {current} z {plan.targetValue} {unit}
            </span>
          </span>
          <div className="grid grid-cols-4 gap-2">
            {steps.map((n) => (
              <button key={n} type="button" onClick={() => add(n)} className={chip(false)}>
                +{n}
              </button>
            ))}
          </div>
        </div>
      )}

      {habit.kind !== "check" && (
        <label className={label}>
          <span className={labelText}>
            Albo wpisz łącznie <span className="font-normal text-muted">cel: {plan.targetValue} {unit}</span>
          </span>
          <input
            inputMode="decimal"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setInvalid(false);
            }}
            aria-invalid={invalid}
            className={field}
          />
          {invalid && <span className="text-sm text-danger">Wpisz liczbę, np. 12</span>}
        </label>
      )}

      <label className={label}>
        <span className={labelText}>Notatka</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="Jak poszło? (opcjonalnie)"
          className="w-full rounded-[10px] bg-surface px-4 py-3 text-[17px] placeholder:text-muted"
        />
      </label>

      <button type="submit" className={btnPrimary}>
        {habit.kind === "check" ? "Zrobione" : "Zapisz"}
      </button>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => {
            clearTimer(habit.id, date);
            mutation.mutate({ habitId: habit.id, date, kind: "skip", note: noteValue });
            onClose();
          }}
          className={btnSecondary}
        >
          Pomiń dzień
        </button>
        <button
          type="button"
          disabled={!entry}
          onClick={() => {
            clearTimer(habit.id, date);
            mutation.mutate({ habitId: habit.id, date, kind: "clear" });
            onClose();
          }}
          className={btnSecondary}
        >
          Wyczyść
        </button>
      </div>
      <p className="text-center text-xs text-muted">Pominięcie (np. choroba) nie przerywa serii.</p>
    </form>
  );
}
