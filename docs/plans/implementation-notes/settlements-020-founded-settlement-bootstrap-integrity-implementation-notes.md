# Implementation Notes: Founded settlement bootstrap integrity

Plan: `settlements-020-founded-settlement-bootstrap-integrity.md`  
Reviewed against `main`: 2026-09-19 (`795a2f973bcc7c4afb501f528af7f1c0055e8ba6`)

## Scope boundary

This delivery is a correctness pass over the already-landed authoritative bootstrap from `settlements-003`.

It owns:

- stable semantic founded-home identity;
- deterministic physical tent placement;
- strict bootstrap/re-bootstrap consistency;
- legacy Stage-3 reconciliation;
- lossless `PlacedTent` relocation;
- the minimum persistence/registry seams required to make those repairs safe.

It does **not** own live founded `NpcAgent` materialization, presentation ownership, profession/runtime capabilities, loaded-settlement types, manager streaming, async loading, unload/time-skip behavior, or founded runtime adapters. Those belong to `settlements-021` / `settlements-022`.

There is currently no implemented `quests-progression-010` gameplay call-site. The live API path is `WorldBundle.bootstrapFoundedSettlement(...) -> SettlementsManager.bootstrapFoundedSettlement(...) -> bootstrapFoundedSettlement(...)`; quest documents are future consumers. Do not add quest stages/dialogue merely to exercise this plan.

## Verified current ownership

- `src/settlement/foundedSettlement.ts`
  - `FoundedSettlementRegistry` owns founded records and the explicit `NpcId -> settlementId` residency override.
  - `foundedSettlementId`, `foundedHouseholdId`, and `foundedTentId` are already the stable ID source.
  - Add `foundedHomePlaceId(settlementId, npcId)` here, beside the other founded IDs. Do not change procedural `homePlaceId()` semantics.

- `src/settlement/foundedSettlementBootstrap.ts`
  - `bootstrapFoundedSettlement()` is the sole arrived-expedition -> founded-state transaction.
  - New-settlement preflight already validates authoritative NPC state/travel/tent inventory before mutation.
  - The current `existing` path is too permissive: it repairs residency, mints a condition-100 tent when missing, and calls `getOrCreate()` without checking source/site/sponsor/member/binding consistency.
  - New tents are currently all placed at `input.x/input.z`, `yaw = 0`.
  - `FoundedSettlementTentsDeps.get` is currently narrowed to `{ id }`; widen only enough for transform/condition-state validation and relocation.

- `src/items/createPlacedTents.ts`
  - `PlacedTents` is the authoritative physical tent owner.
  - `nodes()/get()` round-trip `id/x/z/yaw/condition/lastConditionUpdateAtDays/repair`.
  - `pack()` is gameplay transfer and blocks active repairs; it is not a migration primitive.
  - Add a narrow `relocate(id, x, z, yaw): boolean` operation. Mutate the existing entry transform and mesh in place; preserve `condition`, `lastConditionUpdateAtDays`, and `repair`. Reuse `placeOnGround(..., sampleHeight)` for the mesh position, and set `mesh.rotation.y` to the new yaw. Do not pack/place or recreate the record.

- `src/settlement/household.ts`
  - `Household.homeId` is explicitly a `Place.id` and is `readonly`.
  - `HouseholdRegistry.getOrCreate()` returns an existing object unchanged, so it cannot repair a legacy raw-tent `homeId`.
  - `HouseholdSnapshot` persists resources/agriculture only; it does **not** persist `id/settlementId/homeId`. Those bindings are reconstructed at registry creation call-sites.
  - Therefore add the smallest registry-level binding repair seam needed by this plan. It must preserve the household snapshot exactly while replacing/rebinding only `settlementId/homeId`. Do not turn `Household.homeId` into a general mutable field and do not add founded state to the snapshot.
  - Because founded residents have no live runtime yet, replacing the registry object from its own `snapshot()` is acceptable if that is the smallest implementation; keep this seam narrow so `021` can consume the corrected registry state rather than inheriting a new runtime abstraction.

- `src/settlement/places.ts`
  - `homeIndexFromPlaceId()` intentionally accepts only `${settlementId}:home:<integer>`.
  - Leave it unchanged. A founded semantic home must return `null` here and must not become procedural lodging.

- persistence
  - `SaveData.foundedSettlements` is serialized via `SettlementsManager.snapshotFoundedSettlements()`.
  - physical tents are serialized independently through the existing `PlacedTents.nodes()` path.
  - household binding identity is reconstructed rather than stored in `HouseholdSnapshot`.
  - No save-schema/version change is needed for semantic-home or tent-position repair; reconciliation should run through bootstrap/rebuild boundaries using the existing persisted records.

## Stable semantic home

Add:

```ts
foundedHomePlaceId(settlementId: string, npcId: NpcId): string
```

Use a namespace distinct from both procedural homes and physical tents, e.g. `${settlementId}:home:founder:${npcId}`.

The founded household must use this ID for `Household.homeId`.

Add a narrow resolver in the founded-settlement module (or a small adjacent file if imports would otherwise cycle), conceptually:

```ts
resolveFoundedHomePlace(record, npcId, placedTents): Place | null
```

Rules:

- require `npcId` to belong to `record.residentNpcIds`;
- resolve the stable physical tent with `foundedTentId(record.id, npcId)`;
- return `null` if the tent is absent;
- return a `Place { id: foundedHomePlaceId(...), type: 'home', position }` whose coordinates come from the current physical tent;
- do not cache/copy the tent coordinates into `FoundedSettlementRecord` or `Household`;
- do not introduce a general home/capability abstraction here.

The resolver is the contract `021/022` should reuse later.

## Deterministic camp layout

Add one pure bounded helper close to the founded bootstrap code, e.g. `resolveFoundedCampLayout(...)`.

Input should be plain data only: founded/site identity, settlement/camp center, and the ordered resident/member IDs. Output should contain one descriptor per NPC: `npcId/x/z/yaw`.

Implementation constraints:

- deterministic and allocation-bounded for the fixed expedition party;
- order follows `residentNpcIds` / assignment member order;
- use a small fixed-radius/ring or equivalent compact formation around the center;
- rotate the formation by a deterministic hash of stable founded/site identity so yaw/placement are stable without runtime RNG;
- each tent receives a distinct position and stable yaw;
- use the exact same helper for first creation, repeated validation, and legacy reconciliation.

Do not use village planning, terrain scans, frame RNG, or a new seed field.

If bootstrap input is extended for a consumer-selected prepared footprint, keep it optional and plain-data (validated center/orientation/bounds only). There is no current quest call-site to update, so do not invent a world query inside settlement code. Default to the existing `input.x/input.z` center when no validated footprint is supplied.

## Result contract and consistency

Extend the result union with an explicit persistent inconsistency branch. Keep transient readiness failures as `not_ready`.

Prefer a small reason union rather than free-form strings, covering at least:

- founded record/site/id mismatch;
- sponsor mismatch;
- ordered member-set mismatch;
- household binding conflict;
- missing persisted founded tent;
- incompatible pre-existing stable tent / placement conflict;
- unrecognized legacy state.

The exact names may follow repository naming conventions, but callers must be able to distinguish persistent corruption/conflict from “try later”.

### Existing record path

Before any repair, validate all expected facts for the full record:

1. `record.id === foundedSettlementId(record.siteId)` and requested `siteId` resolves to this same record.
2. requested sponsor matches `record.sponsorSettlementId`.
3. requested ordered member IDs match `record.residentNpcIds` when an assignment is supplied to this repeat call.
4. every expected founded household is absent-but-reconstructible or belongs to the same settlement and expected semantic home; legacy raw-tent `homeId` is repairable only under the recognized legacy signature below.
5. every expected stable physical tent exists, unless this is a brand-new transaction before the record exists.
6. existing physical tent state is either already at the deterministic expected placement or matches the recognized legacy Stage-3 placement.
7. residency overrides may be restored as derived state after the authoritative facts above are validated.

A missing physical tent for an existing founded record is **not** repairable here. Do not consume inventory and do not create a condition-100 replacement.

### New record path

Precompute before mutation:

- stable settlement/household/home/tent IDs;
- complete deterministic camp layout;
- all NPC travel/state checks;
- all real tent instances and conditions;
- conflicts with an existing founded record;
- conflicts with any pre-existing stable tent IDs;
- conflicts with any pre-existing stable household IDs.

A pre-existing stable tent with no founded record must not be accepted merely because its ID matches. It can only be adopted if the complete physical binding available to this layer matches the expected deterministic placement; otherwise return `inconsistent`. Never call `place()` for an already-existing stable ID.

Only after the whole set passes should the transaction create the founded record/economy/residency/households, remove inventory tent instances, place missing physical tents, and clear completed travel.

Keep the existing zero-supply household snapshot and economy initialization semantics unchanged.

## Legacy Stage-3 reconciliation

Recognize legacy state narrowly:

- founded record exists;
- all expected stable tents exist;
- each expected tent is at/near the record center and has legacy `yaw === 0`;
- household binding is either the raw matching `foundedTentId` or already the corrected semantic `foundedHomePlaceId`;
- no unexpected sponsor/member/id conflict exists.

Use a small numeric epsilon for saved float comparisons; do not require bit-exact JSON floats.

Reconciliation should have two phases:

1. inspect the **entire** founded household/tent set and classify it as already-correct, recognized-legacy, or inconsistent;
2. only for already-correct/recognized-legacy state, apply all residency/home repairs and all required `PlacedTents.relocate()` calls.

Do not start relocating tents while still discovering whether a later member conflicts.

A second reconciliation must be a no-op apart from harmless restoration of derived residency bindings.

## Household repair detail

The present registry API is an implementation trap: calling

```ts
households.getOrCreate(id, settlementId, correctedHomeId, ...)
```

does not update an existing household.

Add a narrow registry operation such as `rebindHome(...)` / `replaceBinding(...)`, with these invariants:

- only the requested household binding changes;
- water/items/agriculture/hay and all other snapshot state survive exactly;
- unknown household returns a clear failure instead of silently creating arbitrary state;
- settlement mismatch is rejected;
- procedural households are unaffected unless an explicit caller invokes the operation.

Use this operation only for recognized founded legacy repair in 020. Do not generalize it into resident migration/runtime ownership; that is outside this plan.

## Integration points

- `SettlementsManager.bootstrapFoundedSettlement(input, placedTents)` should continue to assemble the domain deps; do not give the manager permanent `PlacedTents` ownership.
- `WorldBundle.bootstrapFoundedSettlement(...)` remains the public app seam and continues to inject `nowDays`.
- If the bootstrap result/input types change, update these type surfaces and focused tests only.
- Do not modify `createSettlement.ts`, `NpcAgent.ts`, visitor presentation logic, `SettlementsManager` streaming entries, `getLoaded()`, or settlement load/unload loops for this plan.

## Tests to extend

Primary coverage stays in `src/settlement/foundedSettlementBootstrap.test.ts`. Its current fake tents retain only `id/condition`; expand it to record `x/z/yaw/lastConditionUpdateAtDays/repair` and implement the new relocation seam.

Add focused tests for:

- unique deterministic placements + stable yaw for all three founders;
- repeat resolution produces identical descriptors;
- household `homeId === foundedHomePlaceId(...)`;
- founded-home resolver follows the real tent transform;
- `homeIndexFromPlaceId()` returns `null` for founded home IDs;
- existing founded settlement with missing tent -> `inconsistent`, no free tent and no inventory consumption;
- sponsor/member/site mismatch -> `inconsistent`, no mutation;
- pre-existing incompatible stable tent before record creation -> `inconsistent`;
- repeated correct bootstrap -> `existing`, no second consumption/placement;
- legacy overlapped tents + raw tent home IDs -> one reconciliation to deterministic layout + semantic homes;
- second reconciliation is idempotent;
- a non-legacy displaced founded tent is not silently relocated;
- `PlacedTents.relocate()` preserves condition, last condition update, and active repair progress while moving the mesh/record;
- save/recreate using founded registry + placed tent snapshots converges to corrected state.

Add/extend `createPlacedTents` unit coverage rather than testing relocation only through a fake if existing item tests provide a Three.js test scene seam.

Run focused tests, `npx tsc --noEmit`, `pnpm run lint:fix`, `pnpm run build`, and the repository test suite as required by the implementation workflow. Browser verification remains the User's responsibility.

## Follow-on contract

After 020:

- `settlements-021` receives corrected residency, founded household bindings, `foundedHomePlaceId`, and the narrow home resolver; it owns presentation-owner policy and shared resident materialization.
- `settlements-022` receives stable physical tent positions through that resolver; it owns founded loaded runtime, runtime capabilities, streaming and async lifecycle.
- Neither follow-on should recompute camp placement or reinterpret physical tent IDs as household identity.
