# Quest authored first occurrence policy

**Date:** 2026-09-13  
**Status:** `decision`  
**Scope:** authored narrative quests vs recurring world-driven quests

This decision clarifies and partially supersedes the strict wording in `docs/reviews/2026-09-13--quest-system-architecture-recon.md`, especially P4, Stage C and statements implying that a quest must never cause its world problem to exist.

## Decision

Seedvale deliberately supports **two sources of quest situations**:

1. **Authored first occurrence** — the first occurrence of a selected situation may be deliberately triggered by authored narrative/gameplay so the player is guaranteed to encounter that content.
2. **World-driven recurrence** — later occurrences of the same type should normally emerge from autonomous simulation and only then become quest opportunities.

Core rule:

```text
first occurrence = authored
later occurrences = random / world-driven
```

This is intentional. Seedvale is an autonomous world, but it is also a game with authored content. The player must not have to wait an unknown amount of simulation time before a designed quest can exist.

## Example: lost sheep

The first lost-sheep quest may deliberately make a sheep stray.

That does **not** mean QuestManager owns or simulates a fake lost sheep. The authored quest asks the fauna system to create/select a real stray episode, then binds to and observes that fauna-owned state.

```text
authored lost-sheep quest
        ↓
fauna.startLivestockStray(...) / equivalent domain seam
        ↓
real fauna-owned stray episode
        ↓
quest observes returned / alive / dead / unavailable
```

After that authored first occurrence, later lost-livestock quests should come from normal fauna simulation:

```text
fauna naturally creates stray episode
        ↓
opportunity collector detects it
        ↓
world:lost-livestock:* quest becomes available
```

A generated/world-driven lost-livestock quest must **not** create a stray simply because the quest was offered.

## Ownership rule remains unchanged

Authored triggering is not permission to build parallel quest simulation.

- fauna owns animals, stray episodes, death and return;
- settlements own shortages, repair problems and settlement state;
- world/location systems own discoveries and locations;
- QuestManager owns quest progress, participation and outcome;
- the quest may request that a domain owner starts a deliberately authored first incident;
- once started, that incident must continue independently of player, camera and quest UI.

The quest may **cause the first real incident to happen**, but it must not **become the owner of that incident**.

## Existing problem vs authored trigger

If a compatible real incident already exists when the authored quest would normally create one, prefer binding the authored quest to the existing incident instead of creating a duplicate.

Example: if a sheep has already naturally strayed before the tutorial lost-sheep quest starts, the authored quest should preferably use that sheep rather than force a second stray.

## Recurrence rule

For a problem type that supports authored + generated quests:

- authored content may guarantee the first occurrence;
- after that, generated quests must require real domain state;
- recurring quest frequency is therefore controlled by the simulation, not QuestManager;
- authored triggering must not silently become the recurrence mechanism.

This distinction should be explicit in plans/content when both modes exist.

## Consequences for current quest architecture

### `zagubiona-owca` vs `world:lost-livestock:*`

This overlap is potentially **intentional**, not automatically duplicate content:

- `zagubiona-owca` can be the guaranteed authored first occurrence;
- `world:lost-livestock:*` is the reusable world-driven recurrence.

They should converge on the same fauna-owned stray state and snapshot/outcome semantics where practical.

### Wolf problems

Current wolf-den pressure can remain world-driven. An authored wolf quest is also allowed to deliberately seed a first real wolf incident if narrative design requires guaranteed exposure. The same ownership rule applies: fauna/world owns the resulting pressure, den, wolves and resolution.

### Economy / shortages / repairs

Future authored quests may deliberately expose or seed a first real domain problem when necessary for onboarding or narrative. Later opportunities should emerge from actual economy/settlement simulation.

Do not create quest-local stock, repair state or fake shortages.

## Updated interpretation of the recon

The following strict statement from the architecture recon is **not** the target rule:

```text
quest never creates the world problem
```

The intended rule is:

```text
authored first occurrence may deliberately trigger a real domain-owned problem
world-driven recurrence only observes real simulation-created problems
QuestManager never owns a parallel copy of either
```

Therefore `quests-progression-030` should remove quest-triggered problem creation only from **generated/world-driven recurrence**, not from deliberately authored first occurrences.

## Principles

1. **First occurrence may be authored; later occurrences should normally be world-driven.**
2. Authored content may guarantee a situation instead of waiting indefinitely for random simulation.
3. Authored triggering must go through the system that owns the resulting world state.
4. Once created, the incident evolves independently of the quest/player/camera.
5. Generated/world-driven quests observe existing problems; they do not manufacture recurrence.
6. If the world already contains a compatible incident, reuse it rather than duplicating it.
7. Authored and world-driven variants should reuse the same domain concepts, facts and outcome snapshots where practical.
8. This policy does not weaken the boundary between quests, work contracts, NPC decisions and world simulation.
