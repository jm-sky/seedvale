/** Plan world-terrain-024 — representation-neutral dungeon chamber view.
 *
 *  Later fauna/pool plans need the usable dungeon chambers without importing
 *  layout constants, reconstructing the recipe, or reading `CaveRuntime`.
 *  Identity is the stable topology node id; classification is derived from
 *  those ids, never from `nodes[]` position. `CaveTopologyNodeKind` stays a
 *  space/connectivity vocabulary — this module does not add content roles.
 *
 * @domain world-terrain
 */

import type { CaveTopology, CaveTopologyPoint } from './caveTopology'
import {
  DUNGEON_CHAMBER_1_NODE_ID,
  DUNGEON_DEEP_CHAMBER_NODE_ID,
  DUNGEON_FINAL_CHAMBER_NODE_ID,
} from './dungeonTopology'

const EMPTY_DUNGEON_CHAMBERS: readonly DungeonChamber[] = Object.freeze([])

export type DungeonChamberClass = 'entrance-adjacent' | 'regular' | 'side' | 'deep' | 'final'

/**
 * One usable dungeon chamber. `nodeId` is the persistent identity for a
 * given world seed + caveId + accepted layout.
 *
 * @domain world-terrain
 */
export type DungeonChamber = {
  nodeId: string
  class: DungeonChamberClass
  position: CaveTopologyPoint
  targetWidth: number
  targetHeight: number
}

/**
 * Classifies a dungeon chamber from its stable node id. `null` for nodes
 * that are not dungeon chambers (natural/adventure ids, passages, …).
 *
 * @domain world-terrain
 */
export function classifyDungeonChamberId(nodeId: string): DungeonChamberClass | null {
  if (nodeId === DUNGEON_CHAMBER_1_NODE_ID) return 'entrance-adjacent'
  if (nodeId === DUNGEON_DEEP_CHAMBER_NODE_ID) return 'deep'
  if (nodeId === DUNGEON_FINAL_CHAMBER_NODE_ID) return 'final'
  if (nodeId.startsWith('dungeon-side-chamber-')) return 'side'
  if (nodeId.startsWith('dungeon-chamber-')) return 'regular'
  return null
}

/**
 * Usable dungeon chambers from a topology, in the topology's own stable
 * node order (route order). Empty when the topology has no dungeon chamber
 * ids — callers must not invent rooms from array position.
 *
 * @domain world-terrain
 */
export function dungeonChambersFromTopology(topology: CaveTopology): readonly DungeonChamber[] {
  const out: DungeonChamber[] = []
  for (const node of topology.nodes) {
    if (node.kind !== 'chamber') continue
    const classification = classifyDungeonChamberId(node.id)
    if (!classification) continue
    out.push({
      nodeId: node.id,
      class: classification,
      position: node.position,
      targetWidth: node.targetWidth,
      targetHeight: node.targetHeight,
    })
  }
  return out.length === 0 ? EMPTY_DUNGEON_CHAMBERS : Object.freeze(out)
}
