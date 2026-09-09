# Plan: Residential House Construction

**Created:** 2026-09-08
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** high · **Effort:** L
**Depends on:** ~~npc-018~~, ~~items-player-017~~
**Domain:** `settlements`
**Subdomains:** `buildings` `development`
**Tags:** `construction` `housing` `work-contracts` `lodging` `ownership`
**Roadmap:** -

## Goal

Allow the Player to construct persistent residential houses that become real world/settlement homes after completion and provide high-quality lodging/rest.

Initial house types:

- `small_house` — housing capacity **3**,
- `medium_house` — housing capacity **6**.

Both use the same definition-driven building and construction mechanism. They differ in footprint, work/material requirements and housing capacity, not in architecture.

The implementation must extend the existing terrain-preparation, placement, incremental-construction, shared-work, settlement `home`/`Place`, household and lodging/rest seams rather than create Player-only parallel systems.

## 1. Scope and ownership

A house is a persistent world building whose physical construction state is distinct from its eventual residential use.

Keep these concepts separate:

```text
Residential building = physical structure and construction state
Residential owner    = who owns the building
Home Place           = semantic world location
Household            = people/resources associated with a home
Lodging option       = derived capability to sleep/rest at an accessible completed home
```

The residential-building record owns construction progress and the building's stable ownership reference. Work Contracts own only NPC commitments/assignments. `Place`/settlement systems own semantic home integration. `Household` continues owning family resources and must not be duplicated into the building.

Ownership and occupancy are deliberately separate:

```text
owner     ≠ occupants
owner     ≠ Household.homeId
builder   ≠ worker who contributed construction labour
```

For this plan's v1 gameplay, a house construction project initiated by the Player creates a Player-owned residential building. NPCs contributing work do not gain ownership.

The ownership representation should remain extensible to future owner kinds such as:

```text
Player | Household | Settlement | unowned
```

but this plan does not implement NPC/Household construction initiation, settlement-initiated construction, ownership transfer, sale or rental.

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

Initial gameplay constants:

- **Small house** — compact footprint, lower material/work cost, housing capacity **3**.
- **Medium house** — larger footprint, higher material/work cost, housing capacity **6**.
- **Completed Player-owned residential house (v1)** — directly provides high-quality lodging/rest through the existing lodging system.
- **Bed-aware lodging (v2)** — later replaces the v1 completion shortcut so a usable bed becomes the physical requirement for house sleep.

Exact work/material costs should be checked against the current item catalog and construction timings before final constants are chosen. Housing capacity is already decided at 3/6 and should not be re-derived from generated family sizes during implementation.

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

This identity must be stable enough for persistence, Work Contract target references and later home/household/lodging/ownership association.

## 4. Construction stages

Both house sizes use the same stage model:

```text
foundation
→ structure
→ roof
→ completed
```

`completed` is the terminal state, not another work-bearing construction stage.

Stages exist because they create meaningful work/material boundaries, not merely visual granularity.

Each work-bearing stage owns data equivalent to:

```text
requiredWork
requiredMaterials
```

The active construction target resolves remaining useful work across the building's stages. Small and medium houses change stage requirements through definitions rather than separate construction code.

Do not add extra stages for one house size unless current assets or gameplay requirements make them materially useful.

## 5. Materials

Reuse **only existing `ItemKind` values** and existing inventory/construction material semantics. Do not introduce planks, thatch or any other new construction-only material vocabulary in this plan.

Materials are supplied and consumed per stage before useful construction work on that stage can begin:

```text
Player supplies required stage materials
→ materials are committed/consumed for that stage
→ stage becomes work-enabled
→ Player/NPC workers contribute work
→ stage completes
→ next stage activates and waits for its materials
```

Do not consume materials proportionally on every `contributeWork()` tick. Material accounting must remain independent from the number of simultaneous workers.

Exact material combinations and quantities must come from the current item catalog and gameplay balancing. Do not invent a second construction-resource vocabulary.

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

The Player may build alone, NPCs may contribute without the Player actively working, and Player + multiple NPCs may contribute concurrently to the same authoritative progress.

Do not introduce a house-specific hard worker-count limit at the construction-state level. Practical concurrency may be constrained by Work Contract capacity, approach/work positions or other existing generic mechanisms.

NPCs contributing construction work never acquire ownership merely because they worked on the building.

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

Visual state derives from authoritative construction state and changes only at meaningful stage transitions:

```text
foundation → visible foundation state
structure  → foundation + structure/walls state
roof       → near-complete roof state
completed  → final completed-house representation
```

Exact asset strategy depends on available house/construction assets and should be verified during implementation recon. Prefer stage variants or composable parts that map cleanly to the authoritative stage state.

Do not require continuous mesh morphing, percentage-based geometry growth, per-work-unit geometry changes or per-frame construction simulation.

## 12. Completion and home semantics

An unfinished building:

- reserves its physical footprint,
- is a construction target,
- retains its stable ownership reference,
- is not valid residential capacity,
- is not an occupied household home,
- is not valid lodging.

A completed building in v1:

- is physically functional as residential housing,
- exposes its configured housing capacity (3 or 6),
- integrates with the existing semantic `PlaceType = 'home'` model,
- may remain empty,
- retains Player ownership for Player-initiated construction,
- provides high-quality lodging/rest to its Player owner.

Completion must therefore establish or expose a stable `home` Place linkage without creating a parallel `PlayerHouseHome` concept.

A completed house does not automatically create, relocate or assign a Household.

## 13. Player lodging and high-quality rest

### v1 — completed owned house is sufficient

For this plan's initial version, a completed **Player-owned** residential house is itself a valid Player sleep/rest location. **A physical bed is not required in v1. Furniture and beds arrive in v2.**

Reuse the existing lodging contract from `src/settlement/lodging.ts` and the existing sleep/time-skip path. In particular, the current system already defines:

```text
LodgingQuality = 'high' | 'normal' | 'low'
high → full sleep restoration through lodgingRestQuality()
```

Residential houses should therefore expose or derive an existing-style lodging option with `quality: 'high'` rather than introducing house-specific comfort percentages or directly mutating `PlayerNeeds`.

Intended v1 flow:

```text
Player-owned completed house
→ ownership grants Player access
→ valid home/lodging source
→ Player selects/interacts with sleep action
→ existing lodging/rest action
→ existing Sleep/time skip
→ high-quality needs restoration
```

The house does not need an enterable interior or physical bed for this initial capability. Sleeping may resolve through an entrance/approach anchor compatible with the existing lodging movement/action flow. Do not add a second movement system or teleport-only house sleep path.

When a Player-owned built house belongs to a settlement, it should be eligible for the existing settlement lodging discovery/selection mechanism where appropriate. A Player-owned completed house outside a settlement must still offer direct Player rest through the same underlying lodging/rest semantics rather than requiring an artificial settlement association.

Do not make all residential buildings permissive Player lodging merely because they are completed. In v1, the Player's access to a runtime-built house for this direct lodging capability derives from Player ownership.

### v2 — physical bed/furniture becomes the capability

A follow-up furniture version will introduce the real bed requirement. At that point:

```text
accessible completed house + usable bed
→ high-quality lodging
accessible completed house without bed
→ no house sleep
```

Design v1 so this can be changed by replacing the lodging eligibility/provider rule, not by rewriting sleep restoration, ownership or `ResidentialBuildingRecord` construction semantics. Do not persist a fake `hasBed` flag in v1 solely to anticipate the follow-up.

## 14. Empty houses are valid

A completed residential building does **not** automatically create a Household or generate residents.

This is deliberate. The v1 architecture supports:

```text
completed Player-owned empty house
→ available housing + high-quality Player lodging
→ later household assignment / settlement population growth
```

Actual migration, household relocation/creation and autonomous population growth belong to a follow-up plan.

An empty house remains owned. Empty/unoccupied does not mean `unowned`.

This keeps the first residential-construction plan focused while providing the correct systemic seam for settlement development.

## 15. Household compatibility and occupancy

Existing `Household.homeId` and `Place(home)` semantics remain authoritative for where a Household lives.

Ownership does not replace or duplicate occupancy:

```text
ResidentialBuilding.owner = who owns the structure
Household.homeId          = where that household lives
```

A future Household may therefore live in a Player-, Household- or Settlement-owned home without requiring these concepts to collapse into one field.

This plan must make completed runtime-built homes addressable through existing `Place(home)` concepts, but it should not redesign family generation or automatically move existing households.

Avoid introducing a second household-occupancy mapping owned by the residential-building subsystem.

A future occupancy plan should be able to associate a household with a completed house through stable ids rather than array/index alignment.

## 16. Generated settlement houses

Do not convert procedurally generated villages into construction projects.

Existing generated houses continue to appear completed.

Where practical, generated residential buildings and newly built residential buildings should converge on compatible semantic `home`, ownership/access and lodging concepts after completion, but this plan must not force a broad village-generation rewrite solely to achieve representation purity.

Do not require retrofitting generated houses with Player ownership. Their ownership policy may remain unchanged/implicit until a broader residential ownership plan needs it.

## 17. Settlement association

A newly built house may be associated with an existing settlement when current settlement/world association rules can determine that relationship reliably.

Do not use Player or camera proximity as authoritative settlement association.

Settlement association and residential ownership are independent:

```text
Player-owned house inside settlement
→ settlement association: settlement
→ owner: Player
```

A house outside a suitable settlement may remain an independent residential world building. Building one house must not implicitly create a new settlement.

Settlement-driven decisions to create new houses are a follow-up feature.

## 18. Residential ownership

For v1, construction initiation determines ownership because the only supported residential construction initiator is the Player:

```text
Player starts residential construction
→ ResidentialBuilding owner = Player
```

This ownership is established on the persistent building record when the unfinished building is placed and survives every construction stage, completion and save/load.

Construction labour does not determine ownership:

```text
Player starts house + NPCs do some/all work
→ owner remains Player
```

Keep ownership separate from occupancy:

```text
Player owns the house
≠ Player permanently occupies the house
≠ a Household cannot later live there
```

The representation should leave room for future owners:

```text
Player
Household
Settlement
unowned
```

but this plan does not need gameplay for creating those other ownership states. In particular, there is not yet a "build for NPC/Household" flow.

Do not implement ownership shares, worker ownership, automatic settlement appropriation, sale, transfer, inheritance, rent or real-estate economy in this plan.

## 19. Persistence and rebuild continuity

Persist enough authoritative state to reconstruct every runtime-built house, including data equivalent to:

- stable id,
- house kind,
- position and rotation,
- residential owner reference/type,
- settlement association when present,
- construction stage/progress,
- construction material state when needed,
- completed state,
- stable home/place linkage when completed.

Do not persist a redundant `LodgingOption`; derive v1 lodging from authoritative completed-house + ownership/home state. In v2 the same derivation should additionally depend on a real bed capability.

Follow the existing domain-owned serialization and `WorldBundle` rebuild patterns. Do not make `SaveData` the runtime authority.

Old saves without residential-building records must continue to load normally.

## 20. Removal and invalidation

Removing/cancelling an unfinished building must invalidate or otherwise safely terminate Work Contracts targeting it through the existing contract-target invalidation path.

Do not implement full demolition semantics for completed houses in this plan. If necessary, completed houses may simply be non-removable until displacement/demolition and ownership consequences have an explicit systemic design.

## 21. Performance

Construction state is interaction/event driven, not a per-frame simulation system.

Completed houses should have runtime/rendering cost comparable to existing settlement buildings. Do not add one update loop per building.

Lodging availability should be derived/query-driven like the existing lodging system, not maintained by a per-house simulation tick.

Ownership is stable persistent state and must not require a per-frame ownership/access update.

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
- existing player/world ownership or authored-object identity seams that can represent Player ownership without a house-only ownership system,
- existing house/bed/approach anchors as references for the later v2 bed/furniture capability,
- persistence/rebuild ownership for player-built world objects.

For v1, do **not** block lodging on the existence of a bed asset/anchor. Use a stable house entrance/approach point and the existing lodging/rest machinery. Keep the provider boundary narrow so v2 can swap eligibility to a physical bed.

Do not invent a general ownership framework if current code has a smaller reusable ownership/authoring seam sufficient for v1. The required semantic contract is Player ownership now with an extensible representation for future `Household | Settlement | unowned` ownership.

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

Confirm housing capacity is exactly 3 and persistence works between construction stages.

### Medium house

Confirm housing capacity is exactly 6, with the larger footprint and higher work/material requirements while using the same construction pipeline.

### Stage materials

Confirm each work-bearing stage requires its own existing-`ItemKind` materials before accepting useful work, and that materials are committed/consumed at the stage boundary rather than proportionally on every work tick.

### Shared construction

```text
Player starts house
→ creates/posts Work Contract for 3 NPCs
→ NPCs accept independently
→ Player + NPCs contribute
→ one authoritative building progress advances
```

No duplicate progress or duplicate buildings may appear. NPC contribution must not change ownership.

### Material blocking

Confirm a stage cannot accept useful work without its required materials and resumes correctly when supplied.

### Construction visuals

Confirm visuals advance at the authoritative stage transitions (`foundation`, `structure`, `roof`, `completed`) without per-work-unit geometry updates.

### Home integration

After completion, confirm the building exposes/resolves a stable existing-style `home` Place and housing capacity without automatically creating a Household.

### Ownership

Confirm a Player-initiated house is Player-owned from placement onward and remains Player-owned through:

- NPC-assisted construction,
- stage transitions,
- completion,
- save/load and rebuild.

Confirm settlement association does not replace Player ownership and that empty/unoccupied does not mean unowned.

### High-quality Player rest — v1

Confirm an unfinished house cannot be used for lodging.

After completion, **without requiring a bed**:

```text
Player-owned completed house
→ Player chooses/interacts with house lodging
→ existing lodging/rest flow runs
→ time advances through existing Sleep path
→ `quality: 'high'` restoration is applied
```

Confirm this does not bypass existing Player sleep/rest rules or duplicate `PlayerNeeds` restoration logic.

Confirm a completed Player-owned house outside a settlement can still provide direct rest without creating a fake settlement.

### Empty house

Confirm a completed unoccupied Player-owned house remains valid, persisted and usable for Player rest without automatically creating a Household.

### Save/load and rebuild

Verify partial construction, ownership, completed empty houses and Work Contract target references restore deterministically without duplicating progress or identity. Confirm v1 lodging remains available after reload/rebuild because it is derived from restored completed-house + ownership state rather than separately persisted.

## Non-goals

Do not implement in this plan:

- automatic household creation or relocation,
- migration/population growth,
- autonomous settlement decisions to build houses,
- NPC/Household-targeted "build for them" construction flow,
- settlement-initiated residential construction,
- ownership transfer or sale,
- inheritance,
- rent or real-estate economy,
- ownership shares,
- enterable house interiors,
- physical-bed requirement for house sleep (v2),
- manual bed/furniture placement,
- broader furniture gameplay,
- house-specific storage/inventory,
- building upgrades,
- building damage/repair,
- completed-house demolition/displacement,
- detailed access/permission policies beyond Player access to Player-owned completed houses,
- overcrowding penalties,
- NPC construction-material procurement/hauling,
- permanent construction crews or foremen,
- procedural building editor,
- multiple cosmetic architectural variants per size.

## Follow-up direction

The intended systemic continuation includes independent extensions:

```text
v1 Player-owned completed-house lodging
→ v2 physical bed/furniture capability
→ house sleep requires usable bed + access
```

```text
Player-owned / Household-owned / Settlement-owned / unowned
→ ownership transfer / permissions / inheritance / economy where needed
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

This plan should leave these paths open without implementing them prematurely.

> **Zrób git commit i push do main, rebase jeżeli trzeba**