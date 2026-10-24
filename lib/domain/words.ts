/** Polska odmiana: 1 dzień, 2 dni, 5 dni; 1 tydzień, 3 tygodnie, 5 tygodni. */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const mod10 = n % 10;
  const mod100 = n % 100;
  return Number.isInteger(n) && mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
}

/** „1 nawyk”, „3 nawyki”, „5 nawyków” */
export function habitCount(n: number): string {
  return `${n} ${plural(n, "nawyk", "nawyki", "nawyków")}`;
}

/** „Został 1 nawyk”, „Zostały 3 nawyki”, „Zostało 5 nawyków” (z małej: „został…”). */
export function habitsLeft(n: number, capital = true): string {
  const verb = plural(n, "został", "zostały", "zostało");
  return `${capital ? verb.charAt(0).toUpperCase() + verb.slice(1) : verb} ${habitCount(n)}`;
}
