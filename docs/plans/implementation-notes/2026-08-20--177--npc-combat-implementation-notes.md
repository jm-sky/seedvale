# Plan 177 — Implementation Notes

**Reviewed:** 2026-08-21
**Plan:** `2026-08-20--177--npc-combat.md`
**Status:** implementation notes
**Source of truth:** current code + tests + build configuration. `docs/STATE.md` and `docs/plans/README.md` were reviewed before this note.

## 1. Review verdict

The plan is directionally correct and fits the current architecture, but the implementation should be kept smaller than the phrase "common combatant seam" may suggest.

The current repository already has the important shared primitives:

- `HealthState` is combat-agnostic and only owns HP/dead state.
- `ITEM_CATALOG` owns `MeleeConfig`, `DefenseConfig` and `RangedConfig`.
- `playerMelee.ts` owns a small melee timing state machine and deterministic XZ hit testing.
- `defenseResolver.ts` is a pure deterministic incoming-defense resolver.
- `src/simulation` owns domain-agnostic `ActionLifecycle`, `PlannedAction` and `SimulationEntityRef` contracts.
- `AnimalAgent` already owns animal-specific attack/death/collapse consequences.
- `NpcAgent` already owns NPC needs, decisions, movement and action lifecycle.

The main implementation risk is accidentally turning the existing player-oriented combat helpers into a large generic combat framework. Prefer extracting only pure mechanics that are demonstrably needed by both player and NPC.

## 2. Important current-code observations

### 2.1 `playerMelee.ts` is not yet a shared melee service

`src/player/playerMelee.ts` contains two different concerns:

1. a reusable attack lifecycle (`idle → windUp → hitWindow → recovery`);
2. player-specific mechanics such as stamina, gap-close/lunge and player target-memory/acquisition.

NPC combat should reuse the first concern, not the player-specific target/gap-close behaviour.

Recommended extraction:

```text
src/combat/meleeAttack.ts
  createMeleeAttack()
  MeleeState
  requestAttack(config, stamina?)
  update(dt)
```

Only extract what is actually shared. Do not move `pickCombatTarget`, `rankCombatTargets`, player lunge, camera yaw or player interaction logic into the shared module.

If the existing lifecycle can be reused with a small adapter without extraction, prefer that over moving code.

### 2.2 `resolveMeleeHits()` is already almost the desired shared primitive

The current hit resolver is pure and Three.js-free:

```text
position + yaw + MeleeConfig + candidates
→ ids hit
```

It uses deterministic XZ range + facing arc and does not raycast.

For NPC combat, extract/rename this as a neutral combat primitive if necessary. Do not copy it into `NpcCombat`.

The candidate shape should remain small, e.g. identity + position + alive state. Avoid passing complete `NpcAgent` / `AnimalAgent` objects into pure resolvers.

### 2.3 `resolveDefense()` is already shared enough

`src/combat/defenseResolver.ts` is pure and deterministic. It requires:

- incoming damage;
- `DefenseConfig`;
- defender defense skill value;
- defender id;
- attacker key;
- attempt number;
- precomputed attack direction (`inArc`).

Do not create an NPC defense resolver.

The caller should collect the small inputs from the defender and then call `resolveDefense()`. Keep direction calculation outside the pure resolver if the existing shape remains appropriate.

### 2.4 `HealthState` deliberately has no combat knowledge

`damageHealth()` only subtracts HP and marks the state dead. It does not know attacker, weapon, defense, animation or death consequences.

Keep it this way.

For NPC death, the NPC owner must react to `health.dead` and execute the existing NPC lifecycle/death cleanup. Do not add combat-specific death handling to `HealthState`.

Likewise, do not move animal collapse/death consequences into the shared combat layer.

## 3. Recommended combat data boundary

Do not start with a `Combatant` class or inheritance hierarchy.

A small data/reference seam is sufficient:

```ts
type CombatTargetRef = {
  id: string
  kind: 'npc' | 'animal' | 'player'
}
```

This is compatible with the existing `SimulationEntityRef` shape. Prefer reusing `SimulationEntityRef` if it already satisfies the exact need rather than creating another almost-identical identity type.

A combat intent can similarly remain data-only:

```ts
type CombatIntent = {
  target: SimulationEntityRef
  mode: 'melee' | 'ranged'
}
```

Do not put decision-making, target searching or profession behaviour into this type.

The intent should be created by an existing/current NPC decision path or by a future consumer such as Hunter. Combat only executes it.

## 4. NPC lifecycle integration

`NpcAgent` already has its own FSM/phase model and `ActionLifecycle`. Do not introduce a second NPC combat loop.

The likely integration is:

```text
existing NPC decision
    ↓
combat intent + target ref
    ↓
NpcAgent combat phase/action
    ↓
attack lifecycle
    ↓
shared hit/defense/damage primitives
    ↓
NPC/Animal lifecycle consequences
```

A combat phase may be added to the existing `Phase` union if that is the cleanest integration. It should still be driven from the existing `NpcAgent.update()` cadence.

Important interruption rule:

```text
normal work/routine
        ↓ combat intent
combat becomes current action
        ↓ combat ends / target invalid / NPC dies
existing decision flow resumes
```

Do not let combat directly mutate schedule state or permanently replace the NPC's routine.

When combat is cancelled, ensure any active attack lifecycle is reset and the target reference is cleared.

## 5. Target handling

The plan correctly says that target type must not be animal-specific.

However, target *acquisition* is outside this plan.

For V1, the target should be supplied by the caller. Do not add:

- global target manager;
- per-frame global scan;
- NPC combat target search over every animal/NPC;
- camera/player-target logic.

For NPC-vs-animal, use bounded/local candidate lookup already available to the NPC/fauna systems or a future Hunter system. Combat receives the selected target.

Target validity should be checked at execution time:

- target still exists;
- target is alive;
- target is in a usable state/range for the attack;
- NPC is still alive and able to attack.

Do not silently retain stale object references after an agent is removed.

## 6. Melee implementation order

Recommended order for the first implementation stage:

1. Identify exactly which parts of `playerMelee.ts` are player-independent.
2. Extract only the lifecycle/hit-test primitives if duplication is real.
3. Keep player target acquisition and gap-close in `playerMelee.ts`.
4. Add NPC combat intent/target state to `NpcAgent`.
5. Add NPC melee attack execution using the existing `ITEM_CATALOG[kind].melee` config.
6. Resolve hits through the shared deterministic hit test.
7. Apply defense through `resolveDefense()` where the target exposes the required inputs.
8. Apply final damage through `damageHealth()`.
9. Let the owning agent handle death/collapse consequences.

Do not start by moving all player combat code to `src/combat/`.

## 7. Weapon source

`ITEM_CATALOG` is the single source of melee/ranged/defense configuration.

NPC attack code should resolve the currently carried/held item and read:

```ts
ITEM_CATALOG[itemKind].melee
```

Do not duplicate damage, range, arc, wind-up, recovery or stamina values.

If NPC inventory currently exposes only counts, use the existing carried-state mechanism already present in `NpcAgent`. Do not introduce NPC equipment/storage as part of this plan.

For an invalid/unavailable weapon:

```text
no melee config
→ combat attack cannot start
→ intent/action fails or is cancelled
```

Do not silently fall back to a different weapon.

## 8. NPC stamina

NPCs already have stamina/vigor infrastructure. Reuse it.

The player implementation's exact lunge behaviour must not be copied to NPCs merely because it exists in `playerMelee.ts`.

For V1, NPC melee should only spend the configured `MeleeConfig.staminaCost` unless the existing NPC action model already has a clearly reusable bounded movement/effort mechanic.

Avoid introducing a second stamina cost for an NPC-specific lunge unless the plan explicitly requires it.

This keeps combat behaviour deterministic and avoids coupling the NPC attack to player movement mechanics.

## 9. Attack timing and simulation cadence

The attack lifecycle should be simulation-time based, not render-animation based.

The important edge is:

```text
windUp complete
→ resolve hit once
→ hitWindow/recovery
```

Do not resolve damage every frame while the attack animation is visible.

The resolver must remain deterministic when `dt` is large enough to cross multiple phases. The existing player lifecycle already handles this with bounded phase transitions; preserve that property in the extracted/shared version.

NPC combat must continue to work when the NPC is not visually important. Animation is presentation, not the combat authority.

## 10. Defense integration

Incoming NPC damage should follow:

```text
attack
→ determine attack direction
→ resolveDefense(...)
→ damageHealth(finalDamage)
→ owner handles reaction/death
```

For NPC defense, the caller must supply the NPC's current held defensive item and defense skill value according to the existing systems.

Do not create:

- `NpcDefenseConfig`;
- `NpcDefenseResolver`;
- NPC-specific block formulas;
- NPC armor framework.

If the current NPC does not yet have a meaningful defense skill value or held defensive state, use the smallest existing-compatible value/path and document the gap rather than inventing a new progression system.

## 11. Attack identity / deterministic rolls

Every resolved attack should have a stable `attackKey`/attempt identity suitable for deterministic defense rolls.

`resolveDefense()` already hashes:

```text
defenderId + attackerKey + attempt
```

Do not use `Math.random()` for combat outcomes that affect simulation state.

For repeated attacks from one combatant, increment an explicit attempt/attack counter owned by the combat lifecycle or derive a stable attack id from the action sequence.

Do not use object identity, array position or frame number as a persistent combat identity.

## 12. NPC taking damage

NPC damage should be event-driven from the attack result, not discovered by scanning HP every frame.

A useful boundary is:

```text
applyNpcDamage(...)
  → defense result
  → damageHealth(npc.health, finalDamage)
  → NPC reaction / combat continuation / death
```

Keep this function small and NPC-owned if it needs to trigger existing NPC-specific side effects.

Do not put NPC dialogue, panic, fleeing, healing or relationship changes into the combat resolver.

Those are future decision/pressure consequences.

## 13. NPC death

`HealthState.dead` is the source of truth for HP reaching zero.

The combat system should not implement:

- respawn;
- revive;
- downed state;
- death UI;
- loot tables;
- quests;
- relationship consequences.

When NPC death occurs, use the existing NPC lifecycle/cleanup path. If the current NPC death path is missing or insufficient, extend that owner rather than making a combat death manager.

## 14. Animal as target

`AnimalAgent` already owns its own health and collapse/death consequences. Its existing predator attack code is intentionally animal-specific.

NPC combat should treat an animal as a target through the shared target/damage seam, then let `AnimalAgent` observe its health state and execute the existing consequences.

Do not refactor predator bites into the NPC combat implementation.

This is particularly important because `faunaCombat.ts` currently contains animal-specific damage tables. Those values must remain there until a future shared attacker-damage model genuinely requires moving them.

## 15. Ranged stage / Plan 162

`docs/plans/README.md` currently describes Plan 162 as `verification needed` and explicitly notes that NPC ranged combat is not implemented yet. Plan 162 implementation notes define the intended NPC extension and already establish the correct boundaries:

- `RangedConfig` stays in `ITEM_CATALOG`;
- projectile simulation is lightweight data, not the inventory source of truth;
- no `NpcBowSystem` / `ArcherAI` / `ArrowSystem`;
- stackable arrows in V1;
- shared target identity;
- shared HealthState/defense where applicable;
- no per-frame global projectile/combat manager.

Therefore Plan 177 should not redesign ranged combat. It should provide the NPC attack seam that Plan 162 can consume.

Recommended separation:

```text
177 first stage
  NPC combat intent
  NPC combat lifecycle
  NPC melee
  NPC incoming defense/damage/death

177 ranged stage
  consume Plan 162's existing ranged/projectile pipeline
  add NPC as another attack source
```

If Plan 162's implementation changes before 177 is implemented, trust the current code and update these notes rather than preserving stale assumptions.

## 16. Important dependency interpretation

The README lists `~~150~~ ~~162~~` as dependencies. Both are crossed out in the dependency graph, but Plan 162 itself remains in `verification needed` and the README explicitly says NPC ranged flow is still absent.

For the agent this means:

- do not treat Plan 162 as a missing implementation dependency;
- inspect its current code/notes for the actual ranged seam;
- do not block NPC melee work on browser verification of Plan 162;
- do not claim NPC ranged is implemented merely because Plan 162 exists.

Plan 177 can be implemented in stages, with melee/defense first and ranged integration only after the actual Plan 162 pipeline is confirmed.

## 17. Suggested file ownership

Likely touch points, to be confirmed against current code before editing:

```text
src/ai/NpcAgent.ts
  NPC combat state/intent/action integration

src/combat/
  only genuinely shared pure combat primitives

src/player/playerMelee.ts
  keep player-specific target acquisition, gap-close and input integration

src/combat/defenseResolver.ts
  reuse as-is unless a small input-neutralization is genuinely needed

src/items/itemCatalog.ts
  no new melee configs; existing catalog remains authoritative

src/shared/HealthState.ts
  normally no change

src/fauna/AnimalAgent.ts
  only integration needed to accept NPC-caused damage / preserve death lifecycle

src/fauna/faunaCombat.ts
  do not move predator-specific damage tables into NPC combat

src/simulation/
  reuse existing lifecycle/reference types; avoid a parallel action framework
```

The agent should inspect exact symbol ownership before changing any file. The paths above are implementation seams, not a mandate to touch every file.

## 18. Tests to add first

Prioritize pure tests over integration-heavy tests.

### Shared melee

- attack starts only when valid;
- wind-up reaches exactly one hit edge;
- large `dt` can cross phases without duplicate hit resolution;
- range boundary;
- arc boundary;
- dead targets are ignored;
- multiple valid targets are all returned when the attack semantics allow it.

### Defense

Existing `defenseResolver.test.ts` should remain green. Add NPC-facing coverage only if the input adapter introduces new behaviour.

### NPC combat

- intent starts combat;
- invalid/dead target cancels combat;
- unavailable weapon does not attack;
- configured melee damage reaches target once;
- defense can reduce/negate incoming damage;
- NPC HP reaches zero and existing death path is triggered;
- combat interruption returns control to the normal NPC decision/action flow;
- repeated attacks use deterministic attack identity/attempt values.

Avoid tests that instantiate Three.js scene graphs when a pure resolver can prove the behaviour.

## 19. Performance constraints

NPC combat must not introduce a per-frame global scan.

Avoid:

- `NpcCombatManager`;
- global target registry;
- global projectile manager for NPC melee;
- `Raycaster` per attack;
- polling every NPC against every animal;
- render-dependent attack resolution;
- worker communication for small local combat calculations.

Use the existing NPC update/action cadence and local target information.

A combat action should be cheap enough that dozens of concurrent local NPC attacks do not create meaningful main-thread pressure.

## 20. Common implementation mistakes to avoid

### Mistake: generic `Combatant` hierarchy

Avoid unless the code demonstrates a real need. `SimulationEntityRef` + small pure contracts are enough for the first seam.

### Mistake: copying `playerMelee.ts`

Do not copy player target acquisition, lunge, camera yaw or input behaviour into NPC code.

### Mistake: `NpcCombatManager`

The plan explicitly forbids it. NPCs already own their action/update lifecycle.

### Mistake: combat chooses the target

Combat executes an intent. Hunter/bandit/animal-defence systems should decide who/why.

### Mistake: combat owns death

Combat applies damage. The entity owner owns death consequences.

### Mistake: using `Math.random()`

Simulation-affecting combat rolls must use deterministic inputs/RNG conventions.

### Mistake: resolving hit from animation

The simulation attack lifecycle owns the hit edge. Animation follows it.

### Mistake: treating the player as a special target type in the core

Keep target identity open to `npc | animal | player`; do not branch the core around player-only APIs.

## 21. Recommended implementation sequence for the AI agent

```text
1. Read CLAUDE.md, STATE.md, plans/README.md, Plan 177 and these notes.
2. Inspect current NpcAgent combat-adjacent state, ActionLifecycle integration,
   inventory/carried state, stamina/vigor and death lifecycle.
3. Inspect current playerMelee ownership and tests.
4. Inspect defenseResolver and tests.
5. Inspect HealthState and AnimalAgent death/collapse path.
6. Inspect Plan 162 code/notes before touching ranged code.
7. Define the smallest shared pure seam.
8. Implement NPC melee first.
9. Integrate NPC incoming defense/damage/death.
10. Add ranged NPC integration only through the existing Plan 162 pipeline.
11. Add focused deterministic tests.
12. Run typecheck/lint/build/test.
13. If visual/animation behaviour changed, follow CLAUDE.md browser verification workflow.
```

If actual code differs from these notes, code wins. Update the notes only when the discrepancy materially changes the implementation guidance.

## 22. Final implementation principle

The desired architecture is:

```text
NPC decision / future Hunter / future Bandit
              ↓
        combat intent
              ↓
          NpcAgent
              ↓
     shared attack lifecycle
              ↓
       pure hit resolver
              ↓
      target-side defense
              ↓
          HealthState
              ↓
    target owner consequences
```

Not:

```text
NPC Combat Manager
   ├── target manager
   ├── NPC weapon system
   ├── NPC damage system
   ├── NPC defense system
   ├── NPC health system
   └── NPC death system
```

Keep the seam small. Extend existing mechanisms. Combat is an execution mechanism, not another AI layer.
