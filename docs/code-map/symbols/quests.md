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

- `AnimalTargetResolver` — type — line 224
- `ApplySocialConsequence` — type — line 236
- `DangerousTraitApplier` — type — line 229
- `HabitatAnimalFeedContext` — type — line 177
- `HorseRewardAvailability` — type — line 200
- `ObjectiveRef` — type — line 205
- `PlayerAnimalHarvestContext` — type — line 170
- `QUEST_MARKER_AVAILABLE` — const — line 68
- `QUEST_MARKER_IN_PROGRESS` — const — line 69
- `QUEST_MARKER_READY` — const — line 70
- `QUEST_MARKER_TALK_TARGET` — const — line 71
- `QuestAnimalOwnershipTransfer` — type — line 196
- `QuestDialogAction` — type — line 73
- `QuestDialogOverride` — type — line 101
  - domain: quests-progression
- `QuestDialogTopic` — type — line 89
- `QuestItemGrant` — type — line 192
- `QuestLifecycleHooks` — type — line 307
- `QuestListEntry` — type — line 130
- `QuestManager` — class — line 425
  - domain: quests-progression
  - system: quest-manager
  - role: Owns quest progress, objective/stage evaluation and NPC relation levels.
  - owns: QuestProgressEntry
  - integration: Bound to world entities (fauna, wells, spawners) via injected resolvers, never by importing them directly. World-driven opportunities use a read-only source lookup; QuestManager owns quest progress only.
- `QuestManagerInitial` — type — line 151
- `QuestPhysicalOutcomeContext` — type — line 291
- `QuestPhysicalOutcomeResolver` — type — line 297
- `QuestPromisedReward` — type — line 126
- `QuestSocialAvailabilityLookup` — type — line 241
- `QuestWorldProgressLookup` — type — line 275
- `QuestWorldTimeLookup` — type — line 247
- `SettlementRatInfestationLookup` — type — line 255
- `SpawnPointDestructionLookup` — type — line 265

## `quests/quests.ts`

- `AuthoredQuestAbandonment` — type — line 963
- `AuthoredQuestConsequences` — type — line 925
- `AuthoredQuestDef` — type — line 972
  - domain: quests-progression
- `AuthoredQuestObjective` — type — line 908
- `AuthoredQuestOutcome` — type — line 959
- `AuthoredQuestPrerequisite` — type — line 921
- `AuthoredQuestStage` — type — line 953
- `AuthoredQuestStageDialogueAction` — type — line 935
  - domain: quests-progression
- `AuthoredQuestStageObjectiveSlot` — type — line 947
- `bindDarkForestTreasureQuest` — function — line 1949
- `bindExactCaveQuests` — function — line 1922
- `bindTreasureMapBearCaveQuest` — function — line 2056
- `buildDarkForestTreasureQuest` — function — line 1792
- `buildHorseAcquisitionQuest` — function — line 1839
- `buildLandmarkQuests` — function — line 1686
- `buildTreasureMapBearCaveQuest` — function — line 1975
- `CAVE_PLACE_TOKEN` — const — line 1882
- `cavePlacePhrase` — function — line 1886
- `hasSocialConsequence` — function — line 512
- `isLegacySingleObjectiveStage` — function — line 776
- `LandmarkResolver` — type — line 1675
- `LEGACY_QUEST_OBJECTIVE_SLOT_ID` — const — line 678
- `MAP_SOURCE_PLACE_TOKEN` — const — line 1789
- `matchStageTransition` — function — line 803
- `objectiveNeedsPersistedSlotProgress` — function — line 786
  - domain: quests-progression
- `QUEST_STATES` — const — line 487
- `QuestAbandonment` — type — line 119
  - domain: quests-progression
- `QuestAvailability` — type — line 84
- `QuestConsequences` — type — line 437
- `QuestDef` — type — line 816
- `QuestDefinitionValidationError` — class — line 136
- `QuestLocationReveal` — type — line 672
- `QuestNpcRef` — type — line 66
  - domain: quests-progression
- `QuestObjective` — type — line 519
- `QuestObjectiveSlotId` — type — line 680
- `QuestOfferPolicy` — type — line 102
  - domain: quests-progression
- `QuestOfferRankSignal` — type — line 873
  - domain: quests-progression
- `QuestOutcome` — type — line 445
- `QuestOutcomeId` — type — line 425
- `QuestPrerequisite` — type — line 73
- `QuestProgressEntry` — type — line 466
- `QuestReward` — type — line 429
- `QUESTS` — const — line 979
- `QuestStage` — type — line 710
- `QuestStageDialogueAction` — type — line 658
- `QuestStageEffect` — type — line 652
  - domain: quests-progression
- `questStageMode` — function — line 772
- `QuestStageMode` — type — line 682
- `QuestStageObjectiveSlot` — type — line 690
  - domain: quests-progression
- `questStageObjectiveSlots` — function — line 758
  - domain: quests-progression
- `QuestStageSlotProgress` — type — line 459
  - domain: quests-progression
- `QuestStageTransition` — type — line 704
  - domain: quests-progression
- `QuestState` — type — line 14
- `rankQuestOfferCandidates` — function — line 894
  - domain: quests-progression
- `RELATION_LEVEL_THRESHOLDS` — const — line 42
- `RelationLevel` — type — line 38
- `relationLevelMeetsMinimum` — function — line 127
- `relationToLevel` — function — line 52
- `TreasureMapBearCaveQuestBinding` — type — line 1966
- `treasureMapSourcePlacePhrase` — function — line 1902
- `uniqueOutcomeForState` — function — line 500
- `validateQuestDefinitions` — function — line 143

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
