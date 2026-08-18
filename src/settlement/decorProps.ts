import * as THREE from 'three'
import { patchProceduralFoliageMaterial } from '../world/foliageWind'

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
export function createMonolith(scale = 1, variant = 0.5): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x726d64, flatShading: true, roughness: 1 })

  const height = (3 + variant * 2.4) * scale
  const stone = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32 * scale, 0.5 * scale, height, 5),
    mat,
  )
  stone.rotation.y = variant * Math.PI * 2
  stone.rotation.z = (variant - 0.5) * 0.18 // slight deliberate lean
  stone.position.y = height / 2
  stone.castShadow = true
  stone.receiveShadow = true
  group.add(stone)

  const rubbleCount = 2 + Math.floor(variant * 3)
  for (let i = 0; i < rubbleCount; i++) {
    const a = variant * Math.PI * 2 + i * 2.3
    const r = 0.5 * scale + ((variant * (i + 4)) % 1) * 0.3 * scale
    const rubble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 * scale, 0), mat)
    rubble.position.set(Math.cos(a) * r, 0.1 * scale, Math.sin(a) * r)
    rubble.rotation.set(a, a * 1.4, 0)
    rubble.castShadow = true
    group.add(rubble)
  }

  return group
}

/** Small stone circle landmark (plans/2026-08-09--049, "rzadkie" tier) — a
 *  ring of upright stones of uneven height, deterministically varied by
 *  `variant` (stone count 6-9, per-stone height jitter). Reads as a miniature
 *  Stonehenge from a distance without needing per-stone unique geometry. */
export function createStoneCircle(scale = 1, variant = 0.5): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x736e64, flatShading: true, roughness: 1 })

  const count = 6 + Math.floor(variant * 4)
  const radius = 2.6 * scale
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2
    const h = (1.3 + ((variant * (i + 2)) % 1) * 0.9) * scale
    const stone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22 * scale, 0.3 * scale, h, 5),
      mat,
    )
    stone.position.set(Math.cos(a) * radius, h / 2, Math.sin(a) * radius)
    stone.rotation.y = a
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
export function createSmallRuins(scale = 1, variant = 0.5): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a8478, flatShading: true, roughness: 1 })

  const size = 3.2 * scale
  const foundation = new THREE.Mesh(new THREE.BoxGeometry(size, 0.15 * scale, size), mat)
  foundation.position.y = 0.075 * scale
  foundation.receiveShadow = true
  group.add(foundation)

  const wallHeight = (1.1 + variant * 0.7) * scale
  const wall1 = new THREE.Mesh(new THREE.BoxGeometry(size, wallHeight, 0.28 * scale), mat)
  wall1.position.set(0, wallHeight / 2, -size / 2 + 0.14 * scale)
  wall1.castShadow = true
  wall1.receiveShadow = true
  group.add(wall1)

  // Adjoining wall is more broken down — shorter, so the corner still reads
  // clearly as a ruin rather than an intact room.
  const wall2Height = wallHeight * (0.45 + variant * 0.35)
  const wall2 = new THREE.Mesh(new THREE.BoxGeometry(0.28 * scale, wall2Height, size), mat)
  wall2.position.set(-size / 2 + 0.14 * scale, wall2Height / 2, 0)
  wall2.castShadow = true
  wall2.receiveShadow = true
  group.add(wall2)

  const rubbleCount = 2 + Math.floor(variant * 3)
  for (let i = 0; i < rubbleCount; i++) {
    const a = variant * Math.PI * 2 + i * 1.9
    const r = size * 0.3 + ((variant * (i + 5)) % 1) * size * 0.25
    const rubble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 * scale, 0), mat)
    rubble.position.set(Math.cos(a) * r, 0.11 * scale, Math.sin(a) * r)
    rubble.rotation.set(a, a * 1.2, 0)
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

/** Small village-fringe cemetery (plans/2026-08-09--049, "rzadkie" tier) —
 *  Poly cemetery scene as the readable centre plus a short row of extra
 *  stones. `variant` (0..1) drives extra-stone count (4–8) and jitter. */
export function createCemetery(
  scale = 1,
  variant = 0.5,
  templates?: CemeteryTemplates,
): THREE.Group {
  const group = new THREE.Group()

  if (templates?.plot) {
    const plot = templates.plot.clone(true)
    plot.scale.multiplyScalar(scale)
    group.add(plot)
  } else {
    group.add(createCemeteryPlot(scale))
  }

  const extra = 4 + Math.floor(variant * 5)
  const graves = templates?.graves
  for (let i = 0; i < extra; i++) {
    const col = i % 4
    const row = Math.floor(i / 4)
    const jitterX = ((variant * (i + 3)) % 1 - 0.5) * 0.25 * scale
    const jitterZ = ((variant * (i + 7)) % 1 - 0.5) * 0.2 * scale
    const x = (col - 1.5) * 0.85 * scale + jitterX
    const z = (1.15 + row * 0.9) * scale + jitterZ
    const yaw = ((variant * (i + 2)) % 1 - 0.5) * 0.18
    if (graves && graves.length > 0) {
      const src = graves[i % graves.length]!
      const stone = src.clone(true)
      stone.scale.multiplyScalar(scale * (0.85 + ((variant * (i + 5)) % 1) * 0.25))
      stone.position.set(x, 0, z)
      stone.rotation.y = yaw
      group.add(stone)
    } else {
      const stone = createGraveStone(scale * (0.8 + ((variant * (i + 5)) % 1) * 0.25))
      stone.position.set(x, 0, z)
      stone.rotation.y = yaw
      group.add(stone)
    }
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
