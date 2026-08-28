# Implementation Notes: Horse Riding

**Plan:** `fauna-003-horse-riding.md`
**Status:** `planned` 📋
**Created:** 2026-08-28
**Purpose:** implementation guide for Claude Code; based on current `main` recon.

## 1. Current Code Facts

- `AnimalAgent` is the central runtime fauna entity.
- `AnimalKind` already contains `horse` and `donkey`.
- Fauna already has animal lifecycle, movement, needs, stamina, follow and threat/flee systems.
- Player already has movement/input, `PlayerNeeds` (including stamina/vigor), health/damage and skills.
- No mounted/riding state currently exists.
- No `Riding` skill currently exists.
- Mobile input already uses `createTouchControls`.
- `saddlebags` already exists as an item kind, but cargo/inventory functionality is out of scope.
- Horse/donkey assets are already wired; do not add model/asset work unless code inspection finds a concrete gap.

## 2. Reuse Existing Systems

Before coding, inspect the actual implementations of:

- `AnimalAgent` and animal definitions/types
- animal movement + stamina/needs
- player state + movement
- player input + `createTouchControls`
- interaction/action system
- camera
- animation/model attachment
- health/damage
- persistence/entity lifecycle
- game loop/world update

Use existing ownership, state and update paths. Do not create parallel systems.

## 3. Core Implementation

Implement the smallest shared **mountable** mechanism.

Required concepts:

- player mounted state with authoritative mount entity reference;
- animal mountable capability/configuration;
- mount/dismount actions;
- mounted movement using existing animal movement;
- configurable mount point;
- mounted player visual attachment;
- speed modes;
- mount stamina consumption;
- reduced player stamina consumption;
- mounted camera behaviour;
- Dismount UI for desktop/mobile;
- fall/stability and fall damage using existing health/damage.

Do not create:

- `HorseManager`
- `HorseAI`
- `HorseRidingSystem`
- `DonkeyRidingSystem`
- duplicate stamina/needs/health systems.

## 4. Mount State & Lifecycle

Player and animal remain separate logical entities.

Mounted state must have one authoritative owner and reference the mount by entity ID.

Handle at minimum:

- mount,
- dismount,
- mount death/removal,
- unavailable entity,
- world/entity lifecycle changes,
- save/load if current persistence supports the relevant state.

If the mount disappears, safely dismount and clear the reference.

Do not duplicate mounted state in UI, camera or animal state.

## 5. Animal Simulation

Mounted animal remains an `AnimalAgent`.

While mounted:

- player input controls movement;
- autonomous movement must not fight player control;
- needs, stamina, lifecycle and relevant world simulation continue;
- after dismount, normal animal behaviour resumes.

Reuse existing movement/AI code. Do not disable the complete animal update while mounted.

Threat/flee behaviour must remain compatible with mounted state; do not introduce a horse-specific threat system.

## 6. Horse / Donkey

Both `horse` and `donkey` already exist.

The implementation must be species-agnostic at the riding layer.

Animal-specific data may define:

- max speed,
- acceleration,
- stamina cost/regeneration,
- mount point,
- animation configuration.

Do not branch riding logic on animal kind when configuration/capability is sufficient.

Acceptance test:

> The existing `donkey` can use the same riding mechanism without copying or creating another riding system.

Cargo/saddlebags remain out of scope.

## 7. Movement & Stamina

Use existing animal movement and stamina.

Minimum:

```
walk → run
```

A third gait is optional only if the current movement system supports it without unnecessary complexity.

Speed and stamina costs must be configuration/data, not horse-specific constants in the controller.

Player stamina uses existing `PlayerNeeds`; riding consumes it more slowly than normal running.

Do not add new stamina resources.

## 8. Mount Point / Rendering / Animation

Use the existing Three.js/model attachment conventions.

Mount point must support per-model/per-animal position and rotation; do not assume one global offset.

Minimum animation target:

- mounted idle,
- mounted movement.

If riding animations are unavailable, use the simplest compatible seated-pose fallback.

Do not introduce a new animation framework.

## 9. Dismount

Use existing interaction/input mechanisms.

Dismount must:

1. find a safe position beside the mount using existing terrain/collision utilities;
2. detach player visual;
3. clear mounted state;
4. restore normal player movement/camera/UI.

Do not use an arbitrary fixed world-space offset if existing placement/collision helpers are available.

## 10. Stability / Fall

There is currently no Riding skill.

Do not create a parallel skill/progression system.

Implement the minimum stability model from the plan using available state, primarily:

- mount stamina,
- speed,
- terrain,
- mount condition.

If Riding skill is later added, integrate through the existing skill system.

Fall must:

- detach player,
- clear mounted state,
- restore normal movement,
- apply existing player damage/health,
- leave the animal as an independent entity.

## 11. UI / Mobile / Camera

Extend existing systems only.

Mobile:

- reuse `createTouchControls`;
- add/show Dismount only while mounted;
- avoid joystick/camera overlap.

Camera:

- reuse existing camera controller;
- adjust target/height/distance only as needed;
- verify mount/dismount transition and jitter.

## 12. Performance

Do not add a global per-frame riding manager or scans over all animals.

Riding logic should operate on the current player/mount relationship.

Mounted animals remain in the normal fauna update pipeline.

Avoid duplicate pathfinding, duplicate simulation and unnecessary allocations.

## 13. Expected Code Changes

First inspect the current files and record the exact integration points before editing.

Expected areas:

| Area | Purpose |
|---|---|
| AnimalAgent / animal definitions | mountable capability + control |
| Player state | mounted state |
| Player movement/input | mounted control |
| Interaction/action | mount/dismount |
| Camera | mounted camera |
| UI/touch controls | Dismount |
| Model/animation attachment | rider ↔ mount |
| Health/damage | fall damage |
| Persistence | lifecycle/save-load if required |

Do not assume filenames or APIs from these notes.

## 14. Implementation Order

1. Read `CLAUDE.md`, `docs/STATE.md`, plan and these notes.
2. Inspect the systems listed in §2 and identify exact existing APIs/owners.
3. Implement authoritative mounted state.
4. Implement mount/dismount through existing interaction mechanisms.
5. Integrate player-controlled animal movement.
6. Add mount point + player visual attachment.
7. Add stamina/speed handling.
8. Add camera/UI/mobile integration.
9. Add stability/fall/damage.
10. Verify donkey compatibility without duplicated riding logic.
11. Run automated checks.
12. Perform browser/manual verification.
13. Update these notes with actual files, decisions, limitations and results.

If the code differs from these notes, **code is the source of truth**. Adapt the implementation; do not force the documented structure onto the repository.

## 15. Verification

### Automated

Run the repository-standard:

- tests,
- lint,
- typecheck,
- build.

Record exact results.

### Browser/manual

Verify:

- mount/dismount;
- correct rider position;
- movement and speed modes;
- mount stamina;
- player stamina;
- animal needs/lifecycle;
- normal AI after dismount;
- threat/flee compatibility;
- fall + damage;
- camera;
- desktop input;
- mobile input;
- no terrain clipping/jitter;
- no regression in normal player/animal movement.

### Architecture

Confirm:

- one authoritative mounted state;
- player and animal remain separate entities;
- no duplicated animal/player needs, stamina or health;
- no global riding manager;
- no horse-only riding implementation;
- donkey can use the same mechanism;
- no unnecessary per-frame global scans.

## 16. Post-Implementation Update

After implementation, replace/update the TBD sections with:

- exact changed files;
- final state/type/API names;
- final architecture decisions;
- animation solution;
- persistence/lifecycle handling;
- known limitations;
- automated verification results;
- browser/manual verification results;
- donkey compatibility result.

Clearly distinguish:

- implemented,
- technically verified,
- browser/manual verified.

**Zrób git commit i push do main, rebase jeżeli trzeba**
