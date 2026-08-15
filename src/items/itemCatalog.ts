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

/** Player melee attack tuning for a single held tool (plan 123). Single
 *  source of truth for damage/timing/range/stamina — `player/playerMelee.ts`
 *  reads this directly instead of a parallel weapon-stat table. */
export type MeleeConfig = {
  damage: number
  /** Max XZ distance (world units) a target can be hit from. */
  range: number
  /** Minimum dot(playerForward, toTarget) to count as inside the attack arc. */
  arcDot: number
  /** Seconds from attack request until the hit window opens. */
  windUp: number
  /** Seconds the hit window stays open — damage resolves once, at its start. */
  hitWindow: number
  /** Seconds after the hit window before another attack can be requested. */
  recovery: number
  staminaCost: number
}

export type ItemCatalogEntry = {
  kind: ItemKind
  /** Polish label — mirrors ITEM_DEFS. */
  label: string
  category: 'resource' | 'tool' | 'utility'
  /** Can occupy HeldTool slot + Weź in inventory. */
  holdable: boolean
  /** Player melee vs animals while held (plan 123 — `player/playerMelee.ts`). */
  melee: MeleeConfig | null
  spawn: ItemSpawnKind
  /** Runtime GLB under public/ when present. */
  modelUrl: string | null
  notes: string
  /** Planned work — not implemented. */
  roadmap?: string
  /** Inventory-screen "Zjedz"/"Wypij" action (plan 106) — `need` is the
   *  `PlayerNeeds` pool restored, `relief` the flat amount. `resultKind` is
   *  set only for a container swap (full waterskin → empty), not for food,
   *  which is simply consumed. */
  consumable?: { need: 'hunger' | 'thirst', relief: number, resultKind?: ItemKind }
}

export const ITEM_CATALOG: Record<ItemKind, ItemCatalogEntry> = {
  shell: {
    kind: 'shell',
    label: 'muszla',
    category: 'resource',
    holdable: false,
    melee: null,
    spawn: 'village_renewable',
    modelUrl: null,
    notes: 'Procedural mesh; renewable near settlement.',
  },
  stone: {
    kind: 'stone',
    label: 'kamień',
    category: 'resource',
    holdable: false,
    melee: null,
    spawn: 'village_renewable',
    modelUrl: null,
    notes: 'Procedural; also dig loot / drops.',
  },
  branch: {
    kind: 'branch',
    label: 'gałąź',
    category: 'resource',
    holdable: false,
    melee: null,
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
    melee: null,
    spawn: 'world_chunk',
    modelUrl: null,
    notes: 'World chunk collectible.',
  },
  flower: {
    kind: 'flower',
    label: 'kwiat',
    category: 'resource',
    holdable: false,
    melee: null,
    spawn: 'world_chunk',
    modelUrl: null,
    notes: 'World chunk collectible.',
  },
  cone: {
    kind: 'cone',
    label: 'szyszka',
    category: 'resource',
    holdable: false,
    melee: null,
    spawn: 'world_chunk',
    modelUrl: null,
    notes: 'World chunk collectible.',
  },
  knife: {
    kind: 'knife',
    label: 'nóż',
    category: 'tool',
    holdable: true,
    melee: { damage: 12, range: 1.6, arcDot: 0.6, windUp: 0.12, hitWindow: 0.08, recovery: 0.18, staminaCost: 4 },
    spawn: 'starting',
    modelUrl: '/models/items/knife.glb',
    notes: 'Starting loadout; held visual on Wrist.R; melee on animals. Fast/narrow (plan 123).',
  },
  // TODO: Add long_sword to the game, review all configs.
  long_sword: {
    kind: 'long_sword',
    label: 'miecz',
    category: 'tool',
    holdable: true,
    melee: { damage: 28, range: 2.6, arcDot: 0.35, windUp: 0.28, hitWindow: 0.12, recovery: 0.38, staminaCost: 12 },
    spawn: 'none',
    modelUrl: '/models/items/long_sword.glb',
    notes: 'Held melee (plan 090). Acquire via Strażnik/Kupiec — not a world spawn. Longest range, medium/slow, highest damage (plan 123).',
  },
  firestarter: {
    kind: 'firestarter',
    label: 'krzesiwo',
    category: 'tool',
    holdable: true,
    melee: null,
    spawn: 'starting',
    modelUrl: null,
    notes: 'Starting loadout; procedural held/drop mesh; lights fires.',
  },
  blanket: {
    kind: 'blanket',
    label: 'koc',
    category: 'utility',
    holdable: false,
    melee: null,
    spawn: 'starting',
    modelUrl: null,
    notes: 'Starting loadout; rest / camp UX.',
  },
  shovel: {
    kind: 'shovel',
    label: 'łopata',
    category: 'tool',
    holdable: true,
    melee: { damage: 8, range: 2.0, arcDot: 0.45, windUp: 0.25, hitWindow: 0.1, recovery: 0.35, staminaCost: 8 },
    spawn: 'village_onetime',
    modelUrl: '/models/items/shovel.glb',
    notes: 'One-time near campfire/garden; dig + level; melee; held GLB. Slow (plan 123).',
  },
  axe: {
    kind: 'axe',
    label: 'siekiera',
    category: 'tool',
    holdable: true,
    melee: { damage: 20, range: 2.0, arcDot: 0.4, windUp: 0.3, hitWindow: 0.12, recovery: 0.4, staminaCost: 10 },
    spawn: 'village_onetime',
    modelUrl: '/models/items/axe.glb',
    notes: 'One-time near settlement tree; chop trees; melee; held GLB. Slow/heavy (plan 123).',
  },
  pitchfork: {
    kind: 'pitchfork',
    label: 'widły',
    category: 'tool',
    holdable: true,
    melee: { damage: 14, range: 2.4, arcDot: 0.5, windUp: 0.2, hitWindow: 0.12, recovery: 0.28, staminaCost: 7 },
    spawn: 'village_onetime',
    modelUrl: '/models/items/pitchfork.glb',
    notes: '1–3 with sickle near gardens (plan 082). Holdable melee, longer range/medium speed (plan 096/123).',
    roadmap: 'NPC protest on village theft (issue 025).',
  },
  sickle: {
    kind: 'sickle',
    label: 'sierp',
    category: 'tool',
    holdable: true,
    melee: { damage: 12, range: 1.8, arcDot: 0.55, windUp: 0.15, hitWindow: 0.1, recovery: 0.2, staminaCost: 5 },
    spawn: 'village_onetime',
    modelUrl: '/models/items/sickle.glb',
    notes: '1–3 with pitchfork near gardens (plan 082). Holdable melee, medium speed (plan 096/123).',
    roadmap: 'NPC protest on village theft (issue 025).',
  },
  wooden_torch: {
    kind: 'wooden_torch',
    label: 'pochodnia',
    category: 'tool',
    holdable: true,
    melee: null,
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
    melee: null,
    spawn: 'village_onetime',
    modelUrl: '/models/items/pickaxe.glb',
    notes: 'One-time near stockpile (plan 090). Held; mines iron/coal/gold deposits and mountain-rock ground (stone).',
  },
  tent: {
    kind: 'tent',
    label: 'namiot',
    category: 'utility',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Buy from Kupiec; place / rest / pack (plan 090). Not a world spawn.',
  },
  coal: {
    kind: 'coal',
    label: 'węgiel',
    category: 'resource',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Pickaxe yield from coal deposits (plan 090).',
  },
  iron: {
    kind: 'iron',
    label: 'żelazo',
    category: 'resource',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Pickaxe yield from iron deposits (plan 090).',
  },
  gold: {
    kind: 'gold',
    label: 'złoto',
    category: 'resource',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Pickaxe yield from gold deposits (plan 090).',
  },
  tomato: {
    kind: 'tomato',
    label: 'pomidor',
    category: 'resource',
    holdable: false,
    melee: null,
    spawn: 'village_renewable',
    modelUrl: null,
    notes: 'Plan 106 — renewable near settlement garden pads, same pool mechanism as shell/stone.',
    consumable: { need: 'hunger', relief: 12 },
  },
  raw_meat: {
    kind: 'raw_meat',
    label: 'surowe mięso',
    category: 'resource',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 106 — knife-harvest from a suitable animal corpse (`AnimalAgent.harvestMeat`). Edible raw at a reduced relief; better roasted.',
    consumable: { need: 'hunger', relief: 15 },
  },
  roasted_meat: {
    kind: 'roasted_meat',
    label: 'pieczone mięso',
    category: 'resource',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 106 — cooked from raw_meat at a lit campfire (`items/campfireCooking.ts`).',
    consumable: { need: 'hunger', relief: 35 },
  },
  bread: {
    kind: 'bread',
    label: 'chleb',
    category: 'resource',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 106 — buy from Kupiec (`tradeCatalog.ts`); prepared for future/emergency use per the plan.',
    consumable: { need: 'hunger', relief: 30 },
  },
  waterskin_empty: {
    kind: 'waterskin_empty',
    label: 'bukłak (pusty)',
    category: 'utility',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 106 — buy from Kupiec; fill at a well/lake `[R]` (becomes waterskin_full). Not a `HeldTool` slot item.',
  },
  waterskin_full: {
    kind: 'waterskin_full',
    label: 'bukłak (pełny)',
    category: 'utility',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 106 — filled at a well/lake; drink via inventory "Wypij" (becomes waterskin_empty) or it empties automatically when drunk from the world prompt.',
    consumable: { need: 'thirst', relief: 45, resultKind: 'waterskin_empty' },
  },
}

/** Cross-cutting item systems not tied to a single kind (roadmap only). */
export const ITEM_SYSTEM_ROADMAP = [
  'Item durability / HP: tools and improvised weapons wear down with use (esp. combat); break or need repair when depleted.',
  'Expand melee set: branch (see per-kind roadmap).',
] as const

/** Decorative / not ItemKind — listed for agents scanning item-ish props. */
export const NON_ITEM_PROPS = [
  {
    id: 'hay',
    modelUrl: '/models/settlement/hay.glb',
    notes: 'Decorative bales near gardens.',
  },
] as const
