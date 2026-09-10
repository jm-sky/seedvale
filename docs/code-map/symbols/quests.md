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
- `QuestManager` — class — line 214
  - domain: quests-progression
  - system: quest-manager
  - role: Owns quest progress, objective/stage evaluation and NPC relation levels.
  - owns: QuestProgressEntry
  - integration: Bound to world entities (fauna, wells, spawners) via injected resolvers, never by importing them directly.
- `QuestManagerInitial` — type — line 78
- `QuestPromisedReward` — type — line 54
- `QuestSocialAvailabilityLookup` — type — line 138
- `SettlementRatInfestationLookup` — type — line 145
- `SpawnPointDestructionLookup` — type — line 155

## `quests/quests.ts`

- `buildHorseAcquisitionQuest` — function — line 1057
- `buildLandmarkQuests` — function — line 964
- `LandmarkResolver` — type — line 953
- `QUEST_STATES` — const — line 197
- `QuestAvailability` — type — line 59
- `QuestConsequences` — type — line 172
- `QuestDef` — type — line 310
- `QuestDefinitionValidationError` — class — line 75
- `QuestObjective` — type — line 217
- `QuestOutcome` — type — line 180
- `QuestOutcomeId` — type — line 161
- `QuestPrerequisite` — type — line 51
- `QuestProgressEntry` — type — line 190
- `QuestReward` — type — line 165
- `QUESTS` — const — line 342
- `QuestStage` — type — line 293
- `QuestState` — type — line 8
- `RELATION_LEVEL_THRESHOLDS` — const — line 31
- `RelationLevel` — type — line 27
- `relationLevelMeetsMinimum` — function — line 66
- `relationToLevel` — function — line 41
- `uniqueOutcomeForState` — function — line 209
- `validateQuestDefinitions` — function — line 81

## `quests/settlementRatInfestation.ts`

- `isSettlementRatInfestationResolved` — function — line 16
- `settlementRatInfestationReminderLine` — function — line 22
- `SettlementRatInfestationSnapshot` — type — line 8
  - domain: quests-progression
  - system: settlement-rat-infestation
  - role: Pure world-condition helpers for the settlement rat infestation quest (plan quests-progression-006 §5, quests-progression-013 §11).
