"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

type Props = { open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode };

/** Natywny <dialog>: pułapka fokusu, Esc i tło za darmo. Na telefonie wyjeżdża od dołu. */
export function Modal({ open, onClose, title, subtitle, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="mb-0 mt-auto max-h-[94dvh] w-full max-w-none rounded-t-[14px] border-0 bg-bg p-0 text-text shadow-2xl backdrop:bg-black/40 sm:m-auto sm:w-[min(32rem,calc(100%-2rem))] sm:rounded-[14px]"
    >
      {open && (
        <div className="flex flex-col gap-5 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
          <span aria-hidden="true" className="mx-auto h-[5px] w-9 rounded-full bg-control sm:hidden" />
          <div className="flex items-start justify-between gap-4 px-1">
            <div>
              <h2 id={titleId} className="font-serif text-2xl font-bold">
                {title}
              </h2>
              {subtitle && <p className="mt-0.5 text-sm text-muted first-letter:uppercase">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Zamknij" className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-fill text-muted">
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </span>
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
