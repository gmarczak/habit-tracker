"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { btnPrimary, field, label, labelText } from "@/components/ui/styles";
import { supabaseBrowser } from "@/lib/db/client";

/*
 * Logowanie mailem: jeden mail zawiera link ORAZ kod.
 * Kod jest potrzebny w aplikacji dodanej do ekranu głównego na iPhonie: link z maila
 * otwiera się w Safari (osobna pamięć), więc sesja nie trafiłaby do aplikacji.
 * Wymaga szablonu „Magic Link” w Supabase z {{ .Token }} (patrz README → Logowanie).
 */

type Step =
  | { kind: "email" }
  | { kind: "sending" }
  | { kind: "code"; email: string }
  | { kind: "verifying"; email: string };

function errorMessage(error: { status?: number; message: string }): string {
  if (error.status === 429) return "Za dużo maili w krótkim czasie. Odczekaj kilka minut i spróbuj ponownie.";
  if (/expired|invalid/i.test(error.message)) return "Kod jest nieprawidłowy albo wygasł. Sprawdź cyfry lub wyślij nowy.";
  return error.message;
}

export function LoginForm({ linkError }: { linkError: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>({ kind: "email" });
  const [error, setError] = useState<string | null>(null);

  async function sendEmail(target: string) {
    setError(null);
    setStep({ kind: "sending" });
    const { error: sendError } = await supabaseBrowser().auth.signInWithOtp({
      email: target,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (sendError) {
      setError(errorMessage(sendError));
      setStep({ kind: "email" });
      return;
    }
    setCode("");
    setStep({ kind: "code", email: target });
  }

  async function onSubmitEmail(event: FormEvent) {
    event.preventDefault();
    await sendEmail(email.trim());
  }

  async function onSubmitCode(event: FormEvent) {
    event.preventDefault();
    if (step.kind !== "code") return;
    const token = code.replace(/\D/g, "");
    if (token.length < 6) {
      setError("Kod ma 6 cyfr.");
      return;
    }
    setError(null);
    setStep({ kind: "verifying", email: step.email });
    const { error: verifyError } = await supabaseBrowser().auth.verifyOtp({ email: step.email, token, type: "email" });
    if (verifyError) {
      setError(errorMessage(verifyError));
      setStep({ kind: "code", email: step.email });
      return;
    }
    router.replace("/");
    router.refresh();
  }

  const codeStep = step.kind === "code" || step.kind === "verifying";

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-6 py-10">
      <div className="flex flex-col gap-4">
        <Image src="/icon-192.png" alt="" width={56} height={56} className="rounded-2xl" priority />
        <h1 className="font-serif text-4xl font-semibold">Nawyki</h1>
        <p className="text-muted">Odhacz w 3 sekundy i zobacz postęp. Zaloguj się kodem z maila — bez hasła.</p>
      </div>

      {codeStep ? (
        <form onSubmit={onSubmitCode} className="flex flex-col gap-4">
          <p>
            Wysłaliśmy mail na <strong>{step.email}</strong>. Wpisz kod z wiadomości
            <span className="text-muted"> (na komputerze możesz też kliknąć link).</span>
          </p>
          <label className={label}>
            <span className={labelText}>Kod z maila</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={10}
              autoFocus
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setError(null);
              }}
              className={`${field} text-center text-2xl tracking-[0.4em]`}
            />
          </label>
          <button type="submit" disabled={step.kind === "verifying"} className={btnPrimary}>
            {step.kind === "verifying" ? "Sprawdzam…" : "Zaloguj"}
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-between text-sm font-semibold text-accent">
            <button type="button" onClick={() => void sendEmail(step.email)} disabled={step.kind === "verifying"}>
              Wyślij nowy kod
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep({ kind: "email" });
              }}
            >
              Inny adres
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={onSubmitEmail} className="flex flex-col gap-4">
          {linkError && <p className="rounded-2xl bg-surface px-4 py-3 text-sm">Link wygasł albo został już użyty. Zaloguj się kodem.</p>}
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
          <button type="submit" disabled={step.kind === "sending"} className={btnPrimary}>
            {step.kind === "sending" ? "Wysyłam…" : "Wyślij kod logowania"}
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="button"
            onClick={() => {
              if (!email.trim()) {
                setError("Najpierw wpisz adres e-mail.");
                return;
              }
              setError(null);
              setCode("");
              setStep({ kind: "code", email: email.trim() });
            }}
            className="self-start text-sm font-semibold text-accent"
          >
            Mam już kod
          </button>
        </form>
      )}
    </main>
  );
}
