/**
 * Shared bounded-history primitives for hierarchical domain observability
 * (plan settlements-npcs-013) — a generic ring buffer + local monotonic
 * sequence counter reused by the NPC trace (plan 170, see `npcTrace.ts`) and
 * the new household/settlement history buffers (`householdHistory.ts`,
 * `settlementHistory.ts`), instead of three separate ring-buffer
 * implementations or a generic event bus/`DebugManager`.
 *
 * @domain settlements-npcs
 * @system domain-history
 * @role Generic bounded ring buffer + ordering/filter helpers reused by every per-domain history buffer.
 */

export type BoundedHistoryBuffer<T> = {
  /** Record one entry — O(1), no allocation beyond the entry object the
   *  caller already built. */
  record(entry: T): void
  /** Chronological (insertion-order) snapshot, capped at capacity. Returns a
   *  fresh array every call — the internal ring cannot be mutated through it. */
  history(): readonly T[]
}

export function createBoundedHistoryBuffer<T>(capacity: number): BoundedHistoryBuffer<T> {
  const slots: (T | undefined)[] = new Array(capacity)
  let writeIndex = 0
  let count = 0
  return {
    record(entry) {
      slots[writeIndex] = entry
      writeIndex = (writeIndex + 1) % capacity
      count = Math.min(capacity, count + 1)
    },
    history() {
      const out: T[] = []
      const start = count < capacity ? 0 : writeIndex
      for (let i = 0; i < count; i++) out.push(slots[(start + i) % capacity]!)
      return out
    },
  }
}

/** Per-buffer local monotonic counter — a deterministic secondary ordering
 *  key so two records sharing a `simTime` in the same buffer still sort
 *  consistently (plan settlements-npcs-013 §7), without a shared
 *  cross-domain allocator/event bus. Never reset, never reused. */
export type SequenceAllocator = { next: () => number }

export function createSequenceAllocator(): SequenceAllocator {
  let seq = 0
  return { next: () => seq++ }
}

/** Filters shared by `debug.household(id).history()` / `debug.settlement(id).history()`
 *  — the only ones with a demonstrated use in this plan's verification
 *  scenario (plan settlements-npcs-013 §10). Not a generic query language. */
export type HistoryFilter = {
  since?: number
  limit?: number
  types?: readonly string[]
}

/** Applies `since`/`types`/`limit` in that order — `limit` keeps the most
 *  recent entries (the tail of the oldest→newest array) after the other
 *  filters run. */
export function filterHistory<T extends { simTime: number, type: string }>(
  items: readonly T[],
  filter: HistoryFilter = {},
): readonly T[] {
  let out = items
  if (filter.since != null) {
    const since = filter.since
    out = out.filter((e) => e.simTime >= since)
  }
  if (filter.types && filter.types.length > 0) {
    const types = filter.types
    out = out.filter((e) => types.includes(e.type))
  }
  if (filter.limit != null && filter.limit < out.length) out = out.slice(out.length - filter.limit)
  return out
}
