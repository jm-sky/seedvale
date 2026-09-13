# Plan: Old bones — adventure cave

**Created:** 2026-09-13
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~world-terrain-020~~
**Domain:** `quests-progression`
**Subdomains:** `quests` `relationships` `rewards`
**Tags:** `adventure-cave` `family` `heirloom` `story-find`
**Roadmap:** -

## Goal

Add a second authored story for `adventure` caves, distinct from `quests-progression-008`.

A family member asks about a relative who disappeared years earlier. In a real adventure cave the Player finds old remains and a family signet/heirloom, then may return it to the family.

Target flow:

```text
old disappearance
→ exact adventure cave
→ side/deep exploration
→ remains + heirloom cache
→ recover family signet
→ return it to the relative
```

This quest should demonstrate that one adventure cave can support more than one independent story without duplicating cave coordinates or forcing a separate cave for every quest.

## Cave and anchor binding

Bind only an exact cave with:

```text
Caves.archetypeOf(caveId) === 'adventure'
```

Use existing `Caves.contentAnchorsOf(caveId)`.

Preferred placement order:

1. unclaimed `sideTreasure` anchor;
2. otherwise an unclaimed `finalTreasure` anchor.

`quests-progression-008` may use the same physical adventure cave, but both quests must never claim the same content anchor.

At quest composition, maintain a small set of claimed cave-content anchor ids analogous to the existing occupied-landmark composition pattern. This is composition arbitration only, not persisted quest state.

Do not create a second adventure cave solely for this story and do not cache anchor XYZ.

## World content

At the selected anchor place:

- a small deterministic remains/story presentation;
- one fixed world-authored container/box holding the heirloom and modest incidental loot.

Use `WorldGeneratedContainers` for the actual persisted inventory. Presentation may be lightweight, but authoritative loot must live in the existing container/inventory system.

The remains and container exist from world construction, not quest acceptance.

## Family heirloom

Current item systems have generic `ItemInstance` identity but no established jewelry kind. If that remains true at implementation time, add one reusable item kind such as:

```text
signet_ring
```

Do not add a quest-named kind such as `old_bones_quest_ring`.

Prefer making the ring instance-backed with one deterministic authored instance id so it is a real physical item across container → Player inventory → hand-in/save/load.

V1 may rely on `gather_item { kind: 'signet_ring', count: 1 }` for hand-in while this is the only authored source. If jewelry becomes common before implementation, reconfirm whether the hand-in must match the exact instance id instead of only the kind.

## Quest flow

1. A specific authored family NPC offers the quest and explains the old disappearance.
2. Reveal/target the exact adventure cave through existing location knowledge/navigation.
3. Player explores the cave and loots the exact authored remains container (`loot_world_container`).
4. A normal `gather_item` stage requires the signet ring.
5. Returning to the giver uses the existing gather-item hand-in path and removes the physical ring from Player inventory.
6. Resolve `heirloom_returned` exactly once.

Do not require killing cave fauna or clearing the cave. Any animals present are ordinary world fauna.

## Loot and reward

The cave may contain modest incidental loot in the remains container; that is world loot and stays with the Player unless explicitly required for hand-in.

The quest reward for returning the family heirloom should primarily be:

- relationship increase with the giver/family;
- modest coin or renown/reputation consequence where appropriate.

Do not duplicate the physical cave loot in `QuestReward`.

If the Player chooses to keep the ring, V1 may simply leave the quest unresolved rather than inventing a special A/B dialogue branch. A later social/crime system may support richer consequences.

## Persistence / ownership

| State | Owner |
|---|---|
| quest stage/outcome | `QuestManager` |
| cave/archetype/anchor geometry | cave world, derived |
| anchor claim set | composition-time only |
| remains container + loot | `WorldGeneratedContainers` |
| signet instance | normal inventory/item-instance lifecycle |
| location discovery | world location system |
| relations/social consequences | existing quest/social systems |

Do not serialize anchor XYZ or create a quest-owned heirloom copy.

## Reuse targets

Recon/implementation should use:

- `src/quests/quests.ts` — `bindExactCaveQuests()` composition pattern, objectives and authored definitions;
- `src/quests/QuestManager.ts` — `loot_world_container` + gather hand-in;
- `src/app/createApp.ts` — occupied/claimed world-content composition pattern;
- `src/app/worldBundle.ts`;
- `src/world/createCaves.ts`;
- `src/world/caves/caveContentAnchors.ts`;
- `src/world/worldGeneratedContainers.ts`;
- `src/items/items.ts`, `itemCatalog.ts`, `itemInstances.ts` only if the generic signet item is still missing;
- `src/world/locations/revealLocationKnowledge.ts`.

Add JSDoc for reusable/public additions and appropriate `@domain` tags.

## Non-goals

- no new cave archetype;
- no quest-specific cave coordinates;
- no procedural family mystery generator;
- no live missing NPC;
- no required combat;
- no duplicated adventure treasure anchor;
- no full jewelry/equipment system beyond the minimal physical heirloom item.

## Verification

Test adventure-only binding; deterministic unclaimed-anchor selection; no collision with `quests-progression-008`; remains container exists before quest acceptance; exact container loot advances correctly; signet survives save/load; hand-in removes the ring once; reward/outcome cannot duplicate after reload.

Manual browser verification remains the User's responsibility.

> **Zrób git commit i push do main, rebase jeżeli trzeba**