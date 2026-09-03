/** Plan world-terrain-007 §31-32 — procedural interior mesh derived from a
 *  `CaveDefinition`. Never queried for floor/containment/collision (that's
 *  `CaveVolume`/`caveColliders.ts`) — purely visual, disposable/rebuildable
 *  presentation. Tunnels: flat floor strip + a half-pipe arch (BackSide so
 *  the inside surface renders); chambers: floor disc + wall cylinder +
 *  ceiling disc. Deliberately low-poly — "convincing enclosed playable
 *  space", not general cave geology. */

import * as THREE from 'three'
import type { CaveDefinition, CaveNode } from './caveVolume'

const ROCK_COLOR = 0x4d453e
const ARCH_SEGMENTS = 10
const TUNNEL_RING_STEP = 2.2
const CHAMBER_RADIAL_SEGMENTS = 16

function nodeById(definition: CaveDefinition, id: string): CaveNode {
  const node = definition.nodes.find((n) => n.id === id)
  if (!node) throw new Error(`cave ${definition.caveId}: unknown node "${id}"`)
  return node
}

type GeometryBuilder = {
  positions: number[]
  indices: number[]
}

function pushVertex(builder: GeometryBuilder, x: number, y: number, z: number): number {
  const index = builder.positions.length / 3
  builder.positions.push(x, y, z)
  return index
}

function pushQuad(builder: GeometryBuilder, a: number, b: number, c: number, d: number): void {
  builder.indices.push(a, b, c, a, c, d)
}

function addTunnel(builder: GeometryBuilder, definition: CaveDefinition, tunnelId: string): void {
  const tunnel = definition.tunnels.find((t) => t.id === tunnelId)
  if (!tunnel) return
  const from = nodeById(definition, tunnel.from)
  const to = nodeById(definition, tunnel.to)
  const dx = to.center.x - from.center.x
  const dz = to.center.z - from.center.z
  const length = Math.hypot(dx, dz)
  if (length < 1e-6) return
  const dirX = dx / length
  const dirZ = dz / length
  const perpX = -dirZ
  const perpZ = dirX
  const rings = Math.max(2, Math.round(length / TUNNEL_RING_STEP))

  // rows[i][k] = vertex index at ring i, arch column k (k=0 right floor
  // edge -> k=ARCH_SEGMENTS left floor edge, per the arch parametrisation
  // below — shared between the floor strip and the arch/wall ribbon).
  const rows: number[][] = []
  for (let i = 0; i <= rings; i++) {
    const t = i / rings
    const cx = from.center.x + dx * t
    const cz = from.center.z + dz * t
    const floorY = tunnel.floorStartY + (tunnel.floorEndY - tunnel.floorStartY) * t
    const row: number[] = []
    for (let k = 0; k <= ARCH_SEGMENTS; k++) {
      const a = (k / ARCH_SEGMENTS) * Math.PI
      const offset = tunnel.radius * Math.cos(a)
      const height = tunnel.ceilingHeight * Math.sin(a)
      const x = cx + perpX * offset
      const z = cz + perpZ * offset
      row.push(pushVertex(builder, x, floorY + height, z))
    }
    rows.push(row)
  }

  for (let i = 0; i < rings; i++) {
    // Arch/wall ribbon.
    for (let k = 0; k < ARCH_SEGMENTS; k++) {
      pushQuad(builder, rows[i]![k]!, rows[i]![k + 1]!, rows[i + 1]![k + 1]!, rows[i + 1]![k]!)
    }
    // Floor strip (right edge k=0, left edge k=ARCH_SEGMENTS).
    pushQuad(builder, rows[i]![0]!, rows[i + 1]![0]!, rows[i + 1]![ARCH_SEGMENTS]!, rows[i]![ARCH_SEGMENTS]!)
  }
}

function addChamber(builder: GeometryBuilder, node: CaveNode): void {
  const cx = node.center.x
  const cz = node.center.z
  const segments = CHAMBER_RADIAL_SEGMENTS

  const floorCenter = pushVertex(builder, cx, node.floorY, cz)
  const ceilingCenter = pushVertex(builder, cx, node.ceilingY, cz)
  const floorRing: number[] = []
  const ceilingRing: number[] = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    const x = cx + Math.sin(a) * node.radius
    const z = cz + Math.cos(a) * node.radius
    floorRing.push(pushVertex(builder, x, node.floorY, z))
    ceilingRing.push(pushVertex(builder, x, node.ceilingY, z))
  }

  for (let i = 0; i < segments; i++) {
    // Floor fan.
    builder.indices.push(floorCenter, floorRing[i]!, floorRing[i + 1]!)
    // Ceiling fan (reversed winding — irrelevant since the material is
    // double-sided, kept consistent for readability).
    builder.indices.push(ceilingCenter, ceilingRing[i + 1]!, ceilingRing[i]!)
    // Wall.
    pushQuad(builder, floorRing[i]!, floorRing[i + 1]!, ceilingRing[i + 1]!, ceilingRing[i]!)
  }
}

/**
 * Builds one merged interior mesh for `definition` — a single
 * `THREE.Mesh` covering every tunnel and chamber, ready to `scene.add()`
 * while the cave is streamed in and dispose when it streams out.
 */
export function createCaveInteriorMesh(definition: CaveDefinition): THREE.Mesh {
  const builder: GeometryBuilder = { positions: [], indices: [] }
  for (const tunnel of definition.tunnels) addTunnel(builder, definition, tunnel.id)
  for (const node of definition.nodes) {
    if (node.kind === 'chamber') addChamber(builder, node)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(builder.positions, 3))
  geometry.setIndex(builder.indices)
  geometry.computeVertexNormals()

  const material = new THREE.MeshStandardMaterial({
    color: ROCK_COLOR,
    roughness: 1,
    flatShading: true,
    side: THREE.DoubleSide,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = false
  mesh.receiveShadow = true
  mesh.name = `cave-interior:${definition.caveId}`
  return mesh
}
