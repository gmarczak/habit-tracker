/** Wspólne klasy pól i przycisków w stylu iOS (tokeny z app/globals.css). */
export const field =
  "h-11 w-full rounded-[10px] border-0 bg-surface px-4 text-[17px] text-text placeholder:text-muted focus:outline-2 focus:outline-accent";
export const label = "flex flex-col gap-1.5";
export const labelText = "px-1 text-[13px] font-normal uppercase tracking-[0.02em] text-muted";
export const errorText = "px-1 text-[13px] text-danger";
const btnBase = "inline-flex items-center justify-center text-center font-semibold transition-opacity active:opacity-70 disabled:opacity-40";
// min-h: dłuższy napis na wąskim ekranie łamie się w dwie linie zamiast wychodzić poza przycisk
const large = "min-h-[50px] rounded-[14px] px-6 py-2 text-[17px] leading-tight";
const small = "h-11 rounded-xl px-3 text-[15px]";
export const btnPrimary = `${btnBase} ${large} bg-accent text-accent-contrast`;
export const btnSecondary = `${btnBase} ${large} bg-fill text-accent`;
export const btnDanger = `${btnBase} ${large} bg-fill text-danger`;
/** Mniejsze przyciski do kart i wierszy */
export const btnPrimarySm = `${btnBase} ${small} bg-accent text-accent-contrast`;
export const btnSecondarySm = `${btnBase} ${small} bg-fill text-accent`;
export const btnQuiet = "inline-flex h-11 items-center justify-center rounded-full px-4 text-[17px] text-accent active:opacity-60";
export const sectionTitle = "font-serif text-[22px] font-bold";
/** Nagłówek grupy jak w Ustawieniach iOS: mały, wersalikami, szary, nad białą grupą */
export const groupHeader = "px-4 pb-1.5 text-[13px] uppercase tracking-[0.02em] text-muted";
export const chip = (on: boolean) =>
  `inline-flex h-11 items-center justify-center rounded-[10px] px-4 text-[15px] font-semibold transition-colors ${
    on ? "bg-accent text-accent-contrast" : "bg-surface text-text"
  }`;
