# Symbols

Generated from exported TypeScript symbols.

## `persistence/saveData.ts`

- `isSaveData` — function — line 1017
- `loadSaveData` — function — line 1071
- `QuestProgressEntry` — type — line 42
- `SaveBadges` — type — line 91
- `SaveBedroll` — type — line 295
- `SaveCarriedContainer` — type — line 202
- `SaveConfig` — type — line 22
- `SaveConstructionContractTarget` — type — line 348
- `SaveData` — type — line 373
  - domain: persistence
  - system: save-schema
  - role: Owns the SaveData shape and its validation/defaulting.
  - owns: SaveData
- `SaveDroppedItem` — type — line 52
- `SaveDryingRack` — type — line 161
- `SaveFishingBait` — type — line 184
- `SaveFoodBatch` — type — line 147
- `SaveHive` — type — line 170
- `SaveMap` — type — line 84
- `SavePalisadeSegment` — type — line 289
- `SavePlacedContainer` — type — line 190
- `SavePlacedFire` — type — line 56
- `SavePlacedTent` — type — line 73
- `SavePlacedTrap` — type — line 119
- `SavePlantedCrop` — type — line 271
- `SavePlantedTree` — type — line 257
- `SavePlatform` — type — line 309
- `SavePlayer` — type — line 30
- `SavePlayerGarden` — type — line 319
- `SavePlayerNeeds` — type — line 100
- `SavePlayerTorch` — type — line 67
- `SavePlayerWell` — type — line 214
- `SaveQuests` — type — line 44
- `SaveSkill` — type — line 111
- `SaveSkills` — type — line 112
- `SaveSpawnPoint` — type — line 137
- `SaveStandingTorch` — type — line 283
- `SaveTerrainModification` — type — line 232
- `SaveTerrainPreparation` — type — line 243
- `SaveTimedProcess` — type — line 152
- `SaveTreeOverride` — type — line 58
- `SaveWorkContract` — type — line 349
- `SaveWorkContractAdvertisement` — type — line 347
- `SaveWorkContractState` — type — line 337
- `SaveWorldFlags` — type — line 75

## `persistence/saveDb.ts`

- `beginNewSave` — function — line 140
- `createSave` — function — line 292
- `CreateSaveResult` — type — line 29
- `deleteSave` — function — line 336
- `getActiveSaveId` — function — line 113
- `getPendingNewSaveName` — function — line 131
- `listSaves` — function — line 186
- `readSave` — function — line 207
- `renameSave` — function — line 313
- `setActiveSaveId` — function — line 122
- `setPendingNewSaveName` — function — line 135
- `writeSave` — function — line 246
  - domain: persistence
  - role: Writes `data` into the active (or given) named slot.
  - integration: Never overwrites a slot whose existing record is present but fails to parse — see `docs/plans/persistence-002-save-integrity-guard.md`. A slot with no existing record still gets created normally.
- `WriteSaveError` — type — line 37
- `WriteSaveResult` — type — line 38

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
