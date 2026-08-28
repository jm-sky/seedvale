# Item catalog — Seedvale

**Purpose:** single place for agents/humans to see what each item does, what is
implemented, and what is planned. Code source of truth for weights/labels:
[`src/items/items.ts`](../../src/items/items.ts) (`ITEM_DEFS`). Flags/roadmap:
[`src/items/itemCatalog.ts`](../../src/items/itemCatalog.ts).

**Last updated:** 2026-08-28 (plan settlements-npcs-001 — buckets wired to the well/lake `[R]` fill action and to watering a player garden plot)

## Quick rules

| Concern | Where |
|---------|--------|
| Inventory weight / label | `ITEM_DEFS` |
| Gabarite / size (plan 164) | `ITEM_DEFS[kind].size` (`ItemSize`: `XS`\|`SM`\|`MD`\|`LG`\|`XL`) — independent of `weight`; `items/items.ts`'s `ITEM_SIZE_UNITS`/`itemSizeUnits()` convert to abstract capacity units checked by `Inventory.maxSize`/`totalSize()`/`canAdd()` and by container capacity (`items/container.ts`) |
| Holdable (Weź) | `ITEM_CATALOG[kind].holdable` — the single source of truth; `HeldTool.ts`'s `isToolKind` reads the derived `HOLDABLE_KINDS` (plan 184). 21 kinds: knife, firestarter, shovel, axe, wooden_torch, pickaxe, long_sword, spear, short_sword, pitchfork, sickle, damascus_knife, damascus_short_sword, damascus_long_sword, obsidian_sword, battle_axe, masterwork_sword, fishing_rod, short_bow, hunting_bow, long_bow |
| Tool capabilities (plan 184) | `ITEM_CATALOG[kind].capabilities` (`ItemCapability`) — the single source of truth for every "can this item do X?" gate, replacing `kind === 'shovel'` / `isChopTool()` / `isHarvestKnife()` checks. `wood_chopping` (axe, battle_axe) · `meat_harvesting` + `branch_trimming` (knife, damascus_knife) · `soil_digging` (shovel — dig/level soil, bury a corpse, well `pit` stage) · `rock_mining` (pickaxe — rock dig/level + ore deposits) · `fire_starting` (firestarter) · `fishing` (fishing_rod). Query with `hasItemCapability(kind, cap)` for the hand, `Inventory.hasCapability(cap)` for the bag, `Inventory.findWithCapability(cap)` (best-first) when a caller must auto-equip. `melee`/`ranged`/`defense`/`consumable`/`food.bait` stay their own configs — they already answer capability questions. |
| Weapon maintenance (plan 161) | `items/itemInstances.ts`'s `WEAPON_MAINTENANCE_KINDS` (13 kinds: knife, short_sword, long_sword, spear, axe, pitchfork, sickle + the six plan-160 variants) are `ItemInstance`-backed with `durability`/`sharpness` (`[0,1]`, new = 1/1); `shovel`/`pickaxe` are explicitly excluded. `HeldTool.heldInstanceId()` tracks which concrete instance is in hand. `items/weaponMaintenance.ts` — `getSharpnessDamageModifier()` (100%→100%…0%→55%) feeds melee damage before the critical roll; sharpness/durability wear applies once per resolved hit via `Inventory.updateInstance()`. `whetstone` (stackable) + `sharpenWeapon()` restore sharpness only, never durability; no repair/broken lifecycle in v1. |
| Ranged combat (plan 162) | `ITEM_CATALOG[kind].ranged` (`RangedConfig`) on `short_bow`/`hunting_bow`/`long_bow` — `player/playerRanged.ts` runs the draw→release→recovery lifecycle (same shape as melee); `combat/projectile.ts` is the lightweight swept-segment flight/collision model (no visual arrow mesh in v1); `combat/rangedAttack.ts` turns bow accuracy + `archery` skill into aim deviation, not a separate hit-roll. Ammo (`arrow`/`broadhead_arrow`/`war_arrow`) is ordinary stackable count, 1 consumed per shot, no per-arrow instance/recovery. |
| Critical hits (plan 162) | `combat/criticalHit.ts`'s `resolveCriticalHit()` — shared deterministic modifier used by both ranged (`RangedConfig.criticalChance`/`criticalMultiplier`) and melee (flat `MELEE_CRITICAL_CHANCE`/`MELEE_CRITICAL_MULTIPLIER` baseline); evaluated after hit, before defense. |
| Held 3D attach | `heldToolVisual.ts` → `WristR` + `HELD_ATTACH` (Phase 6: migrate per-tool numbers to `grip` anchors via alignment browser) |
| Ground GLB scale | `itemModels.ts` → `preparePropFitMax` (not height-only) |
| Melee vs animals | `ITEM_CATALOG[kind].melee` (plan 123, `itemCatalog.ts`) — single source of truth for damage/range/arcDot/windUp/hitWindow/recovery/staminaCost; `player/playerMelee.ts` runs the windUp→hitWindow→recovery lifecycle + range/facing-arc hit test. `faunaCombat.ts`'s `isMeleeTool()` just reads this. Damage: obsidian_sword 46, damascus_long_sword 40, masterwork_sword 34, long_sword/battle_axe 28, damascus_short_sword 24, spear/axe 20, short_sword 18, damascus_knife 16, pitchfork 14, knife/sickle 12, shovel 8 |
| Village one-time tools | `createItemSpawners.ts` |
| Portable light | `PlayerTorch` — lit branch (90s) or held wooden_torch (240s); exclusive right hand |
| Wood model (plan 187) | `branch` (hand-gathered / axe bonus, torch-capable) vs `beam` (axe-felling bonus yield only, construction + fuel, never a torch) — `world/treeLifecycle.ts`'s `bonusYieldForChopStage`/`FELLING_BEAM_YIELD` fires once, on the authoritative felled→harvested bucking step |
| Campfire fuel (plan 187) | `settlement/VillageFire.ts`'s `FIRE_FUEL_KINDS` (`branch`, `beam`) — `startIgniteFire`/the "dołóż" world action try each kind in order; every unit grants the same `FUEL_PER_BRANCH` seconds regardless of kind |
| Construction materials from the ground (plan 187) | `items/constructionMaterials.ts`'s `hasMaterial`/`consumeMaterial` — resolves a `{ kind, count }` requirement from `Inventory` first, then nearby `DroppedItems` within `CONSTRUCTION_MATERIAL_RADIUS` (3m), closest stack first; atomic (nothing consumed unless the total is sufficient). Wired into `app/actions/placementActions.ts`'s `workOnWell`; kind-agnostic, so a future construction can reuse it without a new storage system |
| Inventory category | `ITEM_DEFS.categories` — `resource` / `tool` / `utility` / `food` / `weapon` (multi-category, e.g. axe = tool + weapon); hunger consumables are `food`, waterskins stay `utility` |
| Consumable (Zjedz/Wypij/Opatrz) | `ITEM_CATALOG[kind].consumable` (plan 106, 153) — `{ need: 'hunger'\|'thirst'\|'health', relief, resultKind? }`; driven from inventory screen (`InventoryScreenItemDetails.vue`), world drink/cook actions, or the world `[R]` quick-action on a pickupable item (`interactables.ts`'s `itemPromptLabel`) |
| Player needs | `player/PlayerNeeds.ts` — stamina/vigor/hunger/thirst pools on `PlayerController.needs`; HUD bars in `HudScreen.vue` (HP first, then the four needs — issue 034) |
| Passive HP regen | `player/PlayerNeeds.ts`'s `tickHealthRegen` (plan 153) — slow, suppressed while starving/dehydrated; herb/bandage heal faster |
| Water source (well/lake) | `world/WaterSource.ts` — `[E]` drink, `[R]` fill waterskin; lake is a synthetic per-frame target (`interactables.ts`'s `isNearLakeShore`), not a discrete world object |
| Cooking (campfire) | `items/campfireCooking.ts` — `raw_meat → roasted_meat` at a lit campfire, `[R]`; plan 134 adds `deer_meat`/`wolf_meat`/`boar_meat`/`rabbit_meat`/`beef` as further inputs to the same `roasted_meat` output |
| Cooking capacity / grate (plan 175) | `items/campfireCooking.ts`'s `resolveCookingCapacity`/`findCookingBatch` — bare fire 1, carried `pan` 2, a fire with a built grate 4 (grate wins outright, never adds to the pan). The grate is a one-time upgrade of one specific fire instance (`settlement/VillageFire.ts`'s `hasGrate`/`setGrate`, persisted on `settlement/PlacedFires.ts`'s `PlacedFire.grate`), not a `firepit`-only mechanic — built via the "Zbuduj ruszt" quick action for `GRATE_COST` (`app/userActions.ts`: 2× branch, 2× stone, 2× iron_rod) at a nearby player-built fire that doesn't already have one. |
| Species meat + hide (plan 134) | `createApp.ts`'s `startHarvestMeat` maps `AnimalAgent.def.kind` → item kind (`deer`→`deer_meat`, `wolf`→`wolf_meat`, `boar`→`boar_meat`, `rabbit`→`rabbit_meat`, `cow`→`beef`; other species keep the generic `raw_meat`) and always tries to add 1 `hide` alongside the meat |
| Carry capacity (plan 186) | `ITEM_CATALOG[kind].carryCapacityBonus` — kg added to `Inventory.maxWeight` per unit of that kind actually held; only `backpack` sets it today. `Inventory.maxWeight` is a derived getter (`baseMaxWeight` + the sum over held counts), never persisted — same "recompute after load" contract `maxWeight` already had before this plan. Feeds the existing `player/playerEncumbrance.ts`/`PlayerController.setEncumbrance()` overload calc unchanged — no second capacity/equipment system. |
| Liquid containers (plan items-player-001) | `ITEM_CATALOG[kind].container` (`{ capacityLiters, allowedContents: ('water'\|'milk')[] }`) on the 3 waterskins + 2 buckets — the shared `Container: capacity / content type / content amount` model, ready for a future barrel. Each physical container is a `LiquidContainerItemInstance` (`items/itemInstances.ts`) — `{ id, kind, liquid, amountLitres }` — so two carried units of the same kind can hold different amounts, same as weapon durability/traps. Domain operations (`fillLiquidContainer`/`drinkFromLiquidContainer`/`emptyLiquidContainer`/`liquidContainerCapacity`) live in `items/liquidContainer.ts`; callers apply the result via `Inventory.updateInstance()`. Held liquid mass (1 kg/l, `LIQUID_DENSITY_KG_PER_LITRE`) is added to `Inventory.totalWeight()` on top of the empty container's `ITEM_DEFS.weight`. Acquisition (Kupiec purchase, quest reward, world pickup) always creates a fresh empty instance via `items/trade.ts`'s `createAcquiredInstance()`. Waterskins and buckets are both wired to the well/lake `[R]` fill (`app/actions/survivalActions.ts`'s `fillWaterskin`, despite the name — plan settlements-npcs-001 extended it from waterskin-only); waterskins also drink via inventory "Wypij". Buckets don't drink/milk yet (deferred to a future interaction-window plan) but do water a player garden plot (`[R]` at the plot, `app/actions/placementActions.ts`'s `waterGardenPlot`, plan settlements-npcs-001) — one watering consumes 1 l, not the whole container. Plan-106's binary `waterskin_empty`/`waterskin_full` are legacy-only now — `items/liquidContainer.ts`'s `migrateLegacyWaterskinsToInstances()` converts any old-save count into a `waterskin_medium` instance on load. |
| Merchant price / trade value | `items/tradeCatalog.ts` — `MERCHANT_PRICES`/`MERCHANT_STOCK` (buy from Kupiec in `coin`, issue [035](../issues/2026-08-19--035--playtest-coins-placement-inventory.md)), `sellPrice()` = half `tradeValue` (player → Kupiec; not `shell`/`coin`), and `tradeValue()` (barter fallback, shown as "Wartość" in `InventoryScreenItemDetails.vue`, plan 134). Shells remain barter-only. |
| Weapon combat + prices | [WEAPONS.md](./WEAPONS.md) — melee timings, block, weight, Kupiec/sell/quest value |
| Freshness (plan 159) | `ITEM_CATALOG[kind].food.freshness` (`items/foodFreshness.ts`'s `getFreshnessStage`) — Fresh → Medium → Spoiled, derived from a stack's `acquiredAtDays` + world day; spoiled food cannot be consumed. Perishable stacks are tracked as `Inventory`'s `FoodBatch[]` (age-compatible batches merge, oldest consumed first) — kinds with no `freshness` entry (e.g. `honey`) never spoil. |
| Bait (plan 159) | `ITEM_CATALOG[kind].food.bait` (`'meat' \| 'plant'`) — same flag feeds both fishing bait (`world/fishing.ts`) and trap bait (`world/animalTraps.ts`'s `TRAP_BAIT_DETECTION_CUT`); `items/foodFreshness.ts`'s `BAIT_ITEM_PRIORITY` picks cheapest-first when auto-baiting a trap on arm. |
| Fishing | `fishing_rod` held at a lake shore — `[E]` casts (busy channel, deterministic catch roll), `[R]` applies bait to the cast spot. No fish population/agents — `world/fishing.ts`. |
| Drying / preservation | Settlement-landmark drying rack (`world/dryingRacks.ts`, not a placeable item) — `[E]` starts drying raw meat/fish or collects a finished `dried_meat`/`dried_fish`; background `TimedProcess` (`items/timedProcess.ts`) resolved lazily, survives reload/time-skip. |
| Wild hives | Deterministic settlement-landmark hive (`world/beehives.ts`) near a tree — `[E]` collects accrued `honey` (small sting chance), `[R]` burns it down (lit torch/branch required) for a one-time reward. No bee agents/manager. |
| Seed planting (plan 126) | Quick Actions "Zasadź drzewo" (`tree_seed`, one generic seed — species chosen from local habitat suitability via `world/plantedTrees.ts`'s `pickPlantedTreeSpecies`, same signal procedural placement uses) enters the existing `TreeLifecycle` as a `sapling` anchored at planting time. "Zasadź: marchew/ziemniak/kapustę" (`seed_carrot`/`seed_potato`/`seed_cabbage`) plants a `CropLifecycle` (plan 172) entity, only within reach of a settlement garden. Both reuse `evaluateGroundPlacement` for siting and a short busy channel; the seed is spent only on success. `world/plantedTrees.ts` / `world/plantedCrops.ts`; persisted in `SaveData.plantedTrees`/`plantedCrops`. |

## Items

| Kind | Label | Hold | Melee | Spawn | Model | Notes |
|------|-------|------|-------|-------|-------|-------|
| shell | muszla | — | — | renewable village | procedural | barter token (Kupiec will not buy/sell shells) |
| stone | kamień | — | — | renewable + dig | procedural | |
| branch | gałąź | lit only | — | renewable trees | `items/branch.glb` | Zapal gałąź → hand mesh + fire; **melee later** |
| beam | belka | — | — | none | procedural | plan 187; bonus yield alongside branch at the felled→harvested bucking chop; construction material + campfire fuel; never a hand torch |
| mushroom | grzyb | — | — | world chunk | procedural | plan 159; now also `food` category — Zjedz (+8 hunger); freshens 1.5 days, plant bait |
| flower | kwiat | — | — | world chunk | procedural | |
| cone | szyszka | — | — | world chunk | procedural | |
| knife | nóż | yes | 12 | starting | `items/knife.glb` | |
| firestarter | krzesiwo | yes | — | starting | procedural | |
| blanket | koc | — | — | starting | procedural | |
| shovel | łopata | yes | 8 | village 1× | `items/shovel.glb` | soil/sand dig / level (not rock) |
| axe | siekiera | yes | 20 | village 1× | `items/axe.glb` | chop |
| pitchfork | widły | yes | 14 | village 1–3 | `items/pitchfork.glb` | plan 082 pickup; hold+melee (plan 096); grip TBD |
| sickle | sierp | yes | 12 | village 1–3 | `items/sickle.glb` | plan 082 pickup; hold+melee (plan 096); grip TBD |
| wooden_torch | pochodnia | yes | — | starting (+ village 1×) | `items/wooden_torch.glb` | plan 085; longer/brighter than lit branch |
| pickaxe | kilof | yes | — | village 1× + Kupiec | `items/pickaxe.glb` | ore deposits + mountain-rock dig/level (plan 090) |
| tent | namiot | — | — | none (Kupiec) | procedural | place / rest / pack (plan 090); roads allowed (issue 035) |
| trap_simple | prosta pułapka | — | — | none (Kupiec) | procedural | plan 141 / issue 035; Inventory „Zastaw” or Quick Actions → `[E]` uzbrój / rozbrój, `[R]` zabierz. 2 użycia, detekcja 0.5, pełne zużycie pogodowe |
| trap_good | dobra pułapka | — | — | none (Kupiec) | procedural | plan 141 / issue 035; jak wyżej, ale 5 użyć, detekcja 0.3 i ¼ zużycia pogodowego |
| long_sword | miecz | yes | 28 | none (Strażnik/Kupiec) | `items/long_sword.glb` | hold+melee; Strażnik quest/dialog + Kupiec |
| coal | węgiel | — | — | pickaxe yield | procedural | plan 090 |
| iron | żelazo | — | — | pickaxe yield | procedural | plan 090 |
| gold | złoto | — | — | pickaxe yield | procedural | plan 090 |
| copper_ore | ruda miedzi | — | — | pickaxe yield | procedural (M71 needed) | plan items-player-001; same `terrain/resourceDeposits.ts` pipeline as iron/coal/gold; settlement economy stock `copper_ore` |
| copper | miedź | — | — | none | procedural (M71 needed) | plan items-player-001 §5.2/§11; future `copper_ore` smelting output — deliberately unobtainable (not Kupiec stock, unlike `iron_rod`) until that processing exists |
| tomato | pomidor | — | — | renewable garden | procedural | plan 106; Zjedz (+12 hunger) |
| raw_meat | surowe mięso | — | — | corpse harvest (knife) | procedural | plan 106; Zjedz (+15 hunger, less than roasted) |
| roasted_meat | pieczone mięso | — | — | campfire cooking | procedural | plan 106; Zjedz (+35 hunger) |
| bread | chleb | — | — | none (Kupiec) | procedural | plan 106; Zjedz (+30 hunger) |
| waterskin_small | mały bukłak | — | — | none (Kupiec) | procedural (M68 needed) | plan items-player-001; leather, 2 l capacity; `[R]` at well/lake fills to full, Wypij drinks 1 l — replaces plan 106's binary waterskin_empty/waterskin_full |
| waterskin_medium | średni bukłak | — | — | none (Kupiec) | procedural (M68 needed) | plan items-player-001; leather, 5 l capacity; same fill/drink as waterskin_small |
| waterskin_large | duży bukłak | — | — | none (Kupiec) | procedural (M68 needed) | plan items-player-001; leather, 10 l capacity; same fill/drink as waterskin_small |
| wooden_bucket | drewniane wiadro | — | — | none (Kupiec, no recipe) | procedural (M69 needed) | plan items-player-001; wood, 10 l, holds water or milk; fills at well/lake and waters a garden plot (plan settlements-npcs-001) — drink-from-bucket/milking still deferred |
| copper_bucket | miedziane wiadro | — | — | none | procedural (M69 needed) | plan items-player-001 §11; copper, 10 l, holds water or milk; future blacksmith smithing/crafting output — not Kupiec stock yet (unlike wooden_bucket); same fill/watering wiring as wooden_bucket, same deferred drink/milking |
| saddlebags | juki | — | — | none (Kupiec) | procedural (M70 needed) | plan items-player-001 §4.2; leather; inert carried item — animal-equip/transport-capacity mechanic is future work |
| spear | dzida | yes | 20 | none (Kupiec) | `items/spear.glb` (M38) | plan 134; longest range, narrow thrust arc |
| short_sword | krótki miecz | yes | 18 | none (Kupiec) | `items/short_sword.glb` (M38) | plan 134; lighter/faster than long_sword |
| deer_meat | mięso sarny | — | — | corpse harvest (knife, sarna) | procedural | plan 134; Zjedz (+16 hunger); cooks to roasted_meat |
| wolf_meat | mięso wilka | — | — | corpse harvest (knife, wilk) | procedural | plan 134; Zjedz (+12 hunger); cooks to roasted_meat |
| boar_meat | mięso dzika | — | — | corpse harvest (knife, dzik) | procedural | plan 134; Zjedz (+17 hunger); cooks to roasted_meat |
| rabbit_meat | mięso królika | — | — | corpse harvest (knife, królik) | procedural | plan 134; Zjedz (+10 hunger); cooks to roasted_meat |
| beef | wołowina | — | — | corpse harvest (knife, krowa) | procedural | plan 134; Zjedz (+20 hunger); cooks to roasted_meat |
| hide | skóra | — | — | corpse harvest byproduct (any species) | procedural | plan 134; sellable via barter or to Kupiec at `sellPrice` (`tradeValue` / 2) |
| cheese | ser | — | — | none (Kupiec) | procedural | plan 134; Zjedz (+20 hunger) |
| dried_meat | suszone mięso | — | — | none (Kupiec) | procedural | plan 134; Zjedz (+25 hunger); light, long-lasting |
| coin | moneta | — | — | world chunk (rare) | procedural | plan 129 / issue 035; near-zero weight (0.001 kg); Kupiec buy/sell currency + quest reward + land-plot price; shells stay barter-only |
| herb | zioło lecznicze | — | — | world chunk (flora pool) | procedural | plan 153; Opatrz (+8 health) — free but scarce (half mushroom's weight) |
| bandage | opatrunek | — | — | none (Kupiec) | procedural | plan 153; Opatrz (+35 health) — reliable, purchasable healing |
| damascus_knife | nóż damasceński | yes | 16 | none (Kupiec) | `items/damascus_knife.glb` (M44) | plan 160; teal/silver damascus, not gray; harvests corpses like knife |
| damascus_short_sword | krótki miecz damasceński | yes | 24 | none (Kupiec) | `items/damascus_short_sword.glb` (M45) | plan 160; teal/navy damascus, not gray |
| damascus_long_sword | długi miecz damasceński | yes | 40 | none (quest grozny-wilk) | `items/damascus_long_sword.glb` (M46) | plan 160; teal/navy damascus; not Kupiec stock |
| obsidian_sword | obsydianowy miecz | yes | 46 | none (quest wilcza-jama) | `items/obsidian_sword.glb` (M47) | plan 160; volcanic-glass purple/black, not gray steel; not Kupiec stock |
| battle_axe | topór bojowy | yes | 28 | none (Kupiec) | `items/battle_axe.glb` (M48) | plan 160; chops trees like axe (`wood_chopping`) |
| masterwork_sword | mistrzowski miecz | yes | 34 | none (Kupiec) | `items/masterwork_sword.glb` (M49) | plan 160; gold Quaternius Sword_Golden, cheaper than damascus long |
| berries | jagody | — | — | world chunk (flora pool) | procedural | plan 159; Zjedz (+8 hunger); freshens 1 day, plant bait |
| apple | jabłko | — | — | renewable trees | procedural | plan 159; Zjedz (+10 hunger); freshens 2 days, plant bait |
| nuts | orzechy | — | — | world chunk (flora pool) | procedural | plan 159; Zjedz (+12 hunger); freshens 5 days, plant bait |
| honey | miód | — | — | wild hive collect/burn | procedural | plan 159; Zjedz (+18 hunger); never spoils |
| carrot | marchew | — | — | renewable garden + wild natural crop | procedural | plan 159; Zjedz (+10 hunger); freshens 3 days, plant bait. Plan 172: also a wild natural crop (`terrain/chunkCrops.ts`), young/mature/spoiled lifecycle |
| potato | ziemniak | — | — | renewable garden + wild natural crop | procedural | plan 159; Zjedz (+12 hunger); freshens 4 days, plant bait. Plan 172: also a wild natural crop (`terrain/chunkCrops.ts`), young/mature/spoiled lifecycle |
| cabbage | kapusta | — | — | renewable garden + wild natural crop | procedural | plan 159; Zjedz (+10 hunger); freshens 2 days. Plan 172: also a wild natural crop (`terrain/chunkCrops.ts`), young/mature/spoiled lifecycle |
| fish | ryba | — | — | fishing_rod catch | procedural | plan 159; Zjedz (+12 hunger); freshens fastest (0.75 day) |
| dried_fish | suszona ryba | — | — | drying rack (fish) | procedural | plan 159; Zjedz (+22 hunger); light, long-lasting like dried_meat |
| fishing_rod | wędka | yes | — | none (Kupiec) | procedural | plan 159; `[E]` cast at lake shore, `[R]` apply bait |
| whetstone | osełka | — | — | none (Kupiec) | procedural (M52 needed) | plan 161; stackable, consumed 1:1 by `sharpenWeapon()` |
| short_bow | krótki łuk | yes | ranged 14 | none (Kupiec) | procedural (M50 needed) | plan 162; fastest draw, shortest range of the three bows |
| hunting_bow | łuk myśliwski | yes | ranged 20 | none (Kupiec) | procedural (M50 needed) | plan 162; balanced range/damage/draw; small critical chance |
| long_bow | długi łuk | yes | ranged 28 | none (Kupiec) | procedural (M50 needed) | plan 162; longest range/highest damage, slowest draw |
| arrow | strzała | — | — | none (Kupiec) | procedural (M51 needed) | plan 162; base ammo for every bow |
| broadhead_arrow | strzała łowiecka | — | — | none (Kupiec) | procedural (M51 needed) | plan 162; +4 damage over `arrow` |
| war_arrow | strzała bojowa | — | — | none (Kupiec) | procedural (M51 needed) | plan 162; +8 damage over `arrow`, heaviest |
| chest | skrzynia | — | — | none (Kupiec) | procedural (M53 needed) | plan 164; generic player storage container — place with Inventory „Postaw”, `[E]` open transfer screen / `[R]` pick up (with contents) on the world prop, Quick Actions → „Odłóż skrzynię” while carrying |
| backpack | plecak | — | — | none (Kupiec) | procedural (M55 needed) | plan 186; ordinary carried item — simply holding it in `Inventory` raises `Inventory.maxWeight` by `ITEM_CATALOG.backpack.carryCapacityBonus` (+15 kg, stacks); must fit under the pre-bonus capacity to buy/pick up; no equip/backpack-slot system |
| tree_seed | nasiono drzewa | — | — | none (Kupiec) | procedural | plan 126; Quick Actions "Zasadź drzewo" — species picked from local habitat suitability, not a per-species item |
| seed_carrot | nasiona marchwi | — | — | none (Kupiec) | procedural | plan 126; Quick Actions "Zasadź: marchew" — plants a `carrot` `CropLifecycle` entity in a settlement garden |
| seed_potato | sadzeniaki ziemniaka | — | — | none (Kupiec) | procedural | plan 126; Quick Actions "Zasadź: ziemniak" — plants a `potato` `CropLifecycle` entity in a settlement garden |
| seed_cabbage | nasiona kapusty | — | — | none (Kupiec) | procedural | plan 126; Quick Actions "Zasadź: kapustę" — plants a `cabbage` `CropLifecycle` entity in a settlement garden |

## Roadmap (not done)

1. **branch as improvised melee** — holdable stick, low damage (~4–8); not part
   of plan 161's maintenance set.
2. ~~Item durability / HP~~ — implemented for the 13-kind weapon-maintenance
   set (plan 161, see "Weapon maintenance" quick rule above); repair/broken
   lifecycle, general tool durability (shovel/pickaxe) and bow durability
   remain out of scope.
3. **NPC protest** when picking village pitchfork/sickle — [issue 025](../issues/2026-08-12--025--npc-react-to-stolen-village-tools.md).
4. **Left-hand dual wield** — currently right hand exclusive (tool vs lit light).
5. **Arrow recovery** — consumed arrows are never restored on hit/miss/expiry
   (plan 162, deliberate v1 scope cut).
6. **NPC ranged/archer combat** — no existing NPC attack-decision framework to
   extend (only fauna predator AI); deferred rather than building a new one
   for a currently hostile-NPC-less game (plan 162 implementation notes).

## Related non-item props

| Id | Path | Status |
|----|------|--------|
| hay | `/models/settlement/hay.glb` | decorative |
| lantern | `/models/settlement/lantern.glb` | house night lamp body (plan 085) |
| torch | `/models/settlement/torch.glb` | village plaza/gate posts (plan 085) |
| fire | `/models/fx/fire.glb` | handheld / village torch tip (CC-BY) |
| blood_splat | `/models/fx/blood_splat.glb` | animal death VFX (plan 096) |
