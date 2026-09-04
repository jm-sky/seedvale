import { Vector3 } from 'three'
import type { HouseAssembly } from './houseBuilder'

/**
 * House door proximity controller (createSettlement refactor review, E2) —
 * owns the open/close hysteresis, drives `HouseAssembly.update(dt)`, and
 * reports whether any door's logical state changed so the caller can decide
 * to re-register colliders. Extracted out of `createSettlement.ts`'s
 * `update()`.
 *
 * @domain settlements
 * @system house-doors
 * @role Owns per-house door proximity hysteresis and change detection.
 */

/** How close the observer must be to a house entrance before the door swings open. */
export const HOUSE_DOOR_OPEN_DISTANCE = 2.6
export const HOUSE_DOOR_CLOSE_DISTANCE = 3.4

/** Pure hysteresis rule: an assembly wants its doors open when the observer is
 *  within `HOUSE_DOOR_OPEN_DISTANCE` of any entrance/door point, and keeps
 *  them open out to `HOUSE_DOOR_CLOSE_DISTANCE` while already open. */
export function shouldOpenHouseDoors(
  entrancesWorld: readonly { x: number, z: number }[],
  observerX: number,
  observerZ: number,
  anyDoorOpen: boolean,
): boolean {
  const threshold = anyDoorOpen ? HOUSE_DOOR_CLOSE_DISTANCE : HOUSE_DOOR_OPEN_DISTANCE
  for (const point of entrancesWorld) {
    const dist = Math.hypot(observerX - point.x, observerZ - point.z)
    if (dist <= threshold) return true
  }
  return false
}

export type HouseDoorController = {
  /** Returns true when any door's logical open state changed this tick — the
   *  caller owns collider re-registration. */
  update: (dt: number, observerPos: Vector3) => boolean
}

/** One assembly's precomputed world-space entrance/door points plus its
 *  per-door `lastOpen` snapshot for change detection. */
type AssemblyDoors = {
  assembly: HouseAssembly
  entrancesWorld: { x: number, z: number }[]
  lastOpen: boolean[]
}

/**
 * House roots are static after build (`buildAssemblyCollidersWorld` already
 * relies on reading `root.position`/`root.rotation.y` directly), so each
 * assembly's entrance/door points are resolved to world space once here,
 * rather than every frame.
 */
export function createHouseDoorController(
  assemblies: readonly HouseAssembly[],
): HouseDoorController {
  const _local = new Vector3()
  const perAssembly: AssemblyDoors[] = assemblies.map((assembly) => {
    const entrancesWorld: { x: number, z: number }[] = []
    for (const point of assembly.interactionPoints) {
      if (point.kind !== 'entrance' && point.kind !== 'door') continue
      _local.set(point.position.x, point.position.y, point.position.z)
      assembly.root.localToWorld(_local)
      entrancesWorld.push({ x: _local.x, z: _local.z })
    }
    return {
      assembly,
      entrancesWorld,
      lastOpen: assembly.doors.map((d) => d.isOpen()),
    }
  })

  return {
    update(dt, observerPos) {
      let changed = false
      for (const entry of perAssembly) {
        const anyDoorOpen = entry.assembly.doors.some((d) => d.isOpen())
        const wantOpen = shouldOpenHouseDoors(entry.entrancesWorld, observerPos.x, observerPos.z, anyDoorOpen)
        for (const door of entry.assembly.doors) door.setOpen(wantOpen)
        entry.assembly.update(dt)
        for (let i = 0; i < entry.assembly.doors.length; i++) {
          const isOpen = entry.assembly.doors[i]!.isOpen()
          if (isOpen !== entry.lastOpen[i]) {
            entry.lastOpen[i] = isOpen
            changed = true
          }
        }
      }
      return changed
    },
  }
}
