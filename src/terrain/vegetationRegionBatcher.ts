import * as THREE from 'three'
import { isSystemEnabled } from '../debug/debugMode'
import { buildInstancedProps, type InstancedPropGroup, type PropPlacement } from '../render/instancedProps'
import { assignRenderLayer, REFLECTION_DISTANT_LAYER } from '../world/waterMirror'
import { type ChunkCoord, chunkKey, regionKey } from './chunkGrid'

/** Prop kinds batched by this module — mirrors the kinds `chunkManager.ts`'s
 *  `attachChunkContent` builds via `buildInstancedProps` (plan 143). */
export type VegetationKind =
  | 'tree-living'
  | 'bush'
  | 'cactus'
  | 'reed'
  | 'fern'
  | 'lily'
  | 'seaweed'
  | 'largeRock'
  | 'rockCluster'
  | 'fallenLog'

const ALL_KINDS: readonly VegetationKind[] = [
  'tree-living',
  'bush',
  'cactus',
  'reed',
  'fern',
  'lily',
  'seaweed',
  'largeRock',
  'rockCluster',
  'fallenLog',
]

const VEGETATION_KINDS = new Set<VegetationKind>(['bush', 'cactus', 'fern', 'lily', 'reed', 'seaweed', 'tree-living'])

/** `sceneCensus.ts`'s `classifyObject` buckets purely by `Object3D.name`
 *  prefix (`chunk-vegetation`/`chunk-environment`) — keep that working for
 *  region groups too, so perf tooling doesn't silently dump every batched
 *  prop into "other" once chunk-scoped names disappear. */
function groupNamePrefix(kind: VegetationKind): string {
  return VEGETATION_KINDS.has(kind) ? 'chunk-vegetation' : 'chunk-environment'
}

/** Region size in chunks (3×3 ≈ 192 m at the default 64 m chunk size) — start
 *  value from research 020 §4, tune only after benchmarking (plan 143). */
export const REGION_CHUNKS = 3

type ChunkContribution = {
  templates: readonly THREE.Object3D[]
  /** Mutable, region-owned copy — `removeByKey` prunes a chopped tree's
   *  placement here so a later rebuild (triggered by a sibling chunk load/
   *  unload) doesn't resurrect it from source placements. */
  placements: PropPlacement[]
}

type RegionKindRecord = {
  chunks: Map<string, ChunkContribution>
  /** Last LOD fraction reported per contributing chunk (`syncLod`) — the
   *  applied fraction is the max across all of them ("nearest member wins",
   *  conservative: never under-renders a close chunk sharing this region
   *  with a farther one, see research 020 §4). */
  chunkFractions: Map<string, number>
  /** Last reflection-visibility flag reported per contributing chunk
   *  (`syncReflectionVisibility`, plan 144 S) — same "nearest member wins"
   *  rule as `chunkFractions`: the region stays mirror-visible as long as any
   *  contributing chunk is within the reflection budget. */
  chunkReflectionVisible: Map<string, boolean>
  group?: InstancedPropGroup
}

export type VegetationRegionBatcher = {
  /** Stores `chunkCoord`'s contribution for `kind` and rebuilds the owning
   *  region+kind's `InstancedPropGroup` from the union of all its currently
   *  loaded member chunks. Call only when `placements` is non-empty (mirrors
   *  `buildInstancedProps`'s empty-list convention — an empty call would just
   *  be a wasted rebuild). */
  setChunkPlacements: (
    chunkCoord: ChunkCoord,
    kind: VegetationKind,
    templates: readonly THREE.Object3D[],
    placements: readonly PropPlacement[],
  ) => void
  /** Removes `chunkCoord`'s contribution from every kind of its owning
   *  region and rebuilds each affected region+kind (or disposes it if it
   *  becomes empty). Must run synchronously inside chunk `unload()`. */
  clearChunkPlacements: (chunkCoord: ChunkCoord) => void
  /** Redirect for `refreshTreeVisual`'s chop/regrow — always targets the
   *  `tree-living` kind of `chunkCoord`'s region, the only kind that ever
   *  carries a placement `key`. */
  removeByKey: (chunkCoord: ChunkCoord, key: string) => boolean
  /** Reports `chunkCoord`'s current distance-based LOD fraction to every
   *  kind it contributes to within its region. */
  syncLod: (chunkCoord: ChunkCoord, fraction: number) => void
  /** Reports `chunkCoord`'s current reflection visibility (plan 144 S) to
   *  every kind it contributes to within its region. */
  syncReflectionVisibility: (chunkCoord: ChunkCoord, visible: boolean) => void
  dispose: () => void
}

function tableKey(region: string, kind: VegetationKind): string {
  return `${region}|${kind}`
}

function maxFraction(rec: RegionKindRecord): number {
  let frac = 0
  let any = false
  for (const ck of rec.chunks.keys()) {
    any = true
    const f = rec.chunkFractions.get(ck) ?? 1
    if (f > frac) frac = f
  }
  return any ? frac : 1
}

/** Default `true` (mirror-visible) before any chunk has reported a distance
 *  — same "assume visible until told otherwise" convention as `maxFraction`
 *  defaulting to 1. */
function anyReflectionVisible(rec: RegionKindRecord): boolean {
  for (const ck of rec.chunks.keys()) {
    if (rec.chunkReflectionVisible.get(ck) ?? true) return true
  }
  return true
}

export function createVegetationRegionBatcher(
  scene: THREE.Scene,
  regionChunks: number = REGION_CHUNKS,
): VegetationRegionBatcher {
  const table = new Map<string, RegionKindRecord>()

  /** `trees` debug isolation toggle (`debug/debugMode.ts`) hides living trees
   *  without touching their data — same "checked once at attach/rebuild time,
   *  not reactive" contract the old per-chunk code had (`isSystemEnabled`
   *  gated only `scene.add`, never `buildInstancedProps`/registration), so
   *  chop/regrow logic (`removeByKey`) keeps working even while hidden. */
  function rebuild(key: string, kind: VegetationKind): void {
    const rec = table.get(key)
    if (!rec) return
    rec.group?.dispose()
    rec.group = undefined
    if (rec.chunks.size === 0) {
      table.delete(key)
      return
    }
    const templates = rec.chunks.values().next().value!.templates
    const placements: PropPlacement[] = []
    for (const contribution of rec.chunks.values()) placements.push(...contribution.placements)
    const built = buildInstancedProps(templates, placements, `${groupNamePrefix(kind)}-region-${key}`)
    if (!built) return
    if (kind !== 'tree-living' || isSystemEnabled('trees')) scene.add(built.group)
    rec.group = built
    built.setLodFraction(maxFraction(rec))
    assignRenderLayer(built.group, anyReflectionVisible(rec) ? 0 : REFLECTION_DISTANT_LAYER)
  }

  function setChunkPlacements(
    chunkCoord: ChunkCoord,
    kind: VegetationKind,
    templates: readonly THREE.Object3D[],
    placements: readonly PropPlacement[],
  ): void {
    const key = tableKey(regionKey(chunkCoord, regionChunks), kind)
    let rec = table.get(key)
    if (!rec) {
      rec = { chunks: new Map(), chunkFractions: new Map(), chunkReflectionVisible: new Map() }
      table.set(key, rec)
    }
    rec.chunks.set(chunkKey(chunkCoord), { templates, placements: [...placements] })
    rebuild(key, kind)
  }

  function clearChunkPlacements(chunkCoord: ChunkCoord): void {
    const ck = chunkKey(chunkCoord)
    const region = regionKey(chunkCoord, regionChunks)
    for (const kind of ALL_KINDS) {
      const key = tableKey(region, kind)
      const rec = table.get(key)
      if (!rec?.chunks.has(ck)) continue
      rec.chunks.delete(ck)
      rec.chunkFractions.delete(ck)
      rec.chunkReflectionVisible.delete(ck)
      rebuild(key, kind)
    }
  }

  function removeByKey(chunkCoord: ChunkCoord, key: string): boolean {
    const tKey = tableKey(regionKey(chunkCoord, regionChunks), 'tree-living')
    const rec = table.get(tKey)
    if (!rec) return false
    for (const contribution of rec.chunks.values()) {
      const idx = contribution.placements.findIndex((p) => p.key === key)
      if (idx === -1) continue
      contribution.placements.splice(idx, 1)
      return rec.group?.removeByKey(key) ?? false
    }
    return false
  }

  function syncLod(chunkCoord: ChunkCoord, fraction: number): void {
    const ck = chunkKey(chunkCoord)
    const region = regionKey(chunkCoord, regionChunks)
    for (const kind of ALL_KINDS) {
      const key = tableKey(region, kind)
      const rec = table.get(key)
      if (!rec?.chunks.has(ck)) continue
      rec.chunkFractions.set(ck, fraction)
      rec.group?.setLodFraction(maxFraction(rec))
    }
  }

  function syncReflectionVisibility(chunkCoord: ChunkCoord, visible: boolean): void {
    const ck = chunkKey(chunkCoord)
    const region = regionKey(chunkCoord, regionChunks)
    for (const kind of ALL_KINDS) {
      const key = tableKey(region, kind)
      const rec = table.get(key)
      if (!rec?.chunks.has(ck)) continue
      rec.chunkReflectionVisible.set(ck, visible)
      if (rec.group) assignRenderLayer(rec.group.group, anyReflectionVisible(rec) ? 0 : REFLECTION_DISTANT_LAYER)
    }
  }

  function dispose(): void {
    for (const rec of table.values()) rec.group?.dispose()
    table.clear()
  }

  return { setChunkPlacements, clearChunkPlacements, removeByKey, syncLod, syncReflectionVisibility, dispose }
}
