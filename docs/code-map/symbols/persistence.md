# Symbols

Generated from exported TypeScript symbols.

## `persistence/saveData.ts`

- `CURRENT_SAVE_VERSION` — const — line 408
- `isSaveData` — function — line 1289
- `loadSaveData` — function — line 1352
- `loadStoredSave` — function — line 1486
- `migrateStoredSave` — function — line 1449
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
- `SaveMigration` — type — line 1366
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
- `StoredSaveResult` — type — line 1475

## `persistence/saveDb.ts`

- `beginNewSave` — function — line 154
- `createSave` — function — line 380
  - role: Creates a brand-new named slot from `data`.
  - integration: Same outgoing-validation guard as `writeSave()` (plan persistence-004 §1) — an invalid `data` must not be allowed to create a slot that would immediately be excluded from `listSaves()` again.
- `CreateSaveResult` — type — line 33
- `deleteSave` — function — line 428
- `getActiveSaveId` — function — line 127
- `getPendingNewSaveName` — function — line 145
- `listSaveManagementEntries` — function — line 255
- `listSaves` — function — line 242
- `listSavesResult` — function — line 216
- `ListSavesResult` — type — line 212
- `readSave` — function — line 276
- `renameSave` — function — line 405
- `SaveManagementResult` — type — line 251
- `SaveReason` — type — line 52
- `setActiveSaveId` — function — line 136
- `setPendingNewSaveName` — function — line 149
- `writeSave` — function — line 321
  - domain: persistence
  - role: Writes `data` into the active (or given) named slot.
  - integration: Never overwrites a slot whose existing record is present but fails to parse, has no known migration path, or is a newer unsupported version — see `docs/plans/persistence-002-save-integrity-guard.md` and `docs/plans/persistence-003-save-schema-versioning-and-migrations.md`. A slot with no existing record still gets created normally. Also refuses an outgoing `data` that fails current-schema validation before any destructive `storePut()` (plan persistence-004 §1) — a TypeScript `SaveData` type alone doesn't rule out a runtime-invalid value (e.g. an enum-like field outside its validated set) reaching persistence.
- `WriteSaveError` — type — line 44
- `WriteSaveResult` — type — line 45

## `persistence/saveSlots.ts`

- `ACTIVE_SAVE_ID_KEY` — const — line 6
- `assertCanCreateSave` — function — line 157
- `CreateSaveError` — type — line 24
- `DEFAULT_SAVE_NAME_PREFIX` — const — line 8
- `formatSaveDay` — function — line 166
- `generateSaveId` — function — line 30
- `InspectedSaveSlot` — type — line 56
- `inspectStoredSave` — function — line 62
- `isSaveSlotEnvelope` — function — line 34
- `LEGACY_DEFAULT_SAVE_NAME` — const — line 7
- `LEGACY_SAVE_KEY` — const — line 5
- `legacyNameFromSave` — function — line 44
- `MAX_SAVES` — const — line 3
- `NameValidation` — type — line 26
- `nextDefaultSaveName` — function — line 149
- `parseStoredSave` — function — line 102
- `pickActiveSaveId` — function — line 122
- `SAVE_NAME_MAX_LENGTH` — const — line 4
- `saveErrorMessage` — function — line 170
- `SaveManagementEntry` — type — line 79
- `SaveSlotEnvelope` — type — line 10
- `SaveSlotInfo` — type — line 15
- `sortSaveManagementEntries` — function — line 90
- `sortSavesByRecency` — function — line 118
- `toSaveManagementEntry` — function — line 83
- `toSaveSlotInfo` — function — line 107
- `UnhealthySaveStatus` — type — line 77
- `unhealthySaveStatusLabel` — function — line 96
- `validateSaveName` — function — line 132
- `wrapSave` — function — line 40
