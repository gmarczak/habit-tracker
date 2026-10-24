"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { sectionTitle } from "@/components/ui/styles";
import { useAction, useSnapshot } from "@/lib/data/hooks";
import { deleteReminder, upsertReminder } from "@/lib/data/mutations";
import type { Reminder, ReminderKind } from "@/lib/domain/model";
import { currentSubscription, deviceOptedOut, disablePush, enablePush, isIos, pushSupport, type PushSupport } from "./push";

type Kind = Exclude<ReminderKind, "habit">;

const OPTIONS: { kind: Kind; title: string; hint: string; defaultTime: string }[] = [
  { kind: "summary", title: "Wieczorne podsumowanie", hint: "Wszystko, co jeszcze zostało na dziś. Gdy zrobione — cisza.", defaultTime: "21:00" },
  { kind: "yesterday", title: "Rano: wczoraj niedomknięte", hint: "Gdy wczoraj coś zostało — z przejściem prosto do uzupełnienia.", defaultTime: "09:00" },
  { kind: "weekly", title: "Podsumowanie tygodnia", hint: "W ostatni dzień tygodnia: procent, najlepszy i najsłabszy nawyk.", defaultTime: "19:00" },
];

const PARTS: { kind: Kind; title: string; defaultTime: string }[] = [
  { kind: "morning", title: "Rano", defaultTime: "08:00" },
  { kind: "day", title: "W ciągu dnia", defaultTime: "13:00" },
  { kind: "evening", title: "Wieczorem", defaultTime: "19:00" },
];

/** `showTitle = false` na podstronie Ustawień, gdzie tytuł jest w nagłówku strony. */
export function ReminderSettings({ showTitle = true }: { showTitle?: boolean }) {
  const { data: snapshot } = useSnapshot();
  const [support, setSupport] = useState<PushSupport>("unsupported");
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setSupport(pushSupport()), 0);
    void currentSubscription().then((s) => setSubscribed(Boolean(s)));
    return () => window.clearTimeout(id);
  }, []);

  const turnOffDevice = useAction(async (supabase) => disablePush(supabase, true));
  const turnOnDevice = useAction(async (supabase) => enablePush(supabase));
  if (!snapshot) return null;

  const byKind = (kind: Kind) => snapshot.reminders.find((r) => r.kind === kind);
  const habitReminders = snapshot.reminders.filter((r) => r.kind === "habit");
  // Pory dnia przypominają tylko o nawykach „buduję” odhaczanych ręcznie (jak funkcja wysyłki)
  const withParts = snapshot.habits.filter((h) => h.archivedAt === null && h.timeOfDay !== null && h.goal === "build" && !h.source);
  const lastDay = snapshot.settings.weekStart === 1 ? "niedzielę" : "sobotę";
  const canEnable = support === "supported";
  // Przypomnienia włączone na koncie, ale to urządzenie nie ma subskrypcji (np. po wylogowaniu)
  // (chyba że to świadome „Wyłącz na tym urządzeniu”)
  const deviceOff = canEnable && subscribed === false && !deviceOptedOut() && snapshot.reminders.some((r) => r.enabled);

  return (
    <section aria-labelledby="rem-title" className="flex flex-col gap-4">
      <h2 id="rem-title" className={showTitle ? sectionTitle : "sr-only"}>
        Przypomnienia
      </h2>
      {support === "ios-needs-install" && (
        <p className="rounded-xl bg-surface px-4 py-3 text-sm">
          Na iPhonie powiadomienia działają po dodaniu aplikacji do ekranu głównego: Udostępnij → „Do ekranu początkowego”, potem otwórz ją z ikony.
        </p>
      )}
      {support === "denied" && (
        <p className="rounded-xl bg-surface px-4 py-3 text-sm">
          {isIos()
            ? "Powiadomienia są wyłączone. Włączysz je w Ustawieniach iPhone’a → Powiadomienia → Nawyki."
            : "Powiadomienia są zablokowane w ustawieniach przeglądarki dla tej strony."}
        </p>
      )}
      {deviceOff && (
        <div className="flex flex-col gap-2 rounded-xl bg-surface px-4 py-3">
          <p className="text-sm">Przypomnienia są włączone, ale to urządzenie ich nie dostaje.</p>
          <button
            type="button"
            disabled={turnOnDevice.isPending}
            onClick={() => turnOnDevice.mutate(undefined, { onSuccess: () => setSubscribed(true), onError: (e) => setError(e.message) })}
            className="self-start text-sm font-semibold text-accent"
          >
            {turnOnDevice.isPending ? "Włączam…" : "Włącz powiadomienia na tym urządzeniu"}
          </button>
        </div>
      )}
      {support === "unsupported" && <p className="text-sm text-muted">Ta przeglądarka nie obsługuje powiadomień push.</p>}

      <div className="flex flex-col divide-y divide-border rounded-xl bg-surface px-4">
        {OPTIONS.map((o) => (
          <ReminderToggle
            key={o.kind}
            kind={o.kind}
            title={o.title}
            hint={o.kind === "weekly" ? o.hint.replace("W ostatni dzień tygodnia", `W ${lastDay}`) : o.hint}
            defaultTime={o.defaultTime}
            reminder={byKind(o.kind)}
            canEnable={canEnable}
            deviceOff={deviceOff}
            onError={setError}
            onSubscribed={() => setSubscribed(true)}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-semibold">Pory dnia</h3>
        <p className="text-sm text-muted">
          {withParts.length === 0
            ? "Żaden nawyk nie ma jeszcze pory dnia — ustawisz ją w edycji nawyku."
            : "Przypomnienie przychodzi tylko z nawykami tej pory, które jeszcze czekają."}
        </p>
        <div className="flex flex-col divide-y divide-border rounded-xl bg-surface px-4">
          {PARTS.map((p) => {
            const names = withParts.filter((h) => h.timeOfDay === p.kind).map((h) => h.name);
            return (
              <ReminderToggle
                key={p.kind}
                kind={p.kind}
                title={p.title}
                hint={names.length > 0 ? names.join(", ") : "Brak nawyków o tej porze"}
                defaultTime={p.defaultTime}
                reminder={byKind(p.kind)}
                canEnable={canEnable}
                deviceOff={deviceOff}
                onError={setError}
                onSubscribed={() => setSubscribed(true)}
              />
            );
          })}
        </div>
      </div>

      {habitReminders.length > 0 && (
        <ul className="ios-group flex flex-col">
          {habitReminders.map((r) => {
            const habit = snapshot.habits.find((h) => h.id === r.habitId);
            return (
              <li key={r.id} className="flex items-center justify-between border-b-[0.5px] border-border py-2.5">
                <Link href={`/habits/${r.habitId}`} className="font-medium">
                  {habit?.name ?? "Nawyk"}
                </Link>
                <span className="text-sm text-muted">{r.localTime}</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted">Przypomnienie dla pojedynczego nawyku ustawisz na jego stronie.</p>

      {subscribed && (
        <button
          type="button"
          onClick={() => turnOffDevice.mutate(undefined, { onSuccess: () => setSubscribed(false) })}
          className="self-start text-sm font-semibold text-muted underline underline-offset-4"
        >
          Wyłącz powiadomienia na tym urządzeniu
        </button>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </section>
  );
}

function ReminderToggle({
  kind,
  title,
  hint,
  defaultTime,
  reminder,
  canEnable,
  deviceOff,
  onError,
  onSubscribed,
}: {
  kind: Kind;
  title: string;
  hint: string;
  defaultTime: string;
  reminder: Reminder | undefined;
  canEnable: boolean;
  /** to urządzenie nie ma subskrypcji: włączenie albo zmiana godziny ją odnowi */
  deviceOff: boolean;
  onError: (message: string | null) => void;
  onSubscribed: () => void;
}) {
  const [time, setTime] = useState(reminder?.localTime ?? defaultTime);
  const on = Boolean(reminder?.enabled);

  const save = useAction(async (supabase, localTime: string) => {
    if (!reminder || deviceOff) await enablePush(supabase);
    await upsertReminder(supabase, { id: reminder?.id, kind, habitId: null, localTime, enabled: true });
  });
  const remove = useAction((s, id: string) => deleteReminder(s, id));
  const busy = save.isPending || remove.isPending;

  function toggle() {
    onError(null);
    if (on && reminder) remove.mutate(reminder.id, { onError: (e) => onError(e.message) });
    else save.mutate(time, { onError: (e) => onError(e.message), onSuccess: onSubscribed });
  }

  function changeTime(value: string) {
    setTime(value);
    if (on && /^\d{2}:\d{2}$/.test(value)) save.mutate(value, { onError: (e) => onError(e.message), onSuccess: deviceOff ? onSubscribed : undefined });
  }

  return (
    <div className="flex flex-col gap-1.5 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">{title}</p>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={title}
          disabled={busy || (!on && !canEnable)}
          onClick={toggle}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-accent" : "bg-dot-off"}`}
        >
          <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-[left] ${on ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>
      <p className="text-sm text-muted">{hint}</p>
      <label className="flex items-center gap-2 text-sm text-muted">
        Godzina
        <input
          type="time"
          value={time}
          onChange={(e) => changeTime(e.target.value)}
          className="h-10 rounded-xl border border-border bg-bg px-3 text-base text-text"
        />
      </label>
    </div>
  );
}
