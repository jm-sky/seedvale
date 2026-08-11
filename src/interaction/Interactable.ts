import type { NpcAgent } from '../ai/NpcAgent'
import type { AnimalAgent } from '../fauna/AnimalAgent'
import type { PreySpawner } from '../fauna/AnimalSpawner'
import type { ItemKind } from '../items/items'
import type { Settlement } from '../settlement/createSettlement'
import type { VillageFire } from '../settlement/VillageFire'
import type { DigProfile } from '../terrain/dig'

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
  | { kind: 'well', position: { x: number, z: number }, promptLabel: string }
  | { kind: 'tree', position: { x: number, z: number }, promptLabel: string, id: string }
  | { kind: 'campfire', position: { x: number, z: number }, promptLabel: string, fire: VillageFire }
  | { kind: 'spawner', position: { x: number, z: number }, promptLabel: string, spawner: PreySpawner }
  | { kind: 'item', position: { x: number, z: number }, promptLabel: string, item: WorldItemRef }
  /** Synthetic target for shovel ground work — dig or level. Built from the
   *  player's aimed ground point (`app/interactables.ts`'s `buildDigTarget`);
   *  `mode`/`profile` are resolved once there so the `[E]` handler doesn't
   *  re-classify the surface. */
  | { kind: 'dig', position: { x: number, z: number }, promptLabel: string, mode: 'dig' | 'level', profile: DigProfile | null }
