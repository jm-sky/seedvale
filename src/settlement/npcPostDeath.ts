import type { Role } from '../ai/characters'
import type { DroppedItems } from '../items/createDroppedItems'
import type { ItemKind } from '../items/items'
import { isNpcLoadoutBelonging } from '../ai/npcLoadout'
import { Inventory, type SaveItemInstance } from '../items/Inventory'
import { decayPhaseFromElapsed } from '../shared/corpseLifecycle'

/**
 * Persisted NPC post-death / corpse state (plan npc-010). Lives on
 * `NpcAuthoritativeState`, not on `NpcAgent` or a parallel corpse registry:
 * the same settlement/save/rebuild lifetime as HP already uses. Presentation
 * while a settlement is loaded is a projection of this record.
 *
 * @domain npc
 * @role Authoritative NPC corpse lifecycle, loot snapshot and burial handoff.
 * @owns NpcPostDeathState
 */

/** Active corpse can decay and be looted; `claimed` blocks natural cleanup
 *  so `npc-011` can take over; `terminal` means no corpse should rematerialize. */
export type NpcPostDeathStatus = 'active' | 'claimed' | 'terminal'

export type NpcCorpsePhase = 'bones' | 'fresh' | 'removed' | 'rotting'

export type NpcCorpseCleanupReason = 'buried' | 'decay' | 'legacy'

export type NpcCorpseLootSnapshot = {
  counts: Partial<Record<ItemKind, number>>
  instances: SaveItemInstance[]
}

export type NpcPostDeathState = {
  status: NpcPostDeathStatus
  x: number
  z: number
  yaw: number
  /** Absolute `dayNight.elapsedDays` at the alive→dead edge — not
   *  `NpcAgent.simClock`, so stream-out / time-skip / save-load keep ageing
   *  the corpse without an off-screen tick. */
  deathAtDays: number
  loot: NpcCorpseLootSnapshot
  cleanupReason: NpcCorpseCleanupReason | null
}

/** World-day thresholds — fauna's 20/40/60 s linger is too short for a human
 *  corpse that later burial (`npc-011`) has to find. Phase names match fauna;
 *  the unit and duration do not. */
export const NPC_CORPSE_ROT_ONSET_DAYS = 0.25
export const NPC_CORPSE_BONES_ONSET_DAYS = 1
export const NPC_CORPSE_REMOVE_DAYS = 2

export const EMPTY_NPC_CORPSE_LOOT: NpcCorpseLootSnapshot = { counts: {}, instances: [] }

export function cloneNpcCorpseLoot(loot: NpcCorpseLootSnapshot): NpcCorpseLootSnapshot {
  return {
    counts: { ...loot.counts },
    instances: loot.instances.map((row) => ({ ...row })),
  }
}

export function cloneNpcPostDeath(state: NpcPostDeathState | null): NpcPostDeathState | null {
  if (!state) return null
  return {
    status: state.status,
    x: state.x,
    z: state.z,
    yaw: state.yaw,
    deathAtDays: state.deathAtDays,
    loot: cloneNpcCorpseLoot(state.loot),
    cleanupReason: state.cleanupReason,
  }
}

export function createEmptyNpcCorpseLoot(): NpcCorpseLootSnapshot {
  return cloneNpcCorpseLoot(EMPTY_NPC_CORPSE_LOOT)
}

/** Migrated pre-npc-010 dead NPC: stays dead, but we must not invent a death
 *  position, death time, or loadout loot. */
export function createLegacyTerminalNpcPostDeath(): NpcPostDeathState {
  return {
    status: 'terminal',
    x: 0,
    z: 0,
    yaw: 0,
    deathAtDays: 0,
    loot: createEmptyNpcCorpseLoot(),
    cleanupReason: 'legacy',
  }
}

export function createActiveNpcPostDeath(params: {
  x: number
  z: number
  yaw: number
  deathAtDays: number
  loot: NpcCorpseLootSnapshot
}): NpcPostDeathState {
  return {
    status: 'active',
    x: params.x,
    z: params.z,
    yaw: params.yaw,
    deathAtDays: params.deathAtDays,
    loot: cloneNpcCorpseLoot(params.loot),
    cleanupReason: null,
  }
}

export function hasActiveNpcCorpse(postDeath: NpcPostDeathState | null | undefined): postDeath is NpcPostDeathState {
  return postDeath != null && (postDeath.status === 'active' || postDeath.status === 'claimed')
}

export function npcCorpsePhaseFromElapsedDays(elapsedDays: number): NpcCorpsePhase {
  if (elapsedDays >= NPC_CORPSE_REMOVE_DAYS) return 'removed'
  return decayPhaseFromElapsed(elapsedDays, NPC_CORPSE_ROT_ONSET_DAYS, NPC_CORPSE_BONES_ONSET_DAYS)
}

export function resolveNpcCorpsePhase(postDeath: NpcPostDeathState, nowDays: number): NpcCorpsePhase {
  if (postDeath.status === 'terminal') return 'removed'
  return npcCorpsePhaseFromElapsedDays(Math.max(0, nowDays - postDeath.deathAtDays))
}

export function npcCorpseReadyToRemove(postDeath: NpcPostDeathState, nowDays: number): boolean {
  if (postDeath.status !== 'active') return false
  return npcCorpsePhaseFromElapsedDays(Math.max(0, nowDays - postDeath.deathAtDays)) === 'removed'
}

export function markNpcPostDeathTerminal(postDeath: NpcPostDeathState, reason: NpcCorpseCleanupReason): void {
  postDeath.status = 'terminal'
  postDeath.cleanupReason = reason
}

/** Burial handoff for `npc-011` — blocks natural cleanup while claimed. */
export function claimNpcCorpseForBurial(postDeath: NpcPostDeathState): boolean {
  if (postDeath.status !== 'active') return false
  postDeath.status = 'claimed'
  return true
}

export function releaseNpcCorpseBurialClaim(postDeath: NpcPostDeathState): boolean {
  if (postDeath.status !== 'claimed') return false
  postDeath.status = 'active'
  return true
}

/** V1 loot authorization is inert/neutral (plan npc-010 §7) — no ownership
 *  or reputation consequence until a later plan owns that truth. */
export function canLootNpcCorpse(_npcId: string): boolean {
  return true
}

export function corpseLootInventory(loot: NpcCorpseLootSnapshot): Inventory {
  return new Inventory(loot.counts, Infinity, Inventory.instancesFromJSON(loot.instances), undefined, Infinity)
}

export function snapshotCorpseLoot(inventory: Inventory): NpcCorpseLootSnapshot {
  return {
    counts: inventory.toJSON(),
    instances: inventory.instancesToJSON(),
  }
}

const LOADOUT_KINDS_BY_ROLE_CACHE = new Map<Role, readonly ItemKind[]>()

function loadoutKindsFor(role: Role): readonly ItemKind[] {
  const cached = LOADOUT_KINDS_BY_ROLE_CACHE.get(role)
  if (cached) return cached
  const kinds: ItemKind[] = ['knife', 'axe', 'long_sword', 'hunting_bow']
  const matched = kinds.filter((kind) => isNpcLoadoutBelonging(kind, role))
  LOADOUT_KINDS_BY_ROLE_CACHE.set(role, matched)
  return matched
}

/** Moves the actual personal-loadout instances onto a loot snapshot and
 *  removes them from `personalInventory`. Work/economy payloads on
 *  `NpcAgent.carried` stay out of this path (plan settlements-npcs-026).
 *  Full personalInventory including food-batch freshness remains an
 *  npc-010 follow-up — corpse loot still does not persist food batches. */
export function extractNpcLoadoutLoot(inventory: Inventory, role: Role): NpcCorpseLootSnapshot {
  const loot = new Inventory(undefined, Infinity, undefined, undefined, Infinity)
  for (const kind of loadoutKindsFor(role)) {
    for (const instance of inventory.getInstances(kind)) {
      if (!loot.addInstance(instance)) continue
      inventory.removeInstance(instance.id)
    }
    const count = inventory.count(kind)
    if (count <= 0) continue
    if (loot.add(kind, count)) inventory.remove(kind, count)
  }
  return snapshotCorpseLoot(loot)
}

/**
 * One-shot alive→dead consequence. Returns false when post-death state
 * already exists (reconstruction / `die(true)` hydration) so loot and death
 * transform are never minted twice.
 */
export function commitNpcDeath(opts: {
  state: { postDeath: NpcPostDeathState | null }
  personalInventory: Inventory
  role: Role
  x: number
  z: number
  yaw: number
  nowDays: number
}): boolean {
  if (opts.state.postDeath) return false
  opts.state.postDeath = createActiveNpcPostDeath({
    x: opts.x,
    z: opts.z,
    yaw: opts.yaw,
    deathAtDays: opts.nowDays,
    loot: extractNpcLoadoutLoot(opts.personalInventory, opts.role),
  })
  return true
}

export function transferCorpseInstanceTo(
  postDeath: NpcPostDeathState,
  receiver: Inventory,
  instanceId: string,
): boolean {
  if (postDeath.status === 'terminal') return false
  const corpse = corpseLootInventory(postDeath.loot)
  const instance = corpse.getInstance(instanceId)
  if (!instance) return false
  if (!receiver.canAddInstance(instance)) return false
  if (!receiver.addInstance(instance)) return false
  corpse.removeInstance(instanceId)
  postDeath.loot = snapshotCorpseLoot(corpse)
  return true
}

export function transferCorpseCountTo(
  postDeath: NpcPostDeathState,
  receiver: Inventory,
  kind: ItemKind,
  amount: number,
): boolean {
  if (postDeath.status === 'terminal' || amount <= 0) return false
  const corpse = corpseLootInventory(postDeath.loot)
  if (!corpse.has(kind, amount)) return false
  if (!receiver.canAdd(kind, amount)) return false
  if (!corpse.remove(kind, amount)) return false
  if (!receiver.add(kind, amount)) {
    corpse.add(kind, amount)
    return false
  }
  postDeath.loot = snapshotCorpseLoot(corpse)
  return true
}

/** Unclaimed loot rule: remaining items become world drops at the death
 *  position, then the snapshot is cleared. Mesh expiry alone never deletes
 *  items. */
export function dropNpcCorpseLoot(postDeath: NpcPostDeathState, droppedItems: DroppedItems | null | undefined): void {
  if (!droppedItems) return
  const loot = postDeath.loot
  for (const instance of loot.instances) {
    droppedItems.drop(instance.kind, postDeath.x, postDeath.z, instance)
  }
  for (const [kind, amount] of Object.entries(loot.counts) as [ItemKind, number][]) {
    for (let i = 0; i < amount; i++) droppedItems.drop(kind, postDeath.x, postDeath.z)
  }
  postDeath.loot = createEmptyNpcCorpseLoot()
}

export function finalizeExpiredNpcCorpse(
  postDeath: NpcPostDeathState,
  nowDays: number,
  droppedItems: DroppedItems | null | undefined,
): boolean {
  if (!npcCorpseReadyToRemove(postDeath, nowDays)) return false
  dropNpcCorpseLoot(postDeath, droppedItems)
  markNpcPostDeathTerminal(postDeath, 'decay')
  return true
}

/** True when this dead NPC should not be materialized as a corpse agent. */
export function shouldSkipNpcCorpsePresentation(
  state: { health: { dead: boolean }, postDeath: NpcPostDeathState | null },
  nowDays: number,
): boolean {
  if (!state.health.dead) return false
  const post = state.postDeath
  if (!post || post.status === 'terminal') return true
  return npcCorpseReadyToRemove(post, nowDays)
}
