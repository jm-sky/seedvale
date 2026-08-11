# Plan 056 — Implementation Notes

**Plan:** `2026-08-10--056--hungry-predator-human-aggression.md`
**Review date:** 2026-08-10
**Purpose:** implementation/review handoff for Claude Code after inspecting the current fauna implementation and related plans.

## 1. Repository reality

Plan 056 is conceptually correct, but the current code has an important boundary that the original plan understates:

**The existing predator attack path only attacks `AnimalAgent` prey. It cannot currently attack the player or an NPC.**

Current flow in `src/fauna/AnimalAgent.ts` is effectively:

```text
AnimalAgent.update()
  ↓
checkEnvironmentalDanger()
  ↓
player noticed → flee
  ↓
otherwise predator → updatePredator()
  ↓
nearest AnimalAgent prey
  ↓
attack(prey: AnimalAgent)
  ↓
prey.takeDamage(...)
```

`attack()` accepts an `AnimalAgent`, and `damageFor()` in `src/fauna/faunaCombat.ts` is keyed by `AnimalKind` pairs. Therefore the feature cannot be completed by changing only the flee/attack decision. A small **human-target boundary** is required before a wolf can actually perform an attack against a human.

Do not expand this into a generalized combat framework.

## 2. Existing systems to reuse

### Hunger

`src/fauna/AnimalLife.ts` already owns:

```ts
AnimalLifeState.hunger
```

Use this directly. Do not add `hungerPressure`, `predatorHunger`, or another biological state container.

### Player perception

`src/fauna/playerAwareness.ts` is intentionally pure. `isPlayerNoticed()` answers perception only:

```text
noticed / not noticed
```

It must remain independent from the attack decision.

Current `AnimalAgent.checkEnvironmentalDanger()` uses:

- player distance;
- facing cone;
- panic range;
- day factor;
- forest factor;
- alert hysteresis;
- lit-fire distance.

This is useful perception/context and should feed a later decision instead of becoming the decision itself.

### Fire

`AnimalAgent` already receives `litFires` and treats them as environmental danger. Preserve this path.

Do not create a `FireSource`/`ThreatManager` just for plan 056.

### Predator/prey

`updatePredator()` already owns predator chase/attack movement against animal prey. Reuse it for animal prey unchanged.

### Health

Animals already use shared `HealthState` through `src/shared/HealthState.ts` via `faunaCombat.ts`.

Do not create a second health/damage model for humans.

## 3. Important architectural correction

The current code gives player awareness priority over predator behavior:

```ts
const danger = this.checkEnvironmentalDanger(...)
if (danger) {
  this.fleeFrom(...)
} else if (this.def.role === 'predator') {
  this.updatePredator(...)
}
```

This is the exact point that must change.

Do **not** make `checkEnvironmentalDanger()` decide `attack` vs `flee`. Instead separate the concepts:

```text
perception
  ├─ player noticed
  ├─ nearest/available fire
  └─ other context
          ↓
predator human-risk decision
          ↓
      attack / flee / continue
```

The perception module remains pure and reusable. The decision module consumes the perception result plus hunger and species capability.

## 4. Recommended v1 decision seam

Create a small pure module, for example:

```text
src/fauna/predatorHumanDecision.ts
```

Only if no existing pure decision seam is more appropriate after inspecting the code.

A minimal input shape can be conceptually:

```ts
type PredatorHumanDecisionInput = {
  hunger: number
  humanThreat: number
  fireThreat: number
  nearbyHumanCount: number
  attackCapability: number
}

// → 'attack' | 'flee'
```

Names are illustrative. Keep the actual API local to project conventions.

The function should be deterministic and have no Three.js/DOM dependencies.

Do **not** introduce a generic scoring framework as part of 056. Plan 055 explicitly leaves generalized decision scoring as a later architectural step.

## 5. Human threat calculation

Do not duplicate `playerAwareness` geometry.

The existing perception result can provide a player-threat baseline. The decision layer can then derive a simple risk value from:

- how close the human is;
- whether the human is noticed at normal range or panic range;
- whether fire/torch danger is present;
- nearby-human count.

Keep this cheap and deterministic.

The exact numeric formula should be tuned against the current perception constants, not invented as a large configurable AI framework.

## 6. Species capability

Current `AnimalDef` contains `role`, but no human-attack capability/aggression field.

Plan 056 requires:

- wolf → most willing;
- fox → more cautious;
- non-predators → unchanged.

The smallest clean solution is to add one small predator-specific value to the existing `AnimalDef`, only if implementation confirms it is needed, e.g. an attack willingness / human-risk tolerance value.

Do **not** create:

- `PredatorAI` classes;
- species-specific AI subclasses;
- separate behavior configuration registries.

If a value is unnecessary because a simple existing distinction is sufficient, do not add it.

## 7. Human target boundary

This is the main missing implementation seam.

### Current state

`AnimalAgent.attack(prey: AnimalAgent)` directly calls:

```text
prey.takeDamage(damageFor(...))
```

This is animal-to-animal only.

### Required v1 behavior

A predator that decides to attack a human should be able to:

```text
perceive human
  ↓
decide attack
  ↓
move/chase toward human
  ↓
reach attack/contact range
  ↓
apply existing/shared human health damage boundary
```

The target should be represented by the smallest existing player/NPC reference available at implementation time.

Do not introduce a generalized `EntityRef`, target registry, combat manager, or universal combat system.

### Player vs NPC

The plan mentions humans broadly, but the current fauna perception is explicitly player-based (`observerPos`). There is no equivalent nearby-NPC perception input in `Fauna.update()`.

Therefore:

- **Player attack should be the first concrete target.**
- Nearby NPCs should only be included if the existing settlement/NPC collections can be passed cheaply without creating an `animals × all NPCs` scan.
- If NPC targeting requires a larger perception/data-flow change, keep it out of the first implementation and document it as the next step.

This keeps the feature implementable and avoids premature architecture.

## 8. Performance constraint for nearby humans

`createFauna().update()` currently loops over all active animal agents and passes the same player observer position plus fire/village context.

Do not make every animal independently scan every NPC.

If NPC count is needed for the decision, prefer one of:

1. a small precomputed nearby-human context produced by the caller;
2. a bounded spatial/local query if one already exists;
3. a minimal count passed into `Fauna.update()`.

Do not introduce a spatial index or worker solely for plan 056 unless current measurements demonstrate a real need.

## 9. Torch integration

Plan 056 says a player's torch should contribute to fire danger when existing torch state can be supplied without a new perception system.

Before implementing, inspect the current torch state path from plan 050.

Preferred v1:

```text
existing lit-fire state + existing player torch state
        ↓
existing environmental danger context
```

If the torch is already represented in the same `litFires` collection, use that directly.

If it is not, pass the smallest existing torch position/state through the existing fauna update path.

Do not redesign fire or lighting.

## 10. Decision behavior targets

The implementation should produce a continuous decision, not hard-coded scenario branches:

| Context | Expected tendency |
|---|---|
| low hunger + human | flee |
| hungry wolf + relatively low human risk | attack possible |
| very hungry wolf + one human | attack possible |
| hungry fox + same situation | more cautious / usually flee |
| attack candidate + strong fire threat | flee |
| attack candidate + multiple humans | flee more often |
| non-predator + human | existing behavior unchanged |

Do not make the exact examples literal `if` branches.

## 11. Integration with existing FSM

The existing movement behavior should remain the implementation mechanism.

Preferred conceptual flow:

```text
AnimalAgent.update()
    ↓
perception
    ↓
if predator + human noticed
    ↓
predatorHumanDecision(...)
    ├── flee → existing fleeFrom()
    └── attack → human chase/attack path
    ↓
otherwise
    └── existing predator/prey behavior
```

Do not create a second FSM.

Do not rewrite `updatePredator()` unless required to expose a small reusable chase primitive.

## 12. Attack movement implementation

The smallest acceptable approach is likely to reuse `steerToward()` and the existing `CONTACT_RANGE`/attack cooldown semantics.

However, `attack()` currently requires an `AnimalAgent` and `damageFor()` expects `AnimalKind` pairs. The implementation should extract only the minimum common operation needed for a human target.

Possible direction:

```text
attack target position
  + contact check
  + cooldown
  + damage callback/reference
```

Keep this local to fauna until the shared Health/Stamina/Threat plan provides a stronger cross-entity damage boundary.

If a player health API is currently absent, the implementation may need to stop at the smallest explicit human-target/damage seam rather than inventing player combat. The acceptance criterion should then distinguish:

- **decision + chase to human**
- **actual human damage**

Do not hide a missing combat API behind fake damage state.

## 13. Relationship to plan 045

Plan 056 explicitly says not to implement 045.

Keep that boundary.

The feature may consume existing `HealthState` where available, but it should not introduce:

- stamina;
- threat state objects;
- generic combat;
- shared damage architecture.

Plan 045 can later replace the temporary/local boundary without changing the core predator decision concept.

## 14. Relationship to plan 055

Plan 055 is the future shared simulation architecture. Plan 056 is also one of the concrete use cases that motivates it.

Do not block 056 on completing the full 055 refactor.

Instead, implement the smallest seam that follows 055's principles:

```text
needs/state
  +
perception/context
  ↓
pure decision
  ↓
existing movement/action
  ↓
world effect
```

If 055 is implemented first, reuse its final contracts. If not, keep 056's decision module small and easy to adapt later.

## 15. Tests

The highest-value tests should be pure decision tests, not Three.js integration tests.

At minimum:

1. low hunger + moderate human threat → flee;
2. increasing hunger can cross the attack threshold;
3. stronger human threat can move the same hungry predator back to flee;
4. fire increases threat;
5. multiple humans increase threat;
6. wolf is more attack-prone than fox for equivalent inputs;
7. non-predator cannot choose human attack;
8. identical input produces identical output.

Then verify integration separately:

9. player noticed still causes normal flee when attack decision says flee;
10. attack decision causes predator movement toward the player rather than immediate flee;
11. existing animal prey chase/attack remains unchanged;
12. existing player-awareness tests remain green;
13. existing AnimalLife tests remain green.

## 16. Performance

The decision itself should be O(1) and allocation-free.

Avoid:

- scanning every NPC for every animal;
- per-frame object creation;
- new workers;
- new global managers;
- another update loop.

At current fauna counts there is no justification for a worker.

## 17. Recommended implementation order

1. Inspect current player health/damage API and torch state path.
2. Extract/define a pure predator-human decision function.
3. Add minimal species capability data only if needed.
4. Feed existing `AnimalLifeState.hunger` into the decision.
5. Feed existing player-awareness/fire context into the decision.
6. Add the smallest nearby-human context only if it can be supplied without an expensive per-animal full scan.
7. Replace the unconditional player-flee branch with `attack | flee` for predators.
8. Reuse `steerToward()` for human chase.
9. Add the smallest safe human damage callback/reference if an existing health API supports it.
10. Add pure tests and run the full technical suite.
11. Browser-verify the behavior in at least the wolf/fox + human + fire scenarios.

## 18. Acceptance boundary

Plan 056 is complete when:

- a hungry predator can choose attack over flee in a sufficiently favorable context;
- low-hunger predators normally flee;
- stronger human/fire/crowd threat suppresses attack;
- wolf and fox can differ without separate AI classes;
- non-predators keep their existing behavior;
- player perception remains separate from decision logic;
- existing predator/prey chase and attack remains intact;
- no duplicate hunger/threat/combat/AI system is introduced;
- the decision is covered by deterministic unit tests;
- browser verification confirms the intended emergent behavior.

If actual human damage is not supported by an existing safe health boundary, report that explicitly rather than creating a new combat architecture inside 056. In that case, the implemented milestone is the predator's **decision + chase-to-human**, with damage deferred to the appropriate shared health/combat work.

## 19. Key conclusion for Claude

The important implementation trap is assuming that plan 056 is only a change from `flee` to `attack`. It is not: the current code has **player perception**, but the actual attack API is **animal-to-animal only**.

Keep the decision small and pure, reuse existing hunger/perception/fire/movement, and add only the smallest human-target boundary that the current player health API can support. Do not solve the larger combat architecture in this plan.

---

## 20. Implementation record (2026-08-11)

**Status:** implemented · technically verified · browser verification needed

### Done

- Pure decision: `src/fauna/predatorHumanDecision.ts` (+ `countNearbyHumans`).
- `AnimalAgent`: predator noticed-human → `decidePredatorHumanIntent` → `chaseHuman` / `fleeFrom`.
- Torch: lit `playerTorch` XZ appended to `litFires` in `gameLoop` before fauna update.
- Crowd: once-per-frame `countNearbyHumans` from loaded settlement NPCs (radius 12), passed into `Fauna.update`.
- Fauna→player damage: `chaseHuman` contact + cooldown → `damageVsHuman(kind)` → `onHumanHit` → `damageHealth(player.health, …)`. No death UI/respawn.
- Tests: decision + `countNearbyHumans` + `damageVsHuman`; `tsc` / lint / fauna tests / build green.

### Explicitly out of scope / deferred

- NPC as attack target (player only).
- Death UI / respawn / combat UX (plan 045).
- Generalized combat framework / `EntityRef` / `ThreatManager`.

---

## 21. Wolf close aggression + retaliation (2026-08-11)

Extends the decision module without a new AI system:

- Inputs: `selfHpRatio`, `provoked`, `aggressionRoll` (caller-injected; cached with intent for 0.2s).
- Wolf only: close territorial roll (~30%) when inside panic range and hunger scoring would flee; retaliation after `takeDamage(..., 'player')` — 75% attack if HP ≥ 40%, else always flee. Fire / crowd ≥ 3 suppress roll branches.
- Provocation lasts 8s, cleared when player alert drops. Player melee in `gameLoop` passes `'player'` as damage source.
