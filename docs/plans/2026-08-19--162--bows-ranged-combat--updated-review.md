# Plan 162 — Bows, Ranged Combat and Critical Hits — Updated Review

**Reviewed:** 2026-08-19
**Status:** `updated-review`
**Plan:** `2026-08-18--162--bows-arrows-ranged-combat-and-critical-hits.md`
**Implementation notes:** `2026-08-18--162--bows-arrows-ranged-combat-and-critical-hits-implementation-notes.md`
**Requested target name:** `2026-08-19--162--bows-ranged-combat.md`
**Decision:** `update`

## 1. Review scope

Review against the current `main` repository, with particular attention to:

- Plan 150 combat mode, soft lock, target acquisition, defense and downed state;
- Plan 155 generic `ItemInstance` and inventory instance lifecycle;
- current melee lifecycle and damage ownership;
- `HealthState` and `AnimalAgent` / fauna combat lifecycle;
- current `PlayerCombat` and `buildCombatTarget` / target acquisition;
- `ITEM_CATALOG` and `ItemKind` ownership;
- current item-instance persistence;
- Plan 160 high-quality weapon variants;
- Plan 161 weapon maintenance/sharpening and its planned `WeaponItemInstance` architecture;
- later planning context in `docs/plans/README.md`.

Important repository discrepancy: the requested original path uses `2026-08-19--162--bows-ranged-combat.md`, but the current repository contains Plan 162 as `2026-08-18--162--bows-arrows-ranged-combat-and-critical-hits.md`. The implementation notes use the same 2026-08-18 naming. This review uses the actual repository files as source of truth.

## 2. Executive verdict

The architectural direction of Plan 162 is still correct.

**Ranged combat can and should be integrated into the existing combat/item/health model without a parallel bow system.** No rethink of the overall concept is required.

However, the plan should be **updated before implementation** because the current code makes several ownership boundaries more concrete than the original plan describes:

1. `playerMelee.ts` owns only melee attack timing and hit resolution; `gameLoop.ts` owns world target gathering and damage consequences.
2. `PlayerCombat` already owns soft-lock state, while `playerMelee.ts` owns target ranking helpers.
3. `COMBAT_TARGET_RANGE` is currently a fixed 7-unit acquisition range, so ranged acquisition must extend the existing target-query mechanism rather than inventing another target manager.
4. `HealthState` remains a deliberately combat-agnostic HP primitive.
5. `defenseResolver.ts` is already a shared pure incoming-damage resolver and should remain the defense boundary.
6. `AnimalAgent` has its own predator-bite/death lifecycle. Ranged attacks against animals must enter the existing animal damage/death path, but AnimalAgent must not become the owner of player/NPC ranged combat.
7. `ItemInstance` is still minimal and currently instance-backs traps only. Plan 161's `WeaponItemInstance` is still planned, not implemented.
8. Plan 160's weapon variants are already implemented through `ItemKind` + `ITEM_CATALOG`; bows should follow exactly that pattern rather than anticipating durability/quality state.
9. The current `PlayerSkills` mechanism is a closed union, so `archery` is a small extension of the existing skill system, not a new subsystem.

The main required change is therefore **precision of integration and ownership**, not a new architecture.

## 3. Current melee/combat architecture

### 3.1 Melee lifecycle

`src/player/playerMelee.ts` is a small state machine:

```text
idle → windUp → hitWindow → recovery
```

`update()` produces one `hitReady` edge. `resolveMeleeHits()` performs deterministic XZ range + facing-arc tests. It does not own scene access, HP mutation, quests or audio.

This is the correct pattern for ranged combat.

Recommended ownership:

```text
Ranged attack lifecycle
    ↓
projectile runtime / outcome resolver
    ↓
game-loop / simulation composition
    ↓
existing target consequence
    ↓
HealthState / animal death / NPC lifecycle
```

Do not move melee into a large generic `CombatManager` merely to make ranged combat look symmetrical.

### 3.2 Target acquisition

`PlayerCombat` already owns:

- combat mode;
- soft-lock ID;
- living target cycling;
- target-cycle indices.

`playerMelee.ts` provides the ranking primitive, and `interactables.ts` defines the current combat acquisition range/cone.

The current living target collection already normalizes animals and NPCs into stable IDs such as:

```text
animal:<animalId>
npc:<npcId>
```

This is exactly the identity model ranged combat should reuse.

The important update is that the current `COMBAT_TARGET_RANGE = 7` is an acquisition range, not a weapon range. Ranged combat should not create `RangedTargetManager` or another target list. Instead, the existing collection/ranking API should gain the minimum flexibility needed for a ranged detection range if the bow's useful range exceeds 7 units.

Recommended distinction:

```text
combat target acquisition range
        ↓
soft-lock target identity
        ↓
ranged attack / projectile
        ↓
actual projectile hit test
```

Target selection must never imply projectile hit.

## 4. HealthState and damage ownership

`src/shared/HealthState.ts` remains the correct health primitive:

```text
maxHp
currentHp
dead
```

`damageHealth()` is combat-agnostic and does not know attacker, weapon or AI policy.

This is good ownership for ranged combat. Do not introduce `RangedHealthState`, `ArrowDamageState` or ranged-specific death handling.

The original Plan 162 implementation notes correctly identified that there is still no generic outgoing damage resolver equivalent to `resolveDefense()`.

Therefore critical hits should not force a large combat refactor.

A minimal shared primitive is appropriate only if it removes real duplication:

```text
successful hit
    ↓
base damage
    ↓
critical modifier
    ↓
defense, where applicable
    ↓
final damage
    ↓
HealthState / existing target lifecycle
```

Critical must not directly mutate HP and must not bypass defense.

### 4.1 Critical and fauna boundary

`AnimalAgent` currently owns real fauna lifecycle concerns, including predator attacks and death/collapse behaviour. `faunaCombat.ts` contains predator/prey damage tables and human damage values, while `AnimalAgent` applies health changes and owns the resulting lifecycle.

Do not refactor the entire predator combat system into the new ranged pipeline just because it is "combat".

Instead:

- the shared critical calculation may be reusable;
- ranged player/NPC attacks may opt into it;
- the existing animal target consequence remains owned by fauna/AnimalAgent;
- predator bite behaviour remains unchanged unless explicitly included later.

This avoids turning Plan 162 into a fauna combat rewrite.

## 5. Defense integration

`src/combat/defenseResolver.ts` is now a concrete shared pure resolver.

It already handles:

- no defense;
- full block;
- partial block;
- facing direction;
- defense skill contribution;
- deterministic attack roll.

Plan 162 should therefore explicitly reuse `resolveDefense()` wherever the ranged target exposes the required defense inputs.

The correct ordering remains:

```text
ranged hit
→ base damage
→ critical modifier
→ resolveDefense()
→ damageHealth()
→ existing downed/death lifecycle
```

Do not create `rangedDefenseResolver`.

Also do not assume that every animal or NPC currently has the same defense inputs as the player. For targets without defense data, preserve the existing no-defense path instead of inventing armor or NPC-specific block state as part of this plan.

## 6. Item Catalog and weapon variants

`src/items/itemCatalog.ts` is already the central gameplay configuration point.

The current model uses:

```text
ItemKind
    ↓
ITEM_DEFS
    ↓
ITEM_CATALOG
    ↓
MeleeConfig / DefenseConfig
```

Plan 160 confirmed this architecture with six high-quality melee variants. The variants were added as ordinary `ItemKind`s and use the existing melee/defense pipeline. No weapon manager or separate variant table was introduced.

Bows should follow the same model:

```text
short_bow / hunting_bow / long_bow
    ↓
ITEM_DEFS
    ↓
ITEM_CATALOG
    ↓
RangedConfig
```

A separate `RangedConfig` is still preferable to abusing `MeleeConfig` fields.

The catalog should own values such as:

- damage;
- range;
- projectile speed;
- draw/release timing;
- accuracy;
- compatible ammunition;
- optional critical modifier.

Combat code should consume configuration and remain unaware of concrete bow IDs.

### 6.1 Weapon variants are not a reason to depend on Plan 161

Plan 161 is still `planned`. Its `WeaponItemInstance` with `durability` and `sharpness` does not exist in the current code.

Plan 162 must therefore **not**:

- make bows `WeaponItemInstance`s;
- implement bow durability;
- implement bow sharpness;
- add weapon maintenance to ranged combat;
- make Plan 161 a hard implementation dependency.

If Plan 161 later expands its weapon-instance scope to bows, the ranged weapon definition should be able to adopt that instance layer without changing the ranged attack architecture. That is a future integration point, not Plan 162 scope.

## 7. Item instances and ammunition

Plan 155 introduced the intended hybrid inventory model:

```text
stackable items → ItemKind + count
instance-backed items → ItemInstance collection
```

Current `ItemInstance` is intentionally minimal:

```ts
{id, kind}
```

Only traps currently use it.

This is compatible with arrows, but the original Plan 162 wording "every fired arrow is a concrete instance" has a significant persistence consequence.

If arrows become instance-backed, the full lifecycle must be explicit:

```text
inventory instance
→ remove exact instance
→ projectile carries instance id
→ hit / miss / expire
→ consumed or recovered
```

And if the instance survives any point where it can return to inventory, persistence must preserve it.

The plan should make one decision before implementation:

### Recommended V1

Keep ordinary arrows stackable unless there is an actual per-arrow state requirement. Use `ItemInstance` only if the physical identity itself is required for projectile recovery, persistent world ownership or a future stateful-arrow mechanic.

If the design intentionally requires one instance per shot, then explicitly extend Plan 155's inventory/persistence pattern and accept the extra save/trade/UI surface.

Do not create a third ammunition storage model such as a quiver inventory.

## 8. Projectile ownership

The implementation notes' small plain-data projectile is still the right direction.

A projectile should be runtime simulation data, not an `Object3D` and not an inventory entity.

Conceptually:

```text
Projectile
├── id
├── sourceId
├── position / velocity
├── travelledDistance / maxRange
├── damage payload
├── attack identity / deterministic roll seed
└── optional ammo identity
```

Only include fields actually required by the current resolver.

Collision should use swept segment/distance logic rather than allocating a Three.js `Raycaster` for every arrow.

Observed combat may render a visual projectile, but the visual object must not become the simulation authority.

## 9. Player vs NPC vs fauna ownership

### Player

The player should use the existing `HeldTool` slot for the bow. Do not add a second equipment system.

Ammo selection should query the existing inventory. Initial deterministic selection of the first compatible ammunition type is sufficient; a quiver UI is not required by this plan.

### NPC

NPC ranged combat should extend the existing NPC combat decision/action flow. There must be no `ArcherAI`.

The decision should answer only the necessary questions:

```text
bow equipped?
compatible ammo available?
target in useful range?
combat strategy permits ranged attack?
```

Then call the same ranged attack mechanism as the player.

### Animals

Animal targets should be treated as targets, not as ranged-combat owners.

The existing `AnimalAgent` / fauna lifecycle remains responsible for applying consequences and handling death/collapse. This preserves the current fauna ownership model.

## 10. Skills

`PlayerSkills` is currently a closed union:

```text
sneak | survival | traps | defense
```

There is no skill registry/framework.

Adding `archery` is therefore a controlled extension of the existing mechanism:

- extend `SkillId`;
- add the default state in `createPlayerSkills()`;
- update persistence restoration/migration where required;
- update UI iteration where the current four-skill assumption exists;
- use existing `awardSkillXp()` and the same XP curve.

Do not create an archery progression subsystem.

Skill XP should be awarded on completed meaningful actions, not every projectile update.

## 11. New dependencies and dependency corrections

### Required integration dependencies

- **150 — Combat Mode, Target Lock, Defense and Downed State:** existing target/soft-lock/defense ownership must be reused.
- **155 — Inventory Item Instances:** relevant for ammunition only if arrows are intentionally instance-backed.
- **Current `ITEM_CATALOG`:** central item gameplay configuration.
- **Current `PlayerCombat` / target collection:** target identity and soft-lock ownership.
- **Current `HealthState` / fauna lifecycle:** damage and consequences.

### Relevant but not a prerequisite

- **160 — High-quality melee weapons:** done. It establishes the correct `ItemKind` + catalog variant pattern, but Plan 162 does not technically depend on its code.
- **161 — Weapon maintenance and sharpening:** planned. Do not add it as a dependency. Ranged weapons should remain compatible with its future instance layer.

### No new subsystem dependency

Do not introduce dependencies on a generic projectile engine, physics engine, worker, combat manager or new equipment system.

## 12. Conflicts / changes in ownership

### Conflict A — fixed combat acquisition range

Current `PlayerCombat` uses a fixed `COMBAT_TARGET_RANGE` of 7 units.

A longbow whose useful range exceeds this cannot simply reuse the current collection unchanged if the plan expects target acquisition beyond 7 units.

**Resolution:** parameterize/extend the existing living-target collection/ranking rather than creating a ranged target manager.

### Conflict B — critical hits are broader than bows

The plan says critical is a common combat mechanism, but outgoing melee damage is still composed at the application layer.

**Resolution:** extract only a small pure critical/damage modifier if both melee and ranged genuinely consume it. Do not create a generic combat framework.

### Conflict C — `dead` semantics differ by target

`HealthState.dead` has existing fauna consequences. Plan 150 deliberately avoided globally converting animal death into `downed`.

**Resolution:** ranged damage must use the target's existing consequence path. Do not make `downed` a ranged-specific outcome or globally alter AnimalAgent lifecycle.

### Conflict D — ItemInstance is not yet a weapon-instance system

**Resolution:** arrows may use the existing instance collection, but weapon instances themselves remain Plan 161 territory.

### Conflict E — arrow recovery vs consumption

The current repository has item/world-item mechanisms, but no dedicated arrow recovery lifecycle.

**Resolution:** do not create `ArrowRecoveryManager`. Either consume arrows on resolution in V1 or reuse an existing generic world-item/item-instance path if recovery can be integrated without a new subsystem.

## 13. Recommended changes to Plan 162

### Keep

- common ranged combat instead of `BowSystem`;
- player + NPC use the same ranged attack mechanism;
- projectile as lightweight runtime data;
- hit/miss separate from target selection;
- existing HealthState as HP ownership;
- existing defense resolver;
- central Item Catalog configuration;
- existing skill/progression mechanism;
- off-screen deterministic resolution without rendering every projectile;
- no Web Worker without measurement.

### Update

1. Explicitly describe `PlayerCombat` as the owner of soft-lock state.
2. Reuse `rankCombatTargets` / living target identity instead of describing generic target acquisition abstractly.
3. Extend current 7-unit acquisition range only where ranged combat actually requires it.
4. Treat `AnimalAgent` as the owner of animal consequences, not ranged attack state.
5. Make critical an opt-in pure damage modifier and avoid refactoring fauna bites into it.
6. Decide explicitly whether arrows are stackable or instance-backed before implementing persistence.
7. If instance-backed, extend the Plan 155 persistence path rather than creating arrow-specific persistence.
8. Keep Plan 161 out of the dependency chain; allow future `WeaponItemInstance` adoption later.
9. Define arrow recovery as either existing generic item lifecycle reuse or explicit V1 consumption.
10. Add save/load and skill-migration work to the acceptance criteria if `archery` and arrow instances are introduced.

### Do not add

- `BowSystem`;
- `ArrowSystem`;
- `ArcherAI`;
- `RangedCombatManager`;
- `TargetManager`;
- `CombatManager` God Object;
- quiver-specific inventory;
- ranged-specific HealthState;
- ranged-specific defense system;
- bow durability/sharpness in Plan 162;
- per-arrow Three.js simulation for off-screen combat;
- Web Worker without measured need.

## 14. Recommended implementation order

### Phase 1 — current-code audit + pure tests

Confirm exact ownership in `playerMelee.ts`, `playerCombat.ts`, `interactables.ts`, `gameLoop.ts`, `HealthState`, `defenseResolver`, `AnimalAgent`, `Inventory`, `itemInstances`, `PlayerSkills` and persistence.

### Phase 2 — minimal critical primitive

Add a pure deterministic critical modifier only if it can be consumed by both existing melee and new ranged damage without a large refactor.

Existing melee behaviour must remain unchanged when critical is disabled/defaulted.

### Phase 3 — ranged catalog + player lifecycle

Add bow/arrow `ItemKind`s and ranged config. Implement draw/release and a runtime projectile. Prove player → animal hit/miss → HealthState/AnimalAgent consequence.

### Phase 4 — ammunition lifecycle

Implement the chosen stackable-vs-instance-backed decision. If instances are chosen, update persistence and tests through the existing inventory-instance path.

### Phase 5 — archery skill

Extend `PlayerSkills`, persistence and UI assumptions. Connect skill value to accuracy/draw stability rather than raw damage inflation.

### Phase 6 — NPC ranged combat

Extend existing NPC combat decisions/actions. Use the same ranged resolver and deterministic off-screen path.

### Phase 7 — feedback + browser verification

Verify player shot, hit/miss, critical, bow variants, ammo consumption, target acquisition beyond melee range where applicable, and NPC ranged attack.

## 15. Updated acceptance criteria

- [ ] Ranged attack uses a shared mechanism rather than a bow-specific combat system.
- [ ] Player and NPC call the same ranged attack/outcome mechanism.
- [ ] Existing `PlayerCombat` soft-lock and target identities are reused.
- [ ] Ranged acquisition can use a useful range distinct from melee hit range without a second target manager.
- [ ] Projectile hit/miss is distinct from target selection.
- [ ] Projectile collision uses a deterministic swept/segment-style test without per-projectile raycaster allocation.
- [ ] Hit damage reaches the existing `HealthState` path.
- [ ] Animal targets retain existing `AnimalAgent` death/collapse consequences.
- [ ] Existing `resolveDefense()` is reused where target defense inputs exist.
- [ ] Critical is a deterministic pure modifier and does not bypass defense.
- [ ] Critical can be reused by melee and ranged without introducing a God Object.
- [ ] 2–3 bow variants are ordinary `ItemKind`s using `ITEM_CATALOG` ranged configuration.
- [ ] 1–3 arrow variants use the existing inventory model.
- [ ] The stackable-vs-instance-backed arrow decision is explicit and reflected in persistence.
- [ ] No arrow-specific inventory or persistence system exists.
- [ ] `archery` uses the existing `PlayerSkills` and XP mechanism.
- [ ] NPC ranged attack uses existing combat decision/action flow; no `ArcherAI` exists.
- [ ] Plan 161 weapon maintenance is not pulled into Plan 162 implementation scope.
- [ ] Off-screen ranged combat can resolve without rendered projectile objects.
- [ ] `tsc`, build and tests pass.
- [ ] Browser verification covers player ranged attack, hit/miss, critical, ammunition lifecycle and NPC ranged attack.

## 16. Decision

**`update`**

Plan 162 does **not** need to be rethought. Its central architectural rule is correct:

> **Ranged combat is another attack mode inside the existing combat/item/health model, not a second bow-specific system.**

The plan does need updating before implementation to reflect the repository's now-explicit ownership boundaries, especially `PlayerCombat`, `HealthState`, `AnimalAgent`, `resolveDefense()`, the hybrid count/instance inventory, and the fact that Plan 161's weapon-instance architecture is still future work.

The highest-risk decision to settle before coding is the ammunition lifecycle: **stackable arrows vs. one `ItemInstance` per physical arrow**. Everything else can be integrated as a relatively small extension of existing mechanisms.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
