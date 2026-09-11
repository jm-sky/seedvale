# Plan: Wearable armor and combat equipment

**Created:** 2026-09-11
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** L
**Depends on:** none
**Domain:** `items-player`
**Subdomains:** `inventory` `items` `player-needs`
**Tags:** `armor` `equipment` `combat` `stamina`
**Roadmap:** -

## Goal

Add the first persistent wearable-equipment layer for the player, initially focused on body armor, without creating a second inventory or a parallel combat/movement system.

The initial gameplay loop should be:

```text
player Inventory owns armor item
→ player equips it into body slot
→ one derived equipment-modifier result
→ existing damage / melee / stamina / movement systems consume relevant modifiers
→ save/load preserves equipped choice
```

The first armor set should provide materially different trade-offs rather than a flat upgrade ladder:

- padded gambeson — light protection, minimal penalties,
- leather armor — balanced protection and moderate penalties,
- chainmail — stronger protection with clearly noticeable stamina/recovery/movement cost.

Exact item kinds, labels, numbers and visuals must be finalized only after suitable models/assets are confirmed. Do not add placeholder weapon or armor kinds merely to satisfy this plan.

## Current architecture and recon

### 1. `Inventory` already owns item ownership

`src/items/Inventory.ts::Inventory` is the authoritative generic item carrier used by the player and NPCs.

It already owns:

- stack counts,
- concrete item instances,
- weight and size capacity,
- perishable batches,
- instance state for supported item classes.

Wearable equipment must therefore not create an `ArmorInventory`, `EquipmentInventory` or duplicated ownership registry.

Ownership rule:

```text
Inventory = who owns the item
Equipment = which owned item is currently worn
```

Equipping must never move or clone ownership into a second container.

### 2. Player equip state is currently only `HeldTool`

The player currently has one explicit hand/equip concept: `src/items/HeldTool.ts`.

`HeldTool` is intentionally a player-facing single held-item slot for tools/weapons. It is not suitable as the owner for persistent worn armor and must not be generalized into a God Object containing body/head/off-hand armor state.

A separate small wearable-equipment state is justified here because armor has persistent semantic occupancy independent of the current action.

This is also the exact future case anticipated by `items-player-027`: persistent equipment becomes justified for worn armor / durable slot occupancy, while ordinary NPC weapon selection remains action-derived from inventory.

### 3. Item gameplay metadata already belongs in `ITEM_CATALOG`

`src/items/itemCatalog.ts::ItemCatalogEntry` is already the machine-readable source of truth for gameplay-facing item behavior such as:

- melee,
- ranged,
- active defense,
- consumables,
- capabilities,
- carry-capacity bonuses,
- treatment,
- utility.

Armor gameplay metadata belongs here as another declarative item property. Do not create a separate hard-coded `ARMOR_STATS` table.

`src/items/items.ts::ITEM_DEFS` remains the source of truth for ordinary item metadata such as label, category, weight and size.

### 4. Player melee already exposes the correct integration seams

`src/player/playerMelee.ts::createPlayerMelee()` currently:

- checks/drains `MeleeConfig.staminaCost`,
- spends Vigor from configured attack duration,
- resolves agility into recovery duration through `resolveMeleeRecovery()`,
- passes timing into the shared melee lifecycle.

Armor modifiers must feed this existing request/lifecycle path.

Do not duplicate attack timers or create an armor-owned swing scheduler.

### 5. Movement already has one authoritative speed-modifier path

`src/player/playerEncumbrance.ts::computeEncumbrance()` derives carry-weight movement slowdown, and `PlayerController.setEncumbrance()` stores the resulting multiplier without reaching into `Inventory` directly.

Armor movement penalties should compose with the player's existing movement multiplier path, not create a second controller or update loop.

The final player movement speed should remain derived from explicit factors, conceptually:

```text
base movement
× existing movement/state modifiers
× encumbrance modifier
× wearable-equipment movement modifier
```

Exact composition order should preserve current behavior when no armor is equipped.

### 6. Incoming player damage has one authoritative entry point

`src/player/playerDamage.ts::applyPlayerDamage()` is the single player HP-loss entry for combat/environmental damage routed through the player damage lifecycle.

It currently resolves held-item directional defense before applying HP loss.

Passive armor mitigation belongs after the existing active defense result and before HP mutation:

```text
incoming attack damage
→ held-item active defense (`resolveDefense`)
→ remaining damage
→ worn armor mitigation
→ HealthState
```

Do not overload `DefenseConfig` with worn armor semantics. Active block and passive armor are distinct mechanics.

### 7. Current item/persistence state has no wearable equipment snapshot

Player inventory and many player systems already persist through `SaveData`, but there is no persistent worn-equipment slot state today.

This plan may add the minimum player equipment snapshot required to restore the selected body item.

Persist selection/identity only; do not duplicate item data already owned by `Inventory`.

On restore, invalid/missing ownership must safely resolve to an empty slot rather than recreating the item.

### 8. No verified armor/new-weapon assets are currently part of the item catalog

Recon did not find implemented item kinds/models for shield, mace, war hammer or wearable body armor.

Therefore this plan has an explicit asset gate:

> Concrete armor kinds and visuals are implementation-ready only after the corresponding model is present, licensed/credited according to repository rules and suitable for the current character presentation pipeline.

New weapons are not part of this plan.

## Architectural decisions

### 1. Introduce a small actor-neutral equipment-slot model

Create a focused equipment module under `src/items/` rather than embedding worn state into `PlayerController` or Vue.

Conceptual contract:

```ts
export type EquipmentSlot = 'body'

export type EquipmentState = {
  body: ItemKind | null
}
```

The concrete representation may use item-instance identity later if the selected armor kind becomes instance-backed. V1 must not prematurely require instances solely for durability, because armor durability is explicitly outside this plan.

Design the public API so additional slots can be added later without changing ownership semantics:

```text
body    implemented now
head    future
offHand future
hands   future
legs    future
```

Do not implement unused slots just to future-proof the type.

### 2. Equipment references owned inventory items; it does not own them

Equipping a body item must require that the player's `Inventory` currently owns it.

If an equipped armor item ceases to be owned through any valid item-removal/transfer path, equipment must become valid again deterministically, normally by clearing the slot.

Do not allow ghost equipment whose referenced item is absent from inventory.

The implementation should centralize this invariant in equipment helpers rather than relying on every caller to remember it.

### 3. Add declarative armor metadata to `ItemCatalogEntry`

Add one optional armor definition to `ITEM_CATALOG`, conceptually:

```ts
export type ArmorConfig = {
  slot: 'body'
  damageReduction: number
  staminaCostMultiplier?: number
  meleeWindUpMultiplier?: number
  meleeRecoveryMultiplier?: number
  movementSpeedMultiplier?: number
  sprintStaminaMultiplier?: number
}
```

The implementing agent may refine names, but preserve these semantics:

- `damageReduction` — passive fraction of post-block incoming damage removed;
- `staminaCostMultiplier` — multiplier for discrete melee attack stamina cost;
- `meleeWindUpMultiplier` — optional attack wind-up modifier when materially justified by balance;
- `meleeRecoveryMultiplier` — recovery/cadence penalty after agility resolution or at a clearly documented adjacent seam;
- `movementSpeedMultiplier` — walking/running mobility penalty;
- `sprintStaminaMultiplier` — sprint effort modifier if the existing stamina tick exposes a clean integration seam.

Do not add fields that no current subsystem can consume cleanly.

In particular, avoid a vague universal `attackSpeedMultiplier`: the existing melee lifecycle already distinguishes wind-up, hit window and recovery, and armor should alter specific phases intentionally.

### 4. Use one pure equipment-modifier resolver

Create a single pure resolver over current equipped state + catalog data, conceptually:

```ts
resolveEquipmentModifiers(equipment, inventory)
```

returning neutral defaults when nothing valid is worn, for example:

```ts
{
  incomingDamageMultiplier: 1,
  meleeStaminaMultiplier: 1,
  meleeWindUpMultiplier: 1,
  meleeRecoveryMultiplier: 1,
  movementSpeedMultiplier: 1,
  sprintStaminaMultiplier: 1,
}
```

This must be the shared derivation point for armor effects.

Do not scatter checks such as:

```ts
if (equipped === 'chainmail') ...
```

through player/combat/controller code.

### 5. Active block resolves before passive armor

Preserve the existing held-item `DefenseConfig` / `resolveDefense()` meaning as active directional defense.

For player incoming damage:

```text
raw damage
→ active directional block / partial block
→ armor passive reduction on remaining damage
→ HP
```

Armor must not increase `baseBlockChance` unless a future explicit item mechanic says so.

Environmental damage should only receive armor mitigation when the damage category legitimately supports it. V1 should not silently make body armor reduce starvation/dehydration or other non-combat HP loss.

If the current player-damage API lacks a damage-source/category distinction required to avoid that bug, add the smallest explicit classification necessary rather than inferring from `attackerX/attackerZ`.

### 6. Compose armor into melee stamina, not weapon stats

The equipped weapon remains authoritative for its base `MeleeConfig.staminaCost`.

Effective attack cost should be derived at use time:

```text
weapon staminaCost
× wearable melee stamina modifier
→ existing stamina gate/drain
```

Do not mutate `ITEM_CATALOG[weapon].melee` or create armor-specific weapon copies.

Lunge stamina remains its own existing mechanic unless explicitly included in the chosen equipment modifier contract. V1 should avoid changing it accidentally.

### 7. Preserve melee lifecycle semantics

Armor timing modifiers should alter only the intended configured phase duration.

Preferred V1 behavior:

```text
configured recovery
→ existing agility recovery resolution
→ armor recovery multiplier
→ melee lifecycle
```

If `meleeWindUpMultiplier` is retained, apply it only to wind-up and make Vigor-cost calculation use the same effective configured effort duration or explicitly document why it should remain based on the weapon baseline.

Do not change `hitWindow`, range, arc or damage as a side effect of wearing armor.

### 8. Compose movement penalty through `PlayerController`

`PlayerController` should consume a derived equipment movement multiplier similarly to its existing encumbrance multiplier, without importing inventory/catalog ownership directly if the current explicit-setter pattern can be preserved.

Preferred direction:

```text
composition/game loop derives equipment modifiers
→ PlayerController receives movement multiplier
→ controller composes it with existing movement constraints
```

Do not let `PlayerController` query `Inventory` itself solely for armor.

### 9. Reuse existing stamina/needs logic for sprint penalties

If V1 includes a sprint stamina penalty, integrate at the existing stamina drain calculation in `PlayerNeeds` / `PlayerController` rather than creating an armor tick.

The armor system must remain data + pure derivation; it should not own simulation cadence.

If adding the sprint modifier would require broad unrelated surgery, defer `sprintStaminaMultiplier` while retaining melee stamina + movement penalties as the V1 trade-off.

### 10. Player UI stays inside the existing inventory surface

The inventory item-details/actions should expose armor context when relevant:

```text
Załóż
Zdejmij
```

and show a compact effect summary sourced from `ArmorConfig`, such as:

- slot,
- protection,
- attack stamina modifier,
- melee recovery modifier,
- movement modifier.

Do not create a new full equipment screen in V1.

The character screen may display the currently equipped body item if there is an economical existing presentation seam, but that is secondary to inventory interaction and must not become a separate state owner.

### 11. Persistence stores only equipped selection

Add a minimal player equipment field to the current save schema, conceptually:

```ts
playerEquipment?: {
  body?: ItemKind
}
```

Exact placement should follow the current save structure conventions.

Restore rules:

1. parse the saved kind conservatively,
2. verify it still declares matching armor slot metadata,
3. verify player inventory owns it,
4. equip it if valid,
5. otherwise restore empty.

Older saves restore with empty equipment without migration-generated items.

### 12. Keep the model actor-neutral, but player-only behavior is acceptable in V1

`EquipmentState`, slot definitions and catalog armor metadata should not encode `Player` in their core types.

However V1 implementation scope is player wearing armor only.

Do not extend this plan into:

- NPC autonomous armor choice,
- NPC clothing/equipment visualization,
- NPC purchasing armor,
- companion armor management.

A future NPC feature may reuse the same equipment state/resolver once persistent worn gear is actually needed.

### 13. Asset gate for concrete armor kinds

Before wiring each concrete initial armor item, verify:

- a usable model exists,
- license/credit requirements are compatible and documented,
- model scale/orientation is suitable,
- the asset can be presented with the current player character without unacceptable clipping/rig requirements,
- `docs/assets/MODELS.md` / `CREDITS.md` are updated as appropriate.

Initial desired gameplay archetypes are:

```text
padded gambeson
→ low protection
→ near-neutral stamina/recovery/movement

leather armor
→ medium protection
→ small penalties

chainmail
→ strong protection
→ meaningful stamina/recovery/movement penalties
```

Names such as `padded_gambeson`, `leather_armor`, `chainmail` are candidates, not permission to create assetless items.

### 14. Balance must create horizontal choices

The first three armor types should not be simple strictly-better tiers.

Desired qualitative balance:

```text
gambeson
→ mobility / endurance

leather
→ balanced general use

chainmail
→ survivability / prolonged combat protection
   at noticeable effort and cadence cost
```

Exact numeric tuning belongs in implementation after the effects are wired and can be manually verified in browser.

Avoid penalties so strong that ordinary movement/combat becomes frustrating, and avoid protection so strong that active defense becomes irrelevant.

## Scope

Implement:

1. minimal wearable-equipment state with `body` slot,
2. inventory ownership validation for equip/unequip,
3. catalog-driven armor metadata,
4. one pure equipment-modifier resolver,
5. passive armor mitigation for applicable incoming combat damage,
6. melee stamina modifier,
7. melee recovery modifier,
8. movement-speed modifier,
9. sprint stamina modifier only if the current seam remains narrow and clean,
10. inventory UI equip/unequip + effect presentation,
11. save/load of equipped body selection,
12. initial armor item kinds only for confirmed usable assets,
13. focused unit tests around equipment invariants and modifier composition,
14. JSDoc for important equipment/resolver APIs with `@domain items-player` where useful for preflight discovery.

## Non-goals

Do not implement in this plan:

- armor durability,
- armor condition degradation,
- armor repair,
- broken-armor lifecycle,
- crafting/smithing/leatherworking recipes,
- economic production of armor,
- armor penetration,
- damage types (`slash` / `pierce` / `blunt`) unless separately planned,
- hit-location/body-part damage,
- head/arms/hands/legs equipment,
- shields / `offHand`,
- mace / war hammer / halberd or any other new weapon,
- new weapon kinds without confirmed models,
- NPC autonomous armor/equipment selection,
- player-managed companion equipment,
- armor-driven animations,
- large character-screen redesign,
- general refactor of combat, stamina or movement systems.

These are deliberate follow-up decisions, not missing V1 requirements.

> Check: `docs/assets/LOCAL_ASSETS.md`
> - `Mace by joney_lol - z59Foset56.glb`
> - `Doublesided Hammer by Quaternius - UIXvQ73DS1`
> - `Mace by Poly by Google - 40LBkajLUig.glb`
> - `Shield Round by Quaternius - lWajrVXcnA.glb`
> - `Shield by Quaternius - srN1KGAO7f.glb`
> - `Armor Metal by Quaternius - TMUoxILh9w.glb`
> - `Armor Leather by Quaternius - na9KfWiKN8.glb`

## Expected integration points

Verify all paths/symbols against current `main` before implementation.

### Item ownership / definitions

- `src/items/Inventory.ts`
- `src/items/items.ts`
- `src/items/itemCatalog.ts`
- new focused equipment module under `src/items/`

### Combat / stamina

- `src/player/playerMelee.ts`
- `src/combat/meleeAgility.ts`
- `src/player/playerDamage.ts`
- `src/combat/defenseResolver.ts` — preserve active-defense semantics; do not fold armor into it blindly

### Movement / needs

- `src/player/PlayerController.ts`
- `src/player/playerEncumbrance.ts`
- `src/player/PlayerNeeds.ts`
- `src/app/gameLoop.ts` / composition seam that currently supplies derived encumbrance and combat context

### Persistence

- `src/persistence/saveData.ts`
- `src/app/saveState.ts`
- player restore/composition path in `src/app/createApp.ts`

### UI

- existing Vue inventory screen/store/wiring,
- `src/app/inventoryWiring.ts`,
- character presentation only if a minimal read-only equipped-body row is economical.

### Assets/docs

- `public/models/...` only after an asset is selected,
- `docs/assets/MODELS.md`,
- `docs/assets/CREDITS.md`,
- `docs/items/CATALOG.md` after implementation,
- `docs/state/player-systems.md` / `docs/state/combat.md` if current-state documentation gains a real new invariant.

## Implementation order

1. Add core equipment slot/state + validation helpers and tests.
2. Add `ArmorConfig` to `ITEM_CATALOG` and pure modifier resolver.
3. Wire persistence with empty-safe restore.
4. Wire passive combat-damage mitigation without affecting starvation/dehydration.
5. Wire melee stamina and recovery modifiers.
6. Wire movement modifier; add sprint-stamina modifier only if clean.
7. Add inventory equip/unequip actions and effect presentation.
8. Verify/add concrete initial armor kinds only for confirmed assets.
9. Update item/state/assets documentation.
10. Run automated checks; leave browser/manual verification to the user.

## Verification

Automated tests should cover at least:

- empty equipment resolves all-neutral modifiers,
- only an owned compatible body armor item can be equipped,
- removing/losing an equipped item cannot leave an effective ghost armor bonus,
- wrong-slot/non-armor kinds are rejected,
- save/load preserves a valid equipped body item,
- missing/invalid/old-save equipment restores empty,
- passive armor mitigation applies after active defense to combat damage,
- starvation/dehydration are not reduced by ordinary body armor,
- armor multiplier changes melee stamina cost without mutating weapon config,
- armor recovery multiplier composes with existing agility recovery,
- armor movement modifier composes with encumbrance rather than replacing it,
- no armor preserves current combat/movement numbers exactly.

Manual browser verification by the user should cover:

- equip/unequip from inventory,
- visible effect summaries,
- save/reload with armor equipped,
- incoming animal/NPC combat feels less damaging with stronger armor,
- gambeson/leather/chainmail produce perceptibly different mobility/stamina/combat cadence,
- active block still matters while armored,
- inventory weight/encumbrance still behaves normally,
- selected armor visual does not clip unacceptably if a wearable character model is wired in V1.

## Follow-up decisions intentionally deferred

After this base equipment layer exists, separately evaluate whether armor should gain:

- durability / condition,
- repair requirements and materials,
- blunt/slash/pierce effectiveness,
- armor penetration for selected weapons,
- multiple body slots,
- shields/off-hand defense,
- wet/heavy/weather interactions,
- stealth/noise consequences,
- NPC equipment decisions and economy/production.

Do not pre-implement these through unused fields in V1.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
