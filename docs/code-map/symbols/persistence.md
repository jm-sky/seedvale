# Symbols

Generated from exported TypeScript symbols.

## `persistence/saveData.ts`

- `isSaveData` — function — line 816
- `loadSaveData` — function — line 863
- `QuestProgressEntry` — type — line 40
- `SaveCarriedContainer` — type — line 186
- `SaveConfig` — type — line 20
- `SaveData` — type — line 292
  - domain: persistence
  - system: save-schema
  - role: Owns the SaveData shape and its validation/defaulting.
  - owns: SaveData
- `SaveDroppedItem` — type — line 50
- `SaveDryingRack` — type — line 145
- `SaveFishingBait` — type — line 168
- `SaveFoodBatch` — type — line 131
- `SaveHive` — type — line 154
- `SaveMap` — type — line 79
- `SavePlacedContainer` — type — line 174
- `SavePlacedFire` — type — line 54
- `SavePlacedTent` — type — line 68
- `SavePlacedTrap` — type — line 103
- `SavePlantedCrop` — type — line 255
- `SavePlantedTree` — type — line 241
- `SavePlayer` — type — line 28
- `SavePlayerGarden` — type — line 271
- `SavePlayerNeeds` — type — line 84
- `SavePlayerTorch` — type — line 62
- `SavePlayerWell` — type — line 198
- `SaveQuests` — type — line 42
- `SaveSkill` — type — line 95
- `SaveSkills` — type — line 96
- `SaveSpawnPoint` — type — line 121
- `SaveTerrainModification` — type — line 216
- `SaveTerrainPreparation` — type — line 227
- `SaveTimedProcess` — type — line 136
- `SaveTreeOverride` — type — line 56
- `SaveWorldFlags` — type — line 70

## `persistence/saveDb.ts`

- `beginNewSave` — function — line 121
- `createSave` — function — line 224
- `CreateSaveResult` — type — line 29
- `deleteSave` — function — line 268
- `getActiveSaveId` — function — line 94
- `getPendingNewSaveName` — function — line 112
- `listSaves` — function — line 161
- `readSave` — function — line 176
- `renameSave` — function — line 245
- `setActiveSaveId` — function — line 103
- `setPendingNewSaveName` — function — line 116
- `writeSave` — function — line 197

## `persistence/saveSlots.ts`

- `ACTIVE_SAVE_ID_KEY` — const — line 6
- `assertCanCreateSave` — function — line 111
- `CreateSaveError` — type — line 24
- `DEFAULT_SAVE_NAME_PREFIX` — const — line 8
- `formatSaveDay` — function — line 120
- `generateSaveId` — function — line 30
- `isSaveSlotEnvelope` — function — line 34
- `LEGACY_DEFAULT_SAVE_NAME` — const — line 7
- `LEGACY_SAVE_KEY` — const — line 5
- `legacyNameFromSave` — function — line 44
- `MAX_SAVES` — const — line 3
- `NameValidation` — type — line 26
- `nextDefaultSaveName` — function — line 103
- `parseStoredSave` — function — line 49
- `pickActiveSaveId` — function — line 76
- `SAVE_NAME_MAX_LENGTH` — const — line 4
- `saveErrorMessage` — function — line 124
- `SaveSlotEnvelope` — type — line 10
- `SaveSlotInfo` — type — line 15
- `sortSavesByRecency` — function — line 72
- `toSaveSlotInfo` — function — line 61
- `validateSaveName` — function — line 86
- `wrapSave` — function — line 40
