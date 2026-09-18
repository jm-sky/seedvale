import * as THREE from 'three'
import { isSystemEnabled } from '../debug/debugMode'
import { buildInstancedProps, type InstancedPropGroup, type PropPlacement } from '../render/instancedProps'
import { assignRenderLayer, REFLECTION_DISTANT_LAYER } from '../world/waterMirror'
import { type ChunkCoord, chunkKey, regionKey } from './chunkGrid'
import { DENSITY_LOD_FLOOR, densityLodFraction } from './distanceLod'

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

/** Stage 1 (world-terrain-040) per-kind LOD policy classes — `silhouette`/
 *  `medium` keep the shared `densityLodFraction` curve exactly; `detail`/
 *  `groundDetail` thin out faster in the partial/mid distance band since
 *  small vegetation contributes little to the silhouette read at distance. */
export type VegetationLodClass = 'silhouette' | 'medium' | 'detail' | 'groundDetail'

const KIND_LOD_CLASS: Record<VegetationKind, VegetationLodClass> = {
  'tree-living': 'silhouette',
  cactus: 'silhouette',
  largeRock: 'silhouette',
  fallenLog: 'medium',
  rockCluster: 'medium',
  bush: 'detail',
  reed: 'detail',
  lily: 'detail',
  fern: 'groundDetail',
  seaweed: 'groundDetail',
}

/** Multiplier applied to `densityLodFraction`'s output only in the partial/
 *  mid distance band (see `vegetationLodFraction`). `1` reproduces the
 *  shared curve unchanged; `detail`/`groundDetail` are ~0.55–0.60x / ~0.40x
 *  the mid-range fraction, per world-terrain-040 Stage 1's conservative
 *  target policy. */
const CLASS_MID_MULTIPLIER: Record<VegetationLodClass, number> = {
  silhouette: 1,
  medium: 1,
  detail: 0.58,
  groundDetail: 0.4,
}

/** Near-field breakpoint mirrored from `densityLodFraction`'s own `t <= 0.35`
 *  threshold (same convention `grassGeometryLodTier` uses) — kept as a
 *  literal here rather than a shared constant since the two curves are
 *  independent policies that merely happen to share a breakpoint today. */
const NEAR_FIELD_T = 0.35

/** Resolves `kind`'s effective LOD fraction for one contributing chunk
 *  (world-terrain-040 Stage 1). Distance-aware rather than derived from the
 *  final `densityLodFraction` value alone: near field (`t <= 0.35`) always
 *  returns the shared base fraction untouched — even under a `lodScale < 1`
 *  preset, where the near-field base is already below `1` — and the far
 *  floor (`DENSITY_LOD_FLOOR`) is likewise always returned untouched, so
 *  only the partial/mid band gets a per-class reduction. Never exceeds the
 *  shared base fraction and never drops below the shared floor. */
export function vegetationLodFraction(kind: VegetationKind, dist: number, radius: number, lodScale: number): number {
  const base = densityLodFraction(dist, radius, lodScale)
  const t = dist / Math.max(1, radius)
  if (t <= NEAR_FIELD_T || base <= DENSITY_LOD_FLOOR) return base
  const multiplier = CLASS_MID_MULTIPLIER[KIND_LOD_CLASS[kind]]
  return Math.max(DENSITY_LOD_FLOOR, base * multiplier)
}

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
  /** Reports `chunkCoord`'s current distance (Chebyshev chunk distance,
   *  `radius` is `config.loadRadius`, `lodScale` the active quality preset)
   *  to every kind it contributes to within its region. Resolves each kind's
   *  own effective fraction via `vegetationLodFraction` (world-terrain-040
   *  Stage 1) before storing it per region+kind for `maxFraction()`'s
   *  nearest-member-wins conservatism. */
  syncLod: (chunkCoord: ChunkCoord, dist: number, radius: number, lodScale: number) => void
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

/** Default `true` (mirror-visible) before any chunk has reported a value, and
 *  for an empty record — same "assume visible until told otherwise"
 *  convention as `maxFraction` defaulting to 1. Unlike the old buggy version,
 *  tracks whether any chunk actually contributed (mirrors `maxFraction`'s
 *  `any`), so the region only goes reflection-hidden once every contributing
 *  chunk has explicitly reported `false`. */
function anyReflectionVisible(rec: RegionKindRecord): boolean {
  let any = false
  for (const ck of rec.chunks.keys()) {
    any = true
    if (rec.chunkReflectionVisible.get(ck) ?? true) return true
  }
  return !any
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

  function syncLod(chunkCoord: ChunkCoord, dist: number, radius: number, lodScale: number): void {
    const ck = chunkKey(chunkCoord)
    const region = regionKey(chunkCoord, regionChunks)
    for (const kind of ALL_KINDS) {
      const key = tableKey(region, kind)
      const rec = table.get(key)
      if (!rec?.chunks.has(ck)) continue
      rec.chunkFractions.set(ck, vegetationLodFraction(kind, dist, radius, lodScale))
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
