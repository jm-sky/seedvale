# Implementation Notes: Incremental Construction for Player Buildables

**Plan:** items-player-017-incremental-construction.md  
**Last reviewed:** 2026-09-05

## Current-state discrepancies

- `npc-018` is still `planned`; the shared-work API described by this plan does not exist on current `main`. Implement this plan only after `npc-018`, then recon its actual target/contribution API and extend that implementation rather than coding to the plan text or these notes.
- Current `WorkContractRecord.target` in `src/world/workContract.ts` is still only `{ kind: 'construction', targetId }`; there is no generic buildable target discriminator/commitment accounting yet. Those are expected to change in `npc-018`.
- Standing torches currently have no removal API. The plan's removal/invalidation rule can be fully applied to palisades immediately; do not invent a generic standing-torch demolition flow solely for this plan unless `npc-018`/current interaction code already introduces a reusable removal seam.

## Existing ownership to extend

### Palisade

- `src/world/palisade.ts` owns the pure authoritative `PalisadeSegmentRecord`, placement dimensions, snapping helpers and material/recovery policy.
- `src/world/createPalisades.ts` owns runtime entries, meshes and per-segment colliders. It has no update loop; preserve that property. Construction state should live on `PalisadeSegmentRecord`, while the runtime owner only updates visual/collider state when work is applied or completion changes.
- `createPalisades.nodes()` currently serializes only `id/x/z/yaw`; extend this conversion or centralise `toRecord()` so construction fields cannot be silently dropped during save/rebuild.
- Palisade connectivity is derived entirely from transform via `palisadeEndpoints()` / `resolvePalisadeSite()`. Unfinished segments should remain in `nodes()` and snapping lookup so their footprint is reserved; do not add persisted neighbour state.

### Standing torch

- `src/world/standingTorch.ts` owns `StandingTorchRecord`; add construction progress alongside, not inside, `lit`.
- `src/world/createStandingTorches.ts` derives flame/light runtime from `record.lit`. Gate ignition on completion in the authoritative runtime/action seam; unfinished torches must never enter the `active` flame-update list or register as functional light through `setLit(true)`.
- `StandingTorches.nodes()` uses a dedicated `toRecord()` and is a good place to guarantee construction fields round-trip.

## Construction state

For these two simple buildables prefer the smallest common shape compatible with the target seam produced by `npc-018`, e.g. `requiredWork` + `completedWork`, with a pure `is...ConstructionComplete(record)` / remaining-work helper owned by each buildable domain.

Do not introduce a generic `ConstructionManager`, per-frame controller or multi-stage state machine. The well stays on its existing stage model; shared work should adapt to each target through narrow resolver/contribution functions.

Buildable work constants belong in `palisade.ts` / `standingTorch.ts`. The shared Work Contract/NPC code should only ask a target for remaining useful work and accepted contribution.

## Player work seam

`src/app/actions/placementActions.ts` already owns player placement and well construction interaction. Add player work for palisade/torch there or in a small adjacent action module if the file becomes unwieldy, but keep player-only policy outside the actor-neutral contribution call:

- busy-channel duration,
- vigor/stamina,
- time advancement,
- XP,
- held-tool/capability checks,
- HUD/toast feedback.

The authoritative contribution function should accept useful work and return the actually accepted amount/completion result, so both Player and NPC accounting can use the same mutation without inferring progress deltas later.

## Placement and terrain preparation

- `GroundPlacementDefinition`, `evaluatePlacementSite()` and `previewGroundPlacement()` in `src/app/actions/placementActions.ts` are the canonical preview/confirm placement seam. Preserve the current rule that confirmation re-resolves and revalidates; preview is not authoritative.
- Palisade snapping must still happen before final suitability evaluation exactly as today.
- Materials are already consumed atomically at successful placement through `src/items/constructionMaterials.ts`; keep that upfront-cost model for this phase. Do not split materials across work bouts.
- Current terrain preparation is `TerrainPreparationRecord` in `src/terrain/terrainPreparation.ts`, runtime-owned by `src/world/createTerrainPreparations.ts`, with player progression currently coordinated in `src/app/actions/terrainPreparationActions.ts`. `npc-018` is expected to extract the actor-neutral contribution seam; reuse that result.
- Do not make placement silently create/apply exact-height changes. If construction UX needs to launch preparation from an invalid site, preserve the normal buildable placement definition as the final authority and re-run it after preparation completes.
- Be careful with snapping + preparation: the prepared footprint must correspond to the final snapped palisade transform, not the pre-snap aim position.

## Functional state and collision

Palisades currently register a full OBB collider immediately in `createPalisades.spawn()`. This is the main functional-state decision required by the plan.

Recommended v1 rule:

- unfinished palisade: reserves placement/snapping footprint but does **not** register the completed barrier collider;
- on completion: register its existing OBB collider once;
- on removal/dispose: clear it as today.

This keeps NPC/pathfinding behaviour aligned with `planned footprint != completed barrier` without progress-dependent navigation geometry. If the visual unfinished representation is already physically blocking enough to justify collision, choose one binary threshold and keep it centralized rather than scaling colliders with progress.

Standing torches currently have no gameplay collider, so the main functional gate is ignition/light.

## Cheap progress visuals

- `src/world/palisadeProp.ts` is procedural. Prefer one mesh created once and a cheap discrete visual derived from progress (for example child visibility / vertical scale / subset of posts), updated only when accepted work changes progress. Avoid rebuilding geometry/materials every frame.
- `src/world/standingTorchProp.ts` / `createStandingTorchVisual()` already separates the physical torch from lit runtime. Add an unfinished visual state without bespoke GLBs and update it only on contribution/completion.
- Render-only state must not be persisted.

## Work Contract integration after npc-018

Extend the actual target resolver introduced by `npc-018` with `palisade` and `standingTorch`; do not add target-specific branches throughout `NpcAgent`.

The resolver should obtain position and live target state from `bundle.palisades` / `bundle.standingTorches`, not from stale contract coordinates. Contract coordinates may remain useful for posting/visuals, but travel/work validity should resolve the authoritative target by stable id.

Reuse `npc-018` semantics for:

- immutable NPC commitment based on remaining work at contract creation,
- one active contract per target,
- accepted useful work accounting,
- target-completed vs target-missing distinction,
- release/invalidation lifecycle.

Palisade removal already has a concrete `remove(id)` mutation; wire successful removal to Work Contract invalidation through the shared mechanism introduced by `npc-018`. Do not let `NpcAgent` discover missing targets only after repeated failed work ticks.

## Persistence / migration

- `src/app/saveState.ts` already serializes `standingTorches.nodes()` and `palisades.nodes()`.
- `src/persistence/saveData.ts` owns validation/defaulting and existing-save compatibility. Add construction fields there using the local migration/default conventions.
- Missing construction fields on old records must mean **completed**, not zero progress. Prefer deriving the default from each buildable's current required-work constant so migrated records satisfy the same completion helper.
- Same-seed `WorldBundle` rebuild also carries these records. Verify construction fields survive both save/load and in-session rebuild; this is easy to break if `nodes()` omits new fields.

## Interaction / HUD

The current interaction dispatch for standing torch ignition and palisade removal runs through `gameLoop.ts` + placement actions. Extend that existing gaze/interactable path for `Build` / progress text rather than adding a construction screen.

Interaction precedence matters:

- unfinished standing torch: construction action, never `Ignite`;
- completed unlit standing torch: existing `Ignite`;
- unfinished palisade: construction action plus existing removal if desired by current key-routing conventions;
- completed palisade: current removal behaviour.

Central completion helpers should drive these gates; do not duplicate raw `completedWork >= requiredWork` checks across UI, runtime and Work Contracts.

## Tests / pitfalls worth covering

- old save records without construction fields load completed;
- `nodes()` preserves partial progress through save and WorldBundle rebuild;
- work contribution clamps to remaining work and returns accepted amount;
- concurrent Player/NPC contributions mutate one record only;
- palisade collider appears once on completion and is absent while unfinished;
- unfinished torch cannot ignite and cannot enter the active light/flame list;
- snapped palisade preparation/placement uses the same final transform;
- removing a contracted unfinished palisade invalidates/releases the contract immediately;
- no per-frame iteration/controller is added for all unfinished palisades.

## Suggested implementation order

1. After `npc-018`, recon its shared target/contribution interfaces and persistence changes.
2. Add construction fields/helpers to palisade + standing-torch domain records and old-save defaults.
3. Update runtime owners/`nodes()` plus cheap derived visuals and functional gating.
4. Change placement to create unfinished records while preserving current upfront material consumption and placement/snapping rules.
5. Add Player work interaction using the shared contribution seam.
6. Extend the `npc-018` target resolver and Work Contract invalidation for the two buildables.
7. Wire terrain-preparation handoff/revalidation without duplicating terrain mutation.
8. Add focused tests for migration, progress accounting, collision/light gating and rebuild persistence.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
