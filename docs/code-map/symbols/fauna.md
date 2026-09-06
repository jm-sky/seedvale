# Symbols

Generated from exported TypeScript symbols.

## `fauna/AnimalAgent.ts`

- `ANIMAL_DEFS` — const — line 1087
- `ANIMAL_LABELS` — const — line 789
- `AnimalAgent` — class — line 1506
  - domain: fauna
  - system: animal-agent
  - role: Central per-animal behaviour integration point: predator/prey AI, needs, health, production (livestock) and riding (mounts).
  - uses: HealthState, StaminaState
  - simulation: tick
- `AnimalAgentDebugInfo` — type — line 435
- `AnimalDef` — type — line 808
- `AnimalDietConfig` — type — line 912
- `AnimalKind` — type — line 767
- `AnimalLifeStage` — type — line 764
- `AnimalRole` — type — line 756
- `AnimalSaveState` — type — line 532
- `AnimalSociability` — type — line 760
- `BURY_DURATION_SEC` — const — line 237
- `canHarvestMeatFrom` — function — line 221
- `canPredatorPursueIntoVillage` — function — line 738
- `carcassCandidateScore` — function — line 697
- `carcassFoodValue` — function — line 679
- `corpseLingerSeconds` — function — line 165
- `CorpsePhase` — type — line 173
- `corpsePhaseFromElapsed` — function — line 202
- `dietAcceptsItem` — function — line 998
- `FAUNA_SHADOW_DISTANCE` — const — line 134
- `FaunaAiBranch` — type — line 414
- `FaunaNavRescueDebugInfo` — type — line 419
- `forageEdgeScore` — function — line 602
- `FRENZY_VILLAGE_ARRIVAL_RADIUS` — const — line 297
- `FrenzyWolfCandidate` — type — line 1422
- `HARVEST_MEAT_DURATION_SEC` — const — line 240
- `HARVESTED_REMAINS_LINGER_SECONDS` — const — line 163
- `isCarcassEdible` — function — line 653
- `isRabiesCorpseContact` — function — line 1464
- `isWithinVillageRadius` — function — line 719
- `LivestockProductionConfig` — type — line 956
- `LivestockProductKind` — type — line 943
- `MountPointConfig` — type — line 934
- `NearbyNpcCandidate` — type — line 1417
- `pickNearestEligibleWolf` — function — line 1431
- `pickRabidTarget` — function — line 1478
- `RABIES_BITE_INFECTION_CHANCE` — const — line 152
- `RABIES_CORPSE_CONTACT_RADIUS` — const — line 191
- `RABIES_CORPSE_INFECTION_CHANCE` — const — line 194
- `resolveLureTarget` — function — line 1013
- `rollsRabiesInfection` — function — line 1455
- `rotFxRelevant` — function — line 211
- `ScavengingConfig` — type — line 921
- `selectDietFeedKind` — function — line 638
- `tripDayBucket` — function — line 625
- `villageFleeBiasFalloff` — function — line 746
- `VillageInfo` — type — line 713
- `WaterTripConfig` — type — line 891

## `fauna/animalDebugVisual.ts`

- `AnimalDebugVisual` — type — line 29
- `AnimalDebugVisualState` — type — line 12
- `createAnimalDebugVisual` — function — line 41

## `fauna/animalDialogue.ts`

- `pickAnimalFlavorLine` — function — line 72

## `fauna/animalHarvest.ts`

- `AnimalHarvestResult` — type — line 6
- `harvestAnimalIntoInventory` — function — line 28

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

- `clearsRiverChannel` — function — line 210
- `createFauna` — function — line 444
- `Fauna` — type — line 59
- `FAUNA_URLS` — const — line 368
- `isDeerEdgeHabitat` — function — line 241
- `isNearRoadCorridor` — function — line 222
- `measureSlope` — function — line 280
- `SPAWNER_DESTROY_ACCUSATIVE` — const — line 344
- `SPAWNER_DESTROYING_GENITIVE` — const — line 352
- `SPAWNER_LABELS` — const — line 336
- `SPAWNER_RING_OFFSET` — const — line 181
- `SPAWNER_SPECS` — const — line 314
- `spawnerDestroyBusyLabel` — function — line 363
- `spawnerDestroyPromptLabel` — function — line 359
- `spawnerId` — function — line 332

## `fauna/dogGuard.ts`

- `DogBarkStimulus` — type — line 95
- `DogGuardTargetResolved` — type — line 21
- `DogGuardWolfCandidate` — type — line 13
- `DogPestCandidate` — type — line 67
- `RecentVocalizeCandidate` — type — line 102
- `resolveDogBarkStimulus` — function — line 113
- `resolveDogGuardTarget` — function — line 39
- `resolveDogPestTarget` — function — line 77
- `StrangerNpcCandidate` — type — line 104

## `fauna/faunaCombat.ts`

- `combatTargetForAnimal` — function — line 86
- `damageFor` — function — line 74
- `damageVsHuman` — function — line 78
- `isMeleeTool` — function — line 70
- `MAX_HP` — const — line 9
- `MeleeToolKind` — type — line 49

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

- `HERD_CLUSTER_RADIUS` — const — line 47
- `HERD_FOLLOW_RADIUS` — const — line 54
- `HERD_SPECIES` — const — line 14
- `HerdMemberLike` — type — line 72
- `HerdTightness` — type — line 9
- `JUVENILE_MATURITY_SECONDS` — const — line 68
- `JUVENILE_SCALE_FACTOR` — const — line 27
- `JUVENILE_SPAWN_CHANCE` — const — line 37
- `MOTHER_FOLLOW_RADIUS` — const — line 62
- `pickHerdLeader` — function — line 85

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

- `PreyAlertCandidate` — type — line 21
- `resolvePreyAlertThreat` — function — line 56

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
