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

## Debug / isolated scenes

- [Cave heightfield spike](../src/debug/createCaveHeightfieldTestScene.ts) — `?caveHeightfieldTest` Walk/Inspect harness comparing a 2.5D heightfield representation to production SDF on the same `CaveTopology`.
- [Model test](../src/debug/createModelTestScene.ts) — `?modelTest` renderer/camera/one-model preview, bypassing world bootstrap.
- [Debug flags](../src/debug/debugMode.ts) — URL-driven debug switches including the isolated-scene flags above.

## Rendering / presentation

- [Render stack](../src/app/renderStack.ts) — construction of renderer, CSS2D label layer, scene, camera, post-processing, lights, sky and the PointLight budget.
- [Graphics settings](../src/app/graphicsSettings.ts) — the live graphics + quality-preset handlers shared by the debug GUI, the Vue world-config screen and the benchmark runner.
- [Post-processing](../src/render/createPostProcessing.ts) — the EffectComposer pass chain and its per-pass toggles.
- [PointLight budget](../src/world/pointLightBudget.ts) — scene-level pad/cull that keeps `NUM_POINT_LIGHTS` stable across program variants.

## Player actions

Each module below takes the shared [`PlayerActionContext`](../src/app/actions/actionContext.ts) and owns one family of player interactions. `gameLoop.ts` and the Quick Actions menu are their callers; none of them owns world state.

- [Action context](../src/app/actions/actionContext.ts) — the shared dependency bundle plus the "another activity is already running" guards.
- [Ground actions](../src/app/actions/groundActions.ts) — shovel/pickaxe dig and level, multi-stage tree chop, ore-deposit mining.
- [Placement actions](../src/app/actions/placementActions.ts) — putting a tent/trap/well/garden/standing torch/palisade segment/residential house down in front of the player, advancing construction, igniting a standing torch, and removing unfinished buildables (with material recovery).
- [Placement preview](../src/app/actions/placementPreviewActions.ts) — shared aim/ghost/confirm/cancel/rotation lifecycle for built objects; domain modules still own validity and mutation.
- [Placement preview ghost](../src/world/placementPreview.ts) — circle/box footprint renderer for the shared placement preview.
- [Container actions](../src/app/actions/containerActions.ts) — placing, carrying and opening a chest, plus the transfer screen wiring.
- [Work contract actions](../src/app/actions/workContractActions.ts) — creating a construction work contract, posting it at a settlement notice board, and cancelling one. `beginHireHelpForTarget` is the shared live-target entry used by Quick Actions and world inspection.
- [World inspection](../src/app/inspection/buildWorldInspection.ts) — read-model resolver for the `[V]` / inspect screen; Vue only renders the snapshot. Actions live in [inspectionActions](../src/app/actions/inspectionActions.ts).
- [Work contract payment](../src/app/actions/workContractPayment.ts) — atomic player-coin → NPC `personalInventory` wage transfer for a payable assignment claim.
- [Terrain preparation](../src/terrain/terrainPreparation.ts) — metre-sized `Przygotuj teren` domain rules, bounded sizes `2…9`, and compact completed-area facts.
- [Site infrastructure query](../src/world/siteInfrastructure.ts) — read-only bounded lookup of completed preparations, usable Player wells and live Player gardens.
- [Cultivation anchor](../src/world/cultivationAnchor.ts) — shared position+radius contract for settlement gardens and Player-built gardens.
- [Survival actions](../src/app/actions/survivalActions.ts) — corpse butchering/burial, campfire ignite/cook, water drinking/filling, eating.
- [Gathering actions](../src/app/actions/gatheringActions.ts) — trap arm/disarm/collect, fishing, drying racks, hives, wild-crop harvest.
- [Rest actions](../src/app/actions/restActions.ts) — waiting, camp/town/tent rest, camp inspection, and tent/bedroll/platform repair bouts.
- [Mount actions](../src/app/actions/mountActions.ts) — riding attach/detach and per-frame mount drive.
- [Lead actions](../src/app/actions/leadActions.ts) — temporary player→animal lead and cart hitch/unhitch, keyed by `animalId`.
- [Camp repair](../src/items/campRepair.ts) — tent/bedroll/platform repair quotes and start/apply helpers over shared `RepairProgress`.
- [Camp rest quality](../src/app/campRest.ts) — the pure blanket/tent/fire → quality mapping the rest actions consume.
- [Busy channel](../src/app/busyAction.ts) — the short real-time action channel every timed interaction above runs on.
- [User actions](../src/app/userActions.ts) — fire building and torch lighting, shared by Quick Actions and the pause menu.
- [Interactables](../src/app/interactables.ts) — builds the per-frame `[E]`/`[R]` candidate list the game loop resolves against.

## Player

- [PlayerController](../src/player/PlayerController.ts) — player movement, animation and runtime state.
- [World water eligibility](../src/player/worldWaterEligibility.ts) — whether surface-world water may own player vertical motion in the current space.
- [Slope movement constraint](../src/terrain/slopeConstraint.ts) — shared uphill speed falloff/block used by `PlayerController`, `NpcAgent` and `AnimalAgent`.
- [PlayerNeeds](../src/player/PlayerNeeds.ts) — stamina / vigor / hunger / thirst pools.
- [PlayerSkills](../src/player/PlayerSkills.ts) — the eight skills, their XP curve and the single award path.
- [Character presentation](../src/player/characterPresentation.ts) — Character Screen snapshot (base/effective SPEA, skills, condition views); Vue only renders it.
- [Skill evaluation](../src/player/skillEvaluation.ts) — primary + optional support/context competence, independent of world targeting.
- [Targeted skill selection](../src/player/targetedSkillSelection.ts) — runtime-only selected targeted skill.
- [Targeted skill actions](../src/interaction/targetedSkillAction.ts) — query/execute seam over existing `Interactable`s; consumers are trap inspect and camp Repair.
- [Interaction view](../src/interaction/interactionView.ts) — derived primary/alternate/inspect presentation slots for gaze prompt and touch chrome (plan ui-input-015).
- [Gaze target ranking](../src/interaction/findInteractionTarget.ts) — `pickInGaze` / `rankInGaze` with tie-breaks and hysteresis (plan ui-input-015).
- [Inventory](../src/items/Inventory.ts) — item ownership (player *and* NPC), stacks, instances and food batches.
- [HeldTool](../src/items/HeldTool.ts) — the single right-hand tool slot.
- [Item catalog](../src/items/itemCatalog.ts) — the per-`ItemKind` gameplay flags (melee, ranged, consumable, `capabilities`, …) and the capability queries built on them (`hasItemCapability`, `CAPABILITY_KINDS`, `HOLDABLE_KINDS`).
- [Treasure gameplay](../src/items/treasureGameplay.ts) — deterministic systemic loot, force-entry resolution and trap consequences (plan items-player-026); lock identity stays in `treasureSites.ts`.

## World simulation

- [Condition](../src/world/condition.ts) — shared `0..100` lazy condition math (clamp, delta, resolver, checkpoint) used by camp utilities and structure components.
- [Repair](../src/world/repair.ts) — shared actor-neutral `RepairProgress` work math for world-owned repair episodes.
- [Sleeping utilities](../src/world/sleepingUtilities.ts) — bedroll/platform domain condition, placement, and tent-shelter factor.
- [Player well](../src/world/playerWell.ts) — player-built well construction, completed-roof condition/protection, and roof repair quotes/episodes.
- [Residential buildings](../src/world/residentialBuilding.ts) — player-built house construction, ownership, and completed home identity; runtime collection in `createResidentialBuildings.ts`.
- [World carts](../src/world/createCarts.ts) — movable draft-cart identity and one-way animal→cart hitch (plan fauna-007). Hitch pose in [cart.ts](../src/world/cart.ts).
- [Transport orders](../src/world/transportOrder.ts) — world-owned physical goods transport commitment (plan settlements-npcs-018); registry in [createTransportOrders.ts](../src/world/createTransportOrders.ts). Active/non-terminal orders persist (`SaveData.transportOrders`) and carry across a `WorldBundle` rebuild; carrier cargo persists separately on `NpcAuthoritativeState.transportCargo` (plan settlements-npcs-019, `src/world/transportOffscreen.ts` for off-screen progression).
- [Weather](../src/world/weather.ts) — deterministic season/weather, rain/storm exposure, and climate cache.
- [Lightning events](../src/world/lightningEvents.ts) — deterministic storm lightning/thunder schedule and one-shot presentation runtime.
- [Cemetery assignment](../src/terrain/cemeteryAssignment.ts) — settlement↔cemetery topology (dedicated or shared `SM`) and reverse lookup; abandoned cemeteries have no served settlements.
- [Cemetery placement](../src/terrain/cemeteryPlacement.ts) — bounded dedicated/shared/abandoned cemetery search over the shared physical gates in `chunkEnvironment.ts`.
- [Treasure sites](../src/world/treasureSites.ts) — deterministic finite world treasure (ruins/deep-forest chests + matching keys); cave archetype deferred.
- [Caves](../src/world/createCaves.ts) — Cave V2 lifecycle: production topology, retained heightfield, streamed presentation, spatial queries, read-only adventure content anchors, and (plan fauna-019) a cave-scoped semantic/traversal contract (`resolveHabitat`/`queryGroundIn`/`resolveHorizontalIn`) for fauna/quests/NPC.
- [Cave habitat](../src/world/caves/caveHabitat.ts) — resolves one cave's interior home chamber + entrance route (`CaveTraversalDescriptor`) from its `CaveTopology`/heightfield; consumed only through `Caves.resolveHabitat` above.
- [Cave content anchors](../src/world/caves/caveContentAnchors.ts) — semantic interior placement descriptors for adventure caves (world-terrain-020 Stage B); floor Y from the cave's own heightfield.

## UI wiring

- [Inventory / trade wiring](../src/app/inventoryWiring.ts) — inventory-screen handlers plus every home-trader buy/sell path.
- [Vue UI mount](../src/ui-vue/mount.ts) — the `VueUi` facade the app layer talks to.
- [World inspection screen](../src/ui-vue/screens/WorldInspectionScreen.vue) — construction/details overlay opened by `[V]` / the mobile inspect button.
- [Vanilla UI facades](../src/ui/) — `create*` modules; most are now thin wrappers over Vue screens.

## Reputation / progression

- [QuestManager](../src/quests/QuestManager.ts) — quest progress, objective evaluation and player↔NPC relations keyed by stable `NpcId`.
- [Authored quests](../src/quests/quests.ts) — name-keyed authored definitions; composition root materializes them to `QuestNpcRef`.
- [Settlement quest opportunities](../src/quests/opportunities/settlementQuestOpportunities.ts) — world-driven and RPG matrix candidates selected at composition root into normal `QuestDef`s.
- [NPC identity](../src/settlement/npcIdentity.ts) — deterministic `${settlementId}:npc:${i}` descriptors from `SettlementDef`.
- [Profession staffing](../src/settlement/professionStaffing.ts) — generation-time adult profession composition from settlement identity; does not change family structure.
- [ReputationManager](../src/reputation/ReputationManager.ts) — per-settlement reputation dimensions and renown; callers apply an already-resolved `SocialConsequence`.
- [Social exposure](../src/reputation/socialExposure.ts) — pure day/night + Sneak exposure roll used when a cemetery grave first resolves.

## Persistence

- [Save state](../src/app/saveState.ts) — assembles the live runtime state into `SaveData` and owns when it is written.
- [Save schema](../src/persistence/saveData.ts) — the `SaveData` shape, validation/defaulting and version migrations.
- [Save storage](../src/persistence/saveDb.ts) — IndexedDB slots and the active-save id.
- [Config persistence](../src/config/persistConfig.ts) — the localStorage graphics / player / world domains (device preferences, not save data).

## Economy

- [Production recipes](../src/economy/production.ts) — `ProductionDef` tables, role lookup, hunter item-recipe priority wrapper, and textile wool-material recipe.
- [Production executor](../src/economy/productionExecutor.ts) — synchronous all-or-nothing stock/item/mixed recipe commit (plan settlements-npcs-015).
- [NPC work adapters](../src/economy/npcWork.ts) — work-completion → economy mutation seam.
- [Settlement economy](../src/economy/settlementEconomy.ts) — settlement bulk stock, concrete food inventory, demand, and history.

## NPC AI internals

`NpcAgent.ts` is the coordination core (FSM, action pipeline, `choose()` sequencing) and stays the entry point for NPC behaviour; the modules below own the domain logic it delegates to (`docs/reviews/2026-09-03--NpcAgent-refactor-review.md`).

- [NpcAgent](../src/ai/NpcAgent.ts) — per-NPC FSM/action pipeline, `choose()` decision sequencing, movement execution, combat entry seams, public API.
- [NPC action types](../src/ai/npcAction.ts) — `Phase`/`ActionId`/`NpcPlannedAction`, re-exported from `NpcAgent.ts`.
- [Approach player](../src/ai/approachPlayer.ts) — locality/arrival helpers for a nearby-player interaction intent (work-contract payment is the first consumer).
- [NPC logistics](../src/ai/npcLogistics.ts) — the claim→carry→deposit two-leg transfer builder and the economy-withdraw/household-exchange/player-storage-delivery flows built on it.
- [NPC profession work](../src/ai/npcProfessionWork.ts) — profession `work`-block planners (miner/hunter/farmer/fisher/guard/trader/blacksmith/shepherd/textile_worker) as pure functions.
- [NPC strategies](../src/ai/npcStrategies.ts) — per-need candidate strategy lists + `selectStrategy()`, the authoritative source `beginNeed()` switches on.
- [NPC decision](../src/ai/npcDecision.ts) — the top-level `choose()`/`tickCriticalInterrupt()` priority tables, fauna-style.
- [Burial pressure](../src/ai/burialPressure.ts) — household/social burial of a deceased NPC (`npc-011`).
- [Grave-visit pressure](../src/ai/graveVisitPressure.ts) — optional family grave visits (`npc-026`).
- [Animal-corpse cleanup pressure](../src/ai/animalCorpseCleanupPressure.ts) — settlement sanitation of animal corpses (`settlements-npcs-029`).
- [NPC collider rim](../src/ai/npcColliderRim.ts) — pure collider geometry (walkability, segment bypass, rim points, exterior sampling) shared by movement/rescue.
- [NPC post-death](../src/settlement/npcPostDeath.ts) — authoritative corpse lifecycle, full-`personalInventory` loot handoff/snapshot (no role/loadout filtering, plan npc-036), burial claim handoff.
- [Animal-corpse sanitation](../src/settlement/animalCorpseSanitation.ts) — settlement influence + nearest-household responsibility for animal corpses.
- [Agent animation set](../src/shared/agentAnimationSet.ts) — clip resolve/crossfade/one-shot/settle owner over an `AnimationMixer`.
- [Agent status label](../src/ui/agentStatusLabel.ts) — the shared floating name/bars/debug-line CSS2D label and its controller.

## Fauna internals

`AnimalAgent.ts` is the per-animal integration point and stays the entry point for runtime behaviour; the modules below own the domain data/logic it delegates to (`docs/reviews/2026-09-03--AnimalAgent-refactor-review.md`).

- [AnimalAgent](../src/fauna/AnimalAgent.ts) — per-animal decision dispatch, movement, combat, riding, needs pursuit, production, persistence, public API.
- [Animal scare](../src/fauna/animalScare.ts) — generic bounded scare stimulus and stable per-animal probability (thunder is the first source).
- [Species defs](../src/fauna/animalDefs.ts) — taxonomy, `ANIMAL_DEFS`, diets and labels.
- [Individual variants](../src/fauna/animalVariants.ts) — per-animal multipliers (`normal`/`alpha`) and wolf-den alpha slot assignment.
- [Lead / draft helpers](../src/fauna/animalLead.ts) — leadable/draft capability queries and temporary-lead hysteresis distances.
- [Livestock stray](../src/fauna/animalStray.ts) — durable stray/displacement episode, selection, survival-assist gates, corpse retention, and world lookup classification (plan fauna-024).
- [Follow hysteresis](../src/fauna/followHysteresis.ts) — shared distance-band follow primitive used by owned Follow and leading.
- [Owned animal control](../src/fauna/ownedAnimalControl.ts) — persisted Follow/Stay for player-owned livestock.
- [Corpse lifecycle](../src/fauna/animalCorpse.ts) — corpse/remains/decay/rabies-exposure/food-claim/sanitation-reservation state machine.
- [Foraging](../src/fauna/animalForaging.ts) — source selection, validation and atomic hunger/thirst relief.
- [Roaming](../src/fauna/animalRoaming.ts) — water-trip state machine and shared radial probe.
- [Persistent occupants](../src/fauna/persistentOccupants.ts) — sparse stable habitat-occupant identity and tombstone registry.
- [Cave habitat binding](../src/fauna/animalCaveHabitat.ts) — `AnimalHabitatBinding`/`AnimalCaveContext` and the narrow world-cave contract fauna resolves against (plan fauna-019); the only fauna module that touches cave types.
- [Fauna decision](../src/fauna/faunaDecision.ts) — fixed-priority behaviour table.
- [Dog guard](../src/fauna/dogGuard.ts) — household-dog guard/bark/pest resolution.
- [Prey alert](../src/fauna/preyAlertPerception.ts) — extra-range threat-alert relevance.
- [Livestock production](../src/fauna/livestockProduction.ts) — absolute-day egg/milk/wool readiness math.
- [Shepherd flock](../src/fauna/shepherdFlock.ts) — owned-sheep lookup, flock size, and flock-threat query.

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

