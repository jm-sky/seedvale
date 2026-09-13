# Plan: Lost hunter — natural cave

**Created:** 2026-09-13
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** medium · **Effort:** M
**Model:** Opus, Sonnet
**Depends on:** world-terrain-028, ~~fauna-018~~, ~~fauna-019~~
**Domain:** `quests-progression`
**Subdomains:** `quests` `relationships` `rewards`
**Tags:** `natural-cave` `hunter` `family` `choice`
**Roadmap:** -

## Goal

Concrete natural-cave quest about a hunter who failed to return. Use generated settlement NPCs where possible; do not restrict authored content to Anna/Piotr/Kasia/Marek.

Flow:

```text
concerned household/family NPC
→ witness hunter/woodcutter
→ exact natural cave
→ remains + hunter pack + distinctive bow
→ return with proof
→ choose what happens to the bow
```

V1 is a historical disappearance. Do not create a live NPC waiting inside the cave; a future rescue variant must use generic NPC cave traversal (`npc-027`).

## NPC and clue binding

At composition time bind stable generated `NpcId`s:

- giver: prefer an adult from a plausible household/family context;
- witness: prefer another adult `hunter`, then `woodcutter`, then another adult fallback.

The giver knows the hunter is missing but **does not know the exact cave**. The witness is the actual clue: they last saw the hunter following game toward one specific cave and remember the distinctive bow he carried.

Reuse the generated-NPC selection/materialization pattern from `src/quests/opportunities/`; names are presentation only.

## Cave and world content

Bind one deterministic unclaimed cave with:

```text
archetype === 'natural'
+ storyFind anchor
+ loot anchor
```

At `storyFind`: world-owned remains/evidence. At `loot`: one fixed `WorldGeneratedContainers` hunter pack with modest supplies plus the physical bow.

The pack exists before quest acceptance. Cave coordinates are never quest state.

A normal persistent cave predator may be present, absent, roaming or already dead. It is not the scripted killer and never a quest objective.

## Stages

1. giver asks what happened;
2. talk to witness;
3. witness reveals exact cave through existing location/navigation knowledge;
4. find/loot the exact hunter pack;
5. return to giver;
6. resolve a possession choice for the bow.

## Outcomes

### `return_bow_to_family`

Return the physical bow to the giver/family. Bow leaves Player inventory. Strongest relation/trust/benevolence result; only modest material payment.

### `report_fate_keep_bow`

Tell the truth but keep the bow. Bow remains with Player. Family gets closure, but relation/trust result is weaker or neutral; do not duplicate the bow as a reward.

### Optional third path

Only if current household data already exposes another legitimate claimant, allow handing the bow to that person. Do not invent an NPC solely to create a third choice.

If exact bow identity cannot be represented with current stack semantics, add the smallest reusable authored item-instance seam; never use a quest boolean as fake possession.

## Ownership / reuse

Quest progress stays in `QuestManager`; NPC identity in settlement/NPC systems; cave/anchors in cave world; pack in `WorldGeneratedContainers`; bow in normal inventory; fauna in fauna; location knowledge and social consequences in existing owners.

Recon targets: `quests.ts`, `QuestManager.ts`, `quests/opportunities/`, `createApp.ts`, `worldBundle.ts`, `worldGeneratedContainers.ts`, `createCaves.ts`, `revealLocationKnowledge.ts`, household/NPC descriptors, current bow/item-instance contracts.

Add JSDoc for important reusable/public additions with appropriate `@domain` tags.

## Non-goals / verification

No tracking minigame, quest-spawned predator, kill requirement, hardcoded cave coordinates or four-NPC-only rule.

Test deterministic giver/witness/cave selection, witness reveal, pre-existing pack, save/load, physical bow transfer vs keep outcome, distinct consequences, and no duplication on rebuild. Manual browser verification remains the User's responsibility.

> **Zrób git commit i push do main, rebase jeżeli trzeba**