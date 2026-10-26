"use client";

import "./globals.css";
import { CrashScreen } from "@/components/ui/CrashScreen";

/** Błąd w samym głównym układzie: własne <html> i <body>, bo ten ekran zastępuje app/layout.tsx. */
export default function GlobalError({ error }: { error: unknown; retry: () => void }) {
  return (
    <html lang="pl">
      <body>
        <title>Nawyki</title>
        <CrashScreen error={error} />
      </body>
    </html>
  );
}
