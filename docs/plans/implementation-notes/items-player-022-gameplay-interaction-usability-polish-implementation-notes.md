# Implementation Notes: items-player-022 — Gameplay interaction usability polish

## Current codebase findings

### Camp interaction / inspection

- `src/app/interactables.ts::buildInteractables()` currently emits independent `Interactable` records for every `tent`, `bedroll` and `platform`. This is the direct cause of Tab/gaze cycling through all three physical parts.
- `src/app/campRestSnapshot.ts::resolveCampRestSnapshot()` already performs the canonical spatial composition around an anchor and returns the actual `tent`, `bedroll`, `platform`, `fire` records plus their resolved conditions and `CampRestExplanation`. Reuse this composition logic; do not add camp membership, `campId` or a manager.
- `src/app/campRest.ts::explainCampRest()` remains the only quality/contribution calculation. Vue must receive already-resolved values.
- `src/app/actions/restActions.ts` already owns `inspectTent`, `inspectBedroll`, `inspectPlatform`, `workOnCampRepair()` and `campRepairAvailable()`. Repair routing should stay here rather than moving mutation callbacks into Vue.
- `src/items/campRepair.ts` already contains the full repair policy and authoritative start/work lifecycle (`resolveCampRepairQuote`, `beginCampRepair`, `applyCampRepairWork`, capability/material requirements). No new camp-repair rules are needed.

### Recommended camp interaction shape

Add one transient interaction representation for a composed camp, preferably a dedicated `Interactable` variant carrying only stable component ids / anchor data needed for dispatch, e.g. the resolved tent id and optional bedroll/platform ids. Do not store conditions or repair eligibility in the interactable as authority; re-resolve them when opening inspection.

In `buildInteractables()`:

1. process player tents first;
2. for each tent, resolve the sleeping components that belong to its camp using the same radii/selection semantics as `resolveCampRestSnapshot()`;
3. emit one composed camp target anchored at the tent;
4. mark the included bedroll/platform ids as represented;
5. when later iterating sleeping utilities, emit standalone targets only for ids not already represented by a tent camp.

Do not group two nearby tents into one camp. A tent is the natural root only because the current snapshot already treats it as the shelter anchor. Keep standalone bedroll/platform behaviour unchanged.

Avoid calling the full snapshot resolver repeatedly inside nested loops if it performs multiple list scans for every candidate. The current object counts are small, but this path executes every frame. If needed, extract a small pure membership resolver in `campRestSnapshot.ts` that shares the exact `TENT_SHELTER_RADIUS`, `BEDROLL_REST_RADIUS`, `BEDROLL_ON_PLATFORM_RADIUS` and nearest-selection semantics without resolving condition/weather/quality.

### Structured camp inspection

`src/ui-vue/screens/FlavorDialog.vue` currently renders `ui.flavorDialog.line` as one `whitespace-pre-line` paragraph. That is why `formatCampRestBreakdown()` cannot color only `+N%`.

Extend the existing generic dialog state in `src/ui-vue/store.ts`; do not create a camp-specific Vue modal. Keep the addition optional so all existing callers remain valid. A minimal reusable model is enough, for example rows with `label`, `value`, optional secondary value and a semantic tone such as `positive | warning | muted`.

Keep the action contract (`InteractionPanelAction`) unchanged unless there is a concrete need. `restActions.ts` already deliberately mirrors this action shape to stay independent from Vue.

For camp inspection, derive structured rows from `CampRestSnapshot` + `snapshot.explanation`. Prefer adding a formatter/view-model helper beside `campRestSnapshot.ts` rather than mapping `CampRestExplanation.key` inside Vue. Vue should only render labels/values/tones.

Important: `formatCampInspectionDescription()` / `formatCampRestBreakdown()` are existing plain-text consumers. They can remain for other callers/tests if useful; do not force a repository-wide dialog-format migration.

### Repair actions in composed camp

When opening the composed camp inspection, re-resolve the current snapshot at the camp anchor, then build actions only for existing components.

For each component:

- `campRepairAvailable(kind, id)` decides whether a start/continue repair action is meaningful;
- `workOnCampRepair(kind, id)` remains the execution entry point;
- if the component is full-condition / unavailable, either omit the repair action or expose it disabled only when the current UI convention benefits from showing the reason; do not independently reimplement material/capability checks.

The component id must come from the freshly resolved snapshot, not from a stale condition captured when gaze selection happened.

## Placement preview

### Existing rotation path

`src/app/actions/placementPreviewActions.ts` already owns yaw and consumes `[F]` / `[G]` via the existing keyboard actions. `PlacementPreviewOverlay.vue` already contains `F / G — Obróć`. Do not change input bindings or add another hint system.

The implementation should only make those bindings visually explicit near the rotate buttons, e.g. labels equivalent to `↶ [F]` and `[G] ↷`; retain touch-only buttons without keyboard labels.

### House entrance marker

`src/world/placementPreview.ts::PlacementPreviewGhost` currently renders only circle/box footprint geometry. Extend this same ghost with an optional front/entrance marker; do not load/render the full house model in preview.

`src/world/residentialBuilding.ts::residentialBuildingApproachLocal()` is the existing front-side semantic authority. It returns an approach point on local `-Z`, outside the front wall. The preview entrance marker must use that same convention and rotate with `group.rotation.y = yaw`.

Recommended contract: make entrance/front marking part of the preview result/view passed to the ghost, rather than branching in `placementPreview.ts` on string kind names. `placementPreviewActions.ts` already knows `smallHouse` / `mediumHouse`; it can supply the optional presentation flag derived from the selected kind.

The marker can be a small line/chevron/door-width segment placed along the local `-Z` footprint edge. It should reuse the ghost's valid/invalid material color update and require no per-frame geometry allocation.

## Dropped-item interaction grouping

### Current authority

- `src/items/createDroppedItems.ts` stores every dropped unit independently and `collect(id)` removes exactly one authoritative record.
- Records may carry `instance` or `foodBatch`; these preserve identity/condition/provenance and must never be flattened into a count-only authoritative stack.
- `src/app/interactables.ts` currently emits one `kind: 'item'` target per dropped record.
- Existing pickup dispatch in `src/app/gameLoop.ts` uses the generic `WorldItemRef`/`collectItem()` path and checks inventory capacity before mutation. Preserve this path.

### Recommended grouping boundary

Group only the interaction projection, never `DroppedItems.nodes()` or persistence.

Introduce a grouped dropped-item interactable/reference that carries the concrete member ids in deterministic order. Keep world-generated and spawner sources on the existing single-item path.

Grouping key for v1:

- `source === 'dropped'` only;
- same `ItemKind`;
- within a small fixed XZ cluster radius;
- only records safe to treat as equivalent for bulk pickup.

Plain items with neither `instance` nor `foodBatch` are safe to group. The safest v1 policy is to leave any record with `instance` or `foodBatch` as an individual target. Do not attempt freshness-equivalence or instance merging in this polish plan.

Use stable/deterministic group membership/order (e.g. source array order or id tie-break) so Tab target identity does not flicker frame-to-frame.

### Bulk pickup semantics

Bulk pickup should iterate concrete member ids and reuse the existing single-item capacity + collection path per unit. Stop when the next unit cannot legally be added. This naturally leaves remaining authoritative records in the world and causes the next frame's grouped prompt to show the reduced count.

Do not call `DroppedItems.collect()` before the inventory preflight for that unit. Do not add all N to inventory and then try to reconcile failures.

If the current generic `collectItem()` helper is scoped to one `WorldItemRef`, prefer extracting/reusing a one-unit helper and looping over it rather than duplicating source routing in the grouped branch.

The grouped prompt should be built from the existing `ITEM_DEFS[kind].label`; keep consumable quick-use semantics unchanged for individual items. For v1, grouped dropped consumables should prioritize predictable bulk pickup over inventing a new `[R]` multi-consume behaviour.

## Standing torch lifecycle

### Current ownership

- `src/world/standingTorch.ts::StandingTorchRecord` currently stores `{ id, x, z, yaw, lit, completedWork }` only.
- `src/world/createStandingTorches.ts` mirrors that record into runtime entries and keeps an `active` array of lit torches. `update(dt)` only animates flame/sparks; there is currently no extinguish path.
- `src/app/saveState.ts` persists `bundle.standingTorches.nodes()` directly.
- `src/persistence/saveData.ts::SaveStandingTorch` currently mirrors the same fields. Existing migration history already upgraded old torches by defaulting missing `completedWork` to `STANDING_TORCH_REQUIRED_WORK`.

### Authority and API change

Use `burnUntilDays: number | null` on both runtime/domain and save record. `lit` may remain for compatibility/readability, but invariant must be explicit:

```text
lit === true  => burnUntilDays is a finite future/pending deadline
lit === false => burnUntilDays === null
```

Define one constant in `standingTorch.ts` for six world-hours expressed in days (`6 / 24`). Do not store remaining real seconds.

Change `StandingTorches.ignite()` to receive current world time, e.g. `ignite(id, nowDays)`, and atomically set both `lit = true` and `burnUntilDays = nowDays + duration`.

Add a world-time resolution method such as `resolveExpiry(nowDays)` / `updateWorldTime(nowDays)` which:

- checks only lit/active entries;
- when `nowDays >= burnUntilDays`, flips authoritative state to unlit, clears deadline and calls `entry.torch.setLit(false)`;
- removes expired entries from `active` without leaving stale references.

Keep `update(dt)` for visual animation only. Call world-time expiry from the existing game/world update path using `dayNight.elapsedDays`; this makes normal play, accelerated time and time skip converge on the same authority. Also resolve expiry when restoring/spawning initial records so an already-expired saved torch never flashes lit for a frame/session.

### Persistence / migration

Bump save schema through the existing migration pipeline in `src/persistence/saveData.ts`; do not add ad-hoc restore normalization in `createApp.ts`.

Legacy policy must be deterministic. Recommended migration for old `lit: true` records that have no timestamp: convert them to unlit with `burnUntilDays: null`. There is no historical ignition time from which a correct remaining duration can be reconstructed, and granting a fresh six hours on every migrated save invents fuel/time. Old `lit: false` also becomes `burnUntilDays: null`.

Update `SaveStandingTorch`, validators/parsers/defaults and migration tests together. `src/app/saveState.ts` should require no special logic if `nodes()` returns the complete authoritative record.

Do not touch `src/player/PlayerTorch.ts`; its portable 90s/240s real-time burn model is a separate system and outside this plan.

## Tests worth adding/updating

- `interactables` tests: tent + matching bedroll + platform produce one composed camp target; represented utility ids are not duplicated; independent bedroll/platform and second camp stay selectable.
- `campRestSnapshot` / inspection view tests: structured rows are derived from canonical explanation values and positive contribution tone does not require Vue-side arithmetic.
- `restActions` tests: composed inspection builds repair callbacks for the correct freshly resolved component ids and uses existing availability/work APIs.
- placement ghost/actions tests: house marker is on local `-Z`, rotates with yaw, hides for non-house kinds; no new keyboard binding.
- dropped-item grouping tests: six plain branches collapse to one target; branch/beam separate; provenance-bearing drops remain individual; membership/order is stable; partial capacity pickup leaves exact remaining ids.
- standing torch tests: ignite sets six-hour deadline; before deadline remains lit; at equality expires; expired restore starts unlit; active-list cleanup prevents further visual ticking; save round-trip preserves deadline; migration of legacy lit torch cannot remain immortal.

## Implementation order

1. Composite camp interaction + structured inspection/repair, because all required domain mechanisms already exist.
2. Dropped-item interaction projection + grouped pickup dispatch.
3. Placement entrance marker + stronger existing F/G hint.
4. Standing-torch world-time lifecycle + persistence migration, kept last because it changes save schema.

## Guardrails

- No `CampManager`, persisted camp membership or camp repair subsystem.
- No authoritative item stacks replacing per-unit `DroppedItem` records.
- No new rotation bindings or duplicate placement controller.
- No full-house preview model loading.
- No standing-torch fuel inventory/refuel system yet.
- Preserve one-unit identity/provenance and current inventory preflight semantics.
- Add JSDoc / `@domain` only to new important public helpers/contracts that should be discoverable by preflight.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
