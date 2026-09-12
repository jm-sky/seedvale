import { describe, expect, it } from 'vitest'
import { Inventory } from '../items/Inventory'
import { createLiquidContainerInstance } from '../items/liquidContainer'
import { createWeaponInstance } from '../items/weaponMaintenance'
import { damageHealth } from '../shared/HealthState'
import {
  claimNpcCorpseForBurial,
  cloneNpcPostDeath,
  commitNpcDeath,
  createActiveNpcPostDeath,
  createLegacyTerminalNpcPostDeath,
  dropNpcCorpseLoot,
  finalizeExpiredNpcCorpse,
  NPC_CORPSE_BONES_ONSET_DAYS,
  NPC_CORPSE_REMOVE_DAYS,
  NPC_CORPSE_ROT_ONSET_DAYS,
  npcCorpsePhaseFromElapsedDays,
  npcCorpseReadyToRemove,
  releaseNpcCorpseBurialClaim,
  resolveNpcCorpsePhase,
  shouldSkipNpcCorpsePresentation,
  transferCorpseCountTo,
  transferCorpseInstanceTo,
} from './npcPostDeath'
import { createNpcAuthoritativeState, createNpcStateRegistry } from './npcState'

describe('npcCorpsePhaseFromElapsedDays', () => {
  it('resolves fresh → rotting → bones → removed from an absolute time anchor', () => {
    expect(npcCorpsePhaseFromElapsedDays(0)).toBe('fresh')
    expect(npcCorpsePhaseFromElapsedDays(NPC_CORPSE_ROT_ONSET_DAYS - 1e-9)).toBe('fresh')
    expect(npcCorpsePhaseFromElapsedDays(NPC_CORPSE_ROT_ONSET_DAYS)).toBe('rotting')
    expect(npcCorpsePhaseFromElapsedDays(NPC_CORPSE_BONES_ONSET_DAYS)).toBe('bones')
    expect(npcCorpsePhaseFromElapsedDays(NPC_CORPSE_REMOVE_DAYS)).toBe('removed')
  })

  it('keeps the current phase after a large time skip without ticking', () => {
    const deathAtDays = 2
    const nowDays = deathAtDays + NPC_CORPSE_BONES_ONSET_DAYS + 0.1
    const post = createActiveNpcPostDeath({
      x: 10, z: -4, yaw: 1.2, deathAtDays, loot: { counts: {}, instances: [] },
    })
    expect(resolveNpcCorpsePhase(post, nowDays)).toBe('bones')
  })
})

describe('commitNpcDeath', () => {
  it('moves the entire personalInventory losslessly, with role irrelevant to what survives', () => {
    const state = createNpcAuthoritativeState('home:npc:0', 0)
    const personal = state.personalInventory
    const axe = createWeaponInstance('axe')
    axe.durability = 0.4
    axe.sharpness = 0.7
    const waterskin = createLiquidContainerInstance('waterskin_small')
    waterskin.liquid = 'water'
    waterskin.amountLitres = 1
    personal.addInstance(axe)
    personal.addInstance(waterskin)
    // Personal belongings unrelated to any role/loadout classifier — the
    // pre-npc-036 behaviour dropped these on the floor of `personalInventory`.
    personal.add('coal', 3)
    personal.add('bread', 2)
    personal.add('berries', 4, 1)

    state.transportCargo.add('branch', 6)
    damageHealth(state.health, state.health.maxHp)

    expect(commitNpcDeath({
      state, personalInventory: personal, x: 3, z: 5, yaw: 0.4, nowDays: 2,
    })).toBe(true)

    expect(personal.isEmpty()).toBe(true)
    const post = state.postDeath!
    expect(post.loot.instances.map((row) => row.id).sort()).toEqual([axe.id, waterskin.id].sort())
    expect(post.loot.instances.find((row) => row.id === axe.id)?.durability).toBe(0.4)
    expect(post.loot.instances.find((row) => row.id === axe.id)?.sharpness).toBe(0.7)
    const liquidRow = post.loot.instances.find((row) => row.id === waterskin.id)
    expect(liquidRow?.liquid).toBe('water')
    expect(liquidRow?.amountLitres).toBe(1)
    expect(post.loot.counts.coal).toBe(3)
    expect(post.loot.counts.bread).toBe(2)
    expect(post.loot.counts.berries).toBe(4)
    expect(post.loot.foodBatches?.berries?.reduce((sum, b) => sum + b.count, 0)).toBe(4)

    // `transportCargo` is a separate ownership domain (settlements-npcs-019)
    // and must not be folded into corpse loot.
    expect(state.transportCargo.count('branch')).toBe(6)
  })

  it('commits post-death state once and ignores a second lethal edge', () => {
    const state = createNpcAuthoritativeState('home:npc:0', 0)
    const carried = state.personalInventory
    const knife = createWeaponInstance('knife')
    carried.addInstance(knife)
    damageHealth(state.health, state.health.maxHp)

    expect(commitNpcDeath({
      state, personalInventory: carried, x: 3, z: 5, yaw: 0.4, nowDays: 1.5,
    })).toBe(true)
    expect(state.postDeath?.status).toBe('active')
    expect(state.postDeath?.x).toBe(3)
    expect(state.postDeath?.z).toBe(5)
    expect(state.postDeath?.deathAtDays).toBe(1.5)
    expect(state.postDeath?.loot.instances[0]?.id).toBe(knife.id)

    const extra = new Inventory(undefined, 20)
    extra.addInstance(createWeaponInstance('knife'))
    expect(commitNpcDeath({
      state, personalInventory: extra, x: 99, z: 99, yaw: 0, nowDays: 9,
    })).toBe(false)
    expect(state.postDeath?.x).toBe(3)
    expect(state.postDeath?.loot.instances).toHaveLength(1)
    expect(state.postDeath?.loot.instances[0]?.id).toBe(knife.id)
    // The second, ignored edge must not have touched `extra`'s ownership.
    expect(extra.holdsAny('knife')).toBe(true)
  })
})

describe('corpse loot transfer', () => {
  it('keeps the instance on the corpse when the receiver is full', () => {
    const post = createActiveNpcPostDeath({
      x: 0, z: 0, yaw: 0, deathAtDays: 0,
      loot: { counts: {}, instances: [{ id: 'w1', kind: 'knife', durability: 0.5, sharpness: 0.8 }] },
    })
    const receiver = new Inventory(undefined, 0.01)
    expect(transferCorpseInstanceTo(post, receiver, 'w1')).toBe(false)
    expect(post.loot.instances).toEqual([{ id: 'w1', kind: 'knife', durability: 0.5, sharpness: 0.8 }])
    expect(receiver.getInstance('w1')).toBeNull()
  })

  it('moves an instance exactly once when the receiver has room', () => {
    const post = createActiveNpcPostDeath({
      x: 0, z: 0, yaw: 0, deathAtDays: 0,
      loot: { counts: {}, instances: [{ id: 'w1', kind: 'knife', durability: 0.5, sharpness: 0.8 }] },
    })
    const receiver = new Inventory(undefined, 20)
    expect(transferCorpseInstanceTo(post, receiver, 'w1')).toBe(true)
    expect(post.loot.instances).toEqual([])
    const moved = receiver.getInstance('w1')
    expect(moved && 'durability' in moved ? moved.durability : null).toBe(0.5)
  })

  it('leaves stack counts on the corpse when a count transfer fails capacity', () => {
    const post = createActiveNpcPostDeath({
      x: 0, z: 0, yaw: 0, deathAtDays: 0,
      loot: { counts: { stone: 2 }, instances: [] },
    })
    const receiver = new Inventory(undefined, 0.01)
    expect(transferCorpseCountTo(post, receiver, 'stone', 2, 0)).toBe(false)
    expect(post.loot.counts.stone).toBe(2)
  })

  it('preserves freshness batches when moving a partial perishable stack to the receiver', () => {
    const post = createActiveNpcPostDeath({
      x: 0, z: 0, yaw: 0, deathAtDays: 5,
      loot: {
        counts: { berries: 4 },
        instances: [],
        foodBatches: { berries: [{ count: 4, acquiredAtDays: 5, accumulatedEffectiveAge: 0, lastCheckpointDays: 5, decayModifier: 1 }] },
      },
    })
    const receiver = new Inventory(undefined, 20)
    expect(transferCorpseCountTo(post, receiver, 'berries', 3, 5)).toBe(true)
    expect(post.loot.counts.berries).toBe(1)
    expect(post.loot.foodBatches?.berries?.reduce((sum, b) => sum + b.count, 0)).toBe(1)
    expect(receiver.count('berries')).toBe(3)
    expect(receiver.getFoodBatches('berries', 5)[0]?.acquiredAtDays).toBe(5)
  })
})

describe('burial claim and natural cleanup', () => {
  it('blocks natural cleanup while claimed and resumes after release', () => {
    const post = createActiveNpcPostDeath({
      x: 1, z: 2, yaw: 0, deathAtDays: 0, loot: { counts: { stone: 1 }, instances: [] },
    })
    expect(claimNpcCorpseForBurial(post, '0_0:npc:1')).toBe(true)
    expect(npcCorpseReadyToRemove(post, NPC_CORPSE_REMOVE_DAYS + 1)).toBe(false)
    expect(finalizeExpiredNpcCorpse(post, NPC_CORPSE_REMOVE_DAYS + 1, null)).toBe(false)
    expect(post.status).toBe('claimed')
    expect(releaseNpcCorpseBurialClaim(post)).toBe(true)
    expect(finalizeExpiredNpcCorpse(post, NPC_CORPSE_REMOVE_DAYS + 1, null)).toBe(true)
    expect(post.status).toBe('terminal')
    expect(post.cleanupReason).toBe('decay')
  })

  it('drops remaining loot onto the world sink before going terminal', () => {
    const post = createActiveNpcPostDeath({
      x: 4, z: -1, yaw: 0, deathAtDays: 0,
      loot: { counts: { stone: 1 }, instances: [{ id: 'w1', kind: 'knife', durability: 1, sharpness: 1 }] },
    })
    const dropped: { kind: string, x: number, z: number, instance?: { id: string } }[] = []
    dropNpcCorpseLoot(post, {
      drop(kind: string, x: number, z: number, instance?: { id: string }) {
        dropped.push({ kind, x, z, instance: instance ? { id: instance.id } : undefined })
      },
    } as never)
    expect(dropped).toEqual([
      { kind: 'knife', x: 4, z: -1, instance: { id: 'w1' } },
      { kind: 'stone', x: 4, z: -1, instance: undefined },
    ])
    expect(post.loot.instances).toEqual([])
    expect(post.loot.counts.stone ?? 0).toBe(0)
  })

  it('splits perishable batches into lossless per-unit drops instead of flattening to day-0 food', () => {
    const post = createActiveNpcPostDeath({
      x: 4, z: -1, yaw: 0, deathAtDays: 5,
      loot: {
        counts: { berries: 2 },
        instances: [],
        foodBatches: { berries: [{ count: 2, acquiredAtDays: 3, accumulatedEffectiveAge: 0, lastCheckpointDays: 3, decayModifier: 1 }] },
      },
    })
    const dropped: { kind: string, foodBatch?: { count: number, acquiredAtDays: number } }[] = []
    dropNpcCorpseLoot(post, {
      drop(kind: string, _x: number, _z: number, _instance?: unknown, _onCollected?: unknown, foodBatch?: { count: number, acquiredAtDays: number }) {
        dropped.push({ kind, foodBatch })
      },
    } as never)
    expect(dropped).toEqual([
      { kind: 'berries', foodBatch: { count: 1, acquiredAtDays: 3, accumulatedEffectiveAge: 0, lastCheckpointDays: 3, decayModifier: 1 } },
      { kind: 'berries', foodBatch: { count: 1, acquiredAtDays: 3, accumulatedEffectiveAge: 0, lastCheckpointDays: 3, decayModifier: 1 } },
    ])
    expect(post.loot.counts.berries ?? 0).toBe(0)
  })

  it('skips rematerializing terminal and expired corpses, not claimed ones', () => {
    const live = createNpcAuthoritativeState('a', 0)
    expect(shouldSkipNpcCorpsePresentation(live, 10)).toBe(false)

    const terminal = createNpcAuthoritativeState('b', 0)
    damageHealth(terminal.health, terminal.health.maxHp)
    terminal.postDeath = createLegacyTerminalNpcPostDeath()
    expect(shouldSkipNpcCorpsePresentation(terminal, 10)).toBe(true)

    const expired = createNpcAuthoritativeState('c', 0)
    damageHealth(expired.health, expired.health.maxHp)
    expired.postDeath = createActiveNpcPostDeath({
      x: 0, z: 0, yaw: 0, deathAtDays: 0, loot: { counts: {}, instances: [] },
    })
    expect(shouldSkipNpcCorpsePresentation(expired, NPC_CORPSE_REMOVE_DAYS)).toBe(true)

    const claimed = createNpcAuthoritativeState('d', 0)
    damageHealth(claimed.health, claimed.health.maxHp)
    claimed.postDeath = createActiveNpcPostDeath({
      x: 0, z: 0, yaw: 0, deathAtDays: 0, loot: { counts: {}, instances: [] },
    })
    claimNpcCorpseForBurial(claimed.postDeath!, '0_0:npc:2')
    expect(shouldSkipNpcCorpsePresentation(claimed, NPC_CORPSE_REMOVE_DAYS + 5)).toBe(false)
  })
})

describe('NpcStateRegistry postDeath round-trip', () => {
  it('serializes an active corpse with loot and hydrates a distinct copy', () => {
    const before = createNpcStateRegistry()
    const state = before.getOrCreate('0_0:npc:0', 0)
    damageHealth(state.health, state.health.maxHp)
    const knife = createWeaponInstance('knife')
    knife.durability = 0.3
    state.postDeath = createActiveNpcPostDeath({
      x: 12, z: -8, yaw: 0.5, deathAtDays: 3.25,
      loot: { counts: {}, instances: [{ id: knife.id, kind: 'knife', durability: 0.3, sharpness: 0.9 }] },
    })

    const snapshot = before.serialize()
    const after = createNpcStateRegistry(snapshot)
    const hydrated = after.getOrCreate('0_0:npc:0', 0)
    expect(hydrated).not.toBe(state)
    expect(hydrated.health.dead).toBe(true)
    expect(hydrated.postDeath).toEqual(state.postDeath)
    expect(hydrated.postDeath?.loot.instances[0]?.id).toBe(knife.id)
    hydrated.postDeath!.x = 0
    expect(state.postDeath?.x).toBe(12)
  })

  it('round-trips full corpse contents (stacks, instances and food batches) with an empty post-death personal inventory', () => {
    const before = createNpcStateRegistry()
    const state = before.getOrCreate('0_0:npc:0', 0)
    const axe = createWeaponInstance('axe')
    state.personalInventory.addInstance(axe)
    state.personalInventory.add('berries', 5, 2)
    damageHealth(state.health, state.health.maxHp)
    expect(commitNpcDeath({
      state, personalInventory: state.personalInventory, x: 1, z: 1, yaw: 0, nowDays: 2,
    })).toBe(true)

    const snapshot = before.serialize()
    expect(snapshot['0_0:npc:0']?.personalInventory).toEqual({ counts: { berries: 0 }, instances: [], foodBatches: {} })

    const hydrated = createNpcStateRegistry(snapshot).getOrCreate('0_0:npc:0', 0)
    expect(hydrated.personalInventory.isEmpty()).toBe(true)
    expect(hydrated.postDeath?.loot.instances[0]?.id).toBe(axe.id)
    expect(hydrated.postDeath?.loot.counts.berries).toBe(5)
    expect(hydrated.postDeath?.loot.foodBatches?.berries?.reduce((sum, b) => sum + b.count, 0)).toBe(5)
  })

  it('round-trips a terminal legacy corpse without fabricating loot', () => {
    const before = createNpcStateRegistry()
    const state = before.getOrCreate('0_0:npc:1', 0)
    damageHealth(state.health, state.health.maxHp)
    state.postDeath = createLegacyTerminalNpcPostDeath()
    const hydrated = createNpcStateRegistry(before.serialize()).getOrCreate('0_0:npc:1', 0)
    expect(hydrated.postDeath?.status).toBe('terminal')
    expect(hydrated.postDeath?.cleanupReason).toBe('legacy')
    expect(hydrated.postDeath?.loot.instances).toEqual([])
  })

  it('treats an older in-session dead snapshot without postDeath as terminal', () => {
    const registry = createNpcStateRegistry({
      '0_0:npc:0': {
        health: { current: 0, max: 100, dead: true },
        stamina: { current: 0, max: 100 },
        vigor: { current: 0, max: 100 },
        needs: { thirst: 0, woodDuty: 0, waterDuty: 0, hunger: 0 },
      },
    })
    const state = registry.getOrCreate('0_0:npc:0', 0)
    expect(state.postDeath?.status).toBe('terminal')
    expect(state.postDeath?.cleanupReason).toBe('legacy')
  })
})

describe('cloneNpcPostDeath', () => {
  it('does not share loot counts, instances or food batches with the original', () => {
    const original = createActiveNpcPostDeath({
      x: 1, z: 2, yaw: 0, deathAtDays: 1,
      loot: {
        counts: { stone: 1, berries: 2 },
        instances: [{ id: 'a', kind: 'knife' }],
        foodBatches: { berries: [{ count: 2, acquiredAtDays: 1, accumulatedEffectiveAge: 0, lastCheckpointDays: 1, decayModifier: 1 }] },
      },
    })
    const copy = cloneNpcPostDeath(original)!
    expect(copy.loot.instances).not.toBe(original.loot.instances)
    expect(copy.loot.foodBatches?.berries).not.toBe(original.loot.foodBatches?.berries)
    copy.loot.counts.stone = 9
    expect(original.loot.instances).toHaveLength(1)
    expect(original.loot.counts.stone).toBe(1)
    expect(original.loot.foodBatches?.berries?.[0]?.count).toBe(2)
  })
})
