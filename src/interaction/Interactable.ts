import type { NpcAgent } from '../ai/NpcAgent'
import type { AnimalAgent } from '../fauna/AnimalAgent'
import type { PreySpawner } from '../fauna/AnimalSpawner'
import type { ItemKind } from '../items/items'
import type { Settlement } from '../settlement/createSettlement'
import type { VillageFire } from '../settlement/VillageFire'
import type { DigProfile } from '../terrain/dig'
import type { TreeGrowthStage, TreeSizeClass } from '../world/treeLifecycle'

export type WorldItemRef = {
  id: string
  kind: ItemKind
  source: 'world' | 'spawner' | 'dropped'
}

/** A thin, per-frame adapter over the game's otherwise-incompatible world-object
 *  shapes (`NpcAgent`, `AnimalAgent`, bare landmark positions, `PreySpawner`,
 *  item pickups) so `pickInGaze` and the `[E]` interact handler can treat them
 *  uniformly. Built fresh each frame in `app/createApp.ts` — nothing here is
 *  persisted or owns lifetime. */
export type Interactable =
  | { kind: 'npc', position: { x: number, z: number }, promptLabel: string, npc: NpcAgent, settlement: Settlement }
  | { kind: 'animal', position: { x: number, z: number }, promptLabel: string, animal: AnimalAgent }
  /** Dead animal corpse — shovel bury prompt (only offered while shovel is held). */
  | { kind: 'corpse', position: { x: number, z: number }, promptLabel: string, animal: AnimalAgent }
  | { kind: 'well', position: { x: number, z: number }, promptLabel: string }
  | {
    kind: 'house'
    position: { x: number, z: number }
    promptLabel: string
    houseId: string
    modelUrl: string | null
    label: string
    examine: string
  }
  | {
    kind: 'tree'
    position: { x: number, z: number }
    promptLabel: string
    id: string
    stage: TreeGrowthStage
    sizeClass: TreeSizeClass
    canHarvest?: boolean
  }
  | { kind: 'campfire', position: { x: number, z: number }, promptLabel: string, fire: VillageFire }
  | { kind: 'spawner', position: { x: number, z: number }, promptLabel: string, spawner: PreySpawner }
  | { kind: 'item', position: { x: number, z: number }, promptLabel: string, item: WorldItemRef }
  /** Synthetic target for shovel ground work. Built from the aimed ground
   *  point (`app/interactables.ts`'s `buildDigTarget`). `profile` non-null →
   *  `[E]` dig; `canLevel` → `[R]` level. Both may be true at once (deeper
   *  dig over an existing hole). */
  | { kind: 'dig', position: { x: number, z: number }, promptLabel: string, profile: DigProfile | null, canLevel: boolean }
