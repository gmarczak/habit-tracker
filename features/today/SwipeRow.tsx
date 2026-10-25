"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";

export type SwipeAction = { label: string; tone: "accent" | "neutral"; run: () => void };

/** Od ilu pikseli puszczenie palca wykonuje akcję */
const THRESHOLD = 72;
/** Ruch, po którym wiadomo, czy to przesunięcie wiersza, czy przewijanie */
const DECIDE = 10;
/** Dalej wiersz idzie z oporem */
const SOFT_LIMIT = 96;

function resist(dx: number): number {
  const a = Math.abs(dx);
  return Math.sign(dx) * (a <= SOFT_LIMIT ? a : SOFT_LIMIT + (a - SOFT_LIMIT) * 0.3);
}

function haptic() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(10);
}

/**
 * Wiersz z gestem jak w Mailu na iPhonie: przesunięcie w prawo wykonuje `toRight`, w lewo — `toLeft`.
 * Ruch w pionie zostaje przewijaniem (touch-action: pan-y), a dotknięcia przycisków w wierszu działają jak dotąd.
 * Lista nad wierszem musi mieć overflow-hidden: tło akcji wychodzi na pełną szerokość grupy (-mx-4).
 */
export function SwipeRow({
  toRight,
  toLeft,
  onSwipeStart,
  className = "",
  children,
}: {
  toRight?: SwipeAction;
  toLeft?: SwipeAction;
  /** np. przerwanie długiego przytrzymania przycisku, od którego zaczął się gest */
  onSwipeStart?: () => void;
  /** klasy całego wiersza, np. linia pod spodem (nie przesuwa się z treścią) */
  className?: string;
  children: ReactNode;
}) {
  const fg = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; mode: "pending" | "swipe" | "ignore" } | null>(null);
  const armedRef = useRef(false);
  const swiped = useRef(false);
  const [dir, setDir] = useState<-1 | 0 | 1>(0);
  const [armed, setArmed] = useState(false);

  function place(offset: number, animate: boolean) {
    const el = fg.current;
    if (!el) return;
    el.style.transition = animate ? "transform 200ms ease-out" : "none";
    el.style.transform = offset ? `translateX(${offset}px)` : "";
  }

  function arm(on: boolean) {
    if (armedRef.current === on) return;
    armedRef.current = on;
    setArmed(on);
    if (on) haptic();
  }

  function down(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    swiped.current = false;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, mode: "pending" };
  }

  function move(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || d.mode === "ignore") return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.mode === "pending") {
      if (Math.abs(dx) < DECIDE && Math.abs(dy) < DECIDE) return;
      // W pionie albo w stronę bez akcji: nie ruszamy wiersza
      if (Math.abs(dy) >= Math.abs(dx) || !(dx > 0 ? toRight : toLeft)) {
        d.mode = "ignore";
        return;
      }
      d.mode = "swipe";
      onSwipeStart?.();
      try {
        fg.current?.setPointerCapture(e.pointerId);
      } catch {
        // wskaźnik już zniknął
      }
    }
    const action = dx > 0 ? toRight : toLeft;
    const offset = action ? resist(dx) : 0;
    place(offset, false);
    setDir(offset > 0 ? 1 : offset < 0 ? -1 : 0);
    arm(Boolean(action) && Math.abs(dx) >= THRESHOLD);
  }

  function end(e: PointerEvent<HTMLDivElement>, run: boolean) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.mode !== "swipe") return;
    // Puszczenie palca po geście nie jest stuknięciem w przycisk pod nim
    swiped.current = true;
    window.setTimeout(() => (swiped.current = false), 400);
    const dx = e.clientX - d.x;
    const action = dx > 0 ? toRight : toLeft;
    place(0, true);
    arm(false);
    if (run && action && Math.abs(dx) >= THRESHOLD) action.run();
  }

  const shown = dir > 0 ? toRight : dir < 0 ? toLeft : undefined;

  return (
    <div
      className={`relative ${className}`}
      onClickCapture={(e) => {
        if (!swiped.current) return;
        swiped.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {shown && (
        <div
          aria-hidden="true"
          className={`absolute inset-y-0 -inset-x-4 flex items-center px-6 text-[15px] font-semibold ${dir > 0 ? "justify-start" : "justify-end"} ${
            shown.tone === "accent" ? "bg-accent text-accent-contrast" : "bg-control text-text"
          }`}
        >
          <span className={`transition-transform duration-150 ${armed ? "scale-110" : "scale-90 opacity-80"}`}>{shown.label}</span>
        </div>
      )}
      <div
        ref={fg}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={(e) => end(e, true)}
        onPointerCancel={(e) => end(e, false)}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && !drag.current) setDir(0);
        }}
        className="relative -mx-4 select-none bg-surface px-4 [touch-action:pan-y]"
      >
        {children}
      </div>
    </div>
  );
}
