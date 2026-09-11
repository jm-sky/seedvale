/** Cave presentation must not receive global exterior scene.fog when viewed from outside. */

import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { WeatherState } from '../weather'
import {
  buildCaveHeightfieldFixture,
  caveHeightfieldWalkSurfaceAt,
} from '../../debug/caves/caveHeightfieldFixtures'
import { applyWeatherOverlay, resolveSceneFog } from '../weatherVisuals'
import {
  createCaveHeightfieldMaterial,
  createCaveHeightfieldPresentation,
  createMouthUndersideMaskMaterial,
  exemptCavePresentationFromSceneFog,
} from './caveHeightfieldPresentation'
import {
  buildCaveHeightfieldRepresentation,
  DEFAULT_HEIGHTFIELD_CONFIG,
} from './caveHeightfieldRepresentation'

const walk = caveHeightfieldWalkSurfaceAt
const TEST_CONFIG = { ...DEFAULT_HEIGHTFIELD_CONFIG, cellSize: 0.5 }

function weather(overrides: Partial<WeatherState>): WeatherState {
  return { type: 'clear', intensity: 0, temperature: 12, startedAt: 0, endsAt: 0.3, ...overrides }
}

function meshMaterialsFogDisabled(root: THREE.Object3D): boolean {
  let ok = true
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of mats) {
      if (m && (m as THREE.Material & { fog?: boolean }).fog !== false) ok = false
    }
  })
  return ok
}

describe('cave presentation scene fog opt-out', () => {
  it('shared heightfield and mouth mask materials disable fog at creation', () => {
    expect(createCaveHeightfieldMaterial().fog).toBe(false)
    expect(createMouthUndersideMaskMaterial().fog).toBe(false)
  })

  it('presentation group disables fog on every mesh after assembly', () => {
    const field = buildCaveHeightfieldRepresentation(
      buildCaveHeightfieldFixture('basic'),
      walk,
      TEST_CONFIG,
    ).heightfield
    const presentation = createCaveHeightfieldPresentation({
      field,
      walkSurfaceAt: walk,
      caveMaterial: createCaveHeightfieldMaterial(),
      maskMaterial: createMouthUndersideMaskMaterial(),
      rocks: true,
      interiorRockPlacements: [],
      adventurePropAnchors: [],
    })
    expect(meshMaterialsFogDisabled(presentation.group)).toBe(true)
  })

  it('exemptCavePresentationFromSceneFog clones sharedGpu materials instead of mutating cache', () => {
    const cached = new THREE.MeshStandardMaterial({ color: 0xff0000 })
    cached.userData.sharedGpu = true
    cached.fog = true
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), cached)
    const group = new THREE.Group()
    group.add(mesh)

    exemptCavePresentationFromSceneFog(group)

    expect(cached.fog).toBe(true)
    const inst = mesh.material as THREE.MeshStandardMaterial
    expect(inst).not.toBe(cached)
    expect(inst.fog).toBe(false)
    expect(inst.userData.sharedGpu).toBe(false)
  })

  it('leaves already fog-disabled shared heightfield materials on the mesh', () => {
    const shared = createCaveHeightfieldMaterial()
    shared.userData.sharedGpu = true
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), shared)
    const group = new THREE.Group()
    group.add(mesh)

    exemptCavePresentationFromSceneFog(group)

    expect(mesh.material).toBe(shared)
    expect(shared.userData.sharedGpu).toBe(true)
    expect(shared.fog).toBe(false)
  })

  it('outdoor resolveSceneFog contract is unchanged when not in cave occupancy', () => {
    const baseFog = { fogColor: 0x6a93b0, fogNear: 160, fogFar: 230 }
    const outdoor = applyWeatherOverlay(baseFog, weather({ type: 'fog', intensity: 1 }))
    expect(resolveSceneFog(outdoor, false)).toEqual({
      fogColor: outdoor.fogColor,
      fogNear: outdoor.fogNear,
      fogFar: outdoor.fogFar,
    })
  })
})
