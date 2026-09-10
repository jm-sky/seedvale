/** B3 recon-only harness: player Y snap at passage→chamber.
 *  Dumps spatial + PlayerController-order ticks. Does not change gameplay. */

import { describe, expect, it } from 'vitest'
import { createBenchmarkWorldConfig } from '../../config/worldConfig'
import { measureSlope } from '../../fauna/createFauna'
import { PLAYER_COLLISION_RADIUS, rockCeilingMaxY } from '../../player/PlayerController'
import { integrateVerticalMotion, STEP_DOWN_MAX } from '../../player/verticalMotion'
import { villageSizeConfig } from '../../settlement/families'
import { cellsWithinRadius, SETTLEMENT_GRID_STEP } from '../../settlement/settlementGenerator'
import {
  sampleContinentalnessAt,
  sampleHeightAt,
  sampleMountainRidgeAt,
  type RawSampleParams,
} from '../../terrain/chunkHeightmap'
import { colliderActiveAtY, resolvePosition } from '../collision'
import { pickLargeCaveSites, type LargeCaveSite, openingDirection } from '../largeCaves'
import { landmarkName } from '../locations/worldLocationNames'
import { makeCaveId } from './caveIdentity'
import { buildCaveSdfColliders } from './caveSdfColliders'
import { buildCaveSdfRepresentation } from './caveSdfField'
import {
  applyCaveGroundHysteresis,
  CAVE_FLOOR_GRACE,
  CAVE_UNDERGROUND_MISS,
  buildCaveSdfColumnIndex,
  columnIntervalsAt,
  isCaveInteriorAt,
  occupancyContains,
  occupancyIntervalAt,
  queryColumnIndex,
  type CaveGroundHit,
  type CaveSdfColumnIndex,
} from './caveSdfQuery'
import { mouthAlong, mouthLateral } from './mouthCarve'
import { buildProductionCaveTopology } from './productionTopology'
import type { CaveTopology } from './caveTopology'

const CASE_A_SEED = 1136726869
const CASE_B_SEED = 4185154392

const GROTA_CZARNEGO_KAMIENIA = {
  caveId: 'cave:0e3cce97',
  x: 135.84259216988767,
  z: -17.813611096688362,
}

const LAST_GOOD = {
  x: 120.38495979532945,
  y: 1.4451465297855004,
  z: -16.459093672276204,
}

const AFTER_SNAP = {
  x: 119.13665638618887,
  y: 11.179385651332232,
  z: -16.365048752186787,
}

const DT = 1 / 60
const WALK_STEP = 8 * DT

function rawParams(seed: number): RawSampleParams {
  const config = createBenchmarkWorldConfig({ seed, terrainResolution: 193, loadRadius: 4 })
  const t = config.terrain
  return {
    seed: config.seed,
    heightScale: t.heightScale,
    waterLevel: t.waterLevel,
    noiseScale: t.noiseScale,
    detailAmplitude: t.detailAmplitude,
    hillsScale: t.hillsScale,
    hillsAmplitude: t.hillsAmplitude,
    hillsFbm: t.hillsFbm,
    fbm: t.fbm,
    biome: t.biome,
    region: t.region,
  }
}

function surfaceSampler(seed: number): (x: number, z: number) => number {
  const params = rawParams(seed)
  return (x, z) => sampleHeightAt(x, z, params)
}

function siteFromEntrance(x: number, z: number, surfaceHeightAt: (x: number, z: number) => number): LargeCaveSite {
  return {
    x,
    z,
    yaw: measureSlope(x, z, 4, surfaceHeightAt).yaw,
    length: 12,
    variant: 0,
  }
}

function fmt(n: number | null | undefined, digits = 3): string {
  if (n == null || Number.isNaN(n)) return 'null'
  return n.toFixed(digits)
}

function ivl(index: CaveSdfColumnIndex, x: number, z: number): string {
  const intervals = columnIntervalsAt(index, x, z)
  if (intervals.length === 0) return '[]'
  return intervals
    .map((i) => `[${fmt(i.floorY, 2)}..${fmt(i.ceilingY, 2)}${i.openSky ? ' sky' : ''}]`)
    .join(',')
}

function nearestNode(topology: CaveTopology, x: number, z: number): string {
  let best = topology.nodes[0]!
  let bestD = Infinity
  for (const node of topology.nodes) {
    const d = Math.hypot(node.position.x - x, node.position.z - z)
    if (d < bestD) {
      best = node
      bestD = d
    }
  }
  return `${best.id}/${best.kind} d=${fmt(bestD, 2)} y=${fmt(best.position.y, 2)} ${fmt(best.targetWidth)}x${fmt(best.targetHeight)}`
}

function groundAt(
  index: CaveSdfColumnIndex,
  x: number,
  y: number,
  z: number,
  surfaceY: number,
  lastHit: CaveGroundHit | null,
): {
  raw: CaveGroundHit | null
  hyst: CaveGroundHit | null
  remember: CaveGroundHit | null
  source: 'cave' | 'hysteresis' | 'surface'
  floorY: number
  ceilingY: number | null
} {
  const raw = queryColumnIndex(index, x, y, z)
  const resolved = applyCaveGroundHysteresis(raw, y, surfaceY, lastHit)
  if (resolved.hit) {
    return {
      raw,
      hyst: resolved.hit,
      remember: resolved.remember,
      source: raw ? 'cave' : 'hysteresis',
      floorY: resolved.hit.floorY,
      ceilingY: resolved.hit.openSky ? null : resolved.hit.ceilingY,
    }
  }
  return {
    raw,
    hyst: null,
    remember: resolved.remember,
    source: 'surface',
    floorY: surfaceY,
    ceilingY: null,
  }
}

function buildCaseA() {
  const surfaceHeightAt = surfaceSampler(CASE_A_SEED)
  const site = siteFromEntrance(GROTA_CZARNEGO_KAMIENIA.x, GROTA_CZARNEGO_KAMIENIA.z, surfaceHeightAt)
  const topology = buildProductionCaveTopology({
    seed: CASE_A_SEED,
    site,
    sampleHeight: surfaceHeightAt,
    sampleBaseHeight: surfaceHeightAt,
  })
  if (!topology) throw new Error('Case A topology rejected')
  const sdf = buildCaveSdfRepresentation(topology)
  const index = buildCaveSdfColumnIndex(sdf, topology, surfaceHeightAt)
  const colliders = buildCaveSdfColliders(index, surfaceHeightAt, sdf, topology.entrance)
  return { topology, sdf, index, colliders, surfaceHeightAt }
}

function pickProductionCaves(seed: number) {
  const params = rawParams(seed)
  const surfaceHeightAt = (x: number, z: number) => sampleHeightAt(x, z, params)
  const homeFootprint = villageSizeConfig('MD').footprintRadius
  const villages = cellsWithinRadius({ gx: 0, gz: 0 }, 3).map((cell) => ({
    x: cell.gx * SETTLEMENT_GRID_STEP,
    z: cell.gz * SETTLEMENT_GRID_STEP,
    radius: cell.gx === 0 && cell.gz === 0 ? homeFootprint : villageSizeConfig('MD').footprintRadius,
  }))
  const sites = pickLargeCaveSites({
    seed,
    sampleHeight: surfaceHeightAt,
    sampleContinentalness: (x, z) => sampleContinentalnessAt(x, z, params),
    sampleMountainRidge: (x, z) => sampleMountainRidgeAt(x, z, params),
    waterLevel: params.waterLevel,
    coastThreshold: 0.45,
    roadsNear: () => [],
    villages,
  })
  const built = []
  for (const site of sites) {
    const topology = buildProductionCaveTopology({
      seed,
      site,
      sampleHeight: surfaceHeightAt,
      sampleBaseHeight: surfaceHeightAt,
    })
    if (!topology) continue
    const sdf = buildCaveSdfRepresentation(topology)
    const index = buildCaveSdfColumnIndex(sdf, topology, surfaceHeightAt)
    built.push({
      name: landmarkName(seed, 'cave', topology.caveId),
      topology,
      sdf,
      index,
      surfaceHeightAt,
    })
  }
  return built
}

describe('B3 chamber-snap recon (no gameplay change)', () => {
  it('Case A spatial + player-update trace between last-good and surface snap', () => {
    const cave = buildCaseA()
    const { topology, sdf, index, colliders, surfaceHeightAt } = cave
    expect(topology.caveId).toBe(GROTA_CZARNEGO_KAMIENIA.caveId)

    const { entrance } = topology
    const out = openingDirection(entrance.yaw)
    const lines: string[] = []
    const log = (s: string): void => {
      lines.push(s)
    }

    log(`entrance ${fmt(entrance.x)} ${fmt(entrance.y)} ${fmt(entrance.z)} yaw=${fmt(entrance.yaw, 3)}`)
    log(`opening dx=${fmt(out.dx, 3)} dz=${fmt(out.dz, 3)}`)
    log(`index origin=(${fmt(index.originX)},${fmt(index.originZ)}) step=${index.step} nx=${index.nx} nz=${index.nz} y=[${fmt(index.minY)},${fmt(index.maxY)}]`)
    log(`sdf bounds x=[${fmt(sdf.bounds.minX)},${fmt(sdf.bounds.maxX)}] y=[${fmt(sdf.bounds.minY)},${fmt(sdf.bounds.maxY)}] z=[${fmt(sdf.bounds.minZ)},${fmt(sdf.bounds.maxZ)}]`)
    for (const node of topology.nodes) {
      const along = mouthAlong(node.position.x, node.position.z, entrance)
      const surf = surfaceHeightAt(node.position.x, node.position.z)
      const roof = surf - (node.position.y + node.targetHeight / 2)
      log(
        `node ${node.id.padEnd(16)} ${node.kind.padEnd(10)} along=${fmt(along, 2)} `
        + `pos=${fmt(node.position.x, 2)},${fmt(node.position.y, 2)},${fmt(node.position.z, 2)} `
        + `${fmt(node.targetWidth, 2)}x${fmt(node.targetHeight, 2)} surf=${fmt(surf, 2)} roof=${fmt(roof, 2)} ivl=${ivl(index, node.position.x, node.position.z)}`,
      )
    }

    const dx = AFTER_SNAP.x - LAST_GOOD.x
    const dz = AFTER_SNAP.z - LAST_GOOD.z
    const span = Math.hypot(dx, dz)
    log(`\n=== spatial line last-good → snap  span=${fmt(span, 3)} ===`)
    log(`LAST_GOOD along=${fmt(mouthAlong(LAST_GOOD.x, LAST_GOOD.z, entrance), 2)} lat=${fmt(mouthLateral(LAST_GOOD.x, LAST_GOOD.z, entrance), 2)}`)
    log(`AFTER_SNAP along=${fmt(mouthAlong(AFTER_SNAP.x, AFTER_SNAP.z, entrance), 2)} lat=${fmt(mouthLateral(AFTER_SNAP.x, AFTER_SNAP.z, entrance), 2)}`)

    let lastHit: CaveGroundHit | null = queryColumnIndex(index, LAST_GOOD.x, LAST_GOOD.y, LAST_GOOD.z)
    let firstSpatialFail: string | null = null
    const step = 0.05
    const samples = Math.max(1, Math.ceil(span / step))
    for (let i = 0; i <= samples; i++) {
      const t = i / samples
      const x = LAST_GOOD.x + dx * t
      const z = LAST_GOOD.z + dz * t
      const along = mouthAlong(x, z, entrance)
      const lat = mouthLateral(x, z, entrance)
      const surfaceY = surfaceHeightAt(x, z)
      const yPrev = LAST_GOOD.y
      const yInterp = LAST_GOOD.y + (AFTER_SNAP.y - LAST_GOOD.y) * t
      const gPrev = groundAt(index, x, yPrev, z, surfaceY, lastHit)
      const gFloor = lastHit
        ? groundAt(index, x, lastHit.floorY + 1.1, z, surfaceY, lastHit)
        : gPrev
      const occ = occupancyContains(index, x, yPrev, z)
      const interior = isCaveInteriorAt(index, entrance, x, yPrev, z)
      const sdfPlayer = sdf.sample(x, yPrev, z)
      const sdfMid = sdf.sample(x, (yPrev + surfaceY) * 0.5, z)
      const ix = Math.round((x - index.originX) / index.step)
      const iz = Math.round((z - index.originZ) / index.step)
      const oob = ix < 0 || iz < 0 || ix >= index.nx || iz >= index.nz
      const stepUp = gPrev.floorY - yPrev
      log(
        `t=${t.toFixed(2)} along=${fmt(along, 2)} lat=${fmt(lat, 2)} xz=${fmt(x, 3)},${fmt(z, 3)} `
        + `surf=${fmt(surfaceY, 2)} ivl=${ivl(index, x, z)} oob=${oob ? 'Y' : 'n'} ixiz=${ix},${iz} `
        + `qY=${fmt(yPrev, 2)} raw=${fmt(gPrev.raw?.floorY)} hyst=${gPrev.source} floor=${fmt(gPrev.floorY, 2)} `
        + `ceil=${fmt(gPrev.ceilingY, 2)} dFloor=${fmt(stepUp, 2)} occ=${occ} int=${interior} `
        + `sdfP=${fmt(sdfPlayer, 2)} sdfMid=${fmt(sdfMid, 2)} node=${nearestNode(topology, x, z)} `
        + `interpY=${fmt(yInterp, 2)} gFloorSrc=${gFloor.source}`,
      )
      if (!firstSpatialFail && (gPrev.source === 'surface' || !occ || oob || gPrev.raw == null)) {
        firstSpatialFail = `i=${i} t=${t.toFixed(2)} along=${fmt(along, 2)} src=${gPrev.source} raw=${gPrev.raw == null} occ=${occ} oob=${oob}`
      }
      lastHit = gPrev.remember
    }

    log(`\nFIRST SPATIAL DISCONTINUITY: ${firstSpatialFail ?? 'none on last-good Y with hysteresis primed'}`)

    log('\n=== lateral sweep at last-good along, y=1.445 ===')
    const along0 = mouthAlong(LAST_GOOD.x, LAST_GOOD.z, entrance)
    for (let lat = -6; lat <= 6; lat += 0.4) {
      const x = entrance.x + out.dx * along0 - out.dz * lat
      const z = entrance.z + out.dz * along0 + out.dx * lat
      const surfaceY = surfaceHeightAt(x, z)
      const raw = queryColumnIndex(index, x, LAST_GOOD.y, z)
      log(
        `lat=${fmt(lat, 1)} xz=${fmt(x, 2)},${fmt(z, 2)} surf=${fmt(surfaceY, 2)} ivl=${ivl(index, x, z)} `
        + `raw=${fmt(raw?.floorY)} sdf=${fmt(sdf.sample(x, LAST_GOOD.y, z), 2)}`,
      )
    }

    log('\n=== along sweep y=1.445 lat=last-good, -12 → -24 ===')
    const lat0 = mouthLateral(LAST_GOOD.x, LAST_GOOD.z, entrance)
    for (let along = -12; along >= -24; along -= 0.25) {
      const x = entrance.x + out.dx * along - out.dz * lat0
      const z = entrance.z + out.dz * along + out.dx * lat0
      const surfaceY = surfaceHeightAt(x, z)
      const raw = queryColumnIndex(index, x, LAST_GOOD.y, z)
      const occ = occupancyContains(index, x, LAST_GOOD.y, z)
      log(
        `along=${fmt(along, 2)} xz=${fmt(x, 2)},${fmt(z, 2)} surf=${fmt(surfaceY, 2)} ivl=${ivl(index, x, z)} `
        + `raw=${fmt(raw?.floorY)} occ=${occ} sdf=${fmt(sdf.sample(x, LAST_GOOD.y, z), 2)} ${nearestNode(topology, x, z)}`,
      )
    }

    log('\n=== PlayerController-order ticks from LAST_GOOD toward AFTER_SNAP ===')
    let x = LAST_GOOD.x
    let y = LAST_GOOD.y
    let z = LAST_GOOD.z
    let vy = 0
    let grounded = true
    lastHit = queryColumnIndex(index, x, y, z)
    const dirX = dx / span
    const dirZ = dz / span
    let lastGoodTick: string | null = null
    let firstBadTick: string | null = null
    for (let tick = 0; tick < 40; tick++) {
      const yBefore = y
      const xBefore = x
      const zBefore = z
      const wishX = dirX * WALK_STEP
      const wishZ = dirZ * WALK_STEP
      const candidateX = x + wishX
      const candidateZ = z + wishZ
      const active = colliders.filter((c) => colliderActiveAtY(c, y))
      const resolved = resolvePosition(candidateX, candidateZ, PLAYER_COLLISION_RADIUS, active)
      const push = Math.hypot(resolved.x - candidateX, resolved.z - candidateZ)
      x = resolved.x
      z = resolved.z
      const surfaceY = surfaceHeightAt(x, z)
      const g = groundAt(index, x, y, z, surfaceY, lastHit)
      lastHit = g.remember
      const occ = occupancyContains(index, x, y, z)
      const interior = isCaveInteriorAt(index, entrance, x, y, z)
      const maxY = rockCeilingMaxY(g.ceilingY, g.floorY)
      const next = integrateVerticalMotion({
        y,
        verticalVelocity: vy,
        grounded,
        groundY: g.floorY,
        dt: DT,
        jumpRequested: false,
        maxY,
      })
      const yWriter = grounded && g.floorY >= y - STEP_DOWN_MAX
        ? 'integrateVerticalMotion.groundedSnap'
        : next.y === g.floorY && next.grounded && y !== g.floorY
          ? 'integrateVerticalMotion.applyGravityLand'
          : 'integrateVerticalMotion.air/other'
      y = next.y
      vy = next.verticalVelocity
      grounded = next.grounded
      const dY = y - yBefore
      const hystWouldKeep = !g.raw && surfaceY - yBefore > CAVE_UNDERGROUND_MISS
      const row = (
        `tick=${tick} before=${fmt(xBefore, 3)},${fmt(yBefore, 3)},${fmt(zBefore, 3)} `
        + `afterXZ=${fmt(x, 3)},${fmt(z, 3)} push=${fmt(push, 3)} `
        + `along=${fmt(mouthAlong(x, z, entrance), 2)} lat=${fmt(mouthLateral(x, z, entrance), 2)} `
        + `surf=${fmt(surfaceY, 2)} ivl=${ivl(index, x, z)} raw=${fmt(g.raw?.floorY)} src=${g.source} `
        + `floor=${fmt(g.floorY, 2)} ceil=${fmt(g.ceilingY, 2)} maxY=${fmt(maxY)} occ=${occ} int=${interior} `
        + `grounded ${grounded ? 'Y' : 'n'} vy ${fmt(vy, 2)} y ${fmt(yBefore, 3)}→${fmt(y, 3)} dY=${fmt(dY, 3)} `
        + `writer=${yWriter} hystKeepPred=${hystWouldKeep} grace=${CAVE_FLOOR_GRACE} `
        + `${nearestNode(topology, x, z)}`
      )
      log(row)
      const ok = g.source !== 'surface' && Math.abs(dY) < 2
      if (ok) lastGoodTick = row
      if (!ok && !firstBadTick) firstBadTick = row
      if (y > surfaceY - 1 && dY > 2) break
    }

    log('\n=== centerline walk last-good → chamber ===')
    const chamber = topology.nodes.find((n) => n.kind === 'chamber')!
    x = LAST_GOOD.x
    y = LAST_GOOD.y
    z = LAST_GOOD.z
    vy = 0
    grounded = true
    lastHit = queryColumnIndex(index, x, y, z)
    let centerlineBad: string | null = null
    for (let tick = 0; tick < 180; tick++) {
      const target = chamber
      const toX = target.position.x - x
      const toZ = target.position.z - z
      const dist = Math.hypot(toX, toZ)
      if (dist < 0.4) break
      const wishX = (toX / dist) * WALK_STEP
      const wishZ = (toZ / dist) * WALK_STEP
      const active = colliders.filter((c) => colliderActiveAtY(c, y))
      const resolved = resolvePosition(x + wishX, z + wishZ, PLAYER_COLLISION_RADIUS, active)
      x = resolved.x
      z = resolved.z
      const surfaceY = surfaceHeightAt(x, z)
      const g = groundAt(index, x, y, z, surfaceY, lastHit)
      lastHit = g.remember
      const next = integrateVerticalMotion({
        y,
        verticalVelocity: vy,
        grounded,
        groundY: g.floorY,
        dt: DT,
        jumpRequested: false,
        maxY: rockCeilingMaxY(g.ceilingY, g.floorY),
      })
      const dY = next.y - y
      y = next.y
      vy = next.verticalVelocity
      grounded = next.grounded
      if (g.source === 'surface' || dY > 2) {
        centerlineBad = (
          `tick=${tick} xz=${fmt(x, 3)},${fmt(z, 3)} y ${fmt(y - dY, 3)}→${fmt(y, 3)} src=${g.source} `
          + `along=${fmt(mouthAlong(x, z, entrance), 2)} ivl=${ivl(index, x, z)} ${nearestNode(topology, x, z)}`
        )
        log(`CENTERLINE BAD ${centerlineBad}`)
        break
      }
    }
    log(`centerline end xz=${fmt(x, 3)},${fmt(y, 3)},${fmt(z, 3)} along=${fmt(mouthAlong(x, z, entrance), 2)} srcLast=${lastHit ? 'cave' : 'null'}`)
    log(`CENTERLINE BAD: ${centerlineBad ?? 'none'}`)

    log('\n=== LAST GOOD / FIRST BAD (world-west walk) ===')
    log(`LAST GOOD:\n${lastGoodTick ?? 'none'}`)
    log(`FIRST BAD:\n${firstBadTick ?? 'none'}`)

    // eslint-disable-next-line no-console
    console.log(lines.join('\n'))

    expect(topology.caveId).toBe(GROTA_CZARNEGO_KAMIENIA.caveId)
    expect(span).toBeGreaterThan(1)
    expect(firstBadTick).toBeNull()
    expect(centerlineBad).toBeNull()

    const surfaceAtGood = cave.surfaceHeightAt(LAST_GOOD.x, LAST_GOOD.z)
    const primed = groundAt(index, LAST_GOOD.x, LAST_GOOD.y, LAST_GOOD.z, surfaceAtGood, queryColumnIndex(index, LAST_GOOD.x, LAST_GOOD.y, LAST_GOOD.z))
    expect(primed.source).toBe('cave')
    const cleared = groundAt(index, LAST_GOOD.x, LAST_GOOD.y, LAST_GOOD.z, surfaceAtGood, null)
    expect(cleared.source).toBe('cave')
    const snapXz = groundAt(index, AFTER_SNAP.x, LAST_GOOD.y, AFTER_SNAP.z, cave.surfaceHeightAt(AFTER_SNAP.x, AFTER_SNAP.z), null)
    expect(snapXz.source).toBe('cave')
    const missThenSurface = integrateVerticalMotion({
      y: LAST_GOOD.y,
      verticalVelocity: 0,
      grounded: true,
      groundY: surfaceAtGood,
      dt: DT,
      jumpRequested: false,
    })
    expect(missThenSurface.y).toBeCloseTo(surfaceAtGood, 5)
    expect(missThenSurface.y - LAST_GOOD.y).toBeGreaterThan(8)
  })

  it('Case B Grota Milcząca: same passage→chamber signature', () => {
    const caves = pickProductionCaves(CASE_B_SEED)
    const names = caves.map((c) => `${c.name} ${c.topology.caveId} (${fmt(c.topology.entrance.x, 1)},${fmt(c.topology.entrance.z, 1)})`)
    // eslint-disable-next-line no-console
    console.log(`seed ${CASE_B_SEED} caves:\n${names.join('\n')}`)
    const milczaca = caves.find((c) => c.name.includes('Milcząca'))
    expect(caves.length).toBeGreaterThan(0)
    if (!milczaca) {
      // eslint-disable-next-line no-console
      console.log('Grota/Jaskinia Milcząca not in accepted set with roads=[] — listing all for mapping')
      return
    }

    const { topology, sdf, index, surfaceHeightAt } = milczaca
    const { entrance } = topology
    const out = openingDirection(entrance.yaw)
    const lines: string[] = [`CASE B ${milczaca.name} ${topology.caveId}`]
    for (const node of topology.nodes) {
      const along = mouthAlong(node.position.x, node.position.z, entrance)
      lines.push(
        `node ${node.id} ${node.kind} along=${fmt(along, 2)} y=${fmt(node.position.y, 2)} `
        + `${fmt(node.targetWidth, 2)}x${fmt(node.targetHeight, 2)} ivl=${ivl(index, node.position.x, node.position.z)}`,
      )
    }

    const lat = 0
    let lastHit: CaveGroundHit | null = null
    let y = entrance.y + 1.1
    let firstMissAlong: number | null = null
    let firstSurfaceTakeover: string | null = null
    for (let along = 0; along >= -28; along -= 0.25) {
      const x = entrance.x + out.dx * along - out.dz * lat
      const z = entrance.z + out.dz * along + out.dx * lat
      const surfaceY = surfaceHeightAt(x, z)
      const g = groundAt(index, x, y, z, surfaceY, lastHit)
      lastHit = g.remember
      const occ = occupancyContains(index, x, y, z)
      const sdfP = sdf.sample(x, y, z)
      if (g.raw && Math.abs(g.raw.floorY - y) < 4) y = g.raw.floorY + 1.1
      if (!firstMissAlong && g.raw == null) firstMissAlong = along
      if (!firstSurfaceTakeover && g.source === 'surface') {
        firstSurfaceTakeover = `along=${along} y=${fmt(y, 2)} surf=${fmt(surfaceY, 2)} ivl=${ivl(index, x, z)} sdf=${fmt(sdfP, 2)} ${nearestNode(topology, x, z)}`
      }
      if (along % 1 === 0 || g.source === 'surface' || g.raw == null) {
        lines.push(
          `along=${fmt(along, 2)} y=${fmt(y, 2)} surf=${fmt(surfaceY, 2)} ivl=${ivl(index, x, z)} src=${g.source} `
          + `raw=${fmt(g.raw?.floorY)} occ=${occ} sdf=${fmt(sdfP, 2)} ${nearestNode(topology, x, z)}`,
        )
      }
    }
    lines.push(`first raw miss along=${firstMissAlong}`)
    lines.push(`first surface takeover: ${firstSurfaceTakeover ?? 'none'}`)
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'))
    expect(milczaca.name).toBe('Jaskinia Milcząca')
    expect(milczaca.topology.caveId).toBe('cave:cf109eda')
    expect(firstMissAlong).not.toBeNull()
    expect(firstMissAlong!).toBeLessThan(-16)
    expect(firstSurfaceTakeover).toBeNull()
  })
})
