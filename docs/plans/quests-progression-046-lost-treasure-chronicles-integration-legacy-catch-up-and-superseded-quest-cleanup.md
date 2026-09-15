# Plan: Lost Treasure Chronicles — integration, legacy catch-up and superseded quest cleanup

**Created:** 2026-09-15  
**Status:** `planned` 📋  
**Priority:** high · **Effort:** L  
**Depends on:** quests-progression-045, quests-progression-044, quests-progression-043, quests-progression-042, quests-progression-041, quests-progression-040, quests-progression-039, quests-progression-038, quests-progression-037, ~~quests-progression-027~~, ~~quests-progression-009~~  
**Domain:** `quests-progression`  
**Type:** `polish`  
**Subdomains:** `quests` `relationships` `progression`  
**Tags:** `lost-treasure-chronicles` `integration` `legacy` `catch-up` `superseded-quests` `migration`  
**Roadmap:** `quests-lost-something-chronicles.md`

## Goal

Integrate plans 037–045 into one coherent Lost Treasure Chronicles network and ensure existing saves/world states converge correctly.

Primary flow:

```text
legacy/current world state
→ canonical LTC story binding
→ retire conflicting old offers
→ preserve all authoritative world/item/NPC state
→ derive catch-up progress from that state
→ continue from the earliest genuinely unresolved LTC step
→ reach one canonical finale/property outcome
```

This plan does not add another story chapter.

It owns:

- cross-plan integration;
- legacy-state reconciliation;
- superseded quest cleanup;
- early-discovery catch-up;
- duplicate prevention;
- terminal consistency.

---

## 1. Lost Treasure Chronicles remains a quest network

Plans 037–045 remain separate quest definitions / story chapters where appropriate.

Do not collapse them into one monolithic quest FSM.

Connect chapters through:

- quest outcomes;
- authoritative world state;
- stable NPC identities;
- stable item instances;
- location knowledge;
- prerequisite rules.

Do not introduce a `LostTreasureChroniclesManager`.

---

## 2. Canonical chapter chain

Normal progression:

```text
037 elder trust
→ 038 chronicle search
→ 039 deciphering
→ 040 estate + alpha bear + map
→ 041 dungeon binding + collapsed access
→ 042 expedition evidence + survivor clue
→ 043 survivor site + key + final access
→ 044 final treasure resolution
→ 045 optional/eligible property grant
```

The implementation must allow chapters/stages to collapse when authoritative world state already satisfies them.

---

## 3. World state beats chronology

Hard rule:

> never reset a valid world change merely because an earlier LTC chapter was not active when it happened.

Examples:

- chronicle already found;
- estate already discovered;
- alpha bear already dead;
- map already taken/read;
- dungeon already discovered;
- collapse already cleared;
- journal already taken;
- finalTreasure already looted;
- survivor key already obtained;
- final access already unlocked;
- property already granted.

Quest state catches up to the world. The world never rewinds to match quest order.

---

## 4. Supersede old `009` offer path

Current code still contains the original Piotr/dark-forest treasure quest.

Plan 040 supersedes that narrative.

For new/unified progression:

- old `009` must no longer become newly offered;
- Piotr must not independently send Player to the same estate;
- existing world site remains;
- chest/map state remains;
- fauna/world state remains.

Do not delete shared estate/site implementations or persisted IDs.

---

## 5. Existing `009` states

### Never offered

Suppress future offer.

### Offered / active

Retire/invalidate without stage-by-stage migration.

Preserve:

- estate discovery;
- chest depletion;
- map possession/read/consumed state;
- fauna state;
- ordinary world mutations.

Do not auto-grant old completion rewards.

### Completed

Preserve historical completion and consequences.

LTC treats relevant world/item state as already discovered.

Do not replay social/reward effects.

---

## 6. No stage-number migration for `009`

Do not map old quest stages directly onto LTC stages.

Preferred pattern:

```text
retire old quest
→ inspect authoritative world state
→ initialize/catch up LTC 040 accordingly
```

---

## 7. Supersede old `027` offer/finale

Current `027` owns stable quest/runtime bindings, expedition content, journal and finalTreasure.

LTC plans 041–044 reuse that content but supersede the independent narrative.

For new progression:

- old `027` must not appear as a parallel independent expedition;
- physical expedition content remains canonical;
- LTC reuses the same dungeon, trail, journal and finalTreasure.

---

## 8. Existing `027` offered / active

If old `027` is offered/active when LTC becomes authoritative:

- retire/invalidate old quest;
- preserve dungeon binding;
- preserve materialized containers;
- preserve journal instance;
- preserve stakeholder identities;
- preserve finalTreasure state;
- preserve location knowledge;
- preserve fauna/world state.

Do not translate stage numbers.

---

## 9. Existing `027` completed

Preserve:

- journal destination;
- sponsor/family relation consequences;
- finalTreasure depletion;
- stakeholder identities;
- prior quest outcome.

Do not reverse or reapply them.

LTC may continue only for unresolved broader story consequences.

---

## 10. Legacy journal ownership

The expedition journal may already be:

- with Player;
- with sponsor;
- with family/contact;
- otherwise transferred by old `027`.

Never duplicate or forcibly reclaim it.

If prior canonical history proves the journal was already resolved, LTC progression must not require Player possession.

---

## 11. Legacy finalTreasure already depleted

An empty/partially depleted `finalTreasure` is a supported historical state.

Do not:

- refill it;
- reconstruct loot;
- block `044`.

The finale resolves history/social consequences using only facts current systems can reliably establish.

---

## 12. Singular critical story identities

Invariant:

```text
one chronicle
one estate treasure map
one expedition journal
one final-access key
one property grant deed
```

Catch-up logic must never create replacement instances merely because an expected chapter is incomplete.

Before materializing a critical story item, resolve its stable identity and check authoritative ownership/consumed state supported by current systems.

---

## 13. Singular critical locations

Invariant:

```text
one chronicle source binding
one dark-forest estate
one canonical dungeon
one survivor site
one property reward plot
```

Save/load or retirement must never select a second equivalent site.

Bindings derive from deterministic world/story identity.

---

## 14. Stable NPC identity

Preserve stable authored identities:

- Elder;
- Archaeologist;
- Deciphering Specialist.

Preserve reused/generated `027` stakeholder identities where retained:

- sponsor;
- family/contact.

Do not regenerate replacements because of death, poor relations, retirement of the old quest or unexpected progression order.

---

## 15. NPC death does not rewind known information

If a story NPC dies after providing their role/information:

- learned information remains valid;
- existing LocationKnowledge remains;
- delivered physical items remain;
- later chapters continue through their defined fallback paths.

Do not resurrect NPCs.

---

## 16. Death before mandatory information

For genuinely blocking early deaths, use the smallest existing-world fallback supported by implemented chapter mechanics.

Preferred sources include:

- already-authored notes/documents;
- household/contact relationships;
- another existing stakeholder;
- already-acquired LocationKnowledge.

Do not create immortal quest NPCs solely to avoid edge cases.

Implementation notes must identify only the actually blocking cases after 037–045 exist in code.

---

## 17. Early chronicle acquisition

If Player has the exact chronicle before 038:

- do not spawn another;
- 038 catches up;
- search stages collapse as appropriate;
- real social consequences of how it was obtained remain.

---

## 18. Early estate discovery

If Player discovers the estate before 039/040:

- preserve LocationKnowledge;
- 039 may still provide interpretation/context;
- 040 must not pretend the place was unknown.

---

## 19. Early alpha-bear death

If the canonical alpha bear is already dead before 040:

- death remains permanent;
- no replacement alpha is spawned;
- 040 treats that environmental pressure as already resolved.

---

## 20. Early map pickup/read

If the estate map was already taken/read:

- do not recreate it;
- 040 catches up;
- 041 uses the resulting canonical dungeon binding/knowledge.

---

## 21. Early dungeon discovery

If the canonical dungeon is already known:

- preserve discovery;
- map/041 may confirm the story meaning;
- do not choose a second dungeon.

---

## 22. Early collapsed-access clearing

If 041 world access is already cleared:

- preserve cleared state;
- skip the clearing step;
- do not rebuild rubble.

---

## 23. Early expedition evidence/journal recovery

If existing `027` or free exploration already consumed expedition content:

- use authoritative container/item/history state;
- do not reseed leader pack/journal;
- 042 catches up.

---

## 24. Early survivor-site/key progression

If survivor site is already discovered or the exact final-access key is already owned:

- preserve location knowledge;
- preserve exact key instance;
- collapse already-satisfied 043 stages;
- never spawn a replacement key.

---

## 25. Early final-access unlock

If final dungeon access is already unlocked:

- preserve world-owned persistent access state;
- 043 catches up;
- do not relock.

---

## 26. Property reward catch-up

If Player already owns the exact LTC reward plot through a valid prior grant:

- 045 recognizes it;
- no duplicate deed/plot/reward.

For legacy worlds where a normal purchase collides with the story-bound reserved plot, follow the deterministic compatibility fallback defined by the final 045 implementation rather than revoking existing ownership.

---

## 27. Prerequisites use authoritative signals

Do not require only:

```text
previousQuest.status === complete
```

when authoritative state can legitimately satisfy a physical dependency.

Use:

- world/item/location/access state for physical facts;
- quest outcomes/history for social choices and narrative decisions.

---

## 28. Never fabricate social choices

Physical catch-up may collapse exploration/work stages.

It must not invent decisions that Player never made.

Never infer solely from physical state:

- elder dispute choice;
- grave permission/unsanctioned choice;
- specialist payment vs favor;
- final treasure claimant choice;
- property acceptance.

If no durable history records a social decision and it still matters, leave that choice unresolved.

---

## 29. Separate physical and narrative catch-up

### Physical catch-up

Derived from authoritative state:

- exact item ownership/existence;
- place discovery;
- blockage cleared;
- chest depletion;
- key ownership;
- access unlocked.

### Narrative catch-up

Derived only from durable quest outcomes/history:

- who was supported;
- journal disposition where historically recorded;
- final treasure decision;
- property eligibility/acceptance.

Do not conflate these categories.

---

## 30. Idempotent reconciliation

Reconciliation must be safe to run repeatedly:

```text
same save
→ same reconciliation
→ no new items
→ no duplicate relations
→ no duplicate reputation
→ no duplicate ownership
```

Do not base one-time grants on transient boot flags.

---

## 31. Event-driven / bounded reconciliation

Do not create a per-frame LTC synchronizer.

Use bounded existing lifecycle points such as:

- quest registration/composition;
- offer evaluation;
- chapter initialization;
- relevant interaction;
- explicit load/catch-up boundaries already owned by quest composition.

Avoid repeated full scans of all containers/NPC inventories/locations.

---

## 32. Avoid broad save migration

Prefer interpreting existing persisted state.

Do not add save-version migrations solely to translate old quest stage numbers into LTC stages unless current persistence makes clean invalidation impossible.

Preserve existing world/item/container IDs and state.

---

## 33. Superseded quest visibility

Retired old `009`/`027` quests must not remain actionable beside LTC.

Use existing quest lifecycle semantics:

- preserve completed historical entries where normal history supports them;
- retire/invalidate offered/active superseded entries;
- do not invent a second quest archive.

---

## 34. Offer suppression is structural

Do not merely hide old offers in Vue.

Suppress them at eligibility/offer-source level so they are genuinely unavailable to dialogue and future world/NPC integrations.

---

## 35. Retirement is not failure

Retiring old quests must not apply ordinary:

- failure penalties;
- abandonment penalties;
- relation loss;
- reputation loss.

Prefer existing `invalidated` semantics where appropriate.

---

## 36. Final outcome uniqueness

At most one canonical LTC final-treasure outcome may be committed.

At most one property reward acceptance/grant may be committed.

Save/load/repeated dialogue cannot apply another branch or duplicate consequences.

---

## 37. Terminal network states

Support at least:

### Main story complete

`044` has a terminal outcome.

`045` may be:

- granted;
- declined;
- unavailable because the outcome is ineligible;
- still available as an optional epilogue reward where appropriate.

### Completed without property

Valid terminal story state.

`045` must never block Lost Treasure Chronicles from being considered complete.

### Legacy-compatible terminal

Old saves with consumed/missing physical content can still converge to a coherent story end without replaying unavailable world actions.

---

## 38. Property is epilogue, not finale blocker

`044` is the canonical story finale.

`045` is an optional persistent consequence/reward.

Declining it, being ineligible or losing the grant authority NPC must not leave the main story permanently unfinished.

---

## 39. Cleanup of old `009` / `027` wiring

After unified behavior works:

- remove obsolete independent offer wiring;
- remove dead independent dialogue routes;
- keep shared world/content/runtime utilities still used by LTC;
- rehome/rename only where ownership becomes materially clearer.

Do not perform broad unrelated refactors.

---

## 40. Persisted IDs are compatibility contracts

Do not rename persisted identities just to make them read as LTC IDs.

Preserve where relevant:

- old quest IDs;
- journal instance ID;
- container IDs;
- cave/dungeon IDs;
- estate/location IDs;
- consumed pickup IDs;
- stable world-access IDs;
- property plot IDs.

LTC may reinterpret semantics while persistence identity remains stable.

---

## 41. Documentation truth cleanup

After implementation, update relevant state docs to describe:

- LTC as the canonical treasure quest network;
- `009` and `027` as superseded narrative foundations;
- retained shared world/content mechanics;
- actual persistence/reconciliation ownership.

Do not manually edit derived plan indexes/next IDs.

---

## 42. Debug/verification visibility

Reuse existing quest/debug inspection where possible.

Diagnostics should be sufficient to answer:

```text
which LTC chapter is next?
which authoritative fact caused catch-up?
which old quest was retired?
which canonical story bindings are active?
```

Do not create a new LTC-specific debug UI unless existing tools genuinely cannot expose these facts.

---

## 43. Performance

No global per-frame scans.

Stable IDs should enable direct/bounded lookup wherever possible.

Legacy reconciliation may perform bounded one-time work at initialization/offer evaluation, but must not become continuous simulation work.

---

## 44. Reuse targets

Verify current `main`, especially:

- plans 037–045 and their implementation notes;
- `src/quests/quests.ts`;
- `QuestManager` and quest lifecycle/persistence;
- `src/quests/lostTreasureExpedition.ts`;
- `src/quests/lostTreasureExpeditionRuntime.ts`;
- original `009` dark-forest quest wiring;
- `darkForestTreasureSite`;
- exact ItemInstance ownership/transfer seams;
- `WorldGeneratedContainers`;
- `LocationKnowledge`;
- cave anchor claims and canonical dungeon binding;
- persistent access/blockage state from 041/043;
- `LandOwnershipRegistry` and 045 reward-plot reservation;
- relation/reputation consequence application;
- app/world composition and save/load wiring.

Current code wins over plans if implementation details changed.

Add concise JSDoc for important reusable/public reconciliation or lifecycle helpers, using `@domain` where useful for preflight discovery.

---

## 45. Non-goals

Do not implement:

- another LTC story chapter;
- new treasure locations;
- new major NPCs;
- new reputation system;
- new property system;
- generic migration framework for every quest;
- generic provenance ledger;
- monolithic LTC manager;
- broad quest-system refactor.

---

## 46. Automated verification

Cover at least:

### Superseded `009`

- never-offered quest stays unavailable;
- offered/active quest retires without failure penalties;
- completed quest remains historical;
- estate/map/chest state is preserved.

### Superseded `027`

- no independent new offer;
- active quest retires without resetting expedition world state;
- completed outcome is preserved;
- journal ownership is preserved;
- finalTreasure state is preserved.

### Catch-up

- early chronicle;
- early estate discovery;
- alpha bear already dead;
- map already taken/read;
- dungeon already known;
- collapse already cleared;
- journal already recovered/transferred;
- survivor key already owned;
- final access already unlocked;
- finalTreasure already depleted;
- property already granted.

Each case must converge without duplicate world content or rewards.

### Social state

- no relation/reputation replay;
- no fabricated social choice;
- invalidation does not trigger failure/abandonment penalties.

### Identity

- no duplicate critical item instances;
- no duplicate estate/dungeon/survivor/property bindings.

### Idempotency

Run reconciliation twice and verify identical resulting quest/world state with no extra mutations.

Manual browser verification remains the User's responsibility.

---

## 47. Completion criteria

The plan is complete when:

1. plans 037–045 behave as one coherent quest network;
2. old `009` and `027` are no longer independently offerable in conflicting form;
3. their reusable world/content state remains intact;
4. active legacy versions retire without punitive side effects;
5. completed legacy outcomes remain historical truth;
6. physical catch-up derives from authoritative world state;
7. narrative choices are never fabricated from physical state;
8. early discovery/loot/death/unlock states never respawn or rewind content;
9. all critical story identities remain singular;
10. reconciliation is idempotent;
11. final treasure resolution can always reach a coherent terminal state;
12. property reward is optional and cannot block main story completion;
13. no monolithic LTC manager or parallel persistence system is introduced;
14. state documentation reflects the unified canonical story.

> **Zrób git commit i push do main, rebase jeżeli trzeba**