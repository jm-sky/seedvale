import { describe, expect, it } from 'vitest'
import { pickDryingRecipe, resolveDryingOutput, startDryingProcess } from '../world/dryingRacks'
import { processCookedBatches } from './campfireCooking'
import {
  CARRIED_FOOD_DECAY,
  createFoodBatch,
  foodBatchEffectiveAge,
  foodHungerRelief,
  getFoodBatchFreshnessStage,
  inheritProcessedFoodBatch,
  STORED_FOOD_DECAY,
} from './foodFreshness'
import { Inventory } from './Inventory'

describe('food provenance / freshness (plan items-player-002)', () => {
  it('keeps exact timestamps distinct instead of averaging', () => {
    const inv = new Inventory()
    inv.add('deer_meat', 5, 10.15, 'deer')
    inv.add('deer_meat', 3, 12.20, 'deer')
    const batches = inv.getFoodBatches('deer_meat', 12.20)
    expect(batches).toHaveLength(2)
    expect(batches.map((b) => b.acquiredAtDays).sort((a, b) => a - b)).toEqual([10.15, 12.20])
  })

  it('splits and merges losslessly when metadata matches', () => {
    const inv = new Inventory()
    inv.add('berries', 4, 3)
    const taken = inv.removeWithFreshness('berries', 2, 3)
    expect(taken).toEqual([createFoodBatch(2, 3, 1)])
    expect(inv.getFoodBatches('berries', 3)).toEqual([createFoodBatch(2, 3, 1)])
    inv.addWithFreshness('berries', 2, taken!, 3)
    expect(inv.getFoodBatches('berries', 3)).toEqual([createFoodBatch(4, 3, 1)])
  })

  it('uses FIFO by remaining effective shelf-life after different storage histories', () => {
    const carried = new Inventory()
    carried.add('raw_meat', 1, 0)
    const stored = new Inventory({}, Infinity, undefined, undefined, Infinity, STORED_FOOD_DECAY)
    stored.add('raw_meat', 1, 0)
    const now = 1
    const fromCarried = carried.removeWithFreshness('raw_meat', 1, now)!
    const fromStored = stored.removeWithFreshness('raw_meat', 1, now)!
    const mixed = new Inventory()
    mixed.addWithFreshness('raw_meat', 1, fromStored, now)
    mixed.addWithFreshness('raw_meat', 1, fromCarried, now)
    const fifo = mixed.fifoFoodBatch('raw_meat', now)!
    expect(foodBatchEffectiveAge(fifo, now)).toBeCloseTo(1, 5)
  })

  it('preserves mixed-species roasted provenance and nutrition', () => {
    const deer = createFoodBatch(1, 0, 1, 'deer')
    const wolf = createFoodBatch(1, 0, 1, 'wolf')
    const outputs = processCookedBatches('deer_meat', 'roasted_meat', [deer], 0, CARRIED_FOOD_DECAY)
      .concat(processCookedBatches('wolf_meat', 'roasted_meat', [wolf], 0, CARRIED_FOOD_DECAY))
    expect(outputs.map((b) => b.sourceSpecies)).toEqual(['deer', 'wolf'])
    expect(foodHungerRelief('roasted_meat', 'deer')).not.toBe(foodHungerRelief('roasted_meat', 'wolf'))
  })

  it('keeps medium input relatively medium after processing', () => {
    const input = createFoodBatch(1, 0, 1, 'deer')
    const completedAt = 1
    expect(getFoodBatchFreshnessStage('deer_meat', input, completedAt)).toBe('medium')
    const output = inheritProcessedFoodBatch(input, 'deer_meat', 'roasted_meat', completedAt, CARRIED_FOOD_DECAY)
    expect(output).not.toBeNull()
    expect(getFoodBatchFreshnessStage('roasted_meat', output!, completedAt)).toBe('medium')
    expect(foodBatchEffectiveAge(output!, completedAt)).toBeCloseTo(1.5, 5)
  })

  it('refuses to cook spoiled input', () => {
    const spoiled = createFoodBatch(1, 0, 1, 'deer')
    expect(inheritProcessedFoodBatch(spoiled, 'deer_meat', 'roasted_meat', 3, CARRIED_FOOD_DECAY)).toBeNull()
    expect(processCookedBatches('deer_meat', 'roasted_meat', [spoiled], 3, CARRIED_FOOD_DECAY)).toEqual([])
  })

  it('ages drying input during the process and clocks output at completion, not collect', () => {
    const recipe = pickDryingRecipe((kind) => kind === 'deer_meat')!
    const input = [createFoodBatch(1, 0, 1, 'deer')]
    const process = startDryingProcess('rack:1', recipe, 0, input)
    const completedAt = 0 + recipe.durationDays
    const atCompletion = resolveDryingOutput(process, completedAt)
    const delayed = resolveDryingOutput(process, completedAt + 2)
    expect(atCompletion).toHaveLength(1)
    expect(atCompletion[0]!.acquiredAtDays).toBe(completedAt)
    expect(atCompletion[0]!.sourceSpecies).toBe('deer')
    expect(foodBatchEffectiveAge(delayed[0]!, completedAt + 2))
      .toBeCloseTo(foodBatchEffectiveAge(atCompletion[0]!, completedAt) + 2, 5)
  })

  it('gives no edible drying output when the input spoils before completion', () => {
    const recipe = pickDryingRecipe((kind) => kind === 'fish')!
    const almostGone = createFoodBatch(1, 0, 1)
    almostGone.accumulatedEffectiveAge = 1.4
    almostGone.lastCheckpointDays = 0
    const process = startDryingProcess('rack:2', recipe, 0, [almostGone])
    expect(resolveDryingOutput(process, 0 + recipe.durationDays)).toEqual([])
  })

  it('inventory → chest → inventory does not reset or double-count effective age', () => {
    const player = new Inventory()
    player.add('carrot', 1, 0)
    const chest = new Inventory({}, Infinity, undefined, undefined, Infinity, STORED_FOOD_DECAY)
    const toChest = player.removeWithFreshness('carrot', 1, 2)!
    expect(foodBatchEffectiveAge(toChest[0]!, 2)).toBeCloseTo(2, 5)
    chest.addWithFreshness('carrot', 1, toChest, 2)
    expect(foodBatchEffectiveAge(chest.fifoFoodBatch('carrot', 4)!, 4)).toBeCloseTo(3, 5)
    const back = chest.removeWithFreshness('carrot', 1, 4)!
    player.addWithFreshness('carrot', 1, back, 4)
    expect(foodBatchEffectiveAge(player.fifoFoodBatch('carrot', 5)!, 5)).toBeCloseTo(4, 5)
  })

  it('a carried chest keeps 0.5× decay on its contents', () => {
    const chest = new Inventory({}, Infinity, undefined, undefined, Infinity, STORED_FOOD_DECAY)
    chest.add('apple', 1, 0)
    expect(chest.decayModifier).toBe(STORED_FOOD_DECAY)
    expect(foodBatchEffectiveAge(chest.fifoFoodBatch('apple', 2)!, 2)).toBeCloseTo(1, 5)
  })
})
