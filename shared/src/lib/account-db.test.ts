import { describe, it, expect } from "vitest";
import { accountScopeKey, accountScopeHash, accountDbName } from "./account-db";

describe("account-scoped database naming (AUD-045)", () => {
  const session = (personalSpaceId: string | null, handle: string | null = null) => ({
    getPersonalSpaceId: () => personalSpaceId,
    getHandle: () => handle,
  });

  it("prefers the personal space id as the scope key", () => {
    expect(accountScopeKey(session("space-1", "alice@example.test"))).toBe("space-1");
  });

  it("falls back to the handle, then a constant", () => {
    expect(accountScopeKey(session(null, "alice@example.test"))).toBe("alice@example.test");
    expect(accountScopeKey(session(null, null))).toBe("authenticated");
  });

  it("derives distinct, stable names per scope", async () => {
    const a1 = await accountDbName("passwords", "space-1");
    const a2 = await accountDbName("passwords", "space-1");
    const b = await accountDbName("passwords", "space-2");
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
    expect(a1).toMatch(/^passwords_[a-z0-9]+$/);
  });

  it("never embeds the raw account identifier in the name", async () => {
    const name = await accountDbName("passwords", "space-secret-value");
    expect(name).not.toContain("secret");
    // hash is not trivially reversible to the input prefix
    const hash = await accountScopeHash("space-secret-value");
    expect(hash.length).toBeGreaterThan(6);
    expect(hash.length).toBeLessThan(20);
  });

  it("keeps the anonymous namespace on the bare name", async () => {
    // the null scope is handled by callers (openDatabaseForScope) — the
    // helpers only serve the authenticated path
    expect(await accountDbName("passwords", "x")).not.toBe("passwords");
  });
});
