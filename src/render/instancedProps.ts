import * as THREE from 'three'

/** One mesh from a (prepared) GLB template: shared geometry + material +
 *  matrix LOCAL to its own root frame (i.e. everything below the template
 *  root, excluding the root's own transform — that part is folded into the
 *  per-instance matrix instead, see `buildInstancedProps`). */
export type PropPrimitive = {
  geometry: THREE.BufferGeometry
  material: THREE.Material | THREE.Material[]
  localMatrix: THREE.Matrix4
  castShadow: boolean
  receiveShadow: boolean
}

export type PropPlacement = {
  speciesIndex: number
  x: number
  z: number
  groundY: number
  rotationY: number
  scale: number
  /** Key for later single-instance removal (e.g. `treeId`). Placements
   *  without one can never be targeted by `removeByKey`. */
  key?: string
}

export type InstancedPropGroup = {
  group: THREE.Group
  /** Swap-remove: the last instance in every bucket moves into the freed
   *  slot. Returns `false` for an unknown (or keyless) placement. */
  removeByKey: (key: string) => boolean
  dispose: () => void
}

const _flattenCache = new WeakMap<THREE.Object3D, PropPrimitive[]>()

/** Flattens a prepared template root into its constituent meshes, one
 *  `PropPrimitive` per mesh, `localMatrix` composed from every ancestor
 *  transform strictly below the root (the root's own `position`/`scale` —
 *  set by `prepareProp`/`preparePropFitMax` — is deliberately excluded, since
 *  it gets folded into the per-instance matrix in `buildInstancedProps`
 *  instead). Memoized per root object identity — template roots are already
 *  memoized once per species by callers (`chunkManager.ts`'s `memoTemplates`),
 *  so this cache naturally holds one entry per species. */
function flattenPropTemplate(root: THREE.Object3D): PropPrimitive[] {
  const cached = _flattenCache.get(root)
  if (cached) return cached

  const primitives: PropPrimitive[] = []
  const walk = (node: THREE.Object3D, parentMatrix: THREE.Matrix4): void => {
    const isRoot = node === root
    node.updateMatrix()
    const localMatrix = isRoot
      ? parentMatrix.clone()
      : parentMatrix.clone().multiply(node.matrix)

    const mesh = node as THREE.Mesh
    if (mesh.isMesh) {
      primitives.push({
        geometry: mesh.geometry,
        material: mesh.material,
        localMatrix,
        castShadow: mesh.castShadow,
        receiveShadow: mesh.receiveShadow,
      })
    }
    for (const child of node.children) walk(child, localMatrix)
  }
  walk(root, new THREE.Matrix4())

  _flattenCache.set(root, primitives)
  return primitives
}

type Bucket = {
  primitive: PropPrimitive
  mesh: THREE.InstancedMesh
  /** Instance index -> placement key, parallel to the shared instance order
   *  (see `keyOrder` below) — used by `removeByKey`'s swap-remove to know
   *  which key ends up at the freed slot after the last instance moves in. */
  keys: (string | undefined)[]
}

const _scratch = new THREE.Object3D()
const _instanceMatrix = new THREE.Matrix4()

/** Builds the per-instance world matrix for `placement` against
 *  `templateRoot`, reproducing `cloneProp`/`clonePropWithYaw` +
 *  `placeOnGround` step for step (see plan 087 §2.1) rather than
 *  re-deriving the math — deliberately avoids drifting from the exact
 *  transform today's cloned-Object3D path produces. */
function instanceWorldMatrix(templateRoot: THREE.Object3D, placement: PropPlacement): THREE.Matrix4 {
  _scratch.position.copy(templateRoot.position) // p0 from prepareProp
  _scratch.quaternion.copy(templateRoot.quaternion)
  _scratch.scale.copy(templateRoot.scale) // s0 from prepareProp
  _scratch.scale.multiplyScalar(placement.scale) // ≡ cloneProp
  _scratch.rotation.y = placement.rotationY // ≡ cloneProp/clonePropWithYaw
  _scratch.position.set( // ≡ placeOnGround
    placement.x + templateRoot.position.x,
    placement.groundY + templateRoot.position.y,
    placement.z + templateRoot.position.z,
  )
  _scratch.updateMatrix()
  return _scratch.matrix
}

function bucketKey(speciesIndex: number, primitiveIndex: number): string {
  return `${speciesIndex}:${primitiveIndex}`
}

/** Aggregates clone-per-placement props (drzewa/krzaki/skały — one
 *  `Object3D` per instance today) into one `InstancedMesh` per
 *  (species, primitive) pair. `templates[placement.speciesIndex]` must be a
 *  prepared root (`prepareProp`/`preparePropFitMax` already applied, same as
 *  `cloneProp`'s callers use today). Returns `undefined` for an empty
 *  placement list, mirroring `buildPlacementGroup`'s convention so callers
 *  can assign the result straight to a `ChunkRecord` field. */
export function buildInstancedProps(
  templates: readonly THREE.Object3D[],
  placements: readonly PropPlacement[],
  name: string,
): InstancedPropGroup | undefined {
  if (placements.length === 0) return undefined

  const group = new THREE.Group()
  group.name = name

  const buckets = new Map<string, Bucket>()
  // Every instance of a species shares the same index across all of that
  // species' buckets — this is the invariant that makes `removeByKey`'s
  // swap-remove trivial (one index removed from every bucket at once).
  const speciesInstanceKeys = new Map<number, (string | undefined)[]>()

  const countPerSpecies = new Map<number, number>()
  for (const placement of placements) {
    countPerSpecies.set(placement.speciesIndex, (countPerSpecies.get(placement.speciesIndex) ?? 0) + 1)
  }

  for (const placement of placements) {
    const template = templates[placement.speciesIndex % templates.length]
    if (!template) continue
    const primitives = flattenPropTemplate(template)
    const worldMatrix = instanceWorldMatrix(template, placement)

    let keysForSpecies = speciesInstanceKeys.get(placement.speciesIndex)
    if (!keysForSpecies) {
      keysForSpecies = []
      speciesInstanceKeys.set(placement.speciesIndex, keysForSpecies)
    }
    const instanceIndex = keysForSpecies.length
    keysForSpecies.push(placement.key)

    for (let primitiveIndex = 0; primitiveIndex < primitives.length; primitiveIndex++) {
      const primitive = primitives[primitiveIndex]!
      const key = bucketKey(placement.speciesIndex, primitiveIndex)
      let bucket = buckets.get(key)
      if (!bucket) {
        const count = countPerSpecies.get(placement.speciesIndex)!
        const mesh = new THREE.InstancedMesh(primitive.geometry, primitive.material, count)
        mesh.castShadow = primitive.castShadow
        mesh.receiveShadow = primitive.receiveShadow
        mesh.name = `${name}-${key}`
        group.add(mesh)
        bucket = { primitive, mesh, keys: [] }
        buckets.set(key, bucket)
      }
      _instanceMatrix.multiplyMatrices(worldMatrix, primitive.localMatrix)
      bucket.mesh.setMatrixAt(instanceIndex, _instanceMatrix)
      bucket.keys[instanceIndex] = placement.key
    }
  }

  for (const bucket of buckets.values()) {
    bucket.mesh.count = bucket.keys.length
    bucket.mesh.instanceMatrix.needsUpdate = true
    bucket.mesh.computeBoundingSphere() // else culling uses the unit template's own bounds
  }

  if (buckets.size === 0) return undefined

  function removeByKey(targetKey: string): boolean {
    let removed = false
    for (const bucket of buckets.values()) {
      const index = bucket.keys.indexOf(targetKey)
      if (index === -1) continue
      const lastIndex = bucket.keys.length - 1
      if (index !== lastIndex) {
        const lastMatrix = new THREE.Matrix4()
        bucket.mesh.getMatrixAt(lastIndex, lastMatrix)
        bucket.mesh.setMatrixAt(index, lastMatrix)
        bucket.keys[index] = bucket.keys[lastIndex]
      }
      bucket.keys.pop()
      bucket.mesh.count = bucket.keys.length
      bucket.mesh.instanceMatrix.needsUpdate = true
      removed = true
    }
    return removed
  }

  return {
    group,
    removeByKey,
    dispose: () => {
      group.removeFromParent()
      for (const bucket of buckets.values()) {
        // Geometry/material are shared (`sharedGpu`, see `loadGltf.ts`) —
        // never disposed here, same convention as `cloneProp`'s output.
        // `InstancedMesh.dispose()` only frees the per-instance matrix
        // buffer, which nothing else references.
        bucket.mesh.dispose()
      }
    },
  }
}
