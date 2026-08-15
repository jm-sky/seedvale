import type { Object3D, Scene } from 'three'
import type { MinimalSceneGroup } from './debugMode'

function isRenderable(obj: Object3D): boolean {
  return Boolean(
    (obj as { isMesh?: boolean }).isMesh ||
    (obj as { isPoints?: boolean }).isPoints ||
    (obj as { isSprite?: boolean }).isSprite ||
    (obj as { isLine?: boolean }).isLine ||
    (obj as { isInstancedMesh?: boolean }).isInstancedMesh ||
    (obj as { isSkinnedMesh?: boolean }).isSkinnedMesh,
  )
}

// TEMP: isolation test — scene object groups / props/tree subgroups
//
// Category identification reuses existing, already-established scene
// conventions rather than inventing new ones:
//   - npcs:            NpcAgent.mesh.name === 'npc' (ai/NpcAgent.ts)
//   - fauna:           AnimalAgent.mesh.name === 'fauna' (fauna/AnimalAgent.ts) —
//                       covers wild fauna and livestock; never independently
//                       toggleable, only revealed via `all` (task requirement:
//                       "Nie włączaj animal/fauna" for the npcs bucket).
//   - trees-living:    chunk-level instanced living trees, `chunk-vegetation-tree-living`
//                       (terrain/chunkManager.ts).
//   - trees-extra:     chunk-level non-instanced tree stages (stump/dead/etc.),
//                       `chunk-vegetation-extras` (terrain/chunkManager.ts).
//   - trees-settlement: settlement forest-belt trees, tagged with
//                       `userData.treeId` on the cloned root (settlement/props.ts) —
//                       only the root carries the tag, so this walks ancestors.
//   - buildings:       house root (`house:${id}`) and the shared batched static
//                       geometry group (`house-static-batch`) — settlement/houseBuilder.ts.
//   - props-fire:      lightable fire props — settlement's built-in campfire
//                       (settlement/props.ts's buildSettlementProps) and
//                       player-built fires (settlement/PlacedFires.ts) are
//                       tagged `name = 'fire'` at their creation site, since
//                       neither had an existing tag of its own. Purely
//                       decorative wild "old campfire remains"
//                       (terrain/chunkManager.ts's `case 'campfire'`) is left
//                       untagged and falls under props-environment — it
//                       shares the same mesh factory but isn't part of the
//                       lightable fire system.
//   - props-dropped:   player-dropped pickups, tagged `name = 'dropped-item'`
//                       at their creation site (items/createDroppedItems.ts) —
//                       no existing tag distinguished them from other item meshes.
//   - props-tents:     player-pitched tents, tagged `name = 'placed-tent'` at
//                       their creation site (items/createPlacedTents.ts) — no
//                       existing tag distinguished them either.
//   - props-settlement: everything else under the settlement root group,
//                       `name === 'settlement'` (settlement/props.ts) — wells,
//                       crates, stockpile, market stalls, gardens, signposts, etc.
//   - props-environment: chunk-level procedural/instanced environment decor
//                       (`chunk-environment*`) and chunk-level world item
//                       pickups (`chunk-items`) — both built via chunkManager.ts's
//                       `buildPlacementGroup`/instanced-prop helpers.
//   - props-other:     residual — nothing else `debugMinimalScene` hides has an
//                       unambiguous existing root (e.g. renewable item-spawner
//                       meshes, items/createItemSpawners.ts), so per the task's
//                       own instruction these fall back to `props-other` rather
//                       than inventing a broader ownership system.
//
// Object3D.traverse visits container nodes and their renderable descendants
// separately, and only the container often carries the identifying name/tag
// (e.g. a tree clone's userData lives on its root, not on the mesh inside
// it) — so classification walks up from each renderable object to the
// nearest matching ancestor, mirroring the existing `?debugCameraMesh=1`
// raycast's parent-walk in gameLoop.ts.
type SceneGroupCategory =
  | 'npcs'
  | 'fauna'
  | 'trees-living'
  | 'trees-extra'
  | 'trees-settlement'
  | 'buildings'
  | 'props-fire'
  | 'props-dropped'
  | 'props-tents'
  | 'props-settlement'
  | 'props-environment'
  | 'props-other'

function classify(obj: Object3D, scene: Scene): SceneGroupCategory {
  let node: Object3D | null = obj
  while (node && node !== scene) {
    if (node.name === 'npc') return 'npcs'
    if (node.name === 'fauna') return 'fauna'
    if (node.name === 'chunk-vegetation-tree-living') return 'trees-living'
    if (node.name === 'chunk-vegetation-extras') return 'trees-extra'
    if (node.userData?.treeId !== undefined) return 'trees-settlement'
    if (node.name.startsWith('house:') || node.name === 'house-static-batch') return 'buildings'
    if (node.name === 'fire') return 'props-fire'
    if (node.name === 'dropped-item') return 'props-dropped'
    if (node.name === 'placed-tent') return 'props-tents'
    if (node.name === 'settlement') return 'props-settlement'
    if (node.name.startsWith('chunk-environment') || node.name === 'chunk-items') return 'props-environment'
    node = node.parent
  }
  return 'props-other'
}

/** Whether `category` should stay visible for the requested `group` — an
 *  exact subgroup match, or one of the coarse `props`/`trees` buckets that
 *  cover every `props-*`/`trees-*` subcategory. */
function matchesGroup(category: SceneGroupCategory, group: MinimalSceneGroup): boolean {
  if (category === group) return true
  if (group === 'props') return category.startsWith('props-')
  if (group === 'trees') return category.startsWith('trees-')
  return false
}

/** TEMP: isolation test — minimal scene rendering
 *  `?debugMinimalScene=1`, optionally narrowed with `?debugSceneGroup=`
 *  (`props`/`trees`/`npcs`/`buildings`/`all`, or one of the finer
 *  `props-*`/`trees-*` subgroups). Hides every renderable object in the
 *  scene except the terrain chunk ground meshes (`name === 'chunk'`, set in
 *  buildChunkGeometry.ts), lights, and — when `group` selects one — the
 *  matching category. Never removes anything from the scene and never
 *  touches camera/renderer/EffectComposer state. Chunks stream in/out as the
 *  player moves, so this re-runs every frame rather than once. */
export function applyMinimalSceneDebug(scene: Scene, group: MinimalSceneGroup | null): void {
  scene.traverse((obj: Object3D) => {
    if (obj === scene) return
    if (obj.name === 'chunk') return
    if ((obj as { isLight?: boolean }).isLight) return
    if (!isRenderable(obj)) return
    if (group === 'all') return
    if (group !== null && matchesGroup(classify(obj, scene), group)) return
    obj.visible = false
  })
}
