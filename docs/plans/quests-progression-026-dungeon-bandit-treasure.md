# Plan: Bandit treasure — dungeon cave

**Created:** 2026-09-13
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** world-terrain-028, fauna-027
**Domain:** `quests-progression`
**Subdomains:** `quests` `rewards`
**Tags:** `dungeon` `bandit-treasure` `loot` `exploration`
**Roadmap:** -

## Goal

Add a treasure-hunt quest using a real `dungeon` cave that was once used by bandits as a hideout/cache network.

The bandits are historical context in V1. The dungeon is not populated with quest-spawned human enemies. Current cave residents remain ordinary fauna-owned animals.

Target experience:

```text
rumour / old clue
→ exact dungeon cave
→ optional side caches
→ deeper main bandit stash
→ physical loot is the primary reward
```

This quest should use the dungeon's branching layout rather than treating it as one large room.

## Dungeon binding

Bind one exact cave satisfying:

```text
Caves.archetypeOf(caveId) === 'dungeon'
+ stable dungeon chamber semantics
+ world-terrain-028 side/deep loot anchors
```

Use `Caves.dungeonChambersOf(caveId)` for chamber classification and `Caves.contentAnchorsOf(caveId)` for final safe placement.

Do not use dungeon topology array indexes, chamber-centre Y, surface height or presentation meshes as loot positions.

The quest may share the same guaranteed dungeon with `quests-progression-027`; anchor roles are deliberately separated so both stories can coexist.

## Bandit cache layout

Create several fixed `WorldGeneratedContainers` entries from cave-owned anchors:

- one or two optional side-chamber caches (`sideTreasure` / side `loot` anchors);
- one main bandit stash in a `deep` chamber `loot` anchor.

Do **not** consume the dungeon `finalTreasure` anchor in this quest. Reserve final-chamber treasure semantics for stories that need the true end of the dungeon, especially `quests-progression-027`.

Cache identities must derive from stable cave/anchor ids and remain deterministic across rebuilds.

## Loot

Use existing item/inventory systems only.

The caches may contain a tuned mix of:

- coin,
- weapons/tools already present in the catalog,
- trade goods/food where appropriate,
- one more valuable existing item in the deep stash if balance permits.

No `BanditLoot` state or quest-specific inventory is allowed.

The Player keeps actual container contents. Do not duplicate the treasure again through `QuestReward`.

## Quest giver / discovery

A specific authored NPC knows an old story, ledger entry or rumour pointing to the cave. V1 does not need a new physical map item if dialogue can reveal the location through existing `LocationKnowledge`.

The world caches exist before the quest. If the Player discovers and empties the main stash early, later quest progress should read the authoritative container/world state and catch up rather than respawning treasure.

## Quest flow

1. Giver shares the bandit-cache story and reveals the exact dungeon location.
2. Player explores the dungeon. Side caches are optional rewards and do not gate completion.
3. Reaching/looting the exact deep main stash completes the core world objective through `loot_world_container(mainBanditStashId)`.
4. Return/report to the giver if desired for narrative closure and a small social reward.

Do not require killing dungeon residents or clearing every chamber.

## Dungeon residents

`fauna-027` / current `src/fauna/dungeonResidents.ts` owns dungeon animals.

Quest code must not:

- create extra bears/wolves,
- require a specific resident to be alive,
- count resident deaths as progress,
- reset animals when the Player leaves,
- store animal state in quest progress.

The dungeon can therefore be easier or harder depending on actual world history when the Player arrives.

## Outcomes / rewards

Use one normal completion such as `bandit_stash_found`.

Primary reward = physical loot already taken from the world containers.

Optional report reward should be small (relation/renown or modest coin) and must not recreate the main treasure value.

No moral ownership branch is required in V1. A future stolen-property/law system may attach consequences to specific historical loot without changing this cave-content architecture.

## Ownership / persistence

| State | Owner |
|---|---|
| quest progress/outcome | `QuestManager` |
| cave/chambers/anchors | cave world, derived |
| cache inventories | `WorldGeneratedContainers` |
| dungeon residents | fauna |
| location knowledge | world location system |
| social reward | existing quest/social systems |

All cache content exists independently of quest activation.

## Reuse targets

Implementation recon should focus on:

- `src/quests/quests.ts`;
- `src/quests/QuestManager.ts` — `loot_world_container`;
- `src/app/createApp.ts` — contextual quest composition / anchor claims;
- `src/app/worldBundle.ts`;
- `src/world/createCaves.ts`;
- `src/world/caves/dungeonChambers.ts`;
- `src/world/caves/caveContentAnchors.ts` after `world-terrain-028`;
- `src/world/worldGeneratedContainers.ts`;
- `src/fauna/dungeonResidents.ts`;
- `src/world/locations/revealLocationKnowledge.ts`.

Add JSDoc for important reusable/public additions and appropriate `@domain` tags.

## Non-goals

- no living bandit faction in V1;
- no quest mobs;
- no dungeon clear objective;
- no new combat pipeline;
- no final-chamber treasure claim;
- no duplicated cave coordinates;
- no generic crime/stolen-property framework.

## Verification

Test dungeon-only binding; side/deep anchor classification; main stash never uses `finalTreasure`; side caches remain optional; early looting does not respawn treasure; only the main stash completes the objective; fauna state is irrelevant to quest completion; save/load/rebuild preserves exact cache depletion without duplication.

Manual browser verification remains the User's responsibility.

> **Zrób git commit i push do main, rebase jeżeli trzeba**