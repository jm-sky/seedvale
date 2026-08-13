import { BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import { clonePropWithYaw, placeOnGround } from '../settlement/props'
import { buildInstancedProps, type PropPlacement } from './instancedProps'

/** Synthetic "prepared" template: a Group root carrying `prepareProp`-style
 *  position/scale offsets, with meshes at two depths (direct child + a
 *  nested group) so the ancestor-chain composition in `flattenPropTemplate`
 *  is actually exercised, not just a single-mesh identity case. */
function makeTemplate(): Group {
  const root = new Group()
  root.position.set(0.3, -0.1, -0.2) // e.g. `prepareProp`'s foot/center offset
  root.scale.setScalar(1.4)

  const meshA = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
  meshA.name = 'meshA'
  meshA.position.set(0.5, 0.2, 0)
  meshA.rotation.set(0, Math.PI / 6, 0)
  root.add(meshA)

  const nested = new Object3D()
  nested.position.set(-0.4, 0.6, 0.1)
  nested.rotation.set(0.2, 0, 0.3)
  nested.scale.setScalar(0.8)
  root.add(nested)

  const meshB = new Mesh(new BoxGeometry(0.5, 2, 0.5), new MeshStandardMaterial())
  meshB.name = 'meshB'
  meshB.position.set(0.1, 1, -0.3)
  nested.add(meshB)

  return root
}

function samplePlacements(): PropPlacement[] {
  return [
    { speciesIndex: 0, x: 10, z: 20, groundY: 3, rotationY: 0, scale: 1, key: 'p0' },
    { speciesIndex: 0, x: -5, z: 8, groundY: 1.2, rotationY: Math.PI / 3, scale: 1.5, key: 'p1' },
    { speciesIndex: 0, x: 0, z: 0, groundY: 0, rotationY: Math.PI, scale: 0.6, key: 'p2' },
    { speciesIndex: 0, x: 42.5, z: -17.25, groundY: -2, rotationY: 4.9, scale: 2.1, key: 'p3' },
  ]
}

/** Reference matrix via today's cloned-`Object3D` path — `clonePropWithYaw` +
 *  `placeOnGround`, the exact pair `buildInstancedProps` must reproduce. */
function referenceMatrixFor(template: Group, placement: PropPlacement, meshName: string): Matrix4 {
  const prop = clonePropWithYaw(
    [template],
    placement.speciesIndex,
    placement.scale,
    placement.rotationY,
  )
  placeOnGround(prop, placement.x, placement.z, () => placement.groundY)
  prop.updateMatrixWorld(true)
  const mesh = prop.getObjectByName(meshName)
  if (!mesh) throw new Error(`mesh ${meshName} not found on cloned prop`)
  return mesh.matrixWorld
}

// `InstancedMesh.setMatrixAt`/`getMatrixAt` round-trip through a Float32Array
// buffer, so exact double-precision equality isn't achievable — precision 5
// (max diff 5e-6) still comfortably proves "same transform", matching plan
// 087 §Faza 1's ~1e-6 tolerance while tolerating float32 rounding.
function expectMatricesClose(actual: Matrix4, expected: Matrix4, precision = 5): void {
  const a = actual.elements
  const e = expected.elements
  for (let i = 0; i < 16; i++) {
    expect(a[i]).toBeCloseTo(e[i]!, precision)
  }
}

describe('buildInstancedProps', () => {
  it('reproduces cloneProp + placeOnGround world matrices for every mesh/placement', () => {
    const template = makeTemplate()
    const placements = samplePlacements()
    const result = buildInstancedProps([template], placements, 'test-group')!
    expect(result).toBeDefined()

    const meshNames = ['meshA', 'meshB']
    const out = new Matrix4()

    for (let primitiveIndex = 0; primitiveIndex < meshNames.length; primitiveIndex++) {
      const bucketMesh = result.group.children.find((c) => c.name === `test-group-0:${primitiveIndex}`)
      expect(bucketMesh).toBeDefined()
      const instanced = bucketMesh as unknown as { getMatrixAt: (i: number, m: Matrix4) => void }

      for (let instanceIndex = 0; instanceIndex < placements.length; instanceIndex++) {
        const placement = placements[instanceIndex]!
        instanced.getMatrixAt(instanceIndex, out)
        const expected = referenceMatrixFor(template, placement, meshNames[primitiveIndex]!)
        expectMatricesClose(out, expected)
      }
    }
  })

  it('returns undefined for an empty placement list', () => {
    const template = makeTemplate()
    expect(buildInstancedProps([template], [], 'empty')).toBeUndefined()
  })
})

describe('InstancedPropGroup.removeByKey', () => {
  function simpleTemplate(): Mesh {
    // Root itself is the mesh (single primitive) — keeps the swap-remove
    // index bookkeeping the focus of this test, independent of the
    // multi-primitive composition already covered above.
    return new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
  }

  it('swap-removes the freed slot and keeps remaining instances addressable by key', () => {
    const template = simpleTemplate()
    const placements: PropPlacement[] = [
      { speciesIndex: 0, x: 0, z: 0, groundY: 0, rotationY: 0, scale: 1, key: 'a' },
      { speciesIndex: 0, x: 1, z: 1, groundY: 0, rotationY: 0, scale: 1, key: 'b' },
      { speciesIndex: 0, x: 2, z: 2, groundY: 0, rotationY: 0, scale: 1, key: 'c' },
    ]
    const result = buildInstancedProps([template], placements, 'swap')!
    const mesh = result.group.children[0] as unknown as {
      count: number
      getMatrixAt: (i: number, m: Matrix4) => void
    }
    expect(mesh.count).toBe(3)

    const cMatrixBefore = new Matrix4()
    mesh.getMatrixAt(2, cMatrixBefore) // 'c' starts at index 2 (last)

    expect(result.removeByKey('b')).toBe(true)
    expect(mesh.count).toBe(2)

    // 'c' (the last instance) should have moved into 'b's freed slot (index 1).
    const cMatrixAfter = new Matrix4()
    mesh.getMatrixAt(1, cMatrixAfter)
    expectMatricesClose(cMatrixAfter, cMatrixBefore)

    // 'c' is still removable by its key after the swap.
    expect(result.removeByKey('c')).toBe(true)
    expect(mesh.count).toBe(1)

    // Unknown key -> false, no further mutation.
    expect(result.removeByKey('does-not-exist')).toBe(false)
    expect(mesh.count).toBe(1)
  })
})
