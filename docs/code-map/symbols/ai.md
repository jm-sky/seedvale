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
- `FOOD_THRESHOLD_NORMAL` — const — line 95
- `generateNeedPressures` — function — line 120
- `NEED_SATISFY_AMOUNT` — const — line 165
- `needColor` — function — line 205
- `NeedId` — type — line 4
- `needLabel` — function — line 220
- `NeedState` — type — line 6
- `needValue` — function — line 195
- `NpcPressure` — type — line 103
- `pickFromPressures` — function — line 150
- `pickNeed` — function — line 157
- `PickNeedOptions` — type — line 52
- `relieveNeed` — function — line 174
- `SLEEP_HUNGER_THIRST_RATE` — const — line 27
- `tickNeeds` — function — line 42
- `TickNeedsOptions` — type — line 36

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
- `NpcPlannedAction` — type — line 86
- `Phase` — type — line 10

## `ai/NpcAgent.ts`

- `classifyPendingActivity` — function — line 691
- `CurrentActivity` — type — line 508
- `CurrentActivityKind` — type — line 501
- `NPC_HEIGHT` — const — line 411
- `NPC_MODEL_URLS` — const — line 475
- `NPC_SHADOW_DISTANCE` — const — line 425
- `NpcAgent` — class — line 1040
  - domain: settlements-npcs
  - system: npc-agent
  - role: Central per-NPC behaviour integration point: needs, FSM/schedule, personality-driven decisions and combat.
  - owns: NpcAuthoritativeState
  - uses: Household, SettlementEconomy, Needs
  - simulation: tick
- `NpcAgentDeps` — type — line 945
- `NpcInspectionSnapshot` — type — line 523
- `NpcWhy` — type — line 666
- `projectNpcWhy` — function — line 732
- `promoteChainKind` — function — line 683

## `ai/npcAnimalThreat.ts`

- `AnimalThreatDecisionInput` — type — line 76
- `AnimalThreatResponse` — type — line 74
- `decideAnimalThreatResponse` — function — line 117
- `IMMEDIATE_ANIMAL_THREAT_RADIUS` — const — line 48
- `ImmediateAnimalThreat` — type — line 35
- `scoreAnimalThreatIntents` — function — line 97
- `senseImmediateAnimalThreat` — function — line 54
- `ThreateningAnimalCandidate` — type — line 16

## `ai/npcAssistance.ts`

- `AssistanceOutcome` — type — line 15
- `AssistanceRequestKind` — type — line 14
- `AssistanceResult` — type — line 16
- `AssistanceSocialInput` — type — line 32
- `computeAssistanceWillingness` — function — line 68
- `findCarriedConsumableKind` — function — line 25
- `resolveNpcAssistance` — function — line 92
- `violatesOwnNeedsGuard` — function — line 81

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

- `buildTransferAction` — function — line 167
- `canDeliverToPlayerStorage` — function — line 345
- `canExchangeWithHousehold` — function — line 203
- `canWithdrawFromEconomy` — function — line 189
- `depositCarriedItems` — function — line 124
- `depositFoodHarvest` — function — line 112
- `depositWoodHarvest` — function — line 93
- `HELPER_DELIVERY_ITEM_KIND` — const — line 51
- `HELPER_DELIVERY_MAX_CARRY` — const — line 52
- `HOUSEHOLD_EXCHANGE_MAX_TRANSFER` — const — line 39
- `HUNT_YIELD_KINDS` — const — line 56
- `NpcLogisticsCtx` — type — line 70
- `planDeliverHuntYieldHome` — function — line 407
- `planEconomyWithdraw` — function — line 220
- `planHouseholdExchange` — function — line 279
- `planPlayerStorageDelivery` — function — line 368
- `ResourceTransferPlan` — type — line 159
- `satisfyHouseholdResourceNeed` — function — line 146

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

## `ai/npcPersonalProvisions.ts`

- `buildContractProvisionContext` — function — line 297
- `buildEscortProvisionContext` — function — line 343
- `CONTRACT_MISSING_DRINK_PENALTY` — const — line 47
- `CONTRACT_MISSING_FOOD_UNIT_PENALTY` — const — line 45
- `ContractProvisionAvailability` — type — line 168
- `ContractProvisionEstimate` — type — line 91
- `contractProvisionFeasibilityPenalty` — function — line 196
- `ContractProvisionResult` — type — line 211
- `contractTravelHours` — function — line 159
- `countPersonalDrinkPortions` — function — line 55
- `countPersonalFood` — function — line 50
- `escortAwayHours` — function — line 329
- `estimateContractProvisionNeed` — function — line 126
- `estimateEscortProvisionNeed` — function — line 146
- `findDrinkablePersonalWaterContainer` — function — line 68
- `findFillablePersonalWaterskin` — function — line 78
- `hasFillablePersonalWaterskin` — function — line 87
- `LOCAL_CONTRACT_TRAVEL_HOURS` — const — line 34
  - domain: npc
- `provisionContractSupplies` — function — line 254
- `readContractProvisionAvailability` — function — line 177

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

- `BLACKSMITH_SHARPEN_THRESHOLD` — const — line 64
- `findWeaponNeedingMaintenance` — function — line 86
- `NpcWorkContext` — type — line 106
- `planProfessionWork` — function — line 723
- `selectTraderCollectionGoods` — function — line 353

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

## `ai/npcTravel.ts`

- `beginOffscreenNpcTravel` — function — line 89
  - domain: npc
- `cloneNpcTravel` — function — line 35
- `interpolateNpcTravelPosition` — function — line 64
- `isNpcTravelArrived` — function — line 77
- `NpcTravelContinuity` — type — line 23
- `NpcTravelExecution` — type — line 17
- `NpcTravelHost` — type — line 30
- `NpcTravelPoint` — type — line 15
  - domain: npc
- `reifyNpcTravel` — function — line 118
  - domain: npc
- `resolveOffscreenNpcTravel` — function — line 151
  - domain: npc
- `stampNpcTravelCheckpoint` — function — line 132
  - domain: npc
- `travelProgress01` — function — line 56

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
- `ScoredWorkContract` — type — line 267
- `scoreWorkContractOpportunity` — function — line 257
- `selectBestWorkContract` — function — line 274
- `WorkContractEvaluationInput` — type — line 139

## `ai/reactionChance.ts`

- `computeReactionChance` — function — line 101
- `NEUTRAL_PLAYER_SOCIAL_STATE` — const — line 41
- `PlayerSocialContext` — type — line 14
- `PlayerSocialLookup` — type — line 36
- `PlayerSocialState` — type — line 16
- `ReactionChanceInput` — type — line 48
- `ReactionTier` — type — line 9
- `reactionTierForRelation` — function — line 114

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

## `ai/socialBehaviour.ts`

- `advanceSocialPairing` — function — line 149
- `conversationAttemptCooldownSec` — function — line 83
- `conversationDurationSec` — function — line 101
- `conversationOutcome` — function — line 126
- `ConversationOutcome` — type — line 107
- `findConversationPartner` — function — line 60
- `SocialCandidateView` — type — line 48
- `SocialParticipant` — type — line 24

## `ai/weatherPressure.ts`

- `NpcDecisionTarget` — type — line 19
  - domain: npc
- `WEATHER_SEVERE_SHELTER_THRESHOLD` — const — line 54
- `weatherShelterPressure` — function — line 64
