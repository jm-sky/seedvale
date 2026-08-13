import type { AssetAnchorDef } from './assetAnchors'
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
  DOCK_SPECS,
  FALLEN_LOG_SPECS,
  FIRE_FX_URL,
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

export type AssetIndexEntry = {
  id: string
  url: string
  label: string
  group: AssetIndexGroup
  prepare: AssetPrepare
  skinned: boolean
  anchors: readonly AssetAnchorDef[]
}

function basenameFromUrl(url: string): string {
  const parts = url.split('/')
  const file = parts[parts.length - 1] ?? url
  return file.replace(/\.glb$/i, '')
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
  for (const [kind, url] of Object.entries(LIVESTOCK_URLS)) {
    const id = `fauna:${kind}`
    if (faunaSeen.has(id)) continue
    const def = ANIMAL_DEFS[kind as keyof typeof ANIMAL_DEFS]
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
      label: entry.label,
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
  pushHeightSpecs(out, RESOURCE_GOLD_SPECS, 'nature', 'nature')
  pushHeightSpecs(out, RESOURCE_ROCK_SPECS, 'nature', 'nature')
  pushHeightSpecs(out, DOCK_SPECS, 'settlement', 'settlement')

  const settlementProps: Array<{ id: string, url: string, label: string, prepare: AssetPrepare }> = [
    { id: 'settlement:lantern', url: LANTERN_URL, label: 'Lantern', prepare: { mode: 'fitMax', value: LANTERN_FLOOR_MAX } },
    { id: 'settlement:lantern_wall', url: LANTERN_URL, label: 'Lantern (wall)', prepare: { mode: 'fitMax', value: LANTERN_WALL_MAX } },
    { id: 'settlement:torch', url: VILLAGE_TORCH_URL, label: 'Village torch', prepare: { mode: 'height', value: VILLAGE_TORCH_HEIGHT } },
    { id: 'settlement:wall', url: WALL_URL, label: 'Wall segment', prepare: { mode: 'height', value: 1.85 } },
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

  return out
}

export function assetIndexById(index: AssetIndexEntry[] = buildAssetIndex()): Map<string, AssetIndexEntry> {
  return new Map(index.map((e) => [e.id, e]))
}

export function findAssetEntry(id: string, index?: AssetIndexEntry[]): AssetIndexEntry | undefined {
  const list = index ?? buildAssetIndex()
  return list.find((e) => e.id === id)
}

export function entryFromUrl(url: string, index?: AssetIndexEntry[]): AssetIndexEntry | undefined {
  const list = index ?? buildAssetIndex()
  return list.find((e) => e.url === url)
}
