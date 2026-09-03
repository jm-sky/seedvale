# Symbols

Generated from exported TypeScript symbols.

## `persistence/saveData.ts`

- `CURRENT_SAVE_VERSION` — const — line 391
- `isSaveData` — function — line 1253
- `loadSaveData` — function — line 1314
- `loadStoredSave` — function — line 1405
- `migrateStoredSave` — function — line 1368
- `QuestProgressEntry` — type — line 48
- `SaveBadges` — type — line 112
- `SaveBedroll` — type — line 316
- `SaveCarriedContainer` — type — line 223
- `SaveConfig` — type — line 28
- `SaveConstructionContractTarget` — type — line 369
- `SaveData` — type — line 403
  - domain: persistence
  - system: save-schema
  - role: Owns the SaveData shape and its validation/defaulting.
  - owns: SaveData
- `SaveDroppedItem` — type — line 58
- `SaveDryingRack` — type — line 182
- `SaveFishingBait` — type — line 205
- `SaveFoodBatch` — type — line 168
- `SaveHive` — type — line 191
- `SaveLocationKnowledge` — type — line 94
- `SaveMap` — type — line 96
- `SaveMigration` — type — line 1328
- `SavePalisadeSegment` — type — line 310
- `SavePlacedContainer` — type — line 211
- `SavePlacedFire` — type — line 62
- `SavePlacedTent` — type — line 79
- `SavePlacedTrap` — type — line 140
- `SavePlantedCrop` — type — line 292
- `SavePlantedTree` — type — line 278
- `SavePlatform` — type — line 330
- `SavePlayer` — type — line 36
- `SavePlayerGarden` — type — line 340
- `SavePlayerNeeds` — type — line 121
- `SavePlayerTorch` — type — line 73
- `SavePlayerWell` — type — line 235
- `SaveQuests` — type — line 50
- `SaveSkill` — type — line 132
- `SaveSkills` — type — line 133
- `SaveSpawnPoint` — type — line 158
- `SaveStandingTorch` — type — line 304
- `SaveTerrainModification` — type — line 253
- `SaveTerrainPreparation` — type — line 264
- `SaveTimedProcess` — type — line 173
- `SaveTreeOverride` — type — line 64
- `SaveWorkContract` — type — line 370
- `SaveWorkContractAdvertisement` — type — line 368
- `SaveWorkContractState` — type — line 358
- `SaveWorldFlags` — type — line 81
- `StoredSaveResult` — type — line 1394

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
