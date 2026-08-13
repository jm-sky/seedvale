import * as THREE from 'three'
import type { LargeCaveSite } from './largeCaves'
import { createLargeRock, createRockCluster, placeOnGround } from '../settlement/props'

const ROCK_MAT = 0x6a6560
const DARK_MAT = 0x2a2622

/**
 * Irregular rock framing for a large cave. Local +Z is the opening (same
 * convention as `createCaveMouth`); the caller yaws the group downhill.
 * Complements the heightmap carve — does not fake the hole itself (plan 090).
 */
export function createLargeCaveVisual(site: LargeCaveSite): THREE.Group {
  const group = new THREE.Group()
  const v = site.variant
  const length = site.length

  const addRock = (lx: number, lz: number, scale: number, jitter: number): void => {
    const rock = createLargeRock(scale, (v + jitter) % 1)
    rock.position.set(lx, 0, lz)
    rock.rotation.y = (v + jitter) * Math.PI * 2
    group.add(rock)
  }

  const mouthCount = 9
  for (let i = 0; i < mouthCount; i++) {
    const t = i / (mouthCount - 1)
    const a = -1.15 + t * 2.3
    addRock(Math.sin(a) * 1.7, -Math.cos(a) * 0.65, 0.85 + ((v * (i + 3)) % 1) * 0.55, i * 0.13)
  }

  const steps = Math.max(5, Math.round(length / 2.2))
  for (let s = 1; s <= steps; s++) {
    const t = s / steps
    const along = -t * length
    const sideScale = 0.7 + (1 - t) * 0.35
    for (const sign of [-1, 1]) {
      const side = sign * (1.35 + ((v * (s + 5)) % 1) * 0.4)
      addRock(side, along, sideScale, s * 0.17 + sign)
    }
  }

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI - Math.PI * 0.5
    addRock(Math.cos(a) * 1.1, -length + Math.sin(a) * 0.4, 0.95 + ((v * (i + 2)) % 1) * 0.4, 0.4 + i * 0.11)
  }

  const rubble = createRockCluster(1.1, v, ROCK_MAT)
  rubble.position.set(0, 0, 1.6)
  group.add(rubble)

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.4, 10),
    new THREE.MeshStandardMaterial({ color: DARK_MAT, roughness: 1, flatShading: true }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.set(0, 0.04, -1.2)
  group.add(shadow)

  return group
}

export function placeLargeCaveVisual(
  group: THREE.Group,
  site: LargeCaveSite,
  sampleHeight: (x: number, z: number) => number,
): void {
  placeOnGround(group, site.x, site.z, sampleHeight)
  group.rotation.y = site.yaw
}
