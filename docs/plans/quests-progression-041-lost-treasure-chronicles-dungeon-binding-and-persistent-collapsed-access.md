# Plan: Lost Treasure Chronicles — dungeon binding and persistent collapsed access

**Created:** 2026-09-15  
**Status:** `planned` 📋  
**Priority:** high · **Effort:** L  
**Depends on:** quests-progression-040, ~~quests-progression-026~~, ~~quests-progression-027~~, ~~world-024~~  
**Domain:** `quests-progression`  
**Type:** `feature`  
**Subdomains:** `quests` `progression`  
**Tags:** `lost-treasure-chronicles` `dungeon` `cave` `blockage` `persistent-world-state` `tools`  
**Roadmap:** `quests-lost-something-chronicles.md`

## Goal

Implement the fifth chapter of **Lost Treasure Chronicles**:

```text
physical treasure map
→ resolve one real existing dungeon/cave destination
→ bind map clue to that dungeon
→ reach entrance / blocked passage
→ clear persistent collapse using ordinary tools
→ dungeon becomes permanently accessible
```

This plan ends when the Player has permanently opened access to the dungeon section needed by the next chapter.

It does **not** implement:

- expedition remains,
- missing key trail,
- locked final passage,
- final treasure,
- land deed.

---

# 1. Do not create a third competing dungeon story site

Current code already has authored dungeon content from:

- `quests-progression-026`,
- `quests-progression-027`.

Both are implemented against real dungeon/cave anchors rather than quest-owned fake interiors.

Plan 041 must reconcile Lost Treasure Chronicles with that existing dungeon content.

Do not create a third parallel treasure dungeon unless current anchor allocation proves the existing sites cannot be reused safely.

---

# 2. Canonical dungeon selection

Preferred candidate:

> reuse the dungeon already bound by `quests-progression-027-lost-treasure-expedition`.

Reasons:

- `027` already models a missing expedition,
- it already places expedition-related physical evidence,
- it already reaches the real dungeon `finalTreasure`,
- thematically it is the closest match to the downstream Lost Treasure Chronicles story.

However this is not an unconditional lock-in.

Before implementation, verify the current `027` dungeon binding, cave layout and anchor claims.

If reusing that dungeon would collide with existing claimed anchors, make the blockage impossible to place safely, or break current `027` behaviour, choose another **existing** suitable dungeon/cave identity.

Do not create a new dungeon merely for convenience.

`026` should remain a separate bandit/property side story unless current code shows a reason to integrate it more deeply.

---

# 3. `027` narrative integration boundary

This plan only decides:

- which dungeon is canonical for this chapter,
- how the treasure map binds to it,
- how persistent collapsed access works.

Do not yet retire or rewrite all of `027`.

Later plans will decide how to reuse/supersede:

- expedition journal,
- sponsor,
- family/stakeholder outcomes,
- final treasure flow.

Preserve useful existing content.

---

# 4. Stable dungeon binding

The treasure map recovered in plan 040 must bind to one stable real dungeon/cave identity.

Use the existing cave/world-location/anchor ownership from current code.

Target flow:

```text
world seed
→ deterministic dungeon/cave identity
→ story/anchor binding
→ treasure map clue references that identity
→ LocationKnowledge/navigation
```

Do not choose a random loaded cave when the map is read.

Do not persist a random dungeon coordinate purely because the quest needs one.

---

# 5. Map semantics become concrete here

Plan 040 intentionally stopped before exact dungeon binding.

Plan 041 assigns the real meaning of the physical map.

After this plan:

```text
treasure map
→ real dungeon/cave destination
```

Reading the map should reveal the correct dungeon location or bounded approach through normal location knowledge/navigation systems.

If the map was already read before this chapter became active, catch up from authoritative item/read state and reveal the same deterministic binding.

No reroll.

---

# 6. Dungeon exists independently of quest activation

The selected dungeon/cave exists because normal world/cave systems created it.

The quest does not spawn it.

If the Player discovers the dungeon before acquiring the map:

- discovery remains valid,
- later map reading may add historical meaning/navigation,
- quest does not require rediscovery.

World truth remains authoritative.

---

# 7. Collapsed access is world state, not quest state

The selected dungeon contains one persistent physical obstruction that blocks the route required by Lost Treasure Chronicles.

Do not implement:

```text
questProgress.rubbleCleared = true
```

as the authoritative state.

The obstruction belongs to the world/cave.

Conceptual flow:

```text
stable obstruction
→ blocked
→ valid tool/work interaction
→ cleared
→ traversal permanently changes
```

Quest progress only observes that mutation.

---

# 8. Keep the obstruction contract small

Do **not** build a broad generic destruction system for roads, ruins, mines and terrain as part of this plan.

Add the smallest reusable world/cave obstruction contract needed here.

V1 needs roughly:

```text
stable obstruction id
source cave/place id
position / anchor
required capability
optional work amount
cleared mutation
persistent state
collision/traversal consequence
```

It should be reusable later, but this plan does not require implementations for other domains.

Avoid voxel destruction, arbitrary destructible geometry or a global obstruction manager.

---

# 9. Ownership

Preferred ownership is world/cave-side, not quest-side.

Conceptually:

```ts
WorldObstruction {
  id
  sourcePlaceId
  position
  requiredCapability
  workRequired
}
```

Mutable state should be sparse and keyed by stable obstruction ID.

Use the smallest persistence representation consistent with existing world-mutation patterns.

Do not duplicate geometry state and persistence state independently.

---

# 10. Atomic vs incremental clearing

Prefer incremental work only if current interaction/work systems already support it cleanly.

Otherwise one meaningful timed interaction is acceptable for V1.

Decision rule:

- if reusable progress semantics already exist → reuse them;
- otherwise perform an atomic timed action with a valid tool capability.

Do not build durability/work-progress infrastructure solely for this rubble pile.

The important result is persistent physical world change.

---

# 11. Tool capability

The collapse should require a real existing tool/capability.

Primary candidate:

```text
rock_mining
```

via an ordinary pickaxe.

Use item capability metadata rather than hardcoded item identity where practical.

Do not add:

```text
quest_pickaxe
dungeon_pickaxe
rubble_tool
```

---

# 12. Shovel support

Use shovel/digging only if the final obstruction geometry genuinely contains loose earth/debris and current capabilities make this natural.

Do not require both shovel and pickaxe merely to add steps.

Preferred V1: one clear primary capability.

---

# 13. Player preparation

The story may communicate that suitable tools are needed.

The tools remain ordinary world items.

The Player may:

- already own them,
- buy them,
- find them,
- receive an ordinary existing reward/transfer if current systems make that trivial.

Do not build tool-loan or expedition-equipment subsystems here.

---

# 14. Obstruction affects real traversal

Before clearing:

- collision/path/traversal genuinely blocks access.

After clearing:

- geometry/collision permits passage,
- the change survives save/load and world rebuild.

Do not implement a visual rubble prop controlled by an invisible quest gate.

Likewise do not remove only the mesh while collision remains.

World state drives traversal.

---

# 15. World independence

The obstruction exists independently of the Player quest state.

Its cleared state is persistent world history.

Future NPC/world systems should be able to query whether the passage is open without knowing about Lost Treasure Chronicles.

Do not hardwire traversal checks to quest stage.

---

# 16. No continuous off-screen simulation

The obstruction changes only through explicit work.

No global per-frame update manager is needed.

Materialize/query its state only with relevant cave/world content.

---

# 17. Cave anchor integration

Existing dungeon content already uses story/loot anchors.

Place the obstruction through the same cave-layout/anchor language where practical.

Preferred:

```text
dungeon passage / entrance anchor
→ stable obstruction definition
```

rather than arbitrary global XYZ coordinates detached from cave semantics.

If current cave archetypes lack a suitable anchor, add the smallest compatible obstruction/passage anchor.

---

# 18. Entrance vs interior passage

Preferred layout:

```text
dungeon entrance reachable
→ Player confirms correct site
→ collapsed interior/entrance passage blocks deeper route
```

This lets the Player inspect the obstruction and understand the required capability.

Exact placement follows current dungeon geometry.

---

# 19. Existing `026` / `027` anchor claims

Preserve current shared cave anchor claim semantics.

Do not place the obstruction on top of:

- side cache,
- expedition journal,
- bandit deep stash,
- final treasure,
- other reserved story anchors.

Use the existing shared content-policy/anchor-claim mechanism as authoritative.

---

# 20. `027` compatibility

If the selected canonical dungeon is the `027` dungeon, existing `027` world content may physically exist beyond the collapse.

That is acceptable.

The collapse only prevents normal traversal until cleared.

Do not respawn/reseed `027` containers or evidence when access opens.

Existing persistence remains authoritative.

---

# 21. Early discovery and clearing

Support:

- Player discovers dungeon before map,
- Player reaches entrance before this chapter,
- Player clears the obstruction before quest activation if interaction is discoverable,
- Player already owns a valid tool.

Later quest progression catches up from world state.

Do not require clearing again.

---

# 22. Quest flow

Preferred chapter structure:

```text
Stage 1
read/use treasure map
→ resolve/reveal canonical dungeon

Stage 2
reach/discover dungeon

Stage 3
inspect blocked access / understand required capability

Stage 4
clear persistent obstruction
→ deeper route opens permanently
→ complete
```

Stages 2/3 may collapse if the current interaction system communicates the requirement naturally.

Do not inflate journal stages unnecessarily.

---

# 23. Quest observation seam

First reuse an existing generic world-state predicate/event seam if current QuestManager/objectives can observe this mutation.

Only add a new quest objective type if current mechanisms cannot express the requirement cleanly.

If a new objective is required, keep it narrow and world-observing, conceptually:

```ts
{ type: 'clear_world_obstruction', obstructionId: string }
```

The quest objective must observe authoritative world state; it does not own the mutation.

Do not add a new objective type merely for naming convenience.

---

# 24. Persistence

Persist obstruction mutation through world persistence.

Requirements:

- same obstruction ID after rebuild,
- cleared state survives save/load,
- partial progress persists only if incremental work is actually implemented,
- no duplicate rubble,
- no reset when quest is abandoned/completed.

Do not persist deterministic obstruction geometry/position when it reconstructs from dungeon identity.

---

# 25. Legacy save compatibility

This plan adds an obstruction to a dungeon that may already exist in older saves.

Hard compatibility rule:

> if an existing save proves that the Player or already-consumed/persisted authored content is beyond the future obstruction, treat that obstruction as already cleared for that save.

Relevant evidence may include:

- Player saved beyond the obstruction,
- downstream `026/027` story/container content already consumed or progressed in a way that requires prior access.

Do not retroactively trap the Player.

Do not reset downstream world state.

Do not attempt to teleport the Player as the default migration strategy.

Implementation notes must identify the safest concrete legacy-state predicates from current persistence data.

---

# 26. World-generated containers and treasure locks

This plan does not implement the later missing-key/final-lock chapter.

`world-024` already owns deterministic treasure/key/container lock semantics.

Do not misuse a chest/container lock to represent physical rubble.

Keep:

```text
physical obstruction
≠
container lock
```

---

# 27. No fake key in this chapter

Do not add a key to the collapsed access.

This stage is about:

> tools + physical obstruction + persistent world modification.

The key investigation belongs to the next chapter.

---

# 28. State ownership

```text
cave/world generation
→ canonical dungeon identity

cave anchor/content policy
→ obstruction placement

world/cave obstruction state
→ blocked/cleared mutation

Inventory/item capability system
→ required tool capability

LocationKnowledge
→ dungeon reveal/discovery

QuestManager
→ narrative lifecycle only

existing 026/027 modules
→ their own containers/evidence/story bindings
```

Do not add `LostTreasureDungeonState`.

---

# 29. Performance

Obstruction state should be sparse and event-driven.

Do not:

- scan all caves every frame,
- poll all obstructions from QuestManager,
- perform global terrain searches after map read.

Resolve by stable dungeon/obstruction identity.

---

# 30. Reuse targets

Verify current `main`, especially:

- `docs/plans/quests-progression-026-dungeon-bandit-treasure.md`;
- its implementation notes;
- `docs/plans/quests-progression-027-lost-treasure-expedition.md`;
- its implementation notes;
- `src/quests/lostTreasureExpedition.ts`;
- cave anchor/content-policy modules;
- dungeon/cave archetype/layout code;
- `src/world/createCaves.ts`;
- `src/world/locations/*`;
- `src/app/actions/groundActions.ts`;
- item capability/catalog code;
- world-generated containers;
- `src/world/treasureSites.ts`;
- persistence/save-data code;
- `QuestManager`;
- `createApp.ts`.

Current code overrides older assumptions.

Add concise JSDoc with relevant `@domain` tags for important reusable obstruction APIs.

---

# 31. Non-goals

Do not implement:

- expedition-remains investigation,
- missing survivor/key trail,
- locked final passage,
- new key system,
- final treasure,
- stakeholder outcomes,
- land deed,
- property ownership,
- broad generic destructible-world system,
- voxel digging,
- NPC rubble-clearing AI,
- hired workers for the collapse unless current shared-work systems make it effectively free.

---

# 32. Automated verification

Cover at least:

## Dungeon binding

- same world/story seed → same canonical dungeon;
- map read never rerolls destination;
- dungeon exists without quest activation;
- early discovery is respected;
- preferred `027` dungeon is reused when compatible;
- fallback uses another existing dungeon rather than automatically creating a new one.

## `026` / `027`

- selected obstruction anchor does not collide with existing claimed anchors;
- `026` caches remain valid;
- `027` evidence/finalTreasure remain valid;
- no duplicate dungeon story site is created.

## Obstruction

- stable obstruction ID;
- starts blocked on valid new-world state;
- valid tool/capability clears it;
- invalid/no tool does not;
- clearing affects collision/traversal;
- clearing persists through save/load/rebuild;
- quest observes clear state rather than owning it.

## Early state

- early dungeon discovery;
- early obstruction clearing;
- map read before quest stage;
- all catch up correctly.

## Legacy saves

- old saves with already-used downstream dungeon content keep that state;
- if Player/downstream content proves prior access beyond the new obstruction, it is migrated as cleared;
- Player is never trapped behind newly introduced rubble;
- existing treasure/evidence does not respawn.

Manual browser verification remains the User's responsibility.

---

# 33. Completion criteria

The plan is complete when:

1. the treasure map binds deterministically to one real existing dungeon;
2. the preferred candidate is the `027` dungeon when current layout/claims permit it;
3. fallback selects another existing suitable dungeon rather than creating a new one by default;
4. existing `026/027` content is reconciled rather than duplicated;
5. a small stable persistent world/cave obstruction contract exists;
6. the obstruction uses an ordinary real tool capability;
7. clearing it changes actual traversal;
8. clearing persists independently of quest state;
9. early discovery/clearing is respected;
10. QuestManager reuses an existing world-state observation seam where possible;
11. legacy saves that already accessed downstream content treat the obstruction as cleared;
12. the plan ends with the deeper dungeon route permanently open for the expedition-remains/key chapter.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
