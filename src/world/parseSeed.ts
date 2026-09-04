/** Mulberry32 — deterministic [0,1) from a 32-bit seed. */
export function createSeededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Parse `?seed=` from the URL; default when missing/invalid. */
export function parseSeedFromUrl(
  search = window.location.search,
  fallback = 42,
): number {
  const raw = new URLSearchParams(search).get('seed')
  if (raw == null || raw === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? Math.floor(n) : fallback
}

/** Fresh 32-bit seed for "New Game" — distinct from the deterministic URL fallback. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff)
}

/** Whether `?seed=` was actually present and parseable, as opposed to
 *  `parseSeedFromUrl()`'s `fallback` being used because the param is missing
 *  or malformed (plan persistence-004 §9) — the two must not be confused:
 *  only an explicit URL seed should ever override a fresh New Game's own
 *  `randomSeed()`. */
export function hasExplicitUrlSeed(search = window.location.search): boolean {
  const raw = new URLSearchParams(search).get('seed')
  if (raw == null || raw === '') return false
  return Number.isFinite(Number(raw))
}

/** Set or replace a query param without reload. */
export function setUrlSearchParam(key: string, value: string): void {
  const url = new URL(window.location.href)
  url.searchParams.set(key, value)
  window.history.replaceState({}, '', url)
}

/** Keep `?seed=` in the address bar without reload. */
export function syncSeedInUrl(seed: number): void {
  setUrlSearchParam('seed', String(seed))
}
