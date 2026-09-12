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
- `items/equipment.ts`
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
- `app/actions/cookMealIntent.test.ts`
- `app/actions/cookMealIntent.ts`
- `app/actions/fullCampIntent.test.ts`
- `app/actions/fullCampIntent.ts`
- `app/actions/gatheringActions.ts`
- `app/actions/groundActions.test.ts`
- `app/actions/groundActions.ts`
- `app/actions/householdResourceTransferActions.test.ts`
- `app/actions/householdResourceTransferActions.ts`
- `app/actions/inspectionActions.ts`
- `app/actions/leadActions.ts`
- `app/actions/mountActions.ts`
- `app/actions/npcItemTransferActions.ts`
- `app/actions/placementActions.ts`
- `app/actions/placementPreviewActions.ts`
- `app/actions/restActions.ts`
- `app/actions/storageInfestationActions.ts`
- `app/actions/survivalActions.test.ts`
- `app/actions/survivalActions.ts`
- `app/actions/terrainPreparationActions.ts`
- `app/actions/workContractActions.ts`
- `app/createApp.ts`

## `app/actions/actionContracts.ts`

**Imports**

- `items/itemCatalog.ts`
- `items/items.ts`

**Imported by**

- `app/actions/cookMealIntent.ts`
- `app/actions/inspectionActions.ts`
- `app/actions/placementPreviewActions.ts`
- `app/actions/survivalActions.ts`
- `app/userActions.ts`
- `ui-vue/playerQuickActions.test.ts`
- `ui-vue/playerQuickActions.ts`
- `ui-vue/store.ts`
- `ui/createPauseMenu.ts`
- `ui/createQuickActions.ts`

## `app/actions/constructionWorkSession.test.ts`

**Imports**

- `app/actions/constructionWorkSession.ts`
- `app/busyAction.ts`
- `player/PlayerNeeds.ts`

## `app/actions/constructionWorkSession.ts`

**Imports**

- `app/busyAction.ts`
- `player/PlayerNeeds.ts`
- `shared/HungerState.ts`
- `shared/ThirstState.ts`

**Imported by**

- `app/actions/constructionWorkSession.test.ts`
- `app/actions/placementActions.ts`
- `app/actions/restActions.ts`

## `app/actions/containerActions.ts`

**Imports**

- `ai/NpcAgent.ts`
- `app/actions/actionContext.ts`
- `app/actions/placementActions.ts`
- `app/actions/placementYaw.ts`
- `input/MouseLook.ts`
- `items/Inventory.ts`
- `items/container.ts`
- `items/equipment.ts`
- `items/foodItems.ts`
- `items/inventoryView.ts`
- `items/itemCatalog.ts`
- `items/itemInstances.ts`
- `items/items.ts`
- `items/tentPlacement.ts`
- `items/treasureGameplay.ts`
- `player/PlayerNeeds.ts`
- `player/physicalWorkStrength.ts`
- `player/playerDamage.ts`
- `settlement/npcPostDeath.ts`
- `ui-vue/mount.ts`
- `world/containerProp.ts`
- `world/treasureSites.ts`

**Imported by**

- `app/actions/placementPreviewActions.ts`
- `app/createApp.ts`

## `app/actions/cookMealIntent.test.ts`

**Imports**

- `app/actions/actionContext.ts`
- `app/actions/cookMealIntent.ts`
- `app/busyAction.ts`
- `app/worldBundle.ts`
- `items/Inventory.ts`
- `player/PlayerController.ts`
- `player/PlayerNeeds.ts`
- `settlement/VillageFire.ts`
- `shared/HungerState.ts`
- `shared/StaminaState.ts`
- `shared/ThirstState.ts`
- `shared/VigorState.ts`
- `world/dayNight.ts`

## `app/actions/cookMealIntent.ts`

**Imports**

- `app/actions/actionContext.ts`
- `app/actions/actionContracts.ts`
- `app/actions/placementPreviewActions.ts`
- `app/actions/survivalActions.ts`
- `app/busyAction.ts`
- `app/worldBundle.ts`
- `items/Inventory.ts`
- `items/campfireCooking.ts`
- `items/cookingFireResolver.ts`
- `items/items.ts`
- `items/sensibleFood.ts`
- `player/PlayerController.ts`
- `world/dayNight.ts`

**Imported by**

- `app/actions/cookMealIntent.test.ts`
- `app/createApp.ts`

## `app/actions/fullCampIntent.test.ts`

**Imports**

- `app/actions/actionContext.ts`
- `app/actions/fullCampIntent.ts`
- `app/actions/placementPreviewActions.ts`
- `app/busyAction.ts`
- `app/worldBundle.ts`
- `items/Inventory.ts`
- `items/itemInstances.ts`
- `player/PlayerController.ts`
- `settlement/VillageFire.ts`
- `world/dayNight.ts`

## `app/actions/fullCampIntent.ts`

**Imports**

- `app/actions/actionContext.ts`
- `app/actions/placementPreviewActions.ts`
- `app/actions/survivalActions.ts`
- `app/busyAction.ts`
- `app/campRestSnapshot.ts`
- `app/userActions.ts`
- `app/worldBundle.ts`
- `items/Inventory.ts`
- `items/constructionMaterials.ts`
- `player/PlayerController.ts`
- `world/dayNight.ts`
- `world/sleepingUtilities.ts`

**Imported by**

- `app/actions/fullCampIntent.test.ts`
- `app/createApp.ts`

## `app/actions/gatheringActions.ts`

**Imports**

- `app/actions/actionContext.ts`
- `audio/actionSounds.ts`
- `audio/inventorySounds.ts`
- `fauna/AnimalAgent.ts`
- `items/Inventory.ts`
- `items/foodFreshness.ts`
- `items/items.ts`
- `items/trapItemInstances.ts`
- `player/PlayerSkills.ts`
- `shared/HealthState.ts`
- `ui-vue/mount.ts`
- `world/animalTraps.ts`
- `world/beehives.ts`
- `world/createPlacedTraps.ts`
- `world/cropLifecycle.ts`
- `world/dryingRacks.ts`
- `world/fishing.ts`
- `world/playerGarden.ts`

**Imported by**

- `app/createApp.ts`

## `app/actions/groundActions.test.ts`

**Imports**

- `app/actions/actionContext.ts`
- `app/actions/groundActions.ts`
- `app/busyAction.ts`
- `badges/badges.ts`
- `debug/locationQueries.ts`
- `items/HeldTool.ts`
- `items/Inventory.ts`
- `items/itemInstances.ts`
- `items/items.ts`
- `player/PlayerController.ts`
- `player/physicalWorkStrength.ts`
- `reputation/ReputationManager.ts`
- `reputation/socialExposure.ts`
- `settlement/propUtils.ts`
- `settlement/props.ts`
- `terrain/dig.ts`
- `terrain/digAction.ts`
- `world/hiddenFinds.ts`
- `world/treasureSites.ts`
- `world/treeHarvest.ts`
- `world/treeLifecycle.ts`

## `app/actions/groundActions.ts`

**Imports**

- `app/actions/actionContext.ts`
- `app/interactables.ts`
- `audio/actionSounds.ts`
- `audio/inventorySounds.ts`
- `badges/badges.ts`
- `items/Inventory.ts`
- `items/itemCatalog.ts`
- `items/itemInstances.ts`
- `items/items.ts`
- `items/trade.ts`
- `player/PlayerNeeds.ts`
- `player/physicalWorkStrength.ts`
- `reputation/ReputationManager.ts`
- `reputation/socialExposure.ts`
- `settlement/hiddenTreasure.ts`
- `settlement/settlementGenerator.ts`
- `terrain/cemeteryAssignment.ts`
- `terrain/depositMining.ts`
- `terrain/dig.ts`
- `terrain/digAction.ts`
- `world/dayNight.ts`
- `world/hiddenFinds.ts`
- `world/parseSeed.ts`
- `world/treasureSites.ts`
- `world/treeHarvest.ts`
- `world/treeLifecycle.ts`

**Imported by**

- `app/actions/groundActions.test.ts`
- `app/createApp.ts`

## `app/actions/householdResourceTransferActions.test.ts`

**Imports**

- `app/actions/actionContext.ts`
- `app/actions/householdResourceTransferActions.ts`
- `economy/settlementEconomy.ts`
- `items/Inventory.ts`
- `settlement/household.ts`

## `app/actions/householdResourceTransferActions.ts`

**Imports**

- `app/actions/actionContext.ts`
- `economy/settlementEconomy.ts`
- `input/MouseLook.ts`
- `items/inventoryView.ts`
- `items/items.ts`
- `settlement/household.ts`
- `settlement/householdResourceTransfer.ts`
- `ui-vue/mount.ts`

**Imported by**

- `app/actions/householdResourceTransferActions.test.ts`
- `app/createApp.ts`

## `app/actions/inspectionActions.ts`

**Imports**

- `app/actions/actionContext.ts`
- `app/actions/actionContracts.ts`
- `app/actions/placementActions.ts`
- `app/actions/restActions.ts`
- `app/campRestSnapshot.ts`
- `app/inspection/buildWorldInspection.ts`
- `app/inspection/inspectionTarget.ts`
- `app/inspection/worldInspectionView.ts`
- `interaction/Interactable.ts`
- `items/campRepair.ts`
- `ui-vue/mount.ts`
- `world/WaterSource.ts`
- `world/workContract.ts`

**Imported by**

- `app/createApp.ts`

## `app/actions/leadActions.ts`

**Imports**

- `app/actions/actionContext.ts`
- `fauna/AnimalAgent.ts`
- `world/cart.ts`

**Imported by**

- `app/createApp.ts`
- `app/gameLoop.ts`

## `app/actions/mountActions.ts`

**Imports**

- `app/actions/actionContext.ts`
- `fauna/AnimalAgent.ts`
- `items/equipment.ts`
- `player/PlayerNeeds.ts`
- `player/PlayerSkills.ts`
- `player/playerDamage.ts`
- `player/ridingStability.ts`
- `shared/StaminaState.ts`
- `terrain/slopeConstraint.ts`

**Imported by**

- `app/createApp.ts`
- `app/gameLoop.ts`

## `app/actions/npcItemTransfer.test.ts`

**Imports**

- `ai/npcCombat.ts`
- `app/actions/npcItemTransfer.ts`
- `items/Inventory.ts`
- `items/foodFreshness.ts`
- `items/itemCatalog.ts`
- `items/itemInstances.ts`
- `items/liquidContainer.ts`
- `items/weaponMaintenance.ts`
- `settlement/npcPostDeath.ts`
- `settlement/npcState.ts`

## `app/actions/npcItemTransfer.ts`

**Imports**

- `items/Inventory.ts`
- `items/inventoryTransfer.ts`
- `items/items.ts`
- `settlement/npcState.ts`

**Imported by**

- `app/actions/npcItemTransfer.test.ts`
- `app/actions/npcItemTransferActions.ts`

## `app/actions/npcItemTransferActions.ts`

**Imports**

- `app/actions/actionContext.ts`
- `app/actions/npcItemTransfer.ts`
- `input/MouseLook.ts`
- `items/inventoryView.ts`
- `items/items.ts`
- `ui-vue/mount.ts`
- `ui-vue/store.ts`

**Imported by**

- `app/createApp.ts`

## `app/actions/placementActions.ts`

**Imports**

- `app/actions/actionContext.ts`
- `app/actions/constructionWorkSession.ts`
- `app/actions/placementRequirementView.ts`
- `app/actions/placementYaw.ts`
- `audio/actionSounds.ts`
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
- `settlement/families.ts`
- `settlement/settlementGenerator.ts`
- `settlement/structureCondition.ts`
- `terrain/dig.ts`
- `terrain/terrainPreparation.ts`
- `world/animalTraps.ts`
- `world/cropLifecycle.ts`
- `world/palisade.ts`
- `world/placementPreview.ts`
- `world/plantedCrops.ts`
- `world/plantedTrees.ts`
- `world/playerGarden.ts`
- `world/playerTrough.ts`
- `world/playerWell.ts`
- `world/repair.ts`
- `world/residentialBuilding.ts`
- `world/sleepingUtilities.ts`
- `world/sleepingUtilityProp.ts`
- `world/standingTorch.ts`

**Imported by**

- `app/actions/containerActions.ts`
- `app/actions/inspectionActions.ts`
- `app/actions/placementPreviewActions.ts`
- `app/actions/placementPreviewContract.test.ts`
- `app/actions/terrainPreparationActions.ts`
- `app/actions/workContractActions.ts`
- `app/createApp.ts`
- `app/gameLoop.ts`
- `app/inspection/buildWorldInspection.ts`
- `app/userActions.ts`
- `interaction/interactionView.ts`

## `app/actions/placementPreviewActions.ts`

**Imports**

- `app/actions/actionContext.ts`
- `app/actions/actionContracts.ts`
- `app/actions/containerActions.ts`
- `app/actions/placementActions.ts`
- `app/actions/placementRequirementView.ts`
- `app/actions/placementYaw.ts`
- `app/actions/workContractActions.ts`
- `world/placementPreview.ts`

**Imported by**

- `app/actions/cookMealIntent.ts`
- `app/actions/fullCampIntent.test.ts`
- `app/actions/fullCampIntent.ts`
- `app/createApp.ts`
- `app/userActions.ts`
- `ui-vue/store.ts`
- `ui/createQuickActions.ts`

## `app/actions/placementPreviewContract.test.ts`

**Imports**

- `app/actions/placementActions.ts`

## `app/actions/placementRequirementView.test.ts`

**Imports**

- `app/actions/placementRequirementView.ts`

## `app/actions/placementRequirementView.ts`

**Imports**

- `items/Inventory.ts`
- `items/constructionMaterials.ts`
- `items/createDroppedItems.ts`
- `items/items.ts`

**Imported by**

- `app/actions/placementActions.ts`
- `app/actions/placementPreviewActions.ts`
- `app/actions/placementRequirementView.test.ts`
- `app/userActions.ts`
- `ui-vue/store.ts`

## `app/actions/placementYaw.test.ts`

**Imports**

- `app/actions/placementYaw.ts`

## `app/actions/placementYaw.ts`

**Imported by**

- `app/actions/containerActions.ts`
- `app/actions/placementActions.ts`
- `app/actions/placementPreviewActions.ts`
- `app/actions/placementYaw.test.ts`
- `app/actions/workContractActions.ts`

## `app/actions/restActions.ts`

**Imports**

- `app/actions/actionContext.ts`
- `app/actions/constructionWorkSession.ts`
- `app/campRest.ts`
- `app/campRestSnapshot.ts`
- `items/Inventory.ts`
- `items/campRepair.ts`
- `items/constructionMaterials.ts`
- `items/itemCatalog.ts`
- `items/itemInstances.ts`
- `items/items.ts`
- `items/tentProp.ts`
- `player/PlayerNeeds.ts`
- `player/PlayerSkills.ts`
- `player/skillEvaluation.ts`
- `settlement/createSettlement.ts`
- `settlement/lodging.ts`
- `settlement/lodgingResolver.ts`
- `shared/VigorState.ts`
- `ui/createBusyOverlay.ts`
- `ui/createQuickActions.ts`
- `ui/createTimeSkipOverlay.ts`
- `world/playerWell.ts`
- `world/repair.ts`
- `world/residentialBuilding.ts`
- `world/sleepingUtilities.ts`

**Imported by**

- `app/actions/inspectionActions.ts`
- `app/createApp.ts`
- `app/inspection/buildWorldInspection.ts`

## `app/actions/storageInfestationActions.ts`

**Imports**

- `app/actions/actionContext.ts`
- `app/worldBundle.ts`
- `items/Inventory.ts`
- `items/itemCatalog.ts`
- `items/items.ts`
- `player/PlayerNeeds.ts`
- `quests/QuestManager.ts`
- `settlement/ratInfestation.ts`
- `settlement/storageRepair.ts`
- `ui/createHud.ts`
- `ui/createToast.ts`

**Imported by**

- `app/createApp.ts`

## `app/actions/survivalActions.test.ts`

**Imports**

- `app/actions/actionContext.ts`
- `app/actions/survivalActions.ts`
- `app/busyAction.ts`
- `fauna/AnimalSpawner.ts`
- `items/Inventory.ts`
- `items/foodSafety.ts`
- `items/itemInstances.ts`
- `items/items.ts`
- `player/PlayerNeeds.ts`
- `player/PlayerSkills.ts`
- `settlement/VillageFire.ts`
- `shared/HealthState.ts`
- `shared/foodPoisoningExposure.ts`
- `shared/temporaryConditions.ts`
- `shared/waterPoisoningExposure.ts`
- `world/WaterSource.ts`

## `app/actions/survivalActions.ts`

**Imports**

- `app/actions/actionContext.ts`
- `app/actions/actionContracts.ts`
- `audio/actionSounds.ts`
- `audio/animalSounds.ts`
- `audio/inventorySounds.ts`
- `fauna/AnimalAgent.ts`
- `fauna/AnimalSpawner.ts`
- `fauna/animalHarvest.ts`
- `fauna/animalMeat.ts`
- `fauna/createFauna.ts`
- `fauna/livestockProduction.ts`
- `items/Inventory.ts`
- `items/campfireCooking.ts`
- `items/foodFreshness.ts`
- `items/foodSafety.ts`
- `items/itemCatalog.ts`
- `items/itemFuel.ts`
- `items/itemInstances.ts`
- `items/items.ts`
- `items/liquidContainer.ts`
- `player/PlayerNeeds.ts`
- `player/PlayerSkills.ts`
- `settlement/VillageFire.ts`
- `shared/HealthState.ts`
- `shared/VigorState.ts`
- `shared/foodPoisoningExposure.ts`
- `shared/temporaryConditions.ts`
- `shared/waterPoisoningExposure.ts`
- `world/WaterSource.ts`
- `world/parseSeed.ts`

**Imported by**

- `app/actions/cookMealIntent.ts`
- `app/actions/fullCampIntent.ts`
- `app/actions/survivalActions.test.ts`
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

## `app/actions/workContractActions.ts`

**Imports**

- `app/actions/actionContext.ts`
- `app/actions/placementActions.ts`
- `app/actions/placementYaw.ts`
- `items/tentPlacement.ts`
- `terrain/terrainPreparation.ts`
- `ui-vue/mount.ts`
- `world/palisade.ts`
- `world/playerWell.ts`
- `world/residentialBuilding.ts`
- `world/standingTorch.ts`
- `world/workContract.ts`

**Imported by**

- `app/actions/placementPreviewActions.ts`
- `app/createApp.ts`

## `app/actions/workContractPayment.test.ts`

**Imports**

- `app/actions/workContractPayment.ts`
- `items/Inventory.ts`
- `settlement/npcState.ts`
- `world/createWorkContracts.ts`

## `app/actions/workContractPayment.ts`

**Imports**

- `items/Inventory.ts`
- `items/inventoryTransfer.ts`
- `settlement/npcState.ts`
- `world/createWorkContracts.ts`
- `world/workContract.ts`

**Imported by**

- `app/actions/workContractPayment.test.ts`
- `app/inventoryWiring.ts`

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
- `app/actions/constructionWorkSession.test.ts`
- `app/actions/constructionWorkSession.ts`
- `app/actions/cookMealIntent.test.ts`
- `app/actions/cookMealIntent.ts`
- `app/actions/fullCampIntent.test.ts`
- `app/actions/fullCampIntent.ts`
- `app/actions/groundActions.test.ts`
- `app/actions/survivalActions.test.ts`
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
- `app/campRestSnapshot.test.ts`
- `app/campRestSnapshot.ts`

## `app/campRestSnapshot.test.ts`

**Imports**

- `app/campRest.ts`
- `app/campRestSnapshot.ts`

## `app/campRestSnapshot.ts`

**Imports**

- `app/campRest.ts`
- `items/createPlacedTents.ts`
- `settlement/PlacedFires.ts`
- `world/sleepingUtilities.ts`

**Imported by**

- `app/actions/fullCampIntent.ts`
- `app/actions/inspectionActions.ts`
- `app/actions/restActions.ts`
- `app/campRestSnapshot.test.ts`
- `app/inspection/buildWorldInspection.ts`
- `app/interactables.ts`

## `app/createApp.ts`

**Imports**

- `ai/reactionChance.ts`
- `app/actions/actionContext.ts`
- `app/actions/containerActions.ts`
- `app/actions/cookMealIntent.ts`
- `app/actions/fullCampIntent.ts`
- `app/actions/gatheringActions.ts`
- `app/actions/groundActions.ts`
- `app/actions/householdResourceTransferActions.ts`
- `app/actions/inspectionActions.ts`
- `app/actions/leadActions.ts`
- `app/actions/mountActions.ts`
- `app/actions/npcItemTransferActions.ts`
- `app/actions/placementActions.ts`
- `app/actions/placementPreviewActions.ts`
- `app/actions/restActions.ts`
- `app/actions/storageInfestationActions.ts`
- `app/actions/survivalActions.ts`
- `app/actions/terrainPreparationActions.ts`
- `app/actions/workContractActions.ts`
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
- `debug/createCaveHeightfieldTestScene.ts`
- `debug/createModelTestScene.ts`
- `debug/debugMode.ts`
- `debug/npcDebugApi.ts`
- `debug/npcInspectTrigger.ts`
- `debug/playerGroundTrace.ts`
- `debug/playerMovementTrace.ts`
- `fauna/AnimalAgent.ts`
- `fauna/animalOwnership.ts`
- `fauna/createFauna.ts`
- `input/Keyboard.ts`
- `input/MouseLook.ts`
- `input/createTouchControls.ts`
- `input/isTouchDevice.ts`
- `items/HeldTool.ts`
- `items/Inventory.ts`
- `items/armorItemInstances.ts`
- `items/container.ts`
- `items/equipment.ts`
- `items/guardSword.ts`
- `items/inventoryView.ts`
- `items/itemCatalog.ts`
- `items/itemInstances.ts`
- `items/items.ts`
- `items/liquidContainer.ts`
- `items/primaryWeapons.ts`
- `items/trade.ts`
- `items/treasureGameplay.ts`
- `items/weaponMaintenance.ts`
- `perf/index.ts`
- `persistence/saveData.ts`
- `persistence/saveDb.ts`
- `player/PlayerController.ts`
- `player/PlayerNeeds.ts`
- `player/PlayerSkills.ts`
- `player/PlayerTorch.ts`
- `player/characterPresentation.ts`
- `player/humanCarryCapacity.ts`
- `player/targetedSkillSelection.ts`
- `quests/QuestManager.ts`
- `quests/cardinalDirection.ts`
- `quests/materializeAuthoredQuests.ts`
- `quests/opportunities/hunterProfessionQuests.ts`
- `quests/opportunities/rpgQuestMatrices.ts`
- `quests/opportunities/settlementQuestOpportunities.ts`
- `quests/opportunities/worldQuestMaterialization.ts`
- `quests/quests.ts`
- `render/programPrewarm.ts`
- `reputation/ReputationManager.ts`
- `reputation/animalDeeds.ts`
- `settlement/createSettlement.ts`
- `settlement/horseAcquisition.ts`
- `settlement/landOwnership.ts`
- `settlement/livestock.ts`
- `settlement/npcIdentity.ts`
- `settlement/settlementProximity.ts`
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
- `world/grassForage.ts`
- `world/groundFog.ts`
- `world/locations/abandonedCemeteryCache.ts`
- `world/locations/darkForestTreasureSite.ts`
- `world/locations/darkForestTreasureSiteRuntime.ts`
- `world/locations/locationKnowledge.ts`
- `world/locations/locationProximityDiscovery.ts`
- `world/locations/locationsCoarseCache.ts`
- `world/locations/navigationTargets.ts`
- `world/locations/worldLocationCatalog.ts`
- `world/map/mapData.ts`
- `world/map/mapDiscovery.ts`
- `world/map/mapProjection.ts`
- `world/palisade.ts`
- `world/parseSeed.ts`
- `world/plantedCrops.ts`
- `world/plantedTrees.ts`
- `world/playerTrough.ts`
- `world/playerWell.ts`
- `world/seedLibrary.ts`
- `world/sleepingUtilities.ts`
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
- `app/actions/leadActions.ts`
- `app/actions/mountActions.ts`
- `app/actions/placementActions.ts`
- `app/actions/survivalActions.ts`
- `app/busyAction.ts`
- `app/inspection/inspectionTarget.ts`
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
- `combat/meleeStrength.ts`
- `combat/projectile.ts`
- `combat/rangedAttack.ts`
- `combat/rangedReticle.ts`
- `debug/colliderDebugView.ts`
- `debug/debugMode.ts`
- `debug/npcInspectTrigger.ts`
- `debug/renderStateDebug.ts`
- `fauna/AnimalAgent.ts`
- `fauna/AnimalSpawner.ts`
- `fauna/animalAttraction.ts`
- `fauna/faunaCombat.ts`
- `fauna/predatorHumanDecision.ts`
- `input/Keyboard.ts`
- `input/MouseLook.ts`
- `input/createTouchControls.ts`
- `input/isTouchDevice.ts`
- `interaction/Interactable.ts`
- `interaction/findInteractionTarget.ts`
- `interaction/interactionView.ts`
- `interaction/resolveInteraction.ts`
- `interaction/targetedSkillAction.ts`
- `interaction/treeInspection.ts`
- `items/HeldTool.ts`
- `items/Inventory.ts`
- `items/campRepair.ts`
- `items/equipment.ts`
- `items/foodFreshness.ts`
- `items/itemCatalog.ts`
- `items/itemFuel.ts`
- `items/itemInstances.ts`
- `items/items.ts`
- `items/trade.ts`
- `items/weaponMaintenance.ts`
- `perf/index.ts`
- `player/PlayerController.ts`
- `player/PlayerNeeds.ts`
- `player/PlayerSkills.ts`
- `player/PlayerTorch.ts`
- `player/characterPresentation.ts`
- `player/playerCombat.ts`
- `player/playerDamage.ts`
- `player/playerMelee.ts`
- `player/playerRanged.ts`
- `player/targetedSkillSelection.ts`
- `quests/QuestManager.ts`
- `render/createPostProcessing.ts`
- `render/shadowBudget.ts`
- `reputation/animalDeeds.ts`
- `settlement/VillageFire.ts`
- `settlement/families.ts`
- `settlement/household.ts`
- `settlement/landOwnership.ts`
- `settlement/landPurchase.ts`
- `settlement/storageRepair.ts`
- `shared/HungerState.ts`
- `shared/StaminaState.ts`
- `shared/ThirstState.ts`
- `shared/VigorState.ts`
- `simulation/observation.ts`
- `ui-vue/lib/firstUpperCase.ts`
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
- `world/animalAttractionSource.ts`
- `world/clouds.ts`
- `world/createLights.ts`
- `world/createSky.ts`
- `world/cropLifecycle.ts`
- `world/dayNight.ts`
- `world/foliageWind.ts`
- `world/groundFog.ts`
- `world/lightningEvents.ts`
- `world/locations/locationProximityDiscovery.ts`
- `world/map/mapDiscovery.ts`
- `world/playerWell.ts`
- `world/timeSkip.ts`
- `world/transportOffscreen.ts`
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

## `app/inspection/buildWorldInspection.test.ts`

**Imports**

- `app/inspection/buildWorldInspection.ts`
- `app/inspection/inspectionTarget.ts`
- `interaction/Interactable.ts`
- `items/Inventory.ts`
- `items/itemInstances.ts`
- `terrain/terrainPreparation.ts`
- `world/palisade.ts`
- `world/playerWell.ts`
- `world/residentialBuilding.ts`
- `world/standingTorch.ts`
- `world/wellGroundwater.ts`
- `world/workContract.ts`

## `app/inspection/buildWorldInspection.ts`

**Imports**

- `app/actions/placementActions.ts`
- `app/actions/restActions.ts`
- `app/campRestSnapshot.ts`
- `app/inspection/worldInspectionView.ts`
- `items/Inventory.ts`
- `items/constructionMaterials.ts`
- `items/createDroppedItems.ts`
- `items/itemInstances.ts`
- `items/items.ts`
- `items/liquidContainer.ts`
- `terrain/terrainPreparation.ts`
- `world/WaterSource.ts`
- `world/palisade.ts`
- `world/playerTrough.ts`
- `world/playerWell.ts`
- `world/residentialBuilding.ts`
- `world/sleepingUtilities.ts`
- `world/standingTorch.ts`
- `world/workContract.ts`

**Imported by**

- `app/actions/inspectionActions.ts`
- `app/inspection/buildWorldInspection.test.ts`

## `app/inspection/inspectionTarget.ts`

**Imports**

- `app/inspection/worldInspectionView.ts`
- `interaction/Interactable.ts`
- `world/workContract.ts`

**Imported by**

- `app/actions/inspectionActions.ts`
- `app/gameLoop.ts`
- `app/inspection/buildWorldInspection.test.ts`

## `app/inspection/worldInspectionView.ts`

**Imported by**

- `app/actions/inspectionActions.ts`
- `app/inspection/buildWorldInspection.ts`
- `app/inspection/inspectionTarget.ts`
- `ui-vue/store.ts`

## `app/interactables.test.ts`

**Imports**

- `app/interactables.ts`
- `items/Inventory.ts`
- `items/createDroppedItems.ts`
- `items/items.ts`

## `app/interactables.ts`

**Imports**

- `app/campRestSnapshot.ts`
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
- `items/foodFreshness.ts`
- `items/itemCatalog.ts`
- `items/items.ts`
- `player/playerMelee.ts`
- `settlement/PlacedFires.ts`
- `settlement/createSettlement.ts`
- `settlement/landOwnership.ts`
- `settlement/structureCondition.ts`
- `terrain/chunkEnvironment.ts`
- `terrain/chunkManager.ts`
- `terrain/depositMining.ts`
- `terrain/dig.ts`
- `terrain/resourceDeposits.ts`
- `terrain/waterBodies.ts`
- `terrain/waterBodyKind.ts`
- `world/WaterSource.ts`
- `world/animalTraps.ts`
- `world/beehives.ts`
- `world/cart.ts`
- `world/createBeehives.ts`
- `world/createDryingRacks.ts`
- `world/createPalisades.ts`
- `world/createPlacedContainers.ts`
- `world/createPlacedTraps.ts`
- `world/createPlayerGardens.ts`
- `world/createPlayerTroughs.ts`
- `world/createPlayerWells.ts`
- `world/createResidentialBuildings.ts`
- `world/createSleepingUtilities.ts`
- `world/createStandingTorches.ts`
- `world/createTerrainPreparations.ts`
- `world/cropLifecycle.ts`
- `world/dryingRacks.ts`
- `world/palisade.ts`
- `world/playerGarden.ts`
- `world/playerTrough.ts`
- `world/playerWell.ts`
- `world/residentialBuilding.ts`
- `world/standingTorch.ts`
- `world/treeLifecycle.ts`
- `world/worldGeneratedContainers.ts`

**Imported by**

- `app/actions/groundActions.ts`
- `app/gameLoop.ts`
- `app/interactables.test.ts`
- `items/cookingFireResolver.ts`
- `player/playerCombat.test.ts`
- `player/playerCombat.ts`
- `player/playerMelee.test.ts`

## `app/inventoryWiring.ts`

**Imports**

- `ai/NpcAgent.ts`
- `ai/dialogueTemplates.ts`
- `ai/voluntaryExpeditionJoin.ts`
- `app/actions/workContractPayment.ts`
- `app/worldBundle.ts`
- `audio/createWorldAudio.ts`
- `audio/inventorySounds.ts`
- `items/HeldTool.ts`
- `items/Inventory.ts`
- `items/books.ts`
- `items/equipment.ts`
- `items/foodItems.ts`
- `items/guardSword.ts`
- `items/inventoryView.ts`
- `items/itemCatalog.ts`
- `items/itemInstances.ts`
- `items/items.ts`
- `items/primaryWeapons.ts`
- `items/trade.ts`
- `items/tradeCatalog.ts`
- `items/weaponMaintenance.ts`
- `player/PlayerController.ts`
- `player/PlayerSkills.ts`
- `player/PlayerTorch.ts`
- `quests/QuestManager.ts`
- `reputation/ReputationManager.ts`
- `settlement/createSettlement.ts`
- `settlement/horseAcquisition.ts`
- `ui-vue/mount.ts`
- `ui-vue/store.ts`
- `ui/createHud.ts`
- `ui/createToast.ts`
- `world/dayNight.ts`
- `world/locations/locationConfig.ts`
- `world/locations/locationDiscovery.ts`
- `world/locations/locationKnowledge.ts`
- `world/locations/navigationTargets.ts`
- `world/locations/revealLocationKnowledge.ts`
- `world/locations/worldLocationCatalog.ts`

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
- `perf/gpuTimer.ts`
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
- `items/equipment.ts`
- `items/primaryWeapons.ts`
- `items/treasureGameplay.ts`
- `persistence/saveData.ts`
- `persistence/saveDb.ts`
- `persistence/saveSlots.ts`
- `player/PlayerController.ts`
- `player/PlayerTorch.ts`
- `quests/QuestManager.ts`
- `reputation/ReputationManager.ts`
- `settlement/landOwnership.ts`
- `terrain/chunkManager.ts`
- `terrain/depositMining.ts`
- `ui-vue/mount.ts`
- `world/cropLifecycle.ts`
- `world/dayNight.ts`
- `world/fishing.ts`
- `world/locations/locationKnowledge.ts`
- `world/locations/navigationTargets.ts`
- `world/map/mapDiscovery.ts`
- `world/plantedTrees.ts`
- `world/transportOrder.ts`
- `world/treeLifecycle.ts`
- `world/workContract.ts`

**Imported by**

- `app/createApp.ts`

## `app/userActions.test.ts`

**Imports**

- `app/userActions.ts`
- `app/worldBundle.ts`
- `items/HeldTool.ts`
- `items/Inventory.ts`
- `settlement/PlacedFires.ts`

## `app/userActions.ts`

**Imports**

- `app/actions/actionContracts.ts`
- `app/actions/placementActions.ts`
- `app/actions/placementPreviewActions.ts`
- `app/actions/placementRequirementView.ts`
- `app/worldBundle.ts`
- `input/MouseLook.ts`
- `items/HeldTool.ts`
- `items/Inventory.ts`
- `items/tentPlacement.ts`
- `player/PlayerController.ts`
- `player/PlayerTorch.ts`
- `settlement/PlacedFires.ts`
- `ui/createHud.ts`

**Imported by**

- `app/actions/fullCampIntent.ts`
- `app/createApp.ts`
- `app/userActions.test.ts`
- `ui-vue/playerQuickActions.ts`

## `app/worldBundle.caveTreasure.test.ts`

**Imports**

- `app/worldBundle.ts`
- `items/treasureGameplay.ts`
- `world/createCaves.ts`

## `app/worldBundle.ts`

**Imports**

- `ai/reactionChance.ts`
- `audio/createWorldAudio.ts`
- `config/worldConfig.ts`
- `economy/settlementEconomy.ts`
- `fauna/AnimalSpawner.ts`
- `fauna/animalNaturalWater.ts`
- `fauna/createFauna.ts`
- `fauna/huntingHooks.ts`
- `fauna/persistentOccupants.ts`
- `items/createDroppedItems.ts`
- `items/createItemSpawners.ts`
- `items/createPlacedTents.ts`
- `items/heldToolVisual.ts`
- `items/itemModels.ts`
- `items/treasureGameplay.ts`
- `settlement/PlacedFires.ts`
- `settlement/SettlementsManager.ts`
- `settlement/createSettlement.ts`
- `settlement/families.ts`
- `settlement/household.ts`
- `settlement/livestock.ts`
- `settlement/npcRelationships.ts`
- `settlement/npcState.ts`
- `settlement/roadNetwork.ts`
- `settlement/settlementGenerator.ts`
- `settlement/settlementPlanCache.ts`
- `settlement/settlementStructures.ts`
- `shared/bootMark.ts`
- `terrain/chunkEnvironment.ts`
- `terrain/chunkGrid.ts`
- `terrain/chunkManager.ts`
- `terrain/depositMining.ts`
- `terrain/resourceDeposits.ts`
- `terrain/terrainPreparation.ts`
- `world/animalTraps.ts`
- `world/beehives.ts`
- `world/bloodTraces.ts`
- `world/cartProp.ts`
- `world/caves/caveAdventureProps.ts`
- `world/createBeehives.ts`
- `world/createCarts.ts`
- `world/createCaves.ts`
- `world/createDryingRacks.ts`
- `world/createGrassForagePatches.ts`
- `world/createOcean.ts`
- `world/createPalisades.ts`
- `world/createPlacedContainers.ts`
- `world/createPlacedTraps.ts`
- `world/createPlayerGardens.ts`
- `world/createPlayerTroughs.ts`
- `world/createPlayerWells.ts`
- `world/createResidentialBuildings.ts`
- `world/createSleepingUtilities.ts`
- `world/createStandingTorches.ts`
- `world/createTerrainPreparations.ts`
- `world/createTransportOrders.ts`
- `world/createWorkContracts.ts`
- `world/cropLifecycle.ts`
- `world/dayNight.ts`
- `world/dryingRacks.ts`
- `world/foodSources.ts`
- `world/grassForage.ts`
- `world/helperDeliveryHooks.ts`
- `world/herbalGathering.ts`
- `world/locations/darkForestTreasureSite.ts`
- `world/locations/darkForestTreasureSiteRuntime.ts`
- `world/map/mapProjection.ts`
- `world/npcGraves.ts`
- `world/palisade.ts`
- `world/plantedTrees.ts`
- `world/playerGarden.ts`
- `world/playerTrough.ts`
- `world/playerWell.ts`
- `world/pointLightBudget.ts`
- `world/residentialBuilding.ts`
- `world/riverWaterQualityResolver.ts`
- `world/settlementForestHooks.ts`
- `world/siteInfrastructure.ts`
- `world/sleepingUtilities.ts`
- `world/standingTorch.ts`
- `world/transportOrder.ts`
- `world/trapProp.ts`
- `world/treasureSites.ts`
- `world/treeLifecycle.ts`
- `world/waterMirror.ts`
- `world/workContract.ts`
- `world/worldContext.ts`
- `world/worldGeneratedContainers.ts`

**Imported by**

- `app/actions/actionContext.ts`
- `app/actions/cookMealIntent.test.ts`
- `app/actions/cookMealIntent.ts`
- `app/actions/fullCampIntent.test.ts`
- `app/actions/fullCampIntent.ts`
- `app/actions/storageInfestationActions.ts`
- `app/createApp.ts`
- `app/gameLoop.ts`
- `app/graphicsSettings.ts`
- `app/inventoryWiring.ts`
- `app/saveState.ts`
- `app/userActions.test.ts`
- `app/userActions.ts`
- `app/worldBundle.caveTreasure.test.ts`
- `debug/faunaInspector.ts`
- `debug/npcDebugApi.test.ts`
- `debug/npcDebugApi.ts`
- `debug/npcInspector.ts`
- `ui/createNpcInspector.ts`
