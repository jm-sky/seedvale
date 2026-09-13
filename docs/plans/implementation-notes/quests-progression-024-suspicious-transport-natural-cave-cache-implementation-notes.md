# Implementation notes: quests-progression-024 — Suspicious transport natural cave cache

**Reviewed:** 2026-09-13  
**Plan:** `docs/plans/quests-progression-024-suspicious-transport-natural-cave-cache.md`  
**Baseline:** `main` at `b1bd97790c6aabbb727a08d7c756eac752b38e8f`

## Main recon findings

- Keep one `suspicious-transport` matrix id and quest id. `collectSuspiciousTransportCandidate()` already deterministically binds the counterpart in `sourceId`; `materializeRpgQuestOpportunity()` then resolves the trader giver. Add a variant/binding input to materialization rather than a second RPG candidate/catalog quest.
- `world-terrain-028` is implemented: natural caves expose `loot` / `storyFind` anchors with authoritative underground Y. Use `Caves.archetypeOf()` + `contentAnchorsOf()`; never derive cave coordinates in quest code.
- Important mismatch: `caveAdventureContentPolicy.ts` accepts anchor claims only when the anchor belongs to an `adventure` cave. It cannot arbitrate the natural anchor needed here. `quests-progression-023` has the same natural-cave collision problem; share one small pure authored-content arbiter/claimed-anchor composition seam between 023/024. Do not create a second persisted claim registry.
- `WorldGeneratedContainers` already persists mutable container contents and `loot_world_container` already uses live authoritative container state/catch-up. A fixed cave cache therefore fits the existing lifecycle.
- Current suspicious-transport completion is dialogue-only. Physical hand-in/keep requires a reusable inventory-gated terminal action; do not resolve an outcome first and remove items afterward.

## Variant and deterministic binding

Resolve whether an eligible `suspicious-transport` opportunity becomes the cave-cache variant during world/quest composition, not inside `QuestManager` and not from player/camera distance.

Recommended derived binding:

```ts
{
  questId,
  giverNpcId,
  counterpartNpcId,
  caveId,
  caveLocationId: `cave:${caveId}`,
  lootAnchorId,
  cacheContainerId,
  evidenceInstanceId?,
}
```

All ids are deterministic from existing quest/world identity and are reconstructed after load/rebuild. Persist only normal quest progress and container/inventory state.

For counterpart handling, preserve `opportunity.sourceId` whenever that NPC is a valid adult receiver. If a guard fallback is required, resolve it once in materialization from stable `OpportunityNpc` ordering and store only that derived binding. Do not make dialogue choose a different NPC later and do not special-case authored names.

## Natural cave claim

Select only accepted caves where:

- `archetypeOf(caveId) === 'natural'`;
- a usable `loot` anchor exists;
- that concrete anchor is not already claimed by another authored consumer.

Claim the anchor, not the whole cave. `quests-progression-023` needs `storyFind + loot` atomically, while this plan needs only `loot`; the shared arbiter must therefore resolve deterministic requests in stable reservation-key order and fail/skip conflicting requests explicitly.

Do not extend `CaveAdventureContentPolicy` by weakening its adventure-profile semantics. Either generalize only its anchor-claim portion into an archetype-neutral helper and keep adventure profile reservation separate, or reuse the shared natural-content arbiter introduced by 023.

## Cache materialization

Create one `WorldGeneratedContainerSpec` from the selected `loot` anchor:

- `id` derived from quest/binding identity, stable across rebuilds;
- `x/y/z/yaw` copied from the anchor;
- `spatialContext: { kind: 'cave', caveId }`;
- ordinary tradeable goods in `initialCounts`.

Materialize it regardless of quest offer/acceptance/stage. Saved container state must override initial payload exactly as today, so early discovery and looting cannot respawn goods.

If implementation needs an identifiable evidence/valuable item for `keep_goods`, use a real deterministic item instance. `WorldGeneratedContainerSpec` currently has no `initialInstances`; 023 already requires the same reusable addition. If 023 lands first, reuse it. Otherwise add optional `initialInstances` at the spec boundary so fresh specs seed instances but restored snapshots remain authoritative. Do not add a quest boolean for possession.

Prefer an existing instance-capable item semantics if one fits. Do not globally convert an unrelated count-based trade good solely for this quest.

## Reveal and stages

Use `revealLocationKnowledge(caveLocationId, ..., { setNavigation: true })` for the trader revealing the exact cave. Current quest dialogue progression does not own world-location side effects; reuse the generic injected quest-to-world reveal effect proposed/implemented for 023 rather than calling location systems from UI/materialization code.

Recommended cave variant flow:

1. normal suspicious-transport offer;
2. explicit trader dialogue action reveals the bound cave;
3. `loot_world_container` targets the exact cache and catches up from live container state;
4. terminal inventory-gated choice performs the hand-in/keep transaction and then resolves the existing matrix outcome semantics.

Do not use `discover_location` for the reveal: the giver already knows the exact cache and is intentionally revealing it.

## Physical outcome transaction

`talk_to_npc_choice` currently models choice by different NPC targets and resolves an outcome directly. The cave variant additionally needs possession validation and item mutation. Add/reuse one generic terminal dialogue action contract that can:

1. test required player item count/instance;
2. remove/transfer it atomically;
3. only on success resolve the authored outcome and consequences.

For `keep_quiet`, transfer the required goods/evidence to the trader. For `report_it`, transfer them to the bound counterpart/guard. If NPC personal inventory is used, reuse its existing player→NPC transfer helpers; otherwise an explicit quest hand-in removal seam is acceptable if the item is narratively consumed by the receiver. Never award the same goods again through `QuestReward`.

Add `keep_goods` only if the identifiable item instance can be reliably tracked through container → player → save/load. That outcome must leave the instance in player inventory and apply only social consequences. If identity support is not ready, omit the outcome rather than infer possession from a generic stack count.

## Integration points

Primary files/symbols:

- `src/quests/opportunities/rpgQuestMatrices.ts` — preserve candidate/id generation;
- `src/quests/opportunities/rpgQuestMaterialization.ts` — variant composition and generated NPC binding;
- `src/quests/quests.ts` / `src/quests/QuestManager.ts` — reusable reveal/terminal inventory-action contract only;
- `src/world/caves/caveContentAnchors.ts` — read anchor contract only;
- `src/world/caves/caveAdventureContentPolicy.ts` — do not misuse adventure-only claim validation;
- `src/world/worldGeneratedContainers.ts` — cache persistence and optional shared `initialInstances` extension;
- `src/app/createApp.ts` / `src/app/worldBundle.ts` — deterministic authored-content composition and live injected world effects;
- location knowledge/navigation seam used by `revealLocationKnowledge()`.

## Tests worth adding

- same world/opportunity reconstructs the same variant, giver, receiver, cave, anchor and container ids;
- only natural `loot` anchors are eligible and conflicts with 023/other authored claims fail/skip deterministically;
- cache exists before acceptance with exact cave Y/spatial context;
- saved/early-looted cache does not reseed on load or `WorldBundle` rebuild;
- reveal effect targets `cave:<caveId>` exactly once and sets navigation;
- `loot_world_container` catches up when the cache was looted before the stage became active;
- hand-in outcome cannot resolve without the required physical item and successful removal/transfer;
- `keep_goods`, if implemented, preserves the exact instance and never duplicates reward/content;
- base non-cave `suspicious-transport` behaviour/id remains unchanged.

## Model recommendation

**Model:** Opus, Sonnet

The implementation crosses deterministic opportunity materialization, shared authored cave-content arbitration, persistent underground containers, quest side effects and atomic physical outcome handling. Opus is the safest primary choice; the concrete seams above keep Sonnet a reasonable cheaper fallback.

> **Zrób git commit i push do main, rebase jeżeli trzeba**