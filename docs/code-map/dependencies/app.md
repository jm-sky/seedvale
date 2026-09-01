# Dependencies

Generated from TypeScript imports.

## `app/actions/actionContext.ts`

**Imports**

- `ai/reactionChance.ts`
- `app/busyAction.ts`
- `app/restCampSequence.ts`
- `app/worldBundle.ts`
- `audio/createWorldAudio.ts`
- `input/Keyboard.ts`
- `input/MouseLook.ts`
- `items/HeldTool.ts`
- `items/Inventory.ts`
- `items/items.ts`
- `player/PlayerController.ts`
- `player/PlayerTorch.ts`
- `ui/createHud.ts`
- `ui/createToast.ts`
- `world/dayNight.ts`
- `world/timeSkip.ts`
- `world/treeLifecycle.ts`

**Imported by**

- `app/actions/containerActions.ts`
- `app/actions/gatheringActions.ts`
- `app/actions/groundActions.ts`
- `app/actions/mountActions.ts`
- `app/actions/placementActions.ts`
- `app/actions/placementPreviewActions.ts`
- `app/actions/restActions.ts`
- `app/actions/survivalActions.ts`
- `app/actions/terrainPreparationActions.ts`
- `app/createApp.ts`

## `app/actions/containerActions.ts`

**Imports**

- `app/actions/actionContext.ts`
- `app/actions/placementActions.ts`
- `input/MouseLook.ts`
- `items/Inventory.ts`
- `items/container.ts`
- `items/inventoryView.ts`
- `items/tentPlacement.ts`
- `ui-vue/mount.ts`

**Imported by**

- `app/actions/placementPreviewActions.ts`
- `app/createApp.ts`

## `app/actions/gatheringActions.ts`

**Imports**

- `app/actions/actionContext.ts`
- `audio/inventorySounds.ts`
- `fauna/AnimalAgent.ts`
- `items/Inventory.ts`
- `items/foodFreshness.ts`
- `items/items.ts`
- `items/trapItemInstances.ts`
- `player/PlayerSkills.ts`
- `shared/HealthState.ts`
- `world/animalTraps.ts`
- `world/beehives.ts`
- `world/createPlacedTraps.ts`
- `world/cropLifecycle.ts`
- `world/dryingRacks.ts`
- `world/fishing.ts`
- `world/playerGarden.ts`

**Imported by**

- `app/createApp.ts`

## `app/actions/groundActions.ts`

**Imports**

- `app/actions/actionContext.ts`
- `app/interactables.ts`
- `audio/actionSounds.ts`
- `audio/inventorySounds.ts`
- `badges/badges.ts`
- `debug/locationQueries.ts`
- `items/Inventory.ts`
- `items/itemCatalog.ts`
- `items/items.ts`
- `items/trade.ts`
- `player/PlayerNeeds.ts`
- `settlement/hiddenTreasure.ts`
- `terrain/depositMining.ts`
- `terrain/dig.ts`
- `terrain/digAction.ts`
- `world/hiddenFinds.ts`
- `world/parseSeed.ts`
- `world/treeHarvest.ts`
- `world/treeLifecycle.ts`

**Imported by**

- `app/createApp.ts`

## `app/actions/mountActions.ts`

**Imports**

- `app/actions/actionContext.ts`
- `fauna/AnimalAgent.ts`
- `player/PlayerNeeds.ts`
- `player/PlayerSkills.ts`
- `player/playerDamage.ts`
- `player/ridingStability.ts`
- `shared/StaminaState.ts`
- `terrain/slopeConstraint.ts`

**Imported by**

- `app/createApp.ts`
- `app/gameLoop.ts`

## `app/actions/placementActions.ts`

**Imports**

- `app/actions/actionContext.ts`
- `items/constructionMaterials.ts`
- `items/itemCatalog.ts`
- `items/itemInstances.ts`
- `items/items.ts`
- `items/liquidContainer.ts`
- `items/tentPlacement.ts`
- `items/tentProp.ts`
- `items/trade.ts`
- `player/PlayerNeeds.ts`
- `player/PlayerSkills.ts`
- `world/animalTraps.ts`
- `world/cropLifecycle.ts`
- `world/palisade.ts`
- `world/plantedCrops.ts`
- `world/plantedTrees.ts`
- `world/playerGarden.ts`
- `world/playerWell.ts`
- `world/standingTorch.ts`

**Imported by**

- `app/actions/containerActions.ts`
- `app/actions/placementPreviewActions.ts`
- `app/actions/terrainPreparationActions.ts`
- `app/createApp.ts`
- `app/userActions.ts`

## `app/actions/placementPreviewActions.ts`

**Imports**

- `app/actions/actionContext.ts`
- `app/actions/containerActions.ts`
- `app/actions/placementActions.ts`
- `world/placementPreview.ts`

**Imported by**

- `app/createApp.ts`
- `ui-vue/store.ts`
- `ui/createQuickActions.ts`

## `app/actions/restActions.ts`

**Imports**

- `app/actions/actionContext.ts`
- `app/campRest.ts`
- `items/Inventory.ts`
- `items/items.ts`
- `items/tentProp.ts`
- `player/PlayerNeeds.ts`
- `player/PlayerSkills.ts`
- `settlement/createSettlement.ts`
- `settlement/lodging.ts`
- `settlement/lodgingResolver.ts`
- `shared/VigorState.ts`
- `ui/createBusyOverlay.ts`
- `ui/createQuickActions.ts`
- `ui/createTimeSkipOverlay.ts`

**Imported by**

- `app/createApp.ts`

## `app/actions/survivalActions.ts`

**Imports**

- `app/actions/actionContext.ts`
- `audio/actionSounds.ts`
- `audio/animalSounds.ts`
- `audio/inventorySounds.ts`
- `fauna/AnimalAgent.ts`
- `fauna/AnimalSpawner.ts`
- `fauna/animalHarvest.ts`
- `fauna/animalMeat.ts`
- `fauna/createFauna.ts`
- `items/Inventory.ts`
- `items/campfireCooking.ts`
- `items/foodFreshness.ts`
- `items/itemCatalog.ts`
- `items/itemInstances.ts`
- `items/items.ts`
- `items/liquidContainer.ts`
- `player/PlayerNeeds.ts`
- `player/PlayerSkills.ts`
- `settlement/VillageFire.ts`
- `shared/HealthState.ts`
- `world/WaterSource.ts`

**Imported by**

- `app/createApp.ts`
- `app/gameLoop.ts`

## `app/actions/terrainPreparationActions.ts`

**Imports**

- `app/actions/actionContext.ts`
- `app/actions/placementActions.ts`
- `items/tentPlacement.ts`
- `player/PlayerNeeds.ts`
- `player/PlayerSkills.ts`
- `terrain/dig.ts`
- `terrain/terrainPreparation.ts`
- `ui/createTimeSkipOverlay.ts`
- `world/terrainPreparationPreview.ts`

**Imported by**

- `app/createApp.ts`

## `app/appRenderLoop.ts`

**Imports**

- `debug/createCameraDebugOverlay.ts`
- `debug/debugMode.ts`
- `debug/renderStateDebug.ts`
- `render/createPostProcessing.ts`
- `render/rendererResize.ts`

**Imported by**

- `app/createApp.ts`

## `app/busyAction.test.ts`

**Imports**

- `app/busyAction.ts`

## `app/busyAction.ts`

**Imported by**

- `app/actions/actionContext.ts`
- `app/busyAction.test.ts`
- `app/createApp.ts`
- `app/gameLoop.ts`

## `app/busyChannelDurations.test.ts`

**Imports**

- `fauna/AnimalAgent.ts`
- `items/campfireCooking.ts`
- `items/tentPlacement.ts`
- `settlement/VillageFire.ts`
- `terrain/dig.ts`
- `world/palisade.ts`
- `world/playerGarden.ts`
- `world/playerWell.ts`
- `world/treeHarvest.ts`

## `app/campRest.test.ts`

**Imports**

- `app/campRest.ts`
- `player/PlayerSkills.ts`

## `app/campRest.ts`

**Imported by**

- `app/actions/restActions.ts`
- `app/campRest.test.ts`

## `app/createApp.ts`

**Imports**

- `ai/reactionChance.ts`
- `app/actions/actionContext.ts`
- `app/actions/containerActions.ts`
- `app/actions/gatheringActions.ts`
- `app/actions/groundActions.ts`
- `app/actions/mountActions.ts`
- `app/actions/placementActions.ts`
- `app/actions/placementPreviewActions.ts`
- `app/actions/restActions.ts`
- `app/actions/survivalActions.ts`
- `app/actions/terrainPreparationActions.ts`
- `app/appRenderLoop.ts`
- `app/busyAction.ts`
- `app/gameLoop.ts`
- `app/graphicsSettings.ts`
- `app/inventoryWiring.ts`
- `app/renderStack.ts`
- `app/restCampSequence.ts`
- `app/saveState.ts`
- `app/userActions.ts`
- `app/worldBundle.ts`
- `audio/createAmbientAudio.ts`
- `audio/createWorldAudio.ts`
- `audio/doorSounds.ts`
- `audio/fireSounds.ts`
- `audio/playerMoveSounds.ts`
- `audio/weatherSounds.ts`
- `badges/badges.ts`
- `config/persistConfig.ts`
- `config/worldConfig.ts`
- `debug/createModelTestScene.ts`
- `debug/debugMode.ts`
- `debug/npcDebugApi.ts`
- `debug/npcInspectTrigger.ts`
- `fauna/AnimalAgent.ts`
- `input/Keyboard.ts`
- `input/MouseLook.ts`
- `input/createTouchControls.ts`
- `input/isTouchDevice.ts`
- `items/HeldTool.ts`
- `items/Inventory.ts`
- `items/container.ts`
- `items/guardSword.ts`
- `items/inventoryView.ts`
- `items/itemCatalog.ts`
- `items/itemInstances.ts`
- `items/items.ts`
- `items/liquidContainer.ts`
- `items/primaryWeapons.ts`
- `items/trade.ts`
- `items/weaponMaintenance.ts`
- `perf/index.ts`
- `persistence/saveData.ts`
- `persistence/saveDb.ts`
- `player/PlayerController.ts`
- `player/PlayerNeeds.ts`
- `player/PlayerSkills.ts`
- `player/PlayerTorch.ts`
- `quests/QuestManager.ts`
- `quests/quests.ts`
- `render/programPrewarm.ts`
- `settlement/createSettlement.ts`
- `settlement/landOwnership.ts`
- `settlement/villagePlanDebug.ts`
- `shared/StaminaState.ts`
- `shared/VigorState.ts`
- `shared/bootMark.ts`
- `terrain/chunkGrid.ts`
- `terrain/chunkManager.ts`
- `terrain/chunkWorkerPool.ts`
- `terrain/depositMining.ts`
- `terrain/footstepSurface.ts`
- `ui-vue/mount.ts`
- `ui-vue/store.ts`
- `ui/createBusyOverlay.ts`
- `ui/createDebugGui.ts`
- `ui/createHud.ts`
- `ui/createInventoryScreen.ts`
- `ui/createLoadingScreen.ts`
- `ui/createMinimap.ts`
- `ui/createNpcDialog.ts`
- `ui/createNpcInspector.ts`
- `ui/createPauseMenu.ts`
- `ui/createQuestLog.ts`
- `ui/createQuickActions.ts`
- `ui/createTimeSkipOverlay.ts`
- `ui/createToast.ts`
- `world/animalTraps.ts`
- `world/beehives.ts`
- `world/clouds.ts`
- `world/createPlacedTraps.ts`
- `world/dayNight.ts`
- `world/dryingRacks.ts`
- `world/fishing.ts`
- `world/map/mapData.ts`
- `world/map/mapDiscovery.ts`
- `world/map/mapProjection.ts`
- `world/palisade.ts`
- `world/parseSeed.ts`
- `world/plantedCrops.ts`
- `world/plantedTrees.ts`
- `world/playerWell.ts`
- `world/timeSkip.ts`
- `world/treeLifecycle.ts`
- `world/weather.ts`
- `world/weatherParticles.ts`
- `world/worldContext.ts`

**Imported by**

- `main.ts`

## `app/dialogueTimeControl.ts`

**Imports**

- `ai/NpcAgent.ts`
- `app/npcEngagement.ts`
- `player/PlayerController.ts`
- `ui-vue/store.ts`

**Imported by**

- `main.ts`

## `app/gameLoop.ts`

**Imports**

- `ai/NpcAgent.ts`
- `app/actions/mountActions.ts`
- `app/actions/survivalActions.ts`
- `app/busyAction.ts`
- `app/interactables.ts`
- `app/modalState.ts`
- `app/restCampSequence.ts`
- `app/worldBundle.ts`
- `audio/actionSounds.ts`
- `audio/animalSounds.ts`
- `audio/createAmbientAudio.ts`
- `audio/createWorldAudio.ts`
- `audio/doorSounds.ts`
- `audio/fireSounds.ts`
- `audio/inventorySounds.ts`
- `audio/weatherSounds.ts`
- `combat/criticalHit.ts`
- `combat/defenseResolver.ts`
- `combat/projectile.ts`
- `combat/rangedAttack.ts`
- `combat/rangedReticle.ts`
- `debug/colliderDebugView.ts`
- `debug/debugMode.ts`
- `debug/npcInspectTrigger.ts`
- `debug/renderStateDebug.ts`
- `fauna/AnimalAgent.ts`
- `fauna/AnimalSpawner.ts`
- `fauna/faunaCombat.ts`
- `fauna/predatorHumanDecision.ts`
- `input/Keyboard.ts`
- `input/MouseLook.ts`
- `input/createTouchControls.ts`
- `interaction/Interactable.ts`
- `interaction/findInteractionTarget.ts`
- `interaction/resolveInteraction.ts`
- `interaction/treeInspection.ts`
- `items/HeldTool.ts`
- `items/Inventory.ts`
- `items/itemCatalog.ts`
- `items/itemInstances.ts`
- `items/items.ts`
- `items/trade.ts`
- `items/weaponMaintenance.ts`
- `perf/index.ts`
- `player/PlayerController.ts`
- `player/PlayerNeeds.ts`
- `player/PlayerSkills.ts`
- `player/PlayerTorch.ts`
- `player/playerCombat.ts`
- `player/playerDamage.ts`
- `player/playerMelee.ts`
- `player/playerRanged.ts`
- `quests/QuestManager.ts`
- `render/createPostProcessing.ts`
- `render/shadowBudget.ts`
- `settlement/VillageFire.ts`
- `settlement/families.ts`
- `settlement/landOwnership.ts`
- `settlement/landPurchase.ts`
- `shared/HungerState.ts`
- `shared/StaminaState.ts`
- `shared/ThirstState.ts`
- `shared/VigorState.ts`
- `ui-vue/mount.ts`
- `ui/createBusyOverlay.ts`
- `ui/createHud.ts`
- `ui/createInventoryScreen.ts`
- `ui/createMinimap.ts`
- `ui/createNpcDialog.ts`
- `ui/createNpcInspector.ts`
- `ui/createPauseMenu.ts`
- `ui/createQuestLog.ts`
- `ui/createQuickActions.ts`
- `ui/createTimeSkipOverlay.ts`
- `ui/createToast.ts`
- `world/WaterSource.ts`
- `world/clouds.ts`
- `world/createLights.ts`
- `world/createSky.ts`
- `world/cropLifecycle.ts`
- `world/dayNight.ts`
- `world/foliageWind.ts`
- `world/map/mapDiscovery.ts`
- `world/timeSkip.ts`
- `world/weather.ts`
- `world/weatherParticles.ts`
- `world/weatherVisuals.ts`

**Imported by**

- `app/createApp.ts`

## `app/graphicsSettings.ts`

**Imports**

- `app/worldBundle.ts`
- `config/persistConfig.ts`
- `config/qualityProfiles.ts`
- `config/worldConfig.ts`
- `render/createPostProcessing.ts`
- `world/createLights.ts`
- `world/createSky.ts`
- `world/dayNight.ts`

**Imported by**

- `app/createApp.ts`

## `app/interactables.test.ts`

**Imports**

- `app/interactables.ts`

## `app/interactables.ts`

**Imports**

- `fauna/AnimalAgent.ts`
- `fauna/AnimalSpawner.ts`
- `fauna/createFauna.ts`
- `fauna/faunaCombat.ts`
- `interaction/Interactable.ts`
- `items/HeldTool.ts`
- `items/Inventory.ts`
- `items/createDroppedItems.ts`
- `items/createItemSpawners.ts`
- `items/createPlacedTents.ts`
- `items/itemCatalog.ts`
- `items/items.ts`
- `player/playerMelee.ts`
- `settlement/PlacedFires.ts`
- `settlement/createSettlement.ts`
- `settlement/landOwnership.ts`
- `terrain/chunkEnvironment.ts`
- `terrain/chunkManager.ts`
- `terrain/depositMining.ts`
- `terrain/dig.ts`
- `terrain/resourceDeposits.ts`
- `terrain/waterBodies.ts`
- `world/WaterSource.ts`
- `world/animalTraps.ts`
- `world/beehives.ts`
- `world/createBeehives.ts`
- `world/createDryingRacks.ts`
- `world/createPalisades.ts`
- `world/createPlacedContainers.ts`
- `world/createPlacedTraps.ts`
- `world/createPlayerGardens.ts`
- `world/createPlayerWells.ts`
- `world/createStandingTorches.ts`
- `world/createTerrainPreparations.ts`
- `world/cropLifecycle.ts`
- `world/dryingRacks.ts`
- `world/playerGarden.ts`
- `world/playerWell.ts`
- `world/treeLifecycle.ts`

**Imported by**

- `app/actions/groundActions.ts`
- `app/gameLoop.ts`
- `app/interactables.test.ts`
- `player/playerCombat.test.ts`
- `player/playerCombat.ts`
- `player/playerMelee.test.ts`

## `app/inventoryWiring.ts`

**Imports**

- `ai/NpcAgent.ts`
- `ai/dialogueTemplates.ts`
- `app/worldBundle.ts`
- `audio/createWorldAudio.ts`
- `audio/inventorySounds.ts`
- `items/HeldTool.ts`
- `items/Inventory.ts`
- `items/guardSword.ts`
- `items/inventoryView.ts`
- `items/itemInstances.ts`
- `items/items.ts`
- `items/primaryWeapons.ts`
- `items/trade.ts`
- `items/weaponMaintenance.ts`
- `player/PlayerController.ts`
- `player/PlayerTorch.ts`
- `quests/QuestManager.ts`
- `ui-vue/mount.ts`
- `ui/createHud.ts`
- `ui/createToast.ts`

**Imported by**

- `app/createApp.ts`

## `app/modalState.ts`

**Imports**

- `ui-vue/mount.ts`
- `ui/createInventoryScreen.ts`
- `ui/createNpcDialog.ts`
- `ui/createPauseMenu.ts`
- `ui/createQuestLog.ts`
- `ui/createQuickActions.ts`
- `world/timeSkip.ts`

**Imported by**

- `app/gameLoop.ts`

## `app/npcEngagement.test.ts`

**Imports**

- `app/npcEngagement.ts`

## `app/npcEngagement.ts`

**Imported by**

- `app/dialogueTimeControl.ts`
- `app/npcEngagement.test.ts`

## `app/renderStack.ts`

**Imports**

- `config/worldConfig.ts`
- `debug/debugMode.ts`
- `perf/index.ts`
- `perf/programCensus.ts`
- `render/createPostProcessing.ts`
- `render/createRenderer.ts`
- `scene/createCamera.ts`
- `scene/createScene.ts`
- `world/createLights.ts`
- `world/createSky.ts`
- `world/pointLightBudget.ts`
- `world/waterMirror.ts`

**Imported by**

- `app/createApp.ts`

## `app/restCampSequence.ts`

**Imports**

- `items/campBlanketProp.ts`
- `player/PlayerController.ts`

**Imported by**

- `app/actions/actionContext.ts`
- `app/createApp.ts`
- `app/gameLoop.ts`

## `app/saveState.ts`

**Imports**

- `app/worldBundle.ts`
- `badges/badges.ts`
- `config/worldConfig.ts`
- `fauna/AnimalSpawner.ts`
- `input/MouseLook.ts`
- `items/HeldTool.ts`
- `items/Inventory.ts`
- `persistence/saveData.ts`
- `persistence/saveDb.ts`
- `persistence/saveSlots.ts`
- `player/PlayerController.ts`
- `player/PlayerTorch.ts`
- `quests/QuestManager.ts`
- `settlement/landOwnership.ts`
- `terrain/chunkManager.ts`
- `terrain/depositMining.ts`
- `ui-vue/mount.ts`
- `world/cropLifecycle.ts`
- `world/dayNight.ts`
- `world/fishing.ts`
- `world/map/mapDiscovery.ts`
- `world/plantedTrees.ts`
- `world/treeLifecycle.ts`

**Imported by**

- `app/createApp.ts`

## `app/userActions.ts`

**Imports**

- `app/actions/placementActions.ts`
- `app/worldBundle.ts`
- `input/MouseLook.ts`
- `items/HeldTool.ts`
- `items/Inventory.ts`
- `items/tentPlacement.ts`
- `player/PlayerController.ts`
- `player/PlayerTorch.ts`
- `ui/createHud.ts`

**Imported by**

- `app/createApp.ts`
- `ui-vue/playerQuickActions.ts`
- `ui-vue/store.ts`
- `ui/createPauseMenu.ts`
- `ui/createQuickActions.ts`

## `app/worldBundle.ts`

**Imports**

- `ai/reactionChance.ts`
- `audio/createWorldAudio.ts`
- `config/worldConfig.ts`
- `economy/settlementEconomy.ts`
- `fauna/AnimalSpawner.ts`
- `fauna/createFauna.ts`
- `fauna/huntingHooks.ts`
- `items/createDroppedItems.ts`
- `items/createItemSpawners.ts`
- `items/createPlacedTents.ts`
- `items/heldToolVisual.ts`
- `items/itemModels.ts`
- `settlement/PlacedFires.ts`
- `settlement/SettlementsManager.ts`
- `settlement/createSettlement.ts`
- `settlement/families.ts`
- `settlement/household.ts`
- `settlement/npcState.ts`
- `settlement/roadNetwork.ts`
- `settlement/settlementGenerator.ts`
- `shared/bootMark.ts`
- `terrain/chunkGrid.ts`
- `terrain/chunkManager.ts`
- `terrain/depositMining.ts`
- `terrain/resourceDeposits.ts`
- `terrain/terrainPreparation.ts`
- `world/animalTraps.ts`
- `world/beehives.ts`
- `world/createBeehives.ts`
- `world/createDryingRacks.ts`
- `world/createLargeCaves.ts`
- `world/createOcean.ts`
- `world/createPalisades.ts`
- `world/createPlacedContainers.ts`
- `world/createPlacedTraps.ts`
- `world/createPlayerGardens.ts`
- `world/createPlayerWells.ts`
- `world/createStandingTorches.ts`
- `world/createTerrainPreparations.ts`
- `world/cropLifecycle.ts`
- `world/dayNight.ts`
- `world/dryingRacks.ts`
- `world/foodSources.ts`
- `world/helperDeliveryHooks.ts`
- `world/palisade.ts`
- `world/plantedTrees.ts`
- `world/playerGarden.ts`
- `world/playerWell.ts`
- `world/pointLightBudget.ts`
- `world/settlementForestHooks.ts`
- `world/standingTorch.ts`
- `world/treeLifecycle.ts`
- `world/waterMirror.ts`
- `world/worldContext.ts`

**Imported by**

- `app/actions/actionContext.ts`
- `app/createApp.ts`
- `app/gameLoop.ts`
- `app/graphicsSettings.ts`
- `app/inventoryWiring.ts`
- `app/saveState.ts`
- `app/userActions.ts`
- `debug/faunaInspector.ts`
- `debug/npcDebugApi.test.ts`
- `debug/npcDebugApi.ts`
- `debug/npcInspector.ts`
- `ui/createNpcInspector.ts`
