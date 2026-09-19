# Codebase domain audit 21 — Quests, opportunities, reputation & badges

**Date:** 2026-09-19  
**Area:** 21 — Quests, opportunities, reputation & badges  
**Scope:** code correctness, architecture, lifecycle/persistence, performance  
**Baseline:** current `main`  
**Result:** ✅ reviewed; no unresolved high/critical findings

## 1. Scope

Traced:

```text
world / NPC / settlement event
→ opportunity eligibility
→ quest materialization / offer / start
→ objective state and progress ingress
→ stage transition
→ completion / failure / abandonment / invalidation
→ rewards / consequences
→ reputation / known-deed mutation
→ persistence
→ restore / rebuild
→ later quest/opportunity consumers
```

This review deliberately excludes missing features, roadmap/Vision differences and subjective quest design.

Primary code inspected:

- `src/quests/QuestManager.ts`
- `src/quests/quests.ts`
- `src/quests/opportunities/*`
- `src/app/createApp.ts`
- `src/app/saveState.ts`
- `src/reputation/ReputationManager.ts`
- `src/reputation/SocialNewsLedger.ts`
- `src/reputation/animalDeeds.ts`
- `src/badges/badges.ts`
- relevant save validation/migration and gameplay producer call sites.

## 2. Entry points and state owners

### Quest lifecycle

`QuestManager` is the sole owner of quest runtime progress and player↔NPC quest relations. Definitions are immutable runtime input; world/NPC/fauna owners remain authoritative for their own state and are reached through narrow injected lookups/resolvers.

Lifecycle is explicit:

```text
not_offered → offered → active → ready_to_report → complete | failed
                         ↘ abandoned
                         ↘ invalidated
```

Terminal reward/consequence application is centralized in `applyOutcome()`; terminal-state guards prevent replay after completion/failure/invalidation/abandonment.

### Opportunities

`src/quests/opportunities/` owns candidate collection, deterministic IDs, selection and materialization only. Once materialized, generated quests use the same `QuestDef`/`QuestManager` lifecycle as authored quests.

### Reputation

`ReputationManager` is the sole owner of per-settlement reputation dimensions and renown. Quest outcomes and other social producers pass already-resolved `SocialConsequence` values through `applySocialConsequence()`; the manager does not infer world facts itself.

`SocialNewsLedger` owns only pending social-news propagation state and per-settlement delivery dedupe. It returns consequences; it does not duplicate reputation state.

### Badges / known deeds

`BadgeManager` owns global badges and settlement-scoped Known Deed counters/earned sets. Unlock consequences are returned to the caller and applied through the same reputation seam rather than mutating reputation inside the badge subsystem.

## 3. Flows traced

### Opportunity → quest

Settlement/world candidate collectors produce deterministic candidate IDs. Selection deduplicates by ID and matrix kind, materialization binds stable NPC/world identities, then `createApp.ts` composes all definitions before constructing `QuestManager`.

Live world-driven availability stays in source lookups; the quest layer does not own the stray animal, wolf den, injured cow or other source state.

### Objective progress and event routing

Interaction, animal death/harvest/treatment/feeding, inventory changes, world-progress polling and source polling all converge on `QuestManager`. Multi-objective stages route facts to every matching unfinished slot; completion is guarded by active state and slot completion.

The previous first-match event-routing problem is not present in current code.

### Terminal transitions / rewards / consequences

`applyOutcome()` rejects already-terminal state, writes the terminal state before reward/consequence side effects, then applies effects, item rewards and social consequences once. Repeated calls therefore cannot grant the same terminal reward again.

Abandonment has its own active-state guard and never grants rewards.

### Reputation / known deeds

Quest social consequences mutate the separate `ReputationManager`. Dangerous-animal generic social news is suppressed when the active quest already owns the kill's social outcome, preventing the same deed being rewarded through both paths.

Known-deed counters are event-driven and settlement-scoped. Their one-shot unlock path is guarded by the earned set; unlock reputation bonuses are not re-applied after earning.

### Persistence / rebuild

Quest progress, relations, reputation, badge progress and social-news dedupe state are all persisted independently by their respective owners. Ordinary wild animal bindings remain runtime-only by design; active wild individual quests become `invalidated` rather than silently retargeting after restore/rebuild.

## 4. Findings

### F21-1 — Medium — default `not_offered` generated quests become permanent persisted opportunities after the first save

**Category:** lifecycle / persistence / opportunity selection

`QuestManager.exportProgress()` emits one `QuestProgressEntry` for **every** materialized definition, including untouched `not_offered` quests with no durable progress.

`createApp.ts` then builds:

```ts
const persistedQuestIds = initialSave?.quests.progress.map((entry) => entry.id)
```

and passes that full set into the opportunity collectors/selector.

Both RPG and world-driven opportunity code interpret a persisted ID as a definition that must be reconstructed/preserved. The RPG collector explicitly describes this as preserving accepted/completed matrices, but the actual input also contains default never-offered candidates.

Consequences:

- after one save, a generated RPG source/matrix that happened to be selected at boot can become sticky even if the player never saw or accepted it;
- reconstructed IDs are selected before fresh candidates and reserve the matrix kind, so a newer valid candidate of the same matrix cannot replace the untouched old one;
- save/load therefore changes opportunity-selection semantics based on materialization history rather than player-visible quest history.

This is not covered by quests-progression-031: that plan intentionally preserves persisted generated IDs, but assumes persistence represents meaningful quest continuity.

**Required direction:** keep full quest progress persistence if useful, but derive the generated-definition retention set from lifecycle/progress that actually requires continuity. Preserve declined suppression and any other non-default durable state; do not treat a pristine `not_offered` entry as a persisted opportunity claim.

**Plan:** `quests-progression-071-generated-opportunity-retention-semantics.md`.

### F21-2 — Medium — restore invalidation drops persisted quest metadata instead of preserving player history

**Category:** lifecycle / persistence

During constructor restore, `QuestManager` correctly refuses to rebind active wild `kill_target_animal` / `find_animal` objectives to a different ordinary wild individual.

However, the invalidation branch writes directly:

```ts
this.states.set(entry.id, { state: 'invalidated', stageIndex: restored.stageIndex })
```

after `normalizeRestoredProgress()`.

That discards persisted fields that ordinary state transitions intentionally preserve:

- `journal`;
- `worldKnowledge`;
- `dialogueCooldowns`;
- `observation`.

The class already documents `setQuestState()` as preserving those fields across ordinary transitions, and `reset()` as the exceptional path that intentionally clears them. Restore invalidation bypasses that contract, so merely loading a save can erase quest-history/context data for an otherwise correctly invalidated quest.

The invalidated lifecycle state itself is correct; only metadata loss is the finding.

**Required direction:** preserve non-target quest history/context when converting restored progress to `invalidated`, while still discarding untrustworthy runtime animal binding/count state as appropriate. Add focused restore regression tests.

**Plan:** `quests-progression-072-invalidated-quest-restore-metadata-continuity.md`.

## 5. Architecture observations

No second quest runtime, second reputation store or duplicate badge authority was found.

Positive boundaries to preserve:

- opportunities materialize normal `QuestDef` objects instead of creating a parallel quest engine;
- quest progress does not own world-source truth;
- reputation and quest relations remain intentionally distinct;
- social-news propagation stores delivery state, not copied reputation;
- known deeds reuse the same social-consequence application seam;
- terminal reward/consequence application has an effective exact-once guard;
- marker refresh is dirty-driven rather than recalculated for every NPC every frame.

Recurring quest event handlers still scan the bounded definition array. Current calls are event/poll/dirty driven and the reviewed code currently expects tens, not thousands, of definitions. No standalone performance defect was confirmed here; area 24 can benchmark/index this later if quest volume grows materially.

## 6. Cross-domain dependencies / follow-ups

- Area 03 should independently review generic save validation/migration robustness; this review only followed persistence required by the quest/reputation/badge flow.
- Area 16/17 own actual fauna/livestock identity continuity; this review only checked how quests react to those identities.
- Area 23 owns UI projection/stale callbacks; quest callbacks were inspected only enough to verify lifecycle guards and reward idempotency.
- `world-031-authored-persistent-world-consequences.md` remains the owner for future authored persistent world-effect machinery; no duplicate plan was created here.

## 7. Existing plans that already cover findings

Checked before creating new work:

- `quests-progression-016-world-driven-settlement-quest-opportunities.md` — established generated opportunity reconstruction and live source gating; does not distinguish pristine saved definitions from retention-worthy progress.
- `quests-progression-020-hunter-profession-quests-and-wildlife-help.md` — intentionally makes habitat-feed animal-ID dedupe runtime-only; therefore that save/load boundary is **not** reported as a finding.
- `quests-progression-022-lazy-social-news-propagation-and-reputation-catch-up.md` — already provides persisted per-settlement idempotency for social-news consequences.
- `quests-progression-028-world-fact-event-fanout.md` / `quests-progression-032-nonlinear-stage-objectives-and-transitions.md` — current event fan-out and slot guards are present.
- `quests-progression-031-per-source-opportunity-defs.md` — preserves generated source identities; does not fix the overly broad `persistedQuestIds` input.
- `quests-progression-033-quest-offer-selection-prioritization-and-abandonment.md` and `quests-progression-034-quest-giver-cap-markers-and-target-lifecycle.md` — current offer/abandonment/actionability guards are present.
- `quests-progression-059-settlement-known-deeds-and-reputation-badges.md` — known-deed ownership/persistence is implemented and no duplicate-state defect was found.
- `world-031-authored-persistent-world-consequences.md` — future persistent world consequences; unrelated to F21-1/F21-2.

No active plan found that closes F21-1 or F21-2.

## 8. New plans required

1. `quests-progression-071-generated-opportunity-retention-semantics.md` — F21-1.
2. `quests-progression-072-invalidated-quest-restore-metadata-continuity.md` — F21-2.

## 9. Verification limits

Review only. No production code was changed and no browser verification was performed.

Findings are static control-flow/state-ownership findings confirmed against current `main`. Existing automated tests were used as supporting evidence only; no claim of browser/gameplay verification is made.

## 10. Master status update

Area 21 should be marked:

**✅ reviewed**

There are two unresolved medium findings and no confirmed high/critical finding.
