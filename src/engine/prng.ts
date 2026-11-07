/** Deterministic PRNG utilities (mulberry32 + string hashing). */

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 32-bit FNV-1a with a murmur3 finaliser for good avalanche. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Derive an independent sub-seed from a root seed and any labels. */
export function deriveSeed(root: number, ...parts: (string | number)[]): number {
  return hashString(`${root >>> 0}|${parts.join('|')}`);
}

export function rngFor(root: number, ...parts: (string | number)[]): Rng {
  return mulberry32(deriveSeed(root, ...parts));
}

/** A fresh, unpredictable 32-bit run seed (crypto when available). */
export function randomRunSeed(): number {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0];
  return (Math.random() * 2 ** 32) >>> 0;
}

/** Fixed seed for the Daily Challenge, shared by every player on that date. */
export function dailySeed(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Daily seed expects YYYY-MM-DD, got "${date}"`);
  return hashString(`hoopdraft-daily-${date}`);
}

export function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)];
}
