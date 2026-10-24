import { describe, expect, it } from "vitest";
import { bearerToken, fail } from "./shortcut";

const req = (authorization?: string) => new Request("https://x/api/log", { headers: authorization ? { authorization } : {} });

describe("klucz ze Skrótu", () => {
  it("Bearer albo sam klucz", () => {
    expect(bearerToken(req("Bearer ht_abc"))).toBe("ht_abc");
    expect(bearerToken(req("bearer   ht_abc "))).toBe("ht_abc");
    expect(bearerToken(req("ht_abc"))).toBe("ht_abc");
    expect(bearerToken(req("Basic xyz"))).toBeNull();
    expect(bearerToken(req())).toBeNull();
  });

  it("błąd ma pole message dla Siri", async () => {
    const res = fail(400, "Zła wartość");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Zła wartość", message: "Zła wartość" });
  });
});
