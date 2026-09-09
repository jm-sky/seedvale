import { type Object3D, type Scene } from 'three'
import type { HeightSampler } from '../player/PlayerController'
import type { Collider } from './collision'
import { buildConstructionCatalog } from '../assets/constructionCatalog'
import {
  buildHouse,
  type HouseBuildContext,
  houseDefinitionAssetIdsForStage,
  loadHousePartTemplates,
} from '../settlement/houseBuilder'
import { placeOnGround } from '../settlement/props'
import {
  applyResidentialBuildingWork,
  createUnfinishedResidentialBuildingRecord,
  isResidentialBuildingComplete,
  residentialBuildingDefinition,
  type ResidentialBuildingKind,
  type ResidentialBuildingRecord,
  type ResidentialOwner,
  supplyResidentialStageMaterials,
} from './residentialBuilding'
import { createResidentialBuildingPlaceholder, disposeResidentialBuildingProp } from './residentialBuildingProp'

export type ResidentialBuildingEntry = ResidentialBuildingRecord & { mesh: Object3D }

export type ResidentialBuildings = {
  list: () => readonly ResidentialBuildingEntry[]
  nodes: () => readonly ResidentialBuildingRecord[]
  find: (id: string) => ResidentialBuildingEntry | undefined
  /** Places a new unfinished Player-owned house. The caller owns site
   *  validation; this only creates the record + runtime representation. */
  place: (kind: ResidentialBuildingKind, x: number, z: number, yaw: number, settlementId?: string | null) => ResidentialBuildingRecord
  /** Marks the current work-bearing stage as material-supplied. The caller
   *  must already have consumed those materials. */
  supplyMaterials: (id: string) => boolean
  contributeWork: (id: string, workAmount: number) => { acceptedWork: number, completed: boolean } | null
  /** Removes an unfinished house. Completed homes are non-removable. */
  remove: (id: string) => ResidentialBuildingRecord | null
  dispose: () => void
}

const colliderKey = (id: string): string => `residential:${id}`

let nextResidentialId = 0
let sharedBuilder: Promise<HouseBuildContext | null> | null = null

function builderContext(): Promise<HouseBuildContext | null> {
  if (!sharedBuilder) {
    sharedBuilder = (async () => {
      const catalog = buildConstructionCatalog()
      const assetIds = [
        ...houseDefinitionAssetIdsForStage(residentialBuildingDefinition('small_house').houseDefinition, 'completed', false),
        ...houseDefinitionAssetIdsForStage(residentialBuildingDefinition('medium_house').houseDefinition, 'completed', false),
      ]
      const templates = await loadHousePartTemplates(catalog, assetIds)
      return { catalog, templates }
    })().catch((err) => {
      console.warn('[residential] HouseBuilder assets unavailable — using placeholders', err)
      return null
    })
  }
  return sharedBuilder
}

function toRecord(entry: ResidentialBuildingEntry): ResidentialBuildingRecord {
  const { mesh: _mesh, ...record } = entry
  return record
}

/**
 * Player-built residential houses (plan settlements-005) — same persistent
 * record + runtime mesh split as `createPalisades`. Authoritative progress
 * lives on the record; the mesh is a discrete projection of `stage`.
 *
 * @domain settlements
 */
export function createResidentialBuildings(
  scene: Scene,
  sampleHeight: HeightSampler,
  registerColliders: (ownerKey: string, colliders: readonly Collider[]) => void,
  clearColliders: (ownerKey: string) => void,
  initial: readonly ResidentialBuildingRecord[] = [],
): ResidentialBuildings {
  const buildings: ResidentialBuildingEntry[] = []
  let disposed = false

  const registerCollider = (record: ResidentialBuildingRecord): void => {
    const { width, depth } = residentialBuildingDefinition(record.kind).footprint
    registerColliders(colliderKey(record.id), [{
      type: 'obb',
      x: record.x,
      z: record.z,
      halfWidth: width / 2,
      halfDepth: depth / 2,
      rotationY: record.yaw,
    }])
  }

  const attachMesh = (entry: ResidentialBuildingEntry, mesh: Object3D): void => {
    mesh.rotation.y = entry.yaw
    placeOnGround(mesh, entry.x, entry.z, sampleHeight)
    scene.add(mesh)
    entry.mesh = mesh
  }

  const trySwapHouseBuilderMesh = (entry: ResidentialBuildingEntry, ctx: HouseBuildContext): void => {
    const def = residentialBuildingDefinition(entry.kind).houseDefinition
    try {
      const assembly = buildHouse(def, ctx, {
        visualStage: entry.stage,
        includeFurniture: false,
      })
      disposeResidentialBuildingProp(entry.mesh)
      attachMesh(entry, assembly.root)
    } catch (err) {
      console.warn('[residential] HouseBuilder stage mesh failed — keeping placeholder', err)
    }
  }

  const spawn = (record: ResidentialBuildingRecord): ResidentialBuildingEntry => {
    const mesh = createResidentialBuildingPlaceholder(record.kind, record.stage)
    const entry: ResidentialBuildingEntry = { ...record, mesh }
    attachMesh(entry, mesh)
    registerCollider(record)
    buildings.push(entry)
    void builderContext().then((ctx) => {
      if (disposed || !ctx) return
      if (!buildings.includes(entry)) return
      trySwapHouseBuilderMesh(entry, ctx)
    })
    return entry
  }

  const rebuildVisual = (entry: ResidentialBuildingEntry): void => {
    disposeResidentialBuildingProp(entry.mesh)
    attachMesh(entry, createResidentialBuildingPlaceholder(entry.kind, entry.stage))
    void builderContext().then((ctx) => {
      if (disposed || !ctx) return
      if (!buildings.includes(entry)) return
      trySwapHouseBuilderMesh(entry, ctx)
    })
  }

  const applyRecord = (entry: ResidentialBuildingEntry, next: ResidentialBuildingRecord): void => {
    const stageChanged = entry.stage !== next.stage
    entry.kind = next.kind
    entry.x = next.x
    entry.z = next.z
    entry.yaw = next.yaw
    entry.stage = next.stage
    entry.stageWorkProgress = next.stageWorkProgress
    entry.materialsSupplied = next.materialsSupplied
    entry.owner = next.owner
    entry.settlementId = next.settlementId
    entry.homePlaceId = next.homePlaceId
    if (stageChanged) rebuildVisual(entry)
  }

  for (const record of initial) spawn(record)

  return {
    list: () => buildings,
    nodes: () => buildings.map(toRecord),
    find: (id) => buildings.find((entry) => entry.id === id),
    place(kind, x, z, yaw, settlementId = null) {
      const record = createUnfinishedResidentialBuildingRecord({
        id: `residential:${Date.now()}:${nextResidentialId++}`,
        kind,
        x,
        z,
        yaw,
        owner: { kind: 'player' } satisfies ResidentialOwner,
        settlementId,
      })
      spawn(record)
      return record
    },
    supplyMaterials(id) {
      const entry = buildings.find((e) => e.id === id)
      if (!entry) return false
      const next = supplyResidentialStageMaterials(toRecord(entry))
      if (!next) return false
      applyRecord(entry, next)
      return true
    },
    contributeWork(id, workAmount) {
      const entry = buildings.find((e) => e.id === id)
      if (!entry) return null
      const result = applyResidentialBuildingWork(toRecord(entry), workAmount)
      applyRecord(entry, result.next)
      return { acceptedWork: result.acceptedWork, completed: result.completed }
    },
    remove(id) {
      const index = buildings.findIndex((entry) => entry.id === id)
      if (index === -1) return null
      const entry = buildings[index]!
      if (isResidentialBuildingComplete(entry)) return null
      buildings.splice(index, 1)
      disposeResidentialBuildingProp(entry.mesh)
      clearColliders(colliderKey(entry.id))
      return toRecord(entry)
    },
    dispose() {
      disposed = true
      for (const entry of buildings) {
        disposeResidentialBuildingProp(entry.mesh)
        clearColliders(colliderKey(entry.id))
      }
      buildings.length = 0
    },
  }
}
