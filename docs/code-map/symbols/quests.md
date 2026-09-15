# Symbols

Generated from exported TypeScript symbols.

## `quests/cardinalDirection.ts`

- `CARDINAL_SECTORS` — const — line 3
- `cardinalDirectionPhrase` — function — line 34
- `cardinalSector` — function — line 25
  - domain: quests-progression
- `CardinalSector` — type — line 4

## `quests/caveLocationDescription.ts`

- `CaveLocationDescriptionInput` — type — line 16
- `CaveQuestPresentationInput` — type — line 43
- `describeCaveLocation` — function — line 32
  - domain: quests-progression
- `resolveCaveQuestPresentation` — function — line 57
  - domain: quests-progression

## `quests/dungeonBanditTreasure.ts`

- `buildDungeonBanditTreasureQuest` — function — line 375
  - domain: quests-progression
- `createDungeonBanditLedgerInstance` — function — line 91
- `createDungeonBanditMarkedValuableInstance` — function — line 95
- `DUNGEON_BANDIT_DEEP_RESERVATION_KEY` — const — line 20
- `DUNGEON_BANDIT_GIVE_EVIDENCE_TO_GUARD_OUTCOME` — const — line 25
- `DUNGEON_BANDIT_KEEP_MARKED_PROPERTY_OUTCOME` — const — line 26
- `DUNGEON_BANDIT_LEDGER_KIND` — const — line 28
- `DUNGEON_BANDIT_MARKED_VALUABLE_KIND` — const — line 29
- `DUNGEON_BANDIT_QUEST_PREFIX` — const — line 22
- `DUNGEON_BANDIT_RETURN_MARKED_PROPERTY_OUTCOME` — const — line 24
- `DUNGEON_BANDIT_TREASURE_RESERVATION_PREFIX` — const — line 18
- `dungeonBanditAnchorClaims` — function — line 253
- `dungeonBanditCaveReservationRequests` — function — line 268
- `dungeonBanditClaimsMatch` — function — line 279
  - domain: quests-progression
- `dungeonBanditContainerId` — function — line 78
- `dungeonBanditContainerSpecs` — function — line 351
- `dungeonBanditDeepReservationKey` — function — line 62
- `dungeonBanditDeepStashContainerSpec` — function — line 331
  - domain: quests-progression
- `dungeonBanditLedgerInstanceId` — function — line 70
- `dungeonBanditMarkedValuableInstanceId` — function — line 74
- `dungeonBanditQuestId` — function — line 82
- `dungeonBanditSideCacheContainerSpecs` — function — line 300
  - domain: quests-progression
- `dungeonBanditSideReservationKey` — function — line 66
- `DungeonBanditTreasureBinding` — type — line 38
  - domain: quests-progression
- `EligibleDungeonBanditCave` — type — line 160
- `eligibleDungeonBanditCaves` — function — line 172
  - domain: quests-progression
- `isDungeonBanditDeepStashLooted` — function — line 363
- `resolveDungeonBanditTreasureBinding` — function — line 205
  - domain: quests-progression
- `selectDungeonBanditNpcs` — function — line 126
  - domain: quests-progression

## `quests/dungeonBanditTreasureRuntime.ts`

- `getActiveDungeonBanditTreasureBinding` — function — line 12
- `setActiveDungeonBanditTreasureBinding` — function — line 6

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

## `quests/lostTreasureExpedition.ts`

- `buildLostTreasureExpeditionQuest` — function — line 385
  - domain: quests-progression
- `createLostTreasureExpeditionJournalInstance` — function — line 83
- `EligibleLostTreasureExpeditionCave` — type — line 144
- `eligibleLostTreasureExpeditionCaves` — function — line 188
  - domain: quests-progression
- `isLostTreasureExpeditionCampLooted` — function — line 368
- `isLostTreasureExpeditionEvidenceLooted` — function — line 372
- `isLostTreasureExpeditionFinalTreasureLooted` — function — line 376
- `isLostTreasureExpeditionJournalPackLooted` — function — line 354
- `LOST_TREASURE_EXPEDITION_CAMP_RESERVATION_KEY` — const — line 20
- `LOST_TREASURE_EXPEDITION_EVIDENCE_RESERVATION_KEY` — const — line 22
- `LOST_TREASURE_EXPEDITION_FINAL_RESERVATION_KEY` — const — line 23
- `LOST_TREASURE_EXPEDITION_JOURNAL_KIND` — const — line 31
- `LOST_TREASURE_EXPEDITION_JOURNAL_RESERVATION_KEY` — const — line 21
- `LOST_TREASURE_EXPEDITION_JOURNAL_TO_FAMILY_OUTCOME` — const — line 27
- `LOST_TREASURE_EXPEDITION_JOURNAL_TO_SPONSOR_OUTCOME` — const — line 28
- `LOST_TREASURE_EXPEDITION_KEEP_JOURNAL_OUTCOME` — const — line 29
- `LOST_TREASURE_EXPEDITION_QUEST_PREFIX` — const — line 25
- `LOST_TREASURE_EXPEDITION_RESERVATION_PREFIX` — const — line 18
- `lostTreasureExpeditionAnchorClaims` — function — line 274
- `LostTreasureExpeditionBinding` — type — line 47
  - domain: quests-progression
- `lostTreasureExpeditionCaveReservationRequests` — function — line 285
- `lostTreasureExpeditionClaimsMatch` — function — line 296
  - domain: quests-progression
- `lostTreasureExpeditionContainerId` — function — line 65
- `lostTreasureExpeditionContainerSpecs` — function — line 334
  - domain: quests-progression
- `lostTreasureExpeditionJournalInstanceId` — function — line 69
- `lostTreasureExpeditionQuestId` — function — line 73
- `resolveLostTreasureExpeditionBinding` — function — line 222
  - domain: quests-progression
- `selectLostTreasureExpeditionNpcs` — function — line 118
  - domain: quests-progression

## `quests/lostTreasureExpeditionRuntime.ts`

- `getActiveLostTreasureExpeditionBinding` — function — line 12
- `setActiveLostTreasureExpeditionBinding` — function — line 6

## `quests/materializeAuthoredQuests.ts`

- `AuthoredNpcResolutionError` — class — line 15
- `materializeAuthoredQuestDefs` — function — line 106
  - domain: quests-progression
- `normalizeLegacyQuestRelations` — function — line 168
  - domain: quests-progression
- `resolveAuthoredNpcId` — function — line 27
  - domain: quests-progression

## `quests/oldBonesAdventureCave.ts`

- `buildOldBonesAdventureCaveQuest` — function — line 295
  - domain: quests-progression
- `createOldBonesSignetInstance` — function — line 66
- `eligibleOldBonesAdventureAnchors` — function — line 173
  - domain: quests-progression
- `isOldBonesRemainsLooted` — function — line 283
- `OLD_BONES_GIVE_TO_SECOND_CLAIMANT_OUTCOME` — const — line 22
- `OLD_BONES_KEEP_SIGNET_OUTCOME` — const — line 23
- `OLD_BONES_QUEST_PREFIX` — const — line 19
- `OLD_BONES_RESERVATION_KEY` — const — line 17
- `OLD_BONES_RETURN_TO_FIRST_CLAIMANT_OUTCOME` — const — line 21
- `OLD_BONES_SIGNET_KIND` — const — line 25
- `OldBonesAdventureCaveBinding` — type — line 32
  - domain: quests-progression
- `oldBonesAnchorClaim` — function — line 242
- `oldBonesCaveReservationRequests` — function — line 251
- `oldBonesProfileReservation` — function — line 232
- `oldBonesQuestId` — function — line 62
- `oldBonesRemainsContainerId` — function — line 58
- `oldBonesRemainsContainerSpec` — function — line 266
  - domain: quests-progression
- `oldBonesSignetInstanceId` — function — line 54
- `resolveOldBonesAdventureCaveBinding` — function — line 196
  - domain: quests-progression
- `selectOldBonesNpcs` — function — line 93
  - domain: quests-progression

## `quests/oldBonesAdventureCaveRuntime.ts`

- `getActiveOldBonesAdventureCaveBinding` — function — line 10
- `setActiveOldBonesAdventureCaveBinding` — function — line 6

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

- `materializeRpgQuestOpportunity` — function — line 262
  - domain: quests-progression
  - system: settlement-quest-opportunities
  - role: Materializes a selected RPG matrix candidate into a normal QuestDef.
- `RpgMaterializationContext` — type — line 16

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

- `collectLostLivestockOpportunities` — function — line 146
  - domain: quests-progression
- `collectSettlementQuestOpportunities` — function — line 163
- `collectWolfDenPressureOpportunities` — function — line 66
  - domain: quests-progression
  - system: settlement-quest-opportunities
  - role: Collects world-driven candidates from authoritative fauna spawners.
- `LOST_LIVESTOCK_DEAD_OUTCOME` — const — line 103
- `LOST_LIVESTOCK_LIVE_OUTCOME` — const — line 102
- `LOST_LIVESTOCK_UNAVAILABLE_OUTCOME` — const — line 104
- `lostLivestockQuestId` — function — line 112
  - domain: quests-progression
- `parseLostLivestockQuestId` — function — line 116
- `parseWolfDenPressureQuestId` — function — line 23
- `settlementIdFromWolfDenSpawnerId` — function — line 29
- `wolfDenPressureQuestId` — function — line 19
  - domain: quests-progression
- `wolfDenPressureSourceStatus` — function — line 80
  - domain: quests-progression
- `wolfDenPressureStatusFromSpawners` — function — line 87

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

- `buildWorldDrivenSettlementQuests` — function — line 214
  - domain: quests-progression
- `materializeSettlementQuestOpportunity` — function — line 189
  - domain: quests-progression
  - system: settlement-quest-opportunities
  - role: Materializes a selected settlement opportunity into a normal QuestDef.
- `opportunityNpcsFromSettlement` — function — line 35
  - domain: quests-progression
- `selectSettlementQuestGiver` — function — line 54
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

- `AnimalTargetResolver` — type — line 249
- `ApplySocialConsequence` — type — line 261
- `DangerousTraitApplier` — type — line 254
- `HabitatAnimalFeedContext` — type — line 202
- `HorseRewardAvailability` — type — line 225
- `ObjectiveRef` — type — line 230
- `PlayerAnimalHarvestContext` — type — line 195
- `QUEST_MARKER_AVAILABLE` — const — line 71
- `QUEST_MARKER_IN_PROGRESS` — const — line 72
- `QUEST_MARKER_READY` — const — line 73
- `QUEST_MARKER_TALK_TARGET` — const — line 74
- `QuestAnimalOwnershipTransfer` — type — line 221
- `QuestDialogAction` — type — line 76
- `QuestDialogOverride` — type — line 113
  - domain: quests-progression
- `QuestDialogTopic` — type — line 101
- `QuestItemGrant` — type — line 217
- `QuestJournalNote` — type — line 144
- `QuestLifecycleHooks` — type — line 332
- `QuestListEntry` — type — line 151
- `QuestManager` — class — line 460
  - domain: quests-progression
  - system: quest-manager
  - role: Owns quest progress, objective/stage evaluation and NPC relation levels.
  - owns: QuestProgressEntry
  - integration: Bound to world entities (fauna, wells, spawners) via injected resolvers, never by importing them directly. World-driven opportunities use a read-only source lookup; QuestManager owns quest progress only.
- `QuestManagerInitial` — type — line 174
- `QuestPhysicalOutcomeContext` — type — line 316
- `QuestPhysicalOutcomeResolver` — type — line 322
- `QuestPromisedReward` — type — line 138
- `QuestSocialAvailabilityLookup` — type — line 266
- `QuestWorldProgressLookup` — type — line 300
- `QuestWorldTimeLookup` — type — line 272
- `SettlementRatInfestationLookup` — type — line 280
- `SpawnPointDestructionLookup` — type — line 290

## `quests/quests.ts`

- `AuthoredQuestAbandonment` — type — line 1009
- `AuthoredQuestConsequences` — type — line 971
- `AuthoredQuestDef` — type — line 1018
  - domain: quests-progression
- `AuthoredQuestObjective` — type — line 954
- `AuthoredQuestOutcome` — type — line 1005
- `AuthoredQuestPrerequisite` — type — line 967
- `AuthoredQuestStage` — type — line 999
- `AuthoredQuestStageDialogueAction` — type — line 981
  - domain: quests-progression
- `AuthoredQuestStageObjectiveSlot` — type — line 993
- `bindDarkForestTreasureQuest` — function — line 2060
- `bindExactCaveQuests` — function — line 2033
- `bindTreasureMapBearCaveQuest` — function — line 2167
- `buildDarkForestTreasureQuest` — function — line 1902
- `buildHorseAcquisitionQuest` — function — line 1949
- `buildLandmarkQuests` — function — line 1735
- `buildTreasureMapBearCaveQuest` — function — line 2086
- `CAVE_PLACE_TOKEN` — const — line 1992
- `cavePlacePhrase` — function — line 1996
- `externalResolutionOutcome` — function — line 547
  - domain: quests-progression
- `hasSocialConsequence` — function — line 558
- `isLegacySingleObjectiveStage` — function — line 822
- `LandmarkResolver` — type — line 1724
- `LEGACY_QUEST_OBJECTIVE_SLOT_ID` — const — line 724
- `MAP_SOURCE_PLACE_TOKEN` — const — line 1899
- `matchStageTransition` — function — line 849
- `objectiveNeedsPersistedSlotProgress` — function — line 832
  - domain: quests-progression
- `QUEST_STATES` — const — line 510
- `QuestAbandonment` — type — line 125
  - domain: quests-progression
- `QuestAvailability` — type — line 84
- `QuestConsequences` — type — line 443
- `QuestDef` — type — line 862
- `QuestDefinitionValidationError` — class — line 142
- `QuestJournalEvent` — type — line 474
- `QuestJournalKind` — type — line 472
- `QuestLocationReveal` — type — line 718
- `QuestNpcRef` — type — line 66
  - domain: quests-progression
- `QuestObjective` — type — line 565
- `QuestObjectiveSlotId` — type — line 726
- `QuestOfferPolicy` — type — line 108
  - domain: quests-progression
- `QuestOfferRankSignal` — type — line 919
  - domain: quests-progression
- `QuestOutcome` — type — line 451
- `QuestOutcomeId` — type — line 431
- `QuestPrerequisite` — type — line 73
- `QuestProgressEntry` — type — line 487
- `QuestReward` — type — line 435
- `QUESTS` — const — line 1025
- `QuestStage` — type — line 756
- `QuestStageDialogueAction` — type — line 704
- `QuestStageEffect` — type — line 698
  - domain: quests-progression
- `questStageMode` — function — line 818
- `QuestStageMode` — type — line 728
- `QuestStageObjectiveSlot` — type — line 736
  - domain: quests-progression
- `questStageObjectiveSlots` — function — line 804
  - domain: quests-progression
- `QuestStageSlotProgress` — type — line 465
  - domain: quests-progression
- `QuestStageTransition` — type — line 750
  - domain: quests-progression
- `QuestState` — type — line 14
- `rankQuestOfferCandidates` — function — line 940
  - domain: quests-progression
- `RELATION_LEVEL_THRESHOLDS` — const — line 42
- `RelationLevel` — type — line 38
- `relationLevelMeetsMinimum` — function — line 133
- `relationToLevel` — function — line 52
- `RESOLVED_WITHOUT_PLAYER_OUTCOME` — const — line 538
  - domain: quests-progression
- `TreasureMapBearCaveQuestBinding` — type — line 2077
- `treasureMapSourcePlacePhrase` — function — line 2012
- `uniqueOutcomeForState` — function — line 523
- `validateQuestDefinitions` — function — line 149

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
