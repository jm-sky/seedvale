# Symbols

Generated from exported TypeScript symbols.

## `quests/QuestManager.ts`

- `AnimalTargetResolver` — type — line 81
- `ApplySocialConsequence` — type — line 93
- `DangerousTraitApplier` — type — line 86
- `ObjectiveRef` — type — line 62
- `QUEST_MARKER_AVAILABLE` — const — line 24
- `QUEST_MARKER_IN_PROGRESS` — const — line 25
- `QUEST_MARKER_READY` — const — line 26
- `QUEST_MARKER_TALK_TARGET` — const — line 27
- `QuestDialogOverride` — type — line 29
- `QuestItemGrant` — type — line 57
- `QuestListEntry` — type — line 38
- `QuestManager` — class — line 137
  - domain: quests-progression
  - system: quest-manager
  - role: Owns quest progress, objective/stage evaluation and NPC relation levels.
  - owns: QuestProgressEntry
  - integration: Bound to world entities (fauna, wells, spawners) via injected resolvers, never by importing them directly.
- `QuestManagerInitial` — type — line 51
- `QuestProgressEntry` — type — line 49

## `quests/quests.ts`

- `buildLandmarkQuests` — function — line 333
- `LandmarkResolver` — type — line 322
- `QuestAvailability` — type — line 50
- `QuestDef` — type — line 134
- `QuestEffects` — type — line 57
- `QuestObjective` — type — line 62
- `QUESTS` — const — line 168
- `QuestStage` — type — line 117
- `QuestState` — type — line 8
- `RELATION_LEVEL_THRESHOLDS` — const — line 31
- `RelationLevel` — type — line 27
- `relationToLevel` — function — line 41
