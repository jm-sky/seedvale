# Plan: Lost treasure expedition — dungeon cave

**Created:** 2026-09-13
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** medium · **Effort:** L
**Depends on:** ~~world-terrain-028~~, ~~fauna-027~~
**Domain:** `quests-progression`
**Subdomains:** `quests` `relationships` `rewards`
**Tags:** `dungeon` `expedition` `treasure` `choice`
**Roadmap:** -
**Model:** Opus, Sonnet

## Goal

A missing expedition entered a real dungeon looking for legendary treasure. The treasure is real and physically exists at `finalTreasure`.

Flow: generated sponsor → exact dungeon → abandoned camp → leader pack + journal → final expedition evidence → real treasure → decide what happens to the journal.

## NPC binding

Select stable generated `NpcId`s instead of hardcoding the four reserved NPCs.

- sponsor: prefer `trader` or `miner`, then another suitable adult;
- second stakeholder: adult from another household when available, representing a relative/contact of an expedition member.

The sponsor knows the planned destination and reveals the dungeon. If no second suitable NPC exists, expose two outcomes rather than inventing one.

## World content and stages

Bind one `dungeon` with ordered `storyFind` anchors plus unique `finalTreasure`. It may share the cave with quest 026 because 026 uses side/deep loot while this plan owns the expedition trail and final treasure.

Create persistent `WorldGeneratedContainers` content before quest activation:

1. early camp/supplies;
2. leader pack with physical expedition journal;
3. final expedition evidence/personal effects;
4. final treasure container.

Stages follow those four discoveries, then a final dialogue choice. Early looting must catch up from live container state; never respawn content.

## Outcomes

- `journal_to_family`: hand over the exact physical journal to the second stakeholder; strongest trust/benevolence result. Personal effects remain optional evidence/loot and are not required for terminal hand-in. Player keeps the treasure.
- `journal_to_sponsor`: give the exact journal to sponsor; larger coin payment and sponsor relation, weaker second-stakeholder relation.
- `keep_journal_and_treasure`: keep journal too; no extra reward and weaker/negative trust/integrity consequence.

Do not add a treasure-return branch; the choice is about the expedition record, which keeps this distinct from quest 008.

Dungeon residents remain ordinary fauna from `fauna-027`, never quest objectives or scripted guards.

## Ownership / reuse

QuestManager owns quest state; generated NPC systems own identities; cave world owns anchors; `WorldGeneratedContainers` owns evidence/treasure; inventory owns journal/personal items; fauna owns residents; social systems own consequences.

Reuse generated-NPC materialization patterns, `quests.ts`, `QuestManager.ts`, `createApp.ts`, `worldBundle.ts`, `createCaves.ts`, `dungeonChambers.ts`, `caveContentAnchors.ts`, `worldGeneratedContainers.ts`, item-instance contracts and location knowledge.

Reuse the existing generalized cave anchor-claim arbitration and `WorldGeneratedContainerSpec.initialInstances`; do not add parallel reservation or fresh-container instance mechanisms. Terminal journal hand-in must reuse the existing atomic single-instance Player → NPC transfer primitive rather than introducing multi-instance transfer for this quest.

Add JSDoc for important reusable/public additions with appropriate `@domain` tags.

## Verification

Test deterministic stakeholders, dungeon binding, ordered anchors, coexistence with 026, pre-existing final treasure, early-loot catch-up, exact physical journal outcomes, fauna independence and no duplication after save/load/rebuild. Manual browser verification remains the User's responsibility.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
