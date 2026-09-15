# Quests / progression — current state

**Last verified:** 2026-09-15  
**Canonical scope:** implemented quest architecture, lifecycle, authored/dynamic definitions, offer selection, active giver capacity, objectives, dialogue actions, rewards/consequences, world-driven opportunities, persistence boundaries and integration seams.

Architecture recon: [2026-09-13--quest-system-architecture-recon.md](../reviews/2026-09-13--quest-system-architecture-recon.md). Relevant follow-up work includes `quests-progression-029` … `034`.

This is a **current-state document**, not a roadmap or implementation history. When this file and code disagree, **the code wins**. Planned quest work remains in `docs/plans/`; design direction remains in `docs/vision/quests.md`.

## Read this before quest work

Primary code:

- `src/quests/quests.ts` — quest contracts, validation, authored definitions, offer policy/ranking and contextual builders/binders.
- `src/quests/QuestManager.ts` — authoritative quest progress, lifecycle, offer admission, active giver capacity, objective evaluation, dialogue overrides, rewards/consequences and quest-owned player↔NPC relation values.
- `src/quests/materializeAuthoredQuests.ts` — authored NPC display names → stable `NpcId` binding.
- `src/quests/opportunities/` — world-driven settlement opportunities and RPG quest matrices.
- `src/quests/settlementRatInfestation.ts` — pure completion/reminder helpers for rat infestation.
- `src/app/createApp.ts` — composition root: gathers/materializes definitions and injects world/system lookups into `QuestManager`.
- `docs/code-map/symbols/quests.md` — generated symbol-level navigation.

Tests are concentrated in `src/quests/*.test.ts` and `src/quests/opportunities/*.test.ts`, especially `QuestManager.test.ts`.

## Ownership boundary

`QuestManager` owns:

- `QuestProgressEntry` state for every materialized `QuestDef`,
- current stage index and terminal outcome id,
- offer exposure / decline suppression metadata,
- quest-owned player↔NPC relation values used by availability/consequences,
- temporary runtime binding from active animal-target objectives to concrete animal ids,
- quest lifecycle transitions and exact-once terminal resolution.

It does **not** own the world problems or entities referenced by quests.

Fauna, settlements, world locations, inventory, reputation/renown, spawn-point destruction, rat infestation, location discovery, world containers and animal ownership stay authoritative in their existing systems. `QuestManager` reads/mutates them through injected callbacks/lookups rather than becoming a second simulation owner.

World-driven opportunities follow the same rule: the world owns the problem; the quest layer detects a lightweight candidate, selects/materializes a normal `QuestDef`, and tracks player progress after that.

## Definition pipeline

All quest sources converge on the same `QuestDef` + `QuestManager` lifecycle.

### Authored quests

`QUESTS` in `src/quests/quests.ts` is the main authored content catalog. It uses `AuthoredQuestDef`, where human-friendly NPC names may appear in authored content.

At composition root, `materializeAuthoredQuestDefs()` resolves identity-bearing NPC names to stable `NpcId` / `QuestNpcRef`. Missing or ambiguous names throw `AuthoredNpcResolutionError`; runtime matching never falls back to display name. `giverName` remains presentation-only.

### Contextual authored quests

`src/quests/quests.ts` also builds/binds quests from generated world context rather than hardcoded runtime entity references. Current seams include:

- `buildLandmarkQuests()`;
- `buildDarkForestTreasureQuest()` / `bindDarkForestTreasureQuest()`;
- `buildHorseAcquisitionQuest()`;
- `bindExactCaveQuests()` for exact `rockDen` quests.

Physical walk-in cave stories materialize player-facing location phrases from already-resolved cave/world context. Presentation helpers do not become world owners and do not reveal/persist location state by themselves.

### World-driven settlement opportunities

`src/quests/opportunities/` is a **candidate/materialization layer**, not a second quest runtime.

```text
world/settlement state
→ lightweight SettlementQuestOpportunity
→ deterministic selection/materialization
→ normal QuestDef
→ QuestManager
```

Implemented sources/types include:

- `wolf-den-pressure`;
- `lost-livestock`;
- RPG matrices: `old-place-secret`, `suspicious-transport`, `settlement-agreement`.

Definitions are assembled once at composition root (`QuestManager` takes `readonly QuestDef[]`; there is no runtime `registerDef`). World-driven visibility is then gated by authoritative source lookups.

Lost-livestock materializes stable per-animal defs and becomes offerable only when fauna reports a real lost/corpse episode. Generated sync does not create the incident. Authored and generated flows suppress duplicate claims on the same animal individual.

## Core lifecycle

`QuestState` currently supports:

```text
not_offered
→ offered
→ active
→ ready_to_report
→ complete | failed

active → abandoned
active → invalidated
```

Meaning:

- `not_offered` — definition exists but is not currently exposed; unavailable, suppressed or non-selected candidates remain hidden.
- `offered` — this offer is actually exposed to the player.
- `active` — accepted and working through stages.
- `ready_to_report` — objectives are cleared but authored resolution/report still remains.
- `complete` / `failed` — terminal authored outcome.
- `abandoned` — terminal conscious player opt-out; distinct from failure/invalidation.
- `invalidated` — terminal no-reward state for a stale/untrustworthy binding.

Objective completion and quest resolution remain distinct. Clearing the last objective does not imply reward/consequences unless normal resolution is reached.

## Offer exposure, ranking and giver capacity

Availability is no longer equivalent to immediate visibility.

For a giver, `QuestManager` first derives eligible `not_offered` candidates, then ranks/selects them, and only selected candidates move to `offered`. There is no persistent quest queue or scheduler.

`QuestOfferPolicy` provides optional metadata:

- `priority?: number`,
- `urgency?: 'normal' | 'urgent'`,
- `exposure?: 'normal' | 'story'`.

`rankQuestOfferCandidates()` is deterministic. Ranking uses urgency, story continuation, relation signal, authored/source priority and stable id tie-breaking. `story` exposure is a deliberate authored exception to normal offer capping and generic decline.

Normal exposure rule:

```text
max 1 normal new offer per giver
+ max 1 urgent offer bypass
+ explicit story exposure bypass
```

A declined normal offer returns to `not_offered` with `offerSuppressedUntilDay` for one world-clock day. Decline is not `failed` or `abandoned`, does not resolve the world problem and does not carry a global penalty.

### Active giver capacity

Separate from offer exposure, ordinary giver quests have a derived active capacity:

```text
max 2 ordinary active/ready_to_report giver quests
```

The capacity is derived from current quest progress and is not persisted separately. `urgency: 'urgent'` and `exposure: 'story'` bypass it explicitly.

The cap applies only to a giver's own ordinary quests. It must never hide a required talk/choice/hand-in/report interaction where that NPC is merely a target of a quest given by someone else.

Admission and the final `onAccept` callback both re-check capacity, so a stale dialogue callback cannot exceed the cap.

## Availability and prerequisites

`QuestAvailability` gates whether a `not_offered` quest can become an eligible offer candidate.

Implemented prerequisite types:

- player↔NPC relation level (`stranger`, `acquainted`, `friendly`, `trusted`),
- prior quest outcome id,
- settlement reputation dimension minimum,
- settlement renown minimum,
- `evening_offer_window` for deterministic time-window offering.

All prerequisites on a quest are ANDed. `quest_outcome.outcomeIds` is the local OR membership check.

Definitions are validated once after composition/materialization. Invalid references, malformed nonlinear flow, broken dialogue choices/actions and invalid thresholds throw `QuestDefinitionValidationError`.

Once a quest is already offered/active, ordinary later social-state drops do not retroactively revoke progress.

## Stages and objective vocabulary

Each `QuestDef` contains ordered `QuestStage`s. A stage may use legacy single `objective` sugar (`primary`) or `objectives` with `mode: 'all' | 'any'`.

Optional stage ids and `transitions` support forward nonlinear flow. A transition may target another stage id or authored `QuestOutcome`; missing transition preserves linear `stageIndex + 1` / `ready_to_report`. `talk_to_npc_choice` and `await_quest_outcome` remain single-objective only.

Implemented objective families:

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
- `harvest_animals`
- `feed_habitat_animals`
- `clear_wolf_den`
- `find_animal`
- `recover_lost_livestock`

### Inventory / collection / discovery

- `gather_item`
- `read_item`
- `discover_location`
- `loot_world_container`
- `recover_hidden_find`
- `acquire_portable_container`

### System/world-state conditions

- `resolve_storage_rat_infestation`
- `destroy_spawn_point`
- `light_settlement_fires`
- `await_quest_outcome`

Prefer extending/reusing these contracts before adding quest-specific parallel mechanics.

Event ingress helpers visit **every** matching active quest and every unfinished objective slot in the current stage. `onInteractObjective` returns one presentation line while all matching quest state advances.

## Animal/world bindings

`kill_target_animal` and `find_animal` bind to one concrete `animalId` through injected seams. `clear_wolf_den` binds the den/spawner identity. `interact_landmark` uses a resolved stable landmark id rather than coordinates.

For `animal_died`, an already-bound objective matches only the exact animal id. If a matching kill objective is still unbound, the death event can bind to the exact dying `animalId` using the event's reported `kind`; it does **not** ask the live-target resolver after death and accidentally retarget another animal.

World-driven quests additionally use `WorldQuestSourceLookup` states:

- `untracked`,
- `present`,
- `resolved`,
- `absent`.

Unaccepted world-driven offers may disappear when their source disappears. Accepted quests may fail/invalidate depending on source state rather than pretending the player solved the problem.

## Dialogue integration

Quest dialogue is an override layer on normal NPC dialogue, not a second dialogue-tree engine.

One NPC may participate in many concurrent quest contexts. `QuestManager.onInteract(npcId)` arbitrates all relevant definitions globally, not first-match.

Required actionable contributions (`talk_to_npc`, choices, authored stage actions, gather hand-in, report) are never hidden by unrelated offer ranking/capacity. Other contexts are exposed through `QuestDialogTopic` with player-facing `QuestDef.title` and a live `resolve()` callback.

Opening dialogue or selecting a topic does not itself mutate quest progress. Explicit player action is required for:

- accept/decline,
- `talk_to_npc`,
- `talk_to_npc_choice`,
- report/hand-in,
- stage `dialogueActions`,
- generic abandon where allowed.

Generic abandon is available for ordinary active giver quests unless `QuestAbandonment.allowed === false`. It moves the quest to terminal `abandoned`, applies optional existing `QuestConsequences` exactly once and clears quest-local runtime bindings. Story quests can disable generic abandon and resolve withdrawal through authored outcomes instead.

In multi-quest dialogue, generic abandon actions are `topicScoped` so the player sees the quest title/context instead of several indistinguishable flat "Przykro mi…" actions.

## Quest markers

`QuestManager.labelMarker(npcId)` is derived/read-only and represents the most important interaction available **now**, not just raw lifecycle state.

Priority:

```text
?  required talk/action target
✓  actionable hand-in/report/completion
!  exposed/selectable new offer
…  active reminder
```

A gather quest can therefore show `✓` while still formally `active` when the required items are currently available. `✓` outranks a simultaneous `!`.

`list()` and marker exposure respect offer selection/capping rather than surfacing every available `not_offered` candidate.

Inventory changes mark quest presentation dirty only when an active gather stage makes that relevant.

## Outcomes, rewards and consequences

Every authored quest has explicit `outcomes`.

`QuestOutcome` contains:

- stable outcome id,
- terminal state `complete` or `failed`,
- optional result text,
- optional direct reward,
- optional cross-system consequences.

`QuestReward` represents direct item compensation with `shown` / `hidden` presentation visibility.

`QuestConsequences` currently supports:

- player↔NPC relation deltas,
- settlement reputation-dimension deltas,
- settlement renown delta.

There is no implicit generic relation bump and no global quest EXP reward. Consequences happen only through authored outcome/dialogue/abandonment paths.

A successful quest may additionally transfer a specifically bound persistent horse to player ownership through injected reservation/ownership seams.

## Persistence and rebuild behaviour

Persisted `QuestProgressEntry` currently includes:

- quest id,
- lifecycle state,
- stage index,
- optional `resolvedOutcomeId`,
- optional legacy `stageCount`,
- optional `stageSlotProgress` for multi-objective stages,
- optional `offerSuppressedUntilDay` for declined offers.

No save-version bump was required for plans `032`–`034`; new progress fields are additive/optional. Active giver capacity and offer ranking are derived and are not stored as queues/slots.

Quest-owned player↔NPC relation values are also restored into `QuestManager`; legacy name-keyed relation entries are normalized where unambiguous.

Definitions are rebuilt from deterministic/authored world state on boot; progress is restored by quest id.

`QuestManager.animalTargets` is runtime-only and is not persisted. On rebuild/restore:

- deterministic livestock targets can be rebound,
- active wild-fauna individual identity cannot be assumed stable,
- untrustworthy active bindings become `invalidated` instead of silently retargeting.

World/progression objectives use authoritative live state and may catch up after restore.

See `docs/state/persistence.md` and `docs/architecture/ARCHITECTURE.md` for full save ownership.

## Important integrations

### NPCs

- stable `NpcId` is quest identity;
- quest dialogue overrides normal dialogue actions when relevant;
- quest relations are one input into broader social behaviour, while NPC behaviour remains owned outside quests.

See `docs/state/npc.md`.

### Settlements / reputation

Settlement identity is attached where required at composition root. Reputation/renown remain owned by their systems; quests only read prerequisites and apply authored deltas.

See `docs/state/settlements.md`.

### Fauna

`QuestManager` does not own fauna scans/lifecycle. Target resolution, death/found events, wolf-den state, lost-livestock snapshots, dangerous marking and ownership transfer enter through injected/reporting seams.

See `docs/state/fauna.md`.

### Items / world containers / knowledge

Gathering reads player inventory; rewards grant through existing item seams. Treasure/discovery objectives consume inventory actions, `LocationKnowledge` and world-generated-container state rather than quest-owned copies. The dark-forest treasure-map **source** is consumed via app-owned `consumedWorldPickupIds`; `worldFlags.treasureMapDarkForestRead` only records that the map was read.

See `docs/state/player-systems.md` and `docs/state/world-locations.md`.

## Current content catalog

Do not treat old plans as the quest catalog.

Use these sources:

1. `QUESTS` in `src/quests/quests.ts`.
2. Contextual builders/binders in the same module.
3. `src/quests/opportunities/` for world-driven definitions.
4. Cave/world contextual quest modules assembled at composition root.
5. The final materialized `QuestDef[]` in `src/app/createApp.ts` before `new QuestManager(...)`.

Home-guard recognition rewards remain dialogue-claimed and separately persisted through world flags; they are not a parallel generic quest runtime.

## Planning guardrails

Before adding quest functionality:

1. Check whether an existing objective/action already expresses the world event.
2. Keep authoritative world state in the owning domain; quests observe/bind it.
3. Prefer lightweight opportunity/materialization over generating progress directly from simulation systems.
4. Materialize all quest forms into `QuestDef` / `QuestManager`.
5. Use stable ids; display names and coordinates are not identity.
6. Reuse explicit outcomes/consequences rather than side-channel rewards.
7. Keep offer ranking/capacity derived and deterministic; do not add a persistent queue/scheduler.
8. Keep ordinary active giver capacity derived; explicit urgent/story metadata is the bypass.
9. Treat `invalidated` as the safe result when identity continuity cannot be proven.
10. Extend existing dialogue/objective semantics before adding a parallel scripting engine.
11. Update this document when the implemented quest contract materially changes.

## Related documentation

- `docs/STATE.md` — short project-wide snapshot.
- `docs/vision/quests.md` — desired direction, not implemented truth.
- `docs/plans/README.md` — plan status/index.
- `docs/code-map/symbols/quests.md` — generated symbol map.
- `docs/state/npc.md` — NPC/dialogue/social boundaries.
- `docs/state/fauna.md` — animal identity/persistence boundaries.
- `docs/state/persistence.md` — save/rebuild taxonomy.
- `docs/state/world-locations.md` — discovery/knowledge ownership.
