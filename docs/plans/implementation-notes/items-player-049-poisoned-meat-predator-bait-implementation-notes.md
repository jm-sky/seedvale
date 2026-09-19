# Implementation Notes: items-player-049 — Poisoned meat predator bait

**Plan:** `docs/plans/items-player-049-poisoned-meat-predator-bait.md`  
**Reviewed:** 2026-09-19  
**Source of truth:** current `main` code + docs; plan is intent, current code wins on conflicts.

## Current implementation facts

### Existing poison resource is already real

`poisonous_herb` already exists in the live item/world pipeline:

- `src/items/items.ts` — `ItemKind` + item definition;
- `src/items/itemCatalog.ts` — catalog entry explicitly says no poison effect exists yet;
- `src/terrain/chunkItems.ts` — natural world spawn;
- `src/world/herbalGathering.ts` — Herbalist gather kind;
- `src/ai/npcProfessionWork.ts` — Herbalist work can gather it.

Do not add another poison plant or duplicate resource acquisition.

### Dropped-food fauna pipeline already exists

`fauna-023` is implemented on `main` and currently `verification needed`.

Relevant files:

- `src/fauna/animalAttraction.ts`
  - assembles dropped-food attraction sources;
  - `droppedFoodAttractionSource(...)` derives source semantics from item metadata / `FoodBatch`;
  - `bait(kind)` ultimately reads `ITEM_CATALOG[kind].food?.bait`;
- `src/fauna/animalDefs.ts`
  - `AnimalDef.diet` is the species item-edibility authority;
  - bear already has mixed item diet;
  - meat compatibility is not a poison-specific concern;
- `src/fauna/animalForaging.ts`
  - owns food target validation, consumption and hunger relief;
  - existing dropped-food consume path must remain the atomic removal seam;
- `src/fauna/AnimalAgent.ts`
  - owns movement/intent and fauna health/death lifecycle.

Do not create a parallel poisoned-bait attraction path.

### Damage/death seam is already sufficient

- `src/shared/HealthState.ts` owns generic HP mutation.
- `AnimalAgent.takeDamage()` is the fauna-owned incoming damage/death seam used by normal combat.
- Existing death collapses into the ordinary corpse/harvest/scavenging lifecycle.

For V1 poison is simply non-combat HP loss. Do not introduce `TemporaryConditionsState` for animals, DOT timers or poison persistence.

If `takeDamage()` has source bookkeeping whose current union only accepts combat sources, either:
1. use the narrowest existing non-combat-safe fauna damage seam if present at implementation time, or
2. extend the source type minimally for diagnostics.

Do not bypass the owner and mutate `animal.health` from items/world code.

### Food freshness/provenance must survive the transformation

Relevant files:

- `src/items/Inventory.ts`
  - `removeWithFreshness(kind, n, nowDays)` returns exact checkpointed `FoodBatch[]`;
  - `addWithFreshness(kind, n, batches, nowDays)` restores them without resetting effective age;
- `src/items/foodFreshness.ts`
  - `FoodBatch.sourceSpecies` is existing meat provenance;
  - `sourceSpeciesForMeatKind()` maps species-specific raw meat kinds;
  - `bait(kind)` is the catalog-driven bait classifier;
  - use canonical freshness helpers rather than a second age calculation;
- `src/items/createDroppedItems.ts`
  - dropped perishable units already carry `foodBatch`;
- `src/persistence/saveData.ts`
  - `SaveDroppedItem` already persists `kind + foodBatch`.

The transform must use freshness-aware inventory APIs. Plain `remove()` + `add()` would reset/lose perishable state.

## Architectural decision: one `poisoned_meat` ItemKind

Use a single new `ItemKind` rather than poison metadata on existing meat batches.

Reason:

- `Inventory` authoritative counts and most inventory selection operate by `ItemKind`;
- clean and poisoned `deer_meat` sharing one kind would be indistinguishable at normal inventory/drop selection;
- selecting one specific poisoned `FoodBatch` would require widening inventory/UI semantics far beyond this feature;
- one `poisoned_meat` kind still preserves original species through `FoodBatch.sourceSpecies`.

Do not add `poisoned_deer_meat`, `poisoned_wolf_meat`, etc.

## Item definition/catalog shape

Touch:

- `src/items/items.ts`
- `src/items/itemCatalog.ts`
- any generated item documentation/tests required by existing item additions.

`poisoned_meat` should have the metadata necessary for:

- food freshness;
- `food.bait === 'meat'`;
- world drop/pickup;
- normal weight/value semantics consistent with raw meat.

Do **not** make it a normal player `consumable.need === 'hunger'` in V1. The feature is fauna bait; player self-poisoning is outside scope.

Check whether any food-category helper requires `consumable` to classify perishables. If current code couples freshness registration to `consumable`, preserve the smallest catalog contract necessary without wiring `consumeItem()` as a UI action; do not create a second freshness registry.

## Eligible input meat

Do not hand-code a second independent list if current item metadata can express eligibility.

Preferred eligibility:

```text
bait(kind) === 'meat'
AND kind is raw/unprocessed meat
AND kind !== poisoned_meat
```

Current expected eligible kinds include:

- `raw_meat`
- `deer_meat`
- `wolf_meat`
- `boar_meat`
- `rabbit_meat`
- `beef`

Do not include:

- `roasted_meat`
- `dried_meat`
- `fish`
- already-`poisoned_meat`

If no existing raw-vs-processed predicate exists, add one small items-domain helper derived from catalog/provenance conventions rather than scattering arrays across UI/action/fauna code.

## Poison-meat transformation owner

Prefer a small pure/items-domain module, e.g. `src/items/poisonedMeat.ts`.

Responsibilities:

- identify eligible input meat;
- choose a deterministic input kind when several are carried;
- perform all precondition checks;
- preserve `FoodBatch`;
- expose a compact result usable by the player action and tests.

Suggested flow:

```text
resolve eligible meat
→ verify herb + meat + output capacity
→ removeWithFreshness(meat, 1, nowDays)
→ remove(poisonous_herb, 1)
→ addWithFreshness(poisoned_meat, 1, preserved batch, nowDays)
```

Atomicity matters. If output capacity or any precondition fails, mutate nothing.

Because `poisoned_meat` may have a different item weight than the source, capacity must be checked before input removal using the actual post-transform inventory state/weight semantics. Do not assume replacing one item with one item is automatically capacity-neutral.

## Player action/UI integration

Current action architecture:

- app/domain actions return `ActionResult`;
- Quick Actions presentation is Vue;
- `src/ui-vue/playerQuickActions.ts` owns shared quick-action definitions for existing action groups;
- `src/app/userActions.ts` + `createApp.ts` currently own/sync availability for several quick actions;
- execution paths revalidate live state even when UI availability was previously computed.

Add `Zatruj mięso` by extending the existing Quick Actions/action-contract pattern, not by implementing inventory mutation in Vue.

Likely touched files after tracing the exact current grouping:

- `src/app/userActions.ts`
- `src/app/createApp.ts`
- `src/ui-vue/playerQuickActions.ts` or the current non-fire/general action catalog used by `QuickActionsScreen.vue`
- `src/ui-vue/screens/QuickActionsScreen.vue` only if the current catalog needs a new row/category; keep presentation dumb.

Availability should expose requirements structurally:

- 1 × `poisonous_herb`;
- at least 1 eligible raw meat;
- output capacity if the existing action contract supports expressing it.

Execution must call the items-domain transform and revalidate live inventory.

## Detection: where it belongs

Detection is a fauna consumption concern, not an item transform concern.

Insert it at the last point where the animal has reached and revalidated the dropped `poisoned_meat`, immediately before the existing atomic dropped-food consume.

This preserves:

- attraction as ordinary meat;
- no free hunger relief if the item is rejected;
- no duplicate world removal path;
- no poison roll for an item that disappeared before arrival.

Do not roll when:

- attraction source is merely discovered;
- target is selected;
- animal is still walking toward it.

That would allow target changes/reroutes to reroll or consume randomness without an actual eating attempt.

## Deterministic detection roll

Use the same design discipline as:

- `src/shared/waterPoisoningExposure.ts`
- `src/shared/foodPoisoningExposure.ts`
- deterministic fauna population-protection rolls.

Required inputs should identify one encounter stably, e.g.:

```text
worldSeed + animalId + droppedItemId + stable encounter salt
```

A dropped item has a stable id. Reusing that id means one animal/source pair naturally resolves to the same result and cannot reroll every frame.

If the animal rejects the item, keep a bounded transient ignore/cooldown in the existing attraction/investigation memory shape rather than adding persisted state.

Important: if the existing `fauna-023` investigated-source cooldown can represent a rejected dropped-food source, reuse/extend it. Do not add a second poison-only map on `AnimalAgent` unless the current abstraction cannot represent the semantics.

## Poison damage tuning

Before choosing the constant, read the current `MAX_HP` values used by bear/wolf/fox.

Desired V1 behavior:

- meaningful weakening;
- can finish an already injured animal;
- does not one-shot a healthy bear;
- same base poison dose for all species in V1.

Keep one constant near the fauna/poison consumption resolver, not in UI or item catalog unless the catalog is already the established owner for consumption effects.

No resistance table in V1.

## Hunger relief ordering

On successful poison consumption:

1. atomically consume dropped item;
2. apply the same hunger relief the ordinary dropped-food path would apply;
3. apply one poison damage event.

Do not skip nutrition just because food was poisoned: the animal did eat the meat.

If damage is lethal, normal death/collapse should happen after the same successful consume event.

## Tests to extend/add

Prefer focused pure tests over constructing full GLTF-backed `AnimalAgent` unless lifecycle integration specifically requires it.

Suggested coverage:

### Items

New focused test for `poisonedMeat.ts`:

- each eligible raw meat kind works;
- processed meat/fish/already-poisoned meat rejected;
- herb absent → no mutation;
- meat absent → no mutation;
- insufficient capacity → no mutation;
- exactly one herb + one meat consumed;
- `FoodBatch.acquiredAtDays` / effective-age checkpoint preserved;
- `sourceSpecies` preserved.

### Attraction

Extend `src/fauna/animalAttraction.test.ts` or closest current fauna-023 test:

- `poisoned_meat` produces meat attraction source;
- bear/wolf/fox compatibility follows existing diet;
- incompatible herbivore stays rejected.

### Consume/detection

Add focused test around the current dropped-food arrival/consume helper:

- deterministic detection true → no remove, no relief, no damage, source ignored;
- detection false → exactly one remove, normal relief, exactly one damage;
- same animal + droppedItem id produces stable detection result;
- different dropped item id can produce a different roll;
- lethal damage delegates to existing fauna death path.

Do not duplicate `HealthState` unit tests.

## Implementation order

1. Add `poisoned_meat` catalog/definition + focused metadata tests.
2. Add items-domain poison transform preserving `FoodBatch`.
3. Add player action + Quick Actions wiring.
4. Confirm ordinary `fauna-023` attraction works from metadata alone; only adjust diet/attraction code if a generic contract actually blocks the new item.
5. Add deterministic detection at the final dropped-food consume seam.
6. Apply direct HP damage through fauna owner API after successful consume.
7. Add focused tests.
8. Update relevant state/item docs only after code is final.

## Avoid

- new poison plant;
- generic crafting/alchemy framework;
- `AnimalPoisonManager`;
- animal `TemporaryConditionsState`;
- DOT/timers;
- poison persistence;
- per-species poison branches;
- duplicate meat compatibility tables;
- poison-specific dropped world object;
- direct health mutation outside `AnimalAgent`;
- frame-dependent `Math.random()`;
- resetting `FoodBatch` freshness during conversion;
- browser verification by AI.
