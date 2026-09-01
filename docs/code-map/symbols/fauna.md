# Symbols

Generated from exported TypeScript symbols.

## `fauna/AnimalAgent.ts`

- `ANIMAL_DEFS` — const — line 537
- `ANIMAL_LABELS` — const — line 455
- `AnimalAgent` — class — line 822
  - domain: fauna
  - system: animal-agent
  - role: Central per-animal behaviour integration point: predator/prey AI, needs, health, production (livestock) and riding (mounts).
  - uses: HealthState, StaminaState
  - simulation: tick
- `AnimalDef` — type — line 471
- `AnimalKind` — type — line 440
- `AnimalLifeStage` — type — line 437
- `AnimalRole` — type — line 429
- `AnimalSociability` — type — line 433
- `BURY_DURATION_SEC` — const — line 195
- `canHarvestMeatFrom` — function — line 179
- `corpseLingerSeconds` — function — line 123
- `CorpsePhase` — type — line 131
- `corpsePhaseFromElapsed` — function — line 160
- `FAUNA_SHADOW_DISTANCE` — const — line 98
- `forageEdgeScore` — function — line 367
- `FrenzyWolfCandidate` — type — line 738
- `HARVEST_MEAT_DURATION_SEC` — const — line 198
- `HARVESTED_REMAINS_LINGER_SECONDS` — const — line 121
- `isCarcassEdible` — function — line 376
- `isRabiesCorpseContact` — function — line 780
- `isWithinVillageRadius` — function — line 407
- `LivestockProductionConfig` — type — line 531
- `LivestockProductKind` — type — line 518
- `MountPointConfig` — type — line 511
- `NearbyNpcCandidate` — type — line 733
- `pickNearestEligibleWolf` — function — line 747
- `pickRabidTarget` — function — line 794
- `RABIES_BITE_INFECTION_CHANCE` — const — line 110
- `RABIES_CORPSE_CONTACT_RADIUS` — const — line 149
- `RABIES_CORPSE_INFECTION_CHANCE` — const — line 152
- `rollsRabiesInfection` — function — line 771
- `rotFxRelevant` — function — line 169
- `shoreProbeHits` — function — line 350
- `villageFleeBiasFalloff` — function — line 419
- `VillageInfo` — type — line 401

## `fauna/animalDialogue.ts`

- `pickAnimalFlavorLine` — function — line 60

## `fauna/animalHarvest.ts`

- `AnimalHarvestResult` — type — line 6
- `harvestAnimalIntoInventory` — function — line 28

## `fauna/AnimalLife.ts`

- `ANIMAL_STAMINA_MAX` — const — line 34
- `AnimalLifeState` — type — line 36
- `BIAS_STRENGTH` — const — line 22
- `consumeFood` — function — line 72
- `createAnimalLifeState` — function — line 45
- `drinkWater` — function — line 78
- `FOOD_RELIEF` — const — line 29
- `NEED_ELEVATED_THRESHOLD` — const — line 26
- `STAMINA_REST_THRESHOLD` — const — line 19
- `tickAnimalLife` — function — line 53
- `WATER_RELIEF` — const — line 32

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

- `createFauna` — function — line 369
- `Fauna` — type — line 55
- `FAUNA_URLS` — const — line 293
- `measureSlope` — function — line 205
- `SPAWNER_DESTROY_ACCUSATIVE` — const — line 269
- `SPAWNER_DESTROYING_GENITIVE` — const — line 277
- `SPAWNER_LABELS` — const — line 261
- `SPAWNER_RING_OFFSET` — const — line 159
- `SPAWNER_SPECS` — const — line 239
- `spawnerDestroyBusyLabel` — function — line 288
- `spawnerDestroyPromptLabel` — function — line 284
- `spawnerId` — function — line 257

## `fauna/faunaCombat.ts`

- `combatTargetForAnimal` — function — line 83
- `damageFor` — function — line 71
- `damageVsHuman` — function — line 75
- `isMeleeTool` — function — line 67
- `MAX_HP` — const — line 9
- `MeleeToolKind` — type — line 46

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
- `createDonkeyModel` — function — line 148
- `createDuckModel` — function — line 55
- `createHorseModel` — function — line 108
- `createRabbitModel` — function — line 24
- `createSheepModel` — function — line 185
