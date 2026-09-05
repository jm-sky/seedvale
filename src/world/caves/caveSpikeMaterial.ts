/** Material config for the cave spikes. Both variants started from the same
 *  `MeshStandardMaterial` config `caveMesh.ts` (V1) uses so shading was never
 *  a comparison variable during Milestone A's technical/manual comparison
 *  (plan §12). Now that SDF is the manual-comparison candidate, its material
 *  gets a small legibility polish (lower roughness, for a subtle wet-rock
 *  torch highlight) — Sweep keeps the original V1-identical config since it
 *  is not the candidate and needs no visual polish (world-terrain-008
 *  Milestone A test-environment patch). Exported from the spikes' own
 *  module, not from `caveMesh.ts`.
 *
 * @domain world-terrain
 */

import * as THREE from 'three'

const ROCK_COLOR = 0x4d453e
/** Lower than V1/Sweep's 1 (fully matte) for a subtle torch highlight that
 *  reads as damp stone, not lacquer — see design doc §"SDF material". */
const SDF_ROUGHNESS = 0.7

export function createCaveSpikeMaterial(variant: 'sweep' | 'sdf' = 'sweep'): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: ROCK_COLOR,
    roughness: variant === 'sdf' ? SDF_ROUGHNESS : 1,
    metalness: 0,
    flatShading: true,
    side: THREE.DoubleSide,
  })
}
