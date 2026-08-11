# Seedvale — Current State

**Purpose:** factual snapshot of the implemented codebase. This document describes what exists now, not the desired future state.

**Last verified:** 2026-08-11

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

`rebuildWorldBundle()` disposes and recreates these systems while mutating the existing bundle object in place. Callers must therefore keep the bundle reference rather than destructuring a member that may later be replaced. This is the intended lifecycle pattern; plan 054 covers remaining callback/reference-safety cleanup, including code that currently captures `PlacedFires` directly.

## Major implemented systems

### World / terrain

- Procedural terrain with chunked generation.
- Worker pool for terrain generation.
- Chunk streaming with load/unload radii and pinned home chunks.
- Large-scale terrain regions including ocean/coast/mountain behaviour.
- Biome/moisture-region support and environment generation.
- Per-chunk vegetation and natural environment elements.
- Procedural landmark pipeline exists and is currently being extended/verified under plan 049.
- Ocean, sky, lighting, day/night cycle and fog are implemented.
- Post-processing includes EffectComposer, N8AO and SMAA.
- Terrain detail normal configuration is exposed through world configuration.

### Settlements / NPCs

- Multiple streamed settlements.
- Settlement generation with families, houses, roads/paths and environment-aware siting.
- NPC needs and behaviour/state-machine logic.
- NPC personality/character depth including role, traits/Big Five-related data, health and stamina.
- NPCs use shared `StaminaState` for work/rest effort; HP is no longer drained by fatigue.
- NPC names and family naming data.
- NPC dialogue v2 exists as a Vue screen with multiple conversation topics.
- NPC daily routine/place work is partially implemented; plan 020 remains in progress.
- NPC reaction sounds are implemented.

### Fauna

- Predator/prey roles.
- Chase/flee behaviour.
- Health and damage/death flow via shared `HealthState`.
- Animal Life hunger/thirst/stamina (`AnimalLifeState`; stamina migrated from former `energy` under plan 045).
- Spawners and respawn.
- Player-awareness/flee behaviour.
- Exhaustion gates sustained chase/flee sprinting.
- GLB fauna models are used for wolf/fox/deer/stag.

### Items / player

- `ItemKind` and `Inventory` exist in `src/items/`.
- Player has shared `HealthState` on `PlayerController` (100 HP; no death UI/respawn yet — plan 045).
- Inventory is persisted in save data and has weight calculation/max weight support.
- Item spawners and dropped items exist.
- Natural collectible items are integrated into the world.
- Starting equipment currently includes knife, firestarter and blanket when missing.
- Simple fire/fire pit/torch interactions exist.
- Wait/rest time skip exists.
- Inventory UI is a Vue screen (`src/ui-vue/screens/InventoryScreen.vue`); `src/ui/createInventoryScreen.ts` is a facade — see "UI migration" below.
- Inventory pick-up / drop SFX exist (`audio/inventorySounds.ts` via `worldAudio.playOnce`): ground collect, tree branch, dig stone, UI/quick drop.
- Shovel is a one-time settlement landmark pickup (`items/createItemSpawners.ts`, campfire/garden anchors — not in generic `SPAWN_SPECS`). Dig/level require a shovel in inventory; HUD prompts appear only while the shovel is **held** (`items/HeldTool.ts`, persisted as `SaveData.heldTool` in schema v7): **`E` digs**, **`R` levels** (both can show together over a depression). Owning a shovel (held or not) also exposes dig/level in Quick Actions. Dig/level run as a ~2 s busy channel (`app/busyAction.ts` + Vue `BusyOverlay`) then apply via `terrain/digAction.ts`. Dig size/tuning and stone notice chance live in `terrain/dig.ts`. Found stones go to inventory on a successful notice roll, otherwise (or when inventory is full) drop beside the hole via `droppedItems` — never silently lost. `ChunkManager.modifyTerrain` / `levelTerrain` own the runtime height overlay (dig down / raise toward procedural base); not save-persisted, reapplied on chunk reload.

### Quests / progression

- `QuestManager` exists with quest definitions/objectives/stages.
- Relay quest v1 and multi-stage/world-interaction quest functionality exist.
- Quest progress, EXP and NPC relations are persisted in the current save format.
- Quest generator/LLM generation is not implemented.

### Persistence

- IndexedDB persistence exists in `src/persistence/`.
- Current save data includes world configuration, player position/orientation, time of day, elapsed game days, quests/EXP/relations, inventory, held tool, collected item IDs, dropped items, placed fires and sparse tree lifecycle overrides.
- Save schema is currently version `8` in `createApp.ts`.
- New Game resets world-dependent state as implemented by `createApp.ts`/`rebuildWorldBundle()`.
- NPC runtime state is not generally persisted as a full simulation snapshot; do not assume Continue restores every NPC need/AI state.
- Tree lifecycle (`src/world/treeLifecycle.ts`) uses sparse overrides + lazy growth from `DayNightState.elapsedDays`; chunk/settlement trees share `TreeId` and `harvestWorldTree`.

### UI / input

- Keyboard and mouse input exist.
- Mobile touch controls exist.
- Existing vanilla UI modules remain in `src/ui/`.
- Vue 3 + Tailwind v4 + `lucide-vue-next` is mounted under `#vue-ui` through `src/ui-vue/`.
- Vue migration is incremental; it is not a full replacement of the vanilla UI yet.
- NPC dialogue v2 is already a Vue screen.
- Pause menu, quest log, inventory, quick actions, time-skip overlay, busy/channel overlay, world config screen, notes/journal, HUD, minimap, toast and touch action chrome exist as Vue screens/overlays; `src/ui/create*.ts` for these are thin compatibility facades over the Vue store.
- Touch joystick + look-drag remain vanilla DOM in `src/input/createTouchControls.ts` (input hot-path); Lucide icons on pause/actions/minimap toggle (plan 046 Faza 4 / issue 005).
- lil-gui remains the full debug/world configuration UI (region/fbm/road-network tuning, post-processing); the in-game world config screen (pause menu → Świat) exposes only the player-facing subset (seed, flat shading, day/night) — same underlying `WorldConfig`/`DayNightState` objects, not a duplicate.

## Important shared concepts

Prefer extending existing shared mechanisms instead of creating parallel systems.

- `WorldBundle` — lifetime/rebuild boundary for core world systems.
- `HealthState` — shared health/damage/death (`src/shared/HealthState.ts`) used by fauna, NPCs and the player.
- `StaminaState` — shared physical-effort capacity (`src/shared/StaminaState.ts`) used by fauna (`AnimalLifeState.stamina`) and NPCs; replaces NPC HP-as-fatigue and animal `energy`.
- Shared simulation contracts — `PlannedAction`, `ActionLifecycle`, `DecisionContext`, `pickHighestScore` in `src/simulation/` (plan 055). NPC + fauna adapters; predator hunger-vs-fear scoring in `src/fauna/predatorHumanDecision.ts`.
- `NpcAgent` — central NPC behaviour/needs/personality integration point.
- `AnimalAgent` — central fauna behaviour integration point (intents via shared lifecycle; chase/flee/wander bodies unchanged).
- `Inventory` / `ItemKind` / `HeldTool` — item ownership + single held-tool slot.
- `QuestManager` — quest progress, EXP and relations.
- `ChunkManager` — terrain sampling, streaming and environment-facing world queries.
- `Place` / schedule-related NPC work — existing foundation for daily routines.

Before adding a new abstraction, check whether one of these already owns the responsibility.

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

Plan 020 is partially implemented. `Place`, schedule and movement/action concepts exist, but the full role-driven routine/workplace system is not complete.

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
- Full role-driven NPC daily routine/workplace system (plan 020).
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
- Plan 020 — NPC Place/daily routine.
- Plan 045 — Health/Stamina foundation: implemented; browser/manual verification pending (Threat deferred).
- Plan 047 — village generation overhaul.

## Source of truth rule

When this document conflicts with the code, **the code wins**. When it conflicts with a plan, the plan describes intended work but does not override implemented behaviour. Update this file when a structural change makes the snapshot materially stale.
