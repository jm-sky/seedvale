# Implementation Notes: world-024 — Systemic treasure sites and keys

## Current code reality

The closest existing implementation is not `createPlacedContainers`; it is `src/world/worldGeneratedContainers.ts`.

`WorldGeneratedContainers` already provides the correct runtime semantics for systemic treasure chests:

- deterministic specs supplied by world generation;
- normal `Container`/`Inventory` transfer UI;
- non-portable world chests (`portable: false`);
- stable caller-supplied IDs;
- saved contents restored by ID;
- integration in `containerActions.ts`, `interactables.ts`, `gameLoop.ts`, `worldBundle.ts` and `saveState.ts`.

Use this path for treasure chests. Do not put systemic treasure into `PlacedContainers`, whose `place()` generates `Date.now()` IDs and whose lifecycle is player-placement/carrying.

The authored dark-forest treasure already uses this path from `worldBundle.ts` with a stable chest ID from `darkForestTreasureSite.ts`. Treat that as the primary container precedent.

## Recommended ownership

Keep three concerns separate:

```text
TreasureSiteDefinition (deterministic world definition)
WorldGeneratedContainers (physical chest + contents)
Treasure lock mutations (sparse persisted state keyed by containerId)
```

A small `src/world/treasureSites.ts` resolver is appropriate for immutable definitions. It should be a pure resolver over seed + already-resolved world-place inputs and should not own runtime meshes, inventory contents or item ownership.

Do not add a `TreasureManager` unless later implementation creates an actual active lifecycle that requires one.

Suggested definition shape should carry only stable references/placement data needed to materialize the site, for example site ID, chest/container ID, archetype/place ID, chest placement, required key instance ID and key-placement definition.

## World-generated container persistence discrepancy

`SaveWorldGeneratedContainer` currently persists `id + x/z/yaw + contents`, even though `createWorldGeneratedContainers()` already reconstructs the physical container from a deterministic `WorldGeneratedContainerSpec` and only uses the saved record for contents.

For world-024, avoid making this duplication worse. Preferred direction:

- treat the deterministic spec as authoritative for position/yaw/kind;
- persist only mutation state keyed by stable container ID (contents/instances/food batches);
- keep backward compatibility for existing saves that contain `x/z/yaw` for the authored dark-forest chest, but ignore those coordinates when a current spec exists;
- if changing the save shape, use the normal `saveData.ts` migration/defaulting path rather than adding ad-hoc restore logic in `worldBundle.ts`.

Do not persist the systemic treasure-site candidate selection merely because the current world-generated-container save record contains redundant placement fields.

## Lock state

There is currently no generic container-lock abstraction. Keep V1 lock ownership treasure-side and sparse.

Recommended mutation state:

```ts
unlockedTreasureContainerIds: Set<string>
```

Persist it as an array in `SaveData`, restore it once at app/world construction, and carry the same logical state across `WorldBundle` rebuilds. The deterministic site definition answers `requiredKeyId`; persisted state only answers whether that chest was already unlocked.

Do not add lock fields to `PlacedContainerRecord` or all generic containers for this plan.

`containerActions.ts::openContainer()` is the correct gate before opening the existing Vue transfer screen. Inject/query treasure lock metadata there (or through `PlayerActionContext`/a narrow dependency), then continue into the unchanged generic open-container path after success.

World-generated containers are already excluded from `pickUpContainer()`, so treasure chests naturally remain non-portable.

## Key representation: current item-instance gap

There is no `key` `ItemKind` today.

`ItemInstance` already supplies exactly the identity model needed (`id`, `kind`), but instance-backed acquisition is opt-in through:

- `ItemKind` / `ITEM_DEFS`;
- `ITEM_CATALOG`;
- `INSTANCE_BACKED_KINDS` in `itemInstances.ts`;
- `createAcquiredInstance()` in `items/trade.ts`.

Add one generic `key` kind and make it instance-backed. Do not create per-site key kinds.

Important: `createAcquiredInstance('key')` must not generate the identity for a systemic key, because treasure requires a deterministic ID derived from the site. Add/use a small explicit constructor accepting an ID (or construct the minimal `{ id, kind: 'key' }` at the deterministic materialization boundary), while normal generic acquisition may still use `createItemInstanceId()` if generic keys are ever acquired elsewhere.

The required key ID should be derived directly from the stable treasure-site ID, e.g. a namespaced deterministic string. Never use `Date.now()` for systemic key identity.

Inventory/container matching must use `Inventory.getInstance(requiredKeyId)` / instance APIs, not `inventory.has('key')`.

## Buried keys: extend Hidden Finds, do not use its random loot table

Current `hiddenFinds.ts` has two important properties:

- generic candidate spots are private/deterministic from a landmark;
- `resolveHiddenFindLoot()` returns count-based `HiddenFindLoot`, not a caller-supplied `ItemInstance`.

Therefore a treasure key should not be inserted into `LANDMARK_LOOT` or the cemetery loot profiles. That would lose specific key identity and couple guaranteed systemic placement to random generic Hidden Find existence.

Add the smallest explicit-placement seam to the existing dig pipeline. A useful shape is an externally supplied deterministic buried placement containing:

- stable `spotId`;
- host landmark ID/kind;
- exact x/z;
- grave index when the placement is a real grave;
- required key instance ID.

`groundActions.ts` should still resolve it inside the existing ordinary shovel completion path and use the existing `resolvedHiddenFindSpotIds` set for one-shot semantics.

For cemetery placements, reuse the same branch that computes `servedSettlementIdsForCemeteryId()` and applies `resolveSocialExposure()` / `GRAVE_DISTURBANCE_EXPOSURE`. Do not create a second cemetery-key resolution path that bypasses this consequence.

Avoid reusing a `spotId` that generic Hidden Finds may also resolve to different random loot unless the intended rule is that the explicit treasure key replaces that generic result. Prefer an explicit namespaced placement ID while still carrying the real grave index/host semantics needed for social consequences.

## Abandoned physical keys

Do not use transient `droppedItems` as authoritative source placement; ordinary drops are not the deterministic one-shot world-source abstraction required here.

The authored dark-forest map already demonstrates a stable one-time world pickup ID combined with `collectedItemIds`. Reuse that ownership model for abandoned keys, but generalize only as far as needed so placement is not tied specifically to settlement prop construction.

The systemic key pickup must:

- be materialized from deterministic placement + deterministic item-instance ID;
- disappear when its stable pickup/source ID is in `collectedItemIds`;
- add the exact predefined `ItemInstance`, not create a new instance on pickup;
- survive save/load through existing `collectedItemIds` + player inventory instance persistence.

If the current one-time-pickup helper is too settlement-specific, extract a small generic world pickup seam rather than introducing `TreasureKeyPickup` lifecycle code.

## Candidate world places / reservations

Use stable IDs as the only allocation boundary.

The authored dark-forest treasure already reserves real identities (`ruins:dark-forest-treasure`, its world-container ID and its related source place). Generic systemic treasure must not reuse that authored site.

Build the occupied/reserved ID set before systemic treasure resolution from the concrete authored/special content known at composition time. Pass it into the resolver. Do not let `treasureSites.ts` import quest managers or inspect live quest state.

For ruins/landmark candidates, use the existing deterministic landmark identities from `chunkEnvironment`/world-location code. Do not instantiate chunks or props to discover candidates.

Deep-forest placement can reuse the analytic terrain/biome tests in `darkForestTreasureSite.ts`, but extract only clearly reusable pure helpers; do not make systemic treasure depend on the authored quest site module.

## Cave archetype

Do not implement cave placement against SDF mesh/extraction details.

Current production cave representation is in active transition: `world-terrain-019-cave-heightfield-production-migration.md` is still `planned` and explicitly intends downstream semantic contracts such as `caveId -> suitable chamber/deep-interior placement`.

Implement ruins/deep-forest systemic treasure first. Only enable cave treasure if the codebase at implementation time exposes a stable semantic interior-placement query derived from `CaveTopology`/the production cave representation.

If that seam is still absent, leave the cave archetype disabled/deferred; do not add an SDF-specific treasure anchor that world-terrain-019 will immediately invalidate.

## Definition generation

Keep site count bounded and deterministic. Resolve from cheap analytic/catalog inputs during world construction, not during rendering/streaming.

Use independent hashed RNG streams/salts for:

- site candidate ordering;
- archetype choice/tie-breaks;
- chest orientation/offset;
- key-host selection;
- key physical offset/burial choice.

Do not consume one sequential RNG stream across unrelated stages; otherwise adding one candidate/roll later can reshuffle every downstream identity/placement.

Sort candidate pools by stable ID before deterministic selection so source iteration order cannot change generation.

## Integration points

Expected primary surfaces after recon:

```text
src/world/treasureSites.ts                    new pure definitions/resolution
src/world/worldGeneratedContainers.ts         chest materialization + mutation restore
src/world/hiddenFinds.ts                      explicit buried-placement seam
src/app/actions/groundActions.ts              buried key resolution + cemetery consequence
src/app/actions/containerActions.ts           lock/key gate before normal container UI
src/items/items.ts                            generic key ItemKind
src/items/itemCatalog.ts                      key metadata
src/items/itemInstances.ts                    key is instance-backed
src/items/trade.ts                            acquisition dispatch / explicit key constructor as needed
src/app/worldBundle.ts                        resolve/materialize definitions; rebuild continuity
src/app/saveState.ts                          mutation serialization
src/persistence/saveData.ts                   schema/default/migration
```

Also inspect the existing one-time pickup path used by the dark-forest treasure map before adding abandoned-key materialization.

## Implementation order

1. Add deterministic treasure-site definitions/resolver for ruins + deep forest, with reserved-place filtering and stable IDs.
2. Materialize chests through `WorldGeneratedContainers`.
3. Add generic key item-instance support with deterministic site-owned instance IDs.
4. Add abandoned one-time pickup support for exact instances.
5. Extend Hidden Finds with explicit buried placements and preserve grave consequences.
6. Add lock state + `openContainer()` gate and persistence.
7. Only then add cave archetype if a semantic production cave placement API exists.

This order keeps the systemic foundation independent from cave migration and makes persistence/identity testable before UI interaction wiring.

## Tests worth adding

Prefer pure/unit tests around the seams above:

- stable site/chest/key IDs across candidate input order changes;
- reserved authored place rejection;
- `WorldGeneratedContainers` restores contents by ID while deterministic spec owns placement;
- exact key instance required to unlock; another `key` instance fails;
- acquired abandoned key does not rematerialize after restore;
- buried key resolves once through `resolvedHiddenFindSpotIds`;
- cemetery-hosted key executes the same social-exposure consequence path;
- rebuild/save-load does not refill a looted chest or relock an unlocked one.

No browser automation; manual gameplay verification remains with the User.

## Follow-up boundary

`items-player-026-treasure-loot-forced-entry-and-traps.md` remains responsible for treasure loot composition, gems, forced entry and traps. World-024 should seed only minimal placeholder/fixture contents necessary to prove finite-container persistence; do not implement that follow-up early.
