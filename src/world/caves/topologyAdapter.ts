/** Plan world-terrain-008 Milestone A §17 — the L1 walkable-proxy adapter.
 *  Turns a `CaveTopology` into a `CaveDefinition` so both spikes can reuse
 *  `createCaveVolume` (ground/ceiling queries) and `buildCaveWallColliders`
 *  (collision) completely unchanged. This proxy is deliberately generous
 *  (never authoritative render geometry — plan §4) so the spike mesh's
 *  visible walkable area is never wider than the proxy's collision/ground
 *  coverage (risk: a player standing outside the proxy falls through to
 *  `sampleHeight` and gets snapped to the surface — see implementation
 *  notes "One trap worth knowing").
 *
 * @domain world-terrain
 */

import type { CaveTopology } from './caveTopology'
import { type CaveBounds, type CaveDefinition, type CaveNode, type CaveTunnel, computeCaveBounds } from '../caveVolume'

/** Extra radius/height margin added beyond each node/waypoint's intended
 *  width/height so the proxy generously covers the spike mesh's silhouette,
 *  including its surface-detail bulges. */
export const PROXY_MARGIN = 0.9

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function corridorRadius(width: number): number {
  return width / 2 + PROXY_MARGIN
}

/**
 * Produces a `CaveDefinition` walkable proxy for `topology`: one `CaveNode`
 * per topology node plus one synthetic node per interior centerline
 * waypoint, chained together with `CaveTunnel`s so `createCaveVolume` sees a
 * generously-covered corridor that tracks the topology's actual bends.
 *
 * Only genuinely room-like nodes (the entrance and chambers) get a **disc**
 * footprint of their own; pass-through waypoints contribute their radius to
 * the tunnels around them but no disc. A `CaveNode` disc has one flat floor
 * across its whole radius, so a disc sitting on a descending corridor reports
 * a floor up to `radius x slope` below the corridor's actual floor a few
 * metres uphill of it — and since `CaveVolume.sampleFloor` collapses
 * overlapping primitives to their *minimum*, that flat floor wins and drops
 * the player through the visible floor (measured: up to 1.4 m on the
 * entrance ramp) right before ejecting them at the disc rim. Tunnels
 * interpolate their floor, so a corridor built from tunnels alone stays
 * floor-consistent. The entrance disc is harmless (it is the highest floor in
 * the cave, so the minimum never picks it) and a chamber genuinely *is* a
 * flat room.
 *
 * @domain world-terrain
 */
export function topologyToCaveDefinition(topology: CaveTopology): CaveDefinition {
  const topoNodeById = new Map(topology.nodes.map((n) => [n.id, n]))
  const nodes: CaveNode[] = []
  const tunnels: CaveTunnel[] = []
  /** Intended corridor radius per emitted node — tunnel sizing reads this
   *  rather than `CaveNode.radius`, which is 0 for pass-through waypoints. */
  const radiusById = new Map<string, number>()

  for (const n of topology.nodes) {
    const isRoom = n.kind === 'entrance' || n.kind === 'chamber'
    radiusById.set(n.id, corridorRadius(n.targetWidth))
    nodes.push({
      id: n.id,
      kind: n.kind === 'chamber' ? 'chamber' : 'mouth',
      center: { x: n.position.x, y: n.position.y, z: n.position.z },
      radius: isRoom ? corridorRadius(n.targetWidth) : 0,
      floorY: n.position.y,
      ceilingY: n.position.y + n.targetHeight,
    })
  }

  let tunnelCounter = 0
  for (const seg of topology.segments) {
    const fromTopo = topoNodeById.get(seg.from)
    const toTopo = topoNodeById.get(seg.to)
    if (!fromTopo || !toTopo) throw new Error(`spike topology ${topology.caveId}: unknown node in segment ${seg.id}`)

    const chainIds: string[] = [seg.from]
    for (let i = 1; i < seg.centerline.length - 1; i++) {
      const p = seg.centerline[i]!
      const t = i / (seg.centerline.length - 1)
      const width = lerp(fromTopo.targetWidth, toTopo.targetWidth, t)
      const height = lerp(fromTopo.targetHeight, toTopo.targetHeight, t)
      const id = `${seg.id}:wp${i}`
      radiusById.set(id, corridorRadius(width))
      nodes.push({
        id,
        kind: 'mouth',
        center: { x: p.x, y: p.y, z: p.z },
        radius: 0,
        floorY: p.y,
        ceilingY: p.y + height,
      })
      chainIds.push(id)
    }
    chainIds.push(seg.to)

    for (let i = 0; i < chainIds.length - 1; i++) {
      const a = nodes.find((n) => n.id === chainIds[i])!
      const b = nodes.find((n) => n.id === chainIds[i + 1])!
      tunnels.push({
        id: `${seg.id}:tunnel${tunnelCounter++}`,
        from: a.id,
        to: b.id,
        radius: Math.min(radiusById.get(a.id)!, radiusById.get(b.id)!),
        floorStartY: a.floorY,
        floorEndY: b.floorY,
        ceilingHeight: Math.min(a.ceilingY - a.floorY, b.ceilingY - b.floorY),
      })
    }
  }

  const bounds: CaveBounds = computeCaveBounds(topology.entrance, nodes, tunnels)

  return {
    caveId: topology.caveId,
    entrance: topology.entrance,
    nodes,
    tunnels,
    bounds,
    variant: 0,
  }
}
