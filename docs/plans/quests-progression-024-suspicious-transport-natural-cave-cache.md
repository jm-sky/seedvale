# Plan: Suspicious transport — natural cave cache variant

**Created:** 2026-09-13
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Model:** Opus, Sonnet
**Depends on:** world-terrain-028
**Domain:** `quests-progression`
**Subdomains:** `quests` `relationships` `rewards`
**Tags:** `natural-cave` `suspicious-transport` `trade` `choice`
**Roadmap:** -

## Goal

Do not add a second contraband quest. Extend the existing world-driven `suspicious-transport` matrix with a cave-cache variant that reuses its trader/counterpart conflict and outcomes.

Current overlap to avoid: existing `suspicious-transport` already chooses a real trader as giver, another generated NPC as counterpart and asks whether the Player keeps the matter quiet or reports it.

New variant:

```text
generated trader + suspicious transport opportunity
→ exact natural cave cache
→ recover physical goods/evidence
→ choose trader, counterpart/guard, or keep the valuable goods
```

## Opportunity / NPC binding

Keep the existing `RpgQuestOpportunity` / materialization path.

- giver remains the deterministically selected generated `trader`;
- counterpart remains the existing generated NPC chosen by the opportunity;
- if the current counterpart is not suitable for receiving recovered goods, prefer an existing adult `guard` only through a reusable materialization rule, not a hardcoded Marek branch.

Do not create a parallel authored quest catalog entry just for the cave version.

## Cave cache

When this matrix resolves to the cave variant, bind one deterministic unclaimed `natural` cave with a `world-terrain-028` `loot` anchor.

Create one fixed `WorldGeneratedContainers` cache there. It exists before quest acceptance and survives normal save/load. Payload uses ordinary tradeable item kinds plus one identifiable valuable/evidence item if required for the final choice.

The giver knows the cache location and reveals the exact cave through existing location/navigation knowledge.

## Stages

1. existing suspicious-transport offer/dialogue establishes the shady transaction;
2. giver reveals the natural cave cache;
3. Player loots the exact cache;
4. final choice resolves through normal quest dialogue/item transfer.

Early discovery/looting must read live container/inventory state and never respawn goods.

## Outcomes

Preserve existing matrix semantics and extend them physically:

- `keep_quiet`: deliver agreed goods/evidence to the trader; best trader relation, negative/weak counterpart integrity result;
- `report_it`: hand the relevant goods/evidence to counterpart/guard; stronger integrity/courage result, trader relation penalty;
- optional `keep_goods`: keep the identifiable valuable instead of handing it to either side; no duplicated reward and weaker/negative trust with both parties.

Only add `keep_goods` if the physical item hand-in/ownership contract is reliable at implementation time. Do not fake possession with a quest flag.

## Ownership / reuse

QuestManager owns progress/outcome only; opportunity/materialization owns generated NPC selection; cave world owns anchor; `WorldGeneratedContainers` owns cache state; inventory owns recovered items; social systems own consequences.

Reuse `src/quests/opportunities/rpgQuestMatrices.ts`, `rpgQuestMaterialization.ts`, `worldQuestOpportunityTypes.ts`, `quests.ts`, `QuestManager.ts`, `createApp.ts`, `worldBundle.ts`, `worldGeneratedContainers.ts`, `createCaves.ts` and location knowledge.

Current `caveAdventureContentPolicy` validates claims only for `adventure` caves. Natural-cave authored claims must use one shared archetype-neutral composition arbiter (also needed by `quests-progression-023`), not a quest-local or persisted claim registry.

Add JSDoc for important reusable/public additions with appropriate `@domain` tags.

## Verification

Test that this is a variant of `suspicious-transport`, not a duplicate quest; generated trader/counterpart ids remain stable; only a valid natural cave is used; cache exists before acceptance; early-loot catch-up works; physical hand-ins match outcomes; no goods or rewards duplicate after save/load/rebuild.

Manual browser verification remains the User's responsibility.

> **Zrób git commit i push do main, rebase jeżeli trzeba**