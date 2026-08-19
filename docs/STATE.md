# Seedvale — Current State

**Purpose:** factual snapshot of the implemented codebase. This document describes what exists now, not the desired future state.

**Last verified:** 2026-08-19

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
- `PlacedFires`, `PlacedTents`, `PlacedTraps`, `LargeCaves`

Rebuild/lifetime invariant (keep the bundle reference, don't capture a replaceable field): canonical in [ARCHITECTURE.md](./ARCHITECTURE.md) — "World lifecycle" / "Rebuild / lifetime invariants". Not restated here.

## Major implemented systems

### World / terrain

- Procedural chunked terrain (macro continental bias + ridges, hills/valleys, softened detail FBM) with a worker pool, load/unload radii and pinned home chunks. Worker tile results are queued; `update()` spends one finalize slot per frame on either terrain mesh or vegetation/env content, mesh first (plans 112/119). GLB prop templates preload when `ChunkManager` is created so parse is off the streaming path. `CHUNKS_STARTED_PER_FRAME = 2` still only caps generation starts.
- Shore sand band varies in world space; grass thins into mountain foothills; road corridors use soft tint + dirt micro-contrast (grass soft-fades, not a hard bald cut).
- Instanced grass (custom wind shader, near-field filler blades). Tree/bush leaves share cheap vertex wind; GLTF `BLEND` foliage is hardened to opaque `alphaTest` cutouts.
- Continuous `forestDensityAt` drives tree density and fauna habitat (`ChunkManager.sampleForestFactor`); no separate forest manager.
- Tree species at spawn time (plan 140): `chunkVegetation.ts` picks a `TREE_SPECS` index by weighted lottery over `envGrowthFactor`/`TREE_SPECIES_PREFS` (the same function that drives lifecycle growth rate, not a separate placement heuristic) — biome + altitude/ridge + a `coastal` axis (`coastalFactor`, peaks just inland of `RegionParams.coastThreshold`) bias species toward habitat, `clumpNoise` still dominates the roll so a stand repeats one species. 3 pine variants (`pine_1/3/5`, converted from Ultimate Stylized Nature FBX) read as highland/coastal-hinterland conifers. Forest-floor `VegetationKind: 'fern'` (`FERN_SPECS`, own instanced bucket in `vegetationRegionBatcher.ts`) seeds sparse undergrowth clusters in dense forest / swamp, with a nearby-pine bonus (`PINE_SPECIES_INDICES`) — never a hard requirement. Reed also spawns on any wet lake shoreline now, not only `biome.swamp`. Mushroom pickups (`chunkItems.ts`) use `mushroom_a.glb` instead of the procedural stand-in, with a small pine-proximity weight bonus. Harvested trees' final `stump` stage prefers `tree_stump.glb` over the procedural fallback (`treeVisuals.ts`'s `createTreeStageMesh`, preloaded once via `preloadTreeStumpTemplate`), which stays mandatory if the GLB is missing/fails.
- Vegetation and rocks are `InstancedMesh` buckets (`src/render/instancedProps.ts`, chunk-agnostic), batched at **region** granularity (`src/terrain/vegetationRegionBatcher.ts`, plan 143 — `REGION_CHUNKS = 3`, ≈192 m): `chunkManager.ts` feeds each chunk's placements in on load/unload, the batcher rebuilds only the affected region+kind from the union of its currently-loaded member chunks (streaming/unload/tree-lifecycle stay chunk-scoped as before — region is rendering-only). Distance LOD is per-region (max fraction across contributing chunks, "nearest member wins"). Stage meshes and procedural landmarks stay individual `Object3D`s. Settlement palisade / bushes / barrels / hay are instanced directly via `instancedProps.ts` (no chunk boundaries there, so no region batching needed — plan 143 explicitly leaves it alone); harvestable settlement trees stay individual (plan 113).
- Chunk rocks/logs and visible iron/coal/gold deposits use GLB templates with procedural fallbacks. Campfire remains (`kind: 'campfire'`) use `campfire_unlit.glb` (stone/wood layers) with a procedural fallback; other landmarks (monolith, stone circle, small ruins, cemetery) stay procedural/GLB as in plan 049.
- Ocean, sky, lighting, day/night and fog are implemented. Post-processing: EffectComposer, N8AO (High = Performance quality + half-res; on/off follows the quality preset/GUI, not a per-frame auto-suppress), SMAA, subtle film grade. Shadow map updates once per frame after the water mirror. Mirror is 128² at 30 Hz and skips NPC/fauna/grass/item layers, plus (plan 144 S) terrain/vegetation/environment content in the outermost streaming ring (`REFLECTION_DISTANT_LAYER`, still shadow-casting). Real-GPU [review 020](./reviews/2026-08-18--020--water-grass-gpu-benchmark.md): 144 S mirror draws −4% on `current` with WATER/FPS flat; 148 S grass triangles −47% with RENDER/FPS flat.
- Seasons + weather (plan 040, `world/weather.ts`): `Season`/`WeatherState` are **deterministic pure functions** of `(worldSeed, elapsedDays)` — `getSeason`/`getSeasonProgress` (7-day seasons, `DAYS_PER_SEASON`) and `computeWeather` (per-season weighted odds, hashed per fixed-length weather "cycle" — `WEATHER_CYCLE_DAYS`), composed as `computeClimate` → `WorldClimateState`. No runtime history and no save field: any `elapsedDays` (including after a time-skip or reload) re-derives the same result. `ClimateState`/`createClimateState`/`tickClimate` are a small mutable runtime cache around that (mirrors `DayNightState`'s shape) — `tickClimate` only recomputes `weather` when `elapsedDays` crosses into a new cycle, plus a debug-only `forced` override (lil-gui "Pora roku / Pogoda"), never persisted. Visuals: `world/weatherVisuals.ts`'s `applyWeatherOverlay` dims sun/ambient/hemi and adjusts fog color/near/far on top of `applyDayNight` (`gameLoop.ts`) — no cloud geometry or dome material change yet. `world/weatherParticles.ts` drives rain/snow via a GPU-driven `THREE.Points` renderer (2026-08-15) — a shared vertex/fragment `ShaderMaterial` computes each particle's fall/drift procedurally from a fixed-at-creation per-particle attribute (`aRandom`: phase, speed/size variation, draw-order slot) plus `uTime`; JS only updates a few uniforms and moves the container to the player position, no per-particle CPU loop. Density is weather-intensity-driven and additionally capped by `WorldConfig.quality.lodScale` (plan 103) for weaker devices. This closes the earlier CPU-particle deviation from plan 040 §2/§11-13 (Etap 3) — no browser/perf verification yet (implementation notes). Audio: `audio/weatherSounds.ts`'s rain loop (gain = intensity); no snow ambience asset yet (`docs/assets/SOUNDS.md` S21). Weather → NPC/fauna/resource coupling (plan §21-22) is not implemented. Surface effects (plan 133, `world/weather.ts`'s `computeSurfaceWeather`): wetness/snow cover are pure, bounded (~12-cycle-lookback) derived values from `(seed, elapsedDays)` — no per-chunk state, no save field — pushed as two uniforms (`uWetness`/`uSnowAmount`) onto the existing shared terrain `MeshStandardMaterial` (`terrain/buildChunkGeometry.ts`, `ChunkManager.setWeatherSurface`), read in-shader against `vBareGround`/a new zero-cost `vSlopeUp` (`objectNormal.y`, terrain never rotates) and low-frequency `terrainValueNoise()` for puddle/snow breakup. Rain raises wetness, snow accumulates and melts (temperature-gated) back into wetness; desert/beach aren't separately distinguished from roads/dirt since `vBareGround` doesn't encode that split (implementation notes). No browser/perf verification yet.
- Visual contracts: [GRAPHICS.md](./GRAPHICS.md). Water (ocean + lakes): [WATER.md](./WATER.md).

### Settlements / NPCs

Plan-first villages (`VillagePlan` → `SettlementDef`), streamed settlements, NPC needs/FSM/schedule, settlement bulk economy, dialogue v2 and home-trader screen.

Details and standing decisions: [SETTLEMENTS.md](./SETTLEMENTS.md).

### Fauna

- Predator/prey roles, chase/flee, player-awareness (probabilistic detection, `fauna/playerAwareness.ts`, plan 120, now Sneak-aware per plan 124 — see Items/player), shared `HealthState`.
- Animal life: hunger/thirst/stamina. Elevated needs retarget to a real source (forage / shoreline / scavenged corpse); wander arrival no longer relieves needs. Livestock thirst prefers the owning household's `AnimalTrough` reserve (`AnimalAgent.household`, plan 122 — `ownerHouseId`'s first real consumer) before falling back to the shoreline search; wild fauna has no `household` and is unaffected.
- Habitat spawners (cave / thicket / wolfDen) with respawn; placement rejects roads, coast/beach, and other spawn points; village avoidance uses each settlement’s real footprint radius. Cave is a predator den (`wolf`, `maxPreyCount` 2, restock every 2 game-days); thicket is deer cover (`deer`, 3, every 1 day); a `wolfDen` spawner (plan 093 Etap E) reuses the cave-mouth prop for a one-time, non-respawning wolf pack (quest target — `respawnIntervalDays: Infinity`). Empty site `×2`, catch-up from `elapsedDays` so time-skip counts, first frame after load is `dayDelta = 0` (plan 139). Nearby cap counts same-`kind` living animals (prey *or* predator), so a wolf cave is not an uncapped spawn. Spawn-point population lifecycle (plan 125): each managed `PreySpawner` (cave/thicket/**and** `wolfDen`) carries a stable `id` (`settlementId:type`), a `SpawnPointState` (`active`/`depleted`/`disabled`/`recovering`) and `deathsThisCycle` — `AnimalAgent.spawnPointId` (set for every spawner-created animal, including the den pack) routes each death through the existing `onDeath` hook to the owning spawner, no double-counting; `>50%` of `maxPreyCount` deaths moves it to `depleted` (no more respawn; den still never respawns anyway); `[E] Zniszcz` there is a 5 s busy channel (plan 137, 4 branches spent on complete) that moves it to `disabled`, lights a spectacle `PlacedFires` `pit` (`habitatBurn`: not `[E]`-lit, not saved, ring despawns shortly after the ~5 min burn), tints the spawner prop near-black (mesh stays) and applies `ChunkManager.scorchTerrain()` (r≈7 charcoal vertex tint + `roadTint` grass fade); after `RECOVERY_DAYS` (21) with ≥2 live same-kind animals nearby it returns to `active` with counters reset — checked at most once per in-game day, not per frame. Lifecycle state persists (`SaveData` v17 `spawnPoints`, `AnimalSpawner.ts`'s `snapshotSpawnPointState`/`restoreSpawnPointState`) across both a real save/load and an in-session `rebuildWorldBundle()`; a restored `depleted`/`disabled`/`recovering` point does not respawn its population, and a restored `disabled`/`recovering` point reapplies the burned prop tint + terrain scorch.
- `AnimalAgent.animalId` (plan 093 Etap D) is a stable per-instance id, distinct from `def.kind`, set at spawn time (wild fauna + livestock).
- Hungry predators choose chase vs flee via `predatorHumanDecision` (hunger vs proximity/fire/crowd). Corpses linger 60s; shovel can bury; predators may eat an unclaimed corpse once. After a knife harvest (`meatHarvested`) the living mesh is hidden and replaced with harvested remains (plan 137/138: `bones_pile` + 1–2 `large_bone` + `animal_hide` GLB, 2–4 procedural meat scraps; cylinder fallback) that linger 90s and are no longer edible.
- GLB models: wild wolf/fox/deer/stag; village livestock chicken/sheep/cow/horse/donkey (procedural fallback).

### Items / player

- `Inventory` / `ItemKind` / single `HeldTool` slot (right hand exclusive). Flags, melee, spawn and consumables: [CATALOG.md](./items/CATALOG.md).
- Player has shared `HealthState` (100 HP, CSS2D bar over the mesh plus HUD bar in `HudScreen.vue` above stamina; no death UI/respawn yet). Universal melee (plan 123): `ITEM_CATALOG[kind].melee` is the single source of truth (damage/range/arcDot/windUp/hitWindow/recovery/staminaCost) for holdable melee tools (base set plus plan 160 high-quality variants); `player/playerMelee.ts` is a pure windUp→hitWindow→recovery state machine (hit resolves once per attack, stamina-gated) plus a deterministic range+facing-arc hit test (no raycasting) run against active `AnimalAgent`s independently of the single `pickInGaze` target. `[E]` over a live animal with a melee tool held still triggers the attack (`gameLoop.ts`). Attack visuals: Adventurer's existing `Sword_Slash` clip (`PlayerController.beginMeleeAttack`) is time-scaled to the weapon's windUp+hitWindow+recovery so the slash lands with the hit window; the procedural `setMeleeSwing` pivot remains as a capsule-fallback only. `HealthState`/`AnimalAgent.collapse()`/the quest `onDeath` hook are unchanged — only how damage reaches them changed. Target acquisition (plan 124) is `pickCombatTarget()` (`playerMelee.ts`), reached through `buildCombatTarget()` in `app/interactables.ts` as a fallback after `pickInGaze()`/`buildDigTarget()`; on a touch rig (plan 142) it uses a wider acquisition cone (`COMBAT_TARGET_CONE_DOT.touch` = 0.3 vs `pointer`'s `cos(45°)`) and the started attack commits to the yaw pointing at the acquired target (`yawToward()`, consumed once by `resolveMeleeHits`) so a swing at a target outside the weapon's own `arcDot` still connects. Pointer/keyboard behaviour — cone, live camera yaw at hit time, timing, damage, gap-close — is unchanged. No browser verification yet.
- Player survival pools (`PlayerController.needs`, plan 106): stamina/vigor/hunger/thirst (`src/player/PlayerNeeds.ts`). HUD bars in `HudScreen.vue` (issue [034](./issues/2026-08-19--034--hud-player-health-bar.md)): HP, then stamina/vigor/hunger/thirst. Hunger/thirst reaching 0 costs HP (`applyStarvationDamage`) — no new death/disease system, reuses `damageHealth`. Sprint gated on stamina.
- Animal traps (plan 141, `src/world/animalTraps.ts` + `createPlacedTraps.ts`): player-placed world objects in `WorldBundle`, same persisted-record shape as `PlacedTents`/`PlacedFires` — no trap manager. Two kinds (`TRAP_DEFS.simple`/`good`: durability, base detection, weather-wear multiplier, trigger radius) bought from Kupiec, set down from Inventory ("Zastaw") or Quick Actions through the shared `evaluateGroundPlacement()` (tent placement is now a thin wrapper over it; issue [035](./issues/2026-08-19--035--playtest-coins-placement-inventory.md) allows roads), then `[E]` arms / disarms and `[R]` picks up (`Interactable{kind:'trap'}`). States are `placed | active | broken`; arming snapshots `PlayerSkills.traps.value` (`skillAtActivation`) so a trap never references `PlayerController`. `PlacedTraps.update()` is throttled (0.5 s), early-outs when nothing is armed and reuses the `Fauna.getAgents()` list — no per-frame trap×animal scan. Detection is a pure `trapDetectionChance()` (higher Traps → lower detection, clamped to `[0.1, 0.9]`) rolled against a deterministic `trapDetectionRoll(trapId, animalId, attempt)`; an evasion sets a runtime-only per-`(trap, animalId)` cooldown (not persisted — wild fauna isn't either). Only `TRAPPABLE_SPECIES` (rabbit/boar/deer) can be caught. A catch only kills through the existing `AnimalAgent.takeDamage()`/`collapse()`/`onDeath` path and deactivates the trap (`placed`/`broken`); it leaves an ordinary, un-harvested corpse — no meat/hide is auto-yielded, the player still knife-harvests it (`src/fauna/animalMeat.ts`'s species→meat mapping, shared with `createApp.ts`'s harvest and `harvestedRemains.ts`, is unchanged and unrelated to capture). Weather wear is lazy and only charged to *armed* traps, per completed `computeWeather` cycle — no trap weather ticker and no new weather save state. Visual is procedural (`world/trapProp.ts`, jaws open/closed/bent); a real GLB is `docs/assets/MODELS.md` M40. No browser verification yet.
- Player skills (`PlayerController.skills`, `src/player/PlayerSkills.ts`, plans 124 + 128 + 141): three skills, `SkillState { value, xp, active }`, no levels/perks/points. `xp` is the authoritative (and only persisted) progression state; `value` is always derived through one shared curve `xpToSkillValue()` (floor `SKILL_MIN_VALUE = 0.2`, asymptotic to 1, `SKILL_XP_HALF_VALUE = 120`), and `awardSkillXp()` is the single mutation path. XP comes only from completed actions (`SKILL_XP_AWARD`), never per frame: Traps only on a confirmed trap capture (`captureTrap`, awarded in exactly one place — `createApp.ts`'s `onTrapCapture`), Sneak per `SNEAK_XP_DISTANCE_M = 15` actually sneaked metres (`accumulateSneakUse`, accumulator lives in `PlayerController`, resets when Sneak switches off), Survival on successful ignite / tent setup / cooking / camp rest. Sneak is toggled from the pause menu's "Umiejętności" (`SkillsScreen.vue`, all three skills shown with a progress bar); active Sneak slows walk/sprint ×0.65 (`applySneakSpeedModifier`) and auto-deactivates on the existing rest pose transitions (`crouch()`/`lieDown()`); it feeds `fauna/playerAwareness.ts`'s `detectionProbability` via `NoticeParams.stealthMultiplier` (plan 120 §7) — no second detection system. Survival is passive and modifies existing mechanics only: `survivalDurationMultiplier()` (max −40%, read once when a channel starts) shortens `IGNITE_DURATION_SEC` and `TENT_SETUP_DURATION_SEC`, `survivalFoodMultiplier()` (max +50%) raises `roasted_meat`'s hunger relief at consumption time (one item, no roasted variants), and it reduces the camp-rest penalty below.
- Food (tomato, raw_meat, roasted_meat, bread) and water (`waterskin_empty`/`waterskin_full`) are ordinary `Inventory` items with a `consumable` catalog flag ("Zjedz"/"Wypij" in the inventory screen). Cooking (`raw_meat → roasted_meat`) is a flat recipe table (`items/campfireCooking.ts`), `[R]` at a lit campfire. `WaterSource` (`src/world/WaterSource.ts`) is the shared well/lake drink/fill abstraction; lake is a synthetic per-frame candidate (no discrete world object), reusing fauna's shoreline probe.
- Portable light: lit branch (~90s) or held wooden torch (~240s); persists in `SaveData.playerTorch`.
- Tools in the world: shovel (dig/level soil), axe and battle_axe (multi-stage tree harvest; `isChopTool`), pickaxe (ore + mountain rock), knife and damascus_knife (melee + corpse meat harvest; `isHarvestKnife`), tent (place/rest/pack), garden pitchfork/sickle. Melee GLBs: spear, short_sword, long_sword, plus high-quality set (plan 160: damascus knife/short/long, masterwork, obsidian, battle axe) — Kupiec or quest rewards, no world spawn. Damascus blades are baked teal/navy banded steel (not gray); obsidian is volcanic-glass purple/black. Starting kit: knife, firestarter, blanket when missing.
- Wait / camp rest / town rest / tent rest exist. Quick Actions gate town rest on `nearTown`. Esc during rest aborts the skip before opening pause (and forfeits the camp's quality/XP). Rest always refills stamina; how much **vigor** it gives back depends on the camp (plan 128): `restoreNeedsFromSleep(needs, quality)` takes a `[0,1]` quality that can only fail to fill the bar, never lower it. Quality comes from `src/app/campRest.ts` — a pure module, not a manager: `CampRestContext { hasBlanket, hasTent, hasWarmFire }` is resolved **once, when the rest starts** from the existing `PlacedTents.list()`/`PlacedFires.list()` (a fire must be `isLit()` and within `WARM_FIRE_RADIUS`; village fires don't count, town rest is full anyway), and `campRestQuality()` maps it: blanket only 0.55 < blanket + fire 0.75 < tent + blanket 0.8 < full camp 1.0, with Survival closing up to 60% of the gap. `createApp.ts` owns the outcome via `onSleepFinished()` (`gameLoop.ts` no longer calls `restoreNeedsFromSleep` itself). Busy channels (dig/chop/mine/bury/harvest/ignite/cook/tent-setup/destroy-spawner) are short real-time overlays (seconds, not minutes); harvest/ignite/cook/tent-setup/destroy-spawner show a progress bar and can be Esc-cancelled (nothing is consumed on cancel — the tent is only spent when setup completes). Harvest pins the corpse so it cannot despawn mid-channel.
- Dropped items, item spawners, placed fires (`campfire_unlit.glb` body + `fx/fire.glb` flame on `CampfireFlame`; `simple` hides stones) and large walk-in caves (`world/largeCaves.ts`, empty of loot/mobs) exist.
- Player footsteps are terrain-classified (`src/terrain/footstepSurface.ts` → `audio/playerMoveSounds.ts`, plan 121): beach **and** desert biome play sand (Anton Z default). Jump-land uses the same pack, not Kenney generics; slope walking sticks via `player/verticalMotion.ts` (plan 158) so a heightfield hill does not fire a false land thud. A/B packs: `?footsteps=anton|legacy|mayra` or lil-gui Audio.
- Third-person camera boom (`src/player/cameraBoom.ts`, issue [032](./issues/2026-08-15--032--mobile-black-world-screen.md)) is pulled along the look-at → camera segment so the lens stays above the heightfield and outside house-sized plan-097 colliders. It does not teleport the player. URL `?camdebug=1` overlays pose / terrainY / draw stats (off by default).

### Quests / progression

- `QuestManager` with definitions, objectives and stages (relay v1 + multi-stage world interactions).
- Quest progress, EXP and NPC relations persist. LLM quest generation is not implemented.
- Quest v3 (plan 093, Etap A–G): relation levels (`stranger`/`acquainted`/`friendly`/`trusted`, centralized thresholds) gate quest availability (`QuestDef.availability`); `QuestDef.effects` overrides the flat v2 relation/exp reward; world-problem quests exist end-to-end — "groźny wilk" (kill a specific ambient wolf, bound to its `AnimalAgent.animalId` via an injected resolver, no fauna import in `QuestManager`), "wilcza jama" (a lightweight `wolfDen` spawner — reuses the `PreySpawner`/cave-mouth prop, one-time pack, no respawn — cleared once its whole pack is dead; the emptied den can then be burned via `[E] Zniszcz`), "zagubiona owca" (find a specific bound livestock animal via `[E]` interact — `find_animal`/`animal_found`, same bind-on-accept mechanism as the wolf quest, ungated so it's Anna's on-ramp toward `trusted`) and "drewno na naprawę" (existing `gather_item` objective, no new mechanic). Livestock `AnimalAgent.ownerHouseId` (plan 093 Etap G, `settlement/places.ts`'s `homePlaceId`) links each farm animal to its owning household's home `Place.id`; audited in plan 110, still no consumer — kept as a foundation, not a gap. Bandit objectives remain unimplemented.
- Quest v3 closure (plan 110): `QuestState` adds terminal `failed` (a stage's bound world entity can no longer be completed, e.g. a `find_animal` target dying before being found — `QuestManager.failQuest()`) and `invalidated` (set only on save/load restore, see persistence below). `AnimalAgent.collapse()` now calls an injected `onDeath?(animalId)` hook (threaded from `createFauna.ts`/`livestock.ts` through `worldBundle.ts`/`createApp.ts`) so **any** death — not just a player melee kill — reports `animal_died` to `QuestManager`; the pre-existing `gameLoop.ts` melee-diff path is untouched (duplicate dispatch for an already-inactive quest is a no-op). "Groźny wilk" is now visually/gameplay distinct: `QuestDef`'s `kill_target_animal` objective takes an optional `dangerous` flag, applied at bind time (not spawn) via `AnimalAgent.markDangerous()` — HP/damage multiplier, larger scale, tinted GLB material (`settlement/props.ts`'s `tintPropMaterials`), relabeled. No new model/spawner.
- Procedural landmarks (`monolith`/`stoneCircle`/`smallRuins`/`cemetery` in `terrain/chunkEnvironment.ts`) now carry a stable `EnvironmentPlacement.id`, purely derived from `(seed, chunk, kind, ordinal)` via `deriveLandmarkId` — no save persistence needed, regenerates identically on reload. Landmark quests (plan 132) are the first consumer: `ChunkManager.findLandmarkNear`/`getNearbyLandmarks` (deterministic bounded ring-search + loaded-chunk query, still no persistent registry/discovery flags) back a new `interact_landmark` quest objective (`quests.ts`'s `buildLandmarkQuests`, called once from `createApp.ts` at world setup) and a new `Interactable{kind:'landmark'}` `[E]` target.

### Persistence

- IndexedDB in `src/persistence/`. Canonical save schema is **v17** (`saveData.ts`): world config (including optional `settlements.homeSize`), player pose, time of day, elapsed days, quests/EXP/relations, inventory, held tool, collected IDs, dropped items, placed fires, placed tents, player torch, world flags, sparse tree overrides, map discovery cells, settlement economies, player hunger/thirst/vigor (stamina stays transient), owned land plots (v14), skill XP (v15 — only `xp`; `value` is re-derived and the runtime `active` flag is never restored, and a pre-v15 save comes back with Sneak at the legacy 0.5 and Survival at zero), placed animal traps (v16 — id/kind/position/state/durability/`skillAtActivation`/`weatherCheckedAtDay`, nothing derivable from `TRAP_DEFS`; a v15 save migrates to no traps and a fresh `traps` skill), fauna spawn-point lifecycle (v17 — `spawnPoints`: id/state/deathsThisCycle/disabledAtDay only, keyed by the deterministic `PreySpawner.id`; a pre-v17 save migrates to no entries, i.e. every spawn point starts fresh/`active`). Weather/season (plan 040) deliberately add **no** save field — they're pure functions of `(seed, elapsedDays)`, both already persisted.
- localStorage is split by domain (`src/config/persistConfig.ts`): graphics / player / world; legacy `seedvale:worldConfig:v1` migrates on first load. Audio mix (`seedvale:audio:v1`, `src/audio/audioSettings.ts`) is a separate device preference, not a `WorldConfig` field.
- NPC runtime state is **not** a full simulation snapshot. Tree lifecycle uses sparse overrides + lazy growth from `elapsedDays` (`src/world/treeLifecycle.ts`).
- `QuestManager`'s `questId → animalId` binding is never persisted (plan 110) — on restore, an `active` `kill_target_animal`/`find_animal` quest re-derives its binding: livestock kinds (deterministic `animalId` per settlement/house seed, `settlement/livestock.ts`'s `LIVESTOCK_KINDS`) rebind via the normal resolver; wild-fauna kinds (unseeded per-session `animalId` counter, dead/alive state not persisted at all) become `invalidated` instead of silently retargeting a different individual. Fauna/livestock HP/death/corpse state is not persisted — killed animals resurrect on reload; this is why the wild-fauna case can't safely rebind.

### UI / input

- Keyboard/mouse plus mobile touch (joystick + look-drag stay vanilla in `createTouchControls.ts`).
- Vue 3 + Tailwind v4 + `lucide-vue-next` mounts under `#vue-ui`. Migration is incremental: pause, quest log, inventory, quick actions, time-skip, busy overlay, world config, notes, HUD, minimap, world map, toast, merchant, skills and touch chrome are Vue; `src/ui/create*.ts` for these are facades.
- Touch HUD chrome shares `HudRightColumn` (pause + skills + minimap); Quick Actions is a fixed overlay (`Teleport` to `body`) with wrap/grid rows, not a slot in the column. The E/Zap/R cluster stays in `TouchChrome` so it paints above flavor/NPC dialogue. Desktop: skills button stacked above the QA FAB; `U` toggles Umiejętności.
- Minimap is heading-up with a rim `N` marker; `M` opens the north-up world map. Discovery is permanent (radius 48, `SaveData.map`, schema v11) and does not load chunks.
- Home-trader `MerchantScreen` is two columns (stock | player bag) with category (`Jedzenie` = `ItemCategory food`) / price / sort filters; buy and sell with `coin` (Kup ghost, disabled when unaffordable), sell at half `tradeValue`, barter still covers list price. `shell` stays barter-only (Kupiec will not buy or sell shells). Toasts sit at `z-20` above the modal.
- lil-gui is hidden by default; Ustawienia → Panel debug, `?debug=1` or `?gui=1` reveal it (`?gui=0` forces hide). Pause → Świat exposes the player-facing subset of the same `WorldConfig`. Pause → Ustawienia → Dźwięk has master / ambient / SFX sliders (`createWorldAudio` GainNode buses; `seedvale:audio:v1` localStorage, not SaveData — plan 154). **Resetuj ustawienia** restores those sliders to 100% and the graphics quality preset to High through the same live handlers (plan 165) — not seed, terrain, name, day/night, or HUD FPS.
- Vue Fazy 0–4 are implemented; desktop + touch browser verification is still open (plan 046). Plan 105 UI/UX audit is done ([review 007](./reviews/2026-08-14--007--ui-ux.md)); H1–H3 + trade/skills HUD are implemented, pending browser check.

## Important shared concepts

Prefer extending existing shared mechanisms instead of creating parallel systems.

- `WorldBundle` — lifetime/rebuild boundary for the ten world systems listed above.
- `HealthState` — shared health/damage/death (`src/shared/HealthState.ts`) used by fauna, NPCs and the player.
- `StaminaState` — shared physical-effort capacity (`src/shared/StaminaState.ts`) used by fauna and NPCs.
- `VigorState` — NPC daily physiological budget (`src/shared/VigorState.ts`); collapse gates sleep through the existing NPC FSM. Not used by fauna.
- `PlayerNeeds` — player stamina/vigor/hunger/thirst pools (`src/player/PlayerNeeds.ts`, plan 106), reusing `StaminaState`/`VigorState`; hunger/thirst are a new `HungerState`/`ThirstState` pool pair, same `{max, current}` shape.
- `WaterSource` — shared well/lake drink/fill abstraction (`src/world/WaterSource.ts`, plan 106); future river/polluted/treated sources should reuse it.
- Shared simulation contracts — `PlannedAction`, `ActionLifecycle`, `DecisionContext`, `pickHighestScore` in `src/simulation/`. NPC + fauna adapters; predator scoring in `src/fauna/predatorHumanDecision.ts`.
- `SettlementEconomy` — settlement-owned bulk stock (`src/economy/`), `EconomicKind` = `food`/`water`/`wood`/`iron`/`coal`/`gold` (ore added plan 131 — NPC-mined raw resource stock, no demand target yet). Not player `Inventory`. Not in save data yet.
- `Household` — one family's own `food`/`wood` stock (plan 069, `src/settlement/household.ts`), reusing `SettlementEconomy`'s `EconomicStock`, plus a separate `water` reserve (`WaterReserve`, plan 122 — deliberately not an `EconomicKind`) backing that household's `WaterBarrel`/`AnimalTrough`. Sits between NPC carrying and `SettlementEconomy`; registry lives on `SettlementsManager` like `EconomyRegistry`. `HouseholdResourceKind` is a fixed `'food' | 'wood'` literal (plan 131, no longer derived from `EconomicKind`) so ore never becomes household-storable by construction. Not in save data yet.
- `NpcAgent` / `AnimalAgent` — central behaviour integration points. `NpcAgent` also carries a small generic `Inventory` (plan 131) as a brief hold between extracting a world resource (ore) and delivering it — not a persistent belongings system.
- `Inventory` / `ItemKind` / `HeldTool` — item ownership + single held-tool slot; `Inventory` itself is generic (player + NPC), not player-only.
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
- **Performance diagnostics (plan 103)** — `src/perf/` sampler/benchmark; lil-gui Performance + `?perf=1` / `?benchmark=<id>`. Graphics quality presets Low/Medium/High/Custom in Pauza → Świat → Grafika. High AO is Performance quality with a heavy-frame auto-suppress (plan 113). Adaptive Quality is stored-off, not implemented. Draw calls / triangles are accumulated across composer+mirror (`info.autoReset = false`); diagnosis: [review 012](./reviews/2026-08-14--012--perf-bottleneck-diagnosis.md). Rendering-budget follow-up: [plan 113](./plans/2026-08-14--113--rendering-performance-gpu-scaling.md). Chunk-streaming hitch follow-up: [plan 119](./plans/2026-08-15--119--chunk-streaming-performance.md). Shader/program first-use hitch investigation: [plan 149](./plans/2026-08-17--149--shader-program-first-use-hitch.md) — Phase 0 census done ([review 021](./reviews/2026-08-18--021--plan-149-phase-0-real-gpu.md)); `cacheKey` dump ([review 022](./reviews/2026-08-18--022--plan-149-program-family-dump.md)); PointLight-axis pin **PASS** ([review 023](./reviews/2026-08-18--023--plan-149-pointlight-variant-axis.md)); budget curve 8/12/16 with a cheap counter ([review 024](./reviews/2026-08-18--024--plan-149-pointlight-budget-curve.md), 62 programs, 16 visual-safe). Production PointLight budget **16** shipped ([plan 157](./plans/2026-08-18--157--production-pointlight-budget.md)). Loading-window `compileAsync` prewarm (149 Phase 1 A) shipped ([review 025](./reviews/2026-08-19--025--plan-149-phase-1a-compileasync-prewarm.md)); leftover instancing/mask (`Green` / `MI_WindowGlass` / `Wood`) is Phase C.

## Important code entry points

```text
src/app/createApp.ts
src/app/gameLoop.ts
src/app/worldBundle.ts
src/config/worldConfig.ts
src/terrain/chunkManager.ts
src/terrain/chunkEnvironment.ts
src/terrain/vegetationRegionBatcher.ts
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
src/player/PlayerSkills.ts
src/player/playerMelee.ts
src/app/campRest.ts
src/world/WaterSource.ts
src/quests/QuestManager.ts
src/world/dayNight.ts
src/world/animalTraps.ts
src/world/weather.ts
src/world/treeLifecycle.ts
src/persistence/saveData.ts
src/audio/createWorldAudio.ts
src/audio/audioSettings.ts
src/ui/
src/ui-vue/
```

## Current architectural seams / active refactors

- **World visual overhaul (024)** — plants done in part; sky/clouds and distant mountains remain.
- **UI** — Vue Fazy 0–4 implemented, browser verification pending. Plan 105's audit (review 007) is done; H1 (all 5) and 2/3 of H2 are now implemented (see plan 105 §11 implementation notes) — H2.1 (touch layout collision, C2) and all of H3/H4 remain open. A new Character screen (HP/hunger/thirst/vigor from `PlayerNeeds`/`HealthState`, plan 105) also exists — `src/ui-vue/screens/CharacterScreen.vue`, opened via pause menu's "Postać". None of this has browser/manual verification yet. Do not assume every future UI belongs in Vue; extend the existing facade + store pattern when migrating.
- **NPC daily routine** — Place + executable schedule + vigor are implemented. Household resource layer (plan 069) is also implemented — see below. Vigor collapse and a critical need (plan 114) now interrupt a schedule-driven action already in flight (`goTo`/`execute`); ordinary schedule/time-of-day changes still do not. Remaining gap is intentional: no social landmark. See [SETTLEMENTS.md](./SETTLEMENTS.md).

## Verification state

Technical checks: `npx tsc --noEmit` · `pnpm run lint:fix` · `pnpm run build` · `pnpm run test`.

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
