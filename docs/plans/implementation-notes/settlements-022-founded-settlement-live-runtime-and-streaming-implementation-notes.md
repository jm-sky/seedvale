# Implementation Notes: Founded settlement live runtime and streaming

Plan: `settlements-022-founded-settlement-live-runtime-and-streaming.md`  
Reviewed against `main`: 2026-09-19 (`1acb81f40f5163dcb6f1c94fc1e89321316b87e6`)

## Dependency gate

This plan must be implemented **after** `settlements-020` and `settlements-021`.

At the reviewed `main`, both dependencies are still `planned`. Therefore the concrete symbols described in their implementation notes are contracts to consume, not code that already exists. Before changing 022 code, re-read the landed implementations of 020/021 and adapt names/signatures to what actually shipped.

Do not recreate dependency-owned mechanisms inside 022.

Expected 020 handoff:

- semantic founded home id separate from the physical tent id;
- real founded-home `Place` resolver backed by the persisted `PlacedTent`;
- corrected founded household binding;
- deterministic founded camp layout / reconciliation.

Expected 021 handoff:

- one presentation-owner policy covering procedural residents, residency overrides and merchant journeys;
- explicit identity-origin vs current-residency separation;
- procedural-independent `SettlementResidentDescriptor` + shared existing-`NpcId` materializer;
- narrow work/logistics/runtime anchors with legal absence semantics;
- procedural residents and travelling visitors already migrated onto the shared materializer.

If either dependency is only partially landed, finish/fix that dependency rather than adding a 022-only substitute.

## Verified current baseline

### Authoritative founded state already exists

`src/settlement/foundedSettlement.ts` currently owns:

- `FoundedSettlementRecord`;
- deterministic settlement/household/tent IDs;
- manager-lifetime `FoundedSettlementRegistry`;
- explicit `NpcId -> settlementId` residency overrides;
- persisted founded registry snapshot.

`src/settlement/foundedSettlementBootstrap.ts` already creates the authoritative record, residency overrides, founded households, economy and physical tents. 022 must not duplicate these quantities in a loaded runtime.

The reviewed code still reflects pre-020 bootstrap behavior, so use the 020 landed home/tent contract rather than today’s raw tent-backed household binding.

### Manager is still procedural-shaped

`src/settlement/SettlementsManager.ts` currently has:

```ts
type Entry = {
  def: SettlementDef
  settlement: Settlement | null
  pendingPromise: Promise<void> | null
}
```

`ensureLoaded(def)`:

1. inserts one entry;
2. waits for terrain chunks;
3. calls `createSettlement(def, economyFor(def), settlementDeps)`;
4. publishes the resulting `Settlement`;
5. reclaims detached livestock;
6. restores day/night;
7. clears transport off-screen execution for live carriers;
8. calls `onSettlementAvailable`.

If the entry disappeared before completion, the created settlement is disposed. However the unload loop currently skips every `pendingPromise`, so a no-longer-wanted load is not invalidated until a later lifecycle action. This is the race 022 should fix for both source kinds.

### Streaming cadence to preserve

Streaming checks are not per-frame. `recheck()` runs after player movement reaches `recheckDistance = loadRadius * 0.25`.

Procedural discovery uses grid cells, while unloading compares world-space distance. Current defaults described by the plan are 300/420 m load/unload radii.

Founded discovery should join this same throttled checkpoint via a bounded scan of `foundedSettlements.list()`, using squared distance. Do not add a second timer or per-frame founded scan.

### Current loaded `Settlement` is procedural-only

`src/settlement/createSettlement.ts::Settlement` mixes common live runtime with procedural metadata/capabilities:

Common candidates include:

- `id`;
- display identity;
- `center`;
- `npcs`;
- `households`;
- `economy`;
- `update`;
- `setDayNight`;
- `dispose`.

Procedural-only fields currently include or strongly imply:

- `isHome`;
- `foodSourceType`, `size`, `terrain`, `dominantResource`;
- `livestock`;
- `rats`;
- `landmarks`;
- infestation nest presentation;
- household storage positions generated with the village;
- pasture/trough resolution;
- village fire/torches and other village presentation hooks.

Do not make founded runtime satisfy this shape with empty arrays or fake landmarks.

## Loaded runtime contract

After 021 lands, introduce the smallest common loaded-runtime type needed by actual consumers.

Prefer a discriminated contract such as:

```ts
type LoadedSettlementRuntime =
  | ProceduralSettlementRuntime
  | FoundedSettlementRuntime
```

with shared fields factored structurally, for example:

```ts
type CommonLoadedSettlementRuntime = {
  id: string
  kind: 'procedural' | 'founded'
  name: string
  center: Vector3
  npcs: readonly NpcAgent[]
  households: readonly Household[]
  economy: SettlementEconomy
  update: ...
  setDayNight: (t: number) => void
  dispose: () => void
}
```

Exact fields must follow the post-021 call graph. Do not force `size`, `terrain`, `dominantResource`, `foodSourceType`, `landmarks`, `livestock` or `rats` into the common interface unless a real shared consumer proves semantic need.

Keep the existing procedural constructor/result behavior intact; adapt it to `kind: 'procedural'` rather than redesigning village construction.

## Manager source model

Replace the procedural-only entry source with one source discriminator:

```ts
type SettlementRuntimeSource =
  | { kind: 'procedural'; def: SettlementDef }
  | { kind: 'founded'; record: FoundedSettlementRecord }
```

Each entry should still own exactly one lifecycle:

- source;
- loaded runtime;
- one pending load promise;
- desired-load / generation state;
- unload/dispose state.

Do not maintain a second founded entries map.

Add small source helpers rather than spreading `source.kind` branching everywhere, especially:

- stable id;
- world center;
- whether permanently loaded;
- source-specific constructor dispatch.

The procedural home remains permanently loaded. Preserve this explicitly through a helper/predicate; do not infer permanence from `kind === 'procedural'`.

`syncMidpoints()` is procedural road/signpost logic and must only inspect procedural sources. Founded settlements do not participate merely because they share the same manager.

## Race-safe async loading

Use one common mechanism for procedural and founded loads.

Recommended entry state:

- `pendingPromise`;
- `desiredLoaded: boolean`;
- monotonic generation/token, or equivalent manager-generation + entry-generation check.

Required semantics:

1. repeated ensure while pending does nothing;
2. a source leaving unload range marks it unwanted even if construction is pending;
3. completion checks the current entry/generation and `desiredLoaded`;
4. an unwanted/stale completed runtime is disposed immediately and never published;
5. manager `dispose()` invalidates all pending completions;
6. errors remove only the still-current generation of that source;
7. partial founded resident materialization must be disposed through the shared 021 lifecycle.

Do not add `AbortController` unless the concrete loaders acquired after 021 can genuinely abort.

The 021 presentation-owner policy remains the identity correctness layer. The 022 generation guard is lifecycle/race protection, not a second residency owner.

## Founded runtime composition

Create a small founded constructor/adapter under `src/settlement/`; do not extend `createSettlement()` with a large `if (founded)` branch.

Inputs should be authoritative/reused objects:

- `FoundedSettlementRecord`;
- existing `SettlementEconomy` from `EconomyRegistry`;
- founded `Household` objects from `HouseholdRegistry`;
- existing `NpcAuthoritativeState` objects;
- sponsor/source `SettlementDef` only for immutable founder identity/profile resolution;
- 020 semantic founded-home resolver;
- 021 shared resident materializer;
- real world capability resolvers.

### Founder identity resolution

For every `record.residentNpcIds`:

1. resolve current founded residency from the registry and reject/skip inconsistent ownership rather than guessing;
2. resolve immutable identity from `record.sponsorSettlementId` using the existing procedural definition + `resolveSettlementNpcHomeDescriptor(...)`;
3. preserve the sponsor-derived physical seed contract from 021;
4. resolve current household by the deterministic founded household id;
5. resolve current home via the 020 founded semantic-home resolver;
6. pass those into the 021 shared materializer.

Do not infer founder identity from the founded `NpcId` namespace and do not copy profile/family data into `FoundedSettlementRecord`.

If the sponsor `SettlementDef` cannot be resolved, treat it as a load failure/inconsistent authoritative state; do not synthesize a generic NPC.

## Founded capability adapter

Build a transient runtime view from real world owners. It may cache resolved anchors for one loaded runtime, but it must not persist copies into `FoundedSettlementRecord`.

### Home

Use the 020 semantic founded-home resolver backed by the real stable `PlacedTent`.

### Water / cultivation

Reuse existing world-owned player infrastructure.

`src/world/siteInfrastructure.ts` / the `WorldBundle.querySiteInfrastructure(...)` composition path is the existing read-only site query used by colony bootstrap. For live runtime, prefer passing the underlying narrow world services/resolvers through manager deps rather than repeatedly calling a broad snapshot query per NPC.

Only expose usable real wells and real cultivation areas within the intended founded-site scope.

### Mining / gathering / hunting

Reuse the hooks already threaded through `CreateSettlementDeps` / 021 materializer:

- `SettlementMiningHooks`;
- `SettlementHerbalGatherHooks`;
- `SettlementHuntingHooks`;
- resource-site inventory/position hooks;
- other already-narrow shared hooks.

Do not introduce founded-specific versions of the same systems.

### Storage / market / dock / workshop / pasture

Absence is legal.

In particular:

- economy stock does not imply a physical settlement storage target;
- settlement center or a tent is not a stockpile fallback;
- no market means no market-specific Trader work;
- no dock/spot means no Fisher work;
- no workshop means no Blacksmith workshop action;
- no pasture/livestock capability means no Shepherd/pasture action.

Use the graceful absence semantics established by 021.

## Display identity

Do not use `siteId` directly as player-facing display text unless the authored site contract explicitly says it is a display name.

Before adding a new field to `FoundedSettlementRecord`, search for an existing stable authored-site/location label resolver. Prefer deriving display identity from the authored site catalog/quest-owned location definition while keeping the founded record minimal.

If no stable resolver exists after dependency implementation, add the smallest explicit stable display-name input at the founding boundary and persist only that semantic identity. Do not generate a random name on each load.

Do not map economy `OUTPOST` initialization onto procedural `VillageSize.OUTPOST` unless a consumer genuinely needs a common semantic size.

## Common lifecycle vs procedural capabilities

Refactor manager operations by capability, not by fake fields.

### Common

Suitable for both runtime kinds when present:

- `npcs` update;
- day/night forwarding;
- NPC time skip;
- NPC off-screen travel handoff;
- generic runtime dispose;
- common settlement-available callback;
- common live-NPC lookup.

### Procedural-only

Keep guarded behind `kind === 'procedural'` or an explicit capability:

- `stampSettlementAgriculture`;
- `livestock.capture`;
- `rats.capture`;
- procedural storage-target resolution from landmarks;
- pasture/trough APIs;
- infestation nest presentation;
- midpoint road/signpost participation;
- settlement structure repair candidates derived from planned houses.

Do not add empty livestock/rats/landmarks to founded runtime to make these functions compile.

`resolveTimeSkip()` should iterate common live NPCs, then run procedural agriculture only for procedural runtimes.

`snapshotLivestock()`, `snapshotRats()`, structure repair candidate lookup and similar registry bridges must likewise be capability/source-aware.

## External consumer audit

Before changing `getLoaded()`'s return type, search every call-site and classify it.

Expected common consumers should move to the common runtime surface:

- NPC lookup/inspector paths that only need `id/name/npcs`;
- Villagers/minimap identity + center + NPC list;
- dialogue/trade lookup by live NPC;
- live-NPC position collection used by merchant/transport logic;
- settlement-available/social catch-up that only needs id/position.

Expected procedural-only consumers need a type guard/capability:

- `restActions` town lodging;
- pasture/trough player actions;
- debug village houses/landmarks;
- livestock/mount queries that read `settlement.livestock`;
- structure repair candidate resolution based on planned residential houses;
- storage target code that reads procedural `landmarks.stockpile/settlementStorage`;
- village fire/torch/infestation presentation.

Do not silently make founded camps eligible for lodging, village-house debug, livestock/pasture actions or procedural storage.

Pay special attention to manager-internal loops that currently assume `entry.settlement.npcs/livestock/rats/landmarks`; these are easy to miss because they are not external `getLoaded()` callers.

## Inter-settlement transport

Current `settlementDeps.interSettlement.resolveStorageTarget()` returns procedural live storage when loaded and otherwise falls back to `knownSettlements` center.

That fallback is not automatically valid for founded physical storage.

For founded settlements, only expose a transport/storage target when a real founded storage capability exists. A founded center can remain a navigation/settlement center but must not become a cargo handoff point by type accident.

Do not add founded settlements to `knownSettlements` if that collection semantically means procedural generated settlements. If shared transport/discovery needs them, introduce a source-neutral read helper instead of mutating meaning of the procedural registry.

## onSettlementAvailable

Call `onSettlementAvailable({ id, x, z })` only after a founded runtime has successfully been published as loaded.

Do not call it when:

- the founded record is created;
- loading starts;
- resident materialization partially succeeds;
- a stale/no-longer-wanted async completion is immediately disposed.

Preserve one callback per successful load episode, matching procedural semantics.

## Off-screen continuity

022 does not add an off-screen colony simulator.

After unload, correctness comes from existing owners:

- `NpcStateRegistry`;
- `HouseholdRegistry`;
- `EconomyRegistry`;
- `FoundedSettlementRegistry`;
- `PlacedTents`;
- world-owned resource/cultivation infrastructure.

Audit each live-only path encountered during implementation and explicitly leave unsupported V1 behavior unsupported rather than simulating it with a quest timer.

In particular, production that requires a live profession action or physical storage target remains unavailable off-screen unless an existing registry-based system already owns its catch-up.

## Suggested implementation order

1. Re-read landed 020/021 implementations; verify their public contracts and tests.
2. Introduce common/discriminated loaded-runtime types without changing behavior.
3. Migrate manager internals/external consumers to common vs procedural-only capabilities.
4. Refactor `Entry` to `SettlementRuntimeSource` and preserve procedural streaming behavior.
5. Add common desired-load/generation-token lifecycle and regression-test procedural races first.
6. Add founded source discovery to the existing throttled `recheck()`.
7. Implement founded runtime composition using 020 home + 021 resident materializer.
8. Thread only the real world capability resolvers needed by founded residents.
9. Add common unload/time-skip/publication hooks for founded runtime.
10. Audit storage/transport/social/debug/UI consumers.
11. Add save/rebuild/stream-out/in regression tests.
12. Stop before authored-outpost activation, permanent colony construction or new off-screen simulation.

## Primary files

Expected primary changes:

- `src/settlement/SettlementsManager.ts`;
- `src/settlement/createSettlement.ts` — type adaptation only where the procedural runtime joins the common loaded-runtime contract;
- new small loaded-runtime/founded-runtime adapter modules under `src/settlement/`;
- `src/settlement/foundedSettlement.ts` only for small read/display helpers if genuinely needed;
- `src/app/worldBundle.ts` only to thread existing world-owned capability resolvers;
- external consumers revealed by the `getLoaded()` audit.

Dependency-owned files should normally not be redesigned here:

- 020 founded-home/layout/bootstrap integrity modules;
- 021 presentation-owner/materializer/work-logistics anchor modules.

## Verification focus

Add focused tests for:

- source discriminator keeps procedural home permanently loaded;
- founded bounded scan occurs only at manager recheck, not NPC/frame update;
- founded record inside load radius creates one pending load;
- repeated recheck while pending does not duplicate construction;
- moving outside unload radius while pending marks it unwanted and completion disposes without publication/callback;
- manager dispose invalidates pending completion;
- procedural async lifecycle still loads/unloads exactly once;
- sponsor + founded loaded simultaneously -> presentation-owner contract produces one live founder only;
- stream-out removes founded live agents but preserves exact `NpcAuthoritativeState`, household and economy object/state;
- stream-in rematerializes the same stable `NpcId`;
- real founded tent becomes current home; no synthetic procedural home;
- missing optional well/garden/storage/market/dock/workshop/pasture produces graceful absence, not fake targets;
- procedural-only unload capture does not run for founded runtime;
- founded `onSettlementAvailable` fires only after successful publication;
- `getLoaded()` common consumers accept founded runtime while procedural-only consumers remain guarded;
- founded settlement is not accepted by town-lodging/pasture/livestock/house-debug flows without the matching capability.

Then run focused tests, `npx tsc --noEmit`, `pnpm run lint:fix`, `pnpm run build` and the repository test suite.

Player performs browser/gameplay verification. AI does not run browser verification.

Add JSDoc with `@domain settlements` to the public loaded-runtime/source/founded-runtime contracts that should be discoverable by preflight.
