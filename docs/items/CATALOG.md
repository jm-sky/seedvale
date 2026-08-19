# Item catalog — Seedvale

**Purpose:** single place for agents/humans to see what each item does, what is
implemented, and what is planned. Code source of truth for weights/labels:
[`src/items/items.ts`](../../src/items/items.ts) (`ITEM_DEFS`). Flags/roadmap:
[`src/items/itemCatalog.ts`](../../src/items/itemCatalog.ts).

**Last updated:** 2026-08-19

## Quick rules

| Concern | Where |
|---------|--------|
| Inventory weight / label | `ITEM_DEFS` |
| Holdable (Weź) | `isToolKind` in `HeldTool.ts` — knife, firestarter, shovel, axe, wooden_torch, pickaxe, long_sword, spear, short_sword, pitchfork, sickle, damascus_knife, damascus_short_sword, damascus_long_sword, obsidian_sword, battle_axe, masterwork_sword |
| Held 3D attach | `heldToolVisual.ts` → `WristR` + `HELD_ATTACH` (Phase 6: migrate per-tool numbers to `grip` anchors via alignment browser) |
| Ground GLB scale | `itemModels.ts` → `preparePropFitMax` (not height-only) |
| Melee vs animals | `ITEM_CATALOG[kind].melee` (plan 123, `itemCatalog.ts`) — single source of truth for damage/range/arcDot/windUp/hitWindow/recovery/staminaCost; `player/playerMelee.ts` runs the windUp→hitWindow→recovery lifecycle + range/facing-arc hit test. `faunaCombat.ts`'s `isMeleeTool()` just reads this. Damage: obsidian_sword 46, damascus_long_sword 40, masterwork_sword 34, long_sword/battle_axe 28, damascus_short_sword 24, spear/axe 20, short_sword 18, damascus_knife 16, pitchfork 14, knife/sickle 12, shovel 8 |
| Village one-time tools | `createItemSpawners.ts` |
| Portable light | `PlayerTorch` — lit branch (90s) or held wooden_torch (240s); exclusive right hand |
| Inventory category | `ITEM_DEFS.categories` — `resource` / `tool` / `utility` / `food` / `weapon` (multi-category, e.g. axe = tool + weapon); hunger consumables are `food`, waterskins stay `utility` |
| Consumable (Zjedz/Wypij/Opatrz) | `ITEM_CATALOG[kind].consumable` (plan 106, 153) — `{ need: 'hunger'\|'thirst'\|'health', relief, resultKind? }`; driven from inventory screen (`InventoryScreenItemDetails.vue`), world drink/cook actions, or the world `[R]` quick-action on a pickupable item (`interactables.ts`'s `itemPromptLabel`) |
| Player needs | `player/PlayerNeeds.ts` — stamina/vigor/hunger/thirst pools on `PlayerController.needs`; HUD bars in `HudScreen.vue` (HP first, then the four needs — plan 166) |
| Passive HP regen | `player/PlayerNeeds.ts`'s `tickHealthRegen` (plan 153) — slow, suppressed while starving/dehydrated; herb/bandage heal faster |
| Water source (well/lake) | `world/WaterSource.ts` — `[E]` drink, `[R]` fill waterskin; lake is a synthetic per-frame target (`interactables.ts`'s `isNearLakeShore`), not a discrete world object |
| Cooking (campfire) | `items/campfireCooking.ts` — `raw_meat → roasted_meat` at a lit campfire, `[R]`; plan 134 adds `deer_meat`/`wolf_meat`/`boar_meat`/`rabbit_meat`/`beef` as further inputs to the same `roasted_meat` output |
| Species meat + hide (plan 134) | `createApp.ts`'s `startHarvestMeat` maps `AnimalAgent.def.kind` → item kind (`deer`→`deer_meat`, `wolf`→`wolf_meat`, `boar`→`boar_meat`, `rabbit`→`rabbit_meat`, `cow`→`beef`; other species keep the generic `raw_meat`) and always tries to add 1 `hide` alongside the meat |
| Merchant price / trade value | `items/tradeCatalog.ts` — `MERCHANT_PRICES`/`MERCHANT_STOCK` (buy from Kupiec), `sellPrice()` = half `tradeValue` (player → Kupiec; not `shell`/`coin`), and `tradeValue()` (barter fallback, shown as "Wartość" in `InventoryScreenItemDetails.vue`, plan 134) |
| Weapon combat + prices | [WEAPONS.md](./WEAPONS.md) — melee timings, block, weight, Kupiec/sell/quest value |

## Items

| Kind | Label | Hold | Melee | Spawn | Model | Notes |
|------|-------|------|-------|-------|-------|-------|
| shell | muszla | — | — | renewable village | procedural | |
| stone | kamień | — | — | renewable + dig | procedural | |
| branch | gałąź | lit only | — | renewable trees | `items/branch.glb` | Zapal gałąź → hand mesh + fire; **melee later** |
| mushroom | grzyb | — | — | world chunk | procedural | |
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
| tent | namiot | — | — | none (Kupiec) | procedural | place / rest / pack (plan 090) |
| trap_simple | prosta pułapka | — | — | none (Kupiec) | procedural | plan 141; Quick Actions „Zastaw…” → `[E]` uzbrój / rozbrój, `[R]` zabierz. 2 użycia, detekcja 0.5, pełne zużycie pogodowe |
| trap_good | dobra pułapka | — | — | none (Kupiec) | procedural | plan 141; jak wyżej, ale 5 użyć, detekcja 0.3 i ¼ zużycia pogodowego |
| long_sword | miecz | yes | 28 | none (Strażnik/Kupiec) | `items/long_sword.glb` | hold+melee; Strażnik quest/dialog + Kupiec |
| coal | węgiel | — | — | pickaxe yield | procedural | plan 090 |
| iron | żelazo | — | — | pickaxe yield | procedural | plan 090 |
| gold | złoto | — | — | pickaxe yield | procedural | plan 090 |
| tomato | pomidor | — | — | renewable garden | procedural | plan 106; Zjedz (+12 hunger) |
| raw_meat | surowe mięso | — | — | corpse harvest (knife) | procedural | plan 106; Zjedz (+15 hunger, less than roasted) |
| roasted_meat | pieczone mięso | — | — | campfire cooking | procedural | plan 106; Zjedz (+35 hunger) |
| bread | chleb | — | — | none (Kupiec) | procedural | plan 106; Zjedz (+30 hunger) |
| waterskin_empty | bukłak (pusty) | — | — | none (Kupiec) | procedural | plan 106; `[R]` fill at well/lake → waterskin_full |
| waterskin_full | bukłak (pełny) | — | — | well/lake fill | procedural | plan 106; Wypij (+45 thirst) → back to waterskin_empty |
| spear | dzida | yes | 20 | none (Kupiec) | procedural (M38) | plan 134; longest range, narrow thrust arc |
| short_sword | krótki miecz | yes | 18 | none (Kupiec) | procedural (M38) | plan 134; lighter/faster than long_sword |
| deer_meat | mięso sarny | — | — | corpse harvest (knife, sarna) | procedural | plan 134; Zjedz (+16 hunger); cooks to roasted_meat |
| wolf_meat | mięso wilka | — | — | corpse harvest (knife, wilk) | procedural | plan 134; Zjedz (+12 hunger); cooks to roasted_meat |
| boar_meat | mięso dzika | — | — | corpse harvest (knife, dzik) | procedural | plan 134; Zjedz (+17 hunger); cooks to roasted_meat |
| rabbit_meat | mięso królika | — | — | corpse harvest (knife, królik) | procedural | plan 134; Zjedz (+10 hunger); cooks to roasted_meat |
| beef | wołowina | — | — | corpse harvest (knife, krowa) | procedural | plan 134; Zjedz (+20 hunger); cooks to roasted_meat |
| hide | skóra | — | — | corpse harvest byproduct (any species) | procedural | plan 134; sellable via barter or to Kupiec at `sellPrice` (`tradeValue` / 2) |
| cheese | ser | — | — | none (Kupiec) | procedural | plan 134; Zjedz (+20 hunger) |
| dried_meat | suszone mięso | — | — | none (Kupiec) | procedural | plan 134; Zjedz (+25 hunger); light, long-lasting |
| coin | moneta | — | — | none (quest reward) | procedural | plan 129; near-zero weight (0.001 kg); quest reward + land-plot purchase price; separate from the shell/barter merchant economy |
| herb | zioło lecznicze | — | — | world chunk (flora pool) | procedural | plan 153; Opatrz (+8 health) — free but scarce (half mushroom's weight) |
| bandage | opatrunek | — | — | none (Kupiec) | procedural | plan 153; Opatrz (+35 health) — reliable, purchasable healing |
| damascus_knife | nóż damasceński | yes | 16 | none (Kupiec) | `items/damascus_knife.glb` (M44) | plan 160; teal/silver damascus, not gray; harvests corpses like knife |
| damascus_short_sword | krótki miecz damasceński | yes | 24 | none (Kupiec) | `items/damascus_short_sword.glb` (M45) | plan 160; teal/navy damascus, not gray |
| damascus_long_sword | długi miecz damasceński | yes | 40 | none (quest grozny-wilk) | `items/damascus_long_sword.glb` (M46) | plan 160; teal/navy damascus; not Kupiec stock |
| obsidian_sword | obsydianowy miecz | yes | 46 | none (quest wilcza-jama) | `items/obsidian_sword.glb` (M47) | plan 160; volcanic-glass purple/black, not gray steel; not Kupiec stock |
| battle_axe | topór bojowy | yes | 28 | none (Kupiec) | `items/battle_axe.glb` (M48) | plan 160; chops trees like axe (`isChopTool`) |
| masterwork_sword | mistrzowski miecz | yes | 34 | none (Kupiec) | `items/masterwork_sword.glb` (M49) | plan 160; gold Quaternius Sword_Golden, cheaper than damascus long |

## Roadmap (not done)

1. **branch as improvised melee** — holdable stick, low damage (~4–8); good
   durability-wear guinea pig.
2. **Item durability / HP** — tools (and combat props) have condition that
   decreases with use (fight, chop, dig); at 0 → break or force repair. Not in
   save schema yet.
3. **NPC protest** when picking village pitchfork/sickle — [issue 025](../issues/2026-08-12--025--npc-react-to-stolen-village-tools.md).
4. **Left-hand dual wield** — currently right hand exclusive (tool vs lit light).

## Related non-item props

| Id | Path | Status |
|----|------|--------|
| hay | `/models/settlement/hay.glb` | decorative |
| lantern | `/models/settlement/lantern.glb` | house night lamp body (plan 085) |
| torch | `/models/settlement/torch.glb` | village plaza/gate posts (plan 085) |
| fire | `/models/fx/fire.glb` | handheld / village torch tip (CC-BY) |
| blood_splat | `/models/fx/blood_splat.glb` | animal death VFX (plan 096) |
