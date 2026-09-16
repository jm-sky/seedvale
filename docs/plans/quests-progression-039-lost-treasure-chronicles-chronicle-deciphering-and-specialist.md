# Plan: Lost Treasure Chronicles — chronicle deciphering and specialist

**Created:** 2026-09-15  
**Status:** `verification needed` 🔍  
**Priority:** high · **Effort:** M  
**Depends on:** quests-progression-038, quests-progression-037  
**Domain:** `quests-progression`  
**Type:** `feature`  
**Subdomains:** `quests` `relationships` `progression`  
**Tags:** `lost-treasure-chronicles` `specialist` `chronicle` `deciphering` `services` `location-knowledge`  
**Roadmap:** `quests-lost-something-chronicles.md`
**Model:** Opus, Sonnet

## Goal

Implement the third chapter of **Lost Treasure Chronicles**:

```text
physical encoded chronicle
→ return to archaeologist
→ chronicle cannot be fully interpreted
→ guaranteed specialist
→ pay OR perform one concrete favour
→ chronicle deciphered
→ bounded dark-forest estate search area revealed
```

The plan ends when the Player knows the bounded area where the old estate should be searched for.

It does **not** create or materialize the estate itself.

Do not implement yet:

- estate world content,
- alpha bear,
- physical treasure map,
- estate exploration,
- dungeon,
- final treasure.

---

## 1. Entry condition

This chapter starts from authoritative state landed by `quests-progression-038`.

The Player must own the exact encoded chronicle item instance.

Do not unlock the chapter merely because quest 038 is complete if the physical chronicle is no longer owned by the Player.

The physical story item remains authoritative.

If the Player acquired the chronicle before the expected dialogue order, the chapter must catch up from actual item ownership.

---

## 2. Return to the archaeologist

The Player returns to the authored archaeologist established by plan 038.

The archaeologist:

- recognizes the chronicle,
- confirms its authenticity,
- can understand part of it,
- cannot reliably decipher the encoded/archaic section containing the important location clue.

This keeps the roles distinct:

```text
archaeologist
→ historical context / sponsor

specialist
→ old script / cipher / archival expertise
```

Do not make one NPC perform every story function merely because that is easier to implement.

The archaeologist directs the Player to one specific specialist.

---

## 3. Chronicle remains one physical item

Reuse the exact identity-backed chronicle item created by plan 038.

Do not replace the document with:

```text
decodedChronicle = true
```

and do not create separate `encoded_chronicle` / `decoded_chronicle` physical copies unless current item architecture already requires item transformation.

Preferred V1:

```text
same chronicle ItemInstance
+
normal quest outcome
+
LocationKnowledge gained from deciphering
```

The chronicle remains the same physical object before and after somebody understands it.

No additional per-item decoded state is required unless implementation recon demonstrates an existing reusable item-knowledge pattern that materially benefits this story.

---

## 4. Guaranteed specialist

Introduce the third major authored NPC of Lost Treasure Chronicles.

The specialist is a guaranteed normal inhabitant of the world.

Possible narrative identities include:

- historian,
- scribe,
- antiquarian,
- old-language expert,
- retired clerk.

Do not add a new simulation profession solely because story dialogue calls this NPC a scholar.

Use an existing suitable role if settlement generation requires one.

### Placement

Prefer a different settlement or at least a clearly different social context from the elder and archaeologist when that fits normal world generation.

However, **do not require a third settlement**.

The specialist may live in the same larger settlement as the archaeologist if that is the cleanest result from the existing authored-resident/worldgen mechanisms.

Do not distort settlement generation merely to force additional travel.

---

## 5. Authored-resident reuse

Reuse the smallest guaranteed-resident seam actually landed by plans 037 and 038.

Do not build a `StoryNpcManager` or broad narrative-character framework for this plan.

If implementation of the first two plans naturally produced a small reusable authored-resident spec, reuse it.

Follow actual current code rather than reproducing planned abstractions.

Stable `NpcId` remains authoritative identity.

---

## 6. Specialist interaction

The specialist examines the chronicle and confirms that the important passage can be deciphered.

Do not introduce a mandatory real-time waiting period.

Unless a useful reusable delayed-service mechanism already exists, deciphering can complete immediately once the Player satisfies the specialist's requirement.

The gameplay decision is **how the Player obtains the specialist's help**, not how long a timer runs.

---

## 7. Solution A — pay for deciphering

The specialist offers to do the work for a meaningful coin fee.

The payment must transfer real money ownership.

Conceptually:

```text
Player-owned coins
→ atomic transfer
→ appropriate NPC/household-owned inventory/economy owner
→ service condition satisfied
```

Implementation recon must determine the correct destination owner from current NPC trading/payment architecture.

Do **not** assume in the plan that `personalInventory` is always the correct destination.

Reuse the existing real Player → NPC/household coin-transfer patterns where appropriate.

### Guardrail

Do not generalize a service marketplace or generic `ServiceManager` if one atomic inventory transfer during a dialogue decision is sufficient.

No:

```text
QuestPaymentManager
DecoderServiceManager
specialistPaid: boolean
```

The quest outcome/progress is sufficient to record that this route was completed; money ownership stays with inventory/economy systems.

### Price

The amount should be meaningful but affordable for the intended progression point.

Calibrate against the current economy during implementation recon.

Result direction:

```text
specialist relation: small positive / neutral
public settlement reputation: normally unchanged
```

A private professional transaction is not automatically a public heroic deed.

---

## 8. Solution B — specialist's missing reference document

The alternative route is one specific favour:

> the specialist needs a missing historical reference document required to interpret the chronicle's old terminology / cipher notation.

The reference document was previously lent, misplaced or left with another real inhabitant / nearby location.

Keep this favour deliberately small.

Preferred structure:

```text
specialist identifies missing reference
→ Player recovers one physical document
→ returns it to specialist
→ specialist performs deciphering
```

The document should use ordinary physical item/container/world ownership where practical.

Prefer:

- a real story/reference item,
- a real container or NPC ownership source,
- normal pickup/transfer semantics.

Do not implement another treasure hunt, dungeon or large investigation inside this favour.

Target complexity: 1–2 stages.

Result direction:

```text
no coin fee
specialist relation +2
benevolence and/or competence: small positive if socially justified
```

Do not add a new subsystem solely for the favour.

---

## 9. Existing social standing

Existing relation/reputation may influence the specialist's terms if current dialogue/prerequisite mechanisms make this cheap and readable.

Preferred effect:

- reduced fee,
- smaller favour requirement,
- better dialogue.

Do not let reputation automatically skip the entire chapter.

This is optional polish, not a prerequisite for completing the plan.

Do not introduce scholar-specific reputation.

---

## 10. Conscious path choice

When both routes are available, the Player must consciously choose:

```text
pay
OR
recover reference document
```

Do not auto-select:

- payment because the Player has enough coins,
- favour because it is cheaper,
- first array entry.

Different solutions have different social consequences, so the choice must remain explicit.

Reuse existing quest dialogue-choice mechanisms.

---

## 11. Payment ownership

Use current code as the source of truth for where paid coins belong.

Existing systems already demonstrate real coin transfer rather than quest-only counters.

The implementation should reuse the smallest appropriate transfer primitive.

Requirements:

- exact amount removed from the Player,
- ownership moves to an existing authoritative NPC/household/economy owner,
- insufficient funds cause no partial mutation,
- payment cannot be charged twice,
- save/load preserves the resulting ownership.

Do not create a second wallet.

---

## 12. Reference-document ownership

The favour document is a real physical item or equivalent existing world-owned document representation.

Before recovery it belongs to its actual world source.

After recovery it belongs to the Player.

When handed to the specialist, transfer ownership through existing item mechanisms where possible.

Do not model recovery solely as:

```text
questProgress.hasReference = true
```

if a physical document exists in the world.

The quest observes authoritative ownership/state.

---

## 13. Chronicle custody

Preferred V1:

> the Player retains the chronicle while the specialist examines it.

There is no need to simulate temporary custody unless current interaction conventions already support it cleanly and it adds meaningful gameplay.

If physical transfer is required:

```text
Player
→ exact same chronicle ItemInstance
→ specialist
→ decipher
→ exact same ItemInstance returned
```

Never destroy one copy and grant a replacement.

---

## 14. Deciphered information

The decoded passage establishes at least:

1. the original expedition deliberately separated the treasure map from the chronicle;
2. the map was left at an old estate/manor;
3. the estate lies within or near a known dark-forest region;
4. surviving directions narrow the estate to a bounded search area.

Optional flavour may explain:

- who owned the estate,
- why the documents were separated,
- why the expedition never returned.

Do not reveal:

- exact map position inside the estate,
- exact future dungeon location,
- final treasure chamber.

---

## 15. Bounded estate search area

The output of this plan is **knowledge of a bounded search area**, not the estate world object itself.

Desired state:

```text
known:
  dark-forest region
  approximate estate search area

unknown:
  exact estate placement / interactable
  treasure-map position
```

Reuse existing `LocationKnowledge` / navigation mechanisms where possible.

Possible representation:

- an existing parent dark-forest region/location,
- a bounded search-area `WorldLocation` if the location system already supports this cleanly,
- nearby landmark/road/river knowledge sufficient to constrain the area.

### Hard boundary

Do **not** implement the estate itself in this plan.

No estate props, buildings, alpha bear, containers or map spawn belong here.

The next plan owns actual estate binding/materialization and exploration.

Do not create an exact quest-only waypoint coordinate merely to shortcut that future work.

---

## 16. Historical truth exists independently of dialogue

The deciphered meaning must be deterministic authored/story binding.

Do not choose the estate area randomly when the specialist dialogue fires.

Conceptually:

```text
world/story binding already determines historical area
→ specialist reveals that information
→ LocationKnowledge records what Player now knows
```

not:

```text
specialist dialogue
→ generates estate truth
```

This preserves early/off-screen world continuity and keeps the quest as an observer/revealer of world facts.

---

## 17. Quest structure

Use the smallest coherent stage structure:

```text
Stage 1
archaeologist confirms chronicle and points to specialist

Stage 2
specialist interaction + explicit route choice

Stage 3
payment OR reference-document favour completes
→ specialist deciphers chronicle

Stage 4
bounded dark-forest search area revealed
→ complete
```

Stages 3 and 4 may resolve from the same final dialogue interaction if no gameplay occurs between deciphering and reveal.

Do not add artificial stages merely to lengthen the journal.

---

## 18. Archaeologist relationship

The archaeologist may acknowledge how the chronicle was recovered in plan 038.

Keep this mostly to dialogue and modest relation changes.

Do not add a large outcome matrix for:

- cemetery-first,
- ruins-first,
- legal grave route,
- exposed grave robbery,
- early discovery,
- wrong-site evidence order.

Previous world consequences already exist in their authoritative systems.

Avoid paying the same moral/social event twice.

---

## 19. Specialist relationship

Use ordinary Player↔NPC relation.

Suggested direction:

```text
paid professional service → +1 relation
reference-document favour → +2 relation
```

Exact values should respect current relation thresholds after implementation recon.

This relationship should remain ordinary world state because the specialist may plausibly matter later for:

- historical artifacts,
- deed interpretation,
- future discoveries.

Do not add `specialistAffinity` or equivalent story-local state.

---

## 20. Reputation consequences

Keep public reputation effects modest and plausible.

### Payment route

Normally none.

### Reference-document route

A small `benevolence` and/or `competence` gain is acceptable only if the help would plausibly be socially known.

Do not award courage.

Do not create new reputation dimensions.

---

## 21. Catch-up and sequence robustness

Handle at least:

- Player already owns the chronicle before talking to archaeologist;
- Player already knows the specialist from unrelated gameplay;
- Player already visited the specialist's settlement;
- Player already owns the reference document because it was obtainable independently;
- Player has enough coins before the quest begins;
- Player has relevant pre-existing relation/reputation.

Do not require repeating authoritative world actions solely because a quest stage became active later.

If the reference document can exist independently before the quest, the quest should catch up from actual ownership/world state.

---

## 22. State ownership

```text
settlement generation
→ owns specialist as ordinary resident

Player/NPC/household inventory systems
→ own coins and physical documents

Player Inventory / ItemInstances
→ own physical chronicle

QuestManager
→ owns chapter lifecycle/outcomes and Player↔NPC relation

ReputationManager
→ owns settlement reputation

LocationKnowledge
→ owns revealed dark-forest search-area knowledge
```

There is no:

```text
ChronicleDecoderState
LostTreasureKnowledgeState
ServicePaymentState
```

Quest code coordinates existing state; it does not become owner of money, items or world knowledge.

---

## 23. Collision guardrails

Do not overlap this chapter with:

- the dark-forest treasure-map recovery content from `quests-progression-009`,
- the actual Lost Treasure Chronicles estate/alpha-bear chapter,
- generic merchant inventory UI unless normal trade genuinely fits the chosen transaction,
- books/skill-book knowledge unless their existing mechanism is directly reusable without semantic distortion.

The specialist sells a **service**, not an inventory product.

Do not put `decoded chronicle` into merchant stock.

---

## 24. Performance

All work is event-driven:

- dialogue interaction,
- inventory transfer,
- favour completion,
- item ownership observation,
- location reveal.

Do not add per-frame story scans.

Use existing quest/world catch-up hooks and normal interaction-time checks.

---

## 25. Persistence

Persist through existing owners only:

- quest progress/outcomes,
- Player↔NPC relations,
- reputation,
- inventory/item-instance ownership,
- location knowledge.

Save/load must not:

- charge the fee twice,
- duplicate the reference document,
- duplicate/replace the chronicle,
- repeat relation/reputation consequences,
- lose the revealed search area,
- allow repeated deciphering for repeated rewards.

---

## 26. Lifecycle behaviour

Do not make the specialist immortal.

If the specialist dies before deciphering, do not silently respawn or recreate them through quest code.

A substitute-specialist/succession mechanism is outside this plan unless one already naturally exists in the implemented world systems.

Likewise, archaeologist death must not duplicate authored story residents.

The implementation must at minimum avoid corrupting or silently resetting quest state in these lifecycle cases.

---

## 27. Reuse targets

Verify current `main` before implementation, especially:

- `docs/plans/quests-progression-037-lost-treasure-chronicles-elder-trust-foundation.md`;
- `docs/plans/quests-progression-038-lost-treasure-chronicles-archaeologist-and-chronicle-search.md`;
- actual authored-resident implementation landed by 037/038;
- `src/quests/quests.ts`;
- `src/quests/QuestManager.ts`;
- `src/items/itemInstances.ts`;
- inventory ownership/transfer APIs;
- `src/app/actions/workContractPayment.ts` and current Player→NPC payment patterns;
- current generic NPC-owned goods / trading code where relevant;
- `src/reputation/ReputationManager.ts`;
- world-location / `LocationKnowledge` / navigation code;
- `src/app/createApp.ts`.

Follow the actual landed APIs from 037/038 rather than recreating planned contracts.

Add concise JSDoc with appropriate `@domain` tags only for genuinely reusable/public additions.

---

## 28. Non-goals

Do not implement:

- estate generation/materialization,
- dark-forest estate exploration,
- alpha bear,
- physical treasure map,
- dungeon location,
- collapsed passage,
- key hunt,
- final treasure,
- land deed,
- generic cryptography minigame,
- generic service marketplace,
- new scholar profession,
- global delayed-service scheduler,
- new reputation dimension,
- story-specific knowledge registry.

---

## 29. Automated verification

Cover at least:

### Entry

- exact chronicle ownership enables the chapter;
- completed plan 038 without physical ownership is not treated as possession;
- early chronicle acquisition catches up correctly.

### Archaeologist

- correct stable archaeologist handles the continuation;
- dialogue points to the intended specialist;
- no duplicate authored NPC is created.

### Specialist

- guaranteed specialist has stable identity;
- normal settlement/family generation owns the NPC;
- same world reconstructs the same story binding;
- no unnecessary third-settlement requirement exists.

### Paid route

- requires sufficient real coins;
- exact amount transfers atomically to the correct authoritative owner;
- insufficient balance mutates nothing;
- payment cannot occur twice;
- no generic service manager is required when direct transfer suffices.

### Reference-document route

- one concrete reference item/source exists;
- early ownership catches up correctly if possible;
- returning/transferring the document uses normal item ownership;
- completing the favour enables deciphering;
- favour rewards apply once.

### Choice

- when both routes are available, Player chooses explicitly;
- no array-order or affordability auto-selection occurs.

### Chronicle

- same exact physical instance remains authoritative;
- deciphering does not clone/replace it unnecessarily.

### Location knowledge

- deciphering reveals only the bounded dark-forest search area;
- reveal persists through save/load;
- actual estate world content is not created by this plan;
- exact treasure-map location remains unknown.

### Consequences

- specialist relation differs coherently by route;
- payment does not incorrectly grant public reputation;
- consequences do not replay after load.

Manual browser verification remains the User's responsibility.

---

## 30. Completion criteria

The plan is complete when:

1. the physical chronicle can be brought to the archaeologist;
2. the archaeologist directs the Player to one guaranteed specialist;
3. the specialist is a normal world resident without requiring an artificial third settlement;
4. the Player can consciously choose between real coin payment and one concrete reference-document favour;
5. payment moves real money ownership through existing inventory/economy systems;
6. the favour uses one real physical/world-owned document rather than a hidden story boolean;
7. the chronicle remains one authoritative physical item;
8. deciphering reveals deterministic authored historical information;
9. `LocationKnowledge` gains a bounded dark-forest estate search area;
10. the actual estate is **not** implemented/materialized by this plan;
11. relation/reputation outcomes remain inside existing shared systems;
12. no generic service/decoder/story-knowledge framework is introduced;
13. the next plan can begin directly with locating and materializing/exploring the estate.

> **Zrób git commit i push do main, rebase jeżeli trzeba**