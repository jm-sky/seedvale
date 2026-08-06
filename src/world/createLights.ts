import * as THREE from 'three'

export type WorldLights = {
  ambient: THREE.AmbientLight
  hemi: THREE.HemisphereLight
  sun: THREE.DirectionalLight
  addTo: (scene: THREE.Scene) => void
}

export function createLights(): WorldLights {
  const ambient = new THREE.AmbientLight(0xc5d8ea, 0.35)
  const hemi = new THREE.HemisphereLight(0x9ec9ff, 0x6b8f4a, 0.55)

  const sun = new THREE.DirectionalLight(0xfff0d4, 1.4)
  sun.position.set(40, 70, 30)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 200
  sun.shadow.camera.left = -80
  sun.shadow.camera.right = 80
  sun.shadow.camera.top = 80
  sun.shadow.camera.bottom = -80
  sun.shadow.bias = -0.0002

  return {
    ambient,
    hemi,
    sun,
    addTo(scene) {
      scene.add(ambient)
      scene.add(hemi)
      scene.add(sun)
      scene.add(sun.target)
    },
  }
}
