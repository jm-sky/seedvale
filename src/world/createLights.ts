import * as THREE from 'three'

export type WorldLights = {
  ambient: THREE.AmbientLight
  sun: THREE.DirectionalLight
  addTo: (scene: THREE.Scene) => void
}

export function createLights(): WorldLights {
  const ambient = new THREE.AmbientLight(0xffffff, 0.45)

  const sun = new THREE.DirectionalLight(0xfff2d6, 1.1)
  sun.position.set(40, 70, 30)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 200
  sun.shadow.camera.left = -80
  sun.shadow.camera.right = 80
  sun.shadow.camera.top = 80
  sun.shadow.camera.bottom = -80

  return {
    ambient,
    sun,
    addTo(scene) {
      scene.add(ambient)
      scene.add(sun)
    },
  }
}
