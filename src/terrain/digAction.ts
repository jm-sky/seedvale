import type { TouchControls } from '../input/createTouchControls'
import type { DroppedItems } from '../items/createDroppedItems'
import type { Inventory } from '../items/Inventory'
import type { Hud } from '../ui/createHud'
import type { Toast } from '../ui/createToast'
import type { ChunkManager } from './chunkManager'
import { playInventoryPickUp } from '../audio/inventorySounds'
import {
  DIG_DEPTH_SOIL,
  DIG_RADIUS,
  type DigProfile,
  resolveDigStone,
} from './dig'

export type DigFeedback = {
  inventory: Inventory
  droppedItems: DroppedItems
  toast: Toast
  hud: Hud
  touchControls?: TouchControls | null
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
  chunkManager.modifyTerrain(x, z, DIG_RADIUS, profile.depth)
  const outcome = resolveDigStone(profile.stoneChance, feedback.inventory.canAdd('stone'), random)
  if (outcome.kind === 'none') {
    feedback.toast.show(profile.surface === 'rock' ? 'Wykuto skałę.' : 'Wykopano dołek.')
    return
  }
  if (outcome.kind === 'inventory') {
    feedback.inventory.add('stone')
    playInventoryPickUp(feedback.playOnce)
    feedback.hud.setInventoryWeight(feedback.inventory.totalWeight(), feedback.inventory.maxWeight)
    feedback.touchControls?.setDropAvailable(!feedback.inventory.isEmpty())
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

/** Raises terrain toward the procedural base at `(x, z)`. */
export function applyLevelAt(
  chunkManager: ChunkManager,
  x: number,
  z: number,
  toast: Toast,
): void {
  const raised = chunkManager.levelTerrain(x, z, DIG_RADIUS, DIG_DEPTH_SOIL)
  toast.show(raised ? 'Wyrównano teren.' : 'Nie ma tu czego wyrównać.')
}
