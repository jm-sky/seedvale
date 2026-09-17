// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { AnimalAgent, type AnimalAgentDeps } from '../../fauna/AnimalAgent'
import { ANIMAL_DEFS } from '../../fauna/animalDefs'
import { DRY_WATER_SAMPLE } from '../../terrain/waterSample'
import type { PlayerActionContext } from './actionContext'
import { createMountActions } from './mountActions'

const sampleHeight = () => 0
const sampleLocalWater = () => DRY_WATER_SAMPLE
const collidersNear = () => []

function makeDeps(overrides: Partial<AnimalAgentDeps> = {}): AnimalAgentDeps {
  return {
    def: ANIMAL_DEFS.horse,
    animalId: 'test-horse',
    sampleHeight,
    waterLevel: -10,
    sampleLocalWater,
    collidersNear,
    x: 0,
    z: 0,
    ...overrides,
  }
}

function setupMount(opts?: {
  refreshStayOnPlayerDismount?: (animal: AnimalAgent) => void
}) {
  const toast = { show: vi.fn() }
  const hud = { setMounted: vi.fn() }
  const player = {
    isDowned: () => false,
    setMounted: vi.fn(),
    setMountedTransform: vi.fn(),
    setPosition: vi.fn(),
    mesh: { position: { x: 0, y: 0, z: 0 } },
    skills: { riding: { value: 0 } },
    needs: { stamina: { current: 1, max: 1 } },
    effectiveAttributes: () => ({ endurance: 1 }),
  }
  const ctx = {
    player,
    toast,
    hud,
    busy: { isActive: () => false },
    timeSkip: { isActive: () => false },
    restCamp: { isActive: () => false },
    keyboard: { consumeDismount: () => false, state: {} },
    mouseLook: { state: { yaw: 0 } },
    dayNight: { elapsedDays: 0 },
    bundle: { chunkManager: { sampleHeight } },
  } as unknown as PlayerActionContext

  const refreshStayOnPlayerDismount = opts?.refreshStayOnPlayerDismount
    ?? vi.fn((animal: AnimalAgent) => {
      animal.setOwnedControlMode('stay')
    })

  const actions = createMountActions(
    ctx,
    () => null,
    undefined,
    { refreshStayOnPlayerDismount },
  )
  return { actions, refreshStayOnPlayerDismount, toast, player }
}

describe('createMountActions owned-control Stay refresh (plan fauna-035)', () => {
  it('player dismount refreshes Stay anchor to the horse position at B', () => {
    const { actions, refreshStayOnPlayerDismount } = setupMount()
    const horse = new AnimalAgent(makeDeps({ animalId: 'owned-stay', x: 2, z: 3 }))
    horse.transferOwnershipToPlayer()
    horse.setOwnedControlMode('stay')
    expect(horse.snapshot().control?.stayAnchor).toEqual({ x: 2, z: 3 })

    expect(actions.tryMount(horse)).toBe(true)
    horse.mesh.position.set(40, 0, -15)
    actions.dismount('player')

    expect(refreshStayOnPlayerDismount).toHaveBeenCalledTimes(1)
    expect(refreshStayOnPlayerDismount).toHaveBeenCalledWith(horse)
    expect(horse.getOwnedControlMode()).toBe('stay')
    expect(horse.snapshot().control?.stayAnchor).toEqual({ x: 40, z: -15 })
  })

  it('Follow dismount does not invoke Stay refresh', () => {
    const { actions, refreshStayOnPlayerDismount } = setupMount()
    const horse = new AnimalAgent(makeDeps({ animalId: 'owned-follow', x: 1, z: 1 }))
    horse.transferOwnershipToPlayer()
    expect(horse.getOwnedControlMode()).toBe('follow')

    expect(actions.tryMount(horse)).toBe(true)
    horse.mesh.position.set(20, 0, 20)
    actions.dismount('player')

    expect(refreshStayOnPlayerDismount).not.toHaveBeenCalled()
    expect(horse.getOwnedControlMode()).toBe('follow')
    expect(horse.snapshot().control?.stayAnchor).toBeUndefined()
  })

  it('fall exit does not refresh Stay anchor', () => {
    const { actions, refreshStayOnPlayerDismount } = setupMount()
    const horse = new AnimalAgent(makeDeps({ animalId: 'owned-fall', x: 5, z: 5 }))
    horse.transferOwnershipToPlayer()
    horse.setOwnedControlMode('stay')

    expect(actions.tryMount(horse)).toBe(true)
    horse.mesh.position.set(30, 0, 0)
    actions.dismount('fall')

    expect(refreshStayOnPlayerDismount).not.toHaveBeenCalled()
    expect(horse.getOwnedControlMode()).toBe('stay')
    expect(horse.snapshot().control?.stayAnchor).toEqual({ x: 5, z: 5 })
  })

  it('non-player-owned mount does not refresh Stay on player dismount', () => {
    const { actions, refreshStayOnPlayerDismount } = setupMount()
    const horse = new AnimalAgent(makeDeps({ animalId: 'merchant-horse', x: 0, z: 0 }))
    expect(horse.isPlayerOwned()).toBe(false)
    // Household mounts have no player owned-control mode to refresh.
    expect(actions.tryMount(horse)).toBe(true)
    horse.mesh.position.set(12, 0, 8)
    actions.dismount('player')

    expect(refreshStayOnPlayerDismount).not.toHaveBeenCalled()
  })
})
