"use client";

import { CrashScreen } from "@/components/ui/CrashScreen";

/** Błąd w aplikacji, także w układzie z dolną nawigacją: ekran po polsku zamiast białej strony Next.js. */
export default function AppError({ error }: { error: unknown; retry: () => void }) {
  return <CrashScreen error={error} />;
}
