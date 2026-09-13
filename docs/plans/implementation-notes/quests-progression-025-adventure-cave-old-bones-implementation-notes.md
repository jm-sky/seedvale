# Implementation notes: quests-progression-025 — Old bones adventure cave

**Reviewed:** 2026-09-13  
**Plan:** `docs/plans/quests-progression-025-adventure-cave-old-bones.md`

## Recon summary

- `world-terrain-028` is implemented. `src/world/caves/caveAdventureContentPolicy.ts` already supports deterministic `EMPTY` / `QUEST_TREASURE` / `DOUBLE_TREASURE` profiles plus explicit anchor claims. `src/app/worldBundle.ts::caveTreasureContainerSpecs()` only materializes generic cave chests for `DOUBLE_TREASURE`.
- The policy is currently called with **no reservation requests**. This quest must become the first real consumer of that seam; do not infer exclusivity from existing generic chest presence after the policy has already resolved.
- Quest runtime is still `QuestDef` → `QuestManager`. Generated settlement NPCs use stable `NpcId`s from `settlementNpcId()` / flattened family order. `opportunityNpcsFromSettlement()` currently drops family identity, so it is insufficient for selecting two adults from one generated family.
- `signet_ring` does not exist in `ItemKind`/catalog. Current instance-backed kinds are keys, tents, traps, maintained weapons, liquid containers and armor.
- `WorldGeneratedContainerSpec` supports `initialCounts` only. Although `Inventory` already accepts `initialInstances`, world-generated containers do not yet expose that initialization seam.
- `QuestManager` has no generic terminal report-choice mechanism for multiple actions at one NPC. `talk_to_npc_choice` requires distinct NPC ids and resolves immediately; ordinary `ready_to_report` supports only a unique successful outcome. That does not directly express `return to A / give to B / keep`.

## Recommended composition

Implement a deterministic contextual quest binding, not an authored-name quest and not a runtime scan of loaded NPC agents.

Suggested derived binding:

```ts
{
  questId,
  settlementId,
  giverNpcId,
  claimantANpcId,
  claimantBNpcId?,
  caveId,
  anchorId,
  containerId,
  signetInstanceId,
}
```

Keep all of this derived from stable world/NPC identity. Persist only normal quest progress plus the existing world-container and inventory snapshots.

### Cave selection and reservation

The reservation must be resolved during world composition **before** `caveTreasureContainerSpecs()` runs.

Current order in `worldBundle.ts` is effectively:

```text
createCaves()
→ resolveCaveAdventureContentPolicy(..., no requests)
→ caveTreasureContainerSpecs()
→ createWorldGeneratedContainers()
```

Extend the generic world-composition input so `createApp.ts` can supply declarative cave reservation requests after caves/anchors exist but before policy/materialization resolves. Keep quest knowledge out of `world-terrain`: the world layer should receive only `CaveContentReservationRequests` (or a narrow callback producing them from `Caves`).

Use one stable reservation key for this story. Deterministically select an `adventure` cave that has an unclaimed `sideTreasure` anchor, falling back to `finalTreasure`. Reserve that cave as `EMPTY` and claim exactly that anchor. If reservation/claim resolution fails, omit the quest/content rather than silently sharing a `DOUBLE_TREASURE` or another authored anchor.

Do not use camera/player distance. Do not persist the selected cave/profile. Same seed + same reservation inputs must reconstruct the same binding.

Future cave stories need to arbitrate together. Keep selection able to consume an externally maintained set/order of already-reserved cave ids/anchor ids; do not bake “quest 025 owns the first adventure cave” into `world-terrain`.

After `WorldBundle` exists, reconstruct/read the resolved binding through `bundle.caveAdventureContentPolicy.claimOf(reservationKey)` plus `bundle.caves.contentAnchorsOf(caveId)`. Long-lived code must read the current bundle field after rebuild, not capture the previous policy object.

## NPC / family binding

Do not infer kinship from surname/name.

`SettlementDef.families` already provides the authoritative family grouping, while NPC ids are assigned by global flattened family order. Add a small reusable descriptor/helper that preserves both:

- stable `NpcId` using the exact same flattening/index rule as `settlementNpcId()`;
- family id/index;
- adult/child status;
- role/name for presentation/selection.

Selection should be deterministic from definition order:

1. choose claimant family with at least one adult; prefer a family with two adults so claimant B can exist;
2. claimant A = first eligible adult in that family;
3. claimant B = another adult from the same family, otherwise absent;
4. giver = different adult hunter if possible, then woodcutter, then another adult; do not synthesize an NPC if none exists.

Do not require the giver to belong to the claimant family. Keep claimant B optional exactly as the plan specifies.

## Signet and remains cache

Treat the signet as one physical instance; a count-backed `signet_ring` would make the two-family hand-off ambiguous if the player later owns another ring.

Add `signet_ring` as a normal reusable item kind and make it identity-backed with the existing generic `ItemInstance` shape; it needs no bespoke durability/state subtype. Use a deterministic id such as:

```text
quest:old-bones:<caveId>:signet
```

Extend `WorldGeneratedContainerSpec` with optional `initialInstances` and pass those into `Inventory` only when no saved container snapshot exists. Saved contents must remain authoritative so the signet cannot respawn after loot/load/rebuild.

The cache should use the claimed anchor's exact `x/y/z/yaw` and `spatialContext: { kind: 'cave', caveId }`. Incidental loot can stay count-based and modest.

No existing historical-bones/remains prop system was found. Do **not** create an NPC corpse/death lifecycle for this. Prefer the smallest presentation-only cave prop integrated with the existing cave prop/content-anchor presentation path; if no suitable asset exists, let the authored cache/interaction carry the evidence rather than adding a simulation subsystem.

## Quest flow and terminal choice

Reuse ordinary `talk_to_npc` and `loot_world_container` stages for the discovery chain. The cache must exist before the quest is offered/accepted.

Do not use `gather_item` for the signet: it is count-based and would accept any ring. Completion/handoff must check the exact deterministic instance id.

The final resolution needs a reusable explicit terminal-action seam. Smallest coherent extension is a report/outcome action contract on `QuestDef`/`QuestManager` that can expose several terminal actions at the relevant NPC while `ready_to_report`, each with:

- `outcomeId`;
- player line / optional NPC reply;
- optional availability predicate supplied through a narrow injected world/inventory lookup;
- optional pre-resolution transaction for physical item transfer/removal.

Do not overload `talk_to_npc_choice`: its current invariant is one choice per distinct NPC and validation rejects duplicate npc ids.

For this quest:

- `return_to_first_claimant`: action at claimant A; require exact signet instance in player inventory, transfer it to `NpcAuthoritativeState.personalInventory`, then apply outcome;
- `give_to_second_claimant`: only materialize when claimant B exists; same exact-instance transfer to B;
- `keep_signet`: action can be exposed while reporting the discovery to claimant A (or the agreed report NPC), resolves without removing the instance.

The item transaction must succeed **before** terminal state/consequences are committed. If the instance is missing, the hand-over action is unavailable/fails closed; never resolve and then discover the item could not move.

Reuse the existing player→NPC instance transfer path (`giveItemInstanceToNpc` / NPC personal inventory ownership) rather than deleting the ring into quest state. `QuestReward` must not duplicate the signet.

Use ordinary `QuestConsequences.relations` and settlement reputation/renown for the social outcomes. Keep consequence tuning in the quest definition, not in transfer code.

## World progress lookup

`QuestWorldProgressLookup.isWorldContainerLooted()` is currently wired specifically around the dark-forest treasure payload. For this quest, avoid another hardcoded branch in `createApp.ts` if possible: make world-container objective evaluation generic enough to ask whether the authored target payload/container condition is satisfied, or add the narrowest reusable lookup keyed by container id.

The important invariant is that opening the chest is not enough; the authored remains/signature payload must actually have been removed/looted according to the existing `loot_world_container` semantics.

## Rebuild / persistence traps

- Policy/profile/anchor binding is derived; no new save fields for cave selection or claims.
- The same reservation requests must be supplied on every `WorldBundle` rebuild before generic cave treasure materialization.
- `WorldGeneratedContainers` saved snapshot must override `initialInstances`; otherwise the signet duplicates.
- Player and NPC personal inventories already persist item instances; keep the deterministic signet id intact through clone/save/restore/transfer.
- Quest definitions rebuilt after load must select the same settlement/family/NPC ids. Never depend on currently loaded `Settlement`/`NpcAgent` objects.
- If the cave reservation or claimant binding cannot be reconstructed, fail closed/omit or invalidate rather than retargeting another cave/family for an existing active quest.

## Highest-value tests

- deterministic family/giver/claimant selection; claimant B absent when only one adult exists;
- stable NPC ids still match `settlementNpcId()` flattened order;
- selector chooses only `adventure` cave + preferred side/final anchor and emits `EMPTY` reservation + matching claim;
- claimed cave never gets generic `DOUBLE_TREASURE` chests; conflicts fail explicitly;
- cache exists before quest acceptance and keeps exact cave Y/spatial context;
- fresh container receives deterministic `signet_ring` instance; saved container snapshot suppresses re-seeding;
- exact signet survives container → player → NPC inventory and save/load;
- unrelated `signet_ring` instance cannot satisfy the hand-over;
- A/B/keep outcomes apply distinct relation consequences and never duplicate/remove the wrong item;
- rebuild with the same seed reconstructs the same cave/anchor/NPC binding and does not respawn the signet.

## Suggested implementation order

1. Add richer family-aware settlement NPC descriptors/selectors.
2. Add generic cave reservation request injection into `WorldBundle` composition and bind the old-bones cave/anchor.
3. Add `signet_ring` + `WorldGeneratedContainerSpec.initialInstances`, then materialize the cache before quest runtime.
4. Add the smallest reusable terminal report/outcome action + exact-instance transfer transaction.
5. Materialize the contextual `QuestDef`, wire generic world-container completion, and add focused tests.

## Model recommendation

**Model:** Opus, Sonnet

This crosses deterministic cave arbitration, world-bundle rebuild ordering, generated-family identity, item-instance persistence and quest terminal-action semantics. Opus is the safest primary implementation model; with the boundaries above, Sonnet is the cheaper fallback with limited extra risk.

> **Zrób git commit i push do main, rebase jeżeli trzeba**