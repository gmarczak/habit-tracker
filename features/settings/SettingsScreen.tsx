"use client";

import { useQueryClient } from "@tanstack/react-query";
import { clear as clearIdb } from "idb-keyval";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { btnDanger, btnPrimary, btnSecondary, chip, field, label, labelText, sectionTitle } from "@/components/ui/styles";
import { PasswordForm } from "@/features/auth/PasswordForm";
import { PauseForm } from "@/features/habits/HabitDetail";
import { currentSubscription, disablePush, enablePush, pushSupport, type PushSupport } from "@/features/reminders/push";
import { download, entriesCsv, snapshotJson } from "@/lib/data/export";
import { useAction, useSnapshot, useToday } from "@/lib/data/hooks";
import { deleteAccount, deleteCategory, deletePause, deleteReminder, updateSettings, upsertReminder, type SettingsForm } from "@/lib/data/mutations";
import { supabaseBrowser } from "@/lib/db/client";
import type { WeekStart } from "@/lib/domain/dates";
import { formatDayLong } from "@/lib/format";

const DAY_END = [0, 1, 2, 3, 4, 5, 6];

export function SettingsScreen() {
  const { data: snapshot } = useSnapshot();
  const today = useToday(snapshot);
  const qc = useQueryClient();
  const router = useRouter();
  const [vacation, setVacation] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const removePause = useAction((s, id: string) => deletePause(s, id));
  const removeCategory = useAction((s, id: string) => deleteCategory(s, id));

  if (!snapshot || !today) return <main className="px-6 pt-7 text-muted">Ładuję…</main>;

  const vacations = snapshot.pauses.filter((p) => p.habitId === null && p.endDate >= today);

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    qc.clear();
    await clearIdb();
    router.replace("/login");
  }

  const stamp = today;

  return (
    <main className="flex flex-col gap-9 px-6 pt-7 pb-6">
      <h1 className="font-serif text-[30px] font-semibold leading-tight">Ustawienia</h1>

      <DayAndWeek key={JSON.stringify(snapshot.settings)} userId={snapshot.userId} initial={snapshot.settings} />

      <Reminders />

      <section aria-labelledby="vac-title" className="flex flex-col gap-3">
        <h2 id="vac-title" className={sectionTitle}>
          Urlop
        </h2>
        <p className="text-sm text-muted">Pauza dla wszystkich nawyków naraz. Serie przetrwają, statystyki nie spadną.</p>
        {vacations.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3">
            <span className="text-sm">
              {formatDayLong(p.startDate)} – {formatDayLong(p.endDate)}
              {p.reason ? ` · ${p.reason}` : ""}
            </span>
            <button type="button" onClick={() => removePause.mutate(p.id)} className="h-11 shrink-0 px-2 text-sm font-semibold text-danger">
              Usuń
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setVacation(true)} className={`${btnSecondary} self-start`}>
          Zaplanuj urlop
        </button>
      </section>

      {snapshot.categories.length > 0 && (
        <section aria-labelledby="cat-title" className="flex flex-col gap-2">
          <h2 id="cat-title" className={sectionTitle}>
            Kategorie
          </h2>
          <ul>
            {snapshot.categories.map((c) => {
              const count = snapshot.habits.filter((h) => h.categoryId === c.id).length;
              return (
                <li key={c.id} className="flex items-center justify-between border-b border-border py-2.5">
                  <span>
                    {c.name} <span className="text-sm text-muted">· {count}</span>
                  </span>
                  <button type="button" onClick={() => removeCategory.mutate(c.id)} className="h-11 px-2 text-sm font-semibold text-danger">
                    Usuń
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted">Usunięcie kategorii nie usuwa nawyków — trafią do „Bez kategorii”. Nowe kategorie dodasz w edycji nawyku.</p>
        </section>
      )}

      <section aria-labelledby="data-title" className="flex flex-col gap-3">
        <h2 id="data-title" className={sectionTitle}>
          Twoje dane
        </h2>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => download(`nawyki-${stamp}.csv`, entriesCsv(snapshot), "text/csv;charset=utf-8")} className={btnSecondary}>
            Eksport CSV
          </button>
          <button
            type="button"
            onClick={() => download(`nawyki-${stamp}.json`, snapshotJson(snapshot, new Date().toISOString()), "application/json")} // eslint-disable-line no-restricted-syntax -- znacznik czasu eksportu
            className={btnSecondary}
          >
            Eksport JSON
          </button>
        </div>
      </section>

      <section aria-labelledby="acc-title" className="flex flex-col gap-3">
        <h2 id="acc-title" className={sectionTitle}>
          Konto
        </h2>
        {snapshot.email && <p className="text-sm text-muted">Zalogowano jako {snapshot.email}</p>}
        <PasswordForm />
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => void signOut()} className={btnSecondary}>
            Wyloguj
          </button>
          <button type="button" onClick={() => setDeleting(true)} className={btnDanger}>
            Usuń konto
          </button>
        </div>
      </section>

      <p className="text-center text-xs text-muted">
        Nawyki 2.0 ·{" "}
        <Link href="/habits" className="underline underline-offset-2">
          zarządzaj nawykami
        </Link>
      </p>

      <Modal open={vacation} onClose={() => setVacation(false)} title="Urlop" subtitle="Pauza dla wszystkich nawyków">
        {vacation && <PauseForm habitId={null} today={today} onDone={() => setVacation(false)} />}
      </Modal>
      <Modal open={deleting} onClose={() => setDeleting(false)} title="Usunąć konto?">
        {deleting && <DeleteAccount onCancel={() => setDeleting(false)} />}
      </Modal>
    </main>
  );
}

function DayAndWeek({ userId, initial }: { userId: string; initial: SettingsForm }) {
  const [form, setForm] = useState<SettingsForm>(initial);
  const [saved, setSaved] = useState(false);
  const save = useAction((s, v: SettingsForm) => updateSettings(s, userId, v));
  const zones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [initial.timeZone];
    }
  }, [initial.timeZone]);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  return (
    <section aria-labelledby="day-title" className="flex flex-col gap-4">
      <h2 id="day-title" className={sectionTitle}>
        Dzień i tydzień
      </h2>
      <label className={label}>
        <span className={labelText}>Strefa czasowa</span>
        <select value={form.timeZone} onChange={(e) => setForm({ ...form, timeZone: e.target.value })} className={field}>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend className={`${labelText} mb-2`}>Tydzień zaczyna się w</legend>
        <div className="grid grid-cols-2 gap-2">
          {([1, 7] as WeekStart[]).map((w) => (
            <button key={w} type="button" aria-pressed={form.weekStart === w} onClick={() => setForm({ ...form, weekStart: w })} className={chip(form.weekStart === w)}>
              {w === 1 ? "Poniedziałek" : "Niedzielę"}
            </button>
          ))}
        </div>
      </fieldset>
      <label className={label}>
        <span className={labelText}>Dzień kończy się</span>
        <select value={form.dayStartHour} onChange={(e) => setForm({ ...form, dayStartHour: Number(e.target.value) })} className={field}>
          {DAY_END.map((h) => (
            <option key={h} value={h}>
              {h === 0 ? "o północy" : `o ${h}:00 w nocy`}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">Jeśli kładziesz się po północy, ustaw np. 3:00 — odhaczenie o 1:30 trafi jeszcze do „wczoraj”.</span>
      </label>
      <button
        type="button"
        disabled={!dirty || save.isPending}
        onClick={() => save.mutate(form, { onSuccess: () => setSaved(true) })}
        className={`${btnPrimary} self-start`}
      >
        {save.isPending ? "Zapisuję…" : saved && !dirty ? "Zapisano" : "Zapisz"}
      </button>
    </section>
  );
}

function Reminders() {
  const { data: snapshot } = useSnapshot();
  const [support, setSupport] = useState<PushSupport>("unsupported");
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const summary = snapshot?.reminders.find((r) => r.habitId === null);
  const [time, setTime] = useState(summary?.localTime ?? "20:00");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTimeout(() => setSupport(pushSupport()), 0);
    void currentSubscription().then((s) => setSubscribed(Boolean(s)));
  }, []);

  const enableSummary = useAction(async (supabase, localTime: string) => {
    await enablePush(supabase);
    await upsertReminder(supabase, { id: summary?.id, habitId: null, localTime, enabled: true });
  });
  const disableSummary = useAction((s, id: string) => deleteReminder(s, id));
  const turnOffDevice = useAction(async (supabase) => disablePush(supabase));

  const habitReminders = (snapshot?.reminders ?? []).filter((r) => r.habitId !== null);

  return (
    <section aria-labelledby="rem-title" className="flex flex-col gap-4">
      <h2 id="rem-title" className={sectionTitle}>
        Przypomnienia
      </h2>
      {support === "ios-needs-install" && (
        <p className="rounded-2xl bg-surface px-4 py-3 text-sm">
          Na iPhonie powiadomienia działają po dodaniu aplikacji do ekranu głównego: Udostępnij → „Do ekranu początkowego”, potem otwórz ją z ikony.
        </p>
      )}
      {support === "denied" && <p className="rounded-2xl bg-surface px-4 py-3 text-sm">Powiadomienia są zablokowane w ustawieniach przeglądarki dla tej strony.</p>}
      {support === "unsupported" && <p className="text-sm text-muted">Ta przeglądarka nie obsługuje powiadomień push.</p>}

      <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold">Wieczorne podsumowanie</p>
            <p className="text-sm text-muted">{summary?.enabled ? `Codziennie o ${summary.localTime}, tylko gdy coś zostało` : "Wyłączone"}</p>
          </div>
          <input type="time" aria-label="Godzina podsumowania" value={time} onChange={(e) => setTime(e.target.value)} className={`${field} w-28 bg-bg`} />
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            disabled={enableSummary.isPending || support !== "supported"}
            onClick={() => enableSummary.mutate(time, { onError: (e) => setError(e.message), onSuccess: () => { setError(null); setSubscribed(true); } })}
            className={btnPrimary}
          >
            {summary?.enabled ? "Zmień godzinę" : "Włącz"}
          </button>
          {summary && (
            <button type="button" onClick={() => disableSummary.mutate(summary.id)} className={btnSecondary}>
              Wyłącz
            </button>
          )}
        </div>
      </div>

      {habitReminders.length > 0 && (
        <ul className="flex flex-col">
          {habitReminders.map((r) => {
            const habit = snapshot?.habits.find((h) => h.id === r.habitId);
            return (
              <li key={r.id} className="flex items-center justify-between border-b border-border py-2.5">
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
        <button type="button" onClick={() => turnOffDevice.mutate(undefined, { onSuccess: () => setSubscribed(false) })} className="self-start text-sm font-semibold text-muted underline underline-offset-4">
          Wyłącz powiadomienia na tym urządzeniu
        </button>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </section>
  );
}

function DeleteAccount({ onCancel }: { onCancel: () => void }) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const remove = useAction(async (supabase) => {
    await deleteAccount(supabase);
    await supabase.auth.signOut();
    await clearIdb();
  });
  const ok = typed.trim().toUpperCase() === "USUŃ";

  return (
    <div className="flex flex-col gap-4">
      <p>Usuniemy konto i całą historię: nawyki, wpisy, notatki, przypomnienia. Tego nie da się cofnąć. Jeśli chcesz zachować dane, najpierw zrób eksport.</p>
      <label className={label}>
        <span className={labelText}>Wpisz USUŃ, żeby potwierdzić</span>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className={field} />
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={onCancel} className={btnSecondary}>
          Anuluj
        </button>
        <button
          type="button"
          disabled={!ok || remove.isPending}
          onClick={() => remove.mutate(undefined, { onSuccess: () => window.location.replace("/login"), onError: (e) => setError(e.message) })}
          className={btnDanger}
        >
          {remove.isPending ? "Usuwam…" : "Usuń na zawsze"}
        </button>
      </div>
    </div>
  );
}
