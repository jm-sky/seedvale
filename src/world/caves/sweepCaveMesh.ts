/** Plan world-terrain-008 Milestone A §9 — Variant A: generalized sweep.
 *  Walks the `CaveTopology` centerline (main trunk, plus the branch if
 *  present) and builds a closed ring per sample — a floor strip and an arch
 *  sharing their two edge vertices — with independently shaped floor,
 *  ceiling and left/right walls, asymmetric profile keyframes interpolated
 *  from node `targetWidth`/`targetHeight`, centerline perturbation on top of
 *  the topology's own irregular waypoints, and multi-scale surface detail
 *  gated by `?debugDisableSystems=caveDetail`. Deliberately not a
 *  `radius + noise` ring sweep.
 *
 * Geometry-builder pattern (`positions[]`/`indices[]` + `pushVertex`/
 * `pushQuad` + `computeVertexNormals`) copied from `caveMesh.ts` (not
 * imported — spikes stay disposable and self-contained).
 *
 * @domain world-terrain
 */

import * as THREE from 'three'
import type { CaveSpikeMetrics } from './caveSpikeMetrics'
import type { CaveTopology, CaveTopologyPoint } from './caveTopology'
import { isSystemEnabled } from '../../debug/debugMode'
import { createMultiScaleNoise1D, createValueNoise1D, type NoiseOctave } from './spikeNoise'

export type SweepCaveParams = {
  /** Metres between rings along the (densified) centerline. */
  ringStep: number
  /** Total vertices around one ring (split ~35/65 between floor and arch). */
  profileSegments: number
  /** Amplitude of independent left/right wall bulge (fraction of half-width). */
  wallAsymmetry: number
  floorRoughness: number
  ceilingRoughness: number
  /** Extra lateral wobble applied on top of the topology's own irregular
   *  centerline waypoints. */
  centerlinePerturbation: number
  detail: { micro: NoiseOctave, medium: NoiseOctave, large: NoiseOctave }
}

export const DEFAULT_SWEEP_PARAMS: SweepCaveParams = {
  ringStep: 0.6,
  profileSegments: 20,
  wallAsymmetry: 0.45,
  floorRoughness: 0.16,
  ceilingRoughness: 0.22,
  centerlinePerturbation: 0.3,
  detail: {
    micro: { cellSize: 0.45, amplitude: 0.1 },
    medium: { cellSize: 1.5, amplitude: 0.3 },
    large: { cellSize: 2.6, amplitude: 0.5 },
  },
}

const MAIN_CHAIN = ['entrance', 'wide-transition', 'descending-passage', 'widening-bend', 'main-chamber'] as const

type GeometryBuilder = { positions: number[], indices: number[] }

function pushVertex(builder: GeometryBuilder, x: number, y: number, z: number): number {
  const index = builder.positions.length / 3
  builder.positions.push(x, y, z)
  return index
}

function pushQuad(builder: GeometryBuilder, a: number, b: number, c: number, d: number): void {
  builder.indices.push(a, b, c, a, c, d)
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

type Keyframe = { position: CaveTopologyPoint, width: number, height: number }

function buildKeyframes(topology: CaveTopology, chain: readonly string[]): Keyframe[] {
  const nodeById = new Map(topology.nodes.map((n) => [n.id, n]))
  const segByPair = new Map(topology.segments.map((s) => [`${s.from}>${s.to}`, s]))
  const keyframes: Keyframe[] = []
  for (let i = 0; i < chain.length - 1; i++) {
    const fromId = chain[i]!
    const toId = chain[i + 1]!
    const seg = segByPair.get(`${fromId}>${toId}`)
    if (!seg) throw new Error(`sweepCaveMesh: no segment ${fromId}->${toId}`)
    const fromNode = nodeById.get(fromId)!
    const toNode = nodeById.get(toId)!
    const pts = seg.centerline
    if (i === 0) keyframes.push({ position: pts[0]!, width: fromNode.targetWidth, height: fromNode.targetHeight })
    for (let k = 1; k < pts.length; k++) {
      const t = k / (pts.length - 1)
      keyframes.push({
        position: pts[k]!,
        width: fromNode.targetWidth + (toNode.targetWidth - fromNode.targetWidth) * t,
        height: fromNode.targetHeight + (toNode.targetHeight - fromNode.targetHeight) * t,
      })
    }
  }
  return keyframes
}

function densify(keyframes: readonly Keyframe[], ringStep: number): Keyframe[] {
  const out: Keyframe[] = [keyframes[0]!]
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i]!
    const b = keyframes[i + 1]!
    const dist = Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y, b.position.z - a.position.z)
    const steps = Math.max(1, Math.round(dist / ringStep))
    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      out.push({
        position: {
          x: a.position.x + (b.position.x - a.position.x) * t,
          y: a.position.y + (b.position.y - a.position.y) * t,
          z: a.position.z + (b.position.z - a.position.z) * t,
        },
        width: a.width + (b.width - a.width) * t,
        height: a.height + (b.height - a.height) * t,
      })
    }
  }
  return out
}

type PathSample = { position: CaveTopologyPoint, perp: { dx: number, dz: number }, arcLength: number, width: number, height: number }

function toSamples(frames: readonly Keyframe[]): PathSample[] {
  const samples: PathSample[] = []
  let arc = 0
  for (let i = 0; i < frames.length; i++) {
    const prev = frames[Math.max(0, i - 1)]!
    const next = frames[Math.min(frames.length - 1, i + 1)]!
    const dx = next.position.x - prev.position.x
    const dz = next.position.z - prev.position.z
    const len = Math.hypot(dx, dz) || 1
    const perp = { dx: -dz / len, dz: dx / len }
    if (i > 0) {
      const a = frames[i - 1]!
      const b = frames[i]!
      arc += Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y, b.position.z - a.position.z)
    }
    samples.push({ position: frames[i]!.position, perp, arcLength: arc, width: frames[i]!.width, height: frames[i]!.height })
  }
  return samples
}

function perturbSamples(samples: readonly PathSample[], amplitude: number, noise: (s: number) => number): PathSample[] {
  if (amplitude <= 0) return [...samples]
  return samples.map((s) => ({
    ...s,
    position: {
      x: s.position.x + s.perp.dx * noise(s.arcLength) * amplitude,
      y: s.position.y,
      z: s.position.z + s.perp.dz * noise(s.arcLength) * amplitude,
    },
  }))
}

type NoiseStreams = {
  floor: (s: number) => number
  ceiling: (s: number) => number
  wallRight: (s: number) => number
  wallLeft: (s: number) => number
  detail: (s: number) => number
}

function buildRingLoop(
  builder: GeometryBuilder,
  sample: PathSample,
  params: SweepCaveParams,
  floorSegments: number,
  archSegments: number,
  detailEnabled: boolean,
  noises: NoiseStreams,
): number[] {
  const halfWidth = sample.width / 2
  const height = sample.height
  const s = sample.arcLength

  const floorIdx: number[] = []
  for (let j = 0; j <= floorSegments; j++) {
    const u = -1 + (2 * j) / floorSegments
    const lateral = u * halfWidth
    let noiseVal = noises.floor(s + j * 0.53) * params.floorRoughness
    if (detailEnabled) noiseVal += noises.detail(s + j * 0.21) * 0.5
    const y = sample.position.y + noiseVal * (1 - Math.abs(u) * 0.4)
    const x = sample.position.x + sample.perp.dx * lateral
    const z = sample.position.z + sample.perp.dz * lateral
    floorIdx.push(pushVertex(builder, x, y, z))
  }

  const archIdx: number[] = new Array(archSegments + 1)
  archIdx[0] = floorIdx[floorSegments]!
  archIdx[archSegments] = floorIdx[0]!
  for (let k = 1; k < archSegments; k++) {
    const a = (k / archSegments) * Math.PI
    const sideNoise = Math.cos(a) >= 0 ? noises.wallRight(s) : noises.wallLeft(s)
    const asym = 1 + params.wallAsymmetry * sideNoise
    let offset = halfWidth * Math.cos(a) * asym
    let h = height * Math.sin(a)
    h += noises.ceiling(s + a * 2.3) * params.ceilingRoughness * Math.sin(a)
    if (detailEnabled) {
      h += noises.detail(s * 0.7 + a * 1.9) * Math.sin(a)
      offset += noises.detail(s * 0.9 - a * 1.3) * 0.5 * Math.sin(a)
    }
    const x = sample.position.x + sample.perp.dx * offset
    const y = sample.position.y + h
    const z = sample.position.z + sample.perp.dz * offset
    archIdx[k] = pushVertex(builder, x, y, z)
  }

  const loop: number[] = [archIdx[archSegments]!]
  for (let j = 1; j < floorSegments; j++) loop.push(floorIdx[j]!)
  loop.push(archIdx[0]!)
  for (let k = 1; k < archSegments; k++) loop.push(archIdx[k]!)
  return loop
}

function capLoop(builder: GeometryBuilder, loop: readonly number[], center: CaveTopologyPoint, flip: boolean): void {
  const c = pushVertex(builder, center.x, center.y, center.z)
  for (let i = 0; i < loop.length; i++) {
    const j = (i + 1) % loop.length
    if (flip) builder.indices.push(c, loop[j]!, loop[i]!)
    else builder.indices.push(c, loop[i]!, loop[j]!)
  }
}

function buildTube(
  builder: GeometryBuilder,
  samples: readonly PathSample[],
  params: SweepCaveParams,
  floorSegments: number,
  archSegments: number,
  detailEnabled: boolean,
  noises: NoiseStreams,
  capStart: boolean,
  capEnd: boolean,
): void {
  const loops = samples.map((sample) => buildRingLoop(builder, sample, params, floorSegments, archSegments, detailEnabled, noises))
  const ringLength = loops[0]!.length
  for (let i = 0; i < loops.length - 1; i++) {
    const a = loops[i]!
    const b = loops[i + 1]!
    for (let k = 0; k < ringLength; k++) {
      const k2 = (k + 1) % ringLength
      pushQuad(builder, a[k]!, a[k2]!, b[k2]!, b[k]!)
    }
  }
  if (capStart) capLoop(builder, loops[0]!, samples[0]!.position, true)
  if (capEnd) capLoop(builder, loops[loops.length - 1]!, samples[samples.length - 1]!.position, false)
}

export type SweepCaveResult = { geometry: THREE.BufferGeometry, metrics: CaveSpikeMetrics }

/**
 * Builds the Sweep spike's presentation geometry for `topology`. Pure —
 * no scene/collision/save side effects (plan world-terrain-008 Milestone A).
 *
 * @domain world-terrain
 */
export function buildSweepCaveMesh(
  topology: CaveTopology,
  params: SweepCaveParams = DEFAULT_SWEEP_PARAMS,
  includeBranch = false,
): SweepCaveResult {
  const seedBase = topology.seed
  const noises: NoiseStreams = {
    floor: createMultiScaleNoise1D(seedBase ^ 0x1a2b3c4d, [params.detail.micro, params.detail.medium]),
    ceiling: createMultiScaleNoise1D(seedBase ^ 0x2b3c4d5e, [params.detail.micro, params.detail.medium]),
    wallRight: createValueNoise1D(seedBase ^ 0x3c4d5e6f, 2.0),
    wallLeft: createValueNoise1D(seedBase ^ 0x4d5e6f70, 2.0),
    detail: createMultiScaleNoise1D(seedBase ^ 0x5e6f7081, [params.detail.micro, params.detail.medium, params.detail.large]),
  }
  const centerlineNoise = createValueNoise1D(seedBase ^ 0x6f708192, 1.2)

  const floorSegments = Math.max(4, Math.round(params.profileSegments * 0.35))
  const archSegments = Math.max(6, params.profileSegments - floorSegments)
  const detailEnabled = isSystemEnabled('caveDetail')

  const t0 = now()
  const mainFrames = densify(buildKeyframes(topology, MAIN_CHAIN), params.ringStep)
  const mainSamples = perturbSamples(toSamples(mainFrames), params.centerlinePerturbation, centerlineNoise)
  const t1 = now()

  const builder: GeometryBuilder = { positions: [], indices: [] }
  buildTube(builder, mainSamples, params, floorSegments, archSegments, detailEnabled, noises, false, true)

  const hasBranch = topology.nodes.some((n) => n.id === 'branch-chamber')
  if (includeBranch && hasBranch) {
    const branchFrames = densify(buildKeyframes(topology, ['widening-bend', 'branch-chamber']), params.ringStep)
    const branchSamples = perturbSamples(toSamples(branchFrames), params.centerlinePerturbation, centerlineNoise)
    buildTube(builder, branchSamples, params, floorSegments, archSegments, detailEnabled, noises, false, true)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(builder.positions, 3))
  geometry.setIndex(builder.indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  const t3 = now()

  const vertices = builder.positions.length / 3
  const triangles = builder.indices.length / 3
  const bb = geometry.boundingBox!

  const metrics: CaveSpikeMetrics = {
    variant: 'sweep',
    topologyBuildMs: 0,
    representationMs: t1 - t0,
    meshBuildMs: t3 - t1,
    vertices,
    triangles,
    geometryBytes: builder.positions.length * 4 + builder.indices.length * 4 + vertices * 3 * 4,
    peakTempBytes: null,
    bounds: { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] },
    params,
    detailEnabled,
  }

  return { geometry, metrics }
}
