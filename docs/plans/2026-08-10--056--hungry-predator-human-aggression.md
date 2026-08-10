# Hungry Predator: Human Aggression

**Status:** `planned` 📋  
**Priority:** 🟡 `medium`  
**Effort:** `M`

## Goal

Allow a hungry wild predator to decide that hunger outweighs fear of humans and attack a human target.

Example:

```text
hungry wolf + one nearby human
        ↓
 hunger pressure can outweigh human fear
        ↓
      attack
```

The decision must remain contextual. Fire, a torch and multiple nearby humans should increase perceived danger and can still make the predator flee.

This is a **small extension of the existing fauna behavior**, not the beginning of a generalized animal-intelligence system.

## Existing systems to reuse

The repository already provides the necessary foundations:

- `AnimalLifeState.hunger` provides the existing hunger signal; do not create another hunger model.
- `AnimalAgent` already owns the fauna FSM, predator/prey behavior, movement, perception, chase/flee and attack timing.
- `playerAwareness.ts` already handles player detection, distance, field of view, panic range, day/night and forest effects.
- `AnimalAgent` already receives lit-fire positions and uses fire as an environmental danger.
- Predator/prey combat already has an attack path and shared `HealthState` damage foundation.
- Settlements already expose their NPC agents, so nearby humans can eventually include NPCs as well as the player.
- `045 Health/Stamina/Threat` is planned future infrastructure. Do not implement that plan as part of this feature.

## Core behavior

Replace the current unconditional reaction:

```text
human noticed → flee
```

with:

```text
human noticed
      ↓
evaluate risk
      ├── flee
      └── attack
```

The evaluation should be deterministic and based only on information already available to the fauna system plus the smallest new inputs required by this feature.

### Risk factors

Use these factors initially:

1. **Hunger pressure**
   - Reuse `AnimalLifeState.hunger`.
   - Higher hunger increases willingness to accept danger.
   - Do not add a second hunger state or a generic `Need` system for fauna.

2. **Human threat**
   - Reuse the existing player-awareness distance/FOV/panic logic.
   - A closer human is more dangerous.
   - Existing species-specific awareness ranges remain the baseline.

3. **Fire / torch**
   - Existing lit fires remain a fear source.
   - A player's torch should be treated as an additional fire danger when the existing torch state can be supplied without creating a new perception system.
   - Do not redesign lighting or fire simulation here.

4. **Number of nearby humans**
   - More humans increase perceived danger.
   - Initially this may be a simple nearby-human count; do not add group psychology or communication between humans and animals.

The resulting decision is conceptually:

```text
willingness_to_attack = hunger_pressure - human/fire/crowd_fear
```

The exact formula and thresholds should be tuned from the existing values rather than introducing a large configurable scoring framework.

## Species behavior

The mechanism must work through existing `AnimalDef` data and `AnimalKind` rather than introducing a separate predator-AI hierarchy.

Initial expectation:

- wolf: most willing to take the risk;
- fox: more cautious;
- non-predators: unchanged.

Do not add new per-species intelligence parameters unless implementation/testing shows that existing species data is insufficient. If a new parameter is genuinely required, add the smallest field to the existing `AnimalDef` rather than creating a separate behavior configuration system.

## Human targets

The feature should be designed so that a predator can reason about a human target represented by the existing player/NPC agents.

However, do **not** introduce a generalized `EntityRef`, `ThreatManager`, target registry or combat framework just to support this feature.

Use the smallest existing references/positions available. If actual damage to player/NPC requires a missing shared combat API, keep that API work outside the intelligence decision itself and reuse the existing `HealthState` foundation when it becomes available.

The important v1 behavior is:

```text
predator perceives human
        ↓
decides whether to risk attack
        ↓
existing chase/attack movement
```

Do not implement player combat, weapons, hitboxes or a new damage architecture here.

## Integration boundaries

### `AnimalAgent`

Extend the existing decision point where player awareness currently causes `flee`.

Do not create another FSM or update loop.

Preferred shape:

```text
existing perception
      ↓
small human-risk evaluation
      ↓
existing FSM
   ├─ flee
   └─ attack/chase
```

### `AnimalLife`

Only expose/read the existing hunger value. Keep biological ticking in `AnimalLife`.

### `playerAwareness`

Keep perception separate from the decision. Do not make `playerAwareness` decide whether the animal attacks.

### Fire / torch

Reuse the existing `litFires` path and existing torch state. Avoid creating a generic `FireSource` abstraction unless the current code proves it is necessary.

### Settlements / NPCs

Use existing settlement NPC collections to provide nearby-human information if needed. Do not add NPC-specific animal perception logic yet.

## Decision rules for v1

The implementation should produce behavior approximately like this:

| Situation | Expected result |
|---|---|
| Low-hunger wolf + human | Flee |
| Hungry wolf + distant/small human threat | May attack |
| Very hungry wolf + one nearby human | Can attack |
| Very hungry wolf + torch | Fire fear may still cause flee |
| Very hungry wolf + campfire | Strong fire fear; normally flee |
| Very hungry wolf + several humans | Crowd fear strongly favors flee |
| Non-predator + human | Existing behavior unchanged |

These are behavioral targets, not hard-coded scenario branches.

## Avoid overreach

Do **not** add in this plan:

- a generalized animal brain;
- a new AI/decision engine;
- `ThreatManager`;
- persistent threat memory;
- emotional state;
- personality for animals;
- pack coordination;
- communication between animals;
- navigation/pathfinding;
- new combat framework;
- player weapons/combat;
- a generalized entity-reference system;
- LLM/AI-generated animal decisions;
- the full `045 Health/Stamina/Threat` architecture.

This feature should remain a small extension of the current `AnimalAgent` behavior.

## Implementation phases

### Phase 1 — isolate the decision

Create a small pure decision function/module if the existing `AnimalAgent` code does not already have a suitable place for it.

Inputs should be limited to the values actually required, for example:

```text
hunger
human threat level
fire threat
nearby human count
predator capability
```

Output should be a simple decision such as:

```text
attack | flee
```

Do not introduce a general scoring engine.

### Phase 2 — connect existing hunger

Wire the existing `AnimalLifeState.hunger` into the decision.

Verify that changing hunger alone can change the result while all other conditions remain equal.

### Phase 3 — connect existing human/fire awareness

Reuse current player-awareness and fire information.

Ensure that fire and a torch increase fear rather than being treated as separate AI systems.

### Phase 4 — nearby humans

Add the smallest possible input needed to account for nearby NPCs/people.

Do not make the animal perform a second full perception pass over every NPC if the existing settlement update already has suitable local information. Avoid an O(animals × all NPCs) cost if a small nearby-human input can be prepared by the caller.

### Phase 5 — integrate with existing FSM

At the current player-awareness reaction point:

```text
noticed human
    ↓
evaluate risk
    ├─ attack → existing predator chase/attack path
    └─ flee   → existing flee path
```

Do not duplicate chase or flee movement.

### Phase 6 — human target/damage boundary

If the existing attack path can already target a human safely, reuse it.

If it cannot, stop at the smallest missing integration point. Do not expand this plan into player/NPC combat. Leave actual human damage for the shared health/combat work when appropriate.

## Tests

Add or extend pure tests for the decision logic.

At minimum verify:

- low hunger + normal human threat → flee;
- increasing hunger can switch the result to attack;
- stronger human threat can switch attack back to flee;
- fire increases fear;
- torch/fire can prevent an otherwise possible attack;
- more nearby humans increase fear;
- predator species can differ through existing `AnimalDef` data;
- non-predators remain unchanged;
- decision is deterministic for identical inputs.

Keep existing `AnimalLife`, `playerAwareness` and predator/prey tests passing.

## Performance

This decision runs for active animals and should remain cheap and deterministic.

Avoid:

- repeated allocations per animal/frame;
- scanning all NPCs independently for every animal when avoidable;
- new workers;
- new global managers;
- additional update loops.

No Web Worker is justified for this feature at current scale.

## Acceptance criteria

The feature is complete when:

- a predator can attack a human when hunger sufficiently outweighs fear;
- low-hunger predators still normally flee from humans;
- fire/torch and multiple humans increase danger and can suppress an attack;
- existing predator/prey behavior remains intact;
- existing player-awareness behavior remains the perception layer;
- existing movement/FSM is reused;
- no parallel hunger, threat or combat system is introduced;
- the implementation remains small enough to be a natural extension of `AnimalAgent`;
- tests cover the decision boundary and existing fauna tests remain green.

## Related plans

- [2026-08-07--010--predator-prey-system.md](./2026-08-07--010--predator-prey-system.md) — existing predator/prey chase, attack and damage.
- [2026-08-07--021--npc-3-animal-life.md](./2026-08-07--021--npc-3-animal-life.md) — existing animal hunger/thirst/energy.
- [2026-08-10--042--fauna-player-awareness.md](./2026-08-10--042--fauna-player-awareness.md) — existing human/player perception and flee behavior.
- [2026-08-09--050--fire-torch.md](./2026-08-09--050--fire-torch.md) — portable torch and fire state.
- [2026-08-08--045--health-stamina-threat.md](./2026-08-08--045--health-stamina-threat.md) — future shared Health/Stamina/Threat architecture; intentionally not implemented here.
