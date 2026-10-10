/** Deterministic PRNG so every seed run produces the same demo data. */
export function createRandom(seed = 20261008) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min;
  const chance = (p: number) => next() < p;
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;

  const weighted = <T>(items: readonly T[], weight: (item: T) => number): T => {
    const total = items.reduce((s, i) => s + weight(i), 0);
    let r = next() * total;
    for (const item of items) {
      r -= weight(item);
      if (r <= 0) return item;
    }
    return items[items.length - 1]!;
  };

  /** Normal-ish noise around 1 (±spread). */
  const jitter = (spread: number) => 1 + (next() + next() + next() - 1.5) * (spread / 1.5);

  return { next, int, chance, pick, weighted, jitter };
}

export type Random = ReturnType<typeof createRandom>;

let counter = 0;
/** Collision-free ids for bulk inserts (Prisma's cuid default isn't available to createMany callers). */
export function seedId(prefix: string) {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36).padStart(6, "0")}`;
}
