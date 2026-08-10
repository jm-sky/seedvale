# Implementation Notes: Health, Stamina & Threat System

**Plan:** [2026-08-08--045--health-stamina-threat.md](./2026-08-08--045--health-stamina-threat.md)

**Purpose:** repository-specific implementation guidance. The goal is to avoid parallel health/fatigue/combat systems and to extend the existing fauna/NPC architecture instead of replacing it with new managers or decision layers.

---

## 1. Architectural contract

045 must preserve this separation:

```text
HealthState   = survival: HP / damage / death
StaminaState  = physical effort capacity
Threat        = currently relevant danger/context
AI / FSM      = decision about what to do
```

The state layers provide information; the existing actor AI decides the response.

The implementation must not create category-specific versions such as:

```text
AnimalEnergy
NpcFatigue
PlayerStamina
AnimalHealth
NpcHealth
PlayerHealth
```

`HealthState` is already shared infrastructure. Stamina must likewise have one source of truth for physical effort. Threat should remain deliberately small until a concrete second consumer requires a broader abstraction.

---

## 2. Verified current architecture

The current repository has the following relevant boundaries:

### `src/shared/HealthState.ts`

`HealthState` is already the shared health primitive:

```ts
export type HealthState = {
  maxHp: number
  currentHp: number
  dead: boolean
}
```

It also currently exports `createHealthState()`, `applyFatigue()` and `rest()`. The latter two mutate HP and are currently used as the NPC fatigue mechanism. fileciteturn6file0L2-L6

045 should keep `HealthState` as the canonical health model and remove the fatigue semantics from it once the NPC migration has no remaining consumer. Do not create a replacement health type for NPCs or fauna.

### `src/fauna/faunaCombat.ts`

Fauna re-exports the shared `HealthState` and `createHealthState()`. Animal-specific HP values and the predator/prey damage table live here. fileciteturn14file0L2-L6

Keep balance data here where appropriate. Do not move ownership of `HealthState` into fauna.

### `src/fauna/AnimalLife.ts`

`AnimalLifeState` currently contains:

```ts
{
  hunger: number
  thirst: number
  energy: number
}
```

`energy` starts at `1`, is drained while sprinting at `ENERGY_DRAIN_RATE`, regenerated otherwise at `ENERGY_REGEN_RATE`, and is already consumed by animal behavior through the low-energy rest threshold. fileciteturn4file0L2-L6

Therefore **`AnimalLifeState.energy` is the existing animal stamina implementation**. It must not coexist with a new `StaminaState.current` representing the same physical effort resource.

### `src/fauna/AnimalAgent.ts`

`AnimalAgent` owns the animal FSM/behavior, movement, predator/prey logic, perception and combat. It constructs the shared health state and the existing `AnimalLifeState`. fileciteturn5file0L2-L2

The existing sprinting/chase/flee behavior and energy-based rest hook are the integration points for 045. Do not create another animal FSM or another update loop.

### `src/ai/NpcAgent.ts`

NPCs currently construct the shared `HealthState` but use HP as fatigue: `execute` and `goTo` are fatigue phases, while movement/rest-related phases restore HP. The implementation also has an HP floor of `15`, fatigue/rest rates, energetic-trait modifiers and low-HP movement slowdown. fileciteturn9file0L2-L2

This is the migration seam from HP-based fatigue to real stamina. The existing Needs → FSM architecture remains the owner of rest/work decisions.

### Existing health consumers

Search verification shows the shared health primitive is consumed by both fauna and NPC code, while animal combat uses the shared health through `faunaCombat`. The current animal damage implementation is therefore already compatible with a shared health foundation. fileciteturn3file0L2-L5 fileciteturn14file0L2-L6

---

## 3. Stamina: migrate the existing animal resource, do not duplicate it

Introduce one generic `StaminaState` in a shared, non-Three.js module:

```ts
export type StaminaState = {
  max: number
  current: number
}
```

Recommended pure operations, following repository naming conventions:

```ts
createStaminaState(max: number): StaminaState
drainStamina(stamina: StaminaState, amount: number): void
restoreStamina(stamina: StaminaState, amount: number): void
isExhausted(stamina: StaminaState): boolean
getStaminaRatio(stamina: StaminaState): number
```

The primitive must:

- clamp `current` to `[0, max]`,
- never allow negative stamina,
- never modify health,
- know nothing about NPCs, animals or players,
- contain no AI decisions,
- remain unit-testable without Three.js.

### Required animal migration

Do not implement this as:

```text
AnimalLifeState.energy
+
StaminaState.current
```

The existing `energy` field is already the animal's physical-effort resource. Migrate that resource into the shared stamina representation while keeping the `AnimalLife` responsibility boundary.

Preferred direction:

```text
AnimalLifeState
├── hunger
├── thirst
└── stamina: StaminaState
```

`tickAnimalLife()` should continue to own deterministic biological/physical ticking. Its current hunger/thirst update remains in `AnimalLife`; the existing sprinting boolean continues to be the input that determines stamina drain vs. regeneration. Update `AnimalAgent` to consume the migrated stamina state instead of `.energy`.

If the implementation finds that a different field layout preserves the same boundary more cleanly, the invariant is still strict: **one physical-effort resource, one owner, one source of truth**. A compatibility alias may be used temporarily during migration only if it does not create a second mutable value and is removed once all consumers are migrated.

Preserve current energy behavior initially: same starting capacity, drain/regeneration rates, and low-energy rest threshold unless the 045 plan explicitly changes gameplay tuning.

---

## 4. NPC fatigue migration

Current NPC behavior is approximately:

```text
work / execute / goTo
        ↓
health.currentHp decreases
        ↓
rest
        ↓
health.currentHp increases
```

Target behavior:

```text
work / execute / goTo
        ↓
stamina.current decreases
        ↓
existing Needs / FSM observes low stamina
        ↓
rest / sleep
        ↓
stamina.current increases
```

Add `StaminaState` to the NPC state and move the existing fatigue/rest rates and energetic-trait modifiers to stamina. Keep the existing phases and `Needs → FSM` decision flow.

The current NPC health floor is `15` and exists specifically so fatigue cannot kill/despawn an NPC in v1. Preserve that gameplay behavior, but achieve it by no longer consuming HP for fatigue rather than by retaining an HP floor as a stamina mechanism.

After migration:

- NPC HP remains available for future damage/combat,
- fatigue does not reduce HP,
- rest does not heal HP merely because it is rest,
- zero stamina does not kill an NPC,
- existing work/rest rhythm remains recognizable.

Do **not** automatically port the existing low-HP movement slowdown to stamina. Establish clean stamina semantics first; add movement penalties only if the 045 gameplay requirements actually call for them.

Once no caller needs them, remove `applyFatigue()` and `rest()` from the shared health module rather than keeping misleading fatigue APIs indefinitely.

---

## 5. Animal stamina integration

`AnimalAgent` already knows when an animal is sprinting during chase/flee and already uses the low-energy threshold to alter wandering/rest behavior. Extend those paths instead of adding a new controller. fileciteturn5file0L2-L2

Target shape:

```text
AnimalAgent
├── health: HealthState
└── life: AnimalLifeState
      ├── hunger
      ├── thirst
      └── stamina: StaminaState
```

During sprint:

```text
sprint → drain stamina
```

Outside sprint:

```text
not sprinting → restore stamina
```

At exhaustion, the existing FSM should be prevented from sustaining sprinting. The smallest acceptable v1 behavior is:

- predator may abandon/stop a chase when exhausted,
- prey may stop sprinting and recover,
- the existing low-energy rest/idle behavior remains the decision mechanism.

Do not create `StaminaManager`, `SurvivalController`, a second fauna FSM, or a second update loop.

---

## 6. Health remains shared and combat-agnostic

Keep `HealthState` ignorant of combat context and AI policy.

Good boundary:

```text
attack/combat code
        ↓
apply damage
        ↓
target.health
        ↓
agent reacts
```

Bad boundary:

```text
HealthState.takeDamage(attacker, weapon, threat, personality, ...)
```

Animal-specific damage values can remain in `faunaCombat.ts`; the existing shared health export is already the correct foundation. fileciteturn14file0L2-L6

Damage/death handling must be audited across all current consumers before changing the health API. Do not change `HealthState` in isolation if fauna death/attack code relies on its current mutation semantics.

---

## 7. Threat: smallest useful abstraction

Threat is a context supplied to existing AI, not another AI system.

The repository currently has no established repository-wide `EntityRef` type; a search finds no real implementation of that abstraction outside the 045 documents. Therefore do **not** introduce `EntityRef` merely for architectural symmetry.

For v1, use the smallest representation that fits the existing actor references and current fauna behavior. A threat context should carry only what the decision layer actually needs, such as:

```text
threat level / relevance
threat source or target reference, if an existing actor reference is already available
```

Do not force a generic persistent entity-reference system into the codebase before there is a concrete second consumer that needs it. If a shared target identity becomes necessary for both fauna and NPCs, introduce the smallest generic representation at that point.

The key contract is:

```text
perception / damage
        ↓
threat information
        ↓
existing actor AI / FSM
        ↓
flee / fight / ignore / continue current work
```

Threat itself must not choose fight/flee.

---

## 8. Reuse existing perception and awareness

The fauna already has predator/prey perception and player/environmental awareness. `AnimalAgent` also has alert/flee behavior and a held alert timer. fileciteturn5file0L2-L2

Do not build a second player-detection or predator-detection system inside Threat.

Prefer:

```text
existing perception
        ↓
small threat signal/context
        ↓
existing predator/prey decision
        ↓
flee / chase / continue
```

This keeps perception, state and decision responsibilities separate.

---

## 9. Attack and stamina

The current fauna combat model contains damage balance and the agent owns attack timing/contact behavior. Keep that ownership boundary. fileciteturn14file0L2-L6

When 045 adds stamina cost to attack, the sequence should be conceptually:

```text
existing attack opportunity
        ↓
check attacker stamina
        ↓
drain attacker stamina
        ↓
apply target damage
        ↓
existing target death/reaction path
```

Do not move combat policy into `HealthState` or `StaminaState`.

Do not introduce inventory, weapons, hitbox frameworks, combos or player combat as part of this foundation.

---

## 10. Damage reaction and personality

Damage should remain a signal consumed by the agent. Health records the physical result; the agent decides what to do next.

For fauna, extend the existing predator/prey decisions rather than introducing a generalized combat AI. For NPCs, personality may later influence defensive behavior, but this should reuse the existing personality representation and existing decision layer.

Do not create a separate combat-personality subsystem.

The intended coupling is:

```text
health + stamina + threat + needs + personality
                    ↓
              existing AI/FSM
                    ↓
             work / rest / flee / fight
```

---

## 11. Flee uses existing movement

Threat and decision code should select or describe the threat/flee context. Existing movement executes the result.

```text
Threat
  ↓
existing flee decision
  ↓
existing movement
```

Do not introduce navigation/pathfinding as part of 045. The current fauna already has flee targeting and movement behavior; extend it rather than creating another movement stack.

---

## 12. Implementation order

### Phase 1 — shared stamina primitive

- Add `StaminaState` and pure operations/tests.
- Keep the primitive independent of Three.js and actor-specific behavior.
- No gameplay behavior changes beyond what is necessary to wire the existing animal resource later.

### Phase 2 — migrate `AnimalLifeState.energy`

- Replace the existing mutable `energy` resource with the shared stamina representation.
- Keep `AnimalLife` as the owner of hunger/thirst/physical ticking.
- Preserve current energy drain/regeneration and rest-threshold behavior initially.
- Update every `.energy` consumer; do not leave two stamina gauges in parallel.
- Keep the change deterministic and testable in `AnimalLife.test.ts`.

### Phase 3 — NPC stamina

- Add/use the same `StaminaState` for NPC fatigue.
- Move the existing fatigue/rest rates and energetic-trait modifiers from HP to stamina.
- Preserve the existing Needs/FSM phases and work/rest rhythm.
- Remove HP-fatigue helpers only after all consumers are migrated.

### Phase 4 — animal exhaustion behavior

- Gate sustained sprinting/chase/flee on stamina.
- Preserve the existing predator/prey FSM and movement.
- Let exhaustion cause the smallest behavior change needed: stop/avoid sprinting and recover.

### Phase 5 — minimal threat context

- Introduce only the smallest threat state/signal required by the existing fauna decision paths.
- Reuse current predator/player perception and references.
- Do not introduce `EntityRef`, `ThreatManager`, `SurvivalController`, or a new decision engine without a concrete need.

### Phase 6 — attack/damage reaction

- Add stamina cost to existing attack behavior where required.
- Keep `HealthState` as the target health primitive.
- Preserve current animal damage values, attack cooldown and death behavior unless 045 explicitly changes them.
- Feed damage/threat information back into existing agent decisions.

### Phase 7 — NPC threat/personality

Only after the shared foundations work for fauna:

- connect threat and health/stamina to the existing NPC decision layer,
- reuse existing personality data,
- do not create a combat-specific FSM.

### Phase 8 — player

Player stamina/combat can consume the same shared primitives later. Do not let player-specific requirements distort the first shared implementation.

---

## 13. Tests

At minimum, extend/add pure tests for the shared stamina primitive:

- creates full,
- drains correctly,
- clamps at zero,
- restores correctly,
- clamps at max,
- exhaustion is deterministic.

### Animal migration

Update the existing `AnimalLife.test.ts` coverage to prove:

- stamina starts full,
- sprint drains stamina at the existing rate,
- non-sprinting regenerates stamina at the existing rate,
- stamina clamps to `[0, max]`,
- the existing low-energy/rest behavior still works,
- no second energy/stamina value is maintained.

### NPC migration

Add coverage for:

- fatigue does not reduce HP,
- rest does not heal HP merely because it is rest,
- work/effort reduces stamina,
- rest regenerates stamina,
- zero stamina does not kill the NPC,
- the existing HP floor is no longer needed as a fatigue mechanism.

### Health/combat regression

Keep existing `HealthState` and fauna combat tests green. The shared health contract and animal damage values must remain stable while stamina is migrated. `HealthState` is already a shared primitive and fauna combat already re-exports it. fileciteturn6file0L2-L6 fileciteturn14file0L2-L6

---

## 14. Guardrails

Do not:

- keep `AnimalLifeState.energy` and `StaminaState.current` as parallel mutable stamina values,
- create `AnimalEnergy`, `NpcFatigue` or `PlayerStamina` types,
- create separate animal/NPC/player health models,
- encode stamina in HP,
- move AI decisions into `HealthState` or `StaminaState`,
- create a second fauna FSM,
- create a second update loop for biological/physical state,
- create `StaminaManager`, `ThreatManager` or `SurvivalController` without a demonstrated need,
- introduce `EntityRef` only for architectural symmetry,
- create a second movement/navigation system,
- create a combat-specific personality subsystem,
- make Threat responsible for choosing fight/flee,
- implement full player combat,
- add inventory/weapons/armor as part of this foundation,
- turn 045 into a generalized behavior-tree or utility-AI rewrite.

Do:

- reuse the shared `HealthState`,
- migrate the existing animal `energy` resource into the shared stamina primitive,
- keep `AnimalLife` responsible for deterministic life/physical ticking,
- keep `AnimalAgent` responsible for FSM, movement, perception and combat decisions,
- preserve the existing NPC Needs/FSM,
- reuse existing awareness/perception,
- keep shared state primitives independent of Three.js,
- make health and stamina reusable by fauna, NPCs and eventually the player.

---

## 15. Desired end state

```text
                 Perception / Needs
                         │
                  Threat / state
                         ↓
                    Existing AI/FSM
                 ┌───────┼────────┐
                 ↓       ↓        ↓
               Work    Fight    Flee
                 │       │        │
                 └───────┼────────┘
                         ↓
                    StaminaState
                  physical effort

Damage ───────────────→ HealthState
                            │
                          death

Personality ─────────→ existing decision layer
```

The architectural contract is:

> **Health describes survival. Stamina describes physical effort. Threat describes relevant danger. Existing AI/FSM decides the response.**

045 succeeds when these become reusable foundations without replacing Seedvale's existing life, needs, perception, predator/prey, movement and NPC behavior systems with parallel architecture.
