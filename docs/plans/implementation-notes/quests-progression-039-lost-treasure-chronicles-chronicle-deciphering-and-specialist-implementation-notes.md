# Implementation Notes: quests-progression-039 — Lost Treasure Chronicles chronicle deciphering and specialist

Recon baseline: current `main` on 2026-09-15. Plans `quests-progression-037` and `quests-progression-038` are still `planned`; their implementation notes exist, but their authored elder/archaeologist, story binding, encoded chronicle and related world-content seams are not landed in code yet. `039` is therefore implementation-blocked by both dependencies. Implement against their final exported APIs; do not pre-implement or duplicate them here.

## 1. Extend the 037/038 story binding; do not add another authored-NPC mechanism

037/038 notes already establish the intended direction: deterministic authored-resident injection before `VillagePlan`/stable `NpcId` derivation, then contextual quest materialization from a reconstructable story binding.

When those plans land, extend the same binding with the specialist. The resolver should consume real generated settlement data and return stable `settlementId`, `npcId` and household ownership information. Prefer an existing eligible normal adult resident only if the landed authored-resident contract explicitly supports reserving that identity safely; otherwise inject one deterministic authored resident through the same seam used by elder/archaeologist.

Placement should be deterministic and bounded. Prefer a settlement distinct from elder/archaeologist, but fall back to the archaeologist's suitable settlement instead of forcing a third settlement or changing worldgen. Never resolve by display name or streaming order.

Keep all story ids/constants in the Lost Treasure Chronicles module/binding established by 037/038 so later chapters import one source of truth.

## 2. Entry/catch-up must be exact chronicle ownership, not only quest-038 completion

038 intends one stable identity-backed `encoded_chronicle` instance. Reuse that exact exported `instanceId`.

Current quest dialogue actions already support `requireItemInstanceId`; item-instance ownership lives in `Inventory`. Use live ownership as the physical gate when the archaeologist continuation is selected. A completed 038 outcome may gate narrative availability, but it is insufficient by itself if the chronicle has since left player ownership.

If 038 lands a reusable exact-instance inventory objective/catch-up helper, use it. Otherwise keep the check interaction-time/event-driven; do not add per-frame scans or a `decodedChronicle` flag.

The Player should retain the chronicle in V1. There is no architectural reason in current code to hand it to the specialist temporarily.

## 3. Quest flow: use stage dialogue actions, not `talk_to_npc_choice` for pay-vs-favour

`talk_to_npc_choice` currently models terminal choices tied to distinct NPC targets. Both routes here originate from the same specialist and one route continues into a favour, so use `QuestStage.dialogueActions` for the explicit choice.

Recommended shape:

1. archaeologist dialogue action, gated by exact chronicle instance, advances to specialist;
2. specialist stage exposes two explicit actions: pay now or request/help with the missing reference;
3. pay route resolves deciphering immediately; favour route advances to one small recovery/return stage;
4. final deciphering outcome reveals the search-area knowledge and completes.

Do not persist a separate route boolean. The active stage and terminal outcome already encode the route. Give paid/favour terminal outcomes distinct ids so relation consequences remain exact-once and inspectable by later chapters.

## 4. Paid service: specialist `personalInventory` is the current correct owner

Current code has two relevant precedents:

- `src/app/actions/workContractPayment.ts::payWorkContractAssignment()` pays a real NPC by atomically moving `coin` from player inventory into `NpcAuthoritativeState.personalInventory`;
- generic NPC trade also settles money into the interacting NPC's own personal inventory.

Therefore, for an ordinary authored specialist, `personalInventory` is the correct V1 destination unless 037/038 materially change authored NPC ownership. Reuse `src/items/inventoryTransfer.ts::transferInventoryCount()`; it preflights source/destination and preserves all-or-nothing ownership transfer.

Do **not** use merchant stock, settlement bulk economy, household stock or a story wallet for this private service.

Current `QuestStageEffect` has no stacked-item transfer effect and its existing effects are applied through quest lifecycle hooks. Do not hide a coin mutation in UI code. Prefer the smallest generic quest-resolution extension that can fail before terminal outcome/consequences are committed:

- a reusable physical predicate for `item kind + count` ownership/capacity; and
- a reusable stacked inventory transfer to a target NPC, implemented with `transferInventoryCount()`.

If the landed 038/other intervening work already generalizes `QuestPhysicalOutcomeResolver` for this, reuse it. Otherwise add only the minimal generic seam; avoid another quest-id switch in `createApp.ts` and avoid a `ServiceManager`.

Exact-once rule: transfer succeeds first, then the paid outcome becomes terminal. A failed transfer must leave quest state, relations and coins unchanged. Save/load needs no payment flag because the terminal quest outcome plus persisted inventories are sufficient.

### Fee calibration

`MERCHANT_PRICES` currently puts common tools around 8–30 coins, `map_far` at 35, a short bow at 45 and basic skill books around 20–30. Start testing the deciphering fee around **30–40 coins**; keep the exact constant next to this story definition, not in the merchant catalog. Optional relation-based discount should be a pure price resolver, not another state variable.

## 5. Reference-document favour: one exact instance, one existing ownership path

Make the reference document identity-backed and give it one deterministic story instance id. Do not use a count-only generic book kind if later return must prove that exact document.

Prefer the smallest source that 038 already establishes cleanly:

- an exact instance in a `WorldGeneratedContainerSpec`, or
- an exact instance owned by a deterministic normal NPC if the landed NPC-inventory seeding seam is declarative and persistence-safe.

Do not create a second investigation system. A nearby stable container is lower-risk than adding authored NPC inventory seeding solely for this favour.

The return action should use the existing exact-instance quest contract: `requireItemInstanceId` plus terminal `QuestStageEffect { type: 'transfer_item_instance', ... }`. `QuestManager` already routes that effect through the injected item-instance transfer seam; keep the specialist as the destination owner. If the document was obtainable before the favour stage, live exact-instance ownership should allow immediate catch-up to the return action.

## 6. Search-area knowledge needs one deliberate world-location extension

Current `WorldLocation` is a point only (`id`, `kind`, `x`, `z`, `name`, `discoveryWeight`) and `WorldLocationKind` has no region/search-area kind. `LocationKnowledge` therefore cannot currently represent a bounded area by merely revealing an existing point location.

Do not fake this with an exact estate waypoint. Add the smallest reusable representation for approximate search knowledge. Preferred direction:

- extend world-location data with an optional bounded area shape (V1 circle: center + radius is sufficient), while retaining `x/z` as the label/navigation center;
- add a semantically appropriate reusable kind only if rendering/filtering needs one; otherwise keep area geometry orthogonal to kind;
- make the area deterministic from world/story binding and resolvable by `WorldLocationCatalog.getById()` across reloads;
- let existing `LocationKnowledge` continue persisting only the stable location id.

This avoids a second knowledge registry and lets map/navigation presentation learn to render an approximate area without knowing Lost Treasure Chronicles ids.

The story binding must choose the historical estate search area during deterministic world/story composition, before dialogue. Plan 040+ can later choose/materialize the actual estate inside that area without changing what 039 revealed.

Do not reuse `DARK_FOREST_TREASURE_LOCATION_ID` from quests-progression-009: that is different authored content and would collapse two stories onto one point.

## 7. Search-area binding must be deterministic but need not materialize the estate

Resolve a bounded dark-forest-compatible area from deterministic terrain/world data, not from loaded chunks and not at dialogue time. Keep the resolver pure from `(world seed, stable story inputs)` and use stable candidate ordering/tie-breaks.

039 owns only the historical area id/geometry. It must not create estate props, containers, fauna or exact estate coordinates exposed to the player. It is acceptable for the next plan to derive the exact estate placement deterministically from the same area binding.

If no current cheap biome-region abstraction exists when implementation starts, choose a deterministic area center from bounded terrain samples and store only reconstructable geometry in the story/location adapter; do not invent a global biome-region manager for this chapter.

## 8. Relations/reputation

Use normal `QuestConsequences` and existing relation thresholds (`acquainted` 1, `friendly` 3, `trusted` 6).

Recommended V1 remains:

- paid route: specialist relation `+1`, no public reputation;
- favour route: specialist relation `+2`; at most a small `benevolence` or `competence` change if the authored favour is plausibly public.

Do not create specialist affinity or scholar reputation. If relation-based discount is implemented, calculate it from the live relation level when the pay action is rendered/selected and re-read it on selection.

## 9. Persistence/lifecycle boundaries

No new save schema should be necessary beyond any generic world-location shape metadata if that shape is not reconstructable by id. Prefer reconstructable catalog data so `LocationKnowledge` keeps persisting ids only.

Existing owners remain authoritative:

- player inventory: chronicle/reference/coins before transfer;
- specialist `personalInventory`: paid coins and returned reference document;
- `QuestManager`: route/outcome + Player↔NPC relation;
- `ReputationManager`: settlement social effects;
- `LocationKnowledge`: revealed search-area id.

Do not respawn the specialist if dead. The quest may become unavailable/blocked through ordinary lifecycle; this plan does not add succession.

## 10. Focused implementation order

1. After 037/038 land, extend their deterministic story binding with specialist identity and search-area truth.
2. Add the minimal generic bounded-area world-location representation and map/navigation support needed to reveal it.
3. Materialize the quest defs using existing contextual composition before `QuestManager` construction.
4. Add the generic atomic stacked-payment resolution seam and wire the paid dialogue outcome.
5. Add one identity-backed reference document/source and return it through the existing instance-transfer effect.
6. Add focused tests for exact-once payment/transfer, route choice, catch-up and search-area persistence/reconstruction.

## 11. Tests worth adding

Prioritize invariants across systems:

- same seed reconstructs the same specialist `NpcId`, settlement and search-area id/geometry;
- no forced third settlement and no duplicate authored resident;
- 038 complete without exact chronicle ownership cannot advance; early exact ownership can;
- pay action with insufficient coins mutates neither inventory nor quest/consequences;
- successful payment transfers the exact count once into specialist `personalInventory` and cannot replay after restore;
- both pay and favour are explicit actions when both are available;
- reference instance can be acquired early, returned once, and ends in specialist ownership;
- paid and favour routes apply distinct relation consequences once;
- deciphering reveals the bounded area through `LocationKnowledge`; save/load/rebuild resolves the same area;
- the reveal does not create an estate object or exact estate waypoint.

## 12. Main risks

- **037/038 are not implemented yet.** Do not begin 039 by independently creating story NPCs/items/bindings.
- **Quest effects cannot currently transfer stacked currency atomically as a terminal precondition.** Add/reuse one generic failure-aware seam rather than UI mutation or quest-specific `createApp.ts` branching.
- **World locations are currently points.** A bounded search area needs a small reusable location-shape extension; revealing an exact coordinate would violate the plan's information boundary.
- **Physical ownership and quest outcome can diverge.** Always re-read exact chronicle/reference ownership at interaction time.

> **Zrób git commit i push do main, rebase jeżeli trzeba**