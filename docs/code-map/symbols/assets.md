# Symbols

Generated from exported TypeScript symbols.

## `assets/alignAnchors.ts`

- `AnchorAlignMode` — type — line 3
- `matrixToEulerDeg` — function — line 46
- `matrixToPosition` — function — line 59
- `positionDelta` — function — line 79
- `positionDistance` — function — line 87
- `rotationDeltaDeg` — function — line 69
- `solveAnchorAlignment` — function — line 15

## `assets/alignmentReport.ts`

- `ALIGNED_POSITION_EPSILON_M` — const — line 2
- `ALIGNED_ROTATION_EPSILON_DEG` — const — line 3
- `ALIGNMENT_REPORT_VERSION` — const — line 1
- `AlignmentReport` — type — line 38
- `AlignmentReportInput` — type — line 89
- `alignmentReportToJson` — function — line 295
- `AlignmentStatus` — type — line 6
- `buildAlignmentReport` — function — line 150
- `computeAlignmentStatus` — function — line 299
- `formatAlignmentReport` — function — line 186
- `GROUND_CONTACT_EPSILON_M` — const — line 4
- `groundContactVerdict` — function — line 310
- `ReportAnchor` — type — line 8
- `ReportSlotBounds` — type — line 21

## `assets/anchorResolve.ts`

- `discoverGlbAnchors` — function — line 58
- `findAnchorNode` — function — line 41
- `refreshResolvedAnchors` — function — line 242
- `resolveAssetAnchors` — function — line 210
- `ResolvedAnchor` — type — line 19

## `assets/assetAnchorData.ts`

- `anchorsForAsset` — function — line 98
- `ASSET_ANCHORS` — const — line 80
- `CHARACTER_ANCHORS` — const — line 17
- `HELD_TOOL_GRIP_ANCHORS` — const — line 75
- `heldToolHasGripAnchor` — function — line 105
- `RIGHT_HAND_BONE_NAMES` — const — line 9

## `assets/assetAnchors.ts`

- `ANCHOR_ORIENTATION_REQUIRED` — const — line 26
- `AnchorIssue` — type — line 39
- `AnchorIssueKind` — type — line 28
- `AnchorSpace` — type — line 2
- `AnchorType` — type — line 1
- `AssetAnchorDef` — type — line 9
- `AssetPrepare` — type — line 4
- `defaultAnchorSpace` — function — line 61
- `isValidAnchorName` — function — line 47
- `mergeAnchorDefs` — function — line 76
- `normalizeGlbAnchorName` — function — line 52
- `ORIGIN_ANCHOR_DEF` — const — line 149
- `prepareMatches` — function — line 66
- `validateAnchorDefs` — function — line 101

## `assets/assetIndex.ts`

- `assetEntryMatchesQuery` — function — line 164
- `assetIndexById` — function — line 462
- `AssetIndexEntry` — type — line 63
- `AssetIndexGroup` — type — line 49
- `AssetIndexStatus` — type — line 61
- `AssetPrepare` — type — line 44
- `basenameFromUrl` — function — line 106
- `buildAssetIndex` — function — line 331
- `customUrlEntry` — function — line 186
- `entryFromUrl` — function — line 476
- `filterAssetIndex` — function — line 177
- `findAssetEntry` — function — line 468
- `formatAssetLabel` — function — line 159
- `groupFromModelUrl` — function — line 133
- `kindFromBasename` — function — line 120
- `makeParkedEntry` — function — line 215
- `mergeParkedManifest` — function — line 233
- `packFromUrl` — function — line 112
- `parkedIdFromUrl` — function — line 128
- `resolveLoadEntry` — function — line 204

## `assets/constructionCatalog.ts`

- `buildConstructionCatalog` — function — line 182
- `CONSTRUCTION_RULES` — const — line 254
- `ConstructionAnchor` — type — line 35
- `ConstructionAnchorSide` — type — line 33
- `ConstructionCatalog` — type — line 69
- `ConstructionModule` — type — line 41
- `ConstructionPart` — type — line 48
- `ConstructionPartKind` — type — line 23
- `ConstructionRule` — type — line 249
- `furnitureUrls` — function — line 172
- `megakitUrls` — function — line 167

## `assets/houseDefinitionExample.ts`

- `capRoof` — function — line 434
- `capRoofWithGables` — function — line 464
- `COTTAGE_4X4_A` — const — line 666
- `COTTAGE_4X4_B` — const — line 684
- `COTTAGE_4X4_C` — const — line 810
- `COTTAGE_6X4_A` — const — line 705
- `COTTAGE_6X4_B` — const — line 724
- `COTTAGE_6X4_C` — const — line 833
- `COTTAGE_DEFINITIONS` — const — line 909
- `gableParts` — function — line 444
- `HOME_HOUSE_DEFINITIONS` — const — line 927
- `HOUSE_6X6_A` — const — line 744
- `HOUSE_6X6_B` — const — line 856
- `HOUSE_8X6_A` — const — line 766
- `HOUSE_8X6_B` — const — line 788
- `HOUSE_8X6_C` — const — line 883
- `HOUSE_DEFINITIONS` — const — line 918
- `HOUSE_MODULE_M` — const — line 13
- `HouseCornerSide` — type — line 16
- `HouseDecoration` — type — line 73
- `HouseDefinition` — type — line 116
- `HouseFurniturePlacement` — type — line 102
- `HouseFurnitureRole` — type — line 90
- `HouseGableEnds` — type — line 438
- `HouseInteractionKind` — type — line 17
- `HouseInteractionPoint` — type — line 79
- `HouseLampMount` — type — line 88
- `HouseOpening` — type — line 37
- `HousePartTransform` — type — line 21
- `HouseRoof` — type — line 62
- `HouseRoofPart` — type — line 56
- `HouseVec3` — type — line 19
- `HouseWallPlacement` — type — line 26
- `HouseWallSide` — type — line 15
- `pickHouseDefinition` — function — line 953
- `PLASTER_WALL_TOP_Y` — const — line 148
- `TEST_HOUSE_01` — const — line 637
- `TEST_HOUSE_02` — const — line 648
- `wooden2x1RoofParts` — function — line 414

## `assets/loadGltf.ts`

- `disposeObject3D` — function — line 184
- `GltfAsset` — type — line 39
- `invalidateGltf` — function — line 163
- `loadGltf` — function — line 81
- `loadGltfAnimated` — function — line 96
- `loadGltfAsset` — function — line 86
- `prepareProp` — function — line 115
- `preparePropFitMax` — function — line 140
- `SMALL_MESH_SHADOW_THRESHOLD` — const — line 29

## `assets/loadTexture.ts`

- `loadTexture` — function — line 12

## `assets/mountByAnchorPair.ts`

- `mountByAnchorPair` — function — line 36
- `MountByAnchorPairInput` — type — line 13

## `assets/resolveInteractionPoint.ts`

- `interactionQueueAnchorFromResolved` — function — line 68
- `ResolvedInteractionPoint` — type — line 10
- `resolveInteractionPoint` — function — line 24
