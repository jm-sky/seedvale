# Symbols

Generated from exported TypeScript symbols.

## `quests/QuestManager.ts`

- `AnimalTargetResolver` — type — line 107
- `ApplySocialConsequence` — type — line 119
- `DangerousTraitApplier` — type — line 112
- `ObjectiveRef` — type — line 88
- `QUEST_MARKER_AVAILABLE` — const — line 32
- `QUEST_MARKER_IN_PROGRESS` — const — line 33
- `QUEST_MARKER_READY` — const — line 34
- `QUEST_MARKER_TALK_TARGET` — const — line 35
- `QuestDialogOverride` — type — line 37
- `QuestItemGrant` — type — line 83
- `QuestListEntry` — type — line 52
- `QuestManager` — class — line 172
  - domain: quests-progression
  - system: quest-manager
  - role: Owns quest progress, objective/stage evaluation and NPC relation levels.
  - owns: QuestProgressEntry
  - integration: Bound to world entities (fauna, wells, spawners) via injected resolvers, never by importing them directly.
- `QuestManagerInitial` — type — line 72
- `QuestPromisedReward` — type — line 48
- `QuestSocialAvailabilityLookup` — type — line 124

## `quests/quests.ts`

- `buildLandmarkQuests` — function — line 639
- `LandmarkResolver` — type — line 628
- `QUEST_STATES` — const — line 169
- `QuestAvailability` — type — line 59
- `QuestConsequences` — type — line 144
- `QuestDef` — type — line 261
- `QuestDefinitionValidationError` — class — line 75
- `QuestObjective` — type — line 189
- `QuestOutcome` — type — line 152
- `QuestOutcomeId` — type — line 133
- `QuestPrerequisite` — type — line 51
- `QuestProgressEntry` — type — line 162
- `QuestReward` — type — line 137
- `QUESTS` — const — line 288
- `QuestStage` — type — line 244
- `QuestState` — type — line 8
- `RELATION_LEVEL_THRESHOLDS` — const — line 31
- `RelationLevel` — type — line 27
- `relationLevelMeetsMinimum` — function — line 66
- `relationToLevel` — function — line 41
- `uniqueOutcomeForState` — function — line 181
- `validateQuestDefinitions` — function — line 80
