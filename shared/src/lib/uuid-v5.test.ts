/**
 * uuidV5 — RFC 4122 name-based ids. Pinned against the official test
 * vectors so determinism (the whole point: concurrent seeds must agree)
 * can never silently drift.
 */
import { describe, it, expect } from "vitest";
import { DEFAULTS_NAMESPACE, uuidV5 } from "./uuid-v5.js";

const NAMESPACE_DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const NAMESPACE_URL = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
const NAMESPACE_OID = "6ba7b812-9dad-11d1-80b4-00c04fd430c8";
const NAMESPACE_X500 = "6ba7b814-9dad-11d1-80b4-00c04fd430c8";

describe("uuidV5", () => {
  it("matches the reference implementation (python uuid5)", () => {
    expect(uuidV5("example.com", NAMESPACE_DNS)).toBe("cfbff0d1-9375-5685-968c-48ce8b15ae17");
    expect(uuidV5("http://example.com", NAMESPACE_URL)).toBe(
      "8c9ddcb0-8084-5a7f-a988-1095ab18b5df",
    );
    expect(uuidV5("2.999", NAMESPACE_OID)).toBe("b4bacae6-a586-58cd-81cf-dbf7ef515c9e");
    expect(uuidV5("c=at", NAMESPACE_X500)).toBe("aec9fb14-1ae2-57f7-9565-30e768327265");
  });

  it("is deterministic across calls", () => {
    expect(uuidV5("lists", DEFAULTS_NAMESPACE)).toBe(uuidV5("lists", DEFAULTS_NAMESPACE));
  });

  it("produces hyphenated v5 UUIDs the sync server accepts", () => {
    for (const name of ["lists", "notebooks", "boards", "columns", "x".repeat(300)]) {
      const id = uuidV5(name, DEFAULTS_NAMESPACE);
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it("differs per name and per namespace", () => {
    expect(uuidV5("a", NAMESPACE_DNS)).not.toBe(uuidV5("b", NAMESPACE_DNS));
    expect(uuidV5("a", NAMESPACE_DNS)).not.toBe(uuidV5("a", NAMESPACE_URL));
  });
});
