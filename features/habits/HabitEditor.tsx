"use client";

import { useState, type FormEvent } from "react";
import { chip, errorText, field, label, labelText, btnPrimary, btnSecondary } from "@/components/ui/styles";
import { useAction } from "@/lib/data/hooks";
import { createCategory, createHabit, habitFormSchema, updateHabit, type HabitForm } from "@/lib/data/mutations";
import type { Snapshot } from "@/lib/data/snapshot";
import type { LocalDate } from "@/lib/domain/dates";
import { HEALTH_METRICS, METRIC_INFO, type HealthMetric } from "@/lib/domain/health";
import { HABIT_COLORS, type Frequency, type Habit, type Goal, type HabitKind, type TimeOfDay } from "@/lib/domain/model";
import { planOn } from "@/lib/domain/schedule";
import { COLOR_LABELS, HabitBadge, ICONS, ICON_KEYS } from "@/lib/ui/icons";

const WEEKDAYS = [
  { n: 1, label: "Pn" },
  { n: 2, label: "Wt" },
  { n: 3, label: "Śr" },
  { n: 4, label: "Cz" },
  { n: 5, label: "Pt" },
  { n: 6, label: "Sb" },
  { n: 7, label: "Nd" },
] as const;

const KINDS: { value: HabitKind; label: string; hint: string }[] = [
  { value: "check", label: "Tak / nie", hint: "Zrobione albo nie" },
  { value: "count", label: "Ilość", hint: "np. 8 szklanek, 20 stron — jednostkę wpisz w dopełniaczu (stron, szklanek)" },
  { value: "duration", label: "Czas", hint: "minuty, np. 10 min medytacji" },
];

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "daily", label: "Codziennie" },
  { value: "weekdays", label: "W wybrane dni" },
  { value: "weekly_count", label: "X razy w tygodniu" },
  { value: "every_n_days", label: "Co kilka dni" },
];

const GOALS: { value: Goal; label: string; hint: string }[] = [
  { value: "build", label: "Buduję", hint: "Odhaczasz, gdy zrobione — np. czytanie, spacer." },
  { value: "quit", label: "Rzucam", hint: "Każdy dzień liczy się jako czysty; zaznaczasz tylko wpadkę — np. bez słodyczy, bez papierosów." },
];

const PARTS: { value: TimeOfDay | null; label: string }[] = [
  { value: null, label: "Kiedykolwiek" },
  { value: "morning", label: "Rano" },
  { value: "day", label: "W ciągu dnia" },
  { value: "evening", label: "Wieczorem" },
];

export type HabitPreset = Partial<HabitForm> & { name: string };

type Props = {
  snapshot: Snapshot;
  today: LocalDate;
  habit?: Habit;
  preset?: HabitPreset;
  onDone: (habitId: string | null) => void;
  onCancel: () => void;
};

function initialForm(habit: Habit | undefined, today: LocalDate, preset?: HabitPreset): HabitForm {
  const plan = habit ? planOn(habit, today) ?? habit.plans.at(-1) ?? null : null;
  return {
    name: habit?.name ?? preset?.name ?? "",
    kind: habit?.kind ?? preset?.kind ?? "check",
    unit: habit?.kind === "count" ? habit.unit : (preset?.unit ?? null),
    icon: habit?.icon ?? preset?.icon ?? null,
    color: habit?.color ?? preset?.color ?? "green",
    categoryId: habit?.categoryId ?? null,
    timeOfDay: habit ? habit.timeOfDay : (preset?.timeOfDay ?? null),
    goal: habit?.goal ?? preset?.goal ?? "build",
    startDate: habit ? null : today,
    targetValue: plan?.targetValue ?? preset?.targetValue ?? 1,
    frequency: plan?.frequency ?? preset?.frequency ?? "daily",
    weekdays: plan?.weekdays ?? preset?.weekdays ?? [1, 2, 3, 4, 5],
    timesPerWeek: plan?.timesPerWeek ?? preset?.timesPerWeek ?? 3,
    intervalDays: plan?.intervalDays ?? preset?.intervalDays ?? 2,
    source: habit?.source ?? preset?.source ?? null,
    sourceMin: habit?.sourceMin ?? preset?.sourceMin ?? null,
    cue: habit?.cue ?? preset?.cue ?? null,
    why: habit?.why ?? preset?.why ?? null,
  };
}

export function HabitEditor({ snapshot, today, habit, preset, onDone, onCancel }: Props) {
  const [form, setForm] = useState<HabitForm>(() => initialForm(habit, today, preset));
  const [targetText, setTargetText] = useState(String(form.targetValue));
  const [sourceMinText, setSourceMinText] = useState(form.sourceMin ? String(form.sourceMin) : "");
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showAllIcons, setShowAllIcons] = useState(false);
  // Id nowego nawyku nadany raz: ponowny zapis po zerwanym połączeniu nie zrobi duplikatu
  const [newId] = useState(() => crypto.randomUUID());

  const save = useAction(async (supabase, v: HabitForm) => {
    let categoryId = v.categoryId;
    if (newCategory !== null && newCategory.trim()) categoryId = await createCategory(supabase, newCategory);
    const input = { ...v, categoryId };
    if (habit) {
      await updateHabit(supabase, habit.id, planOn(habit, today), input);
      return habit.id;
    }
    return createHabit(supabase, input, newId);
  });

  const set = <K extends keyof HabitForm>(key: K, value: HabitForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const quit = form.goal === "quit";
    // „Rzucam” jest zawsze codzienne i tak/nie — pola innych rodzajów się nie liczą
    const kind = quit ? "check" : form.kind;
    const frequency = quit ? "daily" : form.frequency;
    const number = (text: string) => Number(text.replace(/\s/g, "").replace(",", "."));
    const candidate: HabitForm = {
      ...form,
      kind,
      frequency,
      unit: kind === "count" ? form.unit : null,
      targetValue: kind === "check" ? 1 : number(targetText),
      weekdays: frequency === "weekdays" ? form.weekdays : null,
      timesPerWeek: frequency === "weekly_count" ? form.timesPerWeek : null,
      intervalDays: frequency === "every_n_days" ? form.intervalDays : null,
      source: quit ? null : form.source,
      sourceMin: !quit && form.source && kind === "check" ? number(sourceMinText) || null : null,
    };
    const parsed = habitFormSchema.safeParse(candidate);
    // Dwa aktywne nawyki o tej samej nazwie: Siri i Skrót nie wiedziałyby, który odhaczyć
    const sameName = snapshot.habits.some(
      (h) => h.id !== habit?.id && h.archivedAt === null && h.name.trim().toLowerCase() === candidate.name.trim().toLowerCase(),
    );
    if (sameName && parsed.success) {
      setErrors({ name: "Masz już nawyk o tej nazwie" });
      return;
    }
    if (!parsed.success) {
      const shown = new Set(["name", "goal", "targetValue", "unit", "weekdays", "source", "sourceMin", "cue", "why"]);
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        next[shown.has(key) ? key : "form"] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    try {
      const id = await save.mutateAsync(parsed.data);
      onDone(id);
    } catch (error) {
      setErrors({ form: error instanceof Error ? error.message : "Nie udało się zapisać." });
    }
  }

  const visibleIcons = showAllIcons ? ICON_KEYS : ICON_KEYS.slice(0, 15);

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <HabitBadge icon={form.icon} color={form.color} name={form.name || "?"} size="lg" />
        <label className={`${label} flex-1`}>
          <span className={labelText}>Nazwa</span>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={80} placeholder="np. Czytanie" className={field} />
          {errors.name && <span className={errorText}>{errors.name}</span>}
        </label>
      </div>

      <fieldset>
        <legend className={`${labelText} mb-2`}>Cel</legend>
        <div className="grid grid-cols-2 gap-2">
          {GOALS.map((g) => (
            <button
              key={g.value}
              type="button"
              aria-pressed={form.goal === g.value}
              disabled={Boolean(habit)}
              onClick={() => set("goal", g.value)}
              className={`${chip(form.goal === g.value)} ${habit ? "opacity-60" : ""}`}
            >
              {g.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted">{GOALS.find((g) => g.value === form.goal)?.hint}</p>
        {errors.goal && <span className={errorText}>{errors.goal}</span>}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className={`${labelText} mb-2`}>Ikona</legend>
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
          {visibleIcons.map((key) => {
            const { Icon, label: name } = ICONS[key]!;
            const on = form.icon === key;
            return (
              <button
                key={key}
                type="button"
                aria-label={name}
                aria-pressed={on}
                onClick={() => set("icon", on ? null : key)}
                className={`flex h-12 items-center justify-center rounded-xl border-[1.5px] ${on ? "border-accent bg-surface" : "border-transparent"}`}
              >
                <Icon size={22} strokeWidth={2} aria-hidden="true" />
              </button>
            );
          })}
        </div>
        {!showAllIcons && (
          <button type="button" onClick={() => setShowAllIcons(true)} className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-accent">
            Pokaż wszystkie ({ICON_KEYS.length})
          </button>
        )}
      </fieldset>

      <fieldset>
        <legend className={`${labelText} mb-2`}>Kolor</legend>
        <div className="flex flex-wrap gap-3">
          {HABIT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={COLOR_LABELS[c]}
              aria-pressed={form.color === c}
              onClick={() => set("color", c)}
              className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{
                background: `var(--c-${c}-bg)`,
                boxShadow: form.color === c ? `0 0 0 3px var(--bg), 0 0 0 5px var(--c-${c}-bg)` : "none",
              }}
            >
              {form.color === c && <span className="h-3 w-3 rounded-full bg-white" />}
            </button>
          ))}
        </div>
      </fieldset>

      {form.goal === "build" && (
        <fieldset>
          <legend className={`${labelText} mb-2`}>Jak mierzysz?</legend>
        {habit && <p className="mb-2 text-sm text-muted">Sposobu mierzenia nie można zmienić po utworzeniu nawyku.</p>}
        <div className="grid grid-cols-3 gap-2">
          {KINDS.map((k) => (
            <label key={k.value} className={`${chip(form.kind === k.value)} ${habit ? "opacity-60" : "cursor-pointer"} h-auto flex-col gap-0.5 py-2.5`}>
              <input
                type="radio"
                name="kind"
                value={k.value}
                checked={form.kind === k.value}
                disabled={Boolean(habit)}
                onChange={() => set("kind", k.value)}
                className="sr-only"
              />
              {k.label}
            </label>
          ))}
        </div>
          <p className="mt-2 text-sm text-muted">{KINDS.find((k) => k.value === form.kind)?.hint}</p>
        </fieldset>
      )}

      {form.goal === "build" && form.kind !== "check" && (
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            <span className={labelText}>Cel dzienny</span>
            <input inputMode="decimal" value={targetText} onChange={(e) => setTargetText(e.target.value)} className={field} />
            {errors.targetValue && <span className={errorText}>{errors.targetValue}</span>}
          </label>
          {form.kind === "count" ? (
            <label className={label}>
              <span className={labelText}>Jednostka</span>
              <input value={form.unit ?? ""} onChange={(e) => set("unit", e.target.value)} maxLength={20} placeholder="np. stron, szklanek" className={field} />
              {errors.unit && <span className={errorText}>{errors.unit}</span>}
            </label>
          ) : (
            <div className="flex items-end pb-3.5 text-muted">minut</div>
          )}
        </div>
      )}

      {form.goal === "build" && (
      <fieldset className="flex flex-col gap-3">
        <legend className={`${labelText} mb-2`}>Jak często?</legend>
        <div className="grid grid-cols-2 gap-2">
          {FREQUENCIES.map((f) => (
            <button key={f.value} type="button" aria-pressed={form.frequency === f.value} onClick={() => set("frequency", f.value)} className={chip(form.frequency === f.value)}>
              {f.label}
            </button>
          ))}
        </div>

        {form.frequency === "weekdays" && (
          <div>
            <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Dni tygodnia">
              {WEEKDAYS.map((d) => {
                const on = (form.weekdays ?? []).includes(d.n);
                return (
                  <button
                    key={d.n}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("weekdays", on ? (form.weekdays ?? []).filter((x) => x !== d.n) : [...(form.weekdays ?? []), d.n].sort())}
                    className={`${chip(on)} px-0!`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            {errors.weekdays && <span className={errorText}>{errors.weekdays}</span>}
          </div>
        )}

        {form.frequency === "weekly_count" && (
          <Stepper label="Ile razy w tygodniu" value={form.timesPerWeek ?? 3} min={1} max={7} onChange={(n) => set("timesPerWeek", n)} />
        )}
        {form.frequency === "every_n_days" && (
          <Stepper label="Co ile dni" value={form.intervalDays ?? 2} min={2} max={365} onChange={(n) => set("intervalDays", n)} />
        )}
        {habit && <p className="text-sm text-muted">Zmiana harmonogramu lub celu obowiązuje od dziś. Historia zostaje policzona po staremu.</p>}
      </fieldset>
      )}

      {form.goal === "build" && (
        <div className="flex flex-col gap-3">
          <label className={label}>
            <span className={labelText}>Z Apple Zdrowie</span>
            <select
              value={form.source ?? ""}
              onChange={(e) => {
                const source = (e.target.value || null) as HealthMetric | null;
                // Inna dana = inna skala (7000 kroków, 1 trening): próg zaczyna od domyślnego dla nowej danej
                if (source && source === habit?.source && habit.sourceMin) setSourceMinText(String(habit.sourceMin));
                else if (source && (source !== form.source || !sourceMinText)) setSourceMinText(String(METRIC_INFO[source].defaultMin));
                set("source", source);
              }}
              className={field}
            >
              <option value="">Tylko ręcznie</option>
              {HEALTH_METRICS.map((m) => (
                <option key={m} value={m}>
                  {METRIC_INFO[m].label} ({METRIC_INFO[m].unit})
                </option>
              ))}
            </select>
            {errors.source && <span className={errorText}>{errors.source}</span>}
          </label>
          {form.source && form.kind === "check" && (
            <label className={label}>
              <span className={labelText}>Zaliczone od</span>
              <div className="flex items-center gap-3">
                <input inputMode="decimal" value={sourceMinText} onChange={(e) => setSourceMinText(e.target.value)} className={field} />
                <span className="shrink-0 text-muted">{METRIC_INFO[form.source].unit}</span>
              </div>
              {errors.sourceMin && <span className={errorText}>{errors.sourceMin}</span>}
            </label>
          )}
          {form.source && (
            <p className="text-sm text-muted">
              {form.kind === "check"
                ? "Odhacza się sam po przekroczeniu progu. Ręcznie też możesz."
                : `Wartość dnia = suma z Apple Zdrowie (${METRIC_INFO[form.source].unit}). Ustaw cel w tej samej jednostce.`}{" "}
              Skrót skonfigurujesz w Ustawieniach → Apple Zdrowie.
            </p>
          )}
        </div>
      )}

      <fieldset>
        <legend className={`${labelText} mb-2`}>Pora dnia</legend>
        <div className="grid grid-cols-2 gap-2">
          {PARTS.map((p) => (
            <button key={p.label} type="button" aria-pressed={form.timeOfDay === p.value} onClick={() => set("timeOfDay", p.value)} className={chip(form.timeOfDay === p.value)}>
              {p.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted">Na ekranie Dziś nawyki układają się według pory, a przypomnienie dla pory przychodzi tylko z tym, co jeszcze czeka.</p>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className={`${labelText} mb-2`}>Po czym i po co</legend>
        <label className={label}>
          <span className="px-1 text-sm">Wyzwalacz — po czym to robisz?</span>
          <input
            value={form.cue ?? ""}
            onChange={(e) => set("cue", e.target.value || null)}
            maxLength={80}
            placeholder="np. po porannej kawie, po umyciu zębów"
            className={field}
          />
          {errors.cue && <span className={errorText}>{errors.cue}</span>}
        </label>
        <label className={label}>
          <span className="px-1 text-sm">Po co? Kim chcesz być?</span>
          <input
            value={form.why ?? ""}
            onChange={(e) => set("why", e.target.value || null)}
            maxLength={120}
            placeholder="np. jestem osobą, która czyta"
            className={field}
          />
          {errors.why && <span className={errorText}>{errors.why}</span>}
        </label>
        <p className="px-1 text-sm text-muted">Konkretny moment („po kawie”) działa lepiej niż „kiedyś dziś”. Wyzwalacz pojawi się na ekranie Dziś i w przypomnieniu.</p>
      </fieldset>

      <label className={label}>
        <span className={labelText}>Kategoria</span>
        <select
          value={newCategory !== null ? "__new" : (form.categoryId ?? "")}
          onChange={(e) => {
            if (e.target.value === "__new") setNewCategory("");
            else {
              setNewCategory(null);
              set("categoryId", e.target.value || null);
            }
          }}
          className={field}
        >
          <option value="">Bez kategorii</option>
          {snapshot.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="__new">+ Nowa kategoria…</option>
        </select>
        {newCategory !== null && (
          <input
            autoFocus
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            maxLength={40}
            placeholder="Nazwa kategorii, np. Zdrowie"
            className={field}
          />
        )}
      </label>

      {errors.form && <p className={errorText}>{errors.form}</p>}

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={onCancel} className={btnSecondary}>
          Anuluj
        </button>
        <button type="submit" disabled={save.isPending} className={btnPrimary}>
          {save.isPending ? "Zapisuję…" : habit ? "Zapisz" : "Dodaj nawyk"}
        </button>
      </div>
    </form>
  );
}

function Stepper({ label: text, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-surface px-4 py-2">
      <span className="font-medium">{text}</span>
      <div className="flex items-center gap-3">
        <button type="button" aria-label="Mniej" disabled={value <= min} onClick={() => onChange(value - 1)} className="h-11 w-11 rounded-full border-[1.5px] border-control text-xl disabled:opacity-40">
          −
        </button>
        <span className="w-8 text-center text-lg font-bold tabular-nums" aria-live="polite">
          {value}
        </span>
        <button type="button" aria-label="Więcej" disabled={value >= max} onClick={() => onChange(value + 1)} className="h-11 w-11 rounded-full border-[1.5px] border-control text-xl disabled:opacity-40">
          +
        </button>
      </div>
    </div>
  );
}
