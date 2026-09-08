# Symbols

Generated from exported TypeScript symbols.

## `quests/QuestManager.ts`

- `AnimalTargetResolver` — type — line 113
- `ApplySocialConsequence` — type — line 125
- `DangerousTraitApplier` — type — line 118
- `ObjectiveRef` — type — line 94
- `QUEST_MARKER_AVAILABLE` — const — line 38
- `QUEST_MARKER_IN_PROGRESS` — const — line 39
- `QUEST_MARKER_READY` — const — line 40
- `QUEST_MARKER_TALK_TARGET` — const — line 41
- `QuestDialogOverride` — type — line 43
- `QuestItemGrant` — type — line 89
- `QuestListEntry` — type — line 58
- `QuestManager` — class — line 196
  - domain: quests-progression
  - system: quest-manager
  - role: Owns quest progress, objective/stage evaluation and NPC relation levels.
  - owns: QuestProgressEntry
  - integration: Bound to world entities (fauna, wells, spawners) via injected resolvers, never by importing them directly.
- `QuestManagerInitial` — type — line 78
- `QuestPromisedReward` — type — line 54
- `QuestSocialAvailabilityLookup` — type — line 130
- `SettlementRatInfestationLookup` — type — line 137

## `quests/quests.ts`

- `buildLandmarkQuests` — function — line 919
- `LandmarkResolver` — type — line 908
- `QUEST_STATES` — const — line 197
- `QuestAvailability` — type — line 59
- `QuestConsequences` — type — line 172
- `QuestDef` — type — line 306
- `QuestDefinitionValidationError` — class — line 75
- `QuestObjective` — type — line 217
- `QuestOutcome` — type — line 180
- `QuestOutcomeId` — type — line 161
- `QuestPrerequisite` — type — line 51
- `QuestProgressEntry` — type — line 190
- `QuestReward` — type — line 165
- `QUESTS` — const — line 333
- `QuestStage` — type — line 289
- `QuestState` — type — line 8
- `RELATION_LEVEL_THRESHOLDS` — const — line 31
- `RelationLevel` — type — line 27
- `relationLevelMeetsMinimum` — function — line 66
- `relationToLevel` — function — line 41
- `uniqueOutcomeForState` — function — line 209
- `validateQuestDefinitions` — function — line 81

## `quests/settlementRatInfestation.ts`

- `isSettlementRatInfestationResolved` — function — line 14
- `settlementRatInfestationReminderLine` — function — line 20
- `SettlementRatInfestationSnapshot` — type — line 8
  - domain: quests-progression
  - system: settlement-rat-infestation
  - role: Pure world-condition helpers for the storage rat infestation quest (plan quests-progression-006 §5).
