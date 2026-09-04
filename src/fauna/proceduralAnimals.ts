import * as THREE from 'three'

/**
 * Simple primitive-built animal visuals for species without a GLB, or as a
 * load-failure fallback. Livestock (chicken/sheep/cow/horse/donkey) prefer
 * `public/models/fauna/*.glb`. Origin at feet (same as GLB `prepareProp`).
 */

function legs(mat: THREE.Material, count: 2 | 4, spanX: number, spanZ: number, radius: number, height: number): THREE.Group {
  const group = new THREE.Group()
  const xs = count === 4 ? [-spanX, spanX] : [0]
  const zs = [-spanZ, spanZ]
  for (const x of xs) {
    for (const z of zs) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.85, height, 5), mat)
      leg.position.set(x, height / 2, z)
      leg.castShadow = true
      group.add(leg)
    }
  }
  return group
}

export function createRabbitModel(): THREE.Group {
  const root = new THREE.Group()
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xb8a088, flatShading: true })
  const earMat = new THREE.MeshStandardMaterial({ color: 0xcdb8a0, flatShading: true })

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), bodyMat)
  body.scale.set(1.15, 0.9, 1.3)
  body.position.y = 0.17
  body.castShadow = true
  root.add(body)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), bodyMat)
  head.position.set(0, 0.24, 0.16)
  head.castShadow = true
  root.add(head)

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 5), earMat)
    ear.position.set(side * 0.045, 0.42, 0.14)
    ear.rotation.x = -0.15
    ear.castShadow = true
    root.add(ear)
  }

  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), earMat)
  tail.position.set(0, 0.18, -0.2)
  root.add(tail)

  return root
}

export function createDuckModel(): THREE.Group {
  const root = new THREE.Group()
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, flatShading: true })
  const headMat = new THREE.MeshStandardMaterial({ color: 0x445a35, flatShading: true })
  const beakMat = new THREE.MeshStandardMaterial({ color: 0xd98a2a, flatShading: true })

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 5), bodyMat)
  body.scale.set(1.1, 0.85, 1.5)
  body.position.y = 0.16
  body.castShadow = true
  root.add(body)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), headMat)
  head.position.set(0, 0.3, 0.2)
  head.castShadow = true
  root.add(head)

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 4), beakMat)
  beak.rotation.x = Math.PI / 2
  beak.position.set(0, 0.29, 0.32)
  root.add(beak)

  return root
}

export function createBoarModel(): THREE.Group {
  const root = new THREE.Group()
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3d2e22, flatShading: true })
  const tuskMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, flatShading: true })

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.5, 3, 6), bodyMat)
  body.rotation.z = Math.PI / 2
  body.position.y = 0.42
  body.castShadow = true
  root.add(body)

  const head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.32, 6), bodyMat)
  head.rotation.x = Math.PI / 2
  head.position.set(0, 0.4, 0.42)
  head.castShadow = true
  root.add(head)

  for (const side of [-1, 1]) {
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.09, 4), tuskMat)
    tusk.rotation.x = Math.PI / 2 + 0.4
    tusk.position.set(side * 0.06, 0.32, 0.54)
    root.add(tusk)
  }

  root.add(legs(bodyMat, 4, 0.16, 0.2, 0.06, 0.34))
  return root
}

export function createHorseModel(): THREE.Group {
  const root = new THREE.Group()
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, flatShading: true })
  const maneMat = new THREE.MeshStandardMaterial({ color: 0x2e2119, flatShading: true })

  const legHeight = 0.75
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.7, 3, 6), bodyMat)
  body.rotation.z = Math.PI / 2
  body.position.y = legHeight + 0.24
  body.castShadow = true
  root.add(body)

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.55, 6), bodyMat)
  neck.position.set(0, legHeight + 0.5, 0.42)
  neck.rotation.x = -0.6
  neck.castShadow = true
  root.add(neck)

  const head = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42, 6), bodyMat)
  head.rotation.x = Math.PI / 2 - 0.3
  head.position.set(0, legHeight + 0.78, 0.6)
  head.castShadow = true
  root.add(head)

  const mane = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.1), maneMat)
  mane.position.set(0, legHeight + 0.6, 0.32)
  mane.rotation.x = -0.6
  root.add(mane)

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 5), maneMat)
  tail.position.set(0, legHeight + 0.15, -0.42)
  tail.rotation.x = Math.PI - 0.3
  tail.castShadow = true
  root.add(tail)

  root.add(legs(bodyMat, 4, 0.16, 0.3, 0.06, legHeight))
  return root
}

/** Procedural stand-in when donkey.glb fails — scaled/tinted horse. */
export function createDonkeyModel(): THREE.Group {
  const root = createHorseModel()
  root.scale.setScalar(0.75)
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const mat = mesh.material
    const std = (Array.isArray(mat) ? mat[0] : mat) as THREE.MeshStandardMaterial
    if (std?.color) std.color.setHex(0x7a6a58)
  })
  return root
}

export function createCowModel(): THREE.Group {
  const root = new THREE.Group()
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xede4d3, flatShading: true })
  const patchMat = new THREE.MeshStandardMaterial({ color: 0x2b2620, flatShading: true })

  const legHeight = 0.55
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 1.05), bodyMat)
  body.position.y = legHeight + 0.25
  body.castShadow = true
  root.add(body)

  const patch = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.4), patchMat)
  patch.position.set(0.12, legHeight + 0.42, -0.1)
  root.add(patch)

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.32), bodyMat)
  head.position.set(0, legHeight + 0.3, 0.65)
  head.castShadow = true
  root.add(head)

  root.add(legs(bodyMat, 4, 0.2, 0.4, 0.08, legHeight))
  return root
}

export function createSheepModel(): THREE.Group {
  const root = new THREE.Group()
  const woolMat = new THREE.MeshStandardMaterial({ color: 0xe8e3d3, flatShading: true, roughness: 1 })
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b2620, flatShading: true })

  const legHeight = 0.32
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), woolMat)
  body.scale.set(1, 0.85, 1.2)
  body.position.y = legHeight + 0.24
  body.castShadow = true
  root.add(body)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), darkMat)
  head.position.set(0, legHeight + 0.18, 0.32)
  head.castShadow = true
  root.add(head)

  root.add(legs(darkMat, 4, 0.14, 0.22, 0.045, legHeight))
  return root
}

export function createChickenModel(): THREE.Group {
  const root = new THREE.Group()
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xa8783c, flatShading: true })
  const combMat = new THREE.MeshStandardMaterial({ color: 0xc23b3b, flatShading: true })
  const beakMat = new THREE.MeshStandardMaterial({ color: 0xd9a02a, flatShading: true })

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), bodyMat)
  body.scale.set(1, 1.1, 1.2)
  body.position.y = 0.18
  body.castShadow = true
  root.add(body)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 4), bodyMat)
  head.position.set(0, 0.32, 0.1)
  head.castShadow = true
  root.add(head)

  const comb = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 4), combMat)
  comb.position.set(0, 0.4, 0.1)
  root.add(comb)

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), beakMat)
  beak.rotation.x = Math.PI / 2
  beak.position.set(0, 0.31, 0.19)
  root.add(beak)

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 5), bodyMat)
  tail.position.set(0, 0.28, -0.16)
  tail.rotation.x = Math.PI + 0.5
  root.add(tail)

  root.add(legs(beakMat, 2, 0, 0.02, 0.02, 0.16))
  return root
}

/** Rooster placeholder (plan fauna-009 §3) — same feet-rooted primitive
 *  pipeline as `createChickenModel`, distinguished by a darker plumage color,
 *  a taller comb/wattle and an upright tail plume. Swappable for a real GLB
 *  later (`livestock.ts`'s `LIVESTOCK_URLS.rooster`) without any behaviour
 *  change, same as every other livestock fallback here. */
export function createRoosterModel(): THREE.Group {
  const root = new THREE.Group()
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a2a20, flatShading: true })
  const combMat = new THREE.MeshStandardMaterial({ color: 0xc23b3b, flatShading: true })
  const beakMat = new THREE.MeshStandardMaterial({ color: 0xd9a02a, flatShading: true })

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 5), bodyMat)
  body.scale.set(1, 1.15, 1.25)
  body.position.y = 0.19
  body.castShadow = true
  root.add(body)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 5, 4), bodyMat)
  head.position.set(0, 0.35, 0.11)
  head.castShadow = true
  root.add(head)

  const comb = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 4), combMat)
  comb.position.set(0, 0.45, 0.1)
  root.add(comb)

  const wattle = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 4), combMat)
  wattle.position.set(0, 0.31, 0.16)
  wattle.rotation.x = Math.PI
  root.add(wattle)

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.027, 0.09, 4), beakMat)
  beak.rotation.x = Math.PI / 2
  beak.position.set(0, 0.34, 0.2)
  root.add(beak)

  // Upright plume, unlike the chicken's low trailing tail — the visible
  // "this is the rooster" cue at a glance.
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.28, 5), bodyMat)
  tail.position.set(0, 0.42, -0.15)
  tail.rotation.x = 0.7
  root.add(tail)

  root.add(legs(beakMat, 2, 0, 0.02, 0.022, 0.18))
  return root
}

/** Plan fauna-011 §1 load-failure fallback — `dog_husky.glb`/`dog_shiba.glb`
 *  are the real visuals; this only covers the (unexpected) case where
 *  neither loads. */
export function createDogModel(): THREE.Group {
  const root = new THREE.Group()
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc8a878, flatShading: true })
  const earMat = new THREE.MeshStandardMaterial({ color: 0x8a6a48, flatShading: true })

  const legHeight = 0.24
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.5), bodyMat)
  body.position.y = legHeight + 0.13
  body.castShadow = true
  root.add(body)

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.2), bodyMat)
  head.position.set(0, legHeight + 0.24, 0.32)
  head.castShadow = true
  root.add(head)

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 4), earMat)
    ear.position.set(side * 0.06, legHeight + 0.33, 0.32)
    root.add(ear)
  }

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.22, 5), bodyMat)
  tail.position.set(0, legHeight + 0.2, -0.28)
  tail.rotation.x = -0.6
  root.add(tail)

  root.add(legs(earMat, 4, 0.08, 0.18, 0.035, legHeight))
  return root
}
