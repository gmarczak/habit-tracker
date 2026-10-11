"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useEntryMutation } from "@/lib/data/hooks";
import type { LocalDate } from "@/lib/domain/dates";
import type { TodayItem } from "@/lib/domain/today";
import { formatDayLong } from "@/lib/format";

type Props = { open: boolean; onClose: () => void; item: TodayItem; date: LocalDate };

/** Arkusz dnia: dokładna wartość, pominięcie, notatka, wyczyszczenie. */
export function EntrySheet({ open, onClose, item, date }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const mutation = useEntryMutation();
  const { habit, plan, entry } = item;
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setValue(entry && !entry.skipped && entry.value !== null ? String(entry.value) : "");
      setNote(entry?.note ?? "");
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open, entry]);

  const noteValue = note.trim() === "" ? null : note.trim();

  function save(event: FormEvent) {
    event.preventDefault();
    const parsed = habit.kind === "check" ? 1 : Number(value.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) return;
    mutation.mutate({ habitId: habit.id, date, kind: "set", value: parsed, note: noteValue });
    onClose();
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-3xl border border-border bg-bg p-0 text-text backdrop:bg-black/50"
    >
      <form onSubmit={save} className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="text-xl font-bold">{habit.name}</h2>
          <p className="text-sm text-muted first-letter:uppercase">{formatDayLong(date)}</p>
        </div>

        {habit.kind !== "check" && (
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">
              Ile? <span className="text-muted">(cel: {plan.targetValue} {habit.unit})</span>
            </span>
            <input
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-12 rounded-xl border border-border bg-surface px-4 text-base"
            />
          </label>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="font-medium">Notatka</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            rows={3}
            className="rounded-xl border border-border bg-surface px-4 py-3 text-base"
          />
        </label>

        <button type="submit" className="h-12 rounded-xl bg-accent font-semibold text-accent-contrast">
          {habit.kind === "check" ? "Zrobione" : "Zapisz"}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              mutation.mutate({ habitId: habit.id, date, kind: "skip", note: noteValue });
              onClose();
            }}
            className="h-11 rounded-xl border border-border font-medium"
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
            className="h-11 rounded-xl border border-border font-medium disabled:opacity-40"
          >
            Wyczyść
          </button>
        </div>
        <button type="button" onClick={onClose} className="h-10 text-muted">
          Zamknij
        </button>
      </form>
    </dialog>
  );
}
