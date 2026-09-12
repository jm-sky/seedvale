import type { AnimalAgent } from '../fauna/AnimalAgent'

/**
 * @domain app
 * @role Bounded, read-only per-fauna-pass view of currently materialized
 *  household/player livestock — the composition seam feeding wild predator
 *  prey acquisition (plan fauna-026). Pure and stateless beyond the two
 *  caller-owned scratch buffers it's given: never ticks livestock, never
 *  mutates ownership/household state, never queries `LivestockRegistry`.
 *  Caller (`gameLoop.ts`) must assemble this after
 *  `SettlementsManager.update()` (so this frame's stream-in/out is already
 *  reflected) and before `Fauna.update()`.
 */

/** Bounded/local live household/player livestock candidates for wild
 *  predator prey acquisition (plan fauna-026 §1/§2/§8) — every live agent
 *  from currently loaded settlements' `.livestock` plus detached livestock,
 *  deduplicated by stable `animalId`. Membership in these caller-supplied
 *  collections is what makes an agent "livestock" here, not `AnimalDef.role`:
 *  3 of the 7 species `settlement/livestock.ts` spawns (`sheep`/`chicken`/
 *  `rooster`) keep `role:'prey'` for their own flee behaviour, only
 *  `horse`/`donkey`/`cow`/`dog` use `role:'livestock'` (`animalDefs.ts`) — so
 *  this only excludes a `role:'predator'` entry (impossible in practice,
 *  guarded defensively) rather than requiring a specific role. `into`/`seen`
 *  default to fresh buffers so tests can call this without caller-owned
 *  scratch state; production (`gameLoop.ts`) passes persistent buffers so
 *  this allocates nothing after warmup. Bounded by settlement streaming/
 *  materialization (`L_local`), never the global livestock population. */
export function buildHuntableLivestock(
  loadedSettlementLivestock: readonly { livestock: readonly AnimalAgent[] }[],
  detachedLivestock: readonly AnimalAgent[],
  into: AnimalAgent[] = [],
  seen: Set<string> = new Set(),
): readonly AnimalAgent[] {
  into.length = 0
  seen.clear()
  const addCandidate = (animal: AnimalAgent): void => {
    if (animal.def.role === 'predator') return
    if (animal.health.dead) return
    if (seen.has(animal.animalId)) return
    seen.add(animal.animalId)
    into.push(animal)
  }
  for (const settlement of loadedSettlementLivestock) {
    for (const animal of settlement.livestock) addCandidate(animal)
  }
  for (const animal of detachedLivestock) addCandidate(animal)
  return into
}
