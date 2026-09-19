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
- `dungeonBanditInstanceOwned` — function — line 552
  - domain: quests-progression
- `dungeonBanditLedgerInstanceId` — function — line 70
- `dungeonBanditMarkedValuableInstanceId` — function — line 74
- `dungeonBanditOrphanedInstances` — function — line 583
  - domain: quests-progression
- `DungeonBanditOwnershipDomains` — type — line 532
- `dungeonBanditQuestId` — function — line 82
- `DungeonBanditRecoveryContext` — type — line 565
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

## `quests/huntersBrotherhoodIntroduction.ts`

- `buildHuntersBrotherhoodIntroductionQuest` — function — line 218
  - domain: quests-progression
- `HUNTERS_BROTHERHOOD_JOINED_OUTCOME` — const — line 14
- `HuntersBrotherhoodBinding` — type — line 25
  - domain: quests-progression
- `HuntersBrotherhoodCastInput` — type — line 46
  - domain: quests-progression
- `huntersBrotherhoodIntroductionQuestId` — function — line 64
  - domain: quests-progression
- `resolveHuntersBrotherhoodBinding` — function — line 116
  - domain: quests-progression

## `quests/huntersBrotherhoodInvestigation.ts`

- `BrotherhoodHabitatDiagnosis` — type — line 113
- `buildHuntersBrotherhoodInvestigationQuest` — function — line 272
  - domain: quests-progression
- `deriveBrotherhoodHabitatDiagnosis` — function — line 128
  - domain: quests-progression
- `describeBrotherhoodHabitatDiagnosis` — function — line 180
  - domain: quests-progression
- `habitatPressureObservationFromSnapshot` — function — line 150
  - domain: quests-progression
- `HUNTERS_BROTHERHOOD_INVESTIGATION_COMPLETE_OUTCOME` — const — line 16
- `HuntersBrotherhoodInvestigationInput` — type — line 257
- `huntersBrotherhoodInvestigationQuestId` — function — line 26
  - domain: quests-progression
- `HuntingGroundCandidate` — type — line 68
- `huntingGroundCandidateSpawners` — function — line 40
  - domain: quests-progression
- `rankHuntingGroundCandidates` — function — line 80
  - domain: quests-progression
- `selectHuntingGroundSpawnerId` — function — line 97
  - domain: quests-progression

## `quests/landmarkLocationDescription.ts`

- `describeLandmarkLocation` — function — line 23
  - domain: quests-progression
- `LandmarkLocationDescriptionInput` — type — line 7

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

## `quests/lostTreasureChronicleDeciphering.ts`

- `buildLostTreasureChronicleDecipheringQuest` — function — line 161
  - domain: quests-progression
- `CHRONICLE_REFERENCE_KIND` — const — line 19
- `chronicleReferenceContainerId` — function — line 67
- `createChronicleReferenceInstance` — function — line 63
- `isLostTreasureChronicleDeciphered` — function — line 291
- `LOST_TREASURE_CHRONICLE_DECIPHERING_QUEST_ID` — const — line 15
- `LOST_TREASURE_CHRONICLE_REFERENCE_INSTANCE_ID` — const — line 20
- `LOST_TREASURE_DECIPHERED_FAVOUR_OUTCOME` — const — line 17
- `LOST_TREASURE_DECIPHERED_PAID_OUTCOME` — const — line 16
- `LOST_TREASURE_DECIPHERING_FEE` — const — line 21
- `LOST_TREASURE_DECIPHERING_RESERVATION_PREFIX` — const — line 22
- `LostTreasureChronicleDecipheringBinding` — type — line 29
  - domain: quests-progression
- `lostTreasureChronicleReferenceContainerSpec` — function — line 142
  - domain: quests-progression
- `ResolveChronicleDecipheringBindingInput` — type — line 87
- `resolveLostTreasureChronicleDecipheringBinding` — function — line 100
  - domain: quests-progression

## `quests/lostTreasureChronicleDecipheringRuntime.ts`

- `getActiveLostTreasureChronicleDecipheringBinding` — function — line 12
- `setActiveLostTreasureChronicleDecipheringBinding` — function — line 6

## `quests/lostTreasureChronicleSearch.ts`

- `buildLostTreasureChronicleSearchQuests` — function — line 355
  - domain: quests-progression
- `CHRONICLE_SEARCH_EVIDENCE_KIND` — const — line 33
- `ChronicleSearchCemetery` — type — line 43
- `chronicleSearchGraveBuriedSpotId` — function — line 144
- `ChronicleSearchLead` — type — line 41
- `chronicleSearchOfferLine` — function — line 273
- `chronicleSearchRuinsContainerId` — function — line 148
- `ChronicleSearchRuinsLandmark` — type — line 52
- `chronicleSearchRuinsLocationId` — function — line 140
- `chronicleSearchTruth` — function — line 160
- `ChronicleSearchTruth` — type — line 40
- `createChronicleSearchEvidenceInstance` — function — line 156
- `createEncodedChronicleInstance` — function — line 152
- `ENCODED_CHRONICLE_KIND` — const — line 32
- `isChronicleSearchSourceLooted` — function — line 283
- `isLostTreasureGraveAccessGranted` — function — line 540
- `LOST_TREASURE_CEMETERY_FAVOUR_QUEST_ID` — const — line 28
- `LOST_TREASURE_CHRONICLE_ACQUIRED_OUTCOME` — const — line 29
- `LOST_TREASURE_CHRONICLE_EVIDENCE_INSTANCE_ID` — const — line 36
- `LOST_TREASURE_CHRONICLE_INSTANCE_ID` — const — line 35
- `LOST_TREASURE_CHRONICLE_SEARCH_QUEST_ID` — const — line 27
- `LOST_TREASURE_CHRONICLE_SEARCH_RESERVATION_PREFIX` — const — line 38
- `LOST_TREASURE_GRAVE_ACCESS_OUTCOME` — const — line 30
- `lostTreasureChronicleGravePlacement` — function — line 301
  - domain: quests-progression
- `lostTreasureChronicleRuinsContainerSpec` — function — line 320
  - domain: quests-progression
- `LostTreasureChronicleSearchBinding` — type — line 66
  - domain: quests-progression
- `lostTreasureResearcherSurname` — function — line 136
- `ResolveChronicleSearchBindingInput` — type — line 191
- `resolveChronicleSearchLead` — function — line 262
  - domain: quests-progression
- `resolveLostTreasureChronicleSearchBinding` — function — line 205
  - domain: quests-progression

## `quests/lostTreasureChronicleSearchRuntime.ts`

- `getActiveLostTreasureChronicleSearchBinding` — function — line 12
- `setActiveLostTreasureChronicleSearchBinding` — function — line 6

## `quests/lostTreasureChroniclesElder.ts`

- `buildLostTreasureChroniclesElderQuests` — function — line 108
  - domain: quests-progression
- `findLostTreasureChroniclesElderSettlement` — function — line 97
  - domain: quests-progression
- `LOST_TREASURE_CHRONICLES_DISPUTE_RECONCILE_OUTCOME` — const — line 15
- `LOST_TREASURE_CHRONICLES_DISPUTE_SUPPORT_ELDER_OUTCOME` — const — line 14
- `LOST_TREASURE_CHRONICLES_ELDER_DISPUTE_QUEST_ID` — const — line 10
- `LOST_TREASURE_CHRONICLES_ELDER_WINTER_QUEST_ID` — const — line 9
- `LOST_TREASURE_CHRONICLES_WINTER_BRANCH_COUNT` — const — line 17
- `LOST_TREASURE_CHRONICLES_WINTER_MATERIAL_OUTCOME` — const — line 12
- `LOST_TREASURE_CHRONICLES_WINTER_NEIGHBOR_OUTCOME` — const — line 13
- `LostTreasureChroniclesElderBinding` — type — line 25
  - domain: quests-progression
- `resolveLostTreasureChroniclesElderBinding` — function — line 60
  - domain: quests-progression

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

- `AuthoredNpcResolutionError` — class — line 18
- `materializeAuthoredQuestDefs` — function — line 151
  - domain: quests-progression
- `normalizeLegacyQuestRelations` — function — line 213
  - domain: quests-progression
- `resolveAuthoredNpcId` — function — line 30
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

- `buildHunterProfessionQuests` — function — line 215
  - domain: quests-progression
- `HUNTER_III_COMPLETE_OUTCOME` — const — line 12
- `hunterProfessionQuestId` — function — line 30
  - domain: quests-progression
- `parseHunterProfessionQuestId` — function — line 34
- `selectHunterQuestGiver` — function — line 53

## `quests/opportunities/rpgQuestMaterialization.ts`

- `materializeRpgQuestOpportunity` — function — line 284
  - domain: quests-progression
  - system: settlement-quest-opportunities
  - role: Materializes a selected RPG matrix candidate into a normal QuestDef.
- `RpgMaterializationContext` — type — line 17

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

- `collectInjuredCowOpportunities` — function — line 211
  - domain: quests-progression
- `collectLostLivestockOpportunities` — function — line 148
  - domain: quests-progression
- `collectSettlementQuestOpportunities` — function — line 232
- `collectWolfDenPressureOpportunities` — function — line 68
  - domain: quests-progression
  - system: settlement-quest-opportunities
  - role: Collects world-driven candidates from authoritative fauna spawners.
- `INJURED_COW_SLAUGHTERED_OUTCOME` — const — line 168
- `INJURED_COW_TREATED_OUTCOME` — const — line 167
- `injuredCowQuestId` — function — line 176
  - domain: quests-progression
- `LOST_LIVESTOCK_DEAD_OUTCOME` — const — line 105
- `LOST_LIVESTOCK_LIVE_OUTCOME` — const — line 104
- `LOST_LIVESTOCK_UNAVAILABLE_OUTCOME` — const — line 106
- `lostLivestockQuestId` — function — line 114
  - domain: quests-progression
- `parseInjuredCowQuestId` — function — line 180
- `parseLostLivestockQuestId` — function — line 118
- `parseWolfDenPressureQuestId` — function — line 25
- `settlementIdFromWolfDenSpawnerId` — function — line 31
- `wolfDenPressureQuestId` — function — line 21
  - domain: quests-progression
- `wolfDenPressureSourceStatus` — function — line 82
  - domain: quests-progression
- `wolfDenPressureStatusFromSpawners` — function — line 89

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

- `buildWorldDrivenSettlementQuests` — function — line 310
  - domain: quests-progression
- `materializeSettlementQuestOpportunity` — function — line 282
  - domain: quests-progression
  - system: settlement-quest-opportunities
  - role: Materializes a selected settlement opportunity into a normal QuestDef.
- `opportunityNpcsFromSettlement` — function — line 38
  - domain: quests-progression
- `selectSettlementQuestGiver` — function — line 57
  - domain: quests-progression

## `quests/opportunities/worldQuestOpportunityTypes.ts`

- `InjuredCowOpportunity` — type — line 74
  - domain: quests-progression
- `InjuredCowSourceLookup` — type — line 127
- `InjuredCowSourceStatus` — type — line 125
  - domain: quests-progression
- `LostLivestockOpportunity` — type — line 45
  - domain: quests-progression
- `LostLivestockSourceLookup` — type — line 112
  - domain: quests-progression
- `OpportunityNpc` — type — line 136
  - domain: quests-progression
- `RpgQuestMatrixId` — type — line 24
  - domain: quests-progression
- `RpgQuestOpportunity` — type — line 59
  - domain: quests-progression
- `SettlementQuestOpportunity` — type — line 82
- `WolfDenPressureOpportunity` — type — line 32
  - domain: quests-progression
- `WorldQuestOpportunityKind` — type — line 16
  - domain: quests-progression
  - system: settlement-quest-opportunities
  - role: Data-only opportunity contract between settlement/world systems and quest materialization.
- `WorldQuestSourceLookup` — type — line 102
  - domain: quests-progression
- `WorldQuestSourceStatus` — type — line 94
  - domain: quests-progression

## `quests/QuestManager.ts`

- `AnimalTargetResolver` — type — line 316
- `AnimalTreatmentQuestContext` — type — line 260
  - domain: quests-progression
- `ApplySocialConsequence` — type — line 328
- `DangerousTraitApplier` — type — line 321
- `HabitatAnimalFeedContext` — type — line 269
- `HorseRewardAvailability` — type — line 292
- `ObjectiveRef` — type — line 297
- `PlayerAnimalHarvestContext` — type — line 243
- `QUEST_MARKER_AVAILABLE` — const — line 84
- `QUEST_MARKER_IN_PROGRESS` — const — line 85
- `QUEST_MARKER_READY` — const — line 86
- `QUEST_MARKER_TALK_TARGET` — const — line 87
- `QuestAnimalOwnershipTransfer` — type — line 288
- `QuestDialogAction` — type — line 89
- `QuestDialogOverride` — type — line 126
  - domain: quests-progression
- `QuestDialogTopic` — type — line 114
- `QuestDialoguePreviewEntry` — type — line 171
  - domain: quests-progression
- `QuestDialoguePreviewKind` — type — line 156
  - domain: quests-progression
- `QuestItemGrant` — type — line 284
- `QuestJournalNote` — type — line 186
- `QuestLifecycleHooks` — type — line 410
- `QuestListEntry` — type — line 193
- `QuestManager` — class — line 576
  - domain: quests-progression
  - system: quest-manager
  - role: Owns quest progress, objective/stage evaluation and NPC relation levels.
  - owns: QuestProgressEntry
  - integration: Bound to world entities (fauna, wells, spawners) via injected resolvers, never by importing them directly. World-driven opportunities use a read-only source lookup; QuestManager owns quest progress only.
- `QuestManagerInitial` — type — line 216
- `QuestPhysicalOutcomeContext` — type — line 383
- `QuestPhysicalOutcomeResolver` — type — line 389
- `QuestPromisedReward` — type — line 180
- `QuestSocialAvailabilityLookup` — type — line 333
- `QuestVoiceIntent` — type — line 405
  - domain: quests-progression
- `QuestWorldKnowledgeDescribeContext` — type — line 449
  - domain: quests-progression
- `QuestWorldKnowledgeResolver` — type — line 453
- `QuestWorldProgressLookup` — type — line 367
- `QuestWorldTimeLookup` — type — line 339
- `SettlementRatInfestationLookup` — type — line 347
- `SpawnPointDestructionLookup` — type — line 357

## `quests/quests.ts`

- `AuthoredQuestAbandonment` — type — line 1588
- `AuthoredQuestConsequences` — type — line 1530
- `AuthoredQuestDef` — type — line 1597
  - domain: quests-progression
- `AuthoredQuestDialogueReaction` — type — line 1544
  - domain: quests-progression
- `AuthoredQuestDialogueReactionCondition` — type — line 1534
- `AuthoredQuestObjective` — type — line 1506
- `AuthoredQuestOutcome` — type — line 1584
- `AuthoredQuestPrerequisite` — type — line 1526
- `AuthoredQuestStage` — type — line 1578
- `AuthoredQuestStageDialogueAction` — type — line 1557
  - domain: quests-progression
- `AuthoredQuestStageObjectiveSlot` — type — line 1572
- `bindDarkForestTreasureQuest` — function — line 2717
- `bindExactCaveQuests` — function — line 2690
- `bindTreasureMapBearCaveQuest` — function — line 2824
- `buildDarkForestTreasureQuest` — function — line 2559
- `buildHorseAcquisitionQuest` — function — line 2606
- `buildLandmarkQuests` — function — line 2373
- `buildTreasureMapBearCaveQuest` — function — line 2743
- `CAVE_PLACE_TOKEN` — const — line 2649
- `cavePlacePhrase` — function — line 2653
- `externalResolutionOutcome` — function — line 1016
  - domain: quests-progression
- `hasSocialConsequence` — function — line 1027
- `isLegacySingleObjectiveStage` — function — line 1354
- `LandmarkResolver` — type — line 2362
- `LEGACY_QUEST_OBJECTIVE_SLOT_ID` — const — line 1256
- `MAP_SOURCE_PLACE_TOKEN` — const — line 2556
- `matchStageTransition` — function — line 1382
- `objectiveNeedsPersistedSlotProgress` — function — line 1364
  - domain: quests-progression
- `QUEST_STATES` — const — line 979
- `QuestAbandonment` — type — line 126
  - domain: quests-progression
- `QuestAvailability` — type — line 85
- `QuestConsequences` — type — line 779
- `QuestDef` — type — line 1395
- `QuestDefinitionValidationError` — class — line 245
- `QuestDialogueCooldown` — type — line 972
  - domain: quests-progression
- `QuestDialogueCooldownSpec` — type — line 177
- `QuestDialogueReaction` — type — line 188
  - domain: quests-progression
- `QuestDialogueReactionCondition` — type — line 173
  - domain: quests-progression
- `QuestDialogueReactionReads` — type — line 200
  - domain: quests-progression
- `QuestHabitatPressureObservation` — type — line 817
  - domain: quests-progression
- `QuestJournalEvent` — type — line 837
- `QuestJournalKind` — type — line 835
- `QuestLocationReveal` — type — line 1250
- `QuestNpcRef` — type — line 67
  - domain: quests-progression
- `QuestObjective` — type — line 1034
- `QuestObjectiveSlotId` — type — line 1258
- `QuestOfferPolicy` — type — line 109
  - domain: quests-progression
- `QuestOfferRankSignal` — type — line 1471
  - domain: quests-progression
- `QuestOutcome` — type — line 787
- `QuestOutcomeId` — type — line 767
- `QuestPrerequisite` — type — line 74
- `QuestProgressEntry` — type — line 925
- `QuestReward` — type — line 771
- `QUESTS` — const — line 1604
- `QuestStage` — type — line 1288
- `QuestStageDialogueAction` — type — line 1212
- `QuestStageEffect` — type — line 1201
  - domain: quests-progression
- `questStageMode` — function — line 1350
- `QuestStageMode` — type — line 1260
- `QuestStageObjectiveSlot` — type — line 1268
  - domain: quests-progression
- `questStageObjectiveSlots` — function — line 1336
  - domain: quests-progression
- `QuestStageSlotProgress` — type — line 828
  - domain: quests-progression
- `QuestStageTransition` — type — line 1282
  - domain: quests-progression
- `QuestState` — type — line 15
- `QuestWorldKnowledgeBind` — type — line 885
  - domain: quests-progression
- `QuestWorldKnowledgeDef` — type — line 897
  - domain: quests-progression
- `QuestWorldKnowledgeProgress` — type — line 914
  - domain: quests-progression
- `QuestWorldKnowledgeRef` — type — line 869
  - domain: quests-progression
- `rankQuestOfferCandidates` — function — line 1492
  - domain: quests-progression
- `RELATION_LEVEL_THRESHOLDS` — const — line 43
- `RelationLevel` — type — line 39
- `relationLevelInInclusiveRange` — function — line 156
  - domain: quests-progression
- `relationLevelMeetsMinimum` — function — line 142
- `relationToLevel` — function — line 53
- `RESOLVED_WITHOUT_PLAYER_OUTCOME` — const — line 1007
  - domain: quests-progression
- `selectMatchingQuestDialogueReaction` — function — line 227
  - domain: quests-progression
- `TreasureMapBearCaveQuestBinding` — type — line 2734
- `treasureMapSourcePlacePhrase` — function — line 2669
- `uniqueOutcomeForState` — function — line 992
- `validateQuestDefinitions` — function — line 252
- `WORLD_KNOWLEDGE_HOUR_DAYS` — const — line 861

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

## `quests/worldKnowledgeResolver.ts`

- `ChronicleSearchKnowledgeSite` — type — line 23
- `createQuestWorldKnowledgeResolver` — function — line 38
  - domain: quests-progression
- `QuestWorldKnowledgeResolverHost` — type — line 8
