# Implementation Notes: items-player-047 — Additional compact weapons and master hunting bow

Plan: `docs/plans/items-player-047-additional-compact-weapons-and-master-hunting-bow.md`

These notes record implementation-relevant facts from current `main`. Current code remains authoritative if it changes before implementation.

## 1. Canonical item-definition seams

### `src/items/items.ts`

`ItemKind` is the closed union used throughout inventory, persistence and trade.

`ITEM_DEFS: Record<ItemKind, ItemDef>` is the source of truth for:

- Polish label,
- categories,
- weight,
- inventory size,
- description/color.

Add exactly:

- `dagger`,
- `hatchet`,
- `masterwork_hunting_bow`.

Do not create a parallel weapon metadata table.

Relevant existing anchors:

- `knife`: 0.40 kg, SM;
- `short_sword`: 1.60 kg, MD;
- `hunting_bow`: 1.40 kg, MD;
- `long_bow`: 1.90 kg.

**Recon correction to the plan:** the masterwork hunting bow should use **size `MD`**, not `LG`. It is deliberately a lighter/refined hunting bow (1.15 kg), and the current ordinary `hunting_bow` is already `MD`. Making the masterwork variant `LG` would create an inventory-size regression with no gameplay justification.

For `dagger`, use categories `['weapon', 'tool']` because it intentionally carries knife-like harvesting capabilities. For `hatchet`, use `['weapon']`; do not give it `wood_chopping`.

## 2. Combat catalog is already the single source of truth

### `src/items/itemCatalog.ts`

`ITEM_CATALOG: Record<ItemKind, ItemCatalogEntry>` owns all combat-facing configuration.

Use the plan's fixed values directly.

### Dagger

```ts
melee: {
  damage: 14,
  range: 1.70,
  arcDot: 0.58,
  windUp: 0.11,
  hitWindow: 0.08,
  recovery: 0.17,
  staminaCost: 4,
}
defense: {
  canBlock: true,
  baseBlockChance: 0.14,
  partialReduction: 0.38,
}
capabilities: ['branch_trimming', 'meat_harvesting']
```

This should naturally enter:

- player melee through existing `ITEM_CATALOG[kind].melee`;
- NPC melee resolution because NPC weapon discovery is catalog-driven;
- harvest/tool gates through the existing capability APIs.

Do not add `kind === 'dagger'` checks to harvesting code.

### Hatchet

```ts
melee: {
  damage: 18,
  range: 1.85,
  arcDot: 0.42,
  windUp: 0.20,
  hitWindow: 0.10,
  recovery: 0.28,
  staminaCost: 7,
}
defense: {
  canBlock: true,
  baseBlockChance: 0.16,
  partialReduction: 0.40,
}
```

No capabilities in V1. In particular, **do not add `wood_chopping` or `prying` merely because the item is axe-shaped**.

### Masterwork hunting bow

Use the existing `RangedConfig` and normal ranged lifecycle:

```ts
ranged: {
  damage: 24,
  range: 17,
  projectileSpeed: 32,
  drawTime: 0.38,
  recovery: 0.25,
  staminaCost: 7,
  accuracy: 0.90,
  ammoKinds: ['arrow', 'broadhead_arrow', 'war_arrow'],
  criticalChance: 0.10,
  // keep the current default/shared criticalMultiplier convention unless
  // current bow entries explicitly require a value at implementation time.
}
```

Do not add a separate masterwork-bow firing path.

Current ranged architecture already covers:

- draw/release/recovery,
- deterministic accuracy deviation,
- projectile travel/collision,
- ammo consumption,
- critical-hit resolution.

No bow durability exists today. Keep `masterwork_hunting_bow` stack/count-backed like the existing bows.

## 3. Melee instance ownership and migration

### `src/items/itemInstances.ts`

Weapon maintenance is intentionally an explicit classification, not derived from `ITEM_CATALOG.melee`.

Current:

- `WeaponMaintenanceKind` is a literal union;
- `WEAPON_MAINTENANCE_KIND_LIST` is the iterable declaration;
- `WEAPON_MAINTENANCE_KINDS` is derived from that list;
- `WeaponItemInstance` stores `durability` and `sharpness`;
- `isWeaponMaintenanceKind()` feeds generic instance-backed handling.

Add `dagger` and `hatchet` to both the union and `WEAPON_MAINTENANCE_KIND_LIST`.

Do **not** add `masterwork_hunting_bow` because bows currently have no maintenance lifecycle.

This automatically matters to generic acquisition because `src/items/trade.ts::createAcquiredInstance(kind)` dispatches through `isWeaponMaintenanceKind(kind)`.

### `src/items/weaponMaintenance.ts`

`createWeaponInstance()`, `sharpenWeapon()`, `applySharpnessWear()`, and `migrateWeaponCountsToInstances()` already operate on `WeaponMaintenanceKind`.

Do not create dagger/hatchet-specific sharpening functions.

Inspect `getWeaponMaintenanceProfile(kind)` during implementation. Reuse an existing maintenance profile family unless current profiles justify a distinct value. The plan fixes combat stats but does **not** require a new maintenance formula.

Preferred defaults:

- dagger: knife-like maintenance profile;
- hatchet: short-sword/axe-like profile chosen from the current profile structure.

Do not invent quality tiers here.

### Save/load implication

`migrateWeaponCountsToInstances()` iterates `WEAPON_MAINTENANCE_KIND_LIST` and runs at app load in `src/app/createApp.ts`.

Therefore adding the two kinds to the list is sufficient for legacy/count-shaped inventory safety; do not add a new save field or migration version solely for these item kinds.

## 4. Acquisition is already centralized

### `src/items/trade.ts::createAcquiredInstance()`

This is the shared acquisition dispatcher for:

- merchant purchases,
- quest rewards,
- world pickup/grant paths.

Consequences:

- purchased `dagger` / `hatchet` should become fresh `WeaponItemInstance` automatically after they are maintenance kinds;
- quest-granted `masterwork_hunting_bow` remains an ordinary count item because it is not instance-backed;
- do not special-case these items in quest reward or merchant UI code.

## 5. Merchant pricing and occurrence

### `src/items/tradeCatalog.ts`

`MERCHANT_PRICES` serves both buy price and normal `tradeValue` for stocked kinds.

Required values:

- `dagger: 24`;
- `hatchet: 34`.

Add both to `MERCHANT_STOCK`.

The plan requires `masterwork_hunting_bow` to be quest/exceptional-only and absent from normal merchant assortment. Therefore **do not add it to `MERCHANT_STOCK`**.

Because `tradeValue(kind)` needs a value for non-stocked exceptional items, add:

- `masterwork_hunting_bow: 220`

to `RESOURCE_TRADE_VALUE`, following the existing pattern for `damascus_long_sword` and `obsidian_sword`.

That preserves:

- inventory value display;
- barter/value semantics;
- sell-price derivation where allowed;
- quest reward valuation;

without making the bow purchasable.

Do not put a 220 entry in `MERCHANT_PRICES`, because that would imply normal merchant pricing/stock semantics.

## 6. Merchant assortment classification

### `src/settlement/merchantTrade.ts`

Current system deliberately has no generic rarity enum.

It combines:

- normal `MERCHANT_STOCK`;
- explicit `PREMIUM_MERCHANT_KINDS`;
- regional class: `local | neutral | import`;
- merchant specialization;
- settlement-size premium probability.

Current premium settlement chances:

- SM: 8%;
- MD: 22%;
- LG: 50%;
- XL: 80%;
- OUTPOST: 0%.

### Dagger and hatchet

Add both to `METAL_KINDS`.

This yields the intended regional behavior automatically:

- mountain / metal-resource settlement → local;
- forest metal weapon → import;
- ocean metal weapon → import;
- otherwise neutral.

They are ordinary weapons, so `specializationAffinity()` already makes them preferred by `weapons-tools` through category checks.

Add `dagger` to `BASIC_WEAPON_TOOL_ARMOR_KINDS`.

Rationale: it occupies the same accessible civilian/basic-weapon niche as `knife` and `short_sword`; this keeps a small `general` merchant capable of stocking it instead of making the item effectively specialist-only in low-budget settlements.

Do **not** add `hatchet` to that basic set in V1. Let it compete through normal weapon-category scoring and weapons-tools specialization. This gives dagger broader availability and keeps hatchet slightly less ubiquitous without inventing rarity.

Do not add either item to `PREMIUM_MERCHANT_KINDS`.

### Masterwork hunting bow

Do not add it to:

- `MERCHANT_STOCK`;
- `PREMIUM_MERCHANT_KINDS`;
- `HUNTING_KINDS`;
- `IMPORT_FLAVOR_KINDS`.

The bow is not an assortment candidate at all in V1. Future quest/rich-travelling-merchant content may explicitly grant/own it without changing this plan.

## 7. Held-tool typing and visuals

### `src/items/HeldTool.ts`

The runtime holdable set is now catalog-derived, but there is still a type-level narrowing around held tool kinds.

After adding `holdable: true` entries, compile errors/tests will reveal any literal union that needs extension. Do not introduce a second manually-maintained runtime list.

### `src/items/heldToolVisual.ts`

There is an explicit visual-key/attach mapping for existing held weapons and bows.

Implementation must add entries for:

- `dagger`;
- `hatchet`;
- `masterwork_hunting_bow`.

Reuse nearby attachment families as starting points:

- dagger → knife/damascus-knife family;
- hatchet → axe/battle-axe family, but fit for one-handed compact scale;
- masterwork hunting bow → hunting-bow family.

Do not assume those transforms are visually final. User owns browser verification.

## 8. Ground models and procedural fallback

### `src/items/itemModels.ts`

`ITEM_GLB_SPECS` owns ground-pickup GLB URL, fit size and optional rotation.

Existing useful anchors:

- `damascus_knife` has its own compact GLB;
- `battle_axe` has its own GLB;
- `short_bow` / `hunting_bow` / `long_bow` have distinct bow GLBs.

The three new items currently have **no verified dedicated runtime asset in the repo**.

Do not silently alias:

- dagger → `damascus_knife.glb`;
- hatchet → scaled `battle_axe.glb`;
- masterwork hunting bow → an existing normal bow,

unless recon during implementation finds an intentionally suitable distinct source asset and documents the choice.

If no suitable asset is present:

1. add/update `docs/assets/MODELS.md` with needed entries;
2. keep the item functional through `createItemMesh()` procedural fallback;
3. wire the dedicated GLB later when available.

### `src/items/items.ts::createItemMesh()`

This contains explicit procedural shape families for items when no/preload-failed GLB is available.

Extend the nearest semantic fallback family:

- dagger → knife-like;
- hatchet → compact axe-like;
- masterwork hunting bow → bow-like.

Avoid creating a separate renderer module for three items.

## 9. Asset documentation

### `docs/assets/MODELS.md`

Current relevant assets:

- M44 Damascus knife — wired;
- M48 battle axe — wired;
- M49 masterwork sword — wired;
- M50 normal bow trio — wired.

No current row covers the three new distinct visuals.

If implementation does not add real GLBs, record dedicated new rows as `needed`.

If implementation sources/converts assets, also update `docs/assets/CREDITS.md` with exact source/license and set the model rows correctly.

Do not claim a model is wired until the file exists and runtime mapping uses it.

## 10. Docs that encode counts/lists

### `docs/items/CATALOG.md`

This file currently contains manually described current counts/lists such as:

- 22 holdable kinds;
- 13 weapon-maintenance kinds;
- ranged bows being exactly short/hunting/long.

Update those descriptions after implementation so they do not immediately become stale.

### `docs/items/WEAPONS.md`

Update:

- melee table with dagger/hatchet;
- defense/weight/price/acquisition table;
- ranged table with masterwork hunting bow;
- weapon-maintenance count/text;
- roles/readability section.

For masterwork hunting bow, merchant price column should remain `—`; its `Wartość` should be 220 if the table is expanded to show quest-only value for ranged weapons.

## 11. Tests to modify or add

### `src/items/weaponMaintenance.test.ts`

Current test explicitly says:

`contains exactly the 13 supported kinds`

Update it to 15 and assert:

- `dagger` true;
- `hatchet` true;
- `masterwork_hunting_bow` false.

Add at least one creation/sharpening case for a new kind so the path is exercised rather than only membership-tested.

Migration test should include a new weapon count (e.g. dagger) and prove conversion to one full-condition instance.

### Merchant assortment tests

Current merchant tests already cover:

- deterministic assortment;
- regional/specialization behavior;
- premium assignment;
- basic general-merchant coverage.

Add focused assertions that:

- dagger can appear for a small general merchant;
- dagger and hatchet are eligible for weapons-tools;
- neither is premium;
- masterwork hunting bow never appears in generated assortment;
- premium assignment never selects masterwork hunting bow.

Avoid probabilistic exact-seed assumptions when a structural eligibility assertion is enough; where distribution is the behavior under test, follow existing bounded multi-seed patterns.

### Trade tests

Use the existing trade/value test file discovered in the current tree during implementation rather than creating a new pricing subsystem test file.

Assert at minimum:

- `tradeValue('dagger') === 24`;
- `tradeValue('hatchet') === 34`;
- `tradeValue('masterwork_hunting_bow') === 220`;
- merchant-stock membership only for dagger/hatchet.

### Catalog/ranged tests

If current tests already validate every `ItemKind` has `ITEM_DEFS`/`ITEM_CATALOG`, extend fixtures only as needed.

Add direct ranged config assertions only where useful to lock the intentionally distinctive masterwork profile:

- accuracy 0.90;
- draw 0.38;
- recovery 0.25;
- damage 24;
- ammo kinds unchanged.

Do not duplicate every numeric catalog field in multiple tests if TypeScript/catalog completeness already guards structure.

## 12. Implementation order

Recommended sequence:

1. Add three `ItemKind` values and `ITEM_DEFS`.
2. Add `ITEM_CATALOG` entries with final combat stats.
3. Add dagger/hatchet to weapon-maintenance typing/list and update tests.
4. Add prices/value and merchant-stock membership.
5. Update merchant regional/basic classification.
6. Add procedural fallback meshes.
7. Add ground/held visual mappings; wire dedicated GLBs only if real assets are available.
8. Update tests.
9. Update `WEAPONS.md`, `CATALOG.md`, and asset docs.
10. Run focused tests + typecheck/lint appropriate to the touched files.

No browser verification by AI.

## 13. Guardrails discovered during recon

- Do not add a rarity enum; merchant availability already has the exact mechanisms required.
- Do not make masterwork hunting bow premium merchant stock; its 220 value belongs in non-stocked trade-value fallback.
- Do not instance-back the masterwork bow; current bows intentionally have no durability/sharpness.
- Do not add dagger/hatchet-specific acquisition code; `createAcquiredInstance()` already dispatches maintenance weapons.
- Do not add kind-specific harvest checks for dagger; capability resolution already exists.
- Do not give hatchet wood-chopping merely due to visual semantics.
- Do not duplicate existing `damascus_knife`, `masterwork_sword` or `battle_axe`.
- Do not invent dedicated GLB filenames unless the assets are actually added.
- Keep masterwork hunting bow inventory size `MD`, matching the refined-hunting-bow role and current ordinary hunting bow.
- Browser/hand-fit validation of held transforms is User-owned.

## 14. Verification targets

Automated:

- TypeScript compile;
- lint for touched files;
- weapon-maintenance tests;
- merchant assortment tests;
- trade/value tests;
- existing ranged/combat tests affected by catalog expansion.

Manual, User-owned:

- held dagger alignment;
- held hatchet alignment;
- bow grip/orientation;
- ground pickup scale;
- perceived attack timing;
- merchant assortment sanity;
- inventory labels/descriptions/value presentation.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
