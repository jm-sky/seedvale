# Symbols

Generated from exported TypeScript symbols.

## `fauna/AnimalAgent.ts`

- `AnimalAgent` — class — line 834
  - domain: fauna
  - system: animal-agent
  - role: Central per-animal behaviour integration point: predator/prey AI, needs, health, production (livestock) and riding (mounts).
  - uses: HealthState, StaminaState
  - simulation: tick
- `AnimalAgentDebugInfo` — type — line 377
- `AnimalAgentDeps` — type — line 702
- `AnimalSaveState` — type — line 474
- `AnimalUpdateContext` — type — line 733
- `BURY_DURATION_SEC` — const — line 247
- `canPredatorPursueIntoVillage` — function — line 532
- `FAUNA_SHADOW_DISTANCE` — const — line 214
- `FaunaAiBranch` — type — line 356
- `FaunaNavRescueDebugInfo` — type — line 361
- `FRENZY_VILLAGE_ARRIVAL_RADIUS` — const — line 307
- `FrenzyWolfCandidate` — type — line 637
- `HARVEST_MEAT_DURATION_SEC` — const — line 250
- `isWithinVillageRadius` — function — line 513
- `NearbyNpcCandidate` — type — line 632
- `pickNearestEligibleWolf` — function — line 646
- `pickRabidTarget` — function — line 671
- `RABIES_BITE_INFECTION_CHANCE` — const — line 232
- `resolveLureTarget` — function — line 561
- `villageFleeBiasFalloff` — function — line 540
- `VillageInfo` — type — line 507

## `fauna/animalCorpse.ts`

- `advanceAnimalCorpse` — function — line 405
- `AnimalCorpseState` — type — line 123
- `buryCorpse` — function — line 227
- `canHarvestMeatFrom` — function — line 88
- `claimCorpseAsFood` — function — line 431
- `claimCorpseForCleanup` — function — line 449
- `CorpseHost` — type — line 202
- `corpseLingerSeconds` — function — line 39
- `CorpseNeighbour` — type — line 215
- `CorpsePhase` — type — line 31
  - domain: fauna
  - role: Corpse/remains/decay/rot-FX/rabies-exposure/food-claim state machine for one dead `AnimalAgent` (plan fauna-017 step 5, review E3) — plain state plus free functions over an explicit `CorpseHost`, mirroring how `AnimalLife.ts` owns `AnimalLifeState` without owning the animal. Not a second entity: `health.dead` stays authoritative on `AnimalAgent`, and every public method there (`bury`, `harvestMeat`, `corpsePhase`, `claimAsFood`, …) stays a thin delegate into this module, so no cross- agent call shape changes.
- `corpsePhaseFromElapsed` — function — line 71
- `corpseReadyToRemove` — function — line 234
- `createAnimalCorpseState` — function — line 178
- `disposeAnimalCorpse` — function — line 475
- `disposeAnimalCorpseRotFx` — function — line 395
- `harvestCorpseMeat` — function — line 285
- `HARVESTED_REMAINS_LINGER_SECONDS` — const — line 37
- `hideLivingVisual` — function — line 242
- `isRabiesCorpseContact` — function — line 111
- `markCorpseFoodConsumed` — function — line 466
- `RABIES_CORPSE_CONTACT_RADIUS` — const — line 60
- `RABIES_CORPSE_INFECTION_CHANCE` — const — line 63
- `releaseCorpseClaim` — function — line 439
- `releaseCorpseCleanupClaim` — function — line 458
- `rollsRabiesInfection` — function — line 102
- `rotFxRelevant` — function — line 78
- `spawnDeathSplat` — function — line 302
- `spawnHarvestedRemains` — function — line 268

## `fauna/animalDebugVisual.ts`

- `AnimalDebugVisual` — type — line 29
- `AnimalDebugVisualState` — type — line 12
- `createAnimalDebugVisual` — function — line 41

## `fauna/animalDefs.ts`

- `ANIMAL_DEFS` — const — line 271
- `ANIMAL_LABELS` — const — line 47
- `AnimalDef` — type — line 66
- `AnimalDietConfig` — type — line 170
- `AnimalKind` — type — line 25
- `AnimalLifeStage` — type — line 22
- `AnimalRole` — type — line 14
  - domain: fauna
  - role: Species taxonomy and per-kind tuning data for `AnimalAgent` — no runtime/agent state, no Three.js. Moved out of `AnimalAgent.ts` (plan fauna-017 step 1): 31% of that file was this module's data sitting above the class. Re-exported wholesale from `AnimalAgent.ts` via `export *`, so every existing importer of species types/`ANIMAL_DEFS` is unaffected.
- `AnimalSociability` — type — line 18
- `dietAcceptsItem` — function — line 256
- `LivestockProductionConfig` — type — line 214
- `LivestockProductKind` — type — line 201
- `MountPointConfig` — type — line 192
- `ScavengingConfig` — type — line 179
- `WaterTripConfig` — type — line 149

## `fauna/animalDialogue.ts`

- `pickAnimalFlavorLine` — function — line 72

## `fauna/animalForaging.ts`

- `AnimalWaterSourceProvider` — type — line 89
- `applySourceRelief` — function — line 496
- `CarcassCandidate` — type — line 182
- `carcassCandidateScore` — function — line 173
- `carcassFoodValue` — function — line 155
- `DRINK_DURATION_SEC` — const — line 64
- `EAT_DURATION_SEC` — const — line 61
- `findFoodTarget` — function — line 439
- `findForageTarget` — function — line 318
- `findGrassPatchTarget` — function — line 345
- `findHouseholdTroughTarget` — function — line 259
- `findTroughTarget` — const — line 266
- `findWaterTarget` — function — line 290
- `FOOD_INTERACTION_RANGE` — const — line 55
- `forageEdgeScore` — function — line 103
- `ForagingContext` — type — line 231
- `isCarcassEdible` — function — line 129
- `isSourceTargetValid` — function — line 451
- `selectDietFeedKind` — function — line 114
- `SOURCE_SEARCH_COOLDOWN_SEC` — const — line 68
- `SOURCE_TARGET_TIMEOUT_SEC` — const — line 73
- `SourceTarget` — type — line 200
- `SourceTargetKind` — type — line 199
- `TROUGH_DRINK_AMOUNT` — const — line 76
- `WATER_INTERACTION_RANGE` — const — line 58
- `WaterSourceRef` — type — line 81

## `fauna/animalHarvest.ts`

- `AnimalHarvestResult` — type — line 7
- `harvestAnimalIntoInventory` — function — line 29

## `fauna/AnimalLife.ts`

- `ANIMAL_STAMINA_MAX` — const — line 34
- `AnimalLifeState` — type — line 64
- `AnimalMetabolismConfig` — type — line 17
- `BIAS_STRENGTH` — const — line 52
- `consumeFood` — function — line 122
- `createAnimalLifeState` — function — line 75
- `DEFAULT_ANIMAL_METABOLISM` — const — line 39
- `drinkWater` — function — line 128
- `FOOD_RELIEF` — const — line 59
- `NEED_ELEVATED_THRESHOLD` — const — line 56
- `STAMINA_REST_THRESHOLD` — const — line 49
- `tickAnimalLife` — function — line 95
- `WATER_RELIEF` — const — line 62

## `fauna/animalMeat.ts`

- `MEAT_KIND_BY_ANIMAL` — const — line 13
- `meatKindForAnimal` — function — line 21

## `fauna/animalOwnership.ts`

- `AnimalOwner` — type — line 3
- `deriveOwnerHouseId` — function — line 12
- `isHouseholdOwned` — function — line 20
- `isPlayerOwned` — function — line 16
- `ownerFromHouseId` — function — line 8
- `ownersEqual` — function — line 24
- `parseAnimalOwnerFromRecord` — function — line 33

## `fauna/animalRoaming.ts`

- `AnimalTrip` — type — line 34
- `AnimalTripKind` — type — line 32
- `AnimalTripPhase` — type — line 33
- `findWaterTripDestination` — function — line 120
- `probeBestPointNear` — function — line 75
- `tripDayBucket` — function — line 61
- `TripDestinationContext` — type — line 104

## `fauna/AnimalSpawner.ts`

- `depletionThreshold` — function — line 93
- `DESTROY_SPAWNER_DURATION_SEC` — const — line 48
- `EMPTY_HABITAT_RESPAWN_MULTIPLIER` — const — line 52
- `MIN_RECOVERY_POPULATION` — const — line 42
- `PreySpawner` — type — line 54
- `RECOVERY_DAYS` — const — line 39
- `respawnIntervalDaysFor` — function — line 105
- `restoreSpawnPointState` — function — line 203
- `SavedSpawnPointState` — type — line 184
- `shouldDeplete` — function — line 99
- `snapshotSpawnPointState` — function — line 191
- `SPAWNER_DESTROY_BRANCH_COST` — const — line 46
- `SPAWNER_RADIUS` — const — line 87
- `SpawnerType` — type — line 12
- `SpawnPointState` — type — line 34
- `tickSpawnPointRecovery` — function — line 163
- `updateSpawners` — function — line 119
- `WOLF_DEN_ID` — const — line 18

## `fauna/bloodSplat.ts`

- `createBloodSplat` — function — line 33
- `disposeBloodSplat` — function — line 42

## `fauna/corpseDecayFx.ts`

- `animateCorpseRotFx` — function — line 61
- `createCorpseRotFx` — function — line 17
- `disposeCorpseRotFx` — function — line 70

## `fauna/createFauna.ts`

- `clearsRiverChannel` — function — line 214
- `createFauna` — function — line 448
- `Fauna` — type — line 60
- `FAUNA_URLS` — const — line 372
- `isDeerEdgeHabitat` — function — line 245
- `isNearRoadCorridor` — function — line 226
- `measureSlope` — function — line 284
- `SPAWNER_DESTROY_ACCUSATIVE` — const — line 348
- `SPAWNER_DESTROYING_GENITIVE` — const — line 356
- `SPAWNER_LABELS` — const — line 340
- `SPAWNER_RING_OFFSET` — const — line 185
- `SPAWNER_SPECS` — const — line 318
- `spawnerDestroyBusyLabel` — function — line 367
- `spawnerDestroyPromptLabel` — function — line 363
- `spawnerId` — function — line 336

## `fauna/dogGuard.ts`

- `DOG_BARK_COOLDOWN_SEC` — const — line 42
- `DOG_BARK_HOWL_RADIUS` — const — line 33
- `DOG_BARK_STRANGER_RADIUS` — const — line 38
- `DOG_GUARD_ASSIST_RADIUS` — const — line 27
- `DOG_GUARD_OWN_RADIUS` — const — line 22
- `DOG_PEST_RADIUS` — const — line 16
- `DogBarkStimulus` — type — line 129
- `DogGuardTargetResolved` — type — line 55
- `DogGuardWolfCandidate` — type — line 47
- `DogPestCandidate` — type — line 101
- `RecentVocalizeCandidate` — type — line 136
- `resolveDogBarkStimulus` — function — line 147
- `resolveDogGuardTarget` — function — line 73
- `resolveDogPestTarget` — function — line 111
- `StrangerNpcCandidate` — type — line 138

## `fauna/faunaCombat.ts`

- `combatTargetForAnimal` — function — line 88
- `damageFor` — function — line 76
- `damageVsHuman` — function — line 80
- `isMeleeTool` — function — line 72
- `MAX_HP` — const — line 9
- `MeleeToolKind` — type — line 51

## `fauna/faunaDecision.ts`

- `decideFaunaBehaviour` — function — line 136
- `FAUNA_BEHAVIOUR_PRIORITY` — const — line 71
- `FaunaBehaviourKind` — type — line 23
- `FaunaDecisionGate` — type — line 18
- `FaunaDecisionInput` — type — line 38
- `scoreFaunaBehaviours` — function — line 147

## `fauna/harvestedRemains.ts`

- `createHarvestedRemains` — function — line 151
- `createHarvestedRemainsAsync` — function — line 176
- `createNaturalRemains` — function — line 225
- `createNaturalRemainsAsync` — function — line 244
- `disposeHarvestedRemains` — function — line 253
- `largeBoneCount` — function — line 50
- `meatScrapCount` — function — line 55

## `fauna/herdCohesion.ts`

- `HERD_CLUSTER_RADIUS` — const — line 48
- `HERD_FOLLOW_RADIUS` — const — line 55
- `HERD_SPECIES` — const — line 15
- `HerdMemberLike` — type — line 73
- `HerdTightness` — type — line 10
- `JUVENILE_MATURITY_SECONDS` — const — line 69
- `JUVENILE_SCALE_FACTOR` — const — line 28
- `JUVENILE_SPAWN_CHANCE` — const — line 38
- `MOTHER_FOLLOW_RADIUS` — const — line 63
- `pickHerdLeader` — function — line 86

## `fauna/huntingHooks.ts`

- `createHuntingHooks` — function — line 101
- `huntPreferenceRank` — function — line 45
- `HuntTarget` — type — line 18
- `SettlementHuntingHooks` — type — line 24
- `shouldSkipForPopulationProtection` — function — line 74

## `fauna/livestockProduction.ts`

- `DropLivestockProductHook` — type — line 16
- `initialLivestockProductionReadyAtDays` — function — line 54
- `livestockProductionReady` — function — line 37
- `nextLivestockProductionReadyAtDays` — function — line 45

## `fauna/ownedAnimalControl.ts`

- `createDefaultOwnedAnimalControlState` — function — line 14
- `createFollowOwnedAnimalControlState` — function — line 18
- `FOLLOW_START_DISTANCE` — const — line 11
- `FOLLOW_STOP_DISTANCE` — const — line 12
- `hydrateOwnedAnimalControl` — function — line 68
- `OwnedAnimalControlMode` — type — line 2
- `OwnedAnimalControlState` — type — line 4
- `OwnedControlMovement` — type — line 22
- `resolveOwnedControlMovement` — function — line 27
- `setOwnedAnimalControlMode` — function — line 49
- `snapshotOwnedAnimalControl` — function — line 59

## `fauna/playerAwareness.ts`

- `detectionProbability` — function — line 136
- `detectionRoll` — function — line 177
- `effectiveNoticeRange` — function — line 60
- `isPlayerNoticed` — function — line 181
- `NoticeParams` — type — line 23
- `PlayerStealthState` — type — line 189
- `sneakDetectionMultiplier` — function — line 223

## `fauna/predatorHumanDecision.ts`

- `CLOSE_ATTACK_CHANCE` — const — line 84
- `countNearbyHumans` — function — line 192
- `CROWD_ATTACK_BLOCK_COUNT` — const — line 90
- `decidePredatorHumanIntent` — function — line 147
- `humanProximityFear` — function — line 99
- `hungerAttackPressure` — function — line 110
- `isAttackRollSuppressed` — function — line 115
- `NEARBY_HUMAN_RADIUS` — const — line 186
- `PredatorHumanDecisionInput` — type — line 17
- `PredatorHumanIntent` — type — line 15
- `PROVOCATION_SECONDS` — const — line 92
- `PROVOKED_FLEE_HP_RATIO` — const — line 88
- `RETALIATION_ATTACK_CHANCE` — const — line 86
- `scorePredatorHumanIntents` — function — line 119

## `fauna/preyAlertPerception.ts`

- `PREY_ALERT_RANGE_BONUS` — const — line 27
- `PreyAlertCandidate` — type — line 34
- `resolvePreyAlertThreat` — function — line 69

## `fauna/proceduralAnimals.ts`

- `createBoarModel` — function — line 80
- `createChickenModel` — function — line 206
- `createCowModel` — function — line 161
- `createDogModel` — function — line 291
- `createDonkeyModel` — function — line 148
- `createDuckModel` — function — line 55
- `createHorseModel` — function — line 108
- `createRabbitModel` — function — line 24
- `createRatModel` — function — line 324
- `createRoosterModel` — function — line 246
- `createSheepModel` — function — line 185

## `fauna/waterTraversal.ts`

- `AnimalWaterCapability` — type — line 22
- `classifyWaterTraversal` — function — line 51
- `shouldApplyDrowningDamage` — function — line 85
- `swimStaminaExertion` — function — line 75
- `wadeDepthFor` — function — line 40
- `WaterTraversalMode` — type — line 13
  - domain: fauna
  - system: water-traversal
  - role: Pure fauna-side water traversal policy (plan fauna-015) — answers "what can this species do with these physical water conditions", built on `terrain/waterSample.ts`'s species-agnostic physical answer. No Three.js/`AnimalAgent` import so the classification rules are directly unit-testable. Shared by autonomous and mounted movement alike (both read it through `AnimalAgent.isWalkable()`), so physical traversability can never diverge between the two (plan fauna-015 §8).
