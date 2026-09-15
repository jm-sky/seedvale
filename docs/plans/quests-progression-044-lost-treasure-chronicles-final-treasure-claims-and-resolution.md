# Plan: Lost Treasure Chronicles — final treasure claims and resolution

**Created:** 2026-09-15  
**Status:** `planned` 📋  
**Priority:** high · **Effort:** L  
**Depends on:** quests-progression-043, quests-progression-042, ~~quests-progression-027~~  
**Domain:** `quests-progression`  
**Type:** `feature`  
**Subdomains:** `quests` `relationships` `progression` `rewards`  
**Tags:** `lost-treasure-chronicles` `final-treasure` `claims` `choice` `reputation` `legacy`  
**Roadmap:** `quests-lost-something-chronicles.md`

## Goal

Implement the main Lost Treasure Chronicles finale:

```text
final dungeon access opened
→ reach authoritative finalTreasure
→ establish one primary treasure claim plus expedition-record interests
→ Player chooses what happens to the treasure / expedition record
→ physical ownership changes where current systems can represent it reliably
→ relations and settlement reputation change
→ questline records a durable outcome
```

This plan resolves the **treasure conflict**.

It does **not** implement:

- ownership of the dark-forest estate,
- settlement plot ownership,
- a generic legal/property system,
- a new faction/reputation layer,
- a provenance ledger for stackable loot.

If estate ownership remains desirable after this resolution, plan it separately.

---

# 1. Existing `finalTreasure` remains authoritative

Reuse the real `finalTreasure` already owned by the canonical dungeon / former `027` world content.

Do not create a second final chest or replacement treasure source.

Invariant:

```text
one canonical dungeon
one finalTreasure source
one mutable physical loot state
```

The quest observes that source.

It does not own a duplicate treasure balance.

---

# 2. Do not respawn treasure for narrative convenience

The treasure may already have been looted:

- through old `027`,
- through early exploration,
- through a legacy save.

That state remains authoritative.

Never:

- refill the container,
- reconstruct its original loot into Player inventory,
- spawn a second reward chest,
- reset it because this chapter activates later.

The finale must work both when the treasure is still present and when it was taken earlier.

---

# 3. No provenance ledger for stackable treasure

Do not build a new system that tracks which exact coins, gems or ordinary stackable items originally came from `finalTreasure` after they leave the container.

Use the strongest facts current systems can know reliably:

- final container contents / depletion;
- exact identity-backed item ownership where such items exist;
- current Player/NPC inventory state only where origin remains provable;
- persisted quest outcomes / legacy history.

For ordinary stackable loot whose origin becomes indistinguishable after transfer, sale or consumption, do not invent provenance.

If current code cannot prove that a Player-owned coin or ruby came from this treasure, the finale must not pretend that it can.

---

# 4. Physical transfers follow item semantics

Use real ownership transfer where the asset is reliably identifiable.

### Identity-backed items

Transfer the exact `ItemInstance` through existing inventory-transfer seams.

### Ordinary stackable treasure

Do not require a full item-by-item historical reconstruction once loot has mixed with ordinary inventory.

When the treasure is still in its source container, a surrender/share outcome may use the authoritative current contents if current APIs make this coherent.

When ordinary loot has already been removed and mixed/consumed, resolve the historical/social decision rather than building a provenance subsystem.

---

# 5. `027` terminal narrative is superseded

Lost Treasure Chronicles owns the canonical resolution of this expedition/treasure story.

The old independent `027` terminal choice must no longer compete with this finale for new playthroughs.

Preserve:

- existing stakeholder identities,
- journal ownership,
- world containers,
- prior legacy outcomes.

Do not preserve the old offer as a parallel finale.

---

# 6. One primary treasure claimant

The unified story must choose **one primary claimant** for the treasure rather than making archaeologist and old `027` sponsor two near-identical competing commercial claimants.

Preferred direction:

> the Archaeologist becomes the primary current-expedition / research claimant.

The former `027` sponsor remains a stakeholder only if current landed story binding gives them a meaningfully different role, for example:

- financier of the failed historical expedition,
- witness to the original agreement,
- commercial party owed recognition or compensation.

If that distinction is weak, do not force the sponsor into the treasure decision.

Do not invent another claimant NPC.

---

# 7. Treasure claimants and expedition-record claimants are distinct

Hard invariant:

```text
treasure claimant ≠ expedition-record claimant by default
```

The expedition family/contact primarily has a claim to:

- truth about the expedition,
- the journal,
- personal effects,
- closure.

They do **not** automatically claim the entire treasure.

This keeps the finale understandable and avoids a combinatorial claimant matrix.

---

# 8. Canonical stakeholder set

Core participants are:

- Archaeologist — preferred primary treasure claimant;
- optional old `027` sponsor — only if narratively distinct;
- expedition family/contact — record/personal-effects stakeholder;
- Player.

The Elder and deciphering specialist should not automatically become claimants merely because they helped earlier.

No new claimant NPC should be invented just to create more branches.

---

# 9. Stakeholder interests stay distinct

### Archaeologist

Primary interest:

- historical recovery,
- provenance,
- preservation/study,
- current expedition/research investment.

### Old expedition sponsor, when retained

Primary interest must differ materially from the Archaeologist, such as:

- prior expedition finance,
- historic contract,
- commercial recognition.

Do not give both NPCs the same argument.

### Expedition family/contact

Primary interest:

- truth about the lost expedition,
- journal/personal effects,
- dignity/closure.

They are not automatically treasure owners.

---

# 10. Separate treasure disposition from journal disposition

The expedition journal and final treasure are different physical/history objects.

The main treasure finale must not be blocked because the journal was already resolved in a previous/legacy path.

Treat the journal as an **optional unresolved thread** during the finale.

Possible journal state:

- already transferred to family;
- already transferred to sponsor;
- still with Player;
- otherwise unavailable through authoritative legacy state.

If unresolved and physically available, allow a final disposition using the exact instance-transfer seam.

Do not require journal resolution as a mandatory stage before the treasure choice.

---

# 11. Keep treasure choices bounded

Target 3 principal treasure outcomes:

1. **shared / preservation-oriented resolution**;
2. **honor the primary claimant**;
3. **keep the treasure**.

A fourth outcome is acceptable only if current relationship/world state yields a genuinely different compromise.

Do not create every permutation of journal × claimant × family × treasure percentage.

---

# 12. Preferred outcome A — shared / preservation-oriented resolution

The Player recognizes the discovery as having broader historical/social value.

Conceptually:

- treasure is surrendered/shared through the primary claimant or a credible existing social/economic owner;
- expedition record is handled separately;
- Player receives social recognition rather than maximum personal material value.

Consequences should favor:

- trust,
- benevolence,
- integrity,
- competence,
- modest renown.

Do not create a separate “hero reputation”.

---

# 13. Preferred outcome B — honor the primary claimant

The Player recognizes the Archaeologist's or selected primary claimant's legitimate expedition/research claim.

Where physical transfer can be represented reliably:

- transfer the actual identifiable assets;
- compensate the Player through current money/reward seams.

Where ordinary stackable loot was already mixed or consumed:

- do not manufacture an equivalent replacement transfer;
- resolve only what current authoritative state supports.

Consequences should emphasize claimant relation and appropriate competence/integrity/trust.

---

# 14. Preferred outcome C — keep the treasure

Player keeps the physical treasure that they actually control.

This is valid.

Do not silently confiscate it because another ending is more socially approved.

Consequences may include:

- negative claimant relation,
- reduced trust/integrity,
- modest renown/notoriety only if current social systems support it appropriately.

No new criminal/wanted system.

Keeping the actual physical loot **is the material reward**; do not grant a duplicate equivalent quest reward.

---

# 15. No forced historical reconstruction of ordinary loot

If the Player already removed and later sold, consumed or mixed ordinary final-treasure loot, do not require the finale to recover an equivalent amount.

Do not add:

- treasure debt,
- provenance ledger,
- tagged coins,
- retroactive inventory origin metadata.

If the code cannot reliably establish present physical ownership, the finale resolves responsibility / historical choice rather than forcing a fake physical return.

---

# 16. Legacy rule — treasure already gone

Hard rule:

> if current code cannot reliably determine the physical provenance of already-removed `finalTreasure` loot, resolve the finale through historical responsibility and available authoritative state, not through a fabricated asset transfer.

The questline must still terminate coherently.

Do not block completion forever because the source chest is empty.

Do not respawn anything.

---

# 17. Outcome availability derives from real state

Choices may depend on:

- current final-container state;
- reliable identity-backed item ownership;
- claimant alive/available;
- prior relationship;
- prior quest outcome;
- whether old `027` already resolved the journal.

Do not expose a physical surrender option that cannot be completed reliably.

Conversely, do not hide `keep treasure` merely because claimants are present.

---

# 18. Explicit Player choice

Do not auto-select the final resolution based on:

- reputation,
- relationship,
- previous branch,
- inventory value.

Existing state should affect:

- dialogue,
- negotiation,
- option availability,
- reaction severity,
- compensation.

The Player consciously decides.

---

# 19. Prior questline history matters

Use existing state from 037–043.

Examples:

- Elder trust may influence credibility/dialogue;
- Archaeologist relationship may affect compensation/reaction;
- specialist path may provide flavor only;
- earlier social reputation already exists and should not be duplicated;
- previous `027` legacy outcomes must not be applied again.

Do not introduce a parallel Lost Treasure morality score.

---

# 20. Relations

Use ordinary Player↔NPC relations.

Expected targets:

- Archaeologist;
- optional distinct old sponsor;
- family/contact for journal/personal effects only where relevant.

Do not give universal positive relation bumps for completing the story.

Different stakeholders should react differently.

---

# 21. Settlement reputation

Reuse current dimensions only:

- trust,
- competence,
- benevolence,
- courage,
- integrity.

Likely emphasis:

```text
shared / preservation resolution
→ benevolence + integrity + trust

honor primary claim
→ competence + integrity/trust as appropriate

keep treasure against recognized claim
→ integrity/trust negative
```

Courage should not increase merely for choosing dialogue.

Use renown sparingly.

---

# 22. No treasure-specific reputation

Do not create:

- archaeology reputation;
- treasure-hunter reputation;
- expedition honor;
- Lost Treasure morality.

Existing relation + settlement reputation are sufficient.

---

# 23. Journal resolution is optional, not blocking

If the exact expedition journal still exists and remains unresolved, the finale may resolve it through existing exact-instance transfer APIs.

If legacy `027` already transferred it:

- preserve that fact;
- do not request it again;
- do not duplicate relation/reputation consequences.

The treasure finale remains completable regardless.

---

# 24. Personal effects remain secondary

Personal effects/evidence from the expedition remain optional narrative content.

Do not add a multi-item transactional hand-in API solely for them.

They may:

- enrich dialogue;
- optionally be returned;
- create small relation consequences if trivial to support.

They do not gate final completion.

---

# 25. Archaeologist claim must be credible, not automatic ownership

The Archaeologist does not automatically own the treasure simply because they initiated the current search.

Dialogue should distinguish:

- research/history contribution;
- current expedition support;
- Player's recovery effort;
- competing interpretation of legitimate ownership.

The choice should be morally/socially ambiguous enough to remain a real decision.

---

# 26. Optional sponsor must have a distinct claim or be omitted

If the former `027` sponsor remains part of the unified story, their claim must have a distinct basis from the Archaeologist.

If current code/story cannot support that distinction cleanly, omit them from the primary treasure-resolution conversation while preserving their identity/history.

Do not crowd the finale with two redundant commercial claims.

---

# 27. Stakeholder death / unavailability

Major NPCs are not immortal.

If one stakeholder is dead/unavailable:

- do not respawn them;
- do not create a clone;
- remove only the affected dialogue/outcome.

The finale must still be completable.

Examples:

- family/contact dead → journal-family option absent;
- Archaeologist dead → another coherent treasure outcome remains;
- optional sponsor dead → no substitute NPC required.

---

# 28. Treasure discovered before finale

If Player already possesses/removed the treasure when `044` begins:

skip redundant “find treasure” gameplay.

Flow becomes:

```text
authoritative treasure history/state known
→ stakeholder confrontation / resolution
```

Do not require reopening an empty chest.

---

# 29. Treasure still in dungeon

If treasure remains in the final container:

- Player physically reaches it after `043`;
- this chapter may include discovering/opening it as its opening stage.

Do not move the treasure directly into a dialogue reward system.

---

# 30. Final social decision follows physical discovery where possible

Preferred normal flow:

```text
open final access
→ physically discover / inspect / recover finalTreasure
→ return to claimant context
→ choose disposition
```

Legacy catch-up may bypass this chronology when world state has already advanced.

---

# 31. Atomicity

A chosen outcome completes only after required physical mutations succeed.

Examples:

- exact item transfer succeeds;
- coin payment succeeds;
- current transfer state is valid.

Do not apply social consequences and mark completion before the required physical mutation succeeds.

For outcomes that are historical/social only because physical provenance is unknowable, commit only the supported quest/social outcome and do not fabricate inventory mutations.

---

# 32. Compensation

For share/claim-honored outcomes, compensation should be meaningful but need not equal raw treasure value.

Use existing:

- coin rewards/transfers;
- relations;
- reputation;
- modest renown;
- future opportunity hooks.

Do not create an appraisal/pricing system solely for this quest.

---

# 33. Final outcomes should differ qualitatively

Avoid reducing endings to different coin numbers.

Differences should involve:

- actual ownership where representable;
- relationships;
- social standing;
- future opportunities;
- historical responsibility.

The finale culminates a long world-driven chain.

---

# 34. No forced moral ranking

Do not label endings good/bad.

Each represents a coherent interest:

- preservation/community;
- recognized claimant;
- Player self-interest.

Consequences emerge through existing world relationships.

---

# 35. No estate ownership in this plan

The dark-forest estate is not a settlement plot.

Current `LandOwnershipRegistry` owns only `settlementId:plotId` entries.

Do not fabricate estate identifiers for it.

Do not add `questEstateOwned`.

Estate rights/deed/property belong in a separate plan if still desirable.

---

# 36. Possible setup for a later estate plan

The finale may produce a narrative/quest outcome that could justify future estate rights, for example:

- claimant relinquishes interest;
- Player retains relevant papers;
- Archaeologist grants recognition/support.

But `044` should not implement actual property ownership.

A later plan decides whether estate ownership is valuable enough to justify extending world ownership beyond settlement plots.

---

# 37. Durable story outcome

Persist broad finale outcome through ordinary quest outcome state, for example conceptually:

```text
treasure_shared
treasure_claim_honored
treasure_kept
```

Actual IDs follow current conventions.

Do not add a separate LostTreasureHistory registry.

---

# 38. World consequences after completion

Completion leaves durable facts:

- finalTreasure remains physically depleted/owned according to real world state;
- journal remains with its real owner;
- claimant relations changed;
- settlement reputation changed;
- finale outcome recorded.

The world does not revert when the quest log closes.

---

# 39. Legacy `027` completed saves

Preserve the prior `027` outcome.

Do not:

- reverse journal transfers;
- remove previous social consequences;
- grant those consequences again.

For this finale:

- prior journal disposition is historical input;
- broader treasure resolution happens only if still meaningful;
- old `keep_journal_and_treasure` state must not pretend the chest remains untouched.

---

# 40. Legacy treasure already gone and untraceable

If old gameplay allowed final loot to be consumed/sold/mixed and current code has no reliable origin trail:

- do not fabricate current ownership;
- do not create debt;
- do not require equivalent assets;
- do not tag ordinary inventory retroactively.

Resolve only:

- what the world can still prove;
- Player's historical/quest choice where persisted;
- stakeholder/social reaction.

The questline must still reach a terminal state.

---

# 41. Quest flow

Preferred normal flow:

```text
Stage 1
enter final section

Stage 2
discover / recover authoritative finalTreasure if still present

Stage 3
return to claimant context
→ hear the primary treasure claim
→ optional expedition-record thread if unresolved

Stage 4
explicit treasure disposition choice

Stage 5
apply supported physical mutation + social consequences
→ complete
```

Do not create a mandatory dedicated journal stage.

Combine stages where current dialogue mechanics make them artificial.

---

# 42. State ownership

```text
WorldGeneratedContainers / dungeon content
→ finalTreasure physical state

Inventory / ItemInstances
→ journal and identity-backed assets

NPC inventories / economy
→ supported physical transfers

QuestManager
→ finale lifecycle + durable outcome

ReputationManager
→ settlement social standing

Quest relations
→ claimant / family relationships

LandOwnershipRegistry
→ untouched by this plan
```

No new treasure-resolution manager.

---

# 43. Persistence

Existing systems should persist:

- container depletion;
- identity-backed item ownership;
- NPC ownership where used;
- relations;
- reputation;
- quest outcome.

Do not separately persist provenance for stackable loot.

Do not separately persist claimant winner if ordinary quest outcome already captures the decision.

---

# 44. Performance

Fully event-driven.

No per-frame:

- finalTreasure checks;
- claimant scans;
- inventory valuation;
- provenance reconstruction.

Resolve relevant state when:

- chapter activates;
- final container is inspected/looted;
- finale dialogue opens;
- outcome commits.

---

# 45. Reuse targets

Verify current `main`, especially:

- `src/quests/lostTreasureExpedition.ts`;
- `src/quests/lostTreasureExpeditionRuntime.ts`;
- `QuestManager`;
- quest outcome/consequence definitions;
- `ReputationManager`;
- exact instance transfer APIs;
- Player↔NPC inventory/coin transfer seams;
- `WorldGeneratedContainers`;
- canonical dungeon `finalTreasure` binding;
- plans 037–043;
- old `027` legacy behavior;
- `src/settlement/landOwnership.ts`;
- persistence/save data;
- `createApp.ts`.

Current code wins.

Add concise JSDoc with `@domain` only for genuinely reusable/public additions.

---

# 46. Non-goals

Do not implement:

- estate ownership;
- estate deed enforcement;
- arbitrary world-land ownership;
- archaeology faction;
- legal courts;
- treasure appraisal;
- provenance ledger for stackable loot;
- generic inheritance;
- generic contract disputes;
- new treasure container;
- second expedition journal;
- replacement finalTreasure.

---

# 47. Automated verification

Cover at least:

## Treasure authority

- same existing `finalTreasure`;
- no duplicate source;
- early loot respected;
- empty legacy treasure does not respawn.

## Provenance guardrail

- no stackable-loot provenance system added;
- untraceable removed loot does not block completion;
- finale never fabricates equivalent replacement assets.

## Stakeholders

- one primary treasure claimant;
- optional sponsor only when narratively distinct;
- family/contact treated as journal/personal-effects stakeholder rather than automatic treasure claimant;
- dead/unavailable stakeholder does not block finale;
- old `027` terminal flow is not offered in parallel.

## Choices

- conscious explicit Player choice;
- physical prerequisites validated where required;
- unsupported physical transfer is not fabricated;
- consequences applied exactly once.

## Journal

- optional unresolved thread only;
- exact instance when physically transferred;
- prior legacy hand-in respected;
- no duplicate journal created.

## Social state

- relation effects once;
- reputation effects once;
- no new reputation dimension.

## Legacy

- old `027` completed outcomes preserved;
- already-looted/consumed/mixed treasure supported;
- no reset of dungeon/world content;
- questline can always reach a terminal outcome.

Manual browser verification remains the User's responsibility.

---

# 48. Completion criteria

The plan is complete when:

1. the existing `finalTreasure` is the only canonical treasure source;
2. Lost Treasure Chronicles supersedes the old `027` terminal narrative;
3. there is one primary treasure claimant rather than duplicate commercial claims;
4. family/contact remains primarily the expedition-record stakeholder;
5. Player receives a bounded set of explicit final choices;
6. physical ownership changes only where current systems can represent it reliably;
7. no provenance ledger is introduced for ordinary stackable loot;
8. journal resolution is optional and does not block the treasure finale;
9. relations and existing reputation dimensions reflect the decision;
10. keeping the actual treasure does not duplicate it as a quest reward;
11. early/legacy looting is authoritative;
12. untraceable consumed/mixed treasure still permits coherent historical/social resolution;
13. dead/unavailable stakeholders do not break completion;
14. no estate ownership is implemented through settlement land ownership;
15. a durable finale outcome is persisted for future dialogue/quests.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
