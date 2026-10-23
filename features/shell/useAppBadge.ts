"use client";

import { useEffect, useMemo } from "react";
import type { Snapshot } from "@/lib/data/snapshot";
import type { LocalDate } from "@/lib/domain/dates";
import { badgeCount, buildDay } from "@/lib/domain/today";

/** Liczba niezrobionych na dziś na ikonie aplikacji (Badging API; iOS 16.4+ w PWA z ekranu początkowego). */
export function useAppBadge(snapshot: Snapshot | undefined, today: LocalDate | null) {
  const count = useMemo(
    () =>
      snapshot && today
        ? badgeCount(buildDay(snapshot.habits, snapshot.entries, snapshot.pauses, today, today, snapshot.settings.weekStart))
        : null,
    [snapshot, today],
  );

  useEffect(() => {
    if (count === null || !("setAppBadge" in navigator)) return;
    void (count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge()).catch(() => {});
  }, [count]);
}
