import { type Object3D, type Scene, Vector3 } from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { HeightSampler } from '../player/PlayerController'
import { disposeObject3D } from '../assets/loadGltf'
import { placeOnGround } from '../settlement/props'
import { labelOpacityForDistance } from '../ui/labelDistance'
import { createSeededRandom } from '../world/parseSeed'
import { createItemMesh, ITEM_DEFS, type ItemKind } from './items'
import { type ItemSpawnPoint, updateItemSpawnPoints } from './ItemSpawner'

export type ItemSpawners = {
  nodes: () => readonly ItemSpawnPoint[]
  /** Removes the pickup mesh and marks the point collected; null if already
   *  collected or `id` doesn't match a known point. */
  collect: (id: string) => { kind: ItemKind; x: number; z: number } | null
  /** `dayFactor` (0 night .. 1 day) fades labels out in the dark, on top of
   *  the distance fade — see `ITEM_LABEL_FADE_NEAR`/`_FAR` (issue 011). */
  update: (dt: number, observerPos: Vector3, dayFactor: number) => void
  dispose: () => void
}

/** Item pickups only need to be readable from a couple steps away, unlike
 *  NPC labels' 20/32 (`ui/labelDistance.ts`'s defaults) — tuned for reading a
 *  name across a village square, way too far for a twig on the ground. */
const ITEM_LABEL_FADE_NEAR = 8
const ITEM_LABEL_FADE_FAR = 14

/** One renewable pickup per kind, close to the settlement — a reliable fallback
 *  source for quests regardless of whether world-generated coast/mountain items
 *  (`terrain/chunkItems.ts`) happened to land nearby this seed. `branch` gets its
 *  own multi-point pool below instead of a single point here — see
 *  `BRANCH_SPAWN_POINTS_MIN/MAX`. `shovel` / `axe` aren't here either — they
 *  anchor to campfire/garden/trees instead of the settlement center, see
 *  `SHOVEL_*` / `AXE_*` distances. */
const SPAWN_SPECS: { kind: ItemKind, respawnTime: number, minDist: number, maxDist: number }[] = [
  { kind: 'stone', respawnTime: 100, minDist: 20, maxDist: 42 },
  { kind: 'shell', respawnTime: 90, minDist: 20, maxDist: 42 },
]

// `Infinity` — a one-time village pickup (plan 052), not a renewable resource:
// `updateItemSpawnPoints`'s `timeSinceCollected >= respawnTime` check can
// never pass, so once collected it never respawns. Reuses the existing
// spawn-point contract instead of a second "one-time item" system.
const SHOVEL_RESPAWN_TIME = Infinity
/** Fix for plan 052 — the shovel used to land anywhere 2-10m from the
 *  settlement center, which could be behind a house or across the clearing.
 *  Anchoring to two landmarks the player already looks at (campfire, food
 *  source) makes it findable at a glance. */
const SHOVEL_FIRE_MAX_DIST = 1
const SHOVEL_FIELD_MIN_DIST = 1
const SHOVEL_FIELD_MAX_DIST = 3

/** One-time village axe (plan 057) — same Infinity-respawn contract as the shovel. */
const AXE_RESPAWN_TIME = Infinity
const AXE_TREE_MIN_DIST = 1
const AXE_TREE_MAX_DIST = 2.5
const AXE_FIELD_MIN_DIST = 1
const AXE_FIELD_MAX_DIST = 3

/** One-time village farm tools (plan 082) — pitchfork / sickle near gardens. */
const VILLAGE_TOOL_RESPAWN_TIME = Infinity
const VILLAGE_TOOL_MIN_DIST = 1.2
const VILLAGE_TOOL_MAX_DIST = 3.5
const VILLAGE_TOOL_COUNT_MIN = 1
const VILLAGE_TOOL_COUNT_MAX = 3
const VILLAGE_TOOL_KINDS: readonly ItemKind[] = ['pitchfork', 'sickle']

/** One-time village pickaxe (plan 090) — stockpile, same Infinity-respawn as shovel. */
const PICKAXE_RESPAWN_TIME = Infinity
const PICKAXE_STOCK_MIN_DIST = 0.8
const PICKAXE_STOCK_MAX_DIST = 2.2
const WOODEN_TORCH_RESPAWN_TIME = Infinity
const WOODEN_TORCH_FIRE_MAX_DIST = 2.2
const WOODEN_TORCH_PLAZA_MIN_DIST = 2
const WOODEN_TORCH_PLAZA_MAX_DIST = 4.5

/** How close to a chosen tree a branch spawn point lands. */
const TREE_SPAWN_MIN_DIST = 1.2
const TREE_SPAWN_MAX_DIST = 3.5
/** Village campfires (`VillageFire.ts`) burn through branches, and
 *  world-generated branches near trees don't respawn (`terrain/chunkItems.ts`),
 *  so branch needs a reliable renewable supply. A settlement's forest belt
 *  (`plantTreeCluster`) can have dozens of trees, so a single spawn point (the
 *  original design) was too sparse to find while walking around — one point
 *  per handful of trees instead, scaled to the settlement's actual tree count. */
const BRANCH_RESPAWN_TIME = 45
const BRANCH_SPAWN_POINTS_MIN = 3
const BRANCH_SPAWN_POINTS_MAX = 8
const BRANCH_TREES_PER_POINT = 4

export function createItemSpawners(
  scene: Scene,
  sampleHeight: HeightSampler,
  waterLevel: number,
  homeRadius: number,
  settlementCenter: Vector3,
  trees: readonly Vector3[],
  seed: number,
  /** Where the shovel's one-time pickup lands (plan 052 fix) — `campfire` is
   *  absent for SM settlements (`buildSettlementProps`'s MD/LG check), in
   *  which case the shovel always spawns near `garden` instead of the 50/50
   *  split. `garden` is built unconditionally for every settlement and, per
   *  `buildSettlementProps`, sits next to the wheat patch when the food
   *  source is a field — close enough to read as "the field" either way. */
  shovelLandmarks: { campfire?: Vector3, garden: Vector3, stockpile?: Vector3 },
  /** Extra garden pads (plan 077 / 082) — farm tools scatter near these. */
  gardens: readonly Vector3[] = [],
): ItemSpawners {
  const random = createSeededRandom(seed ^ 0x17ea)
  const points: ItemSpawnPoint[] = []
  const meshes: (Object3D | null)[] = []
  const labels: { object: CSS2DObject, el: HTMLDivElement }[] = []

  const findWalkableNear = (
    cx: number,
    cz: number,
    minDist: number,
    maxDist: number,
  ): { x: number, z: number } | null => {
    for (let attempt = 0; attempt < 24; attempt++) {
      const angle = random() * Math.PI * 2
      const dist = minDist + random() * (maxDist - minDist)
      const x = cx + Math.cos(angle) * dist
      const z = cz + Math.sin(angle) * dist
      if (Math.abs(x) > homeRadius - 4 || Math.abs(z) > homeRadius - 4) continue
      if (sampleHeight(x, z) <= waterLevel + 0.6) continue
      return { x, z }
    }
    return null
  }

  const spawnMeshAt = (index: number): void => {
    const p = points[index]!
    const mesh = createItemMesh(p.kind)
    placeOnGround(mesh, p.x, p.z, sampleHeight)
    scene.add(mesh)
    meshes[index] = mesh
  }

  const addSpawnPoint = (kind: ItemKind, respawnTime: number, pos: { x: number, z: number }): void => {
    const index = points.length
    points.push({
      id: `spawner:${index}`,
      x: pos.x,
      z: pos.z,
      kind,
      respawnTime,
      timeSinceCollected: 0,
      collected: false,
    })
    meshes.push(null)
    spawnMeshAt(index)

    const el = document.createElement('div')
    el.className = 'npc-label'
    el.textContent = ITEM_DEFS[kind].label
    const label = new CSS2DObject(el)
    label.position.set(pos.x, sampleHeight(pos.x, pos.z) + 0.4, pos.z)
    scene.add(label)
    labels.push({ object: label, el })
  }

  for (const spec of SPAWN_SPECS) {
    const pos = findWalkableNear(settlementCenter.x, settlementCenter.z, spec.minDist, spec.maxDist)
    if (!pos) continue
    addSpawnPoint(spec.kind, spec.respawnTime, pos)
  }

  {
    const nearFire = shovelLandmarks.campfire !== undefined && random() < 0.5
    const anchor = nearFire ? shovelLandmarks.campfire! : shovelLandmarks.garden
    const [minDist, maxDist] = nearFire
      ? [0, SHOVEL_FIRE_MAX_DIST]
      : [SHOVEL_FIELD_MIN_DIST, SHOVEL_FIELD_MAX_DIST]
    const pos = findWalkableNear(anchor.x, anchor.z, minDist, maxDist)
    if (pos) addSpawnPoint('shovel', SHOVEL_RESPAWN_TIME, pos)
  }

  {
    // Prefer a settlement tree (thematic); fall back to the garden when the
    // settlement has no forest belt yet.
    const tree = trees.length > 0 ? trees[Math.floor(random() * trees.length)]! : null
    const anchor = tree ?? shovelLandmarks.garden
    const [minDist, maxDist] = tree
      ? [AXE_TREE_MIN_DIST, AXE_TREE_MAX_DIST]
      : [AXE_FIELD_MIN_DIST, AXE_FIELD_MAX_DIST]
    const pos = findWalkableNear(anchor.x, anchor.z, minDist, maxDist)
    if (pos) addSpawnPoint('axe', AXE_RESPAWN_TIME, pos)
  }

  {
    // 1–3 one-time farm tools (pitchfork / sickle) near garden pads — visual
    // clutter + pickup. Future: NPC protest when stolen (issue 025).
    const anchors = gardens.length > 0 ? gardens : [shovelLandmarks.garden]
    const count =
      VILLAGE_TOOL_COUNT_MIN +
      Math.floor(random() * (VILLAGE_TOOL_COUNT_MAX - VILLAGE_TOOL_COUNT_MIN + 1))
    for (let n = 0; n < count; n++) {
      const anchor = anchors[Math.floor(random() * anchors.length)]!
      const kind = VILLAGE_TOOL_KINDS[Math.floor(random() * VILLAGE_TOOL_KINDS.length)]!
      const pos = findWalkableNear(
        anchor.x,
        anchor.z,
        VILLAGE_TOOL_MIN_DIST,
        VILLAGE_TOOL_MAX_DIST,
      )
      if (pos) addSpawnPoint(kind, VILLAGE_TOOL_RESPAWN_TIME, pos)
    }
  }

  {
    // One wooden torch near campfire when present, else plaza/garden (plan 085).
    const nearFire = shovelLandmarks.campfire !== undefined
    const anchor = nearFire ? shovelLandmarks.campfire! : settlementCenter
    const [minDist, maxDist] = nearFire
      ? [0.8, WOODEN_TORCH_FIRE_MAX_DIST]
      : [WOODEN_TORCH_PLAZA_MIN_DIST, WOODEN_TORCH_PLAZA_MAX_DIST]
    const pos = findWalkableNear(anchor.x, anchor.z, minDist, maxDist)
      ?? findWalkableNear(
        shovelLandmarks.garden.x,
        shovelLandmarks.garden.z,
        WOODEN_TORCH_PLAZA_MIN_DIST,
        WOODEN_TORCH_PLAZA_MAX_DIST,
      )
    if (pos) addSpawnPoint('wooden_torch', WOODEN_TORCH_RESPAWN_TIME, pos)
  }

  {
    const stock = shovelLandmarks.stockpile
    if (stock) {
      const pos = findWalkableNear(stock.x, stock.z, PICKAXE_STOCK_MIN_DIST, PICKAXE_STOCK_MAX_DIST)
      if (pos) addSpawnPoint('pickaxe', PICKAXE_RESPAWN_TIME, pos)
    }
  }

  if (trees.length > 0) {
    const treeOrder = trees.map((_, i) => i)
    for (let i = treeOrder.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      const tmp = treeOrder[i]!
      treeOrder[i] = treeOrder[j]!
      treeOrder[j] = tmp
    }
    const branchPointCount = Math.min(
      BRANCH_SPAWN_POINTS_MAX,
      Math.max(BRANCH_SPAWN_POINTS_MIN, Math.ceil(trees.length / BRANCH_TREES_PER_POINT)),
    )
    for (let n = 0; n < branchPointCount; n++) {
      const tree = trees[treeOrder[n % treeOrder.length]!]!
      const pos = findWalkableNear(tree.x, tree.z, TREE_SPAWN_MIN_DIST, TREE_SPAWN_MAX_DIST)
      if (!pos) continue
      addSpawnPoint('branch', BRANCH_RESPAWN_TIME, pos)
    }
  }

  return {
    nodes: () => points,
    collect(id) {
      const index = points.findIndex((p) => p.id === id)
      const p = points[index]
      if (!p || p.collected) return null
      p.collected = true
      p.timeSinceCollected = 0
      const mesh = meshes[index]
      if (mesh) {
        mesh.removeFromParent()
        disposeObject3D(mesh)
        meshes[index] = null
      }
      return { kind: p.kind, x: p.x, z: p.z }
    },
    update(dt, observerPos, dayFactor) {
      const wasCollected = points.map((p) => p.collected)
      updateItemSpawnPoints(points, dt)
      points.forEach((p, i) => {
        if (wasCollected[i] && !p.collected) spawnMeshAt(i)
      })
      points.forEach((p, i) => {
        const { object, el } = labels[i]!
        const distance = object.position.distanceTo(observerPos)
        el.style.opacity = p.collected
          ? '0'
          : String(labelOpacityForDistance(distance, ITEM_LABEL_FADE_NEAR, ITEM_LABEL_FADE_FAR) * dayFactor)
      })
    },
    dispose() {
      for (const mesh of meshes) {
        if (mesh) {
          mesh.removeFromParent()
          disposeObject3D(mesh)
        }
      }
      meshes.length = 0
      for (const { object, el } of labels) {
        object.removeFromParent()
        el.remove()
      }
      labels.length = 0
    },
  }
}
