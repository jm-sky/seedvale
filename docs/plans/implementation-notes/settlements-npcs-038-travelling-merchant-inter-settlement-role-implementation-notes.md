# Implementation Notes: settlements-npcs-038 — Travelling Merchant inter-settlement role

**Plan:** `settlements-npcs-038-travelling-merchant-inter-settlement-role.md`  
**Status:** `planned` 📋

## 1. Review result

The direction is correct, but the original plan was written before the detailed review of `settlements-npcs-037`. Two assumptions must be corrected before implementation:

1. The outbound A→B leg must follow the `037` contract: `TransportOrder` owns the economic/cargo commitment, while `NpcAuthoritativeState.travel` / `NpcTravelContinuity` owns cross-settlement spatial continuity. Do **not** restore the older idea that `TransportOrder.execution` owns the long-distance leg.
2. The current settlement streaming architecture can only materialize a settlement's **own** generated family members. There is no generic mechanism today for the same NPC identity from settlement A to materialize inside loaded settlement B as a visitor. This is the main new seam `038` must add.

There is also a player-trade gating issue: `src/app/inventoryWiring.ts::isMerchantNpc()` currently grants the full `MERCHANT_STOCK` specialization only when the Trader is physically contained in the **home settlement** (`findSettlementForNpc(npc)?.isHome === true`). A visiting Trader would therefore degrade to ordinary NPC trading unless this rule is replaced with stable merchant identity/role context.

The plan remains coherent as one feature, but effort should be treated as **L**, not M/L. The materialization/lifecycle work is the dominant cost.

## 2. Dependency contract from plan 037

Do not implement `038` against today's pre-037 same-settlement assumptions. `038` is blocked until `037` is implemented and must consume its final public seams.

Expected `037` contract:

```text
TransportOrder
  owns: source/destination/item/quantities/carrier/lifecycle

NpcAuthoritativeState.transportCargo
  owns: physical committed goods after pickup

NpcAuthoritativeState.travel
  purpose: transport(orderId)
  owns: A→B spatial continuity, detailed↔off-screen handoff, survival checkpoint
```

Cross-settlement delivery completes only after transport-purpose travel reaches the destination and the destination `SettlementEconomy.items` transaction succeeds.

`038` should observe that completion and transition the same NPC into a visit. It must not add another outbound clock or cargo lifecycle.

## 3. Merchant journey state belongs on the NPC

A Travelling Merchant is an existing `role === 'trader'` NPC with additional temporary lifecycle state. Do not add a global merchant registry.

Add one sparse optional field to `NpcAuthoritativeState`, for example:

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

Exact naming may vary, but keep the record semantic and compact.

Do not store:

- `Settlement` / `NpcAgent` refs,
- inventory snapshots,
- copied economy shortage/surplus,
- route geometry,
- current mesh position,
- player-observation state.

The NPC already owns position continuity through `travel` and cargo through `transportCargo`.

Persist this field through `NpcStateSnapshot` and current save validation/defaulting. `undefined`/absent means no merchant journey.

## 4. Home settlement identity must be stable and explicit

Do not infer home membership from the settlement that currently contains the live `NpcAgent`.

The NPC's stable id is settlement-namespaced (`settlementNpcId(settlementId, memberIndex)`), but do not parse ids as the primary ownership API. Prefer carrying `homeSettlementId` in `MerchantJourneyState` and/or expose a narrow manager-owned identity resolver if needed.

Formal family/household membership remains at home for the whole journey.

A destination visit must never mutate:

- family membership,
- `Household.settlementId`,
- profession staffing,
- source settlement `SettlementDef`.

## 5. Main missing seam: cross-settlement visitor materialization

Current `createSettlement()` builds `NpcAgent`s from that settlement's own `def.families`. Reconstructing B cannot naturally recreate a Trader whose authored identity belongs to A.

Do not solve this by cloning the merchant into B's `settlement.npcs` as a new local identity.

Add a small **generic travelling-NPC visitor materialization seam** owned by `SettlementsManager` (or a focused helper it owns), reusable later by Courier/expedition visitors.

Required responsibilities:

1. Determine which persistent NPC states are logically present at a loaded settlement because their travel/journey says so.
2. Materialize exactly one `NpcAgent` for that existing `NpcId`.
3. Reuse the same authoritative `NpcStateRegistry` object (`health`, `needs`, `personalInventory`, `transportCargo`, journey, travel).
4. Reuse the NPC's source/home character/family identity instead of generating a destination-local character.
5. Dispose the visitor when the destination streams out without deleting authoritative state.
6. Never materialize the same NPC simultaneously in home A and destination B.

Do not create a second persistent visitor registry. A runtime map of currently materialized foreign visitors is acceptable as presentation ownership, keyed by existing `NpcId`.

## 6. Resolve immutable NPC identity without forcing source settlement load

Visitor construction needs the original NPC's immutable authored inputs currently sourced from `SettlementDef.families` / member index:

- `FamilyMember` / character definition,
- family-member references used by dialogue,
- stable household id,
- physical profile seed inputs,
- role/appearance.

Do not load/build settlement A just to recover these.

Use deterministic `SettlementDef` / plan-cache data for the known home settlement. The source definition is deterministic world data, not mutable runtime state.

Prefer one narrow helper such as:

```ts
resolveNpcIdentity(npcId): {
  homeSettlementId
  memberIndex
  familyIndex
  member
  familyMembers
  householdId
}
```

backed by canonical deterministic settlement definition data.

Do not duplicate NPC generation logic or persist immutable character copies solely for visiting merchants.

## 7. Visitor `NpcAgent` needs destination movement context but home ownership

A visitor is unusual because some `NpcAgentDeps` are identity/home-owned and some are local-environment-owned.

Keep the split explicit:

**Home-owned / identity-owned:**

- `npcId`, member/role/name/family,
- authoritative `npcState`,
- home household reference,
- persistent social relation identity,
- merchant journey.

**Current-location / destination-owned:**

- `sampleHeight`, water/colliders,
- local destination settlement landmarks used for visit idle target,
- current interaction visibility,
- current settlement reputation context when player trades there.

Do not accidentally bind a visitor's `economy`/workplace to destination B and allow normal `planTraderWork()` there. During `visiting` and `returning`, normal profession work must be suppressed by merchant-journey arbitration.

## 8. Add journey arbitration above normal Trader work

`planTraderWork()` should not own the whole merchant lifecycle.

The safest boundary is an NPC-level/trader-level journey gate before ordinary profession work:

```text
merchantJourney.phase === outbound
→ 037 transport/travel owns behaviour

phase === visiting
→ stay/idle at destination visit anchor; no local Trader logistics

phase === returning
→ generic travel owns behaviour

no journey
→ existing planTraderWork()
```

Do not let schedule transitions start local home work while the NPC is physically away.

Critical interrupts such as death/combat/needs continue to use existing NPC arbitration. After a temporary interrupt, journey state remains and may resume unless authoritative health/travel blocks it.

## 9. Transition from 037 delivery to `visiting`

Do not poll historical completed orders globally.

At the bounded transport-arrival completion seam introduced/used by `037`, when an inter-settlement order genuinely completes:

```text
order.carrierNpcId
+ carrier has matching merchantJourney.phase === outbound
+ order.id matches journey.transportOrderId
→ set phase = visiting
→ visitStartedAtDays = nowDays
→ visitEndsAtDays = nowDays + VISIT_DURATION_DAYS
→ clear completed transport-purpose travel only after delivery succeeded
```

The transition must be idempotent.

If the order fails or cargo cannot unload, remain outbound/recovery-required. Never start the visit merely because the carrier reached B spatially.

## 10. Visit duration

Use one deterministic constant in world days, not real-time timers and not RNG.

Choose a short bounded initial value consistent with ordinary simulation cadence. A reasonable V1 target is around a fraction of a game day; keep it named and unit-documented, e.g. `TRAVELLING_MERCHANT_VISIT_DAYS`.

Do not derive visit length from player presence. The merchant must leave even if never observed.

Visit expiry should be resolved at existing bounded NPC/travel/settlement checkpoints or ordinary loaded NPC decision cadence, not by a world-global per-frame merchant manager.

## 11. Destination visit anchor

When B is loaded, place/keep the merchant at a deterministic safe public location using already-existing B landmarks/places.

Prefer an existing Trader workplace / public trade-adjacent place if B exposes one; otherwise use the existing settlement storage / plaza-like safe anchor already materialized by settlement props. Do not create a new merchant stall just for this plan.

The visit anchor is presentation/navigation data and does not need persistence. Re-resolve it from destination settlement state whenever materialized.

If B is unloaded, no anchor is needed; the visit is represented only by journey timestamps + destination id.

## 12. Return-home travel uses generic `NpcTravelContinuity`

On visit expiry, transition once:

```text
visiting
→ returning
→ create generic travel to home settlement target
→ purpose = merchant-return (or generic journey purpose referencing NPC merchant journey)
```

Extend `NpcTravelPurpose` as a discriminated union, following the `expedition` and 037 `transport` variants.

Recommended semantic form:

```ts
| { kind: 'merchant-return', homeSettlementId: string }
```

or a stable merchant-journey identifier if the implementation introduces one. Do not put visit timers in `NpcTravelPurpose`; those belong to the journey record.

On arrival:

- observe generic travel arrival exactly once,
- verify merchant journey is still `returning`,
- clear journey,
- normal home Trader schedule/work can resume.

If dead/blocked, do not clear journey as successful.

## 13. Home NPC must not respawn while merchant is away

Current settlement reconstruction creates every authored family member. Therefore merely storing journey state is insufficient: when A loads while the Trader is visiting/returning, `createSettlement()` would otherwise instantiate that Trader at home again.

Add a materialization predicate for authored local NPC creation:

```text
if authoritative NPC state says this NPC is currently travelling/visiting elsewhere
→ do not create local home NpcAgent
```

This is a presentation/materialization rule only. Do not remove the NPC from family/household/population data.

When the journey completes at home, the next relevant home materialization may recreate the NPC normally, or the visitor materialization seam may hand it back without duplication. Ensure one live `NpcAgent` per `NpcId`.

This is one of the highest-risk duplication bugs in the plan and must have direct tests.

## 14. Full merchant trade gating must stop depending on `isHome`

Current `inventoryWiring.ts`:

```ts
const isMerchantNpc = (npc) =>
  npc?.role === 'trader'
  && findSettlementForNpc(npc)?.isHome === true
```

This was intentional for plan 033 but is incompatible with a travelling merchant.

Do not replace it with `role === 'trader'` globally because every settlement-local Trader would then automatically expose home merchant specialization if that is not current design intent.

Introduce a stable merchant-specialization predicate supplied by simulation identity, for example:

```text
is designated merchant NPC
OR
has active MerchantJourneyState as the travelling merchant
```

Prefer an explicit `NpcAgent`/manager query over UI parsing of settlement membership.

During a visit, the same NPC should keep `MERCHANT_STOCK` and existing special merchant interaction behavior.

## 15. Social pricing must use current interaction settlement where intended

`buildSellPriceContext()` currently derives reputation/renown from `findSettlementForNpc(npc)` — the loaded settlement that physically contains the NPC.

For a visitor in B this is actually useful: player↔NPC relation stays tied to NPC id, while settlement reputation/renown should normally reflect the place where trade occurs.

Preserve that current-location semantics unless product design explicitly wants the home settlement's reputation to price the merchant.

Do not accidentally switch all pricing to `homeSettlementId` merely because merchant identity comes from A.

## 16. Cargo isolation is already structurally strong

Player merchant trading currently uses:

- catalog `MERCHANT_STOCK` for merchant buy-side,
- player inventory,
- ordinary NPC household goods for generalized NPC-owned stock,
- `NpcAuthoritativeState.personalInventory` for NPC coins.

`transportCargo` is a separate `Inventory` on `NpcAuthoritativeState` and is not currently part of these trade paths.

Do not add it to merchant stock resolution. Add a regression test that an in-transit/just-arrived committed item in `transportCargo` never appears in buy rows and cannot be purchased.

No new filtering is necessary if the existing ownership separation remains intact; test the invariant rather than duplicating stock lists.

## 17. Horse/special-offer caveat

`inventoryWiring.ts` contains home-trader-specific merchant special behavior (including the authored merchant horse flow). A travelling merchant visiting B should not magically duplicate or relocate a home-settlement world entity such as the merchant's horse unless that entity actually travels.

Keep V1 visit trade to portable/catalog merchant behavior and explicitly gate world-entity offers whose physical owner/location is still at home.

Do not teleport the merchant horse as part of 038. Pack animals/carts remain future transport capacity work.

## 18. Persistence and save validation

Likely changes:

- `src/settlement/npcState.ts` — `MerchantJourneyState` + clone/snapshot/restore,
- `src/persistence/saveData.ts` validator/defaulting for optional journey field,
- save round-trip tests,
- `NpcTravelPurpose` validation for any merchant-return variant.

No new top-level `SaveData` registry should be necessary.

Required restore invariants:

```text
outbound → restore matching order + transport travel + cargo + journey
visiting → restore same visitEndsAtDays, never restart timer
returning → restore same generic return travel + journey
```

Absent field on old saves = no active merchant journey.

## 19. Failure semantics

### Carrier dies outbound

`037` semantics win. Do not enter visit.

### Merchant dies while visiting

Journey remains non-successful; do not start return and do not respawn at home.

### Return blocked/death

Do not clear the journey or mark home arrival.

### Destination unavailable

An off-screen visit can still age by timestamp. If its visit expires before B is ever loaded, start return from the logical destination checkpoint using generic travel continuity; no player observation is required.

### Save/load around phase transitions

Every transition must check current phase and be idempotent so delivery/visit expiry/return arrival cannot run twice.

## 20. Recommended implementation order

1. Finish/consume implemented `037`; do not duplicate its provisional contracts.
2. Add `MerchantJourneyState` to authoritative NPC state + persistence tests.
3. Extend generic travel purpose for merchant return if needed.
4. Add local-home materialization suppression for away NPCs.
5. Add generic foreign visitor materialization in `SettlementsManager` / focused helper.
6. Add outbound-completion → visit transition at the 037 delivery seam.
7. Add visit expiry → return transition.
8. Add return arrival → clear journey.
9. Fix merchant specialization gating in `inventoryWiring.ts` so the visiting same NPC remains a full merchant without exposing every Trader globally.
10. Gate location-bound special offers such as the home merchant horse.
11. Add observability/tests.

Do not begin with UI changes; get single-identity simulation/materialization correct first.

## 21. Focused tests

### Authoritative journey state

- outbound/visiting/returning snapshot round-trip,
- old snapshot without journey restores as none,
- visit timer does not restart on restore.

### One live identity

- home A loaded while merchant is away → no home clone,
- destination B loaded during visit → exactly one live agent with original `NpcId`,
- B unload/reload → same authoritative state, no duplicate,
- returning/home arrival → exactly one live agent after handoff.

### Delivery transition

- only completed matching 037 order enters visiting,
- reaching B with failed unload does not enter visiting,
- repeated completion callback/checkpoint is idempotent.

### Visit lifecycle

- visit expiry uses world days,
- expiry while B unloaded still starts return logically,
- visitor does not execute B's local Trader work.

### Return

- merchant-return travel survives off-screen/save/time skip,
- arrival clears journey exactly once,
- dead/blocked return does not complete.

### Player trade

- visiting merchant retains full merchant catalog specialization,
- ordinary non-designated Trader behavior does not accidentally broaden,
- current destination settlement social pricing remains coherent,
- `transportCargo` never appears as player-purchasable stock,
- home-only physical special offers (merchant horse) are not duplicated at destination.

## 22. Files/symbols most likely involved

High-confidence current seams:

- `src/settlement/npcState.ts`
  - `NpcAuthoritativeState`, `NpcStateSnapshot`, snapshot/restore cloning.
- `src/ai/npcTravel.ts`
  - `NpcTravelPurpose`, `NpcTravelContinuity`, arrival observation.
- `src/settlement/SettlementsManager.ts`
  - settlement load/unload ownership, `NpcStateRegistry`, generic travel checkpoints, likely owner of visitor materialization.
- `src/settlement/createSettlement.ts`
  - authored local NPC creation; must suppress an away merchant rather than duplicate it.
- `src/ai/NpcAgent.ts`
  - materialization/reification, schedule/work arbitration, travel handoff.
- `src/ai/npcProfessionWork.ts`
  - existing Trader work; keep normal local work behind journey gate.
- `src/app/inventoryWiring.ts`
  - `findSettlementForNpc`, `isMerchantNpc`, pricing, special merchant behavior.
- `src/items/tradeCatalog.ts`
  - catalog `MERCHANT_STOCK`; keep unchanged.
- plan 037's final transport-arrival resolver
  - transition outbound → visiting after actual delivery.

Re-read actual 037 implementation before touching these files; implementation notes describe the expected contract, not a license to recreate it independently.

## 23. Guardrails

- One NPC id, one live agent.
- No destination-local clone/proxy merchant.
- No `TravellingMerchantManager`.
- No second cargo inventory.
- No second travel clock.
- No destination profession reassignment.
- No home replacement Trader.
- No player-presence-dependent visit lifetime.
- No automatic merchant horse teleport.
- No multi-stop routing, pricing/profit model or caravan scope creep.
- Browser verification belongs to the User.

> **Zrób git commit i push do main, rebase jeżeli trzeba**