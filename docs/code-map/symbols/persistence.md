# Symbols

Generated from exported TypeScript symbols.

## `persistence/db.ts`

- `DB_NAME` — const — line 13
  - domain: persistence
  - system: worldgen-cache
  - role: Shared IndexedDB open/upgrade seam for the whole `seedvale` database.
  - integration: `saveDb.ts` keeps owning save-slot semantics against the `saves` store; `seedDb.ts`/`worldgenCacheDb.ts` (plan world-015) own the `seeds`/`worldgenCache` stores added here. Every caller still opens and closes its own connection per operation (same lifecycle `saveDb.ts` already used) — this module only centralizes `DB_NAME`/`DB_VERSION` and the `onupgradeneeded` store creation so a version bump can never leave one store owner unaware of another's schema.
- `DB_VERSION` — const — line 14
- `openSeedvaleDb` — function — line 28
- `SAVES_STORE` — const — line 16
- `SEEDS_STORE` — const — line 17
- `WORLDGEN_CACHE_BY_SEED_INDEX` — const — line 22
- `WORLDGEN_CACHE_STORE` — const — line 18

## `persistence/saveData.ts`

- `CURRENT_SAVE_VERSION` — const — line 588
- `isSaveData` — function — line 2003
- `loadSaveData` — function — line 2086
- `loadStoredSave` — function — line 3000
- `migrateStoredSave` — function — line 2963
- `SaveBadges` — type — line 164
- `SaveBedroll` — type — line 458
- `SaveCarriedContainer` — type — line 294
- `SaveCart` — type — line 124
- `SaveCompletedTerrainPreparation` — type — line 361
- `SaveConfig` — type — line 46
- `SaveConstructionContractTarget` — type — line 539
- `SaveContractTarget` — type — line 548
- `SaveData` — type — line 600
  - domain: persistence
  - system: save-schema
  - role: Owns the SaveData shape and its validation/defaulting.
  - owns: SaveData
- `SaveDroppedItem` — type — line 86
- `SaveDryingRack` — type — line 242
- `SaveFishingBait` — type — line 265
- `SaveFoodBatch` — type — line 74
- `SaveHive` — type — line 251
- `SaveLocationKnowledge` — type — line 146
- `SaveMap` — type — line 148
- `SaveMigration` — type — line 2100
- `SavePalisadeContractTarget` — type — line 545
- `SavePalisadeSegment` — type — line 419
- `SavePlacedContainer` — type — line 271
- `SavePlacedFire` — type — line 90
- `SavePlacedTent` — type — line 111
- `SavePlacedTrap` — type — line 200
- `SavePlantedCrop` — type — line 385
- `SavePlantedTree` — type — line 371
- `SavePlatform` — type — line 474
- `SavePlayer` — type — line 54
- `SavePlayerGarden` — type — line 493
- `SavePlayerNeeds` — type — line 181
- `SavePlayerTorch` — type — line 105
- `SavePlayerTrough` — type — line 423
- `SavePlayerWell` — type — line 313
- `SaveQuests` — type — line 68
- `SaveReputation` — type — line 174
- `SaveResidentialBuilding` — type — line 440
- `SaveResidentialBuildingContractTarget` — type — line 547
- `SaveResidentialOwner` — type — line 432
- `SaveSkill` — type — line 192
- `SaveSkills` — type — line 193
- `SaveSpawnPoint` — type — line 218
- `SaveStandingTorch` — type — line 401
- `SaveStandingTorchContractTarget` — type — line 546
- `SaveTerrainModification` — type — line 336
- `SaveTerrainPreparation` — type — line 347
- `SaveTerrainPreparationContractTarget` — type — line 542
- `SaveTimedProcess` — type — line 232
- `SaveTreasureChestMutation` — type — line 284
- `SaveTreeOverride` — type — line 92
- `SaveWorkContract` — type — line 554
- `SaveWorkContractAdvertisement` — type — line 528
- `SaveWorkContractAssignment` — type — line 529
- `SaveWorkContractAssignmentState` — type — line 519
- `SaveWorkContractState` — type — line 511
- `SaveWorldFlags` — type — line 131
- `StoredSaveResult` — type — line 2989

## `persistence/saveDb.ts`

- `beginNewSave` — function — line 142
- `createSave` — function — line 368
  - role: Creates a brand-new named slot from `data`.
  - integration: Same outgoing-validation guard as `writeSave()` (plan persistence-004 §1) — an invalid `data` must not be allowed to create a slot that would immediately be excluded from `listSaves()` again.
- `CreateSaveResult` — type — line 32
- `deleteSave` — function — line 416
- `getActiveSaveId` — function — line 115
- `getPendingNewSaveName` — function — line 133
- `listSaveManagementEntries` — function — line 243
- `listSaves` — function — line 230
- `listSavesResult` — function — line 204
- `ListSavesResult` — type — line 200
- `readSave` — function — line 264
- `renameSave` — function — line 393
- `SaveManagementResult` — type — line 239
- `SaveReason` — type — line 51
- `setActiveSaveId` — function — line 124
- `setPendingNewSaveName` — function — line 137
- `writeSave` — function — line 309
  - domain: persistence
  - role: Writes `data` into the active (or given) named slot.
  - integration: Never overwrites a slot whose existing record is present but fails to parse, has no known migration path, or is a newer unsupported version — see `docs/plans/persistence-002-save-integrity-guard.md` and `docs/plans/persistence-003-save-schema-versioning-and-migrations.md`. A slot with no existing record still gets created normally. Also refuses an outgoing `data` that fails current-schema validation before any destructive `storePut()` (plan persistence-004 §1) — a TypeScript `SaveData` type alone doesn't rule out a runtime-invalid value (e.g. an enum-like field outside its validated set) reaching persistence.
- `WriteSaveError` — type — line 43
- `WriteSaveResult` — type — line 44

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

## `persistence/seedDb.ts`

- `deleteSeedRecord` — function — line 124
- `getSeedRecord` — function — line 61
- `listSeedRecords` — function — line 47
- `putSeedRecord` — function — line 77
- `renameSeedRecord` — function — line 101
- `touchSeedLastUsed` — function — line 95
- `updateSeedDescription` — function — line 108
- `updateSeedTags` — function — line 115

## `persistence/seedRecord.ts`

- `displaySeedName` — function — line 24
- `isSeedRecord` — function — line 32
- `minimalSeedRecord` — function — line 48
- `SeedRecord` — type — line 9
  - domain: persistence
  - system: seed-library
  - role: Owns the `SeedRecord` shape and its validation (plan world-015 §1/§9).
  - integration: `SaveData.config.seed` (`saveData.ts`) stays the authoritative world identity for a given save; a `SeedRecord` is optional/manageable catalog metadata for the same number, never a requirement to load a save.

## `persistence/worldgenCacheDb.ts`

- `cacheKey` — function — line 29
- `CacheRecord` — type — line 16
  - domain: persistence
  - system: worldgen-cache
  - role: Generic `(seed, namespace, version, key) -> payload` disposable derived-data store (plan world-015 §11/§12) — a persistence primitive, never a source of world truth. A namespace owner (e.g. `world/locations/locationsCoarseCache.ts`) decides its own payload shape, fingerprint and versioning; this module only knows how to store/retrieve/ bound it.
  - integration: Runtime correctness must never depend on this succeeding — a read miss or write failure always falls back to normal procedural generation at the call site.
- `countCacheForSeed` — function — line 108
- `deleteCacheForSeed` — function — line 91
- `enforceCacheCap` — function — line 131
- `listCacheRecords` — function — line 57
- `putCacheRecords` — function — line 74
