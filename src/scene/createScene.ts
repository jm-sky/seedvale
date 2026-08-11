import * as THREE from 'three'

/** Distant linear fog — lets Preetham sky read clearly. */
export function createScene(): THREE.Scene {
  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0x6a93b0, 160, 280)
  return scene
}
