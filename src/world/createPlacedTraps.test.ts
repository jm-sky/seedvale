import { Scene } from 'three'
import { describe, expect, it } from 'vitest'
import type { TrapItemInstance } from '../items/itemInstances'
import { createPlacedTraps } from './createPlacedTraps'

const sampleHeight = (): number => 0
const SEED = 7

function setup() {
  const captures: unknown[] = []
  const baitReturns: unknown[] = []
  const traps = createPlacedTraps(new Scene(), sampleHeight, SEED, {
    onCapture: (event) => captures.push(event),
    onBaitReturned: (kind) => baitReturns.push(kind),
  })
  return { traps, captures, baitReturns }
}

const trapInstance = (kind: TrapItemInstance['kind'], durability: number): TrapItemInstance => ({
  id: `${kind}:1`,
  kind,
  durability,
})

describe('PlacedTraps.activeLures (plan fauna-014 §3/§11)', () => {
  it('is empty with no traps placed', () => {
    const { traps } = setup()
    expect(traps.activeLures()).toEqual([])
  })

  it('excludes a placed-but-unarmed trap', () => {
    const { traps } = setup()
    traps.place(trapInstance('trap_simple', 2), 1, 2, 0)
    expect(traps.activeLures()).toEqual([])
  })

  it('excludes an armed trap with no bait', () => {
    const { traps } = setup()
    const record = traps.place(trapInstance('trap_simple', 2), 1, 2, 0)
    traps.activate(record.id, 0.5, 0)
    expect(traps.activeLures()).toEqual([])
  })

  it('includes exactly one descriptor for an armed, baited trap', () => {
    const { traps } = setup()
    const record = traps.place(trapInstance('trap_good', 5), 3, -4, 0)
    traps.activate(record.id, 0.5, 0)
    traps.attachBait(record.id, 'raw_meat')
    expect(traps.activeLures()).toEqual([
      { trapId: record.id, kind: 'good', x: 3, z: -4, baitKind: 'raw_meat' },
    ])
  })

  it('drops a lure once the trap is disarmed', () => {
    const { traps } = setup()
    const record = traps.place(trapInstance('trap_simple', 2), 0, 0, 0)
    traps.activate(record.id, 0.5, 0)
    traps.attachBait(record.id, 'carrot')
    expect(traps.activeLures()).toHaveLength(1)
    traps.deactivate(record.id)
    expect(traps.activeLures()).toEqual([])
  })
})
