# Quest System Architecture Recon & Review

**Date:** 2026-09-13
**Status:** `done` (recon / architecture review only — no gameplay code changed)
**Scope:** implemented quest architecture on `main`, adjacent world systems, existing content, gap analysis and a staged implementation plan
**Code snapshot:** verified against `src/quests/`, `src/app/createApp.ts`, `src/world/workContract.ts`, `src/ai/`, `src/reputation/`, `src/persistence/saveData.ts`

This is a current-code review. Plans, vision and `docs/state/quests.md` were used as navigation, then checked against source. When they disagree, **the code wins**.

Related current-state: [docs/state/quests.md](../state/quests.md).
Proposed follow-up plans: `quests-progression-028` … `031`.

---

## Verdict

Do **not** replace `QuestManager` / `QuestDef` with a new quest engine.

The runtime already has the right skeleton: definitions materialize into one lifecycle, world systems stay authoritative, objective completion is not resolution, and several world-driven quests already observe real fauna/settlement state. The remaining work is to stop encoding *solutions* as one-track quests, stop special-casing physical resolution in `createApp.ts`, let one world fact advance `0..N` quests, and treat a quest as **player participation in an existing world problem** rather than as a second simulation.

The dangerous future is a parallel “quest engine” that owns wolves, shortages, NPCs and rewards. The useful future is a thinner quest layer on top of systems Seedvale already has.

---

## 1. Current architecture

### 1.1 Ownership

| Concern | Owner | Not owned by quests |
|---|---|---|
| Quest definitions (authored + materialized) | `src/quests/quests.ts`, `src/quests/opportunities/*`, `src/quests/lostHunterNaturalCave.ts`; assembled in `src/app/createApp.ts` | World entities those defs bind to |
| Quest progress / lifecycle / player↔NPC relations | `QuestManager` (`src/quests/QuestManager.ts`) | NPC↔NPC relationships (`src/settlement/npcRelationships.ts`) |
| Runtime animal-target binding | `QuestManager.animalTargets` (session-only) | Fauna identity / death |
| Item rewards | injected `QuestItemGrant` → player `Inventory` | `QuestManager` does not mint items itself |
| Social reputation / renown | `ReputationManager` via injected `ApplySocialConsequence` | Quest-local copy of settlement standing |
| Horse ownership transfer | fauna seam `QuestAnimalOwnershipTransfer` | `QuestDef.horseRewardAnimalId` is only a binding |
| Work contracts / escort / voluntary join | `src/world/workContract.ts`, `npc-029` accompany, `npc-031` | Quests |
| Rat infestation / spawn-point destruction / stray livestock / location knowledge / world containers | fauna, settlements, `LocationKnowledge`, world containers | Quest progress only observes them |
| Guard recognition gifts | `src/quests/guardRewards.ts` + `worldFlags` | Parallel to `QuestManager`, not an outcome |

`QuestManager` lives at app level (sibling of `ReputationManager`), **outside** `WorldBundle`. It survives an in-session rebuild and is reset on New Game. That is correct: quest progress is player-history, not a world-chunk lifetime object.

There is one `QuestManager` instance and one implicit player. Progress entries have no `playerId`. Fine for current single-player; see §1.12.

### 1.2 Definition pipeline

All sources converge on `QuestDef` before `new QuestManager(defs, …)`:

```text
Authored QUESTS (name-keyed)
  → materializeAuthoredQuestDefs() → stable NpcId
Contextual builders (landmarks, treasure maps, horse, bear cave, cave prose bind)
World-driven opportunities
  → collect* → selectSettlementQuestOpportunities() → materialize* → QuestDef
Profession chains (hunter I–III, guard evening duty)
Lost-hunter cave binding
        ↓
QuestDef[] in createApp.ts
        ↓
QuestManager
```

The opportunity record (`SettlementQuestOpportunity`) is data-only. It is neither progress nor world state. This layer is the right extension point for future emergent quests.

Materialization is **composition-root / boot-time**. `QuestManager` takes `readonly QuestDef[]` and has no `registerDef()`. Mid-session problems become quests only if a def was already built and a live source lookup later flips to `present` (wolf-den does this). Lost-livestock currently materializes **one** candidate per settlement at boot, then `syncLostLivestockQuests()` can **start a stray episode** when the quest is offered/active — that inverts “quest observes the world”.

### 1.3 Lifecycle

Implemented `QuestState`:

```text
not_offered → offered → active → ready_to_report → complete | failed
                                   active → invalidated
```

Meaning in code:

- `not_offered` — def exists; hidden until `meetsAvailability()`.
- `offered` — exposed; decline returns to `not_offered`.
- `active` — accepted; current `stageIndex` is the only live objective.
- `ready_to_report` — all stages cleared; terminal outcome waits for report (when a unique `complete` outcome exists).
- `complete` / `failed` — authored `QuestOutcome`; `applyOutcome()` is exact-once.
- `invalidated` — untrustworthy binding (wild `animalId` across save/rebuild). Not an outcome, no reward.

Objective completion (`advanceStage`) is **not** resolution. That split already exists and should be kept.

Availability prerequisites (AND): relation level, prior `quest_outcome` (OR on `outcomeIds`), settlement reputation/renown, `evening_offer_window`. Once offered/active, later social drops do not revoke progress.

World-driven extras:

- `WorldQuestSourceLookup`: `untracked | present | resolved | absent`.
- Unaccepted offers disappear when the source is gone.
- Accepted + `resolved` currently takes the unique **failed** outcome (`pollWorldDrivenSources`). The player does not get credit if the world solved the problem.
- Lost-livestock is the better pattern: typed snapshot (`lost-alive` / `returned` / corpse / `unavailable`) maps onto distinct outcomes, including success without a player “turn-in counter”.

### 1.4 Stages and objectives

Each `QuestStage` has **exactly one** `QuestObjective`. Stages are a linear list. Branching today is:

- `talk_to_npc_choice` — mutually exclusive terminal outcomes via dialogue.
- Stage `dialogueActions` — non-terminal (or `physicalOutcomeId` terminal) player lines while the stage is active.
- Follow-up quests gated by `quest_outcome` (`sporne-drewno` → `drewno-dla-anny` | `drewno-dla-piotra`).

There is no path/solution object, no parallel objectives in one stage, no optional objective flag, no deadline field.

Implemented objective types (code, not the slightly stale state doc):

| Type | Drive | Notes |
|---|---|---|
| `talk_to_npc` | player dialogue action | explicit `onSelect`, not menu-open |
| `talk_to_npc_choice` | player dialogue action | encodes a **solution choice** as talk targets |
| `interact_well` / `interact_tree` / `interact_spawner` / `interact_landmark` | `onInteractObjective` | first matching active quest only |
| `spot_animal` | `onInteractObjective` | optional `range` for skittish species |
| `kill_target_animal` | `animal_died` | binds one `animalId` at stage start |
| `find_animal` | `animal_found`; death → failed | authored sheep quest; overlaps generated lost-livestock |
| `clear_wolf_den` | `wolf_den_cleared` | pack empty, den identity |
| `harvest_animals` | `onAnimalHarvested` | **all** matching active quests |
| `feed_habitat_animals` | `onHabitatAnimalFed` | all matching; runtime dedupe per animal |
| `gather_item` | inventory count at giver hand-in | **consumes** items (`inventory.remove`) |
| `read_item` | `onReadItem` | all matching; also catch-up from persisted flag |
| `discover_location` | poll / catch-up | `LocationKnowledge` |
| `loot_world_container` | poll / catch-up | not merely opening UI |
| `recover_hidden_find` | notify + catch-up | world Hidden Find |
| `acquire_portable_container` | notify + catch-up | carry lifecycle |
| `await_quest_outcome` | never auto-clears | terminal choice / physical resolver |
| `resolve_storage_rat_infestation` | poll snapshot | settlement-owned infestation |
| `destroy_spawn_point` | poll | permanent `disabled && !canRecover` |
| `recover_lost_livestock` | typed source poll | fauna stray episode |
| `light_settlement_fires` | poll settlement lights | dusk suppression helper |

`interact_tree` exists in the contract and interaction seam (`resolveInteraction.ts`) but **no current content uses it**. Chopping a tree as a quest goal is still not distinct from inspecting one.

### 1.5 Event / progress flow

Two styles coexist:

**Fan-out (correct 0..N):** `onAnimalHarvested`, `onHabitatAnimalFed`, `onReadItem`, `notifyHiddenFindSpotResolved`, `notifyPortableContainerAcquired`, all `poll*` methods.

**First-match (broken 0..N):** `onInteractObjective`. It advances the first active def whose current stage matches, then **returns**. A second quest waiting on the same well / tree / landmark / kill / found animal / cleared den does not see the fact.

Callers emit somewhat generic refs (`animal_died`, `interact_landmark`, …) rather than `if (questId === …)` inside fauna. The exception is `src/app/createApp.ts` `physicalOutcomeResolver` / `questLifecycleHooks`, which branch on `lostHunterBinding.questId` and `TREASURE_MAP_BEAR_CAVE_QUEST_ID`.

Domain systems do **not** have a shared “world fact” bus. QuestManager is polled or called from `createApp` / `gameLoop` / action modules. That is acceptable if every ingress fans out. It is not a reason to add a global event broker.

Dirty flag: `QuestManager.isDirty()` skips per-frame marker work when nothing quest-related changed. Poll methods are event-triggered, not per-entity-per-frame scans. Animal target bind uses an injected resolver, not an internal fauna scan.

### 1.6 Rewards and consequences

`QuestReward` = items/coins with `shown | hidden` visibility. Coins are ordinary `ItemKind`.

`QuestConsequences` = player↔NPC relation deltas + settlement `social` (reputation dimensions + renown).

Also, but **not** in those types:

- `QuestDef.horseRewardAnimalId` — success tries fauna ownership transfer; failure if the horse is gone.
- Stage `effects`: currently `{ type: 'reveal_location' }`.
- `physicalOutcomeResolver.onResolve` — bow moved to NPC inventory; casket discarded + coin payout.
- `guardRewards.ts` — torch/sword claims keyed by guard `NpcId`, persisted on `worldFlags`.

There is no quest EXP (removed in save v7→v8). Skill XP lives in `PlayerSkills` and is not a quest reward. Badges (`BadgeManager`) are independent historical facts.

`applyOutcome` grants items then consequences exactly once. Restore of an already-terminal entry does **not** re-grant (progress restore does not call `applyOutcome`). That persistence invariant is sound and must be kept when adding effect types.

### 1.7 Dialogue

Quest dialogue is an **override** on normal NPC dialogue (`docs/state/npc.md`), not a second tree engine.

`onInteract(npcId)` aggregates every definition touching that NPC:

- explicit actions (talk, choice, report, gather hand-in, `dialogueActions`) are always merged;
- extra contexts become `QuestDialogTopic` (`label` = quest title, `resolve()` re-reads live state);
- one context → no topic wrapper.

Markers (`labelMarker`) reduce globally: `?` > `✓` > `!` > `…`. Parallel givers/talk-targets on one NPC are implemented. Opening the menu is not completion.

Dialogue does not store a parallel flag set. Later “remember that you sided with Piotr” is `resolvedOutcomeId` / relation / reputation, not a dialogue flag. Keep it that way.

### 1.8 Persistence

`SaveQuests = { progress: QuestProgressEntry[], relations: Record<npcId, number> }`.

Persisted: id, state, stageIndex, optional `resolvedOutcomeId`, optional `stageCount` for counted harvest/feed.

Not persisted (by design):

- `QuestDef` itself — rebuilt deterministically from seed + world + authored catalog;
- `animalTargets` — livestock rebound, wild targets `invalidated`;
- feed contribution id sets;
- opportunity records;
- lost-hunter / bear-cave **bindings** (ids reconstructed; progress keyed by stable generated quest id).

World catch-up after restore: discovery, looted containers, destroyed spawn points, rat snapshots, stray snapshots, read-item flags.

Risk of double rewards is already handled for the item/social path. New physical resolvers must stay inside `applyOutcome` / `onResolve` that only run on first transition to terminal.

### 1.9 UI

`QuestManager.list()` → Vue `QuestLogScreen.vue`. UI must not interpret quest ids/stages/outcomes beyond the snapshot. `promisedReward` is shown only when complete outcomes share one unambiguous shown item reward.

### 1.10 Adjacent systems (quest-relevant facts)

| System | What quests can already observe / trigger | Gap |
|---|---|---|
| NPC decisions | Needs (`food`/`water`/`wood`/duties), extra pressures (burial, grave visit, corpse cleanup, structure repair, weather). No generic `Problem` type. | NPCs do not “work on a quest”. A world-resolved den **fails** the player quest. |
| NPC↔NPC relations | Separate store | Quest consequences never write it |
| Households / economy | Shortage biases NPC needs; not a quest source | `settlements-npcs-017` still planned |
| Settlements / structures | `listRepairProblems` exists (LOOSE-ENDS); unused by quests | repair opportunity not materialized |
| Work contracts | Full commitment/payment/escort lifecycle | No quest objective “complete contract”; correctly **not** duplicated |
| Inventory / craft / build | `gather_item`; no produce/craft/build objective | player construction is work-contract territory |
| Combat | kill/harvest via death/harvest reports | no “defeat group” except den/pack helpers |
| Fauna | dens, stray, feed, dangerous mark | quest can still *start* a stray |
| Locations / landmarks / discoveries | `discover_location`, `interact_landmark`, reveal effect | “reach location” ≈ discover or interact |
| Player skills | unused as quest reward | books already teach skills — reuse that seam |
| World/history | debug settlement/household history buffers | not a quest source; not player-facing lore |
| Guard rewards | parallel dialogue claims | should stay out of QuestManager, or become generic “claimable social reward” owned by reputation/items |

### 1.11 Existing quest catalog (by mechanism)

**Linear talk / fetch (accept → do thing → report):**
`relay-anna-piotr`, `shells-dla-kasi`, `woda-dla-marka`, `drewno-na-naprawe`, `ziola-dla-anny`, `kamienie-dla-piotra`, `sprawdz-szlak`, landmark trio (`stare-ruiny`, `slad-przy-monolicie`, `zapomniany-cmentarz`), hunter I/II gather stages, guard evening duty.

**World-interaction chain:**
`zwiadowca` (spawner + spot + gather; dialogue skip for missing stag), `mapa-do-skarbu`, `skarb-jaskini-niedzwiedzia`, lost hunter.

**Kill / destroy as the solution:**
`lis-przy-osadzie`, `grozny-wilk`, `wilcza-jama`, `wilki-pod-osada` (authored), `world:wolf-den-pressure:*`, `wilki-u-kupca`, `dzik-przy-szlaku`.

**Condition / world-state:**
`plaga-szcurow`, `destroy_spawn_point` quests, `recover_lost_livestock`, `light_settlement_fires`.

**Dialogue-encoded alternative outcomes (not alternative world solutions):**
`zaginiona-przesylka`, `sporne-drewno` + follow-ups, RPG `suspicious-transport`, RPG `settlement-agreement`, bear-cave keep/return, lost-hunter keep/return bow.

**Profession / generated:**
hunter I–III, guard evening, RPG `old-place-secret`, wolf-den pressure, lost-livestock.

Overlap that will hurt scale:

- Authored `zagubiona-owca` (`find_animal`) vs generated `world:lost-livestock:*` (`recover_lost_livestock`).
- Authored `wilki-pod-osada` vs generated wolf-den pressure (same title, same destroy objective, different ids/givers).
- `wilcza-jama` (`clear_wolf_den`) vs `destroy_spawn_point` (clear pack vs destroy habitat) — related world facts, separate quests, first-match events.

### 1.12 Multiplayer / camera / player

Quests do not use the camera as simulation state. Giver selection for world-driven quests is deterministic (role + family order), not proximity.

`QuestManager` **is** player-global: one progress map, one relation map. Work contracts already use `employer: string`. Quest progress has no actor id. Do not introduce a fake `activeQuest` singleton beyond this implicit player owner — but also do not pretend the current object is multi-player ready. Future ownership is “per participating actor”, not a second engine.

World simulation (stray return, den destruction, infestation) already runs without the player. The quest layer mostly waits for the player to accept/report. That is the player-centric gap, not a camera coupling bug.

---

## 2. What already works

Do not rewrite these.

1. **Single runtime.** Authored, contextual, world-driven, profession and cave quests are all `QuestDef` + `QuestManager`. The opportunity layer is not a second engine.
2. **World ownership.** Lookups/injections instead of QuestManager importing fauna/settlements. Wolf-den pressure, stray snapshots, infestation, spawn destruction, location knowledge, containers are domain-owned.
3. **Lifecycle split.** Stage advance ≠ outcome. `invalidated` is the safe identity answer. Exact-once `applyOutcome`.
4. **Stable identity.** `NpcId`, generated quest ids from settlement/animal/cave ids, landmark ids. Display names and coordinates are not identity.
5. **Parallel *dialogue* contexts.** One NPC, many quests; topic picker; global markers. Tests in `QuestManager.test.ts` cover concurrent offers/reminders on one giver.
6. **Counted / polled fan-out.** Harvest, feed, read, world-progress polls already visit every matching active quest.
7. **Availability as data.** Relation / outcome / reputation / renown / evening window. Validation throws on bad defs.
8. **Consequences vs rewards.** Items vs relation/social. No implicit giver bump, no global quest EXP.
9. **Persistence model.** Defs rebuilt, progress by id, catch-up from live world, no reward replay on load.
10. **Lost-livestock outcomes from fauna state.** Live return / corpse / unavailable — closest existing match to “quest tracks a world problem”.
11. **Dirty-flag markers.** No per-frame quest entity scan.
12. **Work contracts kept separate.** Construction/escort payment is not a quest. That boundary is correct.

---

## 3. Architectural problems

### P1. `onInteractObjective` is first-match

`QuestManager.onInteractObjective` advances one quest and returns. The same `animal_died` / landmark interact / well use cannot satisfy two active quests.

Harvest/feed/read already fan out. This is an inconsistency, not a new product idea. It will silently drop progress as soon as two kill/scout quests share a fact.

`hasSocialOutcomeClaim` is related: a quest “owns” a kill’s social outcome so animal-deed reputation does not double-pay. Fan-out must keep that suppression per animal, not per first quest in `defs` order.

### P2. Linear stage = encoded solution

A quest with `kill_target_animal` *is* the solution “kill it”. There is no way to author:

- objective: road is blocked by bandits
- path A kill / B pay / C persuade / D help them / E bypass / F fetch guards
- outcomes that differ

Today the only alternative-solutions pattern is `talk_to_npc_choice` or `await_quest_outcome` + physical checks — i.e. **pick a line of dialogue**, not **change the world in different ways**. `zaginiona-przesylka` does not model a shipment object; the cave inspect + talk choice *is* the quest.

### P3. External world resolution is treated as player failure

`pollWorldDrivenSources`: accepted + source `resolved` → unique `failed` outcome.

So if guards, time, or another system cleared the den, the player’s quest fails even though the world problem is gone. Lost-livestock already shows the better rule: map world snapshots onto outcomes, including success the player only witnessed or slightly helped.

### P4. Quest can still create the world problem

`createApp.syncLostLivestockQuests()` calls `animal.startLivestockStray()` when the generated quest is `offered` or `active`. Fauna-025 made stray a real fauna episode, but the quest path can still manufacture it so the errand exists.

Authored `zagubiona-owca` binds whoever `resolveAnimalTarget('sheep')` returns — not necessarily a stray.

Wolf-den pressure is cleaner: fauna activates pressure on day 2 (`wolfDenScenario.ts`); quests only observe `isWolfDenPressureProblem`.

### P5. Composition-root snapshot of opportunities

Defs are frozen at `createApp` construction. Wolf-den still works because the def is always materialized and the source lookup gates offering. Lost-livestock and RPG matrices do **not** pick up a new mid-session problem unless it was the boot candidate (or persisted id).

Do not jump to a live `QuestFactory`. Prefer: materialize one def per stable source identity (each livestock animal, each wolf den, later each repairable structure id), gate with source status — the wolf-den pattern.

### P6. Quest-id special cases in the composition root

`createApp.ts` `physicalOutcomeResolver` / `onStageAdvanced` switch on lost-hunter and bear-cave ids. Those stories need physical item/container moves, but the **mechanism** (require instance, require carried unopened container, transfer item to NPC inventory, reveal location) is generic and already half-declared on `QuestStageDialogueAction` (`requireItemInstanceId`, `requireCarriedContainerId`, `physicalOutcomeId`, stage `effects`).

Next cave/treasure quests (024–027) will copy this switch if it stays.

### P7. Reward/effect vocabulary is too narrow *and* already leaking sideways

Needed effects exist in domain systems: skill XP, animal ownership, location knowledge, item instance transfer, container consume, work-contract posting, structure repair, settlement stock. Only items + relation + social are first-class on `QuestOutcome`. Everything else is a `QuestDef` field or `createApp` branch.

### P8. Duplicate overlapping content

Two lost-animal quests, two “wolves under the settlement” destroy-den quests, clear-pack vs destroy-habitat as unrelated tracks. Not a rewrite issue — a content/ownership issue that will confuse both players and future matrices.

### P9. Player-only participation

No quest state for “NPC is already hunting the wolf”, “player joins”, “NPC refuses”, “giver died”. Work contracts and accompany commitments already model NPC labour and follow. Quests do not subscribe to those.

When the giver NPC dies, the def still points at a dead `NpcId`; there is no automatic fail/reassign. Work contracts *do* handle worker death (`releaseWorkContract`).

### P10. `QuestManager` owns player↔NPC relations

Historically fine, and `PlayerSocialLookup` already wraps it for NPC AI. Architecturally it is odd: quest runtime owns a social store that outlives any quest. Not worth extracting now (P10 is a warning, not a task). Do not add a second player↔NPC store.

---

## 4. Missing capabilities

Mapped to the requested objective vocabulary. Prefer reuse over new types.

| Desired objective | Today | Recommendation |
|---|---|---|
| Reach location | no dedicated type | `discover_location` or interact at a bound id |
| Discover location | `discover_location` | reuse |
| Talk to NPC | `talk_to_npc` | reuse |
| Deliver item/resource | `gather_item` consumes at giver | reuse; later deliver-to-household should call household/economy, not a quest stockpile |
| Possess item | implicit in gather/hand-in | add only if needed as non-consuming check |
| Produce/craft | none | wait for a real recipe the player can run; then condition-query inventory/household |
| Build structure | none | **Work contract + `contributeWork`**, not a quest objective |
| Kill entity | `kill_target_animal` | reuse; fan-out (P1) |
| Defeat group | `clear_wolf_den` | reuse den/pack facts; do not add `kill_n_wolves` unless a world counter exists |
| Protect NPC | none | needs combat/threat facts + fail on death; do not fake it |
| Escort NPC | **Work contract escort + accompany** | do not duplicate as a quest |
| Rescue NPC | none | lost hunter is “find pack”, not a living NPC rescue |
| Heal NPC | none | `npc-002`/`npc-025` already own treatment; quest should query injury state if ever needed |
| Investigate | `interact_*` / `discover_location` | reuse |
| Collect information | talk stages | reuse |
| Survive | none | not worth a quest type yet |
| Wait until condition | `await_quest_outcome` + polls | prefer condition-driven polls |
| Improve relationship | consequence, not objective | could add a condition-query on `getRelation` later |
| Increase reputation | consequence / animal deeds | not an objective |
| Resolve settlement problem | infestation, den destroy, lights | extend opportunity layer |
| Complete work contract | none | **read contract state** if a quest must wait on hired work; do not copy the contract |
| Trigger world-state condition | several polls | generalize as “satisfied when lookup says so” |

Drive model (keep this split):

- **Event-driven:** death, harvest, feed, interact, read, container acquired.
- **Condition/poll-driven:** infestation resolved, spawn destroyed, lights lit, location known, container looted, stray snapshot.
- **State-query at dialogue:** `gather_item` count, physical `canResolve`, availability prerequisites.

Do not add a per-frame objective evaluator.

Still missing as **architecture**, not as a dozen new objective enums:

- multiple solutions / paths over the same problem;
- optional / mutually exclusive world objectives (not only talk choices);
- timeout/deadline bound to world clock;
- giver/target death and settlement destruction;
- session-time opportunity refresh without quest-created problems;
- generic resolution effects;
- NPC as resolver/participant.

---

## 5. Quest / Problem / Contract / Event / Dialogue boundaries

Keep these as **different objects**. Seedvale already has most of them; the failure mode is aliasing them.

| Concept | Meaning in this codebase | Owner |
|---|---|---|
| **World fact** | Something that happened or is true (wolf died, den disabled, chest looted, stray returned) | Domain system that mutated |
| **Problem** | Ongoing world pressure (den `pressure > 0`, infestation snapshot, household shortage, structure below repair threshold, stray episode) | Fauna / household / settlement / structure — **not** QuestManager |
| **Need / pressure / goal / strategy / action** | How an NPC decides to act on problems | `NpcAgent` + `npcDecision` / pressures. There is **no** generic `Problem` type yet; needs are `food\|water\|wood\|…` plus extra decision kinds. `settlements-npcs-017` is the planned economic-pressure bridge. **Do not invent QuestProblem.** |
| **Work contract** | Player-employer commitment for measurable work or escort, with wage claims | `WorkContractRecord` |
| **Quest** | Tracking of **player participation** (and later NPC participation) in a problem or authored situation: availability, objectives, chosen path, outcome, rewards | `QuestManager` |
| **World event / history** | Debug/domain history buffers; social news ledger for reputation | Not quest progress |
| **Dialogue opportunity** | Presentation of accept/refuse/report/choice | `QuestDialogOverride` over flavor dialogue |

Rule:

```text
World systems generate facts and problems.
NPCs may respond through decisions / contracts / actions.
A quest may become available because a problem (or authored hook) exists.
The quest does not own the problem.
Resolution tells domain systems what to apply; it does not copy their state.
```

Work contracts must not become “paid quests”. Roadmap `quests-and-reputation.md` once said early paid work can be a normal quest; **code went the other way** and that is better. Coins as quest rewards are still fine for authored errands. Hired construction/escort stays contracts.

Dialogue must keep reading live quest + world state. No `questFlags` map.

---

## 6. Recommended target architecture

Confirming the user’s sketch against current code: **yes, with existing types**.

```text
World systems generate facts / problem snapshots
        ↓
Opportunity layer (already: SettlementQuestOpportunity)
        ↓
QuestDef instance (bindings: npc/settlement/location/item/animal ids)
        ↓
QuestManager evaluates relevance (availability, source lookup)
        ↓
Objectives (event + condition) and optional paths
        ↓
Resolution (authored outcome id) exactly once
        ↓
Domain seams apply rewards/consequences
        ↓
World + social + inventory persist in their owners
```

### 6.1 Keep

- `QuestDef` / `QuestStage` / `QuestOutcome` / `QuestProgressEntry`.
- Opportunity → materialize → same runtime.
- Injected lookups.
- `invalidated`.
- Dialogue overrides + topics.
- Work contracts as a sibling system.

### 6.2 Add minimally (no new engine)

**World facts into QuestManager must always fan out (0..N).** Unify `onInteractObjective` with the harvest/poll loops. Optionally rename the ingress to `notifyWorldFact(fact)` as an alias, not a bus.

**Source snapshots as the problem view.** Extend `WorldQuestSourceLookup` / typed snapshots (lost-livestock style) instead of quest-local booleans.

**Resolution effects as a small dispatch list** on `QuestOutcome` / stage effects, each calling an existing seam:

- grant items (already)
- relation / social (already)
- transfer item instance to NPC inventory (lost hunter)
- transfer animal ownership (horse)
- reveal location (stage effect)
- consume/discard container (bear cave)
- later: `awardSkillXp`, post a work contract, apply structure/economy mutation **through those owners**

**Paths without a DSL.** A path is either:

- a `talk_to_npc_choice` / `await_quest_outcome` (already), or
- several condition/event objectives that can complete the same stage if *any* authored success condition holds.

The smallest useful addition is **stage success conditions**: “advance when any of these facts/lookups hold”, with optional `outcomeId` mapping. That gives kill-or-pay-or-bypass without a graph engine. Mutually exclusive failures stay as explicit failed outcomes.

**Participants as bindings, not a second runtime.** `giver`, `witness`, `beneficiary`, `targetNpc`, `targetAnimalId` already appear ad hoc. A `QuestBinding` on the def (filled at materialization) is enough. Do not store live `NpcAgent` pointers.

**Opportunity identity stays deterministic.** `world:lost-livestock:${settlementId}:${animalId}` is the right shape for dynamic instances.

### 6.3 Explicitly reject

- New `QuestEngine` / `JobManager` / `ObjectiveDSL` / Lua/JSON scripting.
- Per-entity quest listeners.
- Dialogue flags duplicating `resolvedOutcomeId`.
- LLM-authored authoritative quest state (`VISION.md` / `ROADMAP.md`).
- Making `QuestManager` own fauna, households, or contracts.
- Treating work-contract escort as a quest stage.

---

## 7. Migration strategy

No big-bang rewrite. No mass content conversion until the fan-out and effect dispatch exist.

1. **Preserve** all current `QuestDef`s; they remain valid.
2. **Fix** event fan-out so existing overlapping kill/den/landmark quests stop being order-dependent.
3. **Absorb** `createApp` physical special cases into stage/outcome effects used by lost hunter and bear cave — same player-facing stories.
4. **Change** `pollWorldDrivenSources` so `resolved` can map to an authored success/partial outcome, not only `failed`. Wolf-den pressure is the first consumer.
5. **Stop** starting stray from the quest layer; only offer lost-livestock when fauna already has a stray (or corpse) snapshot. Keep authored `zagubiona-owca` as a separate tutorial-style errand until content cleanup.
6. **Content cleanup later** (not blocking architecture): drop or gate authored `wilki-pod-osada` vs generated den pressure; decide whether `zagubiona-owca` remains once generated lost-livestock is session-correct.
7. **New content** (024–027, 010) must use bindings + generic effects + source lookups. Reject new `if (questId === …)` in domain modules.

Save compatibility: progress by quest id stays. New optional fields on defs are not persisted. New outcome ids on existing quests need a migration policy: old saves keep `resolvedOutcomeId`; do not re-resolve. If effect types are added only for future resolutions, old completed quests must not replay them.

---

## 8. Implementation plan

Derived from the codebase, not from a greenfield ladder.

### Stage A — Foundation: world-fact fan-out  
**Plan:** `quests-progression-028`

- **Problem:** `onInteractObjective` first-match; parallel quests sharing a kill/interact/den-clear silently drop.
- **Goal:** one fact updates every matching active quest; presentation line can still be one toast/override.
- **Reuse:** `onAnimalHarvested` loop; `objectiveMatchesRef`; `hasSocialOutcomeClaim`.
- **Files/symbols:** `QuestManager.onInteractObjective`, `ObjectiveRef`, tests in `QuestManager.test.ts`; callers in `gameLoop.ts`, `resolveInteraction.ts`, `createApp.ts`.
- **API:** keep `ObjectiveRef`; make the loop continue after `advanceStage`. Optionally collect lines; do not add a message bus.
- **Ownership:** unchanged (`QuestManager` progress).
- **Deps:** none.
- **Migration:** none for defs; behaviour change for overlapping actives (currently rare, but `wilki-pod-osada` + generated den + horse quest all listen to destroy/clear related facts via **polls**, so kill overlap is the sharper bug).
- **Persistence:** none.
- **Tests:** two active `kill_target_animal` / `interact_landmark` / `find_animal` defs, one fact, both advance; `hasSocialOutcomeClaim` still true if any matching quest authors social consequences.
- **Risk:** UI currently assumes one `QuestDialogOverride` from interact; return the first progress line or concatenate only if tests show a need. Do not block fan-out on UI polish.

### Stage B — Generic resolution effects  
**Plan:** `quests-progression-029`

- **Problem:** horse field, createApp `questId ===`, stage effects and outcomes are parallel vocabularies.
- **Goal:** outcomes/stage actions dispatch a small effect union through existing seams.
- **Reuse:** `QuestItemGrant`, `ApplySocialConsequence`, `QuestLocationReveal`, `QuestPhysicalOutcomeResolver` fields already on dialogue actions, inventory instance APIs, fauna ownership transfer.
- **Files:** `quests.ts` (`QuestReward` / `QuestConsequences` / `QuestStageEffect`), `QuestManager.applyOutcome` / `selectStageDialogueAction`, `createApp.ts` physical resolver.
- **API sketch (illustrative, implement against current seams):**

```ts
type QuestEffect =
  | { type: 'grant_items'; items: ReadonlyArray<{ kind: ItemKind, count: number }>; visibility?: 'shown' | 'hidden' }
  | { type: 'relations'; deltas: ReadonlyArray<{ npc: QuestNpcRef, delta: number }> }
  | { type: 'social'; reputation?: Partial<Record<ReputationDimension, number>>; renown?: number }
  | { type: 'reveal_location'; locationId: string; setNavigation?: boolean }
  | { type: 'transfer_item_instance'; instanceId: string; to: 'giver' | 'player' }
  | { type: 'transfer_animal_ownership'; animalId: string }
  | { type: 'discard_carried_container'; containerId: string }
```

Keep current `reward` / `consequences` as sugar that compiles to the same dispatch so existing defs do not churn in the first PR.

- **Ownership:** QuestManager dispatches; inventory/fauna/NPC inventory/location knowledge remain owners.
- **Deps:** 028 not strictly required; can parallel. Prefer after 028 so tests stay focused.
- **Migration:** rewrite lost hunter + bear cave off `questId ===` in createApp onto effects; player-facing unchanged.
- **Persistence:** no schema bump if effects are definition-only and still applied only in `applyOutcome`.
- **Tests:** bear-cave return/keep and lost-hunter bow transfer without id switches; load of completed quest does not re-grant.
- **Risk:** over-generalizing effects that have one consumer. Only add a variant with two call sites or a committed next quest (024–027).

### Stage C — External resolution and participation  
**Plan:** `quests-progression-030`

- **Problem:** world solved ⇒ quest `failed`; NPCs cannot complete a tracked problem; quest may start livestock stray.
- **Goal:** source snapshots map to authored outcomes including success/partial; offering requires a real problem; NPC/world resolution is not automatically a slap on the player.
- **Reuse:** lost-livestock snapshot mapping; `WorldQuestSourceStatus`; `uniqueOutcomeForState` is the wrong tool when multiple failed/complete outcomes exist — use explicit ids (`den_destroyed` vs `resolved_without_player` already authored on generated wolf-den).
- **Files:** `QuestManager.pollWorldDrivenSources`, `worldQuestMaterialization.ts`, `createApp.syncLostLivestockQuests`, `settlementQuestOpportunities.ts`.
- **API:** `resolved` must not mean “unique failed”. e.g. if the player never accepted, drop the offer; if accepted and source resolved because `destroy_spawn_point` already advanced, complete normally; if resolved by the world without the objective clearing, take an authored `resolved_without_player` (may be `complete` with smaller social reward or `failed` — **authored**, not hardcoded).
- **Stray:** remove `startLivestockStray` from the quest sync path; `collectLostLivestockOpportunities` already prefers an active stray.
- **Ownership:** fauna stray / den pressure remain fauna-owned.
- **Deps:** conceptually independent; after 028 if destroy/kill fan-out interacts.
- **Persistence:** existing generated ids; outcome ids already on the def.
- **Tests:** den destroyed by player objective → complete; den gone without player destroy while active → authored external outcome; unaccepted offer disappears; stray quest offered only when snapshot is lost-alive/corpse; natural return completes `live_return` (already tested — must not regress).
- **Risk:** changing failure to success changes rewards. Default external outcome should **not** grant the full player-hero item reward.

### Stage D — Session-stable opportunities without a factory  
**Plan:** `quests-progression-031`

- **Problem:** only boot-time candidates become defs; RPG/livestock picks are snapshots.
- **Goal:** every stable source identity that *can* become a quest has a def (or can be rematerialized from a persisted id, already true), and live source lookups gate `not_offered` ↔ offer.
- **Reuse:** wolf-den always-emitted opportunity + `getStatus`; persisted id rematerialization in `collectSettlementQuestOpportunities`.
- **Files:** `collectLostLivestockOpportunities` (one def per household animal, not one pick), `selectSettlementQuestOpportunities` cap (RPG only), `createApp` assembly, possibly `QuestManager.meetsAvailability`.
- **Do not** add `registerDef` unless a source identity is truly unbounded at runtime (player-built structures might be — then either bind by structure id in a generic repair template at boot from `listRepairProblems` refresh, or wait for settlements-007 consumption).
- **Deps:** 030 (otherwise more defs would still fail-on-external-resolve and spawn strays).
- **Persistence:** more generated ids may appear in progress when offered; reconstruction already keys by id.
- **Tests:** two livestock, only the stray one available; after natural stray starts mid-session, that animal’s quest becomes offerable without reboot **if** its def exists. If defs are per-animal at boot, no QuestManager mutation is required.
- **Risk:** quest log noise. Availability must hide `not_offered` without source (already). Cap still applies to RPG matrices.

### Stage E — Multiple solutions (later, not a plan file yet)

After A–D and one real content need (bandits / suspicious-transport-024 / dungeon-026):

- Stage-level **any-of** success conditions bound to world facts.
- Keep `talk_to_npc_choice` for political/moral forks that are not world solutions.
- Do not build a path graph UI.

### Stage F — Content migration / new quests

- 024–027 and 010 should depend on B (generic effects) and must not add composition-root id switches.
- Authored vs generated wolf/livestock overlap is a content plan, not infrastructure.

### Stage G — Emergent from economy / repair

Blocked on real problems: `settlements-npcs-017` (production pressure), settlements-007 repair snapshots (already in LOOSE-ENDS). Quest work then = new `collect*Opportunities` + materializer, **zero** new lifecycle.

---

## 9. Proposed plans and dependencies

Next quests-progression id at recon time: **028**.

| ID | Name | Domain | Status to create | Depends on | Scope |
|---|---|---|---|---|---|
| **028** | World-fact event fan-out | `quests-progression` | planned | — | `onInteractObjective` visits 0..N matching quests |
| **029** | Generic resolution effects | `quests-progression` | planned | — (prefer after 028) | Effect dispatch; migrate lost hunter + bear cave off `questId ===` |
| **030** | External resolution and real problem offering | `quests-progression` | planned | 028 | Authored mapping for world-resolved sources; stop quest-started stray |
| **031** | Per-source opportunity defs + live gating | `quests-progression` | planned | 030 | Livestock-per-animal defs; session stray without reboot; no QuestFactory |
| — | Structure-repair opportunity | `quests-progression` | **do not create yet** | settlements-007 (done) + 030/031 | LOOSE-ENDS already records this; implement as a 016-style collect/materialize when 030 exists |
| — | Economy/shortage quests | `quests-progression` | **do not create yet** | `settlements-npcs-017` | No quest-invented shortage |
| — | Objective any-of / paths | `quests-progression` | **do not create yet** | 028 + a concrete content plan | Wait for bandits/024/026
| — | NPC participant runtime | `quests-progression` | **do not create yet** | npc decisions + 030 | Join existing work/accompany; not a companion quest FSM |
| Existing 024–027, 010 | authored cave/expedition/colony content | as already planned | keep | 029 should be a **soft** dependency in their notes: no new id switches | Do not block them on 031 |

Do not create plans that duplicate 001–027. Those are done or content/verification.

`quests-progression-003` (paid quests as quests) is **done historically** but superseded in spirit by work contracts — do not revive a JobManager.

---

## 10. Things explicitly not worth implementing yet

- A generic quest scripting language or node graph.
- Parallel objective DAG / optional-objective UI chrome.
- Deadlines/timeouts without a content quest that has a real world clock meaning.
- Protect/escort/rescue/heal objective types that duplicate combat, work-contract escort, accompany, or NPC treatment.
- Quest-owned EXP, skill trees, or a second reputation.
- Witness/gossip simulation (022 is a narrow animal-deed ledger; do not generalize).
- LLM quest generation as authority.
- Multiplayer `playerId` on progress (document only).
- Extracting player↔NPC relations out of `QuestManager`.
- Per-frame world scans for objectives.
- Making NPCs “quest agents” with a shadow FSM.
- Unifying work contracts into quests or quests into contracts.
- Regenerating all authored home errands as world-driven (they are onboarding/RPG texture).
- Camera/proximity quest discovery (giver selection is already world-identity based).

---

## Audit notes (scalability, not purity)

| Quest / mechanism | Issue | Action |
|---|---|---|
| `lis-przy-osadzie` / `grozny-wilk` / `dzik-przy-szlaku` | Solution = kill; bind one wild id; save invalidates | Keep; fan-out; do not retarget |
| `wilki-pod-osada` authored + generated den | Duplicate story | Content cleanup after 030 |
| `zagubiona-owca` vs lost-livestock | Two models, quest-started stray | 030 + later content |
| `zaginiona-przesylka` | Choice without a shipment item | Fine as RPG; 024 may need a real cache item — use containers, not flags |
| `sporne-drewno` | Political fork + fetch follow-up | Good use of `quest_outcome`; does not change wood stock |
| `plaga-szcurow` | Observes real infestation | Keep as template for condition objectives |
| `wilki-u-kupca` | `horseRewardAnimalId` special | Fold into effects (029) |
| Bear cave / lost hunter | `createApp` id switches | 029 |
| Hunter chain | harvest + gather + feed | Good; fan-out already |
| Guard evening + `guardRewards.ts` | Two guard progress systems | Leave rewards as worldFlags claims |
| RPG `settlement-agreement` | Talk-only; no settlement treaty state | Do not fake diplomacy data |
| `SETTLEMENT_QUEST_OPPORTUNITY_LIMIT = 2` | RPG cap; world-driven not dropped | Keep |

---

## Recommended principles for future quests

1. If the world can own it, the quest only binds and observes it.
2. Emit facts from domain systems; never `if (questId === …)` there.
3. One fact, `0..N` quests.
4. Objective completion is not resolution; resolution is exact-once.
5. Rewards/consequences are dispatches into existing owners.
6. Alternative **world** solutions are different facts that satisfy the same problem; alternative **moral** solutions may stay dialogue choices.
7. External resolution must be an authored outcome, not a surprise fail.
8. Dynamic quests get stable ids from world identities at instance time; defs may be rebuilt; progress is saved.
9. Work contracts, accompany, needs/pressures, and quests stay distinct.
10. Prefer a new opportunity collector over a new objective type; prefer a new objective type over a one-off in `createApp`.
