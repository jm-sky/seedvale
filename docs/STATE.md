# Seedvale — Current State

**Purpose:** factual snapshot of the implemented codebase. This document describes what exists now, not the desired future state.

**Last verified:** 2026-08-13

## Read this first

For a new implementation session:

1. Read `CLAUDE.md` for agent rules and development workflow.
2. Read this file for the current implementation state.
3. Read `docs/VISION.md` before proposing a new gameplay system.
4. Read `docs/plans/README.md` to understand active/planned work.
5. For the selected plan, read its implementation notes and any linked review before changing code.

`docs/STATE.md` is a snapshot, not the authoritative status tracker for plans. Use `docs/plans/README.md` for plan status.

## Runtime architecture

Seedvale is a browser 3D sandbox built with **Three.js + WebGL2 + Vite + TypeScript**. The game/simulation layer remains vanilla Three.js; the overlay UI is a hybrid of existing vanilla DOM modules and a Vue 3 + Tailwind v4 layer.

The main application orchestration lives in `src/app/createApp.ts`. World systems that are rebuilt together are grouped in `src/app/worldBundle.ts` as `WorldBundle`:

- `ChunkManager`
- `WorldOcean`
- `SettlementsManager`
- `Fauna`
- `ItemSpawners`
- `ResourceDeposits`
- `DroppedItems`
- `PlacedFires`
- `PlacedTents`
- `LargeCaves`

`rebuildWorldBundle()` disposes and recreates these systems while mutating the existing bundle object in place. Callers must therefore keep the bundle reference rather than destructuring a member that may later be replaced. This is the intended lifecycle pattern; plan 054 covers remaining callback/reference-safety cleanup, including code that currently captures `PlacedFires` directly.

## Major implemented systems

### World / terrain

- Procedural terrain with chunked generation.
- Height composition uses macro continental bias + mountain ridges, a medium-scale hills/valleys term, and softened local detail FBM (`detailAmplitude`; plan 062 done).
- Shore sand band width varies locally in world space (`sandBandAt`, ~0.6–3 units); grass thins smoothly into mountain foothills instead of a hard ridge cutoff.
- Instanced grass uses a custom wind shader with view/sun tip scatter (plan 066); near-field short filler blades densify the meadow without a global density bump (issue 023).
- Chunk terrain fragment shader adds procedural macro color/roughness variation (richer meadow + bare-dirt grit); detail normals fade out with distance (20–50 m).
- Road/path corridors use soft tint edges and dirt micro-contrast on the terrain mesh (issue 023); grass soft-fades into corridors instead of a hard bald cut.
- Tree/bush leaf materials share a cheap vertex wind (`world/foliageWind.ts`); GLTF `BLEND` foliage is hardened to opaque `alphaTest` cutouts so canopies write depth (issue 022). Post-processing ends with a subtle film grade + Bayer dither (`render/filmGradeShader.ts`).
- Ocean (`createOcean` / Water.js) uses real transparency (`transparent` + fresnel-modulated alpha, `depthWrite: false`) with a 256² mirror RT; chunk lakes match the no-depthWrite transparent contract. Lakes discard to the ocean plane only on low-continentalness (sea/coast) cells — not because a pond fills ≥35% of a chunk (plan 098 faza 1 / W8). Water domain SoT: [WATER.md](./WATER.md).
- Graphics decisions / visual contracts: [GRAPHICS.md](./GRAPHICS.md).
- Worker pool for terrain generation.
- Chunk streaming with load/unload radii and pinned home chunks.
- Large-scale terrain regions including ocean/coast/mountain behaviour.
- Biome/moisture-region support and environment generation.
- Continuous `forestDensityAt` suitability (`biomeRegions.ts`) drives large-scale tree density and `ChunkManager.sampleForestFactor` for fauna habitat (plan 063); no separate forest grid/manager.
- Per-chunk vegetation and natural environment elements. Living trees, bushes/cacti/reeds, and GLB rocks/clusters/logs are `InstancedMesh` buckets per (species, primitive, chunk) (`src/render/instancedProps.ts`, plan 087); distant chunks thin the draw range via `InstancedMesh.count` (same prefix-LOD as grass). Stage meshes (limbed/felled/stump) and procedural landmarks stay individual `Object3D`s. Settlement trees/bushes are not instanced.
- Chunk environment rocks and fallen logs use GLB templates (`rock_a` / `rock_cluster_a` / `fallen_log_a`) with procedural fallbacks (plan 065); campfire/monolith/ruins stay procedural.
- Visible iron/coal/gold deposits stream GLB resource nodes (`resource_gold_1` / `resource_rock_1` with iron/coal tint) via `ResourceDeposits` (plan 065).
- Procedural landmark pipeline exists and is currently being extended/verified under plan 049.
- Ocean, sky, lighting, day/night cycle and fog are implemented.
- Post-processing includes EffectComposer, N8AO and SMAA.
- Terrain detail normal configuration is exposed through world configuration.

### Settlements / NPCs

- Multiple streamed settlements.
- Settlement generation is plan-first: one `VillagePlan` per settlement (identity → zones/plots/buildings/landmarks/local paths/entrances), projected to `SettlementDef` for runtime; shared `settlementPlanCache` feeds `SettlementsManager` and `RoadNetwork` (plan 047 — verification needed).
- Settlement generation with families, houses, roads/paths and environment-aware siting.
- House visuals use per-model `HOUSE_CATALOG` (issue 018 / plan 074): individual heights + lamp fractions; `towerhouse` excluded from family homes; `[E] Obejrzyj` + `?debug=1` shows model id/URL. Wall lamps use `findWallMount` again. Name plaque by the well; inland-only palisade wings (plan 072).
- Village generator polish (plan 076): worn local roads + radial path wear, size-scaled plaza clearing, campfire kept off the well, house yaw + stronger house pads, First Age shells rare/small villages only, courtyard tree cap, two-post nameboard.
- Village gardens scale (plan 077): ~1 garden unit per 3 houses packed into S/M/L beds; garden clearings keep trees out; `landmarks.gardens[]` with primary `garden` for farmers. Garden centers stay outside the plaza disk (`plazaCoreRadius + gardenPlotRadius`, plan 095) in home and non-home villages.
- Prey thicket/cave spawners reject coastal/beach sites (`isCoastalPlacement`); thickets also prefer light forest cover.
- Road/path corridors get edge wobble, sparse light potholes, and A* route meander (`region.roadNetwork` knobs; plan 068).
- Inter-settlement road signposts use `yawToward` for board orientation; midpoint pairs are spaced apart (plan 039).
- Inter-settlement roads attach via plan entrances (`entranceToward`); local path corridors come from `VillagePlan.paths`.
- NPC needs and behaviour/state-machine logic.
- Well drinks use a shared per-settlement `InteractionQueue` (plan 079): FIFO standing slots south of the well, one serving agent at a time; home drinks skip the queue. Same queue type is reusable for future garden/stall points.
- NPC personality/character depth including role, traits/Big Five-related data, health and stamina.
- NPC daily rhythm uses an effective per-NPC schedule (`effectiveScheduleFor`: role template + trait overlays). Scheduled `eat` / `home` / `wake` / `work` / `sleep` are executed through the existing FSM; `night_owl` shifts the day rather than skipping sleep; `fast_worker` lengthens work blocks; `sociable` would split `home`→`social` if a social Place existed (none is generated yet). Urgent needs still win at `choose()`. Traders skip `woodDuty` (stay at the stall) and have a longer work block (home only 21–23). Plan 060 — verification needed (browser rhythm check).
- NPCs use shared `StaminaState` for work/rest effort; HP is no longer drained by fatigue.
- NPC names and family naming data.
- NPC dialogue v2 exists as a Vue screen with multiple conversation topics. Home trader opens a trade screen; home guard can be asked for a sword.
- NPC reaction sounds are implemented (`playAt` from the NPC mesh — quieter farther away).
- World one-shots that have a source position use `worldAudio.playAt` (linear falloff `ref=1.5` / `max=28`): well, melee, animal observe, axe chop. Inventory / quest thank-you stay on `playOnce`.

### Fauna

- Predator/prey roles.
- Chase/flee behaviour.
- Health and damage/death flow via shared `HealthState`.
- Animal Life hunger/thirst/stamina (`AnimalLifeState`; stamina migrated from former `energy` under plan 045).
- Prey spawners (cave / thicket) with respawn; placement rejects road/path corridors (`ChunkManager.roadCorridorsNear` + `halfWidth` clearance, query sized from the real spawner reach — plan 083). Cave has a rock-ring prop (`createCaveMouth`) around a real terrain depression carved via `ChunkManager.modifyTerrain` (skipped on bare mountain rock), sited/oriented toward a nearby slope when one exists (`measureSlope`, falls back to flat placement) — plan 083, replacing the earlier flat dark disc prop. Thicket has a five-tree cluster (`createThicket`, 2026-08-12) plus label; both spawners keep a minimum distance from other wild-fauna spawn points (plan 080).
- Wild-fauna village avoidance and spawn-ring placement scale with each settlement's real `VillageSize` footprint radius (`villageSizeConfig(size).footprintRadius`, 22–72 world units) instead of a flat guess (plan 080); `AnimalAgent`'s `currentVillages`/`Fauna.update` carry a `VillageInfo` (`{x, z, radius}`) per loaded settlement. Ring spawns and cave/thicket spawners also keep a minimum distance from each other (`MIN_SPAWN_SEPARATION`, `createFauna.ts`) so different spawn points don't cluster.
- Player-awareness/flee behaviour.
- Hungry wild predators can choose chase/attack vs flee via pure `predatorHumanDecision` (plan 056): hunger vs proximity/fire/crowd; torch position joins `litFires`; nearby-human count is precomputed once per frame from loaded NPCs; contact bites call `damageHealth` on `player.health` (`damageVsHuman`). Wolves also get close territorial (~30% inside panic range when not already attacking from hunger) and retaliation after a player hit (75% when HP ≥ 40%, else flee). No death UI yet.
- Animal corpses linger 60s (label bars hidden at death). Death spawns `blood_splat.glb` on the ground (not parented to the tipped mesh). With shovel held, `[E]` on a corpse runs a short bury busy channel (`Zakop zwłoki`) and removes the body. Predator scavenging of carcasses is not implemented yet.
- Exhaustion gates sustained chase/flee sprinting.
- GLB fauna models: wild wolf/fox/deer/stag; village livestock chicken/sheep/cow/horse/donkey (`spawnLivestock`, procedural fallback).

### Items / player

- `ItemKind` and `Inventory` exist in `src/items/`.
- Player has shared `HealthState` on `PlayerController` (100 HP; CSS2D HP bar like NPC/fauna; no death UI/respawn yet — plan 045).
- Held tools (`HeldTool`) attach a dedicated held mesh (GLB for shovel/axe/knife/wooden_torch/pickaxe/long_sword/pitchfork/sickle)
  to Quaternius `WristR` via `heldToolVisual.ts` (not the ground-drop pose). Right hand is
  exclusive: a lit branch or lit wooden torch occupies the slot (no second tool until left hand).
- Portable light (`PlayerTorch`): **Zapal gałąź** (1× branch + firestarter, ~90s, branch+fire GLB
  in hand) or **Zapal pochodnię** (held `wooden_torch` + firestarter, ~240s, brighter). Village
  one-time wooden torch pickup near plaza/campfire. Lit source + `fuelRemaining` persist in
  `SaveData.playerTorch` (schema v9). Handheld flame uses `fire.glb` + sparks; PointLight sits at the stick tip.
- Item overview for agents: [docs/items/CATALOG.md](./items/CATALOG.md) +
  `src/items/itemCatalog.ts`.
- House night lamps use `lantern.glb` body + `PointLight` (`createHouseLight`); village torch posts
  (`torch.glb`) at plaza + gate auto-light at dusk like the campfire threshold. Campfire PointLight
  is intensity 6 / distance 16; village torch 3.2 / 14.
- Simple player→animal melee: with knife/axe/shovel/long_sword/pitchfork/sickle **held**, gazing at a live animal and pressing `[E]` deals instant damage (`playerToolDamage`: sword 28 > axe 20 > pitchfork 14 > knife/sickle 12 > shovel 8) via `AnimalAgent.takeDamage`; hit/kill SFX via `playAt` at the animal; without a melee tool the existing observe/flavor dialog remains.
- Inventory is persisted in save data and has weight calculation/max weight support.
- Item spawners and dropped items exist.
- Natural collectible items are integrated into the world.
- Starting equipment currently includes knife, firestarter and blanket when missing.
- Village garden pickups include one-time **pitchfork** / **sickle** (1–3 total near gardens; GLB; holdable melee). Future NPC protest on theft: issue 025.
- Settlement clutter: hay stacks near gardens (~1.4 m, plan 095). Pickaxe is a one-time stockpile pickup (plan 090), not a decorative prop.
- Pickaxe (held): gazing at a streamed iron/coal/gold deposit shows **Wydobądź**; `[E]` runs a ~1.6 s busy channel then `ResourceDeposits.mine()` (3–7 hits from richness; session-only depletion). Yield is `iron` / `coal` / `gold`. On bare mountain rock (`mountainRidge` above the shovel-reject threshold) the same held-gaze fallback as the shovel offers **Wykop skałę** / **Wyrównaj**; yield is stone (higher chance than soil). Shovel cannot dig or level rock. Mine SFX currently reuses dig clips.
- Long sword is holdable melee (28 dmg). Acquire: Marek's well-quest reward, dialogue „Poproś o miecz” after that quest/relation, or buy from the home Kupiec (plan 090).
- Home settlement has exactly one trader (Kasia). Talking to her opens a Vue trade screen: shells or barter (`tradeCatalog.ts` / `trade.ts`). Trade keeps the same NPC engagement freeze as dialogue (`npcEngagement.ts` / `dialogueTimeControl.ts`) so she stands still until the screen closes. Wagon + decorative horse stand at the home market stall, on a heading that stays off the log stockpile / well / houses (`pickMerchantWagonPose`). Daytime she works the stall (eat at midday, short evening at home, sleep); she does not chop wood. Kasia's `night_owl` overlay still shifts the template +2 h.
- Tent is a utility item (Kupiec only, not a world spawn). Quick Action „Rozstaw namiot” checks flat/dry/clear ground; a placed tent offers `[E] Odpocznij` (camp rest sequence without blanket; player snaps inside along the tent axis via `tentRestPose`) and `[R] Złóż namiot`. Esc during rest (tent/camp/town, `fadeStrength` 1) aborts the skip without opening pause. World tent is ~2.42×1.76×1.38 m. Positions persist in save schema v10.
- Large walk-in caves (`world/largeCaves.ts`): several world-scale sites (10–15 m trench, ~3 m mouth) carved via `modifyTerrain` with rock framing; empty of loot/mobs; avoid settlements/roads/coast.
- Simple fire/fire pit/torch interactions exist.
- Wait/rest time skip exists.
- Quick Actions: „Odpocznij w mieście” only while near a loaded settlement (`nearTown`, `REST_IN_TOWN_RADIUS`); „Rozbij obóz” runs a crouch → blanket prop → lie → 8h skip → crouch → pack-up → stand sequence (`restCampSequence.ts`); „Rozstaw namiot” when a tent is owned; „Czekaj” uses the same time-skip filter at half opacity (`fadeStrength: 0.5` vs rest `1`).
- Pause menu Esc/close resets submenu to `main` so the next open is not stuck on Akcje/Ustawienia. Esc during rest ends rest first (does not open pause); wait (`fadeStrength` 0.5) still opens pause.
- Inventory UI is a Vue screen (`src/ui-vue/screens/InventoryScreen.vue`); `src/ui/createInventoryScreen.ts` is a facade — see "UI migration" below.
- Inventory pick-up / drop SFX exist (`audio/inventorySounds.ts` via `worldAudio.playOnce`): ground collect, tree branch, dig stone, UI/quick drop.
- Shovel is a one-time settlement landmark pickup (`items/createItemSpawners.ts`, campfire/garden anchors — not in generic `SPAWN_SPECS`). Dig/level require a shovel in inventory; HUD prompts appear only while the shovel is **held** (`items/HeldTool.ts`, persisted as `SaveData.heldTool` in schema v7): **`E` digs**, **`R` levels** (both can show together over a depression). Mountain rock (`mountainRidge` above threshold) is pickaxe-only — the shovel neither digs nor levels it. Owning a shovel (held or not) also exposes dig/level in Quick Actions. Dig/level run as a ~2 s busy channel (`app/busyAction.ts` + Vue `BusyOverlay`) then apply via `terrain/digAction.ts`. Dig start plays a random ~2 s shovel SFX (`audio/actionSounds.ts`). Dig size/tuning and stone notice chance live in `terrain/dig.ts`. Found stones go to inventory on a successful notice roll, otherwise (or when inventory is full) drop beside the hole via `droppedItems` — never silently lost. `ChunkManager.modifyTerrain` / `levelTerrain` own the runtime height overlay (dig down / raise toward procedural base); not save-persisted, reapplied on chunk reload.
- Axe is a one-time settlement pickup (`createItemSpawners.ts`, near a settlement tree or garden — plan 057). Equip via Inventory/`HeldTool`. While the axe is **held**, gazing at a choppable tree (settlement or streamed; stages `mature` / `old` / `limbed` / `felled`) shows stage prompts (**Oczyść gałęzie** / **Ścinaj drzewo** / **Porąb pień**); `[E]` runs a ~1.5 s busy channel then `advanceWorldTreeHarvest()` (one step). Yield is `branch` (2 / 2 / 3). Inventory capacity is checked for the current step before the irreversible transition. NPC woodcutting uses `harvestWorldTreeFully()` to finish remaining steps in one action. Without axe (or on non-choppable stages) the existing tree inspection / chance branch remains. Chop SFX: `action-wood-chop-01.ogg` via `playAt` at the tree. Nearby trees come from `TreeLifecycle.getNearbyPresence` via `ChunkManager.getNearbyTrees`.

### Quests / progression

- `QuestManager` exists with quest definitions/objectives/stages.
- Relay quest v1 and multi-stage/world-interaction quest functionality exist.
- Quest progress, EXP and NPC relations are persisted in the current save format.
- Quest generator/LLM generation is not implemented.

### Persistence

- IndexedDB persistence exists in `src/persistence/`.
- Current save data includes world configuration (including optional `settlements.homeSize`), player position/orientation, time of day, elapsed game days, quests/EXP/relations, inventory, held tool, collected item IDs, dropped items, placed fires, placed tents, world flags (e.g. guard sword gift) and sparse tree lifecycle overrides.
- localStorage config is split by domain (`src/config/persistConfig.ts`): `seedvale:graphics:v1` (post-processing), `seedvale:player:v1`, `seedvale:world:v1` (seed/terrain/sky/settlements); legacy `seedvale:worldConfig:v1` migrates on first load (issue 019).
- Save schema is currently version `10` in `createApp.ts`.
- New Game resets world-dependent state as implemented by `createApp.ts`/`rebuildWorldBundle()`.
- NPC runtime state is not generally persisted as a full simulation snapshot; do not assume Continue restores every NPC need/AI state.
- Tree lifecycle (`src/world/treeLifecycle.ts`) uses sparse overrides + lazy growth from `DayNightState.elapsedDays`. Living stages: `sapling` → `young` → `mature` → `old` (plan 073; `small` sizeClass never reaches `old`). Height is meter-ranged by age × `sizeClass` (`HEIGHT_RANGE_M`), not a flat stage multiplier. Chop mid-stages: `limbed` → `felled` → `harvested` (from `mature` or `old`; regrowth only from `harvested`). Chunk/settlement trees share `TreeId`. Shared harvest APIs: `advanceWorldTreeHarvest` (one step) / `harvestWorldTreeFully` (NPC) in `src/world/treeHarvest.ts`; visuals via `applyTreeStageVisual`.

### UI / input

- Keyboard and mouse input exist.
- Mobile touch controls exist.
- Existing vanilla UI modules remain in `src/ui/`.
- Vue 3 + Tailwind v4 + `lucide-vue-next` is mounted under `#vue-ui` through `src/ui-vue/`.
- Vue migration is incremental; it is not a full replacement of the vanilla UI yet.
- NPC dialogue v2 is already a Vue screen.
- Pause menu, quest log, inventory, quick actions, time-skip overlay, busy/channel overlay, world config screen, notes/journal, HUD, minimap, toast and touch action chrome exist as Vue screens/overlays; `src/ui/create*.ts` for these are thin compatibility facades over the Vue store.
- Minimap is heading-up (canvas up = `mouseLook` yaw) with a rim `N` marker for world north (−Z); draw logic in `src/ui-vue/lib/drawMinimap.ts` (plan 067).
- Touch joystick + look-drag remain vanilla DOM in `src/input/createTouchControls.ts` (input hot-path); Lucide icons on pause/actions/minimap toggle (plan 046 Faza 4 / issue 005).
- lil-gui remains the full debug/world configuration UI (region/fbm/road-network tuning, post-processing, home village size); the in-game world config screen (pause menu → Świat) exposes the player-facing subset (seed, flat shading, home village size, day/night) — same underlying `WorldConfig`/`DayNightState` objects, not a duplicate.
- `WorldConfig.settlements.homeSize` (`auto` | SM/MD/LG/XL) overrides the home cell size roll in settlement generation (issue 020); non-home settlements still use `rollVillageSize`.
- NPC/fauna CSS2D status bars (HP/stamina/…) show only within `barsVisibleForDistance` (~20 units, same as full label readability); name labels still fade 20→32 (issue 017).

## Important shared concepts

Prefer extending existing shared mechanisms instead of creating parallel systems.

- `WorldBundle` — lifetime/rebuild boundary for core world systems (`ChunkManager`, ocean, settlements, fauna, item spawners, resource deposits, dropped items, placed fires, placed tents, large caves).
- `HealthState` — shared health/damage/death (`src/shared/HealthState.ts`) used by fauna, NPCs and the player.
- `StaminaState` — shared physical-effort capacity (`src/shared/StaminaState.ts`) used by fauna (`AnimalLifeState.stamina`) and NPCs; replaces NPC HP-as-fatigue and animal `energy`.
- Shared simulation contracts — `PlannedAction`, `ActionLifecycle`, `DecisionContext`, `pickHighestScore` in `src/simulation/` (plan 055). NPC + fauna adapters; predator hunger-vs-fear scoring in `src/fauna/predatorHumanDecision.ts`.
- `NpcAgent` — central NPC behaviour/needs/personality integration point.
- `AnimalAgent` — central fauna behaviour integration point (intents via shared lifecycle; chase/flee/wander bodies unchanged).
- `Inventory` / `ItemKind` / `HeldTool` — item ownership + single held-tool slot (axe + shovel included).
- `TreeLifecycle` / `harvestWorldTree*` — authoritative tree growth + multi-stage chop (`limbed` / `felled` / `harvested`); sizeClass + `old` age (plans 058, 057, 073).
- `QuestManager` — quest progress, EXP and relations.
- `ChunkManager` — terrain sampling, streaming and environment-facing world queries.
- `Place` / schedule-related NPC work — existing foundation for daily routines.
- **Asset anchors** — `src/assets/assetAnchors.ts`, `anchorResolve.ts`, `assetAnchorData.ts`; convention in [docs/assets/ANCHORS.md](./assets/ANCHORS.md). Runtime consumers: `findRightHandSocket` (via `findAnchorNode`), `resolveHouseLampMount` anchor-first branch, `buildWellInteractionQueueConfig` (`settlement:well` interaction anchor → well drink `InteractionQueue`).

Before adding a new abstraction, check whether one of these already owns the responsibility.

## Developer tooling

- **Asset alignment browser** — standalone page at `/asset-browser.html` (`src/tools/assetBrowser/`), included in production `vite build` (MPA entry alongside `index.html`). Aggregates existing asset registries via `src/assets/assetIndex.ts`; lists `public/models/**/*.glb` via `/asset-browser-models.json` (static manifest at build time, live middleware in dev). Dev server auto-reloads slots when a model file changes (HMR). Shared anchor modules are importable by game code. Browser verification: plan 088 §10 (not marked verified on technical checks alone).

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
src/ai/NpcAgent.ts
src/ai/Needs.ts
src/fauna/AnimalAgent.ts
src/fauna/AnimalLife.ts
src/fauna/predatorHumanDecision.ts
src/simulation/
src/shared/HealthState.ts
src/shared/StaminaState.ts
src/items/Inventory.ts
src/items/HeldTool.ts
src/items/createItemSpawners.ts
src/terrain/dig.ts
src/terrain/digAction.ts
src/app/busyAction.ts
src/quests/QuestManager.ts
src/world/dayNight.ts
src/world/treeLifecycle.ts
src/world/treeHarvest.ts
src/world/treeVisuals.ts
src/persistence/saveData.ts
src/persistence/saveDb.ts
src/ui/
src/ui-vue/
```

## Current architectural seams / active refactors

### WorldBundle / createApp

Plan 053 refactored `createApp.ts` and introduced the mutable `WorldBundle` boundary. Plan 054 (done) audited every long-lived closure created in `createApp.ts` for stale references into a `WorldBundle` field that `rebuildWorldBundle()` replaces — found and fixed one real bug (`getUserActions(...)` capturing `bundle.placedFires` by value instead of reading it live), confirmed `gameLoop.ts`/`interactables.ts` were already correct. Read plan 053 before making structural changes here; plan 054 documents what was checked and why.

### UI migration

Plan 046 introduced the Vue/Tailwind UI stack and migrated screens phase-by-phase. Fazy 0–4 are implemented (HUD, minimap, toast, touch chrome with Lucide; joystick/look stay vanilla). Plan status is `verification needed` until manual desktop/touch checks pass. Do not assume every future UI belongs in Vue by default; extend the existing facade + store pattern when migrating.

### NPC daily routine

Plan 020 (Place, role templates, `activityAt`, workplace, generic `goTo`→`execute`) plus plan 060 (executable `eat`/`home`/`wake`, trait overlays on an effective schedule) are implemented. Remaining gaps are intentional: no social landmark yet, no household economy, ordinary schedule changes do not interrupt an action in flight.

### Procedural landmarks

Plan 049 is in progress. The landmark pipeline is integrated into the chunk environment/settlement props/chunk manager path, but browser verification across seeds, chunk boundaries and streaming is still required.

## Verification state

The repository uses technical verification through TypeScript, lint, build and unit tests. Visual/gameplay changes often additionally require manual browser verification.

Expected technical checks:

```text
npx tsc --noEmit
npm run lint
npm run build
npm run test
```

Do not treat a passing build as proof that a visual Three.js feature is correct. For browser-only verification, provide concrete manual steps for the user.

## Not implemented / intentionally deferred

The following should not be assumed to exist merely because related foundations exist:

- Full NPC simulation persistence across saves.
- Social Place assignment for `sociable` schedule overlays (type exists; no producer yet).
- Shared Threat context type (plan 045 deferred — existing fauna perception covers current consumers).
- LLM/AI-generated quests.
- Full village production/consumption economy.
- Crafting and barter/trade systems.
- Full combat system for the player.
- Full NPC-vs-fauna combat wiring.
- Cube-sphere / fully spherical world architecture.
- Clouds and distant background mountains.
- Full Vue migration of all existing UI.

## Current high-value active work

The exact status of plans belongs in `docs/plans/README.md`, not here. As of this snapshot, notable active/planned areas include:

- Plan 049 — procedural world landmarks.
- Plan 053 — createApp refactor is implemented and serves as recent architectural context.
- Plan 054 — WorldBundle reference safety: done, kept as recent context for the `WorldBundle` mutation pattern.
- Plan 046 — Vue/Tailwind UI migration: Fazy 0–4 implemented; browser verification pending (desktop + touch).
- Plan 005 — game UI screens: done (world config + notes/journal screens close out the last open item).
- Plan 052 — shovel digging/stone finding: done (shovel item, runtime terrain-deformation layer, dig ground interaction).
- Plan 047 — village generation overhaul.

## Source of truth rule

When this document conflicts with the code, **the code wins**. When it conflicts with a plan, the plan describes intended work but does not override implemented behaviour. Update this file when a structural change makes the snapshot materially stale.
