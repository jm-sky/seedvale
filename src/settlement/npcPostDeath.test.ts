import { describe, expect, it } from 'vitest'
import { isNpcLoadoutBelonging } from '../ai/npcLoadout'
import { Inventory } from '../items/Inventory'
import { createWeaponInstance } from '../items/weaponMaintenance'
import { damageHealth } from '../shared/HealthState'
import {
  claimNpcCorpseForBurial,
  cloneNpcPostDeath,
  commitNpcDeath,
  createActiveNpcPostDeath,
  createLegacyTerminalNpcPostDeath,
  dropNpcCorpseLoot,
  extractNpcLoadoutLoot,
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

describe('extractNpcLoadoutLoot / commitNpcDeath', () => {
  it('moves the actual woodcutter axe+knife instances and leaves ore behind', () => {
    const carried = new Inventory(undefined, 20)
    const axe = createWeaponInstance('axe')
    const knife = createWeaponInstance('knife')
    axe.durability = 0.4
    axe.sharpness = 0.7
    carried.addInstance(axe)
    carried.addInstance(knife)
    carried.add('coal', 3)

    const loot = extractNpcLoadoutLoot(carried, 'woodcutter')
    expect(loot.instances.map((row) => row.id).sort()).toEqual([axe.id, knife.id].sort())
    expect(loot.instances.find((row) => row.id === axe.id)?.durability).toBe(0.4)
    expect(loot.instances.find((row) => row.id === axe.id)?.sharpness).toBe(0.7)
    expect(carried.holdsAny('axe')).toBe(false)
    expect(carried.holdsAny('knife')).toBe(false)
    expect(carried.count('coal')).toBe(3)
  })

  it('does not treat hunter arrows as personal loot', () => {
    const carried = new Inventory(undefined, 20)
    // `hunting_bow` is not a maintenance weapon — loadout seeds it as a count.
    carried.add('hunting_bow', 1)
    carried.addInstance(createWeaponInstance('knife'))
    carried.add('arrow', 6)
    const loot = extractNpcLoadoutLoot(carried, 'hunter')
    expect(loot.counts.hunting_bow).toBe(1)
    expect(loot.instances.some((row) => row.kind === 'knife')).toBe(true)
    expect(loot.counts.arrow ?? 0).toBe(0)
    expect(carried.count('arrow')).toBe(6)
    expect(carried.count('hunting_bow')).toBe(0)
  })

  it('commits post-death state once and ignores a second lethal edge', () => {
    const state = createNpcAuthoritativeState('home:npc:0', 0)
    const carried = new Inventory(undefined, 20)
    const knife = createWeaponInstance('knife')
    carried.addInstance(knife)
    damageHealth(state.health, state.health.maxHp)

    expect(commitNpcDeath({
      state, personalInventory: carried, role: 'farmer', x: 3, z: 5, yaw: 0.4, nowDays: 1.5,
    })).toBe(true)
    expect(state.postDeath?.status).toBe('active')
    expect(state.postDeath?.x).toBe(3)
    expect(state.postDeath?.z).toBe(5)
    expect(state.postDeath?.deathAtDays).toBe(1.5)
    expect(state.postDeath?.loot.instances[0]?.id).toBe(knife.id)

    const extra = new Inventory(undefined, 20)
    extra.addInstance(createWeaponInstance('knife'))
    expect(commitNpcDeath({
      state, personalInventory: extra, role: 'farmer', x: 99, z: 99, yaw: 0, nowDays: 9,
    })).toBe(false)
    expect(state.postDeath?.x).toBe(3)
    expect(state.postDeath?.loot.instances).toHaveLength(1)
    expect(state.postDeath?.loot.instances[0]?.id).toBe(knife.id)
  })
})

describe('isNpcLoadoutBelonging', () => {
  it('classifies only role loadout kinds', () => {
    expect(isNpcLoadoutBelonging('axe', 'woodcutter')).toBe(true)
    expect(isNpcLoadoutBelonging('knife', 'woodcutter')).toBe(true)
    expect(isNpcLoadoutBelonging('coal', 'woodcutter')).toBe(false)
    expect(isNpcLoadoutBelonging('arrow', 'hunter')).toBe(false)
    expect(isNpcLoadoutBelonging('hunting_bow', 'hunter')).toBe(true)
    expect(isNpcLoadoutBelonging('long_sword', 'guard')).toBe(true)
    expect(isNpcLoadoutBelonging('knife', 'guard')).toBe(false)
    expect(isNpcLoadoutBelonging('knife', 'farmer')).toBe(true)
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
    expect(transferCorpseCountTo(post, receiver, 'stone', 2)).toBe(false)
    expect(post.loot.counts.stone).toBe(2)
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
  it('does not share loot arrays with the original', () => {
    const original = createActiveNpcPostDeath({
      x: 1, z: 2, yaw: 0, deathAtDays: 1,
      loot: { counts: { stone: 1 }, instances: [{ id: 'a', kind: 'knife' }] },
    })
    const copy = cloneNpcPostDeath(original)!
    copy.loot.instances.push({ id: 'b', kind: 'axe' })
    copy.loot.counts.stone = 9
    expect(original.loot.instances).toHaveLength(1)
    expect(original.loot.counts.stone).toBe(1)
  })
})
