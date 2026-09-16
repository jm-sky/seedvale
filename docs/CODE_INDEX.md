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
- [DevTools API](../src/debug/npcDebugApi.ts) — `window.seedvale.debug` (`?debug`), including `horse.list` / `teleportToPlayer` / `resurrect`.

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
- [Player visual preset](../src/player/playerVisualPreset.ts) — UBC Peasant/Ranger from body armor, `?player=` override, optional `?playerTint=brown`.
- [Player equipment visual](../src/player/playerEquipmentVisual.ts) — presentation mapping from equipped item kind to a skinned UBC accessory (V1: `arms` pauldrons).
- [World water eligibility](../src/player/worldWaterEligibility.ts) — whether surface-world water may own player vertical motion in the current space.
- [Slope movement constraint](../src/terrain/slopeConstraint.ts) — shared uphill speed falloff/block used by `PlayerController`, `NpcAgent` and `AnimalAgent`.
- [PlayerNeeds](../src/player/PlayerNeeds.ts) — stamina / vigor / hunger / thirst pools.
- [PlayerSkills](../src/player/PlayerSkills.ts) — the eight skills, their XP curve and the single award path.
- [Character presentation](../src/player/characterPresentation.ts) — Character Screen snapshot (base/effective SPEA, skills, condition views); Vue only renders it.
- [Skill evaluation](../src/player/skillEvaluation.ts) — primary + optional support/context competence, independent of world targeting.
- [Targeted skill selection](../src/player/targetedSkillSelection.ts) — runtime-only selected targeted skill.
- [Targeted skill actions](../src/interaction/targetedSkillAction.ts) — query/execute seam over existing `Interactable`s; consumers are trap inspect and camp Repair.
- [Interaction view](../src/interaction/interactionView.ts) — derived primary/alternate/inspect presentation slots for gaze prompt and touch chrome (plan ui-input-015); action `consequenceTone` for foreign-property warnings (plan items-player-042).
- [Foreign property use](../src/items/foreignProperty.ts) — action-level merchant-horse foreign-use preview and per-ride removal-threshold evaluation (plan items-player-042). Does not own fauna ownership.
- [Trade grievance](../src/items/tradeGrievance.ts) — temporary merchant purchase markup (`unauthorized_property_use`), persisted as `SaveData.tradeGrievances`.
- [Gaze target ranking](../src/interaction/findInteractionTarget.ts) — `pickInGaze` / `rankInGaze` with tie-breaks and hysteresis (plan ui-input-015).
- [Inventory](../src/items/Inventory.ts) — item ownership (player *and* NPC), stacks, instances and food batches.
- [HeldTool](../src/items/HeldTool.ts) — the single right-hand tool slot.
- [Player combat mode](../src/player/playerCombatMode.ts) — runtime drawn-primary state for HUD/keyboard sheathe-toggle (plan ui-input-018); does not own `HeldTool` or combat damage.
- [Item catalog](../src/items/itemCatalog.ts) — the per-`ItemKind` gameplay flags (melee, ranged, consumable, `capabilities`, …) and the capability queries built on them (`hasItemCapability`, `CAPABILITY_KINDS`, `HOLDABLE_KINDS`).
- [Treasure gameplay](../src/items/treasureGameplay.ts) — deterministic systemic loot, force-entry resolution and trap consequences (plan items-player-026); lock identity stays in `treasureSites.ts`.
- [Authored world pickups](../src/items/authoredWorldPickups.ts) — one-shot extra pickup list for `WorldBundle` (`consumedWorldPickupIds` gate, plan quests-progression-036).

## World simulation

- [Condition](../src/world/condition.ts) — shared `0..100` lazy condition math (clamp, delta, resolver, checkpoint) used by camp utilities and structure components.
- [Repair](../src/world/repair.ts) — shared actor-neutral `RepairProgress` work math for world-owned repair episodes.
- [Sleeping utilities](../src/world/sleepingUtilities.ts) — bedroll/platform domain condition, placement, and tent-shelter factor.
- [Player well](../src/world/playerWell.ts) — player-built well construction, completed-roof condition/protection, and roof repair quotes/episodes.
- [Residential buildings](../src/world/residentialBuilding.ts) — player-built house construction, ownership, and completed home identity; runtime collection in `createResidentialBuildings.ts`.
- [World carts](../src/world/createCarts.ts) — movable draft-cart identity and one-way animal→cart hitch (plan fauna-007). Hitch pose in [cart.ts](../src/world/cart.ts).
- [Transport orders](../src/world/transportOrder.ts) — world-owned physical goods transport commitment (plan settlements-npcs-018); registry in [createTransportOrders.ts](../src/world/createTransportOrders.ts). Active/non-terminal orders persist (`SaveData.transportOrders`) and carry across a `WorldBundle` rebuild; carrier cargo persists separately on `NpcAuthoritativeState.transportCargo` (plan settlements-npcs-019, `src/world/transportOffscreen.ts` for off-screen progression, `src/world/transportTravelArrival.ts` for transport-purpose generic-travel arrivals). Endpoints: household, settlement-storage, and resource-site (`NaturalResource.id`, plan settlements-npcs-021). Inter-settlement food uses settlement-storage as both source and destination (plan settlements-npcs-037).
- [Expedition assignments](../src/world/expeditionAssignment.ts) — world-owned 3-NPC expedition party + settlement-storage provisioning (plan settlements-npcs-027); registry in [createExpeditionAssignments.ts](../src/world/createExpeditionAssignments.ts). `WorldBundle.dispatchReadyExpedition` (plan settlements-npcs-028, [npcExpeditionTravel.ts](../src/ai/npcExpeditionTravel.ts)) starts per-member generic travel from `ready`. Persists as sparse `SaveData.expeditionAssignments`; personal inventories stay on `npcStates`.
- [Resource-site inventories](../src/world/resourceSiteInventory.ts) — world-owned extracted goods waiting at a remote resource site (plan settlements-npcs-021). Keyed by mineable deposit id (`NaturalResource.id` or landmark-owned mine slot), independent of streamed presentation and of `SaveData.resourceDeposits` depletion. Sparse-optional persist (`SaveData.resourceSiteInventories`); survives a `WorldBundle` rebuild.
- [Weather](../src/world/weather.ts) — deterministic season/weather, rain/storm exposure, and climate cache.
- [Lightning events](../src/world/lightningEvents.ts) — deterministic storm lightning/thunder schedule and one-shot presentation runtime.
- [Weather audio](../src/audio/weatherSounds.ts) — rain/storm loops and distance-banded thunder one-shots.
- [Cemetery assignment](../src/terrain/cemeteryAssignment.ts) — settlement↔cemetery topology (dedicated or shared `SM`) and reverse lookup; abandoned cemeteries have no served settlements.
- [Cemetery placement](../src/terrain/cemeteryPlacement.ts) — bounded dedicated/shared/abandoned cemetery search over the shared physical gates in `chunkEnvironment.ts`.
- [Classic landmarks](../src/terrain/chunkEnvironment.ts) — shared `resolveClassicLandmarkPlacement` for `monolith`/`stoneCircle`/`smallRuins`; streamed generation and unloaded `findLandmarkNear` consume the same resolver.
- [Unloaded landmark lookup](../src/terrain/unloadedLandmarkLookup.ts) — ring scan + lightweight unloaded resolvers shared by `findLandmarkNear` and worker world-knowledge jobs.
- [World-knowledge scan](../src/terrain/worldKnowledgeScan.ts) — bounded worker-safe nearest/nearby landmark ring scan reused by the `worldKnowledge` job on [chunkWorkerPool](../src/terrain/chunkWorkerPool.ts) (plan quests-progression-047).
- [Treasure sites](../src/world/treasureSites.ts) — deterministic finite world treasure (ruins/deep-forest chests + matching keys); cave archetype deferred.
- [Caves](../src/world/createCaves.ts) — Cave V2 lifecycle: production topology, retained heightfield, streamed presentation, spatial queries, read-only adventure content anchors, dungeon chamber view (`dungeonChambersOf`, world-terrain-024), cave-scoped semantic/traversal (`resolveHabitat`/`queryGroundIn`/`resolveHorizontalIn`, fauna-019), abandoned-mine landmark (`abandonedMine`, world-terrain-017), and interior placement candidates (`interiorPlacementView`, world-018).
- [Cave interior placement](../src/world/caves/caveInteriorPlacement.ts) — standable chamber/widening candidates with heightfield floor Y for landmark-owned resource content (plan world-018).
- [Resource deposits](../src/terrain/resourceDeposits.ts) — streamed mineable piles and shared `mine()`/`queryNearest` (player + NPC); cave-aware XYZ + spatial-context filtering (plan world-018).
- [Mineable deposit definition](../src/terrain/mineableDeposit.ts) — canonical mining definition between surface `NaturalResource` / landmark content and `ResourceDeposits`.
- [Abandoned-mine gold](../src/terrain/abandonedMineDeposits.ts) — world-resource-owned deterministic gold slots for the abandoned mountain mine.
- [Cave habitat](../src/world/caves/caveHabitat.ts) — resolves one cave's interior home chamber + entrance route (`CaveTraversalDescriptor`) from its `CaveTopology`/heightfield; consumed only through `Caves.resolveHabitat` above.
- [Cave content anchors](../src/world/caves/caveContentAnchors.ts) — semantic interior placement descriptors for adventure caves (world-terrain-020 Stage B); floor Y from the cave's own heightfield.
- [Dungeon chambers](../src/world/caves/dungeonChambers.ts) — representation-neutral dungeon chamber list/classification from stable topology node ids (world-terrain-024); consumed through `Caves.dungeonChambersOf`.

## UI wiring

- [Inventory / trade wiring](../src/app/inventoryWiring.ts) — inventory-screen handlers plus every home-trader buy/sell path.
- [Vue UI mount](../src/ui-vue/mount.ts) — the `VueUi` facade the app layer talks to.
- [World inspection screen](../src/ui-vue/screens/WorldInspectionScreen.vue) — construction/details overlay opened by `[V]` / the mobile inspect button.
- [Quest log screen](../src/ui-vue/screens/QuestLogScreen.vue) — overlay for `QuestManager.list()` (compact list + heard-note details); presentation buckets in [questLogBuckets](../src/ui-vue/lib/questLogBuckets.ts).
- [Vanilla UI facades](../src/ui/) — `create*` modules; most are now thin wrappers over Vue screens.

## Reputation / progression

- [QuestManager](../src/quests/QuestManager.ts) — quest progress, objective evaluation and player↔NPC relations keyed by stable `NpcId`. Architecture recon: [2026-09-13 quest system](./reviews/2026-09-13--quest-system-architecture-recon.md).
- [Authored quests](../src/quests/quests.ts) — name-keyed authored definitions; composition root materializes them to `QuestNpcRef`.
- [Settlement quest opportunities](../src/quests/opportunities/settlementQuestOpportunities.ts) — world-driven and RPG matrix candidates selected at composition root into normal `QuestDef`s.
- [Suspicious transport cave cache](../src/quests/suspiciousTransportCaveCache.ts) — natural-cave cache variant of the existing `suspicious-transport` RPG matrix (plan quests-progression-024).
- [Lost Treasure Chronicles elder](../src/quests/lostTreasureChroniclesElder.ts) — nearby authored elder binding and the winter/dispute contextual quests (plan quests-progression-037).
- [Lost Treasure Chronicles chronicle search](../src/quests/lostTreasureChronicleSearch.ts) — archaeologist, encoded chronicle, cemetery/ruins investigation (plan quests-progression-038).
- [Lost Treasure Chronicles deciphering](../src/quests/lostTreasureChronicleDeciphering.ts) — specialist, pay-or-favour deciphering, bounded estate search area (plan quests-progression-039).
- [Deferred world knowledge](../src/world/locations/worldKnowledgeResearch.ts) — world-owned worker-backed research service; quest adapter in [worldKnowledgeResolver.ts](../src/quests/worldKnowledgeResolver.ts) + [location phrase](../src/quests/landmarkLocationDescription.ts); home-guard pilot in [guardLocalKnowledge.ts](../src/world/locations/guardLocalKnowledge.ts) (plan quests-progression-047).
- [NPC identity](../src/settlement/npcIdentity.ts) — deterministic `${settlementId}:npc:${i}` descriptors from `SettlementDef`.
- [Profession staffing](../src/settlement/professionStaffing.ts) — generation-time adult profession composition from settlement identity; does not change family structure.
- [Profession family surnames](../src/settlement/professionFamilySurnames.ts) — post-staffing worldgen household surnames from a representative adult profession; authored residents and reserved home identities keep their own names.
- [Merchant trade](../src/settlement/merchantTrade.ts) — Trader specialization, stall index and finite regional assortment (plan settlements-012); optional `horses` specialization after a settlement-level paddock setup (plan settlements-013); home starter overlay including a guaranteed `poor` `leather_pauldron` (plan settlements-npcs-042).
- [NPC vendor identity](../src/ai/npcVendor.ts) — semantic vendor kind from `Role` (`trader`/`blacksmith`/`hunter`); independent of live trade offers (plan settlements-npcs-042).
- [Household profession stock](../src/settlement/householdProfessionStock.ts) — one-time specialist trade grants scaled by settlement size/terrain (plans settlements-npcs-040 / 042).
- [Settlement armor quality](../src/settlement/settlementArmorQuality.ts) — size-primary armor quality weights shared by Merchant and specialist bootstrap.
- [Horse acquisition](../src/settlement/horseAcquisition.ts) — derived live-horse purchase view for the wagon horse and vendor paddock slots.
- [Village paddock](../src/settlement/villagePaddock.ts) — settlement-level horse-vendor setup roll and fenced `VillagePlan.paddock` placement.
- [Settlement character](../src/settlement/settlementCharacter.ts) — deterministic `default`/`closed` archetype on `VillageIdentity`; consumers read it, none own it.
- [Settlement definition cache](../src/settlement/settlementPlanCache.ts) — shared runtime `SettlementDef` memo for `SettlementsManager` and `RoadNetwork`.
- [Settlement definition worldgen cache](../src/settlement/settlementWorldgenCache.ts) — disposable IndexedDB hydrate/upsert for that same `defCache` (plan settlements-014); never `SaveData`.
- [ReputationManager](../src/reputation/ReputationManager.ts) — per-settlement reputation dimensions and renown; callers apply an already-resolved `SocialConsequence`.
- [Social exposure](../src/reputation/socialExposure.ts) — pure day/night + Sneak exposure roll used when a cemetery grave first resolves.
- [Animal-deed reputation](../src/reputation/animalDeeds.ts) — pure dangerous-animal-kill social-news signal resolver (plan quests-progression-019, refactored by quests-progression-022): species baseline × fauna-owned `dangerSignificance`, suppressed when `QuestManager.hasSocialOutcomeClaim` says a quest already owns the kill's social outcome; also hosts the canonical `reputationFactor`/`renownFactor` distance-attenuation functions.
- [Social-news ledger](../src/reputation/SocialNewsLedger.ts) — lazy social-news propagation & reputation catch-up (plan quests-progression-022): owns pending events + settlement knowledge carriers, resolves idempotent per-settlement/batch catch-up into already-resolved `SocialConsequence`s without scanning the settlement grid.

## Persistence

- [Save state](../src/app/saveState.ts) — assembles the live runtime state into `SaveData` and owns when it is written.
- [Save schema](../src/persistence/saveData.ts) — the `SaveData` shape, validation/defaulting and version migrations.
- [Save storage](../src/persistence/saveDb.ts) — IndexedDB slots and the active-save id.
- [Worldgen cache](../src/persistence/worldgenCacheDb.ts) — disposable `(seed, namespace, version, fingerprint)` store; settlement defs use [settlementWorldgenCache](../src/settlement/settlementWorldgenCache.ts).
- [Config persistence](../src/config/persistConfig.ts) — the localStorage graphics / player / world domains (device preferences, not save data).

## Economy

- [Production recipes](../src/economy/production.ts) — `ProductionDef` tables, role lookup, hunter item-recipe priority wrapper, and textile wool-material recipe.
- [Production executor](../src/economy/productionExecutor.ts) — synchronous all-or-nothing stock/item/mixed recipe commit (plan settlements-npcs-015).
- [Production shortage](../src/economy/productionShortage.ts) — compact blocked-input observations on settlement economy (plan settlements-npcs-017).
- [Food transport demand](../src/economy/foodTransportDemand.ts) — derived uncovered settlement food shortage, uncommitted household surplus, and uncommitted settlement-storage surplus from live economy + active `TransportOrder`s (plans settlements-npcs-020 / 037). Not persisted.
- [Inter-settlement food transport](../src/economy/interSettlementFoodTransport.ts) — bounded deterministic matching of known materialized settlements for food-only A→B `TransportOrder`s (plan settlements-npcs-037). Not persisted.
- [Ore transport demand](../src/economy/oreTransportDemand.ts) — derived uncovered blacksmith iron/coal stock shortage and uncommitted resource-site ore from live economy + active `TransportOrder`s (plan settlements-npcs-021). Not persisted. Delivered ore is credited from `SettlementEconomy.items` into bulk stock.
- [NPC work adapters](../src/economy/npcWork.ts) — work-completion → economy mutation seam.
- [Settlement economy](../src/economy/settlementEconomy.ts) — settlement bulk stock, concrete food inventory, demand, history, and production-shortage state.

## NPC AI internals

`NpcAgent.ts` is the coordination core (FSM, action pipeline, `choose()` sequencing) and stays the entry point for NPC behaviour; the modules below own the domain logic it delegates to (`docs/reviews/2026-09-03--NpcAgent-refactor-review.md`).

- [NpcAgent](../src/ai/NpcAgent.ts) — per-NPC FSM/action pipeline, `choose()` decision sequencing, movement execution, combat entry seams, public API.
- [NPC appearance](../src/ai/npcAppearance.ts) — profession → UBC outfit/tint resolver (`resolveNpcAppearance`) plus `npcId`-seeded hair/beard/hue variants; Modular pool lives here too.
- [NPC action types](../src/ai/npcAction.ts) — `Phase`/`ActionId`/`NpcPlannedAction`, re-exported from `NpcAgent.ts`.
- [Approach player](../src/ai/approachPlayer.ts) — locality/arrival helpers for a nearby-player interaction intent (work-contract payment is the first consumer).
- [NPC accompany commitment](../src/ai/npcAccompanyCommitment.ts) — source-neutral persistent follow/stay commitment and lifecycle helpers (plan npc-029).
- [NPC accompany execution](../src/ai/npcAccompanyExecution.ts) — hysteresis follow/stay movement over the accompany commitment.
- [NPC travel continuity](../src/ai/npcTravel.ts) — generic detailed↔off-screen spatial + survival/arrival checkpoint (019 duration math, 028 expedition dispatch, 037 transport `orderId` purpose).
- [NPC expedition travel](../src/ai/npcExpeditionTravel.ts) — idempotent `ready` assignment → per-member `NpcAuthoritativeState.travel` (plan settlements-npcs-028); destination resolve stays in [expedition.ts](../src/world/expedition.ts).
- [NPC logistics](../src/ai/npcLogistics.ts) — the claim→carry→deposit two-leg transfer builder and the economy-withdraw/household-exchange/player-storage-delivery flows built on it.
- [NPC profession work](../src/ai/npcProfessionWork.ts) — profession `work`-block planners (miner/hunter/farmer/fisher/guard/trader/blacksmith/shepherd/textile_worker) as pure functions.
- [NPC strategies](../src/ai/npcStrategies.ts) — per-need candidate strategy lists + `selectStrategy()`, the authoritative source `beginNeed()` switches on.
- [NPC decision](../src/ai/npcDecision.ts) — the top-level `choose()`/`tickCriticalInterrupt()` priority tables, fauna-style.
- [Burial pressure](../src/ai/burialPressure.ts) — household/social burial of a deceased NPC (`npc-011`).
- [Economic pressure](../src/ai/economicPressure.ts) — persistent production-input shortage → diagnostic `NpcPressure` (plan settlements-npcs-017); not a decision-target winner.
- [Grave-visit pressure](../src/ai/graveVisitPressure.ts) — optional family grave visits (`npc-026`).
- [Animal-corpse cleanup pressure](../src/ai/animalCorpseCleanupPressure.ts) — settlement sanitation of animal corpses (`settlements-npcs-029`).
- [NPC collider rim](../src/ai/npcColliderRim.ts) — pure collider geometry (walkability, segment bypass, rim points, exterior sampling) shared by movement/rescue.
- [NPC post-death](../src/settlement/npcPostDeath.ts) — authoritative corpse lifecycle, full-`personalInventory` loot handoff/snapshot (no role/loadout filtering, plan npc-036), burial claim handoff.
- [Animal-corpse sanitation](../src/settlement/animalCorpseSanitation.ts) — settlement influence + nearest-household responsibility for animal corpses.
- [Agent animation set](../src/shared/agentAnimationSet.ts) — clip resolve/crossfade/one-shot/settle owner over an `AnimationMixer`.
- [Agent status label](../src/ui/agentStatusLabel.ts) — the shared floating name/quest-marker/vendor-marker/bars/debug-line CSS2D label and its controller.

## Fauna internals

`AnimalAgent.ts` is the per-animal integration point and stays the entry point for runtime behaviour; the modules below own the domain data/logic it delegates to (`docs/reviews/2026-09-03--AnimalAgent-refactor-review.md`).

- [AnimalAgent](../src/fauna/AnimalAgent.ts) — per-animal decision dispatch, movement, combat, riding, needs pursuit, production, persistence, public API.
- [Animal scare](../src/fauna/animalScare.ts) — generic bounded scare stimulus and stable per-animal probability (thunder is the first source).
- [Animal update cadence](../src/fauna/animalUpdateCadence.ts) — shared stateless importance/cadence policy for the one `AnimalAgent.update()` (wild fauna and livestock alike): which sections stay full-rate and how often behaviour/presentation may run.
- [Species defs](../src/fauna/animalDefs.ts) — taxonomy, `ANIMAL_DEFS`, diets and labels.
- [Wild fauna runtime](../src/fauna/createFauna.ts) — spawn/lifecycle for wild animals and the `FAUNA_URLS` GLB registry.
- [Habitat pressure](../src/fauna/habitatPressure.ts) — derived, lazy habitat condition snapshot (population/mortality/predators/food) owned by `Fauna.getHabitatPressure` (plan fauna-031).
- [Individual variants](../src/fauna/animalVariants.ts) — per-animal multipliers (`normal`/`alpha`) and wolf-den alpha slot assignment.
- [Lead / draft helpers](../src/fauna/animalLead.ts) — leadable/draft capability queries and temporary-lead hysteresis distances.
- [Livestock stray](../src/fauna/animalStray.ts) — durable stray/displacement episode, selection, survival-assist gates, corpse retention, and world lookup classification (plan fauna-024); natural (non-quest) classification grace helpers (plan fauna-025).
- [Follow hysteresis](../src/shared/followHysteresis.ts) — shared distance-band follow primitive used by owned Follow, leading, and NPC accompany.
- [Owned animal control](../src/fauna/ownedAnimalControl.ts) — persisted Follow/Stay for player-owned livestock.
- [Corpse lifecycle](../src/fauna/animalCorpse.ts) — corpse/remains/decay/rabies-exposure/food-claim/sanitation-reservation state machine.
- [Foraging](../src/fauna/animalForaging.ts) — source selection, validation and atomic hunger/thirst relief.
- [Horse training](../src/fauna/horseTraining.ts) — per-horse progress, derived ordinary/trained/warhorse labels, and mount modifiers (plan settlements-013).
- [Fenced area bound](../src/fauna/animalAreaBound.ts) — data-driven roam/need leash and entrance-gap exit for fenced footprints.
- [Roaming](../src/fauna/animalRoaming.ts) — water/settlement/home-return trip state machine and shared radial probe.
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

- `../src/debug/createCaveHeightfieldTestScene.ts` — debug factory; open first when tracing creation and setup of domain objects.

### economy

- `../src/economy/settlementEconomy.ts` — economy domain entry; open first for the main economy data and API surface.

### fauna

- `../src/fauna/AnimalAgent.ts` — primary fauna agent; open first for runtime behaviour and agent state.

### input

- `../src/input/createTouchControls.ts` — input factory; open first when tracing creation and setup of domain objects.

### interaction

- `../src/interaction/Interactable.ts` — Interactable; open first for the primary interaction domain logic.

### items

- `../src/items/Inventory.ts` — items domain entry; open first for the main items data and API surface.

### perf

- `../src/perf/agentCpuDiag.ts` — agentCpuDiag; open first for the primary perf domain logic.

### persistence

- `../src/persistence/saveData.ts` — persistence domain entry; open first for the main persistence data and API surface.

### player

- `../src/player/PlayerController.ts` — primary player controller; open first for coordination and control flow.

### quests

- `../src/quests/QuestManager.ts` — primary quests manager; open first for domain coordination and state management.

### render

- `../src/render/createPostProcessing.ts` — render factory; open first when tracing creation and setup of domain objects.

### reputation

- `../src/reputation/ReputationManager.ts` — primary reputation manager; open first for domain coordination and state management.

### scene

- `../src/scene/createCamera.ts` — scene factory; open first when tracing creation and setup of domain objects.

### settlement

- `../src/settlement/settlementGenerator.ts` — primary settlement generator; open first for domain generation logic.

<!-- AI_NAVIGATION_INDEX_END -->

