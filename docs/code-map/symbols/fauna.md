# Symbols

Generated from exported TypeScript symbols.

## `fauna/AnimalAgent.ts`

- `ANIMAL_DEFS` — const — line 995
- `ANIMAL_LABELS` — const — line 744
- `AnimalAgent` — class — line 1374
  - domain: fauna
  - system: animal-agent
  - role: Central per-animal behaviour integration point: predator/prey AI, needs, health, production (livestock) and riding (mounts).
  - uses: HealthState, StaminaState
  - simulation: tick
- `AnimalAgentDebugInfo` — type — line 407
- `AnimalDef` — type — line 762
- `AnimalDietConfig` — type — line 831
- `AnimalKind` — type — line 727
- `AnimalLifeStage` — type — line 724
- `AnimalRole` — type — line 716
- `AnimalSaveState` — type — line 497
- `AnimalSociability` — type — line 720
- `BURY_DURATION_SEC` — const — line 224
- `canHarvestMeatFrom` — function — line 208
- `canPredatorPursueIntoVillage` — function — line 698
- `carcassCandidateScore` — function — line 657
- `carcassFoodValue` — function — line 639
- `corpseLingerSeconds` — function — line 152
- `CorpsePhase` — type — line 160
- `corpsePhaseFromElapsed` — function — line 189
- `dietAcceptsItem` — function — line 917
- `FAUNA_SHADOW_DISTANCE` — const — line 121
- `FaunaAiBranch` — type — line 386
- `FaunaNavRescueDebugInfo` — type — line 391
- `forageEdgeScore` — function — line 587
- `FRENZY_VILLAGE_ARRIVAL_RADIUS` — const — line 284
- `FrenzyWolfCandidate` — type — line 1290
- `HARVEST_MEAT_DURATION_SEC` — const — line 227
- `HARVESTED_REMAINS_LINGER_SECONDS` — const — line 150
- `isCarcassEdible` — function — line 613
- `isRabiesCorpseContact` — function — line 1332
- `isWithinVillageRadius` — function — line 679
- `LivestockProductionConfig` — type — line 875
- `LivestockProductKind` — type — line 862
- `MountPointConfig` — type — line 853
- `NearbyNpcCandidate` — type — line 1285
- `nearestShoreProbePoint` — function — line 571
- `pickNearestEligibleWolf` — function — line 1299
- `pickRabidTarget` — function — line 1346
- `RABIES_BITE_INFECTION_CHANCE` — const — line 139
- `RABIES_CORPSE_CONTACT_RADIUS` — const — line 178
- `RABIES_CORPSE_INFECTION_CHANCE` — const — line 181
- `resolveLureTarget` — function — line 932
- `rollsRabiesInfection` — function — line 1323
- `rotFxRelevant` — function — line 198
- `ScavengingConfig` — type — line 840
- `selectDietFeedKind` — function — line 598
- `shoreProbeHits` — function — line 551
- `villageFleeBiasFalloff` — function — line 706
- `VillageInfo` — type — line 673

## `fauna/animalDebugVisual.ts`

- `AnimalDebugVisual` — type — line 29
- `AnimalDebugVisualState` — type — line 12
- `createAnimalDebugVisual` — function — line 41

## `fauna/animalDialogue.ts`

- `pickAnimalFlavorLine` — function — line 68

## `fauna/animalHarvest.ts`

- `AnimalHarvestResult` — type — line 6
- `harvestAnimalIntoInventory` — function — line 28

## `fauna/AnimalLife.ts`

- `ANIMAL_STAMINA_MAX` — const — line 34
- `AnimalLifeState` — type — line 64
- `AnimalMetabolismConfig` — type — line 17
- `BIAS_STRENGTH` — const — line 52
- `consumeFood` — function — line 110
- `createAnimalLifeState` — function — line 75
- `DEFAULT_ANIMAL_METABOLISM` — const — line 39
- `drinkWater` — function — line 116
- `FOOD_RELIEF` — const — line 59
- `NEED_ELEVATED_THRESHOLD` — const — line 56
- `STAMINA_REST_THRESHOLD` — const — line 49
- `tickAnimalLife` — function — line 86
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

- `createFauna` — function — line 385
- `Fauna` — type — line 57
- `FAUNA_URLS` — const — line 309
- `measureSlope` — function — line 221
- `SPAWNER_DESTROY_ACCUSATIVE` — const — line 285
- `SPAWNER_DESTROYING_GENITIVE` — const — line 293
- `SPAWNER_LABELS` — const — line 277
- `SPAWNER_RING_OFFSET` — const — line 175
- `SPAWNER_SPECS` — const — line 255
- `spawnerDestroyBusyLabel` — function — line 304
- `spawnerDestroyPromptLabel` — function — line 300
- `spawnerId` — function — line 273

## `fauna/dogGuard.ts`

- `DogBarkStimulus` — type — line 65
- `DogGuardTargetResolved` — type — line 21
- `DogGuardWolfCandidate` — type — line 13
- `RecentVocalizeCandidate` — type — line 72
- `resolveDogBarkStimulus` — function — line 83
- `resolveDogGuardTarget` — function — line 39
- `StrangerNpcCandidate` — type — line 74

## `fauna/faunaCombat.ts`

- `combatTargetForAnimal` — function — line 85
- `damageFor` — function — line 73
- `damageVsHuman` — function — line 77
- `isMeleeTool` — function — line 69
- `MAX_HP` — const — line 9
- `MeleeToolKind` — type — line 48

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

## `fauna/proceduralAnimals.ts`

- `createBoarModel` — function — line 80
- `createChickenModel` — function — line 206
- `createCowModel` — function — line 161
- `createDogModel` — function — line 291
- `createDonkeyModel` — function — line 148
- `createDuckModel` — function — line 55
- `createHorseModel` — function — line 108
- `createRabbitModel` — function — line 24
- `createRoosterModel` — function — line 246
- `createSheepModel` — function — line 185
