# Seedvale Architecture

**Purpose:** describe the architecture that exists in the code today. This is an architectural map, not a product roadmap.

**Last verified:** 2026-08-22

## Source of truth

- `CLAUDE.md` — how agents should work.
- `docs/STATE.md` — what is currently implemented.
- `docs/SETTLEMENTS.md` — settlements and NPC life as implemented.
- `docs/ROADMAP.md` — product direction.
- `docs/plans/README.md` — plan/status index.
- Source code — authoritative when documentation conflicts with implementation.

## Runtime composition

`src/app/createApp.ts` is the application composition root. It creates the renderer/scene/camera, UI, audio, player, inventory, quests, day/night state and the world bundle, then wires the runtime loop and persistence together.

It is a wiring layer, not an implementation layer: the detailed behaviour of each area lives in its own `src/app/` module (render-stack construction, graphics/quality handlers, inventory/trade wiring, the player-action families under `src/app/actions/`, `SaveData` assembly, and the rAF/resize/context-loss driver around the game loop). See [CODE_INDEX.md](./CODE_INDEX.md) for the file-level map. Those modules receive their dependencies from `createApp.ts` and do not own world lifetime.

The world systems that are rebuilt together are grouped in `src/app/worldBundle.ts` as `WorldBundle`:

```text
WorldBundle
├── ChunkManager          terrain streaming + world sampling
├── WorldOcean
├── SettlementsManager    settlements, NPCs, livestock, economy
├── Fauna                 wild animals + habitat spawners
├── ItemSpawners          renewable world pickups
├── ResourceDeposits      ore / stone deposits
├── DroppedItems
├── PlacedFires           player-lit fires and fire pits
├── PlacedTents
├── PlacedTraps           animal traps (plan 141)
├── PlacedContainers      player storage, placed or carried (plan 164)
├── PlayerWells           player-built wells (plan 127)
├── PlayerGardens         player-built garden plots (plan 174)
├── LargeCaves
├── DryingRacks           settlement-landmark preservation (plan 159)
└── Beehives              settlement-landmark wild hives (plan 159)
```

`src/app/worldBundle.ts` is authoritative for this list; the annotations above
are orientation, not a contract.

`WorldBundle` is mutated in place during rebuild. Callers that need a live world reference should retain the bundle and read its fields when used; they must not capture a bundle field before a rebuild and expect it to remain current. Plan 054 audited long-lived closures against this rule and is done.

## Major subsystems

```text
Application
└── createApp
    ├── World
    │   └── WorldBundle
    │       ├── Terrain / chunk streaming
    │       ├── Ocean
    │       ├── Settlements / NPCs
    │       ├── Fauna
    │       ├── Natural resources
    │       ├── World items / dropped items
    │       ├── Player-placed objects (fires, tents, traps, containers, wells)
    │       ├── Settlement landmarks with state (drying racks, hives)
    │       └── Large caves
    ├── Player
    │   ├── PlayerController
    │   ├── Inventory
    │   └── Player actions / torch
    ├── Simulation services
    │   ├── Game loop
    │   ├── Day/night + time skip
    │   └── QuestManager
    ├── Presentation
    │   ├── Three.js renderer / post-processing
    │   ├── CSS2D labels
    │   ├── audio
    │   └── UI / Vue UI
    └── Persistence
        └── SaveData / IndexedDB
```

This diagram is intentionally conceptual. The actual imports in the source are authoritative.

## World lifecycle

```text
createApp
  │
  ├── createWorldBundle(...)
  │       └── build terrain → wait for home chunks → create dependent world systems
  │
  ├── run simulation
  │
  └── rebuildWorldBundle(...)
          ├── dispose current world systems
          ├── clear module-level road caches
          ├── create a new ChunkManager
          └── recreate dependent world systems against the new manager
```

The rebuild path is used when terrain/world configuration changes and when starting a genuinely new seed. The caller decides whether collected items should be reset; `rebuildWorldBundle` carries that decision through rather than deciding it itself.

Not every long-lived system is recreated. `PlayerController`, for example, survives a terrain rebuild and explicitly receives the new terrain samplers/water level through `setGround(...)`. The correct rule is therefore **recreate a world system or explicitly rebind its replaceable world dependencies**, not blindly recreate every consumer of `ChunkManager`.

## Dependency direction

The intended high-level direction is:

```text
config / primitives
        ↓
terrain / world generation
        ↓
settlements / fauna / resources / items
        ↓
simulation orchestration
        ↓
presentation / interaction
        ↓
persistence wiring
```

This is a guide, not a claim that every current import follows a strict layered architecture. `createApp.ts` is deliberately a wiring layer and therefore depends on most subsystems.

## Terrain as shared world environment

`ChunkManager` exposes sampling/environment APIs used by other systems, including terrain height, floor, water level and regional signals. World systems should consume these APIs rather than duplicate terrain-generation logic.

Terrain streaming is separate from simulation presence. Terrain has its own chunk load/unload radii; settlement streaming uses a separate load/unload radius; and local settlement/fauna/item generation uses the fixed `HOME_RADIUS` spatial parameter. Do not assume that being outside the player's loaded terrain means an NPC/animal system should stop existing.

## NPCs, settlements and fauna

Settlements are managed by `SettlementsManager`; fauna is created and managed separately. Both are world systems coordinated by `WorldBundle` rather than being owned by the player controller.

NPC behaviour is built around needs/FSM/personality/dialogue/quest interactions. Fauna has predator/prey behaviour and health/damage. Shared mechanisms should remain shared when the domain overlap is intentional.

## Items and interaction

`Inventory` is owned by the application/player-facing layer. World-side item state — dropped items, item spawners and every player-placed object (fires, tents, traps, containers, wells) — lives in `WorldBundle`. Interaction code connects player actions to those systems rather than moving all item state into the player controller; the action modules under `src/app/actions/` are that connection layer.

## Simulation vs presentation

The game loop is the runtime coordination point for simulation updates and interaction state. Rendering/UI/audio are presentation layers around the simulation; avoid putting persistent gameplay rules solely in UI components.

Modal UI can gate parts of simulation/input. Changes to modal behaviour should therefore be checked against the game loop and all relevant UI entry points, not only the component being changed.

## Time model

Three time categories exist, deliberately not unified into a single `TimeManager` (plan `docs/plans/2026-08-22--192--arch--time-and-simulation-consistency.md`):

- **World Time** — `DayNightState.elapsedDays`/`timeOfDay`/`dayLengthSec` (`world/dayNight.ts`), the single owner of the game clock; `tickDayNight()` is the only place that advances it. Lazy systems keyed off `elapsedDays` directly (tree/crop growth, `items/timedProcess.ts`, weather/seasons) resolve state on demand from an anchor (e.g. `startedAtDays + durationDays`) instead of ticking every frame — they survive time-skip and chunk unload for free and need no second clock.
- **Simulation Time** — the `dt`/`worldDt` passed into an actively-updating agent (NPC/fauna/player) each frame. Gameplay tuning expressed in game-days/game-hours (e.g. "hunger empties in 3 game-days") must convert against the *live* `dayNight.dayLengthSec`, not a hardcoded assumption of its default (480s) — use `world/timeConversion.ts`'s stateless helpers (`gameDaysToRealSeconds`, `realSecondsToGameHours`, etc.), which take `dayLengthSec: number` directly rather than the whole `DayNightState`, so a system that only needs the ratio doesn't depend on the day/night module's full state shape.
- **Real-Time Actions** — short cooldowns/animations/action durations (combat swing/draw timing, busy channels — `app/busyAction.ts`) that are genuinely real-time regardless of day length. Do not mechanically convert these to game-time units.

## Multiplayer readiness (not implemented)

Seedvale is single-player today; there is no multiplayer, netcode or WebSocket layer, and none is planned in the near term. That said, keep architectural decisions from foreclosing a later move to a small (~2–5 player) shared world with server-authoritative simulation. The simulation/presentation split this document already assumes — world state that is representable and evaluable independent of Three.js objects — is the same shape that split would need. Do not design networking now; just avoid coupling world/NPC/economy state so tightly to the client or to rendering objects that such a split becomes a rewrite.

## Persistence

Persistence is orchestrated from the app layer, but ownership is split by responsibility:

- `src/app/saveState.ts` assembles the current runtime state into `SaveData` and owns *when* it is written (explicit save, page-lifecycle events, interval autosave). `createApp.ts` gives it the live systems to read from.
- `src/persistence/saveData.ts` owns the `SaveData` schema, validation/defaulting and migrations.
- `src/persistence/saveDb.ts` owns the IndexedDB storage operations and the named save slots.

NPC runtime state is not fully persisted; a `Continue` is therefore not equivalent to serializing the complete living world.

When changing `SaveData`, preserve compatibility with older saves and use the existing migration/defaulting patterns in the config and persistence code. `loadSaveData` (`src/persistence/saveData.ts`) migrates any older version up to the current one; `src/persistence/saveData.ts` is authoritative for the exact shape — this section is a summary, not a restatement of the field list.

### Save schema version history

Current schema version: **v26**. Versions before v14 predate this table (see the migration chain in `saveData.ts` for their exact history); each row below is a version bump, what it added, and what happens when an older save is loaded.

| Version | Plan | Added | Pre-version save migrates to |
|---|---|---|---|
| v14 | 129 | Owned land plots | none owned |
| v15 | 124/128 | Skill XP (`xp` only — `value` is re-derived, `active` is never restored) | Sneak at the legacy 0.5, Survival at zero |
| v16 | 141 | Placed animal traps (id/kind/position/state/durability/`skillAtActivation`/`weatherCheckedAtDay`) | no traps, fresh `traps` skill |
| v17 | 125 | Fauna spawn-point lifecycle (`spawnPoints`: id/state/deathsThisCycle/disabledAtDay, keyed by the deterministic `PreySpawner.id`) | no entries — every spawn point starts `active` |
| v18 | 150 | Version bump (combat mode/downed state landed in this plan) | — |
| v19 | 155 | `inventoryInstances` (generic `ItemInstance` model) | — |
| v20 | 159 | `foodBatches`, `dryingRacks`, `hives`, `fishingBait`; `placedTraps` gains optional `baitKind` | all four empty/none; existing perishable stacks behave as always-fresh until removed and re-added |
| v21 | 172 | `harvestedCropIds` (same sparse-id contract as `collectedItemIds`) | none harvested |
| v22 | 164 | `placedContainers`/`carriedContainer` | none placed/carried |
| v23 | 127 | `playerWells` | none built |
| v24 | 127 (revision) | `SavePlayerWell` shape change: `stageStartedAt` (elapsed-time timestamp) → `workProgress` (hours of active work) | each well keeps its `stage` but `workProgress` resets to 0 — a timestamp can't retroactively recover "active work" |
| v25 | 126 | `plantedTrees`/`plantedCrops` (identity/placement only — a planted tree's stage is already covered by `treeOverrides`) | both empty |
| v26 | 174 | `playerGardens` (identity/placement only — planted crops on a plot are separate `SavePlantedCrop` records) | none built |

Weather/seasons (plan 040) deliberately add **no** save field — `Season`/`WeatherState` are pure functions of `(seed, elapsedDays)`, both already persisted.

`QuestManager`'s `questId → animalId` binding is never persisted: on restore, an active `kill_target_animal`/`find_animal` quest re-derives its binding — livestock kinds (deterministic `animalId` per settlement/house seed) rebind via the normal resolver; wild-fauna kinds (unseeded per-session `animalId` counter) become `invalidated` instead of silently retargeting a different individual, because fauna/livestock HP/death/corpse state is not persisted at all (killed animals resurrect on reload).

Named save slots (plan 166): the `saves` store holds `{ name, data: SaveData }` keyed by `slot_*` ids, not a single `'current'` — up to 8 named games, active id in localStorage. A leftover raw `SaveData` under `'current'` migrates on first list/read.

`localStorage` is split by domain (`src/config/persistConfig.ts`): graphics / player / world device preferences, separate from `SaveData` itself; audio mix is its own localStorage key, not a `WorldConfig` field. Graphics/audio stay per-device; seed and world state come from the chosen save slot.

Map discovery cells have their own, separately-versioned sub-schema inside `SaveData.map` (currently schema v11) — bumped independently of the top-level `SaveData` version above.

## Rebuild / lifetime invariants

1. `WorldBundle` itself is stable across rebuilds; its fields are replaced in place.
2. A system whose world dependency is replaced must either be recreated or explicitly rebound to the new dependency.
3. Long-lived closures should read the current bundle field instead of capturing a replaceable field value.
4. World-owned resources must be disposed before replacement.
5. Module-level caches whose keys are not seed-scoped must be cleared when switching worlds.
6. New-world reset decisions belong to the caller; low-level rebuild helpers should not silently reset unrelated player/world state.

## Adding a new system

Before adding a subsystem, answer:

1. Is there an existing system whose state/behaviour this extends?
2. Which existing system owns its lifetime?
3. Does it need to survive a `WorldBundle` rebuild?
4. If a replaceable world dependency changes, will this system be recreated or explicitly rebound?
5. What existing environment/simulation API should it consume instead of duplicating logic?
6. Does it need persistence? If yes, what is the compatibility story for old saves?
7. Does it belong to simulation, world generation, interaction, or presentation?
8. Is its state representable independently of the client/renderer, so a future server-authoritative split wouldn't require a rewrite?

Prefer extending an existing coupling over introducing a parallel subsystem that solves the same problem.

## Common architectural pitfalls

- Capturing `bundle.chunkManager` or another replaceable bundle field in a long-lived closure and then rebuilding the bundle.
- Assuming every `ChunkManager` consumer must be recreated when an explicit rebinding API is the established lifecycle for that system.
- Treating terrain load radius as the simulation radius for NPCs/fauna or as the settlement streaming radius.
- Duplicating terrain sampling or procedural rules in another system.
- Putting gameplay state only in UI components.
- Forgetting disposal when replacing world-owned Three.js resources.
- Assuming current `SaveData` represents complete NPC/world simulation persistence.
- Reintroducing module-level seed-sensitive caches without clearing/scoping them.
