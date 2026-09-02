# Symbols

Generated from exported TypeScript symbols.

## `ai/characters.ts`

- `CharacterDef` — type — line 23
- `characterForSeed` — function — line 73
- `genderForName` — function — line 64
- `NpcGender` — type — line 5
- `RESERVED_CHARACTERS` — const — line 55
- `Role` — type — line 15
- `Trait` — type — line 21

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

- `aboutSelfLine` — function — line 68
- `aboutVillageLine` — function — line 162
- `currentActivityLine` — function — line 109
- `familyPhrase` — function — line 63
- `goodbyeLine` — function — line 195
- `requestAssistanceLine` — function — line 206

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
- `needColor` — function — line 161
- `NeedId` — type — line 4
- `needLabel` — function — line 176
- `NeedState` — type — line 6
- `NpcPressure` — type — line 103
- `pickFromPressures` — function — line 150
- `pickNeed` — function — line 157
- `PickNeedOptions` — type — line 52
- `SLEEP_HUNGER_THIRST_RATE` — const — line 27
- `tickNeeds` — function — line 42
- `TickNeedsOptions` — type — line 36

## `ai/NpcAgent.ts`

- `ActionId` — type — line 353
- `BLACKSMITH_SHARPEN_THRESHOLD` — const — line 652
- `classifyPendingActivity` — function — line 507
- `CurrentActivity` — type — line 407
- `CurrentActivityKind` — type — line 405
- `findWeaponNeedingMaintenance` — function — line 760
- `NPC_HEIGHT` — const — line 251
- `NPC_MODEL_URLS` — const — line 306
- `NPC_SHADOW_DISTANCE` — const — line 256
- `NpcAgent` — class — line 865
  - domain: settlements-npcs
  - system: npc-agent
  - role: Central per-NPC behaviour integration point: needs, FSM/schedule, personality-driven decisions and combat.
  - owns: NpcAuthoritativeState
  - uses: Household, SettlementEconomy, Needs
  - simulation: tick
- `NpcInspectionSnapshot` — type — line 422
- `NpcWhy` — type — line 482
- `Phase` — type — line 333
- `projectNpcWhy` — function — line 538
- `promoteChainKind` — function — line 499

## `ai/npcAnimalThreat.ts`

- `AnimalThreatDecisionInput` — type — line 68
- `AnimalThreatResponse` — type — line 66
- `decideAnimalThreatResponse` — function — line 109
- `IMMEDIATE_ANIMAL_THREAT_RADIUS` — const — line 41
- `ImmediateAnimalThreat` — type — line 28
- `scoreAnimalThreatIntents` — function — line 89
- `senseImmediateAnimalThreat` — function — line 47
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

- `COLLIDER_RIM_MARGIN` — const — line 27
- `destinationOnColliderRim` — function — line 57
- `isExteriorPoint` — function — line 37
- `localEscapeRadii` — function — line 76
- `navigationApproachTarget` — function — line 108
- `pickEmergencyTeleportPoint` — function — line 127
- `Point2` — type — line 22
- `pointInsideCollider` — function — line 29
- `rimPointFacing` — function — line 43

## `ai/npcCombat.ts`

- `applyNpcMeleeHit` — function — line 83
- `applyNpcRangedHit` — function — line 107
- `NpcMeleeWeapon` — type — line 31
- `NpcRangedWeapon` — type — line 32
- `resolveIncomingNpcDamage` — function — line 130
- `resolveNpcAmmoKind` — function — line 63
- `resolveNpcDefenseConfig` — function — line 70
- `resolveNpcMeleeWeapon` — function — line 37
- `resolveNpcRangedWeapon` — function — line 51

## `ai/npcLoadout.ts`

- `defaultWeaponForRole` — function — line 22
- `ensureKnifeCarried` — function — line 46
- `seedDefaultRoleWeapon` — function — line 32
- `seedHunterSupplies` — function — line 61

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

## `ai/npcPlan.ts`

- `blockPlan` — function — line 105
- `completePlan` — function — line 118
- `createNpcPlan` — function — line 77
- `goalForNeed` — function — line 43
- `interruptPlan` — function — line 88
- `isPlanTerminal` — function — line 67
- `needForGoal` — function — line 56
- `NpcGoalId` — type — line 13
- `NpcPlan` — type — line 33
- `NpcPlanState` — type — line 15
- `obsoletePlan` — function — line 112
- `planIsResumable` — function — line 73
- `progressPlan` — function — line 126
- `resumePlan` — function — line 97
- `setPlanStrategy` — function — line 81

## `ai/npcStrategies.ts`

- `FoodStrategyContext` — type — line 33
- `getFoodStrategyCandidates` — function — line 79
- `getWaterDutyStrategyCandidates` — function — line 107
- `getWaterStrategyCandidates` — function — line 97
- `getWoodStrategyCandidates` — function — line 128
- `NpcStrategyCandidate` — type — line 28
- `NpcStrategyId` — type — line 15
- `selectStrategy` — function — line 141
- `WaterStrategyContext` — type — line 91
- `WoodStrategyContext` — type — line 111

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

## `ai/reactionChance.ts`

- `computeReactionChance` — function — line 67
- `PlayerSocialLookup` — type — line 14
- `ReactionChanceInput` — type — line 16
- `ReactionTier` — type — line 7
- `reactionTierForRelation` — function — line 80

## `ai/schedule.ts`

- `activityAt` — function — line 302
- `effectiveScheduleFor` — function — line 175
- `EffectiveScheduleOptions` — type — line 29
- `FAST_WORKER_WORK_EXTEND_HOURS` — const — line 67
- `hourMod24` — function — line 85
- `hourToTimeOfDay` — function — line 81
- `idleIntentFor` — function — line 199
- `isNightLeisureTime` — function — line 57
- `nextBoundary` — function — line 321
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

- `NpcDecisionTarget` — type — line 14
  - domain: npc
- `WEATHER_SEVERE_SHELTER_THRESHOLD` — const — line 42
- `weatherShelterPressure` — function — line 51
