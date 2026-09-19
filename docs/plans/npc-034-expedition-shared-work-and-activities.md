# Plan: Expedition shared work and activities

**Created:** 2026-09-11
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** ~~npc-029~~, npc-032
**Domain:** `npc`
**Subdomains:** `work` `behavior` `decision-making`
**Tags:** `companions` `expedition` `work` `construction` `activities`
**Roadmap:** `companions.md`
**Model:** Sonnet, Composer

## Recon result

Focused recon on current `main` confirms that the roadmap-level “shared activities” scope is too broad for one implementation slice.

The strongest existing actor-neutral seam is **construction contribution**. Player work and Work Contract NPC work already mutate the same authoritative buildable state through target-owned contribution APIs. Farming, gathering, hauling, hunting, fishing and camp work reuse useful lower-level primitives, but their end-to-end orchestration still assumes settlement profession, household storage, home delivery, player-only interaction, or another domain-specific commitment.

V1 therefore implements **shared construction assistance only**.

Automatic withdrawal of construction materials from player storage is **not part of V1**. `items-player-028` only provides actor-level withdraw/deposit authorization. Resource/context rules, `assigned_only`, reserve policy and structured work authority belong to `items-player-032`. Adding those here would create exactly the parallel logistics/storage authority this plan must avoid.

## Goal

Allow an ordinary NPC with an active temporary `accompanyCommitment` to temporarily help with a real unfinished construction target while remaining governed by the normal NPC decision/action pipeline.

Target model:

```text
real unfinished world construction
+ active accompany commitment
+ explicit temporary help request
+ NPC eligibility / availability
        ↓
ordinary idle-duty arbitration
        ↓
shared construction execution
        ↓
target-owned contributeWork(...)
        ↓
authoritative world progress
        ↓
complete / cancel / invalidate / yield
        ↓
same accompany commitment resumes
```

Do not create `CompanionBuild`, `CompanionWorkManager`, a companion job scheduler, fake zero-price Work Contracts, duplicate construction progress, or companion-specific inventories.

## Dependency state verified on current main

| Plan | Current status | Relevance |
|---|---|---|
| `npc-029` | `verification needed` | implemented accompany/follow commitment and idle-duty execution; treated as landed dependency |
| `npc-032` | `planned` | hard dependency for final expedition survival/locality/interruption semantics |
| `items-player-028` | `planned` | related Stage 1 storage permission; no longer a hard dependency for V1 |
| `items-player-032` | `planned` | later dependency for work-purpose/`assigned_only` material withdrawals |
| `items-player-027` | `verification needed` / landed | related ordinary Player→NPC ownership transfer for tools/items |

Do not start implementation until `npc-032` has landed and its final idle-duty/survival semantics have been verified.

## Core invariants

### Shared work is ordinary NPC work in an unusual context

```text
world has useful work
+ NPC has capability/profession/tools
+ NPC is available
+ accompany/shared context
→ normal NPC arbitration
→ ordinary action
→ authoritative world mutation
```

Accompaniment is not a new NPC type and does not replace needs, combat, schedules, profession or household ownership.

### Work authority is separate from resource permission

Keep separate:

```text
reason to work
!= storage permission
!= item ownership
!= tool capability
!= material availability
!= action execution
!= world-state authority
```

A granted tool or allowed chest never creates work intent.

### World target remains authoritative

Construction target owns remaining work, stages, completion and final mutation. Shared-work state stores only semantic intent/reference and never duplicates progress/material state.

## Activity matrix

| Activity | Current owner / capability | Actor-neutral seam | Current gap | V1 |
|---|---|---|---|---|
| Construction | buildable world modules; Work Contract record owns only paid commitment/accounting | target `contributeWork` / `addWork`; Player and NPC already share target progress | reusable NPC execution is embedded in Work Contract state/accounting | **Yes** |
| Farming | `CultivationAnchor`, `foodSources`, crop lifecycle | harvest/plant mutate shared world state | `planFarmWork()` assumes Farmer schedule, household seeds and household/economy output | Later |
| Gathering | herbal/resource hooks, `foodSources`, mining | live query/harvest/mine seams exist | output ownership and destination are profession/need-specific; transient `carried` often ends at household | Later |
| Hauling/transport | `TransportOrder`, generic travel, helper delivery, `buildTransferAction` | real source→carry→deposit and persistent `transportCargo` exist | commitments/endpoints are settlement/logistics-oriented; not a generic local shared-work request | Later |
| Hunting | fauna target/combat/harvest | combat and corpse harvest are shared | hunt intent, arrow resupply and yield destination are Hunter/food/household-specific | Later |
| Fishing | `world/fishing.ts` deterministic catch | Player/NPC share catch rule | NPC target is settlement dock; output flows through transient cargo to household | Later |
| Camp work | fires/tents/cooking/repair domain primitives | individual world mutations exist | no coherent actor-neutral NPC activity flow yet; much orchestration is Player-facing | Later |
| Resource collection/deposit | `Inventory`, `inventoryTransfer`, household/economy/resource-site stores | shared ownership primitives exist | “which source/which destination/why” remains activity-owned | Reuse only, no generic framework |
| Tool/material acquisition | `personalInventory`, catalog capabilities, Player→NPC transfer | normal ownership/capability seams | player-storage work authority requires `items-player-032` | No automatic fetch in V1 |

## V1: explicit shared construction assistance

### Player intent

V1 starts from a **known unfinished construction target** and an explicit contextual player request such as “Poproś o pomoc”.

The request establishes a temporary work opportunity/intent. It does **not** directly start an action or mutate work progress.

Prefer extending the existing contextual interaction/action surface. Do not add a command wheel, Party Tasks screen or RTS control layer.

### Temporary, not permanent

“Pomóż mi przy tym” means:

- one NPC,
- one stable target,
- one temporary work intent,
- valid only while the accompany context remains active,
- cleared on completion/cancel/invalidation/material departure from local expedition context.

It is not a permanent profession order or reusable queued command.

### NPC selection / eligibility

The request is valid only for a currently accompanying, living, locally available NPC.

Profession/skills should influence **eligibility or preference only where the general construction domain already exposes such requirements**. Do not invent “builder companion” classes or new hammer requirements.

If multiple accompanying NPCs are locally eligible, use a bounded deterministic choice from the already-known local accompany set; do not globally scan NPCs.

### Decision integration

Shared work is an idle-tier duty below critical survival/danger and above ordinary accompany follow execution while active.

Conceptually after `npc-032`:

```text
critical needs / healing / weather / combat / flee
→ other higher-priority normal decisions
→ active shared construction work?
→ accompany follow/stay
→ ordinary schedule/idle fallback
```

Integrate with the existing `NpcAgent.tryPursueIdleDuty()` seam rather than adding another scheduler.

### Accompany interaction

During a work bout:

```text
accompanyCommitment = active
follow action         = paused
shared work intent    = active
```

Normal interruption cancels only the transient action. The semantic work intent survives hunger/rest/combat interruption while target + accompany/locality remain valid. When work ends, the same accompany commitment resumes; do not destroy/recreate it.

If expedition movement makes the work target no longer local under final `npc-032`/travel semantics, clear/yield work and resume accompany recovery. V1 must not leave an NPC indefinitely behind to finish construction.

## Construction authority and execution

Current code already has the correct mutation boundary.

Examples:

- `PlayerWells.addWork`
- `StandingTorches.contributeWork`
- `Palisades.contributeWork`
- `TerrainPreparations.contributeWork`
- residential-building contribution path where currently supported

`NpcAgent.runBuildableContractWorkBout()` proves that a normal NPC can travel to a target and call the same target-owned contribution seam, but it also performs Work Contract lookup, assignment-state validation, contractual credit and completion.

Implementation must extract/reuse the **neutral target execution portion** and keep Work Contract accounting outside it.

Desired split:

```text
paid Work Contract assignment ─┐
                               ├→ neutral NPC construction executor → target.contributeWork(...)
shared expedition work intent ─┘

Work Contract branch only:
accepted work → creditNpcWork(...) → wage/payment lifecycle
```

Shared expedition contribution must never increment another contract’s `npcWorkCompleted` or create wage claims.

## Work intent ownership

First verify whether an existing generic commitment/assignment seam can represent temporary non-economic work after `npc-032`.

If not, add the smallest persistent semantic record on `NpcAuthoritativeState`, conceptually:

```ts
type NpcSharedWorkIntent = {
  kind: 'construction'
  target: stable construction target ref
  source: { kind: 'player-request' }
}
```

One active shared-work intent per NPC.

Do not persist paths, destination snapshots, timers, animation, cached target state, cached permission results, material counts or action phase.

## Tools, materials and storage

### V1 material rule

V1 only works on targets whose **current construction stage is already work-ready** under the existing target/domain contract.

Do not add automatic player-storage withdrawal to make a blocked target work-ready.

If the target needs a stage material before contribution can proceed, report/block cleanly and retain or clear the temporary intent according to a small deterministic rule; do not mint or teleport material.

### Existing item/tool ownership

- durable personal belongings/tools: `NpcAuthoritativeState.personalInventory`;
- transient profession work cargo: `NpcAgent.carried`;
- persistent transport cargo: `NpcAuthoritativeState.transportCargo`.

Do not mix these owners.

Use catalog capabilities only where the existing general construction action already requires them. Giving a tool through `items-player-027` transfers ownership but does not create work.

### Player storage

`items-player-028` means only:

> may this NPC withdraw/deposit at this physical player container?

It does not answer whether a beam may be used for this work.

`assigned_only` is defined by `items-player-032`: autonomous transfer is forbidden unless a validated structured authority context from a real assignment/work/provisioning owner is presented and revalidated at commit.

Therefore player-storage construction material fetching is deferred until `items-player-032` lands. A later extension may pass a narrow `work_material` purpose backed by the real shared-work intent/target authority.

No global scan of player containers, no cached permission, no material reservation system in this plan.

## Interruption and completion

Critical survival, healing, combat and fleeing always win through existing NPC mechanisms.

Clear the shared work intent when:

- target completes;
- target disappears/becomes invalid;
- player explicitly cancels/replaces request;
- accompany commitment terminates;
- NPC dies/incapacitates;
- expedition/locality rules require accompany recovery;
- target remains structurally non-actionable under V1 semantics.

Do not clear it merely because one normal hunger/rest/combat action interrupts the current bout.

## Persistence and off-screen

Persist semantic shared-work intent only if it has no existing authoritative owner to reconstruct from.

Detailed execution state stays transient.

V1 does **not** introduce off-screen construction progress. When the NPC is off-screen, generic travel/survival continuity may progress, but construction contribution happens only through the ordinary detailed action executor. On reification, re-resolve target and intent and continue only if still valid.

A later actor-neutral off-screen work resolver can be designed only if the general NPC/work architecture establishes one; do not add a companion-only resolver here.

## Performance

- no per-frame global target scans;
- no scan of every construction or player container;
- request starts from a known target;
- one target re-resolution on decision/action boundaries;
- reuse normal NPC decision cadence and navigation;
- reuse bounded local accompany set;
- no companion job scheduler or persistent queue.

## Scope

### Included

1. Source-neutral temporary construction-work intent/request.
2. Contextual request on a real unfinished target.
3. Bounded deterministic accompanying-NPC eligibility.
4. Integration into existing idle-duty arbitration.
5. Reusable neutral NPC construction executor extracted from Work Contract execution.
6. Same authoritative target contribution seam as Player and hired NPCs.
7. Survival/combat interruption + resume.
8. Clean handoff back to the same accompany commitment.
9. Persistence of semantic intent only if necessary.
10. Existing trace/inspection diagnostics for active target/blocker/source.
11. Automated regression coverage.

### Deferred

- farming/cultivation assistance;
- generic gathering;
- hunting task assignment;
- fishing task assignment;
- camp work/cooking;
- generic hauling/transport;
- autonomous tool acquisition;
- player-storage material fetch (`items-player-028` + `items-player-032`);
- off-screen construction progress;
- multi-NPC work queue/party task allocation.

### Non-goals

- `CompanionBuild` / `CompanionWorkManager`;
- generic JobSystem;
- command wheel / RTS controls;
- fake Work Contract;
- duplicate construction progress/accounting;
- companion inventory;
- global work discovery;
- global storage discovery;
- new item taxonomy or tool requirements.

## Expected integration points

Verify exact final APIs at implementation time:

- `src/ai/NpcAgent.ts`
  - `tryPursueIdleDuty()`
  - `tryPursueWorkContract()`
  - `pursueAcceptedContract()`
  - `runBuildableContractWorkBout()`;
- `src/settlement/npcState.ts` — only if a minimal semantic shared-work intent must persist;
- `src/ai/npcAccompanyCommitment.ts` — read accompany lifecycle, do not extend it into work ownership;
- focused neutral construction-execution helper extracted from Work Contract path;
- `src/world/workContract.ts` / `src/world/createWorkContracts.ts` — retain paid commitment/accounting ownership;
- buildable owner modules exposing contribution APIs;
- existing contextual interaction/action surface for the request;
- existing NPC trace/inspection diagnostics.

Add concise JSDoc/`@domain npc` to important public architectural helpers introduced by this plan.

## Implementation order

1. Verify landed `npc-032` semantics and recon these call-sites against current `main`.
2. Define the smallest semantic shared-work intent/request contract.
3. Extract neutral NPC construction target resolution/work-bout execution from Work Contract economics.
4. Rewire Work Contract construction through that neutral executor without changing accounting.
5. Integrate shared-work intent into `tryPursueIdleDuty()` below higher-priority survival/danger.
6. Add contextual player request/cancel for a known unfinished target.
7. Implement completion/invalidation/locality handoff back to accompany.
8. Extend diagnostics.
9. Add focused automated regression tests and update state docs when functionality is implemented.

## Automated verification

Verify at least:

- Player, hired NPC and expedition NPC mutate the same authoritative target progress;
- shared expedition work never credits unrelated Work Contract work/wages;
- Work Contract construction still credits only accepted work;
- active shared work pauses follow action but preserves `accompanyCommitment`;
- critical survival/combat/flee interrupts shared work;
- shared work resumes after ordinary interruption when still valid;
- target completion clears work intent and follow resumes;
- stale/removed target clears cleanly with no extra contribution;
- accompany termination/death/locality loss clears shared work;
- save/load/reconstruction preserves only semantic intent if one is introduced;
- no off-screen construction contribution occurs in V1;
- no tool/material/storage permission is fabricated;
- NPCs without shared-work intent behave unchanged;
- no global construction/storage scan is added.

## Manual browser verification — User

AI does not perform browser verification.

User should verify an accompanying NPC can be asked to help on a real unfinished construction, physically travels and contributes to the same progress, can be interrupted by ordinary survival/combat, resumes where appropriate, and returns to normal follow after completion/cancel without generating Work Contract wages.

## Completion criteria

V1 is complete when:

```text
accompany commitment
→ explicit real construction request
→ ordinary NPC arbitration
→ normal travel/action
→ existing target-owned contribution
→ interruption/resume
→ completion/cancel/invalidation
→ same accompany commitment resumes
```

with no companion-specific work system, no duplicate world state and no player-storage material automation.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
