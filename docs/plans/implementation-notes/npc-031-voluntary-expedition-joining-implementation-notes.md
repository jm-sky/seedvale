# Implementation Notes: npc-031 — Voluntary expedition joining

## Current dependency state

- `npc-029` is still `planned`. It is a real blocker: do not invent an accompany/follow record, lifecycle API, persistence fields or follow execution in `npc-031`. Implement against the final public seam from `npc-029` after it lands.
- `settlements-npcs-019`, the hard dependency of `npc-029`, is currently `verification needed` and already provides persistent NPC transport cargo plus detailed/off-screen execution ownership. `npc-031` must not call that transport machinery directly; any off-screen accompaniment continuity belongs behind `npc-029`.
- `npc-030` is still `planned`, so there is currently no implemented neutral expedition-context type to reuse. Re-check after `npc-029`; if no shared context exists then, introduce only the minimal source-neutral terms required by the final accompany commitment and voluntary evaluation. Do not depend on paid Work Contract fields.

## Existing seams to reuse

- `src/ai/NpcAgent.ts` is the coordination point. Higher-priority pressures are resolved before `beginIdle()`. Today `beginIdle()` calls `tryPursueWorkContract()` before ordinary schedule/idle behaviour. Voluntary **initiative** belongs at this idle-duty boundary, not in `npcDecision.ts` as another physiological/safety pressure.
- Do not let voluntary initiative jump ahead of an accepted Work Contract or the future active accompany commitment. Prefer the idle-duty dispatch seam introduced by `npc-029` if it exists; otherwise keep ordering explicit and small rather than adding another top-level arbitration framework.
- `src/ai/reactionChance.ts::PlayerSocialState` already carries exactly the relevant social stores into `NpcAgent`: `relationLevel`, legacy `standing`, settlement `reputation`, and `renown`. Use the existing injected `NpcAgentDeps.getPlayerSocial`; do not import `QuestManager` or `ReputationManager` into NPC code and do not use `standing` unless the voluntary-join design explicitly needs that separate legacy signal.
- `src/reputation/ReputationManager.ts::Reputation` owns `trust`, `competence`, `benevolence`, `courage`, `integrity` in `-100..100`; renown is separate `0..100`. Normalize these in the pure evaluator, not at call sites. Keep renown out of the base willingness score unless it represents awareness/initiative gating.
- `src/ai/characters.ts::CharacterDef` already exposes `role`, Big Five `personality`, and deterministic `traits`; `curious` is an existing trait. Do not add companion traits/archetypes.
- `src/settlement/families.ts::FamilyMember` has real `age` and `relation`; `NpcAgent` also receives `familyMembers: FamilyMemberRef[]`. Use these facts for adult/household-cost derivation. Do not persist `lifeStage`, `hasDependants`, or expedition-specific responsibility flags.
- `NpcAgent.schedule` is already the effective schedule produced by `effectiveScheduleFor(...)`, including trait overlays. Use the effective schedule/current scheduled activity for opportunity cost; do not score against raw role templates separately.
- `src/ai/approachPlayer.ts` is intentionally narrow and currently has only `ApproachPlayerIntent.kind = 'work_contract_payment'`. Extend that intent union with a voluntary-proposal intent only if NPC initiative needs movement to the player; reuse `isPlayerLocallyEligible()` / `isPlayerApproachArrived()` and existing `NpcAgent` approach execution. Do not create a second approach FSM.
- Existing ambient player reactions are only a pattern for social inputs: `computeReactionChance()` is pure, but `NpcAgent` currently resolves the final ambient reaction with `Math.random()`. Do **not** reuse that random roll for voluntary initiative. Joining/proposal gating must be reproducible and inspectable as required by the plan.

## Evaluator boundary

Create one focused pure module near the existing social/decision evaluators, e.g. `src/ai/voluntaryExpeditionJoin.ts`, with a compact input assembled by `NpcAgent`/interaction wiring and an output containing eligibility, score/threshold, blockers and modifier breakdown.

Keep runtime/transient facts outside the evaluator's ownership. The caller should derive and pass facts such as:

- dead/unable-to-act;
- adult eligibility from `member.age` (use the same adulthood convention already used by settlement generation/staffing; do not invent a second age threshold);
- active Work Contract from `workContracts.findActiveWorkByNpc(npcId)`;
- active accompany commitment through the final `npc-029` API;
- current critical need / combat / flee / danger eligibility from existing `NpcAgent` state/decision facts;
- effective scheduled activity and bounded duty conflict;
- relationship/reputation/renown from `getPlayerSocial()`;
- neutral expedition terms from the final shared context.

This keeps invitation evaluation callable synchronously without teaching the evaluator about `NpcAgent`, managers, Three.js, pathfinding or world scans.

### Blockers vs modifiers

Use blockers for states that make joining invalid now: death, child/dependent eligibility, incompatible active commitment, active Work Contract, unresolved combat/flee, and genuinely critical survival state. Do not encode these as very large negative weights.

Use modifiers for preferences/opportunity costs: personality, relationship, selective reputation dimensions, schedule conflict, household responsibility, role suitability, expected time/distance and bounded danger.

For player invitation, re-evaluate at the moment the player chooses the invitation action; do not cache an earlier willingness result across world-state changes.

## Initiative vs invitation

Both paths must call the same willingness evaluator.

- **Invitation:** one-shot interaction decision. It may be offered only when meaningful expedition context exists; acceptance immediately creates the `npc-029` commitment through its public creation seam.
- **Initiative:** low-priority idle/social opportunity. Gate local player relevance first with the existing approach range, then evaluate willingness, then apply only an initiative-specific threshold/awareness rule. Do not duplicate the modifier table.
- Initiative needs a cooldown/throttle. Reuse an existing NPC decision/social cadence where it gives the required semantics; if a proposal-specific cooldown is unavoidable, keep it transient unless persistence is required to prevent save/reload exploits. Never run a per-frame all-NPC recruitment scan.
- A proactive NPC must first approach and surface a normal interaction/dialogue proposal. Do not create the accompany commitment merely because the initiative score passed.

## Interaction/dialogue ownership

Current dialogue is split between flavor/topic generation and quest overrides; opening dialogue itself is presentational. Keep voluntary invitation/proposal as another explicit interaction action/result rather than embedding mutations in generic dialogue text generation.

The action that accepts a proposal/invitation should own the final revalidation and call to `npc-029`. This avoids a stale UI choice creating a commitment after the NPC becomes busy, enters danger or accepts other work.

Do not route this through `QuestManager.onInteract()` and do not create a permanent `Recruit` action. Quest state may coexist with the conversation but must not become ownership for accompaniment.

## Expedition context

At implementation time inspect `npc-029` first, then `npc-030` if implemented. There must be one neutral representation shared by paid and voluntary accompaniment.

Only include facts actually required to bound/evaluate the expedition, such as semantic destination/end condition, expected duration/distance and a coarse danger signal if the shared contract provides them. No route scans, pathfinding, fauna scans or simulated combat are justified for willingness.

If danger is absent/unknown, represent that explicitly or neutrally; do not synthesize precision from nearby fauna or current camera/world detail.

## Diagnostics and tests

Extend existing NPC trace/inspection rather than adding companion UI. Record the evaluation result at the decision boundary: invitation/proposal source, blockers, score, threshold, initiative gate and a small expedition-context summary. Avoid logging every idle tick when no real opportunity existed.

Pure evaluator tests should pin relative behavior/invariants rather than overfit every tuning weight. In integration tests specifically prove:

- active Work Contract/future accompany commitment prevents a second commitment;
- initiative is reached only after higher-priority decisions and existing idle duties permit it;
- invitation revalidation can refuse after state changes;
- initiative and invitation use the same base evaluation;
- high renown alone cannot turn a weak/unsafe willingness result into acceptance;
- no `WorkContractRecord`, assignment or payment state is created by voluntary acceptance;
- successful acceptance calls only the `npc-029` commitment seam, leaving follow/persistence/off-screen execution to that system.

## Implementation order adjustment

1. Do not start feature code until `npc-029` is implemented; reconcile these notes with its final API.
2. Re-check whether `npc-030` has since introduced the neutral expedition context.
3. Add the pure evaluator and tests using current social/family/schedule contracts.
4. Wire invitation with final-state revalidation and `npc-029` commitment creation.
5. Wire initiative into the post-pressure idle-duty path and narrowly extend `approachPlayer` intent if needed.
6. Add trace/integration coverage; do not touch follow movement, persistence or off-screen travel here.
