# Implementation notes: world-019 persistent Player-built site infrastructure

## Recon summary

This plan is intentionally a cross-system extension, not a new manager. Preserve the existing owners and add only the missing durable/queryable contracts.

## Terrain preparation

Primary files:

```text
src/terrain/terrainPreparation.ts
src/world/createTerrainPreparations.ts
src/app/actions/terrainPreparationActions.ts
```

Current verified contract in `src/terrain/terrainPreparation.ts`:

```ts
export type PreparationSize = 2 | 3 | 4 | 9
```

`resolvePreparationSamples(...)` is already metre-based and resolution-aware. `preparationSamplesPerSide(...)` converts world metres to the current terrain sample grid. Do not create another plot/footprint implementation.

`TerrainPreparationRecord` is active construction state and currently contains `originalHeights`, `requiredWork`, `completedWork`, `targetHeight` and `status: 'active'`. Its current JSDoc explicitly documents deletion on completion and the absence of permanent `PreparedTerrain` state. This is the semantic persistence gap that world-019 changes.

Keep completed metadata compact. `originalHeights` and work-progress fields are construction-only and should not be carried into the durable completed record unless current code reveals a concrete restore requirement.

Final terrain heights remain owned by the exact-height/terrain modification pipeline. Do not duplicate those heights into completed preparation metadata.

Shared work already depends on the active record's remaining-work/contribution path. Preserve one active record and one completion transition regardless of which actor contributes the final work.

## Preparation-size decision

Do not solve the colony use case by only adding `6` to the union.

The footprint code already supports arbitrary metre values, so expose the ordinary bounded integer range `2…9` through the existing selection/validation flow. Keep the bound explicit; this plan is not permission for arbitrary large preparations.

Audit all assumptions that currently enumerate `[2, 3, 4, 9]`, especially UI/input cycling, parsing/serialization and tests.

## Player well / WaterSource

Relevant files:

```text
src/world/playerWell.ts
src/world/createPlayerWells.ts
src/world/WaterSource.ts
```

Player wells are already normal persistent world constructions and already have a real water-availability capability. Reuse the existing well-stage/availability predicate when classifying a well as usable infrastructure.

Do not introduce another `WaterSource` implementation, readiness flag or settlement-owned copy.

Work Contracts/shared work already integrate with well construction; world-019 should not redesign that path.

## Player garden and crops

Relevant files:

```text
src/world/playerGarden.ts
src/world/createPlayerGardens.ts
src/world/plantedCrops.ts
src/world/cropLifecycle.ts
src/world/foodSources.ts
```

A normal Player garden already exists and is persisted. It already participates in care/hydration and normal crop placement. Crops remain shared world entities; do not create Player-only or quest-only crop state.

`plantedCrops.ts` currently contains garden-proximity helpers. Recon found a known limitation: settlement landmark gardens carry positions without each garden's actual scale, so crop placement uses a conservative largest-garden radius in some paths. The new cultivation-anchor contract is a good place to stop propagating position-only assumptions where Farmer work needs a real cultivation radius.

Do not broaden world-019 into a full settlement-garden representation rewrite. Only carry enough geometry through the shared cultivation anchor to make Player and settlement cultivation equivalent to Farmer work.

## Settlement Farmer work

Primary file:

```text
src/ai/npcProfessionWork.ts
```

Current Farmer planning is anchored to `ctx.landmarks.garden` and queries crops/planting around that position. Harvest and planting already use shared crop/food systems; preserve those mutations.

Refactor target resolution, not the farming algorithm.

Preferred direction:

```text
existing settlement garden
        ┐
        ├→ CultivationAnchor(position + radius) → existing Farmer logic
        │
PlayerGardenRecord
        ┘
```

Avoid repeated branches such as `if (playerGarden) ... else ...` throughout planting/harvest logic.

This plan does not decide settlement adoption/ownership. Future bootstrap should select a usable anchor and provide/attach it through the normal settlement/NPC context. Farmer work only needs to be capable of consuming it.

## Settlement garden representation

Relevant files include:

```text
src/settlement/props.ts
src/settlement/gardenScale.ts
```

`SettlementLandmarks` currently exposes a primary `garden` position and a `gardens` position array. Treat this as an existing compatibility/input representation, not as a reason to reduce the new shared anchor to position-only data.

If the current settlement generation code already knows `GardenScale`, adapt it at the producer boundary into `CultivationAnchor`. Avoid adding duplicate persistent garden objects solely for this plan.

## Site infrastructure query

The query must aggregate existing stores, not own state.

Expected inputs/outputs conceptually:

```text
caller-provided bounded site geometry
→ completed terrain-preparation records
→ usable Player wells
→ live Player gardens / cultivation anchors
```

Return records or stable read models that preserve identity and useful geometry. Do not persist the aggregate query result.

Keep colony-specific conditions out of this module. In particular, do not bake in:

- `>= 2` preparations;
- `size >= 6`;
- mine entrance distances;
- plot separation;
- a fixed colony radius.

Those belong to future abandoned-mine colony/bootstrap policy.

Use existing bounded collection/query APIs where available. Do not add a world-wide per-frame scan or new spatial index for a query expected to run only on explicit checks/events.

## Persistence

Primary entry point:

```text
src/persistence/saveData.ts
```

Reconfirm current SaveData version/migration style before editing. The completed preparation collection should default to empty for older saves.

Do not infer completed preparations from final terrain geometry on load. Terrain shape alone cannot reliably recover preparation identity/size and would couple semantic reconstruction to geometry heuristics.

Likewise, do not persist derived site readiness.

## App/world wiring

Use the existing world composition/dependency wiring pattern (`createApp` / world bundle or current equivalent) to give the site query access to authoritative stores.

Do not introduce module-global registries.

## Important architectural pitfalls

- Do not create `PreparedPlot`, `QuestPreparedPlot` or a second terrain-preparation system whose state overlaps `TerrainPreparationRecord`.
- A compact completed preparation is a durable fact about a completed world operation, not another copy of terrain heights.
- Do not treat `targetHeight` as mandatory completed metadata unless implementation proves a post-completion consumer needs it.
- Do not make all placed wells usable; reuse real water availability.
- Do not make crop presence a requirement for garden/cultivation-infrastructure existence.
- Do not clone a Player garden into settlement state just so Farmer work can use it.
- Do not make `querySiteInfrastructure()` return/persist `readyForColony`.
- Do not redesign Work Contracts; only preserve their existing shared target semantics through the new completion transition.

## Suggested implementation order

1. Generalize/validate preparation sizes `2…9` and update enumerating UI/tests.
2. Add compact completed-preparation state and a single completion transition.
3. Add persistence/migration/default handling for completed metadata.
4. Add the bounded read-only site query over completed preparations, Player wells and Player gardens.
5. Introduce/adapt `CultivationAnchor` and preserve settlement garden behavior through an adapter/resolver.
6. Refactor Farmer work to consume the shared anchor and verify PlayerGarden interoperability.
7. Add focused tests and update current-state/roadmap wording.

Reconfirm exact symbols on current `main` before implementation if dependencies have changed. Follow code over this note when they conflict.
