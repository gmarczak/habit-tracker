import { describe, expect, it } from "vitest";
import { AUTO_RELOAD_WINDOW_MS, crashReport, isChunkLoadError, mayAutoReload, parseCrashReport } from "./crash";

const named = (name: string, message: string) => Object.assign(new Error(message), { name });

describe("awaria w przeglądarce", () => {
  it("rozpoznaje niedoczytany plik (Safari, Chrome, webpack/turbopack)", () => {
    expect(isChunkLoadError(named("ChunkLoadError", "Loading chunk 123 failed."))).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x/_next/static/chunks/a.js"))).toBe(true);
    expect(isChunkLoadError(new Error("Loading CSS chunk app/review failed"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'value')"))).toBe(false);
    expect(isChunkLoadError("Loading chunk 1 failed")).toBe(false); // nie-Error: nie zgadujemy
  });

  it("zgłoszenie przycina pola i oznacza rodzaj", () => {
    const e = named("ChunkLoadError", "x".repeat(5000));
    const r = crashReport(e, "/review?date=2026-10-25", "iPhone");
    expect(r.message.length).toBe(1000);
    expect(r.kind).toBe("chunk");
    expect(r.url).toBe("/review?date=2026-10-25");
    expect(crashReport("coś", "/", "ua")).toMatchObject({ message: "coś", stack: null, kind: "render" });
    expect(crashReport(Object.assign(new Error("serwer"), { digest: "123" }), "/", "ua").digest).toBe("123");
  });

  it("z sieci przyjmuje tylko znane pola", () => {
    expect(parseCrashReport(null)).toBeNull();
    expect(parseCrashReport({ stack: "s" })).toBeNull();
    expect(parseCrashReport({ message: "m", kind: "hack", extra: 1, url: 5 })).toEqual({
      message: "m", stack: null, digest: null, url: "", userAgent: "", kind: "render",
    });
  });

  it("odświeża sam najwyżej raz na minutę", () => {
    expect(mayAutoReload(null, 1000)).toBe(true);
    expect(mayAutoReload(1000, 1000 + AUTO_RELOAD_WINDOW_MS)).toBe(false);
    expect(mayAutoReload(1000, 1001 + AUTO_RELOAD_WINDOW_MS)).toBe(true);
  });
});
