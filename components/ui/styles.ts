/** Wspólne klasy pól i przycisków w stylu iOS (tokeny z app/globals.css). */
export const field =
  "h-11 w-full rounded-[10px] border-0 bg-surface px-4 text-[17px] text-text placeholder:text-muted focus:outline-2 focus:outline-accent";
export const label = "flex flex-col gap-1.5";
export const labelText = "px-1 text-[13px] font-normal uppercase tracking-[0.02em] text-muted";
export const errorText = "px-1 text-[13px] text-danger";
export const btnPrimary =
  "inline-flex h-[50px] items-center justify-center rounded-[14px] bg-accent px-6 text-[17px] font-semibold text-accent-contrast transition-opacity active:opacity-70 disabled:opacity-40";
export const btnSecondary =
  "inline-flex h-[50px] items-center justify-center rounded-[14px] bg-fill px-6 text-[17px] font-semibold text-accent transition-opacity active:opacity-70 disabled:opacity-40";
export const btnDanger =
  "inline-flex h-[50px] items-center justify-center rounded-[14px] bg-fill px-6 text-[17px] font-semibold text-danger transition-opacity active:opacity-70 disabled:opacity-40";
export const btnQuiet = "inline-flex h-11 items-center justify-center rounded-full px-4 text-[17px] text-accent active:opacity-60";
export const sectionTitle = "font-serif text-[22px] font-bold";
export const chip = (on: boolean) =>
  `inline-flex h-11 items-center justify-center rounded-[10px] px-4 text-[15px] font-semibold transition-colors ${
    on ? "bg-accent text-accent-contrast" : "bg-surface text-text"
  }`;
