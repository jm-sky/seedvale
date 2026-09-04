import * as THREE from 'three'
import { patchProceduralFoliageMaterial } from '../world/foliageWind'
import { applyTerrainTilt, rotateOffsetY, sampleLocalTerrain, type TerrainSampler } from './propUtils'

/** World placement context an individual stone-circle stone / cemetery grave
 *  needs to sample its own terrain height/normal (plan 173) — `worldX/worldZ`
 *  is the landmark's own placement point (matching `EnvironmentPlacement.x/z`)
 *  and `rotationY` its overall yaw. Omitted entirely, the flat single-height
 *  layout used before plan 173 is preserved (e.g. for tooling/tests that
 *  don't have a terrain sampler at hand). */
export type TerrainPlacementContext = {
  worldX: number
  worldZ: number
  rotationY: number
  sampleHeight: TerrainSampler
}

export function createTree(scale = 1): THREE.Group {
  const tree = new THREE.Group()
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18 * scale, 0.25 * scale, 1.6 * scale, 6),
    new THREE.MeshStandardMaterial({ color: 0x5c4033, flatShading: true }),
  )
  trunk.position.y = 0.8 * scale
  trunk.castShadow = true
  tree.add(trunk)

  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(1.1 * scale, 2.2 * scale, 6),
    new THREE.MeshStandardMaterial({ color: 0x2f6b3a, flatShading: true }),
  )
  crown.position.y = 2.3 * scale
  crown.castShadow = true
  patchProceduralFoliageMaterial(crown.material as THREE.MeshStandardMaterial)
  tree.add(crown)
  return tree
}

/** Visible harvest remainder (plan 058) — same TreeId as the living tree. */
export function createTreeStump(scale = 1): THREE.Group {
  const stump = new THREE.Group()
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2 * scale, 0.26 * scale, 0.45 * scale, 6),
    new THREE.MeshStandardMaterial({ color: 0x5c4033, flatShading: true }),
  )
  trunk.position.y = 0.22 * scale
  trunk.castShadow = true
  stump.add(trunk)

  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22 * scale, 0.22 * scale, 0.06 * scale, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b5340, flatShading: true }),
  )
  top.position.y = 0.48 * scale
  top.castShadow = true
  stump.add(top)
  return stump
}

/** Chop step 1 visual — tall trunk without crown (limbed / "dead" tree). */
export function createLimbedTree(scale = 1): THREE.Group {
  const tree = new THREE.Group()
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16 * scale, 0.22 * scale, 2.8 * scale, 6),
    new THREE.MeshStandardMaterial({ color: 0x4a3728, flatShading: true }),
  )
  trunk.position.y = 1.4 * scale
  trunk.castShadow = true
  tree.add(trunk)

  // A couple of short stub branches so it reads as "stripped", not a pole.
  const stubMat = new THREE.MeshStandardMaterial({ color: 0x3d2e22, flatShading: true })
  const stubA = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * scale, 0.05 * scale, 0.45 * scale, 5), stubMat)
  stubA.position.set(0.28 * scale, 2.1 * scale, 0)
  stubA.rotation.z = -0.9
  stubA.castShadow = true
  tree.add(stubA)
  const stubB = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * scale, 0.045 * scale, 0.35 * scale, 5), stubMat)
  stubB.position.set(-0.22 * scale, 1.7 * scale, 0.1 * scale)
  stubB.rotation.z = 1.0
  stubB.castShadow = true
  tree.add(stubB)
  return tree
}

/**
 * Chop step 2 visual — low stump + fallen log beside it (same TreeId group).
 * `yaw` rotates the log offset so neighboring trees don't stack logs the same way.
 */
export function createFelledTree(scale = 1, yaw = 0): THREE.Group {
  const group = new THREE.Group()
  const stump = createTreeStump(scale)
  group.add(stump)

  const log = createFallenLog(scale, 2.6)
  const offset = 1.25 * scale
  log.position.set(Math.sin(yaw) * offset, 0, Math.cos(yaw) * offset)
  log.rotation.y = yaw + Math.PI / 2
  group.add(log)
  return group
}

export function createBush(scale = 1): THREE.Group {
  const bush = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.55 * scale, 6, 4),
    new THREE.MeshStandardMaterial({ color: 0x3d7a3a, flatShading: true }),
  )
  body.scale.y = 0.75
  body.position.y = 0.42 * scale
  body.castShadow = true
  bush.add(body)
  return bush
}

/** Tight cluster of five small trees — visual for the prey `thicket`
 *  spawner (`createFauna.ts`). Origin at feet; footprint ~2.5 m at scale 1.
 *  `variant` (0..1) jitters tree scales/offsets so two thickets don't look
 *  identical. Reuses `createTree` so foliage wind matches other procedural
 *  crowns. */
export function createThicket(scale = 1, variant = 0.5): THREE.Group {
  const group = new THREE.Group()
  // Five trees packed close around the origin (~72° apart) — reads as a
  // dense little grove, not a few scattered trees.
  const placements: Array<{ angle: number, radius: number, size: number }> = [
    { angle: 0.15 + variant * 0.4, radius: 0.7, size: 0.68 },
    { angle: 1.4 + variant * 0.3, radius: 0.55, size: 0.5 },
    { angle: 2.65 + variant * 0.35, radius: 0.75, size: 0.6 },
    { angle: 3.9 + variant * 0.25, radius: 0.5, size: 0.48 },
    { angle: 5.15 + variant * 0.3, radius: 0.65, size: 0.58 },
  ]
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]!
    const sizeJitter = 0.9 + ((variant * (i + 3)) % 1) * 0.25
    const tree = createTree(scale * p.size * sizeJitter)
    const r = p.radius * scale * (0.9 + ((variant * (i + 5)) % 1) * 0.2)
    tree.position.set(Math.sin(p.angle) * r, 0, Math.cos(p.angle) * r)
    tree.rotation.y = variant * 4.2 + i * 1.7
    group.add(tree)
  }
  return group
}

export function createCactus(scale = 1): THREE.Group {
  const cactus = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x4d7a4a, flatShading: true })

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.28 * scale, 1.6 * scale, 7), mat)
  trunk.position.y = 0.8 * scale
  trunk.castShadow = true
  cactus.add(trunk)

  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * scale, 0.16 * scale, 0.7 * scale, 6), mat)
  arm.position.set(0.28 * scale, 1.05 * scale, 0)
  arm.rotation.z = -0.5
  arm.castShadow = true
  cactus.add(arm)

  return cactus
}

/** Forest-floor undergrowth fallback — a squashed, low bush (plan 140). */
export function createFern(scale = 1): THREE.Group {
  const fern = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.4 * scale, 6, 4),
    new THREE.MeshStandardMaterial({ color: 0x4a7d3f, flatShading: true }),
  )
  body.scale.set(1.2, 0.35, 1.2)
  body.position.y = 0.14 * scale
  body.castShadow = false
  patchProceduralFoliageMaterial(body.material as THREE.MeshStandardMaterial)
  fern.add(body)
  return fern
}

/** Plaza cobble plate fallback — a low, wide stone disc (plan 140). */
export function createCobblePlate(scale = 1): THREE.Group {
  const plate = new THREE.Group()
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.72 * scale, 0.78 * scale, 0.06 * scale, 6),
    new THREE.MeshStandardMaterial({ color: 0x8a8a86, flatShading: true }),
  )
  mesh.position.y = 0.03 * scale
  mesh.castShadow = false
  mesh.receiveShadow = true
  plate.add(mesh)
  return plate
}

export function createReed(scale = 1): THREE.Group {
  const reed = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x6f8a4a, flatShading: true })
  for (let i = 0; i < 5; i++) {
    const height = (0.8 + Math.random() * 0.5) * scale
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.035 * scale, height, 4), mat)
    blade.position.set((Math.random() - 0.5) * 0.3 * scale, height / 2, (Math.random() - 0.5) * 0.3 * scale)
    // No shadow: a 3.5cm-radius blade contributes an imperceptible shadow at
    // the world's shadow-map resolution but still costs a draw call (perf
    // review A2 — "drobne propsy").
    blade.castShadow = false
    reed.add(blade)
  }
  return reed
}

/** Shallow-water lily pad fallback (plan world-terrain-010) — flat disc, no
 *  shadow (same "drobne propsy" reasoning as `createReed`). */
export function createLilyPad(scale = 1): THREE.Group {
  const lily = new THREE.Group()
  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(0.28 * scale, 8),
    new THREE.MeshStandardMaterial({ color: 0x2f6b3a, flatShading: true, side: THREE.DoubleSide }),
  )
  pad.rotation.x = -Math.PI / 2
  pad.castShadow = false
  lily.add(pad)
  return lily
}

/** Irregular boulder — `IcosahedronGeometry` squashed/stretched per axis from
 *  `variant` (deterministic, no `Math.random()`: the caller already rolled a
 *  seeded `variant` in `chunkEnvironment.ts`, so re-rolling here would break
 *  the "same chunk reload = same world" guarantee). */
export function createLargeRock(scale = 1, variant = 0.5): THREE.Group {
  const rock = new THREE.Group()
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.9 * scale, 0),
    new THREE.MeshStandardMaterial({ color: 0x7d7a72, flatShading: true, roughness: 1 }),
  )
  mesh.scale.set(
    0.75 + variant * 0.6,
    0.55 + ((variant * 7) % 1) * 0.5,
    0.75 + ((variant * 13) % 1) * 0.6,
  )
  mesh.position.y = 0.35 * scale
  mesh.castShadow = true
  mesh.receiveShadow = true
  rock.add(mesh)
  return rock
}

/** Small cluster of pebbles (same geometry as the collectible `stone` item,
 *  `items.ts` — pure visual reuse) scattered deterministically from `variant`
 *  via trig offsets rather than `Math.random()`. `color` defaults to plain
 *  rock gray — overridden for ore piles (`terrain/resourceDeposits.ts`, e.g.
 *  rust for iron, near-black for coal, gold for a gold vein). */
export function createRockCluster(scale = 1, variant = 0.5, color = 0x8c8c8c): THREE.Group {
  const cluster = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color, flatShading: true })
  // Wider spread than a fixed 3-5: `variant` (already a random 0..1 roll from
  // the caller) pushes some clusters up to 9 pebbles for visible size variety
  // between clusters, not just within one.
  const count = 3 + Math.floor(variant * 7)
  const spread = 0.7 + variant * 0.6
  for (let i = 0; i < count; i++) {
    const a = variant * Math.PI * 2 + i * 2.4
    const r = (0.15 + ((variant * (i + 3)) % 1) * 0.3) * spread
    const pebble = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.16 * scale * (0.7 + (i % 3) * 0.15), 0),
      mat,
    )
    pebble.position.set(Math.cos(a) * r, 0.08 * scale, Math.sin(a) * r)
    pebble.rotation.set(a, a * 1.3, 0)
    // No shadow: same reasoning as `createReed` (perf review A2).
    pebble.castShadow = false
    cluster.add(pebble)
  }
  return cluster
}

/** Fallen tree trunk lying on its side — `length` (world units) comes from
 *  `EnvironmentPlacement.variant`. Reuses `createTree`'s trunk color. */
export function createFallenLog(scale = 1, length = 2.4): THREE.Group {
  const log = new THREE.Group()
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22 * scale, 0.26 * scale, length * scale, 7),
    new THREE.MeshStandardMaterial({ color: 0x5c4033, flatShading: true }),
  )
  trunk.rotation.z = Math.PI / 2
  trunk.position.y = 0.22 * scale
  trunk.castShadow = true
  trunk.receiveShadow = true
  log.add(trunk)
  return log
}

/** Single standing stone landmark (plans/2026-08-09--049, "częste" tier) —
 *  a tapered low-poly pillar with a slight lean plus a couple of grounding
 *  rubble pebbles at its base. `variant` (0..1) drives height, lean and
 *  rubble placement so no two monoliths look identical. */
/** Terrain-aware element placement (plan world-terrain-006) — same
 *  finite-difference step/lean-clamp shape as `STONE_CIRCLE_TILT_STEP`/
 *  `STONE_CIRCLE_MAX_TILT_RAD`, tuned down slightly: monolith rubble sits
 *  close to the ground and shouldn't tilt as visibly as a tall stone-circle
 *  pillar. */
const MONOLITH_TILT_STEP = 0.5
const MONOLITH_MAX_TILT_RAD = THREE.MathUtils.degToRad(12)

/** Rare "częste" tier landmark (plans/2026-08-09--049) — a single leaning
 *  monolith with a scatter of rubble at its base. `terrain` (plan
 *  world-terrain-006), when given, grounds/tilts the main stone and each
 *  rubble piece at its own exact world position (same `applyTerrainTilt`
 *  pattern as `createStoneCircle`/`createCemetery`) instead of leaving only
 *  the landmark's root grounded by the caller's `placeOnGround` — on an
 *  accepted slope that left rubble floating/intersecting the terrain. */
export function createMonolith(scale = 1, variant = 0.5, terrain?: TerrainPlacementContext): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x726d64, flatShading: true, roughness: 1 })
  const baseY = terrain ? terrain.sampleHeight(terrain.worldX, terrain.worldZ) : 0

  const height = (3 + variant * 2.4) * scale
  const stone = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32 * scale, 0.5 * scale, height, 5),
    mat,
  )
  stone.rotation.y = variant * Math.PI * 2
  stone.rotation.z = (variant - 0.5) * 0.18 // slight deliberate lean
  stone.position.y = height / 2
  if (terrain) {
    const sample = sampleLocalTerrain(terrain.sampleHeight, terrain.worldX, terrain.worldZ, MONOLITH_TILT_STEP)
    stone.position.y = sample.height - baseY + height / 2
    stone.rotation.y += terrain.rotationY
    applyTerrainTilt(stone, sample.normal, MONOLITH_MAX_TILT_RAD)
  }
  stone.castShadow = true
  stone.receiveShadow = true
  group.add(stone)

  const rubbleCount = 2 + Math.floor(variant * 3)
  for (let i = 0; i < rubbleCount; i++) {
    const a = variant * Math.PI * 2 + i * 2.3
    const r = 0.5 * scale + ((variant * (i + 4)) % 1) * 0.3 * scale
    const rubble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 * scale, 0), mat)
    const localX = Math.cos(a) * r
    const localZ = Math.sin(a) * r
    if (terrain) {
      const { x: rx, z: rz } = rotateOffsetY(localX, localZ, terrain.rotationY)
      const sample = sampleLocalTerrain(terrain.sampleHeight, terrain.worldX + rx, terrain.worldZ + rz, MONOLITH_TILT_STEP)
      rubble.position.set(rx, sample.height - baseY + 0.1 * scale, rz)
      rubble.rotation.set(a, a * 1.4, 0)
      applyTerrainTilt(rubble, sample.normal, MONOLITH_MAX_TILT_RAD)
    } else {
      rubble.position.set(localX, 0.1 * scale, localZ)
      rubble.rotation.set(a, a * 1.4, 0)
    }
    rubble.castShadow = true
    group.add(rubble)
  }

  return group
}

/** Terrain-aware element placement (plan 173) — finite-difference step and
 *  lean clamp for individual stone-circle stones. Stones are thick/short
 *  enough to tolerate more visible lean than a gravestone before it reads
 *  as broken. */
const STONE_CIRCLE_TILT_STEP = 0.4
const STONE_CIRCLE_MAX_TILT_RAD = THREE.MathUtils.degToRad(20)

/** Small stone circle landmark (plans/2026-08-09--049, "rzadkie" tier) — a
 *  ring of upright stones of uneven height, deterministically varied by
 *  `variant` (stone count 6-9, per-stone height jitter). Reads as a miniature
 *  Stonehenge from a distance without needing per-stone unique geometry.
 *  `terrain` (plan 173), when given, samples each stone's own ground height/
 *  normal at its exact world position instead of placing the whole ring at
 *  one height — the caller still positions the returned group at the
 *  landmark's own ground height via `placeOnGround`/`terrain.worldX/worldZ`
 *  (same value), so per-stone offsets are relative to that. */
export function createStoneCircle(scale = 1, variant = 0.5, terrain?: TerrainPlacementContext): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x736e64, flatShading: true, roughness: 1 })

  const count = 6 + Math.floor(variant * 4)
  const radius = 2.6 * scale
  const baseY = terrain ? terrain.sampleHeight(terrain.worldX, terrain.worldZ) : 0
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2
    const h = (1.3 + ((variant * (i + 2)) % 1) * 0.9) * scale
    const stone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22 * scale, 0.3 * scale, h, 5),
      mat,
    )
    const localX = Math.cos(a) * radius
    const localZ = Math.sin(a) * radius
    if (terrain) {
      const { x: rx, z: rz } = rotateOffsetY(localX, localZ, terrain.rotationY)
      const sample = sampleLocalTerrain(terrain.sampleHeight, terrain.worldX + rx, terrain.worldZ + rz, STONE_CIRCLE_TILT_STEP)
      stone.position.set(rx, sample.height - baseY + h / 2, rz)
      stone.rotation.y = a + terrain.rotationY
      applyTerrainTilt(stone, sample.normal, STONE_CIRCLE_MAX_TILT_RAD)
    } else {
      stone.position.set(localX, h / 2, localZ)
      stone.rotation.y = a
    }
    stone.castShadow = true
    stone.receiveShadow = true
    group.add(stone)
  }

  return group
}

/** Small ruined wall/foundation fragment (plans/2026-08-09--049, "rzadkie"
 *  tier) — a low foundation slab with two intersecting wall stubs of uneven,
 *  broken height, reading as the corner of a long-gone building rather than
 *  a random pile of boxes. `variant` (0..1) drives wall height/damage. */
/** Same tilt-step/clamp shape as `MONOLITH_TILT_STEP`/`MONOLITH_MAX_TILT_RAD`
 *  (plan world-terrain-006) — walls are thin, so a small tilt already reads
 *  clearly; kept modest so a "broken corner" doesn't look like it's
 *  toppling. */
const RUINS_TILT_STEP = 0.4
const RUINS_MAX_TILT_RAD = THREE.MathUtils.degToRad(10)

export function createSmallRuins(scale = 1, variant = 0.5, terrain?: TerrainPlacementContext): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a8478, flatShading: true, roughness: 1 })
  const baseY = terrain ? terrain.sampleHeight(terrain.worldX, terrain.worldZ) : 0

  const size = 3.2 * scale
  const foundation = new THREE.Mesh(new THREE.BoxGeometry(size, 0.15 * scale, size), mat)
  foundation.position.y = 0.075 * scale
  // Kept flat/rigid (no per-vertex conforming) — only re-yawed to stay
  // visually aligned with the walls below, which do get per-element grounding.
  if (terrain) foundation.rotation.y = terrain.rotationY
  foundation.receiveShadow = true
  group.add(foundation)

  const wallHeight = (1.1 + variant * 0.7) * scale
  const wall1 = new THREE.Mesh(new THREE.BoxGeometry(size, wallHeight, 0.28 * scale), mat)
  const wall1LocalX = 0
  const wall1LocalZ = -size / 2 + 0.14 * scale
  wall1.position.set(wall1LocalX, wallHeight / 2, wall1LocalZ)
  if (terrain) {
    const { x: rx, z: rz } = rotateOffsetY(wall1LocalX, wall1LocalZ, terrain.rotationY)
    const sample = sampleLocalTerrain(terrain.sampleHeight, terrain.worldX + rx, terrain.worldZ + rz, RUINS_TILT_STEP)
    wall1.position.set(rx, sample.height - baseY + wallHeight / 2, rz)
    wall1.rotation.y = terrain.rotationY
    applyTerrainTilt(wall1, sample.normal, RUINS_MAX_TILT_RAD)
  }
  wall1.castShadow = true
  wall1.receiveShadow = true
  group.add(wall1)

  // Adjoining wall is more broken down — shorter, so the corner still reads
  // clearly as a ruin rather than an intact room.
  const wall2Height = wallHeight * (0.45 + variant * 0.35)
  const wall2 = new THREE.Mesh(new THREE.BoxGeometry(0.28 * scale, wall2Height, size), mat)
  const wall2LocalX = -size / 2 + 0.14 * scale
  const wall2LocalZ = 0
  wall2.position.set(wall2LocalX, wall2Height / 2, wall2LocalZ)
  if (terrain) {
    const { x: rx, z: rz } = rotateOffsetY(wall2LocalX, wall2LocalZ, terrain.rotationY)
    const sample = sampleLocalTerrain(terrain.sampleHeight, terrain.worldX + rx, terrain.worldZ + rz, RUINS_TILT_STEP)
    wall2.position.set(rx, sample.height - baseY + wall2Height / 2, rz)
    wall2.rotation.y = terrain.rotationY
    applyTerrainTilt(wall2, sample.normal, RUINS_MAX_TILT_RAD)
  }
  wall2.castShadow = true
  wall2.receiveShadow = true
  group.add(wall2)

  const rubbleCount = 2 + Math.floor(variant * 3)
  for (let i = 0; i < rubbleCount; i++) {
    const a = variant * Math.PI * 2 + i * 1.9
    const r = size * 0.3 + ((variant * (i + 5)) % 1) * size * 0.25
    const rubble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 * scale, 0), mat)
    const localX = Math.cos(a) * r
    const localZ = Math.sin(a) * r
    if (terrain) {
      const { x: rx, z: rz } = rotateOffsetY(localX, localZ, terrain.rotationY)
      const sample = sampleLocalTerrain(terrain.sampleHeight, terrain.worldX + rx, terrain.worldZ + rz, RUINS_TILT_STEP)
      rubble.position.set(rx, sample.height - baseY + 0.11 * scale, rz)
      rubble.rotation.set(a, a * 1.2, 0)
      applyTerrainTilt(rubble, sample.normal, RUINS_MAX_TILT_RAD)
    } else {
      rubble.position.set(localX, 0.11 * scale, localZ)
      rubble.rotation.set(a, a * 1.2, 0)
    }
    rubble.castShadow = true
    group.add(rubble)
  }

  return group
}

/** Single headstone fallback (plans/2026-08-09--049) — used when the Jarlan
 *  Perez `grave_a.glb` fails to load, and as extra stones around the cemetery
 *  plot. Origin at feet. */
export function createGraveStone(scale = 1): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x7a756c, flatShading: true, roughness: 1 })
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.38 * scale, 0.85 * scale, 0.12 * scale), mat)
  slab.position.y = 0.42 * scale
  slab.castShadow = true
  slab.receiveShadow = true
  group.add(slab)
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.5 * scale, 0.1 * scale, 0.22 * scale), mat)
  base.position.y = 0.05 * scale
  base.castShadow = true
  base.receiveShadow = true
  group.add(base)
  return group
}

/** Compact cemetery-plot fallback if the Poly cemetery GLB fails to load —
 *  a dirt pad plus three procedural headstones so the silhouette still reads. */
export function createCemeteryPlot(scale = 1): THREE.Group {
  const group = new THREE.Group()
  const dirt = new THREE.MeshStandardMaterial({ color: 0x4a4034, flatShading: true, roughness: 1 })
  const pad = new THREE.Mesh(new THREE.BoxGeometry(3.4 * scale, 0.08 * scale, 2.4 * scale), dirt)
  pad.position.y = 0.04 * scale
  pad.receiveShadow = true
  group.add(pad)
  for (let i = 0; i < 3; i++) {
    const stone = createGraveStone(scale * (0.85 + i * 0.05))
    stone.position.set((i - 1) * 0.95 * scale, 0, -0.15 * scale)
    group.add(stone)
  }
  return group
}

export type CemeteryTemplates = {
  plot?: THREE.Object3D
  graves?: readonly THREE.Object3D[]
}

/** Cemetery footprint size (plan 173) — controls the actual grave grid
 *  (block/row/column count, spacing, aisle gaps), not a uniform scale
 *  multiplier on the small layout. */
export type CemeterySize = 'SM' | 'MD' | 'LG'

type CemeteryLayoutSpec = {
  /** Side-by-side grave blocks, each `columns` × `rows`, separated by a
   *  central-aisle gap of `aisleWidth`. */
  blocks: number
  columns: number
  rows: number
  colSpacing: number
  rowSpacing: number
  aisleWidth: number
  /** Z offset of the first grave row in front of the plot centerpiece. */
  frontOffset: number
}

// Spacing widened (world-terrain-006, was 1/1/1.1) — at the old ~1 m
// row/column spacing, adjacent grave stones (createGraveStone's ~0.5 m base
// footprint) left barely half a meter of clear ground, reading as an
// unnaturally packed grid. Aisle widths grow alongside so blocks stay
// visually separated at the new, wider column pitch.
const CEMETERY_LAYOUTS: Record<CemeterySize, CemeteryLayoutSpec> = {
  SM: { blocks: 1, columns: 3, rows: 3, colSpacing: 1.6, rowSpacing: 1.5, aisleWidth: 0, frontOffset: 1.2 },
  MD: { blocks: 2, columns: 3, rows: 3, colSpacing: 1.6, rowSpacing: 1.5, aisleWidth: 2.2, frontOffset: 1.3 },
  LG: { blocks: 3, columns: 4, rows: 3, colSpacing: 1.6, rowSpacing: 1.7, aisleWidth: 2.4, frontOffset: 1.4 },
}

/** Deterministic local grave positions for one cemetery `size` (plan 173) —
 *  side-by-side blocks separated by an aisle gap, centered on the plot
 *  centerpiece. Pure function of `size`/`scale`, so the layout stays stable
 *  across chunk reload; per-grave jitter is applied by the caller. Exported
 *  (plan world-007) so `world/hiddenFinds.ts` can derive the same grave world
 *  positions as Hidden Find dig spots without re-deriving the layout. */
export function cemeteryGraveLayout(size: CemeterySize, scale: number): { x: number, z: number }[] {
  const spec = CEMETERY_LAYOUTS[size]
  const colSpacing = spec.colSpacing * scale
  const rowSpacing = spec.rowSpacing * scale
  const aisle = spec.aisleWidth * scale
  const blockWidth = (spec.columns - 1) * colSpacing
  const totalWidth = spec.blocks * blockWidth + (spec.blocks - 1) * aisle
  const startX = -totalWidth / 2
  const out: { x: number, z: number }[] = []
  for (let b = 0; b < spec.blocks; b++) {
    const blockStartX = startX + b * (blockWidth + aisle)
    for (let row = 0; row < spec.rows; row++) {
      for (let col = 0; col < spec.columns; col++) {
        out.push({
          x: blockStartX + col * colSpacing,
          z: spec.frontOffset * scale + row * rowSpacing,
        })
      }
    }
  }
  return out
}

const CEMETERY_TILT_STEP = 0.35
/** Gravestones are thin slabs — clamp lean tighter than a stone-circle pillar
 *  so a slope doesn't read as a knocked-over headstone. */
const CEMETERY_GRAVE_MAX_TILT_RAD = THREE.MathUtils.degToRad(12)

/** Village-fringe cemetery (plans/2026-08-09--049, "rzadkie" tier) — a Poly
 *  cemetery scene as the readable centrepiece plus a deterministic grave
 *  grid whose actual arrangement (block/row/column count, spacing, aisles)
 *  is driven by `size` (plan 173: meaningful SM/MD/LG layouts, not a scaled
 *  copy of one small cemetery). `variant` (0..1) jitters grave scale/offset/
 *  yaw so no two cemeteries look identical. `terrain`, when given, samples
 *  each grave's own ground height/normal at its exact world position
 *  (plan 173) instead of the whole grid sitting at one height; the plot
 *  centerpiece only gets its height adjusted, not tilted (it's one static
 *  asset, not a per-grave element). */
export function createCemetery(
  scale = 1,
  variant = 0.5,
  templates?: CemeteryTemplates,
  size: CemeterySize = 'SM',
  terrain?: TerrainPlacementContext,
): THREE.Group {
  const group = new THREE.Group()
  const baseY = terrain ? terrain.sampleHeight(terrain.worldX, terrain.worldZ) : 0

  /** Rotates `obj`'s current local (x,z) offset by the landmark's overall
   *  yaw, samples terrain at that exact world position, then applies the
   *  resulting height/tilt — no-op (flat single-height layout) when there's
   *  no `terrain` context. */
  const orientElement = (obj: THREE.Object3D, maxTiltRad: number) => {
    if (!terrain) return
    const { x: rx, z: rz } = rotateOffsetY(obj.position.x, obj.position.z, terrain.rotationY)
    const sample = sampleLocalTerrain(terrain.sampleHeight, terrain.worldX + rx, terrain.worldZ + rz, CEMETERY_TILT_STEP)
    obj.position.x = rx
    obj.position.z = rz
    obj.position.y += sample.height - baseY
    obj.rotation.y += terrain.rotationY
    applyTerrainTilt(obj, sample.normal, maxTiltRad)
  }

  if (templates?.plot) {
    const plot = templates.plot.clone(true)
    plot.scale.multiplyScalar(scale)
    orientElement(plot, 0)
    group.add(plot)
  } else {
    const plot = createCemeteryPlot(scale)
    orientElement(plot, 0)
    group.add(plot)
  }

  const layout = cemeteryGraveLayout(size, scale)
  const graves = templates?.graves
  for (let i = 0; i < layout.length; i++) {
    const spot = layout[i]!
    // Jitter amplitude grew alongside the wider grid spacing above (still well
    // short of the ~1 m clear gap between neighbouring spots, so adjacent
    // graves never overlap) — the old, tighter jitter read as too regular a
    // grid once the base spacing itself was no longer cramped.
    const jitterX = ((variant * (i + 3)) % 1 - 0.5) * 0.35 * scale
    const jitterZ = ((variant * (i + 7)) % 1 - 0.5) * 0.28 * scale
    const yaw = ((variant * (i + 2)) % 1 - 0.5) * 0.18
    const graveScale = scale * (0.85 + ((variant * (i + 5)) % 1) * 0.25)
    let stone: THREE.Object3D
    if (graves && graves.length > 0) {
      stone = graves[i % graves.length]!.clone(true)
      stone.scale.multiplyScalar(graveScale)
    } else {
      stone = createGraveStone(graveScale)
    }
    stone.position.set(spot.x + jitterX, 0, spot.z + jitterZ)
    stone.rotation.y = yaw
    orientElement(stone, CEMETERY_GRAVE_MAX_TILT_RAD)
    group.add(stone)
  }

  return group
}

/** Horseshoe of rocks framing a real terrain depression — visual for the prey
 *  `cave` spawner (`createFauna.ts`, plan 083). Origin at feet; footprint
 *  ~2–3 m at scale 1. `variant` (0..1) jitters rock sizes/angles so two caves
 *  don't look identical. Open side faces +Z (caller may rotate) — the caller
 *  carves the actual pit into the terrain (`ChunkManager.modifyTerrain`)
 *  centered on this same origin; this prop only supplies the rock framing
 *  and a small dark accent, not the hole itself. */
export function createCaveMouth(scale = 1, variant = 0.5): THREE.Group {
  const group = new THREE.Group()
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x7d7a72,
    flatShading: true,
    roughness: 1,
  })
  const mouthMat = new THREE.MeshStandardMaterial({
    color: 0x1a1814,
    flatShading: true,
    roughness: 1,
    metalness: 0,
  })

  // U-shaped rock ring: angles spanning the back and sides, leaving +Z open.
  const rockAngles = [-2.2, -1.4, -0.7, 0.7, 1.4, 2.2]
  for (let i = 0; i < rockAngles.length; i++) {
    const a = rockAngles[i]!
    const sizeJitter = 0.75 + ((variant * (i + 3)) % 1) * 0.55
    const rock = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.55 * scale * sizeJitter, 0),
      rockMat,
    )
    const r = (1.05 + ((variant * (i + 5)) % 1) * 0.25) * scale
    rock.position.set(Math.sin(a) * r, 0.4 * scale * sizeJitter, Math.cos(a) * r * 0.55)
    rock.scale.set(
      0.85 + ((variant * (i + 2)) % 1) * 0.4,
      0.9 + ((variant * (i + 7)) % 1) * 0.5,
      0.85 + ((variant * (i + 11)) % 1) * 0.4,
    )
    rock.rotation.set(a * 0.3, a, variant * 1.7)
    rock.castShadow = true
    rock.receiveShadow = true
    group.add(rock)
  }

  // The opening itself is a real depression carved into the terrain by the
  // caller (`ChunkManager.modifyTerrain`, see `fauna/createFauna.ts`, plan
  // 083) — this prop no longer fakes it with a flat standing disc. A small
  // dark pool low at the back (away from the +Z open side, where the rock
  // ring is densest) hints the ground goes dark/deeper without reading as a
  // floating cap over the opening.
  const shadowPool = new THREE.Mesh(
    new THREE.CircleGeometry(0.5 * scale, 8),
    mouthMat,
  )
  shadowPool.rotation.x = -Math.PI / 2
  shadowPool.position.set(0, -0.35 * scale, -0.35 * scale)
  group.add(shadowPool)

  // Low threshold stone at the pit's open (+Z) lip, marking where natural
  // ground gives way to the carved depression.
  const sill = new THREE.Mesh(
    new THREE.BoxGeometry(1.4 * scale, 0.12 * scale, 0.5 * scale),
    rockMat,
  )
  sill.position.set(0, 0.02 * scale, 0.65 * scale)
  sill.receiveShadow = true
  group.add(sill)

  return group
}
