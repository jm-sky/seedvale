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

## `quests/lostHunterNaturalCave.ts`

- `buildLostHunterNaturalCaveQuest` — function — line 196
  - domain: quests-progression
- `createLostHunterBowInstance` — function — line 65
- `isLostHunterPackLooted` — function — line 184
- `LOST_HUNTER_KEEP_BOW_OUTCOME` — const — line 16
- `LOST_HUNTER_QUEST_PREFIX` — const — line 13
- `LOST_HUNTER_RETURN_BOW_OUTCOME` — const — line 15
- `lostHunterBowInstanceId` — function — line 45
- `LostHunterNaturalCaveBinding` — type — line 23
  - domain: quests-progression
- `lostHunterPackContainerId` — function — line 49
- `lostHunterPackContainerSpec` — function — line 167
- `lostHunterQuestId` — function — line 53
- `parseLostHunterQuestId` — function — line 57
- `resolveLostHunterNaturalCaveBinding` — function — line 133
- `selectLostHunterNpcs` — function — line 110

## `quests/lostHunterNaturalCaveRuntime.ts`

- `getActiveLostHunterNaturalCaveBinding` — function — line 10
- `setActiveLostHunterNaturalCaveBinding` — function — line 6

## `quests/materializeAuthoredQuests.ts`

- `AuthoredNpcResolutionError` — class — line 15
- `materializeAuthoredQuestDefs` — function — line 106
  - domain: quests-progression
- `normalizeLegacyQuestRelations` — function — line 154
  - domain: quests-progression
- `resolveAuthoredNpcId` — function — line 27
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

- `materializeRpgQuestOpportunity` — function — line 259
  - domain: quests-progression
  - system: settlement-quest-opportunities
  - role: Materializes a selected RPG matrix candidate into a normal QuestDef.
- `RpgMaterializationContext` — type — line 15

## `quests/opportunities/rpgQuestMatrices.ts`

- `adultOpportunityNpcs` — function — line 99
  - domain: quests-progression
- `collectOldPlaceSecretCandidate` — function — line 124
  - domain: quests-progression
  - role: Collects a lightweight RPG candidate bound to a real landmark id.
- `collectRpgQuestOpportunities` — function — line 249
  - domain: quests-progression
  - system: settlement-quest-opportunities
  - role: Collects RPG matrix candidates without building QuestDefs.
- `collectSettlementAgreementCandidate` — function — line 211
  - domain: quests-progression
  - role: Collects a lightweight RPG candidate bound to a target settlement id.
- `collectSuspiciousTransportCandidate` — function — line 184
  - domain: quests-progression
  - role: Collects a lightweight RPG candidate bound to a counterpart NPC id.
- `nearbyRpgSettlementDefs` — function — line 274
  - domain: quests-progression
- `OLD_PLACE_LANDMARK_KINDS` — const — line 18
  - domain: quests-progression
- `parseRpgQuestId` — function — line 75
- `pickSuspiciousTransportNpcs` — function — line 147
  - domain: quests-progression
- `pickSuspiciousTransportReceiver` — function — line 165
  - domain: quests-progression
- `RPG_NEIGHBOR_SETTLEMENT_LIMIT` — const — line 32
  - domain: quests-progression
- `RPG_QUEST_PREFIX` — const — line 10
- `RpgCollectInput` — type — line 47
- `RpgLandmarkRef` — type — line 34
- `rpgQuestId` — function — line 71
  - domain: quests-progression
- `RpgSettlementRef` — type — line 39

## `quests/opportunities/settlementNpcMaterialization.ts`

- `SettlementOpportunityNpc` — type — line 11
  - domain: quests-progression
- `settlementOpportunityNpcsFlattened` — function — line 44
- `settlementOpportunityNpcsFromDef` — function — line 22
  - domain: quests-progression

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

- `AnimalTargetResolver` — type — line 214
- `ApplySocialConsequence` — type — line 226
- `DangerousTraitApplier` — type — line 219
- `HabitatAnimalFeedContext` — type — line 167
- `HorseRewardAvailability` — type — line 190
- `ObjectiveRef` — type — line 195
- `PlayerAnimalHarvestContext` — type — line 160
- `QUEST_MARKER_AVAILABLE` — const — line 65
- `QUEST_MARKER_IN_PROGRESS` — const — line 66
- `QUEST_MARKER_READY` — const — line 67
- `QUEST_MARKER_TALK_TARGET` — const — line 68
- `QuestAnimalOwnershipTransfer` — type — line 186
- `QuestDialogAction` — type — line 70
- `QuestDialogOverride` — type — line 98
  - domain: quests-progression
- `QuestDialogTopic` — type — line 86
- `QuestItemGrant` — type — line 182
- `QuestLifecycleHooks` — type — line 297
- `QuestListEntry` — type — line 123
- `QuestManager` — class — line 400
  - domain: quests-progression
  - system: quest-manager
  - role: Owns quest progress, objective/stage evaluation and NPC relation levels.
  - owns: QuestProgressEntry
  - integration: Bound to world entities (fauna, wells, spawners) via injected resolvers, never by importing them directly. World-driven opportunities use a read-only source lookup; QuestManager owns quest progress only.
- `QuestManagerInitial` — type — line 144
- `QuestPhysicalOutcomeContext` — type — line 281
- `QuestPhysicalOutcomeResolver` — type — line 287
- `QuestPromisedReward` — type — line 119
- `QuestSocialAvailabilityLookup` — type — line 231
- `QuestWorldProgressLookup` — type — line 265
- `QuestWorldTimeLookup` — type — line 237
- `SettlementRatInfestationLookup` — type — line 245
- `SpawnPointDestructionLookup` — type — line 255

## `quests/quests.ts`

- `AuthoredQuestConsequences` — type — line 819
- `AuthoredQuestDef` — type — line 862
  - domain: quests-progression
- `AuthoredQuestObjective` — type — line 802
- `AuthoredQuestOutcome` — type — line 853
- `AuthoredQuestPrerequisite` — type — line 815
- `AuthoredQuestStage` — type — line 847
- `AuthoredQuestStageDialogueAction` — type — line 829
  - domain: quests-progression
- `AuthoredQuestStageObjectiveSlot` — type — line 841
- `bindDarkForestTreasureQuest` — function — line 1838
- `bindExactCaveQuests` — function — line 1811
- `bindTreasureMapBearCaveQuest` — function — line 1934
- `buildDarkForestTreasureQuest` — function — line 1681
- `buildHorseAcquisitionQuest` — function — line 1728
- `buildLandmarkQuests` — function — line 1575
- `buildTreasureMapBearCaveQuest` — function — line 1863
- `CAVE_PLACE_TOKEN` — const — line 1771
- `cavePlacePhrase` — function — line 1775
- `hasSocialConsequence` — function — line 459
- `isLegacySingleObjectiveStage` — function — line 719
- `LandmarkResolver` — type — line 1564
- `LEGACY_QUEST_OBJECTIVE_SLOT_ID` — const — line 621
- `MAP_SOURCE_PLACE_TOKEN` — const — line 1678
- `matchStageTransition` — function — line 746
- `objectiveNeedsPersistedSlotProgress` — function — line 729
  - domain: quests-progression
- `QUEST_STATES` — const — line 435
- `QuestAvailability` — type — line 78
- `QuestConsequences` — type — line 395
- `QuestDef` — type — line 759
- `QuestDefinitionValidationError` — class — line 94
- `QuestLocationReveal` — type — line 615
- `QuestNpcRef` — type — line 60
  - domain: quests-progression
- `QuestObjective` — type — line 466
- `QuestObjectiveSlotId` — type — line 623
- `QuestOutcome` — type — line 403
- `QuestOutcomeId` — type — line 383
- `QuestPrerequisite` — type — line 67
- `QuestProgressEntry` — type — line 421
- `QuestReward` — type — line 387
- `QUESTS` — const — line 868
- `QuestStage` — type — line 653
- `QuestStageDialogueAction` — type — line 601
- `QuestStageEffect` — type — line 598
  - domain: quests-progression
- `questStageMode` — function — line 715
- `QuestStageMode` — type — line 625
- `QuestStageObjectiveSlot` — type — line 633
  - domain: quests-progression
- `questStageObjectiveSlots` — function — line 701
  - domain: quests-progression
- `QuestStageSlotProgress` — type — line 414
  - domain: quests-progression
- `QuestStageTransition` — type — line 647
  - domain: quests-progression
- `QuestState` — type — line 13
- `RELATION_LEVEL_THRESHOLDS` — const — line 36
- `RelationLevel` — type — line 32
- `relationLevelMeetsMinimum` — function — line 85
- `relationToLevel` — function — line 46
- `TreasureMapBearCaveQuestBinding` — type — line 1855
- `treasureMapSourcePlacePhrase` — function — line 1791
- `uniqueOutcomeForState` — function — line 447
- `validateQuestDefinitions` — function — line 101

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

## `quests/suspiciousTransportCaveCache.ts`

- `buildSuspiciousTransportCaveCacheQuest` — function — line 169
  - domain: quests-progression
- `createSuspiciousTransportEvidenceInstance` — function — line 59
- `isSuspiciousTransportCacheLooted` — function — line 156
- `resolveSuspiciousTransportCaveCacheBinding` — function — line 96
  - domain: quests-progression
- `SUSPICIOUS_TRANSPORT_CAVE_CACHE_RESERVATION_KEY` — const — line 17
- `SUSPICIOUS_TRANSPORT_EVIDENCE_KIND` — const — line 23
- `SUSPICIOUS_TRANSPORT_KEEP_GOODS_OUTCOME` — const — line 21
- `SUSPICIOUS_TRANSPORT_KEEP_QUIET_OUTCOME` — const — line 19
- `SUSPICIOUS_TRANSPORT_REPORT_IT_OUTCOME` — const — line 20
- `suspiciousTransportCacheContainerId` — function — line 55
- `suspiciousTransportCacheContainerSpec` — function — line 139
  - domain: quests-progression
- `SuspiciousTransportCaveCacheBinding` — type — line 30
  - domain: quests-progression
- `suspiciousTransportEvidenceInstanceId` — function — line 51

## `quests/suspiciousTransportCaveCacheRuntime.ts`

- `getActiveSuspiciousTransportCaveCacheBinding` — function — line 12
- `setActiveSuspiciousTransportCaveCacheBinding` — function — line 6
