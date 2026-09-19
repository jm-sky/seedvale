# Implementation Notes: Shared settlement resident runtime

Plan: `settlements-021-shared-settlement-resident-runtime.md`  
Reviewed against `main`: 2026-09-19 (`cdcedfd32ae2e5970cace8007495a7414a3409cb`)

## Scope boundary

This plan is the reusable resident-runtime refactor between bootstrap integrity (`settlements-020`) and founded live streaming (`settlements-022`).

It owns:

- one deterministic presentation-owner policy for procedural residents, founded residency overrides and travelling merchants;
- separation of immutable identity origin from current residency / current household / current home;
- the minimum procedural-independent NPC runtime inputs needed to stop `NpcAgent`, profession work and logistics from requiring a complete procedural `SettlementLandmarks`;
- a shared existing-`NpcId` resident descriptor/materializer used by the procedural path now and by founded runtime later;
- graceful absence of nonprocedural infrastructure;
- preservation of current procedural behavior.

It does **not** own:

- founded world-space discovery or streaming;
- `SettlementsManager.Entry` source discrimination;
- founded loaded-runtime construction;
- async desired-load/generation-token safety;
- capability-aware settlement unload/time-skip;
- external `getLoaded()` consumer migration.

Those are `settlements-022`.

Do not turn 021 into the loaded-settlement refactor from 022.

## Dependency on settlements-020

Current `main` still contains the Stage-3 founded bootstrap shape. The implementation notes for `settlements-020` define the corrected contract that 021 should consume:

- stable semantic founded home id, distinct from the physical tent id;
- `resolveFoundedHomePlace(...)` returning a real `Place` backed by the stable physical tent;
- strict founded household binding.

Treat that as an implementation dependency, not something to redesign in 021. If 020 has not landed when implementation starts, stop before founded-home integration rather than recreating an alternative home-binding mechanism.

021 should not mutate `PlacedTents` or founded camp layout.

## Verified current ownership and lifecycle

### `SettlementsManager`

`src/settlement/SettlementsManager.ts` is still the manager-lifetime owner of:

- `NpcStateRegistry`;
- `HouseholdRegistry`;
- `EconomyRegistry`;
- `FoundedSettlementRegistry`.

`settlementDeps` is assembled once around lines ~844+ and already injects the shared registries and world hooks into every procedural `createSettlement()` call.

Use this composition point for the presentation-owner resolver / residency lookup. Do not let `NpcAgent` import `FoundedSettlementRegistry`.

Current streaming entries are still:

```ts
type Entry = {
  def: SettlementDef
  settlement: Settlement | null
  pendingPromise: Promise<void> | null
}
```

Leave this shape alone in 021. Source discrimination belongs to 022.

### `createSettlement()`

`src/settlement/createSettlement.ts` still owns both procedural world construction and resident materialization.

Important existing order for a normal resident:

1. derive stable `NpcId` from flattened member order;
2. resolve workplace/profile;
3. build stable physical profile seed;
4. `npcStateRegistry.getOrCreate(...)`;
5. seed merchant stock when applicable;
6. `finalizeExpiredNpcCorpse(...)`;
7. `shouldSkipNpcCorpsePresentation(...)`;
8. `isNpcAwayOnMerchantJourney(...)`;
9. `NpcAgent.create(...)`;
10. add the mesh to the scene.

The shared materializer must preserve that ordering where the step applies.

The visitor path repeats much of steps 3/4/6/7/9 and is therefore the strongest existing proof that this extraction should be one shared existing-`NpcId` pipeline rather than a founded-only helper.

### Authoritative state vs presentation

`NpcAuthoritativeState` remains registry-owned and survives live-agent disposal. A live `NpcAgent` is reconstruction/presentation.

Do not add a second resident-state registry.

The presentation gate must run **after** required authoritative post-death maintenance but **before** creating a live/corpse presentation for a settlement that does not own that NPC.

## Presentation-owner seam

Add one pure, Three.js-free policy near settlement identity/runtime ownership. A small adjacent module such as `npcPresentationOwner.ts` is preferable to embedding the rule in `createSettlement.ts`; `npcIdentity.ts` should remain primarily about immutable source identity.

Conceptual input:

```ts
type NpcPresentationOwnershipInput = {
  sourceSettlementId: string
  residencyOverride?: string
  merchantJourney: NpcAuthoritativeState['merchantJourney']
}
```

Conceptual output:

```ts
type NpcPresentationOwner =
  | { kind: 'settlement'; settlementId: string }
  | { kind: 'none' }
```

Policy:

- merchant `visiting` -> destination settlement;
- merchant `outbound` / `returning` -> none;
- otherwise explicit residency override -> that settlement;
- otherwise -> source settlement.

Do not infer ownership from loaded entries, live agents, scene objects or household ids.

### Call-sites

Use the same resolver in both places that currently have separate semantics:

- normal resident suppression in `createSettlement()`;
- `SettlementsManager.resolveTravellingVisitors()` / visitor-spawn selection.

That avoids a home-path guard and a visitor-path guard drifting apart.

The procedural resident path should receive a narrow lookup/predicate through `CreateSettlementDeps`, backed by `FoundedSettlementRegistry.residencySettlementId(npcId)` plus the authoritative `NpcStateRegistry` object already in scope.

Do not add a global `Map<NpcId, liveOwner>` as correctness state. A test/debug assertion map is acceptable only as a duplicate-presentation detector.

## Identity origin must stay separate from current residency

Reuse `resolveSettlementNpcHomeDescriptor(def, npcId)` as the canonical immutable source descriptor for an existing procedural-origin NPC.

It already returns:

- stable `npcId`;
- flattened `memberIndex`;
- source `familyIndex`;
- `FamilyMember`;
- `familyMembers`.

It intentionally does **not** contain current household/home.

For a founder after 020/003:

- identity descriptor comes from the sponsor `SettlementDef`;
- physical profile seed comes from sponsor/source member index via `settlementMemberPhysicalSeed`;
- current `Household` comes from the founded household id;
- current `Place` comes from `resolveFoundedHomePlace(...)`;
- current settlement id comes from the residency override.

Do not add duplicated name/role/profile/family data to `FoundedSettlementRecord`.

## Actual `SettlementLandmarks` coupling found on main

The blocker is real, but it is narrower than the entire landmarks object.

### Direct reads in `NpcAgent.ts`

Current direct reads are concentrated around:

- water: `well`, optional `wells`;
- food fallback / idle: `garden`;
- wood: `trees`, `plaza`;
- dock movement: `dockRoute`;
- pasture projection into profession context: `pasture`;
- collision fallback points: `well`, `stockpile`, `garden`.

### `npcProfessionWork.ts`

`NpcWorkContext` currently carries the entire `SettlementLandmarks`, but planners only need:

- Farmer: cultivation anchors + garden fallback;
- Fisher: dock;
- Guard: patrol points;
- Trader / transport unload: settlement storage destinations;
- Blacksmith: already mostly represented by pre-resolved `workplace`;
- Shepherd: already accepts `pasture` as a narrow field;
- other profession hooks are already narrow (`SettlementMiningHooks`, `SettlementFoodSourceHooks`, `SettlementHerbalGatherHooks`, etc.).

### `npcLogistics.ts`

`NpcLogisticsCtx` only needs landmark data to resolve settlement stock/storage pickup positions.

This should become a narrow physical-routing destination contract, not a full landmarks dependency.

### `places.ts`

`workplaceFor()` is procedural adapter logic. Keep it procedural.

Do not force the shared materializer to call `workplaceFor()`. It should receive `workplace: Place | null` already resolved by the caller.

## Recommended runtime input shape

Do **not** introduce one new `SettlementNpcCapabilities` mirror of `SettlementLandmarks`.

Prefer a few explicit narrow inputs with semantic names. The exact final names may follow existing conventions, but keep these ownership boundaries:

### Pre-resolved places

Already existing and reusable:

- `home: Place`;
- `workplace: Place | null`;
- `socialPlace: Place | null`.

### Work / logistics anchors

Add the minimum plain runtime routing inputs required by current planners, conceptually:

```ts
type NpcResidentAnchors = {
  waterSources: readonly { position: Vector3; queueId?: string }[]
  fallbackFoodAnchor: Vector3 | null
  wood: {
    trees: readonly SettlementTreeLandmark[]
    plaza?: VillagePlaza
  } | null
  dock: Vector3 | null
  dockRoute: readonly Vector3[]
  patrolPoints: readonly Vector3[]
  settlementStorage: {
    food: Vector3
    wood: Vector3
    ore: Vector3
  } | null
  pasture: { x: number; z: number; radius: number } | null
}
```

This is illustrative, not a requirement to create one object exactly like this. If smaller existing types can be reused, prefer them.

Critical semantics:

- storage routing may be absent;
- dock may be absent;
- patrol points may contain only real anchors;
- water may be absent from a nonprocedural site;
- no field may be populated with settlement center/home merely to satisfy typing.

For procedural settlements, build these inputs once from `SettlementLandmarks` and preserve exact current targets.

## Specific refactors to perform before the materializer extraction

### 1. Profession context

Remove full `SettlementLandmarks` from `NpcWorkContext`.

Replace individual planner reads:

- Farmer -> existing `cultivationAnchor` plus optional procedural fallback anchor supplied by adapter;
- Fisher -> `fishingAnchor` / dock capability;
- Guard -> `guardPatrolPoints`;
- local transport unload -> pre-resolved settlement storage destination(s).

Update `advanceGuardPatrol` so modulo follows the actual patrol-point count rather than hard-coded `% 3`. Procedural adapter still supplies exactly `[home, well, market]`, preserving behavior.

If patrol points are empty, return `null` and let ordinary idle/pressure behavior win.

### 2. Logistics context

Remove full `SettlementLandmarks` from `NpcLogisticsCtx`.

Pass a narrow settlement-storage resolver/destinations. `planEconomyWithdraw()` must return `null` if the required physical destination is absent even when economy stock exists.

Keep authoritative quantity ownership in `Household` / `SettlementEconomy`; these new inputs are routing only.

### 3. NpcAgent direct landmark reads

Replace only the direct fields needed to construct a nonprocedural resident.

Important traps:

- water SFX/facing currently falls back to `landmarks.well`; carry the chosen real water target through the planned action / queue data instead of requiring a global well;
- tree work needs the current tree list + plaza exclusion rule, not a generic settlement object;
- `garden` is used for old fallback/idle behavior; procedural adapter can supply it, founded runtime may supply no equivalent;
- `dockRoute` can safely be empty;
- collision fallback currently probes well/stockpile/garden. Refactor this to a bounded list of real local avoidance/fallback anchors; empty is legal. Do not synthesize three anchors for founded sites.

Do not remove `SettlementLandmarks` from unrelated settlement presentation code.

## Shared resident descriptor and materializer

Create a descriptor separate from `NpcAgentDeps`.

`NpcAgentDeps` is still a low-level agent-construction dependency bag. The new descriptor should represent one settlement resident with already-resolved current context.

Conceptually:

```ts
type SettlementResidentDescriptor = {
  npcId: NpcId
  member: FamilyMember
  familyMembers: readonly FamilyMemberRef[]
  physicalSeed: number
  household: Household | null
  home: Place
  workplace: Place | null
  socialPlace: Place | null
  runtimeAnchors: ...
  needOffset: number
  merchantProfile?: ...
}
```

The shared materializer should also receive shared runtime deps/registries rather than closing over a `SettlementDef`.

Responsibilities:

1. generate `PhysicalProfile` from the supplied stable seed + immutable member;
2. reuse supplied existing authoritative state or `NpcStateRegistry.getOrCreate(npcId, ...)` when this is still the procedural first-materialization path;
3. perform post-death cleanup;
4. apply presentation-owner gate;
5. apply merchant stock/profile initialization only when the descriptor requests the procedural merchant semantics;
6. call `NpcAgent.create(...)`;
7. register the mesh in the scene only after successful creation.

It must not:

- generate `npcId`;
- create a household;
- derive current home from `familyIndex`;
- call `workplaceFor()`;
- require `SettlementDef`;
- build props/landmarks;
- inspect founded records.

The procedural adapter in `createSettlement()` remains responsible for deriving descriptors from `def.families`, current procedural household/home/workplace/social inputs and merchant assignments.

The 022 founded adapter will later resolve sponsor identity, founded household/home and real site capabilities, then call the same materializer.

## Visitor path

Do not keep the existing visitor `NpcAgent.create()` block as a second creation pipeline after introducing the materializer.

Convert `TravellingVisitorSpawn` into the same descriptor/materializer input where practical:

- existing `npcId`;
- source identity from `resolveSettlementNpcHomeDescriptor`;
- same physical seed;
- authoritative shared `NpcStateRegistry`;
- destination-local presentation owner;
- destination anchor as temporary home/presentation place;
- `workplace: null`;
- visitor does not gain destination profession semantics.

This preserves settlements-npcs-038 behavior while removing duplicate lifecycle ordering.

## Procedural adapter requirements

`createSettlement()` should keep all procedural layout/build steps and only adapt them into resident descriptors.

For every ordinary resident preserve exactly:

- `settlementNpcId(def.id, i)`;
- `households[familyIndex]`;
- current `homePlaces[familyIndex]`;
- `workplaceFor(...)` result and merchant paddock override;
- `socialPlace`;
- merchant specialization/stock seeding;
- household/family refs;
- existing hooks and queues.

Do not change family flattening order, seeds, role assignment, work cadence, NPC update loops or scene-registration count.

## Tests worth adding before touching 022

### Pure presentation-owner matrix

Test the public pure ownership resolver independently of scene/model loading:

- procedural no override -> source;
- residency override -> override settlement;
- merchant outbound -> none;
- merchant visiting -> destination;
- merchant returning -> none;
- override + merchant journey -> journey wins.

Also test the sponsor/founded case explicitly: source loaded + override elsewhere must not materialize at source.

### Materializer tests

Use a small fake/minimal dependency setup around the new descriptor/materializer where possible; avoid requiring a fully generated village.

Cover:

- passed `NpcAuthoritativeState` object identity is preserved;
- suppressed presentation still performs required post-death maintenance;
- no infrastructure -> no crash and no synthetic work/storage target;
- duplicate/debug assertion catches two live materializations of one `NpcId` when intentionally exercised;
- visitor and normal procedural paths both use the same materializer.

### Procedural regression tests

Focused assertions around adapter outputs are cheaper and more stable than snapshotting a whole settlement:

- same ids and household bindings;
- same home/workplace resolution by role;
- Guard gets exactly home/well/market;
- Fisher gets real dock or no fishing capability;
- Farmer gets existing cultivation fallback;
- storage destinations equal current `settlementStorageDestination(...)` outputs;
- wood/tree eligibility still respects `plaza`.

## Implementation order

1. Add/test the pure presentation-owner helper.
2. Thread residency/presentation ownership through `SettlementsManager -> CreateSettlementDeps` and replace merchant-home suppression with the shared policy.
3. Narrow `NpcWorkContext` and `NpcLogisticsCtx`; preserve procedural adapters.
4. Replace the remaining direct `NpcAgent` landmark reads required for nonprocedural materialization with narrow runtime anchors.
5. Introduce `SettlementResidentDescriptor` + shared materializer.
6. Move normal procedural residents onto it.
7. Move travelling visitors onto the same materializer.
8. Add one-live-agent and procedural regression tests.
9. Stop. Do not change manager entries/streaming or create a founded loaded runtime; that is the handoff to 022.

## Files likely to change

Primary:

- `src/settlement/createSettlement.ts`;
- `src/settlement/SettlementsManager.ts`;
- `src/settlement/npcIdentity.ts`;
- new small presentation-owner and/or resident-materializer module under `src/settlement/`;
- `src/ai/NpcAgent.ts`;
- `src/ai/npcProfessionWork.ts`;
- `src/ai/npcLogistics.ts`.

Possible small supporting changes:

- `src/settlement/places.ts` for procedural adapter helpers only;
- `src/settlement/storageDestinations.ts` if a narrow routing type/helper naturally belongs there;
- focused tests adjacent to the new pure modules and existing AI planners.

Avoid modifying:

- `SettlementsManager.Entry` / streaming loops;
- `createSettlement` return `Settlement` loaded-runtime shape;
- `src/app/worldBundle.ts` unless a compile-only type thread is genuinely required;
- founded record persistence;
- external loaded-settlement consumers.

## Verification

Run the smallest focused tests first, then:

```text
npx tsc --noEmit
pnpm run lint:fix
pnpm run build
pnpm run test
```

Player performs browser/gameplay verification. AI does not run browser verification.

Add JSDoc with `@domain settlements` to the public presentation-owner policy and shared resident descriptor/materializer so preflight can discover the seam for `settlements-022`.
