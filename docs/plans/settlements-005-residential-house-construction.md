# Plan: Residential House Construction

**Created:** 2026-09-08
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** L
**Depends on:** ~~npc-018~~, ~~items-player-017~~, npc-028
**Domain:** `settlements`
**Subdomains:** `buildings` `development`
**Tags:** `construction` `housing` `work-contracts` `lodging`
**Roadmap:** -

## Goal

Allow the Player to construct persistent residential houses that become real world/settlement homes after completion and provide high-quality lodging/rest.

Initial house types:

- `small_house`,
- `medium_house`.

Both use the same definition-driven building and construction mechanism. They differ in footprint, work/material requirements and housing capacity, not in architecture.

The implementation must extend the existing terrain-preparation, placement, incremental-construction, shared-work, settlement `home`/`Place`, household and lodging/rest seams rather than create Player-only parallel systems.

## 1. Scope and ownership

A house is a persistent world building whose physical construction state is distinct from its eventual residential use.

Keep these concepts separate:

```text
Residential building = physical structure and construction state
Home Place           = semantic world location
Household            = people/resources associated with a home
Lodging option       = derived capability to sleep/rest at a completed home
```

The residential-building record owns construction progress. Work Contracts own only NPC commitments/assignments. `Place`/settlement systems own semantic home integration. `Household` continues owning family resources and must not be duplicated into the building.

Player sleep/rest must reuse the existing lodging and `PlayerNeeds` mechanisms; the residential-building subsystem must not own a second rest-quality or needs-restoration model.

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
- **Completed residential house (v1)** — directly provides high-quality lodging/rest through the existing lodging system.
- **Bed-aware lodging (v2)** — later replaces the v1 completion shortcut so a usable bed becomes the physical requirement for house sleep.

Capacity and costs should be checked against current generated family sizes, item catalog and construction timings before final constants are chosen.

Do not encode separate numerical sleep restoration on house definitions if the existing `LodgingQuality = 'high'` contract already represents the desired comfort.

## 3. Stable persistent identity

Placement creates one stable residential-building record.

```text
placement
→ unfinished residential building
→ construction progresses
→ completed residential building
```

Completion changes the state/function of the same building identity. Do not replace an unfinished construction target with an unrelated completed object.

This identity must be stable enough for persistence, Work Contract target references and later home/household/lodging association.

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
- is not an occupied household home,
- is not valid lodging.

A completed building in v1:

- is physically functional as residential housing,
- exposes its configured housing capacity,
- integrates with the existing semantic `PlaceType = 'home'` model,
- directly provides high-quality Player lodging/rest,
- may remain empty.

Completion must therefore establish or expose a stable `home` Place linkage without creating a parallel `PlayerHouseHome` concept.

## 13. Player lodging and high-quality rest

### v1 — completed house is sufficient

For this plan's initial version, a completed residential house is itself a valid Player sleep/rest location. **A physical bed is not required in v1.**

Reuse the existing lodging contract from `src/settlement/lodging.ts` and the existing sleep/time-skip path. In particular, the current system already defines:

```text
LodgingQuality = 'high' | 'normal' | 'low'
high → full sleep restoration through lodgingRestQuality()
```

Residential houses should therefore expose or derive an existing-style lodging option with `quality: 'high'` rather than introducing house-specific comfort percentages or directly mutating `PlayerNeeds`.

Intended v1 flow:

```text
completed house
→ valid home/lodging source
→ Player selects/interacts with sleep action
→ existing lodging/rest action
→ existing Sleep/time skip
→ high-quality needs restoration
```

The house does not need an enterable interior or physical bed for this initial capability. Sleeping may resolve through an entrance/approach anchor compatible with the existing lodging movement/action flow. Do not add a second movement system or teleport-only house sleep path.

When a built house belongs to a settlement, it should be eligible for the existing settlement lodging discovery/selection mechanism where appropriate. A completed house outside a settlement must still be able to offer direct Player rest through the same underlying lodging/rest semantics rather than requiring an artificial settlement association.

Do not equate the ability to sleep in a house with Household occupancy or permanent Player ownership. Access policy may initially be permissive for Player-constructed completed houses; future ownership/permission rules may refine who may use a given home.

### v2 — physical bed becomes the capability

A follow-up version will introduce the real bed requirement. At that point:

```text
completed house + usable bed
→ high-quality lodging
completed house without bed
→ no house sleep
```

Design v1 so this can be changed by replacing the lodging eligibility/provider rule, not by rewriting sleep restoration or `ResidentialBuildingRecord` construction semantics. Do not persist a fake `hasBed` flag in v1 solely to anticipate the follow-up.

## 14. Empty houses are valid

A completed residential building does **not** automatically create a Household or generate residents.

This is deliberate. The v1 architecture supports:

```text
completed empty house
→ available housing + high-quality Player lodging
→ later household assignment / settlement population growth
```

Actual migration, household relocation/creation and autonomous population growth belong to a follow-up plan.

This keeps the first residential-construction plan focused while providing the correct systemic seam for settlement development.

## 15. Household compatibility

Existing `Household.homeId` and `Place(home)` semantics remain authoritative.

This plan must make completed runtime-built homes addressable through those existing concepts, but it should not redesign family generation or automatically move existing households.

Avoid introducing a second `householdId`/`homeId` mapping owned by the residential-building subsystem.

A future occupancy plan should be able to associate a household with a completed house through stable ids rather than array/index alignment.

## 16. Generated settlement houses

Do not convert procedurally generated villages into construction projects.

Existing generated houses continue to appear completed.

Where practical, generated residential buildings and newly built residential buildings should converge on compatible semantic `home` and lodging concepts after completion, but this plan must not force a broad village-generation rewrite solely to achieve representation purity.

## 17. Settlement association

A newly built house may be associated with an existing settlement when current settlement/world ownership rules can determine that relationship reliably.

Do not use Player or camera proximity as authoritative ownership.

A house outside a suitable settlement may remain an independent residential world building. Building one house must not implicitly create a new settlement.

Settlement-driven decisions to create new houses are a follow-up feature.

## 18. Construction initiator is not residential owner

Keep these concepts distinct:

```text
Player built the house
≠ Player permanently owns the house
≠ Player occupies the house
```

The construction system records what is necessary for construction and world identity. Residential ownership/occupancy should use existing/future settlement and household mechanisms rather than being inferred forever from the construction initiator.

The Player being allowed to rest in a completed Player-constructed house does not change this ownership boundary.

This allows the same mechanism to support later:

- Player housing,
- NPC household housing,
- settlement expansion,
- quest/colony construction.

## 19. Persistence and rebuild continuity

Persist enough authoritative state to reconstruct every runtime-built house, including data equivalent to:

- stable id,
- house kind,
- position and rotation,
- settlement association when present,
- construction stage/progress,
- construction material state when needed,
- completed state,
- stable home/place linkage when completed.

Do not persist a redundant `LodgingOption`; derive v1 lodging from authoritative completed-house/home state. In v2 the same derivation should instead depend on a real bed capability.

Follow the existing domain-owned serialization and `WorldBundle` rebuild patterns. Do not make `SaveData` the runtime authority.

Old saves without residential-building records must continue to load normally.

## 20. Removal and invalidation

Removing/cancelling an unfinished building must invalidate or otherwise safely terminate Work Contracts targeting it through the existing contract-target invalidation path.

Do not implement full demolition semantics for completed occupied houses in this plan. If necessary, completed houses may simply be non-removable until displacement/demolition has an explicit systemic design.

## 21. Performance

Construction state is interaction/event driven, not a per-frame simulation system.

Completed houses should have runtime/rendering cost comparable to existing settlement buildings. Do not add one update loop per building.

Lodging availability should be derived/query-driven like the existing lodging system, not maintained by a per-house simulation tick.

Multi-worker contribution must remain actor-neutral and bounded by the existing construction target rather than requiring a construction coordinator/manager.

## 22. Implementation guidance

Before implementation, create/update implementation notes according to `docs/plans/PLANNING.md` and verify the exact current files/symbols because dependencies may have changed the construction APIs.

In particular inspect the current implementations of:

- player buildable placement/preview and footprint validation,
- `TerrainPreparationRecord`,
- well/palisade/standing-torch incremental construction and `contributeWork`,
- Work Contract target union/resolvers and multi-worker representation from `npc-028`,
- `VillagePlan` / `VillageBuildingPlan` / residential plots,
- `Place` and home-place creation/resolution,
- `Household.homeId`,
- `src/settlement/lodging.ts` and `lodgingResolver.ts`,
- `src/app/actions/restActions.ts`,
- existing house/bed/approach anchors as references for the later v2 bed capability,
- persistence/rebuild ownership for player-built world objects.

For v1, do **not** block lodging on the existence of a bed asset/anchor. Use a stable house entrance/approach point and the existing lodging/rest machinery. Keep the provider boundary narrow so v2 can swap eligibility to a physical bed.

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

### High-quality Player rest — v1

Confirm an unfinished house cannot be used for lodging.

After completion, **without requiring a bed**:

```text
Player chooses/interacts with house lodging
→ existing lodging/rest flow runs
→ time advances through existing Sleep path
→ `quality: 'high'` restoration is applied
```

Confirm this does not bypass existing Player sleep/rest rules or duplicate `PlayerNeeds` restoration logic.

Confirm a completed Player-built house outside a settlement can still provide direct rest without creating a fake settlement.

### Empty house

Confirm a completed unoccupied house remains valid, persisted and usable for Player rest without automatically creating a Household.

### Save/load and rebuild

Verify partial construction, completed empty houses and Work Contract target references restore deterministically without duplicating progress or identity. Confirm v1 lodging remains available after reload/rebuild because it is derived from restored completed-house state rather than separately persisted.

## Non-goals

Do not implement in this plan:

- automatic household creation or relocation,
- migration/population growth,
- autonomous settlement decisions to build houses,
- enterable house interiors,
- physical-bed requirement for house sleep (v2),
- manual bed/furniture placement,
- broader furniture gameplay,
- building upgrades,
- building damage/repair,
- completed-house demolition/displacement,
- rent or real-estate economy,
- detailed residential access/ownership permissions beyond what is required for Player-constructed-house lodging,
- overcrowding penalties,
- NPC construction-material procurement/hauling,
- permanent construction crews or foremen,
- procedural building editor,
- multiple cosmetic architectural variants per size.

## Follow-up direction

The intended systemic continuation includes two independent extensions:

```text
v1 completed-house lodging
→ v2 physical bed/furniture capability
→ house sleep requires usable bed
```

and:

```text
housing shortage / settlement pressure
→ settlement chooses residential expansion
→ residential construction project
→ NPC and/or Player labour
→ completed empty housing
→ household assignment / migration
→ persistent settlement growth
```

This plan should leave both paths open without implementing them prematurely.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
