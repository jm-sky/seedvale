# Symbols

Generated from exported TypeScript symbols.

## `persistence/saveData.ts`

- `isSaveData` — function — line 894
- `loadSaveData` — function — line 945
- `QuestProgressEntry` — type — line 41
- `SaveBadges` — type — line 87
- `SaveCarriedContainer` — type — line 198
- `SaveConfig` — type — line 21
- `SaveData` — type — line 316
  - domain: persistence
  - system: save-schema
  - role: Owns the SaveData shape and its validation/defaulting.
  - owns: SaveData
- `SaveDroppedItem` — type — line 51
- `SaveDryingRack` — type — line 157
- `SaveFishingBait` — type — line 180
- `SaveFoodBatch` — type — line 143
- `SaveHive` — type — line 166
- `SaveMap` — type — line 80
- `SavePalisadeSegment` — type — line 285
- `SavePlacedContainer` — type — line 186
- `SavePlacedFire` — type — line 55
- `SavePlacedTent` — type — line 69
- `SavePlacedTrap` — type — line 115
- `SavePlantedCrop` — type — line 267
- `SavePlantedTree` — type — line 253
- `SavePlayer` — type — line 29
- `SavePlayerGarden` — type — line 295
- `SavePlayerNeeds` — type — line 96
- `SavePlayerTorch` — type — line 63
- `SavePlayerWell` — type — line 210
- `SaveQuests` — type — line 43
- `SaveSkill` — type — line 107
- `SaveSkills` — type — line 108
- `SaveSpawnPoint` — type — line 133
- `SaveStandingTorch` — type — line 279
- `SaveTerrainModification` — type — line 228
- `SaveTerrainPreparation` — type — line 239
- `SaveTimedProcess` — type — line 148
- `SaveTreeOverride` — type — line 57
- `SaveWorldFlags` — type — line 71

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
