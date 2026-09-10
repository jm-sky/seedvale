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

- `collectSettlementQuestOpportunities` — function — line 98
  - domain: quests-progression
- `collectWolfDenPressureOpportunities` — function — line 64
  - domain: quests-progression
  - system: settlement-quest-opportunities
  - role: Collects world-driven candidates from authoritative fauna spawners.
- `parseWolfDenPressureQuestId` — function — line 21
- `settlementIdFromWolfDenSpawnerId` — function — line 27
- `wolfDenPressureQuestId` — function — line 17
  - domain: quests-progression
- `wolfDenPressureSourceStatus` — function — line 78
  - domain: quests-progression
- `wolfDenPressureStatusFromSpawners` — function — line 85

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

- `buildWorldDrivenSettlementQuests` — function — line 138
  - domain: quests-progression
- `materializeSettlementQuestOpportunity` — function — line 116
  - domain: quests-progression
  - system: settlement-quest-opportunities
  - role: Materializes a selected settlement opportunity into a normal QuestDef.
- `opportunityNpcsFromSettlement` — function — line 27
  - domain: quests-progression
- `selectSettlementQuestGiver` — function — line 46
  - domain: quests-progression

## `quests/opportunities/worldQuestOpportunityTypes.ts`

- `OpportunityNpc` — type — line 77
  - domain: quests-progression
- `RpgQuestMatrixId` — type — line 23
  - domain: quests-progression
- `RpgQuestOpportunity` — type — line 44
  - domain: quests-progression
- `SettlementQuestOpportunity` — type — line 52
- `WolfDenPressureOpportunity` — type — line 31
  - domain: quests-progression
- `WorldQuestOpportunityKind` — type — line 15
  - domain: quests-progression
  - system: settlement-quest-opportunities
  - role: Data-only opportunity contract between settlement/world systems and quest materialization.
- `WorldQuestSourceLookup` — type — line 68
  - domain: quests-progression
- `WorldQuestSourceStatus` — type — line 60
  - domain: quests-progression

## `quests/QuestManager.ts`

- `AnimalTargetResolver` — type — line 141
- `ApplySocialConsequence` — type — line 153
- `DangerousTraitApplier` — type — line 146
- `HorseRewardAvailability` — type — line 117
- `ObjectiveRef` — type — line 122
- `QUEST_MARKER_AVAILABLE` — const — line 41
- `QUEST_MARKER_IN_PROGRESS` — const — line 42
- `QUEST_MARKER_READY` — const — line 43
- `QUEST_MARKER_TALK_TARGET` — const — line 44
- `QuestAnimalOwnershipTransfer` — type — line 113
- `QuestDialogAction` — type — line 46
- `QuestDialogOverride` — type — line 59
  - domain: quests-progression
- `QuestItemGrant` — type — line 109
- `QuestListEntry` — type — line 77
- `QuestManager` — class — line 275
  - domain: quests-progression
  - system: quest-manager
  - role: Owns quest progress, objective/stage evaluation and NPC relation levels.
  - owns: QuestProgressEntry
  - integration: Bound to world entities (fauna, wells, spawners) via injected resolvers, never by importing them directly. World-driven opportunities use a read-only source lookup; QuestManager owns quest progress only.
- `QuestManagerInitial` — type — line 98
- `QuestPromisedReward` — type — line 73
- `QuestSocialAvailabilityLookup` — type — line 158
- `QuestWorldProgressLookup` — type — line 185
- `SettlementRatInfestationLookup` — type — line 165
- `SpawnPointDestructionLookup` — type — line 175

## `quests/quests.ts`

- `AuthoredQuestConsequences` — type — line 475
- `AuthoredQuestDef` — type — line 506
  - domain: quests-progression
- `AuthoredQuestObjective` — type — line 458
- `AuthoredQuestOutcome` — type — line 497
- `AuthoredQuestPrerequisite` — type — line 471
- `AuthoredQuestStage` — type — line 492
- `AuthoredQuestStageDialogueAction` — type — line 485
  - domain: quests-progression
- `bindExactCaveQuests` — function — line 1426
- `buildDarkForestTreasureQuest` — function — line 1321
- `buildHorseAcquisitionQuest` — function — line 1368
- `buildLandmarkQuests` — function — line 1219
- `CAVE_PLACE_TOKEN` — const — line 1411
- `cavePlacePhrase` — function — line 1415
- `LandmarkResolver` — type — line 1208
- `QUEST_STATES` — const — line 264
- `QuestAvailability` — type — line 75
- `QuestConsequences` — type — line 239
- `QuestDef` — type — line 415
- `QuestDefinitionValidationError` — class — line 91
- `QuestNpcRef` — type — line 60
  - domain: quests-progression
- `QuestObjective` — type — line 284
- `QuestOutcome` — type — line 247
- `QuestOutcomeId` — type — line 227
- `QuestPrerequisite` — type — line 67
- `QuestProgressEntry` — type — line 257
- `QuestReward` — type — line 231
- `QUESTS` — const — line 512
- `QuestStage` — type — line 391
- `QuestStageDialogueAction` — type — line 384
  - domain: quests-progression
- `QuestState` — type — line 13
- `RELATION_LEVEL_THRESHOLDS` — const — line 36
- `RelationLevel` — type — line 32
- `relationLevelMeetsMinimum` — function — line 82
- `relationToLevel` — function — line 46
- `uniqueOutcomeForState` — function — line 276
- `validateQuestDefinitions` — function — line 97

## `quests/settlementRatInfestation.ts`

- `isSettlementRatInfestationResolved` — function — line 16
- `settlementRatInfestationReminderLine` — function — line 22
- `SettlementRatInfestationSnapshot` — type — line 8
  - domain: quests-progression
  - system: settlement-rat-infestation
  - role: Pure world-condition helpers for the settlement rat infestation quest (plan quests-progression-006 §5, quests-progression-013 §11).
