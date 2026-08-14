import type { HeldTool } from '../items/HeldTool'
import type { Inventory } from '../items/Inventory'
import type { PlayerController } from '../player/PlayerController'
import type { PlayerTorch } from '../player/PlayerTorch'
import type { Hud } from '../ui/createHud'
import type { WorldBundle } from './worldBundle'

/** Resource costs for the fire-building/lighting quick actions
 *  (`settlement/PlacedFires.ts`, `player/PlayerTorch.ts`) — see
 *  `docs/plans/archive/2026-08-09--050` / plan 085. A "prosta ognisko" is built directly from
 *  branches alone (shorter burn); a "palenisko" is a stone fire pit built
 *  cold, then lit later via the existing `[E]` campfire interaction (longer
 *  burn). Both, like the `[E]` interaction, require a firestarter in
 *  inventory to actually strike a flame (not consumed). */
const SIMPLE_FIRE_BRANCH_COST = 2
const FIRE_PIT_STONE_COST = 4
const TORCH_BRANCH_COST = 1

export type LightActionResult = 'ok' | 'already-lit' | 'missing' | 'need-hold'

const getUserActions = (
  inventory: Inventory,
  bundle: WorldBundle,
  playerTorch: PlayerTorch,
  player: PlayerController,
  hud: Hud,
  heldTool: HeldTool,
  syncHeldHud: () => void,
) => {
  // Shared by the pause menu's fire/torch buttons and the quick-actions popup
  // below — two UI entry points onto identical logic, not a duplicate.
  // Both read `bundle.placedFires` at call time (not a captured field) since
  // these closures outlive `rebuildWorldBundle()`, which replaces it — see
  // `WorldBundle`'s doc comment.
  const buildSimpleFire = (): boolean => {
    if (!inventory.has('firestarter', 1) || !inventory.has('branch', SIMPLE_FIRE_BRANCH_COST)) return false
    inventory.remove('branch', SIMPLE_FIRE_BRANCH_COST)
    bundle.placedFires.place(player.mesh.position.x, player.mesh.position.z, 'simple')
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    return true
  }
  const buildFirePit = (): boolean => {
    if (!inventory.has('stone', FIRE_PIT_STONE_COST)) return false
    inventory.remove('stone', FIRE_PIT_STONE_COST)
    bundle.placedFires.place(player.mesh.position.x, player.mesh.position.z, 'pit')
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    return true
  }

  /** Lit branch occupies the right hand — unequip any tool first. */
  const lightBranch = (): LightActionResult => {
    if (playerTorch.isLit()) return 'already-lit'
    if (!inventory.has('firestarter', 1) || !inventory.has('branch', TORCH_BRANCH_COST)) return 'missing'
    inventory.remove('branch', TORCH_BRANCH_COST)
    heldTool.unequip()
    syncHeldHud()
    void playerTorch.light('branch').then(() => syncHeldHud())
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    return 'ok'
  }

  /** Wooden torch must be held; firestarter required; item is not consumed. */
  const lightWoodenTorch = (): LightActionResult => {
    if (playerTorch.isLit()) return 'already-lit'
    if (!inventory.has('firestarter', 1)) return 'missing'
    if (heldTool.held() !== 'wooden_torch') {
      if (!inventory.has('wooden_torch', 1)) return 'missing'
      // Auto-equip when hand is free; refuse if another tool is held.
      if (heldTool.held() !== null) return 'need-hold'
      if (!heldTool.equip('wooden_torch')) return 'need-hold'
      syncHeldHud()
    }
    void playerTorch.light('wooden_torch').then(() => syncHeldHud())
    return 'ok'
  }

  // Availability predicates (review 007 C4) — read-only mirrors of the guard
  // clauses above, so Quick Actions / Pause→Akcje can hide an action instead
  // of always offering it and reporting failure after the click.
  const canBuildSimpleFire = (): boolean =>
    inventory.has('firestarter', 1) && inventory.has('branch', SIMPLE_FIRE_BRANCH_COST)
  const canBuildFirePit = (): boolean => inventory.has('stone', FIRE_PIT_STONE_COST)
  const canLightBranch = (): boolean =>
    !playerTorch.isLit() && inventory.has('firestarter', 1) && inventory.has('branch', TORCH_BRANCH_COST)
  const canLightWoodenTorch = (): boolean => {
    if (playerTorch.isLit()) return false
    if (!inventory.has('firestarter', 1)) return false
    if (heldTool.held() === 'wooden_torch') return true
    return heldTool.held() === null && inventory.has('wooden_torch', 1)
  }

  return {
    buildSimpleFire,
    buildFirePit,
    lightBranch,
    lightWoodenTorch,
    canBuildSimpleFire,
    canBuildFirePit,
    canLightBranch,
    canLightWoodenTorch,
  }
}

export { getUserActions }
