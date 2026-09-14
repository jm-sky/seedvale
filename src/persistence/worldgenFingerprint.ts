/**
 * @domain persistence
 * @system worldgen-cache
 * @role The one stable-fingerprint primitive every worldgen-cache namespace
 *  owner uses to turn its deterministic inputs into the `fingerprint` field
 *  of a `CacheRecord` (plan world-015 §8). Namespace owners decide *what*
 *  goes into the fingerprint; this module only decides how a value becomes a
 *  stable string.
 * @integration A fingerprint mismatch is always a plain cache miss, never a
 *  migration and never a correctness problem — so this hash may be cheap and
 *  non-cryptographic.
 */

/** Key-order-independent JSON for fingerprinting — `{a:1,b:2}` and
 *  `{b:2,a:1}` must not produce two different cache identities. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(',')}}`
}

/** Non-cryptographic 64-bit-ish string hash (two 32-bit lanes) — collisions
 *  only degrade a disposable cache (an astronomically unlikely false-positive
 *  match would reuse stale-looking-valid derived data; a mismatch is a
 *  harmless miss), never correctness of gameplay itself. */
export function hashString(s: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36)
}

/** `hashString(stableStringify(value))` — the shape every namespace owner
 *  actually wants. */
export function worldgenFingerprint(value: unknown): string {
  return hashString(stableStringify(value))
}
