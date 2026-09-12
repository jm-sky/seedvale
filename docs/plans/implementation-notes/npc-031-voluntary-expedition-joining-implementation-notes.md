# Implementation Notes: npc-031 — Voluntary expedition joining

## Dependency state on current `main`

- `npc-029` is implemented and `verification needed`. The shared accompany foundation is no longer hypothetical. `src/ai/npcAccompanyCommitment.ts` owns the persistent source-neutral commitment on `NpcAuthoritativeState`; its source union already contains `{ kind: 'voluntary' }` and `{ kind: 'work-contract', contractId }`.
- `NpcAgent.startAccompany(source, mode?, stayAnchor?)` is the public runtime creation seam. It delegates to the authoritative commitment lifecycle and checks the NPC's active Work Contract. Voluntary joining must call this seam with `{ kind: 'voluntary' }`; do not mutate `accompanyCommitment` directly.
- `npc-030` is implemented and `verification needed`. Paid escort now proves the full paid path: Work Contract acceptance → provisioning → `serving` assignment → `startAccompany({ kind: 'work-contract', contractId })` → shared npc-029 execution → scope-aware fulfilment/payment.
- Therefore `npc-031` is no longer blocked by either dependency. Reuse their implemented contracts rather than the older plan assumptions.

## Implemented seams that matter

### Accompany ownership

`src/ai/npcAccompanyCommitment.ts` is authoritative for commitment creation/mode/end rules:

- `NpcAccompanySourceRef` already has the voluntary source; no type extension is required.
- `startNpcAccompanyCommitment()` rejects `dead`, `already-active`, `incompatible-work`, and invalid Stay-without-anchor.
- `NpcAgent.startAccompany()` is the integration seam. A successful voluntary decision should end at this call and leave follow/stay, interruption/resume, persistence and off-screen continuity to npc-029.
- Do not create voluntary-specific follow state, persistence, return travel or cleanup.

The creation boundary already enforces active Work Contract incompatibility. The willingness evaluator should still expose this as an eligibility blocker so refusal is explainable before mutation; final acceptance must rely on `startAccompany()` as the authoritative race/revalidation guard.

### Paid escort architecture to reuse without becoming a Work Contract

`src/world/workContract.ts` now has a discriminated `WorkContractScope`. The escort branch owns `ExpeditionEscortTerms`, explicit completion policies (`duration`, `destination`, `destination_or_timeout`) and stable destination snapshots. `WorkContractAssignment` has `serving`, `serviceStartedAt` and `serviceEndsAt`.

`src/world/createWorkContracts.ts` exposes `createEscort()` and `beginServing()`, while the existing active-assignment/payment lifecycle remains authoritative. None of these APIs should be called by voluntary joining.

`src/ai/npcWorkContract.ts` now contains deterministic paid-escort scoring. It is useful evidence for existing constants/data access, not the voluntary evaluator itself. Do not implement voluntary joining as `rewardCoins = 0`, do not call `scoreWorkContractOpportunity()`, and do not create a `WorkContractRecord`/assignment.

`src/ai/npcPersonalProvisions.ts` now has `escortAwayHours()`, `estimateEscortProvisionNeed()` and `buildEscortProvisionContext()`. Reuse the neutral away-time/provision calculations where their inputs fit; voluntary joining must not fork another duration/destination-to-away-time estimator.

### Expedition context: remove the remaining paid-name coupling once

`npc-030` implemented the only concrete bounded expedition terms, but they currently live in `src/world/workContract.ts` and are named `ExpeditionEscortTerms`. Voluntary joining must not introduce a second parallel expedition shape.

During npc-031, extract only the source-neutral expedition value types/helpers needed by both paths into a small world/domain module (for example `src/world/expedition.ts`):

- destination ref/snapshot;
- completion policy;
- bounded terms;
- validation of required duration/destination fields.

Then make Work Contracts consume that shared type. Preserve existing escort semantics and persistence shape exactly; this is a type/ownership extraction, not a Work Contract redesign or save migration. Keep compatibility re-exports from `workContract.ts` if that avoids unrelated call-site churn.

Do not extract assignment service timing, reward/payment, employer or Work Contract lifecycle — those remain paid-contract concepts. Do not add objectives, route state or a generic expedition manager.

## Voluntary evaluator boundary

Add one focused pure module near the current NPC decision/social evaluators, e.g. `src/ai/voluntaryExpeditionJoin.ts`.

Its input should be plain data assembled by the caller and should contain only facts needed for the decision: character personality/traits/role, age/household context, effective schedule/current duty, current critical/danger/commitment eligibility, `PlayerSocialState`, and the shared bounded expedition terms plus a coarse danger value when available.

Its result should be inspectable, conceptually:

```ts
type VoluntaryJoinEvaluation = {
  eligible: boolean
  score: number
  threshold: number
  blockers: readonly VoluntaryJoinBlocker[]
  modifiers: readonly VoluntaryJoinModifier[]
}
```

Exact names are free to adapt. Keep the evaluator independent from `NpcAgent`, Three.js, managers, pathfinding and world scans.

### Existing data sources

- `src/ai/characters.ts::CharacterDef`: `role`, Big Five `personality`, deterministic traits including `curious`. Do not add recruitable/adventurer traits.
- `src/settlement/families.ts::FamilyMember` plus the family refs already supplied to `NpcAgent`: derive adulthood/household responsibility from real family state. Reuse the codebase's existing adulthood convention; do not persist `lifeStage`/`hasDependants` flags.
- `NpcAgent.schedule`: already the effective schedule after trait overlays. Use the effective current activity for duty/opportunity cost; do not independently rescore raw role schedule templates.
- `src/ai/reactionChance.ts::PlayerSocialState` through `NpcAgentDeps.getPlayerSocial`: personal `relationLevel`, settlement reputation and renown. Keep this injection boundary; do not import `QuestManager`/`ReputationManager` into the evaluator or `NpcAgent`.
- Reputation dimensions are `trust`, `competence`, `benevolence`, `courage`, `integrity`. Prefer trust/competence and contextual courage. Renown is awareness/initiative plausibility, not a generic willingness bonus.
- `WorkContracts.findActiveWorkByNpc(npcId)` remains the authoritative active paid-work lookup. Do not add a duplicate busy flag.
- `authoritativeState.accompanyCommitment` / the npc-029 lifecycle is the authoritative existing-accompany fact. Do not mirror it in evaluator state.

### Blockers vs modifiers

Use blockers for conditions that make joining invalid now: dead/unable, not independently adult, existing accompany commitment, active Work Contract, unresolved combat/flee/immediate danger, and genuinely critical survival state.

Use bounded modifiers for preferences/opportunity cost: openness/curious, smaller extraversion/agreeableness effects, conscientiousness versus duties, neuroticism × danger, personal relationship, selective reputation, role suitability, household responsibility, effective schedule conflict, expected time/distance away and coarse danger.

Do not copy npc-030's paid weights mechanically. Paid escort asks whether compensation offsets cost; voluntary joining needs a positive social/exploration reason to leave ordinary life. A neutral stranger with no meaningful positive reason should fail.

## Invitation and initiative must share one evaluation

### Player invitation

Invitation is a one-shot contextual interaction, not a permanent `Recruit` action. At the final accept action:

1. resolve the current shared expedition context;
2. rebuild current evaluator inputs;
3. evaluate eligibility/willingness;
4. if accepted, call `NpcAgent.startAccompany({ kind: 'voluntary' }, 'follow')`;
5. treat a false/rejected start as a normal failed revalidation, not as partial companion state.

Never cache an earlier willingness result across world-state changes.

### NPC initiative

Initiative belongs at the existing low-priority idle/social boundary after higher-priority pressures and active commitments. `NpcAgent` already has throttled social behaviour (`nextSocialAttemptSim`); prefer extending/reusing an existing bounded cadence rather than adding a per-frame recruitment scan.

`src/ai/approachPlayer.ts` still has only the `work_contract_payment` intent. If a proactive join proposal needs physical approach, extend this intent union narrowly with a voluntary-proposal payload and reuse `isPlayerLocallyEligible()`, `isPlayerApproachArrived()` and the existing `NpcAgent` approach action. Do not create another approach FSM.

Passing initiative scoring must only create a proposal opportunity. The NPC approaches and asks; the accompany commitment is created only after the proposal is accepted and final state is revalidated.

Do not use the ambient social `Math.random()` path. Initiative must be deterministic/inspectable. If variability is needed, derive it from stable NPC/context/time-bucket inputs and expose the result in diagnostics.

## Provisioning boundary

Paid escort now explicitly provisions before service. Voluntary travel should not silently bypass ordinary NPC survival logistics, but npc-031 should reuse existing personal/household provision mechanisms rather than create companion supplies.

Use the shared expedition terms with the existing escort away-time/provision estimators where applicable. If provisioning is infeasible, represent that as eligibility/cost according to current NPC provision semantics. Do not transfer player-paid provisions, create wages, or create Work Contract state.

Do not make voluntary acceptance responsible for follow-time hunger/thirst handling; normal NPC needs continue to interrupt/resume npc-029 accompaniment.

## Diagnostics

Extend the existing NPC inspection/decision trace rather than adding a companion debug UI. Record only real invitation/proposal evaluations, not every idle tick:

- source: invitation / initiative;
- eligible + blockers;
- score + acceptance threshold;
- initiative-specific gate/threshold where applicable;
- modifier breakdown;
- compact expedition summary;
- final `startAccompany()` success/rejection when acceptance was attempted.

Important new public/architectural evaluator or shared expedition helpers should have concise JSDoc and `@domain npc` / appropriate world-domain tags for preflight discovery.

## Tests worth pinning

Prefer invariant/relative tests over exact tuning weights:

- active Work Contract blocks voluntary joining before mutation and `startAccompany()` remains the final authority;
- existing accompany commitment blocks a second commitment;
- dead/child/critical danger-survival cases are blockers rather than huge negative modifiers;
- trusted/friendly relation materially improves willingness versus stranger with otherwise equal inputs;
- openness/curious can help but cannot override hard blockers;
- conscientiousness increases meaningful schedule/duty cost; neuroticism increases danger sensitivity;
- high renown alone cannot manufacture willingness;
- invitation and initiative use the same base evaluator, with initiative only adding its stricter gate;
- invitation revalidation can refuse after state changes;
- successful voluntary acceptance creates `{ kind: 'voluntary' }` through `NpcAgent.startAccompany()` and creates no Work Contract/assignment/payment state;
- npc-029 follow/stay/persistence behavior is not duplicated or changed;
- extracting shared expedition terms preserves npc-030 contract creation, save shape, fulfilment and evaluator behavior;
- NPCs without a voluntary opportunity retain existing work/schedule/social behavior.

## Recommended implementation order

1. Extract the already-implemented bounded expedition terms from Work Contract ownership into the smallest source-neutral world/domain module, preserving npc-030 behavior and compatibility.
2. Add the pure voluntary eligibility/willingness evaluator and focused tests.
3. Assemble real character/family/schedule/social/commitment/provision inputs at the existing NPC/interaction boundary.
4. Wire player invitation with final-state revalidation and `startAccompany({ kind: 'voluntary' })`.
5. Wire deterministic NPC initiative into the existing idle/social cadence; extend `approachPlayer` only if physical proposal approach needs it.
6. Add trace/inspection coverage and integration tests. Do not touch npc-029 movement/persistence/off-screen execution or npc-030 payment lifecycle except for the neutral expedition-type extraction.
