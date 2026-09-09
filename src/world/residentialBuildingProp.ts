import { BoxGeometry, Group, Mesh, MeshStandardMaterial, type Object3D } from 'three'
import { disposeObject3D } from '../assets/loadGltf'
import {
  residentialBuildingDefinition,
  type ResidentialBuildingKind,
  type ResidentialBuildingStage,
} from './residentialBuilding'

const STAGE_HEIGHT: Record<ResidentialBuildingStage, number> = {
  foundation: 0.28,
  structure: 2.15,
  roof: 3.35,
  completed: 3.55,
}

const STAGE_COLOR: Record<ResidentialBuildingStage, number> = {
  foundation: 0x8a8680,
  structure: 0x7a5a3a,
  roof: 0x5c4030,
  completed: 0x6b5340,
}

/** Immediate procedural stand-in while MegaKit templates load, and a
 *  permanent fallback when HouseBuilder assets are unavailable. Discrete
 *  per stage — never morphed by work percentage. */
export function createResidentialBuildingPlaceholder(
  kind: ResidentialBuildingKind,
  stage: ResidentialBuildingStage,
): Group {
  const { width, depth } = residentialBuildingDefinition(kind).footprint
  const height = STAGE_HEIGHT[stage]
  const group = new Group()
  group.name = `residential-placeholder:${kind}:${stage}`
  const mesh = new Mesh(
    new BoxGeometry(width, height, depth),
    new MeshStandardMaterial({ color: STAGE_COLOR[stage], roughness: 0.92, flatShading: true }),
  )
  mesh.position.y = height / 2
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)
  return group
}

export function disposeResidentialBuildingProp(prop: Object3D): void {
  prop.removeFromParent()
  disposeObject3D(prop)
}
