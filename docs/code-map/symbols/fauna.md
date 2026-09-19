# Symbols

Generated from exported TypeScript symbols.

## `fauna/animalActivity.ts`

- `ActivityRestInput` — type — line 17
- `activityRestPressure` — function — line 120
- `AnimalActivityProfile` — type — line 15
  - domain: fauna
  - role: Pure day/night activity-cycle bias for routine wild-fauna rest (plan fauna-034 §1/§2) — answers "how strongly does this species want to rest right now", never who/where it rests (that stays `AnimalAgent`'s own home-return/idle execution in `pursueRoutineRest()`) and never a schedule/FSM: identical inputs always produce the identical answer. Hunger/thirst/threat/flee/trip branches all run before this is ever consulted (`AnimalAgent.updatePredator`/`updatePrey`), so this only ever expresses a *bias*, never a fixed clock-driven behaviour.
- `restPhaseOffset` — function — line 104
- `RoutineRestInput` — type — line 108
- `shouldRoutineRest` — function — line 136
- `timeOfDayRestPressure` — function — line 57

## `fauna/AnimalAgent.ts`

- `AnimalAgent` — class — line 1171
  - domain: fauna
  - system: animal-agent
  - role: Central per-animal behaviour integration point: predator/prey AI, needs, health, production (livestock) and riding (mounts).
  - uses: HealthState, StaminaState
  - simulation: tick
- `AnimalAgentDebugInfo` — type — line 597
- `AnimalAgentDeps` — type — line 956
- `AnimalSaveState` — type — line 730
- `AnimalUpdateContext` — type — line 1028
- `BURY_DURATION_SEC` — const — line 410
- `canPredatorPursueIntoVillage` — function — line 814
- `FAUNA_SHADOW_DISTANCE` — const — line 379
- `FaunaAiBranch` — type — line 534
- `FaunaNavRescueDebugInfo` — type — line 581
- `FRENZY_VILLAGE_ARRIVAL_RADIUS` — const — line 469
- `FrenzyWolfCandidate` — type — line 891
- `HARVEST_MEAT_DURATION_SEC` — const — line 413
- `isWithinVillageRadius` — function — line 795
- `NearbyNpcCandidate` — type — line 886
- `pickNearestEligibleWolf` — function — line 900
- `pickRabidTarget` — function — line 925
- `RABIES_BITE_INFECTION_CHANCE` — const — line 397
- `villageFleeBiasFalloff` — function — line 822
- `VillageInfo` — type — line 789

## `fauna/animalAreaBound.ts`

- `clampIntoFencedArea` — function — line 35
- `FencedAreaBound` — type — line 9
  - domain: settlements
- `fencedAreaWanderBand` — function — line 54
- `hasExitedFencedArea` — function — line 50
- `isInEntranceCorridor` — function — line 27
- `isInsideFencedArea` — function — line 18

## `fauna/animalAttraction.ts`

- `activeIgnoredAttractionIds` — function — line 272
- `ATTRACTION_IGNORE_CAP` — const — line 38
- `attractionScore` — function — line 84
- `BLOOD_ATTRACTION_RADIUS` — const — line 26
- `BLOOD_IGNORE_SEC` — const — line 34
- `BLOOD_INVESTIGATE_SEC` — const — line 36
- `bloodAttractionSource` — function — line 189
- `bloodAttractionStrength` — function — line 64
- `buildAttractionSnapshot` — function — line 211
- `canSenseBlood` — function — line 59
- `droppedFoodAttractionSource` — function — line 167
- `FOOD_ATTRACTION_RADIUS` — const — line 24
  - domain: fauna
  - role: Pure species compatibility + scoring for systemic animal attraction (plan fauna-023) — trap bait, dropped food and blood traces share one resolver. World producers only emit plain `AnimalAttractionSource` snapshots; this module never steers agents or owns world state.
- `FOOD_STRENGTH_FRESH` — const — line 28
- `FOOD_STRENGTH_MEDIUM` — const — line 29
- `FOOD_STRENGTH_SPOILED_MEAT` — const — line 30
- `foodAttractionStrength` — function — line 42
- `isAttractionCompatible` — function — line 70
- `isDroppedFoodStillAttractive` — function — line 236
- `markAttractionIgnored` — function — line 247
- `pruneAttractionIgnored` — function — line 266
- `resolveAttractionTarget` — function — line 106
- `TRAP_BAIT_STRENGTH` — const — line 31
- `trapBaitAttractionSource` — function — line 139

## `fauna/animalCaveHabitat.ts`

- `advanceCaveRoute` — function — line 205
  - domain: fauna
- `ANIMAL_CAPSULE_RADIUS_SCALE` — const — line 103
- `AnimalCaveContext` — type — line 71
- `animalCaveEntityDimensions` — function — line 109
- `AnimalCaveWorldContract` — type — line 19
  - domain: fauna
  - role: Fauna-owned cave habitat binding + the narrow world-cave contract it resolves against (plan fauna-019). This is the only place fauna touches cave types — `AnimalAgent`/`animalRoaming`/`animalForaging` never import `createCaves.ts`, `ChunkManager` or cave presentation; the composition root (`worldBundle.ts`) adapts the real `Caves` instance into `AnimalCaveWorldContract` before it reaches `createFauna()`.
- `AnimalHabitatBinding` — type — line 46
- `CaveRouteProgress` — type — line 178
- `EnvironmentalAnimalFoodSource` — type — line 52
- `EnvironmentalCaveWaterSource` — type — line 61
- `resolveAnimalCaveHabitat` — function — line 125
  - domain: fauna
- `ResolvedAnimalCaveHabitat` — type — line 92

## `fauna/animalCorpse.ts`

- `advanceAnimalCorpse` — function — line 432
- `AnimalCorpseState` — type — line 125
- `buryCorpse` — function — line 237
- `canHarvestMeatFrom` — function — line 90
- `claimCorpseAsFood` — function — line 460
- `claimCorpseForCleanup` — function — line 478
- `CORPSE_BONES_ONSET_DAYS` — const — line 35
- `CORPSE_REMOVE_DAYS` — const — line 37
- `CORPSE_ROT_ONSET_DAYS` — const — line 33
- `corpseElapsedDays` — function — line 72
- `CorpseHost` — type — line 209
- `corpseLingerDays` — function — line 41
- `CorpseNeighbour` — type — line 225
- `CorpsePhase` — type — line 30
  - domain: fauna
  - role: Corpse/remains/decay/rot-FX/rabies-exposure/food-claim state machine for one dead `AnimalAgent` (plan fauna-017 step 5, review E3) — plain state plus free functions over an explicit `CorpseHost`, mirroring how `AnimalLife.ts` owns `AnimalLifeState` without owning the animal. Not a second entity: `health.dead` stays authoritative on `AnimalAgent`, and every public method there (`bury`, `harvestMeat`, `corpsePhase`, `claimAsFood`, …) stays a thin delegate into this module, so no cross- agent call shape changes.
- `corpsePhaseFromElapsed` — function — line 68
- `corpseReadyToRemove` — function — line 243
- `createAnimalCorpseState` — function — line 184
- `disposeAnimalCorpse` — function — line 504
- `disposeAnimalCorpseRotFx` — function — line 422
- `harvestCorpseMeat` — function — line 309
- `HARVESTED_REMAINS_LINGER_DAYS` — const — line 39
- `hideLivingVisual` — function — line 256
- `isRabiesCorpseContact` — function — line 113
- `markCorpseFoodConsumed` — function — line 495
- `RABIES_CORPSE_CONTACT_RADIUS` — const — line 57
- `RABIES_CORPSE_INFECTION_CHANCE` — const — line 60
- `releaseCorpseClaim` — function — line 468
- `releaseCorpseCleanupClaim` — function — line 487
- `rollsRabiesInfection` — function — line 104
- `rotFxRelevant` — function — line 80
- `showLivingVisual` — function — line 261
- `spawnDeathSplat` — function — line 327
- `spawnHarvestedRemains` — function — line 291

## `fauna/animalDebugVisual.ts`

- `AnimalDebugVisual` — type — line 29
- `AnimalDebugVisualState` — type — line 12
- `createAnimalDebugVisual` — function — line 41

## `fauna/animalDefs.ts`

- `ANIMAL_DEFS` — const — line 424
- `ANIMAL_LABELS` — const — line 51
- `AnimalActivityConfig` — type — line 234
- `AnimalAffinityConfig` — type — line 247
- `AnimalDef` — type — line 70
- `AnimalDietConfig` — type — line 277
- `AnimalKind` — type — line 29
- `AnimalLifeStage` — type — line 24
- `AnimalRole` — type — line 16
  - domain: fauna
  - role: Species taxonomy and per-kind tuning data for `AnimalAgent` — no runtime/agent state, no Three.js. Moved out of `AnimalAgent.ts` (plan fauna-017 step 1): 31% of that file was this module's data sitting above the class. Re-exported wholesale from `AnimalAgent.ts` via `export *`, so every existing importer of species types/`ANIMAL_DEFS` is unaffected.
- `AnimalSociability` — type — line 20
- `dietAcceptsItem` — function — line 402
- `DraftConfig` — type — line 308
- `HumanDangerConfig` — type — line 208
- `LeadConfig` — type — line 302
- `LivestockProductionConfig` — type — line 337
- `LivestockProductKind` — type — line 324
- `MountPointConfig` — type — line 315
- `PackConfig` — type — line 224
- `ScavengingConfig` — type — line 288
- `WaterTripConfig` — type — line 256

## `fauna/animalDialogue.ts`

- `pickAnimalFlavorLine` — function — line 72

## `fauna/animalForaging.ts`

- `AnimalWaterSourceProvider` — type — line 99
- `applySourceRelief` — function — line 730
- `canAcceptHandFeed` — function — line 146
- `CARCASS_EAT_DURATION_SEC` — const — line 73
- `CarcassCandidate` — type — line 231
- `carcassCandidateScore` — function — line 222
- `carcassFoodValue` — function — line 200
- `dietItemReliefScale` — function — line 136
- `DRINK_DURATION_SEC` — const — line 69
- `EAT_DURATION_SEC` — const — line 66
- `findFoodTarget` — function — line 641
- `findForageTarget` — function — line 507
- `findGrassPatchTarget` — function — line 535
- `findHouseholdTroughTarget` — function — line 397
- `findTroughTarget` — const — line 421
- `findWaterTarget` — function — line 477
- `FOOD_INTERACTION_RANGE` — const — line 60
- `forageEdgeScore` — function — line 113
- `ForagingContext` — type — line 309
- `isCarcassEdible` — function — line 173
- `isDrinkableNaturalShorePoint` — function — line 366
- `isSourceTargetValid` — function — line 656
- `selectDietFeedKind` — function — line 124
- `SOURCE_SEARCH_COOLDOWN_SEC` — const — line 77
- `SOURCE_TARGET_TIMEOUT_SEC` — const — line 82
- `sourceActionDuration` — function — line 299
  - domain: fauna
- `SourceTarget` — type — line 249
- `SourceTargetKind` — type — line 248
- `TROUGH_DRINK_AMOUNT` — const — line 85
- `tryCommitHandFeed` — function — line 157
- `WATER_INTERACTION_RANGE` — const — line 63
- `WaterSourceRef` — type — line 90

## `fauna/animalHarvest.ts`

- `AnimalHarvestResult` — type — line 8
- `harvestAnimalIntoInventory` — function — line 32

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

## `fauna/animalHumanDanger.ts`

- `AnimalHumanDangerState` — type — line 11
  - domain: fauna
  - role: Fauna-owned pure resolver for one live animal's projected danger to a human bystander (plan npc-057 §1) — the single authority the destination-threat hook (`destinationThreatHooks.ts`) reads instead of duplicating species/behaviour knowledge in `ai/`.
- `resolveHumanDangerProjection` — function — line 34

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

## `fauna/animalPack.ts`

- `animalPackGroundContainerId` — function — line 98
- `AnimalPackSnapshot` — type — line 29
- `AnimalPackState` — type — line 20
  - domain: fauna
  - role: Runtime/persistence mechanics for the equipped-saddlebags pack capability (plan fauna-039) — pure domain data plus a small set of transaction helpers, no Three.js and no app/UI wiring. `AnimalAgent` stays the lifecycle owner (holds one `AnimalPackState | null` field, attaches/detaches the presentation) and delegates the actual state transitions here.
- `canEquipAnimalPack` — function — line 81
- `canUnequipAnimalPack` — function — line 88
- `createAnimalPack` — function — line 47
- `detachAnimalPack` — function — line 73
- `hydrateAnimalPack` — function — line 56
- `resolveDroppedPackPosition` — function — line 109
- `snapshotAnimalPack` — function — line 64

## `fauna/animalPackPresentation.ts`

- `createSaddlebagsAttachment` — function — line 40
- `disposeSaddlebagsAttachment` — function — line 51
- `SADDLEBAGS_PLACEMENT` — const — line 23
- `SaddlebagsPlacement` — type — line 15
  - domain: fauna
  - role: Manual, per-species visual transform for the attached saddlebags model (plan fauna-039 §8/§9) — deliberately separate from `AnimalDef.pack` (gameplay capacity). Presentation never gates or influences gameplay: a missing/zeroed entry still attaches the model at the animal's own origin, and a GLB load failure only ever falls back to `createItemMesh`'s procedural stand-in (never affects pack truth).

## `fauna/animalRoaming.ts`

- `AnimalTrip` — type — line 34
- `AnimalTripKind` — type — line 32
- `AnimalTripPhase` — type — line 33
- `findSettlementOutskirtsDestination` — function — line 125
- `findStrayReturnDestination` — function — line 187
- `findWaterTripDestination` — function — line 151
- `probeBestPointNear` — function — line 75
- `StrayReturnDestinationContext` — type — line 173
- `tripDayBucket` — function — line 61
- `TripDestinationContext` — type — line 104

## `fauna/animalScare.ts`

- `AnimalScareContext` — type — line 18
- `AnimalScareSource` — type — line 8
  - domain: fauna
- `AnimalScareStimulus` — type — line 10
- `DEFAULT_FEAR_BASELINE` — const — line 29
- `scareFleeDurationSec` — function — line 98
- `scareFleeOrigin` — function — line 109
  - domain: fauna
- `scareProbability` — function — line 72
  - domain: fauna
- `scareRoll` — function — line 58
  - domain: fauna
- `shouldScare` — function — line 91
  - domain: fauna

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

## `fauna/animalStray.ts`

- `AnimalStrayState` — type — line 12
  - domain: fauna
- `beginStrayState` — function — line 262
  - domain: fauna
  - role: Starts a stray episode record. Idempotent: an already-active or previously-ended episode is left untouched so restore/materialization cannot redisplace the same animal.
- `classifyLostLivestock` — function — line 309
  - domain: fauna
  - role: Classifies one livestock individual for quest/world lookup.
- `clearStrayEpisode` — function — line 284
  - domain: fauna
  - role: Ends the live episode, drops survival assist/lead-relevant flags, and keeps origin so a later start is refused.
- `createEmptyStrayState` — function — line 98
  - domain: fauna
  - role: Creates the inactive stray sentinel used before an episode starts.
- `hydrateStrayState` — function — line 337
- `inspectStrayedCorpseState` — function — line 297
  - domain: fauna
  - role: Marks a dead strayed animal as inspected. Does not harvest or remove.
- `isAnimalStraySave` — function — line 348
- `isEligibleLostLivestock` — function — line 157
  - domain: fauna
  - role: Eligibility for starting a new stray episode on an existing individual.
- `isStrayedAnimalReturned` — function — line 131
  - domain: fauna
  - role: Pure return predicate — alive strayed livestock inside the stored origin/home radius ends the episode.
- `isStrayEpisodeActive` — function — line 106
  - domain: fauna
  - role: True while this animal currently has a live stray episode.
- `isStraySurvivalAssistActive` — function — line 114
  - domain: fauna
  - role: Survival-assist gate. Never true for ordinary animals.
- `LivestockStrayCandidate` — type — line 64
- `LostLivestockSourceStatus` — type — line 26
  - domain: fauna
- `predatorPressureAt` — function — line 209
- `selectLostLivestock` — function — line 188
  - domain: fauna
  - role: Deterministic pick of an existing household livestock id. Never invents a new identity. Prefers sheep when any are eligible.
- `selectStrayDisplacementTarget` — function — line 230
  - domain: fauna
  - role: Bounded one-shot destination probe. Invalid terrain is rejected; predator pressure is a score penalty, never a hard exclusion. Falls back to the best valid candidate when every probe still has nearby predators.
- `shouldBeginNaturalStray` — function — line 387
  - domain: fauna
  - role: True once sustained out-of-band displacement has cleared the grace window — the caller's cue to begin a natural (non-quest) stray episode.
- `shouldRetainStrayedCorpse` — function — line 146
  - domain: fauna
  - role: Extra stray-corpse TTL — always false since fauna-029; natural world-time linger is the dispose clock. Inspect stays a quest flag.
- `snapshotStrayState` — function — line 324
- `STRAY_CLASSIFICATION_GRACE_SECONDS` — const — line 62
- `STRAY_CORPSE_RETENTION_SECONDS` — const — line 53
- `STRAY_FLEE_RANGE_BONUS` — const — line 44
- `STRAY_FLEE_SPEED_MULT` — const — line 46
- `STRAY_MAX_DISTANCE` — const — line 38
- `STRAY_MIN_DISTANCE` — const — line 37
- `STRAY_PREDATOR_PRESSURE_RADIUS` — const — line 40
- `STRAY_PREDATOR_SCORE_PENALTY` — const — line 41
- `STRAY_PROBE_ATTEMPTS` — const — line 39
- `STRAY_RETURN_RADIUS` — const — line 34
- `StrayDisplacementContext` — type — line 81
- `strayEpisodeSeed` — function — line 361
- `straySurvivalFleeRangeBonus` — function — line 118
- `straySurvivalFleeSpeedMultiplier` — function — line 122
- `tickStrayClassificationGrace` — function — line 372
  - domain: fauna
  - role: Natural-stray grace accumulator (plan fauna-025) — resets the instant the animal is back inside `minDistance` of its own home/wander anchor, so a short flee that ends back near home never latches, while a sustained displacement accumulates toward `shouldBeginNaturalStray`.

## `fauna/animalTerritory.ts`

- `AnimalHabitatContext` — type — line 31
- `TerritorialConfig` — type — line 20
  - domain: fauna
  - role: Pure territorial/den-defense eligibility + distance falloff (plan fauna-034 §4/§7) — answers "how strongly should this predator defend its existing habitat against this human", never *who* to attack/flee (that stays `predatorHumanDecision.ts`'s job, composed via `PredatorHumanDecisionInput.territorialDefense`) and never *where* the den is (that stays `AnimalSpawner`/`createFauna.ts`'s existing spawner identity — this module never mutates or looks up a spawner itself).
- `territorialDefenseStrength` — function — line 57

## `fauna/animalTrophyLoot.ts`

- `trophyLootKindsForHarvest` — function — line 22
  - domain: fauna

## `fauna/animalUpdateCadence.ts`

- `ACTIVE_OBSERVER_RADIUS_M` — const — line 53
- `animalBehaviourIntervalSec` — function — line 122
  - domain: fauna
- `animalCadencePhase01` — function — line 165
- `AnimalCadenceSignals` — type — line 25
- `animalPresentationIntervalSec` — function — line 142
  - domain: fauna
- `AnimalUpdateImportance` — type — line 19
  - domain: fauna
- `IMMEDIATE_OBSERVER_RADIUS_M` — const — line 50
- `isCadenceDue` — function — line 156
- `MAX_THROTTLED_STEP_M` — const — line 63
- `PRESENTATION_FULL_RATE_RADIUS_M` — const — line 56
- `resolveAnimalUpdateImportance` — function — line 95
  - domain: fauna

## `fauna/animalVariants.ts`

- `ANIMAL_VARIANT_DEFS` — const — line 25
- `AnimalVariant` — type — line 12
  - domain: fauna
  - role: Per-individual animal variant — a trait of one `AnimalAgent`, not a species. `AnimalKind` stays the taxonomy; variants only apply multipliers on top of species baselines (`MAX_HP`, damage tables, `AnimalDef` speeds). V1 consumers: wolf-den alpha (spawn-slot assignment) and the legacy `markDangerous()` quest trait, which shares this modifier shape so it cannot stack a second combat pipeline.
- `AnimalVariantDef` — type — line 14
- `DANGEROUS_TRAIT_MODIFIERS` — const — line 50
- `resolveAnimalVariantStats` — function — line 69
  - domain: fauna
- `variantTintHex` — function — line 102
- `wolfDenInitialFillVariant` — function — line 93
  - domain: fauna

## `fauna/animalWalkSpeed.ts`

- `calmWanderWalkBaseline` — function — line 12
  - domain: fauna
- `NIGHT_PREY_WALK_MULT` — const — line 4
- `resolveAutonomousWalkSpeed` — function — line 24
  - domain: fauna

## `fauna/bloodSplat.ts`

- `createBloodSplat` — function — line 33
- `disposeBloodSplat` — function — line 42

## `fauna/closedPredatorPressure.ts`

- `canBumpClosedPressureSpawner` — function — line 215
- `CLOSED_PREDATOR_PRESSURE_RADIUS` — const — line 13
  - domain: fauna
- `ClosedPredatorPressurePlan` — type — line 69
- `ClosedPressureCapacityBump` — type — line 53
- `ClosedPressureExtraSpawner` — type — line 58
- `closedPressurePlacementSeed` — function — line 118
  - domain: fauna
- `closedPressureSpawnerId` — function — line 99
  - domain: fauna
- `ClosedSettlementSite` — type — line 36
  - domain: fauna
- `ConfiguredPredatorSpawner` — type — line 44
- `resolveClosedPredatorPressure` — function — line 138
  - domain: fauna

## `fauna/corpseDecayFx.ts`

- `animateCorpseRotFx` — function — line 61
- `createCorpseRotFx` — function — line 17
- `disposeCorpseRotFx` — function — line 70

## `fauna/createFauna.ts`

- `clearsRiverChannel` — function — line 299
- `createFauna` — function — line 596
- `Fauna` — type — line 108
- `FAUNA_URLS` — const — line 506
- `faunaGltfUrls` — function — line 521
- `findHomeCaveSpawner` — function — line 465
- `isDeerEdgeHabitat` — function — line 353
- `isNearRoadCorridor` — function — line 334
- `isValidWildFaunaSpawnSite` — function — line 309
- `measureSlope` — function — line 392
- `resolveWildFaunaSpawnPosition` — function — line 320
- `SPAWNER_DESTROY_ACCUSATIVE` — const — line 482
- `SPAWNER_DESTROYING_GENITIVE` — const — line 490
- `SPAWNER_LABELS` — const — line 474
- `SPAWNER_RING_OFFSET` — const — line 271
- `SPAWNER_SPECS` — const — line 428
- `spawnerDestroyBusyLabel` — function — line 501
- `spawnerDestroyPromptLabel` — function — line 497
- `spawnerId` — function — line 458

## `fauna/destinationThreatHooks.ts`

- `collectDestinationThreats` — function — line 35
- `createDestinationThreatHooks` — function — line 70
- `DestinationAnimalThreat` — type — line 14
- `SettlementDestinationThreatHooks` — type — line 21

## `fauna/dogGuard.ts`

- `DOG_BARK_COOLDOWN_SEC` — const — line 42
- `DOG_BARK_HOWL_RADIUS` — const — line 33
- `DOG_BARK_STRANGER_RADIUS` — const — line 38
- `DOG_GUARD_ASSIST_RADIUS` — const — line 27
- `DOG_GUARD_OWN_RADIUS` — const — line 22
- `DOG_PEST_RADIUS` — const — line 16
- `DogBarkStimulus` — type — line 150
- `DogGuardTargetResolved` — type — line 60
- `DogGuardWolfCandidate` — type — line 51
- `DogPestCandidate` — type — line 122
- `RecentVocalizeCandidate` — type — line 157
- `resolveDogBarkStimulus` — function — line 176
- `resolveDogGuardTarget` — function — line 88
- `resolveDogPestTarget` — function — line 132
- `StrangerNpcCandidate` — type — line 159

## `fauna/domesticFlee.ts`

- `DomesticFleeTargetInput` — type — line 15
- `fleeAnchorIsSafe` — function — line 43
  - domain: fauna
- `FleeAnchorPoint` — type — line 13
  - domain: fauna
- `resolveDomesticFleeTarget` — function — line 65
  - domain: fauna

## `fauna/dungeonResidents.ts`

- `buildDungeonResidentsPlan` — function — line 81
  - domain: fauna
- `DungeonCaveResidentInput` — type — line 29
- `dungeonChamberHabitatId` — function — line 25
- `dungeonResidentRoll` — function — line 20
- `DungeonResidentsPlan` — type — line 35

## `fauna/faunaCombat.ts`

- `combatTargetForAnimal` — function — line 88
- `damageFor` — function — line 76
- `damageVsHuman` — function — line 80
- `isMeleeTool` — function — line 72
- `MAX_HP` — const — line 9
- `MeleeToolKind` — type — line 51

## `fauna/faunaDecision.ts`

- `decideFaunaBehaviour` — function — line 145
- `FAUNA_BEHAVIOUR_PRIORITY` — const — line 76
- `FaunaBehaviourKind` — type — line 23
- `FaunaDecisionGate` — type — line 18
- `FaunaDecisionInput` — type — line 39
- `scoreFaunaBehaviours` — function — line 156

## `fauna/habitatPressure.ts`

- `HABITAT_FOOD_PRESSURE_RADIUS` — const — line 54
- `HABITAT_FOOD_SUFFICIENT_COUNT` — const — line 63
- `HABITAT_PREDATOR_PRESSURE_FULL_COUNT` — const — line 60
- `HABITAT_PREDATOR_PRESSURE_RADIUS` — const — line 57
- `HABITAT_PRESSURE_CRITICAL_AT` — const — line 66
- `HABITAT_PRESSURE_STRAINED_AT` — const — line 65
- `HABITAT_PRESSURE_TIE_ORDER` — const — line 72
- `HABITAT_PRESSURE_TTL_DAYS` — const — line 51
- `HabitatPressureCacheEntry` — type — line 79
- `HabitatPressureCondition` — type — line 22
- `HabitatPressureKind` — type — line 16
  - domain: fauna Derived, read-only habitat condition for one managed `PreySpawner`. Not authoritative state, not persisted, and not a second ecosystem sim (plan fauna-031).
- `HabitatPressureResolveArgs` — type — line 243
- `HabitatPressureScanAgent` — type — line 85
- `HabitatPressureScoreInput` — type — line 92
- `HabitatPressureSnapshot` — type — line 24
- `isHabitatPressureCacheFresh` — function — line 206
- `resolveHabitatPressure` — function — line 260
  - domain: fauna
- `scanHabitatPressureAgents` — function — line 222
  - domain: fauna
- `scoreHabitatPressure` — function — line 138
  - domain: fauna

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

## `fauna/horseTraining.ts`

- `addHorseTrainingProgress` — function — line 194
- `clampHorseTrainingProgress` — function — line 121
- `HORSE_TRAINED_PROGRESS` — const — line 63
- `HORSE_TRAINING_MAX` — const — line 61
- `HORSE_TRAINING_MIN` — const — line 60
- `HORSE_TRAINING_TIER_LABEL` — const — line 223
- `HORSE_WARHORSE_PROGRESS` — const — line 65
- `HorsePaddockStay` — type — line 19
- `horseTrainingModifiers` — function — line 156
- `HorseTrainingModifiers` — type — line 45
- `horseTrainingModifiersOf` — function — line 184
- `horseTrainingPrice` — function — line 212
  - domain: settlements
- `HorseTrainingState` — type — line 12
- `horseTrainingTier` — function — line 141
- `HorseTrainingTier` — type — line 43
- `horseTrainingTierOf` — function — line 148
- `normalizeHorseTrainingState` — function — line 130
- `paddockStayToBound` — function — line 32
- `rollInitialHorseTrainingProgress` — function — line 238
  - domain: settlements
- `VillageSizeForTraining` — type — line 229

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

- `createDefaultOwnedAnimalControlState` — function — line 22
- `createFollowOwnedAnimalControlState` — function — line 26
- `FOLLOW_START_DISTANCE` — const — line 14
- `FOLLOW_STOP_DISTANCE` — const — line 15
- `hydrateOwnedAnimalControl` — function — line 101
- `isOwnedStayBlockingRoutineTrips` — function — line 75
  - domain: fauna
  - role: True when player-owned Stay must refuse routine AnimalTrip start/continue.
- `OwnedAnimalControlMode` — type — line 4
- `OwnedAnimalControlState` — type — line 6
- `OwnedControlMovement` — type — line 30
- `resolveOwnedControlMovement` — function — line 40
  - domain: fauna
  - role: Follow/Stay movement policy for player-owned livestock (fauna-020 / fauna-030). Stay uses the same hysteresis primitive as Follow, targeting `stayAnchor`.
- `setOwnedAnimalControlMode` — function — line 82
- `snapshotOwnedAnimalControl` — function — line 92
- `STAY_RETURN_START` — const — line 18
- `STAY_RETURN_STOP` — const — line 20

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

- `CLOSE_ATTACK_CHANCE` — const — line 108
- `countNearbyHumans` — function — line 223
- `CROWD_ATTACK_BLOCK_COUNT` — const — line 114
- `decidePredatorHumanIntent` — function — line 178
- `humanProximityFear` — function — line 123
- `hungerAttackPressure` — function — line 134
- `isAttackRollSuppressed` — function — line 139
- `NEARBY_HUMAN_RADIUS` — const — line 217
- `PredatorHumanDecisionInput` — type — line 17
- `PredatorHumanIntent` — type — line 15
- `PROVOCATION_SECONDS` — const — line 116
- `PROVOKED_FLEE_HP_RATIO` — const — line 112
- `RETALIATION_ATTACK_CHANCE` — const — line 110
- `scorePredatorHumanIntents` — function — line 143

## `fauna/predatorIntentCommitment.ts`

- `clearPredatorIntentCommitment` — function — line 60
- `createPredatorIntentCommitment` — function — line 51
- `PREDATOR_INTENT_COMMIT_SEC` — const — line 23
  - domain: fauna
- `PredatorIntentCommitment` — type — line 25
- `predatorIntentDebugInfo` — function — line 65
- `PredatorIntentDebugInfo` — type — line 34
- `resolveCommittedPredatorIntent` — function — line 80
- `ResolveCommittedPredatorIntentArgs` — type — line 40

## `fauna/preyAlertPerception.ts`

- `PREY_ALERT_RANGE_BONUS` — const — line 27
- `PreyAlertCandidate` — type — line 34
- `resolvePreyAlertThreat` — function — line 69

## `fauna/proceduralAnimals.ts`

- `createBoarModel` — function — line 81
- `createChickenModel` — function — line 207
- `createCowModel` — function — line 162
- `createDogModel` — function — line 292
- `createDonkeyModel` — function — line 149
- `createDuckModel` — function — line 55
- `createHorseModel` — function — line 109
- `createRabbitModel` — function — line 24
- `createRatModel` — function — line 325
- `createRoosterModel` — function — line 247
- `createSheepModel` — function — line 186

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
- `autonomousDestinationAccepts` — function — line 103
- `classifyWaterTraversal` — function — line 51
- `isDispreferredSwim` — function — line 125
- `shouldApplyDrowningDamage` — function — line 85
- `SWIM_PREFER_DRY_CELL_COST` — const — line 99
- `swimStaminaExertion` — function — line 75
- `wadeDepthFor` — function — line 40
- `WaterRouteIntent` — type — line 94
- `waterTraversalCellCost` — function — line 114
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
