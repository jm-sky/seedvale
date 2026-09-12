# Plan: Voluntary expedition joining

**Created:** 2026-09-11
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** ~~npc-029~~
**Domain:** `npc`
**Subdomains:** `decision-making` `relationships` `behavior`
**Tags:** `companions` `voluntary-joining` `social` `expedition`
**Roadmap:** `companions.md`
**Model:** Opus, Sonnet

## Implementation status

Implemented on `main` (2026-09-12):

- `world/expedition.ts`: extracted the source-neutral `ExpeditionTerms`/`ExpeditionDestination`/`ExpeditionCompletionPolicy`/`isValidExpeditionTerms` (destination/duration/completion semantics only, no economic field) out of `world/workContract.ts`, which now re-exports them under their original `ExpeditionEscort*` names — zero call-site churn for the existing paid-escort code, and voluntary joining depends on the neutral module directly rather than on anything named "Escort".
- `ai/voluntaryExpeditionJoin.ts`: one pure, deterministic evaluator (`evaluateVoluntaryJoin()`) — hard blockers (dead, not an adult, incompatible active accompany/Work Contract, critical need, unresolved combat/flee) checked before any score; willingness score from Big Five personality + `curious` + a small smooth age-flexibility term, personal relation + trust/competence/courage (courage combined with danger), a small independent role-suitability table, minus household responsibility (spouse/children), a conscientiousness-scaled schedule-conflict cost, expected-away-hours cost, a neuroticism-amplified/competence-relieved danger cost, and paid escort's own provisioning-feasibility cost (`contractProvisionFeasibilityPenalty`, reused as-is — `Number.POSITIVE_INFINITY` when supplies genuinely can't cover the trip becomes an unclearable cost, never a categorical blocker). Renown deliberately never enters the score — `isVoluntaryInitiativeEligible()` is the separate initiative-only gate (stronger score margin + a `stranger` needing enough renown to plausibly recognize the player).
- `settlement/professionStaffing.ts`: extracted `isAdultAge(age)` (the existing `age >= 18` convention) so this plan's adult-eligibility blocker never invents a second threshold; `isProfessionAdult()` now calls it.
- `ai/NpcAgent.ts`: new `readonly age` field (same `member.age` source `generatePhysicalProfile` already consumes); `voluntaryJoinContext()` assembles the evaluator's input from existing commitment/need/schedule/social/provisioning state (no new `busy`/`available`/`recruitable` flags, no second provisioning estimator — reuses paid escort's `estimateEscortProvisionNeed`/`readContractProvisionAvailability`); `respondToVoluntaryJoinInvitation()` (player invitation, re-evaluates fresh at the moment the player commits to a duration) and `respondToVoluntaryJoinProposal()` (the player's answer to this NPC's own proposal) both call the same evaluator and, only on acceptance, call the existing `startAccompany({kind:'voluntary'}, 'follow')` seam — no Work Contract, no reward, ever created. `tryProposeVoluntaryJoin()` is wired into `tryPursueIdleDuty()` *after* escort service, accompany and Work Contract, so initiative never jumps the queue; it approaches the player exactly like a payment request (`isPlayerLocallyEligible`/`isPlayerApproachArrived`, ordinary `approachPlayer` action) and only ever surfaces a pending proposal — never creates the commitment itself. A transient (never persisted) per-NPC cooldown throttles re-proposing; ordinary follow-time hunger/thirst handling stays owned by existing NPC need interruption/resume, never by voluntary joining itself.
- Player invitation: a new "Zaproponuj udział w wyprawie" topic in the existing Vue NPC dialogue menu (`ui-vue/NpcDialogueMenu.vue`/`store.ts`, wired in `app/inventoryWiring.ts`) — duration presets (mirroring paid escort's own V1 duration-only UI), immediate accept/refuse resolution, no economics anywhere in the flow.
- NPC initiative: the same dialogue menu auto-opens a "propose" topic (mirroring the existing payment-claim auto-open exception) with plain accept/decline; declining is an ordinary social result with no commitment and no relationship penalty.
- Diagnostics: `voluntaryJoin.evaluated`/`voluntaryJoin.initiativeGate` NPC trace events and a `voluntaryJoin` inspection-snapshot field (pending proposal + cooldown), extending the existing trace/inspector rather than a new debug screen. Acceptance success/rejection is inspectable via the existing `accompany.started` trace event immediately following an `accepted: true` evaluation.
- Automated tests: `ai/voluntaryExpeditionJoin.test.ts` (24 cases) covering purity, every blocker, relationship/reputation/personality/danger direction, household/schedule outweighing curiosity, provisioning feasibility as an unclearable cost, and the initiative gate's stronger margin + renown-for-strangers rule.
- `docs/state/npc.md` updated with the idle-duty dispatch ordering change and a new "Voluntary expedition joining" paragraph.
- Deliberately did **not** extend `ai/approachPlayer.ts`'s `ApproachPlayerIntent` union or reuse `NpcAgent`'s unrelated `nextSocialAttemptSim` (NPC↔NPC campfire-conversation cadence, tuned in seconds — reusing it would incorrectly couple two independent behaviors): the existing generic `startAction({kind:'approachPlayer'})` execution path plus a dedicated `pendingJoinProposal` field already cover the same bookkeeping without duplicating unrelated state, and initiative only ever runs inside the existing per-decision-cycle idle-duty seam, never a per-frame scan.

Browser/gameplay verification remains manual (see Verification § below).

## Goal

Allow an ordinary NPC to voluntarily decide to accompany the player on a temporary expedition without payment.

This must extend the existing NPC decision/social mechanisms rather than create a separate recruitment system. A successful voluntary decision must create the same source-neutral accompany/follow commitment owned by `npc-029` that paid escort work eventually uses.

Voluntary joining is not:

- a zero-price Work Contract,
- a permanent companion state,
- a `RecruitableNPC` / `YoungAdventurerNPC` class,
- a player-owned follower AI,
- a companion-specific probability table,
- an always-visible `Recruit` interaction.

The intended flow is:

```text
existing NPC decision/social opportunity
        ↓
hard eligibility
        ↓
voluntary willingness
        ↓
player invitation OR NPC initiative
        ↓
shared expedition/accompany context
        ↓
npc-029 accompany commitment
```

## Current architecture to preserve

The current NPC architecture already provides the concepts needed for most inputs:

- character traits and Big Five personality,
- real age on settlement family members,
- household/family relationships,
- profession/role and schedules,
- current NPC needs and decisions,
- Player↔NPC relationship state,
- settlement-scoped reputation dimensions and renown,
- deterministic social reaction scoring,
- NPC inspection/decision traces,
- reusable NPC approach-to-player behavior.

There is currently no generic Player↔NPC episodic/shared-experience history store and no general expedition-danger service. This plan must not introduce either unless implementation of a required dependency already provides a suitable shared mechanism.

`npc-029` is a dependency contract, not an assumption about already-implemented code. The implementation must first verify the final public accompany commitment seam provided by that plan.

## Core architecture

### 1. Voluntary willingness is a pure contextual evaluation

Add one focused deterministic evaluator answering:

> Given this NPC, player social state, current obligations and an expedition context, is this NPC willing and able to join voluntarily?

Conceptually:

```ts
type VoluntaryJoinEvaluation = {
  eligible: boolean
  score: number
  threshold: number
  modifiers: VoluntaryJoinModifier[]
  blockers: VoluntaryJoinBlocker[]
}
```

The exact type names are implementation details, but the evaluator must remain pure/inspectable where practical.

Do not create a generic social-scoring framework for this feature.

### 2. Joining must enter the existing NPC decision pipeline

Voluntary joining must enter existing NPC decision arbitration as a contextual social opportunity.

Do not add:

- an independent recruitment manager,
- a companion polling loop,
- a per-frame scan for recruitable NPCs,
- a second top-level NPC decision mechanism.

NPC initiative should only be considered from an existing low-priority/idle social decision seam after higher-priority needs, danger and commitments have had their normal opportunity to act.

The implementation should preserve existing NPC decision trace/inspection behavior so the reason for joining or refusing can be inspected.

### 3. Separate willingness from initiative

The willingness evaluator decides whether joining is acceptable to the NPC.

NPC initiative is a separate decision about whether the NPC proactively raises that possibility with the player.

Both invitation acceptance and NPC initiative must use the same underlying willingness result. Do not maintain separate personality/reputation scoring tables for the two paths.

Self-initiative may require a higher threshold or additional contextual gate, but it must not redefine willingness.

This distinction is important for renown:

- renown primarily affects awareness/social plausibility,
- Player↔NPC relationship affects personal willingness,
- reputation dimensions affect the NPC's assessment of the player as an expedition partner.

High renown must not simply become a generic positive companion score.

## Eligibility before scoring

Hard incompatibilities should be modeled as eligibility/blockers rather than huge negative score modifiers.

Examples to evaluate against actual current state and dependency contracts:

- NPC is dead or otherwise unable to act,
- NPC is not an independently eligible adult,
- incompatible active accompany commitment,
- incompatible active Work Contract assignment,
- another hard commitment that cannot be abandoned,
- immediate critical survival need,
- active unresolved flee/combat/danger state.

The implementation must use existing commitment/need ownership rather than introducing duplicate `busy`, `available` or `recruitable` flags.

## Willingness inputs

### Personality

Use existing `CharacterDef` personality/traits.

Expected direction:

- **openness** — primary exploration/novelty signal,
- **curious** — bounded additional interest signal, not a replacement for openness,
- **extraversion** — small positive social/shared-travel influence where appropriate,
- **agreeableness** — small cooperation influence, especially when the personal relationship is positive,
- **conscientiousness** — increases the cost of abandoning duties or schedules,
- **neuroticism** — increases sensitivity to perceived danger.

Avoid binary rules such as `openness > 0.7 => joins`.

Personality should modify a contextual decision rather than create a hidden companion archetype.

### Age and life stage

Age may influence flexibility, physical suitability and responsibility cost where justified by existing state.

Do not encode a general rule that young NPCs are adventurers or that older NPCs refuse expeditions.

Children must not independently volunteer for expedition accompaniment unless a future explicit dependent/guardian mechanism supports it.

Life stage should preferably emerge from real age plus household/role context rather than a new persistent `lifeStage` recruitment field.

### Household responsibilities

Use existing family/household state as opportunity cost where the current data makes that inference defensible.

Examples include:

- dependants or family responsibilities,
- household role,
- obligations that make leaving meaningfully costly.

Do not add expedition-specific responsibility flags.

A single adult may have lower household cost than an adult with strong family responsibilities, but household state must remain one factor rather than a hard NPC class.

### Profession and schedule

Use the current effective schedule, role and workplace state.

Joining should become less attractive when it conflicts with important work or scheduled duties.

Profession may contribute contextual suitability where meaningful, but do not create an `escortEligibleRoles` or equivalent whitelist.

A hunter or guard may plausibly evaluate dangerous travel differently from another role, but profession alone must never imply willingness.

### Current needs, problems and commitments

Immediate needs and existing commitments take precedence over discretionary expedition joining.

Voluntary joining should not be inserted as a peer to urgent physiological/safety decisions if that would let social behavior override them.

Use existing need/plan/commitment state. Do not create a parallel generic `NPCProblems` store solely for this plan.

### Player↔NPC relationship

The personal relationship to the player should be a major willingness signal.

A trusted/friendly player should normally receive a meaningfully better result than a stranger, while preserving room for personality, duties and danger to override it.

Do not infer detailed shared-history facts from the relationship scalar.

### Renown

Use settlement renown mainly as awareness/social plausibility.

High renown may make it believable that an NPC who barely knows the player recognizes them and considers approaching or accepting an invitation.

Low renown must not penalize an NPC who already has a strong personal relationship with the player.

Renown is not a generic measure of player quality or morality.

### Reputation

Use existing settlement reputation dimensions selectively rather than collapsing them into one score.

The most relevant dimensions are expected to be:

- **trust** — whether the NPC believes travelling with the player is safe/reliable,
- **competence** — confidence that the player can handle expedition problems,
- **courage** — contextual confidence for risky travel.

`benevolence` and `integrity` should only participate if their meaning is clearly relevant to the actual decision.

High courage must not be a universal positive modifier; courage is useful mainly in combination with actual expedition risk/context.

### Previous shared experiences

Do not add a new `CompanionHistory`, expedition-history store or generic episodic memory system in this plan.

There is currently no general Player↔NPC shared-experience history store. Use only existing persisted signals where they genuinely represent the required information.

Richer consequences such as remembering a successful expedition, rescue, abandonment or shared danger should be handled by a future relationship/memory mechanism rather than being smuggled into this evaluator.

### Perceived danger

Danger must be bounded, deterministic and cheap to evaluate.

Do not perform:

- route-wide fauna scans,
- pathfinding solely to estimate recruitment willingness,
- combat simulation,
- expensive world sampling every decision tick.

Use danger information already present in the expedition context or other existing state. Unknown danger should produce a conservative/neutral result rather than invent precise knowledge.

Neuroticism may amplify danger sensitivity. Player competence/courage may partially offset perceived expedition risk.

## Shared expedition context

This plan must not create a third representation of an expedition.

First reuse the source-neutral expedition/accompany context defined by `npc-029` or extracted while implementing `npc-030`, if such a shared type exists by implementation time.

If the dependencies still keep paid-contract terms coupled to Work Contracts, extract only the smallest neutral context needed by both paid and voluntary accompaniment, for example destination/duration/danger semantics. Do not copy the paid contract model into this plan.

The voluntary path must contain no economic fields such as reward or provisions payment unless they are genuinely neutral world-travel data already shared by both systems.

A joining decision must be bounded by meaningful expedition context; it should not mean "follow the player indefinitely".

## Player invitation

The player may invite an NPC through normal contextual interaction/dialogue.

Do not expose a permanent generic `Recruit` action on every NPC.

The invitation must:

1. supply/reuse meaningful expedition context,
2. evaluate current eligibility and willingness,
3. surface acceptance/refusal through normal NPC interaction,
4. create the `npc-029` accompany commitment only after acceptance.

Refusal should be an ordinary social result. It should not create a permanent anti-companion state or relationship penalty by default.

## NPC initiative

An NPC may proactively offer to accompany the player when all of the following are true:

- the NPC is currently in an appropriate low-priority social/idle decision state,
- the player is locally reachable/relevant,
- there is a meaningful expedition context,
- eligibility passes,
- willingness is sufficiently strong,
- initiative-specific contextual gates pass.

NPC initiative should reuse the existing approach-to-player mechanism rather than teleporting the NPC or opening UI remotely.

`src/ai/approachPlayer.ts` currently supports approaching a nearby player for an interaction intent and is an appropriate seam to generalize narrowly if required. Do not turn it into a generic companion manager.

The NPC should approach and propose joining through normal interaction/dialogue. The NPC must not silently attach itself to the player.

Initiative must be deterministic/throttled through existing decision cadence/cooldown mechanisms where possible. Do not add a raw `Math.random()` recruitment roll.

If a stable deterministic variability gate is genuinely useful, it must be reproducible and visible in diagnostics.

## Commitment creation

Successful voluntary joining must converge on the exact same accompany commitment as the paid escort path:

```text
voluntary social decision accepted
        ↓
create npc-029 accompany commitment
        ↓
target = player
mode = follow/accompany
a bounded expedition context/end condition
source = voluntary, if source metadata is part of npc-029's contract
```

The voluntary system must not own follow movement, catch-up behavior, combat support, persistence or termination semantics already owned by `npc-029`.

There must be no Work Contract, reward, payment state or contract-payment interaction for voluntary joining.

## Evaluation model

The exact weights must be tuned during implementation/tests, but the model should conceptually remain small and inspectable:

```text
exploration interest
    openness
  + curious
  + justified age/life flexibility

social willingness
    personal relationship
  + relevant trust
  + relevant competence
  + contextual courage

contextual suitability
  + profession/experience when meaningful

costs
  - household responsibility
  - schedule/profession opportunity cost
  - current needs/problems/commitments
  - expected time away
  - distance/travel burden
  - perceived danger
  - neuroticism × danger sensitivity

= willingness score
```

Renown should normally influence awareness/initiative plausibility rather than being blindly added to willingness.

Apply hard eligibility first, then evaluate willingness against a threshold.

A neutral NPC with no meaningful positive reason to join should not volunteer by default.

NPC self-initiative may require a stronger gate than accepting an explicit invitation, but both must derive from the same willingness evaluation.

## Diagnostics

Expose enough information through the existing NPC inspection/decision trace to answer:

> Why did this NPC accept, refuse, or decide to propose joining?

Include where practical:

```text
eligible
score
acceptance threshold
initiative gate/threshold
blockers
modifier breakdown
expedition context summary
```

Do not add a separate Companion Debug screen solely for this plan.

Important new architectural/public functions or classes should receive concise JSDoc where useful for AI preflight discovery, including an appropriate `@domain npc` tag.

## Likely integration points

Verify these against the current code before implementation:

- `src/ai/NpcAgent.ts` — existing NPC decision/idle/social integration and diagnostics,
- focused new pure evaluator near existing NPC decision/social evaluators,
- `src/ai/characters.ts` — personality traits and profession/role,
- `src/settlement/families.ts` — age and family/household facts,
- existing schedule helpers — schedule/work opportunity cost,
- existing Player↔NPC social lookup — personal relation,
- existing settlement reputation/renown lookup — reputation dimensions and awareness,
- `src/ai/approachPlayer.ts` — NPC-initiated proposal approach if required,
- existing dialogue/interaction layer — proposal/accept/refuse presentation,
- `npc-029` public accompany commitment seam,
- any neutral expedition-term type extracted by `npc-030`.

`NpcAgent` should remain independent from `QuestManager`/`ReputationManager` internals where current dependency injection already provides social lookup state.

## Scope

Includes:

- voluntary joining eligibility,
- deterministic/inspectable willingness evaluation,
- personality and `curious` influence,
- age/life-context influence without adventurer archetypes,
- household responsibility cost,
- profession/schedule opportunity cost,
- current need/problem/commitment blocking or cost,
- Player↔NPC relationship influence,
- renown as awareness/initiative plausibility,
- trust/competence/courage reputation influence,
- bounded perceived danger,
- reuse/extraction of one shared neutral expedition context,
- player invitation,
- NPC proactive proposal,
- reuse of existing approach-to-player behavior,
- creation of the same `npc-029` accompany commitment as paid escort,
- diagnostics and deterministic tests.

## Non-goals

- zero-price Work Contracts,
- paid escort economics,
- permanent companions,
- recruitable NPC subclasses/archetypes,
- a generic Recruit button/list,
- follower movement/combat implementation owned by `npc-029`,
- player-owned NPC inventory/equipment management,
- multi-companion formation/tactics,
- generic episodic memory/shared-experience storage,
- a generic life-choice framework,
- detailed route-risk simulation,
- LLM-driven joining decisions,
- unrelated NPC decision refactors.

## Related plans

### `npc-029` — NPC Accompany / Follow Commitment

Hard dependency.

Owns the source-neutral temporary accompany/follow commitment and its lifecycle. This plan must terminate in that same mechanism rather than creating a voluntary companion state.

### `npc-030` — Paid Expedition Escort Work Contracts

Closely related but not a hard ownership dependency.

Paid and voluntary paths should share neutral expedition/accompany context where practical, but their decision semantics remain distinct:

```text
paid escort
→ Work Contract evaluation
→ accepted contract
→ npc-029 accompany commitment

voluntary joining
→ social/NPC decision evaluation
→ accepted proposal/invitation
→ npc-029 accompany commitment
```

Do not implement voluntary joining as a reward-0 paid escort contract.

### Personality / decisions

Reuse the current Big Five/trait decision architecture and the direction established by personality-decision work: personality modifies existing contextual decisions rather than creating a separate selector.

### Relationships / reputation

Reuse existing Player↔NPC relation plus settlement-scoped reputation/renown. Do not merge those separate concepts into a new companion affinity number.

## Implementation order

1. Verify the final `npc-029` accompany commitment API and lifecycle.
2. Verify whether `npc-030` already provides a neutral expedition context; extract a minimal shared type only if needed.
3. Implement the pure voluntary willingness/eligibility evaluator.
4. Add deterministic unit tests for the evaluator before connecting presentation.
5. Expose evaluation diagnostics through the existing NPC inspection path.
6. Add player invitation through existing contextual dialogue/interaction.
7. Add NPC initiative through the existing low-priority social/idle decision path.
8. Narrowly generalize `approachPlayer` intent if the proposal path requires it.
9. On acceptance, create only the shared `npc-029` accompany commitment.
10. Add regression tests proving no Work Contract/payment path is involved and higher-priority needs still dominate.

## Verification

### Automated

Cover at least:

- dead/child/hard-committed NPC is ineligible,
- critical need or active danger prevents discretionary joining,
- strong relationship improves willingness,
- high trust/competence can improve willingness without guaranteeing it,
- high renown alone does not guarantee willingness,
- high renown can improve initiative/awareness plausibility where appropriate,
- openness/curious increase exploration interest without binary archetype behavior,
- conscientiousness increases the cost of abandoning real duties,
- neuroticism increases danger sensitivity,
- household/schedule obligations can outweigh curiosity,
- unknown danger remains bounded/deterministic,
- identical inputs produce identical evaluation,
- invitation and initiative share the same willingness calculation,
- initiative uses a stronger/contextual gate rather than separate scoring,
- accepting creates the `npc-029` commitment,
- no Work Contract/payment state is created,
- urgent NPC decisions continue to preempt voluntary joining.

### Manual browser verification — User

The User should verify scenarios such as:

- a curious/open NPC with few obligations plausibly accepts an expedition,
- an equally curious NPC with substantial household/work obligations may refuse,
- a personally trusted player can receive acceptance despite low renown,
- a famous but distrusted player is not automatically accepted,
- dangerous expedition context makes joining harder,
- an NPC can independently approach and propose joining when context strongly supports it,
- NPCs do not repeatedly spam proposals,
- declining a proposal leaves the NPC in ordinary life without a hidden companion state,
- voluntary acceptance produces the same accompany/follow behavior as the paid escort path,
- no payment or Work Contract UI appears for voluntary joining,
- ending the `npc-029` commitment returns the NPC to normal decision/schedule behavior.

Browser verification is performed by the User, not the AI implementation agent.

> **Zrób git commit i push do main, rebase jeżeli trzeba**