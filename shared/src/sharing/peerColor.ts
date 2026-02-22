function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

/** Hash a string into a hue (0–359). */
export function peerHue(id: string): number {
  return djb2(id) % 360;
}

/** HSL(h, 95%, 50%) → hex. */
function hslHex(h: number): string {
  const s = 0.95,
    l = 0.5;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Generate a Vercel-style gradient pair from any string. */
export function peerGradient(id: string): [string, string] {
  const h = peerHue(id);
  return [hslHex(h), hslHex((h + 120) % 360)];
}
