import * as THREE from 'three'

export function createCamera(
  aspect: number,
): THREE.PerspectiveCamera {
  return new THREE.PerspectiveCamera(60, aspect, 0.1, 500)
}
