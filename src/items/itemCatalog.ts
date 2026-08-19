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

/** Held-item defense tuning (plan 150). Only items that can block need an
 *  entry — `resolveDefense` treats missing/`canBlock: false` as no defense. */
export type DefenseConfig = {
  canBlock: boolean
  /** Base probability of a full block before skill bonus. */
  baseBlockChance: number
  /** Fraction of incoming damage removed on a partial block. */
  partialReduction: number
}

/** What a `consumable` item restores — `hunger`/`thirst` map to a
 *  `PlayerNeeds` pool, `health` heals `HealthState` directly (plan 153). */
export type ConsumableNeed = 'hunger' | 'thirst' | 'health'

export type ItemCatalogEntry = {
  kind: ItemKind
  /** Polish label — mirrors ITEM_DEFS. */
  label: string
  /** Can occupy HeldTool slot + Weź in inventory. */
  holdable: boolean
  /** Player melee vs animals while held (plan 123 — `player/playerMelee.ts`). */
  melee: MeleeConfig | null
  /** Optional block parameters while held (plan 150 — `combat/defenseResolver.ts`). */
  defense?: DefenseConfig | null
  spawn: ItemSpawnKind
  /** Runtime GLB under public/ when present. */
  modelUrl: string | null
  notes: string
  /** Planned work — not implemented. */
  roadmap?: string
  /** Inventory-screen "Zjedz"/"Wypij"/"Opatrz" action (plan 106, 153) —
   *  `need` is the pool restored (`PlayerNeeds` for hunger/thirst,
   *  `HealthState` for health), `relief` the flat amount. `resultKind` is
   *  set only for a container swap (full waterskin → empty), not for food,
   *  which is simply consumed. */
  consumable?: { need: ConsumableNeed, relief: number, resultKind?: ItemKind }
}

/** Single source of truth for the inventory/world-prompt action verb per
 *  `consumable.need` — avoids a second manual mapping per screen (plan 153). */
export function consumeVerbLabel(need: ConsumableNeed): string {
  switch (need) {
    case 'health': return 'Opatrz'
    case 'thirst': return 'Wypij'
    default: return 'Zjedz'
  }
}

/** Polish noun for "+N ___" effect summaries — pairs with `consumeVerbLabel`. */
export function consumeNeedNoun(need: ConsumableNeed): string {
  switch (need) {
    case 'health': return 'zdrowia'
    case 'thirst': return 'pragnienia'
    default: return 'głodu'
  }
}

export const ITEM_CATALOG: Record<ItemKind, ItemCatalogEntry> = {
  shell: {
    kind: 'shell',
    label: 'muszla',
    holdable: false,
    melee: null,
    spawn: 'village_renewable',
    modelUrl: null,
    notes: 'Procedural mesh; renewable near settlement.',
  },
  stone: {
    kind: 'stone',
    label: 'kamień',
    holdable: false,
    melee: null,
    spawn: 'village_renewable',
    modelUrl: null,
    notes: 'Procedural; also dig loot / drops.',
  },
  branch: {
    kind: 'branch',
    label: 'gałąź',
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
    holdable: false,
    melee: null,
    spawn: 'world_chunk',
    modelUrl: null,
    notes: 'World chunk collectible.',
  },
  flower: {
    kind: 'flower',
    label: 'kwiat',
    holdable: false,
    melee: null,
    spawn: 'world_chunk',
    modelUrl: null,
    notes: 'World chunk collectible.',
  },
  cone: {
    kind: 'cone',
    label: 'szyszka',
    holdable: false,
    melee: null,
    spawn: 'world_chunk',
    modelUrl: null,
    notes: 'World chunk collectible.',
  },
  knife: {
    kind: 'knife',
    label: 'nóż',
    holdable: true,
    melee: { damage: 12, range: 1.6, arcDot: 0.6, windUp: 0.12, hitWindow: 0.08, recovery: 0.18, staminaCost: 4 },
    defense: { canBlock: true, baseBlockChance: 0.12, partialReduction: 0.35 },
    spawn: 'starting',
    modelUrl: '/models/items/knife.glb',
    notes: 'Starting loadout; held visual on Wrist.R; melee on animals. Fast/narrow (plan 123).',
  },
  // TODO: Add long_sword to the game, review all configs.
  long_sword: {
    kind: 'long_sword',
    label: 'miecz',
    holdable: true,
    melee: { damage: 28, range: 2.6, arcDot: 0.35, windUp: 0.28, hitWindow: 0.12, recovery: 0.38, staminaCost: 12 },
    defense: { canBlock: true, baseBlockChance: 0.28, partialReduction: 0.55 },
    spawn: 'none',
    modelUrl: '/models/items/long_sword.glb',
    notes: 'Held melee (plan 090). Acquire via Strażnik/Kupiec — not a world spawn. Longest range, medium/slow, highest damage (plan 123).',
  },
  spear: {
    kind: 'spear',
    label: 'dzida',
    holdable: true,
    melee: { damage: 20, range: 3.0, arcDot: 0.6, windUp: 0.24, hitWindow: 0.1, recovery: 0.3, staminaCost: 9 },
    defense: { canBlock: true, baseBlockChance: 0.18, partialReduction: 0.4 },
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 134 — Kupiec stock. No GLB yet; procedural held/drop mesh. Longest range, narrow thrust arc.',
  },
  short_sword: {
    kind: 'short_sword',
    label: 'krótki miecz',
    holdable: true,
    melee: { damage: 18, range: 2.1, arcDot: 0.5, windUp: 0.18, hitWindow: 0.1, recovery: 0.26, staminaCost: 7 },
    defense: { canBlock: true, baseBlockChance: 0.22, partialReduction: 0.45 },
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 134 — Kupiec stock. No GLB yet; procedural held/drop mesh. Lighter/faster than long_sword.',
  },
  firestarter: {
    kind: 'firestarter',
    label: 'krzesiwo',
    holdable: true,
    melee: null,
    spawn: 'starting',
    modelUrl: null,
    notes: 'Starting loadout; procedural held/drop mesh; lights fires.',
  },
  blanket: {
    kind: 'blanket',
    label: 'koc',
    holdable: false,
    melee: null,
    spawn: 'starting',
    modelUrl: null,
    notes: 'Starting loadout; rest / camp UX.',
  },
  shovel: {
    kind: 'shovel',
    label: 'łopata',
    holdable: true,
    melee: { damage: 8, range: 2.0, arcDot: 0.45, windUp: 0.25, hitWindow: 0.1, recovery: 0.35, staminaCost: 8 },
    defense: { canBlock: true, baseBlockChance: 0.1, partialReduction: 0.25 },
    spawn: 'village_onetime',
    modelUrl: '/models/items/shovel.glb',
    notes: 'One-time near campfire/garden; dig + level; melee; held GLB. Slow (plan 123).',
  },
  axe: {
    kind: 'axe',
    label: 'siekiera',
    holdable: true,
    melee: { damage: 20, range: 2.0, arcDot: 0.4, windUp: 0.3, hitWindow: 0.12, recovery: 0.4, staminaCost: 10 },
    defense: { canBlock: true, baseBlockChance: 0.2, partialReduction: 0.45 },
    spawn: 'village_onetime',
    modelUrl: '/models/items/axe.glb',
    notes: 'One-time near settlement tree; chop trees; melee; held GLB. Slow/heavy (plan 123).',
  },
  pitchfork: {
    kind: 'pitchfork',
    label: 'widły',
    holdable: true,
    melee: { damage: 14, range: 2.4, arcDot: 0.5, windUp: 0.2, hitWindow: 0.12, recovery: 0.28, staminaCost: 7 },
    defense: { canBlock: true, baseBlockChance: 0.22, partialReduction: 0.5 },
    spawn: 'village_onetime',
    modelUrl: '/models/items/pitchfork.glb',
    notes: '1–3 with sickle near gardens (plan 082). Holdable melee, longer range/medium speed (plan 096/123).',
    roadmap: 'NPC protest on village theft (issue 025).',
  },
  sickle: {
    kind: 'sickle',
    label: 'sierp',
    holdable: true,
    melee: { damage: 12, range: 1.8, arcDot: 0.55, windUp: 0.15, hitWindow: 0.1, recovery: 0.2, staminaCost: 5 },
    defense: { canBlock: true, baseBlockChance: 0.14, partialReduction: 0.32 },
    spawn: 'village_onetime',
    modelUrl: '/models/items/sickle.glb',
    notes: '1–3 with pitchfork near gardens (plan 082). Holdable melee, medium speed (plan 096/123).',
    roadmap: 'NPC protest on village theft (issue 025).',
  },
  wooden_torch: {
    kind: 'wooden_torch',
    label: 'pochodnia',
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
    holdable: true,
    melee: null,
    spawn: 'village_onetime',
    modelUrl: '/models/items/pickaxe.glb',
    notes: 'One-time near stockpile (plan 090). Held; mines iron/coal/gold deposits and mountain-rock ground (stone).',
  },
  tent: {
    kind: 'tent',
    label: 'namiot',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Buy from Kupiec; place / rest / pack (plan 090). Not a world spawn.',
  },
  trap_simple: {
    kind: 'trap_simple',
    label: 'prosta pułapka',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 141 — buy from Kupiec; set down via Quick Actions ("Zastaw pułapkę"), then `[E]` to arm. Placed world object (`world/createPlacedTraps.ts`), not a `HeldTool`. Low durability, high detection chance, poor weather resistance.',
    roadmap: 'Dedicated trap GLB (MODELS.md M40); bait, crafting and repair are explicitly out of plan 141.',
  },
  trap_good: {
    kind: 'trap_good',
    label: 'dobra pułapka',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 141 — same placement/arming flow as trap_simple, but more durable, harder to spot and far more weather-resistant.',
    roadmap: 'Dedicated trap GLB (MODELS.md M40).',
  },
  coal: {
    kind: 'coal',
    label: 'węgiel',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Pickaxe yield from coal deposits (plan 090).',
  },
  iron: {
    kind: 'iron',
    label: 'żelazo',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Pickaxe yield from iron deposits (plan 090).',
  },
  gold: {
    kind: 'gold',
    label: 'złoto',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Pickaxe yield from gold deposits (plan 090).',
  },
  tomato: {
    kind: 'tomato',
    label: 'pomidor',
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
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 106 — buy from Kupiec; fill at a well/lake `[R]` (becomes waterskin_full). Not a `HeldTool` slot item.',
  },
  waterskin_full: {
    kind: 'waterskin_full',
    label: 'bukłak (pełny)',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 106 — filled at a well/lake; drink via inventory "Wypij" (becomes waterskin_empty) or it empties automatically when drunk from the world prompt.',
    consumable: { need: 'thirst', relief: 45, resultKind: 'waterskin_empty' },
  },
  deer_meat: {
    kind: 'deer_meat',
    label: 'mięso sarny',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 134 — knife-harvest from a dead sarna (`AnimalAgent.harvestMeat`, species-mapped in `createApp.ts`). Cooks to roasted_meat like raw_meat.',
    consumable: { need: 'hunger', relief: 16 },
  },
  wolf_meat: {
    kind: 'wolf_meat',
    label: 'mięso wilka',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 134 — knife-harvest from a dead wolf. Cooks to roasted_meat like raw_meat.',
    consumable: { need: 'hunger', relief: 12 },
  },
  boar_meat: {
    kind: 'boar_meat',
    label: 'mięso dzika',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 134 — knife-harvest from a dead boar. Cooks to roasted_meat like raw_meat.',
    consumable: { need: 'hunger', relief: 17 },
  },
  rabbit_meat: {
    kind: 'rabbit_meat',
    label: 'mięso królika',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 134 — knife-harvest from a dead rabbit; small yield matches the animal size. Cooks to roasted_meat like raw_meat.',
    consumable: { need: 'hunger', relief: 10 },
  },
  beef: {
    kind: 'beef',
    label: 'wołowina',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 134 — knife-harvest from a dead cow; largest single yield. Cooks to roasted_meat like raw_meat.',
    consumable: { need: 'hunger', relief: 20 },
  },
  hide: {
    kind: 'hide',
    label: 'skóra',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 134 — secondary knife-harvest yield from any dead animal corpse, alongside its species meat (`createApp.ts`\'s `startHarvestMeat`). Sellable to Kupiec.',
  },
  cheese: {
    kind: 'cheese',
    label: 'ser',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 134 — buy from Kupiec; dense, filling, keeps well.',
    consumable: { need: 'hunger', relief: 20 },
  },
  dried_meat: {
    kind: 'dried_meat',
    label: 'suszone mięso',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 134 — buy from Kupiec; light, long-lasting travel food.',
    consumable: { need: 'hunger', relief: 25 },
  },
  coin: {
    kind: 'coin',
    label: 'moneta',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 129 — first physical currency: quest reward item + price paid for a settlement sale plot (`settlement/landPurchase.ts`). Stacks like any other item; near-zero weight so a land-plot price does not blow the carry limit. Not sold/bought by the merchant (separate from the shell/barter trade economy).',
  },
  herb: {
    kind: 'herb',
    label: 'zioło lecznicze',
    holdable: false,
    melee: null,
    spawn: 'world_chunk',
    modelUrl: null,
    notes: 'Plan 153 — world chunk collectible (same flora pool as mushroom/flower, `terrain/chunkItems.ts`). Small, free healing source.',
    consumable: { need: 'health', relief: 8 },
  },
  bandage: {
    kind: 'bandage',
    label: 'opatrunek',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 153 — Kupiec stock. Reliable, purchasable healing; stronger than a herb.',
    consumable: { need: 'health', relief: 35 },
  },
  damascus_knife: {
    kind: 'damascus_knife',
    label: 'nóż damasceński',
    holdable: true,
    melee: { damage: 16, range: 1.6, arcDot: 0.6, windUp: 0.11, hitWindow: 0.08, recovery: 0.16, staminaCost: 4 },
    defense: { canBlock: true, baseBlockChance: 0.16, partialReduction: 0.4 },
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 160 — Kupiec stock. Better knife; still harvests corpses. No GLB yet; procedural held/drop mesh.',
  },
  damascus_short_sword: {
    kind: 'damascus_short_sword',
    label: 'krótki miecz damasceński',
    holdable: true,
    melee: { damage: 24, range: 2.15, arcDot: 0.5, windUp: 0.16, hitWindow: 0.1, recovery: 0.22, staminaCost: 7 },
    defense: { canBlock: true, baseBlockChance: 0.26, partialReduction: 0.5 },
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 160 — Kupiec stock. Faster/stronger short sword. No GLB yet; procedural held/drop mesh.',
  },
  damascus_long_sword: {
    kind: 'damascus_long_sword',
    label: 'długi miecz damasceński',
    holdable: true,
    melee: { damage: 40, range: 2.65, arcDot: 0.35, windUp: 0.27, hitWindow: 0.12, recovery: 0.36, staminaCost: 13 },
    defense: { canBlock: true, baseBlockChance: 0.34, partialReduction: 0.6 },
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 160 — quest reward (grozny-wilk), not Kupiec stock. Elite long sword. No GLB yet; procedural held/drop mesh.',
  },
  obsidian_sword: {
    kind: 'obsidian_sword',
    label: 'obsydianowy miecz',
    holdable: true,
    melee: { damage: 46, range: 2.5, arcDot: 0.38, windUp: 0.24, hitWindow: 0.11, recovery: 0.32, staminaCost: 11 },
    defense: { canBlock: true, baseBlockChance: 0.22, partialReduction: 0.45 },
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 160 — quest reward (wilcza-jama), not Kupiec stock. Volcanic-glass blade, highest offense, weaker block. No GLB yet; procedural held/drop mesh. Durability is plan 161.',
  },
  battle_axe: {
    kind: 'battle_axe',
    label: 'topór bojowy',
    holdable: true,
    melee: { damage: 28, range: 2.15, arcDot: 0.28, windUp: 0.38, hitWindow: 0.14, recovery: 0.5, staminaCost: 14 },
    defense: { canBlock: true, baseBlockChance: 0.24, partialReduction: 0.5 },
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 160 — Kupiec stock. Heavier axe that still chops trees (`isChopTool`). No GLB yet; procedural held/drop mesh.',
  },
  masterwork_sword: {
    kind: 'masterwork_sword',
    label: 'mistrzowski miecz',
    holdable: true,
    melee: { damage: 34, range: 2.6, arcDot: 0.35, windUp: 0.26, hitWindow: 0.12, recovery: 0.34, staminaCost: 12 },
    defense: { canBlock: true, baseBlockChance: 0.32, partialReduction: 0.58 },
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 160 — Kupiec stock. High-quality steel long sword, cheaper than damascus long. No GLB yet; procedural held/drop mesh.',
  },
}

/** Tree-chop tools (plan 160) — battle_axe reuses the existing axe harvest flow. */
export function isChopTool(kind: ItemKind | null | undefined): boolean {
  return kind === 'axe' || kind === 'battle_axe'
}

/** Corpse-harvest knives (plan 160) — damascus_knife is a knife variant. */
export function isHarvestKnife(kind: ItemKind | null | undefined): boolean {
  return kind === 'knife' || kind === 'damascus_knife'
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
