# Implementation notes: Weapon maintenance and sharpening (Plan 161)

## Review summary

Plan 161 is directionally correct, but it currently leaves several implementation-critical details open. The biggest issue is that the existing code is **not yet instance-aware in the held/melee path**: `ItemInstance` exists only as a generic inventory-side object, while `ITEM_CATALOG[kind].melee` and the player melee flow are currently keyed by `ItemKind`. The implementation should therefore extend the existing path rather than introduce a parallel weapon/equipment system.

Plan 155 is already done and provides the intended instance pattern: `ItemInstance` is minimal, `TrapItemInstance` adds state, `Inventory` stores instances separately from count-based items, and persistence uses optional instance fields. Reuse that architecture instead of redesigning it.

## 1. Do not introduce a separate `WeaponItemInstance` hierarchy unless needed

Prefer the existing discriminated-extension pattern:

```ts
export type WeaponItemInstance = ItemInstance & {
  kind: WeaponItemKind
  durability: number
  sharpness: number
}
```

but keep the generic `ItemInstance` API intact.

The important part is not the type name; it is that weapon instances are recognized centrally and cloned/persisted with their state exactly like `TrapItemInstance`.

Do not add a second weapon manager or a separate equipment store.

## 2. Define the instance-backed weapon set centrally

Add a single central set/predicate, analogous to `INSTANCE_BACKED_KINDS`:

```ts
WEAPON_INSTANCE_KINDS
isWeaponItemInstance(instance)
isWeaponInstanceKind(kind)
```

Do not duplicate `knife`, `long_sword`, etc. checks throughout inventory, combat and UI.

Start with the weapons that actually participate in the current melee path:

- `knife`
- `long_sword`
- `spear`
- `short_sword`
- `axe`
- `pitchfork`
- `sickle`

`shovel` should **not** automatically become a sharpening weapon just because it has melee damage. It is primarily a digging tool. `pickaxe` currently has no melee config and should remain out of scope.

For `spear`, `pitchfork`, etc. decide from current gameplay semantics, but make the decision once in the central predicate rather than in each caller.

Plan 160's future weapon variants should only become instance-backed when their actual `ItemKind`s exist in the current catalog.

## 3. Preserve the existing `MeleeConfig` source of truth

Do not add base damage/range/timing fields to `WeaponItemInstance`.

Current architecture already has `ITEM_CATALOG[kind].melee` as the single source of truth for base melee values. Instance state should be a modifier on top:

```text
ITEM_CATALOG[kind].melee
        ↓
weapon instance state
        ↓
sharpness damage modifier
        ↓
existing resolveMeleeHits()
```

The implementation should not create a second `WeaponStats`, `WeaponConfig`, or per-material combat resolver.

## 4. The held-item path is the main architectural change

The current melee system is `ItemKind` based. A weapon cannot lose sharpness correctly if the held slot only remembers `kind`.

The held representation must therefore retain the instance ID for instance-backed weapons:

```text
HeldTool
├── kind
└── instanceId?   // required for instance-backed weapons
```

Keep `instanceId` optional so existing non-instance tools continue to work.

Do not duplicate durability/sharpness into `HeldTool`. The inventory instance remains the single source of truth.

When a weapon is equipped/selected, store only its `instanceId` reference in the held state. On combat resolution, resolve the current instance from inventory by ID.

If the current held implementation is not structured this way, make the smallest compatible change rather than replacing the whole held-tool system.

## 5. Add a controlled instance mutation API to Inventory

The current `Inventory.getInstance()` / `getInstances()` return clones, which is correct encapsulation. Consequently combat/sharpening cannot mutate an instance by editing the returned object.

Add one small domain API, for example:

```ts
updateInstance(id, updater)
```

or narrowly scoped methods:

```ts
updateWeaponInstance(id, patch)
```

Prefer the smallest API that supports this plan.

Do not expose the internal `Map` and do not mutate UI copies.

This API is needed for:

- sharpness wear after a hit;
- durability wear if implemented;
- sharpening;
- future NPC sharpening;
- future trade/repair operations.

## 6. Centralize weapon profile + sharpness math

Do not put the curve in UI or `playerMelee.ts` as scattered conditionals.

Create a small pure resolver/config module close to the item domain, e.g. conceptually:

```ts
getWeaponMaintenanceProfile(kind)
getSharpnessDamageModifier(sharpness)
applySharpnessWear(instance, profile, context)
```

The exact filename should follow current project conventions after checking existing item resolver modules.

A profile should contain only maintenance-related values, for example:

```ts
{
  maxSharpness: 1,
  sharpnessLossPerHit: ...,
  sharpeningAmount: ...,
  durabilityWearPerHit: ...,
}
```

Do not introduce a general material system.

## 7. Normalize/clamp all instance state at the domain boundary

Use `[0, 1]` consistently for weapon durability and sharpness.

Central helpers should clamp values rather than trusting callers:

```ts
clamp01(value)
```

For save/load:

- missing `sharpness` → `1` for a newly introduced weapon instance;
- missing `durability` → `1`;
- non-finite values → reject/default rather than propagating `NaN`;
- values outside `[0,1]` → clamp.

This follows the defensive pattern already used by trap instance restoration.

## 8. Important: existing count-based weapons need an explicit migration/creation rule

The plan currently says selected weapons become instances, but existing code still creates/holds weapons as ordinary `ItemKind` counts (for example the starting knife is count-based).

Do not leave two representations for the **same physical weapon** without a clear rule.

For newly instance-backed weapons:

```text
acquire weapon
→ create instance
→ Inventory.addInstance()
```

For old saves that contain:

```text
inventory: { knife: 1 }
```

there is no historical condition to recover. The migration should deterministically create a full-condition instance and remove the migrated count, e.g.:

```text
knife ×1 count
→ knife instance { durability: 1, sharpness: 1 }
```

Do this only for the centrally defined instance-backed weapon kinds.

Do not manufacture instances for unrelated stackable items.

## 9. Acquisition paths must be audited

Search all `inventory.add(<weaponKind>)` and equivalent starting/merchant/drop paths.

Every acquisition of an instance-backed weapon must create an instance.

At minimum check:

- starting loadout (`knife`);
- merchant purchases / merchant stock;
- quest rewards;
- world pickups/drops;
- any plan 160 weapon acquisition code.

A common failure mode is implementing instance storage but leaving one acquisition path count-based, producing a weapon that cannot be sharpened.

## 10. Combat mutation must happen exactly once per resolved hit

Current melee resolves a hit once at the hit-window start. Hook maintenance into that same successful-hit resolution point.

Desired order:

```text
attack starts
→ current held instance resolved
→ existing hit test
→ target damage calculated
→ sharpness wear applied exactly once
→ durability wear applied if enabled
```

Do not consume sharpness when the attack is merely requested.

Do not use a per-frame maintenance tick.

A miss should not consume sharpness in v1 unless the existing gameplay semantics make that necessary.

## 11. Damage modifier must be applied to the existing base damage

Keep the formula conceptually:

```ts
const baseDamage = melee.damage
const modifier = getSharpnessDamageModifier(instance.sharpness)
const damage = baseDamage * modifier
```

The modifier should be clamped and deterministic.

Recommended initial curve from the plan can be implemented as a small monotonic function/interpolation, but keep the exact constants centralized so balancing does not require editing combat logic.

Do not allow sharpness to affect attack range, stamina, timing or defense in this plan unless explicitly required later.

## 12. Avoid durability overreach

Plan 161 mixes two concerns: introducing durability state and introducing sharpening.

For the first implementation, it is enough to:

- initialize durability to `1`;
- persist it;
- preserve it through inventory/held/combat;
- optionally apply a small wear on successful melee hits only if the current architecture already has a natural hook.

Do **not** implement repair, broken-weapon behavior, durability UI systems, or a new durability resolver unless required by the current code to make the two-state model coherent.

Most importantly, `sharpness = 0` must not imply `durability = 0`.

## 13. Sharpening should be a domain operation, not UI math

The UI should only select:

```text
weapon instance ID + sharpening source
```

Then call a domain operation such as:

```ts
sharpenWeapon(instanceId, source)
```

That operation should:

1. resolve the instance;
2. validate it is a supported weapon;
3. resolve its profile;
4. calculate the new sharpness;
5. consume the sharpening item if required;
6. persist the mutated instance through the normal save path.

Keep inventory selection/UI separate from the state transition.

## 14. Whetstone should remain a normal stackable item

Add one `ItemKind`, preferably `whetstone`, unless the catalog already establishes a stronger naming convention.

It should be a normal count-based inventory item:

```text
whetstone → count
```

Do not make the stone an instance unless there is an actual gameplay reason for individual stone condition.

Consumption should be atomic with sharpening: do not consume the stone if sharpening fails.

Do not add a crafting recipe unless an existing crafting system already has the correct insertion point; the plan only requires the item and its use.

## 15. UI: preserve grouping, expose instance selection only where needed

The existing inventory architecture groups normal items by `ItemKind`. Keep that.

For an instance-backed weapon group:

```text
Miecz ×2
```

then details can show individual rows:

```text
1 × 100% / 92%
1 × 78% / 41%
```

The selected operation must carry `instance.id`.

Do not put durability/sharpness into a separate reactive copy that can drift from inventory.

After sharpening/wear, refresh from inventory state.

Do not add a separate weapon inventory screen.

## 16. Do not add grindstone/workshop unless existing infrastructure makes it trivial

The plan correctly allows the grindstone to be deferred.

Given the current architecture, implement the whetstone path first. Only add grindstone if there is already an appropriate place/interactable/action abstraction that can host it without introducing a new place subsystem.

If added, it must call the exact same sharpening resolver as the whetstone path.

Do not create a dedicated `GrindstoneManager`.

## 17. NPC API: expose the domain operation, not NPC-specific logic

The plan should not implement NPC blacksmith behavior.

The useful deliverable is a reusable domain operation that a future NPC action can call:

```text
NPC action
→ sharpenWeapon(instanceId, source)
```

Do not add NPC schedule/FSM changes in plan 161.

## 18. Trading should probably remain out of the first implementation

Plan 155 established instance-aware trade architecture for condition-based items, but Plan 161 does not need to implement weapon price modifiers merely to make sharpening work.

Unless the current trade implementation already has the required instance selection path, leave weapon-specific condition/sharpness pricing for the dedicated trade work.

At minimum, ensure the new instance model does not block future instance-aware trade.

Do not duplicate price calculation inside the maintenance system.

## 19. Persistence: extend existing SaveItemInstance, do not create a second save section

Current `Inventory.instancesToJSON()` already emits `{ id, kind, ...instance state }` and `instancesFromJSON()` reconstructs instances.

Extend this existing representation with optional weapon fields:

```ts
{
  id,
  kind,
  durability?,
  sharpness?
}
```

Do not create a separate `weaponInstances` save array.

This keeps the generic instance architecture from plan 155 intact.

Old saves without these fields remain valid.

Important migration behavior:

- old instance-backed trap rows keep working unchanged;
- old weapon counts are converted as described above;
- newly loaded weapon instances default missing maintenance state to full values.

## 20. Tests to add first

Prefer focused pure/domain tests before UI/browser work.

Minimum cases:

```text
isWeaponInstanceKind()
new weapon instance → durability=1, sharpness=1
clone preserves state
getInstance returns clone, not mutable storage
updateInstance changes stored state
sharpness 1.0 → damage modifier 1.0
sharpness 0.0 → configured minimum modifier
modifier is monotonic across [0,1]
hit → sharpness decreases exactly once
miss → no sharpness loss
sharpen → sharpness increases and clamps at 1
sharpen → durability unchanged
whetstone failure → item not consumed
save/load → durability + sharpness preserved
old save without fields → full maintenance state
old count-based weapon → migrated to one full-condition instance
```

Also add one integration test proving:

```text
held instance ID
→ melee resolver
→ instance sharpness changes
```

This is the most important regression test because it validates the new bridge between inventory instances and the existing `ItemKind` melee system.

## 21. Browser verification should be narrow

Do not spend tokens manually testing the whole game.

Verify only:

1. obtain/equip a supported weapon;
2. inspect its condition/sharpness;
3. hit an animal and confirm damage/wear changes;
4. sharpen the same instance;
5. confirm sharpness increases while durability stays unchanged;
6. save/reload and confirm both values survive.

If grindstone is deferred, do not test it.

## 22. Recommended implementation order

Use this order to reduce rework:

1. Extend `ItemInstance`/clone/type guards and central weapon-kind set.
2. Add `SaveItemInstance.sharpness` and generic weapon serialization/defaulting.
3. Add `Inventory.updateInstance` (or equivalent minimal mutation API).
4. Add weapon maintenance profile + pure sharpness modifier/wear/sharpen resolvers.
5. Convert weapon acquisition paths and old count-based weapon saves to instances.
6. Extend held-tool state with `instanceId`.
7. Integrate instance lookup + damage modifier + wear into existing `playerMelee` hit resolution.
8. Add `whetstone` and sharpening action using the same resolver.
9. Update inventory details UI to select instance IDs and show state.
10. Add focused tests.
11. Run type-check/test/build.
12. Perform the narrow browser check.

Do **not** start with UI. The held-instance bridge and persistence are the risky architectural pieces.

## 23. Specific plan corrections

The main plan should be interpreted with these corrections:

- `WeaponItemInstance` is an extension of the existing generic instance system, not a new parallel equipment system.
- `HeldTool` must retain `instanceId` for instance-backed weapons.
- `Inventory` needs a controlled mutation API because getters return clones.
- Weapon instances should use the existing `SaveItemInstance` array, not a separate persistence structure.
- Existing count-based weapon acquisition/save data requires an explicit full-condition migration rule.
- `shovel` and `pickaxe` should not be included merely because they are tools; only actual maintenance targets should become instance-backed.
- Weapon-specific trade pricing is optional/deferred unless current trade infrastructure already supports instance selection.
- Grindstone is optional/deferred; whetstone is the minimal v1 interaction.
- No new weapon manager, equipment manager, material system, or combat resolver should be introduced.

## 24. Files / symbols to inspect before editing

Start from these existing sources rather than broad repository exploration:

- `src/items/itemInstances.ts` — generic instance + trap pattern.
- `src/items/Inventory.ts` — instance storage, cloning and persistence.
- `src/items/items.ts` — `ItemKind` / `ITEM_DEFS` / whetstone definition.
- `src/items/itemCatalog.ts` — existing `MeleeConfig` and item capabilities.
- `src/player/PlayerController.ts` — held-tool/equipment ownership.
- `src/player/playerMelee.ts` — existing hit timing and damage resolution.
- `src/app/gameLoop.ts` / `src/app/interactables.ts` — attack entry points and held-item interaction.
- persistence `SaveData` / inventory serialization — use existing version/migration conventions.
- inventory screen + item details components — existing grouping and instance UI from plan 155.
- tests around `Inventory`, item instances and universal melee.

Avoid reading unrelated world/NPC files unless the selected sharpening interaction actually requires them.

## Acceptance addendum

Before marking plan 161 complete, specifically verify:

- [ ] No supported weapon can be acquired only as a count-based item.
- [ ] An equipped supported weapon carries its `instanceId` into melee resolution.
- [ ] Sharpness is mutated in inventory state, not in a temporary held/UI copy.
- [ ] One melee hit produces at most one sharpness wear event.
- [ ] Save/load uses the existing generic inventory-instance persistence.
- [ ] Old count-based weapon saves are migrated deterministically to full-condition instances.
- [ ] No new weapon/equipment/material manager was introduced.
