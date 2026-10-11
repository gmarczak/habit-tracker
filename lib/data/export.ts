import type { Snapshot } from "./snapshot";

function csvCell(value: string | number | boolean | null): string {
  if (value === null) return "";
  const s = String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Jeden wiersz na wpis dnia: data, nawyk, wartość, jednostka, pominięte, notatka. */
export function entriesCsv(snapshot: Snapshot): string {
  const names = new Map(snapshot.habits.map((h) => [h.id, h]));
  const rows = [...snapshot.entries]
    .sort((a, b) => (a.date === b.date ? a.habitId.localeCompare(b.habitId) : a.date < b.date ? -1 : 1))
    .map((e) => {
      const h = names.get(e.habitId);
      const unit = h?.kind === "duration" ? "min" : h?.kind === "count" ? h.unit : null;
      return [e.date, h?.name ?? e.habitId, e.value, unit, e.skipped ? "tak" : "nie", e.note].map(csvCell).join(",");
    });
  return ["data,nawyk,wartosc,jednostka,pominiete,notatka", ...rows].join("\n") + "\n";
}

/** Pełny eksport: nawyki z planami, wpisy, pauzy, kategorie, przypomnienia, ustawienia. */
export function snapshotJson(snapshot: Snapshot, exportedAt: string): string {
  const { userId: _userId, email: _email, ...data } = snapshot;
  return JSON.stringify({ format: "nawyki-export", version: 1, exportedAt, ...data }, null, 2);
}

export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
