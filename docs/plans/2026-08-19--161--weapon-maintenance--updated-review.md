# Updated review: Weapon maintenance

**Reviewed:** 2026-08-19
**Plan:** `2026-08-18--161--weapon-maintenance-and-sharpening.md`
**Decision:** `update`

## Summary

Plan 161 remains architecturally valid, but the repository has moved enough that the original plan should be updated before implementation.

The central conclusion is confirmed:

> **Maintenance must extend the existing generic `ItemInstance` model. It must not create a separate weapon/equipment state system.**

Plan 155 is implemented and is now the concrete architecture to reuse: `Inventory` owns count-based items and a separate instance map; `ItemInstance` is the minimal identity type; `TrapItemInstance` extends it with state; instances are cloned on read and persisted through the existing `SaveItemInstance[]` path. fileciteturn6file0L2-L2 fileciteturn7file0L2-L2

The biggest new implementation dependency is the **held-item ownership bridge**. `HeldTool` currently stores only `ToolKind`, while melee reads `ITEM_CATALOG[kind].melee`. Therefore maintenance cannot work correctly until an instance-backed weapon can retain its `instanceId` from inventory through the held state into the melee hit-resolution edge. fileciteturn13file0L2-L2 fileciteturn14file0L2-L2

## Repository state changes since the original plan

### 1. Plan 155 is done and is the correct foundation

The generic instance architecture is no longer planned work; it is implemented.

Current ownership is:

```text
Inventory
├── counts: Map<ItemKind, number>
└── instances: Map<string, ItemInstance>
```

`getInstance()` and `getInstances()` return clones, so callers cannot mutate stored state directly. `Inventory` already owns instance creation/storage/removal and serialization. fileciteturn7file0L2-L2

`itemInstances.ts` currently contains only the generic `ItemInstance` plus `TrapItemInstance`, with `INSTANCE_BACKED_KINDS` currently containing the two trap kinds. This is the exact extension point for weapon instances. fileciteturn6file0L2-L2

**Review consequence:** do not introduce `WeaponItemInstance` as a parallel hierarchy. A discriminated extension of `ItemInstance` is sufficient.

### 2. Current Item Catalog has a broader and more concrete weapon set

The current catalog contains melee definitions for:

- `knife`
- `long_sword`
- `spear`
- `short_sword`
- `axe`
- `pitchfork`
- `sickle`
- `shovel`
- the six Plan 160 quality weapons: `damascus_knife`, `damascus_short_sword`, `damascus_long_sword`, `obsidian_sword`, `battle_axe`, `masterwork_sword`.

The catalog keeps `MeleeConfig` as the single source of truth for damage, range, arc, timing and stamina. fileciteturn8file0L2-L2

Plan 160 is already `done` and explicitly kept durability/sharpening outside its scope. It added the six quality weapons through the existing `ItemKind` + `ITEM_CATALOG` + melee/defense pipeline. fileciteturn20file0L2-L2

`docs/items/WEAPONS.md` confirms the implemented set and current combat values, including the new variants. It also explicitly excludes `pickaxe` because it has no melee config. fileciteturn24file0L2-L2

**Review consequence:** Plan 161 must include the six Plan 160 kinds where they are actually present in the catalog, and must not use a vague "future variants" rule anymore.

### 3. `shovel` needs an explicit exclusion

The current catalog gives `shovel` melee damage, but it is primarily a digging tool. `pickaxe` has no melee config. The implementation notes for 161 already identified this distinction.

Therefore the maintenance target set should not simply be `ITEM_CATALOG[kind].melee !== null`.

The central maintenance predicate/set should explicitly define which melee-capable items have maintainable blades/edges.

Recommended initial set:

```text
knife
short_sword
long_sword
spear
axe
pitchfork
sickle
damascus_knife
damascus_short_sword
damascus_long_sword
obsidian_sword
battle_axe
masterwork_sword
```

`shovel` remains out of sharpening unless a future decision explicitly gives it maintenance semantics. `pickaxe` remains out because it currently has no melee config.

### 4. Held-item ownership is now the main architectural gap

`HeldTool` currently stores only:

```ts
ToolKind | null
```

and validates/equips through `inventory.has(kind, 1)`. It does not identify a particular physical instance. fileciteturn13file0L2-L2

Meanwhile `playerMelee` receives a `MeleeConfig`, advances the attack and emits the exact `hitReady` edge. `resolveMeleeHits()` then returns hit IDs. fileciteturn14file0L2-L2

This creates the critical bridge:

```text
Inventory WeaponItemInstance
        ↓
HeldTool
        ↓
instanceId
        ↓
ITEM_CATALOG[kind].melee
        ↓
existing melee hit edge
        ↓
maintenance mutation on the same instance
```

Do not duplicate durability/sharpness into `HeldTool`. The instance in `Inventory` remains authoritative.

### 5. Inventory needs one controlled mutation operation

Because inventory getters return clones, maintenance cannot update state by modifying the object returned by `getInstance()`.

Plan 161 should explicitly add the smallest controlled mutation API, e.g. `updateInstance(id, updater)` or a narrowly scoped weapon mutation method.

This is not a new maintenance store. It is an extension of the existing `Inventory` ownership model.

The same API will later support repair, NPC maintenance and instance-aware trade without exposing the internal `Map`.

### 6. Persistence must stay generic

Current `SaveItemInstance` contains:

```text
id
kind
durability?
```

and `Inventory.instancesToJSON()` / `instancesFromJSON()` already handle trap state. fileciteturn7file0L2-L2

Plan 161 should therefore extend this same record with optional `sharpness`, rather than creating `weaponInstances` or another save section.

Suggested shape:

```ts
{
  id,
  kind,
  durability?,
  sharpness?
}
```

Missing weapon fields should default to full state at the domain boundary. Invalid/non-finite values should be rejected/defaulted and valid values clamped to `[0, 1]`.

## Migration / acquisition dependency

This is more important than in the original plan because current weapons are still count-based.

`HeldTool.equip()` currently checks `inventory.has(kind, 1)`, which means existing weapon acquisition paths can still create ordinary counts. fileciteturn13file0L2-L2

For every weapon in the central maintenance set, the rule must become:

```text
acquire
→ createItemInstance()
→ Inventory.addInstance()
```

and old count-based save data must have one deterministic migration rule:

```text
knife ×1
→ knife instance { id, durability: 1, sharpness: 1 }
```

No historical condition can be reconstructed, so full condition is the only deterministic migration.

Audit at least:

- starting `knife`;
- merchant purchases;
- village/onetime weapon grants;
- quest rewards;
- world drops/pickups if any;
- all Plan 160 weapon acquisition paths.

Do not leave the same physical weapon kind represented by both count and instance paths after migration.

## Maintenance state ownership

The recommended ownership remains:

```text
ItemKind
  → static definition / base combat config

ItemInstance
  → identity + mutable physical condition

Inventory
  → authoritative storage + mutation + persistence

HeldTool
  → reference to selected instance, not a second state copy

playerMelee / combat integration
  → reads current instance state and applies the result

UI
  → selects instance ID and displays current state
```

This avoids a weapon manager, equipment manager, durability manager or UI-owned condition state.

## Sharpness and durability

The two values should remain independent:

```text
durability = physical condition
sharpness  = edge effectiveness
```

For v1, initializing and persisting durability is sufficient. Do not expand Plan 161 into a full repair/broken-weapon system unless the current implementation needs minimal durability wear for coherence.

Sharpness should be the actual maintenance mechanic:

```text
successful melee hit
→ calculate damage using current sharpness
→ apply hit
→ apply sharpness wear exactly once
```

The current melee state machine already provides a single `hitReady` edge, so there is no reason to add a per-frame maintenance tick. fileciteturn14file0L2-L2

## Profile / resolver ownership

Do not add material or weapon-stat systems.

Plan 160 already established the correct boundary: item kind + catalog configuration, with no separate weapon system. fileciteturn20file0L2-L2

Plan 161 should add only maintenance-specific data/functions, conceptually:

```text
maintenance profile by ItemKind
sharpness → damage modifier
successful hit → sharpness wear
instance + source → sharpening result
```

Keep the exact curve and wear constants centralized.

Do not add base damage/range/timing to the instance.

## Whetstone / sharpening

`whetstone` should be a normal stackable `ItemKind`, not an instance.

Sharpening should be a domain operation using:

```text
instanceId + sharpening source
```

The UI must not calculate the new sharpness or mutate a copied instance.

The operation should validate the instance, calculate the new state, consume the stone atomically if required, and persist through the existing inventory path.

The grindstone/workshop remains optional and should be deferred unless existing interactable/place infrastructure makes it genuinely trivial.

## Trading boundary

Plan 155 already established instance-aware trade architecture and condition-based pricing concepts. Plan 161 does not need to duplicate that work.

Weapon-specific price modifiers based on durability/sharpness should remain deferred unless current trade infrastructure is already being extended for instance selection.

Maintenance must not own price calculation.

This avoids overlap between maintenance and future trade work while preserving the ability to calculate a weapon's value from its current instance state later.

## Later weapon plans / dependencies

### Plan 162 — bows, arrows, ranged combat

Plan 162 explicitly expects ammunition to use the generic `ItemInstance` architecture and wants ranged combat to extend the existing combat flow rather than create a separate system. fileciteturn21file0L2-L2

This reinforces the architectural decision for Plan 161:

- do not create weapon-specific inventory storage;
- do not create a separate equipment model;
- keep mutable physical state in generic item instances;
- keep combat configuration in item catalog/domain configuration.

However, Plan 161 should **not** try to generalize maintenance into a complete universal equipment-condition framework for bows and arrows. That would create unnecessary scope overlap with 162.

### Plan 171 — Weapon Browser

Plan 171 is read-only and derives its weapon list from the existing item catalog. It explicitly forbids a parallel weapon-stat registry and currently considers `melee !== null` as the initial candidate, while warning that tools vs weapons may need semantic distinction. fileciteturn22file0L2-L2

This creates one useful dependency for Plan 161:

> If maintenance introduces a central weapon/edge predicate, it should be reusable by the browser rather than duplicating another hard-coded list there.

Do not make Plan 161 dependent on the browser UI, and do not add browser-specific fields solely for maintenance.

## Dependency discrepancy: requested Plan 150 path

The user-specified dependency:

```text
docs/plans/2026-08-18--150--weapon-system.md
```

does not exist in the current repository.

The actual Plan 150 is:

```text
docs/plans/2026-08-18--150--combat-mode-defense-and-downed-state.md
```

and it is already reflected in the current combat architecture. The original Plan 161 itself lists `155` and `160` as dependencies, not 150. fileciteturn19file14L71-L75 fileciteturn1file0L2-L2

This should be corrected in the Plan 161 metadata/references rather than creating a fictional `weapon-system` dependency.

## Overlap findings

### Keep inside Plan 161

- weapon instance classification;
- weapon instance creation/migration;
- durability/sharpness state;
- generic instance persistence extension;
- held `instanceId` bridge;
- controlled inventory mutation;
- sharpness damage modifier;
- sharpness wear;
- sharpening domain operation;
- `whetstone` item;
- focused inventory details UI needed to select an instance.

### Keep outside Plan 161

- full repair/broken weapon lifecycle;
- general material system;
- dynamic trade pricing implementation;
- ranged combat/projectiles/critical hits;
- NPC blacksmith behaviour;
- generic equipment manager;
- weapon browser implementation;
- generic browser framework;
- 3D weapon preview.

## Recommended updated implementation order

1. Define the central instance-backed maintenance target set/predicate.
2. Extend `ItemInstance`/clone/type guards for weapon state.
3. Extend `SaveItemInstance` and generic inventory serialization/defaulting.
4. Add the minimal controlled instance mutation API to `Inventory`.
5. Define maintenance profiles and pure sharpness modifier/wear/sharpen functions.
6. Audit and convert all acquisition paths for supported weapons.
7. Add old count-based weapon-save migration to full-condition instances.
8. Extend `HeldTool` with `instanceId` while keeping non-instance tools compatible.
9. Integrate instance lookup, sharpness damage and wear at the existing melee hit-resolution edge.
10. Add `whetstone` and sharpening action.
11. Update item-details UI to select/display concrete weapon instances.
12. Add focused tests for migration, persistence, held-instance/melee bridge, wear and sharpening.
13. Run type-check/test/build.
14. Perform the narrow browser verification for one supported weapon.

Do not start with UI. The risky part is the ownership bridge between count-based held tools, inventory instances and the existing melee resolver.

## Acceptance criteria updates

In addition to the original criteria, Plan 161 should explicitly require:

- [ ] The supported weapon set is defined centrally and is not duplicated across inventory/combat/UI.
- [ ] Every supported weapon acquisition creates an `ItemInstance`.
- [ ] Existing count-based supported weapons are deterministically migrated to full-condition instances on load.
- [ ] `HeldTool` retains the selected instance ID for instance-backed weapons.
- [ ] Combat resolves the current instance by ID rather than copying durability/sharpness into held state.
- [ ] Sharpness wear happens exactly once at the existing successful-hit resolution edge.
- [ ] `Inventory` remains the sole owner of mutable instance state.
- [ ] Weapon persistence uses the existing `SaveItemInstance[]` representation.
- [ ] `shovel` is explicitly out of scope unless maintenance semantics are deliberately added.
- [ ] Plan 160's six implemented weapon variants are covered by the central maintenance classification.
- [ ] No separate weapon/equipment/maintenance manager is introduced.
- [ ] No weapon-specific trade pricing is duplicated in maintenance.
- [ ] The maintenance classification can be reused by later catalog/browser work without making the browser authoritative.

## Final decision

**`update`**

Plan 161 should proceed, but the original plan should be updated before implementation.

The architecture is correct and should **extend Plan 155's generic item-instance mechanism**. The necessary changes are mostly ownership/integration clarifications, not a redesign.

The most important correction is to make the `HeldTool → instanceId → Inventory → melee hit edge` bridge explicit and authoritative, and to add deterministic migration for currently count-based weapons.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
