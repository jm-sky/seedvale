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

- `assetEntryMatchesQuery` — function — line 162
- `assetIndexById` — function — line 466
- `AssetIndexEntry` — type — line 66
- `AssetIndexGroup` — type — line 52
- `AssetIndexStatus` — type — line 64
- `AssetPrepare` — type — line 47
- `basenameFromUrl` — function — line 109
- `buildAssetIndex` — function — line 329
- `customUrlEntry` — function — line 184
- `entryFromUrl` — function — line 480
- `filterAssetIndex` — function — line 175
- `findAssetEntry` — function — line 472
- `formatAssetLabel` — function — line 157
- `groupFromModelUrl` — function — line 131
- `kindFromBasename` — function — line 123
- `makeParkedEntry` — function — line 213
- `mergeParkedManifest` — function — line 231
- `packFromUrl` — function — line 115
- `resolveLoadEntry` — function — line 202

## `assets/assetUrlUtils.ts`

- `parkedIdFromUrl` — function — line 10

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

- `capRoof` — function — line 299
- `capRoofWithGables` — function — line 329
- `COTTAGE_4X4_A` — const — line 531
- `COTTAGE_4X4_B` — const — line 549
- `COTTAGE_4X4_C` — const — line 675
- `COTTAGE_6X4_A` — const — line 570
- `COTTAGE_6X4_B` — const — line 589
- `COTTAGE_6X4_C` — const — line 698
- `COTTAGE_DEFINITIONS` — const — line 774
- `gableParts` — function — line 309
- `HOME_HOUSE_DEFINITIONS` — const — line 792
- `HOUSE_6X6_A` — const — line 609
- `HOUSE_6X6_B` — const — line 721
- `HOUSE_8X6_A` — const — line 631
- `HOUSE_8X6_B` — const — line 653
- `HOUSE_8X6_C` — const — line 748
- `HOUSE_DEFINITIONS` — const — line 783
- `HouseGableEnds` — type — line 303
- `pickHouseDefinition` — function — line 818
- `TEST_HOUSE_01` — const — line 502
- `TEST_HOUSE_02` — const — line 513
- `wooden2x1RoofParts` — function — line 279

## `assets/houseDefinitionExampleConfig.ts`

- `CHIMNEY` — const — line 151
- `CORNER` — const — line 149
- `CORNER_BRICK` — const — line 150
- `DOOR_FRAME` — const — line 145
- `DOOR_LEAF` — const — line 146
- `FLOOR` — const — line 148
- `FURNITURE_BED` — const — line 170
- `FURNITURE_CHEST_SENTINEL` — const — line 172
- `FURNITURE_LAMP_SENTINEL` — const — line 173
- `FURNITURE_TABLE` — const — line 171
- `GABLE_4` — const — line 157
- `GABLE_6` — const — line 158
- `GABLE_8` — const — line 159
- `HOUSE_MODULE_M` — const — line 3
- `HouseCornerSide` — type — line 6
- `HouseDecoration` — type — line 63
- `HouseDefinition` — type — line 106
- `HouseFurniturePlacement` — type — line 92
- `HouseFurnitureRole` — type — line 80
- `HouseInteractionKind` — type — line 7
- `HouseInteractionPoint` — type — line 69
- `HouseLampMount` — type — line 78
- `HouseOpening` — type — line 27
- `HousePartTransform` — type — line 11
- `HouseRoof` — type — line 52
- `HouseRoofPart` — type — line 46
- `HouseVec3` — type — line 9
- `HouseWallPlacement` — type — line 16
- `HouseWallSide` — type — line 5
- `PLASTER_WALL_TOP_Y` — const — line 138
- `RIDGE` — const — line 153
- `ROOF_CAP_4X4` — const — line 154
- `ROOF_CAP_4X6` — const — line 155
- `ROOF_CAP_6X6` — const — line 156
- `SLOPE` — const — line 152
- `WALL_BRICK` — const — line 144
- `WALL_DOOR` — const — line 141
- `WALL_STRAIGHT` — const — line 140
- `WALL_WINDOW` — const — line 142
- `WALL_WOODGRID` — const — line 143
- `WINDOW_FILL` — const — line 147

## `assets/loadGltf.ts`

- `disposeObject3D` — function — line 189
- `GltfAsset` — type — line 39
- `invalidateGltf` — function — line 168
- `loadGltf` — function — line 86
- `loadGltfAnimated` — function — line 101
- `loadGltfAsset` — function — line 91
- `prepareProp` — function — line 120
- `preparePropFitMax` — function — line 145
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
