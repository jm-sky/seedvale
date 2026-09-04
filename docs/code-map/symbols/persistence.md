# Symbols

Generated from exported TypeScript symbols.

## `persistence/saveData.ts`

- `CURRENT_SAVE_VERSION` — const — line 408
- `isSaveData` — function — line 1277
- `loadSaveData` — function — line 1338
- `loadStoredSave` — function — line 1472
- `migrateStoredSave` — function — line 1435
- `QuestProgressEntry` — type — line 49
- `SaveBadges` — type — line 117
- `SaveBedroll` — type — line 326
- `SaveCarriedContainer` — type — line 228
- `SaveConfig` — type — line 29
- `SaveConstructionContractTarget` — type — line 379
- `SaveData` — type — line 420
  - domain: persistence
  - system: save-schema
  - role: Owns the SaveData shape and its validation/defaulting.
  - owns: SaveData
- `SaveDroppedItem` — type — line 59
- `SaveDryingRack` — type — line 187
- `SaveFishingBait` — type — line 210
- `SaveFoodBatch` — type — line 173
- `SaveHive` — type — line 196
- `SaveLocationKnowledge` — type — line 99
- `SaveMap` — type — line 101
- `SaveMigration` — type — line 1352
- `SavePalisadeSegment` — type — line 320
- `SavePlacedContainer` — type — line 216
- `SavePlacedFire` — type — line 63
- `SavePlacedTent` — type — line 84
- `SavePlacedTrap` — type — line 145
- `SavePlantedCrop` — type — line 302
- `SavePlantedTree` — type — line 288
- `SavePlatform` — type — line 340
- `SavePlayer` — type — line 37
- `SavePlayerGarden` — type — line 350
- `SavePlayerNeeds` — type — line 126
- `SavePlayerTorch` — type — line 78
- `SavePlayerWell` — type — line 243
- `SaveQuests` — type — line 51
- `SaveSkill` — type — line 137
- `SaveSkills` — type — line 138
- `SaveSpawnPoint` — type — line 163
- `SaveStandingTorch` — type — line 314
- `SaveTerrainModification` — type — line 263
- `SaveTerrainPreparation` — type — line 274
- `SaveTimedProcess` — type — line 178
- `SaveTreeOverride` — type — line 65
- `SaveWorkContract` — type — line 380
- `SaveWorkContractAdvertisement` — type — line 378
- `SaveWorkContractState` — type — line 368
- `SaveWorldFlags` — type — line 86
- `StoredSaveResult` — type — line 1461

## `persistence/saveDb.ts`

- `beginNewSave` — function — line 141
- `createSave` — function — line 332
- `CreateSaveResult` — type — line 30
- `deleteSave` — function — line 376
- `getActiveSaveId` — function — line 114
- `getPendingNewSaveName` — function — line 132
- `hasUnreadableSaves` — function — line 229
- `listSaves` — function — line 202
- `readSave` — function — line 244
- `renameSave` — function — line 353
- `setActiveSaveId` — function — line 123
- `setPendingNewSaveName` — function — line 136
- `writeSave` — function — line 285
  - domain: persistence
  - role: Writes `data` into the active (or given) named slot.
  - integration: Never overwrites a slot whose existing record is present but fails to parse, has no known migration path, or is a newer unsupported version — see `docs/plans/persistence-002-save-integrity-guard.md` and `docs/plans/persistence-003-save-schema-versioning-and-migrations.md`. A slot with no existing record still gets created normally.
- `WriteSaveError` — type — line 38
- `WriteSaveResult` — type — line 39

## `persistence/saveSlots.ts`

- `ACTIVE_SAVE_ID_KEY` — const — line 6
- `assertCanCreateSave` — function — line 126
- `CreateSaveError` — type — line 24
- `DEFAULT_SAVE_NAME_PREFIX` — const — line 8
- `formatSaveDay` — function — line 135
- `generateSaveId` — function — line 30
- `InspectedSaveSlot` — type — line 54
- `inspectStoredSave` — function — line 60
- `isSaveSlotEnvelope` — function — line 34
- `LEGACY_DEFAULT_SAVE_NAME` — const — line 7
- `LEGACY_SAVE_KEY` — const — line 5
- `legacyNameFromSave` — function — line 44
- `MAX_SAVES` — const — line 3
- `NameValidation` — type — line 26
- `nextDefaultSaveName` — function — line 118
- `parseStoredSave` — function — line 71
- `pickActiveSaveId` — function — line 91
- `SAVE_NAME_MAX_LENGTH` — const — line 4
- `saveErrorMessage` — function — line 139
- `SaveSlotEnvelope` — type — line 10
- `SaveSlotInfo` — type — line 15
- `sortSavesByRecency` — function — line 87
- `toSaveSlotInfo` — function — line 76
- `validateSaveName` — function — line 101
- `wrapSave` — function — line 40
