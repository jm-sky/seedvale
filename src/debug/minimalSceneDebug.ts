import type { Object3D, Scene } from 'three'

/** TEMP: isolation test — minimal scene rendering
 *  `?debugMinimalScene=1`. Hides every renderable object in the scene except
 *  the terrain chunk ground meshes (`name === 'chunk'`, set in
 *  buildChunkGeometry.ts) and lights. Never removes anything from the scene
 *  and never touches camera/renderer/EffectComposer state. Chunks stream
 *  in/out as the player moves, so this re-runs every frame rather than once. */
export function applyMinimalSceneDebug(scene: Scene): void {
  scene.traverse((obj: Object3D) => {
    if (obj === scene) return
    if (obj.name === 'chunk') return
    if ((obj as { isLight?: boolean }).isLight) return
    const renderable =
      (obj as { isMesh?: boolean }).isMesh ||
      (obj as { isPoints?: boolean }).isPoints ||
      (obj as { isSprite?: boolean }).isSprite ||
      (obj as { isLine?: boolean }).isLine ||
      (obj as { isInstancedMesh?: boolean }).isInstancedMesh ||
      (obj as { isSkinnedMesh?: boolean }).isSkinnedMesh
    if (renderable) obj.visible = false
  })
}
