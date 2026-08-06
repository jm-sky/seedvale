import * as THREE from 'three'

/** Soft horizon haze — pairs with Preetham Sky (no solid background). */
export function createScene(): THREE.Scene {
  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(0xa8c4d8, 0.012)
  return scene
}
