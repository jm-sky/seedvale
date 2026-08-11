import * as THREE from 'three'

export type WorldLights = {
  ambient: THREE.AmbientLight
  hemi: THREE.HemisphereLight
  sun: THREE.DirectionalLight
  addTo: (scene: THREE.Scene) => void
  /** Recenter the sun/shadow frustum on the player — in a streamed world the
   *  frustum only needs to cover the area immediately around the camera, not
   *  the whole loaded region, so its size stays fixed and only the target moves. */
  follow: (x: number, z: number) => void
}

export function createLights(): WorldLights {
  const ambient = new THREE.AmbientLight(0xc5d8ea, 0.35)
  const hemi = new THREE.HemisphereLight(0x9ec9ff, 0x6b8f4a, 0.55)

  const sun = new THREE.DirectionalLight(0xfff0d4, 1.4)
  sun.position.set(40, 70, 30)
  sun.castShadow = true
  // 1024 is enough for the ~160-unit shadow frustum around the player;
  // 2048 mostly burned fill-rate without a matching clarity gain.
  sun.shadow.mapSize.set(1024, 1024)
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
    follow(x, z) {
      sun.position.set(x + 40, 70, z + 30)
      sun.target.position.set(x, 0, z)
      sun.target.updateMatrixWorld()
    },
  }
}
