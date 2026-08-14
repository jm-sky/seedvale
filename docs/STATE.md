# Seedvale — Current State

**Purpose:** factual snapshot of the implemented codebase. This document describes what exists now, not the desired future state.

**Last verified:** 2026-08-14

## Read this first

For a new implementation session:

1. Read `CLAUDE.md` for agent rules and development workflow.
2. Read this file for the current implementation state.
3. Read `docs/VISION.md` before proposing a new gameplay system.
4. Read `docs/plans/README.md` to understand active/planned work.
5. For the selected plan, read its implementation notes and any linked review before changing code.

`docs/STATE.md` is a snapshot, not the authoritative status tracker for plans. Use `docs/plans/README.md` for plan status. Architectural map: [ARCHITECTURE.md](./ARCHITECTURE.md).

## Runtime architecture

Seedvale is a browser 3D sandbox built with **Three.js + WebGL2 + Vite + TypeScript**. The game/simulation layer remains vanilla Three.js; the overlay UI is a hybrid of vanilla DOM modules and Vue 3 + Tailwind v4.

`src/app/createApp.ts` is the composition root. World systems rebuilt together live in `src/app/worldBundle.ts` as `WorldBundle`:

- `ChunkManager`, `WorldOcean`, `SettlementsManager`, `Fauna`
- `ItemSpawners`, `ResourceDeposits`, `DroppedItems`
- `PlacedFires`, `PlacedTents`, `LargeCaves`

`rebuildWorldBundle()` disposes and recreates these systems while mutating the existing bundle object in place. Keep the bundle reference; do not capture a replaceable field. Lifecycle details: [ARCHITECTURE.md](./ARCHITECTURE.md).

## Major implemented systems

### World / terrain

- Procedural chunked terrain (macro continental bias + ridges, hills/valleys, softened detail FBM) with a worker pool, load/unload radii and pinned home chunks.
- Shore sand band varies in world space; grass thins into mountain foothills; road corridors use soft tint + dirt micro-contrast (grass soft-fades, not a hard bald cut).
- Instanced grass (custom wind shader, near-field filler blades). Tree/bush leaves share cheap vertex wind; GLTF `BLEND` foliage is hardened to opaque `alphaTest` cutouts.
- Continuous `forestDensityAt` drives tree density and fauna habitat (`ChunkManager.sampleForestFactor`); no separate forest manager.
- Per-chunk vegetation and rocks are `InstancedMesh` buckets (`src/render/instancedProps.ts`); stage meshes and procedural landmarks stay individual `Object3D`s. Settlement trees/bushes are not instanced.
- Chunk rocks/logs and visible iron/coal/gold deposits use GLB templates with procedural fallbacks. Procedural landmarks: monolith, stone circle, small ruins, village-fringe cemetery (plan 049).
- Ocean, sky, lighting, day/night and fog are implemented. Post-processing: EffectComposer, N8AO, SMAA, subtle film grade.
- Visual contracts: [GRAPHICS.md](./GRAPHICS.md). Water (ocean + lakes): [WATER.md](./WATER.md).

### Settlements / NPCs

Plan-first villages (`VillagePlan` → `SettlementDef`), streamed settlements, NPC needs/FSM/schedule, settlement bulk economy, dialogue v2 and home-trader screen.

Details and standing decisions: [SETTLEMENTS.md](./SETTLEMENTS.md).

### Fauna

- Predator/prey roles, chase/flee, player-awareness, shared `HealthState`.
- Animal life: hunger/thirst/stamina. Elevated needs retarget to a real source (forage / shoreline / scavenged corpse); wander arrival no longer relieves needs.
- Prey spawners (cave / thicket) with respawn; placement rejects roads, coast/beach, and other spawn points; village avoidance uses each settlement’s real footprint radius. A `wolfDen` spawner (plan 093 Etap E) reuses the same shape/prop for a one-time, non-respawning wolf pack (quest target, not a nuisance spawner).
- `AnimalAgent.animalId` (plan 093 Etap D) is a stable per-instance id, distinct from `def.kind`, set at spawn time (wild fauna + livestock).
- Hungry predators choose chase vs flee via `predatorHumanDecision` (hunger vs proximity/fire/crowd). Corpses linger 60s; shovel can bury; predators may eat an unclaimed corpse once.
- GLB models: wild wolf/fox/deer/stag; village livestock chicken/sheep/cow/horse/donkey (procedural fallback).

### Items / player

- `Inventory` / `ItemKind` / single `HeldTool` slot (right hand exclusive). Flags, melee, spawn and consumables: [CATALOG.md](./items/CATALOG.md).
- Player has shared `HealthState` (100 HP, CSS2D bar; no death UI/respawn yet). Held melee damages animals via `[E]` gaze.
- Player survival pools (`PlayerController.needs`, plan 106): stamina/vigor/hunger/thirst (`src/player/PlayerNeeds.ts`), HUD bars in `HudScreen.vue`. Hunger/thirst reaching 0 costs HP (`applyStarvationDamage`) — no new death/disease system, reuses `damageHealth`. Sprint gated on stamina.
- Food (tomato, raw_meat, roasted_meat, bread) and water (`waterskin_empty`/`waterskin_full`) are ordinary `Inventory` items with a `consumable` catalog flag ("Zjedz"/"Wypij" in the inventory screen). Cooking (`raw_meat → roasted_meat`) is a flat recipe table (`items/campfireCooking.ts`), `[R]` at a lit campfire. `WaterSource` (`src/world/WaterSource.ts`) is the shared well/lake drink/fill abstraction; lake is a synthetic per-frame candidate (no discrete world object), reusing fauna's shoreline probe.
- Portable light: lit branch (~90s) or held wooden torch (~240s); persists in `SaveData.playerTorch`.
- Tools in the world: shovel (dig/level soil), axe (multi-stage tree harvest), pickaxe (ore + mountain rock), knife (melee + corpse meat harvest), tent (place/rest/pack), garden pitchfork/sickle. Starting kit: knife, firestarter, blanket when missing.
- Wait / camp rest / town rest / tent rest exist. Quick Actions gate town rest on `nearTown`. Esc during rest aborts the skip before opening pause. Rest fully restores vigor/stamina (plan 106).
- Dropped items, item spawners, placed fires and large walk-in caves (`world/largeCaves.ts`, empty of loot/mobs) exist.

### Quests / progression

- `QuestManager` with definitions, objectives and stages (relay v1 + multi-stage world interactions).
- Quest progress, EXP and NPC relations persist. LLM quest generation is not implemented.
- Quest v3 (plan 093, Etap A–E): relation levels (`stranger`/`acquainted`/`friendly`/`trusted`, centralized thresholds) gate quest availability (`QuestDef.availability`); `QuestDef.effects` overrides the flat v2 relation/exp reward; two world-problem quests exist end-to-end — "groźny wilk" (kill a specific ambient wolf, bound to its `AnimalAgent.animalId` via an injected resolver, no fauna import in `QuestManager`) and "wilcza jama" (a lightweight `wolfDen` spawner — reuses the `PreySpawner`/cave-mouth prop, one-time pack, no respawn — cleared once its whole pack is dead). `WolfDen`/livestock `ownerHouseId`/landmark/bandit objectives remain unimplemented.

### Persistence

- IndexedDB in `src/persistence/`. Canonical save schema is **v13** (`saveData.ts`): world config (including optional `settlements.homeSize`), player pose, time of day, elapsed days, quests/EXP/relations, inventory, held tool, collected IDs, dropped items, placed fires, placed tents, player torch, world flags, sparse tree overrides, map discovery cells, settlement economies, player hunger/thirst/vigor (stamina stays transient).
- localStorage is split by domain (`src/config/persistConfig.ts`): graphics / player / world; legacy `seedvale:worldConfig:v1` migrates on first load.
- NPC runtime state is **not** a full simulation snapshot. Tree lifecycle uses sparse overrides + lazy growth from `elapsedDays` (`src/world/treeLifecycle.ts`).

### UI / input

- Keyboard/mouse plus mobile touch (joystick + look-drag stay vanilla in `createTouchControls.ts`).
- Vue 3 + Tailwind v4 + `lucide-vue-next` mounts under `#vue-ui`. Migration is incremental: pause, quest log, inventory, quick actions, time-skip, busy overlay, world config, notes, HUD, minimap, world map, toast and touch chrome are Vue; `src/ui/create*.ts` for these are facades.
- Minimap is heading-up with a rim `N` marker; `M` opens the north-up world map. Discovery is permanent (radius 48, `SaveData.map`, schema v11) and does not load chunks.
- lil-gui remains the full debug UI; pause → Świat exposes the player-facing subset of the same `WorldConfig`.
- Vue Fazy 0–4 are implemented; desktop + touch browser verification is still open (plan 046). Plan 105 UI/UX audit is done ([review 007](./reviews/2026-08-14--007--ui-ux.md)); implementation phases live in plan 105 §8.

## Important shared concepts

Prefer extending existing shared mechanisms instead of creating parallel systems.

- `WorldBundle` — lifetime/rebuild boundary for the ten world systems listed above.
- `HealthState` — shared health/damage/death (`src/shared/HealthState.ts`) used by fauna, NPCs and the player.
- `StaminaState` — shared physical-effort capacity (`src/shared/StaminaState.ts`) used by fauna and NPCs.
- `VigorState` — NPC daily physiological budget (`src/shared/VigorState.ts`); collapse gates sleep through the existing NPC FSM. Not used by fauna.
- `PlayerNeeds` — player stamina/vigor/hunger/thirst pools (`src/player/PlayerNeeds.ts`, plan 106), reusing `StaminaState`/`VigorState`; hunger/thirst are a new `HungerState`/`ThirstState` pool pair, same `{max, current}` shape.
- `WaterSource` — shared well/lake drink/fill abstraction (`src/world/WaterSource.ts`, plan 106); future river/polluted/treated sources should reuse it.
- Shared simulation contracts — `PlannedAction`, `ActionLifecycle`, `DecisionContext`, `pickHighestScore` in `src/simulation/`. NPC + fauna adapters; predator scoring in `src/fauna/predatorHumanDecision.ts`.
- `SettlementEconomy` — settlement-owned bulk stock (`src/economy/`). Not player `Inventory`. Not in save data yet.
- `Household` — one family's own `food`/`wood` stock (plan 069, `src/settlement/household.ts`), reusing `SettlementEconomy`'s `EconomicStock`. Sits between NPC carrying and `SettlementEconomy`; registry lives on `SettlementsManager` like `EconomyRegistry`. Not in save data yet.
- `NpcAgent` / `AnimalAgent` — central behaviour integration points.
- `Inventory` / `ItemKind` / `HeldTool` — item ownership + single held-tool slot.
- `TreeLifecycle` / `harvestWorldTree*` — tree growth + multi-stage chop (`src/world/treeLifecycle.ts`, `treeHarvest.ts`).
- `QuestManager` — quest progress, EXP and relations.
- `ChunkManager` — terrain sampling, streaming and environment-facing world queries.
- `MapData` / `MapDiscovery` — map projection + Fog of War (`src/world/map/`).
- `Place` / schedule-related NPC work — foundation for daily routines.
- **Asset anchors** — `src/assets/assetAnchors.ts`; convention in [docs/assets/ANCHORS.md](./assets/ANCHORS.md).

Before adding a new abstraction, check whether one of these already owns the responsibility.

## Developer tooling

- **Asset alignment browser** — `/asset-browser.html` (`src/tools/assetBrowser/`), included in production `vite build`. Wired registries via `buildAssetIndex()` plus parked files from `/asset-browser-models.json` (`status` / `pack` / `kind`, MegaKit 176 GLB). Search, `prepare: none` for parked/URL, per-slot native/prepared AABB. Browser verification: plan 107.
- **Performance diagnostics (plan 103)** — `src/perf/` sampler/benchmark; lil-gui Performance + `?perf=1` / `?benchmark=<id>`. Graphics quality presets Low/Medium/High/Custom in Pauza → Świat → Grafika. Adaptive Quality is stored-off, not implemented.

## Important code entry points

```text
src/app/createApp.ts
src/app/gameLoop.ts
src/app/worldBundle.ts
src/config/worldConfig.ts
src/terrain/chunkManager.ts
src/terrain/chunkEnvironment.ts
src/settlement/SettlementsManager.ts
src/settlement/createSettlement.ts
src/economy/
src/ai/NpcAgent.ts
src/ai/Needs.ts
src/fauna/AnimalAgent.ts
src/fauna/AnimalLife.ts
src/fauna/predatorHumanDecision.ts
src/simulation/
src/shared/HealthState.ts
src/shared/StaminaState.ts
src/shared/VigorState.ts
src/items/Inventory.ts
src/items/HeldTool.ts
src/items/itemCatalog.ts
src/items/campfireCooking.ts
src/player/PlayerNeeds.ts
src/world/WaterSource.ts
src/quests/QuestManager.ts
src/world/dayNight.ts
src/world/treeLifecycle.ts
src/persistence/saveData.ts
src/ui/
src/ui-vue/
```

## Current architectural seams / active refactors

- **World visual overhaul (024)** — plants done in part; sky/clouds and distant mountains remain.
- **UI** — Vue Fazy 0–4 implemented, browser verification pending. Plan 105's audit (review 007) is done; H1 (all 5) and 2/3 of H2 are now implemented (see plan 105 §11 implementation notes) — H2.1 (touch layout collision, C2) and all of H3/H4 remain open. A new Character screen (HP/hunger/thirst/vigor from `PlayerNeeds`/`HealthState`, plan 105) also exists — `src/ui-vue/screens/CharacterScreen.vue`, opened via pause menu's "Postać". None of this has browser/manual verification yet. Do not assume every future UI belongs in Vue; extend the existing facade + store pattern when migrating.
- **NPC daily routine** — Place + executable schedule + vigor are implemented. Household resource layer (plan 069) is also implemented — see below. Remaining gaps are intentional: no social landmark, ordinary schedule changes do not interrupt an action in flight. See [SETTLEMENTS.md](./SETTLEMENTS.md).

## Verification state

Technical checks: `npx tsc --noEmit` · `npm run lint` · `npm run build` · `npm run test`.

Do not treat a passing build as proof that a visual Three.js feature is correct. For browser-only verification, provide concrete manual steps for the user.

## Not implemented / intentionally deferred

- Full NPC simulation persistence across saves.
- Social Place assignment for `sociable` schedule overlays.
- Shared Threat context type (existing fauna perception covers current consumers).
- LLM/AI-generated quests.
- Inter-settlement trade and player crafting.
- Full combat system for the player; full NPC-vs-fauna combat wiring.
- Cube-sphere / fully spherical world architecture.
- Clouds and distant background mountains.
- Full Vue migration of all existing UI.

Plan status belongs in [plans/README.md](./plans/README.md), not here.

## Source of truth rule

When this document conflicts with the code, **the code wins**. When it conflicts with a plan, the plan describes intended work but does not override implemented behaviour. Update this file when a structural change makes the snapshot materially stale.
