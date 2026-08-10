import type { TouchControls } from '../input/createTouchControls'
import type { Inventory } from '../items/Inventory'
import type { PlayerController } from '../player/PlayerController'
import type { PlayerTorch } from '../player/PlayerTorch'
import type { PlacedFires } from '../settlement/PlacedFires'
import type { Hud } from '../ui/createHud'

/** Resource costs for the fire-building/lighting quick actions
 *  (`settlement/PlacedFires.ts`, `player/PlayerTorch.ts`) — see
 *  `docs/plans/2026-08-09--050`. A "prosta ognisko" is built directly from
 *  branches alone (shorter burn); a "palenisko" is a stone fire pit built
 *  cold, then lit later via the existing `[E]` campfire interaction (longer
 *  burn). Both, like the `[E]` interaction, require a firestarter in
 *  inventory to actually strike a flame (not consumed). */
const SIMPLE_FIRE_BRANCH_COST = 2
const FIRE_PIT_STONE_COST = 4
const TORCH_BRANCH_COST = 1

const getUserActions = (
  inventory: Inventory,
  placedFires: PlacedFires,
  playerTorch: PlayerTorch,
  player: PlayerController,
  hud: Hud,
  touchControls?: TouchControls | null | undefined,
) => {
  // Shared by the pause menu's fire/torch buttons and the quick-actions popup
  // below — two UI entry points onto identical logic, not a duplicate.
  const buildSimpleFire = (): boolean => {
    if (!inventory.has('firestarter', 1) || !inventory.has('branch', SIMPLE_FIRE_BRANCH_COST)) return false
    inventory.remove('branch', SIMPLE_FIRE_BRANCH_COST)
    placedFires.place(player.mesh.position.x, player.mesh.position.z, 'simple')
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    touchControls?.setDropAvailable(!inventory.isEmpty())
    return true
  }
  const buildFirePit = (): boolean => {
    if (!inventory.has('stone', FIRE_PIT_STONE_COST)) return false
    inventory.remove('stone', FIRE_PIT_STONE_COST)
    placedFires.place(player.mesh.position.x, player.mesh.position.z, 'pit')
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    touchControls?.setDropAvailable(!inventory.isEmpty())
    return true
  }
  const lightTorch = (): boolean => {
    if (playerTorch.isLit()) return false
    if (!inventory.has('firestarter', 1) || !inventory.has('branch', TORCH_BRANCH_COST)) return false
    inventory.remove('branch', TORCH_BRANCH_COST)
    playerTorch.light()
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    touchControls?.setDropAvailable(!inventory.isEmpty())
    return true
  }

  return {
    buildSimpleFire,
    buildFirePit,
    lightTorch,
  }
}

export { getUserActions }
