import * as THREE from 'three'

/**
 * Per-agent world-space diagnostic overlay for `AnimalAgent.showDebug()`
 * (fauna runtime debug tooling). Deliberately not a scene-wide debug system
 * like `debug/colliderDebugView.ts` — one instance is ever created, only for
 * whatever single agent is currently selected via `debug/faunaInspector.ts`,
 * and disposed by `hideDebug()`/agent disposal. Purely presentational: reads
 * the state it's handed every frame, never touches agent/AI state itself.
 */

export type AnimalDebugVisualState = {
  /** Agent's current ground position. */
  position: { x: number, z: number }
  /** Same terrain height sampler the agent's own movement uses — markers sit
   *  just above the ground rather than at y=0. */
  sampleHeight: (x: number, z: number) => number
  /** Current steering destination, when the active AI branch is actually
   *  steering toward one (village beeline / NPC chase) — `null` otherwise. */
  strategicDest: { x: number, z: number } | null
  /** Frenzy strategic-village snapshot, or `null` when not frenzied. */
  strategicVillage: { x: number, z: number, radius: number } | null
  /** Active nav-rescue route (chase or flee), or `[]` when no repath is
   *  currently in flight. */
  waypoints: readonly { x: number, z: number }[]
  waypointIndex: number
}

export type AnimalDebugVisual = {
  update: (state: AnimalDebugVisualState) => void
  dispose: () => void
}

const DEST_COLOR = 0x22e5ff
const VILLAGE_COLOR = 0xffa726
const WAYPOINT_COLOR = 0xffee58
const CURRENT_WAYPOINT_COLOR = 0xff5252
const MARKER_LIFT = 0.4
const MAX_WAYPOINTS = 32

export function createAnimalDebugVisual(parent: THREE.Object3D): AnimalDebugVisual {
  const group = new THREE.Group()
  group.name = 'animal-debug-visual'
  group.renderOrder = 30
  parent.add(group)

  const destMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 12, 8),
    new THREE.MeshBasicMaterial({ color: DEST_COLOR, depthTest: false }),
  )
  destMarker.visible = false
  group.add(destMarker)

  const destLineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
  const destLine = new THREE.Line(
    destLineGeometry,
    new THREE.LineBasicMaterial({ color: DEST_COLOR, depthTest: false }),
  )
  destLine.visible = false
  group.add(destLine)

  const villageCenterMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 12, 8),
    new THREE.MeshBasicMaterial({ color: VILLAGE_COLOR, depthTest: false }),
  )
  villageCenterMarker.visible = false
  group.add(villageCenterMarker)

  // Unit ring (radius 1), scaled per-village at update time.
  const villageRing = new THREE.Mesh(
    new THREE.RingGeometry(0.92, 1, 40),
    new THREE.MeshBasicMaterial({
      color: VILLAGE_COLOR,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
      depthTest: false,
    }),
  )
  villageRing.rotation.x = -Math.PI / 2
  villageRing.visible = false
  group.add(villageRing)

  const waypointMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.2, 8, 6),
    new THREE.MeshBasicMaterial({ color: WAYPOINT_COLOR, depthTest: false }),
    MAX_WAYPOINTS,
  )
  waypointMesh.count = 0
  group.add(waypointMesh)

  const currentWaypointMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 10, 8),
    new THREE.MeshBasicMaterial({ color: CURRENT_WAYPOINT_COLOR, depthTest: false }),
  )
  currentWaypointMarker.visible = false
  group.add(currentWaypointMarker)

  const scratchMatrix = new THREE.Matrix4()
  const scratchPos = new THREE.Vector3()
  const identityQuat = new THREE.Quaternion()
  const unitScale = new THREE.Vector3(1, 1, 1)

  return {
    update(state) {
      if (state.strategicDest) {
        const y = state.sampleHeight(state.strategicDest.x, state.strategicDest.z) + MARKER_LIFT
        destMarker.visible = true
        destMarker.position.set(state.strategicDest.x, y, state.strategicDest.z)
        destLine.visible = true
        const positions = destLine.geometry.attributes.position as THREE.BufferAttribute
        const originY = state.sampleHeight(state.position.x, state.position.z) + MARKER_LIFT
        positions.setXYZ(0, state.position.x, originY, state.position.z)
        positions.setXYZ(1, state.strategicDest.x, y, state.strategicDest.z)
        positions.needsUpdate = true
      } else {
        destMarker.visible = false
        destLine.visible = false
      }

      if (state.strategicVillage) {
        const { x, z, radius } = state.strategicVillage
        const y = state.sampleHeight(x, z) + 0.05
        villageCenterMarker.visible = true
        villageCenterMarker.position.set(x, y + MARKER_LIFT, z)
        villageRing.visible = true
        villageRing.position.set(x, y, z)
        villageRing.scale.setScalar(radius)
      } else {
        villageCenterMarker.visible = false
        villageRing.visible = false
      }

      let count = 0
      for (let i = 0; i < state.waypoints.length && count < MAX_WAYPOINTS; i++) {
        if (i === state.waypointIndex) continue
        const wp = state.waypoints[i]!
        scratchPos.set(wp.x, state.sampleHeight(wp.x, wp.z) + 0.2, wp.z)
        scratchMatrix.compose(scratchPos, identityQuat, unitScale)
        waypointMesh.setMatrixAt(count++, scratchMatrix)
      }
      waypointMesh.count = count
      waypointMesh.instanceMatrix.needsUpdate = true

      const current = state.waypoints[state.waypointIndex]
      if (current) {
        currentWaypointMarker.visible = true
        currentWaypointMarker.position.set(current.x, state.sampleHeight(current.x, current.z) + 0.3, current.z)
      } else {
        currentWaypointMarker.visible = false
      }
    },
    dispose() {
      group.removeFromParent()
      destMarker.geometry.dispose()
      ;(destMarker.material as THREE.Material).dispose()
      destLineGeometry.dispose()
      ;(destLine.material as THREE.Material).dispose()
      villageCenterMarker.geometry.dispose()
      ;(villageCenterMarker.material as THREE.Material).dispose()
      villageRing.geometry.dispose()
      ;(villageRing.material as THREE.Material).dispose()
      waypointMesh.geometry.dispose()
      ;(waypointMesh.material as THREE.Material).dispose()
      currentWaypointMarker.geometry.dispose()
      ;(currentWaypointMarker.material as THREE.Material).dispose()
    },
  }
}
