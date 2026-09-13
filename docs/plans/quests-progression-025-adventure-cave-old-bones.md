# Plan: Old bones — adventure cave

**Created:** 2026-09-13
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** world-terrain-028
**Domain:** `quests-progression`
**Subdomains:** `quests` `relationships` `rewards`
**Tags:** `adventure-cave` `family` `heirloom` `choice`
**Roadmap:** -

## Goal

Keep this distinct from `quests-progression-023`: this is an old family mystery and inheritance dispute, not another recent missing-person quest.

```text
local cave rumour
→ family links it to an old disappearance
→ exact EMPTY adventure cave
→ old remains + signet
→ choose who receives the signet
```

## NPCs and clue

Use generated NPCs with stable `NpcId`s.

- initial giver: prefer adult `hunter` or `woodcutter` who knows the area;
- claimant A: adult from one generated household/family;
- claimant B: another adult from the same family when available.

The giver knows the cave but not the identity of the remains. Claimant A explains that an ancestor vanished years ago carrying a recognizable family signet. If only one suitable family adult exists, expose only two outcomes; do not invent a claimant.

## Cave and physical content

Bind a separate `adventure` cave whose `world-terrain-028` profile is `EMPTY`. Never share `quests-progression-008`'s `QUEST_TREASURE` cave or a `DOUBLE_TREASURE` cave.

Claim one unclaimed anchor: prefer `sideTreasure`, otherwise `finalTreasure`. Place world-owned remains plus one fixed `WorldGeneratedContainers` cache containing modest incidental loot and one physical reusable `signet_ring`.

The signet exists before quest acceptance. Prefer deterministic item-instance identity if jewelry is instance-backed at implementation time.

## Stages

1. area-aware giver reports old human traces in the cave;
2. claimant A connects them with the family story;
3. Player explores and loots the exact remains cache;
4. claimant B may present a competing family claim if such an NPC exists;
5. resolve possession of the signet.

## Outcomes

- `return_to_first_claimant`: hand over the physical signet; strongest relation/trust/benevolence result.
- `give_to_second_claimant`: only when claimant B exists; hand the same signet to B, improving B relation and reducing A relation.
- `keep_signet`: report the remains but keep the item; weaker or negative relation/integrity result.

Do not duplicate the signet or cave loot through `QuestReward`.

## Ownership / reuse

QuestManager owns progress/outcome only; settlement systems own NPC identity; cave/world composition owns profile and anchors; `WorldGeneratedContainers` owns the remains cache; inventory owns the signet; social systems own consequences.

Reuse `quests.ts`, `QuestManager.ts`, generated-NPC opportunity/materialization patterns, `createApp.ts`, `worldBundle.ts`, `createCaves.ts`, `caveContentAnchors.ts`, `worldGeneratedContainers.ts`, household/NPC descriptors and current item-instance contracts.

Add JSDoc for important reusable/public additions with appropriate `@domain` tags.

## Verification

Test deterministic NPC selection, separate `EMPTY` adventure cave binding, no collision with quest 008, pre-existing remains/signet, physical hand-in vs keep semantics, distinct outcomes and save/load/rebuild persistence. No live trapped NPC, required combat, hardcoded coordinates or forced third claimant.

Manual browser verification remains the User's responsibility.

> **Zrób git commit i push do main, rebase jeżeli trzeba**