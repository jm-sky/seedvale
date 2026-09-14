# Implementation Notes: quests-progression-033

Recon baseline: current `main` after quests-progression-032. The source plan owns scope and naming; these notes record only implementation-relevant code findings.

## Offer selection seam

`QuestManager.onInteract(npcId)` must keep scanning all quest definitions so concurrent quest contexts remain available. The offer flood comes from `handleGiverOffer(def)`: contribution collection can change every eligible `not_offered` giver quest to `offered`.

Split this path into read-only candidate discovery, deterministic selection, then state mutation only for selected definitions. Existing `offered`, `active`, `ready_to_report`, talk-target and stage-dialogue contexts stay outside the new-offer cap.

An existing `offered` quest must occupy its exposure slot. Otherwise repeated conversations can accumulate offers even if each call promotes only one. Target policy is max 1 normal exposed offer per NPC plus max 1 urgent exposed offer.

## Existing contracts to reuse

`QuestDialogOverride` already separates `offer`, mutating `QuestDialogAction[]`, and navigation-only `QuestDialogTopic[]`. Keep Vue generic; lifecycle decisions remain in `QuestManager`.

`meetsAvailability(def)` stays the gate before ranking because it already owns prerequisites and live world-source validity. Ranking should use small quest-facing facts only: urgency, explicit/source priority, relation as a weak signal, then stable `QuestDef.id` tie-break. No randomness, FIFO state, scheduler or chain registry.

## Decline suppression

Current `offer.onDecline` resets directly to `not_offered`, so the same quest can return immediately.

Reuse `QuestWorldTimeLookup.getElapsedDays()` rather than adding timers or a cooldown manager. Add one optional scalar to `QuestProgressEntry` and runtime progress, for example `offerSuppressedUntilDay`. Decline sets `not_offered` plus this timestamp; candidate discovery skips the entry until world time passes. Export/restore preserves it; missing data in old saves means unsuppressed.

Suppression is metadata, not another `QuestState`.

## Active quest opt-out

The source plan defines a dedicated terminal lifecycle state for an explicit player opt-out. Keep that state distinct from `failed` and `invalidated`.

The generic opt-out action should only exist for an `active` giver quest whose policy permits it. Its callback must re-read current quest state before applying effects, so an outdated callback cannot apply them twice.

Reuse existing `QuestConsequences`, relation mutation and injected `ApplySocialConsequence`; do not create another social-effect subsystem. Story quests can disable the generic action and use existing authored outcomes, prerequisites and stage transitions.

## Runtime cleanup after plan 032

Old notes describing `animalTargets` as `questId -> animalId` are stale. Current code keys bindings by quest id + stage index + objective-slot id via `animalTargetKey(...)`.

The opt-out path should reuse/refactor the same stage-local cleanup as other terminal/transition paths and clear relevant runtime `feedContributionIds`. Do not persist these runtime maps.

## Other exposure surfaces

`QuestManager.list()` currently includes eligible `not_offered` definitions, and `labelMarker()` can mark an NPC for any eligible not-yet-offered quest. Align both with the new distinction between eligible and exposed, otherwise dialogue is fixed but Quest Log/markers still reveal hidden candidates.

Preserve existing marker precedence unless tests show otherwise.

## Persistence

Persist only the new terminal state from the source plan and decline-suppression metadata. Do not persist ranking order, next quest id, candidate lists, urgent-slot ownership or runtime bindings.

Update `QuestProgressEntry`, runtime restore/export and `src/persistence/saveData.ts` validation/tests if they enumerate quest states or shape. Save-version bump only if the current migration contract requires it for this additive change.

## Highest-value tests

- four eligible normal quests for one giver -> only one becomes `offered`;
- repeated interaction does not accumulate more normal offers;
- max one urgent may coexist with one normal;
- decline suppresses current offer and allows another candidate;
- suppression survives save/load and expires by world time;
- active/report/talk actions remain visible despite cap;
- explicit active-quest opt-out reaches the source-plan terminal state, clears runtime state and applies configured effects exactly once;
- outdated callback cannot replay effects;
- terminal opt-out entry never returns to ranking;
- hidden candidates do not leak through list/marker exposure;
- story exceptions keep authored flow;
- plan 028 fan-out and plan 032 multi-objective flow remain unchanged.

Manual browser verification remains user-owned.

## Likely files

Core: `src/quests/quests.ts`, `src/quests/QuestManager.ts`, `src/quests/QuestManager.test.ts`.

Secondary only when required: `src/persistence/saveData.ts` and tests; selected quest/opportunity definition files for real urgency/priority/story metadata.

Do not add a scheduler, persistent NPC queue, new event bus, generic world Problem system or quest-specific Vue state.
