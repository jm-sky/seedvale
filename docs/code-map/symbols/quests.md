# Symbols

Generated from exported TypeScript symbols.

## `quests/cardinalDirection.ts`

- `CARDINAL_SECTORS` — const — line 3
- `cardinalDirectionPhrase` — function — line 34
- `cardinalSector` — function — line 25
  - domain: quests-progression
- `CardinalSector` — type — line 4

## `quests/materializeAuthoredQuests.ts`

- `AuthoredNpcResolutionError` — class — line 11
- `materializeAuthoredQuestDefs` — function — line 65
  - domain: quests-progression
- `normalizeLegacyQuestRelations` — function — line 110
  - domain: quests-progression
- `resolveAuthoredNpcId` — function — line 23
  - domain: quests-progression

## `quests/QuestManager.ts`

- `AnimalTargetResolver` — type — line 138
- `ApplySocialConsequence` — type — line 150
- `DangerousTraitApplier` — type — line 143
- `HorseRewardAvailability` — type — line 114
- `ObjectiveRef` — type — line 119
- `QUEST_MARKER_AVAILABLE` — const — line 39
- `QUEST_MARKER_IN_PROGRESS` — const — line 40
- `QUEST_MARKER_READY` — const — line 41
- `QUEST_MARKER_TALK_TARGET` — const — line 42
- `QuestAnimalOwnershipTransfer` — type — line 110
- `QuestDialogAction` — type — line 44
- `QuestDialogOverride` — type — line 57
  - domain: quests-progression
- `QuestItemGrant` — type — line 106
- `QuestListEntry` — type — line 74
- `QuestManager` — class — line 252
  - domain: quests-progression
  - system: quest-manager
  - role: Owns quest progress, objective/stage evaluation and NPC relation levels.
  - owns: QuestProgressEntry
  - integration: Bound to world entities (fauna, wells, spawners) via injected resolvers, never by importing them directly.
- `QuestManagerInitial` — type — line 95
- `QuestPromisedReward` — type — line 70
- `QuestSocialAvailabilityLookup` — type — line 155
- `QuestWorldProgressLookup` — type — line 182
- `SettlementRatInfestationLookup` — type — line 162
- `SpawnPointDestructionLookup` — type — line 172

## `quests/quests.ts`

- `AuthoredQuestConsequences` — type — line 431
- `AuthoredQuestDef` — type — line 444
  - domain: quests-progression
- `AuthoredQuestObjective` — type — line 410
- `AuthoredQuestOutcome` — type — line 435
- `AuthoredQuestPrerequisite` — type — line 427
- `AuthoredQuestStage` — type — line 423
- `bindExactCaveQuests` — function — line 1348
- `buildDarkForestTreasureQuest` — function — line 1243
- `buildHorseAcquisitionQuest` — function — line 1290
- `buildLandmarkQuests` — function — line 1141
- `CAVE_PLACE_TOKEN` — const — line 1333
- `cavePlacePhrase` — function — line 1337
- `LandmarkResolver` — type — line 1130
- `QUEST_STATES` — const — line 233
- `QuestAvailability` — type — line 75
- `QuestConsequences` — type — line 208
- `QuestDef` — type — line 367
- `QuestDefinitionValidationError` — class — line 91
- `QuestNpcRef` — type — line 60
  - domain: quests-progression
- `QuestObjective` — type — line 253
- `QuestOutcome` — type — line 216
- `QuestOutcomeId` — type — line 197
- `QuestPrerequisite` — type — line 67
- `QuestProgressEntry` — type — line 226
- `QuestReward` — type — line 201
- `QUESTS` — const — line 450
- `QuestStage` — type — line 346
- `QuestState` — type — line 13
- `RELATION_LEVEL_THRESHOLDS` — const — line 36
- `RelationLevel` — type — line 32
- `relationLevelMeetsMinimum` — function — line 82
- `relationToLevel` — function — line 46
- `uniqueOutcomeForState` — function — line 245
- `validateQuestDefinitions` — function — line 97

## `quests/settlementRatInfestation.ts`

- `isSettlementRatInfestationResolved` — function — line 16
- `settlementRatInfestationReminderLine` — function — line 22
- `SettlementRatInfestationSnapshot` — type — line 8
  - domain: quests-progression
  - system: settlement-rat-infestation
  - role: Pure world-condition helpers for the settlement rat infestation quest (plan quests-progression-006 §5, quests-progression-013 §11).
