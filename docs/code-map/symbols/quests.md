# Symbols

Generated from exported TypeScript symbols.

## `quests/cardinalDirection.ts`

- `CARDINAL_SECTORS` — const — line 3
- `cardinalDirectionPhrase` — function — line 34
- `cardinalSector` — function — line 25
  - domain: quests-progression
- `CardinalSector` — type — line 4

## `quests/materializeAuthoredQuests.ts`

- `AuthoredNpcResolutionError` — class — line 13
- `materializeAuthoredQuestDefs` — function — line 88
  - domain: quests-progression
- `normalizeLegacyQuestRelations` — function — line 134
  - domain: quests-progression
- `resolveAuthoredNpcId` — function — line 25
  - domain: quests-progression

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

- `AnimalTargetResolver` — type — line 174
- `ApplySocialConsequence` — type — line 186
- `DangerousTraitApplier` — type — line 179
- `HorseRewardAvailability` — type — line 150
- `ObjectiveRef` — type — line 155
- `QUEST_MARKER_AVAILABLE` — const — line 52
- `QUEST_MARKER_IN_PROGRESS` — const — line 53
- `QUEST_MARKER_READY` — const — line 54
- `QUEST_MARKER_TALK_TARGET` — const — line 55
- `QuestAnimalOwnershipTransfer` — type — line 146
- `QuestDialogAction` — type — line 57
- `QuestDialogOverride` — type — line 85
  - domain: quests-progression
- `QuestDialogTopic` — type — line 73
- `QuestItemGrant` — type — line 142
- `QuestListEntry` — type — line 110
- `QuestManager` — class — line 312
  - domain: quests-progression
  - system: quest-manager
  - role: Owns quest progress, objective/stage evaluation and NPC relation levels.
  - owns: QuestProgressEntry
  - integration: Bound to world entities (fauna, wells, spawners) via injected resolvers, never by importing them directly. World-driven opportunities use a read-only source lookup; QuestManager owns quest progress only.
- `QuestManagerInitial` — type — line 131
- `QuestPromisedReward` — type — line 106
- `QuestSocialAvailabilityLookup` — type — line 191
- `QuestWorldProgressLookup` — type — line 218
- `SettlementRatInfestationLookup` — type — line 198
- `SpawnPointDestructionLookup` — type — line 208

## `quests/quests.ts`

- `AuthoredQuestConsequences` — type — line 490
- `AuthoredQuestDef` — type — line 521
  - domain: quests-progression
- `AuthoredQuestObjective` — type — line 473
- `AuthoredQuestOutcome` — type — line 512
- `AuthoredQuestPrerequisite` — type — line 486
- `AuthoredQuestStage` — type — line 507
- `AuthoredQuestStageDialogueAction` — type — line 500
  - domain: quests-progression
- `bindDarkForestTreasureQuest` — function — line 1488
- `bindExactCaveQuests` — function — line 1463
- `buildDarkForestTreasureQuest` — function — line 1340
- `buildHorseAcquisitionQuest` — function — line 1387
- `buildLandmarkQuests` — function — line 1234
- `CAVE_PLACE_TOKEN` — const — line 1430
- `cavePlacePhrase` — function — line 1434
- `hasSocialConsequence` — function — line 288
- `LandmarkResolver` — type — line 1223
- `MAP_SOURCE_PLACE_TOKEN` — const — line 1337
- `QUEST_STATES` — const — line 264
- `QuestAvailability` — type — line 75
- `QuestConsequences` — type — line 239
- `QuestDef` — type — line 430
- `QuestDefinitionValidationError` — class — line 91
- `QuestNpcRef` — type — line 60
  - domain: quests-progression
- `QuestObjective` — type — line 295
- `QuestOutcome` — type — line 247
- `QuestOutcomeId` — type — line 227
- `QuestPrerequisite` — type — line 67
- `QuestProgressEntry` — type — line 257
- `QuestReward` — type — line 231
- `QUESTS` — const — line 527
- `QuestStage` — type — line 406
- `QuestStageDialogueAction` — type — line 399
  - domain: quests-progression
- `QuestState` — type — line 13
- `RELATION_LEVEL_THRESHOLDS` — const — line 36
- `RelationLevel` — type — line 32
- `relationLevelMeetsMinimum` — function — line 82
- `relationToLevel` — function — line 46
- `treasureMapSourcePlacePhrase` — function — line 1450
- `uniqueOutcomeForState` — function — line 276
- `validateQuestDefinitions` — function — line 97

## `quests/settlementRatInfestation.ts`

- `isSettlementRatInfestationResolved` — function — line 16
- `settlementRatInfestationReminderLine` — function — line 22
- `SettlementRatInfestationSnapshot` — type — line 8
  - domain: quests-progression
  - system: settlement-rat-infestation
  - role: Pure world-condition helpers for the settlement rat infestation quest (plan quests-progression-006 §5, quests-progression-013 §11).
