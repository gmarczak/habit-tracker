/** Pierścień siły nawyku 0..1 w kolorze nawyku (lista nawyków i szczegóły). */
export function StrengthRing({ value, color, size = 28 }: { value: number; color: string; size?: number }) {
  const stroke = size >= 48 ? 6 : 3.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={`var(--c-${color}-bg)`}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${Math.max(value, 0.001) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
