import { describe, expect, it } from "vitest";
import type { Entry, Habit, Plan } from "./model";
import { buildDay } from "./today";

const TODAY = "2026-10-11"; // niedziela

const plan = (p: Partial<Plan> & Pick<Plan, "frequency">): Plan => ({
  validFrom: "2026-09-01",
  weekdays: null,
  timesPerWeek: null,
  intervalDays: null,
  targetValue: 1,
  ...p,
});

const habit = (id: string, p: Plan, over: Partial<Habit> = {}): Habit => ({
  id,
  name: id,
  kind: "check",
  unit: null,
  icon: null,
  color: "green",
  categoryId: null,
  timeOfDay: null,
  startDate: "2026-09-01",
  sortOrder: 0,
  archivedAt: null,
  plans: [p],
  ...over,
});

const e = (habitId: string, date: string, value: number | null = 1, skipped = false): Entry => ({
  habitId,
  date,
  value,
  skipped,
  note: null,
});

describe("ekran Dziś", () => {
  const habits = [
    habit("woda", plan({ frequency: "daily", targetValue: 8 }), { kind: "count", unit: "szklanki", sortOrder: 0 }),
    habit("czytanie", plan({ frequency: "daily" }), { sortOrder: 1 }),
    habit("silownia", plan({ frequency: "weekly_count", timesPerWeek: 3 }), { sortOrder: 2 }),
    habit("pn-pt", plan({ frequency: "weekdays", weekdays: [1, 2, 3, 4, 5] }), { sortOrder: 3 }),
    habit("stary", plan({ frequency: "daily" }), { archivedAt: "2026-10-01T00:00:00Z", sortOrder: 4 }),
    habit("medytacja", plan({ frequency: "daily" }), { sortOrder: 5 }),
  ];
  const entries = [e("woda", TODAY, 5), e("czytanie", TODAY), e("silownia", "2026-10-06"), e("medytacja", TODAY, null, true)];

  const view = buildDay(habits, entries, [], TODAY, TODAY, 1);

  it("dzieli na sekcje i pomija archiwalne oraz niewymagane", () => {
    expect(view.todo.map((i) => i.habit.id)).toEqual(["woda"]);
    expect(view.thisWeek.map((i) => i.habit.id)).toEqual(["silownia"]);
    expect(view.done.map((i) => i.habit.id)).toEqual(["czytanie", "medytacja"]);
  });

  it("pierścień liczy tylko wymagane, bez pominiętych", () => {
    expect(view.progress).toEqual({ done: 1, total: 2 });
  });

  it("nawyk ilościowy poniżej celu zostaje do zrobienia", () => {
    expect(view.todo[0]?.state).toBe("pending");
    expect(view.todo[0]?.entry?.value).toBe(5);
  });

  it("tygodniowy pokazuje postęp tygodnia", () => {
    expect(view.thisWeek[0]?.week).toMatchObject({ done: 1, required: 3 });
  });

  it("zaliczony tydzień trafia do zrobionych", () => {
    const more = [...entries, e("silownia", "2026-10-07"), e("silownia", "2026-10-08")];
    const v = buildDay(habits, more, [], TODAY, TODAY, 1);
    expect(v.thisWeek).toEqual([]);
    expect(v.done.map((i) => i.habit.id)).toContain("silownia");
  });

  it("widok dnia wstecz pokazuje braki jako niezrobione", () => {
    const past = buildDay(habits, entries, [], "2026-10-09", TODAY, 1); // piątek
    expect(past.todo.map((i) => i.habit.id)).toEqual(["woda", "czytanie", "pn-pt", "medytacja"]);
    expect(past.todo.every((i) => i.state === "pending")).toBe(true);
  });
});
