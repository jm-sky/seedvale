# Symbols

Generated from exported TypeScript symbols.

## `quests/cardinalDirection.ts`

- `CARDINAL_SECTORS` — const — line 3
- `cardinalDirectionPhrase` — function — line 34
- `cardinalSector` — function — line 25
  - domain: quests-progression
- `CardinalSector` — type — line 4

## `quests/QuestManager.ts`

- `AnimalTargetResolver` — type — line 136
- `ApplySocialConsequence` — type — line 148
- `DangerousTraitApplier` — type — line 141
- `HorseRewardAvailability` — type — line 112
- `ObjectiveRef` — type — line 117
- `QUEST_MARKER_AVAILABLE` — const — line 38
- `QUEST_MARKER_IN_PROGRESS` — const — line 39
- `QUEST_MARKER_READY` — const — line 40
- `QUEST_MARKER_TALK_TARGET` — const — line 41
- `QuestAnimalOwnershipTransfer` — type — line 108
- `QuestDialogAction` — type — line 43
- `QuestDialogOverride` — type — line 56
  - domain: quests-progression
- `QuestItemGrant` — type — line 104
- `QuestListEntry` — type — line 73
- `QuestManager` — class — line 250
  - domain: quests-progression
  - system: quest-manager
  - role: Owns quest progress, objective/stage evaluation and NPC relation levels.
  - owns: QuestProgressEntry
  - integration: Bound to world entities (fauna, wells, spawners) via injected resolvers, never by importing them directly.
- `QuestManagerInitial` — type — line 93
- `QuestPromisedReward` — type — line 69
- `QuestSocialAvailabilityLookup` — type — line 153
- `QuestWorldProgressLookup` — type — line 180
- `SettlementRatInfestationLookup` — type — line 160
- `SpawnPointDestructionLookup` — type — line 170

## `quests/quests.ts`

- `bindExactCaveQuests` — function — line 1289
- `buildDarkForestTreasureQuest` — function — line 1184
- `buildHorseAcquisitionQuest` — function — line 1231
- `buildLandmarkQuests` — function — line 1082
- `CAVE_PLACE_TOKEN` — const — line 1274
- `cavePlacePhrase` — function — line 1278
- `LandmarkResolver` — type — line 1071
- `QUEST_STATES` — const — line 221
- `QuestAvailability` — type — line 63
- `QuestConsequences` — type — line 196
- `QuestDef` — type — line 355
- `QuestDefinitionValidationError` — class — line 79
- `QuestObjective` — type — line 241
- `QuestOutcome` — type — line 204
- `QuestOutcomeId` — type — line 185
- `QuestPrerequisite` — type — line 55
- `QuestProgressEntry` — type — line 214
- `QuestReward` — type — line 189
- `QUESTS` — const — line 391
- `QuestStage` — type — line 334
- `QuestState` — type — line 12
- `RELATION_LEVEL_THRESHOLDS` — const — line 35
- `RelationLevel` — type — line 31
- `relationLevelMeetsMinimum` — function — line 70
- `relationToLevel` — function — line 45
- `uniqueOutcomeForState` — function — line 233
- `validateQuestDefinitions` — function — line 85

## `quests/settlementRatInfestation.ts`

- `isSettlementRatInfestationResolved` — function — line 16
- `settlementRatInfestationReminderLine` — function — line 22
- `SettlementRatInfestationSnapshot` — type — line 8
  - domain: quests-progression
  - system: settlement-rat-infestation
  - role: Pure world-condition helpers for the settlement rat infestation quest (plan quests-progression-006 §5, quests-progression-013 §11).
