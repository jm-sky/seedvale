# Symbols

Generated from exported TypeScript symbols.

## `quests/QuestManager.ts`

- `AnimalTargetResolver` — type — line 104
- `ApplySocialConsequence` — type — line 116
- `DangerousTraitApplier` — type — line 109
- `ObjectiveRef` — type — line 85
- `QUEST_MARKER_AVAILABLE` — const — line 29
- `QUEST_MARKER_IN_PROGRESS` — const — line 30
- `QUEST_MARKER_READY` — const — line 31
- `QUEST_MARKER_TALK_TARGET` — const — line 32
- `QuestDialogOverride` — type — line 34
- `QuestItemGrant` — type — line 80
- `QuestListEntry` — type — line 49
- `QuestManager` — class — line 156
  - domain: quests-progression
  - system: quest-manager
  - role: Owns quest progress, objective/stage evaluation and NPC relation levels.
  - owns: QuestProgressEntry
  - integration: Bound to world entities (fauna, wells, spawners) via injected resolvers, never by importing them directly.
- `QuestManagerInitial` — type — line 69
- `QuestPromisedReward` — type — line 45

## `quests/quests.ts`

- `buildLandmarkQuests` — function — line 550
- `LandmarkResolver` — type — line 539
- `QUEST_STATES` — const — line 90
- `QuestAvailability` — type — line 50
- `QuestConsequences` — type — line 65
- `QuestDef` — type — line 182
- `QuestObjective` — type — line 110
- `QuestOutcome` — type — line 73
- `QuestOutcomeId` — type — line 54
- `QuestProgressEntry` — type — line 83
- `QuestReward` — type — line 58
- `QUESTS` — const — line 208
- `QuestStage` — type — line 165
- `QuestState` — type — line 8
- `RELATION_LEVEL_THRESHOLDS` — const — line 31
- `RelationLevel` — type — line 27
- `relationToLevel` — function — line 41
- `uniqueOutcomeForState` — function — line 102
