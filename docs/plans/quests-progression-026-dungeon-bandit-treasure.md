# Plan: Bandit treasure — dungeon cave

**Created:** 2026-09-13
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** world-terrain-028, fauna-027
**Domain:** `quests-progression`
**Subdomains:** `quests` `relationships` `rewards`
**Tags:** `dungeon` `bandit-treasure` `loot` `choice`
**Roadmap:** -
**Model:** Opus, Sonnet

## Goal

Use a real dungeon as a historical bandit cache network. No living quest bandits: current residents remain fauna-owned animals.

```text
old bandit clue
→ exact dungeon
→ optional side caches
→ deep main stash + bandit ledger + marked valuable
→ decide what to do with identifiable stolen property
```

## NPCs and clue

Use generated NPCs with stable `NpcId`s.

- giver: prefer adult `guard`; fallback `hunter` or other adult who plausibly knows local routes/history;
- claimant: prefer an adult `trader` from the same settlement or nearby settlement.

The giver has an old report/rumour locating the historical hideout. The claimant does **not** initially know their property is there.

## Dungeon and loot layout

Bind one exact `dungeon` with `world-terrain-028` side/deep anchors. The quest may coexist with `quests-progression-027` in the same dungeon.

- side chambers: one or two optional fixed caches;
- deep chamber: main stash;
- never claim `finalTreasure`, reserved for stories that require the dungeon endpoint.

All caches are `WorldGeneratedContainers` and exist before quest activation.

The deep stash contains ordinary loot plus two story items:

1. a **bandit ledger** identifying at least one past robbery/owner;
2. one **marked valuable** tied to the claimant, using the smallest reusable physical item-instance representation available at implementation time.

Do not create quest-only inventory state.

## Stages

1. generated giver reveals the exact dungeon;
2. Player explores optional side caches;
3. Player loots the exact deep stash;
4. ledger identifies the generated trader/claimant;
5. Player chooses what to do with the marked valuable and evidence.

Dungeon residents are never required kills and may already be absent/dead.

## Outcomes

### `return_marked_property`

Give the physical marked valuable to its claimant and report the ledger. Strong trust/integrity/benevolence result and claimant relation gain. Player keeps ordinary bandit loot.

### `give_evidence_to_guard`

Hand the ledger and marked valuable to the guard/giver for formal recovery. Stronger competence/integrity/renown result; smaller claimant relation gain; physical items leave Player inventory.

### `keep_marked_property`

Keep the valuable and do not surrender the evidence. The item remains with Player; no duplicated reward. Lower/negative integrity/trust outcome and no claimant reward.

If current systems cannot support all three physical hand-ins safely, implement the first and third outcomes first; do not fake the middle path with quest flags.

## Ownership / reuse

QuestManager owns progress/outcome only; generated NPC systems own identities; cave world owns anchors; `WorldGeneratedContainers` owns caches; inventory owns ledger/valuable; fauna owns residents; social systems own consequences.

Reuse generated-NPC opportunity patterns, `quests.ts`, `QuestManager.ts`, `createApp.ts`, `worldBundle.ts`, `createCaves.ts`, `dungeonChambers.ts`, `caveContentAnchors.ts`, `worldGeneratedContainers.ts`, item-instance contracts and `revealLocationKnowledge.ts`.

Add JSDoc for important reusable/public additions with appropriate `@domain` tags.

## Verification

Test dungeon-only binding, deterministic guard/trader selection, side caches optional, deep stash exact, no `finalTreasure` claim, physical return/guard/keep outcomes, distinct social consequences, fauna independence and no loot duplication after save/load/rebuild.

Manual browser verification remains the User's responsibility.

> **Zrób git commit i push do main, rebase jeżeli trzeba**