import type { LiquidContent } from './itemInstances'
import type { ItemKind } from './items'
/**
 * Machine-readable item catalog for Seedvale.
 * Prefer this (or docs/items/CATALOG.md) over grepping scattered ITEM_DEFS / spawners.
 *
 * Source of truth for *labels/weights* remains `ITEM_DEFS` in `items.ts`.
 * This file adds gameplay/AI-facing flags (hold, melee, spawn, assets, roadmap).
 */
import { DRINK_THIRST_RELIEF } from '../world/WaterSource'

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

/** Ranged attack tuning for a held bow (plan 162) — the ranged counterpart of
 *  `MeleeConfig`, read directly by `player/playerRanged.ts` and the shared
 *  projectile resolver instead of a parallel "bow system". */
export type RangedConfig = {
  damage: number
  /** Max projectile travel distance (world units). */
  range: number
  /** World units/second the projectile travels. */
  projectileSpeed: number
  /** Seconds from draw request until release: the NPC auto-fire delay, and
   *  for the player (real press-to-draw/release-to-fire input) the minimum
   *  hold before an early release counts as a cancel instead of a fire —
   *  see `combat/rangedLifecycle.ts`'s `manualRelease`. */
  drawTime: number
  /** Seconds after release before another shot can be requested. */
  recovery: number
  staminaCost: number
  /** Base `[0,1]` accuracy before the `archery` skill bonus — see
   *  `combat/rangedAttack.ts`'s `rangedAccuracy`. Lower values widen the
   *  aim-deviation cone the projectile is actually fired into. */
  accuracy: number
  /** Compatible ammo, tried in order — the first kind the shooter is
   *  carrying is consumed. */
  ammoKinds: readonly ItemKind[]
  /** Optional flat addition to the shared critical-hit chance. */
  criticalChance?: number
  criticalMultiplier?: number
}

/** Declarative gameplay capability of an item kind — the answer to "can this
 *  item perform this operation?" for operations that have **no per-item
 *  tuning** (unlike `melee`/`ranged`/`defense`/`consumable`, which are already
 *  capability-carrying *configs* and stay exactly as they are — plan 184 §7).
 *
 *  Each entry is an operation an existing gameplay system gates on, named
 *  after the operation rather than after the tool that happens to perform it
 *  today, so a future variant (`iron_shovel`, another chopping tool) only has
 *  to declare the capability here instead of being added to scattered
 *  `kind === 'shovel'` checks. */
export type ItemCapability =
  /** Fell/limb a world tree (`world/treeHarvest.ts`). */
  | 'wood_chopping'
  /** Butcher a dead animal for meat/hide (`fauna/AnimalAgent.ts`). */
  | 'meat_harvesting'
  /** Cut a branch off an inspected tree — the small-blade yield bonus in
   *  `app/gameLoop.ts`. Same items as `meat_harvesting` today, different
   *  operation: a chopping-only or butchering-only tool is plausible. */
  | 'branch_trimming'
  /** Move earth: dig/level soil, bury a corpse, dig a well pit. */
  | 'soil_digging'
  /** Break stone: dig/level mountain rock and extract ore from a deposit. */
  | 'rock_mining'
  /** Strike a flame (fires, torches) — never consumed. */
  | 'fire_starting'
  /** Cast at a lake shore (`world/fishing.ts`). */
  | 'fishing'

/** Genitive Polish phrase used after "Potrzebujesz …" when an action is
 *  refused for a missing capability — keeps requirement messages capability-
 *  worded instead of naming one specific tool the player might not own. */
export const CAPABILITY_NEED_LABEL: Record<ItemCapability, string> = {
  branch_trimming: 'noża',
  fire_starting: 'krzesiwa',
  fishing: 'wędki',
  meat_harvesting: 'noża do oprawiania',
  rock_mining: 'narzędzia do kucia w skale',
  soil_digging: 'narzędzia do kopania',
  wood_chopping: 'narzędzia do rąbania',
}

/** What a `consumable` item restores — `hunger`/`thirst` map to a
 *  `PlayerNeeds` pool, `health` heals `HealthState` directly (plan 153). */
export type ConsumableNeed = 'hunger' | 'thirst' | 'health'

/** `backpack`'s `carryCapacityBonus` (plan 186) — a meaningful jump over the
 *  player's `DEFAULT_MAX_WEIGHT` (20 kg, `Inventory.ts`) without trivializing
 *  the existing overload thresholds (`player/playerEncumbrance.ts`). */
const BACKPACK_CAPACITY_BONUS_KG = 15

export type ItemCatalogEntry = {
  kind: ItemKind
  /** Polish label — mirrors ITEM_DEFS. */
  label: string
  /** Can occupy HeldTool slot + Weź in inventory. */
  holdable: boolean
  /** Operations this kind can perform (plan 184). Absent/empty = none.
   *  The single source of truth for every tool-requirement gate — see
   *  `hasItemCapability` / `Inventory.hasCapability`. */
  capabilities?: readonly ItemCapability[]
  /** Player melee vs animals while held (plan 123 — `player/playerMelee.ts`). */
  melee: MeleeConfig | null
  /** Optional block parameters while held (plan 150 — `combat/defenseResolver.ts`). */
  defense?: DefenseConfig | null
  /** Ranged attack vs animals while held (plan 162 — `player/playerRanged.ts`). */
  ranged?: RangedConfig | null
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
  /** Plan 159 — food metadata beyond `consumable` (which already carries the
   *  hunger/thirst/health value). `freshness` durations are in game-days;
   *  absent means the item never spoils (e.g. `honey`). `bait` marks a food
   *  item usable both as fishing bait and trap bait — one central flag for
   *  both mechanics, no separate bait item kinds. */
  food?: {
    freshness?: { freshDurationDays: number, mediumDurationDays: number }
    bait?: 'meat' | 'plant'
  }
  /** Kilograms added to `Inventory.maxWeight` per unit of this kind actually
   *  carried (plan 186) — a backpack is an ordinary item, not a second
   *  capacity/equipment system; `Inventory`'s `maxWeight` getter sums this
   *  over held counts. Absent/0 for every kind that isn't a capacity item. */
  carryCapacityBonus?: number
  /** Plan items-player-001 §7 — the shared container model for waterskins/
   *  buckets (and later a barrel). `capacityLiters` is the per-instance
   *  capacity; `kind` is one of `LiquidContainerKind` (`itemInstances.ts`) and
   *  its actual held content/amount lives on the concrete
   *  `LiquidContainerItemInstance`, not here — this is only the static
   *  per-kind definition (`items/liquidContainer.ts` reads it). */
  container?: { capacityLiters: number, allowedContents: readonly LiquidContent[] }
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

/**
 * @domain items-player
 * @system item-catalog
 * @role Single source of truth for per-`ItemKind` gameplay flags and tool-capability gates.
 * @owns ItemCatalogEntry
 */
export const ITEM_CATALOG: Record<ItemKind, ItemCatalogEntry> = {
  shell: {
    kind: 'shell',
    label: 'muszla',
    holdable: false,
    melee: null,
    spawn: 'village_renewable',
    modelUrl: null,
    notes: 'Procedural mesh; renewable near settlement. Barter token (issue 035) — Kupiec does not buy or sell shells for coins.',
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
  beam: {
    kind: 'beam',
    label: 'belka',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 187 — bucking yield alongside branch, produced once at the authoritative felled→harvested tree-harvest transition (`world/treeLifecycle.ts`\'s `advanceHarvest`/`harvestFully`). Structural construction material, resolved from inventory or nearby dropped items at the construction-material boundary (`items/constructionMaterials.ts`). Also valid campfire fuel (`settlement/VillageFire.ts`\'s `FIRE_FUEL_KINDS`) — unlike `branch`, never a hand torch (`PlayerTorch.ts`\'s `TorchSource` stays branch/wooden_torch only).',
  },
  mushroom: {
    kind: 'mushroom',
    label: 'grzyb',
    holdable: false,
    melee: null,
    spawn: 'world_chunk',
    modelUrl: null,
    notes: 'Plan 159 — World chunk collectible; also a natural food source and plant-category bait.',
    consumable: { need: 'hunger', relief: 8 },
    food: { freshness: { freshDurationDays: 1.5, mediumDurationDays: 1.5 }, bait: 'plant' },
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
    capabilities: ['branch_trimming', 'meat_harvesting'],
    melee: { damage: 12, range: 1.6, arcDot: 0.6, windUp: 0.12, hitWindow: 0.08, recovery: 0.18, staminaCost: 4 },
    defense: { canBlock: true, baseBlockChance: 0.12, partialReduction: 0.35 },
    spawn: 'starting',
    modelUrl: '/models/items/knife.glb',
    notes: 'Starting loadout; held visual on Wrist.R; melee on animals. Fast/narrow (plan 123).',
  },
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
    modelUrl: '/models/items/spear.glb',
    notes: 'Plan 134 — Kupiec stock. Quaternius Medieval Weapons `Spear`. Longest range, narrow thrust arc.',
  },
  short_sword: {
    kind: 'short_sword',
    label: 'krótki miecz',
    holdable: true,
    melee: { damage: 18, range: 2.1, arcDot: 0.5, windUp: 0.18, hitWindow: 0.1, recovery: 0.26, staminaCost: 7 },
    defense: { canBlock: true, baseBlockChance: 0.22, partialReduction: 0.45 },
    spawn: 'none',
    modelUrl: '/models/items/short_sword.glb',
    notes: 'Plan 134 — Kupiec stock. Quaternius Medieval Weapons `Sword` (plain steel). Lighter/faster than long_sword.',
  },
  firestarter: {
    kind: 'firestarter',
    label: 'krzesiwo',
    holdable: true,
    capabilities: ['fire_starting'],
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
    capabilities: ['soil_digging'],
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
    capabilities: ['wood_chopping'],
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
    capabilities: ['rock_mining'],
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
    notes: 'Plan 141 / issue 035 — buy from Kupiec; set down from Inventory ("Zastaw") or Quick Actions, then `[E]` to arm. Placed world object (`world/createPlacedTraps.ts`), not a `HeldTool`. Low durability, high detection chance, poor weather resistance.',
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
  pan: {
    kind: 'pan',
    label: 'patelnia',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 175 — Kupiec stock. An inventory capability, not a `HeldTool`/cooking station: simply carrying one raises cooking capacity to 2 (`items/campfireCooking.ts`\'s `resolveCookingCapacity`) — overridden, not stacked, by a fire\'s own grate.',
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
  copper_ore: {
    kind: 'copper_ore',
    label: 'ruda miedzi',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan items-player-001 — pickaxe yield from copper deposits, same `terrain/resourceDeposits.ts` pipeline as iron/coal/gold.',
  },
  copper: {
    kind: 'copper',
    label: 'miedź',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan items-player-001 §5.2/§11 — future `copper_ore` smelting output, not implemented. Not Kupiec stock (unlike `iron_rod`\'s "no smelting, buy the bar" shortcut) — deliberately unobtainable until that processing step exists, per the plan\'s own review notes.',
  },
  iron_rod: {
    kind: 'iron_rod',
    label: 'żelazny pręt',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 175 — Kupiec stock. Processed construction material, deliberately separate from the raw `iron` resource — required by the grate build (`GRATE_COST`, `app/userActions.ts`). No in-world smelting/production chain exists yet; out of this plan\'s scope.',
    roadmap: 'A future smithing/smelting system could let players produce this from `iron` instead of buying it.',
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
    food: { freshness: { freshDurationDays: 1, mediumDurationDays: 1 }, bait: 'meat' },
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
    food: { freshness: { freshDurationDays: 1.5, mediumDurationDays: 1.5 } },
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
    notes: 'Legacy (plan 106) — no longer Kupiec stock. Not obtainable in a fresh game; only ever seen in an old save, converted to a `waterskin_medium` instance by `migrateLegacyWaterskinsToInstances()` before gameplay ever reads it.',
  },
  waterskin_full: {
    kind: 'waterskin_full',
    label: 'bukłak (pełny)',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Legacy (plan 106) — same migrated-away status as `waterskin_empty`, converted to a full-of-water `waterskin_medium` instance.',
  },
  waterskin_small: {
    kind: 'waterskin_small',
    label: 'mały bukłak',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    container: { capacityLiters: 2, allowedContents: ['water'] },
    notes: 'Plan items-player-001 — leather, buy from Kupiec (future leatherworker source); fill to full at a well/lake `[R]`. Instance-backed (`items/liquidContainer.ts`) — replaces plan 106\'s binary waterskin_empty/waterskin_full swap with one kind covering empty through full via its own `LiquidContainerItemInstance` state. Not a `HeldTool` slot item.',
    consumable: { need: 'thirst', relief: DRINK_THIRST_RELIEF },
  },
  waterskin_medium: {
    kind: 'waterskin_medium',
    label: 'średni bukłak',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    container: { capacityLiters: 5, allowedContents: ['water'] },
    notes: 'Plan items-player-001 — leather, buy from Kupiec (future leatherworker source); fill to full at a well/lake `[R]`.',
    consumable: { need: 'thirst', relief: DRINK_THIRST_RELIEF },
  },
  waterskin_large: {
    kind: 'waterskin_large',
    label: 'duży bukłak',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    container: { capacityLiters: 10, allowedContents: ['water'] },
    notes: 'Plan items-player-001 — leather, buy from Kupiec (future leatherworker source); fill to full at a well/lake `[R]`.',
    consumable: { need: 'thirst', relief: DRINK_THIRST_RELIEF },
  },
  wooden_bucket: {
    kind: 'wooden_bucket',
    label: 'drewniane wiadro',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    container: { capacityLiters: 10, allowedContents: ['water', 'milk'] },
    notes: 'Plan items-player-001 — wood, buy from Kupiec (no recipe yet). Instance-backed (`items/liquidContainer.ts`), same as the waterskins. Domain container only: milking/drink-from-bucket world interactions are deferred to the future interaction-window plan (§9).',
  },
  copper_bucket: {
    kind: 'copper_bucket',
    label: 'miedziane wiadro',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    container: { capacityLiters: 10, allowedContents: ['water', 'milk'] },
    notes: 'Plan items-player-001 §5/§11 — copper, future blacksmith smithing/crafting output. Not Kupiec stock yet (unlike `wooden_bucket`) — copper items stay acquisition-less until copper processing/smithing exists, same as `copper` itself. Same deferred interactions as `wooden_bucket`.',
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
    food: { freshness: { freshDurationDays: 1, mediumDurationDays: 1 }, bait: 'meat' },
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
    food: { freshness: { freshDurationDays: 1, mediumDurationDays: 1 }, bait: 'meat' },
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
    food: { freshness: { freshDurationDays: 1, mediumDurationDays: 1 }, bait: 'meat' },
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
    food: { freshness: { freshDurationDays: 1, mediumDurationDays: 1 }, bait: 'meat' },
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
    food: { freshness: { freshDurationDays: 1, mediumDurationDays: 1 }, bait: 'meat' },
  },
  egg: {
    kind: 'egg',
    label: 'jajko',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan fauna-002 — laid by a live chicken (`fauna/AnimalAgent.ts`\'s per-animal production timer) and dropped into the world at its position (`items/createDroppedItems.ts`); picked up through the normal item-pickup path, no dedicated egg entity. Eaten raw — cooking/processing eggs is out of scope for plan fauna-002.',
    consumable: { need: 'hunger', relief: 12 },
    food: { freshness: { freshDurationDays: 3, mediumDurationDays: 3 } },
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
    food: { freshness: { freshDurationDays: 20, mediumDurationDays: 20 } },
  },
  coin: {
    kind: 'coin',
    label: 'moneta',
    holdable: false,
    melee: null,
    spawn: 'world_chunk',
    modelUrl: null,
    notes: 'Plan 129 / issue 035 — physical currency: Kupiec buy/sell, rare world_chunk pickup, quest reward, land-plot price (`settlement/landPurchase.ts`). Stacks like any other item; near-zero weight and `XXS` gabarite (`items.ts`) so a land-plot price (up to several thousand) does not blow the carry limit. Shells stay barter-only.',
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
    capabilities: ['branch_trimming', 'meat_harvesting'],
    melee: { damage: 16, range: 1.6, arcDot: 0.6, windUp: 0.11, hitWindow: 0.08, recovery: 0.16, staminaCost: 4 },
    defense: { canBlock: true, baseBlockChance: 0.16, partialReduction: 0.4 },
    spawn: 'none',
    modelUrl: '/models/items/damascus_knife.glb',
    notes: 'Plan 160 — Kupiec stock. Better knife; still harvests corpses. Quaternius Dagger_2 with damascus two-tone steel (teal/pale silver), not gray.',
  },
  damascus_short_sword: {
    kind: 'damascus_short_sword',
    label: 'krótki miecz damasceński',
    holdable: true,
    melee: { damage: 24, range: 2.15, arcDot: 0.5, windUp: 0.16, hitWindow: 0.1, recovery: 0.22, staminaCost: 7 },
    defense: { canBlock: true, baseBlockChance: 0.26, partialReduction: 0.5 },
    spawn: 'none',
    modelUrl: '/models/items/damascus_short_sword.glb',
    notes: 'Plan 160 — Kupiec stock. Faster/stronger short sword. Quaternius Sword_2 (falchion) with damascus two-tone steel.',
  },
  damascus_long_sword: {
    kind: 'damascus_long_sword',
    label: 'długi miecz damasceński',
    holdable: true,
    melee: { damage: 40, range: 2.65, arcDot: 0.35, windUp: 0.27, hitWindow: 0.12, recovery: 0.36, staminaCost: 13 },
    defense: { canBlock: true, baseBlockChance: 0.34, partialReduction: 0.6 },
    spawn: 'none',
    modelUrl: '/models/items/damascus_long_sword.glb',
    notes: 'Plan 160 — quest reward (grozny-wilk), not Kupiec stock. Quaternius Sword_Big with damascus two-tone steel.',
  },
  obsidian_sword: {
    kind: 'obsidian_sword',
    label: 'obsydianowy miecz',
    holdable: true,
    melee: { damage: 46, range: 2.5, arcDot: 0.38, windUp: 0.24, hitWindow: 0.11, recovery: 0.32, staminaCost: 11 },
    defense: { canBlock: true, baseBlockChance: 0.22, partialReduction: 0.45 },
    spawn: 'none',
    modelUrl: '/models/items/obsidian_sword.glb',
    notes: 'Plan 160 — quest reward (wilcza-jama), not Kupiec stock. Quaternius Claymore reminted to volcanic-glass purple/black, not gray steel. Durability is plan 161.',
  },
  battle_axe: {
    kind: 'battle_axe',
    label: 'topór bojowy',
    holdable: true,
    capabilities: ['wood_chopping'],
    melee: { damage: 28, range: 2.15, arcDot: 0.28, windUp: 0.38, hitWindow: 0.14, recovery: 0.5, staminaCost: 14 },
    defense: { canBlock: true, baseBlockChance: 0.24, partialReduction: 0.5 },
    spawn: 'none',
    modelUrl: '/models/items/battle_axe.glb',
    notes: 'Plan 160 — Kupiec stock. Heavier axe that still chops trees (`wood_chopping` capability). Quaternius Axe Double.',
  },
  masterwork_sword: {
    kind: 'masterwork_sword',
    label: 'mistrzowski miecz',
    holdable: true,
    melee: { damage: 34, range: 2.6, arcDot: 0.35, windUp: 0.26, hitWindow: 0.12, recovery: 0.34, staminaCost: 12 },
    defense: { canBlock: true, baseBlockChance: 0.32, partialReduction: 0.58 },
    spawn: 'none',
    modelUrl: '/models/items/masterwork_sword.glb',
    notes: 'Plan 160 — Kupiec stock. Quaternius Sword_Golden — gold blade, not damascus.',
  },
  berries: {
    kind: 'berries',
    label: 'jagody',
    holdable: false,
    melee: null,
    spawn: 'world_chunk',
    modelUrl: null,
    notes: 'Plan 159 — world chunk collectible (same flora pool as mushroom/herb, `terrain/chunkItems.ts`). Perishes fast; plant-category bait.',
    consumable: { need: 'hunger', relief: 8 },
    food: { freshness: { freshDurationDays: 1, mediumDurationDays: 1 }, bait: 'plant' },
  },
  apple: {
    kind: 'apple',
    label: 'jabłko',
    holdable: false,
    melee: null,
    spawn: 'village_renewable',
    modelUrl: null,
    notes: 'Plan 159 — renewable pickup anchored near settlement trees, same mechanism as `branch` (`items/createItemSpawners.ts`).',
    consumable: { need: 'hunger', relief: 10 },
    food: { freshness: { freshDurationDays: 2, mediumDurationDays: 2 }, bait: 'plant' },
  },
  nuts: {
    kind: 'nuts',
    label: 'orzechy',
    holdable: false,
    melee: null,
    spawn: 'world_chunk',
    modelUrl: null,
    notes: 'Plan 159 — world chunk collectible (same flora pool as mushroom/herb). Keeps well.',
    consumable: { need: 'hunger', relief: 12 },
    food: { freshness: { freshDurationDays: 5, mediumDurationDays: 5 }, bait: 'plant' },
  },
  honey: {
    kind: 'honey',
    label: 'miód',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 159 — collected from a wild hive (`world/beehives.ts`), time-based production. Never spoils.',
    consumable: { need: 'hunger', relief: 18 },
  },
  carrot: {
    kind: 'carrot',
    label: 'marchew',
    holdable: false,
    melee: null,
    spawn: 'village_renewable',
    modelUrl: null,
    notes: 'Plan 159 — renewable garden-pad pickup, same mechanism as `tomato`. Plan 172 also adds wild natural-crop placements (`terrain/chunkCrops.ts`) with a young/mature/spoiled lifecycle — a second, independent source of the same item, not a replacement for the garden pickup.',
    consumable: { need: 'hunger', relief: 10 },
    food: { freshness: { freshDurationDays: 3, mediumDurationDays: 3 }, bait: 'plant' },
  },
  potato: {
    kind: 'potato',
    label: 'ziemniak',
    holdable: false,
    melee: null,
    spawn: 'village_renewable',
    modelUrl: null,
    notes: 'Plan 159 — renewable garden-pad pickup, same mechanism as `tomato`. Plan 172 also adds wild natural-crop placements (`terrain/chunkCrops.ts`) with a young/mature/spoiled lifecycle — a second, independent source of the same item, not a replacement for the garden pickup.',
    consumable: { need: 'hunger', relief: 12 },
    food: { freshness: { freshDurationDays: 4, mediumDurationDays: 4 }, bait: 'plant' },
  },
  cabbage: {
    kind: 'cabbage',
    label: 'kapusta',
    holdable: false,
    melee: null,
    spawn: 'village_renewable',
    modelUrl: null,
    notes: 'Plan 159 — renewable garden-pad pickup, same mechanism as `tomato`. Plan 172 also adds wild natural-crop placements (`terrain/chunkCrops.ts`) with a young/mature/spoiled lifecycle — a second, independent source of the same item, not a replacement for the garden pickup.',
    consumable: { need: 'hunger', relief: 10 },
    food: { freshness: { freshDurationDays: 2, mediumDurationDays: 2 } },
  },
  fish: {
    kind: 'fish',
    label: 'ryba',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 159 — caught with `fishing_rod` at a lake shore (`world/fishing.ts`). Perishes fastest of all food; dry it or eat it quickly.',
    consumable: { need: 'hunger', relief: 12 },
    food: { freshness: { freshDurationDays: 0.75, mediumDurationDays: 0.75 } },
  },
  dried_fish: {
    kind: 'dried_fish',
    label: 'suszona ryba',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 159 — dried from `fish` at a drying rack (`world/dryingRacks.ts`), mirrors `dried_meat`.',
    consumable: { need: 'hunger', relief: 22 },
    food: { freshness: { freshDurationDays: 20, mediumDurationDays: 20 } },
  },
  roasted_fish: {
    kind: 'roasted_fish',
    label: 'pieczona ryba',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan items-player-012 — cooked from `fish` at a lit campfire (`items/campfireCooking.ts`), mirrors `roasted_meat`. A distinct food identity, never converted into `roasted_meat`.',
    consumable: { need: 'hunger', relief: 18 },
    food: { freshness: { freshDurationDays: 1.5, mediumDurationDays: 1.5 } },
  },
  fishing_rod: {
    kind: 'fishing_rod',
    label: 'wędka',
    holdable: true,
    capabilities: ['fishing'],
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 159 — Kupiec stock. Held tool; `[E]` at a lake shore casts, `[R]` applies bait from inventory.',
  },
  whetstone: {
    kind: 'whetstone',
    label: 'osełka',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 161 — Kupiec stock. Stackable; consumed one at a time by `sharpenWeapon()` on a supported weapon instance.',
  },
  short_bow: {
    kind: 'short_bow',
    label: 'krótki łuk',
    holdable: true,
    melee: null,
    ranged: { damage: 14, range: 11, projectileSpeed: 26, drawTime: 0.32, recovery: 0.22, staminaCost: 6, accuracy: 0.72, ammoKinds: ['arrow', 'broadhead_arrow', 'war_arrow'] },
    spawn: 'none',
    modelUrl: '/models/items/short_bow.glb',
    notes: 'Plan 162 — Kupiec stock. Fast draw, short range, lowest damage of the three bows.',
  },
  hunting_bow: {
    kind: 'hunting_bow',
    label: 'łuk myśliwski',
    holdable: true,
    melee: null,
    ranged: { damage: 20, range: 15, projectileSpeed: 30, drawTime: 0.45, recovery: 0.3, staminaCost: 8, accuracy: 0.78, ammoKinds: ['arrow', 'broadhead_arrow', 'war_arrow'], criticalChance: 0.05 },
    spawn: 'none',
    modelUrl: '/models/items/hunting_bow.glb',
    notes: 'Plan 162 — Kupiec stock. Balanced range/damage/draw speed.',
  },
  long_bow: {
    kind: 'long_bow',
    label: 'długi łuk',
    holdable: true,
    melee: null,
    ranged: { damage: 28, range: 20, projectileSpeed: 34, drawTime: 0.65, recovery: 0.4, staminaCost: 11, accuracy: 0.7, ammoKinds: ['arrow', 'broadhead_arrow', 'war_arrow'], criticalChance: 0.08 },
    spawn: 'none',
    modelUrl: '/models/items/long_bow.glb',
    notes: 'Plan 162 — Kupiec stock. Longest range/highest damage, slowest draw.',
  },
  arrow: {
    kind: 'arrow',
    label: 'strzała',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: '/models/items/arrow.glb',
    notes: 'Plan 162 — Kupiec stock. Base ammo for every bow; ordinary stackable count, no per-arrow instance/recovery.',
  },
  broadhead_arrow: {
    kind: 'broadhead_arrow',
    label: 'strzała łowiecka',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: '/models/items/arrow.glb',
    notes: 'Plan 162 — Kupiec stock. +damage ammo variant, same consumption/acquisition path as `arrow`.',
  },
  war_arrow: {
    kind: 'war_arrow',
    label: 'strzała bojowa',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: '/models/items/arrow.glb',
    notes: 'Plan 162 — Kupiec stock. Heaviest, highest-damage ammo variant.',
  },
  chest: {
    kind: 'chest',
    label: 'skrzynia',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 164 — Kupiec stock. Placed world container (`world/createPlacedContainers.ts`), not a `HeldTool`. Bought empty; place with Quick Actions, `[E]` opens the transfer screen, `[R]` picks it back up (with contents).',
  },
  backpack: {
    kind: 'backpack',
    label: 'plecak',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    carryCapacityBonus: BACKPACK_CAPACITY_BONUS_KG,
    notes: 'Plan 186 — Kupiec stock. Ordinary carried item, not equipment: simply holding it in `Inventory` raises `Inventory.maxWeight` by `carryCapacityBonus` (stacks if more than one is carried). Must fit under the *pre-bonus* capacity to be picked up in the first place.',
  },
  saddlebags: {
    kind: 'saddlebags',
    label: 'juki',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan items-player-001 §4.2 — leather, buy from Kupiec (future leatherworker source). Inert carried item today: the animal-equip/transport-capacity mechanic (fitting these to a horse/donkey) is a future plan, not this one.',
  },
  tree_seed: {
    kind: 'tree_seed',
    label: 'nasiono drzewa',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 126 — Kupiec stock. Consumed by the "Zasadź drzewo" Quick Action; the planted tree\'s species is chosen from local habitat suitability (`world/plantedTrees.ts`), same signal procedural placement uses, not a per-species seed item.',
  },
  seed_carrot: {
    kind: 'seed_carrot',
    label: 'nasiona marchwi',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 126 — Kupiec stock. Consumed by "Zasadź: marchew"; plants a `carrot` `CropLifecycle` (plan 172) entity in a settlement garden.',
  },
  seed_potato: {
    kind: 'seed_potato',
    label: 'sadzeniaki ziemniaka',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 126 — Kupiec stock. Consumed by "Zasadź: ziemniak"; plants a `potato` `CropLifecycle` (plan 172) entity in a settlement garden.',
  },
  seed_cabbage: {
    kind: 'seed_cabbage',
    label: 'nasiona kapusty',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan 126 — Kupiec stock. Consumed by "Zasadź: kapusta"; plants a `cabbage` `CropLifecycle` (plan 172) entity in a settlement garden.',
  },
  map_near: {
    kind: 'map_near',
    label: 'mapa okolicy',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan world-012 — Kupiec stock. A knowledge-delivery token: purchase reveals nearby (0-20 km) landmarks/settlements into `LocationKnowledge` immediately; the item itself has no other effect.',
  },
  map_far: {
    kind: 'map_far',
    label: 'mapa dalekich stron',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan world-012 — Kupiec stock. A knowledge-delivery token: purchase reveals distant (60-200 km) landmarks/settlements into `LocationKnowledge` immediately; the item itself has no other effect.',
  },
  rope: {
    kind: 'rope',
    label: 'lina',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan world-004 — Kupiec stock. Ordinary carried item, not a `HeldTool`/capability: simply carrying at least one lets a deep player-built well be drawn from (drink/fill), never consumed. See `world/wellGroundwater.ts`\'s `DEEP_WELL_DEPTH_THRESHOLD`.',
  },
  hay: {
    kind: 'hay',
    label: 'siano',
    holdable: false,
    melee: null,
    spawn: 'none',
    modelUrl: null,
    notes: 'Plan fauna-010 — livestock feed, not human food/`HeldTool`. Trickles into a household\'s `items` from a temporary lazy hay source (`settlement/household.ts`\'s `resolveHayForage`); an `AnimalDef.diet` decides which herbivore species may eat it.',
  },
}

/** Flat per-arrow-kind damage delta applied on top of the bow's own
 *  `RangedConfig.damage` (plan 162) — keeps arrow variance out of the bow
 *  catalog entries and out of the projectile resolver's hard-coded logic. */
export const ARROW_DAMAGE_BONUS: Partial<Record<ItemKind, number>> = {
  broadhead_arrow: 4,
  war_arrow: 8,
}

/** Ranged-capable held tools — mirrors `isMeleeTool` (`fauna/faunaCombat.ts`),
 *  a type predicate so callers narrow `held` before indexing `ITEM_CATALOG`. */
export function isRangedTool<K extends ItemKind | null | undefined>(kind: K): kind is Extract<K, ItemKind> {
  return kind != null && ITEM_CATALOG[kind]?.ranged != null
}

/** Melee-capable held tools — the items-domain mirror of `isMeleeTool`
 *  (`fauna/faunaCombat.ts`, which additionally narrows to `MeleeToolKind` for
 *  combat code). Kept here too so items-domain callers (e.g. primary-weapon
 *  shortcuts) don't need to reach into `fauna/` for a plain capability check. */
export function isMeleeToolKind<K extends ItemKind | null | undefined>(kind: K): kind is Extract<K, ItemKind> {
  return kind != null && ITEM_CATALOG[kind]?.melee != null
}

/** Item kinds that hold the single "in hand" slot — derived from
 *  `holdable` rather than hand-listed, so a new holdable kind never has to be
 *  added to a second set (`items/HeldTool.ts`'s `isToolKind` reads this). */
export const HOLDABLE_KINDS: readonly ItemKind[] = (Object.keys(ITEM_CATALOG) as ItemKind[])
  .filter((kind) => ITEM_CATALOG[kind].holdable)

/** Kinds declaring each capability, **best first**: higher melee damage wins
 *  (the catalog's only quality signal between tool variants — it is what makes
 *  `damascus_knife` "a better knife" than `knife`), ties broken by catalog key
 *  order so the result is always deterministic. Callers that auto-pick a tool
 *  (`Inventory.findWithCapability`) therefore keep plan 160's "prefer the
 *  damascus knife" behaviour without a second hand-written knife list. */
export const CAPABILITY_KINDS: Record<ItemCapability, readonly ItemKind[]> = (() => {
  const out = {} as Record<ItemCapability, ItemKind[]>
  const order = Object.keys(ITEM_CATALOG) as ItemKind[]
  for (const kind of order) {
    for (const capability of ITEM_CATALOG[kind].capabilities ?? []) {
      (out[capability] ??= []).push(kind)
    }
  }
  const rank = new Map(order.map((kind, index) => [kind, index]))
  for (const list of Object.values(out)) {
    list.sort((a, b) => {
      const damage = (ITEM_CATALOG[b].melee?.damage ?? -1) - (ITEM_CATALOG[a].melee?.damage ?? -1)
      return damage !== 0 ? damage : rank.get(a)! - rank.get(b)!
    })
  }
  for (const capability of Object.keys(CAPABILITY_NEED_LABEL) as ItemCapability[]) {
    out[capability] ??= []
  }
  return out
})()

/** Does this kind declare `capability`? The single tool-requirement query for
 *  *held* checks (plan 184) — `Inventory.hasCapability` is its "anywhere in
 *  the bag" counterpart. Null-tolerant so callers can pass `heldTool.held()`
 *  straight through. */
export function hasItemCapability(kind: ItemKind | null | undefined, capability: ItemCapability): boolean {
  return kind != null && (ITEM_CATALOG[kind].capabilities?.includes(capability) ?? false)
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
