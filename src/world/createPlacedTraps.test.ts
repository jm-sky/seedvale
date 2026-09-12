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

describe('PlacedTraps.attractionSources (plan fauna-014 / fauna-023)', () => {
  it('is empty with no traps placed', () => {
    const { traps } = setup()
    expect(traps.attractionSources()).toEqual([])
  })

  it('excludes a placed-but-unarmed trap', () => {
    const { traps } = setup()
    traps.place(trapInstance('trap_simple', 2), 1, 2, 0)
    expect(traps.attractionSources()).toEqual([])
  })

  it('excludes an armed trap with no bait', () => {
    const { traps } = setup()
    const record = traps.place(trapInstance('trap_simple', 2), 1, 2, 0)
    traps.activate(record.id, 0.5, 0)
    expect(traps.attractionSources()).toEqual([])
  })

  it('includes exactly one attraction source for an armed, baited trap', () => {
    const { traps } = setup()
    const record = traps.place(trapInstance('trap_good', 5), 3, -4, 0)
    traps.activate(record.id, 0.5, 0)
    traps.attachBait(record.id, 'raw_meat')
    expect(traps.attractionSources()).toEqual([
      {
        id: `trap:${record.id}`,
        kind: 'trapBait',
        x: 3,
        z: -4,
        strength: 1,
        radius: 8,
        itemKind: 'raw_meat',
        trapKind: 'good',
      },
    ])
  })

  it('drops a source once the trap is disarmed', () => {
    const { traps } = setup()
    const record = traps.place(trapInstance('trap_simple', 2), 0, 0, 0)
    traps.activate(record.id, 0.5, 0)
    traps.attachBait(record.id, 'carrot')
    expect(traps.attractionSources()).toHaveLength(1)
    traps.deactivate(record.id)
    expect(traps.attractionSources()).toEqual([])
  })
})
