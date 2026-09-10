import * as THREE from 'three'

/** Presentational footprint the shared placement ghost can draw — independent
 *  of the domain clearance radius used by `evaluateGroundPlacement`. */
export type PlacementPreviewFootprint =
  | { kind: 'circle'; radius: number }
  | { kind: 'box'; width: number; depth: number }

/**
 * Vanilla Three.js ghost mesh for the shared object-placement preview mode
 * (plan `ui-input-004` §2/§7, shapes/yaw by `ui-input-012`) — a world-space
 * footprint marker following the player's aim, colored by the three-state
 * placement presentation (ready / preparation / invalid). Circle and box geometries are
 * created once and only scaled/shown per frame. Pure rendering: no domain
 * logic, no scene ownership beyond its own group (the caller adds/removes
 * it from `scene`), same split as `world/terrainPreparationPreview.ts`.
 */
const READY_COLOR = 0x4caf50
const PREPARATION_COLOR = 0xe0a14a
const INVALID_COLOR = 0xe0524a
const FILL_OPACITY = 0.35
const LINE_OPACITY = 0.9
const SEGMENTS = 24

function circlePositions(segments: number): number[] {
  const positions: number[] = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    positions.push(Math.cos(a), 0, Math.sin(a))
  }
  return positions
}

const BOX_CORNERS = [
  -0.5, 0, -0.5,
  0.5, 0, -0.5,
  0.5, 0, 0.5,
  -0.5, 0, 0.5,
]

export type PlacementPreviewGhost = {
  group: THREE.Object3D
  /** Switches between the prebuilt circle/box meshes and scales them —
   *  cheap, no geometry rebuild. */
  setFootprint: (footprint: PlacementPreviewFootprint) => void
  /** Positions a front/entrance marker on the local `-Z` box edge — same
   *  front convention as `residentialBuildingApproachLocal()`. Hidden for
   *  circle footprints and when `visible` is false. */
  setEntranceMarker: (visible: boolean) => void
  /** Positions the whole ghost at world `(x, z)`, feet at `y`, oriented by
   *  `yaw` (circle footprints are rotationally symmetric). */
  setTransform: (x: number, z: number, y: number, yaw?: number) => void
  setPreviewState: (state: 'ready' | 'preparation' | 'invalid') => void
  dispose: () => void
}

/** Local-Z of the box footprint's front edge. Matches residential local
 *  `-Z` front (plan items-player-022). */
export function placementEntranceMarkerLocalZ(depth: number): number {
  return -depth / 2
}

export function createPlacementPreviewGhost(): PlacementPreviewGhost {
  const group = new THREE.Group()
  group.name = 'placement-preview-ghost'
  group.renderOrder = 10

  const fillMaterial = new THREE.MeshBasicMaterial({
    color: READY_COLOR,
    transparent: true,
    opacity: FILL_OPACITY,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const ringMaterial = new THREE.LineBasicMaterial({
    color: READY_COLOR,
    transparent: true,
    opacity: LINE_OPACITY,
    depthTest: false,
  })

  const circleFillPositions: number[] = [0, 0, 0, ...circlePositions(SEGMENTS)]
  const circleFillGeometry = new THREE.BufferGeometry()
  circleFillGeometry.setAttribute('position', new THREE.Float32BufferAttribute(circleFillPositions, 3))
  const circleFillIndices: number[] = []
  for (let i = 1; i <= SEGMENTS; i++) circleFillIndices.push(0, i, i + 1)
  circleFillGeometry.setIndex(circleFillIndices)
  const circleFill = new THREE.Mesh(circleFillGeometry, fillMaterial)
  group.add(circleFill)

  const circleRingGeometry = new THREE.BufferGeometry()
  circleRingGeometry.setAttribute('position', new THREE.Float32BufferAttribute(circlePositions(SEGMENTS), 3))
  const circleRing = new THREE.LineLoop(circleRingGeometry, ringMaterial)
  group.add(circleRing)

  const boxFillGeometry = new THREE.BufferGeometry()
  boxFillGeometry.setAttribute('position', new THREE.Float32BufferAttribute(BOX_CORNERS, 3))
  boxFillGeometry.setIndex([0, 1, 2, 0, 2, 3])
  const boxFill = new THREE.Mesh(boxFillGeometry, fillMaterial)
  boxFill.visible = false
  group.add(boxFill)

  const boxRingGeometry = new THREE.BufferGeometry()
  boxRingGeometry.setAttribute('position', new THREE.Float32BufferAttribute(BOX_CORNERS, 3))
  const boxRing = new THREE.LineLoop(boxRingGeometry, ringMaterial)
  boxRing.visible = false
  group.add(boxRing)

  const ENTRANCE_HALF_WIDTH = 0.45
  const ENTRANCE_CHEVRON = 0.28
  const entrancePositions = [
    -ENTRANCE_HALF_WIDTH, 0.02, 0,
    ENTRANCE_HALF_WIDTH, 0.02, 0,
    -0.22, 0.02, 0,
    0, 0.02, -ENTRANCE_CHEVRON,
    0.22, 0.02, 0,
    0, 0.02, -ENTRANCE_CHEVRON,
  ]
  const entranceGeometry = new THREE.BufferGeometry()
  entranceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(entrancePositions, 3))
  const entranceMaterial = new THREE.LineBasicMaterial({
    color: READY_COLOR,
    transparent: true,
    opacity: LINE_OPACITY,
    depthTest: false,
  })
  const entranceMarker = new THREE.LineSegments(entranceGeometry, entranceMaterial)
  entranceMarker.visible = false
  group.add(entranceMarker)

  let currentFootprint: PlacementPreviewFootprint = { kind: 'circle', radius: 1 }
  let entranceRequested = false

  const syncEntrance = (): void => {
    const show = entranceRequested && currentFootprint.kind === 'box'
    entranceMarker.visible = show
    if (show && currentFootprint.kind === 'box') {
      entranceMarker.position.set(0, 0, placementEntranceMarkerLocalZ(currentFootprint.depth))
    }
  }

  return {
    group,
    setFootprint(footprint) {
      currentFootprint = footprint
      const isBox = footprint.kind === 'box'
      circleFill.visible = !isBox
      circleRing.visible = !isBox
      boxFill.visible = isBox
      boxRing.visible = isBox
      if (isBox) {
        boxFill.scale.set(footprint.width, 1, footprint.depth)
        boxRing.scale.set(footprint.width, 1, footprint.depth)
      } else {
        circleFill.scale.set(footprint.radius, 1, footprint.radius)
        circleRing.scale.set(footprint.radius, 1, footprint.radius)
      }
      syncEntrance()
    },
    setEntranceMarker(visible) {
      entranceRequested = visible
      syncEntrance()
    },
    setTransform(x, z, y, yaw = 0) {
      group.position.set(x, y, z)
      group.rotation.y = yaw
    },
    setPreviewState(state) {
      const color = state === 'ready'
        ? READY_COLOR
        : state === 'preparation'
          ? PREPARATION_COLOR
          : INVALID_COLOR
      fillMaterial.color.setHex(color)
      ringMaterial.color.setHex(color)
      entranceMaterial.color.setHex(color)
    },
    dispose() {
      circleFillGeometry.dispose()
      circleRingGeometry.dispose()
      boxFillGeometry.dispose()
      boxRingGeometry.dispose()
      entranceGeometry.dispose()
      fillMaterial.dispose()
      ringMaterial.dispose()
      entranceMaterial.dispose()
    },
  }
}
