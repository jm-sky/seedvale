import type { AssetAnchorDef } from './assetAnchors'
import { parkedIdFromUrl } from './assetUrlUtils'

export { parkedIdFromUrl } from './assetUrlUtils'
import { NPC_HEIGHT, NPC_MODEL_URLS } from '../ai/NpcAgent'
import { ANIMAL_DEFS } from '../fauna/AnimalAgent'
import { FAUNA_URLS } from '../fauna/createFauna'
import { HELD_GLB } from '../items/heldToolVisual'
import { ITEM_GLB_SPECS } from '../items/itemModels'
import { PLAYER_HEIGHT, PLAYER_MODEL_URL } from '../player/PlayerController'
import { BRANCH_HELD_MAX, BRANCH_URL } from '../player/torchLightPresets'
import { HOUSE_CATALOG } from '../settlement/houseCatalog'
import { LIVESTOCK_URLS } from '../settlement/livestock'
import {
  BUSH_SPECS,
  CACTUS_SPECS,
  CAMPFIRE_FIT_MAX,
  CAMPFIRE_UNLIT_URL,
  CEMETERY_SPECS,
  CROPS_FIT_MAX,
  CROPS_URL,
  DOCK_SPECS,
  FALLEN_LOG_SPECS,
  FARM_HEIGHT,
  FARM_URL,
  FIRE_FX_URL,
  GRAVE_SPECS,
  LANTERN_FLOOR_MAX,
  LANTERN_URL,
  LANTERN_WALL_MAX,
  REED_SPECS,
  RESOURCE_GOLD_SPECS,
  RESOURCE_ROCK_SPECS,
  ROCK_CLUSTER_SPECS,
  ROCK_SPECS,
  TREE_SPECS,
  VILLAGE_TORCH_HEIGHT,
  VILLAGE_TORCH_URL,
  WALL_URL,
  WELL_HEIGHT,
  WELL_URL,
  WOOD_PILE_HEIGHT,
  WOOD_PILE_URL,
} from '../settlement/propSpecs'
import { anchorsForAsset } from './assetAnchorData'

export type AssetPrepare =
  | { mode: 'height', value: number }
  | { mode: 'fitMax', value: number }
  | { mode: 'none' }

export type AssetIndexGroup =
  | 'character'
  | 'npc'
  | 'fauna'
  | 'item'
  | 'held'
  | 'house'
  | 'settlement'
  | 'nature'
  | 'fx'
  | 'other'

export type AssetIndexStatus = 'wired' | 'parked' | 'extra'

export type AssetIndexEntry = {
  id: string
  url: string
  label: string
  group: AssetIndexGroup
  prepare: AssetPrepare
  skinned: boolean
  anchors: readonly AssetAnchorDef[]
  /** Present on every built entry. Wired = game registry; parked = disk-only. */
  status?: AssetIndexStatus
  /** Path segment (e.g. `megakit`, `nature`, `settlement`). */
  pack?: string
  /** Light MegaKit role from filename (`wall`, `roof`, …) — not a global ontology. */
  kind?: string
}

const WAGON_URL = '/models/settlement/megakit/wagon.glb'
const WAGON_FIT_MAX = 3.8

/** Filename prefixes from `public/models/settlement/megakit/README.md` — longest first. */
const MEGAKIT_KIND_PREFIXES = [
  'windowshutters',
  'doorframe',
  'overhang',
  'holecover',
  'balcony',
  'chimney',
  'support',
  'stairs',
  'stair',
  'window',
  'border',
  'corner',
  'fence',
  'floor',
  'crate',
  'wagon',
  'vine',
  'roof',
  'wall',
  'door',
] as const

export function basenameFromUrl(url: string): string {
  const parts = url.split('/')
  const file = parts[parts.length - 1] ?? url
  return file.replace(/\.glb$/i, '')
}

export function packFromUrl(url: string): string | undefined {
  const parts = url.replace(/^\//, '').split('/').filter(Boolean)
  // `/models/settlement/megakit/foo.glb` → models, settlement, megakit, foo.glb
  if (parts[0] !== 'models' || parts.length < 3) return undefined
  if (parts.length >= 4) return parts[parts.length - 2]
  return parts[1]
}

export function kindFromBasename(name: string): string | undefined {
  const n = name.toLowerCase()
  for (const prefix of MEGAKIT_KIND_PREFIXES) {
    if (n === prefix || n.startsWith(`${prefix}_`)) return prefix
  }
  return undefined
}

export function groupFromModelUrl(url: string): AssetIndexGroup {
  const folder = url.replace(/^\/models\//, '').split('/')[0]
  switch (folder) {
    case 'characters': return 'character'
    case 'fauna': return 'fauna'
    case 'fx': return 'fx'
    case 'items': return 'item'
    case 'nature': return 'nature'
    case 'npc': return 'npc'
    case 'settlement': return 'settlement'
    case 'world': return 'other'
    default: return 'other'
  }
}

function decorateEntry(entry: AssetIndexEntry): AssetIndexEntry {
  const pack = entry.pack ?? packFromUrl(entry.url)
  const kind = entry.kind ?? (pack === 'megakit' ? kindFromBasename(basenameFromUrl(entry.url)) : undefined)
  return {
    ...entry,
    status: entry.status ?? 'wired',
    pack,
    kind,
  }
}

export function formatAssetLabel(entry: AssetIndexEntry): string {
  if (entry.status === 'parked') return `${entry.label} [parked]`
  return entry.label
}

export function assetEntryMatchesQuery(entry: AssetIndexEntry, queryLower: string): boolean {
  const hay = [
    entry.id,
    entry.label,
    entry.url,
    entry.group,
    entry.status ?? '',
    entry.pack ?? '',
    entry.kind ?? '',
  ].join(' ').toLowerCase()
  return hay.includes(queryLower)
}

export function filterAssetIndex(
  entries: readonly AssetIndexEntry[],
  query: string,
): AssetIndexEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...entries]
  return entries.filter((e) => assetEntryMatchesQuery(e, q))
}

export function customUrlEntry(url: string): AssetIndexEntry {
  const name = basenameFromUrl(url)
  const pack = packFromUrl(url)
  return {
    id: 'custom:url',
    url,
    label: url,
    group: groupFromModelUrl(url),
    prepare: { mode: 'none' },
    skinned: false,
    anchors: [],
    status: 'parked',
    pack,
    kind: pack === 'megakit' ? kindFromBasename(name) : undefined,
  }
}

/** Prefer a known index row (wired or parked); otherwise authored-scale custom URL. */
export function resolveLoadEntry(
  index: readonly AssetIndexEntry[],
  opts: { id?: string | null, url?: string | null },
): AssetIndexEntry | null {
  const url = opts.url?.trim()
  if (url) return entryFromUrl(url, index) ?? customUrlEntry(url)
  const id = opts.id?.trim()
  if (id) return findAssetEntry(id, index) ?? null
  return null
}

export function makeParkedEntry(url: string): AssetIndexEntry {
  const name = basenameFromUrl(url)
  const pack = packFromUrl(url)
  return {
    id: parkedIdFromUrl(url),
    url,
    label: name,
    group: groupFromModelUrl(url),
    prepare: { mode: 'none' },
    skinned: false,
    anchors: [],
    status: 'parked',
    pack,
    kind: pack === 'megakit' ? kindFromBasename(name) : undefined,
  }
}

/** Append disk-only GLBs from the asset-browser manifest. Skip URLs already wired. */
export function mergeParkedManifest(
  wired: readonly AssetIndexEntry[],
  files: readonly string[],
): AssetIndexEntry[] {
  const seenUrls = new Set(wired.map((e) => e.url))
  const seenIds = new Set(wired.map((e) => e.id))
  const out = wired.map(decorateEntry)
  for (const url of files) {
    if (!url.endsWith('.glb') || seenUrls.has(url)) continue
    const parked = makeParkedEntry(url)
    if (seenIds.has(parked.id)) continue
    seenUrls.add(url)
    seenIds.add(parked.id)
    out.push(parked)
  }
  return out
}

function pushHeldSpecs(out: AssetIndexEntry[]): void {
  const seen = new Set(out.map((e) => e.id))

  for (const [kind, spec] of Object.entries(HELD_GLB)) {
    if (!spec) continue
    const id = `held:${kind}`
    if (seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      url: spec.url,
      label: `${kind} (held)`,
      group: 'held',
      prepare: { mode: 'fitMax', value: spec.maxSize },
      skinned: false,
      anchors: anchorsForAsset(id),
    })
  }

  /** Browser-only held pose — roadmap / decorative tools not yet in `HELD_GLB`. */
  const browserHeld: Array<{ id: string, url: string, label: string, maxSize: number }> = [
    { id: 'held:branch', url: BRANCH_URL, label: 'branch (lit, held)', maxSize: BRANCH_HELD_MAX },
    { id: 'held:pitchfork', url: '/models/items/pitchfork.glb', label: 'pitchfork (held)', maxSize: 0.81 },
    { id: 'held:sickle', url: '/models/items/sickle.glb', label: 'sickle (held)', maxSize: 0.36 },
    { id: 'held:pickaxe', url: '/models/items/pickaxe.glb', label: 'pickaxe (held)', maxSize: 0.55 },
    { id: 'held:long_sword', url: '/models/items/long_sword.glb', label: 'long_sword (held)', maxSize: 0.95 },
  ]

  for (const spec of browserHeld) {
    if (seen.has(spec.id)) continue
    seen.add(spec.id)
    out.push({
      ...spec,
      group: 'held',
      prepare: { mode: 'fitMax', value: spec.maxSize },
      skinned: false,
      anchors: anchorsForAsset(spec.id),
    })
  }
}

function pushBrowserItemExtras(out: AssetIndexEntry[]): void {
  const extras: Array<{ id: string, url: string, label: string, maxSize: number }> = [
    { id: 'item:pickaxe', url: '/models/items/pickaxe.glb', label: 'pickaxe (ground)', maxSize: 0.9 },
    { id: 'item:long_sword', url: '/models/items/long_sword.glb', label: 'long_sword (ground)', maxSize: 1.15 },
  ]
  const seen = new Set(out.map((e) => e.id))
  for (const spec of extras) {
    if (seen.has(spec.id)) continue
    out.push({
      ...spec,
      group: 'item',
      prepare: { mode: 'fitMax', value: spec.maxSize },
      skinned: false,
      anchors: anchorsForAsset(spec.id),
    })
  }
}

function pushHeightSpecs(
  out: AssetIndexEntry[],
  specs: readonly { url: string, height: number }[],
  group: AssetIndexGroup,
  prefix: string,
): void {
  for (const spec of specs) {
    const name = basenameFromUrl(spec.url)
    const id = `${prefix}:${name}`
    out.push({
      id,
      url: spec.url,
      label: name,
      group,
      prepare: { mode: 'height', value: spec.height },
      skinned: false,
      anchors: anchorsForAsset(id),
    })
  }
}

export function buildAssetIndex(): AssetIndexEntry[] {
  const out: AssetIndexEntry[] = []

  out.push({
    id: 'character:player',
    url: PLAYER_MODEL_URL,
    label: 'Player (Adventurer)',
    group: 'character',
    prepare: { mode: 'height', value: PLAYER_HEIGHT },
    skinned: true,
    anchors: anchorsForAsset('character:player'),
  })

  for (const [gender, urls] of Object.entries(NPC_MODEL_URLS)) {
    for (const url of urls) {
      const name = basenameFromUrl(url)
      const id = `npc:${name}`
      out.push({
        id,
        url,
        label: `${name} (${gender})`,
        group: 'npc',
        prepare: { mode: 'height', value: NPC_HEIGHT },
        skinned: true,
        anchors: anchorsForAsset(id),
      })
    }
  }

  for (const [kind, url] of Object.entries(FAUNA_URLS)) {
    if (!url) continue
    const def = ANIMAL_DEFS[kind as keyof typeof ANIMAL_DEFS]
    const id = `fauna:${kind}`
    out.push({
      id,
      url,
      label: kind,
      group: 'fauna',
      prepare: { mode: 'height', value: def.modelHeight },
      skinned: true,
      anchors: anchorsForAsset(id),
    })
  }

  const faunaSeen = new Set(out.filter((e) => e.group === 'fauna').map((e) => e.id))
  for (const [kind, urls] of Object.entries(LIVESTOCK_URLS)) {
    const def = ANIMAL_DEFS[kind as keyof typeof ANIMAL_DEFS]
    // Plan fauna-011 §1: `dog` has two visual variants (Husky/Shiba) at one
    // simulation kind — index each URL separately (`fauna:dog#0`/`#1`)
    // instead of dropping every kind-but-first variant. Every other kind
    // still has exactly one URL, so its id stays plain `fauna:${kind}`.
    urls.forEach((url, i) => {
      const id = urls.length > 1 ? `fauna:${kind}#${i}` : `fauna:${kind}`
      if (faunaSeen.has(id)) return
      out.push({
        id,
        url,
        label: kind,
        group: 'fauna',
        prepare: { mode: 'height', value: def.modelHeight },
        skinned: true,
        anchors: anchorsForAsset(id),
      })
    })
  }

  for (const [kind, spec] of Object.entries(ITEM_GLB_SPECS)) {
    if (!spec) continue
    const id = `item:${kind}`
    out.push({
      id,
      url: spec.url,
      label: `${kind} (ground)`,
      group: 'item',
      prepare: { mode: 'fitMax', value: spec.maxSize },
      skinned: false,
      anchors: anchorsForAsset(id),
    })
  }

  pushBrowserItemExtras(out)
  pushHeldSpecs(out)

  for (const entry of HOUSE_CATALOG) {
    if (!entry.url) continue
    const id = `house:${entry.id}`
    out.push({
      id,
      url: entry.url,
      label: `${entry.id} — ${entry.label}`,
      group: 'house',
      prepare: { mode: 'height', value: entry.height },
      skinned: false,
      anchors: anchorsForAsset(id),
    })
  }

  pushHeightSpecs(out, TREE_SPECS, 'nature', 'nature')
  pushHeightSpecs(out, BUSH_SPECS, 'nature', 'nature')
  pushHeightSpecs(out, CACTUS_SPECS, 'nature', 'nature')
  pushHeightSpecs(out, REED_SPECS, 'nature', 'nature')
  pushHeightSpecs(out, ROCK_SPECS, 'nature', 'nature')
  pushHeightSpecs(out, ROCK_CLUSTER_SPECS, 'nature', 'nature')
  pushHeightSpecs(out, FALLEN_LOG_SPECS, 'nature', 'nature')
  pushHeightSpecs(out, CEMETERY_SPECS, 'nature', 'nature')
  pushHeightSpecs(out, GRAVE_SPECS, 'nature', 'nature')
  pushHeightSpecs(out, RESOURCE_GOLD_SPECS, 'nature', 'nature')
  pushHeightSpecs(out, RESOURCE_ROCK_SPECS, 'nature', 'nature')
  pushHeightSpecs(out, DOCK_SPECS, 'settlement', 'settlement')

  const settlementProps: Array<{ id: string, url: string, label: string, prepare: AssetPrepare }> = [
    { id: 'settlement:crops', url: CROPS_URL, label: 'Garden crops', prepare: { mode: 'fitMax', value: CROPS_FIT_MAX } },
    { id: 'settlement:farm', url: FARM_URL, label: 'Wheat field', prepare: { mode: 'height', value: FARM_HEIGHT } },
    { id: 'settlement:lantern', url: LANTERN_URL, label: 'Lantern', prepare: { mode: 'fitMax', value: LANTERN_FLOOR_MAX } },
    { id: 'settlement:lantern_wall', url: LANTERN_URL, label: 'Lantern (wall)', prepare: { mode: 'fitMax', value: LANTERN_WALL_MAX } },
    { id: 'settlement:torch', url: VILLAGE_TORCH_URL, label: 'Village torch', prepare: { mode: 'height', value: VILLAGE_TORCH_HEIGHT } },
    { id: 'settlement:wall', url: WALL_URL, label: 'Wall segment (RTS palisade)', prepare: { mode: 'height', value: 1.85 } },
    { id: 'settlement:wagon', url: WAGON_URL, label: 'Wagon (Kupiec)', prepare: { mode: 'fitMax', value: WAGON_FIT_MAX } },
    { id: 'settlement:well', url: WELL_URL, label: 'Well', prepare: { mode: 'height', value: WELL_HEIGHT } },
    { id: 'settlement:wood_pile', url: WOOD_PILE_URL, label: 'Wood pile', prepare: { mode: 'height', value: WOOD_PILE_HEIGHT } },
    { id: 'settlement:campfire_unlit', url: CAMPFIRE_UNLIT_URL, label: 'Campfire (unlit body)', prepare: { mode: 'fitMax', value: CAMPFIRE_FIT_MAX } },
    { id: 'fx:fire', url: FIRE_FX_URL, label: 'Fire FX', prepare: { mode: 'fitMax', value: 0.11 } },
    { id: 'fx:blood_splat', url: '/models/fx/blood_splat.glb', label: 'Blood splat', prepare: { mode: 'fitMax', value: 1 } },
  ]

  for (const spec of settlementProps) {
    out.push({
      ...spec,
      group: spec.id.startsWith('fx:') ? 'fx' : 'settlement',
      skinned: false,
      anchors: anchorsForAsset(spec.id),
    })
  }

  return out.map(decorateEntry)
}

export function assetIndexById(
  index: readonly AssetIndexEntry[] = buildAssetIndex(),
): Map<string, AssetIndexEntry> {
  return new Map(index.map((e) => [e.id, e]))
}

export function findAssetEntry(
  id: string,
  index?: readonly AssetIndexEntry[],
): AssetIndexEntry | undefined {
  const list = index ?? buildAssetIndex()
  return list.find((e) => e.id === id)
}

export function entryFromUrl(
  url: string,
  index?: readonly AssetIndexEntry[],
): AssetIndexEntry | undefined {
  const list = index ?? buildAssetIndex()
  return list.find((e) => e.url === url)
}
