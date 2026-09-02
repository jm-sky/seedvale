# Symbols

Generated from exported TypeScript symbols.

## `persistence/saveData.ts`

- `isSaveData` — function — line 950
- `loadSaveData` — function — line 1003
- `QuestProgressEntry` — type — line 42
- `SaveBadges` — type — line 88
- `SaveBedroll` — type — line 292
- `SaveCarriedContainer` — type — line 199
- `SaveConfig` — type — line 22
- `SaveData` — type — line 337
  - domain: persistence
  - system: save-schema
  - role: Owns the SaveData shape and its validation/defaulting.
  - owns: SaveData
- `SaveDroppedItem` — type — line 52
- `SaveDryingRack` — type — line 158
- `SaveFishingBait` — type — line 181
- `SaveFoodBatch` — type — line 144
- `SaveHive` — type — line 167
- `SaveMap` — type — line 81
- `SavePalisadeSegment` — type — line 286
- `SavePlacedContainer` — type — line 187
- `SavePlacedFire` — type — line 56
- `SavePlacedTent` — type — line 70
- `SavePlacedTrap` — type — line 116
- `SavePlantedCrop` — type — line 268
- `SavePlantedTree` — type — line 254
- `SavePlatform` — type — line 306
- `SavePlayer` — type — line 30
- `SavePlayerGarden` — type — line 316
- `SavePlayerNeeds` — type — line 97
- `SavePlayerTorch` — type — line 64
- `SavePlayerWell` — type — line 211
- `SaveQuests` — type — line 44
- `SaveSkill` — type — line 108
- `SaveSkills` — type — line 109
- `SaveSpawnPoint` — type — line 134
- `SaveStandingTorch` — type — line 280
- `SaveTerrainModification` — type — line 229
- `SaveTerrainPreparation` — type — line 240
- `SaveTimedProcess` — type — line 149
- `SaveTreeOverride` — type — line 58
- `SaveWorldFlags` — type — line 72

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
