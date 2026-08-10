# Review: Village Generation Overhaul Implementation Notes

## Purpose

Architectural review of `2026-08-09--047--village-generation-overhaul-implementation-notes.md` against the current repository state.

These are review corrections to apply before implementation. They intentionally do not modify the original implementation notes.

## CRITICAL

### 1. `VillagePlan` must have one owner

`VillagePlan` should become the single source of truth for the generated plan of one settlement. Avoid introducing another parallel layout/cache path.

Current code already has settlement generation/caching responsibilities spread across `SettlementsManager`, `roadNetwork`, and other settlement helpers. The migration should consolidate local village planning behind one planner/plan object rather than merely introducing another data type alongside `SettlementDef`.

### 2. Roads between settlements are NOT part of `VillagePlan`

Keep the boundary explicit:

```text
VillageGenerator
  -> local village plan
     - buildings
     - plots/zones
     - landmarks
     - internal paths
     - entrances

RoadNetwork / SettlementNetwork
  -> global connections between villages
     - chooses village-to-village connections
     - routes roads through the world
     - produces terrain road segments
```

`VillagePlan.paths` means paths inside the settlement only. Do not put roads connecting different settlements into `VillagePlan`.

### 3. Village-to-village roads should connect entrances, not village centers

A village plan should expose one or more logical entrances/exits. `RoadNetwork` connects an entrance of one village to an entrance of another village.

The entrance is a semantic point, not necessarily a physical gate object.

Suggested shape:

```ts
type VillageEntrance = {
  x: number
  z: number
  angle: number
  visual: 'gate' | 'sign' | 'none'
}
```

The exact type can differ, but preserve the separation between the logical entrance and its visual representation.

### 4. Do not duplicate `SettlementLandmarks`, `Place`, livestock, or minor-location systems

The current code already has runtime abstractions for settlement landmarks, places/workplaces, livestock, and minor locations. `VillagePlan` should become their planning/source-data layer rather than introducing parallel runtime mechanisms.

The implementation must define how existing `SettlementLandmarks`, `Place`, `minorLocations`, and livestock data migrate to/consume the new plan.

## IMPORTANT

### 5. `VillagePlan` should include local entrances and internal paths

Internal paths should connect meaningful local locations: homes, workplaces, shared infrastructure, gardens, stockpiles, docks, etc.

Entrances should be generated as part of the local village plan because the village layout knows where a road should naturally enter/leave the settlement.

### 6. Entrance visuals depend on settlement scale

A larger settlement may receive a proper gate structure. A small village/outpost may use a sign or have no explicit structure at all.

This is presentation/runtime detail derived from the semantic entrance. `RoadNetwork` must not care whether an entrance is represented by a gate, sign, or nothing.

Example:

```text
small/outpost: road -> [sign] -> village
medium:        road -> [gate] -> village
large:         road -> [GATE] -> village
```

### 7. Existing `SettlementLandmarks` is an important migration seam

Current settlement runtime already exposes landmarks such as well, garden, stockpile, market, campfire, homes, and dock. Do not create a second unrelated `VillagePlan.landmarks` runtime representation.

Preferred direction:

```text
VillagePlan
  -> planned landmarks / building locations
      -> settlement runtime
          -> SettlementLandmarks
          -> Place queries
```

### 8. `minorLocations` must be accounted for

`minorLocations.ts` currently derives locations such as docks from settlement context and is consumed by settlement/runtime systems. Dock placement should become part of the village planning pipeline where appropriate, while keeping the existing runtime consumers intact during migration.

### 9. Livestock must consume the village plan rather than become another layout system

`src/settlement/livestock.ts` already deterministically creates livestock around settlement homes. The new village plan should provide the relevant home/farm/animal-area information rather than creating an independent livestock placement model.

## MINOR

### 10. Explicitly map existing `SettlementDef` fields into the new model

Current `SettlementDef` already contains important identity/context data such as size, terrain, dominant resource, food source, families, and clearings. The notes should specify which fields move into `VillageIdentity`, which become `VillagePlan` data, and which remain compatibility/runtime data during migration.

Avoid ending up with both `SettlementDef` and `VillageIdentity` containing the same authoritative information.

### 11. Preserve the existing worker-safe terrain boundary

Current terrain generation already passes plain numeric settlement-derived segments into worker-safe terrain code (`RoadCorridorSegment`, `ClearingSegment`, `RegionalSmoothingSegment`). Keep this pattern.

Village planning/runtime objects should not leak Three.js or settlement runtime dependencies into terrain workers.

## Architectural target

The intended boundary after this work is:

```text
                 ┌──────────────────────┐
                 │    VillageGenerator  │
                 │ local deterministic  │
                 │       planning       │
                 └──────────┬───────────┘
                            │
                            ▼
                     ┌─────────────┐
                     │ VillagePlan │
                     │             │
                     │ buildings   │
                     │ plots/zones │
                     │ landmarks   │
                     │ paths       │
                     │ entrances   │
                     └──────┬──────┘
                            │
                ┌───────────┴───────────┐
                ▼                       ▼
       settlement runtime          RoadNetwork
                                      │
                                      ▼
                            entrance ↔ entrance
                            between settlements
```

This keeps local village generation and global world connectivity as separate systems and avoids creating a second road/layout abstraction inside `VillagePlan`.
