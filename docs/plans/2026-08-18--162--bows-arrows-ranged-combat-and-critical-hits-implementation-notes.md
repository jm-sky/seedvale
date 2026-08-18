# Plan 162 — Implementation Notes

**Reviewed:** 2026-08-18
**Plan:** `2026-08-18--162--bows-arrows-ranged-combat-and-critical-hits.md`
**Status:** implementation notes
**Source of truth:** current code + tests + build configuration; `docs/STATE.md` is the current-state reference.

## 1. Review verdict

Plan 162 has the right architectural direction, but several statements describe a target architecture rather than the current code.

The most important correction is: **there is currently no generic damage pipeline/resolver for melee damage**. `playerMelee.ts` owns timing/hit detection, while `gameLoop.ts` owns candidate gathering and damage application. `defenseResolver.ts` is already a pure shared resolver, but it is for incoming player defense, not outgoing damage. Do not invent a `CombatManager` while trying to fix this.

Implement the smallest shared primitives needed by ranged combat:

- a small outgoing attack/damage result/resolver only if it removes real duplication;
- ranged attack state separate from melee timing, but reusing existing target/health ownership;
- projectile simulation as a small data-oriented world/app concern;
- item catalog metadata for bows/arrows;
- explicit ammo instances, extending the existing instance collection;
- `archery` added to the existing `PlayerSkills` union and XP mechanism.

Do not rewrite existing melee into a large new combat framework merely to make the plan's diagram look cleaner.

## 2. Important current-code facts

### Melee

`src/player/playerMelee.ts` is a pure lifecycle/state machine:

```text
idle → windUp → hitWindow → recovery
```

`update()` emits exactly one `hitReady` edge. `resolveMeleeHits()` performs deterministic XZ range + facing-arc tests. `gameLoop.ts` is the caller that gathers world targets and applies consequences.

This is the best pattern to copy for ranged combat: keep timing/resolution pure and keep world-side effects in the existing composition layer.

Do not put scene access, `AnimalAgent`, inventory, quest, audio or Vue dependencies into the new ranged resolver.

### Targeting

Existing combat targeting is already based on `playerMelee.ts`/`playerCombat.ts` and `buildCombatTarget()` in `app/interactables.ts`.

Do not create a second target manager. Ranged targeting may need a different range/aim rule, but should reuse the existing candidate/target identity concepts.

Important distinction:

```text
melee target acquisition
≠
ranged projectile hit resolution
```

A selected ranged target should not imply a hit.

### Defense

`src/combat/defenseResolver.ts` is already a pure deterministic resolver. It handles incoming damage to the player and applies held-item defense + `defense` skill.

For ranged attacks against a defending player/NPC, reuse this resolver when the target already has the required defense inputs. Do not bypass it.

Critical damage should modify the **incoming damage amount before `resolveDefense()`**, not after defense and not by directly changing HP.

Recommended ordering:

```text
attack outcome
→ base damage
→ critical modifier
→ target defense resolver
→ HealthState damage
→ death/downed consequences
```

For targets that do not currently expose defense, preserve the existing no-defense path rather than inventing armor/defense data.

### Health ownership

`HealthState` remains the health primitive. Animal death/collapse and quest hooks already depend on the existing `AnimalAgent` lifecycle.

Do not create ranged-specific HP or death handling.

## 3. ItemInstance reality / plan 155 dependency

The current `src/items/itemInstances.ts` model is intentionally small:

```ts
ItemInstance { id, kind }
TrapItemInstance extends ItemInstance { durability }
```

The current instance-backed kinds are traps. Plan 155's implementation notes explicitly establish the pattern of extending `Inventory` with an instance collection rather than replacing count-based inventory.

Therefore arrows should follow that same pattern, but **do not turn every item into an instance**.

Recommended:

```text
ItemInstance
  id
  kind

ArrowItemInstance
  id
  kind: arrow kinds
```

No per-arrow state is needed in this plan unless the implementation proves a real requirement. Do not add durability, quality, condition or ownership fields to arrows prematurely.

`ItemInstance` IDs are physical-item identity. Every fired arrow instance must have a clear lifecycle:

```text
inventory → projectile →
  hit / miss / despawn
→ consumed or recovered
```

Do not silently create a new instance when firing.

### Important persistence decision

If arrows are truly instance-backed, save/load must preserve them. Do not add an in-memory-only arrow list.

However, if all arrows have identical state and the existing item-instance abstraction does not provide a gameplay benefit for them, consider keeping arrows stackable and using an instance only when an actual persistent per-arrow state is introduced. The plan currently says "concrete instance per shot"; if that remains a hard requirement, implement it consistently in inventory/persistence.

This is a place where the plan should be explicit before coding because it affects save format and trade APIs.

## 4. Do not conflate plan 161

Plan 161 introduces `WeaponItemInstance` durability/sharpness for melee weapons. It is currently planned, not implemented as weapon instances.

Plan 162 should **not** implement weapon maintenance/sharpness as part of bow work.

For bows in this plan:

- use existing `MeleeConfig` only for melee weapons;
- add ranged-specific config instead of abusing `MeleeConfig` fields;
- do not introduce bow durability unless required by a later plan;
- leave plan 161's weapon-instance architecture to that plan.

If a future ranged-weapon maintenance system needs bow durability, it should extend the same `ItemInstance` mechanism later.

## 5. Item catalog integration

`src/items/itemCatalog.ts` is already the correct central configuration point for item gameplay metadata. `MeleeConfig` is the existing pattern: stats are not scattered through combat code.

Add a separate optional ranged config, conceptually:

```ts
export type RangedConfig = {
  damage: number
  range: number
  projectileSpeed: number
  drawTime: number
  accuracy: number
  ammoKinds: readonly ItemKind[]
  criticalChance?: number
}
```

Do not copy melee fields into a generic `WeaponConfig` unless current code clearly benefits from it.

Keep balance numbers in the catalog/config. The resolver should consume config, not know that `long_bow` exists.

The plan's examples should become concrete only after checking the existing `ItemKind` union and item definitions. Do not invent IDs without adding them consistently to `items.ts`, catalog, trade and any required assets.

## 6. Ranged attack lifecycle

Use a small pure state machine analogous to `PlayerMelee`:

```text
idle
  ↓ requestAttack
windUp / draw
  ↓ release
projectile spawned
  ↓ simulation
hit / miss / expired
```

Do not keep the projectile inside the player's attack state after release.

The projectile should be a plain runtime record, not an `Object3D`:

```ts
{
  id,
  sourceId,
  position,
  velocity,
  maxDistance,
  travelledDistance,
  damage,
  criticalSeed / attackKey,
  ammoInstanceId,
  targetId?
}
```

Only add fields actually required by the resolver. Avoid a generic ECS/projectile framework for one projectile type.

## 7. Projectile collision

Do not use Three.js raycasting per projectile as the default implementation.

For the first version, use deterministic segment/swept-distance collision against the same living combat target candidates already available to the game/simulation.

Conceptually per simulation step:

```text
oldPosition → newPosition
      ↓
segment crosses target radius?
      ↓
hit
```

This avoids tunnelling at higher projectile speeds and does not require per-frame raycaster allocations.

The projectile resolver should return data such as:

```ts
{ outcome: 'hit' | 'miss' | 'expired', targetId?, damage, critical }
```

The caller owns applying damage and death/quest side effects.

## 8. Player vs off-screen simulation

Do not force every NPC shot through a rendered projectile.

Use two execution paths over the same outcome logic:

```text
observed/near combat
→ projectile runtime + visual

remote/low-fidelity combat
→ deterministic ranged resolution
```

The important invariant is that both paths produce the same meaningful result fields:

```text
source, target, ammo, hit/miss, critical, damage, time/consequence
```

Do not add a worker. The expected projectile count is not sufficient justification for worker communication.

## 9. Critical hits — recommended implementation

Critical should be a small pure modifier, not a ranged subsystem.

Recommended API shape:

```ts
resolveCritical(baseDamage, chance, multiplier, roll): {
  critical: boolean
  damage: number
}
```

Use the existing deterministic RNG conventions used elsewhere in combat/world systems. The roll must be derived from stable attack identity + attempt/seed, not `Math.random()` if the outcome is part of deterministic simulation.

Do not cache a critical result globally or per frame.

The critical modifier should run only after a successful hit and before target defense.

Do not award an XP/skill bonus merely because an attack was critical unless the skill design explicitly requires it.

## 10. Damage result: avoid over-abstraction

The plan currently suggests creating a shared `damage result` if needed. Treat this as optional.

First inspect the actual melee damage application in `gameLoop.ts` and fauna combat. If there is one small repeated operation, extract a pure function. If there are materially different target-specific consequences, keep those consequences at the caller and only share:

```text
base damage → critical → defense → final damage
```

Do not create:

- `CombatManager`;
- `DamageManager`;
- `WeaponSystem`;
- `RangedCombatSystem` containing all player/NPC/world state;
- generic event bus just for combat.

## 11. Archery skill

Current `PlayerSkills` is a closed union:

```ts
'sneak' | 'survival' | 'traps' | 'defense'
```

`PlayerSkills` is not a registry/framework. Adding `archery` means updating the union, `createPlayerSkills()`, persistence restore, tests and any UI iteration that assumes the current four skills.

Reuse:

```ts
awardSkillXp(skills, 'archery', amount)
```

and the existing shared XP curve.

Add one or two explicit XP award constants, e.g. successful ranged hit / completed shot, but never award XP every projectile frame.

Prefer skill influence on accuracy/draw stability over raw damage, matching the plan's intent.

Do not add levels, perks, points or a second progression mechanism.

## 12. NPC integration

Do not create `ArcherAI`.

First locate the existing NPC combat decision/action flow in `NpcAgent.ts` and extend the existing attack strategy with a ranged option.

The decision should answer:

```text
Can I ranged-attack?
  - bow equipped?
  - compatible ammo available?
  - target in useful range?
  - combat strategy permits ranged attack?
```

Then call the same ranged attack API used by the player.

The NPC should not need player-only camera/aim objects.

For off-screen NPCs, use the same deterministic ranged resolver without creating scene projectile meshes.

## 13. Ammo lifecycle

Keep the physical arrow identity clear.

Recommended launch boundary:

```text
select compatible arrow instance
→ remove exact instance from inventory
→ create projectile carrying that instance id
```

At resolution:

- hit/miss consumes the arrow unless recovery is explicitly supported;
- recovery should reuse existing world-item/drop infrastructure if it already supports item instances;
- do not create a dedicated arrow-recovery manager.

If recovery cannot be integrated cheaply, make arrows consumed on resolution and keep recovery explicitly out of this implementation. Do not create a parallel world-item system.

## 14. Player input / UI

The current player has one `HeldTool` slot. Do not create a second equipment system.

The bow should occupy the same held-item slot. Ammo selection should be a small query against inventory, not a new quiver/inventory.

Prefer:

```text
held bow
→ find first compatible arrow instance
→ draw
→ release
```

For multiple arrow types, selection can initially be deterministic (e.g. first compatible kind) unless the existing UI already has a suitable item-selection affordance. Do not build a dedicated quiver UI for this plan.

## 15. Recommended implementation order

### Phase 1 — audit and tests

Before editing, inspect:

- `src/player/playerMelee.ts`
- `src/player/playerCombat.ts`
- `src/app/interactables.ts`
- `src/app/gameLoop.ts`
- `src/combat/defenseResolver.ts`
- `src/items/itemCatalog.ts`
- `src/items/items.ts`
- `src/items/itemInstances.ts`
- `src/items/Inventory.ts`
- `src/player/PlayerSkills.ts`
- `src/ai/NpcAgent.ts`
- `src/fauna/AnimalAgent.ts`
- `src/fauna/faunaCombat.ts`
- persistence save/load code

Then write focused pure tests before the browser pass.

### Phase 2 — critical + outgoing damage primitive

Implement only the minimal shared critical/damage calculation needed by both melee and ranged. Preserve existing melee results when critical is disabled/defaulted.

Do not refactor unrelated combat code.

### Phase 3 — ranged config + player attack

Add bow/arrow catalog entries and a player ranged attack lifecycle. Make a player arrow travel, hit/miss and damage one animal.

### Phase 4 — ammo instances/persistence

If the instance-per-arrow decision remains, extend `Inventory` and persistence using the plan 155 instance pattern. Keep count inventory compatibility intact.

### Phase 5 — archery

Add the fifth skill and connect it to the ranged outcome. Update save migration/tests/UI only where current skill persistence requires it.

### Phase 6 — NPC

Extend existing NPC combat decision/action flow. Use the same ranged resolver. Add low-fidelity/off-screen resolution without projectile rendering.

### Phase 7 — feedback and browser verification

Add minimal hit/miss/critical feedback and verify player + NPC combat.

## 16. Tests that give maximum value per token

Prioritize pure tests over broad integration tests:

1. critical roll determinism and boundary cases;
2. critical damage multiplier;
3. projectile segment collision / no tunnelling;
4. projectile max range/lifetime;
5. hit/miss outcome;
6. ammo selection/removal of exact instance;
7. archery XP award and skill-value effect;
8. save/load of arrow instances if instance-backed;
9. NPC ranged decision when ammo exists / absent;
10. existing melee regression with critical disabled/default.

Do not write dozens of near-identical item-stat tests. Table-driven tests are preferable for bow/arrow variants.

## 17. Performance constraints

Avoid:

- `Raycaster` allocation per arrow;
- `Object3D` creation for off-screen projectiles;
- per-frame inventory scans for every NPC;
- projectile arrays duplicated in player/NPC/world systems;
- per-frame XP updates;
- a global combat tick manager.

Use the existing game-loop update cadence and simple arrays/records. Remove expired projectiles without generating garbage-heavy temporary objects every frame.

## 18. Documentation corrections to apply while implementing

The main plan should be updated if implementation decisions differ from its current wording, especially:

- clarify that current melee damage is not yet a generic resolver;
- clarify whether arrows are truly `ItemInstance` per shot or remain stackable;
- define whether arrow recovery is in scope or explicitly excluded;
- define the deterministic critical-roll source;
- define whether ranged defense uses the existing `resolveDefense()` inputs for NPCs or only players in this iteration;
- avoid implying a fully general projectile engine is required.

The implementation notes should remain the tactical guide; the plan should remain the concise scope/acceptance contract.

## 19. Final implementation rule

When a proposed change can be expressed as an extension of an existing mechanism, extend it.

In particular:

```text
existing melee lifecycle     → reference for ranged lifecycle
existing target candidates   → ranged target acquisition
existing HealthState         → ranged damage consequence
existing defenseResolver     → target defense
existing ItemInstance        → arrow identity
existing Inventory           → ammo storage
existing PlayerSkills        → archery
existing NPC combat flow     → ranged NPC attack
existing world-item flow     → optional arrow recovery
```

Do not introduce parallel systems for any of the above.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
