# Plan: Residential House Construction

**Created:** 2026-09-08
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** L
**Depends on:** ~~npc-018~~, ~~items-player-017~~, npc-028
**Domain:** `settlements`
**Subdomains:** `buildings` `development`
**Tags:** `construction` `housing` `work-contracts`
**Roadmap:** -

## Goal

Allow the Player to construct persistent residential houses that become real world/settlement homes after completion.

Initial house types:

- `small_house`,
- `medium_house`.

Both use the same definition-driven building and construction mechanism. They differ in footprint, work/material requirements and housing capacity, not in architecture.

The implementation must extend the existing terrain-preparation, placement, incremental-construction, shared-work, settlement `home`/`Place` and household seams rather than create a Player-only housing system.

## 1. Scope and ownership

A house is a persistent world building whose physical construction state is distinct from its eventual residential use.

Keep these concepts separate:

```text
Residential building = physical structure and construction state
Home Place           = semantic world location
Household            = people/resources associated with a home
```

The residential-building record owns construction progress. Work Contracts own only NPC commitments/assignments. `Place`/settlement systems own semantic home integration. `Household` continues owning family resources and must not be duplicated into the building.

## 2. Residential building definitions

Introduce or extend an appropriate reusable building-definition seam rather than branching construction logic by house kind.

Definitions need data equivalent to:

```ts
type ResidentialBuildingDefinition = {
  kind: 'small_house' | 'medium_house'
  footprint: /* placement footprint */
  housingCapacity: number
  stages: readonly ConstructionStageDefinition[]
}
```

Exact types and ownership should follow the current buildable/placement architecture discovered during implementation; do not create a parallel catalog if an existing definition mechanism can own these fields.

Initial gameplay intent:

- **Small house** — compact footprint, lower material/work cost, capacity around 3 residents.
- **Medium house** — larger footprint, higher material/work cost, capacity around 6 residents.

Capacity and costs should be checked against current generated family sizes, item catalog and construction timings before final constants are chosen.

## 3. Stable persistent identity

Placement creates one stable residential-building record.

```text
placement
→ unfinished residential building
→ construction progresses
→ completed residential building
```

Completion changes the state/function of the same building identity. Do not replace an unfinished construction target with an unrelated completed object.

This identity must be stable enough for persistence, Work Contract target references and later home/household association.

## 4. Construction stages

Both house sizes use the same initial stage model:

```text
foundation
→ structure
→ roof
→ completed
```

Stages exist because they create meaningful work/material boundaries, not merely visual granularity.

Each stage owns data equivalent to:

```text
requiredWork
requiredMaterials
```

The active construction target resolves remaining useful work across the building's stages. Small and medium houses change stage requirements through definitions rather than separate construction code.

Do not add extra stages for one house size unless current assets or gameplay requirements make them materially useful.

## 5. Materials

Reuse existing `ItemKind`/inventory semantics and existing construction material handling where possible.

For houses, prefer stage-gated materials:

```text
required stage materials available/committed
→ stage may accept work
→ stage completes
→ next stage requirements become active
```

Do not consume materials proportionally on every work tick; that would unnecessarily couple material accounting to multiple simultaneous workers.

Exact materials must come from the current item catalog. Do not invent a second construction-resource vocabulary.

NPC material procurement, hauling and autonomous resupply are out of scope. Construction may wait for Player-supplied materials.

## 6. Terrain preparation

Reuse the existing `TerrainPreparationRecord` and shared construction flow.

```text
choose house
→ placement validation
→ terrain suitable?
   ├─ yes → place unfinished building
   └─ no  → create/use terrain-preparation target
            → Player/NPC work
            → revalidate
            → place unfinished building
```

A medium house naturally evaluates a larger footprint than a small house.

Do not silently flatten terrain or create house-specific terrain-preparation state.

## 7. Placement

Extend the existing placement-preview/validation pipeline used by current buildables.

House placement must support the existing relevant mechanisms for:

- footprint/coverage validation,
- rotation,
- terrain suitability,
- collision/separation,
- settlement/plot constraints where applicable.

The footprint becomes occupied/reserved when the unfinished persistent building is placed, not only after completion.

Do not introduce a separate house-placement mode if the current generalized placement pipeline can represent the required footprint.

## 8. Shared Player/NPC construction

Residential buildings become another target behind the existing actor-neutral `contributeWork(id, amount)` principle.

The building is the sole owner of actual progress. Player and NPC work must be credited through the same target contribution seam and clamped to useful remaining work.

Conceptually:

```text
Player ─────┐
NPC A ──────┤
NPC B ──────┼→ same ResidentialBuildingRecord
NPC C ──────┘
```

`npc-028` is expected to generalize Work Contracts from one worker to 1+ workers. This plan should consume that generic capability rather than implementing house-specific crews.

If `npc-028` is not implemented when this plan begins, treat multi-worker contracts as a real dependency; do not duplicate the capability locally.

## 9. Work Contract target integration

Extend the current Work Contract target-resolution mechanism with a residential-building target variant or the most appropriate generalized construction variant available after dependencies land.

Target-specific code is responsible for:

- resolving the building by stable id,
- resolving its world position,
- reporting remaining useful work,
- accepting/clamping useful work,
- reporting completion/blocking.

`NpcAgent` must not contain house-stage or material constants.

## 10. Blocked construction

A stage without its required materials accepts no construction work.

NPCs must not generate fake progress while a target is material-blocked.

Reuse the existing Work Contract interruption/resumption semantics where possible. Define a bounded behaviour for workers at a long-term blocked target so they do not remain indefinitely in a working loop while consuming simulation effort.

Do not solve material shortage by adding NPC procurement in this plan.

## 11. Construction visuals

Visual state derives from authoritative construction state.

Prefer a small number of cheap representations matching the meaningful stages:

```text
foundation
structure
roof
completed
```

Exact asset strategy depends on available house/construction assets and should be verified during implementation recon.

Do not require continuous mesh morphing, per-work-unit geometry changes or per-frame construction simulation.

## 12. Completion and home semantics

An unfinished building:

- reserves its physical footprint,
- is a construction target,
- is not valid residential capacity,
- is not an occupied household home.

A completed building:

- is physically functional as residential housing,
- exposes its configured housing capacity,
- integrates with the existing semantic `PlaceType = 'home'` model,
- may remain empty.

Completion must therefore establish or expose a stable `home` Place linkage without creating a parallel `PlayerHouseHome` concept.

## 13. Empty houses are valid

A completed residential building does **not** automatically create a Household or generate residents.

This is deliberate. The architecture should support:

```text
completed empty house
→ available housing
→ later household assignment / settlement population growth
```

Actual migration, household relocation/creation and autonomous population growth belong to a follow-up plan.

This keeps the first residential-construction plan focused while providing the correct systemic seam for settlement development.

## 14. Household compatibility

Existing `Household.homeId` and `Place(home)` semantics remain authoritative.

This plan must make completed runtime-built homes addressable through those existing concepts, but it should not redesign family generation or automatically move existing households.

Avoid introducing a second `householdId`/`homeId` mapping owned by the residential-building subsystem.

A future occupancy plan should be able to associate a household with a completed house through stable ids rather than array/index alignment.

## 15. Generated settlement houses

Do not convert procedurally generated villages into construction projects.

Existing generated houses continue to appear completed.

Where practical, generated residential buildings and newly built residential buildings should converge on compatible semantic `home`/residential concepts after completion, but this plan must not force a broad village-generation rewrite solely to achieve representation purity.

## 16. Settlement association

A newly built house may be associated with an existing settlement when current settlement/world ownership rules can determine that relationship reliably.

Do not use Player or camera proximity as authoritative ownership.

A house outside a suitable settlement may remain an independent residential world building. Building one house must not implicitly create a new settlement.

Settlement-driven decisions to create new houses are a follow-up feature.

## 17. Construction initiator is not residential owner

Keep these concepts distinct:

```text
Player built the house
≠ Player permanently owns the house
≠ Player occupies the house
```

The construction system records what is necessary for construction and world identity. Residential ownership/occupancy should use existing/future settlement and household mechanisms rather than being inferred forever from the construction initiator.

This allows the same mechanism to support later:

- Player housing,
- NPC household housing,
- settlement expansion,
- quest/colony construction.

## 18. Persistence and rebuild continuity

Persist enough authoritative state to reconstruct every runtime-built house, including data equivalent to:

- stable id,
- house kind,
- position and rotation,
- settlement association when present,
- construction stage/progress,
- construction material state when needed,
- completed state,
- stable home/place linkage when completed.

Follow the existing domain-owned serialization and `WorldBundle` rebuild patterns. Do not make `SaveData` the runtime authority.

Old saves without residential-building records must continue to load normally.

## 19. Removal and invalidation

Removing/cancelling an unfinished building must invalidate or otherwise safely terminate Work Contracts targeting it through the existing contract-target invalidation path.

Do not implement full demolition semantics for completed occupied houses in this plan. If necessary, completed houses may simply be non-removable until displacement/demolition has an explicit systemic design.

## 20. Performance

Construction state is interaction/event driven, not a per-frame simulation system.

Completed houses should have runtime/rendering cost comparable to existing settlement buildings. Do not add one update loop per building.

Multi-worker contribution must remain actor-neutral and bounded by the existing construction target rather than requiring a construction coordinator/manager.

## 21. Implementation guidance

Before implementation, create/update implementation notes according to `docs/plans/PLANNING.md` and verify the exact current files/symbols because dependencies may have changed the construction APIs.

In particular inspect the current implementations of:

- player buildable placement/preview and footprint validation,
- `TerrainPreparationRecord`,
- well/palisade/standing-torch incremental construction and `contributeWork`,
- Work Contract target union/resolvers and multi-worker representation from `npc-028`,
- `VillagePlan` / `VillageBuildingPlan` / residential plots,
- `Place` and home-place creation/resolution,
- `Household.homeId`,
- persistence/rebuild ownership for player-built world objects.

Add JSDoc to important new architectural/public functions and types where it improves AI preflight discovery; use `@domain settlements` on the residential-building ownership boundary.

## Verification

Browser verification is performed manually by the User, not by the implementation agent.

Verify at minimum:

### Small house

```text
place
→ terrain preparation if required
→ foundation
→ structure
→ roof
→ complete
```

Confirm persistence between construction stages.

### Medium house

Confirm the larger footprint and higher work/material requirements while using the same construction pipeline.

### Shared construction

```text
Player starts house
→ creates/posts Work Contract for 3 NPCs
→ NPCs accept independently
→ Player + NPCs contribute
→ one authoritative building progress advances
```

No duplicate progress or duplicate buildings may appear.

### Material blocking

Confirm a stage cannot accept useful work without its required materials and resumes correctly when supplied.

### Home integration

After completion, confirm the building exposes/resolves a stable existing-style `home` Place and housing capacity without automatically creating a Household.

### Empty house

Confirm a completed unoccupied house remains valid and persisted.

### Save/load and rebuild

Verify partial construction, completed empty houses and Work Contract target references restore deterministically without duplicating progress or identity.

## Non-goals

Do not implement in this plan:

- automatic household creation or relocation,
- migration/population growth,
- autonomous settlement decisions to build houses,
- Player home/bed/interior gameplay,
- interiors or entering buildings,
- furniture placement,
- building upgrades,
- building damage/repair,
- completed-house demolition/displacement,
- rent or real-estate economy,
- overcrowding penalties,
- NPC construction-material procurement/hauling,
- permanent construction crews or foremen,
- procedural building editor,
- multiple cosmetic architectural variants per size.

## Follow-up direction

The intended systemic continuation is:

```text
housing shortage / settlement pressure
→ settlement chooses residential expansion
→ residential construction project
→ NPC and/or Player labour
→ completed empty housing
→ household assignment / migration
→ persistent settlement growth
```

This plan should leave that path open without implementing it prematurely.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
