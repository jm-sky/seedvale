import * as THREE from 'three'

/**
 * Vanilla Three.js preview mesh for the `Przygotuj teren` mode (plan
 * `world-terrain-002` §2) — a world-space, axis-aligned X/Z grid following
 * the player's aim, colored by whether the currently selected size/target
 * height would validate. Pure rendering: no domain logic, no scene
 * ownership beyond its own group (the caller adds/removes it from `scene`).
 */
const VALID_COLOR = 0x4caf50
const INVALID_COLOR = 0xe0524a
const FILL_OPACITY = 0.3
const LINE_OPACITY = 0.9

export type TerrainPreparationPreview = {
  group: THREE.Object3D
  /** Rebuilds the grid geometry for a new footprint — `sizeMeters` is the
   *  visual footprint edge length, `divisions` the number of interior cells
   *  per side (matches the resolved sample count). */
  setFootprint: (sizeMeters: number, divisions: number) => void
  /** Positions the whole preview at world `(x, z)` with the fill/grid plane
   *  sitting at `height` (the currently selected target height). */
  setTransform: (x: number, z: number, height: number) => void
  setValid: (valid: boolean) => void
  dispose: () => void
}

export function createTerrainPreparationPreview(): TerrainPreparationPreview {
  const group = new THREE.Group()
  group.name = 'terrain-preparation-preview'
  group.renderOrder = 10

  const fillMaterial = new THREE.MeshBasicMaterial({
    color: VALID_COLOR,
    transparent: true,
    opacity: FILL_OPACITY,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fillMaterial)
  fill.rotation.x = -Math.PI / 2
  group.add(fill)

  const lineMaterial = new THREE.LineBasicMaterial({
    color: VALID_COLOR,
    transparent: true,
    opacity: LINE_OPACITY,
    depthTest: false,
  })
  const lines = new THREE.LineSegments(new THREE.BufferGeometry(), lineMaterial)
  group.add(lines)

  const rebuildGrid = (sizeMeters: number, divisions: number): void => {
    const half = sizeMeters / 2
    const positions: number[] = []
    const steps = Math.max(1, divisions)
    for (let i = 0; i <= steps; i++) {
      const t = -half + (sizeMeters * i) / steps
      // Line along Z at world-local x = t.
      positions.push(t, 0, -half, t, 0, half)
      // Line along X at world-local z = t.
      positions.push(-half, 0, t, half, 0, t)
    }
    lines.geometry.dispose()
    lines.geometry = new THREE.BufferGeometry()
    lines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    fill.scale.set(sizeMeters, sizeMeters, 1)
  }

  // Start with a harmless default so `group` is never empty-geometry before
  // the first `setFootprint()` call.
  rebuildGrid(2, 2)

  return {
    group,
    setFootprint: rebuildGrid,
    setTransform(x, z, height) {
      group.position.set(x, height, z)
    },
    setValid(valid) {
      const color = valid ? VALID_COLOR : INVALID_COLOR
      fillMaterial.color.setHex(color)
      lineMaterial.color.setHex(color)
    },
    dispose() {
      fill.geometry.dispose()
      fillMaterial.dispose()
      lines.geometry.dispose()
      lineMaterial.dispose()
    },
  }
}
