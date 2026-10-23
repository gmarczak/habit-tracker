"use client";

import { Annoyed, Frown, Laugh, Meh, Smile } from "lucide-react";
import { useState } from "react";
import { btnPrimary, btnQuiet, groupHeader } from "@/components/ui/styles";
import { useAction } from "@/lib/data/hooks";
import { saveDayNote, withDayNote, type DayNoteInput } from "@/lib/data/mutations";
import type { LocalDate } from "@/lib/domain/dates";

export const MOODS = [
  { value: 1, label: "Źle", Icon: Frown },
  { value: 2, label: "Słabo", Icon: Annoyed },
  { value: 3, label: "Tak sobie", Icon: Meh },
  { value: 4, label: "Dobrze", Icon: Smile },
  { value: 5, label: "Świetnie", Icon: Laugh },
] as const;

/**
 * Nastrój dnia (jedno dotknięcie) i notatka, np. „spałem 5 godzin”.
 * W statystykach widać potem, które nawyki idą w parze z lepszym nastrojem.
 */
export function DayNote({ date, note, mood }: { date: LocalDate; note: string | null; mood: number | null }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note ?? "");
  const [error, setError] = useState<string | null>(null);
  const save = useAction((s, input: DayNoteInput) => saveDayNote(s, input), withDayNote, { scope: "day-note" });

  function startEditing() {
    setText(note ?? "");
    setError(null);
    setEditing(true);
  }

  function submit() {
    setError(null);
    save.mutate({ date, text, mood }, { onSuccess: () => setEditing(false), onError: (e) => setError(e.message) });
  }

  function pickMood(value: number) {
    setError(null);
    save.mutate({ date, text: note ?? "", mood: value === mood ? null : value }, { onError: (e) => setError(e.message) });
  }

  return (
    <div className="mt-6 flex flex-col gap-1.5">
      <h2 className={groupHeader}>Nastrój dnia</h2>
      <div className="grid grid-cols-5 gap-1 rounded-xl bg-surface p-2" role="radiogroup" aria-label="Nastrój dnia">
        {MOODS.map(({ value, label, Icon }) => {
          const on = mood === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={label}
              onClick={() => pickMood(value)}
              className={`flex h-12 flex-col items-center justify-center rounded-lg transition-colors ${on ? "bg-accent text-accent-contrast" : "text-muted"}`}
            >
              <Icon size={24} strokeWidth={on ? 2.4 : 1.8} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {!editing &&
        (note ? (
          <button type="button" onClick={startEditing} className="mt-2 flex flex-col items-start gap-1 rounded-xl bg-surface px-4 py-3 text-left">
            <span className="text-[13px] uppercase tracking-[0.02em] text-muted">Notatka dnia</span>
            <span className="whitespace-pre-wrap">{note}</span>
          </button>
        ) : (
          <button type="button" onClick={startEditing} className={`${btnQuiet} mt-2 self-center`}>
            + Notatka do dnia
          </button>
        ))}

      {editing && (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            rows={3}
            aria-label="Notatka dnia"
            placeholder="np. spałem 5 godzin, wyjazd, choroba"
            className="w-full rounded-[10px] bg-surface px-4 py-3 text-[17px] placeholder:text-muted"
          />
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
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
