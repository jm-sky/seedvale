import type { NeedId, NpcPressure } from '../ai/Needs'
import type { ActionId, Phase } from '../ai/NpcAgent'

/**
 * Bounded per-NPC trace ring buffer (plan 170 — NPC simulation inspector and
 * trace). Structured data only, recorded at authoritative transition points
 * in `NpcAgent` — never formatted strings, never one entry per `update()`
 * tick. Format only at the UI/console boundary.
 */
export type NpcTraceEvent =
  /** `pressures` (plan ai-001) — the full candidate list arbitration ran
   *  over for this decision, not just the winner; plain-data copy. */
  | { simTime: number; type: 'need.selected'; need: NeedId; pressures: readonly NpcPressure[] }
  | { simTime: number; type: 'action.planned'; action: ActionId; queueId: string | null }
  | { simTime: number; type: 'action.completed'; action: ActionId }
  /** `reason: 'invalid'` — `goTo` lost its `pendingAction` (defensive safety
   *  net, should not happen in practice). `'interrupt'` — a genuinely urgent
   *  vigor/need interrupt cancelled an in-flight action (`tickCriticalInterrupt`)
   *  or a debug re-evaluate request. `'abandon'` — the movement watchdog gave
   *  up after repath+escape both failed. */
  | { simTime: number; type: 'action.failed'; action: ActionId | null; reason: 'abandon' | 'interrupt' | 'invalid' }
  | { simTime: number; type: 'phase.changed'; from: Phase; to: Phase }
  | { simTime: number; type: 'queue.joined'; queueId: string }
  | { simTime: number; type: 'queue.left'; queueId: string }
  | { simTime: number; type: 'queue.served'; queueId: string }
  | { simTime: number; type: 'movement.rescue'; stage: 'abandon' | 'escape' | 'repath' }
  /** Combat lifecycle (plan 177) — `beginCombat()`/`endCombat()`/a landed
   *  hit/death, never per-frame combat-phase ticking. */
  | { simTime: number; type: 'combat.started'; targetId: string }
  | { simTime: number; type: 'combat.ended'; outcome: 'cancelled' | 'complete' | 'failed' }
  | { simTime: number; type: 'combat.hit'; targetId: string }
  | { simTime: number; type: 'combat.died' }
  | { simTime: number; type: 'debug.freeze' }
  | { simTime: number; type: 'debug.unfreeze' }
  | { simTime: number; type: 'debug.reevaluate' }

export type NpcTraceEventType = NpcTraceEvent['type']

export type NpcTraceBuffer = {
  /** Record one semantic event — O(1), no allocation beyond the event object
   *  the caller already built. */
  record(event: NpcTraceEvent): void
  /** Chronological (oldest → newest) snapshot, capped at capacity. Returns a
   *  fresh array every call — the internal ring cannot be mutated through it. */
  history(): readonly NpcTraceEvent[]
}

/** Roughly a "handful of decision cycles" of history per NPC (plan 170
 *  scope: ~100-200 semantic events), never every simulation tick. */
export const NPC_TRACE_CAPACITY = 150

export function createNpcTraceBuffer(capacity = NPC_TRACE_CAPACITY): NpcTraceBuffer {
  const slots: (NpcTraceEvent | undefined)[] = new Array(capacity)
  let writeIndex = 0
  let count = 0
  return {
    record(event) {
      slots[writeIndex] = event
      writeIndex = (writeIndex + 1) % capacity
      count = Math.min(capacity, count + 1)
    },
    history() {
      const out: NpcTraceEvent[] = []
      const start = count < capacity ? 0 : writeIndex
      for (let i = 0; i < count; i++) out.push(slots[(start + i) % capacity]!)
      return out
    },
  }
}
