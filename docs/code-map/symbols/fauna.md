# Symbols

Generated from exported TypeScript symbols.

## `fauna/AnimalAgent.ts`

- `AnimalAgent` — class — line 1062
  - domain: fauna
  - system: animal-agent
  - role: Central per-animal behaviour integration point: predator/prey AI, needs, health, production (livestock) and riding (mounts).
  - uses: HealthState, StaminaState
  - simulation: tick
- `AnimalAgentDebugInfo` — type — line 437
- `AnimalAgentDeps` — type — line 941
- `AnimalSaveState` — type — line 534
- `AnimalUpdateContext` — type — line 972
- `BURY_DURATION_SEC` — const — line 249
- `canHarvestMeatFrom` — function — line 233
- `canPredatorPursueIntoVillage` — function — line 740
- `carcassCandidateScore` — function — line 699
- `carcassFoodValue` — function — line 681
- `corpseLingerSeconds` — function — line 177
- `CorpsePhase` — type — line 185
- `corpsePhaseFromElapsed` — function — line 214
- `FAUNA_SHADOW_DISTANCE` — const — line 146
- `FaunaAiBranch` — type — line 416
- `FaunaNavRescueDebugInfo` — type — line 421
- `forageEdgeScore` — function — line 604
- `FRENZY_VILLAGE_ARRIVAL_RADIUS` — const — line 309
- `FrenzyWolfCandidate` — type — line 859
- `HARVEST_MEAT_DURATION_SEC` — const — line 252
- `HARVESTED_REMAINS_LINGER_SECONDS` — const — line 175
- `isCarcassEdible` — function — line 655
- `isRabiesCorpseContact` — function — line 901
- `isWithinVillageRadius` — function — line 721
- `NearbyNpcCandidate` — type — line 854
- `pickNearestEligibleWolf` — function — line 868
- `pickRabidTarget` — function — line 915
- `RABIES_BITE_INFECTION_CHANCE` — const — line 164
- `RABIES_CORPSE_CONTACT_RADIUS` — const — line 203
- `RABIES_CORPSE_INFECTION_CHANCE` — const — line 206
- `resolveLureTarget` — function — line 769
- `rollsRabiesInfection` — function — line 892
- `rotFxRelevant` — function — line 223
- `selectDietFeedKind` — function — line 640
- `tripDayBucket` — function — line 627
- `villageFleeBiasFalloff` — function — line 748
- `VillageInfo` — type — line 715

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

- `clearsRiverChannel` — function — line 211
- `createFauna` — function — line 445
- `Fauna` — type — line 60
- `FAUNA_URLS` — const — line 369
- `isDeerEdgeHabitat` — function — line 242
- `isNearRoadCorridor` — function — line 223
- `measureSlope` — function — line 281
- `SPAWNER_DESTROY_ACCUSATIVE` — const — line 345
- `SPAWNER_DESTROYING_GENITIVE` — const — line 353
- `SPAWNER_LABELS` — const — line 337
- `SPAWNER_RING_OFFSET` — const — line 182
- `SPAWNER_SPECS` — const — line 315
- `spawnerDestroyBusyLabel` — function — line 364
- `spawnerDestroyPromptLabel` — function — line 360
- `spawnerId` — function — line 333

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
