# Symbols

Generated from exported TypeScript symbols.

## `quests/QuestManager.ts`

- `AnimalTargetResolver` — type — line 108
- `ApplySocialConsequence` — type — line 120
- `DangerousTraitApplier` — type — line 113
- `ObjectiveRef` — type — line 89
- `QUEST_MARKER_AVAILABLE` — const — line 33
- `QUEST_MARKER_IN_PROGRESS` — const — line 34
- `QUEST_MARKER_READY` — const — line 35
- `QUEST_MARKER_TALK_TARGET` — const — line 36
- `QuestDialogOverride` — type — line 38
- `QuestItemGrant` — type — line 84
- `QuestListEntry` — type — line 53
- `QuestManager` — class — line 181
  - domain: quests-progression
  - system: quest-manager
  - role: Owns quest progress, objective/stage evaluation and NPC relation levels.
  - owns: QuestProgressEntry
  - integration: Bound to world entities (fauna, wells, spawners) via injected resolvers, never by importing them directly.
- `QuestManagerInitial` — type — line 73
- `QuestPromisedReward` — type — line 49
- `QuestSocialAvailabilityLookup` — type — line 125

## `quests/quests.ts`

- `buildLandmarkQuests` — function — line 884
- `LandmarkResolver` — type — line 873
- `QUEST_STATES` — const — line 197
- `QuestAvailability` — type — line 59
- `QuestConsequences` — type — line 172
- `QuestDef` — type — line 301
- `QuestDefinitionValidationError` — class — line 75
- `QuestObjective` — type — line 217
- `QuestOutcome` — type — line 180
- `QuestOutcomeId` — type — line 161
- `QuestPrerequisite` — type — line 51
- `QuestProgressEntry` — type — line 190
- `QuestReward` — type — line 165
- `QUESTS` — const — line 328
- `QuestStage` — type — line 284
- `QuestState` — type — line 8
- `RELATION_LEVEL_THRESHOLDS` — const — line 31
- `RelationLevel` — type — line 27
- `relationLevelMeetsMinimum` — function — line 66
- `relationToLevel` — function — line 41
- `uniqueOutcomeForState` — function — line 209
- `validateQuestDefinitions` — function — line 81
