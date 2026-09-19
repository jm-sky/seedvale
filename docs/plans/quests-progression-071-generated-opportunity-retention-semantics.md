# Plan: Generated opportunity retention semantics

**Created:** 2026-09-19
**Status:** `planned` 📋
**Type:** fix
**Priority:** medium · **Effort:** S
**Depends on:** ~~quests-progression-031~~
**Domain:** `quests-progression`
**Subdomains:** `quests` `progression`
**Tags:** `opportunities` `persistence` `lifecycle`
**Roadmap:** -
**Model:** Composer, Sonnet

## Goal

Prevent pristine generated quest definitions from becoming permanently retained opportunities merely because the game was saved once.

Preserve generated definitions across load only when persisted quest state actually requires continuity.

## Current defect

Current composition derives:

```ts
const persistedQuestIds = initialSave?.quests.progress.map((entry) => entry.id)
```

But `QuestManager.exportProgress()` emits entries for every materialized definition, including default:

```ts
{ id, state: 'not_offered', stageIndex: 0 }
```

Opportunity collectors and `selectSettlementQuestOpportunities()` treat every ID in `persistedQuestIds` as something that must be reconstructed/preserved.

For RPG matrices this means a candidate selected during a previous boot can reserve that matrix across later loads even when the player never received, declined or started the quest.

## Ownership / existing mechanisms

Reuse:

- `QuestProgressEntry` as the authoritative persisted quest progress DTO;
- existing deterministic generated quest IDs;
- current candidate collectors/materializers;
- current `persistedQuestIds` reconstruction seam.

Do **not** add a second generated-opportunity save registry.

## Required change

Introduce one explicit composition-level predicate/helper that answers whether a saved generated quest entry requires definition retention.

A pristine default entry must not retain an opportunity:

```text
state = not_offered
stageIndex = 0
no resolvedOutcomeId
no stageCount / stageSlotProgress
no suppression
no journal
no worldKnowledge
no dialogueCooldowns
no observation
→ no retention claim
```

Retention must include lifecycle/progress that cannot safely be discarded, at minimum:

- `offered`, `active`, `ready_to_report`;
- terminal/history states that existing consumers intentionally preserve;
- `not_offered` with active decline suppression;
- any other non-default persisted quest metadata or stage/outcome progress that requires the same generated definition to interpret it correctly.

Do not change authored quest persistence semantics.

Do not change `QuestManager.exportProgress()`; derive the narrower generated-definition retention set at composition. Ordinary in-session `WorldBundle` rebuild does not reselect generated definitions because the app-level `QuestManager` and its materialized definitions survive that rebuild.

## Relevant files

- `src/app/createApp.ts`
- `src/quests/QuestManager.ts`
- `src/quests/quests.ts`
- `src/quests/opportunities/settlementQuestSelection.ts`
- `src/quests/opportunities/rpgQuestMatrices.ts`
- `src/quests/opportunities/settlementQuestOpportunities.ts`
- focused opportunity/save-load tests.

Prefer keeping the filtering decision at the composition boundary rather than teaching every collector a different definition of "persisted".

## Verification

Automated tests should prove:

1. pristine generated `not_offered` progress does not pin an old RPG candidate after save/load;
2. a fresh eligible candidate of the same matrix can be selected after reload when the old one had no meaningful progress;
3. `offered`, `active`, terminal and otherwise retention-worthy generated quests rematerialize with the same ID;
4. declined generated offers retain suppression rather than rotating to a new source to bypass decline;
5. world-driven per-source definitions with live deterministic identities still reconstruct normally;
6. non-default stage/outcome/metadata progress remains retention-worthy;
7. no second opportunity persistence store is introduced.

Browser verification remains the user's responsibility.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
