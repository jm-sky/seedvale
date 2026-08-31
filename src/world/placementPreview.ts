import * as THREE from 'three'

/**
 * Vanilla Three.js ghost mesh for the shared object-placement preview mode
 * (plan `ui-input-004` §2/§7) — a world-space, circular footprint marker
 * following the player's aim, colored green/red by whether the currently
 * aimed spot would validate for the selected object (chest/tent/fire). Pure
 * rendering: no domain logic, no scene ownership beyond its own group (the
 * caller adds/removes it from `scene`), same split as
 * `world/terrainPreparationPreview.ts`.
 */
const VALID_COLOR = 0x4caf50
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

export type PlacementPreviewGhost = {
  group: THREE.Object3D
  /** Sets the footprint's world-space radius (metres) — cheap, no geometry
   *  rebuild (unit circle scaled per-axis). */
  setRadius: (radius: number) => void
  /** Positions the whole ghost at world `(x, z)`, feet at `y`. */
  setTransform: (x: number, z: number, y: number) => void
  setValid: (valid: boolean) => void
  dispose: () => void
}

export function createPlacementPreviewGhost(): PlacementPreviewGhost {
  const group = new THREE.Group()
  group.name = 'placement-preview-ghost'
  group.renderOrder = 10

  const fillMaterial = new THREE.MeshBasicMaterial({
    color: VALID_COLOR,
    transparent: true,
    opacity: FILL_OPACITY,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const fillPositions: number[] = [0, 0, 0, ...circlePositions(SEGMENTS)]
  const fillGeometry = new THREE.BufferGeometry()
  fillGeometry.setAttribute('position', new THREE.Float32BufferAttribute(fillPositions, 3))
  const fillIndices: number[] = []
  for (let i = 1; i <= SEGMENTS; i++) fillIndices.push(0, i, i + 1)
  fillGeometry.setIndex(fillIndices)
  const fill = new THREE.Mesh(fillGeometry, fillMaterial)
  group.add(fill)

  const ringMaterial = new THREE.LineBasicMaterial({
    color: VALID_COLOR,
    transparent: true,
    opacity: LINE_OPACITY,
    depthTest: false,
  })
  const ringGeometry = new THREE.BufferGeometry()
  ringGeometry.setAttribute('position', new THREE.Float32BufferAttribute(circlePositions(SEGMENTS), 3))
  const ring = new THREE.LineLoop(ringGeometry, ringMaterial)
  group.add(ring)

  return {
    group,
    setRadius(radius) {
      fill.scale.set(radius, 1, radius)
      ring.scale.set(radius, 1, radius)
    },
    setTransform(x, z, y) {
      group.position.set(x, y, z)
    },
    setValid(valid) {
      const color = valid ? VALID_COLOR : INVALID_COLOR
      fillMaterial.color.setHex(color)
      ringMaterial.color.setHex(color)
    },
    dispose() {
      fillGeometry.dispose()
      fillMaterial.dispose()
      ringGeometry.dispose()
      ringMaterial.dispose()
    },
  }
}
