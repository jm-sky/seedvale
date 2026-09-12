# Symbols

Generated from exported TypeScript symbols.

## `fauna/AnimalAgent.ts`

- `AnimalAgent` — class — line 888
  - domain: fauna
  - system: animal-agent
  - role: Central per-animal behaviour integration point: predator/prey AI, needs, health, production (livestock) and riding (mounts).
  - uses: HealthState, StaminaState
  - simulation: tick
- `AnimalAgentDebugInfo` — type — line 408
- `AnimalAgentDeps` — type — line 746
- `AnimalSaveState` — type — line 509
- `AnimalUpdateContext` — type — line 787
- `BURY_DURATION_SEC` — const — line 278
- `canPredatorPursueIntoVillage` — function — line 575
- `FAUNA_SHADOW_DISTANCE` — const — line 245
- `FaunaAiBranch` — type — line 387
- `FaunaNavRescueDebugInfo` — type — line 392
- `FRENZY_VILLAGE_ARRIVAL_RADIUS` — const — line 338
- `FrenzyWolfCandidate` — type — line 681
- `HARVEST_MEAT_DURATION_SEC` — const — line 281
- `isWithinVillageRadius` — function — line 556
- `NearbyNpcCandidate` — type — line 676
- `pickNearestEligibleWolf` — function — line 690
- `pickRabidTarget` — function — line 715
- `RABIES_BITE_INFECTION_CHANCE` — const — line 263
- `resolveLureTarget` — function — line 604
- `villageFleeBiasFalloff` — function — line 583
- `VillageInfo` — type — line 550

## `fauna/animalCaveHabitat.ts`

- `advanceCaveRoute` — function — line 140
  - domain: fauna
- `ANIMAL_CAPSULE_RADIUS_SCALE` — const — line 69
- `AnimalCaveContext` — type — line 42
- `animalCaveEntityDimensions` — function — line 75
- `AnimalCaveWorldContract` — type — line 18
  - domain: fauna
  - role: Fauna-owned cave habitat binding + the narrow world-cave contract it resolves against (plan fauna-019). This is the only place fauna touches cave types — `AnimalAgent`/`animalRoaming`/`animalForaging` never import `createCaves.ts`, `ChunkManager` or cave presentation; the composition root (`worldBundle.ts`) adapts the real `Caves` instance into `AnimalCaveWorldContract` before it reaches `createFauna()`.
- `AnimalHabitatBinding` — type — line 34
- `CaveRouteProgress` — type — line 113
- `resolveAnimalCaveHabitat` — function — line 91
  - domain: fauna
- `ResolvedAnimalCaveHabitat` — type — line 58

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

- `ANIMAL_DEFS` — const — line 312
- `ANIMAL_LABELS` — const — line 47
- `AnimalAffinityConfig` — type — line 162
- `AnimalDef` — type — line 66
- `AnimalDietConfig` — type — line 192
- `AnimalKind` — type — line 25
- `AnimalLifeStage` — type — line 22
- `AnimalRole` — type — line 14
  - domain: fauna
  - role: Species taxonomy and per-kind tuning data for `AnimalAgent` — no runtime/agent state, no Three.js. Moved out of `AnimalAgent.ts` (plan fauna-017 step 1): 31% of that file was this module's data sitting above the class. Re-exported wholesale from `AnimalAgent.ts` via `export *`, so every existing importer of species types/`ANIMAL_DEFS` is unaffected.
- `AnimalSociability` — type — line 18
- `dietAcceptsItem` — function — line 290
- `DraftConfig` — type — line 219
- `LeadConfig` — type — line 213
- `LivestockProductionConfig` — type — line 248
- `LivestockProductKind` — type — line 235
- `MountPointConfig` — type — line 226
- `ScavengingConfig` — type — line 201
- `WaterTripConfig` — type — line 171

## `fauna/animalDialogue.ts`

- `pickAnimalFlavorLine` — function — line 72

## `fauna/animalForaging.ts`

- `AnimalWaterSourceProvider` — type — line 93
- `applySourceRelief` — function — line 570
- `canAcceptHandFeed` — function — line 140
- `CarcassCandidate` — type — line 220
- `carcassCandidateScore` — function — line 211
- `carcassFoodValue` — function — line 193
- `dietItemReliefScale` — function — line 130
- `DRINK_DURATION_SEC` — const — line 68
- `EAT_DURATION_SEC` — const — line 65
- `findFoodTarget` — function — line 508
- `findForageTarget` — function — line 387
- `findGrassPatchTarget` — function — line 414
- `findHouseholdTroughTarget` — function — line 327
- `findTroughTarget` — const — line 334
- `findWaterTarget` — function — line 359
- `FOOD_INTERACTION_RANGE` — const — line 59
- `forageEdgeScore` — function — line 107
- `ForagingContext` — type — line 269
- `isCarcassEdible` — function — line 167
- `isDrinkableNaturalShorePoint` — function — line 303
- `isSourceTargetValid` — function — line 520
- `selectDietFeedKind` — function — line 118
- `SOURCE_SEARCH_COOLDOWN_SEC` — const — line 72
- `SOURCE_TARGET_TIMEOUT_SEC` — const — line 77
- `SourceTarget` — type — line 238
- `SourceTargetKind` — type — line 237
- `TROUGH_DRINK_AMOUNT` — const — line 80
- `tryCommitHandFeed` — function — line 151
- `WATER_INTERACTION_RANGE` — const — line 62
- `WaterSourceRef` — type — line 85

## `fauna/animalHarvest.ts`

- `AnimalHarvestResult` — type — line 7
- `harvestAnimalIntoInventory` — function — line 29

## `fauna/animalHumanAffinity.ts`

- `AnimalAffinitySaveEntry` — type — line 16
- `applyAffinityGain` — function — line 25
- `clampAffinity` — function — line 20
- `deserializeHumanAffinity` — function — line 46
- `FAUNA_PLAYER_HUMAN_ID` — const — line 9
  - domain: fauna
  - role: Stable human identity + sparse per-animal affinity helpers (plan fauna-013). Affinity is individual animal → concrete person; it does not replace `ownerHouseId` / household familiarity.
- `faunaNpcHumanId` — function — line 12
- `isAffinityTrusted` — function — line 37
- `serializeHumanAffinity` — function — line 41
- `SparseHumanAffinity` — type — line 18

## `fauna/animalLead.ts`

- `hitchDistanceFor` — function — line 37
- `isDraftDef` — function — line 25
- `isLeadableDef` — function — line 21
  - domain: fauna
  - role: Temporary player↔animal lead relation helpers. Presence of `AnimalDef.lead` is the leadable capability; this module never branches on `kind === 'horse'`.
- `LEAD_START_DISTANCE` — const — line 8
- `LEAD_STOP_DISTANCE` — const — line 9
- `LeadMovement` — type — line 11
- `leadStartDistance` — function — line 29
- `leadStopDistance` — function — line 33
- `resolveLeadMovement` — function — line 41

## `fauna/AnimalLife.ts`

- `ANIMAL_STAMINA_MAX` — const — line 44
- `AnimalLifeState` — type — line 74
- `AnimalMetabolismConfig` — type — line 18
- `BIAS_STRENGTH` — const — line 62
- `consumeFood` — function — line 132
- `createAnimalLifeState` — function — line 85
- `DEFAULT_ANIMAL_METABOLISM` — const — line 49
- `drinkWater` — function — line 138
- `FOOD_RELIEF` — const — line 69
- `NEED_ELEVATED_THRESHOLD` — const — line 66
- `STAMINA_REST_THRESHOLD` — const — line 59
- `tickAnimalLife` — function — line 105
- `WATER_RELIEF` — const — line 72

## `fauna/animalMeat.ts`

- `MEAT_KIND_BY_ANIMAL` — const — line 13
- `meatKindForAnimal` — function — line 21

## `fauna/animalNames.ts`

- `HORSE_NAMES` — const — line 1
- `horseNameForAnimal` — function — line 27

## `fauna/animalNaturalWater.ts`

- `createNaturalWaterKindAt` — function — line 18
- `NaturalWaterKindSamplerDeps` — type — line 7

## `fauna/animalNeedArbitration.ts`

- `distanceXZ` — function — line 24
- `isNeedCritical` — function — line 13
- `NEED_CRITICAL_THRESHOLD` — const — line 4
- `OWNED_NEED_LEASH_RADIUS` — const — line 8
- `shouldDeferNeedsForLead` — function — line 18
- `STAY_NEED_LEASH_RADIUS` — const — line 11

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
- `findSettlementOutskirtsDestination` — function — line 125
- `findWaterTripDestination` — function — line 151
- `probeBestPointNear` — function — line 75
- `tripDayBucket` — function — line 61
- `TripDestinationContext` — type — line 104

## `fauna/AnimalSpawner.ts`

- `defaultSpawnPointScenarioFields` — function — line 256
- `depletionThreshold` — function — line 114
- `DESTROY_SPAWNER_DURATION_SEC` — const — line 56
- `EMPTY_HABITAT_RESPAWN_MULTIPLIER` — const — line 60
- `MIN_RECOVERY_POPULATION` — const — line 50
- `PreySpawner` — type — line 62
- `RECOVERY_DAYS` — const — line 47
- `respawnIntervalDaysFor` — function — line 126
- `restoreSpawnPointState` — function — line 242
- `SavedSpawnPointState` — type — line 215
- `shouldDeplete` — function — line 120
- `snapshotSpawnPointState` — function — line 226
- `SPAWNER_DESTROY_BRANCH_COST` — const — line 54
- `SPAWNER_RADIUS` — const — line 108
- `SpawnerType` — type — line 20
- `SpawnPointState` — type — line 42
- `tickSpawnPointRecovery` — function — line 193
- `updateSpawners` — function — line 143
- `WOLF_DEN_ID` — const — line 26

## `fauna/bloodSplat.ts`

- `createBloodSplat` — function — line 33
- `disposeBloodSplat` — function — line 42

## `fauna/corpseDecayFx.ts`

- `animateCorpseRotFx` — function — line 61
- `createCorpseRotFx` — function — line 17
- `disposeCorpseRotFx` — function — line 70

## `fauna/createFauna.ts`

- `clearsRiverChannel` — function — line 246
- `createFauna` — function — line 506
- `Fauna` — type — line 85
- `FAUNA_URLS` — const — line 430
- `findHomeCaveSpawner` — function — line 389
- `isDeerEdgeHabitat` — function — line 277
- `isNearRoadCorridor` — function — line 258
- `measureSlope` — function — line 316
- `SPAWNER_DESTROY_ACCUSATIVE` — const — line 406
- `SPAWNER_DESTROYING_GENITIVE` — const — line 414
- `SPAWNER_LABELS` — const — line 398
- `SPAWNER_RING_OFFSET` — const — line 217
- `SPAWNER_SPECS` — const — line 352
- `spawnerDestroyBusyLabel` — function — line 425
- `spawnerDestroyPromptLabel` — function — line 421
- `spawnerId` — function — line 382

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
- `resolveDogBarkStimulus` — function — line 155
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

## `fauna/followHysteresis.ts`

- `FollowHysteresisResult` — type — line 10
- `FollowHysteresisState` — type — line 6
- `resolveFollowHysteresis` — function — line 18
  - domain: fauna
  - role: Distance-band follow commitment used by owned Follow and leading.

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
- `initialLivestockProductionReadyAtDays` — function — line 58
- `livestockProductionReady` — function — line 37
- `nextLivestockProductionReadyAtDays` — function — line 49
- `WOOL_GROWTH_DAYS` — const — line 42
- `WOOL_YIELD` — const — line 43

## `fauna/ownedAnimalControl.ts`

- `createDefaultOwnedAnimalControlState` — function — line 16
- `createFollowOwnedAnimalControlState` — function — line 20
- `FOLLOW_START_DISTANCE` — const — line 13
- `FOLLOW_STOP_DISTANCE` — const — line 14
- `hydrateOwnedAnimalControl` — function — line 69
- `OwnedAnimalControlMode` — type — line 4
- `OwnedAnimalControlState` — type — line 6
- `OwnedControlMovement` — type — line 24
- `resolveOwnedControlMovement` — function — line 29
- `setOwnedAnimalControlMode` — function — line 50
- `snapshotOwnedAnimalControl` — function — line 60

## `fauna/persistentOccupants.ts`

- `createPersistentOccupantRegistry` — function — line 90
- `EMPTY_PERSISTENT_OCCUPANT_SNAPSHOT` — const — line 31
- `ordinaryHabitatCapacity` — function — line 50
- `persistentAnimalId` — function — line 45
- `PersistentOccupantDecl` — type — line 12
  - domain: fauna
  - system: persistent-habitat-occupants
  - role: Sparse fauna-owned identity/persistence for wild animals bound to a stable habitat slot (plan fauna-018) — serializable types, stable keys, and registry operations. Not a simulation manager: real `AnimalAgent` instances still come from `createFauna()`.
- `PersistentOccupantRegistry` — type — line 78
- `persistentOccupantRestoreAction` — function — line 64
- `PersistentOccupantRestoreAction` — type — line 54
- `PersistentOccupantSaveRecord` — type — line 18
- `persistentOccupantSlotKey` — function — line 37
- `PersistentOccupantSnapshot` — type — line 26

## `fauna/playerAwareness.ts`

- `detectionProbability` — function — line 136
- `detectionRoll` — function — line 177
- `effectiveNoticeRange` — function — line 60
- `isPlayerNoticed` — function — line 181
- `NoticeParams` — type — line 23
- `PlayerStealthState` — type — line 189
- `sneakDetectionMultiplier` — function — line 223

## `fauna/predatorHumanDecision.ts`

- `CLOSE_ATTACK_CHANCE` — const — line 87
- `countNearbyHumans` — function — line 199
- `CROWD_ATTACK_BLOCK_COUNT` — const — line 93
- `decidePredatorHumanIntent` — function — line 154
- `humanProximityFear` — function — line 102
- `hungerAttackPressure` — function — line 113
- `isAttackRollSuppressed` — function — line 118
- `NEARBY_HUMAN_RADIUS` — const — line 193
- `PredatorHumanDecisionInput` — type — line 17
- `PredatorHumanIntent` — type — line 15
- `PROVOCATION_SECONDS` — const — line 95
- `PROVOKED_FLEE_HP_RATIO` — const — line 91
- `RETALIATION_ATTACK_CHANCE` — const — line 89
- `scorePredatorHumanIntents` — function — line 122

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

## `fauna/shepherdFlock.ts`

- `FLOCK_SEPARATION_RANGE` — const — line 18
- `FLOCK_THREAT_RADIUS` — const — line 20
- `FlockThreatCandidate` — type — line 103
- `ownedFlockCentroid` — function — line 84
- `ownedSheepOf` — function — line 46
  - domain: fauna
- `OwnedSheepView` — type — line 22
- `selectReadyOwnedSheep` — function — line 56
- `selectSeparatedOwnedSheep` — function — line 64
- `senseOwnedFlockThreat` — function — line 118
  - domain: fauna
- `SHEARING_RANGE` — const — line 16
- `SHEPHERD_FLOCK_MAX` — const — line 11
- `SHEPHERD_FLOCK_MIN` — const — line 10
  - domain: fauna
- `SHEPHERD_FLOCK_SALT` — const — line 13
- `ShepherdFlockHooks` — type — line 36
- `shepherdFlockSize` — function — line 99
- `ShepherdSheepHandle` — type — line 31

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

## `fauna/wolfDenScenario.ts`

- `activateWolfDenProblem` — function — line 69
- `canOfferSettlementTrip` — function — line 74
- `effectiveMaxPreyCount` — function — line 21
- `effectiveRespawnIntervalDays` — function — line 27
- `isQuestSpawnPointPermanentlyDestroyed` — function — line 53
- `isWolfDenPermanentlyDestroyed` — function — line 32
- `isWolfDenPressureProblem` — function — line 43
  - domain: fauna
- `lerp` — function — line 15
- `matchesQuestSpawnPointId` — function — line 48
- `recordSettlementTripOpportunity` — function — line 81
- `SETTLEMENT_TRIP_COOLDOWN_DAYS` — const — line 12
- `SETTLEMENT_TRIP_STAY_SEC` — const — line 13
- `shouldActivateWolfDenProblem` — function — line 62
- `WOLF_DEN_ACTIVE_PRESSURE` — const — line 10
- `WOLF_DEN_PROBLEM_START_DAY` — const — line 9
  - domain: fauna World-owned wolf-den pressure scenario (plan quests-progression-007) — pure helpers over `PreySpawner` fields; activation/trips stay in `createFauna.ts`.
