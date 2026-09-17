# Implementation Notes: settlements-npcs-038 — Travelling Merchant inter-settlement role

**Plan:** `settlements-npcs-038-travelling-merchant-inter-settlement-role.md`  
**Status:** `verification needed` 🔍

## Implementation status (all 3 stages implemented)

- `src/settlement/merchantJourney.ts` (new) — `MerchantJourneyState`, phase
  transitions (`advanceMerchantJourneyToVisiting`, `tryBeginMerchantReturn`,
  `resolveMerchantReturnArrival`), `isNpcAwayOnMerchantJourney`,
  `TRAVELLING_MERCHANT_VISIT_DAYS`.
- `NpcAuthoritativeState.merchantJourney` + `NpcStateSnapshot`/save
  validation (`src/settlement/npcState.ts`, `src/persistence/saveData.ts`) —
  sparse optional field, legacy saves restore with no journey.
- `NpcTravelPurpose` extended with `{ kind: 'merchant-return', homeSettlementId }`
  (`src/ai/npcTravel.ts`), including clone/validation support.
- Home away-suppression + generic foreign-visitor materialization in
  `src/settlement/createSettlement.ts`, driven by
  `SettlementsManager.resolveTravellingVisitors()` (resolves home identity
  from the cached `SettlementDef` via `defFor`/`knownSettlements`, never by
  loading home) — one live `NpcAgent` per currently-`visiting` merchant,
  anchored at the destination's own trader stall, `workplace: null` so it
  never performs the destination's Trader work. New identity helpers in
  `src/settlement/npcIdentity.ts`: `resolveSettlementNpcHomeDescriptor`,
  `settlementNpcMemberIndex`, `settlementMemberPhysicalSeed`.
- `planTraderInterSettlementExport()` (`src/ai/npcProfessionWork.ts`) starts
  the journey via a new `ctx.beginMerchantJourney` hook, wired in
  `src/ai/NpcAgent.ts` next to `bindTransportTravel`.
- `resolveTransportTravelArrivals()` (`src/world/transportTravelArrival.ts`)
  calls `advanceMerchantJourneyToVisiting()` after a successful matching
  unload.
- `SettlementsManager.resolveMerchantJourneyCheckpoints()` (bounded
  `npcStates.forEach`, same envelope as the existing transport checkpoint)
  drives `visiting` → `returning` on visit expiry and `returning` → journey
  cleared on genuine home arrival; wired into both `recheck()`'s existing
  checkpoint pass and `resolveTimeSkip()`.
- Merchant trade specialization, current-location pricing and home-bound
  horse gating (plan §9/§13/§14/§16) needed **no code change**: `role ===
  'trader'` merchant status (settlements-012/040/042) and the home-only
  horse offer (`settlement?.isHome` check) already key off
  `findSettlementForNpc(npc)`, which resolves correctly to the destination
  once the visitor is a normal member of its `Settlement.npcs`.
- Tests: `src/settlement/merchantJourney.test.ts` (new),
  `src/settlement/npcState.test.ts` (`merchantJourney` round-trip block),
  `src/settlement/npcIdentity.test.ts` (new descriptor/seed helpers). Full
  suite (`pnpm vitest run`) and `tsc --noEmit` pass.
- Not covered by automated tests (needs manual browser verification): the
  live foreign-visitor materialization end-to-end in a real running world
  (mesh/animation/trade UI at the destination), and the full A→B→A gameplay
  loop.

## 1. Current implementation baseline

`settlements-npcs-037` is implemented. Treat its final code as the contract, not the older provisional design.

Relevant current flow:

```text
src/economy/interSettlementFoodTransport.ts
  matchInterSettlementFoodOpportunity()
        ↓
src/ai/npcProfessionWork.ts
  Trader accepts/executes TransportOrder
        ↓
  pickup into npcState.transportCargo
        ↓
  bindTransportTravel(orderId, destination)
        ↓
src/ai/npcTravel.ts
  NpcTravelPurpose { kind: 'transport', orderId }
        ↓
src/world/transportTravelArrival.ts
  resolveTransportTravelArrivals()
        ↓
  executeTransportUnload()
        ↓
  observeNpcTravelArrival()
```

Important: spatial arrival alone does not complete delivery. `resolveTransportTravelArrivals()` waits for `travel.arrival === 'reached'`, validates the order/carrier/destination, executes `executeTransportUnload()`, and only after success observes/clears transport-purpose travel.

038 must attach its `outbound → visiting` transition to that successful delivery seam. Do not restore `TransportOrder.execution` as a parallel long-distance clock and do not globally poll completed order history.

## 2. Ownership model

Keep four responsibilities separate:

```text
TransportOrder
  owns source/destination/item/quantity/carrier/order lifecycle

NpcAuthoritativeState.transportCargo
  owns committed concrete goods after pickup

NpcAuthoritativeState.travel
  owns cross-settlement spatial continuity, arrival, survival checkpoint

MerchantJourneyState
  owns merchant-specific lifecycle: outbound/visiting/returning
```

This ownership split is the central guardrail for 038.

## 3. MerchantJourneyState

Add one optional sparse field to `NpcAuthoritativeState`, e.g.:

```ts
type MerchantJourneyState = {
  homeSettlementId: string
  destinationSettlementId: string
  phase: 'outbound' | 'visiting' | 'returning'
  transportOrderId?: string
  visitStartedAtDays?: number
  visitEndsAtDays?: number
}
```

Exact naming may vary, but keep it semantic/plain-data and small.

Do not store runtime `Settlement`/`NpcAgent` refs, route geometry, mesh position, copied inventories/economies or player-observation state.

Persist through the existing `NpcStateSnapshot` / save validation/defaulting path. Absent on old saves means no active merchant journey.

Required restore semantics:

```text
outbound  → same journey + order/cargo/transport travel
visiting  → same absolute visitEndsAtDays
returning → same journey + return travel
```

Never restart the visit timer on restore.

## 4. Existing NPC identity infrastructure

Do not introduce a parallel resolver from scratch.

`src/settlement/npcIdentity.ts` already provides:

- `settlementNpcId(settlementId, memberIndex)`,
- `flattenedSettlementMembers(def)`,
- `settlementNpcDescriptors(def)`.

Extend this existing identity module only as much as visitor construction requires. A useful richer descriptor may need:

- home settlement id,
- member index,
- family index,
- original `FamilyMember`,
- family-member list used by dialogue/social context,
- household id,
- stable authored role/appearance inputs.

Back resolution with canonical deterministic `SettlementDef` / plan-cache data. Do not load/build the home settlement merely to recover immutable identity and do not persist copied character definitions just for travellers.

Do not parse stable NPC ids as the primary ownership API if canonical identity data can be passed/resolved explicitly.

## 5. Away/home materialization suppression

Before implementing destination visitors, prevent the home settlement from rebuilding an NPC that is logically away.

Current `createSettlement()` materializes authored family members from its own `SettlementDef`. Introduce the narrowest materialization predicate/callback so:

```text
authoritative NPC state says merchant is outbound/visiting/returning elsewhere
→ skip local home NpcAgent creation
```

This changes presentation only. Never mutate:

- `SettlementDef.families`,
- family membership,
- `Household.settlementId`,
- population/history,
- profession identity/staffing metadata,
- persistent social identity.

This is a high-risk duplication boundary and needs direct tests before visitor materialization is added.

## 6. Generic foreign visitor materialization

The main new architectural seam belongs to `SettlementsManager` or a focused helper owned by it.

Responsibilities:

1. Determine which authoritative NPC is logically present at a loaded foreign settlement.
2. Resolve its immutable home identity without loading home.
3. Materialize exactly one `NpcAgent` with the existing stable `NpcId`.
4. Reuse the same `NpcStateRegistry` object: health, needs, stamina/vigor, personal inventory, transport cargo, journey and travel remain authoritative there.
5. Dispose only visitor presentation when destination streams out.
6. Never materialize the same `NpcId` both as a home authored NPC and as a foreign visitor.

A runtime `Map<NpcId, ...>`/`Set<NpcId>` is acceptable for live presentation ownership if useful. Do not create a second persistent visitor registry or top-level save structure.

The mechanism should be generic enough for later Courier/other travelling NPC use; avoid merchant-specific clone construction.

## 7. Visitor dependency split

A foreign visitor needs home identity but destination environment.

Home/identity-owned dependencies:

- `NpcId`, member/name/role/appearance,
- family/social identity,
- home household reference where required,
- authoritative `npcState`,
- merchant journey.

Destination/current-location dependencies:

- height/terrain sampling,
- water/collision/navigation context,
- destination visit anchor,
- interaction visibility,
- local settlement context where pricing/reputation intentionally depends on current place.

Do not bind destination B's normal Trader workplace/economy in a way that allows `planTraderWork()` to treat the visitor as B's employed Trader.

## 8. Journey arbitration

Do not make `planTraderWork()` own the whole travelling lifecycle.

Add a merchant-journey gate above normal profession work/schedule execution:

```text
phase === outbound
→ existing 037 order/travel owns behaviour

phase === visiting
→ visitor wait/idle behaviour at B; no local profession logistics

phase === returning
→ generic travel owns behaviour

no journey
→ existing normal Trader work
```

Existing critical interrupts (death/combat/needs where already authoritative) continue to win. Journey state remains semantic intent unless the failure semantics explicitly terminate it.

## 9. 037 delivery completion → visiting

Use `src/world/transportTravelArrival.ts::resolveTransportTravelArrivals()` as the integration seam.

After `executeTransportUnload()` returns success for a matching cross-settlement order, provide the narrowest callback/hook necessary to transition the carrier if:

```text
state.merchantJourney?.phase === 'outbound'
&& state.merchantJourney.transportOrderId === order.id
&& order.carrierNpcId === npcId
```

Then:

```text
phase = 'visiting'
visitStartedAtDays = nowDays
visitEndsAtDays = nowDays + TRAVELLING_MERCHANT_VISIT_DAYS
```

Make this idempotent. Repeated bounded arrival processing must not restart the timer.

Do not enter visiting on spatial arrival before unload or on failed unload/retry.

## 10. Visit duration and off-screen progression

Use one named deterministic constant in **world days**, e.g. `TRAVELLING_MERCHANT_VISIT_DAYS`.

Do not use real-time timers, RNG or player-presence clocks.

Visit expiry must be resolvable from an existing bounded NPC/settlement/travel checkpoint so an unloaded destination does not freeze the merchant forever. Avoid a world-global per-frame merchant scan.

If destination is loaded, resolve a deterministic safe visit anchor from existing public/trade-adjacent landmarks/places. Do not persist the anchor; recompute it from destination state on materialization.

## 11. Visiting → return travel

On visit expiry, transition exactly once:

```text
visiting
→ returning
→ create generic travel from logical destination checkpoint to home target
→ purpose = merchant-return
```

Extend `NpcTravelPurpose` in `src/ai/npcTravel.ts`, following existing discriminated union style:

```ts
| { kind: 'merchant-return', homeSettlementId: string }
```

A different equally small semantic shape is acceptable if implementation provides a better stable reference. Do not place visit timestamps in `NpcTravelPurpose`.

Update all existing clone/persistence/validation call sites for the new variant. In particular inspect `cloneNpcTravelPurpose()` and current save validation for travel purpose.

## 12. Return arrival → clear journey

Arrival handling must be caller-owned/idempotent, matching existing generic travel design.

On reached merchant-return travel:

- verify NPC is alive/not blocked according to existing travel semantics,
- verify `merchantJourney.phase === 'returning'`,
- observe the travel arrival once,
- clear merchant journey,
- allow home Trader work/materialization again.

Do not mark success on dead/blocked travel.

When home is already loaded, ensure return handoff still preserves the one-live-agent invariant rather than creating an authored home copy plus visitor/traveller simultaneously.

## 13. Merchant trade specialization

Current `src/app/inventoryWiring.ts::isMerchantNpc()` is:

```ts
npc?.role === 'trader'
&& findSettlementForNpc(npc)?.isHome === true
```

This makes a visiting Trader lose full merchant specialization.

Replace the location-only rule with a stable semantic predicate supplied by simulation identity/state, conceptually:

```text
designated normal merchant at home
OR
active travelling merchant
```

Do not simply change it to `role === 'trader'` unless that broader behavior is intentionally desired for every settlement-local Trader.

Prefer a narrow `NpcAgent`/manager query over UI code inferring merchant identity from current settlement containment.

## 14. Pricing context and location semantics

`buildSellPriceContext()` currently derives settlement reputation/renown from the settlement containing the live NPC.

For a visitor this current-location behavior is useful: personal relationship remains tied to stable NPC identity while settlement-level pricing context can reflect the settlement where the transaction occurs.

Do not accidentally replace current-location pricing with `homeSettlementId` merely because authored identity is home-owned.

## 15. Cargo isolation

`NpcAuthoritativeState.transportCargo` is already a separate `Inventory` from merchant/catalog stock and `personalInventory`.

Keep it that way. Do not add transport cargo to merchant stock resolution.

Add a regression test proving committed/in-transit/recently-arrived transport goods do not appear as player-purchasable merchant rows.

Prefer testing the structural invariant instead of adding duplicate filtering lists.

## 16. Home-bound special offers

`inventoryWiring.ts` contains home-merchant-specific special behavior including the authored merchant horse flow.

During a destination visit:

- portable/catalog merchant offers may remain available,
- physical world-entity offers that still exist at home must be unavailable,
- never duplicate/teleport the home horse merely because the owner NPC travelled.

Pack animals/carts remain outside 038.

## 17. Persistence files to inspect

Likely implementation points:

- `src/settlement/npcState.ts` — journey type/state/snapshot clone/restore,
- current save validation/defaulting path under `src/persistence/`,
- `src/ai/npcTravel.ts` — merchant-return purpose + clone handling,
- relevant persistence tests.

Do not add a new top-level `SaveData.travellingMerchants` registry.

## 18. Failure/idempotency rules

- carrier dies outbound → existing 037 semantics win; no visit,
- delivery cannot unload → stay outbound/recovery; no visit,
- duplicate completion observation → do not reset visit timestamps,
- merchant dies visiting → do not initiate successful return,
- return blocked/dead → do not clear journey,
- destination stream-out → dispose presentation only,
- destination reload → same authoritative state and `NpcId`,
- home load while away → no home clone,
- save/load around any phase transition → transition remains exactly-once semantically.

## 19. Observability

Reuse existing NPC/transport debug surfaces. Add only enough data to inspect:

- merchant `NpcId`,
- home/destination settlement,
- journey phase,
- outbound order id,
- visit expiry,
- current `NpcTravelPurpose`/arrival/blocked state,
- current live materialization context.

No separate merchant analytics subsystem.

## 20. Stage 1 — authoritative lifecycle and away suppression

Implement first:

1. `MerchantJourneyState` + optional authoritative field.
2. Snapshot/save/load/defaulting and tests.
3. `merchant-return` purpose clone/validation support.
4. Narrow lifecycle predicates/helpers if needed.
5. Home authored-NPC suppression while journey says NPC is away.

Stage 1 is done when:

- all phases survive snapshot/save/load,
- legacy saves restore with no journey,
- absolute visit timestamps do not restart,
- loading home while away creates no live home copy,
- family/household/population data is unchanged.

Do not implement player trade changes in this stage.

## 21. Stage 2 — generic travelling NPC materialization

Implement second:

1. Extend `npcIdentity.ts` only with missing descriptor data needed by visitor construction.
2. Add manager-owned foreign visitor presentation ownership.
3. Materialize exactly one existing `NpcId` at destination using the same `NpcStateRegistry` object.
4. Bind destination environmental dependencies while retaining home identity/ownership.
5. Dispose/reify through normal settlement streaming.
6. Suppress destination profession execution for visitors.

Stage 2 is done when:

- NPC authored in A can be live in B with the original id/state,
- A+B loaded simultaneously still yield one live agent,
- B unload/reload preserves one identity/state,
- visitor remains formally owned by A,
- visitor does not perform B's Trader job.

## 22. Stage 3 — merchant integration

Implement last:

1. Successful 037 delivery callback → `visiting`.
2. Deterministic visit expiry → `returning`.
3. Generic merchant-return travel + idempotent home-arrival clear.
4. Stable merchant-specialization predicate for visiting merchant.
5. Preserve current-location pricing semantics.
6. Gate home-bound horse/world-entity offers.
7. Add debug/observability and end-to-end tests.

Stage 3 is done when the complete systemic flow works:

```text
A has real surplus + B has real uncovered shortage
→ same home Trader accepts 037 order
→ pickup into transportCargo
→ transport-purpose travel A→B
→ real unload into B
→ same NPC visits B and can use portable merchant trade
→ visit expires without requiring player observation
→ same NPC returns through generic travel
→ one successful home arrival clears journey
→ normal home Trader work resumes
```

Commit/test each stage separately where practical. Keep all three stages under the single 038 plan.

## 23. Focused tests

### Stage 1

- `outbound`, `visiting`, `returning` snapshot round-trip,
- absent legacy journey → none,
- visit end timestamp unchanged after restore,
- home materialization while away → no home agent,
- family/household identity untouched.

### Stage 2

- original `NpcId` materializes in B,
- A+B loaded → never two live agents,
- B unload/reload → same authoritative object/identity,
- visitor health/needs/personal inventory/transport cargo/travel are reused,
- destination local profession work is suppressed.

### Stage 3

- only completed matching 037 unload starts visit,
- reaching destination with failed unload does not,
- repeated completion handling does not restart visit,
- visit expires off-screen and creates one return,
- return survives save/load and streaming,
- home arrival is observed exactly once,
- portable/catalog merchant UI is available in B,
- unrelated Traders are not accidentally upgraded,
- transport cargo cannot be bought,
- home horse/special world offers are unavailable in B,
- dead/blocked merchant never teleports/respawns home as success.

## 24. Implementation guardrails

- Re-read current implementations before modifying a seam; repository code wins over these notes if it has changed.
- Do not create a merchant-specific travel/off-screen engine.
- Do not add a global travelling-merchant registry.
- Do not duplicate `npcIdentity.ts` logic.
- Do not mutate destination settlement membership/staffing to host a visitor.
- Do not bind visitor presentation lifecycle to player/camera presence beyond ordinary settlement streaming.
- Add JSDoc with `@domain settlements-npcs` for important new public/architectural materialization and lifecycle helpers.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
