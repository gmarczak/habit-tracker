"use client";

import { useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { btnPrimary, btnSecondary, chip, field, label, labelText } from "@/components/ui/styles";
import { useEntryMutation } from "@/lib/data/hooks";
import type { LocalDate } from "@/lib/domain/dates";
import type { Entry, Habit, Plan } from "@/lib/domain/model";
import { formatDayLong } from "@/lib/format";

type Props = { open: boolean; onClose: () => void; habit: Habit; plan: Plan; entry: Entry | undefined; date: LocalDate };

/** Arkusz dnia: dokładna wartość, pominięcie, notatka, wyczyszczenie. */
export function EntrySheet(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} title={props.habit.name} subtitle={formatDayLong(props.date)}>
      {props.open && <EntryForm {...props} />}
    </Modal>
  );
}

function EntryForm({ onClose, habit, plan, entry, date }: Props) {
  const mutation = useEntryMutation();
  const [value, setValue] = useState(entry && !entry.skipped && entry.value !== null ? String(entry.value) : "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [invalid, setInvalid] = useState(false);
  const noteValue = note.trim() === "" ? null : note.trim();
  const unit = habit.kind === "duration" ? "min" : (habit.unit ?? "");

  function save(event: FormEvent) {
    event.preventDefault();
    const parsed = habit.kind === "check" ? 1 : Number(value.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0 || (habit.kind !== "check" && value.trim() === "")) {
      setInvalid(true);
      return;
    }
    mutation.mutate({ habitId: habit.id, date, kind: "set", value: parsed, note: noteValue });
    onClose();
  }

  const current = entry && !entry.skipped ? (entry.value ?? 0) : 0;
  const steps = habit.kind === "count" ? [1, 2, 3, 5] : habit.kind === "duration" ? [5, 10, 15, 30] : [];

  function add(n: number) {
    mutation.mutate({ habitId: habit.id, date, kind: "set", value: current + n, note: noteValue });
    onClose();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
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
