# Plan: Contraband cache — natural cave

**Created:** 2026-09-13
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** world-terrain-028
**Domain:** `quests-progression`
**Subdomains:** `quests` `relationships` `rewards`
**Tags:** `natural-cave` `contraband` `container` `trade`
**Roadmap:** -

## Goal

Use a real `natural` cave as a small smuggling cache and local quest location.

The cache is world content first and quest content second: it exists from world construction, can be discovered before the quest, persists normally, and is not spawned when dialogue begins.

Target experience:

```text
small natural cave
→ hidden fixed cache
→ player may discover it early or be sent there
→ retrieve agreed goods
→ return them to the owner/contact
→ keep an authored share / receive payment
```

## Cave and cache binding

Choose deterministically one exact `natural` cave with a valid `world-terrain-028` `loot` anchor. Prefer a cave not already claimed by `quests-progression-023` or another authored natural-cave story.

Create one fixed `WorldGeneratedContainers` cache at the cave-owned underground anchor with correct cave `WorldSpatialContext`.

Do not use surface height, copied coordinates, runtime mesh references or quest-owned container contents.

The cache should contain a small authored mix of existing tradeable item kinds. During implementation pick goods that already have ordinary inventory/trade semantics. Avoid creating a special `contraband_item` kind solely for this quest.

## Story / giver

V1 uses one authored shady trader/smuggler/contact as the giver. Materialize that NPC through the existing authored name/identity pipeline to stable `NpcId`.

The giver knows where the cache is and asks the Player to recover an agreed subset of its contents. The exact cave is revealed through the normal location-knowledge/navigation seam.

The fiction may imply the goods are illicit/stolen, but V1 does not implement a general crime or stolen-item ownership system.

## Early discovery

The cache must remain valid if the Player finds and loots it before accepting the quest.

Use live world/container state and the existing `loot_world_container` catch-up semantics rather than a `cacheFound` quest flag.

If the Player already removed the authored cache payload and still possesses the required hand-in goods when the quest becomes active, normal objective evaluation should allow the quest to progress. Do not respawn goods because the quest was accepted late.

## Quest flow

1. Giver offers the job and reveals the exact natural cave.
2. Player reaches the cave.
3. `loot_world_container(cacheId)` confirms interaction with the correct authored cache, preventing unrelated inventory from completing the location part of the job.
4. A normal `gather_item` stage requires the agreed quantity of one existing item kind from the recovered goods.
5. Returning to the giver uses the existing gather-item hand-in path; `QuestManager` removes the handed-in quantity from the normal Player `Inventory`.
6. Quest resolves and the Player keeps any explicitly authored surplus cache contents plus the normal reward.

Do not add a second item-transfer implementation for this quest.

## Reward and consequences

Use one successful outcome such as `contraband_delivered`.

Reward can include:

- coin payment,
- small relation increase with the giver,
- the unrequired portion of the physical cache loot, which is already world-owned and must not be duplicated in `QuestReward`.

Keep social consequences local in V1. A future law/reputation plan may add reporting/confiscation choices using shared crime systems; do not build a fake crime framework here.

## State ownership

| State | Owner |
|---|---|
| quest stage/outcome | `QuestManager` |
| exact cave + anchor | deterministic cave binding |
| cache contents / removal | `WorldGeneratedContainers` |
| required carried goods | Player `Inventory` |
| location knowledge | world location system |
| relation/social consequence | existing quest/social systems |

The quest must not store cache counts, anchor XYZ or duplicate inventory state.

## Reuse targets

Implementation recon should focus on:

- `src/quests/quests.ts` — contextual authored binding, `loot_world_container`, `gather_item`;
- `src/quests/QuestManager.ts` — live world progress and gather hand-in through the giver;
- `src/app/createApp.ts`;
- `src/app/worldBundle.ts`;
- `src/world/worldGeneratedContainers.ts`;
- `src/app/actions/containerActions.ts`;
- `src/world/createCaves.ts`;
- `src/world/locations/revealLocationKnowledge.ts`;
- current merchant/trade item catalog only for choosing existing payload kinds.

Add JSDoc for important reusable/public additions and appropriate `@domain` tags.

## Non-goals

- no general stolen-property ownership;
- no law/crime simulation;
- no portable nested container requirement;
- no custom cave interaction;
- no quest-specific item inventory;
- no quest-spawned cache;
- no fallback to adventure/dungeon caves.

## Verification

Test deterministic natural-cave selection; cache existence before quest offer; exact-container objective matching; early-loot catch-up without respawn; gather hand-in removes only the required quantity; surplus loot is not duplicated as a reward; save/load preserves cache state; rebuild does not recreate removed contents.

Manual browser verification remains the User's responsibility.

> **Zrób git commit i push do main, rebase jeżeli trzeba**