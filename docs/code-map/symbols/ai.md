# Symbols

Generated from exported TypeScript symbols.

## `ai/animalCorpseCleanupPressure.ts`

- `AnimalCorpseCleanupPressureInput` — type — line 15
  - domain: settlements-npcs
- `AnimalCorpseCleanupPressureResult` — type — line 22
- `resolveAnimalCorpseCleanupPressure` — function — line 78

## `ai/approachPlayer.ts`

- `ApproachPlayerIntent` — type — line 9
  - domain: npc
- `horizontalDistance` — function — line 21
- `isPlayerApproachArrived` — function — line 40
- `isPlayerLocallyEligible` — function — line 30
- `PLAYER_APPROACH_ARRIVE_RANGE` — const — line 19
- `PLAYER_APPROACH_LOCAL_RANGE` — const — line 16

## `ai/burialPressure.ts`

- `BurialPressureInput` — type — line 30
- `BurialPressureResult` — type — line 43
- `NpcBurialHooks` — type — line 20
  - domain: npc
- `resolveBurialPressure` — function — line 94

## `ai/characters.ts`

- `CharacterDef` — type — line 21
- `characterForSeed` — function — line 72
- `genderForName` — function — line 63
- `NpcGender` — type — line 5
- `RESERVED_CHARACTERS` — const — line 54
- `Role` — type — line 13
- `Trait` — type — line 19

## `ai/decisionModifiers.ts`

- `DecisionModifier` — type — line 16
- `NeedModifierInput` — type — line 28
- `ScoredNeedCandidate` — type — line 21
- `scoreNeedCandidates` — function — line 72

## `ai/dialogue.ts`

- `BigFivePersonality` — type — line 16
- `nearestArchetype` — function — line 78
- `NPC_PERSONALITIES` — const — line 6
- `pausePersonalityParams` — function — line 103
- `PausePersonalityParams` — type — line 91
- `Personality` — type — line 3
- `personalityForIndex` — function — line 54
- `pickDialogueLine` — function — line 234

## `ai/dialogueTemplates.ts`

- `aboutAreaLine` — function — line 209
- `aboutSelfLine` — function — line 71
- `aboutVillageLine` — function — line 165
- `currentActivityLine` — function — line 112
- `familyPhrase` — function — line 66
- `goodbyeLine` — function — line 198
- `requestAssistanceLine` — function — line 223
- `voluntaryJoinResponseLine` — function — line 242

## `ai/economicPressure.ts`

- `productionShortagePressure` — function — line 15
  - domain: settlements-npcs
- `productionShortagePressures` — function — line 29
  - domain: settlements-npcs

## `ai/graveVisitPressure.ts`

- `getLastGraveVisitAtDays` — function — line 65
- `GRAVE_VISIT_COOLDOWN_DAYS` — const — line 28
- `GRAVE_VISIT_OPPORTUNITY_BUCKET_DAYS` — const — line 31
- `GRAVE_VISIT_OPPORTUNITY_THRESHOLD` — const — line 33
- `GRAVE_VISIT_PRESSURE` — const — line 30
- `GraveVisitCandidate` — type — line 13
  - domain: npc
- `graveVisitOpportunity` — function — line 55
- `GraveVisitPressureResult` — type — line 101
- `isGraveVisitCooldownExpired` — function — line 75
- `NpcGraveVisitHooks` — type — line 21
- `recordGraveVisit` — function — line 84
- `resolveGraveVisitPressure` — function — line 106
- `revalidateGraveVisitCandidate` — function — line 146

## `ai/healingPressure.ts`

- `HEALING_PRESSURE_BY_SEVERITY` — const — line 24
- `healingPressure` — function — line 38

## `ai/helperAssignment.ts`

- `HelperAssignment` — type — line 10
- `HelperResourceKind` — type — line 8

## `ai/nameCultures.ts`

- `generateFamilySurname` — function — line 93
- `generateNpcName` — function — line 117
- `NAME_CULTURES` — const — line 18
- `NameCulture` — type — line 16
- `namesForCulture` — function — line 104
- `pickNameCulture` — function — line 109
- `surnameForGender` — function — line 100

## `ai/Needs.ts`

- `createNeedState` — function — line 16
- `FOOD_THRESHOLD_NORMAL` — const — line 97
- `generateNeedPressures` — function — line 122
- `NEED_SATISFY_AMOUNT` — const — line 167
- `needColor` — function — line 207
- `NeedId` — type — line 4
- `needLabel` — function — line 222
- `NeedState` — type — line 6
- `needValue` — function — line 197
- `NpcPressure` — type — line 105
- `pickFromPressures` — function — line 152
- `pickNeed` — function — line 159
- `PickNeedOptions` — type — line 54
- `relieveNeed` — function — line 176
- `SLEEP_HUNGER_THIRST_RATE` — const — line 27
- `tickNeeds` — function — line 44
- `TickNeedsOptions` — type — line 38

## `ai/npcAccompanyCommitment.ts`

- `cloneNpcAccompanyCommitment` — function — line 68
- `endNpcAccompanyCommitment` — function — line 151
  - domain: npc
- `NpcAccompanyCommitment` — type — line 25
- `NpcAccompanyEndReason` — type — line 19
- `NpcAccompanyHost` — type — line 51
- `NpcAccompanyMode` — type — line 17
- `NpcAccompanyRejectReason` — type — line 21
- `NpcAccompanySourceRef` — type — line 13
- `NpcAccompanyTarget` — type — line 11
  - domain: npc
- `NpcAccompanyWorldPoint` — type — line 23
- `setNpcAccompanyMode` — function — line 126
  - domain: npc
- `startNpcAccompanyCommitment` — function — line 97
  - domain: npc
- `StartNpcAccompanyConstraints` — type — line 40
- `StartNpcAccompanyParams` — type — line 33
- `StartNpcAccompanyResult` — type — line 46

## `ai/npcAccompanyExecution.ts`

- `horizontalDistance` — function — line 27
- `NPC_ACCOMPANY_FOLLOW_RETARGET_DISTANCE` — const — line 18
- `NPC_ACCOMPANY_FOLLOW_START_DISTANCE` — const — line 15
  - domain: npc
- `NPC_ACCOMPANY_FOLLOW_STOP_DISTANCE` — const — line 16
- `NPC_ACCOMPANY_STAY_ARRIVE_DISTANCE` — const — line 20
- `NpcAccompanyMovement` — type — line 22
- `resolveNpcAccompanyMovement` — function — line 51
  - domain: npc
- `shouldRetargetFollowDestination` — function — line 36

## `ai/npcAction.ts`

- `ActionId` — type — line 30
- `NpcPlannedAction` — type — line 90
- `Phase` — type — line 10

## `ai/NpcAgent.ts`

- `classifyPendingActivity` — function — line 708
- `CurrentActivity` — type — line 518
- `CurrentActivityKind` — type — line 511
- `HUNT_RESUPPLY_ARROW_TARGET` — const — line 825
- `NPC_HEIGHT` — const — line 441
- `NPC_SHADOW_DISTANCE` — const — line 455
- `NpcAgent` — class — line 1061
  - domain: settlements-npcs
  - system: npc-agent
  - role: Central per-NPC behaviour integration point: needs, FSM/schedule, personality-driven decisions and combat.
  - owns: NpcAuthoritativeState
  - uses: Household, SettlementEconomy, Needs
  - simulation: tick
- `NpcAgentDeps` — type — line 959
- `NpcInspectionSnapshot` — type — line 533
- `NpcWhy` — type — line 683
- `projectNpcWhy` — function — line 750
- `promoteChainKind` — function — line 700

## `ai/npcAnimalThreat.ts`

- `AnimalThreatArbitration` — type — line 115
- `AnimalThreatDecisionInput` — type — line 76
- `AnimalThreatResponse` — type — line 74
- `arbitrateAnimalThreat` — function — line 125
- `decideAnimalThreatResponse` — function — line 150
- `IMMEDIATE_ANIMAL_THREAT_RADIUS` — const — line 48
- `ImmediateAnimalThreat` — type — line 35
- `scoreAnimalThreatIntents` — function — line 97
- `senseImmediateAnimalThreat` — function — line 54
- `serializableDefendScore` — function — line 141
- `ThreateningAnimalCandidate` — type — line 16

## `ai/npcAppearance.ts`

- `modelUrlFor` — function — line 96
- `NPC_CLOTHING_HUE` — const — line 56
- `NPC_HAIR_COLOR` — const — line 64
- `NPC_MODEL_URLS` — const — line 34
- `NPC_UBC_FEMALE_KNIGHT_URL` — const — line 17
- `NPC_UBC_FEMALE_PEASANT_URL` — const — line 14
- `NPC_UBC_FEMALE_RANGER_URL` — const — line 16
- `NPC_UBC_FEMALE_WIZARD_URL` — const — line 15
- `NPC_UBC_HAIR_1_URL` — const — line 30
- `NPC_UBC_HAIR_2_URL` — const — line 31
- `NPC_UBC_KNIGHT_TINT_URL` — const — line 29
- `NPC_UBC_MALE_KNIGHT_UNHELMETED_URL` — const — line 19
- `NPC_UBC_PEASANT_TINT_URL` — const — line 21
- `NPC_UBC_RANGER_TINT_URL` — const — line 27
- `NPC_UBC_WIZARD_TINT_URL` — const — line 25
- `NPC_UBC_WOODCUTTER_TINT_URL` — const — line 23
- `NpcAppearance` — type — line 87
  - domain: npc
- `NpcClothingHueId` — type — line 52
- `NpcHairColorId` — type — line 53
- `NpcHairKind` — type — line 51
- `NpcOutfitId` — type — line 49
- `NpcUbcOutfitId` — type — line 50
- `resolveNpcAppearance` — function — line 218
  - domain: npc
- `ubcVariantModelUrl` — function — line 170
  - domain: npc

## `ai/npcAssistance.ts`

- `AssistanceOutcome` — type — line 17
- `AssistanceRequestKind` — type — line 16
- `AssistanceResult` — type — line 18
- `AssistanceSocialInput` — type — line 34
- `computeAssistanceWillingness` — function — line 72
- `findCarriedConsumableKind` — function — line 27
- `resolveNpcAssistance` — function — line 97
- `violatesOwnNeedsGuard` — function — line 86

## `ai/npcColliderRim.ts`

- `bypassPointForSegment` — function — line 165
- `COLLIDER_RIM_MARGIN` — const — line 27
- `destinationOnColliderRim` — function — line 57
- `isExteriorPoint` — function — line 37
- `isPointWalkableForNpc` — function — line 132
- `localEscapeRadii` — function — line 76
- `navigationApproachTarget` — function — line 108
- `pickEmergencyTeleportPoint` — function — line 259
- `Point2` — type — line 22
- `pointInsideCollider` — function — line 29
- `rimPointFacing` — function — line 43
- `sampleNearbyExteriorPoint` — function — line 204
- `sampleRandomExteriorPoint` — function — line 234

## `ai/npcCombat.ts`

- `applyNpcMeleeHit` — function — line 108
- `applyNpcRangedHit` — function — line 133
- `NpcAmmoSource` — type — line 63
- `NpcMeleeWeapon` — type — line 32
- `NpcRangedWeapon` — type — line 33
- `resolveIncomingNpcDamage` — function — line 156
- `resolveNpcAmmo` — function — line 69
- `resolveNpcAmmoKind` — function — line 84
- `resolveNpcDefenseConfig` — function — line 91
- `resolveNpcMeleeWeapon` — function — line 38
- `resolveNpcRangedWeapon` — function — line 52

## `ai/npcCrowd.ts`

- `createNpcCrowdPass` — function — line 44
- `GROUP_REACTION_RADIUS` — const — line 18
  - domain: ai
  - system: npc-crowd
  - role: Owns the settlement-wide NPC proximity/separation pass and its reusable output buffers.
- `NPC_SEPARATION_RADIUS` — const — line 23
- `NPC_SEPARATION_SPEED` — const — line 25
- `NpcCrowdAgent` — type — line 28
- `NpcCrowdResult` — type — line 33

## `ai/npcDecision.ts`

- `decideNpcAction` — function — line 93
- `NPC_DECISION_PRIORITY` — const — line 45
- `NpcDecisionInput` — type — line 26
- `NpcDecisionKind` — type — line 24
- `NpcInterruptInput` — type — line 113
- `scoreNpcDecisions` — function — line 105
- `shouldInterruptAction` — function — line 135

## `ai/npcExpeditionTravel.ts`

- `dispatchReadyExpedition` — function — line 75
  - domain: settlements-npcs
- `dispatchReadyExpeditionAssignment` — function — line 130
  - domain: settlements-npcs
- `DispatchReadyExpeditionAssignmentInput` — type — line 34
- `DispatchReadyExpeditionInput` — type — line 24
- `DispatchReadyExpeditionResult` — type — line 45
- `ReadyExpeditionAssignmentSlice` — type — line 22
  - domain: settlements-npcs

## `ai/npcLoadout.ts`

- `defaultWeaponForRole` — function — line 22
- `ensureKnifeCarried` — function — line 46
- `isNpcLoadoutBelonging` — function — line 104
- `seedDefaultRoleWeapon` — function — line 32
- `seedHunterStartingArrows` — function — line 69
- `seedHunterSupplies` — function — line 61
- `seedInitialPersonalBelongingsIfNeeded` — function — line 87
- `seedShepherdShears` — function — line 76

## `ai/npcLogistics.ts`

- `buildTransferAction` — function — line 175
- `canDeliverToPlayerStorage` — function — line 356
- `canExchangeWithHousehold` — function — line 211
- `canWithdrawFromEconomy` — function — line 197
- `depositCarriedItems` — function — line 132
- `depositFoodHarvest` — function — line 120
- `depositWoodHarvest` — function — line 93
- `HELPER_DELIVERY_ITEM_KIND` — const — line 48
- `HELPER_DELIVERY_MAX_CARRY` — const — line 49
- `HOUSEHOLD_EXCHANGE_MAX_TRANSFER` — const — line 36
- `HUNT_YIELD_KINDS` — const — line 53
- `NpcLogisticsCtx` — type — line 67
- `planDeliverHuntYieldHome` — function — line 418
- `planEconomyWithdraw` — function — line 228
- `planHouseholdExchange` — function — line 288
- `planPlayerStorageDelivery` — function — line 379
- `ResourceTransferPlan` — type — line 167
- `satisfyHouseholdResourceNeed` — function — line 154
- `WoodHarvestDeposit` — type — line 90

## `ai/npcMovementWatchdog.ts`

- `createMovementWatchdog` — function — line 45
- `EMERGENCY_TELEPORT_AFTER_ABANDONS` — const — line 43
- `MovementWatchdog` — type — line 13
- `RECENT_RESCUE_WINDOW_SEC` — const — line 40
- `registerAbandon` — function — line 127
- `RescueStage` — type — line 11
- `resetMovementWatchdog` — function — line 63
- `STUCK_CHECK_INTERVAL_SEC` — const — line 30
- `STUCK_MIN_PROGRESS_DIST` — const — line 32
- `STUCK_STRIKES_FOR_ABANDON` — const — line 37
- `STUCK_STRIKES_FOR_ESCAPE` — const — line 36
- `STUCK_STRIKES_FOR_REPATH` — const — line 35
- `tickMovementWatchdog` — function — line 80

## `ai/npcOffscreenSurvival.ts`

- `NpcOffscreenSurvivalHost` — type — line 32
- `NpcOffscreenSurvivalResult` — type — line 38
- `resolveNpcOffscreenTravelInterval` — function — line 61
  - domain: npc

## `ai/npcPersonalProvisions.ts`

- `buildContractProvisionContext` — function — line 312
- `buildEscortProvisionContext` — function — line 358
- `consumeOnePersonalDrink` — function — line 98
- `consumeOnePersonalFood` — function — line 93
- `CONTRACT_MISSING_DRINK_PENALTY` — const — line 48
- `CONTRACT_MISSING_FOOD_UNIT_PENALTY` — const — line 46
- `ContractProvisionAvailability` — type — line 183
- `ContractProvisionEstimate` — type — line 106
- `contractProvisionFeasibilityPenalty` — function — line 211
- `ContractProvisionResult` — type — line 226
- `contractTravelHours` — function — line 174
- `countPersonalDrinkPortions` — function — line 56
- `countPersonalFood` — function — line 51
- `escortAwayHours` — function — line 344
- `estimateContractProvisionNeed` — function — line 141
- `estimateEscortProvisionNeed` — function — line 161
- `findDrinkablePersonalWaterContainer` — function — line 69
- `findFillablePersonalWaterskin` — function — line 79
- `hasFillablePersonalWaterskin` — function — line 88
- `LOCAL_CONTRACT_TRAVEL_HOURS` — const — line 35
  - domain: npc
- `provisionContractSupplies` — function — line 269
- `readContractProvisionAvailability` — function — line 192

## `ai/npcPlan.ts`

- `blockPlan` — function — line 133
- `completePlan` — function — line 146
- `createBurialPlan` — function — line 92
- `createNpcPlan` — function — line 81
- `goalForNeed` — function — line 45
- `interruptPlan` — function — line 116
- `isBurialPlan` — function — line 96
- `isBurialPlanForDeceased` — function — line 100
- `isPlanTerminal` — function — line 71
- `needForGoal` — function — line 58
- `NpcGoalId` — type — line 13
- `NpcPlan` — type — line 33
- `NpcPlanState` — type — line 15
- `obsoletePlan` — function — line 140
- `planIsBurialResumable` — function — line 104
- `planIsResumable` — function — line 77
- `progressPlan` — function — line 154
- `resumePlan` — function — line 125
- `setPlanStrategy` — function — line 109

## `ai/npcProfessionWork.ts`

- `BLACKSMITH_SHARPEN_THRESHOLD` — const — line 83
- `findWeaponNeedingMaintenance` — function — line 99
- `NpcWorkContext` — type — line 119
- `planProfessionWork` — function — line 928
- `selectTraderCollectionGoods` — function — line 381

## `ai/npcStrategies.ts`

- `FoodStrategyContext` — type — line 35
- `getFoodStrategyCandidates` — function — line 86
- `getWaterDutyStrategyCandidates` — function — line 120
- `getWaterStrategyCandidates` — function — line 109
- `getWoodStrategyCandidates` — function — line 141
- `NpcStrategyCandidate` — type — line 30
- `NpcStrategyId` — type — line 15
- `selectStrategy` — function — line 154
- `WaterStrategyContext` — type — line 99
- `WoodStrategyContext` — type — line 124

## `ai/npcTradeAvailability.ts`

- `NpcTradeCounterparty` — type — line 48
  - domain: settlements-npcs
- `NpcTradeOffer` — type — line 24
  - domain: settlements-npcs
- `NpcTradeOwnerSource` — type — line 15
  - domain: settlements-npcs
- `npcTradeQuantityAvailable` — function — line 141
  - domain: settlements-npcs
- `npcTradeSourceInventory` — function — line 159
  - domain: settlements-npcs
- `resolveNpcTradeOffers` — function — line 175
  - domain: settlements-npcs
- `TradeReserveNpc` — type — line 34

## `ai/npcTravel.ts`

- `beginOffscreenNpcTravel` — function — line 145
  - domain: npc
- `blockNpcTravel` — function — line 235
- `cloneNpcTravel` — function — line 64
- `cloneNpcTravelPurpose` — function — line 57
- `hasCommittedNpcTravel` — function — line 129
- `interpolateNpcTravelPosition` — function — line 109
- `isNpcTravelArrived` — function — line 122
- `keepsNpcTravelAfterReify` — function — line 133
- `markNpcTravelReached` — function — line 223
- `NpcTravelContinuity` — type — line 31
- `NpcTravelExecution` — type — line 19
- `NpcTravelHost` — type — line 51
- `NpcTravelPoint` — type — line 17
  - domain: npc
- `NpcTravelPurpose` — type — line 26
- `NpcTravelResolveResult` — type — line 44
- `observeNpcTravelArrival` — function — line 299
  - domain: npc
- `reifyNpcTravel` — function — line 191
  - domain: npc
- `resolveOffscreenNpcTravel` — function — line 260
  - domain: npc
- `stampNpcTravelCheckpoint` — function — line 209
  - domain: npc
- `travelProgress01` — function — line 101

## `ai/npcTravelCheckpoint.ts`

- `resolveNpcTravelCheckpoint` — function — line 35
  - domain: npc

## `ai/npcVigor.ts`

- `applyDamageVigor` — function — line 40
- `applySleepVigor` — function — line 36
- `applyWorkVigor` — function — line 32
- `DAMAGE_VIGOR_COST` — const — line 9
- `HOME_SLEEP_RANGE` — const — line 22
- `isHeavyWorkKind` — function — line 28
- `MAX_VIGOR` — const — line 3
- `preferHomeSleep` — function — line 48
- `shouldCollapseSleep` — function — line 44
- `shouldStayAsleep` — function — line 56
- `SLEEP_VIGOR_RESTORE_RATE` — const — line 12
- `SleepReason` — type — line 24
- `tickVigorForSimulatedStep` — function — line 77
- `VIGOR_WAKE_THRESHOLD` — const — line 19
- `VigorStepResult` — type — line 66
- `WORK_VIGOR_COST` — const — line 6

## `ai/npcVoiceLines.ts`

- `FRIENDLY_TALK_SOUND_VOLUME` — const — line 145
- `NPC_CONFIRMATION_SOUND_URLS` — const — line 76
- `NPC_FAREWELL_SOUND_URLS` — const — line 72
- `NPC_FRIENDLY_TALK_SOUND_URLS` — const — line 139
- `NPC_GREETING_SOUND_URLS` — const — line 68
- `NPC_HMM_VOICE_URLS` — const — line 64
- `NPC_QUEST_COMPLETE_SOUND_URLS` — const — line 114
- `NPC_REACTION_SOUND_URLS` — const — line 103
- `NpcVoiceActor` — type — line 18
- `pickNpcConfirmationSound` — function — line 97
- `pickNpcFarewellSound` — function — line 91
- `pickNpcFriendlyTalkSound` — function — line 147
- `pickNpcGreetingSound` — function — line 85
- `REACTION_SOUND_VOLUME` — const — line 121
- `voiceActorForIndex` — function — line 25

## `ai/npcWorkContract.ts`

- `DEFAULT_ESCORT_EVALUATION_CONTEXT` — const — line 131
- `EscortEvaluationContext` — type — line 117
- `EscortWorkContractScoreBreakdown` — type — line 185
- `MeasurableWorkContractScoreBreakdown` — type — line 174
- `ScoredWorkContract` — type — line 336
- `scoreWorkContractOpportunity` — function — line 318
- `scoreWorkContractOpportunityDetailed` — function — line 326
- `selectBestWorkContract` — function — line 347
- `WorkContractEvaluationInput` — type — line 139
- `WorkContractProvisionPenalty` — type — line 172
- `WorkContractScoreBreakdown` — type — line 200

## `ai/reactionChance.ts`

- `computeReactionChance` — function — line 106
- `NEUTRAL_PLAYER_SOCIAL_STATE` — const — line 43
- `PlayerSocialContext` — type — line 16
- `PlayerSocialLookup` — type — line 38
- `PlayerSocialState` — type — line 18
- `ReactionChanceInput` — type — line 50
- `ReactionTier` — type — line 11
- `reactionTierForRelation` — function — line 120

## `ai/schedule.ts`

- `activityAt` — function — line 330
- `effectiveScheduleFor` — function — line 203
- `EffectiveScheduleOptions` — type — line 29
- `FAST_WORKER_WORK_EXTEND_HOURS` — const — line 67
- `hourMod24` — function — line 85
- `hourToTimeOfDay` — function — line 81
- `idleIntentFor` — function — line 227
- `isNightLeisureTime` — function — line 57
- `nextBoundary` — function — line 349
- `NIGHT_LEISURE_END_HOUR` — const — line 53
- `NIGHT_LEISURE_START_HOUR` — const — line 52
  - domain: npc
- `NIGHT_OWL_SHIFT_HOURS` — const — line 40
- `SCHEDULE_TEMPLATES` — const — line 89
- `ScheduleActivity` — type — line 16
- `ScheduleEntry` — type — line 18
- `ScheduleTemplate` — type — line 26
- `SOCIABLE_SOCIAL_HOURS` — const — line 73

## `ai/settlementCaution.ts`

- `CLOSED_CAUTION_CHANCE` — const — line 11
- `CLOSED_CAUTION_SCORE` — const — line 10
  - domain: npc
- `CLOSED_CAUTION_WILLINGNESS` — const — line 12
- `closedCautionChance` — function — line 18
- `closedCautionScore` — function — line 14
- `closedCautionWillingness` — function — line 22

## `ai/socialBehaviour.ts`

- `advanceSocialPairing` — function — line 149
- `conversationAttemptCooldownSec` — function — line 83
- `conversationDurationSec` — function — line 101
- `conversationOutcome` — function — line 126
- `ConversationOutcome` — type — line 107
- `findConversationPartner` — function — line 60
- `SocialCandidateView` — type — line 48
- `SocialParticipant` — type — line 24

## `ai/voluntaryExpeditionJoin.ts`

- `DEFAULT_VOLUNTARY_JOIN_DANGER` — const — line 123
- `evaluateVoluntaryJoin` — function — line 229
  - domain: npc
- `isVoluntaryInitiativeEligible` — function — line 303
  - domain: npc
- `isVoluntaryJoinAccepted` — function — line 285
- `VOLUNTARY_JOIN_THRESHOLD` — const — line 128
- `VoluntaryExpeditionTerms` — type — line 29
  - domain: npc
- `VoluntaryJoinAwareness` — type — line 289
- `VoluntaryJoinBlocker` — type — line 31
- `VoluntaryJoinContext` — type — line 63
- `VoluntaryJoinEvaluation` — type — line 52
- `VoluntaryJoinModifier` — type — line 50
- `VoluntaryJoinModifierKey` — type — line 39

## `ai/weatherPressure.ts`

- `NpcDecisionTarget` — type — line 19
  - domain: npc
- `WEATHER_SEVERE_SHELTER_THRESHOLD` — const — line 54
- `weatherShelterPressure` — function — line 64
