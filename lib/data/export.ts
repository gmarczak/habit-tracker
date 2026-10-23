import type { HealthDay } from "@/lib/domain/health";
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
  // BOM: Excel inaczej czyta polskie znaki jako Windows-1250 („rozdziaĹ‚”)
  return "\uFEFF" + ["data,nawyk,wartosc,jednostka,pominiete,notatka", ...rows].join("\r\n") + "\r\n";
}

/** Pełny eksport: nawyki z planami, wpisy, pauzy, kategorie, przypomnienia, ustawienia, notatki i całe Apple Zdrowie. */
export function snapshotJson(snapshot: Snapshot, exportedAt: string, allHealth?: HealthDay[]): string {
  const { userId: _userId, email: _email, ...data } = snapshot;
  return JSON.stringify({ format: "nawyki-export", version: 1, exportedAt, ...data, health: allHealth ?? data.health }, null, 2);
}

/**
 * Zapis pliku. Na telefonie arkusz udostępniania („Zachowaj w Plikach”) — w aplikacji z ekranu głównego
 * zwykłe pobieranie bywa zawodne; gdzie indziej zwykłe pobieranie.
 */
export function download(filename: string, content: string, type: string) {
  const file = new File([content], filename, { type });
  const touch = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    void navigator.share({ files: [file] }).catch(() => {});
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari czyta plik dopiero po potwierdzeniu pobierania: adres musi pożyć dłużej
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
