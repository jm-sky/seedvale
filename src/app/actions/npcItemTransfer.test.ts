import { describe, expect, it } from 'vitest'
import { resolveNpcAmmo, resolveNpcMeleeWeapon, resolveNpcRangedWeapon } from '../../ai/npcCombat'
import { createFoodBatch } from '../../items/foodFreshness'
import { Inventory } from '../../items/Inventory'
import { ITEM_CATALOG } from '../../items/itemCatalog'
import { isLiquidContainerInstance } from '../../items/itemInstances'
import { createLiquidContainerInstance } from '../../items/liquidContainer'
import { createWeaponInstance } from '../../items/weaponMaintenance'
import { commitNpcDeath } from '../../settlement/npcPostDeath'
import { createNpcAuthoritativeState, createNpcStateRegistry } from '../../settlement/npcState'
import { giveItemCountToNpc, giveItemInstanceToNpc } from './npcItemTransfer'

describe('giveItemCountToNpc', () => {
  it('transfers a selected stack quantity into NPC personalInventory', () => {
    const player = new Inventory({ stone: 5 })
    const npc = createNpcAuthoritativeState('npc:1', 0)
    const result = giveItemCountToNpc(
      { playerInventory: player, getNpcState: () => npc },
      { npcId: 'npc:1', kind: 'stone', amount: 2, nowDays: 3 },
    )
    expect(result).toEqual({ status: 'ok' })
    expect(player.count('stone')).toBe(3)
    expect(npc.personalInventory.count('stone')).toBe(2)
  })

  it('preserves perishable freshness batches', () => {
    const player = new Inventory()
    const batch = createFoodBatch(3, 1, 1)
    player.addWithFreshness('berries', 3, [batch], 4)
    const npc = createNpcAuthoritativeState('npc:1', 0)
    expect(giveItemCountToNpc(
      { playerInventory: player, getNpcState: () => npc },
      { npcId: 'npc:1', kind: 'berries', amount: 2, nowDays: 4 },
    )).toEqual({ status: 'ok' })
    const moved = npc.personalInventory.fifoFoodBatch('berries', 4)
    expect(moved?.acquiredAtDays).toBe(1)
    expect(player.count('berries')).toBe(1)
  })

  it('fails atomically when NPC capacity is exceeded', () => {
    const player = new Inventory({ stone: 5 })
    const npc = createNpcAuthoritativeState('npc:1', 0)
    npc.personalInventory.setBaseMaxWeight(0.0005)
    const result = giveItemCountToNpc(
      { playerInventory: player, getNpcState: () => npc },
      { npcId: 'npc:1', kind: 'stone', amount: 2, nowDays: 0 },
    )
    expect(result).toEqual({ status: 'destination_full' })
    expect(player.count('stone')).toBe(5)
    expect(npc.personalInventory.count('stone')).toBe(0)
  })

  it('rejects a dead recipient without mutating inventories', () => {
    const player = new Inventory({ stone: 2 })
    const npc = createNpcAuthoritativeState('npc:1', 0)
    npc.health.dead = true
    expect(giveItemCountToNpc(
      { playerInventory: player, getNpcState: () => npc },
      { npcId: 'npc:1', kind: 'stone', amount: 1, nowDays: 0 },
    )).toEqual({ status: 'recipient_dead' })
    expect(player.count('stone')).toBe(2)
  })

  it('rejects a missing recipient', () => {
    const player = new Inventory({ stone: 1 })
    expect(giveItemCountToNpc(
      { playerInventory: player, getNpcState: () => undefined },
      { npcId: 'npc:missing', kind: 'stone', amount: 1, nowDays: 0 },
    )).toEqual({ status: 'recipient_missing' })
    expect(player.count('stone')).toBe(1)
  })

  it('rejects when the player no longer owns enough', () => {
    const player = new Inventory({ stone: 1 })
    const npc = createNpcAuthoritativeState('npc:1', 0)
    expect(giveItemCountToNpc(
      { playerInventory: player, getNpcState: () => npc },
      { npcId: 'npc:1', kind: 'stone', amount: 2, nowDays: 0 },
    )).toEqual({ status: 'source_missing' })
  })
})

describe('giveItemInstanceToNpc', () => {
  it('preserves weapon instance id and condition', () => {
    const knife = createWeaponInstance('knife')
    knife.durability = 0.4
    knife.sharpness = 0.55
    const player = new Inventory(undefined, undefined, [knife])
    const npc = createNpcAuthoritativeState('npc:1', 0)
    expect(giveItemInstanceToNpc(
      { playerInventory: player, getNpcState: () => npc },
      { npcId: 'npc:1', instanceId: knife.id },
    )).toEqual({ status: 'ok' })
    expect(player.getInstance(knife.id)).toBeNull()
    const owned = npc.personalInventory.getInstance(knife.id)
    expect(owned).toEqual(knife)
    expect(resolveNpcMeleeWeapon(npc.personalInventory)?.kind).toBe('knife')
  })

  it('preserves liquid container contents', () => {
    const skin = createLiquidContainerInstance('waterskin_small')
    skin.liquid = 'water'
    skin.amountLitres = 1.5
    const player = new Inventory(undefined, undefined, [skin])
    const npc = createNpcAuthoritativeState('npc:1', 0)
    expect(giveItemInstanceToNpc(
      { playerInventory: player, getNpcState: () => npc },
      { npcId: 'npc:1', instanceId: skin.id },
    )).toEqual({ status: 'ok' })
    const owned = npc.personalInventory.getInstance(skin.id)
    expect(owned && isLiquidContainerInstance(owned)).toBe(true)
    if (owned && isLiquidContainerInstance(owned)) {
      expect(owned.amountLitres).toBe(1.5)
      expect(owned.liquid).toBe('water')
    }
  })
})

describe('gifted belongings and combat/ammo', () => {
  it('makes a gifted ranged weapon visible to the combat resolver', () => {
    const player = new Inventory({ short_bow: 1 })
    const npc = createNpcAuthoritativeState('npc:1', 0)
    giveItemCountToNpc(
      { playerInventory: player, getNpcState: () => npc },
      { npcId: 'npc:1', kind: 'short_bow', amount: 1, nowDays: 0 },
    )
    expect(resolveNpcRangedWeapon(npc.personalInventory)?.kind).toBe('short_bow')
  })

  it('resolves and consumes gifted personal ammo without touching carried', () => {
    const personal = new Inventory({ arrow: 3 })
    const carried = new Inventory({ arrow: 2 })
    const ranged = ITEM_CATALOG.short_bow.ranged!
    const ammo = resolveNpcAmmo([personal, carried], ranged)
    expect(ammo).toEqual({ kind: 'arrow', inventory: personal })
    ammo!.inventory.remove(ammo!.kind, 1)
    expect(personal.count('arrow')).toBe(2)
    expect(carried.count('arrow')).toBe(2)
  })

  it('falls back to carried hunter ammo when personal has none', () => {
    const personal = new Inventory()
    const carried = new Inventory({ arrow: 4 })
    const ranged = ITEM_CATALOG.short_bow.ranged!
    const ammo = resolveNpcAmmo([personal, carried], ranged)
    expect(ammo?.inventory).toBe(carried)
    ammo!.inventory.remove(ammo!.kind, 1)
    expect(carried.count('arrow')).toBe(3)
  })
})

describe('gifted belongings persistence and death', () => {
  it('round-trips transferred belongings through npc state serialize', () => {
    const player = new Inventory({ arrow: 5 })
    const registry = createNpcStateRegistry()
    registry.getOrCreate('npc:1', 0)
    giveItemCountToNpc(
      { playerInventory: player, getNpcState: (id) => registry.get(id) },
      { npcId: 'npc:1', kind: 'arrow', amount: 3, nowDays: 0 },
    )
    const snap = registry.serialize()
    const restored = createNpcStateRegistry(snap)
    expect(restored.getOrCreate('npc:1', 0).personalInventory.count('arrow')).toBe(3)
  })

  it('moves gifted personal belongings into corpse loot on death handoff', () => {
    const sword = createWeaponInstance('long_sword')
    sword.durability = 0.4
    const player = new Inventory(undefined, undefined, [sword])
    const npc = createNpcAuthoritativeState('npc:1', 0)
    giveItemInstanceToNpc(
      { playerInventory: player, getNpcState: () => npc },
      { npcId: 'npc:1', instanceId: sword.id },
    )
    commitNpcDeath({
      state: npc,
      personalInventory: npc.personalInventory,
      x: 1,
      z: 2,
      yaw: 0,
      nowDays: 5,
    })
    expect(npc.personalInventory.getInstance(sword.id)).toBeNull()
    expect(npc.postDeath?.loot.instances.some((row) => row.id === sword.id)).toBe(true)
  })
})
