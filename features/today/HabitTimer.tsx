"use client";

import { useEffect, useRef, useState } from "react";
import { btnPrimary, btnSecondary } from "@/components/ui/styles";
import type { LocalDate } from "@/lib/domain/dates";

/**
 * Minutnik nawyku czasowego (jak „timed tasks” w Streaks).
 * Stan w localStorage i liczony od godziny startu, więc przetrwa zamknięcie aplikacji
 * i wygaszony ekran; po powrocie od razu widać właściwy czas.
 */
export type TimerState = { startedAt: number | null; elapsedMs: number };

const key = (habitId: string, date: LocalDate) => `timer:${habitId}:${date}`;

function load(habitId: string, date: LocalDate): TimerState {
  try {
    const raw = localStorage.getItem(key(habitId, date));
    if (raw) return JSON.parse(raw) as TimerState;
  } catch {
    // brak pamięci przeglądarki: minutnik działa do zamknięcia arkusza
  }
  return { startedAt: null, elapsedMs: 0 };
}

function store(habitId: string, date: LocalDate, state: TimerState | null) {
  try {
    if (state) localStorage.setItem(key(habitId, date), JSON.stringify(state));
    else localStorage.removeItem(key(habitId, date));
  } catch {
    // jw.
  }
}

/** Czy dla tego nawyku i dnia trwa (albo jest wstrzymane) odliczanie. */
export function hasTimer(habitId: string, date: LocalDate): boolean {
  const s = load(habitId, date);
  return s.startedAt !== null || s.elapsedMs > 0;
}

/** Wpis dnia zapisany inną drogą (przycisk, wartość, pominięcie): stary minutnik nie dopisze już minut. */
export function clearTimer(habitId: string, date: LocalDate) {
  store(habitId, date, null);
}

/** Jak `clearTimer`, ale oddaje zapisany stan, żeby „Cofnij” mogło go przywrócić. */
export function takeTimer(habitId: string, date: LocalDate): TimerState | null {
  const state = load(habitId, date);
  store(habitId, date, null);
  return state.startedAt !== null || state.elapsedMs > 0 ? state : null;
}

/** Przywrócony minutnik liczy dalej od godziny startu, więc czas się zgadza. */
export function restoreTimer(habitId: string, date: LocalDate, state: TimerState | null) {
  if (state) store(habitId, date, state);
}

// iPhone gra dźwięk tylko z kontekstu audio odblokowanego dotknięciem: tworzymy go przy „Start”
let audio: AudioContext | null = null;
function unlockAudio() {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    // bez dźwięku
  }
}

function chime() {
  try {
    const ctx = audio ?? new AudioContext();
    audio = ctx;
    void ctx.resume();
    [0, 0.25, 0.5].forEach((t, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = [880, 1108, 1318][i]!;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.45);
    });
  } catch {
    // dźwięk to tylko dodatek
  }
  if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
}

function format(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

type Props = { habitId: string; date: LocalDate; minutes: number; color: string; onFinish: (minutes: number) => void; onBack: () => void };

export function HabitTimer({ habitId, date, minutes, color, onFinish, onBack }: Props) {
  const [state, setState] = useState<TimerState>(() => load(habitId, date));
  const [now, setNow] = useState(() => Date.now());
  const finished = useRef(false);
  // aktualna funkcja zakończenia bez restartu efektu odliczania
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  });
  const totalMs = minutes * 60_000;
  const elapsed = state.elapsedMs + (state.startedAt !== null ? now - state.startedAt : 0);
  const left = totalMs - elapsed;
  const running = state.startedAt !== null;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (left > 0 || finished.current || elapsed === 0) return;
    finished.current = true;
    store(habitId, date, null);
    chime();
    onFinishRef.current(minutes);
  }, [left, elapsed, habitId, date, minutes]);

  function update(next: TimerState) {
    setState(next);
    setNow(Date.now());
    store(habitId, date, next.startedAt === null && next.elapsedMs === 0 ? null : next);
  }

  const start = () => {
    unlockAudio();
    update({ startedAt: Date.now(), elapsedMs: state.elapsedMs });
  };
  const pause = () => update({ startedAt: null, elapsedMs: elapsed });
  const reset = () => update({ startedAt: null, elapsedMs: 0 });
  function finishEarly() {
    const done = Math.floor(elapsed / 60_000);
    store(habitId, date, null);
    finished.current = true;
    if (done > 0) onFinish(done);
    else onBack();
  }

  const r = 88;
  const c = 2 * Math.PI * r;
  const share = Math.min(1, elapsed / totalMs);

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative flex h-52 w-52 items-center justify-center">
        <svg aria-hidden="true" viewBox="0 0 200 200" className="absolute inset-0 h-52 w-52">
          <circle cx="100" cy="100" r={r} fill="none" stroke="var(--fill)" strokeWidth="12" />
          <circle
            cx="100"
            cy="100"
            r={r}
            fill="none"
            stroke={`var(--c-${color}-bg)`}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${share * c} ${c}`}
            transform="rotate(-90 100 100)"
          />
        </svg>
        <div className="flex flex-col items-center">
          <span className="font-serif text-[44px] font-bold tabular-nums" aria-live="off">
            {format(left)}
          </span>
          <span className="text-[13px] text-muted">z {minutes} min</span>
        </div>
      </div>

      <div className="grid w-full grid-cols-2 gap-3">
        {running ? (
          <button type="button" onClick={pause} className={btnSecondary}>
            Pauza
          </button>
        ) : (
          <button type="button" onClick={start} className={btnPrimary}>
            {elapsed > 0 ? "Wznów" : "Start"}
          </button>
        )}
        <button type="button" onClick={elapsed > 0 ? finishEarly : onBack} className={btnSecondary}>
          {elapsed > 0 ? "Zakończ" : "Wróć"}
        </button>
      </div>
      {elapsed > 0 && !running && (
        <button type="button" onClick={reset} className="inline-flex min-h-11 items-center px-3 text-[15px] text-muted">
          Zacznij od nowa
        </button>
      )}
      <p className="text-center text-xs text-muted">
        Po upływie czasu minuty dopiszą się same. „Zakończ” zapisuje tyle pełnych minut, ile minęło. Odliczanie trwa też przy zamkniętej aplikacji — dźwięk
        usłyszysz, gdy będzie otwarta (i telefon nie jest wyciszony).
      </p>
    </div>
  );
}
