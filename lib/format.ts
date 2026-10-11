import type { LocalDate } from "@/lib/domain/dates";
import type { HabitKind, Plan } from "@/lib/domain/model";
import type { Streak } from "@/lib/domain/progress";

function asUtcDate(date: LocalDate): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, 12));
}

/** "niedziela, 11 października" */
export function formatDayLong(date: LocalDate): string {
  return new Intl.DateTimeFormat("pl-PL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    asUtcDate(date),
  );
}

/** "Niedziela" */
export function formatWeekday(date: LocalDate): string {
  const name = new Intl.DateTimeFormat("pl-PL", { weekday: "long", timeZone: "UTC" }).format(asUtcDate(date));
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** "11 października" */
export function formatDayMonth(date: LocalDate): string {
  return new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", timeZone: "UTC" }).format(asUtcDate(date));
}

/** "ND" */
export function formatWeekdayShort(date: LocalDate): string {
  const names = ["ND", "PN", "WT", "ŚR", "CZ", "PT", "SB"] as const;
  return names[asUtcDate(date).getUTCDay()] ?? "";
}

export function dayOfMonth(date: LocalDate): number {
  return Number(date.slice(8, 10));
}

/** Polska odmiana: 1 dzień, 2 dni, 5 dni; 1 tydzień, 3 tygodnie, 5 tygodni. */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const mod10 = n % 10;
  const mod100 = n % 100;
  return mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
}

export function formatStreak(streak: Streak): string {
  const n = streak.current;
  return streak.unit === "days"
    ? `${n} ${plural(n, "dzień", "dni", "dni")}`
    : `${n} ${plural(n, "tydzień", "tygodnie", "tygodni")}`;
}

const WEEKDAY_SHORT = ["", "pn", "wt", "śr", "cz", "pt", "sb", "nd"] as const;

/** "codziennie", "pn, śr, pt", "dni robocze", "3 razy w tygodniu", "co 2 dni" + cel dla ilościowych. */
export function describePlan(plan: Plan, kind: HabitKind, unit: string | null): string {
  let when: string;
  switch (plan.frequency) {
    case "daily":
      when = "codziennie";
      break;
    case "weekdays": {
      const days = [...(plan.weekdays ?? [])].sort();
      const key = days.join(",");
      when =
        key === "1,2,3,4,5" ? "w dni robocze" : key === "6,7" ? "w weekendy" : key === "1,2,3,4,5,6,7" ? "codziennie" : days.map((d) => WEEKDAY_SHORT[d]).join(", ");
      break;
    }
    case "weekly_count": {
      const n = plan.timesPerWeek ?? 1;
      when = `${n} ${plural(n, "raz", "razy", "razy")} w tygodniu`;
      break;
    }
    case "every_n_days":
      when = `co ${plan.intervalDays ?? 2} dni`;
      break;
  }
  if (kind === "check") return when;
  const u = kind === "duration" ? "min" : (unit ?? "");
  return `${formatNumber(plan.targetValue)} ${u} · ${when}`.replace(/\s+·/, " ·");
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}
