# Dependencies

Generated from TypeScript imports.

## `player/PlayerController.ts`

**Imports**

- `assets/loadGltf.ts`
- `audio/createWorldAudio.ts`
- `audio/playerMoveSounds.ts`
- `input/Keyboard.ts`
- `input/MouseLook.ts`
- `items/HeldTool.ts`
- `items/heldToolVisual.ts`
- `player/PlayerNeeds.ts`
- `player/PlayerSkills.ts`
- `player/cameraBoom.ts`
- `player/playerEncumbrance.ts`
- `player/verticalMotion.ts`
- `shared/HealthState.ts`
- `shared/StaminaState.ts`
- `terrain/footstepSurface.ts`
- `terrain/slopeConstraint.ts`
- `ui/agentStatusLabel.ts`
- `world/collision.ts`

**Imported by**

- `ai/NpcAgent.ts`
- `app/actions/actionContext.ts`
- `app/createApp.ts`
- `app/dialogueTimeControl.ts`
- `app/gameLoop.ts`
- `app/inventoryWiring.ts`
- `app/restCampSequence.ts`
- `app/saveState.ts`
- `app/userActions.ts`
- `assets/assetIndex.ts`
- `fauna/AnimalAgent.ts`
- `fauna/createFauna.ts`
- `fauna/playerAwareness.ts`
- `items/createDroppedItems.ts`
- `items/createItemSpawners.ts`
- `items/createPlacedTents.ts`
- `items/tentProp.test.ts`
- `items/tentProp.ts`
- `navigation/navigation.ts`
- `player/playerDamage.ts`
- `settlement/PlacedFires.ts`
- `settlement/SettlementsManager.ts`
- `settlement/createSettlement.ts`
- `settlement/findSettlementSite.ts`
- `settlement/livestock.ts`
- `settlement/minorLocations.ts`
- `settlement/pathDryness.ts`
- `settlement/roadNetwork.ts`
- `settlement/settlementGenerator.ts`
- `settlement/settlementPlanCache.ts`
- `settlement/villageClearing.ts`
- `settlement/villagePlanner.ts`
- `terrain/bloodOverlay.ts`
- `terrain/chunkManager.ts`
- `terrain/dig.ts`
- `terrain/naturalResources.ts`
- `terrain/slopeConstraint.ts`
- `world/bloodTraces.ts`
- `world/createBeehives.ts`
- `world/createDryingRacks.ts`
- `world/createPalisades.ts`
- `world/createPlacedContainers.ts`
- `world/createPlacedTraps.ts`
- `world/createPlayerGardens.ts`
- `world/createPlayerWells.ts`
- `world/createSleepingUtilities.ts`
- `world/createStandingTorches.ts`
- `world/createTerrainPreparations.ts`
- `world/createWorkContracts.ts`
- `world/worldContext.ts`

## `player/PlayerNeeds.test.ts`

**Imports**

- `player/PlayerNeeds.ts`
- `shared/HealthState.ts`
- `shared/HungerState.ts`
- `shared/ThirstState.ts`
- `shared/VigorState.ts`

## `player/PlayerNeeds.ts`

**Imports**

- `shared/HealthState.ts`
- `shared/HungerState.ts`
- `shared/StaminaState.ts`
- `shared/ThirstState.ts`
- `shared/VigorState.ts`
- `world/timeConversion.ts`

**Imported by**

- `app/actions/groundActions.ts`
- `app/actions/mountActions.ts`
- `app/actions/placementActions.ts`
- `app/actions/restActions.ts`
- `app/actions/survivalActions.test.ts`
- `app/actions/survivalActions.ts`
- `app/actions/terrainPreparationActions.ts`
- `app/createApp.ts`
- `app/gameLoop.ts`
- `player/PlayerController.ts`
- `player/PlayerNeeds.test.ts`
- `player/playerDamage.ts`
- `player/playerMelee.ts`
- `player/playerRanged.ts`

## `player/PlayerSkills.test.ts`

**Imports**

- `player/PlayerSkills.ts`

## `player/PlayerSkills.ts`

**Imported by**

- `app/actions/gatheringActions.ts`
- `app/actions/mountActions.ts`
- `app/actions/placementActions.ts`
- `app/actions/restActions.ts`
- `app/actions/survivalActions.ts`
- `app/actions/terrainPreparationActions.ts`
- `app/campRest.test.ts`
- `app/createApp.ts`
- `app/gameLoop.ts`
- `persistence/saveData.ts`
- `player/PlayerController.ts`
- `player/PlayerSkills.test.ts`
- `player/playerDamage.ts`
- `world/animalTraps.test.ts`

## `player/PlayerTorch.ts`

**Imports**

- `assets/loadGltf.ts`
- `items/heldToolVisual.ts`
- `items/items.ts`
- `player/torchLightPresets.ts`
- `shared/getFireParticles.ts`
- `shared/torchConfig.ts`
- `world/pointLightBudget.ts`

**Imported by**

- `app/actions/actionContext.ts`
- `app/createApp.ts`
- `app/gameLoop.ts`
- `app/inventoryWiring.ts`
- `app/saveState.ts`
- `app/userActions.ts`

## `player/cameraBoom.test.ts`

**Imports**

- `player/cameraBoom.ts`

## `player/cameraBoom.ts`

**Imports**

- `world/collision.ts`

**Imported by**

- `player/PlayerController.ts`
- `player/cameraBoom.test.ts`

## `player/playerCombat.test.ts`

**Imports**

- `app/interactables.ts`
- `items/itemCatalog.ts`
- `player/playerCombat.ts`
- `player/playerMelee.ts`

## `player/playerCombat.ts`

**Imports**

- `app/interactables.ts`
- `combat/meleeAttack.ts`
- `fauna/AnimalAgent.ts`
- `fauna/createFauna.ts`
- `interaction/Interactable.ts`
- `player/playerMelee.ts`
- `settlement/createSettlement.ts`

**Imported by**

- `app/gameLoop.ts`
- `player/playerCombat.test.ts`

## `player/playerDamage.ts`

**Imports**

- `combat/defenseResolver.ts`
- `items/HeldTool.ts`
- `items/itemCatalog.ts`
- `player/PlayerController.ts`
- `player/PlayerNeeds.ts`
- `player/PlayerSkills.ts`
- `shared/HealthState.ts`
- `world/bloodTraces.ts`

**Imported by**

- `app/actions/mountActions.ts`
- `app/gameLoop.ts`
- `player/playerDownedRecovery.test.ts`

## `player/playerDownedRecovery.test.ts`

**Imports**

- `player/playerDamage.ts`
- `shared/HealthState.ts`

## `player/playerEncumbrance.test.ts`

**Imports**

- `player/playerEncumbrance.ts`

## `player/playerEncumbrance.ts`

**Imported by**

- `player/PlayerController.ts`
- `player/playerEncumbrance.test.ts`

## `player/playerMelee.test.ts`

**Imports**

- `app/interactables.ts`
- `items/itemCatalog.ts`
- `player/playerMelee.ts`
- `shared/StaminaState.ts`
- `shared/VigorState.ts`

## `player/playerMelee.ts`

**Imports**

- `combat/meleeAttack.ts`
- `items/itemCatalog.ts`
- `player/PlayerNeeds.ts`
- `shared/StaminaState.ts`
- `shared/VigorState.ts`

**Imported by**

- `app/gameLoop.ts`
- `app/interactables.ts`
- `player/playerCombat.test.ts`
- `player/playerCombat.ts`
- `player/playerMelee.test.ts`

## `player/playerRanged.test.ts`

**Imports**

- `items/itemCatalog.ts`
- `player/playerRanged.ts`
- `shared/StaminaState.ts`
- `shared/VigorState.ts`

## `player/playerRanged.ts`

**Imports**

- `combat/rangedLifecycle.ts`
- `items/itemCatalog.ts`
- `player/PlayerNeeds.ts`
- `shared/StaminaState.ts`
- `shared/VigorState.ts`

**Imported by**

- `app/gameLoop.ts`
- `player/playerRanged.test.ts`

## `player/ridingStability.ts`

**Imported by**

- `app/actions/mountActions.ts`

## `player/torchLightPresets.ts`

**Imported by**

- `assets/assetIndex.ts`
- `player/PlayerTorch.ts`
- `tools/assetBrowser/viewer/createViewerScene.ts`

## `player/verticalMotion.test.ts`

**Imports**

- `player/verticalMotion.ts`

## `player/verticalMotion.ts`

**Imported by**

- `player/PlayerController.ts`
- `player/verticalMotion.test.ts`
