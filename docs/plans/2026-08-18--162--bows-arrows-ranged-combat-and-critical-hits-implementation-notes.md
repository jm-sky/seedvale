# Plan 162 — Implementation Notes

**Reviewed:** 2026-08-19
**Plan:** `2026-08-18--162--bows-arrows-ranged-combat-and-critical-hits.md`
**Status:** implementation notes
**Source of truth:** current code + tests + build configuration; `docs/STATE.md` is the current-state reference.

## 1. Review verdict

Plan 162 remains an extension of existing combat, not a new combat architecture.

The current code makes these ownership boundaries important:

- `PlayerCombat` owns combat mode and soft-lock state.
- Existing target collection/ranking provides stable animal/NPC identities.
- `playerMelee.ts` owns melee timing/hit-resolution primitives; `gameLoop.ts` owns world-side consequences.
- `HealthState` is the shared HP primitive.
- `defenseResolver.ts` is an existing pure incoming-defense resolver; it is not a generic outgoing damage resolver.
- `AnimalAgent` / fauna combat owns animal-specific death/collapse consequences.
- `Inventory` already supports both stackable counts and instance-backed items, but arrows do **not** need instances in V1.
- `ITEM_CATALOG` / `ItemKind` are the existing item-definition pattern.
- `PlayerSkills` is a closed skill union, so `archery` is a small extension, not a subsystem.

Do not introduce a `CombatManager`, `BowSystem`, `ArrowSystem`, `RangedCombatManager`, `TargetManager`, `ArcherAI`, ranged `HealthState`, ranged defense system or quiver inventory.

## 2. Current melee pattern to extend

`playerMelee.ts` is a small lifecycle/state machine:

```text
idle → windUp → hitWindow → recovery
```

`update()` produces the `hitReady` edge. `resolveMeleeHits()` performs deterministic range/facing tests. The caller gathers world targets and applies consequences.

Ranged combat should follow the same ownership principle:

```text
ranged attack lifecycle
→ projectile/outcome resolver
→ existing target consequence layer
→ HealthState / AnimalAgent / existing lifecycle
```

Do not move scene access, inventory mutation, quests or animal lifecycle into a pure ranged resolver.

## 3. Target acquisition

Reuse the existing target identity/ranking mechanism.

`PlayerCombat` owns the selected soft-lock target. The existing living-target collection normalizes animals/NPCs into stable identities. Ranged combat must consume that identity instead of creating a second target list.

The current combat acquisition range is 7 units. This is an acquisition range, not weapon range.

If a bow needs acquisition beyond 7 units, parameterize/extend the existing collection/ranking query. Do not create `RangedTargetManager` or duplicate target identity.

Keep this distinction explicit:

```text
acquisition range
→ selected target identity
→ ranged attack
→ projectile hit test
```

Selecting a target never guarantees a hit.

## 4. Damage and defense

There is currently no generic outgoing damage resolver equivalent to `resolveDefense()`.

Do not create a large generic combat framework merely to support ranged damage.

If actual duplication justifies it, extract only a small pure result/modifier layer:

```text
base damage
→ critical modifier
→ existing target defense, where applicable
→ final damage
→ existing HealthState/consequence
```

`resolveDefense()` should be reused only where the target already exposes the inputs it expects. Do not invent NPC/animal armor or a ranged-specific defense model.

Critical must not directly mutate HP and must not bypass defense.

For animals, the ranged attack is only an incoming cause. The existing `AnimalAgent`/fauna lifecycle remains the owner of death/collapse consequences. Do not refactor predator bites into this pipeline.

## 5. Ammo decision — V1 is stackable

This is the deliberate scope decision for the updated plan:

**Arrows are ordinary stackable `ItemKind` counts in `Inventory`. They are not `ItemInstance`s in Plan 162 V1.**

Launch lifecycle:

```text
compatible arrow kind
→ Inventory.remove(kind, 1)
→ projectile runtime record
→ hit / miss / expiry
```

No arrow instance ID is required in the projectile.

Do not create:

- `ArrowItemInstance`;
- per-arrow persistence;
- quiver inventory;
- arrow recovery manager.

If later design introduces meaningful per-arrow state or recovery, that should extend the existing Plan 155 instance model in a separate scope. This keeps Plan 162 small and avoids persistence/trade/UI complexity without a gameplay requirement.

Plan 155 remains relevant as architectural context because `Inventory` is already the hybrid count/instance owner, but it is not a hard implementation dependency for stackable arrows.

## 6. Item Catalog

Follow the existing `ItemKind` + `ITEM_CATALOG` pattern established by current weapon variants and Plan 160.

Add a separate ranged configuration rather than abusing `MeleeConfig`, conceptually:

```ts
RangedConfig {
  damage
  range
  projectileSpeed
  drawTime
  accuracy
  ammoKinds
  criticalChance?
}
```

The exact type/field names must follow the current repository conventions.

Combat code consumes configuration; it must not contain hard-coded knowledge such as `if (kind === 'long_bow')` scattered across resolvers.

Do not make Plan 161 a dependency. Its future `WeaponItemInstance`/maintenance layer may later adopt bows, but Plan 162 must not add durability or sharpness.

## 7. Projectile

Projectile is lightweight runtime simulation data, not an inventory object and not an `Object3D` source of truth.

Conceptually:

```ts
{
  id,
  sourceId,
  position,
  velocity,
  maxDistance,
  travelledDistance,
  damage,
  attackKey,
  targetId?
}
```

Only fields actually required by the implementation should survive the audit.

Use swept segment/distance collision rather than allocating a Three.js `Raycaster` per arrow.

Observed combat may render a visual arrow, but remote/off-screen simulation should resolve the same meaningful outcome without rendering every projectile.

## 8. Player flow

The player continues using the existing held-item/equipment mechanism.

Do not create another equipment slot or quiver inventory.

The minimal flow is:

```text
held bow
→ find compatible arrow count
→ draw/release
→ remove 1 arrow
→ projectile
→ hit/miss
```

Initial ammo selection may be deterministic (for example first compatible arrow kind). A dedicated ammo UI is not required for V1.

## 9. NPC flow

Do not create `ArcherAI`.

Extend the existing NPC combat decision/action flow with the minimum ranged choice:

```text
bow equipped?
compatible ammo available?
target in useful range?
strategy permits ranged attack?
        ↓
existing ranged attack mechanism
```

The same resolver is used by player and NPC. Off-screen NPC combat may use deterministic low-fidelity resolution without projectile meshes.

## 10. Archery skill

Current `PlayerSkills` is a closed union (`sneak | survival | traps | defense`). Extend it with `archery` and reuse the existing creation, persistence, XP and UI mechanisms.

Do not create a skill registry or archery progression subsystem.

Award XP on meaningful completed actions, not per projectile update. Prefer effects such as accuracy/stability/draw performance rather than a generic damage multiplier.

Any persistence migration must follow the existing `PlayerSkills` save/restore pattern.

## 11. Critical hits

Critical is an opt-in shared modifier, not a bow-only feature.

A small pure API is sufficient if the current code needs one, e.g.:

```ts
resolveCritical(baseDamage, chance, multiplier, roll)
```

Use the existing deterministic RNG conventions. Do not use uncontrolled `Math.random()` for a result that must remain deterministic in simulation.

Critical is evaluated only after a successful hit and before applicable target defense.

Do not rewrite all melee combat into a generic framework. Preserve existing melee behavior when critical is not enabled for it.

## 12. Arrow recovery

Recovery is explicitly out of scope for V1.

The consumed arrow is not restored on hit, miss or expiry. Do not create `ArrowRecoveryManager` or a second world-item lifecycle.

If later recovery is required, first check whether an existing generic item/world-item mechanism can own it; otherwise create a separate plan.

## 13. Plan 161 boundary

Plan 161 is still `planned` and concerns maintenance/sharpness/durability for weapon instances.

Plan 162 must not:

- add bow durability;
- add bow sharpness;
- create `WeaponItemInstance` for bows;
- depend on Plan 161;
- add maintenance UI or persistence.

The only requirement is architectural compatibility: future weapon-instance work should be able to wrap ranged weapon definitions without forcing a second ranged combat architecture.

## 14. Recommended implementation order

1. Audit actual `PlayerCombat`, `playerMelee`, target acquisition, `HealthState`, defense, fauna, item catalog, inventory and skills.
2. Add the minimum critical/damage primitive only if real duplication exists.
3. Add ranged config and player ranged lifecycle.
4. Add lightweight projectile and hit/miss resolution.
5. Add stackable bow/arrow catalog definitions and ammo consumption.
6. Add `archery` to existing skills/persistence/UI assumptions.
7. Extend existing NPC combat decision/action flow.
8. Add minimal feedback and balancing.
9. Run focused tests, type-check/build and browser verification.

Do not begin with a generic projectile engine or new combat manager.

## 15. High-value tests

Prioritize:

- critical determinism and boundary cases;
- critical multiplier;
- projectile swept collision/no tunnelling;
- max range/lifetime;
- hit/miss;
- stackable ammo consumption and insufficient-ammo path;
- archery XP and skill effect;
- NPC ranged decision with/without ammo;
- existing melee regression;
- existing animal death/collapse regression.

Use table-driven tests for bow/arrow catalog variants rather than many repetitive tests.

## 16. Performance constraints

Avoid:

- `Raycaster` allocation per arrow;
- `Object3D` creation for remote projectiles;
- per-frame inventory scans for every NPC;
- per-frame XP updates;
- global combat/projectile manager;
- unnecessary worker communication.

Use the existing simulation cadence and lightweight arrays/records. Keep projectile cleanup allocation-conscious.

## 17. Final rule

When a ranged requirement can be expressed as an extension of an existing mechanism, extend it.

```text
existing PlayerCombat      → soft-lock ownership
existing target ranking    → ranged acquisition
existing melee lifecycle   → lifecycle reference
existing HealthState       → HP
existing defenseResolver  → defense where applicable
existing AnimalAgent       → animal consequences
existing ITEM_CATALOG      → ranged definitions
existing Inventory         → stackable ammo
existing PlayerSkills      → archery
existing NPC combat flow  → NPC ranged attack
```

No parallel system should be introduced merely because the attack happens at range.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
