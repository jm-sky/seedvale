# Implementation Notes: quests-progression-051 authored quest dialogue narrative polish

These notes are intentionally narrow. The plan is a copy-only pass; the implementation agent should not rediscover or refactor quest architecture.

## Dependency / starting point

Implement only after `quests-progression-050` is on `main`.

`051` must treat the post-`050` quest definitions as authoritative. If `050` has added reaction-specific fields/lines to any of these conversations, preserve their mechanics and edit only prose required by `051`. Do not remove, flatten or bypass the social-reaction contract just to simplify copy.

The current five targets are runtime-built `QuestDef`s, not the name-based `AuthoredQuestDef` catalog. Their copy is authored directly in builder functions with stable `NpcId` bindings already resolved.

## Primary edit points

- `src/quests/lostHunterNaturalCave.ts` — `buildLostHunterNaturalCaveQuest()`
- `src/quests/suspiciousTransportCaveCache.ts` — `buildSuspiciousTransportCaveCacheQuest()`
- `src/quests/oldBonesAdventureCave.ts` — `buildOldBonesAdventureCaveQuest()`
- `src/quests/lostTreasureChronicleSearch.ts` — `chronicleSearchOfferLine()` and `buildLostTreasureChronicleSearchQuests()`
- `src/quests/lostTreasureChroniclesElder.ts` — `buildLostTreasureChroniclesElderQuests()`; only the `Stara uraza` quest is in the narrative-pass target, not a redesign of the winter prerequisite quest.

Do not move prose into a new shared dialogue abstraction. The existing builders are the correct ownership for this authored text.

## Cave-location wording contract

`src/quests/caveLocationDescription.ts` already owns player-facing cave phrases. `resolveCaveQuestPresentation()` / `describeCaveLocation()` produce complete noun phrases such as:

- `Jaskinia Mroczna, na północ od osady`
- `mała jaskinia na północ od osady`
- `stary loch poza osadą`

The helper already decides whether a speaker role (`guard`, `hunter`, `miner`, `trader`) may use the canonical location name.

Implementation rules:

- consume the builder's existing `caveDescription` as a complete phrase;
- do not recompute direction/name from ids or coordinates;
- do not modify `caveLocationDescription.ts` merely to make one sentence easier to inflect;
- write the surrounding sentence so the existing phrase remains grammatical.

Existing tests already assert that location wording is present without leaking internal archetype/debug terminology.

## Per-quest findings

### Zaginiony myśliwy

`buildLostHunterNaturalCaveQuest()` has the exact knowledge bug identified by the plan:

- after looting the pack, the quest establishes only that the player found the hunter's belongings (`plecak` + exact `hunting_bow` instance);
- there is no corpse/remains/death-confirmation objective or binding;
- the current keep-bow player line says `Znalazłem go martwego. Łuk zostaje przy mnie.` and must stop claiming confirmed death.

Preserve:

- witness `reveal_location` effect;
- exact `bowInstanceId` requirement on both final actions;
- `return_bow_to_family` / `report_fate_keep_bow` outcome ids;
- transfer of the exact bow instance on the return outcome;
- `abandonment: { allowed: false }`.

`src/quests/lostHunterNaturalCave.test.ts` already checks the cave phrase, reveal effect, exact item requirement and transfer effect. Add the plan-required regression assertion that authored player-facing lines do not assert confirmed death.

### Podejrzany transport

`buildSuspiciousTransportCaveCacheQuest()` owns all story copy. The final keep-item wording is factored into local `keepGoodsLines` and spread into actions for both giver and counterpart. If that wording changes, edit the shared object once rather than duplicating the two actions.

The physical evidence is an exact `damascus_knife` item instance, but the current quest does not establish provenance beyond it being the distinctive item in the hidden shipment. Narrative polish must not explain who originally owned it or whether a crime definitely occurred.

Preserve:

- cave reveal and exact evidence-instance requirement;
- the three existing outcomes `keep_quiet`, `report_it`, `keep_goods`;
- all current relation/reputation/reward consequences;
- four final actions (including the shared keep-goods action on both NPCs);
- `abandonment: { allowed: false }`.

### Stare kości

`buildOldBonesAdventureCaveQuest()` receives only the selected giver/claimant identities, settlement name and `caveDescription`; the binding contains no historical proof about the family story.

Important content boundary:

- claimant A is a real adult selected from one household;
- claimant B is optional and, when present, is another adult from that same selected household;
- this selection is not evidence of the currently authored claims such as a historical promise, inheritance rule or genealogy beyond what the existing copy already states.

Do not strengthen those claims during polish. In particular, avoid adding inscriptions, wills, dates, named ancestors or new evidence.

Keep copy valid in both builder shapes: with and without optional claimant B. Preserve exact signet-instance requirements and all existing recipient/keep outcomes.

### Zakodowana kronika

This file has two presentation layers that must stay consistent:

1. `chronicleSearchOfferLine(binding, lead)` owns the elder's basic/strong offer wording;
2. the main `QuestDef` sets a static basic `offerLine` **and** `resolveOfferLine: leadResolver(binding)`, so live dialogue may use the dynamically resolved variant.

Do not polish only the static `offerLine`; update `chronicleSearchOfferLine()` so both paths stay aligned.

`resolveChronicleSearchLead()` semantics are mechanics and must not change. Current tests require:

- `basic` offer does **not** contain `researcherSurname`;
- `strong` offer **does** contain it.

Preserve this information boundary while shortening the prose.

Also preserve the literal world-knowledge token `{worldKnowledgeClue:ruins}` wherever used. It is expanded by the quest runtime; changing/removing the token would alter information delivery rather than just prose.

`buildLostTreasureChronicleSearchQuests()` returns both the main `Zakodowana kronika` quest and the cemetery-favour quest. Avoid broadening this pass into new permission/gameplay semantics; if adjacent favour copy is edited for consistency, keep its current objective/outcome contract intact.

### Stara uraza

`buildLostTreasureChroniclesElderQuests()` returns two quests. The dispute (`story:lost-treasure-chronicles:elder:dispute`) is unlocked by either successful winter outcome; that prerequisite is mechanics and stays unchanged.

The dispute's known facts are deliberately sparse:

- elder says a tool was loaned and not returned;
- counterpart says it was returned;
- the game does not establish which account is true.

Preserve that ambiguity. Do not add corroborating witnesses, a proven timeline, previous friendship, fire/field history or other facts.

The terminal choice remains exactly `support_elder` vs `reconcile`; do not rewrite prose in a way that implies a third factual resolution.

## Quest-log / journal consequence of copy edits

Quest journal text is projected from the **current live `QuestDef`**, not persisted as raw strings. Changing authored `offerLine`, `progressLine`, `dialogueActions.npcLine` or result text will therefore also change how previously stamped journal events are rendered after load.

That is expected for this polish pass. Do not add persistence or snapshot old strings to preserve historical wording.

## Tests and implementation order

Recommended order:

1. implement copy changes one quest module at a time;
2. update only exact-string/text-fragment assertions broken intentionally;
3. keep behavioral assertions for ids, effects, transitions, exact item instances and consequences unchanged;
4. run the five adjacent quest test files, then relevant `QuestManager`/definition validation tests if `050` introduced reaction-copy assertions;
5. typecheck/build per current repository workflow.

Adjacent tests already exist for all five modules. In particular:

- `lostHunterNaturalCave.test.ts` covers cave presentation and exact bow mechanics;
- `lostTreasureChronicleSearch.test.ts` covers the basic/strong information boundary;
- corresponding `suspiciousTransportCaveCache.test.ts`, `oldBonesAdventureCave.test.ts`, and `lostTreasureChroniclesElder.test.ts` should remain the first place for local regression assertions.

Do not weaken mechanics assertions just because prose changed.

## Architecture guardrails

No changes are expected in:

- `QuestManager` lifecycle;
- quest persistence;
- `QuestDef` / objective contracts;
- reputation or relation math;
- world/container/cave bindings;
- NPC selection;
- item identities;
- UI components.

If implementation appears to require any of those, stop and re-check whether the wording can be expressed using values already available in the builder. This plan should remain a prose-only change on top of `050`.

No new public/shared helper is expected. If one becomes genuinely necessary, add concise JSDoc with `@domain quests-progression` as required by planning guidance.
