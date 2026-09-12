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

- `AnimalTargetResolver` — type — line 151
- `ApplySocialConsequence` — type — line 163
- `DangerousTraitApplier` — type — line 156
- `HorseRewardAvailability` — type — line 127
- `ObjectiveRef` — type — line 132
- `QUEST_MARKER_AVAILABLE` — const — line 51
- `QUEST_MARKER_IN_PROGRESS` — const — line 52
- `QUEST_MARKER_READY` — const — line 53
- `QUEST_MARKER_TALK_TARGET` — const — line 54
- `QuestAnimalOwnershipTransfer` — type — line 123
- `QuestDialogAction` — type — line 56
- `QuestDialogOverride` — type — line 69
  - domain: quests-progression
- `QuestItemGrant` — type — line 119
- `QuestListEntry` — type — line 87
- `QuestManager` — class — line 289
  - domain: quests-progression
  - system: quest-manager
  - role: Owns quest progress, objective/stage evaluation and NPC relation levels.
  - owns: QuestProgressEntry
  - integration: Bound to world entities (fauna, wells, spawners) via injected resolvers, never by importing them directly. World-driven opportunities use a read-only source lookup; QuestManager owns quest progress only.
- `QuestManagerInitial` — type — line 108
- `QuestPromisedReward` — type — line 83
- `QuestSocialAvailabilityLookup` — type — line 168
- `QuestWorldProgressLookup` — type — line 195
- `SettlementRatInfestationLookup` — type — line 175
- `SpawnPointDestructionLookup` — type — line 185

## `quests/quests.ts`

- `AuthoredQuestConsequences` — type — line 479
- `AuthoredQuestDef` — type — line 510
  - domain: quests-progression
- `AuthoredQuestObjective` — type — line 462
- `AuthoredQuestOutcome` — type — line 501
- `AuthoredQuestPrerequisite` — type — line 475
- `AuthoredQuestStage` — type — line 496
- `AuthoredQuestStageDialogueAction` — type — line 489
  - domain: quests-progression
- `bindDarkForestTreasureQuest` — function — line 1477
- `bindExactCaveQuests` — function — line 1452
- `buildDarkForestTreasureQuest` — function — line 1329
- `buildHorseAcquisitionQuest` — function — line 1376
- `buildLandmarkQuests` — function — line 1223
- `CAVE_PLACE_TOKEN` — const — line 1419
- `cavePlacePhrase` — function — line 1423
- `LandmarkResolver` — type — line 1212
- `MAP_SOURCE_PLACE_TOKEN` — const — line 1326
- `QUEST_STATES` — const — line 264
- `QuestAvailability` — type — line 75
- `QuestConsequences` — type — line 239
- `QuestDef` — type — line 419
- `QuestDefinitionValidationError` — class — line 91
- `QuestNpcRef` — type — line 60
  - domain: quests-progression
- `QuestObjective` — type — line 284
- `QuestOutcome` — type — line 247
- `QuestOutcomeId` — type — line 227
- `QuestPrerequisite` — type — line 67
- `QuestProgressEntry` — type — line 257
- `QuestReward` — type — line 231
- `QUESTS` — const — line 516
- `QuestStage` — type — line 395
- `QuestStageDialogueAction` — type — line 388
  - domain: quests-progression
- `QuestState` — type — line 13
- `RELATION_LEVEL_THRESHOLDS` — const — line 36
- `RelationLevel` — type — line 32
- `relationLevelMeetsMinimum` — function — line 82
- `relationToLevel` — function — line 46
- `treasureMapSourcePlacePhrase` — function — line 1439
- `uniqueOutcomeForState` — function — line 276
- `validateQuestDefinitions` — function — line 97

## `quests/settlementRatInfestation.ts`

- `isSettlementRatInfestationResolved` — function — line 16
- `settlementRatInfestationReminderLine` — function — line 22
- `SettlementRatInfestationSnapshot` — type — line 8
  - domain: quests-progression
  - system: settlement-rat-infestation
  - role: Pure world-condition helpers for the settlement rat infestation quest (plan quests-progression-006 §5, quests-progression-013 §11).
