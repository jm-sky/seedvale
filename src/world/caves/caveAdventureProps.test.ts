/** Plan world-terrain-020 Stage D — adventure presentation props. */

import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import type { LargeCaveSite } from '../largeCaves'
import type { CaveTopology } from './caveTopology'
import { LANTERN_URL } from '../../settlement/propSpecs'
import { CART_MODEL_YAW_OFFSET } from '../cartProp'
import { buildAdventureCaveTopology } from './adventureTopology'
import {
  adventurePropPlacementFromAnchor,
  adventurePropPlacementsFromAnchors,
  CAVE_ADVENTURE_LANTERN_LIGHT_LIMIT,
  CAVE_ADVENTURE_PROPS_GROUP_NAME,
  CAVE_SUPPORT_LAY_FLAT_ROLL,
  CAVE_TORCH_YAW_OFFSET,
  createCaveAdventurePropsGroup,
  getCaveAdventurePropTemplates,
  preloadCaveAdventurePropTemplates,
  presentationAnchorsFromContent,
} from './caveAdventureProps'
import { resolveCaveContentAnchors } from './caveContentAnchors'
import { buildCaveHeightfieldRepresentation } from './caveHeightfieldRepresentation'
import { mouthCarveDepth } from './mouthCarve'
import { buildProductionCaveTopology } from './productionTopology'

function baseSite(overrides: Partial<LargeCaveSite> = {}): LargeCaveSite {
  return { x: 200, z: -140, yaw: 0.6, length: 12, variant: 0.4, ...overrides }
}

function terrainAlongTunnel(site: LargeCaveSite, entranceHeight: number, riseRate: number): (x: number, z: number) => number {
  const intoDx = -Math.sin(site.yaw)
  const intoDz = -Math.cos(site.yaw)
  return (x, z) => entranceHeight + riseRate * ((x - site.x) * intoDx + (z - site.z) * intoDz)
}

function buildAdventure(seed: number, site: LargeCaveSite): {
  topology: CaveTopology
  heightfield: ReturnType<typeof buildCaveHeightfieldRepresentation>['heightfield']
} {
  const hill = terrainAlongTunnel(site, 130, 0.5)
  const topology = buildAdventureCaveTopology({ seed, site, sampleHeight: hill, sampleBaseHeight: hill })
  if (!topology) throw new Error(`adventure topology rejected seed ${seed}`)
  const walkSurfaceAt = (x: number, z: number): number => hill(x, z) - mouthCarveDepth(x, z, topology.entrance)
  return {
    topology,
    heightfield: buildCaveHeightfieldRepresentation(topology, walkSurfaceAt).heightfield,
  }
}

const SITE = baseSite()
const FIXTURE = buildAdventure(42, SITE)
const FIXTURE_ANCHORS = resolveCaveContentAnchors({
  archetype: 'adventure',
  topology: FIXTURE.topology,
  heightfield: FIXTURE.heightfield,
})

function byRole<T extends { role: string }>(items: readonly T[], role: string): T[] {
  return items.filter((a) => a.role === role)
}

function countPointLights(root: THREE.Object3D): number {
  let n = 0
  root.traverse((obj) => {
    if ((obj as THREE.PointLight).isPointLight) n++
  })
  return n
}

beforeAll(async () => {
  await preloadCaveAdventurePropTemplates()
})

describe('cave adventure props (plan world-terrain-020 Stage D)', () => {
  it('maps presentation anchors to expected role counts on the seed-42 fixture', () => {
    const presentation = presentationAnchorsFromContent(FIXTURE_ANCHORS)
    expect(byRole(presentation, 'wagon')).toHaveLength(1)
    expect(byRole(presentation, 'support')).toHaveLength(byRole(FIXTURE_ANCHORS, 'support').length)
    expect(byRole(presentation, 'crate')).toHaveLength(byRole(FIXTURE_ANCHORS, 'crate').length)
    expect(byRole(presentation, 'lantern')).toHaveLength(byRole(FIXTURE_ANCHORS, 'lantern').length)
    expect(byRole(presentation, 'sideTreasure')).toHaveLength(0)
    expect(byRole(presentation, 'finalTreasure')).toHaveLength(0)
  })

  it('returns no presentation descriptors for natural caves', () => {
    const hill = terrainAlongTunnel(SITE, 130, 0.5)
    const topology = buildProductionCaveTopology({
      seed: 42,
      site: SITE,
      sampleHeight: hill,
      sampleBaseHeight: hill,
    })
    expect(topology).not.toBeNull()
    const walkSurfaceAt = (x: number, z: number): number => hill(x, z) - mouthCarveDepth(x, z, topology!.entrance)
    const heightfield = buildCaveHeightfieldRepresentation(topology!, walkSurfaceAt).heightfield
    const anchors = resolveCaveContentAnchors({ archetype: 'natural', topology: topology!, heightfield })
    expect(adventurePropPlacementsFromAnchors(anchors)).toEqual([])
  })

  it('passes anchor x/y/z/yaw through placement descriptors with explicit cart yaw offset', () => {
    const wagon = byRole(FIXTURE_ANCHORS, 'wagon')[0]!
    const placement = adventurePropPlacementFromAnchor(wagon)
    expect(placement.x).toBe(wagon.x)
    expect(placement.y).toBe(wagon.y)
    expect(placement.z).toBe(wagon.z)
    expect(placement.yaw).toBe(wagon.yaw)
    expect(placement.yawOffset).toBe(CART_MODEL_YAW_OFFSET)
    expect(placement.assetKind).toBe('cart')
  })

  it('builds one props group per anchor with bounded lantern lights', () => {
    const { group, propCount, lanternLightCount } = createCaveAdventurePropsGroup(FIXTURE_ANCHORS)
    expect(group.name).toBe(CAVE_ADVENTURE_PROPS_GROUP_NAME)
    expect(propCount).toBe(presentationAnchorsFromContent(FIXTURE_ANCHORS).length)
    expect(group.children).toHaveLength(propCount)
    expect(lanternLightCount).toBe(Math.min(byRole(FIXTURE_ANCHORS, 'lantern').length, CAVE_ADVENTURE_LANTERN_LIGHT_LIMIT))
    expect(countPointLights(group)).toBe(lanternLightCount)
    group.traverse((obj) => {
      if ((obj as THREE.PointLight).isPointLight) {
        expect((obj as THREE.PointLight).castShadow).toBe(false)
      }
    })
  })

  it('places pivot at semantic anchor and applies prepared root offset only on the clone', () => {
    const tpl = getCaveAdventurePropTemplates()
    const prepared = new THREE.Group()
    prepared.position.set(0.5, 0.25, -0.3)
    prepared.add(new THREE.Object3D())
    const wagonAnchor = byRole(FIXTURE_ANCHORS, 'wagon')[0]!
    const customTpl = { ...tpl, cart: prepared }
    const { group } = createCaveAdventurePropsGroup([wagonAnchor], customTpl)
    const pivot = group.children[0] as THREE.Group
    expect(pivot.position.x).toBe(wagonAnchor.x)
    expect(pivot.position.y).toBe(wagonAnchor.y)
    expect(pivot.position.z).toBe(wagonAnchor.z)
    const cloneRoot = pivot.children[0]!
    expect(cloneRoot.position.x).toBe(0.5)
    expect(cloneRoot.position.y).toBe(0.25)
    expect(cloneRoot.position.z).toBe(-0.3)
    group.updateMatrixWorld(true)
    const world = new THREE.Vector3()
    cloneRoot.getWorldPosition(world)
    const localOffset = new THREE.Vector3(0.5, 0.25, -0.3)
    localOffset.applyEuler(new THREE.Euler(0, pivot.rotation.y, 0))
    const expectedOnce = new THREE.Vector3(wagonAnchor.x, wagonAnchor.y, wagonAnchor.z).add(localOffset)
    const doubleOffset = localOffset.clone().multiplyScalar(2).add(
      new THREE.Vector3(wagonAnchor.x, wagonAnchor.y, wagonAnchor.z),
    )
    expect(world.distanceTo(expectedOnce)).toBeLessThan(1e-5)
    expect(world.distanceTo(doubleOffset)).toBeGreaterThan(0.01)
  })

  it('lays support props flat with a roll orientation group', () => {
    const supportAnchor = byRole(FIXTURE_ANCHORS, 'support')[0]!
    const { group } = createCaveAdventurePropsGroup([supportAnchor])
    const pivot = group.children[0] as THREE.Group
    const orientation = pivot.children[0] as THREE.Group
    expect(orientation.name).toBe('cave-adventure-prop-orientation')
    expect(orientation.rotation.z).toBeCloseTo(CAVE_SUPPORT_LAY_FLAT_ROLL)
  })

  it('applies torch yaw offset on lantern pivots', () => {
    const lantern = byRole(FIXTURE_ANCHORS, 'lantern')[0]!
    const { group } = createCaveAdventurePropsGroup([lantern])
    const pivot = group.children[0] as THREE.Group
    expect(pivot.rotation.y).toBeCloseTo(lantern.yaw + CAVE_TORCH_YAW_OFFSET)
  })

  it('returns lit village torches with primed fire particle buffers', () => {
    const lantern = byRole(FIXTURE_ANCHORS, 'lantern')[0]!
    const { lanternTorches } = createCaveAdventurePropsGroup([lantern])
    expect(lanternTorches).toHaveLength(1)
    let points: THREE.Points | null = null
    lanternTorches[0]!.object.traverse((obj) => {
      if ((obj as THREE.Points).isPoints && !points) points = obj as THREE.Points
    })
    expect(points).not.toBeNull()
    const pos = points!.geometry.getAttribute('position') as THREE.BufferAttribute
    let sum = 0
    for (let i = 0; i < pos.count * 3; i++) sum += Math.abs(pos.array[i]!)
    expect(sum).toBeGreaterThan(0)
  })

  it('materializes lantern anchors as torch-style lights, not settlement lantern glb', () => {
    const lanterns = byRole(FIXTURE_ANCHORS, 'lantern')
    const { group, lanternLightCount } = createCaveAdventurePropsGroup(lanterns)
    expect(lanternLightCount).toBe(lanterns.length)
    let settlementLanternAsset = false
    let pointLights = 0
    group.traverse((obj) => {
      const url = obj.userData?.assetUrl as string | undefined
      if (url === LANTERN_URL) settlementLanternAsset = true
      if ((obj as THREE.PointLight).isPointLight) pointLights++
    })
    expect(settlementLanternAsset).toBe(false)
    expect(pointLights).toBe(lanterns.length)
    for (const pivot of group.children) {
      expect(pivot.children.length).toBeGreaterThan(0)
    }
  })
})
