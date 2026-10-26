/* Service worker: powłoka offline + powiadomienia push. Bez zależności, żeby był przewidywalny. */
const VERSION = "v2-10"; // nowy numer = nowy plik = przeglądarka instaluje nowego workera

/*
 * Trzy cache:
 * - "shell": strony aplikacji, nadpisywane przy każdej wizycie (do pracy offline),
 * - "static": pliki z hashem w nazwie (/_next/static) — nie zmieniają się, więc aktualizacja workera ich nie kasuje
 *   (otwarta strona może jeszcze doczytać swoje pliki, których nowe wdrożenie już nie ma),
 * - assets-<wersja>: ikony, manifest i fonty bez hasha — odświeżane z każdą wersją.
 */
const SHELL_CACHE = "shell";
const STATIC_CACHE = "static";
const ASSET_CACHE = `assets-${VERSION}`;
const STATIC_MAX = 400;

/*
 * Przy instalacji tylko pliki bez sesji; strony zapisują się przy pierwszej wizycie (nawigacja niżej).
 * Wcześniej instalacja pobierała naraz 14 stron z ciasteczkami sesji. Safari wysłał je ze starym tokenem
 * odświeżania, Supabase uznał to za nadużycie („refresh_token_already_used”) i unieważnił sesję: wylogowanie.
 */
const PRECACHE = ["/manifest.webmanifest", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(ASSET_CACHE)
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

// Bez zalogowania strony aplikacji przekierowują do /login — takiej odpowiedzi nie zapisujemy pod ich adresem
// (Safari odrzuca przekierowaną odpowiedź na nawigację z service workera).
const usable = (res) => (res && !res.redirected ? res : undefined);

/** Usuwa najstarsze wpisy, gdy cache przekroczy limit (klucze są w kolejności dodania). */
async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((k) => cache.delete(k)));
}

/**
 * Sprzątanie po poprzedniej wersji. Stare strony („shell-v…”) przechodzą do „shell”, więc offline działa od razu.
 * Stary cache plików („static-v…”) zostaje na jedną wersję (otwarta strona może z niego jeszcze czytać)
 * i znika przy następnej aktualizacji.
 */
async function migrate() {
  const shell = await caches.open(SHELL_CACHE);
  for (const name of await caches.keys()) {
    if (name === SHELL_CACHE || name === STATIC_CACHE || name === ASSET_CACHE) continue;
    if (name.startsWith("shell-")) {
      const old = await caches.open(name);
      for (const request of await old.keys()) {
        if (await shell.match(request)) continue;
        const res = await old.match(request);
        if (res) await shell.put(request, res);
      }
      await caches.delete(name);
      continue;
    }
    if (name.startsWith("static-")) {
      const old = await caches.open(name);
      if (!(await old.match("/__retired"))) {
        await old.put("/__retired", new Response(""));
        continue;
      }
    }
    await caches.delete(name);
  }
  await trim(STATIC_CACHE, STATIC_MAX);
}

self.addEventListener("activate", (event) => {
  // Sprzątanie nie może zablokować przejęcia strony: błąd cache = najwyżej zostaje stary wpis
  event.waitUntil(migrate().catch(() => {}).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase i inne: zawsze sieć (dane są w IndexedDB)
  if (url.pathname.startsWith("/auth/")) return;

  // Pliki z hashem w nazwie (/_next/static) oraz ikony, manifest i fonty: najpierw cache
  const hashed = url.pathname.startsWith("/_next/static/");
  if (hashed || /\.(?:woff2?|png|svg|ico|webmanifest)$/.test(url.pathname)) {
    const name = hashed ? STATIC_CACHE : ASSET_CACHE;
    // Plik z hashem bywa jeszcze w cache poprzedniej wersji; ikony i manifest tylko z bieżącej (mogły się zmienić)
    const cached = hashed ? caches.match(request) : caches.open(name).then((c) => c.match(request));
    event.respondWith(
      cached.then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(name).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Nawigacja: sieć, a bez sieci (albo gdy sieć milczy dłużej niż 4 s) ostatnia zapisana wersja strony
  if (request.mode === "navigate") {
    const network = fetch(request).then((res) => {
      if (res.ok && !res.redirected) {
        const copy = res.clone();
        event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.put(url.pathname, copy)));
      }
      return res;
    });
    event.waitUntil(network.catch(() => {}));
    event.respondWith(
      new Promise((resolve) => {
        let settled = false;
        const finish = (res) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(res);
        };
        // Słaby zasięg albo Wi-Fi bez internetu: zapytanie wisi — pokaż zapisaną stronę, dane i tak są w IndexedDB
        const timer = setTimeout(() => {
          caches.match(url.pathname).then((hit) => usable(hit) && finish(hit));
        }, 4000);
        network
          .then(finish)
          .catch(async () => finish(usable(await caches.match(url.pathname)) || usable(await caches.match("/")) || Response.error()));
      }),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "Nawyki", body: "Sprawdź dzisiejsze nawyki.", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  // Liczba niezrobionych na ikonie aplikacji (iOS 16.4+ w zainstalowanej PWA)
  const badge =
    typeof data.badge === "number" && "setAppBadge" in self.navigator
      ? (data.badge > 0 ? self.navigator.setAppBadge(data.badge) : self.navigator.clearAppBadge()).catch(() => {})
      : Promise.resolve();
  event.waitUntil(
    Promise.all([
      badge,
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: "/icon-192.png",
        badge: "/badge-96.png",
        tag: data.tag || "habits",
        data: { url: data.url || "/" },
      }),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
