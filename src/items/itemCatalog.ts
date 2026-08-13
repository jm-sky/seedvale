/**
 * Machine-readable item catalog for Seedvale.
 * Prefer this (or docs/items/CATALOG.md) over grepping scattered ITEM_DEFS / spawners.
 *
 * Source of truth for *labels/weights* remains `ITEM_DEFS` in `items.ts`.
 * This file adds gameplay/AI-facing flags (hold, melee, spawn, assets, roadmap).
 */
import type { ItemKind } from './items'

export type ItemSpawnKind =
  | 'none'
  | 'starting'
  | 'village_onetime'
  | 'village_renewable'
  | 'world_chunk'
  | 'decorative_only'

export type ItemCatalogEntry = {
  kind: ItemKind
  /** Polish label — mirrors ITEM_DEFS. */
  label: string
  category: 'resource' | 'tool' | 'utility'
  /** Can occupy HeldTool slot + Weź in inventory. */
  holdable: boolean
  /** Player melee vs animals while held (`faunaCombat.ts`). */
  meleeDamage: number | null
  spawn: ItemSpawnKind
  /** Runtime GLB under public/ when present. */
  modelUrl: string | null
  notes: string
  /** Planned work — not implemented. */
  roadmap?: string
}

export const ITEM_CATALOG: Record<ItemKind, ItemCatalogEntry> = {
  shell: {
    kind: 'shell',
    label: 'muszla',
    category: 'resource',
    holdable: false,
    meleeDamage: null,
    spawn: 'village_renewable',
    modelUrl: null,
    notes: 'Procedural mesh; renewable near settlement.',
  },
  stone: {
    kind: 'stone',
    label: 'kamień',
    category: 'resource',
    holdable: false,
    meleeDamage: null,
    spawn: 'village_renewable',
    modelUrl: null,
    notes: 'Procedural; also dig loot / drops.',
  },
  branch: {
    kind: 'branch',
    label: 'gałąź',
    category: 'resource',
    holdable: false,
    meleeDamage: null,
    spawn: 'village_renewable',
    modelUrl: '/models/items/branch.glb',
    notes: 'Renewable near settlement trees; axe harvest yield; lit hand visual (plan 085).',
    roadmap:
      'Holdable improvised melee (low damage, ~4–8). Natural candidate for item durability/HP wear.',
  },
  mushroom: {
    kind: 'mushroom',
    label: 'grzyb',
    category: 'resource',
    holdable: false,
    meleeDamage: null,
    spawn: 'world_chunk',
    modelUrl: null,
    notes: 'World chunk collectible.',
  },
  flower: {
    kind: 'flower',
    label: 'kwiat',
    category: 'resource',
    holdable: false,
    meleeDamage: null,
    spawn: 'world_chunk',
    modelUrl: null,
    notes: 'World chunk collectible.',
  },
  cone: {
    kind: 'cone',
    label: 'szyszka',
    category: 'resource',
    holdable: false,
    meleeDamage: null,
    spawn: 'world_chunk',
    modelUrl: null,
    notes: 'World chunk collectible.',
  },
  knife: {
    kind: 'knife',
    label: 'nóż',
    category: 'tool',
    holdable: true,
    meleeDamage: 12,
    spawn: 'starting',
    modelUrl: '/models/items/knife.glb',
    notes: 'Starting loadout; held visual on Wrist.R; melee on animals.',
  },
  // TODO: Add long_sword to the game, review all configs.
  long_sword: {
    kind: 'long_sword',
    label: 'miecz',
    category: 'tool',
    holdable: true,
    meleeDamage: 28,
    spawn: 'none',
    modelUrl: '/models/items/long_sword.glb',
    notes: 'Held melee (plan 090). Acquire via Strażnik/Kupiec — not a world spawn.',
  },
  firestarter: {
    kind: 'firestarter',
    label: 'krzesiwo',
    category: 'tool',
    holdable: true,
    meleeDamage: null,
    spawn: 'starting',
    modelUrl: null,
    notes: 'Starting loadout; procedural held/drop mesh; lights fires.',
  },
  blanket: {
    kind: 'blanket',
    label: 'koc',
    category: 'utility',
    holdable: false,
    meleeDamage: null,
    spawn: 'starting',
    modelUrl: null,
    notes: 'Starting loadout; rest / camp UX.',
  },
  shovel: {
    kind: 'shovel',
    label: 'łopata',
    category: 'tool',
    holdable: true,
    meleeDamage: 8,
    spawn: 'village_onetime',
    modelUrl: '/models/items/shovel.glb',
    notes: 'One-time near campfire/garden; dig + level; melee; held GLB.',
  },
  axe: {
    kind: 'axe',
    label: 'siekiera',
    category: 'tool',
    holdable: true,
    meleeDamage: 20,
    spawn: 'village_onetime',
    modelUrl: '/models/items/axe.glb',
    notes: 'One-time near settlement tree; chop trees; melee; held GLB.',
  },
  pitchfork: {
    kind: 'pitchfork',
    label: 'widły',
    category: 'tool',
    holdable: false,
    meleeDamage: null,
    spawn: 'village_onetime',
    modelUrl: '/models/items/pitchfork.glb',
    notes: '1–3 with sickle near gardens (plan 082). Pickup only — not holdable yet.',
    roadmap:
      'Holdable + melee like knife (damage TBD, ~10–14). NPC protest on village theft (issue 025).',
  },
  sickle: {
    kind: 'sickle',
    label: 'sierp',
    category: 'tool',
    holdable: false,
    meleeDamage: null,
    spawn: 'village_onetime',
    modelUrl: '/models/items/sickle.glb',
    notes: '1–3 with pitchfork near gardens (plan 082). Pickup only — not holdable yet.',
    roadmap:
      'Holdable + melee like knife (damage TBD, ~10–12). NPC protest on village theft (issue 025).',
  },
  wooden_torch: {
    kind: 'wooden_torch',
    label: 'pochodnia',
    category: 'tool',
    holdable: true,
    meleeDamage: null,
    spawn: 'starting',
    modelUrl: '/models/items/wooden_torch.glb',
    notes:
      'Starting loadout (+ village 1× near plaza/campfire). Weź then Zapal pochodnię (firestarter). Longer/brighter than lit branch (plan 085).',
  },
  pickaxe: {
    kind: 'pickaxe',
    label: 'kilof',
    category: 'tool',
    holdable: true,
    meleeDamage: null,
    spawn: 'village_onetime',
    modelUrl: '/models/items/pickaxe.glb',
    notes: 'One-time near stockpile (plan 090). Held; mines iron/coal/gold deposits.',
  },
  tent: {
    kind: 'tent',
    label: 'namiot',
    category: 'utility',
    holdable: false,
    meleeDamage: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Buy from Kupiec; place / rest / pack (plan 090). Not a world spawn.',
  },
  coal: {
    kind: 'coal',
    label: 'węgiel',
    category: 'resource',
    holdable: false,
    meleeDamage: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Pickaxe yield from coal deposits (plan 090).',
  },
  iron: {
    kind: 'iron',
    label: 'żelazo',
    category: 'resource',
    holdable: false,
    meleeDamage: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Pickaxe yield from iron deposits (plan 090).',
  },
  gold: {
    kind: 'gold',
    label: 'złoto',
    category: 'resource',
    holdable: false,
    meleeDamage: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Pickaxe yield from gold deposits (plan 090).',
  },
}

/** Cross-cutting item systems not tied to a single kind (roadmap only). */
export const ITEM_SYSTEM_ROADMAP = [
  'Item durability / HP: tools and improvised weapons wear down with use (esp. combat); break or need repair when depleted.',
  'Expand melee set: pitchfork, sickle, branch (see per-kind roadmap).',
] as const

/** Decorative / not ItemKind — listed for agents scanning item-ish props. */
export const NON_ITEM_PROPS = [
  {
    id: 'hay',
    modelUrl: '/models/settlement/hay.glb',
    notes: 'Decorative bales near gardens.',
  },
] as const
