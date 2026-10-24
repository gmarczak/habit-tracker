"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clear as clearIdb } from "idb-keyval";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { DataFallback } from "@/components/ui/DataFallback";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { btnDanger, btnSecondary, chip, field, label, labelText } from "@/components/ui/styles";
import { PasswordForm } from "@/features/auth/PasswordForm";
import { PauseForm } from "@/features/habits/HabitDetail";
import { disablePush } from "@/features/reminders/push";
import { ReminderSettings } from "@/features/reminders/ReminderSettings";
import { download, entriesCsv, snapshotJson } from "@/lib/data/export";
import { useAction, useSnapshot, useToday } from "@/lib/data/hooks";
import { deleteAccount, deleteCategory, endPause, updateSettings, withPauseEnded, type SettingsForm } from "@/lib/data/mutations";
import { fetchAllHealth, type Snapshot } from "@/lib/data/snapshot";
import { supabaseBrowser } from "@/lib/db/client";
import { signOutFlow } from "@/lib/db/session";
import type { LocalDate, WeekStart } from "@/lib/domain/dates";
import { formatDayLong } from "@/lib/format";
import { HealthSync } from "./HealthSync";
import { SiriShortcuts } from "./SiriShortcuts";

const DAY_END = [0, 1, 2, 3, 4, 5, 6];

/** Podstrona Ustawień jak w iOS: „‹ Ustawienia”, duży tytuł, treść. */
function Subpage({ title, children }: { title: string; children: (snapshot: Snapshot, today: LocalDate) => ReactNode }) {
  const { data: snapshot, isPending, refetch } = useSnapshot();
  const today = useToday(snapshot);
  return (
    <main className="flex flex-col gap-6 px-4 pt-4 pb-6">
      <Link href="/settings" className="-ml-1 flex h-11 items-center gap-1 self-start text-[17px] text-accent">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        Ustawienia
      </Link>
      <h1 className="-mt-3 font-serif text-[34px] font-bold leading-tight">{title}</h1>
      {snapshot && today ? children(snapshot, today) : <DataFallback inline pending={isPending} onRetry={() => void refetch()} />}
    </main>
  );
}

export function RemindersPage() {
  return <Subpage title="Przypomnienia">{() => <ReminderSettings showTitle={false} />}</Subpage>;
}

export function HealthPage() {
  return <Subpage title="Apple Zdrowie">{() => <HealthSync showTitle={false} />}</Subpage>;
}

export function SiriPage() {
  return <Subpage title="Siri i Skróty">{(snapshot) => <SiriShortcuts snapshot={snapshot} />}</Subpage>;
}

export function DayAndWeekPage() {
  return (
    <Subpage title="Dzień i tydzień">
      {(snapshot) => <DayAndWeek key={snapshot.userId} userId={snapshot.userId} initial={snapshot.settings} />}
    </Subpage>
  );
}

export function VacationPage() {
  return <Subpage title="Urlop">{(snapshot, today) => <Vacation snapshot={snapshot} today={today} />}</Subpage>;
}

export function CategoriesPage() {
  return <Subpage title="Kategorie">{(snapshot) => <Categories snapshot={snapshot} />}</Subpage>;
}

export function DataPage() {
  // Całe Apple Zdrowie pobrane od razu, żeby przycisk zapisał plik jeszcze w tym samym dotknięciu (wymóg iOS)
  const allHealth = useQuery({ queryKey: ["health-all"], queryFn: () => fetchAllHealth(supabaseBrowser()), staleTime: 60_000 });
  return (
    <Subpage title="Twoje dane">
      {(snapshot, today) => (
        <section className="flex flex-col gap-3">
          <p className="text-sm text-muted">Cała historia nawyków do pliku: CSV do arkusza, JSON jako pełna kopia.</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => download(`nawyki-${today}.csv`, entriesCsv(snapshot), "text/csv;charset=utf-8")} className={btnSecondary}>
              Eksport CSV
            </button>
            <button
              type="button"
              disabled={allHealth.isPending && allHealth.fetchStatus === "fetching"}
              onClick={() => download(`nawyki-${today}.json`, snapshotJson(snapshot, new Date().toISOString(), allHealth.data), "application/json")} // eslint-disable-line no-restricted-syntax -- znacznik czasu eksportu
              className={btnSecondary}
            >
              Eksport JSON
            </button>
          </div>
          {!allHealth.data && allHealth.fetchStatus !== "fetching" && (
            <p className="text-xs text-muted">Bez sieci w pliku JSON będzie Apple Zdrowie tylko z ostatnich 120 dni.</p>
          )}
        </section>
      )}
    </Subpage>
  );
}

export function AccountPage() {
  return <Subpage title="Konto">{(snapshot) => <Account email={snapshot.email} />}</Subpage>;
}

function Vacation({ snapshot, today }: { snapshot: Snapshot; today: LocalDate }) {
  const [planning, setPlanning] = useState(false);
  // Trwający urlop kończy się wczoraj (minione dni zostają neutralne), przyszły znika
  const removePause = useAction((s, p: { id: string; startDate: LocalDate }) => endPause(s, p, today), (snap, p) => withPauseEnded(snap, p, today), {
    toastErrors: true,
  });
  const vacations = snapshot.pauses.filter((p) => p.habitId === null && p.endDate >= today);
  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm text-muted">Pauza dla wszystkich nawyków naraz. Serie przetrwają, statystyki nie spadną.</p>
      {vacations.length > 0 && (
        <ul className="ios-group">
          {vacations.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 border-b-[0.5px] border-border py-3">
              <span className="text-[15px]">
                {formatDayLong(p.startDate)} – {formatDayLong(p.endDate)}
                {p.reason ? ` · ${p.reason}` : ""}
              </span>
              <button type="button" onClick={() => removePause.mutate(p)} className="h-11 shrink-0 px-2 text-[15px] text-danger">
                {p.startDate < today ? "Zakończ" : "Usuń"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => setPlanning(true)} className={`${btnSecondary} self-start`}>
        Zaplanuj urlop
      </button>
      <Modal open={planning} onClose={() => setPlanning(false)} title="Urlop" subtitle="Pauza dla wszystkich nawyków">
        {planning && <PauseForm habitId={null} today={today} onDone={() => setPlanning(false)} />}
      </Modal>
    </section>
  );
}

function Categories({ snapshot }: { snapshot: Snapshot }) {
  const toast = useToast();
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const removeCategory = useAction((s, id: string) => deleteCategory(s, id), undefined, { toastErrors: true });
  const categories = snapshot.categories.filter((c) => !hiddenIds.includes(c.id));
  const unhide = (id: string) => setHiddenIds((ids) => ids.filter((x) => x !== id));

  // Jak przy nawykach: kategoria znika od razu, usunięcie rusza dopiero, gdy nie cofniesz
  function remove(c: { id: string; name: string }) {
    setHiddenIds((ids) => [...ids, c.id]);
    toast({
      message: `Usunięto kategorię „${c.name}”`,
      actionLabel: "Cofnij",
      onAction: () => unhide(c.id),
      onExpire: () => removeCategory.mutate(c.id, { onError: () => unhide(c.id) }),
    });
  }

  return (
    <section className="flex flex-col gap-2">
      {categories.length === 0 ? (
        <p className="text-sm text-muted">Nie masz jeszcze kategorii. Dodasz je w edycji nawyku → Kategoria → „Nowa kategoria…”.</p>
      ) : (
        <ul className="ios-group">
          {categories.map((c) => {
            const count = snapshot.habits.filter((h) => h.categoryId === c.id).length;
            return (
              <li key={c.id} className="flex items-center justify-between border-b-[0.5px] border-border py-2.5">
                <span className="text-[17px]">
                  {c.name} <span className="text-[15px] text-muted">· {count}</span>
                </span>
                <button type="button" onClick={() => remove(c)} className="h-11 px-2 text-[15px] text-danger">
                  Usuń
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="px-4 pb-1.5 text-[13px] text-muted">Usunięcie kategorii nie usuwa nawyków — trafią do „Bez kategorii”.</p>
    </section>
  );
}

function Account({ email }: { email: string | null }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function signOut() {
    setSignOutError(null);
    const supabase = supabaseBrowser();
    // Sesji, której nie da się wczytać (wygasła bez sieci), nie da się też usunąć — nic jeszcze nie ruszamy
    const { data, error } = await supabase.auth.getSession();
    if (error && !data.session) {
      setSignOutError("Wylogowanie wymaga połączenia z internetem.");
      return;
    }
    signOutFlow.active = true;
    try {
      // Wylogowane urządzenie nie dostaje już przypomnień (subskrypcja znika także bez sieci)
      await disablePush(supabase).catch(() => {});
      // Tylko to urządzenie — „Wyloguj” w Safari nie wylogowuje aplikacji z ekranu głównego.
      // Błąd sieci tutaj nie szkodzi: wczytana sesja jest i tak usuwana z urządzenia.
      await supabase.auth.signOut({ scope: "local" });
      if ("clearAppBadge" in navigator) await navigator.clearAppBadge().catch(() => {});
      qc.clear();
      await clearIdb();
      router.replace("/login");
    } finally {
      signOutFlow.active = false;
    }
  }

  return (
    <section className="flex flex-col gap-3">
      {email && <p className="text-sm text-muted">Zalogowano jako {email}</p>}
      {changingPassword ? (
        <PasswordForm />
      ) : (
        <button type="button" onClick={() => setChangingPassword(true)} className={`${btnSecondary} self-start`}>
          Ustaw lub zmień hasło
        </button>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => void signOut()} className={btnSecondary}>
          Wyloguj
        </button>
        <button type="button" onClick={() => setDeleting(true)} className={btnDanger}>
          Usuń konto
        </button>
      </div>
      {signOutError && <p className="text-sm text-danger">{signOutError}</p>}
      <Modal open={deleting} onClose={() => setDeleting(false)} title="Usunąć konto?">
        {deleting && <DeleteAccount onCancel={() => setDeleting(false)} />}
      </Modal>
    </section>
  );
}

function DayAndWeek({ userId, initial }: { userId: string; initial: SettingsForm }) {
  const [form, setForm] = useState<SettingsForm>(initial);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const save = useAction((s, v: SettingsForm) => updateSettings(s, userId, v));

  // Jak w Ustawieniach iOS: zmiana zapisuje się od razu, bez przycisku
  function change(next: SettingsForm) {
    setForm(next);
    save.mutate(next, {
      onSuccess: () => setStatus("saved"),
      onError: () => {
        setForm(initial);
        setStatus("error");
      },
    });
  }
  const zones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [initial.timeZone];
    }
  }, [initial.timeZone]);

  return (
    <section aria-labelledby="day-title" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 id="day-title" className="sr-only">
          Dzień i tydzień
        </h2>
        <span className={`text-[13px] ${status === "error" ? "text-danger" : "text-muted"}`} aria-live="polite">
          {save.isPending ? "Zapisuję…" : status === "saved" ? "Zapisano" : status === "error" ? "Nie zapisano" : ""}
        </span>
      </div>
      <label className={label}>
        <span className={labelText}>Strefa czasowa</span>
        <select value={form.timeZone} onChange={(e) => change({ ...form, timeZone: e.target.value })} className={field}>
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
            <button key={w} type="button" aria-pressed={form.weekStart === w} onClick={() => change({ ...form, weekStart: w })} className={chip(form.weekStart === w)}>
              {w === 1 ? "Poniedziałek" : "Niedzielę"}
            </button>
          ))}
        </div>
      </fieldset>
      <label className={label}>
        <span className={labelText}>Dzień kończy się</span>
        <select value={form.dayStartHour} onChange={(e) => change({ ...form, dayStartHour: Number(e.target.value) })} className={field}>
          {DAY_END.map((h) => (
            <option key={h} value={h}>
              {h === 0 ? "o północy" : `o ${h}:00 w nocy`}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">Jeśli kładziesz się po północy, ustaw np. 3:00 — odhaczenie o 1:30 trafi jeszcze do „wczoraj”.</span>
      </label>
    </section>
  );
}

function DeleteAccount({ onCancel }: { onCancel: () => void }) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const remove = useAction(async (supabase) => {
    signOutFlow.active = true;
    try {
      // Najpierw to urządzenie (póki jest sesja): bez subskrypcji i bez liczby na ikonie
      await disablePush(supabase).catch(() => {});
      await deleteAccount(supabase);
      if ("clearAppBadge" in navigator) await navigator.clearAppBadge().catch(() => {});
      await supabase.auth.signOut({ scope: "local" });
      qc.clear();
      await clearIdb();
    } finally {
      signOutFlow.active = false;
    }
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
