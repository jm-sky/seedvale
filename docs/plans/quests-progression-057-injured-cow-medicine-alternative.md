# Plan: Injured cow Medicine alternative

**Created:** 2026-09-17
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~quests-progression-016~~, ~~items-player-046~~, ~~npc-025~~
**Domain:** `quests-progression`
**Subdomains:** `quests` `relationships`
**Tags:** `medicine` `livestock` `world-driven` `alternative-resolution`
**Roadmap:** -
**Model:** Sonnet, Composer

## Goal

Add a small settlement quest built around a real injured household-owned cow.

The giver proposes the practical solution available to the household: the cow is badly injured and no longer useful, so the Player should kill it and bring back meat. The Player may instead notice that the cow is treatable, use the existing Medicine targeted action, and resolve the same problem by restoring the animal.

The quest must demonstrate a Seedvale rule:

```text
NPC proposes one solution
→ Player acts through ordinary world systems
→ quest observes the real outcome
→ world and social consequences follow that outcome
```

The healing path must not be a quest-only button or scripted fake heal.

## Player-facing flow

### Offer

A suitable livestock-owning NPC exposes an ordinary `?` quest offer when the bound household cow is alive and carries a meaningful physical injury.

The NPC explains that the cow is badly injured and asks the Player to slaughter it and bring meat back.

The dialogue should reflect the NPC's limited practical conclusion, not explicitly advertise Medicine as an alternative objective.

### Resolution A — slaughter

The Player kills the exact bound cow through ordinary combat / animal damage mechanics and obtains its normal meat through the existing carcass harvesting pipeline.

The quest then requires the expected meat delivery to the giver and resolves through the normal reward/consequence path.

Do not grant synthetic quest meat and do not special-case carcass drops.

### Resolution B — treatment

The Player selects Medicine and successfully treats the exact bound cow through the existing targeted Medicine action.

The quest observes the successful real treatment and transitions to the humane outcome. It must not call healing code itself.

The giver reacts positively because the household keeps the living cow. This outcome should produce stronger positive social consequences than the slaughter solution, while staying within existing relation/reputation mechanisms.

The cow remains an ordinary household-owned `AnimalAgent` and continues normal simulation after treatment.

### Invalid / race cases

- If the cow dies before the Player accepts, the offer disappears or is not materialized.
- If the cow dies after acceptance before either valid outcome is completed, the quest follows explicit failed/external-resolution semantics; do not silently respawn it.
- If simulation or another actor heals the cow before acceptance, the problem no longer exists and the offer disappears.
- If the cow is healed after acceptance by a source other than the Player's Medicine action, do not falsely award the authored Medicine outcome unless the implementation can prove the Player performed the treatment.
- Killing the cow after completing the healing outcome must not retroactively rewrite the completed quest.

## Recon / mechanisms to reuse

### Real household livestock identity

`src/settlement/livestock.ts` gives domestic animals deterministic, reload-safe `animalId`s and persists `AnimalSaveState` in `LivestockSaveRecord`. `cow` is an ordinary `LivestockKind`.

Bind the quest to one real cow by stable `animalId`. Do not introduce `QuestCow`, a duplicate health record, or a quest-owned animal object.

### Existing world-driven quest opportunity layer

`quests-progression-016` already establishes the rule that quests observe authoritative world state and supports stable source refs such as `animal:<animalId>:...`.

Prefer extending/reusing that opportunity/materialization mechanism for selecting a suitable injured household cow and giver rather than building a parallel authored spawn system.

The opportunity source is the cow's real state:

- alive;
- household-owned;
- kind `cow`;
- sufficiently injured to justify the premise;
- owner household and giver resolvable.

The exact severity threshold should use the existing derived injury severity contract, not raw magic HP values duplicated in quest code.

### Medicine is already an ordinary targeted action

`src/player/medicalTreatment.ts` adapts owned livestock to `TreatableTarget`; `src/interaction/targetedSkillAction.ts` exposes `provide-medical-treatment`; treatment mutation occurs through the existing Busy Action path.

Do not add a second heal implementation to QuestManager.

### Shared physical injury state

`physicalInjury` is the authoritative wound amount and severity is derived. Reuse the existing injury/treatment resolver and target-owned apply methods.

### Social consequences already exist

Use existing quest outcomes, relation and settlement reputation consequences. Do not create a morality meter for this quest.

## Shared quest hook: successful treatment of a specific animal

Current quest objectives do not have a Medicine-treatment objective/event.

Add the smallest reusable seam needed for this quest and future world-action quests:

```text
successful completed Medicine treatment
→ report a narrow immutable treatment event to QuestManager
→ QuestManager matches stable animalId / target kind
→ matching objective progresses
```

Preferred contract direction:

```ts
type AnimalTreatmentQuestContext = {
  animalId: string
  animalKind: AnimalKind
  treatmentMode: 'material' | 'stabilize'
  actualHpRestored: number
  severityBefore: InjurySeverity
}
```

Exact naming/shape must follow current code during implementation, but preserve these rules:

- emit only after a completed treatment with real positive effect;
- emit from the existing medical-treatment completion path after revalidation;
- never emit on query, Busy Action start, cancellation, failed material check or zero restore;
- QuestManager only observes the event; it never owns or mutates animal injury;
- bind progress by stable `animalId`, not species/name/proximity;
- keep the event useful for plan 058 and later treatment-driven quests without turning it into a generic event bus.

A narrow quest objective such as `treat_animal` is acceptable if it fits the existing `QuestObjective` dispatch better than a separate outcome hook.

Add JSDoc with `@domain quests-progression` to any new public quest-facing treatment context/helper.

## Quest binding

The materialized quest needs stable refs for at least:

- settlement id;
- giver NPC id;
- household id;
- cow `animalId`.

Do not persist runtime `NpcAgent` / `AnimalAgent` references.

If `quests-progression-016` already provides a suitable source-ref/binding shape, extend it minimally rather than introducing a second generated-quest binding registry.

## Rewards / consequences

Keep rewards deliberately small; the interesting reward is world continuity.

Suggested relative semantics:

- slaughter + meat delivery: ordinary payment and small/no social gain;
- successful treatment: no requirement to manufacture a larger coin payout; give a clearly stronger relation/benevolence/trust response because the household retains the cow.

Exact values should follow current quest consequence ranges found during implementation recon.

Do not label one outcome as the mechanically "correct" choice in UI.

## Persistence and continuity

The bound cow is normal persisted livestock. Quest state remains owned by `QuestManager`.

On save/load and in-session world rebuild:

- the same stable cow must remain the target;
- completed treatment progress must not fire twice;
- a completed quest must not reopen because the cow later becomes injured again;
- a dead/tombstoned cow must not be recreated by quest code;
- generated opportunity reconstruction must not create duplicate copies of the quest.

## Tests

Add focused coverage for:

1. suitable injured household cow creates/materializes one opportunity/quest;
2. healthy cow creates no offer;
3. wild cow/non-owned animal is not selected;
4. dead cow creates no offer;
5. accepted quest binds exact `animalId`;
6. treating another cow does not progress it;
7. cancelled/zero-effect Medicine treatment does not progress it;
8. successful positive-effect treatment of the bound cow selects the healing outcome exactly once;
9. ordinary slaughter + real meat delivery resolves the slaughter path;
10. cow death without satisfying the authored path has explicit deterministic handling;
11. save/load preserves binding and outcome without duplicate progress;
12. world rebuild does not duplicate the generated opportunity/quest;
13. healing outcome leaves the same cow alive and household-owned.

## Non-goals

- No generic morality/alignment system.
- No quest-specific cow class or health state.
- No scripted healing animation requirement beyond existing Medicine action presentation.
- No special meat item or special carcass implementation.
- No global rewrite of animal injury/recovery.
- No broad quest event bus.
- No requirement to support wild-animal Medicine in this plan.
- No browser verification by AI.

## Relevant files

- `src/quests/quests.ts`
- `src/quests/QuestManager.ts`
- world-driven quest opportunity/materialization files introduced by `quests-progression-016`
- `src/player/medicalTreatment.ts`
- `src/app/actions/medicalTreatmentActions.ts`
- `src/interaction/targetedSkillAction.ts`
- `src/settlement/livestock.ts`
- `src/fauna/AnimalAgent.ts`
- quest composition in `src/app/createApp.ts`
- nearest existing generated settlement-quest tests

## Verification

Automated:

- targeted QuestManager treatment-event/objective tests;
- generated opportunity/materialization tests;
- Medicine completion integration test;
- quest outcome tests;
- typecheck / normal repository test gate.

Manual browser verification by User:

1. Find the giver with `?`; confirm the bound cow is visibly/in inspection terms actually injured.
2. Accept and kill/harvest the cow; deliver normal meat and confirm the slaughter resolution.
3. In a fresh run/save, accept and instead use Medicine on that exact cow.
4. Confirm the treatment uses normal material/stabilization rules and Busy Action.
5. Confirm the quest resolves through the healing path and the cow remains alive in the household.
6. Save/load after each outcome; confirm no duplicated offer, cow or reward.

> **Zrób git commit i push do main, rebase jeżeli trzeba**