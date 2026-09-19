# Implementation notes: Expedition shared work and activities

**Plan:** `docs/plans/npc-034-expedition-shared-work-and-activities.md`
**Reviewed:** 2026-09-19

## Recon outcome

Current `main` supports a small, coherent V1: **shared construction assistance** for an ordinary NPC with an active `accompanyCommitment`.

The important finding is that construction is already actor-neutral at the world-mutation boundary. Player work and hired-NPC Work Contract work both advance the same target-owned progress. The missing piece is not another construction system; it is a small source-neutral temporary work intent plus reuse/extraction of the existing NPC construction execution that is currently embedded inside Work Contract accounting.

Do not broaden implementation into farming, gathering, hunting, fishing, camp work or generic hauling. Those domains have useful reusable primitives, but their current orchestration still carries settlement/profession/household/player-specific assumptions.

Automatic player-storage material acquisition is also out of V1. Stage 1 storage policy (`items-player-028`) is actor-level only. `assigned_only`, work-purpose authority and reserves are Stage 2 (`items-player-032`).

## Dependency state at recon

- `npc-029-npc-accompany-follow-commitment.md` — `verification needed`; implementation is on `main`.
- `npc-032-expedition-needs-and-survival.md` — `planned`; hard dependency for final survival/locality/idle-duty semantics.
- `items-player-028-npc-player-storage-access-policies.md` — `planned`; no longer a hard dependency for construction-only V1.
- `items-player-032-npc-player-storage-resource-and-context-rules.md` — `planned`; later dependency for automatic construction-material withdrawal.
- `items-player-027-player-to-npc-item-transfer-and-equipment.md` — landed/`verification needed`; useful for manual tool/item ownership only.

Implementation should recon final `npc-032` API immediately before coding, but should not repeat the broad activity recon below unless the code materially changed.

## Current authoritative ownership

### Accompany

`src/settlement/npcState.ts::NpcAuthoritativeState.accompanyCommitment` is the persistent source-neutral accompany fact.

`src/ai/npcAccompanyCommitment.ts` defines:

- `NpcAccompanyCommitment`;
- target `{ kind: 'player' }`;
- source `voluntary | work-contract`;
- mode `follow | stay`.

Do not add `isCompanion` or a shared-work-specific companion registry.

`src/ai/NpcAgent.ts::tryPursueIdleDuty()` currently orders:

1. escort-service resolution;
2. accompany execution;
3. committed travel;
4. Work Contract;
5. pending Player follow-up;
6. voluntary join;
7. ordinary schedule fallback.

Current lines observed during recon: approximately 5198–5216. Shared work should integrate into this existing idle-duty boundary after final `npc-032` ordering is known. It must not become another per-frame scheduler.

### Work Contracts

`src/world/workContract.ts` owns contractual commitment/accounting.

`src/world/createWorkContracts.ts::findActiveWorkByNpc(npcId)` is the authoritative lookup for active paid work. `NpcAgent` does not persist a second assignment copy.

`src/ai/NpcAgent.ts::tryPursueWorkContract()` re-resolves the assignment every idle-duty cycle. Current recon lines approximately 5512–5536.

This pattern is useful for shared work: persistent semantic intent should be re-resolved from its authoritative owner rather than cached in transient action state.

### Construction targets

Target modules own actual work progress/completion.

Verified actor-neutral examples:

- `PlayerWells.addWork`;
- `StandingTorches.contributeWork`;
- `Palisades.contributeWork`;
- `TerrainPreparations.contributeWork`;
- residential-building contribution path exposed through the current Work Contract target adapters.

`docs/state/player-systems.md` explicitly documents that Player `[E]` work and NPC Work Contract bouts drive the same target-owned progress.

Do not add `companionProgress`, `npcSharedWorkProgress` or a second ledger.

## Current construction execution call-sites

### Player

`src/app/actions/placementActions.ts` is the Player-side construction interaction/action owner.

It uses `constructionWorkSession.ts` for active work and target-owned contribution APIs for actual progress.

Materials are acquired through `src/items/constructionMaterials.ts`:

- `materialAvailabilityBreakdown(...)`;
- `hasMaterial(...)`;
- `consumeMaterial(...)`.

That seam is player-oriented because it reads Player `Inventory` plus nearby dropped items. Do not blindly pass an NPC inventory into it and call that “shared material acquisition”; construction stage/material semantics must stay target/domain-owned.

### Hired NPC

`src/ai/NpcAgent.ts::pursueAcceptedContract()` resolves the concrete Work Contract target and travel state.

For buildables it reaches:

`src/ai/NpcAgent.ts::runBuildableContractWorkBout()`

Current recon lines approximately 6176–6205.

Observed flow:

```text
resolve fresh contract/assignment
→ start ordinary 'work' action at target
→ re-resolve assignment at completion
→ runtime.contributeWork(targetId, sessionHours)
→ creditNpcWork(contractId, npcId, acceptedWork)
→ completeWork(...) when target/commitment fulfilled
```

The reusable part is:

```text
resolve target
→ ordinary travel/action
→ call target contribution seam
→ observe acceptedWork/completed
```

The Work Contract-only part is:

```text
assignment state
creditNpcWork(...)
isNpcCommitmentFulfilled(...)
completeWork(...)
wage/payment lifecycle
```

Extract/reuse the first part. Do not let shared expedition work call `creditNpcWork()`.

## Recommended neutral construction seam

Do not create a large generic jobs framework.

A focused helper/module may be justified if it is reused by both Work Contract construction and shared expedition construction.

The helper should own only construction execution concepts such as:

- stable target reference;
- target resolve/revalidation;
- destination;
- work session duration/amount;
- target `contributeWork` call;
- result `acceptedWork / completed / missing`.

It should not own:

- contract ids;
- rewards/wages;
- notice boards;
- employer;
- assignment lifecycle;
- accompany lifecycle;
- player-storage policy.

Neutral naming examples: `npcConstructionWork.ts`, `resolveNpcConstructionTarget`, `runNpcConstructionBout`.

Avoid names containing `companion` or `expedition` for the reusable executor.

## Shared-work intent

First inspect final `npc-032` and any new general commitment seams.

If no suitable source-neutral temporary-work owner exists, add the smallest semantic record on `NpcAuthoritativeState`.

Recommended shape is intentionally narrow:

```ts
type NpcSharedWorkIntent = {
  kind: 'construction'
  target: SharedConstructionTargetRef
  source: { kind: 'player-request' }
}
```

Requirements:

- stable target identity only;
- at most one active intent per NPC;
- persists through existing NPC snapshot/save path if needed;
- no path, destination snapshot, animation, timer, busy state, material cache or permission cache.

Do not put it inside `NpcPlan` solely to reuse Goal persistence. Accompany already established that long-lived commitments can coexist with ordinary need plans.

## Player intent / request source

V1 should be contextual on a real unfinished target.

The interaction should produce:

```text
known target
+ locally accompanying eligible NPC
→ create/replace temporary shared-work intent
```

It must not call `contributeWork` directly.

Prefer the existing interaction/action layer used by current target interactions rather than a new companion menu.

If multiple accompanying NPCs are available, choose from the bounded already-known local set using deterministic stable ordering/eligibility. Do not search every NPC/world settlement.

“Pomóż mi przy tym” is temporary. It ends on target completion/cancel/invalidation/accompany termination/locality loss; it is not an ongoing order to seek more construction afterward.

## Profession, capability and tools

Current construction contribution itself is not uniformly profession-gated.

Do not introduce a new “builder” profession requirement.

Use profession/skills only where existing general construction rules already expose a meaningful capability/eligibility signal. If no such signal exists for a target, being a normal capable adult NPC is sufficient for V1.

Item ownership:

- personal tools/belongings: `NpcAuthoritativeState.personalInventory`;
- short profession payload: `NpcAgent.carried`;
- persistent transport cargo: `NpcAuthoritativeState.transportCargo`.

`items-player-027` Player→NPC transfer deposits real goods into `personalInventory`; it does not equip, force use or create a work intent.

Do not add `companionTool`, `workToolInventory` or persistent equipment slots for this plan.

## Materials

Construction stage/material authority must stay in existing buildable/domain code.

V1 should only contribute when the current target/stage is already work-ready.

If additional material is required:

- do not mint it;
- do not teleport it;
- do not automatically scan player chests;
- do not create a transport order merely for a nearby beam;
- expose a blocker/stop condition and let the activity yield/clear according to the chosen simple lifecycle.

This keeps material acquisition independent and avoids prematurely designing a general worker provisioning system.

## Player storage / assigned_only

### Stage 1: items-player-028

`items-player-028` is actor authorization only:

```text
can this NPC withdraw/deposit at this player-owned container?
```

It has:

- per-container persistent policy;
- separate withdraw/deposit;
- default, companions, hired, explicit NPC overrides;
- current-state actor revalidation;
- policy-aware transfer seam.

It does **not** decide whether a specific construction material may be withdrawn for a specific work target.

### Stage 2: items-player-032

`assigned_only` means:

> autonomous transfer is forbidden; transfer is allowed only with a validated structured authority context from a real assignment/work/provisioning owner.

The current planned `StorageAccessPurpose` examples include `work_material` with authority/work ids.

For future shared construction material fetch:

```text
active shared-work intent
→ concrete target says exact material is required
→ Stage 1 actor permission
→ Stage 2 resource rule
→ work_material authority validator re-resolves shared-work intent + target
→ reserve/current stock/destination capacity
→ authoritative transfer
```

Do not pass `assigned: true`.

Do not cache positive permission while walking to storage.

Because `items-player-032` is not part of current V1, no automatic player-storage fetch belongs in this implementation.

## Activity seam matrix

### Construction — V1

Authority:
- world/buildable module owns progress;
- Work Contract owns paid commitment/accounting only.

Player:
- contextual construction actions;
- target-owned contribution.

NPC:
- Work Contract execution in `NpcAgent`.

Reusable seam:
- contribution APIs are already actor-neutral.

Gap:
- neutral NPC construction executor + temporary non-economic work intent.

### Farming / cultivation — defer

Files/symbols:
- `src/ai/npcProfessionWork.ts::planFarmWork()`;
- `resolveCultivationAnchor(...)`;
- `SettlementFoodSourceHooks`;
- `foodSources.queryHarvestableCrop`;
- `foodSources.harvest`;
- `foodSources.findPlantSpot`;
- `foodSources.plant`.

Current flow:
- harvest first;
- output goes to household food/economy;
- recovered seeds go to `Household.items`;
- planting consumes household seed stock.

Why not V1:
- actor-neutral world crop mutation exists;
- intent, seed owner and output owner are still Farmer/household-oriented;
- off-screen aggregate settlement production also exists and must not be bypassed.

Future slice should first separate “perform crop action” from “household Farmer chooses/owns seed/output”.

### Gathering — defer

Herbalist:
- `src/ai/npcProfessionWork.ts::planHerbalistWork()`;
- `herbalGather.queryCandidates(...)`;
- `herbalGather.harvest(target)`;
- result enters transient `ctx.carried`;
- `planHerbalDeposit()` / `depositCarriedItems(...)` moves yield to household.

Hunger gathering:
- `NpcAgent.beginRealFoodGathering()`;
- purpose is personal need;
- harvested produce/recovered seeds route through household/need semantics.

Mining:
- `planOreGathering()`;
- `ResourceDeposits` owns extraction/depletion;
- yield goes to world-owned resource-site `Inventory`, then later Trader `TransportOrder`.

Why not V1:
- there is no one generic “gather output and choose owner/destination” contract yet;
- multiple existing flows intentionally choose different owners.

Do not unify them inside companion work.

### Hauling / transport — defer

Relevant seams:
- `src/ai/npcLogistics.ts::buildTransferAction()`;
- `planEconomyWithdraw()`;
- `planHouseholdExchange()`;
- `planPlayerStorageDelivery()`;
- `src/world/transportOrder.ts::TransportOrder`;
- `NpcAuthoritativeState.transportCargo`;
- generic travel continuity.

`buildTransferAction()` already expresses a reusable two-leg pickup→deposit action, but ownership/commitment differs by caller.

Persistent transport is explicitly world-owned `TransportOrder`, with persistent cargo on `transportCargo`.

Why not V1:
- local shared work does not justify a new generic hauling commitment;
- `NpcAgent.carried` is transient and not save-persistent;
- existing transport endpoints are settlement/resource logistics, not player-selected ad hoc work targets.

### Hunting — defer

Relevant symbols:
- `NpcAgent.beginHuntExpedition()`;
- `attemptHuntKill()`;
- `onHuntKill()`;
- `SettlementHuntingHooks.queryTarget`;
- existing `beginCombat`;
- hunting `harvest(target, this.carried)`;
- `deliverHuntYieldHome()`.

Current assumptions:
- driven by food pressure/Hunter semantics;
- arrows may be resupplied from household into transient `carried`;
- weapon comes from `personalInventory`;
- yield goes to household.

Combat/corpse harvest are reusable, but high-level hunting intent/output ownership are not neutral enough yet.

### Fishing — defer

`src/ai/npcProfessionWork.ts::planFishingWork()`:

- requires settlement `landmarks.dock`;
- calls shared `world/fishing.ts::rollFishingCatch`;
- stores fish in transient `carried`;
- deposits to household food destination.

Player fishing uses the same deterministic catch rule but different target/input/UI flow.

The shared seam is currently catch math, not full actor-neutral fishing activity.

### Camp-related work — defer

Player camp/world structures already have real state owners, but current NPC profession/action code does not expose a coherent generic camp-duty activity.

Recon each future camp action separately (fire fuel, cooking, repairs, tent/camp upkeep) and reuse that domain’s own mutation seam.

Do not introduce `CompanionCampWorker`.

## Decision/interruption integration

Shared work is discretionary duty.

It must lose to:

- critical hunger/thirst;
- injury/healing;
- vigor/rest;
- weather response from final `npc-032`;
- combat/flee;
- death/incapacity.

The transient action may be interrupted; the semantic shared-work intent should remain if target/accompany/locality are still valid.

After the interrupt resolves, normal arbitration may resume the same work.

Do not force immediate resume from an action callback; let the existing decision cycle choose it again.

## Accompany handoff

While shared work executes:

```text
accompanyCommitment remains authoritative
tryPursueAccompany does not own this idle slot
shared construction executor acts
```

When work ends, the next ordinary idle-duty cycle should naturally let accompany execution run again.

Do not call “start accompany” again after construction. The existing commitment never ended.

If final `npc-032` locality/recovery says the expedition is moving away, shared work yields and accompany recovery wins.

## Persistence / reconstruction

If `NpcSharedWorkIntent` is introduced:

- add it to the same `NpcAuthoritativeState` snapshot/save normalization path;
- missing field on old save = null;
- reconstruction re-resolves target fresh;
- no separate `SaveSharedWork` registry.

Do not persist action phase, path, session timer or cached target state.

V1 does not resolve construction work while unloaded. Generic travel/survival may continue off-screen; construction contribution waits for a live detailed executor.

This avoids a new companion-only off-screen work engine.

## Performance guardrails

- target comes from explicit request; no global construction discovery;
- one active target per NPC;
- target resolution on decision/action boundaries, not every render frame;
- bounded local accompanying-NPC selection only;
- no scan of player storage;
- no new global resource search;
- no companion scheduler;
- no queue of future tasks.

## Likely implementation sequence

1. Preflight after `npc-032` lands; verify `tryPursueIdleDuty()` ordering and survival/locality hooks.
2. Add minimal shared-work intent type/ownership only if no existing seam fits.
3. Extract neutral construction target adapter/executor from `pursueAcceptedContract()` / `runBuildableContractWorkBout()`.
4. Rewire existing Work Contract construction through the neutral executor first; verify accounting unchanged.
5. Add shared-work idle-duty branch.
6. Add contextual request/cancel action for a known unfinished target.
7. Add target completion/invalidation/accompany/locality cleanup.
8. Add trace/inspection fields.
9. Add focused tests.

## Tests to add

### Neutral construction executor

- palisade/torch/etc. contribution clamps to target remaining work exactly as before;
- stale target returns missing/invalid result without mutation;
- executor itself never credits a Work Contract.

### Work Contract regression

- hired NPC still follows accepted→travelling→working flow;
- accepted target work still calls `creditNpcWork` only for accepted work;
- target completion still closes the contractual work assignment;
- payment/wage claim unchanged.

### Shared-work lifecycle

- request creates one temporary intent for a valid accompanying NPC;
- non-accompanying/dead/unavailable NPC cannot receive it;
- work contribution mutates same target as Player;
- completion clears intent;
- explicit cancel clears intent;
- removed target clears intent;
- ordinary interrupt preserves intent;
- death/accompany termination/locality loss clears intent;
- after clearing, same `accompanyCommitment` resumes.

### Ownership

- no Work Contract `npcWorkCompleted` changes from shared expedition contribution;
- giving tool/item creates no shared-work intent;
- storage permission creates no shared-work intent;
- blocked target does not create/materialize missing resources.

### Persistence

If intent is persisted:
- save/load/reconstruction round-trips stable target/source;
- old saves default to null;
- no duplicate contribution occurs on restore.

### Performance / discovery

- implementation has no global target/container scan;
- idle-duty evaluation only touches the active known target.

## Pitfalls

1. **Reusing Work Contract by creating a fake contract.** Do not do this; economics and work authority are separate.
2. **Extracting too much into a generic JobSystem.** Only neutralize the construction execution needed by two real consumers.
3. **Crediting contract work from target delta.** Contract credit must remain attributable to the assignment’s own accepted contribution.
4. **Using `carried` as persistent shared-work cargo.** It is transient and intentionally not persisted.
5. **Treating `personalInventory` as temporary logistics cargo.** It is durable belongings.
6. **Treating `items-player-028` as work authorization.** It is only actor-level container access.
7. **Implementing `assigned_only` locally.** That belongs to `items-player-032`.
8. **Inventing hammer/tool requirements.** Use only existing general domain requirements.
9. **Letting work destroy/recreate accompany.** Work pauses execution, not commitment.
10. **Off-screen companion build tick.** V1 has none.
11. **Global discovery.** Explicit target + bounded local actor only.
12. **Broadening to farm/hunt/fish because low-level seams exist.** Their output/intent ownership is not yet neutral.

## Final implementation boundary

The implementation agent should be able to stay mostly within:

- `src/ai/NpcAgent.ts`;
- a small new/reused neutral NPC construction helper;
- `src/settlement/npcState.ts` only if semantic intent persistence is necessary;
- contextual app interaction/action wiring;
- focused tests.

Other activity domains are recon references, not implementation scope.

