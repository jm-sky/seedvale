# Seedvale Architecture

**Purpose:** describe the architecture that exists in the code today. This is an architectural map, not a product roadmap.

**Last verified:** 2026-08-15

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
├── ChunkManager
├── WorldOcean
├── SettlementsManager
├── Fauna
├── ItemSpawners
├── ResourceDeposits
├── DroppedItems
├── PlacedFires
├── PlacedTents
└── LargeCaves
```

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
    │       └── World items / fires / tents / large caves
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

`Inventory` is owned by the application/player-facing layer. World-side item state such as dropped items, item spawners, placed fires and placed tents lives in `WorldBundle`. Interaction code connects player actions to those systems rather than moving all item state into the player controller.

## Simulation vs presentation

The game loop is the runtime coordination point for simulation updates and interaction state. Rendering/UI/audio are presentation layers around the simulation; avoid putting persistent gameplay rules solely in UI components.

Modal UI can gate parts of simulation/input. Changes to modal behaviour should therefore be checked against the game loop and all relevant UI entry points, not only the component being changed.

## Multiplayer readiness (not implemented)

Seedvale is single-player today; there is no multiplayer, netcode or WebSocket layer, and none is planned in the near term. That said, keep architectural decisions from foreclosing a later move to a small (~2–5 player) shared world with server-authoritative simulation. The simulation/presentation split this document already assumes — world state that is representable and evaluable independent of Three.js objects — is the same shape that split would need. Do not design networking now; just avoid coupling world/NPC/economy state so tightly to the client or to rendering objects that such a split becomes a rewrite.

## Persistence

Persistence is orchestrated from `createApp.ts`, but ownership is split by responsibility:

- `createApp.ts` decides when to save and assembles the current runtime state into `SaveData`.
- `src/persistence/saveData.ts` owns the `SaveData` schema, validation/defaulting and migrations.
- `src/persistence/saveDb.ts` owns the IndexedDB storage operations.

The canonical save schema version and the full field list are documented in [docs/STATE.md](./STATE.md) ("Persistence") — do not restate the field list here, it drifts. NPC runtime state is not fully persisted; a `Continue` is therefore not equivalent to serializing the complete living world.

When changing `SaveData`, preserve compatibility with older saves and use the existing migration/defaulting patterns in the config and persistence code.

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
