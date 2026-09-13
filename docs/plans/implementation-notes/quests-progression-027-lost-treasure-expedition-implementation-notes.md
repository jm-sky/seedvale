# Implementation notes: quests-progression-027 lost treasure expedition

**Reviewed:** 2026-09-13  
**Plan:** `docs/plans/quests-progression-027-lost-treasure-expedition.md`  
**Baseline:** `main` at `aa2e7d75547627883578d856f914389363f19a32`

## Dependency status

- `world-terrain-028` is implemented and `verification needed`. Dungeon caves already expose deterministic `storyFind`, `loot`, `sideTreasure` and required `finalTreasure` anchors through `Caves.contentAnchorsOf()`.
- `fauna-027` is implemented in code and `verification needed`. Dungeon residents are ordinary fauna-owned persistent `AnimalAgent`s; this quest must not spawn, own, reset or require killing them.
- `quests-progression-026` is still planned. Its notes reserve side/deep cache space and explicitly leave `finalTreasure` to this quest. Both plans need the same generalized cave-anchor claim seam, so do not add a second reservation mechanism here.

## Shared cave claims must be generalized first

`src/world/caves/caveAdventureContentPolicy.ts::resolveCaveAdventureContentPolicy()` currently validates `anchorClaims` only against `adventureCaveIds`; a dungeon anchor returns `cave_not_adventure`.

Generalize only the **anchor-claim** part to all supplied `CaveContentAnchor`s. Keep adventure profile reservation and the `EMPTY` / `QUEST_TREASURE` / `DOUBLE_TREASURE` roll adventure-only. Preserve sorted reservation arbitration, stable reservation keys, `claimOf()` and explicit unresolved conflicts.

This quest should claim every anchor it materializes: the selected ordered `storyFind` trail and the exact `finalTreasure`. Claim ids must derive from stable cave/anchor identity, not array position. If 026 and 027 select the same dungeon, their disjoint claims must coexist; any accidental overlap must fail explicitly.

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

## Journal and personal effects require instance-backed initialization

`src/world/worldGeneratedContainers.ts::WorldGeneratedContainerSpec` currently supports `initialCounts` only. Restored containers already preserve `instances`, but a fresh spec cannot seed exact instances.

Add the same minimal generic seam needed by 026, e.g. `initialInstances?: readonly ItemInstance[]`, and pass it only when no saved container record exists. Saved mutable state must win completely on load/rebuild.

The expedition journal should be a dedicated instance-backed story item with a deterministic instance id tied to this binding. Personal effects should also be instance-backed if they participate in an exact hand-in; do not use generic count-backed loot if the quest must prove ownership of the specific expedition record.

The final treasure itself can remain ordinary authored loot unless the design needs identity for another system. `WorldGeneratedContainers` remains the mutable-content owner.

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

## Exact journal hand-in must reuse Player → NPC transfer

`src/app/actions/npcItemTransfer.ts::giveItemInstanceToNpc()` already performs atomic single-instance ownership transfer into `NpcAuthoritativeState.personalInventory`, preserving concrete identity.

Inject a narrow quest hand-in callback that delegates to this primitive; do not mutate player/NPC inventories inside `QuestManager`.

For `journal_to_family`, if both journal and personal effects are mandatory, avoid a partial two-item transfer. Either add a small atomic multi-instance transfer primitive in the existing inventory-transfer layer or validate both destination capacity/source ownership before committing both. Do not transfer the first item and then discover the second cannot move.

`journal_to_sponsor` transfers only the exact journal if that is the authored requirement. `keep_journal_and_treasure` performs no inventory mutation.

Resolve the terminal outcome only after the required physical transfer succeeds.

## Consequences and rewards

Use normal `QuestOutcome` / `QuestConsequences`:

- relation delta to sponsor and/or second stakeholder through stable `QuestNpcRef`;
- existing settlement reputation dimensions / renown through the injected reputation seam;
- direct coin/items through ordinary quest reward handling.

Do not create expedition-specific trust/reputation storage. Verify the actual `ReputationDimension` names before assigning values.

The player always keeps the final treasure; no outcome should remove or respawn it.

## Persistence / rebuild traps

- Quest progress persists; dungeon selection, stakeholder selection and anchor claims should reconstruct deterministically and stay unpersisted.
- Container mutable state persists. Fresh `initialInstances` must never be merged back into an existing saved container.
- Journal/effects moved to player or NPC inventory must not reappear in their source container after `WorldBundle` rebuild.
- Do not infer quest progress from fauna state; dungeon residents may independently die, move or survive.
- Do not depend on 026 implementation order. Shared anchor arbitration must support both reservation sets deterministically whether 026 is present now or added later.

## Suggested implementation order

1. Generalize cave anchor claims beyond adventure caves and add 026/027 coexistence tests.
2. Add fresh-spec instance seeding to `WorldGeneratedContainers` with no-respawn save/rebuild tests.
3. Add story item kinds and deterministic dungeon/anchor/stakeholder binding helper.
4. Materialize all expedition containers/content before quest construction.
5. Build the contextual `QuestDef` and live-state catch-up objectives.
6. Wire exact physical hand-in and terminal outcomes/consequences.

Focused tests should cover deterministic stakeholder/dungeon selection, ordered story anchors, unique `finalTreasure` claim, coexistence with 026, pre-looted stage catch-up, journal identity through container → player → NPC, missing second stakeholder, no duplication after save/load/rebuild, and fauna independence.

> **Zrób git commit i push do main, rebase jeżeli trzeba**