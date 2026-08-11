# Seedvale — Current State

**Purpose:** factual snapshot of the implemented codebase. This document describes what exists now, not the desired future state.

**Last verified:** 2026-08-10

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
- NPC personality/character depth including role, traits/Big Five-related data and health state.
- NPC names and family naming data.
- NPC dialogue v2 exists as a Vue screen with multiple conversation topics.
- NPC daily routine/place work is partially implemented; plan 020 remains in progress.
- NPC reaction sounds are implemented.

### Fauna

- Predator/prey roles.
- Chase/flee behaviour.
- Health and damage/death flow.
- Spawners and respawn.
- Player-awareness/flee behaviour.
- GLB fauna models are used for wolf/fox/deer/stag.
- The planned Animal Life hunger/thirst/energy layer is not yet implemented; plan 021 is still in progress.

### Items / player

- `ItemKind` and `Inventory` exist in `src/items/`.
- Inventory is persisted in save data and has weight calculation/max weight support.
- Item spawners and dropped items exist.
- Natural collectible items are integrated into the world.
- Starting equipment currently includes knife, firestarter and blanket when missing.
- Simple fire/fire pit/torch interactions exist.
- Wait/rest time skip exists.
- Inventory UI is a Vue screen (`src/ui-vue/screens/InventoryScreen.vue`); `src/ui/createInventoryScreen.ts` is a facade — see "UI migration" below.
- Inventory pick-up / drop SFX exist (`audio/inventorySounds.ts` via `worldAudio.playOnce`): ground collect, tree branch, dig stone, UI/quick drop.
- Shovel exists as a one-time settlement pickup (`items/createItemSpawners.ts`'s `SPAWN_SPECS`, `respawnTime: Infinity`). Holding it unlocks a `[E]`-triggered "Wykop dołek" ground interaction (fallback target only when nothing else is being gazed at — see `app/interactables.ts`'s `buildDigTarget`) that locally deforms terrain and has a chance to yield `stone`. Terrain deformation is a small runtime overlay owned by `ChunkManager` (`modifyTerrain`/`applyModificationToTile` in `terrain/chunkManager.ts`), mutating a loaded chunk's cached height grid in place — not persisted across saves, and reapplied on chunk reload. Ground eligibility/tuning lives in `terrain/dig.ts`.

### Quests / progression

- `QuestManager` exists with quest definitions/objectives/stages.
- Relay quest v1 and multi-stage/world-interaction quest functionality exist.
- Quest progress, EXP and NPC relations are persisted in the current save format.
- Quest generator/LLM generation is not implemented.

### Persistence

- IndexedDB persistence exists in `src/persistence/`.
- Current save data includes world configuration, player position/orientation, time of day, quests/EXP/relations, inventory, collected item IDs, dropped items and placed fires.
- Save schema is currently version `6` in `createApp.ts`.
- New Game resets world-dependent state as implemented by `createApp.ts`/`rebuildWorldBundle()`.
- NPC runtime state is not generally persisted as a full simulation snapshot; do not assume Continue restores every NPC need/AI state.

### UI / input

- Keyboard and mouse input exist.
- Mobile touch controls exist.
- Existing vanilla UI modules remain in `src/ui/`.
- Vue 3 + Tailwind v4 + `lucide-vue-next` is mounted under `#vue-ui` through `src/ui-vue/`.
- Vue migration is incremental; it is not a full replacement of the vanilla UI yet.
- NPC dialogue v2 is already a Vue screen.
- Pause menu, quest log, inventory, quick actions, time-skip overlay, world config screen and notes/journal screen exist as Vue screens; `src/ui/create*.ts` for these are thin compatibility facades over the Vue store, not separate implementations.
- HUD, minimap, toast and touch controls remain vanilla DOM (plan 046 Faza 4 — intentionally not migrated yet, hot-path code).
- lil-gui remains the full debug/world configuration UI (region/fbm/road-network tuning, post-processing); the in-game world config screen (pause menu → Świat) exposes only the player-facing subset (seed, flat shading, day/night) — same underlying `WorldConfig`/`DayNightState` objects, not a duplicate.

## Important shared concepts

Prefer extending existing shared mechanisms instead of creating parallel systems.

- `WorldBundle` — lifetime/rebuild boundary for core world systems.
- `HealthState` — shared health/damage/death concept used by fauna and intended for broader agent use.
- `NpcAgent` — central NPC behaviour/needs/personality integration point.
- `AnimalAgent` — central fauna behaviour integration point.
- `Inventory` / `ItemKind` — existing item ownership model.
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
src/fauna/HealthState.ts
src/items/Inventory.ts
src/items/createItemSpawners.ts
src/quests/QuestManager.ts
src/persistence/saveData.ts
src/persistence/saveDb.ts
src/ui/
src/ui-vue/
```

## Current architectural seams / active refactors

### WorldBundle / createApp

Plan 053 refactored `createApp.ts` and introduced the mutable `WorldBundle` boundary. Plan 054 (done) audited every long-lived closure created in `createApp.ts` for stale references into a `WorldBundle` field that `rebuildWorldBundle()` replaces — found and fixed one real bug (`getUserActions(...)` capturing `bundle.placedFires` by value instead of reading it live), confirmed `gameLoop.ts`/`interactables.ts` were already correct. Read plan 053 before making structural changes here; plan 054 documents what was checked and why.

### UI migration

Plan 046 introduced the Vue/Tailwind UI stack and is being migrated screen-by-screen. Faza 0-3 are done (pause menu, quest log, NPC dialog, inventory, quick actions, time-skip overlay all live in `src/ui-vue/`). Faza 4 (HUD/minimap/toast/touch controls) is intentionally paused — hot-path code, needs a deliberate risk/reward call, not an automatic migration. Do not assume every UI screen belongs in Vue yet; check the existing screen and the relevant plan before moving it.

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
- Animal hunger/thirst/energy life simulation (plan 021).
- Full role-driven NPC daily routine/workplace system (plan 020).
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
- Plan 046 — Vue/Tailwind UI migration: Faza 0-3 done, Faza 4 (hot-path HUD/minimap/toast/touch) paused pending a deliberate decision.
- Plan 005 — game UI screens: done (world config + notes/journal screens close out the last open item).
- Plan 052 — shovel digging/stone finding: done (shovel item, runtime terrain-deformation layer, dig ground interaction).
- Plan 020 — NPC Place/daily routine.
- Plan 021 — Animal Life.
- Plan 047 — village generation overhaul.
- Plan 045 — Health/Stamina/Threat foundation.

## Source of truth rule

When this document conflicts with the code, **the code wins**. When it conflicts with a plan, the plan describes intended work but does not override implemented behaviour. Update this file when a structural change makes the snapshot materially stale.
