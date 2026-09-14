# Implementation notes: quests-progression-027 lost treasure expedition

**Reviewed:** 2026-09-14  
**Plan:** `docs/plans/quests-progression-027-lost-treasure-expedition.md`  
**Baseline:** current `main` recon on 2026-09-14

## Dependency status

- `world-terrain-028` is implemented and `verification needed`. Dungeon caves already expose deterministic `storyFind`, `loot`, `sideTreasure` and required `finalTreasure` anchors through `Caves.contentAnchorsOf()`.
- `fauna-027` is implemented in code and `verification needed`. Dungeon residents are ordinary fauna-owned persistent `AnimalAgent`s; this quest must not spawn, own, reset or require killing them.
- `quests-progression-026` is still planned. Its notes reserve side/deep cache space and explicitly leave `finalTreasure` to this quest. Both plans must reuse the same cave-anchor claim seam; do not add a second reservation mechanism here.

## Recon result — the three risky seams

The 2026-09-14 recon removes two previously assumed prerequisites and narrows the third:

1. **Anchor claims are already generalized.** `src/world/caves/caveAdventureContentPolicy.ts::resolveCaveAdventureContentPolicy()` validates `anchorClaims` against the full supplied `CaveContentAnchor[]`, independent of adventure-cave profile reservation. Dungeon anchors are therefore already valid claim targets.
2. **Fresh instance-backed container seeding already exists.** `src/world/worldGeneratedContainers.ts::WorldGeneratedContainerSpec` already exposes `initialInstances?: readonly ItemInstance[]`. `createWorldGeneratedContainers()` uses them only when no saved record exists; saved `counts` + `instances` remain authoritative.
3. **Single-instance Player → NPC transfer is already atomic and sufficient.** `src/app/actions/npcItemTransfer.ts::giveItemInstanceToNpc()` delegates to `src/items/inventoryTransfer.ts::transferInventoryInstance()`, which validates destination capacity before source mutation and rolls back if destination insertion fails. Keep terminal hand-in to the exact journal only; personal effects are optional evidence/loot and must not force a new multi-instance transaction API.

These are reuse constraints, not implementation tasks. Do not recreate or broaden them unless current code has materially changed.

## Cave anchor claims — reuse current contract

Use `CaveContentReservationRequests.anchorClaims` with stable `reservationKey` + exact `anchorId`.

Current guarantees in `resolveCaveAdventureContentPolicy()` that this quest should rely on:

- anchor claims are sorted by `reservationKey` before arbitration;
- any supplied cave archetype is valid if the `anchorId` exists;
- duplicate anchor ownership becomes explicit `anchor_already_claimed` unresolved state;
- missing anchors become explicit `anchor_not_found` unresolved state;
- `claimOf(reservationKey)` returns the resolved `{ reservationKey, anchorId, caveId }`;
- adventure content-profile reservation/roll remains adventure-only and is unrelated to dungeon anchor claiming.

This quest should claim every anchor it materializes: the selected ordered `storyFind` trail and the exact `finalTreasure`. Claim ids must derive from stable cave/anchor identity, not array position.

If 026 and 027 select the same dungeon, their disjoint claims must coexist; accidental overlap must fail explicitly. Add/extend focused policy tests for that coexistence, but do not change the reservation architecture.

## Dungeon selection and ordered trail

Select from real caves where `Caves.archetypeOf(caveId) === 'dungeon'` and inspect `Caves.contentAnchorsOf(caveId)`; never derive underground coordinates from chamber centres or topology node Y.

Required binding:

- one usable early `storyFind` for abandoned-camp content;
- one later `storyFind` for leader pack/journal;
- one deeper/final `storyFind` for expedition evidence;
- one `finalTreasure` for the actual treasure.

Use `sourceNodeId` / dungeon chamber semantics to order the `storyFind` anchors from shallower to deeper progression rather than relying on returned-array order. If the current anchor data cannot prove a stable depth/order, add the smallest cave-owned ordering helper from existing `dungeonChambersOf()` semantics; do not copy chamber arrays or coordinates into quest state.

A dungeon missing the required anchor set is simply ineligible. Do not synthesize replacements.

## Physical world content must exist before quest acceptance

Materialize all four world-content steps in world composition before `createWorldGeneratedContainers()` and independently of quest lifecycle. Acceptance only reveals/progresses existing content.

Use stable container ids derived from cave id + claimed anchor id. All underground specs must keep the anchor's explicit `x/y/z/yaw` and cave `spatialContext`.

Early looting must catch up from authoritative container/inventory state. Never respawn or refill a container because the quest was accepted later or restored at an earlier stage.

## Journal initialization — reuse existing `initialInstances`

Do not add another world-container seeding seam. `WorldGeneratedContainerSpec.initialInstances` already exists and is used only for fresh containers.

Use it for the expedition journal:

- dedicated instance-backed story item;
- deterministic instance id derived from stable expedition binding, preferably dungeon id + journal role;
- seed through `initialInstances` only in the leader-pack container spec;
- saved mutable state must win completely on load/rebuild, so a journal moved to player/NPC inventory never reappears in the source container.

Personal effects may be instance-backed when useful for story identity, but they are not required for terminal outcome resolution. The final treasure may remain ordinary authored loot unless another system needs identity.

Add a focused regression test that constructs a fresh container with `initialInstances`, removes the journal, rebuilds from the saved container record, and proves the journal is not re-seeded.

## Stakeholder selection

Follow generated opportunity/materialization conventions rather than authored-name resolution:

- `src/quests/opportunities/rpgQuestMatrices.ts::adultOpportunityNpcs()` for a stable adult candidate pool;
- preferred-profession selection patterns in `src/quests/opportunities/rpgQuestMaterialization.ts`;
- stable generated `NpcId`, never display names.

Sponsor selection: prefer `trader`, then `miner`, then another suitable adult. Second stakeholder must be a different adult from another household when possible. Keep deterministic ordering/tie-breaking.

If no second stakeholder exists, materialize the reduced two-outcome definition as the plan requires; do not create a synthetic NPC.

Quest id must include stable world binding identity (at minimum dungeon id + sponsor id + optional stakeholder id) so persisted progress cannot attach to a different generated expedition after rebuild.

## Quest definition and progress

Materialize the contextual `QuestDef` before `new QuestManager(...)` in `src/app/createApp.ts`, like existing cave/world-context quests. `QuestManager` must not search caves, households or professions itself.

Reuse existing objective vocabulary:

- reveal/navigate to the exact dungeon through the existing location-knowledge/navigation seam rather than quest-owned coordinates;
- each authored container step should progress from exact `loot_world_container` state;
- final branching should use the existing dialogue-choice/outcome path.

The stage sequence should derive completion from live world content, not from a transient "opened" event. This is what makes pre-looted containers and save/load catch-up safe.

## Exact journal hand-in — single-instance only

The terminal transfer contract is intentionally narrow:

- `journal_to_family` transfers the exact journal instance to the second stakeholder;
- `journal_to_sponsor` transfers the exact journal instance to the sponsor;
- `keep_journal_and_treasure` performs no inventory mutation;
- personal effects are not mandatory hand-in items.

Reuse `src/app/actions/npcItemTransfer.ts::giveItemInstanceToNpc()`; it already:

- re-resolves the NPC by stable `npcId` at commit time;
- rejects missing/dead recipients;
- validates exact source instance ownership;
- validates destination capacity;
- delegates the atomic move to `transferInventoryInstance()`.

Inject a narrow quest hand-in callback that delegates to this primitive and returns success/failure. Do not mutate player/NPC inventories inside `QuestManager`.

Resolve the terminal outcome only after `giveItemInstanceToNpc()` returns `status: 'ok'`. On `source_missing`, `recipient_missing`, `recipient_dead` or `destination_full`, keep the quest unresolved and surface the normal failed-action path rather than granting rewards/consequences.

Do **not** add an atomic multi-instance transfer primitive for this quest. If future gameplay genuinely needs multi-item transactional hand-ins, plan that separately around the shared inventory-transfer layer.

## Consequences and rewards

Use normal `QuestOutcome` / `QuestConsequences`:

- relation delta to sponsor and/or second stakeholder through stable `QuestNpcRef`;
- existing settlement reputation dimensions / renown through the injected reputation seam;
- direct coin/items through ordinary quest reward handling.

Do not create expedition-specific trust/reputation storage. Verify the actual `ReputationDimension` names before assigning values.

The player always keeps the final treasure; no outcome should remove or respawn it.

## Persistence / rebuild traps

- Quest progress persists; dungeon selection, stakeholder selection and anchor claims should reconstruct deterministically and stay unpersisted.
- Container mutable state persists. Existing `initialInstances` must never be merged back into an existing saved container.
- Journal moved to player or NPC inventory must not reappear in its source container after `WorldBundle` rebuild.
- Do not infer quest progress from fauna state; dungeon residents may independently die, move or survive.
- Do not depend on 026 implementation order. Shared anchor arbitration must support both reservation sets deterministically whether 026 is present now or added later.

## Suggested implementation order

1. Add/extend only the focused 026/027 dungeon-anchor coexistence tests; no reservation refactor should be needed.
2. Add the journal no-respawn regression test around the already-existing `initialInstances` contract.
3. Add story item kind(s) and deterministic dungeon/anchor/stakeholder binding helper.
4. Materialize all expedition containers/content before quest construction.
5. Build the contextual `QuestDef` and live-state catch-up objectives.
6. Wire exact single-journal hand-in through `giveItemInstanceToNpc()` and terminal outcomes/consequences.

Focused tests should cover deterministic stakeholder/dungeon selection, ordered story anchors, unique `finalTreasure` claim, coexistence with 026, pre-looted stage catch-up, journal identity through container → player → NPC, failed journal hand-in without outcome resolution, missing second stakeholder, no duplication after save/load/rebuild, and fauna independence.

## Guardrails for implementation

- Do not generalize cave anchor claims again; current code already supports dungeon anchors.
- Do not add a second container instance-seeding API; use `initialInstances`.
- Do not add quest-owned inventory mutation.
- Do not add multi-instance atomic transfer solely for personal effects.
- Do not persist deterministic cave/stakeholder/claim bindings unless an existing persistence contract proves reconstruction unsafe.
- Do not make dungeon fauna quest-owned or completion-gating.
- Do not synthesize missing dungeon anchors.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
