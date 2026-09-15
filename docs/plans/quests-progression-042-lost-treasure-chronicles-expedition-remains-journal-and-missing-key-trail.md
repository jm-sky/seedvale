# Plan: Lost Treasure Chronicles — expedition remains, journal and missing-key trail

**Created:** 2026-09-15  
**Status:** `planned` 📋  
**Priority:** high · **Effort:** L  
**Depends on:** quests-progression-041, ~~quests-progression-027~~, ~~quests-progression-026~~, ~~world-024~~  
**Domain:** `quests-progression`  
**Type:** `feature`  
**Subdomains:** `quests` `progression`  
**Tags:** `lost-treasure-chronicles` `dungeon` `expedition` `journal` `key-trail` `story-items`  
**Roadmap:** `quests-lost-something-chronicles.md`

## Goal

Implement the sixth chapter of **Lost Treasure Chronicles**:

```text
collapsed access cleared
→ enter canonical dungeon
→ find expedition trail
→ recover and read the physical expedition journal
→ find deeper expedition evidence
→ learn that the key left the dungeon with a survivor
→ reveal a bounded external survivor-site search area
```

This plan ends when the Player knows where to search outside the dungeon for the missing key.

It does **not** implement:

- physical locked-passage mechanics,
- recovery of the key,
- unlocking the final route,
- final treasure resolution,
- land deed,
- final ownership conflict.

---

# 1. `quests-progression-027` is superseded narratively

This plan makes the narrative ownership decision explicit:

> `quests-progression-027-lost-treasure-expedition` is superseded as an independent authored quest and its expedition trail becomes part of Lost Treasure Chronicles.

Reuse its world content and stable bindings rather than creating a second expedition story.

Retire/suppress the old independent `027` offer so the Player cannot receive two contradictory quest flows for the same expedition trail.

Preserve existing world/item/social state.

Do not migrate old `QuestProgress` stage-by-stage into the new chapter.

---

# 2. Canonical expedition invariant

After integration there must be exactly:

```text
one expedition trail
one expedition journal
one finalTreasure
one canonical stakeholder binding
```

Do not duplicate:

- abandoned expedition content,
- leader pack,
- journal,
- deeper evidence,
- finalTreasure,
- sponsor/stakeholder identities.

---

# 3. Reuse `027` world content

Reuse the physical expedition trail already materialized by `027`:

```text
early camp / supplies
→ leader pack with physical expedition journal
→ deeper expedition evidence / personal effects
→ finalTreasure
```

The chapter uses only the trail through the deeper evidence.

The final treasure remains untouched for later Lost Treasure Chronicles plans.

All expedition content remains physical world content that exists independently of quest activation.

---

# 4. Canonical dungeon

Use the canonical dungeon selected by plan 041.

If plan 041 reused the original `027` dungeon, reuse its existing anchor claims directly.

If plan 041 selected another existing compatible dungeon, deterministically rebind the reusable `027` expedition trail through the existing cave-anchor claim mechanism.

Do not create a separate expedition dungeon.

`026` may coexist in the same physical dungeon through disjoint anchor claims.

---

# 5. Existing cave anchor claims remain authoritative

Reuse current `CaveContentReservationRequests.anchorClaims` / cave content policy.

The expedition trail should continue using ordered `storyFind` anchors.

Do not derive narrative ordering from:

- returned-array order,
- raw XYZ distance,
- quest stage order alone.

Use cave-owned depth/chamber semantics already established by `027`.

Do not generalize the reservation mechanism again.

---

# 6. Physical content exists before this quest chapter

The expedition containers/evidence must exist independently of Lost Treasure Chronicles progression.

The Player may already have:

- discovered the dungeon,
- looted the camp,
- taken the journal,
- read the journal,
- looted deeper evidence,
- completed old `027` in a legacy save.

All such state is authoritative.

Never refill or respawn expedition content to make the new chapter linear again.

---

# 7. Abandoned expedition trail

The physical trail should communicate the expedition failure through existing world content.

Preferred sequence:

### Early trace

Abandoned supplies/camp confirm that the expedition reached the dungeon.

### Leader pack

Contains the one physical expedition journal.

### Deeper evidence

Provides the critical additional clue about the survivor/key trail.

Do not add another large document unless current content cannot communicate the necessary fact.

---

# 8. Reuse the exact expedition journal

Reuse the identity-backed journal already introduced by `027`.

Do not create a second Lost Treasure Chronicles copy.

The same physical journal becomes part of the larger storyline.

Inventory / `ItemInstance` ownership remains authoritative.

If the current authored journal text conflicts with Lost Treasure Chronicles, update/reframe its content rather than introducing another journal item.

---

# 9. Journal clue is intentionally incomplete

The journal should establish only the first half of the key mystery:

> one expedition member escaped or left the dungeon carrying the key or access item needed for the deeper route.

The journal must **not** immediately reveal the exact external search destination.

This preserves investigation progression:

```text
journal
→ someone left with key
→ deeper evidence
→ where they probably went
```

Do not let the journal explain the entire chapter in one read.

---

# 10. Deeper expedition evidence completes the clue

A later `storyFind` / existing deeper evidence source should provide the missing geographical context.

Together:

```text
journal
+ deeper evidence
→ bounded survivor-site search area outside dungeon
```

Examples of useful information:

- intended retreat route,
- landmark near the emergency camp,
- last known direction,
- river/road/settlement reference if supported by current world systems.

The exact environmental representation is chosen from existing world-location/remains/camp mechanisms during implementation recon.

Do not invent a new broad remains/camp system solely for this chapter.

---

# 11. External survivor site

The next target is one deterministic **survivor site outside the dungeon**.

Semantics:

```text
stable external world place
→ associated with the expedition survivor
→ bounded search area
→ future physical key source
```

Preferred form is an abandoned survivor camp/remains site because it keeps the investigation world-driven and avoids adding another mandatory major NPC.

However the exact representation must reuse the strongest existing world-location/landmark/remains/camp seam available on current `main`.

Do not hardcode a road/river implementation if current systems do not naturally support it.

---

# 12. Bounded clue, not exact key marker

At the end of this plan the Player should know where to search, but not the exact key pickup coordinate.

Good result:

```text
survivor reached an abandoned site in a known bounded region
```

Bad result:

```text
key is at x=..., z=...
```

Reuse normal `WorldLocation` / `LocationKnowledge` / navigation capabilities where possible.

Do not create quest-only global markers.

---

# 13. Do not implement the physical locked passage yet

Plan 042 does **not** add a new locked door/passage system.

The current shared lock/key contracts from `world-024` primarily concern treasure containers. Extending them to traversal should happen together with actual key recovery/unlocking in the next plan, when the complete interaction contract is known.

This plan only establishes the story/world fact:

> deeper access requires a missing physical key that left the dungeon.

Do not add a temporary quest boolean for the future lock.

---

# 14. Future key identity must remain compatible with shared systems

Although the physical key is not recovered here, the authored history should be deterministic enough that the next plan can bind exactly one physical key to the future access point.

Do not create multiple candidate keys or a temporary story token.

Use `world-024` key/item identity contracts in the next plan where semantically compatible.

---

# 15. Do not place the missing key inside the dungeon

The important story structure is:

```text
dungeon
→ journal/evidence
→ survivor left with key
→ external world investigation
→ return later
```

Therefore the future key must not be:

- in another dungeon chest,
- next to the future lock,
- dropped by dungeon fauna.

---

# 16. `026` remains a separate side story

`quests-progression-026` keeps ownership of its own:

- bandit caches,
- ledger,
- marked valuables,
- claimant/property story.

Do not reinterpret those items as Lost Treasure Chronicles expedition evidence.

Sharing the same dungeon and cave-anchor infrastructure is allowed when claims remain disjoint.

---

# 17. `027` stakeholder binding is preserved

The existing deterministic sponsor and second-stakeholder identities remain the canonical stakeholder binding for the expedition history unless a later plan explicitly changes their role.

Do not select a second independent sponsor/family pair for Lost Treasure Chronicles.

This plan does not yet implement their final dialogue/outcomes.

It only preserves their identities for later reuse.

---

# 18. Legacy `027` — completed saves

If an old save already completed `027`:

- preserve container depletion,
- preserve journal ownership or prior hand-in,
- preserve stakeholder relations/reputation outcomes,
- preserve finalTreasure depletion if already looted,
- do not reconstruct or respawn expedition content.

Lost Treasure Chronicles must catch up from actual remaining world/item/social state.

Do not reverse an earlier journal hand-in.

---

# 19. Legacy `027` — active/offered saves

For old saves where `027` is offered/active:

```text
old 027 quest binding
→ retire

world/item/social state
→ preserve
```

Do not migrate old quest stages into Lost Treasure Chronicles.

The new chapter derives progress from authoritative physical state.

---

# 20. Early `finalTreasure` depletion

A legacy save may already have looted the `027` `finalTreasure`.

That state is authoritative.

Do not respawn or replace the treasure.

Later Lost Treasure Chronicles plans must support the narrative case:

```text
final treasure already taken
```

and resolve ownership/stakeholder consequences from existing world/inventory/history rather than assuming the treasure still waits in the dungeon.

Plan 042 only records this as a hard compatibility invariant; it does not resolve the final ownership story yet.

---

# 21. Quest flow

Preferred chapter flow:

```text
Stage 1
enter / investigate canonical dungeon expedition trail

Stage 2
recover/read expedition journal
→ learn that one member left carrying the key

Stage 3
recover/read deeper expedition evidence
→ identify bounded survivor-site search area

Stage 4
reveal/record survivor-site knowledge
→ complete
```

Stages should catch up automatically when their authoritative physical state was satisfied earlier.

Do not add artificial dialogue/report stages unless needed by existing quest lifecycle.

---

# 22. Quest objectives

Reuse existing objective vocabulary where possible:

- `loot_world_container`,
- `read_item`,
- location/world-state observation.

Do not add a journal-specific objective.

Do not add a future lock/unlock objective in this plan.

If survivor-site knowledge can be granted through existing stage effects / LocationKnowledge integration, reuse that rather than creating quest-only discovery state.

---

# 23. Early-state catch-up

Handle at least:

- journal already owned,
- journal already read,
- journal already transferred to old `027` stakeholder,
- deeper evidence already looted,
- dungeon already explored,
- old `027` completed,
- finalTreasure already looted.

Quest progression must not depend only on future events.

Use current physical/social state predicates on activation/restore where needed.

---

# 24. Story-item ownership

```text
expedition journal
→ ItemInstance / Inventory / NPC inventory if already handed in

deeper evidence
→ WorldGeneratedContainers / physical item ownership

future key
→ future physical ItemInstance

survivor-site knowledge
→ LocationKnowledge

QuestManager
→ narrative lifecycle only
```

Do not duplicate these facts into a Lost Treasure Chronicles state registry.

---

# 25. State ownership

```text
cave world / anchor claims
→ expedition content placement

WorldGeneratedContainers
→ expedition packs / deeper evidence / finalTreasure

Inventory / ItemInstances
→ expedition journal

027 stakeholder binding
→ canonical sponsor / second stakeholder identities

LocationKnowledge
→ survivor-site search knowledge

QuestManager
→ chapter lifecycle only

026
→ independent bandit/property side story
```

---

# 26. Persistence

Reuse existing persistence boundaries.

Save/load must preserve:

- expedition container contents,
- journal location/ownership,
- deeper evidence state,
- stakeholder state from legacy `027`,
- survivor-site location knowledge,
- quest progress.

Do not persist deterministic cave/anchor/stakeholder bindings if current reconstruction is stable.

Do not reseed the journal through `initialInstances` when saved container/inventory state already exists.

---

# 27. Performance

No continuous dungeon/world scans.

Use stable:

- cave IDs,
- anchor IDs,
- container IDs,
- item instance IDs,
- location IDs.

QuestManager should observe relevant events/state rather than polling all dungeon content each frame.

---

# 28. Reuse targets

Verify current `main`, especially:

- `docs/plans/quests-progression-027-lost-treasure-expedition.md`;
- its implementation notes;
- `src/quests/lostTreasureExpedition.ts`;
- `src/quests/lostTreasureExpeditionRuntime.ts`;
- `src/quests/dungeonBanditTreasure.ts`;
- cave anchor/content policy modules;
- `src/world/worldGeneratedContainers.ts`;
- story-item read pipeline;
- `LocationKnowledge` / navigation;
- `QuestManager`;
- `src/app/createApp.ts`;
- `src/app/worldBundle.ts`;
- persistence/save data.

Current code wins over older planning assumptions.

Add concise JSDoc with `@domain` only for important reusable/public additions.

---

# 29. Non-goals

Do not implement:

- physical locked door/passage,
- key recovery,
- key use/unlock,
- final treasure resolution,
- journal final hand-in decisions,
- land deed,
- property ownership,
- generic lockpicking,
- new dungeon generation,
- another expedition NPC network.

---

# 30. Automated verification

Cover at least:

## `027` takeover

- old independent `027` offer is retired/suppressed;
- existing expedition trail is reused;
- same journal identity is reused;
- same finalTreasure remains canonical;
- same stakeholder binding remains canonical.

## Expedition trail

- ordered anchors remain stable;
- early-looted containers catch up;
- journal does not respawn;
- deeper evidence does not refill.

## Investigation pacing

- journal reveals that the key left with a survivor but not the final search destination;
- deeper evidence supplies the missing geographical clue;
- combined evidence reveals one bounded survivor-site search area.

## Survivor site

- deterministic stable external site binding;
- no exact key pickup marker is revealed;
- knowledge persists through save/load.

## Legacy state

- completed `027` saves preserve prior journal/stakeholder/finalTreasure state;
- active/offered `027` retires without world reset;
- journal already handed to an NPC is not recreated;
- previously looted finalTreasure stays depleted.

Manual browser verification remains the User's responsibility.

---

# 31. Completion criteria

The plan is complete when:

1. `027` is superseded as an independent authored quest;
2. exactly one canonical expedition trail remains;
3. exactly one expedition journal remains;
4. exactly one `finalTreasure` remains;
5. exactly one canonical expedition stakeholder binding remains;
6. the journal establishes that a survivor left with the missing key;
7. deeper evidence reveals one bounded external survivor-site search area;
8. no physical locked-passage system is added yet;
9. `026` remains an independent compatible side story;
10. legacy `027` world/item/social state is preserved;
11. already-looted final treasure is treated as authoritative history;
12. the next plan can implement survivor-site key recovery and physical access unlocking without inventing parallel story state.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
