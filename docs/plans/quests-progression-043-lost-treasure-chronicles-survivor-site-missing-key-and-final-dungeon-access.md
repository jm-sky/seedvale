# Plan: Lost Treasure Chronicles — survivor site, missing key and final dungeon access

**Created:** 2026-09-15  
**Status:** `planned` 📋  
**Priority:** high · **Effort:** L  
**Depends on:** quests-progression-042, quests-progression-041, ~~world-024~~  
**Domain:** `quests-progression`  
**Type:** `feature`  
**Subdomains:** `quests` `progression`  
**Tags:** `lost-treasure-chronicles` `survivor-site` `key` `dungeon` `locked-access` `world-state`  
**Roadmap:** `quests-lost-something-chronicles.md`
**Model:** Opus, Sonnet

## Goal

Implement the seventh chapter of **Lost Treasure Chronicles**:

```text
expedition evidence
→ bounded survivor-site search area
→ locate survivor's final shelter/remains
→ recover one physical dungeon key
→ return to canonical dungeon
→ unlock persistent final access
→ final treasure section becomes reachable
```

This plan ends when the final dungeon route is permanently unlocked.

It does **not** implement:

- final treasure ownership decision,
- land deed,
- property acquisition,
- archaeologist/stakeholder final conflict.

---

# 1. One canonical missing key

There must be exactly one physical key for this Lost Treasure Chronicles access.

Invariant:

```text
one canonical dungeon
one final-access identity
one required key instance
one survivor-site key source
```

Do not create:

- quest boolean key possession,
- duplicate key copies,
- temporary narrative key,
- replacement key after loss.

Inventory ownership of the exact `ItemInstance` is authoritative.

---

# 2. Reuse `world-024` key identity semantics

Reuse the strongest existing contracts from `world-024`:

- stable deterministic `requiredKeyId`,
- exact `ItemInstance` matching,
- physical key ownership,
- deterministic one-time placement principles.

Current treasure gameplay resolves locks through an exact required key instance rather than generic `key` possession.

Use the same principle for dungeon access.

Do not use:

```text
inventory.has('key')
```

---

# 3. Key identity belongs to access, not to the quest

The physical key identity must derive from the stable final-access identity.

Conceptually:

```text
accessId
→ requiredKeyInstanceId
```

Lost Treasure Chronicles binds narrative meaning to that access.

The access/key contract itself must not know about quest state.

This allows future world/NPC systems to reason about the same access without importing Lost Treasure Chronicles logic.

---

# 4. Reuse or extend the world-access mutation seam from plan 041

Plan 041 introduces the persistent world-owned mutation needed for the collapsed access.

Before adding any new persistence set in this plan:

1. inspect the implemented 041 contract;
2. reuse or extend it if a cleared/unlocked world-access concept can remain semantically coherent;
3. create a distinct persisted mutation only if physical collapse clearance and keyed access genuinely require different ownership/lifecycle semantics.

Do **not** automatically introduce parallel state such as:

```text
clearedBlockageIds
+
unlockedWorldAccessIds
```

when one small shared world-access mutation contract can represent both safely.

Current `unlockedTreasureContainerIds` remains container-specific and must not be reused for dungeon access.

---

# 5. Small reusable keyed-access contract

Add or extend the smallest world-owned contract needed for key-gated traversal.

Conceptually:

```ts
WorldAccess {
  id
  sourcePlaceId
  requiredKeyId
  resolver/materialization binding
}
```

The access definition should not duplicate cave geometry coordinates when the cave layout/anchor system already owns them.

The cave/world resolver remains authoritative for physical placement.

Mutable semantics:

```text
locked
→ validate exact key
→ unlocked
→ permanently traversable
```

Do not build a broad doors/security framework solely for this chapter.

---

# 6. World ownership

The final access belongs to the cave/world.

QuestManager does not own:

```text
doorUnlocked
hasDungeonKey
```

Quest state only observes:

- key recovered,
- access unlocked.

The world-access system owns actual traversal state.

---

# 7. Physical traversal

Locked state must genuinely block passage.

Unlocked state must:

- update the physical obstacle,
- update collision/traversal,
- survive save/load,
- survive world rebuild.

Do not use an invisible quest-stage gate.

Do not complete progression while collision remains closed.

---

# 8. Key consumption policy

Preferred behaviour:

> unlocking validates the exact key but does not consume it.

This matches an ordinary reusable metal key more naturally than deleting it.

Persistent unlocked state prevents repeated gating.

If the landed shared key/access architecture establishes a different generic rule, follow that architecture and document the decision in implementation notes.

Do not introduce key durability.

---

# 9. Survivor-site narrative

The expedition member who escaped the dungeon carried the final-access key.

They did not reach safety.

The deeper evidence from plan 042 leads to their final temporary shelter/remains outside the dungeon.

Narrative truth:

```text
escaped expedition member
→ carried key
→ reached temporary shelter
→ died/disappeared there
→ belongings remain
```

This is deterministic world/story history, not randomly generated on quest activation.

---

# 10. Survivor site does not require a new global location kind

Do not add global `WorldLocationKind` values such as:

```text
camp
remains
survivorSite
```

solely for this chapter.

Current global location taxonomy already includes reusable world places such as `ruins`.

Prefer the smallest existing place representation that can host the survivor clue.

---

# 11. Survivor site may be a stable authored anchor inside an existing place

The survivor shelter/remains does not need to become its own first-class `WorldLocation` if plan 042's bounded search-area knowledge already provides navigation.

Preferred shape:

```text
existing deterministic ruins / suitable world place
→ stable survivor-site anchor inside that place
→ pack/remains attached to anchor
```

The surrounding place provides navigation/discovery.

The survivor anchor provides physical story content.

Do not broaden global location semantics when a stable local authored anchor is sufficient.

---

# 12. Do not reuse the dark-forest estate

The survivor site must be a different world place from the Stage 4 estate.

Invariant:

```text
estate site ≠ survivor host place
```

Reserve/exclude already claimed Lost Treasure Chronicles places when selecting the host.

---

# 13. Deterministic survivor-site binding

Select the survivor host place and local anchor deterministically.

Requirements:

- stable host identity,
- sensible distance from canonical dungeon,
- plausible route from dungeon,
- no collision with reserved authored sites,
- bounded candidate search,
- no loaded-chunk dependency,
- no `Math.random()`.

If no ideal candidate exists, use a deterministic bounded fallback consistent with existing authored-world placement rules.

Do not scan the entire world indefinitely.

---

# 14. Survivor-site clue

Plan 042 reveals a bounded external search area.

Plan 043 resolves that knowledge into exploration:

```text
known survivor search region
→ explore host place
→ discover survivor anchor
→ locate belongings/remains
```

Do not immediately reveal the exact key position.

Reuse normal location-knowledge/navigation systems for the surrounding area where possible.

---

# 15. Physical key source

The key must exist physically at the survivor site before quest activation.

Preferred source:

> one small persistent world-owned survivor pack/container attached to the stable survivor anchor.

Use existing `WorldGeneratedContainers` and `initialInstances` where they fit.

Contents may include:

- exact final-access key instance,
- small personal effects/supplies.

Do not create a quest-specific pickup manager.

---

# 16. Key instance identity

Use one deterministic instance ID derived from stable access identity.

Conceptually:

```text
item:world-access-key:<accessId>
```

Actual naming must follow landed item-instance conventions.

The same `requiredKeyId` must be referenced by:

- survivor pack initialization,
- final-access definition.

No mapping table or duplicate identity.

---

# 17. Source ownership lifecycle

Before recovery:

```text
survivor pack
→ owns key instance
```

After recovery:

```text
Player inventory
→ owns same key instance
```

After unlock:

```text
Player may still own same key
+
world access = unlocked
```

Saved container state must prevent reseeding the key.

---

# 18. Early key recovery

If the Player finds the survivor site and takes the key before plan 042/043 formally activates:

- key remains owned,
- no second key appears,
- later quest catches up.

Do not require revisiting the source.

---

# 19. Early access unlock

If the Player obtains the exact key and reaches the dungeon early:

- normal world interaction may unlock the access,
- unlocked state persists,
- later quest recognizes it.

Do not require quest-stage activation before the lock works.

World state remains independent of quest lifecycle.

---

# 20. Return journey matters

The intended structure is:

```text
dungeon
→ evidence
→ leave dungeon
→ survivor site
→ key
→ return to dungeon
```

Do not teleport the Player or auto-unlock the passage on key pickup.

The physical return is part of the expedition.

---

# 21. Interaction at final access

Without the exact key:

```text
locked
→ clear feedback
→ no mutation
```

With the exact key:

```text
validate exact key instance
→ unlock world access
→ persist mutation
→ update traversal
```

Reuse normal interaction/action conventions.

Do not perform inventory/world mutation inside QuestManager.

---

# 22. No forced-entry alternative in V1

Do not add:

- lockpicking,
- smashing,
- explosives,
- alternate tunnel,
- skill bypass

solely for this chapter.

Container forced-entry mechanics must not automatically make keyed dungeon access destructible.

V1 has one clear physical-key route.

---

# 23. Final access and final treasure remain distinct

```text
final access
→ grants traversal into final section

finalTreasure
→ existing world-owned treasure content
```

Do not turn the existing final treasure container itself into the access gate unless current code already models it that way.

The missing key is primarily about reaching the final section.

---

# 24. Final treasure remains untouched

This plan opens access but does not resolve treasure ownership.

Do not:

- auto-loot it,
- grant quest rewards from it,
- move it,
- reseed it,
- alter stakeholder outcomes.

The next plan handles final treasure consequences and ownership/deed progression.

---

# 25. Already-looted final treasure

Legacy saves may already have the `027` `finalTreasure` consumed.

That state remains authoritative.

If the treasure is already gone:

- access can still be unlocked,
- this chapter can still complete,
- the next plan must support `treasure already taken` as world history.

Do not respawn treasure to restore intended chronology.

---

# 26. Survivor-site incidental content

Keep survivor-site content small.

Possible contents:

- key,
- one personal effect,
- minor supplies.

Do not turn the survivor site into another treasure dungeon or parallel major quest location.

---

# 27. Quest flow

Preferred stages:

```text
Stage 1
travel to bounded survivor search area

Stage 2
find survivor anchor / shelter

Stage 3
recover exact physical key

Stage 4
return to canonical dungeon

Stage 5
unlock final access
→ complete
```

Collapse stages automatically when authoritative world state already satisfies them.

---

# 28. Quest observation

Prefer existing objective/event vocabulary.

Potential observations:

- relevant location/area discovered,
- exact key instance owned,
- world access unlocked.

If no generic access-unlocked predicate/event exists after plan 041, add the narrowest reusable observation seam.

QuestManager must not own the unlock.

---

# 29. `world-024` reuse boundary

Reuse:

- stable key identity principles,
- exact-instance matching,
- deterministic placement principles,
- one-time persistence semantics.

Do not reuse blindly:

- `TreasureSiteDefinition`,
- `unlockedTreasureContainerIds`,
- container-only action code.

The conceptual key mechanics are shared; state ownership remains correct for world access.

---

# 30. Persistence

Persist through existing/shared owners:

- survivor pack mutable contents,
- key ownership through normal item/container persistence,
- final-access mutation through the 041 world-access seam or its coherent extension,
- location knowledge,
- quest lifecycle.

Do not persist:

- deterministic survivor-site binding,
- deterministic key/access identity,
- deterministic access placement,

unless current reconstruction proves unsafe.

---

# 31. Save compatibility

Handle saves where:

- survivor host place already discovered,
- key already obtained,
- final access already effectively traversable through legacy content,
- final treasure already looted.

Hard rule:

> if legacy state proves the Player has already reached or consumed content beyond the new final-access gate, treat that access as already open.

Do not trap legacy Players behind a newly introduced lock.

Do not reset deeper dungeon content.

---

# 32. State ownership

```text
world location / ruins systems
→ survivor host place

authored survivor-site binding
→ local stable anchor

WorldGeneratedContainers
→ survivor pack

Inventory / ItemInstances
→ exact key ownership

cave/world-access system from 041
→ final access identity + persistent mutation

LocationKnowledge
→ survivor-area / host-place discovery

QuestManager
→ narrative lifecycle only

027/LTC dungeon content
→ deeper evidence + final treasure
```

No Lost Treasure Chronicles-specific parallel access manager.

---

# 33. Performance

Everything is event-driven.

Do not:

- scan all ruins every frame,
- scan player inventory each frame,
- poll dungeon access globally,
- continuously search candidate survivor sites.

Resolve deterministic bindings once and react to world/item/access events.

---

# 34. Reuse targets

Verify current `main`, especially:

- `docs/plans/quests-progression-042-lost-treasure-chronicles-expedition-remains-journal-and-missing-key-trail.md`;
- `docs/plans/quests-progression-041-lost-treasure-chronicles-dungeon-binding-and-persistent-collapsed-access.md`;
- landed 041 implementation/implementation notes when available;
- `src/world/treasureSites.ts`;
- `src/app/actions/containerActions.ts`;
- `WorldGeneratedContainers`;
- item-instance APIs;
- authored world pickup/container persistence;
- `src/world/locations/worldLocationTypes.ts`;
- ruins/location catalog code;
- cave anchors/layout/traversal/collision;
- persistence/save data;
- QuestManager;
- createApp/worldBundle composition.

Current code wins.

Add concise JSDoc with `@domain` for important reusable/public access additions.

---

# 35. Non-goals

Do not implement:

- final treasure outcomes,
- journal stakeholder resolution,
- land deed,
- land ownership,
- archaeologist ownership claim,
- settlement legal recognition,
- lockpicking,
- forced passage,
- generic security framework,
- generic camp/remains `WorldLocationKind`,
- new dungeon generation.

---

# 36. Automated verification

Cover at least:

## Survivor site

- deterministic stable host place and anchor;
- distinct from estate;
- no new global location kind required;
- early discovery respected.

## Key

- exactly one instance;
- deterministic identity derives from access;
- source does not reseed after pickup;
- early pickup catches up;
- unrelated generic key does not unlock access.

## Final access

- stable access ID;
- access owns `requiredKeyId`;
- wrong/no key fails without mutation;
- exact key unlocks;
- unlock persists through save/load/rebuild;
- collision/traversal follows authoritative state;
- quest observes state rather than owning it;
- no duplicate persistence mechanism is created when the 041 seam can be extended coherently.

## Legacy

- already-reached deeper content marks access open;
- already-looted final treasure remains gone;
- no duplicate journal/key/treasure appears.

Manual browser verification remains the User's responsibility.

---

# 37. Completion criteria

The plan is complete when:

1. one deterministic survivor host/site exists outside the dungeon;
2. survivor content reuses existing world-place semantics instead of adding a new global location kind;
3. one exact physical key exists there;
4. key identity derives from the stable final-access identity, not from quest state;
5. key ownership uses normal ItemInstance/container persistence;
6. canonical dungeon has one stable keyed final access;
7. keyed access reuses or coherently extends the persistent world-access mechanism introduced by plan 041;
8. no parallel access persistence system is added without a real semantic need;
9. only the exact required key unlocks access;
10. unlocking permanently changes traversal;
11. early key recovery/unlocking is respected;
12. legacy Players are not trapped behind the new gate;
13. final treasure remains authoritative and untouched;
14. the Player can physically reach the final treasure section, ready for the final ownership/deed chapter.

> **Zrób git commit i push do main, rebase jeżeli trzeba**