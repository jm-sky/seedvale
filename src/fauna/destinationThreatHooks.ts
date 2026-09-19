import type { HumanDangerConfig } from './animalDefs'
import type { Fauna } from './createFauna'
import { resolveHumanDangerProjection } from './animalHumanDanger'

/**
 * Bounded destination-threat snapshot (plan npc-057 §2/§3) — same narrow-
 * view shape as `SettlementHuntingHooks`: a bounded read-only query over the
 * live `Fauna` population, returning plain primitive data, never
 * `AnimalAgent`/`CombatTargetHandle` itself. Answers "what latent animal
 * danger exists near this destination right now", not "defend or flee"
 * (that remains `npcAnimalThreat.ts`'s job) and never makes an NPC decision
 * itself — only `ai/npcDestinationThreat.ts` scores accept/reject.
 */
export type DestinationAnimalThreat = {
  animalId: string
  x: number
  z: number
  humanDanger: number
}

export type SettlementDestinationThreatHooks = {
  /** One bounded scan of currently-loaded live fauna within `radius` of
   *  `(centerX, centerZ)` — intended to be called *once* per destination-
   *  selection decision (covering every candidate destination's threat
   *  neighborhood in one query), never once per candidate and never on a
   *  per-frame cadence (plan npc-057 §3, a hard requirement). Excludes dead
   *  animals and any animal whose projected `humanDanger` resolves to `0`
   *  (harmless prey/livestock) — callers never need their own filtering. */
  queryThreats: (centerX: number, centerZ: number, radius: number) => readonly DestinationAnimalThreat[]
}

/** Pure filter/map step factored out of `createDestinationThreatHooks` for
 *  direct unit testing (same split as `huntingHooks.ts`'s
 *  `shouldSkipForPopulationProtection`) — no live `Fauna`/timers involved. */
export function collectDestinationThreats(
  agents: readonly {
    animalId: string
    isDead: () => boolean
    isFrenzied: () => boolean
    isRabid: () => boolean
    isThreateningHuman: () => boolean
    dangerSignificance: number
    def: { humanDanger?: HumanDangerConfig }
    mesh: { position: { x: number, z: number } }
  }[],
  centerX: number,
  centerZ: number,
  radius: number,
): DestinationAnimalThreat[] {
  const threats: DestinationAnimalThreat[] = []
  for (const a of agents) {
    if (a.isDead()) continue
    const humanDanger = resolveHumanDangerProjection({
      humanDanger: a.def.humanDanger,
      aggressive: a.isFrenzied() || a.isRabid() || a.isThreateningHuman(),
      dangerSignificance: a.dangerSignificance,
    })
    if (humanDanger <= 0) continue
    const { x, z } = a.mesh.position
    if (Math.hypot(x - centerX, z - centerZ) > radius) continue
    threats.push({ animalId: a.animalId, x, z, humanDanger })
  }
  return threats
}

/** Binds destination-threat queries to a live `Fauna` (plan npc-057 §2) —
 *  `getFauna` is the same late-bound accessor `createHuntingHooks` uses:
 *  `Fauna` is only constructed after `SettlementsManager`/every `NpcAgent`
 *  in `app/worldBundle.ts`, so this can share the exact same accessor. */
export function createDestinationThreatHooks(getFauna: () => Fauna | null): SettlementDestinationThreatHooks {
  return {
    queryThreats(centerX, centerZ, radius) {
      const fauna = getFauna()
      if (!fauna) return []
      return collectDestinationThreats(fauna.getAgents(), centerX, centerZ, radius)
    },
  }
}
