# Implementation Notes: Household help and age-based work participation

Plan: `settlements-npcs-022-household-help-and-age-based-work-participation.md`

## Current architecture that matters

- `FamilyMember.age` in `src/settlement/families.ts` remains the generated demographic source. Do not add persisted `isChild` / `isElder` / `workCapacity` state.
- `createSettlement.ts` already computes one `PhysicalProfile` per member from `member.age` and passes it into `NpcAgent`; `NpcAgent` stores that profile. Use `physicalProfile.age` inside the agent instead of threading another copy of age through construction.
- Do **not** reuse `PhysicalProfile.lifeStage` as the work-policy enum. `npcPhysicalProfile.ts::LifeStage` is a 9-stage physiological/calibration concept (`infant` … `veryElderly`). Work participation is different semantics. A small pure work classification derived from age is appropriate; keep it unpersisted.
- A good first boundary set is aligned with existing demographic/physical boundaries: `0..12` young child, `13..17` older child, `18..64` adult, `65+` elder. Keep the thresholds in one pure module and test boundaries.
- The plan's description of profession work living in `NpcAgent.begin*Work()` is stale. The current owner is `src/ai/npcProfessionWork.ts`: `NpcWorkContext` + `planProfessionWork(ctx)`. `NpcAgent` is now the coordinator that builds a fresh profession context and starts the returned `NpcPlannedAction`.
- `src/ai/schedule.ts` is still the sole role schedule owner. Keep `SCHEDULE_TEMPLATES` and `effectiveScheduleFor()` unchanged; apply age eligibility at work/opportunity selection, not by creating child/elder schedules.

## Recommended implementation shape

Add a small pure AI policy module, e.g. `src/ai/npcWorkParticipation.ts`, owning only derived age/work eligibility. It should answer questions such as:

- whether normal profession work is available at all,
- whether household help is available,
- whether a concrete work opportunity is too heavy/dangerous for the age group,
- elder preference/penalty for heavy work.

Avoid putting age policy into `families.ts` or `npcPhysicalProfile.ts`; those modules own generation/physical calibration, not behaviour policy.

Pass the minimum derived input into work planning. Prefer adding `age` (or a derived participation stage) to `NpcWorkContext` over making `npcProfessionWork.ts` import/know `PhysicalProfile`.

## Existing heavy-work semantics are not sufficient by themselves

`src/ai/npcVigor.ts::isHeavyWorkKind()` currently treats `chop`, `mine` and **every** generic `work` action as heavy. That is valid for current vigor drain, but too coarse for age policy: `work` is also used for non-equivalent profession actions such as trading, guard activity, crafting/maintenance and work-contract bouts.

Do not make elder eligibility simply `!isHeavyWorkKind(action.kind)`, because it would classify too much as heavy and can shut down whole professions.

Keep vigor semantics unchanged unless there is a separate reason to correct them. For this plan, add the smallest work-participation classification needed at the planner/opportunity boundary. Prefer semantic knowledge already available there (role + selected planner/action) over another global action-kind catalog.

For elders use a **soft reduction** for heavy opportunities, not a blanket role ban. `mine` / tree-felling-style work can be deprioritized or cadence-limited while light work remains available. Adult behaviour must be the exact existing path when no household-help opportunity is selected.

## Important bypasses to close

Do not gate only `planProfessionWork()`. There are other paths capable of producing work-like activity:

- role-specific need/strategy paths in `NpcAgent` (notably hunting and household-resource acquisition),
- Work Contracts (`tryPursueWorkContract` / `tryAcceptWorkContractOpportunity`),
- generic scheduled work fallback / workplace activity.

A child with `Role = hunter` must not reach hunting just because hunger selected a role-specific food strategy; similarly a child must not accept a construction/work contract after normal profession dispatch was blocked. Apply the age policy at the relevant **opportunity/strategy availability** seams, before side effects or contract acceptance.

Threat/combat response is different: age restrictions must not prevent flee/emergency handling. Do not apply the work gate to threat response itself.

## Farmer household-help vertical slice

Use **crop harvest** as the first helper action. It is the cleanest existing safe/light Farmer slice:

`npcProfessionWork.ts::planFarmWork()` already:

1. resolves the cultivation anchor,
2. queries `foodSources.queryHarvestableCrop(...)`,
3. returns a normal `NpcPlannedAction` with `kind: 'harvest'`,
4. revalidates through `foodSources.harvest(target)` on completion,
5. deposits the real result through `Household.depositFood(...)` / existing economy overflow.

Do not copy this mutation path into child/spouse code. Extract the harvest branch into a narrow reusable planner/helper (for example `planFarmHarvest(ctx)`), let normal `planFarmWork()` call it first, and let household-help planning call the same helper. Keep planting Farmer-only in this plan.

Household help should have its own small planner/opportunity resolver (e.g. `npcHouseholdHelp.ts`) rather than pretending the helper has `role: 'farmer'`. It may reuse the farm-harvest planner but must pass the helper's real identity/household and never alter `Role`, workplace, schedule or equipment.

## Detecting a Farmer household without scans

`Household` currently owns resources and history but does not own its members/roles. `NpcAgent.familyMembers` is explicitly dialogue-facing and currently contains only `name`, `lastName`, `relation`; do not overload that type with behavioural state just to discover a farmer.

`createSettlement.ts` already iterates each `FamilyDef` while building `flatMembers`, so derive the bounded family work context there once (for example `householdHasFarmer` / a tiny immutable household-work descriptor) and pass it with NPC creation data. This avoids settlement-wide scans and keeps `Household` free of scheduling/task ownership.

The descriptor is runtime-derived from `family.members[].character.role`; it does not need persistence.

## Occasional participation

Do not use per-tick randomness. Prefer one agent-local deterministic cadence timestamp, analogous to existing throttled opportunity fields such as social-attempt cooldowns, or a deterministic score/cooldown derived from the agent's simulation clock.

Only evaluate household help when the existing decision flow has reached an idle/work opportunity. Do not add it as a permanent pressure producer.

For the first slice it is enough that:

- older children can consider harvest help during eligible idle/work opportunities,
- adults may consider it only when it does not replace a stronger normal profession opportunity,
- young children never consider it,
- elder eligibility follows the same light-work rule.

## Interruption and action lifecycle

Return ordinary `NpcPlannedAction`s and start them through the existing `NpcAgent.startAction()` path. This automatically keeps movement/action lifecycle, critical-need interruption, threat interruption and stale-target `onComplete` revalidation aligned with normal NPC work.

Do not add helper-specific completion state. Crop output must be minted only by the existing `foodSources.harvest(target)` success result; if another actor harvests first or the action is cancelled, no duplicate food is produced.

## Tests worth adding

Focus tests around pure seams rather than constructing a full `NpcAgent` where avoidable:

- work-stage boundaries: 12/13, 17/18, 64/65;
- young/older child normal profession eligibility = false; adult = unchanged;
- elder heavy opportunity receives the chosen reduction but light work remains eligible;
- household-help eligibility only for the intended stages/context;
- shared farm-harvest planner produces the same authoritative harvest/deposit effect for Farmer and helper callers;
- helper planning never requires/mutates `Role = farmer`;
- age gate covers Work Contract acceptance and role-specific dangerous work opportunities, not only `planProfessionWork()`;
- cancellation/stale crop target produces no duplicate output.

Extend `npcProfessionWork.test.ts` for the extracted harvest planner and add a focused pure test file for work-participation policy. Add integration-level tests only for the few coordinator gates that cannot be proven from pure tests.

## Main pitfalls

- Reusing `PhysicalProfile.lifeStage` as work policy couples two unrelated semantics and makes future physical calibration change NPC labour rules.
- Using `isHeavyWorkKind()` as the full elder rule incorrectly makes every generic `work` action heavy.
- Gating only scheduled profession dispatch leaves hunting/resource strategies and Work Contracts as child-work bypasses.
- Detecting Farmer households by scanning all settlement NPCs/households every decision is unnecessary; derive family context in `createSettlement.ts` while the family is already in hand.
- Copying the Farmer harvest `onComplete` logic into a helper path risks double accounting and drift. Share the planner/mutation path.
- Extending `FamilyMemberRef` for behavioural logic would violate its current dialogue-only contract; pass a dedicated tiny runtime context instead.
