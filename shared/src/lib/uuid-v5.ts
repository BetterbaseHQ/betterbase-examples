/**
 * Deterministic UUID v5 (RFC 4122, SHA-1 name-based).
 *
 * The sync server requires record ids to be hyphenated UUIDs, and
 * default-record seeding needs the SAME id on every device so concurrent
 * seeds collapse via CRDT merge instead of duplicating. v5 gives us both:
 * a stable, namespaced UUID with no coordination.
 *
 * Synchronous by design — `defaultRecordId` is called from module scope.
 */

/** Namespace for betterbase default records (fixed, arbitrary UUID). */
export const DEFAULTS_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

// -- SHA-1 (compact, sync) --------------------------------------------------

function sha1(bytes: Uint8Array): Uint8Array {
  const ml = bytes.length;
  // Pad to 56 mod 64 (then 8 length bytes) per the SHA-1 spec
  const withOne = ml + 1;
  const pad = (56 - (withOne % 64) + 64) % 64;
  const total = withOne + pad + 8;
  const padded = new Uint8Array(total);
  padded.set(bytes);
  padded[ml] = 0x80;
  const bitLen = ml * 8;
  const dv = new DataView(padded.buffer);
  dv.setUint32(total - 4, bitLen >>> 0);
  dv.setUint32(total - 8, Math.floor(bitLen / 2 ** 32));

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const w = new Uint32Array(80);
  for (let offset = 0; offset < total; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(offset + i * 4);
    for (let i = 16; i < 80; i++) {
      const n = w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!;
      w[i] = (n << 1) | (n >>> 31);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]!) >>> 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = t;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const out = new Uint8Array(20);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, h0);
  odv.setUint32(4, h1);
  odv.setUint32(8, h2);
  odv.setUint32(12, h3);
  odv.setUint32(16, h4);
  return out;
}

// -- v5 layout ---------------------------------------------------------------

function hexToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Deterministic UUID v5 for `name` under `namespace` (both stable strings). */
export function uuidV5(name: string, namespace: string): string {
  const nsBytes = hexToBytes(namespace);
  const nameBytes = new TextEncoder().encode(name);
  const input = new Uint8Array(nsBytes.length + nameBytes.length);
  input.set(nsBytes);
  input.set(nameBytes, nsBytes.length);

  const hash = sha1(input);
  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50; // version 5
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80; // RFC variant
  return bytesToUuid(hash.slice(0, 16));
}
