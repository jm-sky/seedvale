# Implementation Notes: Wearable armor and combat equipment

Plan: `docs/plans/items-player-029-wearable-armor-and-combat-equipment.md`

## Recon summary

Current code already has the right seams for armor without introducing a parallel combat or movement subsystem:

```text
Inventory owns item
→ wearable equipment references owned item
→ one pure modifier resolver
→ existing player systems consume relevant modifiers
```

The implementation should stay narrow: persistent player `body` equipment, catalog-driven armor stats, inventory equip/unequip UI, save/load, and modifier integration into damage/melee/movement. Durability, repair, extra slots, shields and new weapons remain out of scope.

## 1. Ownership and equipment state

### `src/items/Inventory.ts`

`Inventory` is already the authoritative owner of carried items. Do not create `EquipmentInventory` or move armor into a second container.

Important invariant:

```text
Inventory owns armor
EquipmentState only references which owned armor is worn
```

Armor can remain count-backed in this plan. Do not make it instance-backed only to prepare for future durability.

### New focused module: `src/items/equipment.ts`

Recommended owner for the wearable state and validation helpers.

Keep V1 deliberately small:

```ts
export type EquipmentSlot = 'body'

export type EquipmentState = {
  body: ItemKind | null
}
```

Prefer a small API over exposing mutable fields everywhere, e.g. conceptually:

```ts
createEquipmentState(initial?)
equipItem(state, inventory, kind)
unequipSlot(state, 'body')
syncEquipmentWithInventory(state, inventory)
```

Exact names may adapt, but centralize these invariants:

- item exists in `Inventory`,
- catalog item declares matching wearable slot,
- stale/invalid equipped reference clears rather than recreating the item,
- no Vue-side state mutation.

Do not attach this state to `HeldTool`; `HeldTool` remains the right-hand/action-time item concept.

## 2. Catalog metadata

### `src/items/itemCatalog.ts`

`ItemCatalogEntry` is already the gameplay metadata owner for melee/ranged/defense/capabilities/etc. Armor belongs here, not in a second `ARMOR_STATS` table.

Add a focused type, conceptually:

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

Neutral semantics:

- absent multiplier = `1`,
- `damageReduction` is a fraction removed from post-block combat damage,
- do not mix active block stats into armor,
- do not add universal `attackSpeedMultiplier`; current melee has separate wind-up/hit/recovery phases.

Only add fields that current consumers actually wire. If sprint integration is not clean, defer `sprintStaminaMultiplier` rather than creating new cadence/state.

### `src/items/items.ts`

Keep ordinary metadata here:

- label,
- category,
- weight,
- size.

Concrete initial armor kinds are asset-gated. Do not create placeholder entries without usable models/licensing/presentation path.

## 3. One pure modifier resolver

Prefer a second focused pure helper in `src/items/equipment.ts` or sibling `equipmentModifiers.ts` if that keeps the module clearer.

Conceptual result:

```ts
export type EquipmentModifiers = {
  incomingDamageMultiplier: number
  meleeStaminaMultiplier: number
  meleeWindUpMultiplier: number
  meleeRecoveryMultiplier: number
  movementSpeedMultiplier: number
  sprintStaminaMultiplier: number
}
```

Resolver contract:

```ts
resolveEquipmentModifiers(equipment, inventory)
```

Rules:

- validate ownership/catalog compatibility before applying effects,
- invalid references behave as empty equipment,
- no mutation,
- neutral defaults are all `1`,
- no item-kind branching outside catalog data.

This should be the only derivation point for armor gameplay effects.

## 4. Incoming damage integration

### `src/player/playerDamage.ts::applyPlayerDamage()`

This is the authoritative player HP-loss entry and already applies active held-item defense through `resolveDefense()`.

Preserve order:

```text
raw combat damage
→ resolveDefense() from held item
→ armor mitigation on remaining damage
→ HealthState
```

Do not put armor into `DefenseConfig`; active directional defense and passive worn mitigation are different mechanics.

Important current pitfall: `applyPlayerDamage()` is also used by starvation/dehydration paths. Armor must not reduce those.

Preferred implementation direction:

- add the smallest explicit damage classification/source flag required to distinguish armor-applicable combat/physical hits from non-armor HP drains,
- pass equipment modifier into `applyPlayerDamage()` or derive it at its caller/composition boundary,
- do not infer armor applicability purely from presence of attacker coordinates if that would encode fragile semantics.

Keep existing defense skill XP behavior unchanged: armor mitigation must not award defense block XP.

## 5. Melee stamina and timing

### `src/player/playerMelee.ts::createPlayerMelee()`

Current `requestAttack()`:

1. checks `cfg.staminaCost`,
2. drains stamina,
3. drains Vigor from configured attack duration,
4. resolves agility into recovery with `resolveMeleeRecovery()`,
5. starts the shared lifecycle.

Recommended integration:

```text
base staminaCost
× equipment.meleeStaminaMultiplier
→ existing gate + drain
```

Do not mutate the weapon's `MeleeConfig` in `ITEM_CATALOG`.

For recovery:

```text
cfg.recovery
→ resolveMeleeRecovery(..., agility)
→ × equipment.meleeRecoveryMultiplier
→ lifecycle.start(...)
```

This preserves current agility semantics and makes armor a final cadence penalty.

If wind-up is implemented:

```text
cfg.windUp × equipment.meleeWindUpMultiplier
```

must be passed coherently into the lifecycle. Avoid changing `hitWindow`, range, arc or damage.

### Vigor cost decision

Current Vigor effort uses the configured `windUp + hitWindow + recovery`, deliberately not agility-resolved recovery.

Do not accidentally change that policy while adding armor.

Preferred V1 decision:

- melee stamina reflects armor immediately,
- recovery timing reflects armor,
- keep existing Vigor-cost semantics unchanged unless the implementation can add armor effort without conflating the existing agility rule.

If changed, document explicitly and add focused tests.

### Lunge stamina

`LUNGE_STAMINA_COST` is independent today. Do not multiply it by armor unless explicitly chosen in the plan later. Preserve current behavior in V1.

## 6. Movement integration

### `src/player/playerEncumbrance.ts`

Leave `computeEncumbrance()` unchanged. Armor weight already contributes to `Inventory.totalWeight()` naturally, so heavy armor automatically participates in carry-weight penalties.

Do not bake armor-specific movement effects into encumbrance math.

### `src/player/PlayerController.ts`

Current pattern is good: `PlayerController` receives derived encumbrance through `setEncumbrance()` rather than querying `Inventory`.

Mirror that separation for wearable mobility, e.g. conceptually:

```ts
setEquipmentMovementMultiplier(value: number)
```

and compose in the final movement multiplier near existing speed calculation.

Do not import `Inventory`/`ITEM_CATALOG` into `PlayerController` only for armor.

Result should preserve identity when naked:

```text
existing movement result × 1
```

Armor's own item weight and `movementSpeedMultiplier` are intentionally two separate effects:

```text
weight → existing encumbrance
armor design → equipment movement modifier
```

## 7. Sprint stamina

### `src/player/PlayerNeeds.ts` / `PlayerController.ts`

Recon during implementation should locate the exact existing sprint-drain expression.

Only wire `sprintStaminaMultiplier` if it can be applied as a pure multiplier to that existing drain amount.

Do not introduce:

- an armor update tick,
- a second stamina drain loop,
- armor-owned timers.

If the seam is not narrow, omit this effect from V1 and keep the catalog field absent.

## 8. Inventory UI / application wiring

### `src/app/inventoryWiring.ts`

This is the established application layer behind inventory actions such as `equipTool`, `unequipTool`, drop, sharpen and refresh.

Extend the same surface with focused wearable actions, conceptually:

```ts
equipArmor(kind)
unequipArmor(slot)
```

Dependencies should receive the equipment state from `createApp.ts`; Vue must not mutate equipment directly.

After a successful equip/unequip:

- refresh inventory screen,
- refresh any character/equipment read model if added,
- keep HUD weight unchanged except where inventory itself changes (equipping does not change ownership/weight),
- no world mutation.

### Inventory screen

Reuse existing item-detail action patterns. Armor item should expose:

```text
Załóż
```

Current equipped body armor should expose:

```text
Zdejmij
```

Presentation data should come from catalog/equipment state, not duplicated UI constants.

`items-player-024` implementation notes are useful precedent for keeping identity/action handling in `inventoryWiring.ts` instead of introducing another selected-item store.

Do not build a new full Equipment screen in this plan.

## 9. Persistence

### `src/persistence/saveData.ts`

Add the minimum optional save shape for player wearable state. Prefer a dedicated optional field rather than hiding it inside inventory counts, e.g. conceptually:

```ts
playerEquipment?: {
  body?: ItemKind
}
```

Older saves must restore to empty equipment.

Validation must reject saved kinds that:

- are not valid `ItemKind`,
- no longer declare body armor metadata,
- are not actually owned by restored player inventory.

Do not mint/restore missing armor from the equipment snapshot.

### `src/app/saveState.ts`

`SaveStateDeps` currently receives `inventory`, `heldTool`, primary weapon selection, etc., and `buildSaveData()` serializes those explicit player item states.

Add equipment state as another explicit dependency and serialize only the selected body reference.

### Restore / `createApp.ts`

Find the existing inventory + HeldTool restore sequence and restore wearable equipment only after inventory contents are available, because ownership validation depends on them.

Preferred ordering:

```text
restore Inventory
→ restore/validate EquipmentState against Inventory
→ derive modifiers
→ supply player/combat/controller consumers
```

New Game initializes empty equipment.

## 10. Composition ownership

### `src/app/createApp.ts`

This should own the live player equipment instance similarly to `Inventory`, `HeldTool`, and primary weapon selection.

It should pass the same state to:

- inventory wiring,
- save state,
- modifier derivation / game-loop consumers.

Avoid putting authoritative equipment state in Vue/store.

If modifier derivation is cheap (one body slot), derive on demand rather than maintaining another mutable cache. Cache only if an actual call-site needs it and invalidation stays explicit.

## 11. Concrete armor assets

Before adding each candidate armor kind:

- verify actual model path,
- verify license and update `docs/assets/CREDITS.md`,
- update `docs/assets/MODELS.md` where appropriate,
- verify scale/orientation/presentation against the current player model,
- decide whether the model is a dropped/world item only, a wearable visual, or both.

Important: the gameplay system does not require wearable 3D visualization to exist in the same commit if no clean character-attachment/rig path exists, but do not claim visual armor is implemented when only inventory/combat effects exist.

Desired gameplay roles remain:

```text
gambeson → light / mobile
leather  → balanced
chainmail → stronger protection / higher effort and cadence cost
```

Do not finalize exact numbers before the actual concrete items are confirmed.

## 12. Tests worth adding

Focused tests should cover architecture, not only balance values.

### Equipment state

- cannot equip a non-owned item,
- cannot equip a non-armor item into `body`,
- equipping valid body armor replaces prior selection,
- unequip clears only the selected slot,
- `syncEquipmentWithInventory()` clears stale references.

### Modifier resolver

- no armor returns all neutral multipliers,
- equipped owned armor maps catalog values correctly,
- stale/missing inventory ownership returns neutral modifiers.

### Damage

- active block still resolves first,
- armor reduces only remaining applicable combat damage,
- starvation/dehydration is not reduced by armor,
- armor mitigation does not award defense block XP.

### Melee

- effective stamina gate/drain uses multiplier,
- agility recovery still resolves and armor penalty composes after it,
- lunge cost remains unchanged.

### Movement

- no armor preserves current movement result,
- armor movement penalty composes with encumbrance rather than replacing it.

### Persistence

- save/load restores valid equipped body armor,
- old save without equipment restores empty,
- saved equipment absent from inventory restores empty,
- saved non-armor kind restores empty.

## 13. Scope guards for implementation

Do not expand this implementation into:

- armor durability/condition,
- armor instances solely for future durability,
- armor repair,
- crafting/production/economy,
- damage type taxonomy,
- armor penetration,
- shields/off-hand,
- head/hands/legs slots,
- NPC armor decisions,
- companion equipment management,
- new weapon kinds,
- generic combat refactor.

If an implementation choice appears to require one of those, stop at the smallest seam needed for `items-player-029` and record the follow-up separately.

## 14. Suggested implementation order

1. Add `EquipmentState` + validation/sync helpers and tests.
2. Add `ArmorConfig` to `ITEM_CATALOG` + pure modifier resolver and tests.
3. Wire equipment creation/restore/save in `createApp.ts`, `saveData.ts`, `saveState.ts`.
4. Add inventory wiring and equip/unequip UI.
5. Integrate combat-damage classification + passive armor mitigation.
6. Integrate melee stamina + recovery modifiers.
7. Integrate movement multiplier.
8. Add sprint stamina modifier only if the seam is narrow.
9. Add concrete armor kinds only for confirmed assets.
10. Update item/assets/state docs that describe the implemented result.
11. Run automated checks; browser/manual verification remains for the User.

## 15. Documentation / preflight discoverability

Add JSDoc to the important public equipment APIs and modifier resolver, including `@domain items-player` and useful `@system` / `@role` tags so `scripts/claude/pre-implementation.ts` can find the ownership and integration seams cheaply.

Do not run browser verification. Do not run `pnpm docs:sync` locally when the repository workflow owns derived documentation updates.

## 16. Implementation record (2026-09-12)

Implemented as scoped, with two deliberate deviations from the suggested API surface — both reduce risk without weakening any invariant the plan cares about:

- **No scattered `syncWithInventory()` calls.** Every gameplay/UI/save consumer reads through `equippedBodyArmor()`/`resolveEquipmentModifiers()` (live ownership+catalog re-validation on every call) instead of trusting `EquipmentState.body()` directly. This makes the "no ghost armor bonus" invariant hold *by construction*, without needing `equipment.syncWithInventory()` threaded through every drop/sell/trade call site the way `HeldTool.syncWithInventory()` is. `syncWithInventory()` still exists and is unit-tested (hygiene for the raw accessor), just not wired into the app layer.
- **`ApplyPlayerDamageParams.equipmentModifiers` is optional, defaulting to neutral.** A caller opts in by passing the resolved modifiers (fauna combat, forced-entry blade trap, mount-fall damage all do); `tickPlayerStarvationDamage()` simply never does. This is the "smallest explicit classification" the plan asked for — no new damage-source/category enum was needed.

Scope trimmed at the asset gate: only `leather_armor` (Quaternius `Armor Leather`) and `chainmail` (Quaternius `Armor Metal`) shipped — both models were already staged locally. The third "padded gambeson" tier from the plan's desired archetypes has no confirmed distinct asset and was **not** added as a placeholder; it's a clean follow-up once a light-armor model is sourced. Both shipped kinds are ground/inventory-pickup GLBs only (`items/itemModels.ts`) — no character-attachment worn visual, per the plan's own explicit allowance to defer that.

`meleeWindUpMultiplier` (optional in the plan's suggested `ArmorConfig`) was not added — no consumer needed it, and the plan itself flags a universal attack-speed field as something to avoid. `sprintStaminaMultiplier` was implemented (`PlayerNeeds.tickPlayerStamina()`'s sprint-drain seam turned out to be a single-line, clean multiplication).

Merchant acquisition: both kinds are Kupiec stock (`items/tradeCatalog.ts`), same acquisition path as the existing weapon tiers — the plan didn't mandate a specific source, and no other item-acquisition mechanism fit better.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
