# Implementation notes: Weapon maintenance and sharpening (Plan 161)

## Review result

Plan 161 is valid after updating it to the current repository state. The implementation must extend Plan 155's generic `ItemInstance` architecture and the existing Plan 160 weapon catalog. The key missing bridge is instance ownership from inventory through held state into the existing melee hit edge.

Current code confirms:

- `ItemInstance` is generic and currently extended by `TrapItemInstance`.
- `Inventory` owns `counts` and `instances`; instance getters return clones.
- `SaveItemInstance` currently supports optional `durability` for traps.
- `HeldTool` currently stores only `ToolKind` and checks count-based inventory.
- `playerMelee` exposes the single `hitReady` edge and `resolveMeleeHits()` remains the hit resolver.
- `ITEM_CATALOG[kind].melee` remains the base melee source of truth.

Therefore do not introduce WeaponManager, EquipmentManager, MaintenanceManager, weapon storage, separate persistence, or a second combat system.

## 1. Central maintenance classification

Add one central set/predicate analogous to `INSTANCE_BACKED_KINDS`.

The initial set must contain exactly:

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

Do not derive this only from `ITEM_CATALOG[kind].melee`.

Explicit exclusions:

- `shovel`: melee-capable tool, but not a maintenance target;
- `pickaxe`: currently no melee config.

The classification should be reusable by inventory/combat/UI and later catalog/browser work without making the browser authoritative.

## 2. Extend generic ItemInstance

Use the existing extension pattern:

```ts
export type WeaponItemInstance = ItemInstance & {
  kind: WeaponMaintenanceKind
  durability: number
  sharpness: number
}
```

Keep `ItemInstance` minimal. Extend clone/type-guard logic centrally. Do not copy melee damage/range/timing/stamina into the instance.

New supported weapon instances start at:

```text
durability = 1
sharpness = 1
```

Both values are clamped to `[0, 1]`.

## 3. Inventory controlled mutation

Current `Inventory.getInstance()` / `getInstances()` return clones, so callers cannot mutate storage by editing a returned object.

Add the smallest controlled mutation API, preferably `updateInstance(id, updater)` or an equally narrow domain method.

Do not expose `instances` Map.

Inventory remains the sole owner of mutable instance state.

## 4. Persistence and restore

Extend the existing record only:

```ts
{
  id,
  kind,
  durability?,
  sharpness?
}
```

Continue using `Inventory.instancesToJSON()` and `Inventory.instancesFromJSON()`.

No `weaponInstances` save section.

Restore rules:

- missing weapon `sharpness` → `1`;
- missing weapon `durability` → `1`;
- non-finite values → safe default/reject according to current restore style;
- values outside `[0,1]` → clamp;
- trap persistence remains unchanged.

## 5. Count-based migration

This is mandatory. Existing weapons are still acquired/stored as counts in parts of the codebase; for example the current `HeldTool` validates `inventory.has(kind, 1)`.

For supported kinds, acquisition becomes:

```text
acquire → createItemInstance() → Inventory.addInstance()
```

Audit:

- starting knife;
- merchant purchase/stock paths;
- quest/event rewards;
- world pickup/drop paths;
- all Plan 160 acquisition paths.

Old save migration:

```text
supported weapon count N
→ N instances at durability=1, sharpness=1
→ remove migrated count
```

Do not migrate unrelated stackable items. No historical condition can be recovered, so full state is the deterministic rule.

## 6. HeldTool is the critical bridge

Current shape is effectively `ToolKind | null`. Extend it minimally:

```text
HeldTool
├── kind
└── instanceId?
```

For supported weapons, `instanceId` must identify the exact inventory instance.

Keep non-instance tools compatible.

Never copy durability/sharpness into `HeldTool`.

Required flow:

```text
Inventory instance
→ HeldTool.instanceId
→ Inventory.getInstance(instanceId)
→ ITEM_CATALOG[kind].melee
→ existing melee hit edge
```

When an instance-backed weapon is equipped, do not simply select an arbitrary count of the same `ItemKind`.

## 7. Preserve ITEM_CATALOG + melee architecture

Plan 160's six variants are ordinary `ItemKind`s with `ITEM_CATALOG` melee/defense definitions. Keep that as the static source of truth.

The runtime composition is:

```text
ITEM_CATALOG[kind].melee
        ↓
current ItemInstance state
        ↓
sharpness damage modifier
        ↓
existing hit resolution
```

Do not create `WeaponStats`, `WeaponConfig`, per-material combat resolvers, or a new combat manager.

## 8. Maintenance profile and pure functions

Keep maintenance-specific constants/config close to the item domain. Conceptually:

```ts
getWeaponMaintenanceProfile(kind)
getSharpnessDamageModifier(sharpness)
applySharpnessWear(...)
sharpenWeapon(instanceId, source)
```

Profile may contain:

```text
sharpnessLossPerHit
sharpeningAmount
optional durabilityWearPerHit
```

No general material system.

Sharpness damage curve must be deterministic, monotonic and centralized. Initial target remains approximately:

```text
1.00 → 1.00
0.75 → 0.94
0.50 → 0.85
0.25 → 0.72
0.00 → 0.55
```

Do not let sharpness alter range, stamina, timing or defense in this plan.

## 9. Existing melee hit edge

Do not change the melee state machine more than necessary.

Current `playerMelee.update()` emits `hitReady` when the hit window opens. `resolveMeleeHits()` is the existing deterministic hit test.

Maintenance must happen on this existing successful-hit path:

```text
attack
→ resolve current held instance
→ resolveMeleeHits()
→ calculate/apply damage using current sharpness
→ sharpness wear exactly once
→ optional durability wear
```

Do not wear sharpness on attack request, per frame, or more than once for the same resolved hit.

V1 miss does not consume sharpness.

This is the most important integration regression to test.

## 10. Durability boundary

Introduce durability state but do not expand into repair.

Acceptable v1:

- initialize;
- persist;
- preserve through inventory/held/combat;
- optionally apply small successful-hit wear if it fits the existing hit edge naturally.

Do not implement repair, broken behavior, durability manager, or a dedicated durability UI system.

`sharpness = 0` remains independent of durability.

## 11. Sharpening / whetstone

`whetstone` is a normal count-based `ItemKind`.

Sharpening is a domain operation:

```text
instanceId + source
→ validate supported instance
→ resolve profile
→ calculate new sharpness
→ mutate Inventory instance
→ consume whetstone atomically
```

A failed operation must not consume the stone.

UI only selects the instance and source. It does not mutate or calculate domain state.

No crafting recipe is required.

## 12. Grindstone

Defer unless an existing place/interactable/action abstraction makes it trivial.

If implemented, it must call the same sharpening operation as the whetstone path.

No `GrindstoneManager`.

## 13. Inventory UI

Keep current `ItemKind` grouping. Details may expose concrete instances:

```text
Miecz ×2
1× 100% / 92%
1× 78% / 41%
```

Actions carry `instance.id`.

Do not create a weapon-specific inventory and do not copy condition into independent UI state.

## 14. Trading and NPC boundary

Do not add weapon-specific dynamic pricing. Reuse Plan 155's instance-aware trade architecture later.

Do not implement NPC blacksmith behavior, schedule/FSM changes or NPC maintenance logic. The reusable `sharpenWeapon(instanceId, source)` domain operation is enough for future integration.

## 15. Out of scope

Explicitly exclude:

- ranged combat, bows, arrows, projectiles, critical hits;
- NPC blacksmith;
- full repair/broken lifecycle;
- general material system;
- WeaponManager;
- EquipmentManager;
- MaintenanceManager;
- separate weapon storage;
- separate persistence;
- separate combat resolver;
- weapon browser implementation;
- 3D preview.

## 16. Tests

Minimum focused tests:

```text
isWeaponInstanceKind()
new supported weapon → durability=1, sharpness=1
clone preserves maintenance state
getInstance returns clone
updateInstance changes stored state
sharpness 1 → modifier 1
sharpness 0 → configured minimum
modifier monotonic over [0,1]
hit → sharpness decreases exactly once
miss → no sharpness wear
sharpen → sharpness increases/clamps at 1
sharpen → durability unchanged
failed whetstone operation → stone not consumed
save/load → durability + sharpness preserved
old save without maintenance fields → full defaults
old count-based weapon → N full-condition instances
held instanceId → melee → same instance mutates
```

The last case is the critical architecture regression test.

## 17. Narrow browser verification

Only verify:

1. obtain/equip supported weapon;
2. inspect concrete condition/sharpness;
3. hit an animal and observe damage/wear;
4. sharpen that same instance;
5. confirm sharpness increases while durability is unchanged;
6. save/reload and confirm both values survive.

Do not spend verification effort on deferred grindstone or unrelated systems.

## 18. Implementation order

1. Central supported-weapon predicate/set.
2. ItemInstance type/clone/type guards.
3. SaveItemInstance serialization/defaulting.
4. Inventory controlled mutation.
5. Maintenance profile + pure resolvers.
6. Acquisition audit + count migration.
7. HeldTool `instanceId` bridge.
8. Existing melee hit-edge integration.
9. Whetstone + sharpening.
10. Inventory details UI.
11. Focused tests.
12. Type-check/test/build.
13. Narrow browser verification.

Do not start with UI.

## 19. Verified current-code alignment

The following current sources were checked while updating this document:

- `src/items/itemInstances.ts` — generic `ItemInstance`, `TrapItemInstance`, `INSTANCE_BACKED_KINDS`, clone behavior;
- `src/items/Inventory.ts` — `instances` Map, clone-on-read, `SaveItemInstance`, serialization;
- `src/items/HeldTool.ts` — current `ToolKind` and count-based equip path;
- `src/player/playerMelee.ts` — `hitReady` and `resolveMeleeHits()` edge;
- `src/app/gameLoop.ts` — current melee integration point;
- `src/items/items.ts` — current weapon `ItemKind`s including all six Plan 160 variants;
- Plan 150, Plan 155 and Plan 160.

The plan and notes now describe the same architecture and current-code gaps.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
