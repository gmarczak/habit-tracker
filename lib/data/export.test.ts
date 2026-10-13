import { describe, expect, it } from "vitest";
import { entriesCsv, snapshotJson } from "./export";
import type { Snapshot } from "./snapshot";

const snapshot: Snapshot = {
  userId: "u1",
  email: "a@b.c",
  settings: { timeZone: "Europe/Warsaw", weekStart: 1, dayStartHour: 0 },
  habits: [
    {
      id: "h1",
      name: "Czytanie, wieczorem",
      kind: "count",
      unit: "strony",
      icon: "book-open",
      color: "amber",
      categoryId: null,
      timeOfDay: null,
      goal: "build",
      startDate: "2026-10-01",
      sortOrder: 0,
      archivedAt: null,
      plans: [],
    },
  ],
  entries: [
    { habitId: "h1", date: "2026-10-02", value: 12, skipped: false, note: 'Rozdział "3"' },
    { habitId: "h1", date: "2026-10-01", value: null, skipped: true, note: null },
  ],
  pauses: [],
  categories: [],
  reminders: [],
  notes: [],
};

describe("eksport", () => {
  it("CSV: posortowane, cytowanie przecinków i cudzysłowów", () => {
    expect(entriesCsv(snapshot)).toBe(
      'data,nawyk,wartosc,jednostka,pominiete,notatka\n2026-10-01,"Czytanie, wieczorem",,strony,tak,\n2026-10-02,"Czytanie, wieczorem",12,strony,nie,"Rozdział ""3"""\n',
    );
  });

  it("JSON bez identyfikatora i e-maila", () => {
    const json = JSON.parse(snapshotJson(snapshot, "2026-10-11T20:00:00Z"));
    expect(json.format).toBe("nawyki-export");
    expect(json.userId).toBeUndefined();
    expect(json.email).toBeUndefined();
    expect(json.entries).toHaveLength(2);
  });
});
