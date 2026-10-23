type Props = { label: string; title: string; progress: { done: number; total: number } };

/** Nagłówek dnia: dzień tygodnia, duży tytuł (iOS large title), pierścień postępu jak w Aktywności. */
export function DayHeader({ label, title, progress }: Props) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const share = progress.total === 0 ? 0 : progress.done / progress.total;

  return (
    <header className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-[13px] font-semibold uppercase tracking-[0.02em] text-accent">{label}</p>
        <h1 className="font-serif text-[34px] font-bold leading-tight">{title}</h1>
      </div>
      {progress.total > 0 && (
        <div className="relative h-16 w-16 shrink-0">
          <svg viewBox="0 0 64 64" className="h-16 w-16" role="img" aria-label={`${progress.done} z ${progress.total} zrobione`}>
            <circle cx="32" cy="32" r={r} fill="none" stroke="var(--accent)" strokeOpacity="0.18" strokeWidth="8" />
            <circle
              cx="32"
              cy="32"
              r={r}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${share * c} ${c}`}
              transform="rotate(-90 32 32)"
              style={{ transition: "stroke-dasharray 300ms ease" }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[15px] font-bold" aria-hidden="true">
            {progress.done}/{progress.total}
          </span>
        </div>
      )}
    </header>
  );
}
