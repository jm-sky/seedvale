import * as THREE from 'three'
import {
  GARDEN_BED_D,
  GARDEN_BED_GAP,
  GARDEN_BED_W,
  gardenBedCount,
  type GardenScale,
} from './gardenScale'

export function createHut(): THREE.Group {
  const hut = new THREE.Group()

  // Wall band ~2m before `prepareProp` scales via house catalog height.
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 2.0, 2.6),
    new THREE.MeshStandardMaterial({ color: 0x8b6914, flatShading: true }),
  )
  walls.position.y = 1.0
  walls.castShadow = true
  walls.receiveShadow = true
  hut.add(walls)

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(2.0, 1.3, 4),
    new THREE.MeshStandardMaterial({ color: 0x6b3a2a, flatShading: true }),
  )
  roof.position.y = 2.65
  roof.rotation.y = Math.PI / 4
  roof.castShadow = true
  hut.add(roof)

  return hut
}

/** Procedural fallback for `well.glb` (plan 101) — stone ring, roofed
 *  crossbeam, hanging bucket. Drink queue still uses `settlement:well`. */
export function createWell(): THREE.Group {
  const well = new THREE.Group()
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7a7a72, flatShading: true, roughness: 0.95 })
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, flatShading: true })
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5c3a24, flatShading: true })

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 0.7, 10), stoneMat)
  base.position.y = 0.35
  base.castShadow = true
  base.receiveShadow = true
  well.add(base)

  // A slightly darker capstone ring reads as dressed stone rather than a
  // single flat-shaded drum.
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.72, 0.09, 6, 12),
    new THREE.MeshStandardMaterial({ color: 0x625f58, flatShading: true, roughness: 0.9 }),
  )
  rim.rotation.x = Math.PI / 2
  rim.position.y = 0.72
  rim.castShadow = true
  well.add(rim)

  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.45, 0.1, 10),
    new THREE.MeshStandardMaterial({ color: 0x3a7ca5, flatShading: true, roughness: 0.3 }),
  )
  water.position.y = 0.55
  well.add(water)

  const postGeo = new THREE.CylinderGeometry(0.07, 0.08, 1.6, 6)
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, woodMat)
    post.position.set(0, 0.35 + 0.8, side * 0.65)
    post.castShadow = true
    well.add(post)
  }

  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6), woodMat)
  beam.rotation.z = Math.PI / 2
  beam.position.set(0, 1.55, 0)
  beam.castShadow = true
  well.add(beam)

  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.05, 0.6, 4), roofMat)
  roof.position.y = 2.0
  roof.rotation.y = Math.PI / 4
  roof.castShadow = true
  well.add(roof)

  const bucket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.13, 0.22, 8),
    woodMat,
  )
  bucket.position.set(0, 1.1, 0)
  bucket.castShadow = true
  well.add(bucket)

  return well
}

/** Fallback if `barrel.glb`/`crate.glb` fail to load — plain flat-shaded
 *  cylinder with a couple of darker hoop rings. */
export function createBarrel(scale = 1): THREE.Group {
  const barrel = new THREE.Group()
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3e, flatShading: true })
  const hoopMat = new THREE.MeshStandardMaterial({ color: 0x3d3630, flatShading: true })

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32 * scale, 0.3 * scale, 0.65 * scale, 10), woodMat)
  body.position.y = 0.33 * scale
  body.castShadow = true
  barrel.add(body)

  for (const t of [0.14, 0.52]) {
    const hoop = new THREE.Mesh(
      new THREE.TorusGeometry(0.32 * scale, 0.02 * scale, 5, 12),
      hoopMat,
    )
    hoop.rotation.x = Math.PI / 2
    hoop.position.y = t * scale
    barrel.add(hoop)
  }

  return barrel
}

/** Fallback if `hay.glb` fails — rectangular bale (scale 2.5 ≈ GLB ~1.4 m). */
export function createHayBale(scale = 1): THREE.Group {
  const hay = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0xc9a84a, flatShading: true })
  const bale = new THREE.Mesh(new THREE.BoxGeometry(0.7 * scale, 0.4 * scale, 0.45 * scale), mat)
  bale.position.y = 0.2 * scale
  bale.castShadow = true
  hay.add(bale)
  return hay
}

/** Household `AnimalTrough` (plan 122) — no GLB yet (`docs/assets/MODELS.md`),
 *  procedural only. Low open wooden basin with a water-colored inset so it
 *  reads as "holds water" even without a per-instance fill-level visual
 *  (instanced like `createBarrel`/`createHayBale`, see `buildSettlementProps`). */
export function createTrough(scale = 1): THREE.Group {
  const trough = new THREE.Group()
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6e4f30, flatShading: true })
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x3a7ea8, flatShading: true, roughness: 0.25 })

  const basin = new THREE.Mesh(new THREE.BoxGeometry(0.95 * scale, 0.28 * scale, 0.38 * scale), woodMat)
  basin.position.y = 0.14 * scale
  basin.castShadow = true
  trough.add(basin)

  const water = new THREE.Mesh(new THREE.BoxGeometry(0.82 * scale, 0.05 * scale, 0.27 * scale), waterMat)
  water.position.y = 0.24 * scale
  trough.add(water)

  return trough
}

/** Fallback if `crate.glb` fails to load — plain flat-shaded box, same
 *  material family as `createBarrel`'s fallback. */
export function createCrate(scale = 1): THREE.Group {
  const crate = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a6a3e, flatShading: true })
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.6 * scale, 0.6 * scale, 0.6 * scale), mat)
  box.position.y = 0.3 * scale
  box.castShadow = true
  crate.add(box)
  return crate
}

/** Fallback if `parked/anvil.glb` fails to load (plan settlements-npcs-002)
 *  — a simple stepped iron block on a stump, same flat-shaded low-poly style
 *  as the other structure fallbacks. */
export function createAnvil(): THREE.Group {
  const anvil = new THREE.Group()
  const stumpMat = new THREE.MeshStandardMaterial({ color: 0x5a4530, flatShading: true })
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3e, flatShading: true, roughness: 0.4 })

  const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.42, 8), stumpMat)
  stump.position.y = 0.21
  stump.castShadow = true
  anvil.add(stump)

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.22), ironMat)
  body.position.y = 0.53
  body.castShadow = true
  anvil.add(body)

  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 8), ironMat)
  horn.rotation.z = Math.PI / 2
  horn.position.set(0.38, 0.53, 0)
  horn.castShadow = true
  anvil.add(horn)

  return anvil
}

/** Fallback if `parked/workbench-grind.glb` fails to load (plan
 *  settlements-npcs-002) — a plain bench with a disc-shaped grindstone. */
export function createGrindWorkbench(): THREE.Group {
  const bench = new THREE.Group()
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6e4f30, flatShading: true })
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8a8a86, flatShading: true, roughness: 0.8 })

  const top = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.45), woodMat)
  top.position.y = 0.55
  top.castShadow = true
  bench.add(top)

  for (const [dx, dz] of [[-0.38, -0.18], [0.38, -0.18], [-0.38, 0.18], [0.38, 0.18]] as const) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.06), woodMat)
    leg.position.set(dx, 0.275, dz)
    bench.add(leg)
  }

  const grindstone = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 14), stoneMat)
  grindstone.rotation.x = Math.PI / 2
  grindstone.position.set(0, 0.72, 0)
  grindstone.castShadow = true
  bench.add(grindstone)

  return bench
}

export function createStockpile(): THREE.Group {
  const pile = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({
    color: 0x5c4033,
    flatShading: true,
  })
  for (let i = 0; i < 5; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 6), mat)
    log.rotation.z = Math.PI / 2
    log.position.set(0, 0.15 + i * 0.12, (i - 2) * 0.15)
    log.castShadow = true
    pile.add(log)
  }
  return pile
}

/** A short wooden pier — deck extends along local +X (rotate by the
 *  `MinorLocation.angle` to point out over the water). */
export function createDock(): THREE.Group {
  const dock = new THREE.Group()
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, flatShading: true })

  const deckLength = 5
  const deck = new THREE.Mesh(new THREE.BoxGeometry(deckLength, 0.15, 1.4), woodMat)
  deck.position.set(deckLength / 2, 0.4, 0)
  deck.castShadow = true
  deck.receiveShadow = true
  dock.add(deck)

  const postPositions = [0.6, deckLength - 0.6]
  for (const px of postPositions) {
    for (const pz of [-0.55, 0.55]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.8, 6), woodMat)
      post.position.set(px, 0, pz)
      post.castShadow = true
      dock.add(post)
    }
  }

  return dock
}

/** A roadside signpost — post rises along Y, board's long axis (arrow-like)
 *  extends along local +X. Use `yawToward(dx, dz)` for `rotation.y`. */
export function createSignpost(): THREE.Group {
  const signpost = new THREE.Group()
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x7a5c3e, flatShading: true })

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 6), woodMat)
  post.position.y = 1.1
  post.castShadow = true
  signpost.add(post)

  const board = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.32, 0.06), woodMat)
  board.position.set(0.55, 1.75, 0)
  board.castShadow = true
  signpost.add(board)

  return signpost
}

/** Village name plaque by the well — two posts + board; CSS2D text is added by the caller.
 *  Overall height ~4 m; board ~0.6 m (plan 076 + raise). */
export const VILLAGE_NAMEPOST_BOARD_CENTER_Y = 3.4

export function createVillageNamepost(): THREE.Group {
  const post = new THREE.Group()
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6e4e32, flatShading: true })
  const poleHeight = 4.0
  const poleGap = 1.55
  const boardH = 0.6
  const boardW = 1.7
  for (const side of [-1, 1] as const) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, poleHeight, 6), woodMat)
    pole.position.set(side * (poleGap * 0.5), poleHeight * 0.5, 0)
    pole.castShadow = true
    post.add(pole)
  }
  const board = new THREE.Mesh(new THREE.BoxGeometry(boardW, boardH, 0.07), woodMat)
  board.position.set(0, VILLAGE_NAMEPOST_BOARD_CENTER_Y, 0)
  board.castShadow = true
  post.add(board)
  return post
}

/** Procedural garden beds — S = one bed (legacy), M/L = side-by-side beds (plan 077). */
export function createGarden(scale: GardenScale = 'S'): THREE.Group {
  const garden = new THREE.Group()
  const beds = gardenBedCount(scale)
  const totalW = beds * GARDEN_BED_W + (beds - 1) * GARDEN_BED_GAP
  const startX = -totalW * 0.5 + GARDEN_BED_W * 0.5

  const bedMat = new THREE.MeshStandardMaterial({ color: 0x5a3d24, flatShading: true })
  const cropMat = new THREE.MeshStandardMaterial({
    color: 0x6db33f,
    flatShading: true,
  })

  for (let b = 0; b < beds; b++) {
    const bx = startX + b * (GARDEN_BED_W + GARDEN_BED_GAP)
    const bed = new THREE.Mesh(new THREE.BoxGeometry(GARDEN_BED_W, 0.2, GARDEN_BED_D), bedMat)
    bed.position.set(bx, 0.1, 0)
    bed.receiveShadow = true
    garden.add(bed)

    for (let i = 0; i < 6; i++) {
      const crop = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.5, 4), cropMat)
      crop.position.set(bx - 1.6 + (i % 3) * 1.6, 0.4, i < 3 ? -0.7 : 0.7)
      crop.castShadow = true
      garden.add(crop)
    }
  }
  return garden
}

/** Side-by-side clones of `crops.glb` using the same bed spacing as `createGarden`. */
export function layoutCropsGarden(template: THREE.Object3D, beds: number): THREE.Group {
  const garden = new THREE.Group()
  const count = Math.max(1, beds)
  const totalW = count * GARDEN_BED_W + (count - 1) * GARDEN_BED_GAP
  const startX = -totalW * 0.5 + GARDEN_BED_W * 0.5
  for (let b = 0; b < count; b++) {
    const bed = template.clone(true)
    bed.position.x += startX + b * (GARDEN_BED_W + GARDEN_BED_GAP)
    garden.add(bed)
  }
  return garden
}

/** Golden — distinctly different from `createGarden`'s green crop cones and
 *  from any grass tint (`grass.ts`'s `ARID_GRASS`/`HUMID_GRASS`/`SWAMP_GRASS`
 *  top out at an olive `0x9c9a54`), so a wheat field reads at a glance. */
const WHEAT_COLOR = 0xd8b23c

/** Fallback wheat patch if `farm.glb` fails — thin gold cones (plan 032 / 099).
 *  Deterministic from `variant` (trig/golden-angle spread, same reasoning as
 *  `createRockCluster`) so a reload doesn't reshuffle the field. */
export function createWheatField(scale = 1, variant = 0.5, radius = 3.2): THREE.Group {
  const field = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: WHEAT_COLOR, flatShading: true })
  const count = 45 + Math.floor(variant * 25)
  for (let i = 0; i < count; i++) {
    // Golden-angle-ish step so stalks fill the disk evenly instead of
    // spiraling into visible rings.
    const a = variant * Math.PI * 2 + i * 2.399963
    const r = radius * Math.sqrt((variant * (i + 11)) % 1)
    const height = (0.7 + ((variant * (i + 5)) % 1) * 0.3) * scale
    // Narrower than a normal grass/reed blade (0.022 vs createReed's 0.035) —
    // "węższa i wyższą" (narrower and taller), per the ask.
    const stalk = new THREE.Mesh(new THREE.ConeGeometry(0.022 * scale, height, 4), mat)
    stalk.position.set(Math.cos(a) * r, height / 2, Math.sin(a) * r)
    stalk.rotation.y = a
    stalk.castShadow = true
    field.add(stalk)
  }
  return field
}
