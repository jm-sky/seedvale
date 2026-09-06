# State Documentation Audit — Stage 3: Cross-Domain Integrations

**Date:** 2026-09-06
**Baseline:** `83360715e87f0fb0c79cb254381271a231c51ab9`
**Agent:** Claude Code — Opus 5
**Scope:** Synthesis over the Stage 1 inventory (`01-inventory.md`) and all seven Stage 2 domain audits (`02`–`08`), plus targeted verification at the Stage 3 baseline: `git log`/`git diff --stat` for baseline drift across every prior audit's SHA; `src/persistence/saveData.ts` (`CURRENT_SAVE_VERSION`); `foodBatches` call-site fan-out across `src/`; `src/player/PlayerController.ts` (`PLAYER_MAX_HP`); SPEA/`strength`/`agility`/`perception`/`endurance` fan-out across `src/`; `src/settlement/npcPhysicalProfile.ts`; `docs/world/species-physical-reference.md` (§§7–8, 11); `docs/STATE.md` (full), `docs/state/README.md`. No gameplay code, current-state documentation or prior audit artifact was modified. No subagents, no repo-wide scan, no browser verification.

---

## 0. Baseline reconciliation

Prior audit baselines: `01` = `28c5dfd6`, `02`/`03` = `142586c8`, `04`/`05` = `f1e362d2`, `06`/`07` = `5071a994`, `08` = `6d5ae470`. Stage 3 baseline = `83360715`.

**`git diff --stat 28c5dfd6..83360715 -- src/` is empty.** Every commit from the Stage 1 baseline to now is documentation-only:

```text
83360715 docs: add Stage 2 state audit for persistence domain
6d5ae470 docs: add Stage 2 state audit for player/items domain
03649147 docs: add Stage 2 state audit for combat domain
9aca0ca9 docs: add authoritative species physical reference   ← new: docs/world/species-physical-reference.md
5071a994 docs: add Stage 2 state audits for NPC and fauna domains
51108685 docs: align NPC physical state vision with SPEA roadmap
a989f5c6 docs: add physical attributes health and medicine roadmap
f1e362d2 docs: add Stage 2 state audits for world/terrain/water and settlements/economy
142586c8 docs: add Stage 1 state documentation audit inventory
```

**Consequence:** there is no code drift between any Stage 2 audit and this synthesis. Every `02`–`08` finding is valid at `83360715` without re-verification, and this pass could spend its targeted reads on contradictions and ownership questions instead of currency checks. Where this document does re-verify a fact, it is because two audits disagreed or because the fact is load-bearing enough to state as an invariant.

### `docs/world/species-physical-reference.md` — classification

**Authoritative design reference. Not an implemented runtime system.** Verified:

- No `SPEA` identifier exists anywhere in `src/`. No `strength`/`agility`/`perception`/`endurance` field exists on `AnimalDef` (`src/fauna/AnimalAgent.ts`) or on `PhysicalProfile` (`src/settlement/npcPhysicalProfile.ts` — its only mention of `strength`/`agility` is a doc comment stating they are explicitly **out of scope**).
- The document's own §7 frames itself as guidance for *future* implementation plans; its §8 explicitly states that current `MAX_HP`, `DAMAGE_TABLE`, `walkSpeed`/`sprintSpeed`, `detectRange`/`fleeRange` and `DEFAULT_ANIMAL_METABOLISM` are "current implementation behaviour, not biological source data" and must not be silently rebalanced by the reference's existence; its §11 sets the update discipline (reference first, then migrate consumers through focused plans).

It therefore belongs in the **future/design relationship, not implemented** category of §6's seam matrix, alongside `docs/vision/npc-physical-state.md` and `docs/vision/physical-attributes-health-and-medicine.md` (both also docs-only, both added in this same window). It must not appear in `docs/STATE.md` or any `docs/state/*.md` as current state. Its one legitimate current-state touchpoint is the **existing, implemented** `npcPhysicalProfile.ts` (deterministic max HP / stamina / vigor from sex + a 9-stage `LifeStage` age curve) — which is real today and is what a future SPEA layer would extend.

---

## 1. Executive synthesis

Seedvale's cross-domain architecture is, at this baseline, **substantially more coherent than its documentation suggests**. The audit series found no duplicated authoritative state anywhere in the codebase, no competing sources of truth for any `SaveData` field, and a consistent set of conventions applied independently across domains that were written months apart. The problems are almost entirely documentation-side.

Six findings define the current system-level picture:

1. **Domains integrate through a small number of genuinely shared primitives, not through a bus or a god object.** `Inventory`/`ItemKind`, `HealthState`/`StaminaState`, `WaterSource`, `slopeConstraint`, `simulation/{PlannedAction,ActionLifecycle,ScoredAction}`, the buildable `contributeWork` seam, and the terrain sampling surface on `ChunkManager` are the load-bearing seven. Each is owned by exactly one module, consumed unchanged by three or more domains, and — critically — the *player* uses the same instance of most of them that NPCs and fauna do.

2. **Cross-domain calls flow through injected hooks, not direct imports — with exactly one confirmed exception.** `ai/` never imports `fauna/`'s concrete classes (`SettlementHuntingHooks`, `ThreateningAnimalCandidate[]`, `CombatTargetHandle` are all data/function-shaped seams); `quests/` never imports `ai/`/`fauna/` for state (`AnimalTargetResolver`/`LandmarkResolver` are injected). The exception is `fauna/AnimalAgent.ts` importing `ai/npcMovementWatchdog.ts` directly (`05`) — deliberate reuse, but it breaks the otherwise-uniform convention and is worth naming so a future refactor doesn't "fix" it into a fauna-local duplicate.

3. **`SaveData` is a serialization format, not a runtime authority** (`08` §4 Q1, verified directly). It has no behaviour, is never mutated in place by gameplay code, and every field traces to exactly one runtime owner. Restore *is* construction — `createApp` reads each field once at its owning system's constructor; there is no second "apply save values" pass. The same snapshot methods `buildSaveData()` calls are the ones `rebuildWorldBundle()` calls, so save-carry and in-session-rebuild-carry cannot drift.

4. **The persistence boundary follows one rule, consistently:** a value that is a pure function of `(seed, [elapsedDays/region params])` is never persisted (terrain, hydrology, weather, `VillagePlan`, NPC identity, location geometry, wild-fauna population, settlement-plan memoization); a value that depends on history is persisted; values that sit on the boundary persist as **sparse deltas over a deterministic base** (`terrainModifications`, `resourceDeposits`, `grassForagePatches`, `spawnPoints`, `map.discoveredLocations`, `removedLivestockIds`). This is a repository-wide convention that no single document currently names.

5. **The player is a first-class participant in shared mechanisms almost everywhere, with three real asymmetries.** Player and NPC share `Inventory`, `HealthState`, `contributeWork`, `constructionMaterials`, `WaterSource`, `harvestAnimalIntoInventory`, `slopeConstraint`, `criticalHit`, `defenseResolver`, and the identical fishing catch rule. The asymmetries: **player melee/ranged cannot damage an NPC** (only animals are hit-test candidates); **fauna's outgoing attacks** use a flat `DAMAGE_TABLE` rather than the shared melee/ranged/critical pipeline; and **player HP does not persist** while NPC and livestock HP do. All three are documented in §7 with a classification.

6. **The single biggest documentation problem is `docs/STATE.md` itself**, and it is now measurably self-contradictory. Its Persistence section (accurate, verified at v6) is contradicted *within the same file* by its "Important shared concepts" bullet claiming `Household` is "not in save data," by its Fauna section claiming "no `AnimalAgent` runtime state is [persisted], wild or livestock," and by its Settlements/NPCs section claiming a helper assignment "is not yet part of `SaveData`." All three are stale; all three are contradicted by code and by the same document's own Persistence paragraph. This is a direct, measurable consequence of the implementation-history-leakage pattern `01`–`07` each flagged independently: the per-plan narrative paragraphs were appended over months and never revisited, while the Persistence section was.

---

## 2. Current system graph

The brief's hypothesized graph is a **layered pipeline**. The code is not layered — it is a small set of deterministic generators, a set of authoritative registries, and a set of peer actors that share mechanisms. Corrected:

```text
                    ┌────────────────────────────────────────────────┐
                    │ DETERMINISTIC GENERATORS  (pure, unpersisted)   │
                    │ seed → terrain · hydrology · rivers · roads      │
                    │        biome/forest density · natural resources  │
                    │        weather/season = f(seed, elapsedDays)     │
                    │        VillagePlan/SettlementDef · families      │
                    │        NPC identity · location geometry          │
                    └───────┬────────────────────────────────────────┘
                            │  PULL (queries), never push.
                            │  ChunkManager.sample* is the shared surface.
        ┌───────────────────┼───────────────────┬──────────────────────┐
        ▼                   ▼                   ▼                      ▼
  ┌───────────┐      ┌────────────┐      ┌───────────┐        ┌──────────────┐
  │ SETTLEMENT│◄────►│    NPC     │◄────►│   FAUNA   │◄──────►│    PLAYER    │
  │ generation│      │ ai/ + npc- │      │ AnimalAgent│        │ player/ +    │
  │ households│      │ State      │      │ livestock  │        │ app/actions/ │
  │ economy   │      │ relations  │      │ rats       │        │ items/       │
  └─────┬─────┘      └─────┬──────┘      └─────┬─────┘        └──────┬───────┘
        │                  │                   │                     │
        └──────────────────┴───────┬───────────┴─────────────────────┘
                                   │
              ┌────────────────────▼─────────────────────┐
              │ SHARED MECHANISMS (owned once, reused)    │
              │ Inventory/ItemKind · HealthState/Stamina  │
              │ WaterSource · slopeConstraint             │
              │ simulation/{PlannedAction,ActionLifecycle,│
              │             ScoredAction}                 │
              │ combat/{criticalHit,defenseResolver,      │
              │         combatIntent}                     │
              │ world/workContract + contributeWork       │
              │ economy/localExchange claim seam          │
              │ GrassForageService · constructionMaterials│
              └────────────────────┬─────────────────────┘
                                   │
              ┌────────────────────▼─────────────────────┐
              │ SaveData  (serialization format only)     │
              │ read once at boot → each owner's ctor     │
              │ written once per save ← each live owner   │
              └───────────────────────────────────────────┘
```

### What the hypothesized diagram got wrong

| Hypothesis | Correction |
|---|---|
| `world/terrain/water/weather ↓ resources ↓ settlements` — a push cascade | Terrain/hydrology/weather are **pure functions consumers pull from**. `ChunkManager.sample*` is the query surface; nothing is pushed downward. Weather is the one value *threaded* per frame (`gameLoop` → `SettlementsManager` → `Settlement.update()` → `NpcAgent.update()`), and only as a performance measure — one computation shared by every NPC that frame, never a per-NPC recompute. |
| `settlements ↕ NPC` as one bidirectional edge | Three structurally different edges: (a) **state hosting** — `settlement/npcState.ts`/`npcRelationships.ts`/`npcPhysicalProfile.ts` hold authoritative NPC state but are consumed near-exclusively by `ai/`; (b) **resource mediation** — `Household`/`SettlementEconomy` are the only channel through which one NPC's work reaches another NPC; (c) **spatial/schedule** — `Place`/`places.ts`. |
| `player` as a layer between NPC and fauna | The player is a **peer actor**, not a layer. It reaches settlements, NPCs, fauna and world objects directly and, in most cases, through the identical mechanism an NPC uses. |
| `combat → persistent consequences` as a distinct stage | Combat has **zero persisted state**. Its consequences persist inside each *target's* own domain field (`npcStates.physicalInjury`, `livestock` HP, corpse state) — and, for the player, not at all. |
| `persistence` as the bottom of a pipeline | `SaveData` is a **peer of deterministic reconstruction**, not a downstream sink. For any given concept, the world is rebuilt from *either* determinism *or* a persisted value *or* determinism-plus-a-sparse-delta. |

### Real cycles the linear diagram hides

These are the loops that make the simulation feel alive, and none of them is visible in a hierarchical reading:

1. **Food ↔ pest pressure.** `Household.items` + `SettlementEconomy` food → `ratPopulationTarget()` → rats spawn → `maybeEatFood()` drains the same stores → target falls → rats despawn. A `dog` (livestock) suppresses the target; `dogGuard.ts::resolveDogPestTarget()` also hunts rats directly. Settlement ↔ fauna ↔ economy, closed.
2. **Hunt → household → hunger.** NPC hunger pressure → hunter's `food` strategy → `SettlementHuntingHooks.queryTarget` (fauna) → `CombatIntent` → `AnimalAgent.takeDamage` → corpse → `harvestAnimalIntoInventory` (the *player's* function) → `Household.items` → relieves that NPC's and its family's hunger → pressure drops. NPC ↔ fauna ↔ items ↔ settlement ↔ NPC, closed. The seeded single-individual population-protection roll in `huntingHooks.ts` is what stops this loop from hunting a local population to extinction.
3. **Player builds → NPC labours → player's object completes.** Player places a well/palisade/torch/terrain-prep → creates a `WorkContractRecord` → physically posts it at a settlement notice board → an NPC's *idle* branch (never pre-empting a real need) evaluates and accepts it → the NPC's work bouts call the **same** `contributeWork(id, amount)` seam the player's own `[E]` bouts call. Player ↔ world objects ↔ settlement ↔ NPC ↔ back to the player's object.
4. **Weather → shelter → work not done.** `computeWeather` → `weatherShelterPressure` competes in `choose()` → an NPC walks home instead of working → household/settlement stocks don't grow → shortage flags bias the *need* pressures on the next cycle. Also: the same `computeRainExposureDays()` history feeds garden hydration and sleeping-utility decay — three independent lazy consumers of one deterministic weather function, never a second weather simulation.
5. **Corpse → ecosystem.** A `rotting` corpse drains stamina from live fauna within 5 m and can transmit rabies (corpse-contact vector); a rabid animal bypasses the whole behaviour table and chases live targets, spreading by bite. Fauna → fauna, with an NPC/player-facing consequence when it reaches a settlement.

---

## 3. Authoritative ownership map

One row per shared concept. "Persisted representation" is the `SaveData` field, if any; "derived/runtime" is state that is recomputed rather than owned.

| Concept | Owner (authoritative) | Producers | Consumers | Persisted representation | Derived / runtime | Mutation responsibility |
|---|---|---|---|---|---|---|
| **World seed / config** | `config/worldConfig.ts` + `SaveData.seed` | player (new world), seed catalog (`seedDb.ts`) | every generator | `SaveData.seed`; seed *metadata* lives in a separate `seeds` store, never required to load a save | — | Set once per world; never mutated in play |
| **Terrain / hydrology / rivers / roads** | `terrain/*` pure functions (`chunkHeightmap`, `hydrology`, `riverNetwork`, `riverFord`) | seed + region params + settlement footprints + `settlement/roadNetwork.ts` corridor waypoints | settlements (siting/naming/leveling), fauna (spawn clearance, traversal), locations/map, player+NPC+fauna movement | **none** — deterministically reconstructed | `riverTileCache`, `ChunkMeshDataCache` (in-session, byte-budgeted, evictable) | Never mutated as data; `ChunkManager.modifyTerrain` applies *deltas* on top |
| **Terrain modifications** | `ChunkManager`'s `TerrainModification[]` | player actions (dig/scorch/prepare), caves (`source: 'system'`) | terrain sampling | `SaveData.terrainModifications` — **`source: 'player'` only**; system entries filtered at save and re-carved deterministically | — | `ChunkManager.modifyTerrain` |
| **Weather / season / climate** | `world/weather.ts` (pure `f(seed, elapsedDays)`) | — | `ai/weatherPressure.ts`, garden hydration, sleeping-utility decay, visuals | **none** (only `elapsedDays` persists) | `ClimateState`/`tickClimate` recompute-on-cycle-boundary cache | Not mutable |
| **Time / clock** | `DayNightState` | `gameLoop` | everything lazy (`nowDays` anchors) | `SaveData.timeOfDay`, `SaveData.elapsedDays` | — | `gameLoop` only |
| **Water sources** | `world/WaterSource.ts` (the *contract*); the physical answer is `terrain/waterSample.ts::sampleLocalWater()` | wells (player-built), lakes/ocean (`waterBodies`), rivers (`riverNetwork`) | player drink/fill, `Household` animal/NPC watering, `items/itemCatalog`, fauna traversal classifier | the *well record* persists (`SaveData.playerWells`); the `WaterSource` itself is reconstructed from it | quality/`requiresRope`/`consumptionRisk` are per-source data, not state | Well construction/records only |
| **Settlements (plan)** | `settlementGenerator.ts` → `VillagePlan` (`SettlementDef` is a thin projection) | seed + cell + terrain samplers | `createSettlement`, roads, streaming, debug tools | **none** — deterministic | `settlementPlanCache` memoization | Not mutable |
| **Settlement economy** | `SettlementEconomy` in `EconomyRegistry` (on `SettlementsManager`) | NPC profession work, Trader, player deposits | `development.ts` upgrades, NPC withdraw strategies, `rats.ts` | `SaveData.settlementEconomies` (**required**) | `shortage`/`surplus` computed live against fixed targets | `add`/`depositFood`/`withdrawFood`/`reserve` |
| **Households** | `Household` in `HouseholdRegistry` | NPC deposits, exchange, hay trickle | NPC strategies, livestock water/diet targets, `rats.ts`, lodging | `SaveData.households` (optional, sparse) — **`items` counts + instances only, no `foodBatches`** | `foodCount()`, `shortage`/`surplus` | `deposit`/`depositFood`/`takeFood`/`water.add` |
| **Settlement/household storage location** | `settlement/storageDestinations.ts` (a pure WHERE resolver) | — | every wood/food delivery leg | — (destinations are derived from the plan) | storage crates/barrels are **presentation-only** | n/a |
| **Land ownership** | `LandOwnershipRegistry` (app-level, not `SettlementsManager`) | `landPurchase.ts` transaction | interactables, save | `SaveData.ownedLandPlots` — a **flat top-level array**, the one exception to the `initial*`/`snapshot*` idiom | — | `purchaseLandPlot()` only |
| **NPC authoritative state** | `NpcAuthoritativeState` in `NpcStateRegistry` (physically in `src/settlement/`, consumed by `src/ai/`) | `NpcAgent` actions, combat, needs tick | `NpcAgent` (direct reference, no copy) | `SaveData.npcStates` — **all 7 fields**: health, stamina, vigor, needs, `physicalInjury`, `helperAssignment`, `activePlan` | `phase`, `pendingAction`, pathfinding, watchdog, `combatIntent`, `carried` — reset on reconstruction | `NpcAgent` exclusively; **no NPC ever mutates another NPC's state directly** |
| **NPC identity / physical profile** | `settlement/families.ts` (`CharacterDef` producer) + `ai/characters.ts`/`nameCultures.ts` + `settlement/npcPhysicalProfile.ts` | seed | `NpcAgent` construction, dialogue, quests (by first name) | **none** — deterministic | — | Not mutable |
| **NPC↔NPC relationships** | `NpcRelationships` (symmetric pair store, by id) | `ai/socialBehaviour.ts` conversation outcomes | `socialBehaviour.ts` only | `SaveData.npcRelationships` (optional, sparse — non-zero pairs) | — | `adjust(a,b,delta)` |
| **Player↔NPC relations** | `QuestManager.relations` (scalar, **keyed by NPC name**) | quest rewards, dialogue | quest gates, `ai/reactionChance.ts`, `ai/npcAssistance.ts` | `SaveData.quests.relations` (required) | relation *level* derived via thresholds | `QuestManager` |
| **NPC health / injury** | `HealthState` (shared) + `physicalInjury` (`npcState.ts`) | `NpcAgent.takeDamage()` — the **single** NPC damage entry point | `ai/healingPressure.ts` → `beginHeal()` | inside `SaveData.npcStates` | — | Combat writes `physicalInjury` in exactly one line and never reads it back |
| **NPC inventory** | `NpcAgent.carried` (`Inventory`, `NPC_CARRY_MAX_WEIGHT = 5`) | claims, harvests, crafting | deposit legs | **not persisted** — an interrupted trip after claim genuinely loses the goods (accepted tradeoff) | — | `NpcAgent` |
| **Work contracts** | `WorkContractRecord` (`world/workContract.ts`) | player (`employer`, always `'player'` today) | `ai/npcWorkContract.ts` (pure evaluation), `NpcAgent` (drive) | `SaveData.workContracts` | `committedWork` frozen at creation; target progress lives on the target, referenced by id | `WorkContracts` methods; `creditNpcWork()` is the sole mutator of `npcWorkCompleted` |
| **Player state** | `PlayerController` + `PlayerNeeds` + `PlayerSkills` | player input, actions | HUD, encumbrance, actions | `SaveData.playerNeeds` (hunger/thirst/vigor/deprivation durations), `SaveData.skills` (xp only) — **`HealthState` is NOT persisted**; stamina deliberately not persisted | encumbrance, skill `value` from `xp` | Player actions |
| **Player inventory** | `Inventory` (player's own) | pickups, harvests, crafting | everything player-facing | `SaveData.inventory` + `inventoryInstances` + **`foodBatches`** (the only owner that persists freshness) | `totalWeight`/`totalSize`/`maxWeight` derived | `Inventory` methods |
| **Item definitions vs instances** | `ITEM_CATALOG` (`items/itemCatalog.ts`) is definition/capability data; `ItemInstance` (`items/itemInstances.ts`) is per-object state (durability/sharpness/liquid) with a **stable id surviving inventory ↔ drop ↔ container** | catalog is static; instances created on acquisition | every domain | definitions: none (code); instances: wherever their holder persists | `HeldTool` remembers *which* instance is in hand; `Inventory` owns it | `Inventory.updateInstance` |
| **Placed / world objects** | Each `world/*` record type, owned by a `WorldBundle` collection | player placement | player + NPC work, interactables, contracts | one `SaveData.<x>` array each (wells, torches, palisades, bedrolls, platforms, gardens, terrain preparations, containers, traps, drying racks, hives, dropped items, fishing bait) | meshes/colliders are projections | the collection's own methods |
| **Construction progress** | Each buildable's own record (`completedWork` / stage) | player `[E]` bouts, NPC contract bouts | completion gates | inside that object's `SaveData` entry — **never duplicated onto the contract** | — | the actor-neutral `contributeWork(id, amount)` seam only |
| **Fauna population (wild)** | `createFauna.ts`'s fixed `SPAWNS` table + `PreySpawner` | seed + settlement position | `Fauna.update` | **none** for individuals; `SaveData.spawnPoints` for spawner FSM + recovery clock only | ring-spawn placement deterministic | `AnimalSpawner.updateSpawners` |
| **Livestock** | `AnimalAgent` instances in `LivestockRegistry` | per-house deterministic roll | `Household` water/diet, riding, production, `dogGuard` | `SaveData.livestock` (full `AnimalSaveState`) + `removedLivestockIds` tombstones — **requires an explicit `capture()` before save**, since no live object survives a settlement unload | `productionReadyAtDays` resolved lazily against `nowDays` | `AnimalAgent`; `livestock.ts` for lifecycle |
| **Wild fauna individuals** | `AnimalAgent` instance | spawners | — | **none.** `AnimalSaveState`/`snapshot()`/`hydrate()` exist *generically on the class* but are policy-gated to livestock call sites | — | `AnimalAgent` |
| **Rats** | plain `AnimalAgent` instances + `rats.ts` reconciliation loop | `ratPopulationTarget()` over live food + dog count | `Household.takeFood`/`SettlementEconomy.withdrawFood` | **none, and not seed-derivable** — reconciled from zero on every settlement load | — | `rats.ts` |
| **Combat health / death** | `HealthState` (`src/shared/`) — one primitive for player, NPC, fauna | `combat/*` resolvers via each entity's own damage entry point | death consequences, diverging immediately per entity | inside each entity's own field (or not at all, for the player) | in-flight `CombatIntent`/attack phase/projectile: **never persisted** | each entity's own `takeDamage` |
| **Corpses** | fauna: `AnimalAgent` (`fresh → rotting → bones → removed`, `readyToRemove()` polled by the owner array). NPC: **no disposal path exists** — a dead NPC stays in `settlement.npcs` permanently | death | scavenging, harvest, rabies corpse-vector, rot stamina drain | fauna corpse state inside `livestock` record (livestock only) | — | `advanceCorpseDecay()` |
| **Quests / progression** | `QuestManager` | player interactions | dialogue overrides, relation gates | `SaveData.quests` (`progress`/`exp`/`relations`) | world bindings resolved through **injected resolvers**, never direct fauna/world imports | `QuestManager` |
| **Persistence** | `persistence/saveData.ts` (schema/validation/migration authority); `app/saveState.ts` (the one `SaveData` assembly point) | every domain's live owner | `createApp` constructors | `CURRENT_SAVE_VERSION = 6`, five registered migrations, validation on **write** as well as read | — | never mutated in place |
| **Runtime caches** | `worldgenCacheDb.ts` (persistent, `(seed, namespace, version, fingerprint)`, one namespace: `locations-coarse`); `riverTileCache`, `ChunkMeshDataCache`, `settlementPlanCache` (in-session) | their own producers | their own consumers | worldgen cache lives in a **separate IndexedDB store**, outside `SaveData` entirely | all of them | all safely evictable; **none is a second source of truth** |

---

## 4. Shared mechanisms

Ranked by architectural significance — how much of the system would have to change if the mechanism changed shape. Not all "shared" things are equally load-bearing, and the current documentation treats them as if they were.

### Tier 1 — mechanisms whose contract is a system-wide invariant

**`items/Inventory` + `ItemKind` + `ITEM_CATALOG`**
```text
Owner        items/Inventory.ts, items/itemCatalog.ts
Producers    every acquisition path (harvest, pickup, craft, claim, production)
Consumers    player bag · NpcAgent.carried · Household.items · SettlementEconomy.items
             · every PlacedContainerEntry.contents  (five distinct owner categories)
Mutation     Inventory's own methods only; ITEM_CATALOG capabilities are the single
             source of truth for every tool gate (no `kind === 'shovel'` checks remain)
Persistence  per-owner: player gets counts+instances+foodBatches; Household/Economy/
             container get counts+instances only (see §7 asymmetry A4)
Doc home     items/CATALOG.md (definitions) + a short shared-concept line in STATE.md
```
The most cross-cutting mechanism in the codebase: nine of ~30 top-level `src/` domains import it. A container's contents literally *are* an `Inventory`, not a second storage model — this is why chests, households and NPC carry all behave identically under transfer, weight and capacity rules.

**`shared/HealthState` (+ `StaminaState`, `VigorState`)**
```text
Owner        src/shared/*State.ts
Producers    every damage entry point: player defense pipeline, NpcAgent.takeDamage,
             AnimalAgent.takeDamage, starvation/dehydration, drowning, fall damage
Consumers    death/downed flows, healing pressure, corpse lifecycle, HUD/labels
Mutation     damageHealth/healHealth; each entity owns the *consequences* of dead=true
Persistence  NPC: inside npcStates · livestock: inside AnimalSaveState ·
             wild fauna: none · PLAYER: NONE (§7 asymmetry A3)
Doc home     state/combat.md owns the shared-primitive claim; persistence status
             belongs in a persistence doc, not repeated per domain
```
Death consequences **diverge immediately** after the shared flag flips — `AnimalAgent.collapse()` starts a decay timeline ending in removal; `NpcAgent.die()` has no disposal path at all; the player has downed/respawn. That divergence is correct (different entities, different consequences) but is nowhere stated as a deliberate three-way split.

**`SaveData` serialization + deterministic reconstruction (as one paired mechanism)**
```text
Owner        persistence/saveData.ts (schema) + app/saveState.ts (assembly)
Producers    every live runtime owner, read once per save
Consumers    createApp's constructors, read once per boot
Mutation     never mutated in place; validated on write AND read
Reconstruct  restore IS construction; rebuildWorldBundle uses the SAME snapshot
             methods buildSaveData does — the two paths cannot drift
Doc home     ARCHITECTURE.md #save-schema is the nominal owner but is stale (v1);
             a new docs/state/persistence.md should own the taxonomy (§10)
```
This pairing is what makes the four-way classification (persisted authoritative / persisted delta / deterministic reconstruction / runtime authoritative) an *architecture* rather than a set of per-domain decisions.

**Terrain sampling surface (`ChunkManager.sample*`)**
```text
Owner        terrain/* pure functions, exposed via ChunkManager / WorldContext
Producers    seed + region params (+ settlement footprints for stage-1 leveling)
Consumers    settlements (siting, naming, regional leveling) · fauna (habitat, spawn
             clearance, water traversal, forage scoring) · locations/map (coarse
             classification) · player/NPC/fauna movement (slope)
Mutation     read-only; the one write path is ChunkManager.modifyTerrain (deltas)
Persistence  none (deterministic) + terrainModifications/resourceDeposits deltas
Doc home     ARCHITECTURE.md states the principle ("consume these APIs rather than
             duplicate terrain logic") but enumerates nothing; the surface exists
             only in the type definitions
```

### Tier 2 — mechanisms that structure one flow each, across domains

**Buildable `contributeWork(id, amount)` + `world/workContract.ts`**
```text
Owner        each buildable's own module (playerWell.addWork, StandingTorches/
             Palisades/TerrainPreparations.contributeWork); the contract record
             is owned by world/workContract.ts
Producers    player [E] work bouts (app/actions/placementActions.ts)
             NPC contract bouts (NpcAgent.pursueAcceptedContract /
                                 runBuildableContractWorkBout)
Consumers    the target's own completion gate
Mutation     "clamp to remaining, credit only accepted work" — one seam, actor-neutral,
             never a per-actor progress field
Persistence  progress on the target's own SaveData entry; commitment on
             SaveData.workContracts; NEVER duplicated between the two
Doc home     currently SPLIT across STATE.md §Settlements/NPCs and §Items/player,
             described twice from two angles. Needs exactly one canonical home.
```
This is the clearest example in the codebase of a genuinely symmetric player/NPC mechanism, and simultaneously the worst-documented one.

**`economy/localExchange.ts` claim seam**
```text
Owner        economy/localExchange.ts (claimHouseholdSurplus / claimEconomySurplus)
             + items/foodItems.ts (claimFoodItems) for the concrete-item case
Producers    Household.surplus / SettlementEconomy.surplus, re-read AT CLAIM TIME
Consumers    ai/npcLogistics.ts (economyWithdraw, householdExchange,
             playerStorageDelivery, trader collection), settlement/householdExchange.ts
Mutation     atomic; never trusts a decision-time availability read
Persistence  none of its own — it moves value between two persisted owners; the
             claimed goods ride in NpcAgent.carried between legs (unpersisted)
Doc home     settlements/economy — it is settlement-owned code driven by NPC decisions
```
The same **live-revalidation-at-claim-time** discipline appears independently in `GrassForageService.consume()` (first-wins), in `harvestAnimalIntoInventory` (returns `null` with no mutation if the corpse or inventory changed) and in `constructionMaterials.consumeMaterial` (all-or-nothing). Four domains, one convention, never named as such.

**`simulation/{PlannedAction, ActionLifecycle, DecisionContext, ScoredAction}`**
```text
Owner        src/simulation/ (@domain shared, Three.js-free, ~250 lines)
Producers    —  (a vocabulary, not a system)
Consumers    ai/npcAction.ts, ai/npcDecision.ts, ai/npcAnimalThreat.ts, NpcAgent's own
             actionLifecycle (used for BOTH ordinary actions and combat intent),
             fauna/AnimalAgent (PlannedAction<FaunaActionKind>), fauna/faunaDecision.ts,
             fauna/predatorHumanDecision.ts, settlement/, assets/
Nuance       (reconciled between 04 and 05) — the TOP-LEVEL priority tables in BOTH
             domains (NPC_DECISION_PRIORITY, FAUNA_BEHAVIOUR_PRIORITY) are fixed
             ordered scans that do NOT call pickHighestScore. The real runtime
             consumers of pickHighestScore/pickActionKind are three SUB-decision
             modules: NpcAgent's need/weather/heal arbitration, fauna's
             predatorHumanDecision, and ai/npcAnimalThreat. Same shape, three sites.
Doc home     one worked example, in the domain with the richest one (NPC), + a
             cross-link from fauna
```

**`combat/{criticalHit, defenseResolver, combatIntent}` + melee/ranged state machines**
```text
Owner        src/combat/* — entity-agnostic; takes CombatTargetHandle/configs/ids
Producers    player (playerMelee/playerRanged + gameLoop hit resolution),
             NPC (ai/npcCombat.ts — pure glue, never a re-implementation)
Consumers    AnimalAgent.takeDamage, NpcAgent.applyIncomingCombatDamage
Mutation     stateless resolvers; deterministic hashed rolls (identical hash shape in
             criticalRoll and defenseBlockRoll — a deliberate shared pattern)
Persistence  NONE. Combat holds no persisted state whatsoever.
Doc home     state/combat.md — the best-aligned domain doc in the whole series
Asymmetries  fauna OUTGOING damage bypasses this entirely (§7 A2);
             player→NPC damage is not wired at all (§7 A1)
```

### Tier 3 — real but narrower shared mechanisms

- **`world/WaterSource.ts`** — one drink/fill contract over well/lake/river/ocean, consumed by player actions, `Household` animal/NPC watering, `itemCatalog`, persistence. River quality is unconditionally `safe` today; `world-017` (draft, not started) would make it contextual.
- **`terrain/slopeConstraint.ts`** — one pure finite-difference slope probe called identically from `PlayerController.update()`, `NpcAgent.steerTo()`, `AnimalAgent.steerToward()`. Three actors, one movement rule.
- **`terrain/waterSample.ts::sampleLocalWater()`** — the single physical "what water is here" answer (river always wins over lake/ocean), chunk-local so it's tick-safe. Consumed by `fauna/waterTraversal.ts` → `AnimalAgent.isWalkable()`, which is in turn shared by autonomous steering, navigation A*, **and** mounted player-driven movement — so traversability can never diverge between an NPC-free wild animal and one the player is riding.
- **`items/constructionMaterials.ts`** — atomic inventory-then-nearby-dropped-items acquisition (3 m radius, closest-first, all-or-nothing), used by every player build *and* by NPC contract work bouts.
- **`fauna/animalHarvest.ts::harvestAnimalIntoInventory`** — one knife-harvest yield function for the player's `[E]` and the Hunter NPC's `onHuntKill()`.
- **`world/createGrassForagePatches.ts::GrassForageService`** — one virtual forage grid, `consume()` atomic, consumed by wild fauna and livestock through the *same* code path (gated only on `AnimalDef.diet.grass`, no species branch).
- **`settlement/places.ts::Place`** — shared by NPC scheduling, the campfire Social Place, and the lodging resolver's house lookup.
- **`items/timedProcess.ts` lazy day-anchor pattern** — drying racks, beehives, livestock production readiness. Resolved against `nowDays`, never ticked, so it survives unload/reload and time-skip of any length identically. This is the concrete implementation of `CLAUDE.md`'s "time-skip follows the same simulation semantics as normal progression" invariant.
- **`registry initial*/snapshot*` idiom** — verified by `08` to be repository-wide (all five settlement registries *and* every `WorldBundle` collection), not settlement-specific. One documented pattern would replace five near-identical descriptions.
- **`ai/npcMovementWatchdog.ts`** — the one confirmed **reverse-direction import**: `fauna/AnimalAgent.ts` imports it directly (no hook indirection), for chase/flee stuck detection. Deliberate reuse; the single exception to the hooks-only convention.

---

## 5. Important cross-domain runtime flows

Six flows that cannot be understood from any single subsystem.

### 5.1 Environment → settlement (three independent terrain seams, one sampling surface)

```text
seed
→ terrain/naturalResources.ts::resourceAttractionAt   ─┐ site scoring bias
→ findSettlementSite.ts                                │ + rejects plaza within
   footprintOverlapsRiver (SITE_RIVER_CLEARANCE = 8 m) ─┤   a live river channel
→ villagePlanner.ts per-plot placement                 │ pushOutOfRiver
→ VillagePlan (authoritative)                          │
                                                       │
→ settlementTerrain.ts::classifySettlementTerrain  ────┘ names the settlement from
     (continentalness / mountainRidge / moistureRegion)   the SAME sampling axes
→ settlement/roadNetwork.ts → RoadCorridorSegment waypoints
                                                       │
   ┌───────────────────────────────────────────────────┘
   ▼  back into terrain, one texel at a time (chunkHeightmap.computeChunkTexel):
   1. applyRegionalSmoothing()  — settlement-driven broad leveling   ← UNDOCUMENTED
   2. applyTerrainCorridors()   — road/path blend, emits roadFalloff
   3. applyRiverChannel()       — carve (Math.min only), consumes stage-2
                                  roadFalloff → riverFord.ts ford blend
```

The loop is real: the settlement plan *feeds back into* terrain generation (stage 1), and roads (settlement-owned waypoints) determine where a river crossing becomes a ford (terrain-owned carving). **Fords are emergent** — no ford mesh or segment type exists. `terrain/naturalResources.ts::resourceAttractionAt` additionally feeds `economy/initial.ts`'s starting stock, so terrain resource distribution reaches the settlement economy directly, not only its siting.

*Integration quality:* **shared/coherent**. Three distinct seams, all reusing one sampling surface, zero duplicated terrain logic. *Documentation:* the river half is documented well (`water.md` §"Integracja rzek"); stage-1 regional leveling and `roadNetwork.ts`-as-corridor-producer are documented **nowhere**.

### 5.2 Weather → inhabitants (one deterministic function, three lazy consumers, one threaded value)

```text
computeClimate(seed, elapsedDays)            [pure, no save field, no history]
│
├─ live per-frame value: gameLoop.climate.weather
│  → SettlementsManager → Settlement.update() → NpcAgent.update()
│     (ONE value shared by every NPC that frame — never recomputed per NPC)
│  → ai/weatherPressure.ts::weatherShelterPressure(WeatherState)
│  → competes as 'seekShelter' in pickActionKind against need + heal pressures
│  → npcDecision.ts sequencing: seekShelter(90) outranks need/heal(80)
│  → beginSeekShelter() → goTo home → wanderNear (activeNeed stays 'idle')
│  → severe weather (>= 0.65) can ALSO interrupt an in-flight action — but only
│     when activeNeed === 'idle' (a real need in progress is never pre-empted)
│
└─ bounded-lookback history: computeRainExposureDays(seed, elapsedDays, window)
   ├─ resolveGardenHydration()   → player garden plots only (settlement gardens
   │                                deliberately excluded, plain cropLifecycle)
   ├─ sleeping-utility condition decay (items-player-013)
   └─ blood-trace lifetime (rain-accelerated)
```

*Integration quality:* **shared/coherent**, and an example worth documenting as a pattern — a deterministic history function with independent lazy consumers is how this codebase avoids per-frame simulation everywhere. *Documentation:* `terrain-and-world-generation.md` still says weather→NPC/fauna/resource coupling "is not implemented," which is **stale in the opposite direction** — the coupling exists and is threaded from that exact module.

### 5.3 Economy (resource → work → storage → consumption → pressure → work)

```text
tree / ore / crop / fish / animal (terrain- or fauna-owned)
→ NPC profession work (npcProfessionWork.ts, pure planner per Role)
   │
   ├─ wood:  harvestWorldTreeFully → Household.deposit('wood') → capacity-capped;
   │         only the OVERFLOW routes to SettlementEconomy
   ├─ ore:   skips Household ENTIRELY — NpcAgent.carried → SettlementEconomy
   │         (iron/coal/gold are not household-storable kinds — deliberate)
   ├─ hunt:  huntingHooks.queryTarget → CombatIntent → corpse →
   │         harvestAnimalIntoInventory → Household.items (meat/hide)
   ├─ farm/fish: → storageDestinations.ts resolves WHERE → deposit
   └─ trader: own-household surplus → economy, else collect from ANOTHER
              same-settlement household (settlements-npcs-014)
→ Household.items / .stock / SettlementEconomy (authoritative quantities;
   storage crates and barrels are presentation only)
→ consumption: NPC needs · rats (maybeEatFood) · livestock diet ·
   settlement development reservations · player (via NPC helper delivery)
→ shortage/surplus recomputed LIVE against fixed per-kind targets
→ biases the next generateNeedPressures() cycle (PickNeedOptions shortage flags)
→ back to work
```

The **wood/ore asymmetry is deliberate**, confirmed from both the settlement and NPC sides. The shortage-pull direction (`economyWithdraw` → `householdExchange`) closes the loop that was previously push-only.

*Integration quality:* **shared/coherent** with one **intentional domain-specific asymmetry** (ore bypasses households). *Documentation:* the claim seam is `STATE.md` prose only; it is settlement/economy-owned code and belongs in the settlements doc.

### 5.4 NPC decision (state + pressures → arbitration → strategy → shared mechanism → world mutation)

```text
1 PRESSURE — three INDEPENDENT producers, same scoring domain, none aware of the others
    a Needs.ts::generateNeedPressures(needs, {shortage flags})  → NpcPressure[]
    b decisionModifiers.ts::scoreNeedCandidates(a, {personality, role})
        re-ranks only — CANNOT add or remove a candidate
    c weatherPressure.ts::weatherShelterPressure(weather)  → 'seekShelter'
    d healingPressure.ts::healingPressure(physicalInjury, maxHp, hasConsumable) → 'heal'
2 ARBITRATION  pickActionKind<NpcDecisionTarget>([...b, c, d], fallback 'idle')
3 SEQUENCING   npcDecision.ts fixed table (gaps of 10):
                 collapseSleep 100 > seekShelter 90 > need/heal 80 >
                 scheduledSleep 70 > idle 60
4 DISPATCH     beginSeekShelter / beginHeal / ensurePlanForNeed→beginNeed /
               beginGoSleep / beginIdle(resolveIdleActivity)
5 STRATEGY     npcStrategies.ts::selectStrategy — FIRST AVAILABLE WINS, not scored
                 food: playerStorageDelivery → householdFood → economyWithdraw →
                       householdExchange → hunt(hunters) → nearbyFoodSource → garden
6 ACTION       NpcPlannedAction (extends the shared simulation/PlannedAction)
7 EXECUTE      goTo/execute FSM → onComplete
8 MUTATE       ALWAYS through a shared intermediate:
                 Household · SettlementEconomy · localExchange claim ·
                 contributeWork · ResourceDeposits.mine · foodSources.harvest ·
                 GrassForageService · NpcRelationships · a combat target
               NEVER a direct write into another NpcAgent's authoritative state.

Beside (not inside) this pipeline:
  · npcPlan.ts   — persistent goal/strategy/progress; survives interruption
                   (marked 'interrupted', never cleared); beginNeed alone
                   resolves concrete actions
  · tickCriticalInterrupt — a DELIBERATELY different precedence from step 3
                   (npcDecision.ts's own doc: "they are not meant to agree").
                   Vigor collapse always interrupts; otherwise only when
                   activeNeed === 'idle'.
  · reactionChance / npcAssistance — one-shot player-triggered social resolvers,
                   structurally parallel to but never touching this pipeline
```

*Integration quality:* **shared/coherent**. The `NpcDecisionTarget` union is the domain's designed extensibility point: a fourth pressure producer requires no change to the existing three or to the arbitration call site.

### 5.5 Fauna → settlement (habitat → behaviour → consumption → pressure)

```text
terrain (forestFactor/forestBiome, riverShoreDistance, waterSample)
→ createFauna.ts spawn gating: clearsRiverChannel (1.5 m wild / 6 m spawner),
  isNearRoadCorridor (reuses settlement's OWN RoadCorridorSegment geometry)
→ AnimalAgent lifecycle
    │
    ├─ WILD: two-tier behaviour — a fixed FAUNA_BEHAVIOUR_PRIORITY table for
    │   threat/social overrides (player/NPC/fire/frenzy/dog-guard), with hunger and
    │   thirst resolved AD HOC inside the predator-normal/prey-normal catch-alls.
    │   Village avoidance excludes non-wolf predators; wolves may pursue a target
    │   into a settlement (canPredatorPursueIntoVillage) but still never forage there.
    │
    ├─ LIVESTOCK (ownerHouseId set): findWaterTarget tries the owner's trough /
    │   Household.water BEFORE a natural shoreline; findDietTarget prefers the
    │   owner's items before GrassForageService. Same class, same code path —
    │   ownership changes only which candidate is tried first.
    │
    └─ RATS: ratPopulationTarget((householdFood + settlementFood)/PRESSURE
        − dogs × SUPPRESSION), clamped [0,5], reconciled every 0.5 game-days.
        maybeEatFood uses the SAME Household.takeFood / withdrawFood primitives
        every other consumer uses, with a deterministic hashed roll.
→ settlement pressure: food loss → household shortage → NPC food-need pressure
→ dogs: dogGuard.ts resolves own-household wolf defense > neighbour assist,
        and resolveDogPestTarget hunts rats → closes the loop
```

*Integration quality:* **shared/coherent** for livestock and forage; **intentional domain-specific mechanism** for rats (a settlement-local pressure system that happens to be implemented as fauna). *Documentation:* `settlements.md` documents the livestock↔household direction well and never mentions rats consuming its own economy state; there is no fauna-side doc at all.

### 5.6 Combat → health → consequence → persistence

```text
ATTACKER                RESOLUTION                  TARGET            CONSEQUENCE
────────────────────────────────────────────────────────────────────────────────
player melee/ranged  →  criticalHit (+sharpness) →  AnimalAgent    →  corpse decay
                                                                      → harvest/bury
player melee/ranged  →  ✗ NOT WIRED             →  NpcAgent       →  (nothing: the
                        (only animals are hit-test candidates;        [E] on an NPC
                         target.kind === 'npc' opens dialogue)        opens dialogue)
NPC (npcCombat.ts)   →  criticalHit              →  AnimalAgent    →  corpse; onKill
                                                                      → Hunter harvest
NPC                  →  criticalHit + defense    →  NpcAgent       →  physicalInjury
                        (resolveIncomingNpcDamage)                    → healingPressure
fauna                →  ✗ FLAT DAMAGE_TABLE /    →  AnimalAgent    →  corpse
                          HUMAN_DAMAGE — no          player         →  downed/respawn
                          critical, no defense       NpcAgent       →  physicalInjury
starvation/dehydration → tickPlayerStarvationDamage → player       →  same downed path
drowning (swimming +   → flat 5 HP/s               →  AnimalAgent  →  same collapse()
  stamina-exhausted)

Health primitive:  shared/HealthState for all three entity kinds.
Combat's OWN state: none persisted, ever (no CombatIntent/phase/projectile field).
The one handoff:   NpcAgent.takeDamage() writes physicalInjury in exactly one line
                   (never derived from maxHp − currentHp, so a future non-physical
                   damage source cannot conflate with it — but that safety holds
                   ONLY while applyIncomingCombatDamage remains takeDamage's sole
                   caller). Combat never reads physicalInjury back.
Persistence:       NPC → npcStates.physicalInjury + health
                   livestock → AnimalSaveState
                   wild fauna → nothing
                   PLAYER → NOTHING (full heal on every Continue)
```

*Integration quality:* **shared but asymmetric** — three confirmed asymmetries, detailed in §7.

### 5.7 Player participation — where the player is symmetric, and where it is not

| Mechanism | Player path | NPC/fauna path | Verdict |
|---|---|---|---|
| Inventory / items / capabilities | same `Inventory` class, same `ITEM_CATALOG` gates | same | **symmetric** |
| Buildable construction progress | `[E]` bout → `contributeWork` | contract bout → `contributeWork` | **symmetric** |
| Construction materials | `hasMaterial`/`consumeMaterial` | same | **symmetric** |
| Corpse knife-harvest | `startHarvestMeat` → `harvestAnimalIntoInventory` | Hunter `onHuntKill()` → same fn | **symmetric** |
| Water drink/fill | `WaterSource` | NPC well/`Household.water`; livestock trough | **symmetric contract, different resolution** |
| Fishing catch roll | deterministic `(spot, attempt)` | Fisher NPC uses the identical rule | **symmetric** |
| Movement slope | `slopeConstraint` | same | **symmetric** |
| Attacking fauna | `criticalHit` pipeline | NPC: same pipeline | **symmetric** |
| Attacking an NPC | **not wired** | NPC→NPC: full pipeline + defense | **asymmetric (A1)** |
| Food source search | `harvestCrop` calls `ChunkManager`/`findNearestGarden` **directly** | `SettlementFoodSourceHooks` (`world/foodSources.ts`) | **parallel mechanism** — the yield math is duplicated, the target search is not shared |
| Food freshness across save | player `Inventory` persists `foodBatches` | `Household`/`SettlementEconomy`/containers do **not** | **asymmetric (A4)** |
| HP persistence | not persisted | NPC/livestock persisted | **asymmetric (A3)** |
| Riding | `mountActions.ts` + `PlayerSkills.riding` | fauna owns the `AnimalAgent`; only livestock have a deterministic id | **shared/coherent, player-only feature** |

---

## 6. Integration seam matrix

Only seams that matter for ownership, runtime flow, invariants, persistent consequences, or future planning.

| Producer / owner | Consumer(s) | Mechanism | State ownership | Integration quality | Documentation |
|---|---|---|---|---|---|
| `terrain/*` sampling (`ChunkManager.sample*`) | settlements, fauna, locations/map, player, NPC | pure query surface | deterministic, unowned | shared/coherent | principle in `ARCHITECTURE.md`; **surface never enumerated** |
| `terrain/riverNetwork` (`footprintOverlapsRiver`, `riverQuery`) | `findSettlementSite`, `villagePlanner`, `settlementPlanCache` | hard reject + push-out at site and plot scope | terrain-owned | shared/coherent | `water.md` §Integracja rzek (accurate); **no pointer from `settlements.md`** |
| `settlement/roadNetwork` (`RoadCorridorSegment`) | `chunkHeightmap` stage 2 → ford blend; `fauna/createFauna` road-corridor spawn check | corridor waypoints consumed by terrain carving and fauna spawn gating | settlement-owned geometry, terrain-owned deformation | shared/coherent | **producer attribution missing on both sides** |
| `chunkHeightmap` stage 1 `applyRegionalSmoothing` | settlement footprint (implicit) | broad pre-leveling before road/river blends | terrain-owned | shared/coherent | **undocumented anywhere** |
| `terrain/naturalResources::resourceAttractionAt` | `findSettlementSite` (siting), `economy/initial.ts` (starting stock) | world query biases both placement and economy seed | terrain-owned | shared/coherent | **no doc owns `naturalResources.ts`** |
| `terrain/waterSample::sampleLocalWater` | `fauna/waterTraversal` → `AnimalAgent.isWalkable` (autonomous + navigation A* + mounted) | one physical water answer; river wins over lake/ocean | terrain-owned | shared/coherent | `water.md` + `STATE.md` fauna prose |
| `world/weather.ts` | `ai/weatherPressure`, garden hydration, sleeping-utility decay, blood-trace lifetime | one deterministic history, threaded live + bounded-lookback | pure function, unowned | shared/coherent | **`terrain-and-world-generation.md` says it is "not implemented" — stale** |
| `settlement/npcState.ts` / `npcRelationships.ts` / `npcPhysicalProfile.ts` | `ai/NpcAgent` (near-exclusive, by direct reference) | authoritative NPC state hosted outside its consumer's directory | settlement dir, NPC domain | **ownership boundary unclear** (not a defect — no `@domain` tag on any of the three, unlike `rats.ts`/`lodging.ts`) | undocumented; `settlements.md` over-claims "NPC life" |
| `Household` / `SettlementEconomy` | NPC strategies, rats, livestock, lodging, player helper delivery | the only channel through which NPC work reaches another NPC | settlement-owned | shared/coherent | `settlements.md` accurate on shape, **stale on persistence** |
| `economy/localExchange` claim seam | `ai/npcLogistics`, `householdExchange`, Trader | atomic, live-revalidated claim | economy-owned | shared/coherent | `STATE.md` prose only |
| `settlement/storageDestinations` | every wood/food delivery leg | pure WHERE resolver | settlement-owned | shared/coherent | `settlements.md` |
| `world/workContract` + per-object `contributeWork` | player `[E]` bouts, `ai/npcWorkContract` + `NpcAgent` | commitment ≠ target progress; actor-neutral work credit | contract and target own disjoint halves | shared/coherent (**textbook**) | **split across two `STATE.md` sections, duplicated** |
| `items/Inventory` | player, NPC, `Household`, `SettlementEconomy`, containers | one generic class, five owner categories | per-owner | shared/coherent | `STATE.md` shared-concepts bullet (correct) |
| `items/constructionMaterials` | every player build; NPC contract bouts | atomic inventory-then-nearby-drops | items-owned | shared/coherent | player side only; **not cross-linked from NPC** |
| `ITEM_CATALOG.capabilities` | every tool gate in every domain | capability flags replace kind checks | items-owned | shared/coherent | `items/CATALOG.md` |
| `world/foodSources` (`SettlementFoodSourceHooks`) | NPC hunger-seeking | generic crop/food-source query (wild = garden = player plot) | **world-owned, NOT fauna-owned** | shared but asymmetric — the player's own `harvestCrop` bypasses it and duplicates the yield math | `player-systems.md` covers the plot half; **`04`'s prose implies fauna ownership — corrected by `05`** |
| `fauna/huntingHooks` (`queryTarget`/`harvest`) | Hunter NPC food-need branch | late-bound hooks object; seeded single-individual population protection | fauna-owned | shared/coherent | `STATE.md` prose only |
| `AnimalAgent` threat accessors (`isThreateningHuman`, `npcAttackTarget`, `isHuntingLive`) + `combatTargetForAnimal` | `ai/npcAnimalThreat`, `settlement/dogGuard` | caller-built candidate arrays from read-only accessors; **never a decision-logic import** | fauna-owned | shared/coherent | **the accessor contract is undocumented** |
| `ai/npcMovementWatchdog` | `fauna/AnimalAgent` (**direct import**) | reused stuck-detection | ai-owned | shared/coherent but **the one exception to the hooks-only convention** | undocumented |
| `settlement/livestock` (`ownerHouseId`) | `fauna/AnimalAgent` water/diet resolution | ownership changes candidate order, not code path | settlement-owned link, fauna-owned agent | shared/coherent | `settlements.md` (settlement side only) |
| `settlement/rats` | `Household.takeFood`, `SettlementEconomy.withdrawFood`, `dogGuard` | live pressure formula, deterministic hashed eat roll | fauna domain, settlement directory | intentional domain-specific mechanism | `@domain fauna` tag only; **no doc** |
| `world/createGrassForagePatches` | wild fauna **and** livestock, same code path | atomic `consume()`, sparse depletion overrides | world-owned | shared/coherent | `STATE.md` fauna prose |
| `combat/*` resolvers | player, NPC | entity-agnostic via `CombatTargetHandle` | stateless | shared/coherent | `state/combat.md` (accurate) |
| player melee/ranged → NPC | — | **not wired** | n/a | **documentation-only relationship** (the doc correctly says so) | `combat.md` "Not implemented" — accurate |
| `fauna/faunaCombat` `DAMAGE_TABLE`/`HUMAN_DAMAGE` | fauna outgoing attacks on prey/player/NPC | flat lookup, no critical, no defense | fauna-owned | **parallel mechanism** (older than the shared pipeline) | not contrasted in `combat.md` |
| `NpcAgent.takeDamage` → `physicalInjury` | `ai/healingPressure` → `beginHeal` | one-line, one-way handoff | NPC-owned | shared/coherent | **unnamed on both sides** |
| `shared/HealthState` | player, NPC, fauna | one HP/death primitive; consequences diverge per entity | per-entity | shared/coherent, **asymmetric persistence** | `combat.md` (primitive); persistence status scattered |
| `quests/QuestManager` ↔ `ai/` | `reactionChance`, `npcAssistance`, dialogue overrides | injected `PlayerSocialLookup` down; player-driven `onInteract` up | quest-owned | shared/coherent (clean dependency direction) | `STATE.md` short paragraph |
| `QuestManager.relations` vs `NpcRelationships` | quests/reaction/assistance vs `socialBehaviour` | **two structurally unrelated stores** (scalar-by-name vs symmetric-by-id-pair) sharing only the word "relation" | two owners | intentional domain-specific mechanism | **the distinction is undocumented** |
| `persistence/saveData` | every domain | schema/validation/migration authority; validated on write and read | no state of its own | shared/coherent | `ARCHITECTURE.md` #save-schema **stale (says v1, no migrations)** |
| `worldgenCacheDb` (`locations-coarse`) | `world/locations/locationsCoarseCache` | `(seed, namespace, version, fingerprint)` → payload; miss = regenerate | disposable | shared/coherent, correctly separated from `SaveData` | **missing from every state doc and from `ARCHITECTURE.md`'s module list** |
| `docs/world/species-physical-reference.md` (SPEA) | none in code | biological reference for future plans | n/a | **future/design relationship, not implemented** | correctly self-labelled "authoritative design reference" |

---

## 7. Asymmetries and known gaps

Each with a classification. Asymmetry is not automatically a defect — the point is to state it explicitly.

**A1 — Player melee/ranged cannot damage an NPC.**
`resolveMeleeHits` and the projectile hit-test iterate animal candidates only; `target.kind === 'npc'` opens the dialogue menu. NPC→NPC damage, by contrast, runs the full critical + defense pipeline.
→ **Intentional current architecture, correctly documented.** `combat.md`'s "Not implemented" line states it precisely; verified accurate at this baseline. Any future player-vs-NPC combat plan must also decide the NPC-corpse question (see A8).

**A2 — Fauna outgoing attacks use a flat damage table.**
`faunaCombat.ts`'s `DAMAGE_TABLE`/`HUMAN_DAMAGE` — per-attacker-kind lookup with a `DEFAULT_DAMAGE = 8` fallback, no critical roll, no defense resolution. Incoming damage *to* an animal always goes through the shared critical pipeline first. So: anything→animal and anything→NPC is resolved; animal→anything is not.
→ **Likely implementation gap presenting as an older parallel mechanism.** Not incorrect behaviour, but a reader of `combat.md`'s "unified damage entry point" claim would reasonably assume symmetry. Note that fauna has no `DefenseConfig` and carries no items, so the *defense* half of the asymmetry is principled; the *critical-roll* half is not obviously so. Needs one clarifying sentence, and a maintainer decision before any rebalancing plan.

**A3 — Player HP is not persisted.**
`PlayerController.health` always constructs fresh at `PLAYER_MAX_HP = 100`; no `SaveData` field, no write, no restore line (re-verified at this baseline). NPC HP and livestock HP both persist. Net effect: every Continue/Load fully heals the player.
→ **Likely implementation gap.** Unlike player stamina — which carries an explicit "short-term, not worth persisting" comment — nothing anywhere states this is deliberate. Fixing it is one field plus one migration; the alternative is a one-line comment declaring the choice. This is a maintainer decision, not a documentation decision.

**A4 — Food freshness batch anchors survive save/load only in the player's own inventory.**
Re-verified: `Inventory.foodBatchesToJSON()` has exactly one call site (`app/saveState.ts`, the player's inventory) and one restore site (`app/createApp.ts`). `HouseholdSnapshot.items`, `SettlementEconomySnapshot.food` and `SavePlacedContainer` all persist `counts` + `instances` with no `foodBatches` equivalent. Structurally identical `Inventory` instances, different persisted fidelity.
→ **Likely implementation gap.** Notable because plan settlements-npcs-014 went to real trouble to carry freshness batches *end-to-end through in-session transfers* (`removeWithFreshness`/`addWithFreshness`, so a transferred item's `acquiredAtDays` is not reset to day 0) — a save/load then discards exactly what that plan preserved. The in-session invariant and the cross-session invariant disagree.

**A5 — Wild fauna individuals are not persisted, and have no reconstruction guarantee.**
Population re-spawns from the fixed `SPAWNS` table; a specific wolf's position/health/hunger/rabies/frenzy/juvenile state simply ceases to exist. `AnimalSaveState`/`snapshot()`/`hydrate()` exist **generically on the `AnimalAgent` class** but are policy-gated to livestock call sites.
→ **Intentional current architecture, documented as a limitation** (`STATE.md` "Not implemented" names it; plan persistence-001 scoped it out). The useful framing for future work is that the *machinery already exists* — persisting a tracked quest animal would need a call site, not new infrastructure.

**A6 — Rats are neither persisted nor seed-derivable.**
No `SaveData.rats` field of any kind; the population is a live formula over current food + dog count, reconciled from zero every time a settlement streams in. This is a **fourth** persistence shape, distinct from "unpersisted but deterministic" — even the count is not reproducible from `(seed, elapsedDays)`.
→ **Intentional current architecture** (`rats.ts`'s own doc comment states it plainly), but **a documentation gap**: no `docs/state/*.md` names this fourth category, and a reader who knows only the three-tier fauna picture would guess wrongly.

**A7 — Deterministic terrain/hydrology vs sparse persisted deltas.**
Terrain, hydrology, rivers, roads, weather, `VillagePlan` and NPC identity are never persisted; only `terrainModifications` (player-source only — system carves like caves are re-derived), `resourceDeposits` and `grassForagePatches` persist, as deltas over the deterministic base.
→ **Intentional current architecture, correctly documented** in `ARCHITECTURE.md`'s persistence paragraph and `STATE.md`. Worth promoting from three separate per-domain descriptions to one named convention.

**A8 — NPC death has no disposal path.**
A dead NPC remains in `settlement.npcs` permanently — excluded from the O(n²) separation loop and from dialogue targeting, but never removed. Fauna corpses, by contrast, run `fresh → rotting → bones → removed`.
→ **Documented limitation** (`LOOSE-ENDS.md`, 2026-08-22). Framed correctly by `08` as *not a persistence omission*: there is no well-defined runtime end-state to persist. Any future feature touching NPC death (loot, funerals, population effects, "kill an NPC" objectives, or A1) hits this first.

**A9 — Worldgen cache vs gameplay persistence.**
`worldgenCacheDb` shares the physical IndexedDB database with `saveDb` but is a structurally separate store with its own versioning concept (`(seed, namespace, version, fingerprint)`; a mismatch is a *miss*, never a migration), never referenced from `SaveData`'s type or validator, and explicitly never a correctness dependency. Exactly one namespace exists (`locations-coarse`).
→ **Intentional current architecture; documentation gap.** This is the mechanism `CLAUDE.md`'s Determinism rule ("bump that namespace's version/fingerprint") governs, and it is named in no state document. Core terrain/hydrology has no persistent cache at all, so the versioning discipline currently applies to one namespace only — which is itself worth saying, so a future agent doesn't hunt for cache invalidation that doesn't exist.

**A10 — NPC authoritative state vs decision/action runtime state.**
Seven fields persist (health, stamina, vigor, needs, `physicalInjury`, `helperAssignment`, `activePlan`); `phase`, `pendingAction`, pathfinding, watchdog, `combatIntent` and the `carried` inventory reset on every reconstruction, by design. `activePlan` persisting while `pendingAction` does not is the deliberate line: a Plan is "what I want and where I am," an Action is single-use.
→ **Intentional current architecture.** The three-layer Goal/Plan → Strategy → Action distinction (three types, three lifetimes) is easy to collapse mentally into "the decision system" and is currently documented nowhere.

**A11 — Livestock persistence vs wild-fauna reconstruction, and the capture step.**
`LivestockRegistry` follows the same `initial*`/`snapshot*` idiom as the settlement registries, with one structural difference: **no live object survives a settlement unload**, so `capture()` must explicitly snapshot the loaded `AnimalAgent[]` before save, where households/NPC-state read a state object that already outlives the agent. `removedLivestockIds` tombstones stop deterministic spawning from resurrecting a disposed corpse.
→ **Intentional current architecture; documentation gap.** The capture step is the kind of detail a future "persist wild fauna" or "persist a quest animal" plan needs and would otherwise rediscover the hard way.

**A12 — Land ownership uses a different persistence idiom.**
`SaveData.ownedLandPlots` is a flat top-level array written from `LandOwnershipRegistry.toJSON()`, not routed through `initial*`/`snapshot*`.
→ **Intentional, low-consequence.** `08` verified no correctness or drift risk. A style question for a future refactor, not an audit action item.

**A13 — Player food-source search is a parallel mechanism.**
`world/foodSources.ts` (`nearestFoodSource`/`SettlementFoodSourceHooks`) is the generic resolver NPC hunger-seeking uses, treating wild crops, settlement gardens and player plots identically. The player's own `harvestCrop` calls `ChunkManager.harvestCrop`/`findNearestGarden` directly and duplicates only the yield-scaling math.
→ **Unclear, requires future investigation.** The duplication is small and the two paths have genuinely different requirements (the player aims; an NPC searches), so this may be correct. Worth a maintainer's explicit call rather than silent divergence.

**A14 — `Math.random()` in fauna movement search vs seeded rolls elsewhere.**
`findWaterTarget`/`findForageTarget`/`wander` use raw `Math.random()`, while `huntingHooks`'s population-protection roll and `rats.ts`'s eat roll use deterministic hashes, as does all of `combat/`.
→ **Unclear, requires future investigation.** Internally consistent today — wild-fauna individual state is never persisted (A5), so there is nothing for the randomness to desynchronize against — but the boundary ("only population-affecting or persisted-adjacent decisions need determinism") is nowhere written down, and A5 changing would change this too.

---

## 8. Persistence across domain boundaries

`08-persistence.md` is the cross-cutting source of truth for classification; this section states only what is *cross-domain* about it.

### The four-way (really five-way) classification

| Class | Meaning | Examples |
|---|---|---|
| **Persisted authoritative** | the save is the only copy | settlement economies, households, NPC state, NPC/player relationships, livestock, player inventory/needs/skills, buildables, work contracts, quests, clock, map knowledge |
| **Persisted delta / override** | a deterministic base plus only the deviation | `terrainModifications` (player-source only), `resourceDeposits`, `grassForagePatches`, `spawnPoints` (FSM + clock only), `removedLivestockIds`, `map.discoveredLocations` |
| **Deterministic reconstruction** | pure `f(seed[, elapsedDays, region])`; never persisted | terrain, hydrology, rivers, roads, weather/season, `VillagePlan`/`SettlementDef`, NPC identity/physical profile, family composition, location geometry, wild-fauna population, hidden-find positions |
| **Runtime authoritative** | real state, deliberately not persisted | NPC phase/pathfinding/`combatIntent`/`carried`, combat in-flight state, player stamina, wild-fauna individuals, **player HP (A3, unintentional)** |
| **Derived / cache** | safely evictable, never a source of truth | `worldgenCacheDb`, `riverTileCache`, `ChunkMeshDataCache`, `settlementPlanCache`, encumbrance, `shortage`/`surplus`, skill `value`, `maxWeight` |

Rats (A6) are the one concept that fits none of these cleanly: runtime authoritative, not persisted, **and** not deterministically reconstructed.

### What makes this an architecture rather than a set of choices

Four cross-domain invariants hold at this baseline and should be stated once, not per domain:

1. **Restore is construction.** `createApp` reads each `SaveData` field exactly once at its owner's constructor. No system anywhere is built empty and then filled from a save.
2. **The save path and the in-session rebuild path are the same code.** `rebuildWorldBundle` calls the same `snapshot*` methods `buildSaveData` does and passes the results into the same constructor parameters `createWorldBundle` accepts. "What survives a save" and "what survives a `WorldBundle` rebuild" therefore cannot diverge — this closes, structurally, the drift hazard the audit brief named.
3. **One field, one owner.** No `SaveData` field is assembled from more than one live owner. The case that structurally invites duplication — work contracts — is explicitly designed against it (commitment on the record, progress on the target, linked by id).
4. **Validation on write, not only read.** `isSaveData()` guards outgoing snapshots, and the persistence-002 integrity guard refuses to overwrite an existing slot whose stored record cannot itself be read. A TypeScript `SaveData` type is not treated as proof of the runtime contract.

### `SaveData` is not a god object

Worth stating explicitly because the field count (~40) invites the opposite reading: `SaveData` has no behaviour, is never mutated during play, and every field's authority is the runtime system that owns it. It is a **serialization contract**. The correct mental model is "each domain owns its state and knows how to serialize it," not "a central blob the world is loaded from."

### Cross-domain persistence gaps, in one place

| Gap | Domains crossed | Class |
|---|---|---|
| Player HP unpersisted (A3) | player ↔ combat ↔ persistence | likely implementation gap |
| Food freshness only in the player's `Inventory` (A4) | items ↔ settlements ↔ world objects ↔ persistence | likely implementation gap |
| Rats not persisted and not seed-derivable (A6) | fauna ↔ settlements ↔ persistence | intentional; documentation gap |
| Wild-fauna individuals unpersisted (A5) | fauna ↔ persistence ↔ quests (a bound quest animal) | intentional; documented limitation |
| NPC death has no end-state to persist (A8) | NPC ↔ combat ↔ persistence | documented limitation |
| `ARCHITECTURE.md` says v1 / no migrations; code is v6 with five (A: doc) | every domain | documentation gap — the largest single mismatch in the series |
| `CLAUDE.md`'s "currently `1`" | steering document, read first | documentation gap |
| `ARCHITECTURE.md`'s "map schema v11" | world/map ↔ persistence | unverifiable; likely stale by removal |

---

## 9. Documentation ownership and coverage

Applying **one canonical owner + short cross-links from consumers**.

### Seams with a correct canonical owner today

| Seam | Canonical owner | Status |
|---|---|---|
| River ↔ settlement placement, fords, fauna river clearance | `state/water.md` §Integracja rzek | accurate; **missing a pointer from `settlements.md`** |
| Combat resolvers, `CombatTargetHandle`, defense symmetry | `state/combat.md` | accurate — the best-aligned doc in the series |
| Weapon numbers | `items/WEAPONS.md` | accurate, correctly deferring to code |
| Item capability flags | `items/CATALOG.md` | accurate |
| Player survival, busy channels, wells, traps, gardens, carry | `state/player-systems.md` | accurate except the skill count (five → six, `riding`) |
| Save-schema field list | `ARCHITECTURE.md` #save-schema (pointer direction from `STATE.md` is **correct**) | **content severely stale** |
| Chunk streaming, vegetation, mountains, slope | `state/terrain-and-world-generation.md` | accurate except the stale "weather coupling not implemented" line |
| Settlement generation, households, economy shape | `state/settlements.md` | accurate on shape; **three stale `SaveData` claims** |

### Seams described from both sides, inconsistently

| Seam | Side A | Side B | Problem |
|---|---|---|---|
| Buildable `contributeWork` + work contracts | `STATE.md` §Settlements/NPCs (NPC-execution angle) | `STATE.md` §Items/player (player-construction angle) | **the same mechanism described twice, in one file, with no cross-link.** `player-systems.md` doesn't mention work contracts at all, so a reader there never learns hired NPC labour can advance their own well |
| NPC state persistence | `STATE.md` §Persistence (accurate, v6, names `npcStates`) | `STATE.md` §Settlements/NPCs ("not yet part of `SaveData`") and §Shared concepts (`Household` "not in save data") | **direct self-contradiction inside `STATE.md`** |
| Livestock persistence | `STATE.md` §Persistence (accurate — names `LivestockRegistry`, tombstones) | `STATE.md` §Fauna ("no `AnimalAgent` runtime state is [persisted], wild or livestock") | **direct self-contradiction inside `STATE.md`** |
| `SettlementEconomy` persistence | `STATE.md` §Persistence (v6 schema) | `STATE.md` §Shared concepts ("Persisted since save v12") | **a pre-hard-cut version number that no longer exists** |
| Hunting hooks vs food-source hooks | `04-npc.md` prose groups them | `05-fauna.md` corrects: `huntingHooks` is fauna-owned, `foodSources` is **world**-owned | audit-internal, must not propagate into `npc.md` |
| Riding save field | `05-fauna.md` wrote `SaveData.player.riding` | `06-player-items.md` corrects: `SaveData.player.mountedAnimalId` (`riding` is the `SkillId`) | audit-internal; `06` is right |

### Seams with no documentation home at all

- `chunkHeightmap` stage-1 `applyRegionalSmoothing` (settlement-driven terrain leveling).
- `settlement/roadNetwork.ts` as the producer of the corridor waypoints terrain carves and fauna spawn-gates against.
- `terrain/naturalResources.ts` — no document owns it, though it feeds both settlement siting and starting economy.
- The persistent worldgen cache (`worldgenCacheDb`, namespace/version/fingerprint) — absent from every state doc *and* from `ARCHITECTURE.md`'s module list.
- Land ownership / purchase (`landOwnership.ts`, `landPurchase.ts`, `SaveData.ownedLandPlots`) — a save-persisted, player-facing mechanic documented nowhere.
- The whole of `src/ai/` (57 files) and `src/fauna/` (24 source files) as domains.
- The `AnimalAgent` read-only threat-accessor contract (`isThreateningHuman`, `npcAttackTarget`, `isHuntingLive`).
- The `NpcRelationships` vs `QuestManager.relations` distinction.
- The combat → NPC-health handoff line (`takeDamage`'s single `physicalInjury` write).
- The `@domain`/`@system` JSDoc convention itself — the actual mechanism resolving "which directory" vs "which domain" for `rats.ts`, `lodging.ts`, and (missing) the NPC-state files.
- `world/locations/*` + `world/map/*` as a domain (~15 files, its own persistent cache namespace).
- Carried-chest weight counting toward player encumbrance.
- The cross-domain conventions themselves: sparse-delta-over-deterministic-base, `initial*`/`snapshot*`, restore-as-construction, live-revalidation-at-claim-time, lazy day-anchor resolution, hooks-not-imports (and its one exception).

### Duplication to remove rather than relocate

`STATE.md`'s §Settlements/NPCs, §Fauna and §Items/player are per-plan narrative that mostly duplicates — at greater length, with more staleness risk, and with plan-ID scaffolding — what `settlements.md`, `player-systems.md` and `CATALOG.md` already say better. The Persistence section is different in kind: it is dense but describes *current mechanism* (what each migration defaults and why), which is load-bearing; it should be condensed against a new persistence doc rather than deleted.

---

## 10. Recommended state-document structure

Stage 4 owns the decision; this is the evidence-backed recommendation.

### Create

**`docs/state/npc.md` — YES, strongly supported.**
57 files in `src/ai/` plus 3–4 NPC-state files in `src/settlement/`; the highest-churn domain in the repository; zero current-state documentation; and an architecture genuinely distinct from settlement generation (three independent pressure producers feeding one arbitration; three composable Goal/Plan → Strategy → Action layers with three different lifetimes; a deliberately-asymmetric interrupt precedence; seven-field authoritative state with an explicit runtime/persisted split).
*Canonical scope:* identity + physical profile · authoritative state ownership and its persistence status · the full decision pipeline including the interrupt asymmetry · profession-work dispatch · work-contract **evaluation** (the commitment record itself belongs elsewhere, see below) · combat/animal-threat glue and the `physicalInjury` handoff · social/conversation and the two-relationship-store distinction · a short "dialogue, quests and relationships" section (quests at 4 files does not earn its own doc) · **one worked example** of the shared `simulation/` contracts, since NPC has the richest one.
*Explicitly not:* settlement generation, `Household`/`SettlementEconomy` internals, fauna hook shapes, combat resolver internals — cross-link.

**`docs/state/fauna.md` — YES, equally supported.**
24 source files (46 with tests); zero documentation; an architecture distinct from both settlements and NPC (a monolithic `AnimalAgent` composing 13 small pure modules, rather than a coordinator over 27 delegates; a two-tier fixed-priority-override / ad-hoc-need-seeking behaviour shape rather than a unified pressure competition).
*Canonical scope:* `AnimalDef` and the "presence of the field is the capability" convention · individual state ownership · the **four-tier** persistence picture (livestock persisted / spawner FSM persisted / wild individuals unpersisted-but-population-deterministic / rats unpersisted-and-not-deterministic) · corpse/decay/rabies lifecycle · livestock and rats as the two settlement-adjacent categories · the two-tier behaviour pipeline with an explicit contrast against NPC's · **what fauna exposes to other domains** (the three threat accessors, `SettlementHuntingHooks`' exact contract including the seeded population-protection roll, `combatTargetForAnimal`) · the `npcMovementWatchdog` reverse-import exception.
*Cross-link, don't duplicate:* `water.md` for water traversal, `combat.md` for the shared damage pipeline, `npc.md` for the consumption logic.

**`docs/state/persistence.md` — YES.**
`01` left this conditional on finding persistence-specific invariants beyond a field list. `08` found four (§8 above), plus the classification table, plus the four-way slot-status model. None of that fits `ARCHITECTURE.md`'s general-architecture scope or `STATE.md`'s snapshot scope.
*Canonical scope:* the five-way classification table (**the canonical reference other docs point at rather than each keeping a driftable partial copy** — exactly the failure mode that produced three stale `settlements.md` claims from one missed update) · restore-as-construction · the shared save/rebuild snapshot mechanism · the migration pipeline's *contract* (one pure step per version, chained, fails closed) · validate-on-write and the integrity guard · the slot-status model · the worldgen-cache separation and why it is not `SaveData` versioning · the known gaps (A3, A4, A6).
*Ownership relationship:* `STATE.md` → short pointer (unchanged, correct direction). `ARCHITECTURE.md` #save-schema → keeps the field list, gains a pointer, loses the stale narrative. `persistence.md` → the third, deeper layer.

### Do not create

- **Work contracts:** genuinely three-way (player issues, NPC fulfils, a buildable owns progress) but not large enough for its own file. Recommend **`player-systems.md`** as the canonical home (the player is employer, pays materials, and shares the `contributeWork` seam directly), with a short `npc.md` section covering only discovery/evaluation/execution and pointing back. `06` and `04` must not pick different homes.
- **Quests/dialogue:** 4 files plus two `ai/dialogue*.ts` modules. Fold into `npc.md`.
- **Shared `simulation/` contracts:** ~250 lines of vocabulary, no runtime behaviour of their own. One worked example in `npc.md`, one cross-link from `fauna.md`.
- **Player-built world objects:** stay in `player-systems.md`; it already covers them accurately.
- **Runtime/UI/audio:** `01` left this optional; nothing in Stage 2 or 3 surfaced a cross-domain seam requiring it. The architecture docs track composition adequately. **Recommend dropping the `09-` artifact** unless the maintainer wants `ARCHITECTURE.md`'s currency double-checked for its own sake.
- **`world/locations/` + `world/map/`:** a real ~15-file undocumented system with its own cache namespace, but it fell between every Stage 2 boundary. **Recommend Stage 4 decide explicitly** — a short `docs/state/world-locations.md`, or a section in `terrain-and-world-generation.md` — rather than letting it fall through again. Do not create it on this pass's authority alone.

### `docs/state/README.md`

Its generated "Covers" column is blank for `settlements.md` and `water.md` — the two most discursive docs. Likely a generator limitation triggered by exactly the prose the trims will remove; per `CLAUDE.md`, fix the generator rather than hand-editing, and re-check after the trims.

---

## 11. `docs/STATE.md` boundary

**`STATE.md` should be:** a short current snapshot · a map of major implemented systems · the most important limitations · a router into deeper state docs · the canonical list of shared concepts a plan must check before inventing a parallel mechanism.

**It should not be:** a changelog · a list of completed plans · an implementation-history log · a catalogue of every class and module.

At 201 lines it is not long — but three of its sections are single paragraphs of several thousand words each, and the leakage is severe enough that the file has become internally inconsistent.

| Current content | Verdict | Action |
|---|---|---|
| Header, "Read this first," Source-of-truth rule (L1–18, 199–201) | **retain** | unchanged — this is exactly the right framing |
| Runtime architecture (L19–23) | **retain** | already correctly defers the `WorldBundle` field list to `ARCHITECTURE.md` |
| §World / terrain (L29–37) | **condense** | the blood-traces paragraph is one plan's implementation note in a snapshot; cut to one sentence, keep the pointers |
| §Settlements / NPCs (L38–52, the largest section) | **move + remove** | the NPC decision-architecture material (needs arbitration, `decisionModifiers`, weather/healing pressure, all four Work-Contract phases, the `NpcAgent` refactor lineage, npc-006 navigation) → `npc.md` as *current-state facts stripped of plan-ID narrative*. The refactor lineage and per-plan sequencing → **removed as history leakage** (it lives in the plans and the 2026-09-03 review). Keep ~4 sentences on settlement generation/streaming/economy/household ownership + the existing pointers |
| §Fauna (L54–65) | **move + remove** | same treatment → `fauna.md`. Also **correct**: "no `AnimalAgent` runtime state is [persisted], wild or livestock" is false and contradicts this file's own Persistence section |
| §Items / player (L68–76) | **replace by pointer** | nearly everything is already better documented in `player-systems.md`/`CATALOG.md`; cut to a short snapshot (Inventory/ItemKind/HeldTool ownership, capability flags, the shared buildable progress model, liquid containers, freshness) + pointers |
| §Quests / progression (L77–79) | **retain** | already appropriately short |
| §Persistence (L81–83) | **condense** | genuinely current mechanism, not leakage — but the five per-migration rationales belong in `persistence.md`. Keep: v6, a real migration pipeline, the write-integrity guard, what is and is not a full simulation snapshot, + pointers |
| §UI / input (L85–87) | **condense** | trim the per-screen enumeration; keep the hybrid-Vue architecture statement |
| §Important shared concepts (L89–112) | **retain, with corrections** | the most valuable section in the file and the one place its prose length is justified. **Fix three stale bullets:** `Household` "not in save data" (false since persistence-001); `SettlementEconomy` "persisted since save v12" (a version scheme that no longer exists); `helperAssignment` "not yet part of `SaveData`" (false). **Add:** the buildable `contributeWork` seam, `worldgenCacheDb`, and a one-line persistence-classification pointer |
| §Developer tooling (L114–121) | **retain** | short, current, genuinely useful for routing |
| §Important code entry points (L123–171) | **condense** | overlaps `CODE_INDEX.md`, which the section itself names as the broader lookup. Trim to the ~10 true composition-root/shared-primitive entries and defer the rest |
| §Current architectural seams / active refactors (L173–177) | **condense** | drifts toward plan status (`plans/README.md`'s job). Keep genuinely open architectural seams; drop per-plan verification status. Note: the NPC bullet's "NPC runtime continuity across an ordinary settlement unload/reload remains incomplete" needs re-checking against persistence-001 before Stage 5 |
| §Verification state (L179–183) | **retain** | correct, short, and states the right rule |
| §Not implemented / intentionally deferred (L185–197) | **retain, extend** | one of the file's most valuable sections. Add the confirmed gaps: player HP not persisted (A3), non-player food freshness lost on save/load (A4), rats not persisted and not seed-derivable (A6), NPC death has no disposal path (A8), player melee/ranged does not damage NPCs (already implied via the `combat.md` pointer — make it explicit) |

**Target shape after Stage 5:** every "Major systems" subsection is 3–6 sentences plus pointers; "Important shared concepts" and "Not implemented" grow slightly (they are the sections that actually prevent future mistakes); nothing anywhere names a plan ID as narrative.

---

## 12. Findings requiring Stage 4 reconciliation

Ordered by consequence.

1. **`ARCHITECTURE.md`'s "Save schema" says v1 with no migration story; code is v6 with five migrations, a write-integrity guard and a four-way slot-status layer.** The single largest doc/code mismatch in the series. `CLAUDE.md`'s own "currently `1`" repeats it in the document a future agent reads *first*. Fix both.
2. **`docs/STATE.md` is internally self-contradictory on persistence** — three separate claims (`Household` not in save data; no `AnimalAgent` state persisted, wild or livestock; helper assignment not yet in `SaveData`) contradicted by the same file's own Persistence section and by code. Plus a "save v12" reference to a version scheme that no longer exists. This is a Stage 5 edit, but Stage 4 should record it as a distinct finding from the general trim, since it is a factual error rather than a scope problem.
3. **`settlements.md`'s three stale `SaveData` claims** (S7, §Gospodarstwa, §Social) — the same root cause. Fix together with #2, and with the two remaining stale per-field comments in `settlement/npcState.ts` (already tracked in `LOOSE-ENDS.md`) so source and doc stop drifting apart. When fixed, name all seven persisted NPC fields, not four.
4. **Work contracts need exactly one canonical home.** Recommendation: `player-systems.md`, with a short `npc.md` section for discovery/evaluation/execution. `04` and `06` must not pick differently.
5. **`terrain-and-world-generation.md` says weather→NPC/fauna/resource coupling "is not implemented."** Stale in the direction that causes the worst planning errors — a future agent would plan work that already exists.
6. **`GRAPHICS.md` G17 describes the chunk-mesh worker offload as "docelowy kierunek (niezaimplementowany)"** — superseded ~39 minutes later by commit `16ca5a3c`. Same failure mode as #5.
7. **`player-systems.md` says five skills; there are six** (`riding`).
8. **Three undocumented terrain↔settlement seams need an owner:** stage-1 `applyRegionalSmoothing` and `roadNetwork.ts`-as-corridor-producer → `terrain-and-world-generation.md`; `classifySettlementTerrain` → a short settlements-side line (naming is settlement-owned, sampling is its input).
9. **Land ownership/purchase is entirely undocumented** despite being save-persisted and player-facing.
10. **The worldgen cache is absent from every state doc and from `ARCHITECTURE.md`'s module list**, despite being the mechanism `CLAUDE.md`'s Determinism rule governs.
11. **Two audit-internal corrections must not propagate:** `05`'s `SaveData.player.riding` → `mountedAnimalId`; `04`'s prose grouping of `SettlementHuntingHooks` (fauna-owned) with `SettlementFoodSourceHooks` (world-owned).
12. **Maintainer decisions, not documentation decisions** — A3 (persist player HP or comment the choice), A4 (extend freshness persistence or document the loss), A2 (is fauna's flat outgoing damage table intentional), A13 (player food-source search duplication), A14 (the seeded-vs-`Math.random()` boundary). Stage 4 should route these to the maintainer rather than resolving them in prose.
13. **`ARCHITECTURE.md`'s "map schema v11"** describes a mechanism with no trace in current code. A quick `git log -p` on `SaveMap`/`mapConfig.ts` distinguishes stale-by-removal from never-accurate, before the #1 rewrite.
14. **`world/locations/` + `world/map/` fell between every Stage 2 boundary.** Stage 4 must place it explicitly.
15. **The `@domain`/`@system` JSDoc convention should be documented, and applied** to `settlement/npcState.ts`/`npcRelationships.ts`/`npcPhysicalProfile.ts` — the clearest untagged cases of "physical directory ≠ logical domain" in the codebase, where `rats.ts` and `lodging.ts` already set the precedent. (Source-comment change; for the implementation stage to execute.)
16. **`docs/world/species-physical-reference.md` must be classified as design reference, not current state**, wherever Stage 4/5 touches fauna or NPC physical state. `npcPhysicalProfile.ts` (HP/stamina/vigor from sex + `LifeStage`) is the implemented part; SPEA is not implemented at all.

---

## 13. Open questions

- **Should the NPC-state files (`npcState.ts`, `npcRelationships.ts`, `npcPhysicalProfile.ts`), `livestock.ts` and `rats.ts` move out of `src/settlement/`?** Three audits left this open independently. Recommend deciding it **once, as one convention**, rather than three one-off calls — and note that `@domain` tags may make the move unnecessary. Architectural question, not a documentation question.
- **Is the fauna outgoing flat-damage table (A2) a deliberate simplification or an unmigrated older system?** Determines whether `combat.md` gains one clarifying sentence or a "known gap" entry.
- **Should `world/foodSources.ts` become the player's crop-harvest path too (A13)**, or is the player's direct `ChunkManager` call correct given it aims rather than searches?
- **Is fauna's `Math.random()` movement search (A14) a stated policy?** It is safe *because* wild individuals are unpersisted (A5); if A5 ever changes, this becomes a determinism violation. The boundary should be written down before then, not after.
- **`settlements.md` is Polish; `combat.md`/`player-systems.md`/`terrain-and-world-generation.md` are English; `water.md` is Polish.** New docs (`npc.md`, `fauna.md`, `persistence.md`) need a language decision before they are written, and converting the existing two is a nontrivial rewrite risk for a cosmetic gain. A maintainer call, not a code-derived one.
- **`AnimalAgent.ts` (4,861 lines) and `NpcAgent.ts` (4,654, back up from ~4,315 after the 2026-09-03 refactor).** Not documentation questions, but both audits flagged the trend. For `AnimalAgent` specifically, "large because of one big `ANIMAL_DEFS` data table" should be distinguished from "large because of insufficient extraction" before anyone concludes it is a problem.
- **Should the `09-runtime-ui-audio.md` artifact be run at all?** Nothing in Stages 2–3 surfaced a cross-domain seam requiring it. Recommend dropping it unless the maintainer wants `ARCHITECTURE.md`'s currency checked independently.
