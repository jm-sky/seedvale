import type { Role } from '../ai/characters'
import type { SettlementLandmarks } from './props'
import type { Vector3 } from 'three'

/**
 * v1 of the Place system (`docs/plans/archive/2026-08-07--020--npc-2-daily-routine-and-place.md`)
 * formalized `home` (`createSettlement.ts`) as a `Place` instead of a bare
 * `Vector3` — purely organizational, no behavior change.
 *
 * v2 stage 1 (2026-08-09 decisions) added `workplace`/`food`/`social` as
 * types and `workplaceFor()` below, computing a per-role `Place` from
 * existing `SettlementLandmarks`. `NpcAgent`'s generic `goTo`/`execute`
 * phases send an idle NPC to `workplace` when the effective schedule says
 * `work` — see `NpcAgent.ts`'s `beginIdle`. Scheduled `eat` reuses the
 * garden; `home`/`wake` stay near the home Place. `social` has no producer
 * yet (plan 060 falls back to home).
 */
export type PlaceType = 'home' | 'workplace' | 'food' | 'social'

export type Place = {
  /** Stable id, namespaced by settlement (e.g. `0_0:home:2`) — same spirit as
   *  `SettlementDef.id`/interactable ids elsewhere in `settlement/`. */
  id: string
  type: PlaceType
  position: Vector3
}

/** A home `Place.id` for the `index`-th house in `settlementId` (`homes[i]`/
 *  `households[i]` share this same index — see `createSettlement.ts`).
 *  Centralized so `livestock.ts`'s `ownerHouseId` (plan 093 Etap G) can't
 *  drift from the `Place`/`Household` id format. */
export function homePlaceId(settlementId: string, index: number): string {
  return `${settlementId}:home:${index}`
}

/**
 * Per-role workplace — hybrid per the 2026-08-09 decision: roles that
 * already have a matching communal landmark reuse it as-is (no new world
 * content); only `trader` gets a dedicated new prop (`landmarks.market`,
 * see `props.ts`'s `buildSettlementProps`).
 *
 * - `woodcutter` → one of `landmarks.trees` (round-robin via `treeIndex`,
 *   same index NPC already cycles through for its `wood` need). Successful
 *   chop → deposit commits wood into settlement economy stock (plan 071).
 * - `farmer` → `landmarks.garden`.
 * - `trader` → `landmarks.market`.
 * - `guard` → `landmarks.well` (central point, easiest to "patrol" from).
 * - `miner` → `landmarks.stockpile` (existing shared storage point — no ore-
 *   deposit query API exists yet, see `naturalResources.ts`/plan 032).
 * - `fisher` → `landmarks.dock` when the settlement has one (near-coast
 *   only), else falls back to `landmarks.well` like `guard`.
 *
 * Returns `null` only when the role's landmark genuinely doesn't exist for
 * this settlement (e.g. a `woodcutter` in a settlement with no trees yet).
 */
export function workplaceFor(
  settlementId: string,
  role: Role,
  landmarks: SettlementLandmarks,
  treeIndex: number,
): Place | null {
  switch (role) {
    case 'farmer':
      return { id: `${settlementId}:workplace:garden`, type: 'workplace', position: landmarks.garden }
    case 'fisher':
      return landmarks.dock
        ? { id: `${settlementId}:workplace:dock`, type: 'workplace', position: landmarks.dock }
        : { id: `${settlementId}:workplace:well`, type: 'workplace', position: landmarks.well }
    case 'guard':
      return { id: `${settlementId}:workplace:well`, type: 'workplace', position: landmarks.well }
    case 'miner':
      return { id: `${settlementId}:workplace:stockpile`, type: 'workplace', position: landmarks.stockpile }
    case 'trader':
      return { id: `${settlementId}:workplace:market`, type: 'workplace', position: landmarks.market }
    case 'woodcutter': {
      if (landmarks.trees.length === 0) return null
      const index = treeIndex % landmarks.trees.length
      const tree = landmarks.trees[index]!
      return {
        id: `${settlementId}:workplace:tree:${tree.id}`,
        type: 'workplace',
        position: tree.position,
      }
    }
  }
}
