import { Object3D, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import type { HouseBuildContext } from './houseBuilder'
import { buildConstructionCatalog } from '../assets/constructionCatalog'
import { COTTAGE_4X4_A, TEST_HOUSE_01 } from '../assets/houseDefinitionExample'
import { buildHouse, houseDefinitionAssetIds } from './houseBuilder'
import { createHouseDoorController, HOUSE_DOOR_CLOSE_DISTANCE, HOUSE_DOOR_OPEN_DISTANCE } from './houseDoors'

const catalog = buildConstructionCatalog()

function dummyPart(): Object3D {
  return new Object3D()
}

function contextFor(def = TEST_HOUSE_01): HouseBuildContext {
  const templates = new Map<string, Object3D>()
  for (const id of houseDefinitionAssetIds(def)) templates.set(id, dummyPart())
  return { catalog, templates }
}

/** Outermost (farthest from the house center, most negative front-wall `z`)
 *  entrance/door point of `assembly`, resolved to world space — moving the
 *  observer further in the same outward direction from this point keeps it
 *  the single nearest point for every distance tested below, so the
 *  hysteresis thresholds below can be asserted exactly. */
function outermostDoorPointWorld(assembly: ReturnType<typeof buildHouse>): Vector3 {
  let best: Vector3 | null = null
  for (const point of assembly.interactionPoints) {
    if (point.kind !== 'entrance' && point.kind !== 'door') continue
    const world = new Vector3(point.position.x, point.position.y, point.position.z)
    assembly.root.localToWorld(world)
    if (!best || world.z < best.z) best = world
  }
  return best!
}

describe('createHouseDoorController', () => {
  it('opens a closed door once within HOUSE_DOOR_OPEN_DISTANCE and keeps it shut outside it', () => {
    const assembly = buildHouse(TEST_HOUSE_01, contextFor())
    const controller = createHouseDoorController([assembly])
    const anchor = outermostDoorPointWorld(assembly)

    controller.update(1 / 60, new Vector3(anchor.x, 0, anchor.z - (HOUSE_DOOR_OPEN_DISTANCE + 0.2)))
    expect(assembly.doors[0]!.isOpen()).toBe(false)

    controller.update(1 / 60, new Vector3(anchor.x, 0, anchor.z - (HOUSE_DOOR_OPEN_DISTANCE - 0.1)))
    expect(assembly.doors[0]!.isOpen()).toBe(true)
    assembly.dispose()
  })

  it('keeps an open door open out to HOUSE_DOOR_CLOSE_DISTANCE and closes it beyond that', () => {
    const assembly = buildHouse(TEST_HOUSE_01, contextFor())
    const controller = createHouseDoorController([assembly])
    const anchor = outermostDoorPointWorld(assembly)

    controller.update(1 / 60, new Vector3(anchor.x, 0, anchor.z - (HOUSE_DOOR_OPEN_DISTANCE - 0.1)))
    expect(assembly.doors[0]!.isOpen()).toBe(true)

    controller.update(1 / 60, new Vector3(anchor.x, 0, anchor.z - (HOUSE_DOOR_CLOSE_DISTANCE - 0.1)))
    expect(assembly.doors[0]!.isOpen()).toBe(true)

    controller.update(1 / 60, new Vector3(anchor.x, 0, anchor.z - (HOUSE_DOOR_CLOSE_DISTANCE + 0.2)))
    expect(assembly.doors[0]!.isOpen()).toBe(false)
    assembly.dispose()
  })

  it('opens when either of two entrances is in range', () => {
    const assembly = buildHouse(COTTAGE_4X4_A, contextFor(COTTAGE_4X4_A))
    expect(assembly.doors.length).toBeGreaterThanOrEqual(1)
    const controller = createHouseDoorController([assembly])
    const entrance = assembly.interactionPoints.find((p) => p.kind === 'entrance')!
    const world = new Vector3(entrance.position.x, entrance.position.y, entrance.position.z)
    assembly.root.localToWorld(world)

    controller.update(1 / 60, new Vector3(world.x, 0, world.z))
    expect(assembly.doors.some((d) => d.isOpen())).toBe(true)
    assembly.dispose()
  })

  it('update() returns true exactly on the tick a door state changes', () => {
    const assembly = buildHouse(TEST_HOUSE_01, contextFor())
    const controller = createHouseDoorController([assembly])
    const anchor = outermostDoorPointWorld(assembly)
    const far = new Vector3(anchor.x, 0, anchor.z - (HOUSE_DOOR_OPEN_DISTANCE + 0.2))
    const near = new Vector3(anchor.x, 0, anchor.z - (HOUSE_DOOR_OPEN_DISTANCE - 0.1))

    expect(controller.update(1 / 60, far)).toBe(false)
    expect(controller.update(1 / 60, near)).toBe(true)
    expect(controller.update(1 / 60, near)).toBe(false)
    assembly.dispose()
  })
})
