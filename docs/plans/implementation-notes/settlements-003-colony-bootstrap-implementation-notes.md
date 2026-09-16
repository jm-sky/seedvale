# Implementation Notes: Colony settlement bootstrap

**Plan:** `docs/plans/settlements-003-colony-bootstrap.md`  
**Reviewed:** 2026-09-16  
**Codebase:** `main`

## Review outcome

Plan direction remains correct: a founded colony should become ordinary settlement-domain state, not a quest-owned runtime or `MiningColonyManager`.

Current code makes three implementation details more important than the original plan states:

1. `createSettlement()` is still procedural-definition-shaped. It derives households and NPC ids from `SettlementDef.families`; founded residents therefore cannot be integrated merely by calling `NpcStateRegistry.getOrCreate()` with their existing ids.
2. `SettlementsManager` streaming is still procedural-grid-driven. A founded settlement outside the settlement grid needs an explicit manager-owned discovery/streaming path; adding a record to persistence alone will never make it load.
3. expedition arrival is now represented by generic `NpcAuthoritativeState.travel`: expedition purpose + `arrival: 'reached'`/blocked state. `ExpeditionAssignment` itself intentionally stops at `ready`; bootstrap must inspect member travel state rather than extend assignment state into a second travel lifecycle.

No dependency blocker remains from `world-019` or `settlements-npcs-028`.

## Current contracts to reuse

### Settlement lifecycle ownership

`src/settlement/SettlementsManager.ts`

- owns long-lived `EconomyRegistry`, `HouseholdRegistry`, `NpcStateRegistry`, relationships, livestock/rat persistence and structure state;
- `Entry` currently holds `{ def: SettlementDef, settlement, pendingPromise }`;
- `ensureLoaded(def)` is the materialization seam;
- procedural discovery uses `cellsWithinRadius(...)` + `settlementDefFor(...)`;
- `getEconomy`, `getHousehold`, `getNpcState` and snapshot methods already work independently of a live `Settlement`.

Founded state belongs at this manager lifetime, with save/rebuild snapshots threaded the same way as economies/households/NPC states.

### Procedural materialization constraint

`src/settlement/createSettlement.ts`

Current construction is tightly coupled to `SettlementDef`:

- `buildSettlementProps(...)` consumes `def.clearings`, `def.plan`, `def.size`, `def.foodSourceType`, `def.families`, etc.;
- household creation is index-aligned with `def.families` and uses `householdIdFor(def.id, familyIndex)`;
- NPC ids are recreated as `settlementNpcId(def.id, flatMemberIndex)`;
- role/name/family data also comes from the procedural family/member definitions.

Therefore **do not create a synthetic `SettlementDef`/`VillagePlan` for the colony** and do not remap expedition NPC ids into new settlement-derived ids.

The needed refactor is a narrow resident/runtime materialization seam below procedural worldgen, not a second settlement runtime.

### NPC identity source

`src/settlement/npcIdentity.ts` and the existing expedition code already treat procedural NPC identity as stable ids derived from the source settlement definition.

For V1 all founders come from one `sponsorSettlementId`. Their non-persistent identity/profile inputs (name, role, family member data) should be re-resolved from the sponsor `SettlementDef` + existing `memberNpcIds`; do not persist duplicate names/traits/roles in `FoundedSettlementRecord`.

Add/factor a helper that resolves a stable `NpcId` to the existing flattened member descriptor for a known procedural `SettlementDef`. Do not parse meaning back out of the id string when a deterministic definition lookup is available.

`NpcAuthoritativeState` remains the owner of mutable personal state and must be reused unchanged.

### Expedition arrival

`src/world/expeditionAssignment.ts`

- assignment states end at `forming | provisioned | ready` by design.

`src/ai/npcTravel.ts`

- expedition travel is marked with `purpose: { kind: 'expedition', assignmentId }`;
- logical arrival is `arrival: 'reached'`;
- `blocked` is the neutral cannot-progress state;
- travel is persisted in `NpcAuthoritativeState`.

Bootstrap readiness should require, for every assignment member:

- authoritative NPC state exists and NPC is alive;
- `travel.purpose` matches this expedition assignment;
- `travel.arrival === 'reached'`;
- `travel.blocked !== true`.

Do not add an `arrived` state to `ExpeditionAssignment` just for this plan.

### Site infrastructure

`src/world/siteInfrastructure.ts`

`querySiteInfrastructure({ x, z, radius })` already returns authoritative:

- completed terrain preparations;
- only wells whose water is currently usable (`isWellWaterAvailable`);
- Player garden records as cultivation areas.

The gold-colony consumer owns the `2 × size >= 6 + well + cultivation area` policy. Generic bootstrap receives a validated/readiness result; it must not copy these records into founded settlement persistence.

### Tents

`src/items/createPlacedTents.ts`

- `PlacedTents.get(id)` is an idempotency check;
- `place(..., from?: { id, condition })` accepts a stable external id and preserves condition;
- ordinary placement's timestamp id is irrelevant for colony tents;
- `PlacedTent` remains the owner of world transform/condition/repair.

`Inventory` already supports instance-backed items through `getInstances` / `getInstance` / `removeInstance`; tent placement actions are the reference for preserving the tent item's instance condition.

For each founding NPC, resolve exactly one real `tent` instance from `personalInventory`, remove it only after all preconditions for that household/tent mutation are satisfied, then call `PlacedTents.place()` with a deterministic colony tent id. A repeated bootstrap first checks `PlacedTents.get(stableTentId)` and never consumes again.

### Households

`src/settlement/household.ts`

- registry ids are arbitrary strings even though procedural code normally uses `householdIdFor(settlementId, familyIndex)`;
- `Household` stores `settlementId` and `homeId`;
- `homeId` is documented as a `Place.id`, so a raw `PlacedTent.id` should not silently be put there unless the home-place contract is intentionally widened.

Create deterministic founding household ids from `foundedSettlementId + npcId`.

Prefer introducing a minimal founded-home `Place`/home-anchor adapter whose stable id references the physical tent, while founded persistence stores only the binding needed to reconstruct it. Do not add household state onto `PlacedTent`.

Be careful with new household initialization: `createHousehold()` normally seeds small food/water/wood reserves for a never-before-seen household. Colony bootstrap must not accidentally mint supplies that were supposed to come from expedition provisioning. Either add an explicit founded-household initial-state path or supply an explicit zero/minimal snapshot; do not rely on ordinary first-family defaults without deciding this deliberately.

### Persistence / rebuild

Relevant files:

- `src/persistence/saveData.ts`
- `src/app/saveState.ts`
- `src/app/worldBundle.ts`
- `src/settlement/SettlementsManager.ts`

Follow the existing snapshot/carry pattern used by `settlementEconomies`, `households` and `npcStates`:

- `SaveData` stores only non-derivable founded records/membership/home bindings;
- `saveState.ts` snapshots them from `SettlementsManager`;
- fresh load passes them into world/settlement construction;
- `rebuildWorldBundle()` carries them unless reset semantics intentionally create a new world.

Older saves should restore with an empty founded registry. Prefer an optional/sparse field unless current save-version conventions require a migration for structural reasons.

## Recommended runtime split

Do not make `createSettlement()` a giant union of procedural-vs-founded conditionals.

Extract only the seam required to share live resident runtime. Conceptually:

```text
procedural SettlementDef
  -> procedural props/layout adapter
  -> resident descriptors
                         \
                          -> shared live settlement/NPC runtime
                         /
FoundedSettlementRecord
  -> founded anchors/tents/site infra adapter
  -> existing-Npc resident descriptors
```

The exact type name can follow code conventions (`SettlementRuntimeSpec`, `SettlementResidentSpec`, etc.). Keep it small: only fields the shared constructor genuinely needs.

The procedural path must stay behaviour-identical after extraction.

## Founded registry shape

Keep plain data and deterministic ids. Minimum useful state is approximately:

```ts
type FoundedSettlementRecord = {
  id: string
  siteId: string
  x: number
  z: number
  sponsorSettlementId: string
  residentNpcIds: NpcId[]
  foundedAtDays: number
}
```

Household ids and tent ids are deterministic from `(settlementId, npcId)` and need not be duplicated unless implementation discovers a non-derivable binding. Persist home-anchor references only when they cannot be reconstructed from those stable ids.

Do not persist economy, NPC state, inventory, tents, wells, cultivation records or terrain-preparation records here.

Expose manager-level read APIs needed by other systems rather than leaking the mutable registry.

## Residency ownership

Add one explicit manager-lifetime mapping:

```text
NpcId -> current settlementId override
```

Only migrated/founded residents need entries in V1. Procedural residents without an override keep their existing source-settlement interpretation.

The mapping must be consulted by newly extracted resident materialization / settlement-aware lookups. Do not mutate `NpcAuthoritativeState` just to store residency; health/needs/inventory/travel are a different state concern.

On bootstrap commit, all founders switch residency atomically with founded-record creation. Repeated calls verify the same binding and return `existing`.

## Streaming integration

Current `SettlementsManager.update()` discovers procedural settlements by grid cells. Founded settlements must be checked separately by their stored world centers:

- within `loadRadius` -> materialize through the same `Entry`/load lifecycle;
- beyond `unloadRadius` -> dispose the live `Settlement`, retaining registries/record;
- never insert founded records into `settlementPlanCache` or fabricate grid coordinates;
- home settlement special-case remains procedural cell `(0,0)`.

The expected founded-settlement count is small, so a bounded linear scan over founded records is acceptable for V1; do not add a spatial index prematurely.

Any manager API that enumerates known settlements for economy/logistics/reputation should use the union of procedural materialized refs + founded records where semantically appropriate. Do not automatically add procedural roads/signposts/cemeteries to a colony unless another plan explicitly owns that.

## Bootstrap transaction boundary

Make the operation deterministic and idempotent. Recommended order:

1. Resolve assignment + stable site identity.
2. If founded record for `siteId` exists, validate compatible sponsor/members and return `existing` after repairing only safe derived bindings.
3. Validate all expedition members are alive and have matching reached travel.
4. Validate consumer-provided site-readiness result.
5. Resolve every member's authoritative state and required tent instance **without mutating**.
6. Precompute settlement/household/tent/home ids and verify no conflicting existing objects.
7. Create founded record + residency mappings.
8. Create/reuse household records with explicit colony starting-state semantics.
9. Remove each resolved tent instance and place the matching deterministic physical tent.
10. Create/reuse founded economy through the existing economy registry.
11. Clear/consume expedition travel purpose only if the generic travel contract has an existing explicit acknowledgement helper; otherwise leave arrival observation ownership with the expedition/travel layer and record bootstrap completion through the founded record, not an ad-hoc flag.

If current APIs make steps 7-10 capable of partial failure, first add a small preflight/result phase so all fallible conditions are checked before irreversible inventory removal. Do not implement rollback by recreating approximate items.

## Staged implementation

### Stage 1 — founded state + persistence foundation

Scope:

- new founded-settlement plain-data registry owned by `SettlementsManager`;
- deterministic settlement/household/tent ids;
- residency override registry/resolver;
- snapshot/save/load/rebuild plumbing;
- pure validation/idempotency tests;
- no visual/live colony materialization yet.

Goal: make ownership and persistence correct before touching the large settlement constructor.

### Stage 2 — resident materialization refactor

Scope:

- extract the smallest shared resident/runtime seam from `createSettlement()`;
- procedural adapter remains behaviour-identical;
- add resolver from sponsor `SettlementDef` + existing `NpcId` to resident descriptor;
- support explicit existing NPC ids and explicit household ids/home anchors;
- tests proving procedural NPC ids/households are unchanged and founded descriptors reuse the original `NpcAuthoritativeState`.

This is the highest-risk stage and should be isolated from bootstrap side effects.

### Stage 3 — bootstrap transaction + tents/households/economy

Scope:

- implement `bootstrapFoundedSettlement(...)` on the settlement ownership boundary;
- check generic travel arrival;
- create founded households using deliberate no-free-supplies semantics;
- consume real tent instances once and place stable `PlacedTent`s;
- bind home anchors;
- initialize existing `EconomyRegistry` entry;
- idempotency and failure-without-mutation tests.

### Stage 4 — streaming/live founded settlement integration

Scope:

- union founded records into `SettlementsManager` load/unload checks;
- founded presentation/runtime adapter uses real tents/well/cultivation anchors instead of `VillagePlan` props;
- ensure loaded founded NPCs use existing identities/state and current residency;
- expose founded settlement through appropriate known-settlement/economy lookups;
- stream-out/in + save/load tests.

### Stage 5 — gold-colony consumer integration

Only if implemented in the same delivery; otherwise leave to `quests-progression-010`:

- consumer calls `querySiteInfrastructure()`;
- applies mine-specific readiness policy;
- passes assignment/site into generic bootstrap;
- observes `created | existing | not_ready` without owning settlement state.

Do not move quest stages/dialogue into settlements code.

## Concrete files likely to change

Core:

- `src/settlement/SettlementsManager.ts`
- `src/settlement/createSettlement.ts`
- new focused file under `src/settlement/` for founded registry/bootstrap contracts
- `src/settlement/household.ts` only if an explicit non-seeding creation option is required
- `src/settlement/npcIdentity.ts` for reusable stable-id -> procedural resident descriptor resolution if this is the best existing ownership location

World/app wiring:

- `src/app/worldBundle.ts`
- `src/app/saveState.ts`
- `src/persistence/saveData.ts`
- `src/items/createPlacedTents.ts` should normally remain unchanged; consume its existing API
- `src/world/siteInfrastructure.ts` should remain unchanged
- expedition/travel modules should remain unchanged unless an existing-arrival acknowledgement seam needs a narrowly reusable helper

Tests should be colocated with the new founded/bootstrap module plus focused regression tests for `createSettlement`/manager streaming where needed.

## Guardrails

- no `MiningColonyManager`;
- no quest-owned residents/economy/households;
- no new NPC ids for founders;
- no synthetic `VillagePlan`/fake procedural families solely to satisfy `createSettlement()`;
- no copied well/garden/terrain-preparation state;
- no second off-screen colony simulation;
- no timestamp/random ids for founded settlement/household/tent bindings;
- no implicit free expedition supplies through ordinary household initialization;
- no correctness based on a single `bootstrapComplete` boolean.

Add JSDoc with `@domain settlements` on the public founded registry/bootstrap/residency contracts and on any new shared settlement-runtime seam that architecture preflight should discover.

## Verification

Focused automated coverage should prove:

- stable ids from stable `siteId` / `settlementId + npcId`;
- bootstrap before arrival or with blocked/dead/missing member -> no mutation;
- bootstrap with missing site readiness -> no mutation;
- bootstrap twice -> one founded record, one residency binding per NPC, one household and tent per founder, one economy;
- tent instance condition is preserved and each inventory loses exactly one real tent once;
- founders keep the same `NpcId` and same registry-owned authoritative state;
- procedural settlement generation/materialization produces the same ids/households as before the refactor;
- save/load and `WorldBundle` rebuild preserve founded records/residency/home bindings;
- founded settlement loads when player approaches even though it has no procedural grid cell, unloads by the normal radius, and reloads with the same economy/NPC/household state;
- founded site uses authoritative Player well/cultivation/tent anchors rather than cloned infrastructure;
- typecheck + focused tests + build pass.

Player performs browser/gameplay verification; AI does not run browser verification.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
