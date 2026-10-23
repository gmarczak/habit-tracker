"use client";

import type { Supabase } from "@/lib/db/client";
import { deletePushSubscription, savePushSubscription } from "@/lib/data/mutations";

export type PushSupport = "supported" | "ios-needs-install" | "unsupported" | "denied";

export function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (isIos() && !isStandalone()) return "ios-needs-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return "supported";
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "supported") return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Prosi o zgodę, subskrybuje push i zapisuje subskrypcję tego urządzenia w bazie. */
export async function enablePush(supabase: Supabase): Promise<void> {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) throw new Error("Brak klucza powiadomień w konfiguracji aplikacji.");
  const support = pushSupport();
  if (support === "ios-needs-install") throw new Error("Na iPhonie dodaj najpierw aplikację do ekranu głównego (Udostępnij → Do ekranu początkowego).");
  if (support !== "supported") throw new Error("Ta przeglądarka nie obsługuje powiadomień albo są zablokowane w ustawieniach.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Bez zgody na powiadomienia przypomnienia nie dotrą.");

  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
  await savePushSubscription(supabase, sub.toJSON(), navigator.userAgent);
}

/** Wyłącza powiadomienia na tym urządzeniu. Subskrypcja w przeglądarce znika zawsze, także bez sieci. */
export async function disablePush(supabase: Supabase): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  try {
    await deletePushSubscription(supabase, sub.endpoint);
  } finally {
    // wiersz w bazie bez subskrypcji usunie przy następnej wysyłce funkcja przypomnień (410)
    await sub.unsubscribe().catch(() => false);
  }
}
