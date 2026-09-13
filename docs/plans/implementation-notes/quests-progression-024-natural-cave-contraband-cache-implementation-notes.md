# Implementation notes: quests-progression-024 natural cave contraband cache

**Reviewed:** 2026-09-13  
**Plan:** `docs/plans/quests-progression-024-suspicious-transport-natural-cave-cache.md`  
**Baseline:** `main` at `b0d2cb0fd51214c6bb30f194607aa6a599127e18`

## Main recon findings

The plan filename has changed since the index/request wording: the live source plan is `quests-progression-024-suspicious-transport-natural-cave-cache.md`. Treat it as the source of truth; do not create a second quest/plan implementation under the old name.

`world-terrain-028` is already implemented. Natural caves now expose strict, semantic `storyFind` / `loot` anchors through `Caves.contentAnchorsOf()`, and `WorldGeneratedContainerSpec` already supports explicit underground `y` plus cave `WorldSpatialContext`. Do not invent underground coordinates in quest code.

One important dependency gap remains: `src/world/caves/caveAdventureContentPolicy.ts` validates `CaveContentAnchorClaimRequest` only against `adventureCaveIds`; a natural-cave anchor currently resolves as `cave_not_adventure`. Before this quest can reserve a natural `loot` anchor, generalize the anchor-claim half of that policy to all supplied cave anchors while keeping profile reservations adventure-only. Do not add a quest-local claim registry.

## Opportunity and binding

Keep `suspicious-transport` as the existing `RpgQuestMatrixId`. Current flow is:

- `rpgQuestMatrices.ts` creates an opportunity whose `sourceId` is the counterpart NPC id;
- `rpgQuestMaterialization.ts` re-finds that counterpart and deterministically picks the trader giver;
- `materializeSuspiciousTransport()` currently creates the two dialogue outcomes directly.

Do not overload `sourceId` with a cave id. Preserve NPC identity semantics and add the cave-variant binding as explicit materialization/world-composition data. The stable opportunity id must remain unchanged for the same matrix/settlement/counterpart.

If the counterpart is unsuitable for the report hand-in, resolve a replacement adult guard in `rpgQuestMaterialization.ts` with one reusable deterministic selector. Do not special-case reserved names.

## Natural cave selection / claim

Select from accepted caves only, requiring:

- `caves.archetypeOf(caveId) === 'natural'`;
- one concrete `loot` anchor from `caves.contentAnchorsOf(caveId)`;
- successful shared anchor claim for a stable reservation key owned by this story variant.

Selection must be deterministic and fail closed when no eligible unclaimed natural anchor exists; in that case materialize the normal existing suspicious-transport form instead of spawning an unbound/overlapping cache.

The claim key should be derived from stable story/opportunity identity, not NPC display names or array position. Claims are derived world composition, not save state.

## Cache materialization and persistence

Create the cache spec before quest acceptance, alongside the other `WorldGeneratedContainers` specs in `worldBundle.ts`. Use the claimed anchor's exact `x/y/z/yaw` and cave spatial context. `WorldGeneratedContainers` already restores saved contents by stable container id and is saved through `saveState.ts`; do not add quest persistence for cache contents.

Use a deterministic cache/container id derived from the reservation/opportunity identity and claimed anchor. Never reuse the raw anchor id if another story/system may also materialize content there.

The cache should contain ordinary tradeable stack items plus at most one dedicated hand-in item. Avoid making the whole payload quest-only: ordinary goods remain real world loot even if found before acceptance.

`loot_world_container` already reads authoritative live container state through injected world progress and catches up after restore. Use it for the cache stage rather than a new "opened cave cache" flag/objective. Early looting must therefore advance/catch up from the same live container state.

## Physical hand-in / final choice

Current `talk_to_npc_choice` only selects an outcome; it does **not** consume inventory. Current `gather_item` can consume stack items, but only through the giver interaction path and cannot express "hand this same item to one of two different NPCs". Do not fake delivery with a dialogue-only choice.

Preferred reusable change: extend the choice/action contract with an optional inventory cost/hand-in requirement and make `QuestManager` validate possession, consume it, then resolve the selected outcome synchronously/exact-once. Reuse `Inventory.has/remove` semantics and prevalidate outcome/state before mutation, matching the established final `gather_item` atomicity rule.

Keep this generic to quest dialogue choices; do not add a contraband-specific callback or second delivery subsystem.

If a dedicated evidence/valuable kind is introduced, prefer a normal stack `ItemKind` unless instance identity is actually needed by gameplay. An instance-backed item would require a separate exact-instance hand-in contract; do not add that complexity solely for flavor.

Only enable `keep_goods` if the player can physically retain the same identifiable hand-in item while the other two branches consume it. `keep_goods` must not also grant a duplicate reward copy.

## Location knowledge

The giver's reveal should use the existing location/navigation knowledge layer, not quest-local map markers. The cave itself remains world-owned; quest progress only references its stable binding. Do not make map-cell exploration imply cave knowledge.

If no existing location id represents the exact cave, add the smallest reusable cave-location binding to the current world-location knowledge seam rather than storing coordinates in `QuestProgressEntry`.

## Existing systems to reuse

- `src/quests/opportunities/rpgQuestMatrices.ts` — opportunity generation and stable matrix identity.
- `src/quests/opportunities/rpgQuestMaterialization.ts` — giver/counterpart/guard selection and variant materialization.
- `src/quests/quests.ts` — `talk_to_npc_choice`, `loot_world_container`, outcomes/consequences.
- `src/quests/QuestManager.ts` — objective catch-up, inventory-backed turn-in and exact-once terminal resolution.
- `src/world/caves/caveContentAnchors.ts` / `createCaves.ts` — natural `loot` anchor authority.
- `src/world/caves/caveAdventureContentPolicy.ts` — extend shared anchor arbitration; keep adventure profile logic scoped to adventure caves.
- `src/world/worldGeneratedContainers.ts` — authoritative cache inventory + persistence/rebuild behavior.
- `src/app/worldBundle.ts` — deterministic world-content composition/materialization seam.
- existing location knowledge/navigation implementation — reveal exact destination.

## Pitfalls / tests worth pinning

- natural anchor claims work without changing adventure profile rolls or existing adventure claim behavior;
- same seed/opportunity resolves the same cave, anchor, giver, counterpart and cache id across rebuild/load;
- a claimed anchor cannot be reused by another authored consumer;
- absence/conflict of an eligible natural anchor falls back to the normal suspicious-transport variant;
- cache exists before acceptance; early loot is not respawned and stage catch-up works after acceptance/load;
- dialogue outcome cannot resolve without the required physical item;
- successful trader/report hand-in consumes exactly once before consequences; repeated interaction gives no duplicate reward/consequence;
- `keep_goods`, if implemented, leaves the item with the player and grants no duplicate value;
- no new save fields for cave claim, variant selection or cache contents beyond existing world-container persistence.

## Suggested implementation order

1. Generalize shared anchor-claim arbitration to non-adventure anchors without touching adventure profile semantics.
2. Add deterministic suspicious-transport cave-variant binding + claim and world cache spec.
3. Wire exact cave knowledge reveal and `loot_world_container` stage.
4. Add generic item-consuming dialogue choice/hand-in support.
5. Materialize the three outcomes and focused tests around early loot, rebuild/load and exact-once hand-in.

## Model recommendation

**Model:** Opus, Sonnet

The feature crosses procedural world-content arbitration, quest materialization, persistence-backed physical loot and atomic multi-NPC hand-in. The implementation is not large, but the ownership boundaries and regression risk justify Opus; with these notes and focused tests, Sonnet is the lowest-risk cheaper fallback.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
