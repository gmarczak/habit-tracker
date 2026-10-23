"use client";

import { useState } from "react";
import { btnPrimary, btnQuiet } from "@/components/ui/styles";
import { useAction } from "@/lib/data/hooks";
import { saveDayNote, withDayNote } from "@/lib/data/mutations";
import type { LocalDate } from "@/lib/domain/dates";

/** Notatka do dnia, np. „spałem 5 godzin” — potem widać ją w statystykach przy wyniku dnia. */
export function DayNote({ date, note }: { date: LocalDate; note: string | null }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note ?? "");
  const [error, setError] = useState<string | null>(null);
  const save = useAction((s, input: { date: LocalDate; text: string }) => saveDayNote(s, input.date, input.text), withDayNote);

  function submit() {
    setError(null);
    save.mutate({ date, text }, { onSuccess: () => setEditing(false), onError: (e) => setError(e.message) });
  }

  if (!editing) {
    return note ? (
      <button type="button" onClick={() => setEditing(true)} className="mt-6 flex flex-col items-start gap-1 rounded-xl bg-surface px-4 py-3 text-left">
        <span className="text-xs font-bold uppercase tracking-wider text-muted">Notatka dnia</span>
        <span className="whitespace-pre-wrap">{note}</span>
      </button>
    ) : (
      <button type="button" onClick={() => setEditing(true)} className={`${btnQuiet} mt-4 self-center`}>
        + Notatka do dnia
      </button>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-2">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Notatka dnia</span>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="np. spałem 5 godzin, wyjazd, choroba"
          className="w-full rounded-[10px] bg-surface px-4 py-3 text-[17px] placeholder:text-muted"
        />
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={save.isPending} onClick={submit} className={btnPrimary}>
          {save.isPending ? "Zapisuję…" : "Zapisz"}
        </button>
        <button
          type="button"
          onClick={() => {
            setText(note ?? "");
            setEditing(false);
          }}
          className={btnQuiet}
        >
          Anuluj
        </button>
      </div>
    </div>
  );
}
