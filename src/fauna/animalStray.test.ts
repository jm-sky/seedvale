import { describe, expect, it } from 'vitest'
import type { AnimalOwner } from './animalOwnership'
import {
  beginStrayState,
  classifyLostLivestock,
  clearStrayEpisode,
  hydrateStrayState,
  inspectStrayedCorpseState,
  isEligibleLostLivestock,
  isStrayedAnimalReturned,
  isStraySurvivalAssistActive,
  type LivestockStrayCandidate,
  predatorPressureAt,
  selectLostLivestock,
  selectStrayDisplacementTarget,
  shouldRetainStrayedCorpse,
  snapshotStrayState,
  STRAY_CORPSE_RETENTION_SECONDS,
  STRAY_MIN_DISTANCE,
  STRAY_RETURN_RADIUS,
  straySurvivalFleeRangeBonus,
} from './animalStray'

function household(houseId: string): AnimalOwner {
  return { kind: 'household', houseId }
}

function candidate(overrides: Partial<LivestockStrayCandidate> = {}): LivestockStrayCandidate {
  return {
    animalId: 'sheep-house0-0',
    kind: 'sheep',
    settlementId: 'home',
    houseId: 'home:home:0',
    dead: false,
    mounted: false,
    owner: household('home:home:0'),
    stray: undefined,
    ...overrides,
  }
}

describe('lost livestock selection (fauna-024)', () => {
  it('picks an existing eligible household animal and never invents an id', () => {
    const sheep = candidate({ animalId: 'sheep-house0-0' })
    const cow = candidate({ animalId: 'cow-house1-0', kind: 'cow', houseId: 'home:home:1', owner: household('home:home:1') })
    const selected = selectLostLivestock([sheep, cow], 'home')
    expect(selected?.animalId).toBe(sheep.animalId)
    expect(selected?.animalId).toBe('sheep-house0-0')
  })

  it('is deterministic for the same seed and candidate set', () => {
    const pool = [
      candidate({ animalId: 'sheep-house0-0' }),
      candidate({ animalId: 'sheep-house2-0', houseId: 'home:home:2', owner: household('home:home:2') }),
    ]
    expect(selectLostLivestock(pool, 'home:0')?.animalId).toBe(selectLostLivestock(pool, 'home:0')?.animalId)
  })

  it('rejects dead, mounted, player-owned, already-strayed, and wrong household animals', () => {
    expect(isEligibleLostLivestock(candidate({ dead: true }))).toBe(false)
    expect(isEligibleLostLivestock(candidate({ mounted: true }))).toBe(false)
    expect(isEligibleLostLivestock(candidate({ owner: { kind: 'player' } }))).toBe(false)
    expect(isEligibleLostLivestock(candidate({
      stray: { active: true, originX: 0, originZ: 0, survivalAssist: true, corpseInspected: false },
    }))).toBe(false)
    expect(isEligibleLostLivestock(candidate({
      stray: { active: false, originX: 0, originZ: 0, survivalAssist: false, corpseInspected: false },
    }))).toBe(false)
    expect(isEligibleLostLivestock(candidate(), 'home:home:9')).toBe(false)
    expect(selectLostLivestock([candidate({ dead: true })], 'home')).toBeNull()
  })
})

describe('stray start/clear/return (fauna-024)', () => {
  it('start preserves identity flags and is idempotent', () => {
    const first = beginStrayState(undefined, { x: 4, z: 7 })
    expect(first.started).toBe(true)
    expect(first.state.active).toBe(true)
    expect(first.state.survivalAssist).toBe(true)
    expect(first.state.originX).toBe(4)
    const second = beginStrayState(first.state, { x: 90, z: 90 })
    expect(second.started).toBe(false)
    expect(second.state.originX).toBe(4)
    const afterClear = beginStrayState(clearStrayEpisode(first.state), { x: 90, z: 90 })
    expect(afterClear.started).toBe(false)
    expect(afterClear.state.originX).toBe(4)
  })

  it('clear immediately disables survival assist', () => {
    const started = beginStrayState(undefined, { x: 0, z: 0 }).state
    const cleared = clearStrayEpisode(started)
    expect(cleared?.active).toBe(false)
    expect(isStraySurvivalAssistActive(cleared)).toBe(false)
    expect(straySurvivalFleeRangeBonus(cleared)).toBe(0)
  })

  it('return predicate is true only inside the stored origin radius while active and alive', () => {
    const stray = beginStrayState(undefined, { x: 10, z: 10 }).state
    expect(isStrayedAnimalReturned(stray, { x: 10, z: 12 }, false)).toBe(true)
    expect(isStrayedAnimalReturned(stray, { x: 10 + STRAY_RETURN_RADIUS + 1, z: 10 }, false)).toBe(false)
    expect(isStrayedAnimalReturned(stray, { x: 10, z: 10 }, true)).toBe(false)
    expect(isStrayedAnimalReturned(undefined, { x: 10, z: 10 }, false)).toBe(false)
  })
})

describe('semi-safe displacement (fauna-024)', () => {
  it('returns a point outside the home yard and rejects invalid terrain', () => {
    let n = 0
    const dest = selectStrayDisplacementTarget({
      origin: { x: 0, z: 0 },
      isValid: (_x, z) => z >= 0,
      random: () => {
        n += 1
        return (n % 7) / 7
      },
    })
    expect(dest).not.toBeNull()
    expect(Math.hypot(dest!.x, dest!.z)).toBeGreaterThanOrEqual(STRAY_MIN_DISTANCE)
  })

  it('prefers a less-pressured candidate without requiring zero predators', () => {
    const sequence = [0, 0, 0.25, 0, 0.5, 0]
    let i = 0
    const dest = selectStrayDisplacementTarget({
      origin: { x: 0, z: 0 },
      isValid: () => true,
      predators: [{ x: 10, z: 0 }],
      minDistance: 10,
      maxDistance: 10,
      attempts: 3,
      random: () => sequence[i++] ?? 0,
    })
    expect(dest).not.toBeNull()
    expect(predatorPressureAt(dest!.x, dest!.z, [{ x: 10, z: 0 }])).toBeLessThan(
      predatorPressureAt(10, 0, [{ x: 10, z: 0 }]),
    )
  })
})

describe('survival assist and corpse retention (fauna-024)', () => {
  it('survival assist is gated on the active flagged episode only', () => {
    const active = beginStrayState(undefined, { x: 0, z: 0 }).state
    expect(isStraySurvivalAssistActive(active)).toBe(true)
    expect(straySurvivalFleeRangeBonus(active)).toBeGreaterThan(0)
    expect(isStraySurvivalAssistActive(undefined)).toBe(false)
    expect(straySurvivalFleeRangeBonus(undefined)).toBe(0)
  })

  it('retains an uninspected stray corpse past the short TTL and releases after inspect', () => {
    const stray = beginStrayState(undefined, { x: 0, z: 0 }).state
    expect(shouldRetainStrayedCorpse(stray, true, 60)).toBe(true)
    expect(shouldRetainStrayedCorpse(stray, true, STRAY_CORPSE_RETENTION_SECONDS)).toBe(false)
    const inspected = inspectStrayedCorpseState(stray, true)
    expect(inspected?.corpseInspected).toBe(true)
    expect(shouldRetainStrayedCorpse(inspected, true, 60)).toBe(false)
    expect(inspectStrayedCorpseState(stray, false)?.corpseInspected).toBe(false)
  })

  it('classifies world lookup from animal state, not quest flags', () => {
    const stray = beginStrayState(undefined, { x: 0, z: 0 }).state
    expect(classifyLostLivestock({ found: true, dead: false, stray })).toBe('lost-alive')
    expect(classifyLostLivestock({ found: true, dead: true, stray })).toBe('corpse-uninspected')
    expect(classifyLostLivestock({
      found: true,
      dead: true,
      stray: inspectStrayedCorpseState(stray, true),
    })).toBe('corpse-inspected')
    expect(classifyLostLivestock({
      found: true,
      dead: false,
      stray: clearStrayEpisode(stray),
    })).toBe('returned')
    expect(classifyLostLivestock({ found: false, dead: false, stray: undefined })).toBe('unavailable')
  })

  it('round-trips stray/dead/inspection through snapshot hydrate', () => {
    const live = beginStrayState(undefined, { x: 3, z: 8 }).state
    expect(hydrateStrayState(snapshotStrayState(live))).toEqual(live)
    const deadInspected = inspectStrayedCorpseState(live, true)
    expect(hydrateStrayState(snapshotStrayState(deadInspected))).toEqual(deadInspected)
    const returned = clearStrayEpisode(live)
    expect(hydrateStrayState(snapshotStrayState(returned))).toEqual(returned)
    expect(hydrateStrayState(undefined)).toBeUndefined()
  })
})
