# Plan: Lost hunter — natural cave

**Created:** 2026-09-13
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** world-terrain-028, ~~fauna-018~~, ~~fauna-019~~
**Domain:** `quests-progression`
**Subdomains:** `quests` `relationships` `rewards`
**Tags:** `natural-cave` `hunter` `story-find` `fauna`
**Roadmap:** -

## Goal

Add a compact local story using one real `natural` cave. An NPC asks the Player to determine what happened to a hunter who disappeared earlier. The cave, evidence, abandoned pack and optional cave predator exist independently of quest activation.

V1 deliberately treats the hunter as a historical authored disappearance. Do not create a fake live NPC frozen inside the cave. A future living rescue should use generic NPC cave traversal (`npc-027`).

## World binding

Bind one exact generated cave that satisfies:

```text
Caves.archetypeOf(caveId) === 'natural'
+ world-terrain-028 storyFind anchor
+ world-terrain-028 loot anchor
```

Selection must be deterministic and should prefer a natural cave not already claimed by another authored natural-cave story.

Use stable cave/anchor ids. Never store underground XYZ in quest progress.

## Evidence and loot

Place story evidence at the cave-owned `storyFind` anchor and a fixed `WorldGeneratedContainers` entry at the `loot` anchor representing the hunter's abandoned pack.

Use existing item kinds for the pack payload, e.g. arrows, knife, food and modest coin. The pack contents and looted state remain owned by `WorldGeneratedContainers`; the quest must not copy them into quest state.

If a reusable static cave-story prop seam is needed for the evidence presentation, keep it world-owned and anchor-based. Do not put Three.js objects in `QuestManager`.

## Environmental predator

The selected cave may receive one ordinary persistent predator through the existing cave habitat + persistent occupant contracts. It is environmental pressure, not a quest enemy.

Required semantics:

- exists before the quest is offered;
- uses normal `AnimalAgent` needs/movement/combat;
- may leave the cave or already be gone when the Player arrives;
- may be defeated before quest acceptance;
- is never a quest objective;
- is never respawned by quest state.

Do not add a `hunter_killer` animal type or store predator health/death in the quest.

## Quest flow

1. A specific authored giver reports the disappearance.
2. Reveal/target the exact cave through existing world-location knowledge/navigation where applicable.
3. Player reaches the natural cave and finds the evidence/pack.
4. Preferred objective is the existing `loot_world_container` contract bound to the exact hunter-pack container id; do not add `interact_hunter_body`.
5. Player returns to the giver and explicitly reports the result.

The story should work whether the cave predator is inside, outside or already dead.

## Outcome

Use one successful outcome, e.g. `hunter_fate_reported`.

Reward should be modest: coin and/or a small player↔NPC relationship/social consequence through existing `QuestOutcome` mechanisms. Cave loot is already a world reward and must not be duplicated as `QuestReward`.

## Ownership / persistence

| State | Owner |
|---|---|
| quest stage/outcome | `QuestManager` |
| cave identity/archetype/anchors | cave world, derived |
| pack contents/removal state | `WorldGeneratedContainers` |
| predator identity/lifecycle | fauna persistent occupant systems |
| location discovery | world location knowledge |
| relation/reputation/renown | existing social systems |

The world content must be composed from deterministic world context rather than spawned when the quest starts.

## Reuse targets

Recon/implementation should start from:

- `src/quests/quests.ts`;
- `src/quests/QuestManager.ts`;
- `src/app/createApp.ts`;
- `src/app/worldBundle.ts`;
- `src/world/worldGeneratedContainers.ts`;
- `src/world/createCaves.ts`;
- `src/fauna/animalCaveHabitat.ts`;
- `src/fauna/persistentOccupants.ts`;
- `src/world/locations/revealLocationKnowledge.ts`.

Add JSDoc for important reusable/public additions and appropriate `@domain` tags.

## Non-goals

- no living missing-NPC rescue in V1;
- no tracking minigame;
- no quest-spawned predator;
- no kill objective;
- no hardcoded cave coordinates;
- no quest-only inventory/persistence.

## Verification

Test that only a valid `natural` cave is selected; the pack exists before quest activation; only the exact pack advances the objective; pack state survives save/load; predator state does not gate progress; reporting resolves exactly once; rebuild does not duplicate the pack or persistent predator.

Manual browser verification remains the User's responsibility.

> **Zrób git commit i push do main, rebase jeżeli trzeba**