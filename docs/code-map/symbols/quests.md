# Symbols

Generated from exported TypeScript symbols.

## `quests/QuestManager.ts`

- `AnimalTargetResolver` — type — line 121
- `ApplySocialConsequence` — type — line 133
- `DangerousTraitApplier` — type — line 126
- `HorseRewardAvailability` — type — line 97
- `ObjectiveRef` — type — line 102
- `QUEST_MARKER_AVAILABLE` — const — line 38
- `QUEST_MARKER_IN_PROGRESS` — const — line 39
- `QUEST_MARKER_READY` — const — line 40
- `QUEST_MARKER_TALK_TARGET` — const — line 41
- `QuestAnimalOwnershipTransfer` — type — line 93
- `QuestDialogOverride` — type — line 43
- `QuestItemGrant` — type — line 89
- `QuestListEntry` — type — line 58
- `QuestManager` — class — line 228
  - domain: quests-progression
  - system: quest-manager
  - role: Owns quest progress, objective/stage evaluation and NPC relation levels.
  - owns: QuestProgressEntry
  - integration: Bound to world entities (fauna, wells, spawners) via injected resolvers, never by importing them directly.
- `QuestManagerInitial` — type — line 78
- `QuestPromisedReward` — type — line 54
- `QuestSocialAvailabilityLookup` — type — line 138
- `QuestWorldProgressLookup` — type — line 165
- `SettlementRatInfestationLookup` — type — line 145
- `SpawnPointDestructionLookup` — type — line 155

## `quests/quests.ts`

- `buildDarkForestTreasureQuest` — function — line 1072
- `buildHorseAcquisitionQuest` — function — line 1117
- `buildLandmarkQuests` — function — line 978
- `LandmarkResolver` — type — line 967
- `QUEST_STATES` — const — line 201
- `QuestAvailability` — type — line 63
- `QuestConsequences` — type — line 176
- `QuestDef` — type — line 324
- `QuestDefinitionValidationError` — class — line 79
- `QuestObjective` — type — line 221
- `QuestOutcome` — type — line 184
- `QuestOutcomeId` — type — line 165
- `QuestPrerequisite` — type — line 55
- `QuestProgressEntry` — type — line 194
- `QuestReward` — type — line 169
- `QUESTS` — const — line 356
- `QuestStage` — type — line 307
- `QuestState` — type — line 12
- `RELATION_LEVEL_THRESHOLDS` — const — line 35
- `RelationLevel` — type — line 31
- `relationLevelMeetsMinimum` — function — line 70
- `relationToLevel` — function — line 45
- `uniqueOutcomeForState` — function — line 213
- `validateQuestDefinitions` — function — line 85

## `quests/settlementRatInfestation.ts`

- `isSettlementRatInfestationResolved` — function — line 16
- `settlementRatInfestationReminderLine` — function — line 22
- `SettlementRatInfestationSnapshot` — type — line 8
  - domain: quests-progression
  - system: settlement-rat-infestation
  - role: Pure world-condition helpers for the settlement rat infestation quest (plan quests-progression-006 §5, quests-progression-013 §11).
