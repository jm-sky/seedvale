# Implementation Notes: Health, Stamina & Threat System

**Plan:** [2026-08-08--045--health-stamina-threat.md](./2026-08-08--045--health-stamina-threat.md)

**Purpose:** repository-specific implementation guidance. The goal is to save implementation-time repository archaeology and, more importantly, prevent parallel health/fatigue/combat systems from appearing.

---

## 1. Scope and architectural decision

The central decision is:

```text
HealthState   = physical health / damage / death
StaminaState  = capacity for physical effort
ThreatState   = perceived danger
AI/FSM        = decision about what to do
```

These are separate responsibilities.

The implementation must extend existing systems rather than create category-specific versions such as:

```text
AnimalEnergy
NpcFatigue
PlayerStamina
AnimalThreat
NpcThreat
```

There should be one shared primitive for stamina and one shared model for health. Threat should be reusable, but its first implementation can remain deliberately small.

---

## 2. Important existing code

### `src/shared/HealthState.ts`

This is already the shared health primitive:

```ts
export type HealthState = {
  maxHp: number
  currentHp: number
  dead: boolean
}
```

It currently exposes `createHealthState()`, plus `applyFatigue()` and `rest()`. The latter two are a transitional NPC-fatigue mechanism: they mutate `currentHp` but deliberately do not represent combat damage/death in the NPC case. fileciteturn31file0L2-L6

**Important:** do not interpret this as evidence that NPC fatigue should remain encoded in HP. 045 exists partly to correct that conceptual overlap.

Target direction:

```text
HealthState
 ├─ maxHp
 ├─ currentHp
 └─ dead

StaminaState
 ├─ max
 └─ current
```

After migration, `applyFatigue()`/`rest()` should no longer be the general-purpose way of representing NPC effort if no compatibility consumer remains.

### `src/fauna/faunaCombat.ts`

Fauna already re-exports the shared `HealthState` and `createHealthState`; it also contains animal-specific HP and damage tables. fileciteturn32file0L2-L6

Keep animal-specific combat balance here where appropriate, but do not move `HealthState` back into fauna. `src/shared/HealthState.ts` is the canonical owner.

### `src/fauna/AnimalAgent.ts`

`AnimalAgent` already has:

- `HealthState`,
- predator/prey roles,
- chase/flee behavior,
- sprinting,
- attack cooldown/contact damage,
- animal life/needs state,
- player/environmental awareness.

It currently constructs health through `createHealthState(MAX_HP[def.kind])`. fileciteturn33file0L2-L2

This is the primary consumer for the first Stamina + Threat integration.

**Do not create a new animal FSM.** Extend the existing predator/prey decision flow.

### `src/ai/NpcAgent.ts`

NPC fatigue is currently implemented by draining `health.currentHp` during `execute`/`goTo` phases and restoring it during rest phases. `FATIGUE_PHASES`, `REST_PHASES`, `BASE_FATIGUE_RATE`, `BASE_REST_RATE`, `HP_FLOOR` and low-HP movement slowdown are currently part of the NPC implementation. fileciteturn35file0L2-L6

This is the key migration seam:

```text
current NPC fatigue
        ↓
StaminaState
        ↓
Needs/FSM decides when to rest
```

Do not simply rename `health` to `stamina`. Separate the two states.

---

## 3. StaminaState

Introduce the shared type in an appropriate shared module, e.g.:

```ts
export type StaminaState = {
  max: number
  current: number
}
```

Keep the primitive intentionally small.

Recommended operations:

```ts
createStaminaState(max: number): StaminaState
drainStamina(stamina: StaminaState, amount: number): void
restoreStamina(stamina: StaminaState, amount: number): void
isExhausted(stamina: StaminaState): boolean
getStaminaRatio(stamina: StaminaState): number
```

The exact function names can follow repository conventions.

Rules:

- clamp current to `[0, max]`,
- never allow negative stamina,
- do not modify health,
- do not know anything about NPCs, animals or players,
- do not contain AI decisions.

`StaminaState` should be unit-testable without Three.js.

---

## 4. Migrate NPC fatigue first

NPCs are the most obvious place where the current conceptual overlap exists.

Current behavior is approximately:

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
Needs/FSM sees low stamina
        ↓
rest / sleep
        ↓
stamina.current increases
```

Keep the existing `Needs → FSM` architecture. Stamina is a state/input; it should not become a second decision-maker.

### Important compatibility detail

The current NPC health floor is `15`, intentionally preventing NPC death/despawn in the existing v1 behavior. Do not accidentally turn this fatigue migration into NPC death.

After migration:

- NPC HP should remain available for future damage/combat,
- NPC fatigue should no longer consume HP,
- existing work/rest rhythm should remain recognizable,
- low stamina should influence rest/work decisions rather than kill the NPC.

The current HP-based movement slowdown should not automatically be ported to stamina. First establish clean semantics; only add stamina-based movement penalties if explicitly required by the plan.

---

## 5. Animal stamina

Animals already have explicit `walkSpeed` and `sprintSpeed`, and the existing predator/prey system already knows when an animal is chasing/fleeing. This is the natural integration point. fileciteturn33file0L2-L2

Target:

```text
AnimalAgent
├── health: HealthState
├── stamina: StaminaState
└── existing life / predator-prey state
```

During sprint/chase/flee:

```text
sprint → drain stamina
```

When not sprinting:

```text
not sprinting → restore stamina
```

At exhaustion:

```text
predator → may abandon chase
prey     → may stop sprinting / seek recovery
```

Do not create `AnimalLifeState.energy` as a second stamina implementation. There is already an `AnimalLifeState` in the current agent; 045 should carefully distinguish biological/life needs from physical effort capacity rather than blindly duplicating fields.

If the existing `AnimalLifeState.energy` already acts as a physical stamina value in the relevant code path, migrate its semantic responsibility into `StaminaState` instead of keeping two gauges.

---

## 6. Threat: keep v1 small

Threat should not become a generalized AI framework in 045.

A minimal shared representation is enough, for example:

```ts
export type ThreatState = {
  target?: EntityRef
  level: number
}
```

But do not force a heavyweight persistent object onto every entity if the current behavior can be expressed with a smaller immutable/event-like input.

The important abstraction is:

```text
something dangerous is perceived
        ↓
agent receives threat information
        ↓
agent decides what to do
```

Threat should not decide `fight` or `flee` by itself.

Potential sources already relevant to Seedvale include:

- predator/prey interactions,
- player awareness,
- direct damage,
- environmental danger later.

---

## 7. Existing fauna awareness should feed Threat

Plan 042 already introduced fauna awareness of the player. The existing `AnimalAgent` has environmental/player awareness and alert/flee behavior. fileciteturn33file0L2-L2

Do not build a second player-detection system inside Threat.

Prefer:

```text
playerAwareness / predator detection
              ↓
         threat signal
              ↓
     existing animal decision
              ↓
          flee/chase
```

This preserves the distinction between **perception** and **decision**.

---

## 8. Attack remains a consumer, not part of HealthState

`HealthState` must stay ignorant of combat context.

Good:

```text
attack(attacker, target)
        ↓
validate attack
        ↓
drain attacker stamina
        ↓
apply damage to target.health
        ↓
target reacts
```

Bad:

```text
HealthState.takeDamage(attacker, weapon, threat, personality, ...)
```

The shared health primitive should only know how to mutate health.

Animal-specific damage values can remain in fauna combat data, as they do today. fileciteturn32file0L2-L6

---

## 9. Damage reaction

Damage should become a signal consumed by the agent.

Conceptually:

```text
HealthState
     ↑
   damage
     ↑
   Attack
     ↓
 reaction signal
     ↓
 Agent decision
```

Do not put personality or flee/fight logic into `HealthState`.

For v1, the reaction can be simple:

- prey → flee,
- predator → fight or flee based on current state,
- NPC → defensive behavior can be prepared but does not need a complete combat tree yet.

---

## 10. Personality integration

NPC personality already exists in `src/ai/dialogue.ts` / character systems and is already used to affect behavior/dialogue. `NpcAgent` imports personality-derived pause parameters today. fileciteturn35file0L2-L6

Do not create a combat personality system.

When combat behavior reaches NPCs, reuse the existing personality representation as one decision input:

```text
personality
health
stamina
threat
needs
    ↓
existing NPC decision layer
```

This should be a later step of 045, after shared primitives and fauna behavior are stable.

---

## 11. Flee uses existing movement

Do not introduce navigation/pathfinding as part of 045.

The project already has movement and predator/prey flee behavior. Threat should select/describe a target and the existing movement code should execute the flee.

```text
Threat
  ↓
flee target
  ↓
existing movement
```

This is particularly important for Seedvale's architecture: 045 should add physical/behavioral coupling, not create a parallel movement stack.

---

## 12. Suggested implementation order

### Phase 1 — shared stamina primitive

Add `StaminaState` and pure tests.

No gameplay behavior changes yet.

### Phase 2 — NPC migration

Move current work/rest fatigue from `HealthState` to `StaminaState`.

Preserve the existing schedule/FSM and recognizable work/rest behavior.

Remove the old HP-fatigue path once no consumer remains.

### Phase 3 — animal stamina

Attach `StaminaState` to `AnimalAgent`.

Drain on sprint/chase/flee; restore while not sprinting.

Exhaustion should limit sprint behavior without introducing a new FSM.

### Phase 4 — minimal threat abstraction

Introduce the smallest useful shared threat representation or signal.

Feed existing predator/player-awareness information into it where it reduces duplication.

### Phase 5 — damage/attack reaction

Keep existing animal contact attack behavior, but make its relationship to stamina and health explicit.

Then introduce generic `attack` semantics only where the current architecture benefits from it.

### Phase 6 — NPC threat/personality

Only after the shared foundations work for fauna, integrate threat decisions with NPC personality and future combat behavior.

### Phase 7 — player

Player stamina/combat should consume the same shared primitives. Do not let player-specific requirements distort the first shared implementation.

---

## 13. Tests

At minimum, add/extend pure tests for:

### `StaminaState`

- creates full,
- drains correctly,
- clamps at zero,
- restores correctly,
- clamps at max,
- exhaustion threshold behaves deterministically.

### NPC migration

- fatigue does not reduce HP,
- rest does not heal HP merely because it is rest,
- stamina decreases during work,
- stamina regenerates during rest,
- NPC remains alive at zero stamina.

### Animal integration

- sprint drains stamina,
- no sprint does not drain it,
- stamina regenerates,
- exhaustion prevents/limits sprint,
- existing predator/prey attack damage remains unchanged.

Existing `HealthState.test.ts` and `faunaCombat.test.ts` should remain green. The repository already has those tests. fileciteturn30file19L96-L100 fileciteturn30file20L101-L105

---

## 14. Important guardrails

Do not:

- create `AnimalEnergy`, `NpcFatigue` or `PlayerStamina` types,
- encode stamina in HP,
- move AI decisions into `HealthState` or `StaminaState`,
- create a second fauna FSM,
- create a second movement/navigation system,
- create a combat personality subsystem,
- make Threat responsible for deciding fight/flee,
- implement full player combat,
- add inventory/weapons/armor as part of this foundation,
- turn 045 into a generalized behavior-tree/utility-AI rewrite.

Do:

- reuse `HealthState`,
- preserve existing predator/prey FSM,
- preserve existing NPC Needs/FSM,
- reuse existing awareness/perception,
- keep pure state primitives independent of Three.js,
- make the shared types useful to NPC, fauna and eventually player.

---

## 15. Desired end state

```text
                    ┌──────────────┐
                    │  Perception  │
                    │ needs/threat │
                    └──────┬───────┘
                           ↓
                     Agent / FSM
                    ┌──────┼──────┐
                    ↓      ↓      ↓
                  Work   Fight   Flee
                    │      │      │
                    └──────┼──────┘
                           ↓
                     StaminaState
                           │
                     physical effort

Damage ───────────────→ HealthState
                           │
                         death

Personality ─────────→ Agent decision
```

The key architectural rule is:

> **Health describes survival. Stamina describes effort. Threat describes danger. Existing AI decides the response.**

045 is successful when these become reusable foundations shared by fauna, NPCs and eventually the player — without replacing the existing Seedvale behavior systems with a new parallel architecture.
