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

// TEMP: isolation test — scene object groups
//
// Category identification reuses existing, already-established scene
// conventions rather than inventing new ones:
//   - npcs:      NpcAgent.mesh.name === 'npc' (ai/NpcAgent.ts)
//   - fauna:     AnimalAgent.mesh.name === 'fauna' (fauna/AnimalAgent.ts) —
//                covers wild fauna and livestock; never independently
//                toggleable, only revealed via `all` (task requirement:
//                "Nie włączaj animal/fauna" for the npcs bucket).
//   - trees:     chunk-level living/extra tree groups (terrain/chunkManager.ts)
//                plus settlement forest-belt trees, tagged with
//                `userData.treeId` on the cloned root (settlement/props.ts) —
//                only the root carries the tag, so this walks ancestors.
//   - buildings: house root (`house:${id}`) and the shared batched static
//                geometry group (`house-static-batch`) — settlement/houseBuilder.ts.
//   - props:     everything else `debugMinimalScene` hides (chunk items/
//                environment decor, settlement props, player-placed fires/
//                tents, dropped items) — there is no single existing root
//                for this residual bucket, so it's identified by exclusion.
//
// Object3D.traverse visits container nodes and their renderable descendants
// separately, and only the container often carries the identifying name/tag
// (e.g. a tree clone's userData lives on its root, not on the mesh inside
// it) — so classification walks up from each renderable object to the
// nearest matching ancestor, mirroring the existing `?debugCameraMesh=1`
// raycast's parent-walk in gameLoop.ts.
type SceneGroupCategory = Exclude<MinimalSceneGroup, 'all'> | 'fauna'

function classify(obj: Object3D, scene: Scene): SceneGroupCategory {
  let node: Object3D | null = obj
  while (node && node !== scene) {
    if (node.name === 'npc') return 'npcs'
    if (node.name === 'fauna') return 'fauna'
    if (
      node.name === 'chunk-vegetation-tree-living' ||
      node.name === 'chunk-vegetation-extras' ||
      node.userData?.treeId !== undefined
    ) {
      return 'trees'
    }
    if (node.name.startsWith('house:') || node.name === 'house-static-batch') return 'buildings'
    node = node.parent
  }
  return 'props'
}

/** TEMP: isolation test — minimal scene rendering
 *  `?debugMinimalScene=1`, optionally narrowed with
 *  `?debugSceneGroup=props|npcs|trees|buildings|all`. Hides every renderable
 *  object in the scene except the terrain chunk ground meshes
 *  (`name === 'chunk'`, set in buildChunkGeometry.ts), lights, and — when
 *  `group` selects one — the matching category. Never removes anything from
 *  the scene and never touches camera/renderer/EffectComposer state. Chunks
 *  stream in/out as the player moves, so this re-runs every frame rather
 *  than once. */
export function applyMinimalSceneDebug(scene: Scene, group: MinimalSceneGroup | null): void {
  scene.traverse((obj: Object3D) => {
    if (obj === scene) return
    if (obj.name === 'chunk') return
    if ((obj as { isLight?: boolean }).isLight) return
    if (!isRenderable(obj)) return
    if (group === 'all') return
    if (group !== null && classify(obj, scene) === group) return
    obj.visible = false
  })
}
