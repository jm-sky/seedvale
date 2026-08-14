import {
  type AssetIndexEntry,
  basenameFromUrl,
  buildAssetIndex,
  mergeParkedManifest,
} from './assetIndex'
import megakitAuditRaw from './megakitAudit.generated.json'

/**
 * Construction semantics over the parked Medieval Village MegaKit (176 GLB,
 * `public/models/settlement/megakit/`), layered on top of `AssetIndex` — not a second
 * asset registry. Geometry facts (dimensions, symmetry, base-origin) come from
 * `scripts/audit-megakit.mjs`, which parses each GLB's required POSITION accessor
 * `min`/`max` (no vertex-buffer decode) into `megakitAudit.generated.json`. See
 * docs/reviews/2026-08-14--009--megakit-construction-audit.md for the full audit.
 *
 * Does not implement a HouseBuilder. This module only answers: what construction
 * parts exist, their measured dimensions, whether they snap on the kit's ~2 m grid,
 * and their face-midpoint connection anchors.
 */

export type ConstructionPartKind =
  | 'wall'
  | 'door'
  | 'window'
  | 'floor'
  | 'roof'
  | 'corner'
  | 'opening'
  | 'decoration'

export type ConstructionAnchorSide = 'left' | 'right' | 'front' | 'back' | 'top' | 'bottom'

export type ConstructionAnchor = {
  side: ConstructionAnchorSide
  /** Meters, native GLB space (matches `prepare: { mode: 'none' }`) — face midpoint of the measured AABB. */
  position: { x: number, y: number, z: number }
}

export type ConstructionModule = {
  /** Local axis the connection module runs along. Null when the part isn't grid-modular. */
  axis: 'x' | 'z' | null
  /** Module size in meters along that axis (e.g. 2 for MegaKit walls/floor). Null when not modular. */
  size: number | null
}

export type ConstructionPart = {
  assetId: string
  url: string
  kind: ConstructionPartKind
  /** Basename with the measured `kind` prefix stripped, e.g. `plaster_door_flat`. Mechanical, not curated. */
  variant: string
  materials: readonly string[]
  /** Native world-space AABB size in meters — measured, not authored/prepared. */
  dimensions: { x: number, y: number, z: number }
  module: ConstructionModule
  anchors: readonly ConstructionAnchor[]
  /**
   * False when the part's local origin isn't centered-on-footprint + floor-based the way
   * most of the kit is (door leaves, window inserts, shutters, doorframes, most roof pieces,
   * some corner posts). Those parts still have face-midpoint anchors, but a `HouseBuilder`
   * cannot snap them by simple module-width translation — placement needs asset-specific
   * offsets. See the audit report §5 for which kinds this affects and why.
   */
  gridReliable: boolean
}

export type ConstructionCatalog = {
  parts: readonly ConstructionPart[]
  byKind: ReadonlyMap<ConstructionPartKind, readonly ConstructionPart[]>
  byAssetId: ReadonlyMap<string, ConstructionPart>
}

type MegakitAuditEntry = {
  dimensions: [number, number, number]
  min: [number, number, number]
  max: [number, number, number]
  materials: readonly string[]
  symmetricX: boolean
  symmetricZ: boolean
  originAtBaseY: boolean
}

const megakitAudit = megakitAuditRaw as unknown as Record<string, MegakitAuditEntry>

const MEGAKIT_URL_PREFIX = '/models/settlement/megakit/'

/** MegaKit `kind` (from `assetIndex.ts` filename prefixes) → construction category. Unlisted kinds are `decoration`. */
const KIND_TO_CONSTRUCTION: Readonly<Record<string, ConstructionPartKind>> = {
  wall: 'wall',
  roof: 'roof',
  floor: 'floor',
  corner: 'corner',
  door: 'door',
  window: 'window',
  windowshutters: 'window',
  doorframe: 'opening',
}

function constructionKindOf(megakitKind: string | undefined): ConstructionPartKind {
  if (!megakitKind) return 'decoration'
  return KIND_TO_CONSTRUCTION[megakitKind] ?? 'decoration'
}

function variantOf(basename: string, megakitKind: string | undefined): string {
  if (!megakitKind || basename === megakitKind) return basename
  const prefix = `${megakitKind}_`
  return basename.startsWith(prefix) ? basename.slice(prefix.length) : basename
}

/** Module sizes actually observed in the kit (floor half-tiles, full walls/floor tiles). */
const MODULE_CANDIDATES_M = [1, 2] as const
const MODULE_TOLERANCE_M = 0.05

/**
 * Module size only depends on the measured span (a half-tile like `floor_wooddark_half1`
 * is a real 1 m module even though its origin sits flush at one edge, not centered — see
 * `isGridReliable` for the separate "can a builder snap this by simple translation" check).
 */
function detectModule(
  kind: ConstructionPartKind,
  dimensions: { x: number, y: number, z: number },
): ConstructionModule {
  if (kind !== 'wall' && kind !== 'floor' && kind !== 'corner') return { axis: null, size: null }
  const nearest = MODULE_CANDIDATES_M.find((m) => Math.abs(dimensions.x - m) < MODULE_TOLERANCE_M)
  return nearest ? { axis: 'x', size: nearest } : { axis: null, size: null }
}

/**
 * Grid-snappable by simple module-width translation. Walls/floor/corner need a centered X
 * footprint anchored at floor level (y=0); roof sits at wall-top height so only footprint
 * centering is required. Everything else (door leaves, window inserts, doorframes, most
 * roof caps, decoration) needs asset-specific placement — see module doc comment.
 */
function isGridReliable(kind: ConstructionPartKind, audit: MegakitAuditEntry): boolean {
  switch (kind) {
    case 'corner':
    case 'floor':
    case 'wall':
      return audit.symmetricX && audit.originAtBaseY
    case 'roof':
      return audit.symmetricX
    default:
      return false
  }
}

function faceAnchors(min: readonly [number, number, number], max: readonly [number, number, number]): ConstructionAnchor[] {
  const center = { x: (min[0] + max[0]) / 2, y: (min[1] + max[1]) / 2, z: (min[2] + max[2]) / 2 }
  return [
    { side: 'left', position: { x: min[0], y: center.y, z: center.z } },
    { side: 'right', position: { x: max[0], y: center.y, z: center.z } },
    { side: 'front', position: { x: center.x, y: center.y, z: min[2] } },
    { side: 'back', position: { x: center.x, y: center.y, z: max[2] } },
    { side: 'top', position: { x: center.x, y: max[1], z: center.z } },
    { side: 'bottom', position: { x: center.x, y: min[1], z: center.z } },
  ]
}

/** The full MegaKit file list, sourced from the audit data — no fs/network I/O, works in browser + Node. */
export function megakitUrls(): string[] {
  return Object.keys(megakitAudit).map((name) => `${MEGAKIT_URL_PREFIX}${name}.glb`)
}

/**
 * `buildConstructionCatalog(assetIndex)` — layers construction semantics over the index.
 * Parked MegaKit entries are produced via `mergeParkedManifest` (same convention plan 107
 * uses for the Asset Browser), sourced from the audit data rather than a live manifest
 * fetch, so this is import-safe in the browser bundle and in tests without I/O.
 */
export function buildConstructionCatalog(
  wired: readonly AssetIndexEntry[] = buildAssetIndex(),
): ConstructionCatalog {
  const merged = mergeParkedManifest(wired, megakitUrls())
  const parts: ConstructionPart[] = []

  for (const entry of merged) {
    if (entry.pack !== 'megakit') continue
    const name = basenameFromUrl(entry.url)
    const audit = megakitAudit[name]
    if (!audit) continue

    const kind = constructionKindOf(entry.kind)
    const dimensions = { x: audit.dimensions[0], y: audit.dimensions[1], z: audit.dimensions[2] }

    parts.push({
      assetId: entry.id,
      url: entry.url,
      kind,
      variant: variantOf(name, entry.kind),
      materials: audit.materials,
      dimensions,
      module: detectModule(kind, dimensions),
      anchors: faceAnchors(audit.min, audit.max),
      gridReliable: isGridReliable(kind, audit),
    })
  }

  const byKind = new Map<ConstructionPartKind, ConstructionPart[]>()
  for (const part of parts) {
    const bucket = byKind.get(part.kind)
    if (bucket) bucket.push(part)
    else byKind.set(part.kind, [part])
  }

  return {
    parts,
    byKind,
    byAssetId: new Map(parts.map((p) => [p.assetId, p])),
  }
}

/**
 * Minimal, geometry-derived connectivity — not a per-pair ontology for 176 models.
 * Each rule is checked against the catalog by `constructionCatalog.test.ts`.
 */
export type ConstructionRule = {
  id: string
  description: string
}

export const CONSTRUCTION_RULES: readonly ConstructionRule[] = [
  {
    id: 'wall-wall-module',
    description: 'Any two `wall` parts with the same detected X module (2 m) connect end to end via their left/right anchors.',
  },
  {
    id: 'wall-door-requires-leaf-and-frame',
    description: 'A `wall` part whose variant contains "door" needs a `door` (leaf) part and an `opening` (doorframe) part to complete an entrance; the wall opening is pre-cut, not derived.',
  },
  {
    id: 'wall-window-requires-insert',
    description: 'A `wall` part whose variant contains "window" needs a `window` part (insert); matching `window` (shutters) parts are optional decoration.',
  },
  {
    id: 'floor-floor-module',
    description: 'Any two `floor` parts with the same detected X module (2 m, or 1 m half-tiles) tile edge to edge via their left/right anchors.',
  },
  {
    id: 'floor-wall-base',
    description: '`floor` (module 2) and `wall` (module 2) share the same X module and both have `originAtBaseY`, so a wall\'s bottom anchor sits on a floor tile\'s top face at y=0.',
  },
  {
    id: 'roof-wooden-2x1-family',
    description: 'Roof parts whose variant starts with "wooden_2x1" (straight/left/right/corner/middle/center) are a small modular sub-kit; the other 34 roof files are single pre-sized caps named by target footprint (e.g. `roundtiles_4x4`), not modular pieces.',
  },
  {
    id: 'corner-is-a-post-not-an-l-wall',
    description: '`corner` parts have no 2 m module (footprint 0.09–0.7 m) — MegaKit has no L-shaped 2×2 corner wall mesh. A house corner is either a corner post abutting two walls, or two `wall_*_l`/`_r` mitred wall variants meeting directly.',
  },
] as const
