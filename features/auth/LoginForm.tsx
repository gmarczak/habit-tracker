"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { btnPrimary, field, label, labelText } from "@/components/ui/styles";
import { supabaseBrowser } from "@/lib/db/client";

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; email: string } | { kind: "error"; message: string };

export function LoginForm({ linkError }: { linkError: boolean }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus({ kind: "sending" });
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setStatus(
      error
        ? { kind: "error", message: error.status === 429 ? "Za dużo prób. Odczekaj chwilę i spróbuj ponownie." : error.message }
        : { kind: "sent", email: email.trim() },
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-6 py-10">
      <div className="flex flex-col gap-4">
        <Image src="/icon-192.png" alt="" width={56} height={56} className="rounded-2xl" priority />
        <h1 className="font-serif text-4xl font-semibold">Nawyki</h1>
        <p className="text-muted">Odhacz w 3 sekundy i zobacz postęp. Zaloguj się linkiem z maila — bez hasła.</p>
      </div>

      {status.kind === "sent" ? (
        <div className="flex flex-col gap-3 rounded-3xl bg-surface p-5">
          <p className="font-serif text-xl font-semibold">Sprawdź skrzynkę</p>
          <p>
            Wysłaliśmy link na <strong>{status.email}</strong>. Otwórz go na tym urządzeniu i w tej samej przeglądarce.
          </p>
          <button type="button" onClick={() => setStatus({ kind: "idle" })} className="self-start text-sm font-semibold text-accent">
            Inny adres
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {linkError && <p className="rounded-2xl bg-surface px-4 py-3 text-sm">Link wygasł albo został już użyty. Wyślij nowy.</p>}
          <label className={label}>
            <span className={labelText}>Adres e-mail</span>
            <input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={field}
            />
          </label>
          <button type="submit" disabled={status.kind === "sending"} className={btnPrimary}>
            {status.kind === "sending" ? "Wysyłam…" : "Wyślij link logowania"}
          </button>
          {status.kind === "error" && <p className="text-sm text-danger">{status.message}</p>}
        </form>
      )}
    </main>
  );
}
