import { describe, expect, it } from "vitest";
import type { Entry } from "@/lib/domain/model";
import { archiveGap, entryFromChange } from "./mutations";

const entry = (over: Partial<Entry> = {}): Entry => ({ habitId: "h", date: "2026-10-20", value: 3, skipped: false, note: "notka", ...over });

describe("zapis dnia w cache", () => {
  it("dopisanie dodaje do wartości i zachowuje notatkę; po pominięciu liczy od zera", () => {
    const change = { habitId: "h", date: "2026-10-20", kind: "add" as const, delta: 2, requestId: "r" };
    expect(entryFromChange(change, entry())).toEqual(entry({ value: 5 }));
    expect(entryFromChange(change, entry({ skipped: true, value: null }))).toEqual(entry({ value: 2 }));
    expect(entryFromChange(change, undefined)).toEqual({ habitId: "h", date: "2026-10-20", value: 2, skipped: false, note: null });
  });
});

describe("dni w archiwum", () => {
  it("od dnia archiwizacji do wczoraj; dzień z wpisem zostaje", () => {
    const habit = { id: "h", archivedOn: "2026-10-10" };
    expect(archiveGap(habit, [], "2026-10-20")).toEqual({ startDate: "2026-10-10", endDate: "2026-10-19" });
    expect(archiveGap(habit, [entry({ date: "2026-10-10" })], "2026-10-20")).toEqual({ startDate: "2026-10-11", endDate: "2026-10-19" });
  });

  it("nic do wypełnienia przy cofnięciu tego samego dnia albo bez daty archiwizacji", () => {
    expect(archiveGap({ id: "h", archivedOn: "2026-10-20" }, [], "2026-10-20")).toBeNull();
    expect(archiveGap({ id: "h", archivedOn: null }, [], "2026-10-20")).toBeNull();
  });
});
