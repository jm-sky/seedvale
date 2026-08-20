import { type AnimationClip, type Group, type Object3D, type SkinnedMesh } from 'three'
import { loadGltfAsset } from '../assets/loadGltf'
import {
  DEFAULT_PLAYER_CHARACTER,
  PLAYER_ANIMATIONS_URL,
  type PlayerCharacterConfig,
  resolveCharacterModelUrls,
} from './characterConfig'

function collectSkinnedMeshes(root: Object3D): SkinnedMesh[] {
  const meshes: SkinnedMesh[] = []
  root.traverse((obj) => {
    if ((obj as SkinnedMesh).isSkinnedMesh) meshes.push(obj as SkinnedMesh)
  })
  return meshes
}

/**
 * Loads the player's base character, optional outfit, and locomotion/attack
 * animation clips (plan 172 — Quaternius Universal Base Characters + Modular
 * Character Outfits + Universal Animation Library, all sharing one 65-bone
 * rig by construction).
 *
 * The outfit's meshes are rebound onto the base character's own
 * `THREE.Skeleton` (same joint names/order in both source files, verified
 * against the actual glTF skins) rather than kept on their own clone — one
 * skeleton drives every mesh, so equipping an outfit adds draw calls/textures
 * but never a second skeleton.
 */
export async function loadPlayerCharacterModel(
  config: PlayerCharacterConfig = DEFAULT_PLAYER_CHARACTER,
): Promise<{ scene: Group, animations: AnimationClip[] }> {
  const { baseModelUrl, outfitModelUrl } = resolveCharacterModelUrls(config)

  const [baseAsset, outfitAsset, animAsset] = await Promise.all([
    loadGltfAsset(baseModelUrl),
    outfitModelUrl ? loadGltfAsset(outfitModelUrl) : null,
    loadGltfAsset(PLAYER_ANIMATIONS_URL),
  ])

  const scene = baseAsset.clone()
  const [baseSkinned] = collectSkinnedMeshes(scene)

  if (outfitAsset) {
    if (!baseSkinned) {
      console.warn('[player] base character has no SkinnedMesh; skipping outfit attach')
    } else {
      const outfitRoot = outfitAsset.clone()
      for (const mesh of collectSkinnedMeshes(outfitRoot)) {
        mesh.bind(baseSkinned.skeleton, mesh.bindMatrix)
        scene.add(mesh)
      }
    }
  }

  return { scene, animations: animAsset.animations }
}
