# Plan: Lost treasure expedition — dungeon cave

**Created:** 2026-09-13
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** L
**Depends on:** world-terrain-028, fauna-027
**Domain:** `quests-progression`
**Subdomains:** `quests` `relationships` `rewards`
**Tags:** `dungeon` `expedition` `treasure` `environmental-storytelling`
**Roadmap:** -

## Goal

Add a larger dungeon quest about a missing expedition that entered a real `dungeon` cave searching for a legendary treasure.

The key premise is explicit:

> The expedition was right. The treasure is real and physically exists in the final chamber.

The Player follows the expedition's trail deeper through the cave, learns what happened from persistent world evidence, reaches farther than the expedition did, and can take the actual treasure.

Target flow:

```text
expedition failed to return
→ exact dungeon cave
→ first abandoned supplies
→ deeper expedition evidence
→ final chamber
→ expedition's sought treasure really exists
→ report fate / keep physical treasure
```

## Dungeon binding

Bind one exact generated cave satisfying:

```text
Caves.archetypeOf(caveId) === 'dungeon'
+ world-terrain-028 storyFind anchors across multiple chamber classes
+ one stable finalTreasure anchor
```

Use `Caves.dungeonChambersOf()` for chamber identity/classification and `contentAnchorsOf()` for safe final placements.

The quest may share the same guaranteed dungeon with `quests-progression-026`:

- bandit treasure uses side/deep loot anchors;
- this expedition uses story anchors along the route and owns the `finalTreasure` anchor.

Maintain composition-time anchor claims so two authored systems never place content on the same anchor.

## Expedition evidence

Create a short sequence of persistent world evidence at stable `storyFind` anchors, preferably progressing deeper through the dungeon:

1. **early/regular chamber** — abandoned supplies or first camp;
2. **deep chamber** — expedition leader's pack / evidence that the group continued toward the final chamber;
3. **near final chamber** — final evidence/remains showing that the expedition failed shortly before reaching or securing the treasure.

Use world-owned anchored presentation for visual storytelling. For authoritative interaction/progress, prefer fixed `WorldGeneratedContainers` packs/caches rather than proximity to decorative meshes.

Do not create fake live expedition NPCs in V1. A future rescue variant should use generic NPC cave traversal and lifecycle.

## The treasure

Place one real fixed treasure container at the dungeon's `finalTreasure` anchor.

The treasure exists from world construction regardless of:

- quest acceptance,
- Player discovery order,
- dungeon resident state,
- whether expedition evidence has already been looted.

Use normal `WorldGeneratedContainers` contents/persistence.

Treasure should be materially better than a natural-cave cache and clearly reward completing a full dungeon. Tune from existing valuable items rather than creating a parallel reward currency. Candidate components can include a substantial coin amount, ruby/rare goods and one valuable existing piece of equipment where balance allows.

Do not duplicate the same treasure value through `QuestReward`.

## Quest giver

A specific authored NPC acts as sponsor, relative or settlement contact for the missing expedition.

The giver's primary concern is learning what happened to the expedition. The final treasure is therefore the Player's exploration reward rather than an object that must automatically be surrendered.

Reveal the exact dungeon through existing world location/navigation semantics; no quest-specific minimap/cave navigation system.

## Quest stages

Preferred V1 sequence:

1. offer + cave reveal;
2. `loot_world_container(firstExpeditionPackId)` — confirms the Player found the expedition's first trace;
3. `loot_world_container(deepExpeditionPackId)` — advances the story deeper;
4. `loot_world_container(finalTreasureContainerId)` — confirms the legendary treasure was actually reached;
5. return/report to giver for narrative closure.

If evidence containers were looted before quest acceptance, use live `QuestWorldProgressLookup` / container state so stages can catch up when activated. Never respawn consumed evidence or treasure to preserve authored stage order.

The exact number of mandatory evidence stops should remain small (2 before the treasure). Additional story props may be optional.

## Dungeon fauna

Dungeon residents are existing persistent fauna from `fauna-027` / `src/fauna/dungeonResidents.ts`.

They are not expedition killers scripted by the quest and are not required objectives.

The Player may encounter different danger depending on current world state: residents can be elsewhere, dead from earlier events or present in several chambers. Quest progression must remain valid in every case.

## Outcome and rewards

Use one success outcome such as `expedition_fate_and_treasure_found` after the Player reports back.

Rewards divide cleanly:

- **physical dungeon treasure** — already taken from the final world container;
- **quest/social reward** — modest relation/renown/coin for reporting the expedition's fate.

Do not pay the legendary treasure value twice.

No forced treasure-return choice is required; that moral structure already belongs to `quests-progression-008` and should not be repeated mechanically here.

## Persistence / ownership

| State | Owner |
|---|---|
| quest stages/outcome | `QuestManager` |
| dungeon/chambers/anchors | cave world, derived |
| evidence packs + final treasure | `WorldGeneratedContainers` |
| dungeon residents | fauna persistent systems |
| location knowledge | world location system |
| social consequences | quest/reputation systems |

Do not serialize dungeon chamber arrays, anchor coordinates, expedition prop meshes or fauna state into quest progress.

## Reuse targets

Implementation recon should start from:

- `src/quests/quests.ts`;
- `src/quests/QuestManager.ts` — ordered `loot_world_container` stages and live catch-up;
- `src/app/createApp.ts` — contextual binding / claimed cave anchors;
- `src/app/worldBundle.ts` — world-generated container specs;
- `src/world/createCaves.ts`;
- `src/world/caves/dungeonChambers.ts`;
- `src/world/caves/caveContentAnchors.ts` after `world-terrain-028`;
- `src/world/worldGeneratedContainers.ts`;
- `src/fauna/dungeonResidents.ts`;
- `src/world/locations/revealLocationKnowledge.ts`.

Add JSDoc for important reusable/public additions and appropriate `@domain` tags.

## Non-goals

- no quest-spawned expedition NPCs;
- no rescue/escort in V1;
- no dungeon clear requirement;
- no scripted resident placement for the quest;
- no fake/empty treasure twist;
- no new reward currency;
- no duplicate cave coordinates/persistence;
- no requirement for the underground pool unless future story content explicitly needs it.

## Verification

Test dungeon-only selection; deterministic ordered story anchors; final treasure uses the unique `finalTreasure` anchor; coexistence with bandit side/deep caches; early-loot catch-up without respawn; final treasure exists before quest activation; resident lifecycle never gates progress; save/load/rebuild preserves evidence and treasure depletion exactly; terminal report rewards only once.

Manual browser verification remains the User's responsibility.

> **Zrób git commit i push do main, rebase jeżeli trzeba**