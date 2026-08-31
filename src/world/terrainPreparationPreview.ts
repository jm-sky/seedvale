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
const FILL_OPACITY = 0.35
const LINE_OPACITY = 0.9

export type TerrainPreparationPreview = {
  group: THREE.Object3D
  /** Rebuilds the grid geometry for a new footprint — `sizeMeters` is the
   *  visual footprint edge length, `divisions` the number of interior cells
   *  per side (matches the resolved sample count). Cheap to call, but the
   *  caller should still only call it when size/divisions actually change
   *  (plan `ui-input-004` implementation notes §11) since it disposes and
   *  recreates geometry. */
  setFootprint: (sizeMeters: number, divisions: number) => void
  /** Positions the whole preview at world `(x, z)` with the fill/grid plane
   *  sitting at `height` (the currently selected target height). */
  setTransform: (x: number, z: number, height: number) => void
  /** Global ok/blocked indicator (water/slope/pickaxe/occupied) — colors the
   *  wireframe only; the fill plane's per-cell colors (`setHeightDeltas`)
   *  are a separate, independent signal (plan §5). */
  setValid: (valid: boolean) => void
  /** Per-cell height-compliance colors (plan `ui-input-004` §5) — one delta
   *  (`abs(targetHeight - originalHeight)`) per resolved sample, in the same
   *  row-major (dz outer, dx inner) order `resolvePreparationSamples()`
   *  produces and this mesh's vertex grid is built in — green at `delta = 0`
   *  fading to red at `delta >= maxDelta`. Length must equal the last
   *  `setFootprint()` vertex count; a mismatch (e.g. a same-frame footprint
   *  change race) is ignored rather than throwing. */
  setHeightDeltas: (deltas: readonly number[], maxDelta: number) => void
  dispose: () => void
}

export function createTerrainPreparationPreview(): TerrainPreparationPreview {
  const group = new THREE.Group()
  group.name = 'terrain-preparation-preview'
  group.renderOrder = 10

  const fillMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: FILL_OPACITY,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const fill = new THREE.Mesh(new THREE.BufferGeometry(), fillMaterial)
  group.add(fill)

  const lineMaterial = new THREE.LineBasicMaterial({
    color: VALID_COLOR,
    transparent: true,
    opacity: LINE_OPACITY,
    depthTest: false,
  })
  const lines = new THREE.LineSegments(new THREE.BufferGeometry(), lineMaterial)
  group.add(lines)

  const defaultColor = new THREE.Color(VALID_COLOR)
  const validColor = new THREE.Color(VALID_COLOR)
  const invalidColor = new THREE.Color(INVALID_COLOR)
  const scratchColor = new THREE.Color()

  const rebuildGrid = (sizeMeters: number, divisions: number): void => {
    const half = sizeMeters / 2
    const steps = Math.max(1, divisions)

    const linePositions: number[] = []
    for (let i = 0; i <= steps; i++) {
      const t = -half + (sizeMeters * i) / steps
      // Line along Z at world-local x = t.
      linePositions.push(t, 0, -half, t, 0, half)
      // Line along X at world-local z = t.
      linePositions.push(-half, 0, t, half, 0, t)
    }
    lines.geometry.dispose()
    lines.geometry = new THREE.BufferGeometry()
    lines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3))

    // Fill: a (steps+1)×(steps+1) vertex grid built directly in local x/z
    // (no rotation, unlike a rotated `PlaneGeometry`) so the vertex order
    // below — z outer (-half → +half), x inner (-half → +half) — matches
    // `resolvePreparationSamples()`'s dz-outer/dx-inner sample order exactly,
    // vertex-for-vertex, with no axis-inversion bookkeeping.
    const perSide = steps + 1
    const positions: number[] = []
    const colors: number[] = []
    for (let iz = 0; iz <= steps; iz++) {
      const z = -half + (sizeMeters * iz) / steps
      for (let ix = 0; ix <= steps; ix++) {
        const x = -half + (sizeMeters * ix) / steps
        positions.push(x, 0, z)
        colors.push(defaultColor.r, defaultColor.g, defaultColor.b)
      }
    }
    const indices: number[] = []
    for (let iz = 0; iz < steps; iz++) {
      for (let ix = 0; ix < steps; ix++) {
        const a = iz * perSide + ix
        const b = a + 1
        const c = a + perSide
        const d = c + 1
        indices.push(a, c, b, b, c, d)
      }
    }
    fill.geometry.dispose()
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setIndex(indices)
    fill.geometry = geometry
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
      lineMaterial.color.setHex(valid ? VALID_COLOR : INVALID_COLOR)
    },
    setHeightDeltas(deltas, maxDelta) {
      const colorAttr = fill.geometry.getAttribute('color') as THREE.BufferAttribute | undefined
      if (!colorAttr || deltas.length !== colorAttr.count) return
      for (let i = 0; i < deltas.length; i++) {
        const ratio = maxDelta > 0 ? Math.min(1, Math.max(0, deltas[i] / maxDelta)) : 0
        scratchColor.copy(validColor).lerp(invalidColor, ratio)
        colorAttr.setXYZ(i, scratchColor.r, scratchColor.g, scratchColor.b)
      }
      colorAttr.needsUpdate = true
    },
    dispose() {
      fill.geometry.dispose()
      fillMaterial.dispose()
      lines.geometry.dispose()
      lineMaterial.dispose()
    },
  }
}
