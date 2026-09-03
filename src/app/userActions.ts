import type { createMouseLook } from '../input/MouseLook'
import type { HeldTool } from '../items/HeldTool'
import type { Inventory } from '../items/Inventory'
import type { PlayerController } from '../player/PlayerController'
import type { PlayerTorch } from '../player/PlayerTorch'
import type { PlacedFireEntry } from '../settlement/PlacedFires'
import type { Hud } from '../ui/createHud'
import type { ActionAvailability, ActionRequirement, ActionResult } from './actions/actionContracts'
import type { PlacementBlocker, PlacementPreviewResult } from './actions/placementActions'
import type { WorldBundle } from './worldBundle'
import { evaluateGroundPlacement } from '../items/tentPlacement'
import { capabilityRequirement, itemRequirement, targetRequirement, toAvailability, toResult } from './actions/actionContracts'


/** Resource costs for the fire-building/lighting quick actions
 *  (`settlement/PlacedFires.ts`, `player/PlayerTorch.ts`) — see
 *  `docs/plans/archive/2026-08-09--050` / plan 085. A "prosta ognisko" is built directly from
 *  branches alone (shorter burn); a "palenisko" is a stone fire pit built
 *  cold, then lit later via the existing `[E]` campfire interaction (longer
 *  burn). Both, like the `[E]` interaction, require a firestarter in
 *  inventory to actually strike a flame (not consumed). */
export const SIMPLE_FIRE_BRANCH_COST = 2
export const FIRE_PIT_STONE_COST = 4
export const TORCH_BRANCH_COST = 1

/** Ground-suitability constants for placing a new fire (plan `ui-input-004`
 *  §2/§5) — same shape as `world/playerWell.ts`'s well constants: how far
 *  ahead of the player it's placed, the clearance it needs against
 *  blockers, and the minimum spacing from another placed fire. */
export const FIRE_PLACE_REACH = 1.6
export const FIRE_FOOTPRINT_RADIUS = 0.7
export const FIRE_SEPARATION = 2.2

/** Plan 175 §3 — one-time material cost to build a grate on an existing
 *  nearby fire. Centralized here (single source, like `FIRE_PIT_STONE_COST`
 *  above) so the quick-action button label, the availability check and the
 *  actual build never drift apart. */
export const GRATE_COST = { branch: 2, stone: 2, iron_rod: 2 } as const

/** How close (world units) a player-built fire must be to qualify for
 *  "Zbuduj ruszt" — same order of magnitude as `INTERACT_RANGE`
 *  (`app/interactables.ts`), since this is the same "standing at the fire"
 *  gesture, just resolved as a nearest-in-range query instead of gaze/E. */
export const GRATE_BUILD_RANGE = 2.5

const getUserActions = (
  inventory: Inventory,
  bundle: WorldBundle,
  playerTorch: PlayerTorch,
  player: PlayerController,
  hud: Hud,
  heldTool: HeldTool,
  syncHeldHud: () => void,
  mouseLook: ReturnType<typeof createMouseLook>,
  /** Shared nearby-object blocker query (`placementActions.ts`'s
   *  `tentBlockers`) — reused here rather than a second blocker service. */
  blockersNear: (x: number, z: number) => PlacementBlocker[],
) => {
  // Shared by the pause menu's fire/torch buttons and the quick-actions popup
  // below — two UI entry points onto identical logic, not a duplicate.
  // Both read `bundle.placedFires` at call time (not a captured field) since
  // these closures outlive `rebuildWorldBundle()`, which replaces it — see
  // `WorldBundle`'s doc comment.
  const fireAimPoint = (): { x: number, z: number, yaw: number } => {
    const yaw = mouseLook.state.yaw
    return {
      x: player.mesh.position.x - Math.sin(yaw) * FIRE_PLACE_REACH,
      z: player.mesh.position.z - Math.cos(yaw) * FIRE_PLACE_REACH,
      yaw,
    }
  }

  /** Ground-suitability check for a new fire at `(x, z)` (plan `ui-input-004`
   *  §5) — the same shared `evaluateGroundPlacement` every other placeable
   *  uses, peers being other placed fires. Previously fires had no location
   *  validation at all (placed directly under the player); this is the
   *  "authoritative aimed placement/validation seam" both the instant build
   *  and the shared placement-preview mode call. */
  const evaluateFirePlacement = (x: number, z: number): boolean =>
    evaluateGroundPlacement({
      x,
      z,
      sampleHeight: (sx, sz) => bundle.chunkManager.sampleHeight(sx, sz),
      waterLevel: bundle.chunkManager.waterLevel,
      blockers: blockersNear(x, z),
      peers: bundle.placedFires.nodes(),
      footprintRadius: FIRE_FOOTPRINT_RADIUS,
      separation: FIRE_SEPARATION,
    }) === 'ok'

  const previewFirePlacement = (): PlacementPreviewResult => {
    const aim = fireAimPoint()
    const valid = evaluateFirePlacement(aim.x, aim.z)
    return {
      x: aim.x,
      z: aim.z,
      yaw: aim.yaw,
      footprintRadius: FIRE_FOOTPRINT_RADIUS,
      valid,
      reasonLabel: valid ? '' : 'Za mało miejsca lub zbyt blisko wody/zbocza.',
    }
  }

  const simpleFireRequirements = (aim: { x: number, z: number }): (ActionRequirement | null)[] => [
    capabilityRequirement(inventory.hasCapability('fire_starting'), 'fire_starting'),
    itemRequirement(inventory.count('branch'), SIMPLE_FIRE_BRANCH_COST, 'branch'),
    targetRequirement(evaluateFirePlacement(aim.x, aim.z), 'firePlacement'),
  ]

  const availableSimpleFire = (): ActionAvailability => toAvailability(simpleFireRequirements(fireAimPoint()))

  const buildSimpleFire = (): ActionResult => {
    const aim = fireAimPoint()
    const result = toResult(simpleFireRequirements(aim))
    if (!result.ok) return result

    inventory.remove('branch', SIMPLE_FIRE_BRANCH_COST)
    bundle.placedFires.place(aim.x, aim.z, 'simple')
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)

    return { ok: true }
  }

  // `buildFirePit` intentionally has no `fire_starting` capability
  // requirement — a cold fire pit is lit later via the existing `[E]`
  // campfire interaction, which is where that gate belongs (see the module
  // doc comment above).
  const firePitRequirements = (aim: { x: number, z: number }): (ActionRequirement | null)[] => [
    itemRequirement(inventory.count('stone'), FIRE_PIT_STONE_COST, 'stone'),
    targetRequirement(evaluateFirePlacement(aim.x, aim.z), 'firePlacement'),
  ]

  const availableFirePit = (): ActionAvailability => toAvailability(firePitRequirements(fireAimPoint()))

  const buildFirePit = (): ActionResult => {
    const aim = fireAimPoint()
    const result = toResult(firePitRequirements(aim))
    if (!result.ok) return result

    inventory.remove('stone', FIRE_PIT_STONE_COST)
    bundle.placedFires.place(aim.x, aim.z, 'pit')
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    return { ok: true }
  }

  /** Nearest qualifying player-built fire (plan 175 §3) — resolved fresh on
   *  every call (never cached across an availability check and a later
   *  `buildGrate()`) so a stale quick-actions popup can never build against a
   *  fire that has since despawned, moved out of range, or already been
   *  upgraded by an earlier press. */
  const resolveGrateTarget = (): PlacedFireEntry | null =>
    bundle.placedFires.nearestBuildable(player.mesh.position.x, player.mesh.position.z, GRATE_BUILD_RANGE)

  const grateRequirements = (target: PlacedFireEntry | null): (ActionRequirement | null)[] => [
    targetRequirement(target !== null, 'grateTarget'),
    itemRequirement(inventory.count('branch'), GRATE_COST.branch, 'branch'),
    itemRequirement(inventory.count('stone'), GRATE_COST.stone, 'stone'),
    itemRequirement(inventory.count('iron_rod'), GRATE_COST.iron_rod, 'iron_rod'),
  ]

  const availableGrate = (): ActionAvailability => toAvailability(grateRequirements(resolveGrateTarget()))

  /** Materials are only spent once `PlacedFires.buildGrate` actually flips
   *  the flag (it refuses a fire that already has one), so this can't be
   *  used to pay twice for the same fire. */
  const buildGrate = (): ActionResult => {
    const target = resolveGrateTarget()
    const result = toResult(grateRequirements(target))
    if (!result.ok) return result
    if (!bundle.placedFires.buildGrate(target!.id)) return toResult([targetRequirement(false, 'grateTarget')])

    inventory.remove('branch', GRATE_COST.branch)
    inventory.remove('stone', GRATE_COST.stone)
    inventory.remove('iron_rod', GRATE_COST.iron_rod)
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    return { ok: true }
  }

  const lightBranchRequirements = (): (ActionRequirement | null)[] => [
    targetRequirement(!playerTorch.isLit(), 'torchNotLit'),
    capabilityRequirement(inventory.hasCapability('fire_starting'), 'fire_starting'),
    itemRequirement(inventory.count('branch'), TORCH_BRANCH_COST, 'branch'),
  ]

  const availableLightBranch = (): ActionAvailability => toAvailability(lightBranchRequirements())

  /** Lit branch occupies the right hand — unequip any tool first. */
  const lightBranch = (): ActionResult => {
    const result = toResult(lightBranchRequirements())
    if (!result.ok) return result

    inventory.remove('branch', TORCH_BRANCH_COST)
    heldTool.unequip()
    syncHeldHud()
    void playerTorch.light('branch').then(() => syncHeldHud())
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    return { ok: true }
  }

  /** Wooden torch must be held; firestarter required; item is not consumed.
   *  Available either already held, or with a free hand and one carried —
   *  `freeHand`/`wooden_torch` are only relevant in the latter case. */
  const lightWoodenTorchRequirements = (): (ActionRequirement | null)[] => {
    const alreadyHeld = heldTool.held() === 'wooden_torch'
    return [
      targetRequirement(!playerTorch.isLit(), 'torchNotLit'),
      capabilityRequirement(inventory.hasCapability('fire_starting'), 'fire_starting'),
      alreadyHeld ? null : targetRequirement(heldTool.held() === null, 'freeHand'),
      alreadyHeld ? null : itemRequirement(inventory.count('wooden_torch'), 1, 'wooden_torch'),
    ]
  }

  const availableLightWoodenTorch = (): ActionAvailability => toAvailability(lightWoodenTorchRequirements())

  const lightWoodenTorch = (): ActionResult => {
    const result = toResult(lightWoodenTorchRequirements())
    if (!result.ok) return result

    if (heldTool.held() !== 'wooden_torch') {
      if (!heldTool.equip('wooden_torch')) return toResult([targetRequirement(false, 'freeHand')])
      syncHeldHud()
    }
    void playerTorch.light('wooden_torch').then(() => syncHeldHud())
    return { ok: true }
  }

  return {
    previewFirePlacement,
    buildSimpleFire,
    buildFirePit,
    buildGrate,
    lightBranch,
    lightWoodenTorch,
    availableSimpleFire,
    availableFirePit,
    availableGrate,
    availableLightBranch,
    availableLightWoodenTorch,
  }
}

export { getUserActions }
