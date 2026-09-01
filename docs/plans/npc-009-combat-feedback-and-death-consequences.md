# Plan: Combat Feedback and Death Consequences

**Created:** 2026-09-01
**Status:** `planned` 📋
**Priority:** high · **Effort:** L
**Depends on:** ~~177~~ ~~179~~ ~~007~~
**Domain:** `npc`
**Tags:** `combat` `death` `corpse` `burial` `reputation`

## Goal

Extend the existing combat system with complete animation/audio feedback and make animal and NPC deaths produce persistent, world-driven consequences.

Reuse existing combat, animation, audio, action/navigation, hunting/harvesting, inventory/loot, reputation/badges, relationship/household and persistence mechanisms. Do not create parallel systems for these responsibilities.

## Scope

### 1. Combat animation

Verify and integrate existing GLB animation clips for NPCs and animals:

- attack
- hit/hurt
- death/collapse
- butcher, where available

Use the existing `AnimationClip[]` / `AnimationMixer` pipeline. Where assets use different clip names, resolve them through semantic mapping rather than hard-coded assumptions.

Synchronize attack presentation with the existing combat lifecycle so the visible hit aligns with the existing hit window and damage resolution.

Cover NPC ↔ animal, animal ↔ NPC and NPC ↔ NPC combat, while preserving the shared combat mechanics used by the player.

If an expected animation is absent, record the asset gap and provide a safe fallback rather than expanding this plan into asset production.

### 2. Combat audio

Extend the existing world audio mechanism with semantic combat feedback for:

- attack,
- hit/impact,
- hurt,
- animal attack/hurt,
- NPC death,
- animal death.

Reuse existing sounds where appropriate, but do not use player-specific kill audio as a universal death sound when it contains human-specific vocal/fall content.

Audio should follow combat/death events rather than introducing audio calls scattered across unrelated systems.

### 3. Death record and lifecycle

Make death a meaningful world state while keeping ownership with the existing NPC/animal systems.

Where supported by current architecture, retain:

- cause of death,
- killer identity/type,
- time,
- location.

Do not introduce a monolithic death manager. Corpse state should be separable from the lifetime of the active agent so off-screen simulation and cleanup remain viable.

### 4. Animal corpse consequences

Extend the existing animal corpse lifecycle and hunting/harvesting mechanisms:

```
animal death
→ corpse
→ NPC discovers/selects carcass
→ approach
→ butcher/harvest
→ collect resulting resources
→ remaining corpse/remains lifecycle
```

Reuse existing hunting hooks, harvest functions, inventory, resources and navigation/action execution.

If the animal naturally rots or is consumed, preserve the existing lifecycle rather than duplicating it.

### 5. NPC corpse and personal loot

An NPC death leaves a world corpse with the deceased NPC's personal loot.

Loot remains physically accessible.

Use existing inventory, item-instance and ownership semantics. Do not create a separate corpse inventory model unless the current ownership model requires a minimal adapter.

Distinguish legitimate recovery by the owner/family or otherwise authorized actor from unauthorized corpse looting.

### 6. Corpse looting and reputation

Unauthorized corpse looting produces a negative consequence through the existing reputation system and an appropriate existing reputation badge.

Do not create a parallel corpse-crime reputation system.

Where the existing social knowledge/witness mechanisms support it, the consequence should depend on whether the action is witnessed or discovered. If they do not yet provide the required granularity, use the smallest compatible existing reputation path and leave full witness propagation for a later system.

### 7. NPC burial

An NPC death creates a burial problem/goal using existing NPC decision/action mechanisms.

The deceased's family/household should receive priority:

```
NPC death
→ household/family awareness
→ burial goal/problem
→ suitable family member
→ navigate to corpse
→ bury
```

Do not hard-code a family-only burial manager. The design should allow another suitable community member to handle an unattended death later.

Use the existing destination/approach and navigation mechanisms.

### 8. Grave and stone marker

Successful burial creates a persistent grave world object associated with the deceased.

At minimum retain:

- deceased NPC ID,
- position,
- death/burial time,
- burial state.

The first version creates a stone grave marker without requiring resources.

The grave must be a real world state/object, not only a visual effect, so later systems can reference it for dialogue, relationships, memory, quests and visits.

### 9. Corpse cleanup

Define explicit terminal transitions:

```
animal corpse
→ harvested/consumed/rotted
→ remains/cleanup

NPC corpse
→ buried
→ corpse removed
→ grave remains
```

Avoid leaving cleanup as an implicit side effect of agent destruction.

### 10. Persistence and simulation

Preserve death/corpse/burial/grave information according to the existing persistence architecture.

Do not add isolated persistence for one sub-state if the current SaveData model intentionally excludes the broader runtime state; identify such limitations explicitly and keep the world-state design compatible with the planned full simulation persistence work.

Remote corpse/grave state should remain lightweight and compatible with hybrid/off-screen simulation.

### 11. Debugging

Provide practical diagnostics for:

- dead NPCs and animals,
- corpse state,
- NPC corpse loot and looter,
- death cause/killer where available,
- burial assignment/state,
- grave association,
- reputation consequence of corpse looting.

Reuse existing debug conventions rather than introducing a standalone debug UI.

### 12. Documentation

Update relevant state/domain documentation when the implementation materially changes the current architecture.

Add JSDoc with `@domain` to important new or modified public/architectural functions and classes where needed for implementation preflight discovery.

## Constraints

- Reuse existing combat lifecycle and shared combat mechanics.
- Reuse existing animation/audio infrastructure.
- Reuse existing NPC goals, pressures, actions and navigation.
- Reuse existing animal corpse and hunting/harvest lifecycle.
- Reuse existing inventory/ownership and reputation/badge systems.
- Preserve deterministic simulation and world independence from the player.
- Do not make burial or corpse processing player-only.
- Do not require resources for the first stone grave marker.
- Do not introduce a general crime system as part of this plan.

## Non-goals

- Creating new character/animal animation assets when existing clips are sufficient.
- Full grief/ mourning simulation.
- Funeral ceremonies.
- Cemeteries as a separate settlement system.
- Grave robbing.
- Inheritance.
- Economic burial costs.
- Full crime/witness system.
- New player combat mechanics.
- Advanced ecological scavenger behaviour.

## Verification

Technical:

- `npx tsc --noEmit`
- `pnpm run lint:fix`
- `pnpm run build`
- `pnpm run test`

Browser/gameplay:

1. Trigger NPC ↔ animal combat and verify attack/hit/hurt/death animations and SFX.
2. Verify animal death leaves a corpse and an NPC can independently discover and process it.
3. Verify harvested animal results enter the existing inventory/resource flow and corpse/remains transition correctly.
4. Kill an NPC and verify the corpse remains in the world with personal loot.
5. Verify authorized recovery is not treated as corpse theft.
6. Loot an NPC corpse as an unauthorized actor and verify the existing reputation system/badge receives the negative consequence.
7. Verify the corpse can be looted without mechanically blocking the action.
8. Verify the family/household can generate and execute a burial response.
9. Verify burial removes the corpse and creates a persistent stone grave marker linked to the deceased.
10. Verify the player is not required for any animal processing or NPC burial step.
11. Verify behaviour remains coherent when the relevant entities are outside the immediate camera area, within the limits of the current simulation/persistence architecture.

## Implementation order

1. Audit and map existing animation clips.
2. Connect combat/death lifecycle to animation feedback.
3. Add semantic combat/death audio.
4. Define/extend death and corpse world state.
5. Extend autonomous animal corpse processing.
6. Add NPC corpse + loot semantics.
7. Integrate corpse looting with existing reputation/badges.
8. Add household/family burial behaviour.
9. Add grave and stone marker.
10. Verify cleanup, persistence boundaries and off-screen behaviour.
11. Update state/domain documentation where required.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
