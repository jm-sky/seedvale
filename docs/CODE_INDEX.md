# Seedvale — Code Index

**Purpose:** a lookup table from "system" to "the file to open first". It answers *where does this live?*, not *what is implemented?* (that's [STATE.md](./STATE.md)) or *how do the layers fit together?* (that's [ARCHITECTURE.md](./architecture/ARCHITECTURE.md)).

**Scope:** this is the **first, minimal version**, seeded from the `src/app/` composition-root split. It is not a full repository map yet — sections are added as areas get touched. An area missing here is not a claim that it doesn't exist.

**Rules for extending it:**

- Link a concrete entry-point file, not a whole directory, whenever one exists.
- One short sentence per entry, describing the file's *role* — not its implementation details, which go stale.
- Don't restate `STATE.md` / `ARCHITECTURE.md` content.
- Keep the flat "section → bullet list" shape so it stays easy to grow.

## Application composition

- [createApp](../src/app/createApp.ts) — composition root: creates the long-lived systems, threads dependencies and configures the app lifecycle.
- [WorldBundle](../src/app/worldBundle.ts) — the world systems rebuilt together; the lifetime/rebuild boundary.
- [Game loop](../src/app/gameLoop.ts) — one frame of simulation + render, and the interaction state around it.
- [App render loop](../src/app/appRenderLoop.ts) — `requestAnimationFrame` scheduling, viewport/DPR resize and WebGL context loss/restore around the game loop.

## Rendering / presentation

- [Render stack](../src/app/renderStack.ts) — construction of renderer, CSS2D label layer, scene, camera, post-processing, lights, sky and the PointLight budget.
- [Graphics settings](../src/app/graphicsSettings.ts) — the live graphics + quality-preset handlers shared by the debug GUI, the Vue world-config screen and the benchmark runner.
- [Post-processing](../src/render/createPostProcessing.ts) — the EffectComposer pass chain and its per-pass toggles.
- [PointLight budget](../src/world/pointLightBudget.ts) — scene-level pad/cull that keeps `NUM_POINT_LIGHTS` stable across program variants.

## Player actions

Each module below takes the shared [`PlayerActionContext`](../src/app/actions/actionContext.ts) and owns one family of player interactions. `gameLoop.ts` and the Quick Actions menu are their callers; none of them owns world state.

- [Action context](../src/app/actions/actionContext.ts) — the shared dependency bundle plus the "another activity is already running" guards.
- [Ground actions](../src/app/actions/groundActions.ts) — shovel/pickaxe dig and level, multi-stage tree chop, ore-deposit mining.
- [Placement actions](../src/app/actions/placementActions.ts) — putting a tent/trap/well down in front of the player, and advancing a player-built well's stage.
- [Container actions](../src/app/actions/containerActions.ts) — placing, carrying and opening a chest, plus the transfer screen wiring.
- [Survival actions](../src/app/actions/survivalActions.ts) — corpse butchering/burial, campfire ignite/cook, water drinking/filling, eating.
- [Gathering actions](../src/app/actions/gatheringActions.ts) — trap arm/disarm/collect, fishing, drying racks, hives, wild-crop harvest.
- [Rest actions](../src/app/actions/restActions.ts) — waiting, camp/town/tent rest and the resulting rest quality.
- [Camp rest quality](../src/app/campRest.ts) — the pure blanket/tent/fire → quality mapping the rest actions consume.
- [Busy channel](../src/app/busyAction.ts) — the short real-time action channel every timed interaction above runs on.
- [User actions](../src/app/userActions.ts) — fire building and torch lighting, shared by Quick Actions and the pause menu.
- [Interactables](../src/app/interactables.ts) — builds the per-frame `[E]`/`[R]` candidate list the game loop resolves against.

## Player

- [PlayerController](../src/player/PlayerController.ts) — player movement, animation and runtime state.
- [Slope movement constraint](../src/terrain/slopeConstraint.ts) — shared uphill speed falloff/block used by `PlayerController`, `NpcAgent` and `AnimalAgent`.
- [PlayerNeeds](../src/player/PlayerNeeds.ts) — stamina / vigor / hunger / thirst pools.
- [PlayerSkills](../src/player/PlayerSkills.ts) — the five skills, their XP curve and the single award path.
- [Inventory](../src/items/Inventory.ts) — item ownership (player *and* NPC), stacks, instances and food batches.
- [HeldTool](../src/items/HeldTool.ts) — the single right-hand tool slot.
- [Item catalog](../src/items/itemCatalog.ts) — the per-`ItemKind` gameplay flags (melee, ranged, consumable, `capabilities`, …) and the capability queries built on them (`hasItemCapability`, `CAPABILITY_KINDS`, `HOLDABLE_KINDS`).

## UI wiring

- [Inventory / trade wiring](../src/app/inventoryWiring.ts) — inventory-screen handlers plus every home-trader buy/sell path.
- [Vue UI mount](../src/ui-vue/mount.ts) — the `VueUi` facade the app layer talks to.
- [Vanilla UI facades](../src/ui/) — `create*` modules; most are now thin wrappers over Vue screens.

## Persistence

- [Save state](../src/app/saveState.ts) — assembles the live runtime state into `SaveData` and owns when it is written.
- [Save schema](../src/persistence/saveData.ts) — the `SaveData` shape, validation/defaulting and version migrations.
- [Save storage](../src/persistence/saveDb.ts) — IndexedDB slots and the active-save id.
- [Config persistence](../src/config/persistConfig.ts) — the localStorage graphics / player / world domains (device preferences, not save data).

<!-- AI_NAVIGATION_INDEX_START -->

### ai

- `../src/ai/NpcAgent.ts` — primary ai agent; open first for runtime behaviour and agent state.

### app

- `../src/app/createApp.ts` — app factory; open first when tracing creation and setup of domain objects.

### assets

- `../src/assets/loadGltf.ts` — loadGltf; open first for the primary assets domain logic.

### audio

- `../src/audio/createWorldAudio.ts` — audio factory; open first when tracing creation and setup of domain objects.

### combat

- `../src/combat/defenseResolver.ts` — primary combat resolver; open first for domain resolution logic.

### config

- `../src/config/worldConfig.ts` — config domain entry; open first for the main config data and API surface.

### debug

- `../src/debug/createHouseTestScene.ts` — debug factory; open first when tracing creation and setup of domain objects.

### economy

- `../src/economy/settlementEconomy.ts` — economy domain entry; open first for the main economy data and API surface.

### fauna

- `../src/fauna/AnimalAgent.ts` — primary fauna agent; open first for runtime behaviour and agent state.

### input

- `../src/input/createTouchControls.ts` — input factory; open first when tracing creation and setup of domain objects.

### items

- `../src/items/Inventory.ts` — items domain entry; open first for the main items data and API surface.

### persistence

- `../src/persistence/saveData.ts` — persistence domain entry; open first for the main persistence data and API surface.

### player

- `../src/player/PlayerController.ts` — primary player controller; open first for coordination and control flow.

### quests

- `../src/quests/QuestManager.ts` — primary quests manager; open first for domain coordination and state management.

### render

- `../src/render/createPostProcessing.ts` — render factory; open first when tracing creation and setup of domain objects.

### scene

- `../src/scene/createCamera.ts` — scene factory; open first when tracing creation and setup of domain objects.

### settlement

- `../src/settlement/settlementGenerator.ts` — primary settlement generator; open first for domain generation logic.

### shared

- `../src/shared/StaminaState.ts` — StaminaState; open first for the primary shared domain logic.

### simulation

- `../src/simulation/actionLifecycle.ts` — primary simulation lifecycle; open first for entity lifecycle behaviour.

### terrain

- `../src/terrain/chunkManager.ts` — primary terrain manager; open first for domain coordination and state management.

<!-- AI_NAVIGATION_INDEX_END -->

