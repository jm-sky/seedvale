import * as THREE from 'three'

const SKY = 0x87b5d4

export function createScene(): THREE.Scene {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(SKY)
  scene.fog = new THREE.Fog(SKY, 50, 160)
  return scene
}
