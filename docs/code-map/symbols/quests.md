# Symbols

Generated from exported TypeScript symbols.

## `quests/cardinalDirection.ts`

- `CARDINAL_SECTORS` — const — line 3
- `cardinalDirectionPhrase` — function — line 34
- `cardinalSector` — function — line 25
  - domain: quests-progression
- `CardinalSector` — type — line 4

## `quests/guardEveningOfferWindow.ts`

- `deterministicEveningOfferWindowStart` — function — line 27
  - domain: quests-progression
- `EVENING_OFFER_WINDOW_LENGTH` — const — line 5
- `isWithinEveningOfferWindow` — function — line 41

## `quests/guardPersistence.ts`

- `applyGuardClaimMutation` — function — line 19
- `emptyGuardWorldProgress` — function — line 11
- `getGuardClaimState` — function — line 15
- `GuardWorldProgress` — type — line 4
- `isSwordRewardConsumedForGuard` — function — line 39
- `migrateLegacyGuardSwordGift` — function — line 31

## `quests/guardRewards.ts`

- `GUARD_SWORD_RENOWN_MIN` — const — line 16
- `GUARD_TORCH_GIFT_RENOWN_MIN` — const — line 15
- `GuardRewardDecision` — type — line 25
- `GuardRewardInput` — type — line 37
- `GuardRewardKind` — type — line 18
- `guardRewardTopicAvailable` — function — line 125
- `resolveNextGuardReward` — function — line 68
  - domain: quests-progression
- `SaveGuardClaimState` — type — line 8

## `quests/materializeAuthoredQuests.ts`

- `AuthoredNpcResolutionError` — class — line 13
- `materializeAuthoredQuestDefs` — function — line 88
  - domain: quests-progression
- `normalizeLegacyQuestRelations` — function — line 134
  - domain: quests-progression
- `resolveAuthoredNpcId` — function — line 25
  - domain: quests-progression

## `quests/opportunities/guardProfessionQuests.ts`

- `buildGuardEveningDutyQuest` — function — line 66
  - domain: quests-progression
- `guardEveningDutyQuestId` — function — line 14
  - domain: quests-progression
- `parseGuardEveningDutyQuestId` — function — line 18
- `selectGuardQuestGiver` — function — line 33

## `quests/opportunities/hunterProfessionQuests.ts`

- `buildHunterProfessionQuests` — function — line 214
  - domain: quests-progression
- `hunterProfessionQuestId` — function — line 29
  - domain: quests-progression
- `parseHunterProfessionQuestId` — function — line 33
- `selectHunterQuestGiver` — function — line 52

## `quests/opportunities/rpgQuestMaterialization.ts`

- `materializeRpgQuestOpportunity` — function — line 252
  - domain: quests-progression
  - system: settlement-quest-opportunities
  - role: Materializes a selected RPG matrix candidate into a normal QuestDef.
- `RpgMaterializationContext` — type — line 10

## `quests/opportunities/rpgQuestMatrices.ts`

- `adultOpportunityNpcs` — function — line 99
  - domain: quests-progression
- `collectOldPlaceSecretCandidate` — function — line 124
  - domain: quests-progression
  - role: Collects a lightweight RPG candidate bound to a real landmark id.
- `collectRpgQuestOpportunities` — function — line 216
  - domain: quests-progression
  - system: settlement-quest-opportunities
  - role: Collects RPG matrix candidates without building QuestDefs.
- `collectSettlementAgreementCandidate` — function — line 178
  - domain: quests-progression
  - role: Collects a lightweight RPG candidate bound to a target settlement id.
- `collectSuspiciousTransportCandidate` — function — line 147
  - domain: quests-progression
  - role: Collects a lightweight RPG candidate bound to a counterpart NPC id.
- `nearbyRpgSettlementDefs` — function — line 241
  - domain: quests-progression
- `OLD_PLACE_LANDMARK_KINDS` — const — line 18
  - domain: quests-progression
- `parseRpgQuestId` — function — line 75
- `RPG_NEIGHBOR_SETTLEMENT_LIMIT` — const — line 32
  - domain: quests-progression
- `RPG_QUEST_PREFIX` — const — line 10
- `RpgCollectInput` — type — line 47
- `RpgLandmarkRef` — type — line 34
- `rpgQuestId` — function — line 71
  - domain: quests-progression
- `RpgSettlementRef` — type — line 39

## `quests/opportunities/settlementQuestOpportunities.ts`

- `collectLostLivestockOpportunities` — function — line 148
  - domain: quests-progression
- `collectSettlementQuestOpportunities` — function — line 162
- `collectWolfDenPressureOpportunities` — function — line 70
  - domain: quests-progression
  - system: settlement-quest-opportunities
  - role: Collects world-driven candidates from authoritative fauna spawners.
- `LOST_LIVESTOCK_DEAD_OUTCOME` — const — line 107
- `LOST_LIVESTOCK_LIVE_OUTCOME` — const — line 106
- `LOST_LIVESTOCK_UNAVAILABLE_OUTCOME` — const — line 108
- `lostLivestockQuestId` — function — line 116
  - domain: quests-progression
- `parseLostLivestockQuestId` — function — line 120
- `parseWolfDenPressureQuestId` — function — line 27
- `settlementIdFromWolfDenSpawnerId` — function — line 33
- `wolfDenPressureQuestId` — function — line 23
  - domain: quests-progression
- `wolfDenPressureSourceStatus` — function — line 84
  - domain: quests-progression
- `wolfDenPressureStatusFromSpawners` — function — line 91

## `quests/opportunities/settlementQuestSelection.ts`

- `selectSettlementQuestOpportunities` — function — line 56
  - domain: quests-progression
  - system: settlement-quest-opportunities
  - role: Selects which lightweight candidates become QuestDefs.
- `SETTLEMENT_QUEST_OPPORTUNITY_LIMIT` — const — line 9
  - domain: quests-progression
- `settlementOpportunityPriority` — function — line 17
  - domain: quests-progression

## `quests/opportunities/worldQuestMaterialization.ts`

- `buildWorldDrivenSettlementQuests` — function — line 213
  - domain: quests-progression
- `materializeSettlementQuestOpportunity` — function — line 188
  - domain: quests-progression
  - system: settlement-quest-opportunities
  - role: Materializes a selected settlement opportunity into a normal QuestDef.
- `opportunityNpcsFromSettlement` — function — line 34
  - domain: quests-progression
- `selectSettlementQuestGiver` — function — line 53
  - domain: quests-progression

## `quests/opportunities/worldQuestOpportunityTypes.ts`

- `LostLivestockOpportunity` — type — line 45
  - domain: quests-progression
- `LostLivestockSourceLookup` — type — line 93
  - domain: quests-progression
- `OpportunityNpc` — type — line 102
  - domain: quests-progression
- `RpgQuestMatrixId` — type — line 24
  - domain: quests-progression
- `RpgQuestOpportunity` — type — line 59
  - domain: quests-progression
- `SettlementQuestOpportunity` — type — line 67
- `WolfDenPressureOpportunity` — type — line 32
  - domain: quests-progression
- `WorldQuestOpportunityKind` — type — line 16
  - domain: quests-progression
  - system: settlement-quest-opportunities
  - role: Data-only opportunity contract between settlement/world systems and quest materialization.
- `WorldQuestSourceLookup` — type — line 83
  - domain: quests-progression
- `WorldQuestSourceStatus` — type — line 75
  - domain: quests-progression

## `quests/QuestManager.ts`

- `AnimalTargetResolver` — type — line 200
- `ApplySocialConsequence` — type — line 212
- `DangerousTraitApplier` — type — line 205
- `HabitatAnimalFeedContext` — type — line 157
- `HorseRewardAvailability` — type — line 176
- `ObjectiveRef` — type — line 181
- `PlayerAnimalHarvestContext` — type — line 150
- `QUEST_MARKER_AVAILABLE` — const — line 57
- `QUEST_MARKER_IN_PROGRESS` — const — line 58
- `QUEST_MARKER_READY` — const — line 59
- `QUEST_MARKER_TALK_TARGET` — const — line 60
- `QuestAnimalOwnershipTransfer` — type — line 172
- `QuestDialogAction` — type — line 62
- `QuestDialogOverride` — type — line 90
  - domain: quests-progression
- `QuestDialogTopic` — type — line 78
- `QuestItemGrant` — type — line 168
- `QuestListEntry` — type — line 115
- `QuestManager` — class — line 355
  - domain: quests-progression
  - system: quest-manager
  - role: Owns quest progress, objective/stage evaluation and NPC relation levels.
  - owns: QuestProgressEntry
  - integration: Bound to world entities (fauna, wells, spawners) via injected resolvers, never by importing them directly. World-driven opportunities use a read-only source lookup; QuestManager owns quest progress only.
- `QuestManagerInitial` — type — line 136
- `QuestPromisedReward` — type — line 111
- `QuestSocialAvailabilityLookup` — type — line 217
- `QuestWorldProgressLookup` — type — line 251
- `QuestWorldTimeLookup` — type — line 223
- `SettlementRatInfestationLookup` — type — line 231
- `SpawnPointDestructionLookup` — type — line 241

## `quests/quests.ts`

- `AuthoredQuestConsequences` — type — line 517
- `AuthoredQuestDef` — type — line 548
  - domain: quests-progression
- `AuthoredQuestObjective` — type — line 500
- `AuthoredQuestOutcome` — type — line 539
- `AuthoredQuestPrerequisite` — type — line 513
- `AuthoredQuestStage` — type — line 534
- `AuthoredQuestStageDialogueAction` — type — line 527
  - domain: quests-progression
- `bindDarkForestTreasureQuest` — function — line 1515
- `bindExactCaveQuests` — function — line 1490
- `buildDarkForestTreasureQuest` — function — line 1367
- `buildHorseAcquisitionQuest` — function — line 1414
- `buildLandmarkQuests` — function — line 1261
- `CAVE_PLACE_TOKEN` — const — line 1457
- `cavePlacePhrase` — function — line 1461
- `hasSocialConsequence` — function — line 295
- `LandmarkResolver` — type — line 1250
- `MAP_SOURCE_PLACE_TOKEN` — const — line 1364
- `QUEST_STATES` — const — line 271
- `QuestAvailability` — type — line 78
- `QuestConsequences` — type — line 244
- `QuestDef` — type — line 457
- `QuestDefinitionValidationError` — class — line 94
- `QuestNpcRef` — type — line 60
  - domain: quests-progression
- `QuestObjective` — type — line 302
- `QuestOutcome` — type — line 252
- `QuestOutcomeId` — type — line 232
- `QuestPrerequisite` — type — line 67
- `QuestProgressEntry` — type — line 262
- `QuestReward` — type — line 236
- `QUESTS` — const — line 554
- `QuestStage` — type — line 433
- `QuestStageDialogueAction` — type — line 426
  - domain: quests-progression
- `QuestState` — type — line 13
- `RELATION_LEVEL_THRESHOLDS` — const — line 36
- `RelationLevel` — type — line 32
- `relationLevelMeetsMinimum` — function — line 85
- `relationToLevel` — function — line 46
- `treasureMapSourcePlacePhrase` — function — line 1477
- `uniqueOutcomeForState` — function — line 283
- `validateQuestDefinitions` — function — line 100

## `quests/settlementLightLookup.ts`

- `evaluateSettlementLightsObjective` — function — line 20
- `SettlementLightLookup` — type — line 16
- `SettlementLightSnapshot` — type — line 10
- `SettlementLightStatus` — type — line 8
  - domain: quests-progression

## `quests/settlementRatInfestation.ts`

- `isSettlementRatInfestationResolved` — function — line 16
- `settlementRatInfestationReminderLine` — function — line 22
- `SettlementRatInfestationSnapshot` — type — line 8
  - domain: quests-progression
  - system: settlement-rat-infestation
  - role: Pure world-condition helpers for the settlement rat infestation quest (plan quests-progression-006 §5, quests-progression-013 §11).
