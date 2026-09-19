# Implementation Notes: quests-progression-071 — Generated opportunity retention semantics

Recon baseline: current `main` on 2026-09-19. These notes cover only generated-opportunity retention. Do not expand into `quests-progression-069` or redesign quest persistence.

## Current implementation

Generated settlement opportunities are rebuilt only during `createApp()` composition, before `QuestManager` is constructed:

```text
initialSave.quests.progress
→ createApp.ts persistedQuestIds
→ buildWorldDrivenSettlementQuests()
   → collectSettlementQuestOpportunities()
   → collectRpgQuestOpportunities()
   → selectSettlementQuestOpportunities()
   → materialize...()
→ final QuestDef[]
→ new QuestManager(...)
```

`QuestManager.exportProgress()` persists one `QuestProgressEntry` for every materialized `QuestDef`, including untouched `{ state: 'not_offered', stageIndex: 0 }` entries. `src/app/saveState.ts::buildSaveData()` writes that array directly.

On the next boot, `src/app/createApp.ts` currently derives:

```ts
const persistedQuestIds = initialSave?.quests.progress.map((entry) => entry.id)
```

That makes materialization history indistinguishable from meaningful quest continuity.

This defect is limited to generated-definition reconstruction. Authored definitions are materialized independently and do not rely on `persistedQuestIds` to exist.

## Exact files and symbols

### Composition / retention boundary

- `src/app/createApp.ts`
  - generated opportunity assembly around `persistedQuestIds`
  - `buildWorldDrivenSettlementQuests(...)`
  - `buildHunterProfessionQuests(...)`
  - `buildGuardEveningDutyQuest(...)`
- `src/app/saveState.ts::buildSaveData()`
  - persists `questManager.exportProgress()`; do not change this for this plan.

### Persisted quest progress owner

- `src/quests/quests.ts::QuestProgressEntry`
- `src/quests/QuestManager.ts`
  - `states: Map<string, QuestRuntimeProgress>`
  - `exportProgress()`
  - constructor restore via `normalizeRestoredProgress()` / `runtimeProgress()`

Relevant persisted progress fields currently include:
- `state`
- `stageIndex`
- `resolvedOutcomeId?`
- `stageCount?`
- `stageSlotProgress?`
- `offerSuppressedUntilDay?`
- `journal?`
- `worldKnowledge?`
- `dialogueCooldowns?`
- `observation?`

### Generated-opportunity reconstruction

- `src/quests/opportunities/worldQuestMaterialization.ts::buildWorldDrivenSettlementQuests()`
- `src/quests/opportunities/settlementQuestOpportunities.ts::collectSettlementQuestOpportunities()`
  - live wolf-den / lost-livestock / injured-cow candidates are merged with parseable persisted IDs.
- `src/quests/opportunities/rpgQuestMatrices.ts::collectRpgQuestOpportunities()`
  - persisted RPG IDs are parsed and reconstructed even when the previous source is no longer the current live candidate.
- `src/quests/opportunities/settlementQuestSelection.ts::selectSettlementQuestOpportunities()`
  - persisted IDs are selected first with `ignoreLimit = true`;
  - RPG matrix identity is reserved by the first selected candidate, so a stale pristine candidate can block a fresh candidate of the same matrix.

Profession/guard generated definitions also accept `persistedQuestIds`; keep using the same filtered retention set rather than inventing per-builder rules.

## State ownership

- `QuestManager` owns quest progress and exports the authoritative `QuestProgressEntry[]`.
- Opportunity collectors own only candidate discovery/reconstruction from deterministic IDs; they do not own quest lifecycle.
- `createApp.ts` owns the composition decision about which saved generated IDs need definition continuity.
- World sources (wolf den, livestock, landmarks, settlement/NPC definitions) remain authoritative for live source state.
- Do not add a generated-opportunity persistence registry, retention cache, queue or second quest state.

## Lifecycle / call-sites

### Creation and selection

1. `createApp()` builds settlement/NPC/world context.
2. Collectors create deterministic lightweight opportunity records.
3. Persisted generated IDs are merged into those candidates so accepted/history-bearing quests can be rematerialized even if the live source changed.
4. `selectSettlementQuestOpportunities()` keeps persisted candidates before fresh ones and enforces RPG matrix uniqueness.
5. Materializers turn selected opportunities into normal `QuestDef` objects.
6. `QuestManager` owns offer admission, suppression, acceptance, progress, external resolution and terminal history.

### Offer / suppression / acceptance interaction

- `not_offered` alone is not evidence that a generated definition needs retention.
- Decline returns a quest to `not_offered` but writes `offerSuppressedUntilDay`; that entry **must** retain the same generated definition until the saved suppression is no longer relevant. Filtering only by `state !== 'not_offered'` would therefore be wrong.
- `offered`, `active`, `ready_to_report` must retain identity.
- Terminal/history states must continue to retain identity because current quest log/history and downstream consumers depend on the same definition.
- `abandoned` and `invalidated` are terminal lifecycle states and therefore retention-worthy.
- External resolution may produce terminal progress without player acceptance; terminal progress still needs the same definition for history/result interpretation.

### Save/load

- Save continues to export full quest progress for every materialized definition.
- Load derives a narrower **generated-definition retention ID set** from saved `QuestProgressEntry` values.
- Pass only that filtered ID set to generated opportunity collectors/builders.
- `QuestManager` restore remains unchanged by this plan.

### In-session WorldBundle rebuild

`QuestManager` is app-level and survives ordinary `WorldBundle` rebuilds. The generated `QuestDef[]` is not reselected during those rebuilds. Therefore this plan should not add rebuild hooks or re-run opportunity selection mid-session.

New Game uses the existing `QuestManager.reset()` path and is outside this retention derivation.

## Implementation decision

Add one pure composition-level predicate/helper for saved generated progress, e.g. semantically:

`requiresGeneratedOpportunityRetention(entry: QuestProgressEntry): boolean`

The helper must answer whether **discarding the generated definition would lose meaningful persisted continuity**.

A pristine entry is exactly non-retaining when all of the following are true:

- `state === 'not_offered'`
- `stageIndex === 0`
- `resolvedOutcomeId === undefined`
- `stageCount === undefined`
- `stageSlotProgress === undefined` or contains no meaningful progress
- `offerSuppressedUntilDay === undefined`
- `journal` absent/empty
- `worldKnowledge` absent/empty
- `dialogueCooldowns` absent/empty
- `observation === undefined`

Prefer the conservative rule: any non-default persisted field makes the generated entry retention-worthy. Do not special-case individual generated quest families.

Use the predicate in `createApp.ts` to derive the ID array once, then reuse that same filtered array for:
- `buildWorldDrivenSettlementQuests()`,
- its RPG sub-input,
- `buildHunterProfessionQuests()`,
- `buildGuardEveningDutyQuest()`,
- any other existing generated builder currently fed by the same `persistedQuestIds` seam.

Keep the downstream `persistedQuestIds` API unchanged unless a trivial rename materially improves clarity. The bug is the upstream membership, not selection/materialization semantics.

Do **not** change `QuestManager.exportProgress()`: full progress export is useful and changing it would conflate save serialization with generated-definition reconstruction.

## Why this fixes both loss and staleness

Current over-retention:
- untouched generated RPG candidate is exported;
- reload treats its ID as persisted;
- selector takes it before fresh candidates;
- its matrix is reserved indefinitely.

After filtering:
- untouched default entry contributes no retention claim;
- live collection may choose the current fresh candidate;
- meaningful progress still reconstructs by deterministic ID even if no longer live.

Under-retention guard:
- declined `not_offered` with suppression remains retained;
- any metadata-bearing `not_offered` entry remains retained;
- terminal/history-bearing entries remain retained;
- world-driven per-source IDs still reconstruct when their live source has changed/disappeared.

## Change order

1. Add the pure retention predicate next to the composition boundary or in the smallest quest/opportunity module that can be imported by `createApp.ts` without creating a new lifecycle owner.
2. Add focused unit tests for the predicate if exported; otherwise cover the behavior at the nearest existing opportunity-selection test seam.
3. Replace the unconditional `.map(entry => entry.id)` in `createApp.ts` with filtered retention IDs.
4. Reuse that one filtered array at every existing generated builder call-site.
5. Do not change collector/materializer selection algorithms unless tests reveal a separate bug.

## Regression tests

Minimum coverage:

1. pristine `not_offered` + stage 0 + no optional metadata → no retention claim;
2. `offered`, `active`, `ready_to_report` → retained;
3. terminal states currently supported by `QuestState` (`complete`, `failed`, `abandoned`, `invalidated`) → retained;
4. `not_offered` + `offerSuppressedUntilDay` → retained;
5. `not_offered` + each durable metadata family (`journal`, `worldKnowledge`, `dialogueCooldowns`, `observation`) → retained;
6. defensive coverage for non-default stage/outcome progress (`stageIndex`, `resolvedOutcomeId`, `stageCount`, `stageSlotProgress`) → retained;
7. RPG regression: a pristine previously selected candidate does not reserve the matrix after reload; the current live candidate may be selected;
8. persisted meaningful RPG candidate still reconstructs with the same ID and reserves its matrix;
9. declined generated offer keeps its same ID/suppression instead of rotating to another same-matrix source;
10. world-driven persisted ID still reconstructs when its live source is no longer collected.

Use existing tests in:
- `src/quests/opportunities/rpgQuestMatrices.test.ts`
- `src/quests/opportunities/settlementQuestOpportunities.test.ts`
- existing tests around `selectSettlementQuestOpportunities()`

Add a small dedicated test only if that is cleaner than inflating unrelated fixtures.

## Persistence / save compatibility

No persisted shape changes.

- No `CURRENT_SAVE_VERSION` bump.
- No migration.
- Older saves remain valid.
- Existing pristine generated entries remain in old save files but stop acting as retention claims after this change.
- Existing meaningful generated entries continue to reconstruct through the same deterministic IDs.
- Do not delete old progress entries from the save as part of this plan; this plan changes interpretation at composition only.

## Guardrails

- Do not touch `quests-progression-069` pacing/cooldown scope.
- Do not change authored quest materialization/persistence semantics.
- Do not filter `QuestManager.exportProgress()`.
- Do not create a generated-opportunity save table/registry.
- Do not move lifecycle knowledge into every collector.
- Do not make live source availability overwrite meaningful persisted history.
- Do not alter opportunity priority/cap/matrix ordering except through the corrected retained-ID input.
- Keep deterministic generated IDs unchanged.

## Manual verification

User-owned browser verification only:

1. Start a world where an RPG generated candidate exists but do not talk to its giver.
2. Save and reload.
3. Confirm that the previous untouched candidate is not artificially pinned when a different current candidate of the same matrix should be eligible.
4. Decline a generated offer, save/reload during suppression, and confirm the same opportunity remains suppressed rather than rotating.
5. Accept/start a generated world-driven quest, save/reload after its source changes, and confirm the same quest/history returns.

Do not run browser verification as the implementation agent.

## Out of scope

- `quests-progression-069` offer pacing/gating.
- changing opportunity caps or ranking.
- redesigning `QuestManager.exportProgress()`.
- pruning save-file quest history.
- new generated quest types.
- new persistence registries.
- quest UI changes.
- broad quest-system audit.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
