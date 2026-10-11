"use client";

import { useState, type FormEvent } from "react";
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
    setStatus(error ? { kind: "error", message: error.message } : { kind: "sent", email: email.trim() });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="font-serif text-4xl font-semibold">Nawyki</h1>
      {status.kind === "sent" ? (
        <p className="text-lg">
          Wysłaliśmy link na <strong>{status.email}</strong>. Otwórz go na tym urządzeniu, żeby się zalogować.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          {linkError && <p className="text-danger">Link wygasł albo został już użyty. Wyślij nowy.</p>}
          <label htmlFor="email" className="font-medium">
            Adres e-mail
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 rounded-xl border border-border bg-surface px-4 text-base"
          />
          <button
            type="submit"
            disabled={status.kind === "sending"}
            className="h-12 rounded-xl bg-accent font-semibold text-accent-contrast disabled:opacity-60"
          >
            {status.kind === "sending" ? "Wysyłam…" : "Wyślij link logowania"}
          </button>
          {status.kind === "error" && <p className="text-danger">{status.message}</p>}
        </form>
      )}
    </main>
  );
}
