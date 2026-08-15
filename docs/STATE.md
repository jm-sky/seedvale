# Seedvale — Current State

**Purpose:** factual snapshot of the implemented codebase. This document describes what exists now, not the desired future state.

**Last verified:** 2026-08-15

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

Rebuild/lifetime invariant (keep the bundle reference, don't capture a replaceable field): canonical in [ARCHITECTURE.md](./ARCHITECTURE.md) — "World lifecycle" / "Rebuild / lifetime invariants". Not restated here.

## Major implemented systems

### World / terrain

- Procedural chunked terrain (macro continental bias + ridges, hills/valleys, softened detail FBM) with a worker pool, load/unload radii and pinned home chunks. Worker tile results are queued and `buildAndAttachMesh` runs at most once per frame (plan 112); `CHUNKS_STARTED_PER_FRAME = 2` still only caps generation starts.
- Shore sand band varies in world space; grass thins into mountain foothills; road corridors use soft tint + dirt micro-contrast (grass soft-fades, not a hard bald cut).
- Instanced grass (custom wind shader, near-field filler blades). Tree/bush leaves share cheap vertex wind; GLTF `BLEND` foliage is hardened to opaque `alphaTest` cutouts.
- Continuous `forestDensityAt` drives tree density and fauna habitat (`ChunkManager.sampleForestFactor`); no separate forest manager.
- Per-chunk vegetation and rocks are `InstancedMesh` buckets (`src/render/instancedProps.ts`); stage meshes and procedural landmarks stay individual `Object3D`s. Settlement palisade / bushes / barrels / hay are instanced the same way; harvestable settlement trees stay individual (plan 113).
- Chunk rocks/logs and visible iron/coal/gold deposits use GLB templates with procedural fallbacks. Procedural landmarks: monolith, stone circle, small ruins, village-fringe cemetery (plan 049).
- Ocean, sky, lighting, day/night and fog are implemented. Post-processing: EffectComposer, N8AO (High = Performance quality + half-res, auto-suppressed on heavy frames), SMAA, subtle film grade. Shadow map updates once per frame after the water mirror. Mirror is 128² at 30 Hz and skips NPC/fauna layers.
- Seasons + weather (plan 040, `world/weather.ts`): `Season`/`WeatherState` are **deterministic pure functions** of `(worldSeed, elapsedDays)` — `getSeason`/`getSeasonProgress` (7-day seasons, `DAYS_PER_SEASON`) and `computeWeather` (per-season weighted odds, hashed per fixed-length weather "cycle" — `WEATHER_CYCLE_DAYS`), composed as `computeClimate` → `WorldClimateState`. No runtime history and no save field: any `elapsedDays` (including after a time-skip or reload) re-derives the same result. `ClimateState`/`createClimateState`/`tickClimate` are a small mutable runtime cache around that (mirrors `DayNightState`'s shape) — `tickClimate` only recomputes `weather` when `elapsedDays` crosses into a new cycle, plus a debug-only `forced` override (lil-gui "Pora roku / Pogoda"), never persisted. Visuals: `world/weatherVisuals.ts`'s `applyWeatherOverlay` dims sun/ambient/hemi and adjusts fog color/near/far on top of `applyDayNight` (`gameLoop.ts`) — no cloud geometry or dome material change yet. `world/weatherParticles.ts` drives rain/snow via CPU `THREE.Points` volumes that follow the player — an explicit, documented deviation from the plan's preferred GPU-shader-based weather rendering (plan §2/§11-13), kept as an Etap 1 stopgap. Audio: `audio/weatherSounds.ts`'s rain loop (gain = intensity); no snow ambience asset yet (`docs/assets/SOUNDS.md` S21). Weather → NPC/fauna/resource coupling (plan §21-22) is not implemented.
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
- Quest v3 (plan 093, Etap A–G): relation levels (`stranger`/`acquainted`/`friendly`/`trusted`, centralized thresholds) gate quest availability (`QuestDef.availability`); `QuestDef.effects` overrides the flat v2 relation/exp reward; world-problem quests exist end-to-end — "groźny wilk" (kill a specific ambient wolf, bound to its `AnimalAgent.animalId` via an injected resolver, no fauna import in `QuestManager`), "wilcza jama" (a lightweight `wolfDen` spawner — reuses the `PreySpawner`/cave-mouth prop, one-time pack, no respawn — cleared once its whole pack is dead), "zagubiona owca" (find a specific bound livestock animal via `[E]` interact — `find_animal`/`animal_found`, same bind-on-accept mechanism as the wolf quest, ungated so it's Anna's on-ramp toward `trusted`) and "drewno na naprawę" (existing `gather_item` objective, no new mechanic). Livestock `AnimalAgent.ownerHouseId` (plan 093 Etap G, `settlement/places.ts`'s `homePlaceId`) links each farm animal to its owning household's home `Place.id`; audited in plan 110, still no consumer — kept as a foundation, not a gap. Bandit objectives remain unimplemented.
- Quest v3 closure (plan 110): `QuestState` adds terminal `failed` (a stage's bound world entity can no longer be completed, e.g. a `find_animal` target dying before being found — `QuestManager.failQuest()`) and `invalidated` (set only on save/load restore, see persistence below). `AnimalAgent.collapse()` now calls an injected `onDeath?(animalId)` hook (threaded from `createFauna.ts`/`livestock.ts` through `worldBundle.ts`/`createApp.ts`) so **any** death — not just a player melee kill — reports `animal_died` to `QuestManager`; the pre-existing `gameLoop.ts` melee-diff path is untouched (duplicate dispatch for an already-inactive quest is a no-op). "Groźny wilk" is now visually/gameplay distinct: `QuestDef`'s `kill_target_animal` objective takes an optional `dangerous` flag, applied at bind time (not spawn) via `AnimalAgent.markDangerous()` — HP/damage multiplier, larger scale, tinted GLB material (`settlement/props.ts`'s `tintPropMaterials`), relabeled. No new model/spawner.
- Procedural landmarks (`monolith`/`stoneCircle`/`smallRuins`/`cemetery` in `terrain/chunkEnvironment.ts`) now carry a stable `EnvironmentPlacement.id`, purely derived from `(seed, chunk, kind, ordinal)` via `deriveLandmarkId` — no save persistence needed, regenerates identically on reload. Deliberately **id field only** — no runtime registry/lookup Map, no discovery flags, no landmark-quest wiring (zero consumers exist yet; add a lookup accessor when one does).

### Persistence

- IndexedDB in `src/persistence/`. Canonical save schema is **v13** (`saveData.ts`): world config (including optional `settlements.homeSize`), player pose, time of day, elapsed days, quests/EXP/relations, inventory, held tool, collected IDs, dropped items, placed fires, placed tents, player torch, world flags, sparse tree overrides, map discovery cells, settlement economies, player hunger/thirst/vigor (stamina stays transient). Weather/season (plan 040) deliberately add **no** save field — they're pure functions of `(seed, elapsedDays)`, both already persisted.
- localStorage is split by domain (`src/config/persistConfig.ts`): graphics / player / world; legacy `seedvale:worldConfig:v1` migrates on first load.
- NPC runtime state is **not** a full simulation snapshot. Tree lifecycle uses sparse overrides + lazy growth from `elapsedDays` (`src/world/treeLifecycle.ts`).
- `QuestManager`'s `questId → animalId` binding is never persisted (plan 110) — on restore, an `active` `kill_target_animal`/`find_animal` quest re-derives its binding: livestock kinds (deterministic `animalId` per settlement/house seed, `settlement/livestock.ts`'s `LIVESTOCK_KINDS`) rebind via the normal resolver; wild-fauna kinds (unseeded per-session `animalId` counter, dead/alive state not persisted at all) become `invalidated` instead of silently retargeting a different individual. Fauna/livestock HP/death/corpse state is not persisted — killed animals resurrect on reload; this is why the wild-fauna case can't safely rebind.

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
- **Construction Catalog** — `src/assets/constructionCatalog.ts` (plan 109, reviews [009](./reviews/2026-08-14--009--megakit-construction-audit.md) / [011](./reviews/2026-08-14--011--megakit-construction-browser-verification.md)). Layers construction semantics over `AssetIndex` for the 176 parked MegaKit GLB.
- **House Builder** (`src/settlement/houseBuilder.ts`, plan 111) assembles MegaKit cottages (4×4 / 6×4) and medium farmsteads (6×6 / 8×6) from that catalog (native metres ×1.1, cap roofs + gables, plaster/woodgrid/brick kits, chimney on some variants, instanced static parts, hinge doors). Wired into `buildSettlementProps()`; `houseCatalog.ts` remains for Asset Browser / procedural fallback. Browser and `?perf=1` verification are still open.
- **Performance diagnostics (plan 103)** — `src/perf/` sampler/benchmark; lil-gui Performance + `?perf=1` / `?benchmark=<id>`. Graphics quality presets Low/Medium/High/Custom in Pauza → Świat → Grafika. High AO is Performance quality with a heavy-frame auto-suppress (plan 113). Adaptive Quality is stored-off, not implemented. Draw calls / triangles are accumulated across composer+mirror (`info.autoReset = false`); diagnosis: [review 012](./reviews/2026-08-14--012--perf-bottleneck-diagnosis.md). Rendering-budget follow-up: [plan 113](./plans/2026-08-14--113--rendering-performance-gpu-scaling.md).

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
src/settlement/houseBuilder.ts
src/settlement/props.ts
src/assets/constructionCatalog.ts
src/assets/houseDefinitionExample.ts
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
src/world/weather.ts
src/world/treeLifecycle.ts
src/persistence/saveData.ts
src/ui/
src/ui-vue/
```

## Current architectural seams / active refactors

- **World visual overhaul (024)** — plants done in part; sky/clouds and distant mountains remain.
- **UI** — Vue Fazy 0–4 implemented, browser verification pending. Plan 105's audit (review 007) is done; H1 (all 5) and 2/3 of H2 are now implemented (see plan 105 §11 implementation notes) — H2.1 (touch layout collision, C2) and all of H3/H4 remain open. A new Character screen (HP/hunger/thirst/vigor from `PlayerNeeds`/`HealthState`, plan 105) also exists — `src/ui-vue/screens/CharacterScreen.vue`, opened via pause menu's "Postać". None of this has browser/manual verification yet. Do not assume every future UI belongs in Vue; extend the existing facade + store pattern when migrating.
- **NPC daily routine** — Place + executable schedule + vigor are implemented. Household resource layer (plan 069) is also implemented — see below. Vigor collapse and a critical need (plan 114) now interrupt a schedule-driven action already in flight (`goTo`/`execute`); ordinary schedule/time-of-day changes still do not. Remaining gap is intentional: no social landmark. See [SETTLEMENTS.md](./SETTLEMENTS.md).

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
