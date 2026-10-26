import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(fileURLToPath(new URL("../../public/sw.js", import.meta.url)), "utf8");
const ORIGIN = "https://nawyki.example";

type Listener = (event: Record<string, unknown>) => void;

/** Minimalny CacheStorage: nazwa → (adres → odpowiedź), klucze w kolejności dodania. */
function fakeCaches() {
  const store = new Map<string, Map<string, Response>>();
  const key = (r: Request | string) => new URL(typeof r === "string" ? r : r.url, ORIGIN).href;
  const cache = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name)!;
    return {
      match: async (r: Request | string) => m.get(key(r))?.clone(),
      put: async (r: Request | string, res: Response) => void m.set(key(r), res),
      delete: async (r: Request | string) => m.delete(key(r)),
      keys: async () => [...m.keys()].map((u) => new Request(u)),
      add: async (u: string) => void m.set(key(u), await sandboxFetch(u)),
    };
  };
  let sandboxFetch: (u: string) => Promise<Response> = async () => new Response("");
  return {
    store,
    setFetch: (f: typeof sandboxFetch) => (sandboxFetch = f),
    api: {
      open: async (name: string) => cache(name),
      keys: async () => [...store.keys()],
      delete: async (name: string) => store.delete(name),
      match: async (r: Request | string) => {
        for (const m of store.values()) {
          const hit = m.get(key(r));
          if (hit) return hit.clone();
        }
        return undefined;
      },
    },
  };
}

function loadWorker(caches: ReturnType<typeof fakeCaches>) {
  const listeners = new Map<string, Listener>();
  const fetched: string[] = [];
  const fetchImpl = async (input: Request | string) => {
    const url = new URL(typeof input === "string" ? input : input.url, ORIGIN);
    fetched.push(url.pathname);
    return new Response(`net:${url.pathname}`, { status: 200 });
  };
  caches.setFetch((u) => fetchImpl(u));
  let skipped = false;
  const self = {
    location: new URL(ORIGIN),
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
    skipWaiting: async () => void (skipped = true),
    clients: { claim: async () => {} },
    registration: {},
    navigator: {},
  };
  runInNewContext(SOURCE, { self, caches: caches.api, fetch: fetchImpl, Response, Request, URL, Promise, setTimeout, clearTimeout, console });

  async function dispatch(type: string, extra: Record<string, unknown> = {}) {
    const waits: Promise<unknown>[] = [];
    let responded: Promise<Response> | undefined;
    listeners.get(type)!({ ...extra, waitUntil: (p: Promise<unknown>) => waits.push(p), respondWith: (p: Promise<Response>) => (responded = p) });
    const response = responded ? await responded : undefined;
    await Promise.all(waits);
    return response;
  }
  return { dispatch, fetched, skipped: () => skipped };
}

describe("service worker", () => {
  it("instalacja nie pobiera stron aplikacji (sesja), tylko pliki bez logowania", async () => {
    const caches = fakeCaches();
    const sw = loadWorker(caches);
    await sw.dispatch("install");
    expect(sw.fetched.sort()).toEqual(["/icon-192.png", "/manifest.webmanifest"]);
    expect(sw.skipped()).toBe(true);
  });

  it("aktualizacja przenosi zapisane strony i zostawia stare pliki z hashem na jedną wersję", async () => {
    const caches = fakeCaches();
    await (await caches.api.open("shell-v2-9")).put("/", new Response("stara strona"));
    await (await caches.api.open("static-v2-9")).put("/_next/static/chunks/old.js", new Response("stary plik"));
    await (await caches.api.open("static-v2-9")).put("/manifest.webmanifest", new Response("stary manifest"));

    const sw = loadWorker(caches);
    await sw.dispatch("activate");
    expect([...caches.store.keys()].sort()).toEqual(["shell", "static", "static-v2-9"]);
    expect(await (await (await caches.api.open("shell")).match("/"))?.text()).toBe("stara strona");

    // Otwarta strona doczytuje swój stary plik: z cache, bez sieci (nowe wdrożenie już go nie ma)
    const chunk = await sw.dispatch("fetch", { request: new Request(`${ORIGIN}/_next/static/chunks/old.js`) });
    expect(await chunk?.text()).toBe("stary plik");
    expect(sw.fetched).not.toContain("/_next/static/chunks/old.js");

    // Manifest bez hasha: nie ze starego cache
    const manifest = await sw.dispatch("fetch", { request: new Request(`${ORIGIN}/manifest.webmanifest`) });
    expect(await manifest?.text()).toBe("net:/manifest.webmanifest");

    // Następna aktualizacja usuwa wycofany cache
    await sw.dispatch("activate");
    expect([...caches.store.keys()]).not.toContain("static-v2-9");
  });
});
