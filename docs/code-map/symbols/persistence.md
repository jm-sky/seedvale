# Symbols

Generated from exported TypeScript symbols.

## `persistence/saveData.ts`

- `CURRENT_SAVE_VERSION` — const — line 375
- `isSaveData` — function — line 1221
- `loadSaveData` — function — line 1282
- `loadStoredSave` — function — line 1361
- `migrateStoredSave` — function — line 1324
- `QuestProgressEntry` — type — line 47
- `SaveBadges` — type — line 96
- `SaveBedroll` — type — line 300
- `SaveCarriedContainer` — type — line 207
- `SaveConfig` — type — line 27
- `SaveConstructionContractTarget` — type — line 353
- `SaveData` — type — line 387
  - domain: persistence
  - system: save-schema
  - role: Owns the SaveData shape and its validation/defaulting.
  - owns: SaveData
- `SaveDroppedItem` — type — line 57
- `SaveDryingRack` — type — line 166
- `SaveFishingBait` — type — line 189
- `SaveFoodBatch` — type — line 152
- `SaveHive` — type — line 175
- `SaveMap` — type — line 89
- `SaveMigration` — type — line 1296
- `SavePalisadeSegment` — type — line 294
- `SavePlacedContainer` — type — line 195
- `SavePlacedFire` — type — line 61
- `SavePlacedTent` — type — line 78
- `SavePlacedTrap` — type — line 124
- `SavePlantedCrop` — type — line 276
- `SavePlantedTree` — type — line 262
- `SavePlatform` — type — line 314
- `SavePlayer` — type — line 35
- `SavePlayerGarden` — type — line 324
- `SavePlayerNeeds` — type — line 105
- `SavePlayerTorch` — type — line 72
- `SavePlayerWell` — type — line 219
- `SaveQuests` — type — line 49
- `SaveSkill` — type — line 116
- `SaveSkills` — type — line 117
- `SaveSpawnPoint` — type — line 142
- `SaveStandingTorch` — type — line 288
- `SaveTerrainModification` — type — line 237
- `SaveTerrainPreparation` — type — line 248
- `SaveTimedProcess` — type — line 157
- `SaveTreeOverride` — type — line 63
- `SaveWorkContract` — type — line 354
- `SaveWorkContractAdvertisement` — type — line 352
- `SaveWorkContractState` — type — line 342
- `SaveWorldFlags` — type — line 80
- `StoredSaveResult` — type — line 1350

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
