# Implementation notes — 193 — Simulation Architecture Consistency

Audit only, per plan scope ("Celem nie jest jeszcze refactor" / "Nie implementować dużego refaktoru w ramach tego planu"). Investigation was split into four parallel, read-only sub-audits plus the coordinating session's own direct reading of the spine (`gameLoop.ts` full, `createApp.ts` rebuild path, `worldBundle.ts` full, `src/simulation/*` full):

1. **NPC/AI** — `NpcAgent.ts`, `Needs.ts`/`npcVigor.ts`/`npcCombat.ts`/`schedule.ts`/etc., `src/simulation/*` contract usage (plan §2-4, §6, §8, §10-11).
2. **Fauna** — `AnimalAgent.ts`, `createFauna.ts`, spawner/herd/combat modules, time-skip gating (plan §2-4, §6, §8, §11).
3. **Settlement/economy/household + world/time-skip** — `SettlementsManager.ts`, `household.ts`, `src/economy/*`, `worldBundle.ts` cross-check, `timeSkip.ts`/`dayNight.ts` end-to-end trace (plan §2-4, §7, §11-12).
4. **Player/combat/interaction** — `PlayerController.ts`, `src/combat/*`, `src/app/actions/*`, `busyAction.ts`, callback audit (plan §2, §6, §10, §12).

Findings below carry file:line evidence per the plan's Evidence Standard. Per plan instruction, this audit does **not** repeat plan 192 (time/simulation consistency) or plan 195 (data/state consistency) findings without need — it references them and builds on top where this audit's deeper tick-order tracing adds material not previously captured (notably: the time-skip issue also duplicates economy/household resource *quantities*, not just need bars, and fauna has a distinct, more severe, previously-unlogged time-skip exposure of its own).

---

## 1. Simulation System Contract Map (plan §2)

| System | Inputs | Outputs | State owned | State mutated (other systems) | Time input | Phase |
|---|---|---|---|---|---|---|
| `WorldBundle` (`app/worldBundle.ts`) | `WorldConfig`, scene, carried-across-rebuild snapshots | none (container) | 16 member systems as one mutable, reference-stable container | replaces each field's instance only in `rebuildWorldBundle` | none (delegates) | composition-root level, not itself a tick participant |
| Day/Night (`world/dayNight.ts`) | raw `dt` (`gameLoop.ts:1438`) | `elapsedDays`/`timeOfDay`/derived sky params | `elapsedDays`, `timeOfDay`, `dayLengthSec`, `timeMultiplier`, `enabled` | none | **World Time**, single owner (confirmed, matches `ARCHITECTURE.md`) | first block of the non-modal simulation section, before player/NPC/fauna |
| Settlements/NPC (`SettlementsManager`→`NpcAgent`) | `worldDt`, playerPos/yaw, `timeOfDay`, `dayFactor`, `litFires`, `villages`, `dayLengthSec`, `threateningAnimals` | none returned; mesh/animation/dialogue/quest-marker side effects | loaded settlements, `EconomyRegistry`, `HouseholdRegistry`, per-NPC needs/HP/vigor/inventory/schedule | `Household`/`SettlementEconomy` (own API), `ResourceDeposits` (mining hooks), `TreeLifecycle` (forest hooks) | **Simulation Time** (`worldDt`, scaled during a skip — root of Finding P0/P1 below) | `gameLoop.ts:1584`, after player update/needs, before fauna |
| Fauna (`Fauna`→`AnimalAgent`) | `worldDt`, playerPos, `timeOfDay`, `elapsedDays`, `litFires`, `villages`, `nearbyHumanCount`, damage callbacks, `nearbyNpcs` | none returned; corpse/spawner side effects; invokes damage callbacks | per-agent health/life/corpse/herd fields, spawner lifecycle | player HP (`onHumanHit`→`applyPlayerDamage`), NPC HP (`onNpcHit`→`applyIncomingCombatDamage`), **`Household.water` directly** (livestock trough drink — the one named callback-pattern exception, `AnimalAgent.ts:1973-1974`) | **Simulation Time** (`worldDt`, same scaling as NPC — same exposure, but **no catch-up mechanism at all**, unlike NPC) | `gameLoop.ts:1601`, after settlements/NPC |
| Player (`PlayerController`+`PlayerNeeds`+combat) | raw `dt` (movement/stamina, never scaled) + `worldDt` (needs/starvation/regen, scaled during a skip) | HUD readouts | mesh/pose, `HealthState`, `PlayerNeeds`, `PlayerSkills` | none directly — all cross-system effects go through owner APIs/action modules | split: Real-Time (movement/stamina) + Simulation Time (needs, correctly scaled, **no** double-count — plan 192 already closed this cleanly) | interaction/combat resolution runs **first** in `tick()` (`gameLoop.ts:674-1401`, before day/night is even ticked); `player.update`/needs run inside the day/night-gated block, before settlements/fauna |
| Interactions/Combat (`src/combat/*`, `gameLoop.ts`'s melee/ranged blocks, `ai/npcCombat.ts`) | player input, gaze/cycle-target resolution | HP mutation, item transfers, world mutation | stateless functions + per-actor lifecycle objects (`playerMelee`/`playerRanged`/`playerCombat` closures, NPC's own per-agent lifecycle) | target `HealthState`, via **two different orchestration shapes** — see Finding 4 | Real-Time Actions (raw `dt` for player windup/recovery/flight); NPC combat timers scale with `worldDt` during a skip (same exposure as NPC needs) | resolved in the early input-processing block, before the day/night/player/NPC/fauna simulation block |
| World-owned items/resources (`ItemSpawners`, `DroppedItems`, `PlacedFires/Tents/Traps/Containers`, `PlayerWells/Gardens`, `ResourceDeposits`, `LargeCaves`, `DryingRacks`, `Hives`) | mostly raw `dt` (**not** `worldDt`) + playerPos + `dayFactor` | prop/visual side effects | own `WorldBundle`-held collection each | via `src/app/actions/*` on player interaction, or NPC mining/forest hooks | Real-Time Actions for animation/cadence; underlying regen/depletion where seed/day-based stays lazy World-Time | `gameLoop.ts:1657-1665`, after fauna, before render |
| Crops/Trees/Timed processes | `elapsedDays` (lazy, pure) | derived stage on read | sparse override maps + planted/removed id sets (caller-owned, threaded into `ChunkManager`) | only on harvest/plant events via action modules | **World Time**, pure function of `elapsedDays`, zero per-frame tick cost (confirmed: no `update()`/tick fn exists in `treeLifecycle.ts`) | not part of the ordered per-frame tick at all — resolved on demand |
| Weather/Seasons (`world/weather.ts`) | seed, `elapsedDays` | `WeatherState`/`ClimateState`/surface wetness&snow uniforms | none persistent (pure fn); `ClimateState`/`WeatherParticles` runtime caches only | none beyond its own recomputed cache | World Time | `gameLoop.ts:1442-1449`, right after `tickDayNight`, before resync/player |
| Time Skip (`world/timeSkip.ts`) | raw `dt`, ticks every frame **even under modals** (`gameLoop.ts:535`) | `skip` result (label/fadeStrength/justFinished/progress); boosts `dayNight.timeMultiplier` | active/startTimeOfDay/hours/fade progress | `dayNight.timeMultiplier` — the shared multiplier every `worldDt`-consuming system reads | is itself the time-acceleration mechanism | `gameLoop.ts:535`, first thing in `tick()`, before modal resolution |

---

## 2. Actual Simulation Tick (plan §3)

Traced directly from `gameLoop.ts`'s single `tick()` (no separate per-phase functions — everything lives in one closure):

```text
1.  timer.update() → dt (clamped to 0.05s)                                    [real dt]
2.  timeSkip.tick(dt) — may flip active; on justFinished: settlementsManager
    .resolveTimeSkip(...) + onSleepFinished()                                 REQUIRED (feeds worldDt below)
3.  restCamp.tick(dt), busy.tick(dt) — clear movement keys if a channel is active   REQUIRED (keys read next)
4.  modal resolution (activeModal(...)) — gates the branch below
5.  [non-modal] buildInteractables(...) → melee/ranged combat resolution →
    [E]/[R] interaction dispatch — direct animal.takeDamage(), inventory,
    world-object action-module mutation                                       REQUIRED before step 16 reads post-combat animal state
6.  quest marker sync if dirty
7.  worldDt = timeSkip.isActive() ? dt * dayNight.timeMultiplier : dt          feeds 13, 17, 19
8.  tickDayNight(dayNight, dt) — World Time advance                           REQUIRED before 9-10, HUD time
9.  tickClimate + computeSurfaceWeather + chunkManager.setWeatherSurface       depends on 8
10. conditional resyncDayNight() (sky/light/fog/water/grass, throttled)       presentation
11. weatherParticles/weatherAudio/ambientAudio.update(dt)                     presentation, raw dt
12. player.setEncumbrance(); player.update(dt, dayLengthSec)                  raw dt
13. tickPlayerNeeds / tickPlayerStarvationDamage / tickHealthRegen / tickDowned   worldDt
14. HUD sync (needs/skills)
15. houseDoors / mapDiscovery / chunkManager.update(playerPos) / lights.follow / ocean.follow   position-driven
16. compute dayFactor/litFires/villages/nearbyNpcCandidates/nearbyHumanCount/
    threateningAnimals — reads fauna agents' state **from step 19 of the
    previous frame** (this frame's fauna.update hasn't run yet)              one-frame-stale by construction (Finding 6)
17. settlementsManager.update(worldDt, ..., threateningAnimals)               REQUIRED after 16, before 19
18. resourceDeposits.update(playerPos, settlements)                          position-based
19. fauna.update(worldDt, ..., onHumanHit, onNpcHit, onAggro)                REQUIRED after 17 by current code — this ordering is what produces the one-frame NPC-decision/fauna-damage lag (Finding 6); nothing in the code documents this as deliberate
20. placedTraps.update(worldDt, elapsedDays, fauna.getAgents())              REQUIRED after 19 (reuses this frame's fresh agent list — comment confirms deliberate)
21. itemSpawners/droppedItems/placedFires/playerTorch/chunkManager
    .tickWater/tickGrass/foliageWind/ocean.update/worldAudio.update          all raw dt (not worldDt); mutual order ACCIDENTAL (no evident dependency between them)
22. minimap.update
23. [render] shadow budget → ocean mirror render → post-processing → label render → perf monitor
```

**Required vs. accidental, explicitly:**
- **Required**: 2→7 (worldDt needs the skip flag), 8→9 (weather needs the day just advanced), 5→16 (this frame's combat outcome must be visible to NPC defense decisions), 17→19 ordering is *required by current code correctness expectations* (traps reuse fauna's list) but the 16→17→19 *chain* itself (NPC-decisions-before-fauna-damage) is accidental — nothing states NPCs must decide before fauna's damage callback fires this same frame.
- **Intentional but not enforced by types**: raw-`dt` vs `worldDt` split across step 21 vs steps 13/17/19 — matches the plan-192/`ARCHITECTURE.md` "Real-Time Actions never convert to game-time" rule for the presentation/animation-cadence systems in step 21; their *underlying* regen/depletion (where day-based) is separately lazy-World-Time, so this is correct, not an inconsistency (verified, not a new finding).
- **Accidental**: mutual order inside step 21 (item spawners vs. dropped items vs. fires vs. torch vs. water/grass vs. ocean) — no dependency between them, order is whatever the source happens to list.

---

## 3. State Ownership Map (plan §4)

No new duplicate-source-of-truth or ownership-leak was found beyond what plan 195 already documented (`Household` not carried across in-session rebuild; `SettlementEconomy` correctly carried). New confirmations from this audit's deeper trace:

| State | Owner | Mutators | Notes |
|---|---|---|---|
| NPC needs/HP/vigor/stamina/inventory | `NpcAgent` | only its own methods (`takeDamage`, `applyIncomingCombatDamage`, internal `tickNeeds` calls) | `health`/`stamina`/`vigor` are public **`readonly` fields holding mutable objects** — `readonly` blocks rebinding, not `.current` mutation (`NpcAgent.ts:680-682`). Verified unexploited (repo-wide grep), but the boundary is convention, not type-enforced. **P3.** |
| Household stock/water | `Household` closure | only `deposit`/`add`/`remove` methods | no raw-field access found anywhere outside `household.ts` |
| Settlement economy stock | `SettlementEconomy` closure (`EconomicStock`) | only `add`/`remove`/`produce`/`reserve` | `EconomicStock`'s map is private; no external `.amounts` access found |
| Fauna health/life/corpse/herd fields | individual `AnimalAgent` | itself, plus **direct peer mutation**: one `AnimalAgent.takeDamage()`'d by another (predator→prey attack, `AnimalAgent.ts:1822-1864`) and `applyRotInfluence` writing another live agent's `life.stamina` directly (`AnimalAgent.ts:1248-1255`) | same-domain peer mutation, not cross-system — acceptable per plan §10's "direct mutation may be correct if ownership is consciously shared," these are two fauna instances, not a boundary crossing |
| Herd leadership | not stored — recomputed on demand (`pickHerdLeader`, lexicographically smallest alive `animalId`, `herdCohesion.ts:85-95`) | n/a | order-independent by construction, no duplication |
| `WorldBundle` container + its 16 members | confirmed clean (matches plan 195: pure container, no convenience-migrated state) | only `rebuildWorldBundle` | re-verified directly this session (`worldBundle.ts` read in full) |

---

## 4. Mutation Boundary Map (plan §5)

Representative traces (mechanism classified per plan §5's taxonomy):

1. **Player melee kills an animal** — direct: `resolveMeleeHits` (pure) → `animal.takeDamage(dmg, 'player')` called **inline in `gameLoop.ts:762`** — no queue/event, no `CombatTargetHandle`.
2. **NPC attacks (any target)** — via owner-system call through an abstraction: `NpcAgent.beginCombat(intent)` → tick → `applyNpcMeleeHit(target,...)` → `target.applyDamage(amount)` on a `CombatTargetHandle` (`NpcAgent.ts:1441-1459`, `npcCombat.ts:83-100`) — attacker never touches the concrete target class.
3. **Fauna damages player/NPC** — via callback: `Fauna.update`'s `onHumanHit`/`onNpcHit` params, supplied by `gameLoop.ts` and pointing at `applyPlayerDamage`/`npc.applyIncomingCombatDamage` (`gameLoop.ts:1610-1650`) — the correct direction (world system reports an event upward; composition layer resolves the cross-domain consequence).
4. **NPC wood/ore/food gather→deposit** — deferred to next tick via a chained `PlannedAction`: the harvest/mine/forage effect is applied at `chop.onComplete`/`mine.onComplete` (re-validated against current world state, race-safe), but the `Household`/`SettlementEconomy` credit is deferred to the *second* chained step's `onComplete` (`NpcAgent.ts:2453-2589`) — "check before you cut" ordering confirmed at both steps independently.
5. **Well-work session (player)** — busy-channel deferred: material check → `bundle.playerWells.transitionTo` → `busy.start(sessionSec, ..., commitProgress, {onCancel: commitProgress})`; progress is credited from measured elapsed time identically on natural completion and Esc-cancel (`placementActions.ts:279-288`).
6. **Livestock drinks from a trough** — direct, cross-system, by design (plan 122): `AnimalAgent` holds a `Household` reference and calls `household.water.remove(...)` directly (`AnimalAgent.ts:1973-1974`) — the one place fauna bypasses the callback pattern used everywhere else for player/NPC damage. Named here as the sole such exception, not flagged as a new problem (pre-existing, intentional, and the water pool itself has a single confirmed owner — see plan 195 §"livestock thirst").
7. **Time-skip catch-up need resolution** — a *second*, independent mutation path for the same effect: `NpcAgent.resolveTimeSkip`'s per-step replay directly calls `household.water.add(...)`/hunger-wood-duty satisfaction (`NpcAgent.ts:2126-2136`) — this duplicates trace #4's effect for the same wall-clock period already live-ticked. See Finding 1/2.

No action module (`src/app/actions/*`) was found mutating NPC/fauna/settlement state by reaching past an owner method — confirmed clean across gathering/ground/placement/rest/survival/container families.

---

## 5. `gameLoop.ts` Responsibility Map (plan §6)

| Responsibility | Location (`gameLoop.ts`) | Cohesion | Dependency | Candidate |
|---|---|---|---|---|
| Frame timing / FPS EMA | 516-529 | high (single concern) | `Timer`, `hud` | keep |
| Time-skip tick + overlay/UI sync | 531-566 | high | `timeSkip`, `restCamp`, `player`, `settlementsManager` | keep (small, cohesive) |
| Rest-camp / busy-channel tick + input suppression | 568-596 | high | `restCamp`, `busy`, `keyboard` | keep |
| Modal resolution + per-modal input consumption | 598-673 | medium (one big `switch`, but single concern: "which modal eats which key") | every modal object | keep |
| **Interactables build + melee/ranged combat resolution + `[E]`/`[R]` dispatch** | **674-1401 (~730 lines)** | **low — mixes gaze/target-cycling, melee lifecycle, ranged lifecycle/projectiles, and ~20 interaction-kind branches in one block** | `bundle.*`, `player`, `inventory`, ~15 action-starter callbacks | **extract** — already logged as a follow-up candidate (`docs/plans/LOOSE-ENDS.md`, 2026-08-21 entry, "Etap 2" split of `gameLoop.ts`/`interactables.ts`); this audit reaffirms it, no new action taken here |
| Day/night/weather tick + resync + ambient/weather audio | 1438-1464 | high | `dayNight`, `climate`, `sky`, `lights`, `chunkManager`, `ocean` | keep |
| Player physics/needs/HUD sync | 1466-1526 | high | `player`, `PlayerNeeds` | keep |
| World-streaming/presentation follow (doors/map/chunks/lights/ocean) | 1527-1544 | high | positional, thin delegating calls | keep |
| NPC orchestration call | 1583-1595 | high (thin call-through) | `bundle.settlementsManager` | keep |
| **Fauna orchestration call + inline ~25-line player-damage-consequence callback** | 1601-1653 | **medium — the call itself is a thin delegate, but the `onHumanHit` callback embeds player-melee/ranged/downed-state reset logic inline (1610-1636) instead of a named helper** | `bundle.fauna`, `player`, `playerMelee`, `playerRanged` | **extract** the callback body into a named `onFaunaHitPlayer(...)` helper — small, low-risk (new candidate, not previously logged) |
| World-object ticks (spawners/drops/fires/torch/water/grass/wind/ocean/audio) | 1654-1671 | high, each a single thin delegating call | — | keep |
| Minimap update | 1667-1671 | high | — | keep |
| Camera-mesh debug (`?debugCameraMesh=1`) | 1673-1711 | high (debug-only, self-contained) | — | keep (debug-gated, zero prod cost) |
| Render pass (shadow budget, mirror, post-processing, labels, perf monitor) | 1713-1760 | high | renderer/camera/scene | keep |

**Not treated as a problem solely because of file size** (per plan instruction) — every block above has a cohesive single responsibility *except* the 674-1401 interaction/combat block, which mixes ~5 distinct concerns and is the one genuine extraction candidate, already tracked.

---

## 6. `createApp.ts` / `WorldBundle` Boundary Findings (plan §7)

**`createApp.ts`** remains a wiring/composition layer, confirmed directly: `rebuildWorld()` (`createApp.ts:664-743`) only orchestrates — snapshot decision (`resetCollectedItems`) is caller-owned exactly as `ARCHITECTURE.md` documents, `rebuildWorldBundle` is called with the caller's already-decided reset state, and post-rebuild steps (map projection, inventory/quest/HUD reset **only** on `resetCollectedItems`, resync, prewarm, player repositioning) are each a single delegating call, not inline gameplay logic. No runtime gameplay rule found living in `createApp.ts` that should belong to a subsystem.

**`WorldBundle`** rebuild lifecycle matches the documented model (`ARCHITECTURE.md`'s "dispose → clear module-level road caches → new `ChunkManager` → recreate dependents") with one omission in the docs, not the code: `rebuildWorldBundle` also unconditionally calls `treeLifecycle.clearPresence()` and (only on `resetCollectedItems`) `treeLifecycle.clearOverrides()` (`worldBundle.ts:552-553`) — a second module/instance-level cache clear the doc's "clear module-level road caches" sentence doesn't mention. **Fixed directly** in `ARCHITECTURE.md` (see §9 below) since it's a one-line factual addition, no code change.

Field-by-field carry/reset/recreate on rebuild (`worldBundle.ts:472-631`) was verified in full against the 16-member list — every field is recreated; carried snapshots exist for `droppedItems`/`placedFires`/`placedTents`/`placedTraps`/`placedContainers`(+held)/`playerWells`/`playerGardens`/`dryingRacks`/`hives`/fauna-spawner-state/settlement-economies. **`resourceDeposits` has no snapshot taken before `dispose()`** (`worldBundle.ts:540,570` — reconstructed purely from `(scene, worldContext, seed)`) — flagged as Finding 8 below (unconfirmed whether depletion is meant to be session-durable; needs a targeted look, not fixed here).

---

## 7. `src/simulation/` Contract Audit (plan §8)

| Primitive | Actual role | Real usage | Bypass / vestigial |
|---|---|---|---|
| `SimulationEntityRef` | opaque `{id,kind}` | **never used** in `NpcAgent.ts` | dead in the NPC consumer |
| `DecisionContext` | inputs snapshot for a decision policy | built every NPC `choose` tick (`buildDecisionContext`) and every fauna decision tick (`AnimalAgent.ts:1472-1491`) | **`.extras` is write-only in both consumers** — NPC only ever re-reads `scheduleActivity` (a value already passed in as a parameter); fauna's `decideHumanResponse` reads `sense`/`this.life` directly, never `ctx.extras`. The "shared decision seam" plan 055 built is largely decorative in its only two consumers today. |
| `PlannedAction<TKind>` | chainable step | real, load-bearing in both NPC (`NpcPlannedAction`) and fauna | — |
| `ActionLifecycle` + transitions | status machine | real in NPC (start/complete/fail/cancel throughout); **written-but-never-read in fauna** — `AnimalAgent.actionLifecycle`/`.pendingAction` are set via `adoptPlannedAction` at ~14 call sites but no code ever checks `isActionActive`/`isActionTerminal`/`.status` on them; fauna's actual behavior is driven by separate imperative methods (`updatePredator`/`updatePrey`/`pursueNeeds`/`wander`/`fleeFrom`) | fauna "adopts" the contract in name/bookkeeping without it influencing behavior |
| `adoptPlannedAction` (same-kind-preserves-active) | shared action-control helper | used by fauna (`AnimalAgent.ts:1468`) | **not used by NPC** — `NpcAgent.startAction()` (`NpcAgent.ts:2234-2256`) always calls `replaceActionLifecycle` unconditionally instead, reimplementing the "always replace" half inline. The two intended consumers of this shared layer use different, inconsistent halves of it. |
| `InteractionQueue` | FIFO well-queue | used correctly (`join`/`leave`/`claimServing`/`worldDestination`) | — |
| `pickHighestScore`/`scoreActions` | competing-action scoring | used by NPC's `pickNeed` and `npcAnimalThreat.ts`; used by fauna's `decidePredatorHumanIntent` | consistent with the module's own doc comment ("policy remains inline"); NPC combat mode/target selection is intentionally *not* scored (supplied externally via `CombatIntent`) |

**Conclusion**: the contract layer is genuinely shared and load-bearing for `PlannedAction`/`ActionLifecycle`-transitions/`InteractionQueue`/scoring, but `SimulationEntityRef` and `DecisionContext.extras` are effectively dead weight in both of the only two consumers that exist, and the two consumers diverge on `adoptPlannedAction` for no documented reason. This is a maintainability finding, not a correctness one — no bug follows from it today, but it misrepresents the contract as more load-bearing than it is. Per plan instruction, **not** proposing a new shared `Agent` abstraction or expanding the contract — the recommendation (§10) is a trim, not an addition.

---

## 8. Dependency and Coupling Map (plan §9)

No circular dependency found by any of the four sub-audits. Fan-out is concentrated exactly where expected:

```text
gameLoop.ts        → bundle.*, player, timeSkip, busy, restCamp, questManager, ~30 action-starter callbacks
                      (expected — it is the composition-root-adjacent orchestrator; high fan-out here is correct, not a smell)

NpcAgent            → Household, SettlementEconomy, ResourceDeposits (mining hooks),
                       TreeLifecycle (forest hooks), InteractionQueue, getPlayerSocial,
                       getNearbyPlayerWell, foodSources
                      (capability injection, one direction: settlement/app owns them, NpcAgent
                       calls out — no callback flows the other way; confirmed clean)

AnimalAgent (livestock only) → Household.water (direct field reference, the one named exception — §4 trace 6)

fauna → player/NPC damage    → via gameLoop.ts-owned callbacks (world system reports event upward;
                                composition layer resolves cross-domain consequence — correct direction)
```

No system was found calling back "up" into a system that should own the direction (e.g. no world/settlement system needs to call into player-owned state directly). The fauna→NPC damage callback (`gameLoop.ts:1643-1650`) does a **linear scan over every loaded settlement's NPC array by id** on every hit — an O(settlements×NPCs) lookup living at the composition-root layer rather than an indexed accessor on `SettlementsManager`. Bounded by current settlement/NPC counts (small), **P3, acceptable** — noted under Performance Boundary (§11) rather than fixed.

---

## 9. Callback / Capability Audit (plan §10)

- **`GameLoopDeps`** (`gameLoop.ts:200-334`) carries ~30 callback fields, all one direction (`createApp.ts` → `gameLoop.ts`/action modules). No workaround-for-missing-API smell found — every action module either calls a real owner method or a `busy.start` completion closure.
- **`PlayerActionContext`** (`actionContext.ts:27-49`) is one consolidated DI object for the action modules, deliberately not split per-module (documented rationale in the file header) — a reasonable seam, not re-litigated here.
- **Fauna→player/NPC damage callbacks** are the correct direction (§4 trace 3) — the sole cross-domain callback pair in the whole codebase, and both point the right way.
- **New finding**: `NpcAgent.die()` has **no death-propagation hook at all**, unlike livestock's `onAnimalDeath` (`createSettlement.ts:209-211`, which lets the settlement react to a livestock death for respawn bookkeeping). `NpcAgent.die()` (`NpcAgent.ts:1669-1685`) stops the mesh/animation and records a trace event, but nothing tells `Household` (family headcount), `SettlementEconomy`, or `QuestManager` (if this NPC was a quest giver) that the NPC is gone — a distinct architectural gap from plan 195's already-logged "NPC death isn't persisted": this is about *live-session* propagation, not persistence. **P1**, see Finding 3.

---

## 10. Time Skip Execution Map (plan §11)

| System | Normal tick | During skip | Catch-up mechanism | Notes |
|---|---|---|---|---|
| `DayNightState` clock | `tickDayNight(dt)` | same call, but `dayNight.timeMultiplier` boosted so `elapsedDays`/`timeOfDay` race ahead each real frame | none needed (already accelerated) | `timeSkip.ts:81-91`, `dayNight.ts:53-60` |
| Player needs | `worldDt=dt` | `worldDt=dt*timeMultiplier`, live-ticks through | none (plan 165, confirmed correct, no double-count) | `gameLoop.ts:1437, 1487-1494` |
| NPCs (needs/vigor/schedule/economy deposits) | `worldDt=dt` | **also** `worldDt=dt*timeMultiplier` — full live FSM execution at up to ~20× (default `dayLengthSec=480`) | `NpcAgent.resolveTimeSkip()` replays the same wall-clock period **again** on `justFinished` | Already logged (192/LOOSE-ENDS 2026-08-22). **This audit adds**: the replay also re-mutates `Household.water`/wood-duty/hunger resolution (`NpcAgent.ts:2126-2136`) — so the double-count duplicates real **economy/household stock quantities**, not just need-bar values. See Finding 1. |
| Fauna | `worldDt=dt` | `worldDt=dt*timeMultiplier`, **full behavior tree** (movement/predator-prey combat/corpse decay/player-NPC damage callbacks) live-ticks at the same acceleration | **none exists** — confirmed via repo-wide grep, `resolveTimeSkip` only exists on `NpcAgent`/`SettlementsManager` | New, most severe finding of this audit — see Finding 0/2 |
| Household/settlement economy stock | mutated at NPC chop/deposit/production completions | mutated live at the accelerated rate (same NPC tick) | **also** replayed inside `resolveTimeSkip`'s per-step branch | Same root cause as NPC needs, wider blast radius (concrete resources, not just bars) |
| Crop/tree lifecycle | N/A, pure fn of `elapsedDays` | same — resolved lazily on next read | self-resolving | confirmed 100% lazy, zero per-frame cost, no `update()` exists |
| Weather/season | N/A, pure fn of `(seed, elapsedDays)` | still recomputed every real frame (cheap re-derivation) | none needed | `gameLoop.ts:1442,1448` |

**Two contradicted doc comments, both pointing the same direction:**
- `gameLoop.ts:1426-1436`'s own comment claims "NPCs/fauna freeze instead of continuing to walk/steer in real time... `NpcAgent.resolveTimeSkip` catches them up... nothing is lost by not ticking them meanwhile" — directly contradicted by the code immediately following it (`worldDt` fed unconditionally into both `settlementsManager.update` and `fauna.update`, confirmed by grep: zero `timeSkip.isActive()` gate anywhere in `NpcAgent.ts`/`AnimalAgent.ts`/`createSettlement.ts`; the only `frozen` field found is an unrelated debug-inspector toggle).
- `world/timeSkip.ts:48-52`'s own design comment states it "deliberately does **not** scale `dt` for anything else (NPC/fauna movement would fly off into the void at a large multiplier) — the world keeps simulating at its normal real-time pace underneath." The actual `gameLoop.ts` code scales `dt` for fauna's **full** update (movement, combat, everything) via `worldDt`, not real-time pace as promised.

Both comments describe an intended architecture (freeze-and-catch-up, or true real-time-underneath) that the code does not implement. Per audit scope, **not corrected in code or comments this session** (would require a design decision on which model is intended — see Follow-up §13) — recorded here as a documentation-vs-code discrepancy per plan's Verification section.

---

## 11. Ordering and Determinism (plan §12)

| Case | Classification | Evidence |
|---|---|---|
| `worldDt` computed once, feeds NPC/fauna/traps in that order | **required** by current code (traps reuse fauna's freshly-updated agent list, comment confirms deliberate) | `gameLoop.ts:1437,1584,1601,1657` |
| NPC-decisions-before-fauna-damage ordering (one-frame lag: an NPC hit by fauna this frame only reacts next frame) | **accidental** — no code/comment states this is deliberate | `gameLoop.ts:1584` vs `1647`; new finding (Finding 6) |
| Player combat resolution before day/night/NPC/fauna tick each frame | **intentional** (input responsiveness) though undocumented as a rule | `gameLoop.ts:674` vs `1403` |
| NPC-to-NPC separation/push | **required-and-correctly-handled**: computed from a single pre-update position snapshot for all agents, applied after, avoiding "order affects who pushes whom" | `createSettlement.ts:598-628` — verified clean |
| Fauna neighbor reads (`nearest()`, `applyRotInfluence`) mid-array-iteration | **accidental, benign** — later-indexed agents read already-moved earlier agents' post-update state this frame, earlier-indexed agents read last-frame state for later ones; standard "partially stale neighbor" artifact of sequential single-array updates, not a correctness bug (two predators can both land a hit on the same prey in one frame — harmless) | `createFauna.ts:810-827` |
| Herd leader selection | **order-independent by design** (lexicographically smallest alive `animalId`, recomputed on demand) | `herdCohesion.ts:85-95` — verified clean |
| Settlement/household/economy: which NPC "wins" a scarce shared resource deposit/production slot when multiple NPCs act on the same `Household`/`SettlementEconomy` in one frame | **accidental** — a function of `Map`/array iteration order, deterministic (same seed → same order → same outcome) but not documented as intentional | `SettlementsManager.ts:418-430`, `createSettlement.ts:626` — new finding, **P2**, worth a note if ordering guarantees ever become a stated contract (relevant to the multiplayer-readiness goal in `ARCHITECTURE.md`) |
| Combat critical-hit/ranged-deviation randomness | **not** order-dependent — deterministic seam keyed by `(attackerId, attackKey, attempt)`, not iteration index | `npcCombat.ts:90-97`, `criticalHit.ts` — verified clean |
| Cosmetic randomness (dialogue line pick, player-pause reaction roll) | uses raw `Math.random()`, but affects presentation only, never simulation state | `dialogue.ts:245`, `NpcAgent.ts:1781` — acceptable |

---

## 12. Duplicate Sources of Truth (plan §13)

**No new duplicate authoritative-state source was found** beyond what plan 195 already documented (Household-not-carried vs. SettlementEconomy-carried is an *absence* of a carry mechanism, not a duplicate). This audit's contribution is narrower and different in kind: the time-skip mechanism creates a **duplicate mutation event** for the same wall-clock period (live tick + replay), which is a process/ordering bug rather than a structural two-owners-for-one-concept problem — recorded under Findings 1/2, not here, to avoid mis-classifying it against plan 195's taxonomy.

One item flagged for verification, not confirmed as a duplicate: `resourceDeposits` takes no rebuild snapshot (§6) — if depletion state is meant to be session-durable, an in-session terrain rebuid silently resets it to fresh, which *would* be a real "which value is authoritative" question once someone confirms the intended contract. Not confirmed either way this session (Finding 8, **P2**, needs a targeted look).

---

## 13. Performance Boundary (plan §14)

Scope: only architectural proposals from this audit that could regress the current path (no full performance audit performed, per plan instruction).

- **Fauna→NPC damage callback linear scan** (`gameLoop.ts:1643-1650`) over every loaded settlement's NPC array per hit — bounded by current settlement/NPC counts, **P3, acceptable**. If `SettlementsManager` ever grows an indexed `findNpcById`, this callback is a natural (optional) consumer — not proposed as required work.
- **`AnimalAgent.update`/`Fauna.update` large positional-parameter signatures** (13/12 positional args respectively) — no performance cost, pure readability/maintainability, **P3**.
- None of the refactor candidates proposed in §14 below add a new per-frame traversal, allocation, or worker round-trip; each is either a pure code-motion (extract a block into a named function/module, same call graph) or a data-model addition (a snapshot/carry array, same shape as the already-existing `carriedEconomies`/`carriedSpawnerState` pattern) — verified against the "would this proposed boundary cost extra" question the plan asks.

---

## 14. Prioritized Problems, P0–P3

### P0 — Correctness

| # | Finding | Evidence | Impact |
|---|---|---|---|
| 0 | **Fauna's full behavior tree (movement, predator/prey combat, corpse decay, player/NPC damage callbacks) runs unthrottled at up to ~20× real speed and with zero catch-up during an active time-skip** — contradicting both `gameLoop.ts`'s own comment claiming fauna "freezes" and `timeSkip.ts`'s own explicit design invariant against scaling NPC/fauna movement dt ("would fly off into the void") | `gameLoop.ts:1437,1601-1653` (no `timeSkip.isActive()` gate anywhere fauna-side, confirmed by grep); `timeSkip.ts:48-52`'s contradicted comment; `AnimalAgent.ts:2218-2243`'s uncapped-step `steerToward` Euler integration at up to ~20× step size, `CONTACT_RANGE=0.8` | A predator can fully hunt, chase, and kill livestock/NPCs, or damage the player through the `onHumanHit` callback, silently and irreversibly during an 8-hour sleep skip the player experiences as ~8 real seconds behind an overlay — "błędna symulacja" with an irreversible in-session consequence (an NPC/livestock death) the player never saw or could react to. Previously **unlogged** — distinct from, and more severe than, the already-tracked NPC-needs double-count. |

### P1 — Architectural

| # | Finding | Evidence | Impact |
|---|---|---|---|
| 1 | Time-skip double-counting (already logged, plan 192/LOOSE-ENDS 2026-08-22) **also duplicates real economy/household resource quantities** (wood/food/water), not just need-bar values — this audit's direct trace of `resolveTimeSkip`'s `household.water.add(...)`/wood-duty/hunger branches (`NpcAgent.ts:2126-2136`) confirms the replay re-executes actual stock mutations already applied live during the accelerated tick | `NpcAgent.ts:2126-2136` vs. the live per-frame `settlementsManager.update(worldDt,...)` path | A long rest/sleep skip can mint extra wood/food/water into household/settlement stock beyond what either path alone would produce — a resource-integrity bug, stronger than a cosmetic needs-bar issue. Recommend the existing LOOSE-ENDS entry be treated as covering this broader scope (see §15). |
| 2 | `NpcAgent.die()` has no death-propagation hook to `Household`/`SettlementEconomy`/`QuestManager`, unlike livestock's `onAnimalDeath` | `NpcAgent.ts:1669-1685` vs. `createSettlement.ts:209-211` | An NPC killed by fauna this session leaves family headcount/quest-giver bookkeeping silently stale for the rest of the session — distinct from, and upstream of, plan 195's "NPC death isn't persisted" (this is live-session propagation, not save/load). New. |

### P2 — Maintainability / narrower correctness

| # | Finding | Evidence | Impact |
|---|---|---|---|
| 3 | Time-skip catch-up's water-drink branch is unconditional, unlike the live path's availability gate (`household?.water.has(...)`) | `NpcAgent.ts:2128-2129` vs. `2343-2350` | Time-skipped NPCs can never actually go thirsty from an empty household barrel, unlike live-played ones. Narrower sub-symptom of Finding 1; likely resolved by the same fix. |
| 4 | `DecisionContext.extras`/`SimulationEntityRef` effectively write-only/dead in both of the shared contract's only two consumers | `NpcAgent.ts:1818,1830,2276-2295`; `AnimalAgent.ts:1472-1519` | The "shared decision seam" plan 055 built is largely decorative — misrepresents the contract's real load-bearing surface to future maintainers. |
| 5 | NPC bypasses `adoptPlannedAction` (fauna uses it), reimplementing "always replace" inline | `NpcAgent.ts:2234-2256` vs. `AnimalAgent.ts:1468` | Any future extension to `adoptPlannedAction`'s replace/adopt semantics silently won't apply to NPCs; inconsistent use of the one shared action-control helper. |
| 6 | Two parallel combat *execution* shapes despite one shared math library: player-vs-animal resolved inline in `gameLoop.ts` (`animal.takeDamage(...)` direct calls), NPC-initiated attacks go through `combat/combatIntent.ts`'s `CombatTargetHandle` | `gameLoop.ts:762,918` vs. `NpcAgent.ts:1456`/`npcCombat.ts` | A future "player can be attacked by/attack NPCs" feature, or any change to how damage application is gated, has to be added in two places; `gameLoop.ts`'s melee/ranged blocks also duplicate ~15 lines of critical-roll/toast/audio/quest-hook logic between them. |
| 7 | `resourceDeposits` has no carry-snapshot across an in-session `WorldBundle` rebuild, unlike every other member with session-durable state | `worldBundle.ts:540,570` | Unconfirmed whether depletion is meant to be session-durable — flagged for a targeted look, not verified as a bug. |
| 8 | Shared-resource contention order (which NPC wins a scarce deposit/production slot) is a function of undocumented iteration order | `SettlementsManager.ts:418-430` | Deterministic but unstated; relevant to the multiplayer-readiness goal in `ARCHITECTURE.md` if ordering guarantees ever become load-bearing. |
| 9 | Fauna has no `resolveTimeSkip`-equivalent catch-up at all (asymmetric vs. NPC) | confirmed via repo-wide grep | Distinct from Finding 0's severity concern — recorded here as the "missing symmetry" framing of the same root cause. |

### P3 — Optional / cosmetic

| # | Finding | Evidence |
|---|---|---|
| 10 | Fauna→NPC damage callback does an O(settlements×NPCs) linear scan per hit | `gameLoop.ts:1643-1650` |
| 11 | Fauna→player-damage callback embeds ~25 lines of player-melee/ranged-reset logic inline at the `fauna.update` call site instead of a named helper | `gameLoop.ts:1610-1636` |
| 12 | `AnimalAgent.update`/`Fauna.update` large positional-parameter signatures (13/12 args) | `AnimalAgent.ts:1280-1306`, `createFauna.ts:795-826` |
| 13 | One-frame lag between NPC decision pass and fauna→NPC damage application | `gameLoop.ts:1584` vs. `1647` |
| 14 | `docs/ARCHITECTURE.md`'s rebuild-lifecycle description omits the `treeLifecycle` cache-clear step | `worldBundle.ts:552-553` — **fixed directly**, see §16 |
| 15 | `src/fauna/foodWaterTargeting.test.ts` has no matching `foodWaterTargeting.ts` — it tests functions exported directly from `AnimalAgent.ts` | file listing |
| 16 | `NpcAgent`'s public `readonly health`/`stamina`/`vigor` fields expose mutable inner objects — convention-enforced boundary, not type-enforced | `NpcAgent.ts:680-682` |

### Verified clean (no finding — recorded per Evidence Standard)

`WorldBundle` rebuild lifecycle (field-by-field carry/reset/recreate matches the documented model); combat math (`criticalHit`/`defenseResolver`) genuinely shared and symmetric across all three attacker kinds; player action modules (`src/app/actions/*`) never bypass an owner API; herd-leader selection is order-independent; NPC-to-NPC separation avoids the classic order-dependent push bug via a pre-update snapshot; crops/trees/weather remain 100% lazy World-Time with zero per-frame cost; `createApp.ts` contains no runtime gameplay logic that should belong to a subsystem; `docs/STATE.md`'s "vigor collapse interrupts a schedule-driven action" sentence is already correctly scoped under its "NPC daily routine" heading (an initial sub-audit read it as a general/player claim — re-verified against the surrounding section header, it is not a discrepancy).

---

## 15. Refactor Candidates (plan §17)

| Candidate | Problem | Current boundary | Proposed change | Risk | Priority |
|---|---|---|---|---|---|
| Gate NPC/fauna/economy simulation behind `timeSkip.isActive()`, extending catch-up to fauna+economy — **or** deliberately keep live-ticking and drop/rewrite the now-redundant `resolveTimeSkip` replay, fixing both stale comments to describe reality | Findings 0, 1, 3, 9 | `worldDt` fed unconditionally into `settlementsManager.update`/`fauna.update`; only NPCs get a (redundant) catch-up | design decision required (freeze-and-catch-up vs. live-only), then a mechanical follow-through once decided | M — gameplay-balance-sensitive, not mechanical | **P0/P1** |
| Add an NPC death-propagation hook mirroring livestock's `onAnimalDeath` | Finding 2 | `NpcAgent.die()` has no external hook | thread an `onNpcDeath?(npcId, settlementId)` callback through the same injection path `onAnimalDeath` already uses | S-M | P1 |
| Verify/add `resourceDeposits` carry-across-in-session-rebuild if depletion is meant to be session-durable | Finding 7 | no snapshot taken before dispose | mirror the existing `carriedEconomies`/`carriedSpawnerState` pattern — **could be folded into the already-recommended plan-195 `arch--household-economy-rebuild-carry` follow-up** rather than a separate plan | S | P2 |
| Trim or genuinely wire `DecisionContext.extras`/`SimulationEntityRef` (currently write-only in both consumers); reconcile NPC's `startAction` with `adoptPlannedAction` | Findings 4, 5 | dead/inconsistent contract usage | either drop `.extras`/`SimulationEntityRef` from the two live call sites, or wire one real consumer; adopt `adoptPlannedAction` in `NpcAgent.startAction` or document why it intentionally diverges | S | P2, opportunistic |
| Extract the fauna→player-damage inline callback into a named helper | Finding 11 | 25 lines inline at the `fauna.update` call site | `function onFaunaHitPlayer(...)` in `gameLoop.ts` or a small local module | S | P3 |
| Index NPC-by-id lookup on `SettlementsManager` | Finding 10 | linear scan in the fauna→NPC damage callback | small `Map`-backed accessor, consumed opportunistically | S | P3 |
| Extract the 674-1401 interaction/combat block | already logged (LOOSE-ENDS 2026-08-21) | — | — | — | reaffirmed, no new action |

Not proposed (per plan's explicit exclusions): a global `SimulationManager`, an event bus, a shared `Agent` base for NPC/fauna, a full `gameLoop.ts` rewrite, or any change to the time-skip *model* itself (the freeze-vs-live-tick decision above is a design choice for the follow-up plan to make, not something this audit decides).

---

## 16. Documentation fix made this session

`docs/ARCHITECTURE.md`'s "World lifecycle" section (`rebuildWorldBundle` bullet list) now also names the `treeLifecycle` presence/override cache clear alongside the road-network cache clear, matching Finding 14 (§6). No other documentation or code was changed — this is a pure audit per the plan's explicit "not yet a refactor" scope.

---

## 17. Follow-up Architecture (plan §18)

```text
fix now:
  - docs/ARCHITECTURE.md rebuild-lifecycle wording (Finding 14) — done, see §16

follow-up plan:
  - arch--timeskip-simulation-gating (or similar)
    Covers Findings 0, 1, 3, 9 — the single root cause (worldDt fed unconditionally
    into settlementsManager.update/fauna.update with no timeSkip.isActive() gate,
    plus NPC's redundant resolveTimeSkip replay). Needs a product/design decision:
    true freeze-and-catch-up (matching both existing doc comments) vs. deliberate
    live-tick-through-rest (dropping/rewriting the redundant replay and fixing the
    comments). Broadens and supersedes the existing LOOSE-ENDS 2026-08-22 entry —
    recommend updating that entry to reference this audit's economy-stock and
    fauna-specific findings rather than opening a second, narrower entry.

  - arch--npc-death-propagation
    Finding 2 — add an onNpcDeath hook mirroring onAnimalDeath.

  - simulation--decision-context-cleanup (optional, opportunistic)
    Findings 4, 5 — trim src/simulation/'s vestigial surface or wire it for real.

follow-up plan (fold into existing plan-195 recommendation, don't duplicate):
  - resourceDeposits rebuild-carry (Finding 7) — piggyback on the already-recommended
    arch--household-economy-rebuild-carry plan (plan 195) rather than a new plan.

acceptable (record, no action required):
  - Findings 6, 8, 10, 11, 12, 13, 15, 16 — P2/P3, no correctness impact today,
    opportunistic cleanup when next touching the relevant code, per plan
    instruction not to make P2/P3 fixes mandatory.

documentation only:
  - Finding 14 — fixed this session (§16).
```

Names are illustrative, per plan's own instruction — not created as separate numbered plan files this session; logged to `docs/plans/LOOSE-ENDS.md` for triage, matching the convention plan 195 used.

---

## 18. Verification

Audit-only plan — no gameplay/simulation code was changed, only one documentation sentence (`docs/ARCHITECTURE.md`). Per `CLAUDE.md`, `.md`-only changes in `docs/` do not require `tsc`/lint/build/test. No browser/manual verification is applicable to this session's output (the findings above describe what a *future* fix would need to verify, not what this audit itself changed).
