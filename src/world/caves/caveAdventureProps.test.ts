/** Plan world-terrain-020 Stage D — adventure presentation props. */

import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import type { LargeCaveSite } from '../largeCaves'
import type { CaveTopology } from './caveTopology'
import { CART_MODEL_YAW_OFFSET } from '../cartProp'
import { buildAdventureCaveTopology } from './adventureTopology'
import {
  adventurePropPlacementFromAnchor,
  adventurePropPlacementsFromAnchors,
  CAVE_ADVENTURE_LANTERN_LIGHT_LIMIT,
  CAVE_ADVENTURE_PROPS_GROUP_NAME,
  createCaveAdventurePropsGroup,
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
    for (const child of group.children) {
      const light = child.children.find((c) => (c as THREE.PointLight).isPointLight) as THREE.PointLight | undefined
      if (light) expect(light.castShadow).toBe(false)
    }
  })
})
