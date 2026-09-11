# Quests / progression — current state

**Last verified:** 2026-09-12  
**Canonical scope:** implemented quest architecture, lifecycle, authored/dynamic quest definitions, objectives, dialogue actions, rewards/consequences, world-driven opportunities, persistence boundaries and integration seams.

This is a **current-state document**, not a roadmap or implementation history. When this file and code disagree, **the code wins**. Planned quest work remains in `docs/plans/`; design direction remains in `docs/vision/quests.md`.

## Read this before quest work

For most quest plans, start here instead of reconstructing the whole system from prior implementation notes.

Primary code:

- `src/quests/quests.ts` — quest contracts, validation, authored quest definitions and contextual quest builders/binders.
- `src/quests/QuestManager.ts` — authoritative quest progress, lifecycle, objective evaluation, dialogue overrides, rewards/consequences and quest-owned player↔NPC relation values.
- `src/quests/materializeAuthoredQuests.ts` — authored NPC display names → stable `NpcId` binding.
- `src/quests/opportunities/` — world-driven settlement opportunities and RPG quest matrices.
- `src/quests/settlementRatInfestation.ts` — pure completion/reminder helpers for the rat-infestation quest.
- `src/app/createApp.ts` — composition root: gathers/materializes quest definitions and injects world/system lookups into `QuestManager`.
- `docs/code-map/symbols/quests.md` — generated symbol-level navigation; useful for finding exact call sites, but not a replacement for this state document.

Tests are concentrated in `src/quests/*.test.ts` and `src/quests/opportunities/*.test.ts`, especially `QuestManager.test.ts`.

## Ownership boundary

`QuestManager` owns:

- `QuestProgressEntry` state for every materialized `QuestDef`,
- current stage index and terminal outcome id,
- quest-owned player↔NPC relation values used by quest availability/consequences,
- temporary runtime binding from an active animal-target objective to one concrete animal id,
- quest lifecycle transitions and exact-once terminal resolution.

It does **not** own the world problems or entities referenced by quests.

Fauna, settlements, world locations, inventory, reputation/renown, spawn-point destruction, rat infestation, location discovery, world containers and animal ownership stay authoritative in their existing systems. `QuestManager` reads/mutates those through injected callbacks/lookups rather than becoming a second simulation owner.

World-driven quest opportunities follow the same rule: the world owns the problem; the quest layer only detects a lightweight candidate, selects/materializes a normal `QuestDef`, and tracks player progress after that.

## Definition pipeline

There are several sources of quest definitions, but they converge on the same `QuestDef` + `QuestManager` lifecycle.

### Authored quests

`QUESTS` in `src/quests/quests.ts` is the main authored content catalog. It uses `AuthoredQuestDef`, where human-friendly NPC names may appear in authored content.

At composition root, `materializeAuthoredQuestDefs()` resolves every identity-bearing NPC name to one stable `NpcId` / `QuestNpcRef`. Missing or ambiguous names throw `AuthoredNpcResolutionError`; runtime matching never falls back to display name.

`giverName` remains presentation-only.

### Contextual authored quests

`src/quests/quests.ts` also builds/binds quests from real generated world context rather than hardcoding coordinates or runtime entity references. Current seams include:

- `buildLandmarkQuests()` — deterministic landmark lookup → contextual landmark quests;
- `buildDarkForestTreasureQuest()` / `bindDarkForestTreasureQuest()` — treasure-map/world-container chain;
- `buildHorseAcquisitionQuest()` — persistent horse reward target;
- `bindExactCaveQuests()` — binds authored cave-related content to exact generated cave/world context.

These still become ordinary `QuestDef`s before `QuestManager` is constructed.

### World-driven settlement opportunities

`src/quests/opportunities/` is a separate **candidate/materialization layer**, not a second quest runtime.

Flow:

```text
world/settlement state
→ lightweight SettlementQuestOpportunity
→ deterministic selection
→ materialization
→ normal QuestDef
→ QuestManager
```

Implemented opportunity sources/types:

- `wolf-den-pressure` — a real settlement-owned wolf-den/spawner problem;
- RPG matrices:
  - `old-place-secret`,
  - `suspicious-transport`,
  - `settlement-agreement`.

Important symbols:

- `collectSettlementQuestOpportunities()` / `collectWolfDenPressureOpportunities()`;
- `collectRpgQuestOpportunities()`;
- `selectSettlementQuestOpportunities()`;
- `materializeSettlementQuestOpportunity()` / `materializeRpgQuestOpportunity()`;
- `buildWorldDrivenSettlementQuests()`.

The opportunity record is data-only and is neither quest progress nor authoritative world state.

## Core lifecycle

`QuestState` currently supports:

```text
not_offered
→ offered
→ active
→ ready_to_report
→ complete | failed

active → invalidated   (when a required binding can no longer be trusted)
```

Meaning:

- `not_offered` — definition exists, but has not been offered; unavailable quests are hidden.
- `offered` — offer is currently exposed to the player.
- `active` — accepted and working through stages.
- `ready_to_report` — all stages cleared; terminal outcome still waits for report/choice.
- `complete` / `failed` — terminal outcome with `resolvedOutcomeId` when resolved through an authored outcome.
- `invalidated` — terminal no-reward state for a stale/untrustworthy binding; it is deliberately not an authored outcome.

Objective completion and quest resolution are distinct. Clearing the last objective does not itself imply reward/consequences unless the normal resolution path is reached.

## Stages and objective vocabulary

Each `QuestDef` contains ordered `QuestStage`s. Each stage has one objective plus player-facing description/reminder/progress/failure/dialogue text.

Implemented `QuestObjective` types:

### NPC/dialogue

- `talk_to_npc`
- `talk_to_npc_choice`

### Direct world interaction

- `interact_well`
- `interact_tree`
- `interact_spawner`
- `interact_landmark`

### Animals / fauna

- `spot_animal`
- `kill_target_animal`
- `clear_wolf_den`
- `find_animal`

### Inventory / collection / discovery

- `gather_item`
- `read_item`
- `discover_location`
- `loot_world_container`

### System/world-state conditions

- `resolve_storage_rat_infestation`
- `destroy_spawn_point`

Prefer extending/reusing these objective contracts before adding a parallel quest-specific mechanic.

## Animal/world bindings

Some objectives are authored by kind but bind to concrete world identity at runtime.

`kill_target_animal` and `find_animal` are bound by `QuestManager` to one concrete `AnimalAgent.animalId` through an injected resolver. `dangerous: true` can mark the selected target through another injected seam.

`clear_wolf_den` binds the den/spawner identity, not an arbitrary wolf individual.

`interact_landmark` uses a deterministic resolved `landmarkId`; it does not store a hardcoded coordinate.

World-driven quests additionally have a read-only `WorldQuestSourceLookup` with states:

- `untracked` — ordinary authored quest;
- `present` — source problem still exists;
- `resolved` — source was resolved externally;
- `absent` — expected source binding disappeared.

Unaccepted world-driven offers may disappear when their source disappears. Accepted quests may fail or invalidate depending on source status rather than pretending the player completed the world problem.

## Availability and prerequisites

`QuestAvailability` gates whether a `not_offered` quest may enter the offer lifecycle.

Implemented prerequisite types:

- player↔NPC relation level (`stranger`, `acquainted`, `friendly`, `trusted`),
- prior quest outcome id,
- settlement reputation dimension minimum,
- settlement renown minimum.

All prerequisites on a quest are ANDed. `quest_outcome.outcomeIds` is the local OR membership check.

Definitions are validated once after composition/materialization. Invalid quest/outcome references, invalid reputation/renown ranges, broken dialogue choices and malformed authored dialogue actions throw `QuestDefinitionValidationError` rather than being silently corrected.

Once a quest is already offered/active, later social-state drops do not retroactively revoke ordinary progress.

## Dialogue integration

Quest dialogue is an override layer on top of normal NPC dialogue, not a separate dialogue-tree engine.

`QuestManager.onInteract(npcId)` resolves quest-relevant actions by stable NPC id. Required active talk actions are collected across quest definitions before giver reminders/offers, preventing one quest's reminder from masking another quest's required conversation.

Explicit player action is required for authored speech that changes quest state:

- accepting/declining an offer,
- `talk_to_npc`,
- `talk_to_npc_choice`,
- final report/hand-in,
- stage `dialogueActions`.

Opening the dialogue UI by itself is not completion.

`QuestStage.dialogueActions` are deliberately small and non-terminal: selecting one advances the current stage and may apply normal `QuestConsequences`; it does not introduce a generic branching-dialogue scripting system.

Quest markers are derived from the same lifecycle. Required talk targets take precedence over generic giver/in-progress markers.

## Outcomes, rewards and consequences

Every quest has explicit authored `outcomes`.

`QuestOutcome` contains:

- stable outcome id,
- terminal state: `complete` or `failed`,
- optional result text,
- optional direct reward,
- optional cross-system consequences.

`QuestReward` currently represents direct item compensation and has `shown` / `hidden` presentation visibility.

`QuestConsequences` currently supports:

- player↔NPC relation deltas,
- settlement reputation-dimension deltas,
- settlement renown delta.

There is no implicit generic relation bump for giver/target and no global quest EXP reward. Consequences happen only through the authored consequence path.

A successful quest may additionally transfer a specifically bound persistent horse to player ownership (`horseRewardAnimalId`) through injected ownership/reservation seams.

## Persistence and rebuild behaviour

Persisted quest progress is represented by `QuestProgressEntry`:

- quest id,
- lifecycle state,
- stage index,
- optional `resolvedOutcomeId`.

Quest-owned player↔NPC relation values are also restored into `QuestManager`; legacy name-keyed relation entries are normalized to stable NPC ids where unambiguous.

Definitions themselves are rebuilt from deterministic/authored world state on boot; progress is then restored by quest id.

Important boundary: `QuestManager.animalTargets` is runtime-only and is not persisted. On restore/rebuild:

- deterministic livestock targets can be rebound;
- an active wild-fauna individual target cannot be assumed to be the same animal, because ordinary wild individual identity/death state is not persisted;
- such an untrustworthy active binding becomes `invalidated` rather than silently retargeting a different individual.

World/progression objectives (`discover_location`, `loot_world_container`, destroyed spawn points, rat infestation, etc.) use live injected authoritative state and may catch up after restore.

For the full save classification and schema ownership, see `docs/state/persistence.md` and `docs/architecture/ARCHITECTURE.md`.

## Important integrations

### NPCs

- stable `NpcId` is quest identity;
- normal dialogue can be overridden by quest actions;
- quest relations are one input into broader social behaviour/player standing, but NPC behaviour itself remains owned outside the quest system.

See `docs/state/npc.md`.

### Settlements / reputation

Settlement identity is attached at composition root where required. Reputation/renown remain owned by the reputation/social systems; quests only read prerequisites and apply authored deltas through injected seams.

See `docs/state/settlements.md`.

### Fauna

QuestManager does not scan fauna ownership internally. Target resolution, death/found events, wolf-den state, dangerous marking and ownership transfer are injected or reported from the fauna/world side.

See `docs/state/fauna.md`.

### Items / world containers / knowledge

Gathering reads player inventory; rewards grant through the existing item seam. Treasure/discovery objectives consume existing inventory actions, `LocationKnowledge` and world-generated-container state rather than quest-owned copies.

See `docs/state/player-systems.md` and `docs/state/world-locations.md`.

## Current content catalog

Do not treat old plans as the quest catalog.

Use these sources:

1. **Authored definitions:** `QUESTS` in `src/quests/quests.ts`.
2. **Contextual generated definitions:** `buildLandmarkQuests()`, `buildDarkForestTreasureQuest()`, `buildHorseAcquisitionQuest()`, `bindExactCaveQuests()` in the same file.
3. **World-driven definitions:** `src/quests/opportunities/`.
4. **Runtime truth:** the final materialized `QuestDef[]` assembled in `src/app/createApp.ts` before `new QuestManager(...)`.

Representative authored content includes simple delivery/world interaction quests (`relay-anna-piotr`, `shells-dla-kasi`, `woda-dla-marka`), scouting/gathering chains such as `zwiadowca`, animal/world-problem quests, and the authored RPG pack. The exact current list belongs to `QUESTS`/builders rather than being duplicated as a manually maintained second registry here.

## Planning guardrails

Before adding quest functionality:

1. Check whether an existing objective already expresses the world action.
2. Keep authoritative world state in the owning domain; quests observe/bind it.
3. Prefer a new lightweight opportunity/materializer over generating quest progress directly from simulation systems.
4. Materialize all quest forms into the existing `QuestDef` / `QuestManager` pipeline.
5. Use stable world/NPC/entity ids; display names and coordinates are not identity.
6. Use explicit outcomes/consequences rather than side-channel rewards or relation mutations.
7. Preserve deterministic reconstruction where the world already provides it.
8. Treat `invalidated` as the safe answer when identity continuity cannot be proven; never silently retarget persistent progress.
9. Extend existing dialogue actions/objective semantics before introducing a parallel dialogue/quest scripting engine.
10. Update this document when the implemented quest contract materially changes.

## Related documentation

- `docs/STATE.md` — short project-wide snapshot; its Quests / progression section should stay concise.
- `docs/vision/quests.md` — desired direction, not implemented truth.
- `docs/plans/README.md` — plan status/index.
- `docs/code-map/symbols/quests.md` — generated symbol map.
- `docs/state/npc.md` — NPC/dialogue/social boundaries.
- `docs/state/fauna.md` — animal identity/persistence boundaries.
- `docs/state/persistence.md` — save/rebuild taxonomy.
- `docs/state/world-locations.md` — discovery/knowledge ownership.
