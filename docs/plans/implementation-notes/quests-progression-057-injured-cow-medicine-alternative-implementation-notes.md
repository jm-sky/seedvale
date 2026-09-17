# Implementation Notes: quests-progression-057 — Injured cow Medicine alternative

**Prepared:** 2026-09-17  
**Plan:** `quests-progression-057-injured-cow-medicine-alternative.md`

## 1. Reuse the existing world-driven quest architecture

`quests-progression-016` already established the required ownership rule:

```text
world state owns the problem
→ opportunity layer observes it
→ materializer builds an ordinary QuestDef
→ QuestManager owns only quest lifecycle/progress
```

Do not add a cow-specific manager or runtime quest registration path.

Generated definitions must still exist before `new QuestManager(...)` is constructed. Reuse the current opportunity collection/materialization seam from `src/quests/worldQuestOpportunities.ts` / related 016 implementation files and composition in `src/app/createApp.ts`.

The generated quest id must be deterministic and include the stable source identity, following the existing `world:<scenario>:<settlementId>:<sourceId>` convention. Bind the exact livestock `animalId`; never reselect "some injured cow" after acceptance.

## 2. Livestock identity and state are already sufficient

`src/settlement/livestock.ts` is authoritative for domestic-animal continuity:

- `cow` is a normal `LivestockKind`;
- each household slot has deterministic `animalId`;
- `LivestockSaveRecord` contains `AnimalSaveState` plus settlement/owner identity;
- removed animals are tombstoned and must never be recreated by quest code.

Selection should inspect existing real household livestock and require:

- `kind === 'cow'`;
- household ownership;
- alive;
- meaningful derived injury severity;
- a resolvable owning household and appropriate adult giver.

Use `resolveInjurySeverity(...)` (or the nearest existing public read seam) instead of raw HP thresholds duplicated in quest code.

Do not write a parallel `injuredCow` flag. `physicalInjury` remains the source of truth.

## 3. Medicine completion hook belongs in `medicalTreatmentActions.ts`

The correct emission point is `completeMedicalTreatment()` in:

`src/app/actions/medicalTreatmentActions.ts`.

Today that function already performs the full committed transaction:

```text
revalidate alive
→ resolve lazy recovery
→ resolve current treatment plan
→ applyTreatment(...)
→ verify actualRestored > 0
→ consume material if applicable
→ award Medicine XP
```

A quest-facing treatment report must happen only after `actualRestored > 0`. Do not emit from:

- `medicalTreatment.ts` query helpers;
- `targetedSkillAction.ts` query/execute dispatch;
- Busy Action start;
- cancelled action;
- failed revalidation;
- zero-effect apply.

Add a narrow optional callback to the existing action context/composition seam rather than importing `QuestManager` into `medicalTreatmentActions.ts`.

Preferred contract is structurally equivalent to:

```ts
type AnimalTreatmentQuestContext = {
  animalId: string
  animalKind: AnimalKind
  treatmentMode: 'material' | 'stabilize'
  actualHpRestored: number
  severityBefore: InjurySeverity
}
```

Only emit for `TreatableTarget.kind === 'livestock'`. Self/NPC treatment must remain unaffected.

Important current limitation: `TreatableTarget` currently exposes generic id/kind/label and treatment methods, but not `AnimalKind`. The cleanest implementation is to extend the livestock adapter in `src/player/medicalTreatment.ts` with narrow quest/report metadata, rather than resolving the `AnimalAgent` again from global state after completion.

Do not turn this into a generic event bus.

## 4. Add one reusable quest objective/event path

`QuestManager` already receives narrow world/player interaction reports and matches them against active objectives. Extend that existing pattern with a treatment report.

Prefer one new objective variant in `src/quests/quests.ts`, e.g. conceptually:

```ts
{ type: 'treat_animal', animalId: string }
```

The objective should match the exact stable `animalId`. Species can remain diagnostic/validation context, not the identity key.

Add a focused `QuestManager.onAnimalTreatment(...)` (name can follow local conventions) that:

- considers active objective slots only;
- ignores unrelated animal ids;
- progresses only on positive-effect committed reports;
- is idempotent once the relevant stage/outcome is resolved;
- does not mutate animal health or ownership.

If current multi-objective/result routing needs a result id to branch directly to the humane outcome, reuse that machinery rather than adding a second branching system.

## 5. Slaughter path should reuse normal animal death + item delivery

Do not invent a special slaughter action or quest meat.

The cow must die through existing fauna damage/combat and produce/retain an ordinary carcass. Meat must come through the current carcass harvesting flow.

For quest progression, reuse existing objective types wherever possible:

- exact-animal death/kill reporting if already available for bound animals;
- ordinary item possession/delivery mechanics for `raw_meat`;
- normal NPC report/dialogue completion.

The quest needs the exact cow death to distinguish intentional quest resolution from killing another cow. Do not use only `raw_meat >= N` as proof the requested animal was slaughtered.

A practical stage structure is:

```text
accepted
→ branch condition:
   A) exact bound cow treated successfully
   B) exact bound cow dies through the authored slaughter path
→ A: humane outcome/report
→ B: require ordinary raw_meat delivery/report
```

Use the existing nonlinear stage/result machinery if it can encode this cleanly.

## 6. Outcome/race semantics

Handle these explicitly in the quest builder/materializer:

- cow healthy before offer → no opportunity;
- cow dead before offer → no opportunity;
- cow naturally/externally healed before offer → no opportunity;
- accepted + Player Medicine report → humane outcome;
- accepted + cow dies before treatment → treatment route is no longer possible;
- accepted + cow dies for unrelated reasons: do not claim the Player healed it; whether slaughter branch remains valid must depend on existing exact-animal kill/death attribution available in current code;
- completed humane outcome is final even if the cow later dies.

Do not introduce a new global quest terminal state unless existing `failed` / authored outcome semantics truly cannot represent the case.

## 7. Social consequences

Use existing `QuestConsequences` only. The humane path can carry stronger relation / settlement benevolence or trust changes than the slaughter path, but keep values within ranges already used by nearby authored quests.

Do not add morality/alignment state.

The reward distinction should primarily be:

```text
slaughter → payment for requested work
heal → household retains a living productive animal + stronger social response
```

No synthetic large coin bonus is required.

## 8. Persistence and rebuild

No new cow persistence is needed.

The quest definition must reconstruct with the same:

- quest id;
- settlement id;
- giver NPC id;
- household id;
- cow `animalId`.

The livestock registry already persists the cow's injury/death/ownership state. Quest progress remains in `QuestManager` save state.

On restore/rebuild, do not re-run the treatment event from current health. The treatment objective should be persisted as normal quest progress/outcome, not inferred repeatedly from `physicalInjury === 0`.

This distinction is important because natural/external healing must not impersonate Player Medicine.

## 9. Suggested implementation order

1. Add treatment report metadata to the livestock `TreatableTarget` adapter.
2. Add optional completion callback from `medicalTreatmentActions.ts` through the existing action/composition context.
3. Add the `QuestObjective` treatment variant + `QuestManager` report handler/tests.
4. Add injured-cow opportunity detection/materialization using exact livestock identity.
5. Author the two resolution branches and social consequences.
6. Add save/rebuild coverage.

## 10. Focused tests

Prefer small tests around existing owners instead of one giant integration suite.

### Medicine action tests

Verify:

- positive livestock treatment emits exactly one report after apply;
- cancellation / zero restore / dead target emits none;
- report contains exact `animalId`, treatment mode and pre-treatment severity;
- self/NPC treatment does not emit an animal-treatment report.

### QuestManager tests

Verify:

- bound `treat_animal` progresses only for exact id;
- another cow does nothing;
- duplicate report after completion does nothing;
- restore preserves progressed/resolved state.

### Opportunity/materialization tests

Verify:

- only injured alive household cow is eligible;
- healthy/dead/non-household candidates are excluded;
- deterministic binding gives same quest id/source refs;
- already accepted/completed source is not duplicated after rebuild.

### Quest flow tests

Verify both authored branches and the race cases from the plan.

## 11. Files to inspect/change first

- `src/app/actions/medicalTreatmentActions.ts`
- `src/app/actions/actionContext.ts`
- `src/player/medicalTreatment.ts`
- `src/quests/quests.ts`
- `src/quests/QuestManager.ts`
- current 016 opportunity/materialization implementation files under `src/quests/`
- `src/app/createApp.ts`
- `src/settlement/livestock.ts`
- `src/fauna/AnimalAgent.ts`
- nearest current generated-quest and QuestManager tests

Add JSDoc with `@domain quests-progression` for the new treatment report/objective seam if it is exported outside its local module.

> **Zrób git commit i push do main, rebase jeżeli trzeba**