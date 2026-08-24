import type { DroppedItems } from '../items/createDroppedItems'
import type { Inventory } from '../items/Inventory'
import type { Hud } from '../ui/createHud'
import type { Toast } from '../ui/createToast'
import type { ChunkManager } from './chunkManager'
import { playInventoryPickUp } from '../audio/inventorySounds'
import {
  DIG_RADIUS,
  type DigProfile,
  resolveDigStone,
} from './dig'
import { nearestGridPoint, resolveLevelSamples } from './terrainPreparation'

export type DigFeedback = {
  inventory: Inventory
  droppedItems: DroppedItems
  toast: Toast
  hud: Hud
  playOnce: (url: string, volume?: number) => void
}

/** Applies one dig depression + stone outcome at `(x, z)`. */
export function applyDigAt(
  chunkManager: ChunkManager,
  x: number,
  z: number,
  profile: DigProfile,
  feedback: DigFeedback,
  random: () => number = Math.random,
): void {
  chunkManager.modifyTerrain(x, z, DIG_RADIUS, profile.depth, 'player')
  const outcome = resolveDigStone(profile.stoneChance, feedback.inventory.canAdd('stone'), random)
  if (outcome.kind === 'none') {
    feedback.toast.show(profile.surface === 'rock' ? 'Wykuto skałę.' : 'Wykopano dołek.')
    return
  }
  if (outcome.kind === 'inventory') {
    feedback.inventory.add('stone')
    playInventoryPickUp(feedback.playOnce)
    feedback.hud.setInventoryWeight(feedback.inventory.totalWeight(), feedback.inventory.maxWeight)
    feedback.toast.show('+1 Kamień', 'pickup')
    return
  }
  // Full inventory or unnoticed — never silently lose the stone.
  const angle = random() * Math.PI * 2
  feedback.droppedItems.drop(
    'stone',
    x + Math.cos(angle) * 0.55,
    z + Math.sin(angle) * 0.55,
  )
  feedback.toast.show(
    outcome.reason === 'full'
      ? 'Kamień wypadł na ziemię — ekwipunek jest pełny.'
      : 'Kamień wypadł na ziemię.',
  )
}

/** "Wyrównaj" (plan `world-terrain-002` §1) — levels the 3×3 nearest terrain
 *  samples around `(x, z)` to the central sample's own current height (never
 *  the procedural base). A one-shot exact-height write through the same
 *  `applyExactHeights` primitive active terrain-preparation work uses, keyed
 *  by a *stable*, location-derived id (the grid-snapped center point) so
 *  repeat-leveling the same spot replaces its own prior entry instead of
 *  appending a growing list forever (plan `world-terrain-save`). */
export function applyLevelAt(
  chunkManager: ChunkManager,
  x: number,
  z: number,
  toast: Toast,
): void {
  const samples = resolveLevelSamples(x, z, chunkManager.chunkSize, chunkManager.resolution)
  const center = nearestGridPoint(x, z, chunkManager.chunkSize, chunkManager.resolution)
  const targetHeight = chunkManager.sampleHeight(center.x, center.z)
  const heights = samples
    .filter((s) => Math.abs(chunkManager.sampleHeight(s.x, s.z) - targetHeight) > 1e-4)
    .map((s) => ({ x: s.x, z: s.z, height: targetHeight }))
  if (heights.length === 0) {
    toast.show('Teren jest już wyrównany.')
    return
  }
  chunkManager.applyExactHeights(`level:${center.x}:${center.z}`, heights)
  toast.show('Wyrównano teren.')
}

/** "Zrób górkę" (plan `world-terrain-002` §1) — the inverse of "Wykop
 *  dołek": the same radial deformation `modifyTerrain` already applies for a
 *  dig, just raising instead of lowering (a negative depth), so it shares
 *  the exact same single-deformation limits/mechanism. Never yields stone —
 *  raising ground doesn't unearth anything. */
export function applyMoundAt(
  chunkManager: ChunkManager,
  x: number,
  z: number,
  depth: number,
  toast: Toast,
): void {
  chunkManager.modifyTerrain(x, z, DIG_RADIUS, -depth, 'player')
  toast.show('Usypano górkę.')
}
