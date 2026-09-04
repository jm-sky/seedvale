import type { VillageSize } from './families'
import type { HouseLight, VillageTorch } from './props'
import type { VillageFire } from './VillageFire'
import { createSeededRandom } from '../world/parseSeed'

/**
 * Settlement night cycle (createSettlement refactor review, E3) — the
 * settlement fire's dusk-ignition roll, village torch dusk/dawn toggling and
 * house-light intensity. Extracted out of `createSettlement.ts`'s
 * `setDayNight`; the three effects share one threshold crossing, so they
 * belong together rather than being split between `houseLighting.ts` and
 * `VillageFire.ts`.
 *
 * @domain settlements
 * @system settlement-night-cycle
 * @role Owns the dusk/dawn threshold crossing that drives fire autolight, torches and house-light intensity.
 */

/** `setDayNight`'s `t` (0 day .. 1 full night) above this triggers the
 *  settlement fire's dusk-ignition roll and the torch dusk/dawn toggle. NPC
 *  sleep timing moved to `NpcAgent`'s own `schedule` (v2 stage 2,
 *  `docs/plans/archive/2026-08-07--020...`) — this threshold is now
 *  fire/torch/house-light-only. */
export const NIGHT_FIRE_THRESHOLD = 0.6
/** Per-size chance the settlement fire is already lit at dusk (villagers keep
 *  it going — no player branch). OUTPOST/SM have no campfire prop. */
export const NIGHT_FIRE_IGNITE_CHANCE: Record<VillageSize, number> = {
  OUTPOST: 0,
  SM: 0,
  MD: 0.75,
  LG: 0.85,
  XL: 1,
}

/** Deterministic per-night ignition roll — same night (even across a
 *  stream-out/stream-in) always resolves the same way; a later night gets an
 *  independent roll via `nightIndex`. */
export function shouldAutoLightNightFire(
  settlementSeed: number,
  nightIndex: number,
  size: VillageSize,
): boolean {
  const random = createSeededRandom(
    settlementSeed ^ Math.imul(nightIndex, 0x9e3779b1) ^ 0x4e494748,
  )
  return random() < (NIGHT_FIRE_IGNITE_CHANCE[size] ?? 0.75)
}

export type SettlementNightCycle = { apply: (t: number) => void }

export function createSettlementNightCycle(params: {
  settlementSeed: number
  size: VillageSize
  fire: VillageFire | undefined
  villageTorches: readonly VillageTorch[]
  houseLights: readonly HouseLight[]
}): SettlementNightCycle {
  const { settlementSeed, size, fire, villageTorches, houseLights } = params
  let nightFactor = 0
  /** Bumped each time `nightFactor` crosses `NIGHT_FIRE_THRESHOLD` upward —
   *  feeds `shouldAutoLightNightFire`'s seed so the same night (even across a
   *  stream-out/stream-in of this settlement) always resolves the same way,
   *  while a later night gets an independent roll. */
  let nightIndex = 0

  return {
    apply(t) {
      if (fire && !fire.isLit() && nightFactor <= NIGHT_FIRE_THRESHOLD && t > NIGHT_FIRE_THRESHOLD) {
        nightIndex++
        if (shouldAutoLightNightFire(settlementSeed, nightIndex, size)) fire.light('night')
      }
      // Village torches: always light at dusk, extinguish at dawn (plan 085).
      if (nightFactor <= NIGHT_FIRE_THRESHOLD && t > NIGHT_FIRE_THRESHOLD) {
        for (const torch of villageTorches) torch.setLit(true)
      } else if (nightFactor > NIGHT_FIRE_THRESHOLD && t <= NIGHT_FIRE_THRESHOLD) {
        for (const torch of villageTorches) torch.setLit(false)
      }
      nightFactor = t
      for (const light of houseLights) light.setNightIntensity(t)
    },
  }
}
