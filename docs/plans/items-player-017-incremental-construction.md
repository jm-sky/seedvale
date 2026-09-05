# Plan: Incremental Construction for Player Buildables

**Created:** 2026-09-05
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** npc-018
**Domain:** `items-player`
**Subdomains:** `items` `interaction`
**Tags:** `construction` `buildables` `shared-work`
**Roadmap:** -

## Goal

Extend existing player-built world objects so construction is a persistent process requiring work, rather than every placed object appearing immediately in its completed form.

Initial scope:

- palisade segments,
- standing torches.

Reuse the shared-work model established by `npc-018` so the same construction target can receive useful work from Player and hired NPCs.

The intended flow is:

```text
choose buildable
    ↓
validate terrain
    ↓
terrain suitable?
    ├─ no → prepare terrain
    │        ↓
    │      revalidate
    └─ yes
          ↓
place unfinished buildable
    ↓
Player and/or NPC work
    ↓
construction complete
    ↓
normal functional world object
```

Do not create separate Player and NPC construction systems.

## Current direction

The well already has incremental construction with persistent world-owned progress. `npc-018` extends the same direction into shared work and terrain preparation.

Other player-built objects such as palisade segments and standing torches currently behave as effectively finished objects after placement. Extend those existing world objects rather than creating parallel NPC-only or contract-owned construction state.

## 1. Construction is world state

An unfinished buildable must be a real persistent world object.

Prefer stable identity throughout construction:

```text
place palisade
    ↓
real palisade record, unfinished
    ↓
work contributions
    ↓
same record, completed
```

Avoid replacing a temporary construction-site object with an unrelated finished object unless current-code constraints make stable identity impractical.

The preferred invariant is:

> placement creates the object identity; work changes its construction state.

## 2. Reuse shared work from npc-018

Do not introduce another work-progress abstraction.

Extend the shared work-target mechanism from `npc-018` with additional buildable targets.

Conceptually:

```text
shared work targets
├─ well
├─ terrain preparation
├─ palisade segment
└─ standing torch
```

Each target should expose only the narrow domain operations needed by shared work, such as position, remaining useful work, accepted work contribution and completion state.

The exact API should follow the implementation produced by `npc-018`.

## 3. Simple construction lifecycle

Palisades and standing torches do not need the well's multi-stage construction complexity.

Prefer a simple persistent lifecycle equivalent to:

```text
requiredWork
completedWork
```

with completion derived from progress.

Do not introduce stages where they do not create meaningful gameplay. The well may retain its richer stage model.

## 4. Construction requirements

Define construction work requirements in the domain owning each buildable.

Do not place per-buildable duration constants inside Work Contracts, `NpcAgent` or Player interaction code.

Initial values should keep small objects practical to construct manually.

## 5. Terrain preparation before construction

Construction placement must reuse the existing terrain-preparation system whenever the chosen site does not satisfy the buildable's terrain requirements.

Flow:

```text
choose buildable
    ↓
validate terrain
    ↓
terrain already suitable?
    ├─ yes → create unfinished construction target
    └─ no  → create or require terrain preparation
                ↓
             prepare terrain
                ↓
             revalidate site
                ↓
             create unfinished construction target
```

Do not add a second leveling or flattening mechanism for construction.

Reuse the existing `TerrainPreparationRecord` and terrain-preparation work flow. After `npc-018`, the terrain preparation itself remains a shared-work target, so Player, NPC or both may perform that work.

Construction should only begin after terrain preparation makes the site satisfy the normal placement rules.

### Buildable-specific terrain requirements

Each buildable may define only the terrain constraints it actually needs.

For example, a standing torch may tolerate more variation than a palisade segment.

Do not flatten terrain unnecessarily. Prefer the smallest terrain modification needed to make placement valid.

### No implicit instant terrain modification

Do not silently modify terrain as part of placement.

If terrain work is required, it must exist as explicit world work:

```text
terrain preparation
    ↓
construction
```

If the terrain already satisfies placement requirements, proceed directly without creating redundant preparation work.

## 6. Placement creates unfinished construction

Change placement of supported buildables from effectively creating completed structures to creating persistent unfinished targets.

Reuse existing placement validation, including terrain suitability, collisions, separation, snapping and footprint rules.

Do not create separate placement rules for construction sites.

## 7. Construction materials

Recon and reuse current material-consumption semantics for each buildable.

Materials must have one authoritative ownership rule. Shared Player/NPC work must not consume the same materials twice.

If current placement already consumes all required materials up front, preserving that model is acceptable for this phase when it avoids unnecessary inventory/logistics redesign:

```text
placement
→ consume existing material cost
→ create unfinished target
→ construction requires work
```

Do not introduce NPC material procurement, delivery contracts or staged hauling in this plan.

## 8. Player construction interaction

After placement, Player must be able to perform construction work on the unfinished object.

Reuse existing interaction/capability mechanisms where practical.

Player-specific concerns remain outside the actor-neutral target mutation, including vigor, time progression, XP, controls and UI feedback.

## 9. NPC construction

Supported unfinished buildables should become valid Work Contract targets through the shared-work mechanism from `npc-018`.

Example:

```text
Player places palisade
    ↓
Player builds 30%
    ↓
Hire help
    ↓
NPC contract references same target
    ↓
Player + NPC contribute
```

Do not create NPC-specific palisade or torch construction progress.

## 10. Palisade construction

Extend the existing palisade segment state with the smallest persistent construction progress needed.

Preserve existing placement, snapping, neighbour resolution and persistent identity.

### Unfinished representation

An unfinished palisade should be visually distinguishable from a completed segment using an inexpensive representation derived from authoritative progress.

Do not require multiple bespoke construction GLBs for this phase.

### Palisade connectivity

An unfinished segment owns its planned footprint and orientation.

Prefer allowing it to participate in placement/snapping because the future structure already reserves that position, while systems that depend on a functional completed barrier should treat only completed segments as fully functional.

Keep the distinction:

```text
planned physical footprint
≠
completed functional barrier
```

## 11. Standing torch construction

Extend standing-torch state with minimal persistent construction progress.

Keep construction state independent from `lit / unlit` state.

Flow:

```text
place standing torch
    ↓
unfinished
    ↓
Player/NPC construction work
    ↓
completed + unlit
    ↓
existing ignition interaction
    ↓
lit
```

An unfinished torch must not function as a light source.

## 12. Functional state vs construction state

Systems consuming these objects must distinguish between an object being placed/planned and being functionally completed.

Prefer central derived helpers rather than spreading raw progress comparisons across unrelated systems.

Examples:

- unfinished palisade reserves footprint and is a work target, but should not automatically act as a fully completed defensive barrier,
- unfinished standing torch reserves footprint and is a work target, but cannot be lit and produces no functioning light.

## 13. Collision and navigation

Recon how completed palisades and standing torches currently affect collision, Player movement, NPC navigation and obstacle queries.

Unfinished construction should not automatically gain the full gameplay effect of a completed structure unless physically justified.

Use the smallest consistent rule for this phase. Do not build progress-dependent navigation geometry unless current mechanisms make it inexpensive.

## 14. Rendering construction progress

Provide enough visual feedback to distinguish unfinished and completed structures.

Keep rendering inexpensive and derive it from authoritative construction progress.

Do not persist render-only construction state and avoid per-frame allocations, unnecessary unique materials or continuously updating per-object controllers.

## 15. Interaction feedback

When aiming at an unfinished buildable, expose compact construction status through existing interaction/HUD surfaces where practical.

Do not create a separate construction management UI.

## 16. Work Contract integration

Extend the `npc-018` target resolution instead of adding palisade/torch branches throughout NPC behavior.

Reuse existing shared-work semantics:

- NPC share is calculated from remaining work at contract creation,
- commitment is snapshotted,
- Player remains free to work,
- actual NPC contribution is tracked separately,
- NPC stops when commitment is fulfilled,
- NPC stops when target completes,
- at most one active contract per target.

Do not redefine these semantics here.

## 17. Removal and cancellation

Removing an unfinished buildable must invalidate any active Work Contract referencing it using existing invalidation/release mechanisms where possible.

Do not leave NPCs travelling or working forever toward a missing target.

Material refunds remain outside scope unless current removal semantics already provide a clear reusable rule.

## 18. Persistence

Persist construction progress for palisade segments and standing torches.

After save/load preserve stable object identity, transform, construction progress and functional state.

Existing save records that predate this plan and lack construction progress must restore as already completed structures.

Do not turn existing Player structures into unfinished construction during migration.

## 19. Performance

Construction progress is low-frequency simulation state.

Advance it only through actual work contributions. Do not add per-frame construction simulation or one continuously updating controller per buildable.

The feature must remain cheap with many palisade segments in the world.

## 20. Debuggability

Extend existing diagnostics where practical to expose target id, buildable type, required work, completed work, remaining work, completion and active Work Contract.

Add useful JSDoc for important architectural/public construction seams and prefer appropriate `@domain` tags for preflight discovery.

Do not create a dedicated construction debug UI.

## Non-goals

Do not implement:

- houses,
- settlement buildings,
- roads,
- bridges,
- wells redesign,
- terrain-preparation redesign,
- building damage,
- repairs,
- structure upgrades,
- demolition work,
- multi-stage construction for these simple buildables,
- work crews,
- multiple simultaneous NPC contracts per target,
- NPC material gathering,
- NPC material hauling,
- construction logistics,
- blueprint/building editor,
- new payment semantics,
- bespoke construction-animation asset pipelines.

## Verification

### Terrain preparation

Verify:

1. placing on suitable terrain creates the unfinished buildable directly,
2. unsuitable terrain requires or creates existing terrain preparation rather than silently flattening,
3. Player can perform that preparation,
4. NPC can perform it through shared work after `npc-018`,
5. construction can proceed after terrain preparation and revalidation,
6. no construction-specific duplicate terrain-progress system exists.

### Palisade — Player alone

1. Player places a palisade segment on valid terrain.
2. Segment exists persistently but is unfinished.
3. Existing placement position/yaw/snapping remain correct.
4. Player contributes work.
5. Progress increases.
6. Save/load preserves partial progress.
7. Player completes construction.
8. Segment becomes normally functional.

### Palisade — Player + NPC

1. Player places a palisade.
2. Player partially builds it.
3. Player creates a Work Contract using `npc-018`.
4. NPC accepts and reaches the same segment.
5. Player and NPC contribute to the same construction progress.
6. NPC contribution follows existing commitment semantics.
7. Completion produces one completed palisade, not a replacement or duplicate.

### Standing torch — Player alone

1. Player places a standing torch.
2. It starts unfinished.
3. It cannot be lit while unfinished.
4. Player contributes work.
5. Construction completes.
6. Torch remains unlit.
7. Existing fire-lighting interaction can ignite it.

### Standing torch — NPC construction

1. Player places unfinished torch.
2. Player creates a Work Contract.
3. NPC accepts and travels to the torch.
4. NPC contributes to the same progress.
5. Player may also contribute.
6. Completion makes the normal torch available.
7. NPC construction does not automatically ignite it.

### Existing saves

Load a save containing pre-plan palisades and standing torches and verify they restore as completed structures.

### Removal

Remove an unfinished object with an active Work Contract and verify the contract detects invalidation and the NPC does not remain permanently travelling/working.

### Performance

Verify many completed and unfinished palisade segments do not introduce continuous per-object simulation or avoidable frame-time/GC overhead.

## Completion criteria

The following flow works for both initial buildables:

```text
choose buildable
    ↓
terrain suitable?
    ├─ no → prepare terrain
    └─ yes
          ↓
place persistent unfinished buildable
    ↓
Player works and/or Hire help
    ↓
Player + NPC use same authoritative progress
    ↓
construction complete
    ↓
normal functional world object
```

Supported in this plan:

- palisade segment,
- standing torch,
- existing terrain preparation as required site preparation.

Existing well construction remains intact. `npc-018` shared-work semantics are reused rather than duplicated.

The result establishes a path for future player-buildable objects to become real persistent construction projects that can be completed by Player, NPCs or both.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
