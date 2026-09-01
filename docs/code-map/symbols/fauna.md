# Symbols

Generated from exported TypeScript symbols.

## `fauna/AnimalAgent.ts`

- `ANIMAL_DEFS` — const — line 650
- `ANIMAL_LABELS` — const — line 568
- `AnimalAgent` — class — line 935
  - domain: fauna
  - system: animal-agent
  - role: Central per-animal behaviour integration point: predator/prey AI, needs, health, production (livestock) and riding (mounts).
  - uses: HealthState, StaminaState
  - simulation: tick
- `AnimalAgentDebugInfo` — type — line 375
- `AnimalDef` — type — line 584
- `AnimalKind` — type — line 553
- `AnimalLifeStage` — type — line 550
- `AnimalRole` — type — line 542
- `AnimalSociability` — type — line 546
- `BURY_DURATION_SEC` — const — line 201
- `canHarvestMeatFrom` — function — line 185
- `corpseLingerSeconds` — function — line 129
- `CorpsePhase` — type — line 137
- `corpsePhaseFromElapsed` — function — line 166
- `FAUNA_SHADOW_DISTANCE` — const — line 104
- `FaunaAiBranch` — type — line 341
- `FaunaNavRescueDebugInfo` — type — line 359
- `forageEdgeScore` — function — line 480
- `FRENZY_VILLAGE_ARRIVAL_RADIUS` — const — line 261
- `FrenzyWolfCandidate` — type — line 851
- `HARVEST_MEAT_DURATION_SEC` — const — line 204
- `HARVESTED_REMAINS_LINGER_SECONDS` — const — line 127
- `isCarcassEdible` — function — line 489
- `isRabiesCorpseContact` — function — line 893
- `isWithinVillageRadius` — function — line 520
- `LivestockProductionConfig` — type — line 644
- `LivestockProductKind` — type — line 631
- `MountPointConfig` — type — line 624
- `NearbyNpcCandidate` — type — line 846
- `nearestShoreProbePoint` — function — line 464
- `pickNearestEligibleWolf` — function — line 860
- `pickRabidTarget` — function — line 907
- `RABIES_BITE_INFECTION_CHANCE` — const — line 116
- `RABIES_CORPSE_CONTACT_RADIUS` — const — line 155
- `RABIES_CORPSE_INFECTION_CHANCE` — const — line 158
- `rollsRabiesInfection` — function — line 884
- `rotFxRelevant` — function — line 175
- `shoreProbeHits` — function — line 444
- `villageFleeBiasFalloff` — function — line 532
- `VillageInfo` — type — line 514

## `fauna/animalDebugVisual.ts`

- `AnimalDebugVisual` — type — line 29
- `AnimalDebugVisualState` — type — line 12
- `createAnimalDebugVisual` — function — line 41

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

- `createFauna` — function — line 370
- `Fauna` — type — line 55
- `FAUNA_URLS` — const — line 294
- `measureSlope` — function — line 206
- `SPAWNER_DESTROY_ACCUSATIVE` — const — line 270
- `SPAWNER_DESTROYING_GENITIVE` — const — line 278
- `SPAWNER_LABELS` — const — line 262
- `SPAWNER_RING_OFFSET` — const — line 160
- `SPAWNER_SPECS` — const — line 240
- `spawnerDestroyBusyLabel` — function — line 289
- `spawnerDestroyPromptLabel` — function — line 285
- `spawnerId` — function — line 258

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
