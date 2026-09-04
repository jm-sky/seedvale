# Symbols

Generated from exported TypeScript symbols.

## `persistence/saveData.ts`

- `CURRENT_SAVE_VERSION` — const — line 404
- `isSaveData` — function — line 1272
- `loadSaveData` — function — line 1333
- `loadStoredSave` — function — line 1467
- `migrateStoredSave` — function — line 1430
- `QuestProgressEntry` — type — line 49
- `SaveBadges` — type — line 113
- `SaveBedroll` — type — line 322
- `SaveCarriedContainer` — type — line 224
- `SaveConfig` — type — line 29
- `SaveConstructionContractTarget` — type — line 375
- `SaveData` — type — line 416
  - domain: persistence
  - system: save-schema
  - role: Owns the SaveData shape and its validation/defaulting.
  - owns: SaveData
- `SaveDroppedItem` — type — line 59
- `SaveDryingRack` — type — line 183
- `SaveFishingBait` — type — line 206
- `SaveFoodBatch` — type — line 169
- `SaveHive` — type — line 192
- `SaveLocationKnowledge` — type — line 95
- `SaveMap` — type — line 97
- `SaveMigration` — type — line 1347
- `SavePalisadeSegment` — type — line 316
- `SavePlacedContainer` — type — line 212
- `SavePlacedFire` — type — line 63
- `SavePlacedTent` — type — line 80
- `SavePlacedTrap` — type — line 141
- `SavePlantedCrop` — type — line 298
- `SavePlantedTree` — type — line 284
- `SavePlatform` — type — line 336
- `SavePlayer` — type — line 37
- `SavePlayerGarden` — type — line 346
- `SavePlayerNeeds` — type — line 122
- `SavePlayerTorch` — type — line 74
- `SavePlayerWell` — type — line 239
- `SaveQuests` — type — line 51
- `SaveSkill` — type — line 133
- `SaveSkills` — type — line 134
- `SaveSpawnPoint` — type — line 159
- `SaveStandingTorch` — type — line 310
- `SaveTerrainModification` — type — line 259
- `SaveTerrainPreparation` — type — line 270
- `SaveTimedProcess` — type — line 174
- `SaveTreeOverride` — type — line 65
- `SaveWorkContract` — type — line 376
- `SaveWorkContractAdvertisement` — type — line 374
- `SaveWorkContractState` — type — line 364
- `SaveWorldFlags` — type — line 82
- `StoredSaveResult` — type — line 1456

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
