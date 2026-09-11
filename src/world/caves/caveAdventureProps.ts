/** Plan world-terrain-020 Stage D — presentation-only adventure cave props
 *  (wagon/cart, support, crate, lantern→torch light) materialized from Stage B
 *  content anchors when cave presentation is active. No gameplay authority, no
 *  collision, no terrain re-grounding.
 *
 * @domain world-terrain
 */

import * as THREE from 'three'
import type { CaveContentAnchor } from './caveContentAnchors'
import { markSharedGpu } from '../../assets/loadGltf'
import {
  createProceduralTorchPost,
  createVillageTorchLight,
} from '../../settlement/houseLighting'
import { VILLAGE_TORCH_HEIGHT, VILLAGE_TORCH_URL } from '../../settlement/propSpecs'
import { loadPropOrFallback } from '../../settlement/propUtils'
import { createCrate } from '../../settlement/settlementStructures'
import { CART_MODEL_YAW_OFFSET, createCartProp, preloadCartProp } from '../cartProp'

export const CAVE_ADVENTURE_PROPS_GROUP_NAME = 'cave-adventure-props'
/** `createCaves` stores the props subtree here for PointLightBudget unregister. */
export const CAVE_ADVENTURE_PROPS_USERDATA_KEY = 'caveAdventurePropsRoot'

export const CAVE_PRESENTATION_PROP_ROLES = [
  'wagon',
  'support',
  'crate',
  'lantern',
] as const

export type CavePresentationPropRole = (typeof CAVE_PRESENTATION_PROP_ROLES)[number]

export type CaveAdventurePropAssetKind = 'cart' | 'support' | 'crate' | 'lantern'

export type CaveAdventurePropPlacement = {
  role: CavePresentationPropRole
  assetKind: CaveAdventurePropAssetKind
  anchorId: string
  x: number
  y: number
  z: number
  yaw: number
  /** Added to anchor yaw when orienting the clone (asset forward axis). */
  yawOffset: number
}

const SUPPORT_URL = '/models/settlement/megakit/support.glb'
const CRATE_URL = '/models/settlement/crate.glb'

/** Longest-axis fit for megakit support posts in a cave chamber. */
export const CAVE_SUPPORT_FIT_MAX = 2.2
export const CAVE_CRATE_TARGET_HEIGHT = 0.6

/** Max real PointLights per active adventure cave presentation (lantern anchors). */
export const CAVE_ADVENTURE_LANTERN_LIGHT_LIMIT = 2

function roleToAssetKind(role: CavePresentationPropRole): CaveAdventurePropAssetKind {
  return role === 'wagon' ? 'cart' : role
}

function yawOffsetForRole(role: CavePresentationPropRole): number {
  if (role === 'wagon') return CART_MODEL_YAW_OFFSET
  return 0
}

/**
 * Keeps only presentation prop anchors — excludes systemic treasure chests.
 *
 * @domain world-terrain
 */
export function presentationAnchorsFromContent(
  anchors: readonly CaveContentAnchor[],
): readonly CaveContentAnchor[] {
  const out: CaveContentAnchor[] = []
  for (const anchor of anchors) {
    if (anchor.role === 'sideTreasure' || anchor.role === 'finalTreasure') continue
    if (!CAVE_PRESENTATION_PROP_ROLES.includes(anchor.role as CavePresentationPropRole)) continue
    out.push(anchor)
  }
  return Object.freeze(out)
}

/**
 * Maps one content anchor to a world placement descriptor. Position/yaw come
 * from the anchor; optional yawOffset is asset-specific only.
 *
 * @domain world-terrain
 */
export function adventurePropPlacementFromAnchor(anchor: CaveContentAnchor): CaveAdventurePropPlacement {
  const role = anchor.role as CavePresentationPropRole
  return {
    role,
    assetKind: roleToAssetKind(role),
    anchorId: anchor.id,
    x: anchor.x,
    y: anchor.y,
    z: anchor.z,
    yaw: anchor.yaw,
    yawOffset: yawOffsetForRole(role),
  }
}

export function adventurePropPlacementsFromAnchors(
  anchors: readonly CaveContentAnchor[],
): readonly CaveAdventurePropPlacement[] {
  return Object.freeze(presentationAnchorsFromContent(anchors).map(adventurePropPlacementFromAnchor))
}

/** Simple timber brace when megakit support fails to load. */
function createProceduralSupport(): THREE.Group {
  const group = new THREE.Group()
  const wood = new THREE.MeshStandardMaterial({ color: 0x5c4030, flatShading: true, roughness: 0.9 })
  const postGeo = new THREE.BoxGeometry(0.12, 1.35, 0.12)
  const beamGeo = new THREE.BoxGeometry(1.05, 0.1, 0.14)
  const left = new THREE.Mesh(postGeo, wood)
  left.position.set(-0.42, 0.675, 0)
  left.castShadow = true
  const right = left.clone()
  right.position.x = 0.42
  const beam = new THREE.Mesh(beamGeo, wood)
  beam.position.y = 1.22
  beam.castShadow = true
  group.add(left, right, beam)
  return group
}

export type CaveAdventurePropTemplates = {
  cart: THREE.Object3D
  support: THREE.Object3D
  crate: THREE.Object3D
  torchPost: THREE.Object3D
}

let templates: CaveAdventurePropTemplates | null = null
let templatesLoad: Promise<void> | null = null

/**
 * Loads support/crate/torch templates (cart via {@link preloadCartProp}).
 * Idempotent; safe to call from world boot before synchronous cave activation.
 *
 * @domain world-terrain
 */
export async function preloadCaveAdventurePropTemplates(): Promise<void> {
  if (templates) return
  if (templatesLoad) {
    await templatesLoad
    return
  }
  templatesLoad = (async () => {
    await preloadCartProp()
    const [support, crate, torchPost] = await Promise.all([
      loadPropOrFallback(SUPPORT_URL, CAVE_SUPPORT_FIT_MAX, createProceduralSupport, 'max'),
      loadPropOrFallback(CRATE_URL, CAVE_CRATE_TARGET_HEIGHT, () => createCrate(1)),
      loadPropOrFallback(VILLAGE_TORCH_URL, VILLAGE_TORCH_HEIGHT, createProceduralTorchPost),
    ])
    support.name = 'cave-adventure-prop-template:support'
    crate.name = 'cave-adventure-prop-template:crate'
    torchPost.name = 'cave-adventure-prop-template:torchPost'
    for (const root of [support, crate, torchPost]) markSharedGpu(root)
    const cart = createCartProp()
    cart.name = 'cave-adventure-prop-template:cart'
    templates = { cart, support, crate, torchPost }
  })()
  await templatesLoad
}

/**
 * Shared templates for synchronous clone-at-activation. Call
 * {@link preloadCaveAdventurePropTemplates} during boot first.
 *
 * @domain world-terrain
 */
export function getCaveAdventurePropTemplates(): CaveAdventurePropTemplates {
  if (!templates) {
    throw new Error('[caveAdventureProps] templates not preloaded — call preloadCaveAdventurePropTemplates() at boot')
  }
  return templates
}

function templateForKind(
  kind: CaveAdventurePropAssetKind,
  tpl: CaveAdventurePropTemplates,
): THREE.Object3D {
  switch (kind) {
    case 'cart': return tpl.cart
    case 'crate': return tpl.crate
    case 'lantern': return tpl.torchPost
    case 'support': return tpl.support
  }
}

function placePivotAtAnchor(
  pivot: THREE.Group,
  placement: CaveAdventurePropPlacement,
): void {
  pivot.position.set(placement.x, placement.y, placement.z)
  pivot.rotation.y = placement.yaw + placement.yawOffset
}

export type CreateCaveAdventurePropsGroupResult = {
  group: THREE.Group
  propCount: number
  lanternLightCount: number
}

/**
 * Builds one static props subtree from pre-resolved anchors. Pivot world
 * position is the semantic anchor x/y/z; prepared template root offsets stay
 * on the cloned child (see `prepareProp` / `preparePropFitMax`).
 *
 * @domain world-terrain
 */
export function createCaveAdventurePropsGroup(
  anchors: readonly CaveContentAnchor[],
  tpl: CaveAdventurePropTemplates = getCaveAdventurePropTemplates(),
  options: { lanternLights?: boolean } = {},
): CreateCaveAdventurePropsGroupResult {
  const presentationAnchors = presentationAnchorsFromContent(anchors)
  const group = new THREE.Group()
  group.name = CAVE_ADVENTURE_PROPS_GROUP_NAME

  const enableLights = options.lanternLights ?? true
  let lanternLightCount = 0

  for (const anchor of presentationAnchors) {
    const placement = adventurePropPlacementFromAnchor(anchor)
    const pivot = new THREE.Group()
    pivot.name = `cave-adventure-prop:${anchor.id}`
    placePivotAtAnchor(pivot, placement)

    if (placement.role === 'lantern') {
      const withLight = enableLights && lanternLightCount < CAVE_ADVENTURE_LANTERN_LIGHT_LIMIT
      if (withLight) {
        const post = tpl.torchPost.clone(true) as THREE.Object3D
        const torch = createVillageTorchLight(post)
        torch.setLit(true)
        pivot.add(torch.object)
        lanternLightCount++
      } else {
        pivot.add(tpl.torchPost.clone(true))
      }
    } else {
      const src = templateForKind(placement.assetKind, tpl)
      pivot.add(src.clone(true))
    }

    group.add(pivot)
  }

  return { group, propCount: presentationAnchors.length, lanternLightCount }
}

/** Test-only: reset module singleton between vitest cases. */
export function _resetCaveAdventurePropTemplatesForTests(): void {
  templates = null
  templatesLoad = null
}
