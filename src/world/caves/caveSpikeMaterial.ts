/** Shared material config for both cave spikes — same `MeshStandardMaterial`
 *  config `caveMesh.ts` (V1) uses, so shading is never a comparison variable
 *  (plan §12). Exported from the spikes' own module, not from `caveMesh.ts`.
 *
 * @domain world-terrain
 */

import * as THREE from 'three'

const ROCK_COLOR = 0x4d453e

export function createCaveSpikeMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: ROCK_COLOR,
    roughness: 1,
    flatShading: true,
    side: THREE.DoubleSide,
  })
}
