"use client";

/** Zamiast ekranu bez danych: „Ładuję…” w trakcie, a gdy pobranie się nie udało — komunikat i ponowna próba. */
export function DataFallback({ pending, onRetry, inline = false }: { pending: boolean; onRetry: () => void; inline?: boolean }) {
  const Wrapper = inline ? "div" : "main";
  if (pending) return <Wrapper className={inline ? "text-muted" : "px-4 pt-6 text-muted"}>Ładuję…</Wrapper>;
  return (
    <Wrapper className={`flex flex-col gap-3 ${inline ? "" : "px-4 pt-6"}`}>
      <p>Nie udało się wczytać danych. Sprawdź połączenie.</p>
      <button type="button" onClick={onRetry} className="h-12 self-start rounded-full bg-accent px-6 font-semibold text-accent-contrast">
        Spróbuj ponownie
      </button>
    </Wrapper>
  );
}
