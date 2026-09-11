# Symbols

Generated from exported TypeScript symbols.

## `world/animalTraps.ts`

- `accumulateTrapWeatherWear` — function — line 242
- `isSpeciesTrappable` — function — line 97
- `isTrapCooldownActive` — function — line 180
- `PlacedTrapRecord` — type — line 266
- `rollTrapDetection` — function — line 137
- `spendTrapDurability` — function — line 205
- `startTrapCooldown` — function — line 192
- `TRAP_BAIT_DETECTION_CUT` — const — line 114
- `TRAP_CHECK_INTERVAL_SEC` — const — line 321
- `TRAP_DEFS` — const — line 51
- `TRAP_DETECTION_COOLDOWN_DAYS` — const — line 171
- `TRAP_FOOTPRINT_RADIUS` — const — line 309
- `TRAP_KIND_BY_ITEM` — const — line 76
- `TRAP_MAX_DETECTION` — const — line 105
- `TRAP_MIN_DETECTION` — const — line 104
- `TRAP_PLACE_REACH` — const — line 314
- `TRAP_PLACEMENT_MESSAGE` — const — line 301
- `TRAP_SEPARATION` — const — line 312
- `TRAP_SETUP_DURATION_SEC` — const — line 317
- `TRAP_SKILL_DETECTION_CUT` — const — line 107
- `TRAP_WEATHER_MAX_CATCHUP_CYCLES` — const — line 232
- `TRAP_WEATHER_SEVERITY` — const — line 212
- `TrapCooldowns` — type — line 176
- `TrapDef` — type — line 25
- `trapDetectionChance` — function — line 120
- `trapDetectionRoll` — function — line 164
- `TrapKind` — type — line 18
- `trapKindForItem` — function — line 81
- `TrapLureDescriptor` — type — line 291
- `TrapPlacementReason` — type — line 299
- `TrapState` — type — line 23
- `trapStateLabel` — function — line 323
- `TrapUseResult` — type — line 200
- `TrapWeatherCatchup` — type — line 234
- `trapWeatherWear` — function — line 223

## `world/beehives.ts`

- `BeehiveRecord` — type — line 5
- `burnHive` — function — line 69
- `collectHoney` — function — line 56
- `HIVE_BURN_REWARD_HONEY` — const — line 65
- `HIVE_STING_DAMAGE` — const — line 44
- `HiveBurnResult` — type — line 67
- `HiveCollectResult` — type — line 52
- `HONEY_MAX_ACCUMULATION` — const — line 22
- `HONEY_PRODUCTION_INTERVAL_DAYS` — const — line 20
- `honeyAvailable` — function — line 24
- `rollHiveSting` — function — line 46

## `world/bloodTraces.ts`

- `BLOOD_GLOBAL_CAP` — const — line 64
- `BLOOD_LOCAL_CAP` — const — line 61
- `BLOOD_LOCAL_RADIUS` — const — line 60
- `BLOOD_MAX_LIFETIME_DAYS` — const — line 50
- `BLOOD_MAX_SIZE` — const — line 48
- `BLOOD_MIN_LIFETIME_DAYS` — const — line 49
- `BLOOD_MIN_SIZE` — const — line 47
- `BLOOD_RAIN_FADE_WEIGHT` — const — line 56
- `BLOOD_VARIANT_COUNT` — const — line 46
- `BloodTrace` — type — line 26
- `bloodTraceRemainingFraction` — function — line 135
- `BloodTraceSink` — type — line 216
- `bloodTracesNear` — function — line 206
- `BloodTraceSystem` — type — line 239
- `BloodTraceWorldState` — type — line 41
- `computeBloodTraceSize` — function — line 97
- `createBloodTraceSystem` — function — line 262
- `createBloodTraceWorldState` — function — line 86
- `pruneBloodTraces` — function — line 146
- `recordBloodHit` — function — line 235
- `recordBloodTrace` — function — line 162
- `setBloodTraceSink` — function — line 228

## `world/cart.ts`

- `CART_HITCH_RANGE` — const — line 59
- `cartAcceptsAnimal` — function — line 50
- `CartHitchPose` — type — line 25
- `CartRecord` — type — line 10
- `DraftAnimalPose` — type — line 19
- `hitchDistanceForAnimal` — function — line 54
- `resolveCartHitchPose` — function — line 36
  - domain: fauna
  - role: Deterministic one-way animal→cart hitch pose. Cart has no AI and never feeds orientation back into the animal.

## `world/cartProp.ts`

- `CART_FIT_MAX` — const — line 7
- `CART_MODEL_URL` — const — line 5
- `CART_MODEL_YAW_OFFSET` — const — line 9
- `createCartProp` — function — line 81
- `disposeCartProp` — function — line 86
- `preloadCartProp` — function — line 63
  - domain: fauna
  - role: Cart visual template (GLB or procedural fallback). Logical hitch is authoritative even when the mesh is the fallback.

## `world/caveColliders.ts`

- `buildCaveWallColliders` — function — line 102

## `world/caveGenerator.ts`

- `CaveGeneratorInput` — type — line 74
- `generateCaveDefinitions` — function — line 247
- `MIN_OVERBURDEN` — const — line 55
- `MOUTH_FOOTPRINT_MARGIN` — const — line 72
- `MOUTH_ROOF_MIN` — const — line 68

## `world/caveMesh.ts`

- `createCaveInteriorMesh` — function — line 117

## `world/caves/adventureTopology.ts`

- `ADVENTURE_DEEP_CHAMBER_NODE_ID` — const — line 72
- `ADVENTURE_DEEP_PASSAGE_NODE_ID` — const — line 71
- `ADVENTURE_DESCENT_PER_METER` — const — line 50
- `ADVENTURE_FINAL_CHAMBER_NODE_ID` — const — line 74
- `ADVENTURE_FINAL_PASSAGE_NODE_ID` — const — line 73
- `ADVENTURE_JUNCTION_NODE_ID` — const — line 69
- `ADVENTURE_MAX_HEIGHTFIELD_CELLS` — const — line 121
- `ADVENTURE_SIDE_CHAMBER_NODE_ID` — const — line 70
- `buildAdventureCaveTopology` — function — line 213
  - domain: world-terrain
- `fitsAdventureFootprintBudget` — function — line 131
  - domain: world-terrain

## `world/caves/caveArchetype.ts`

- `ADVENTURE_HOME_BAND_MAX` — const — line 36
- `ADVENTURE_HOME_BAND_MIN` — const — line 35
- `ADVENTURE_ROLL_CHANCE` — const — line 29
- `ArchetypeAssignment` — type — line 88
- `ArchetypeCandidate` — type — line 38
- `assignCaveArchetypes` — function — line 118
  - domain: world-terrain
- `CaveArchetype` — type — line 24
- `orderHomeAdventureCandidates` — function — line 56
  - domain: world-terrain
- `rollsAdventure` — function — line 84
  - domain: world-terrain

## `world/caves/caveContentAnchors.ts`

- `CAVE_CONTENT_ANCHOR_ROLES` — const — line 42
- `CAVE_CONTENT_PLACEMENT` — const — line 88
- `CaveContentAnchor` — type — line 60
  - domain: world-terrain
- `caveContentAnchorId` — function — line 115
  - domain: world-terrain
- `CaveContentAnchorInput` — type — line 70
- `CaveContentAnchorRole` — type — line 51
- `chamberContentCandidates` — function — line 135
  - domain: world-terrain
- `CONTENT_ANCHOR_CANDIDATE_LIMIT` — const — line 99
- `ContentAnchorPlacement` — type — line 79
- `passageWallContentCandidates` — function — line 150
  - domain: world-terrain
- `resolveCaveContentAnchors` — function — line 329
  - domain: world-terrain

## `world/caves/caveGroundQuery.ts`

- `applyCaveGroundHysteresis` — function — line 66
  - domain: world-terrain
- `applyCaveInteriorHysteresis` — function — line 93
  - domain: world-terrain
- `CAVE_FLOOR_GRACE` — const — line 37
- `CAVE_OCCUPANCY_EPS` — const — line 48
- `CAVE_UNDERGROUND_MISS` — const — line 41
- `CaveGroundHit` — type — line 24
- `CaveGroundHysteresis` — type — line 50
- `CaveInteriorHysteresis` — type — line 79
- `CaveVerticalInterval` — type — line 15
  - domain: world-terrain

## `world/caves/caveHeightfieldMaterial.ts`

- `alignCaveDetailNormalToGeometric` — function — line 121
  - domain: world-terrain
- `CAVE_SURFACE_MATERIAL_TUNING` — const — line 17
- `CaveSurfaceMaterialTuning` — type — line 32
- `CaveVec3` — type — line 34
- `createCaveHeightfieldMaterial` — function — line 357
- `CreateCaveHeightfieldMaterialOptions` — type — line 344
- `disposeCaveHeightfieldMaterialGpu` — function — line 389
- `perturbCaveWorldNormalOnTangentPlane` — function — line 99
  - domain: world-terrain
- `reconstructCaveTriplanarWorldNormal` — function — line 59
  - domain: world-terrain

## `world/caves/caveHeightfieldMesh.ts`

- `buildHeightfieldMeshBuffers` — function — line 119
  - domain: world-terrain
- `buildMouthUndersideMaskBuffers` — function — line 633
  - domain: world-terrain
- `HeightfieldMeshBuffers` — type — line 28
- `MouthUndersideMaskBuffers` — type — line 331

## `world/caves/caveHeightfieldPlacement.ts`

- `chamberCandidates` — function — line 117
  - domain: world-terrain
- `footprintHolds` — function — line 195
  - domain: world-terrain
- `Heading` — type — line 16
- `incomingFromPoints` — function — line 26
- `incomingHeading` — function — line 36
- `lateralDistance` — function — line 102
- `passageWallCandidates` — function — line 164
  - domain: world-terrain
- `pointAlongSegment` — function — line 63
- `segmentLength` — function — line 52
- `signFromRandom` — function — line 22
- `Xz` — type — line 15
- `yawFacing` — function — line 18

## `world/caves/caveHeightfieldPresentation.ts`

- `CaveHeightfieldPresentation` — type — line 203
- `createCaveHeightfieldGeometry` — function — line 54
  - domain: world-terrain
- `createCaveHeightfieldPresentation` — function — line 226
  - domain: world-terrain
- `createMouthRocks` — function — line 136
  - domain: world-terrain
- `createMouthUndersideMask` — function — line 72
  - domain: world-terrain
- `createMouthUndersideMaskMaterial` — function — line 38

## `world/caves/caveHeightfieldQuery.ts`

- `CAVE_STANDING_CLEARANCE_MARGIN` — const — line 36
- `CAVE_SURFACE_ENTITY_SLACK` — const — line 59
- `heightfieldGroundColumn` — function — line 78
  - domain: world-terrain
- `heightfieldInteriorAt` — function — line 157
  - domain: world-terrain
- `heightfieldOccupancyAt` — function — line 136
  - domain: world-terrain
- `HeightfieldSpaceQuery` — type — line 169
- `heightfieldStandingClearance` — function — line 39
- `queryHeightfieldGround` — function — line 105
  - domain: world-terrain
- `queryHeightfieldSpace` — function — line 181
  - domain: world-terrain
- `resolveHeightfieldHorizontal` — function — line 215
  - domain: world-terrain

## `world/caves/caveHeightfieldRepresentation.ts`

- `APERTURE_LIFT` — const — line 83
- `BETA` — const — line 46
- `buildCaveHeightfieldRepresentation` — function — line 667
  - domain: world-terrain
- `buildChamberLobes` — function — line 391
  - domain: world-terrain
- `buildEntranceInfluence` — function — line 350
  - domain: world-terrain
- `CaveHeightfieldBounds` — type — line 125
- `CaveHeightfieldBuildResult` — type — line 188
- `CaveHeightfieldConfig` — type — line 102
- `CaveHeightfieldRepresentation` — type — line 144
  - domain: world-terrain
- `closure` — function — line 214
  - domain: world-terrain
- `crossSectionAt` — function — line 475
  - domain: world-terrain
- `DEFAULT_HEIGHTFIELD_CONFIG` — const — line 111
- `ENTRANCE_INWARD` — const — line 87
- `ENTRANCE_OUTWARD` — const — line 85
- `estimateHeightfieldGrid` — function — line 640
  - domain: world-terrain
- `FAR_GAP` — const — line 79
- `heightfieldGapGradient` — function — line 903
- `heightfieldNodeGap` — function — line 816
- `heightfieldNodeIndex` — function — line 803
- `heightfieldNodeOpenSky` — function — line 821
- `heightfieldNodePosition` — function — line 807
- `HeightfieldSample` — type — line 174
- `HeightfieldStation` — type — line 165
- `KAPPA` — const — line 55
- `mouthOpeningAt` — function — line 892
  - domain: world-terrain
- `NC` — const — line 51
- `NF` — const — line 48
- `NoiseOctave2D` — type — line 100
- `OUTSIDE_REACH` — const — line 75
- `R_MIN` — const — line 71
- `resampleSegmentStations` — function — line 271
  - domain: world-terrain
- `RIM_ASPECT` — const — line 60
- `RIM_BAND_MAX` — const — line 64
- `RIM_BAND_MIN` — const — line 61
- `rimBand` — function — line 221
- `sampleHeightfieldAt` — function — line 856
  - domain: world-terrain
- `SMOOTH_K` — const — line 57
- `SurfaceSampler` — type — line 195
- `U_CORE` — const — line 66
- `U_FADE` — const — line 69

## `world/caves/caveIdentity.ts`

- `CaveIdentitySite` — type — line 11
  - domain: world-terrain
- `makeCaveId` — function — line 15

## `world/caves/caveInteriorRocks.ts`

- `CAVE_INTERIOR_ROCK_TEMPLATE_SLOTS` — const — line 81
- `CaveInteriorRockPlacement` — type — line 54
- `CaveInteriorRocksInput` — type — line 70
- `CaveInteriorRockSizeClass` — type — line 49
- `createCaveInteriorRocksGroup` — function — line 485
  - domain: world-terrain
- `getCaveInteriorRockTemplates` — function — line 438
  - domain: world-terrain
- `resolveCaveInteriorRocks` — function — line 212
  - domain: world-terrain

## `world/caves/caveMath.ts`

- `smax` — function — line 21
- `smin` — function — line 14
  - domain: world-terrain

## `world/caves/caveOrientation.ts`

- `openingDirection` — function — line 12
- `tunnelDirection` — function — line 8
  - domain: world-terrain

## `world/caves/cavePresentationLifecycle.ts`

- `CAVE_ACTIVATE_DISTANCE` — const — line 10
  - domain: world-terrain
- `CAVE_DEACTIVATE_DISTANCE` — const — line 11
- `CavePresentationPhase` — type — line 13
- `CavePresentationQueue` — type — line 171
- `CaveStreamingHooks` — type — line 28
- `CaveStreamingSnapshot` — type — line 15
- `CaveStreamingStats` — type — line 21
- `caveWantedAtDistance` — function — line 40
- `createCavePresentationQueue` — function — line 195
  - domain: world-terrain
- `createCaveStreamingController` — function — line 58
  - domain: world-terrain

## `world/caves/caveRng.ts`

- `CAVE_RNG_SALT` — const — line 34
- `createCaveRandom` — function — line 73

## `world/caves/caveRoute.ts`

- `CaveRecipeInput` — type — line 63
- `Cursor` — type — line 87
- `FLOOR_RAMP_STATION_SPACING` — const — line 41
- `lowerFeatureIfNeeded` — function — line 310
- `MAX_TOTAL_DROP` — const — line 49
- `MAX_TRAVERSABLE_FLOOR_GRADE` — const — line 39
- `maxCenterlineFloorGrade` — function — line 187
- `MIN_DISCONNECTED_CLEARANCE` — const — line 60
- `minGapBetweenPaths` — function — line 290
- `NATURAL_DESCENT_PER_METER` — const — line 30
- `pick` — function — line 101
- `RadialStation` — type — line 89
- `rotateXZ` — function — line 95
- `RouteContext` — type — line 78
- `walkSegment` — function — line 220
  - domain: world-terrain
- `WalkWobble` — type — line 91

## `world/caves/caveSpikeMetrics.ts`

- `CaveSpikeMetrics` — type — line 11
- `CaveSpikeVariant` — type — line 9
  - domain: world-terrain
- `reportCaveSpikeMetrics` — function — line 53
- `runMedianOfN` — function — line 33

## `world/caves/caveSurface.ts`

- `SURFACE_CLIP_EPS` — const — line 15
  - domain: world-terrain

## `world/caves/caveTerrainCutout.ts`

- `caveOpenSkyBounds` — function — line 31
- `caveTerrainCutout` — function — line 63
  - domain: world-terrain

## `world/caves/caveTopology.ts`

- `CaveTopology` — type — line 65
  - domain: world-terrain
- `CaveTopologyFeature` — type — line 48
- `CaveTopologyFeatureKind` — type — line 19
- `CaveTopologyNode` — type — line 27
- `CaveTopologyNodeKind` — type — line 17
- `CaveTopologyPoint` — type — line 21
- `CaveTopologySegment` — type — line 39

## `world/caves/clipBelowSurface.ts`

- `clipTrianglesBelowSurface` — function — line 38
  - domain: world-terrain
- `clipTrianglesInFrontOfMouth` — function — line 83
  - domain: world-terrain
- `SurfaceHeightSampler` — type — line 30

## `world/caves/mouthCarve.ts`

- `CAVE_APPROACH_DEPTH` — const — line 24
- `CAVE_APPROACH_OFFSET` — const — line 26
- `CAVE_APPROACH_RADIUS` — const — line 28
- `CAVE_MOUTH_DEPTH` — const — line 22
- `CAVE_MOUTH_RADIUS` — const — line 27
- `CaveMouthGeometry` — type — line 62
  - domain: world-terrain
- `deriveMouthGeometry` — function — line 91
  - domain: world-terrain
- `inMouthAperture` — function — line 226
  - domain: world-terrain
- `MOUTH_APERTURE_INWARD` — const — line 45
- `MOUTH_APERTURE_OUTWARD` — const — line 46
- `MOUTH_FRAME_INWARD` — const — line 39
- `MOUTH_FRAME_OUTWARD` — const — line 38
- `MOUTH_FRAME_THICKNESS` — const — line 37
- `MOUTH_HOOD_HEIGHT` — const — line 40
- `MOUTH_INTERIOR_ALONG` — const — line 34
- `MOUTH_LIP_DEPTH` — const — line 41
- `mouthAlong` — function — line 130
  - domain: world-terrain
- `mouthApertureVoidSDF` — function — line 274
  - domain: world-terrain
- `mouthCarveDepth` — function — line 208
  - domain: world-terrain
- `MouthCarveDisc` — type — line 48
- `mouthCarveDiscs` — function — line 174
  - domain: world-terrain
- `mouthFrameSolidSDF` — function — line 297
  - domain: world-terrain
- `mouthLateral` — function — line 145
  - domain: world-terrain
- `mouthLocalBoxSDF` — function — line 244
  - domain: world-terrain
- `smoothstep` — function — line 156

## `world/caves/mouthOverburden.ts`

- `MOUTH_TRANSITION_RANGE` — const — line 20
- `mouthOpeningRadius` — function — line 25
- `mouthOverburdenRequirement` — function — line 35
  - domain: world-terrain

## `world/caves/productionTopology.ts`

- `buildNaturalCaveTopology` — function — line 95
  - domain: world-terrain
- `buildProductionCaveTopology` — function — line 82
  - domain: world-terrain
- `ProductionTopologyInput` — type — line 66

## `world/caves/spikeNoise.ts`

- `createMultiScaleNoise1D` — function — line 75
- `createValueNoise1D` — function — line 33
- `createValueNoise2D` — function — line 51
  - domain: world-terrain
- `NoiseOctave` — type — line 70

## `world/caves/spikeTestCave.ts`

- `buildSpikeTestTopology` — function — line 160
  - domain: world-terrain
- `spikeOverburdenRequirement` — function — line 74
  - domain: world-terrain
- `SpikeTestCaveOptions` — type — line 51

## `world/caves/sweepCaveMesh.ts`

- `buildSweepCaveMesh` — function — line 258
  - domain: world-terrain
- `DEFAULT_SWEEP_PARAMS` — const — line 40
- `SweepCaveParams` — type — line 25
- `SweepCaveResult` — type — line 250

## `world/caves/terrainFootprint.ts`

- `minSurfaceOverFootprint` — function — line 14

## `world/caves/topologyAdapter.ts`

- `PROXY_MARGIN` — const — line 17
- `topologyToCaveDefinition` — function — line 49
  - domain: world-terrain

## `world/caveVolume.ts`

- `CaveBounds` — type — line 41
- `CaveDefinition` — type — line 50
- `CaveEntrance` — type — line 30
- `CaveNode` — type — line 10
- `CaveNodeKind` — type — line 8
- `CaveTunnel` — type — line 20
- `CaveVolume` — type — line 129
- `computeCaveBounds` — function — line 211
- `createCaveVolume` — function — line 150

## `world/clouds.ts`

- `CloudAppearance` — type — line 129
- `cloudAppearanceFor` — function — line 169
- `CloudCategory` — type — line 22
- `CloudCategoryWeights` — type — line 85
- `cloudCategoryWeightsFor` — function — line 92
- `CloudSystem` — type — line 227
- `createClouds` — function — line 259

## `world/collision.ts`

- `CircleCollider` — type — line 24
- `closestBoundaryPoint` — function — line 112
- `Collider` — type — line 45
- `colliderActiveAtY` — function — line 51
- `colliderContainsPoint` — function — line 96
- `ColliderRegistry` — type — line 259
- `colliderRimPoint` — function — line 141
- `colliderSignedDistance` — function — line 85
- `createColliderRegistry` — function — line 275
- `isInsideAnyCollider` — function — line 100
- `ObbCollider` — type — line 36
- `resolvePosition` — function — line 223
- `resolvePositionAudited` — function — line 234
- `VerticalExtent` — type — line 19

## `world/condition.ts`

- `applyConditionDelta` — function — line 31
  - domain: world
- `checkpointCondition` — function — line 48
  - domain: world
- `clampCondition` — function — line 20
- `CONDITION_MAX` — const — line 17
- `ConditionDecay` — type — line 35
- `ConditionState` — type — line 10
  - domain: world
- `resolveCondition` — function — line 67
  - domain: world

## `world/containerProp.ts`

- `CHEST_DEPTH` — const — line 13
- `CHEST_WIDTH` — const — line 12
- `createPlacedContainerProp` — function — line 17
- `disposePlacedContainerProp` — function — line 50

## `world/createBeehives.ts`

- `BeehiveEntry` — type — line 13
- `Beehives` — type — line 15
- `createBeehives` — function — line 63

## `world/createCarts.ts`

- `CartEntry` — type — line 15
- `createWorldCarts` — function — line 65
  - domain: fauna
  - system: world-carts
  - role: World-owned movable cart identity/runtime (plan fauna-007). Animal movement is authoritative; the cart is attached cargo with no AI.
  - owns: CartRecord
- `DraftAnimalLookup` — type — line 17
- `WorldCarts` — type — line 25

## `world/createCaves.ts`

- `Caves` — type — line 80
- `createCaves` — function — line 244
  - system: caves
  - role: Owns cave topologies, retained heightfield representations (presentation mesh + terrain mouth cutout + every spatial query), streamed interior presentation, and deterministic adventure content anchors; `PlayerController` ground goes through `queryGround`, lateral containment through `resolveHorizontal`, camera and swim eligibility through `occupancyAt`. `queryInterior` is the hysteretic player-position cave-interior signal (audio / diagnostics).
  - owns: Caves
  - lifecycle: rebuild

## `world/createDryingRacks.ts`

- `createDryingRacks` — function — line 48
- `DryingRackEntry` — type — line 9
- `DryingRacks` — type — line 11

## `world/createGrassForagePatches.ts`

- `createGrassForagePatches` — function — line 62
- `GrassForageService` — type — line 22

## `world/createLights.ts`

- `createLights` — function — line 24
- `WorldLights` — type — line 4

## `world/createOcean.ts`

- `createOcean` — function — line 33
- `WorldOcean` — type — line 9

## `world/createPalisades.ts`

- `createPalisades` — function — line 74
  - domain: items-player
- `Palisades` — type — line 30
- `PalisadeSegmentEntry` — type — line 28

## `world/createPlacedContainers.ts`

- `createPlacedContainers` — function — line 117
- `PlacedContainerEntry` — type — line 36
- `PlacedContainerRecord` — type — line 14
- `PlacedContainers` — type — line 50
- `SaveCarriedContainer` — type — line 28

## `world/createPlacedTraps.ts`

- `createPlacedTraps` — function — line 95
- `PlacedTrapEntry` — type — line 25
- `PlacedTraps` — type — line 47
- `PlacedTrapsHooks` — type — line 38
- `TrapCaptureEvent` — type — line 27

## `world/createPlayerGardens.ts`

- `createPlayerGardens` — function — line 67
- `PlayerGardenEntry` — type — line 19
- `PlayerGardens` — type — line 21

## `world/createPlayerTroughs.ts`

- `createPlayerTroughs` — function — line 52
  - domain: items-player
- `PlayerTroughEntry` — type — line 16
- `PlayerTroughs` — type — line 32

## `world/createPlayerWells.ts`

- `createPlayerWells` — function — line 90
- `PlayerWellEntry` — type — line 22
- `PlayerWells` — type — line 24

## `world/createResidentialBuildings.ts`

- `createResidentialBuildings` — function — line 77
  - domain: settlements
- `ResidentialBuildingEntry` — type — line 24
- `ResidentialBuildings` — type — line 26

## `world/createRiverWater.ts`

- `createChunkRiver` — function — line 23
- `WorldRiver` — type — line 8

## `world/createSky.ts`

- `createSky` — function — line 31
- `SkyParams` — type — line 4
- `WorldSky` — type — line 12

## `world/createSleepingUtilities.ts`

- `BedrollEntry` — type — line 20
- `createSleepingUtilities` — function — line 87
  - domain: items-player
- `PlatformEntry` — type — line 21
- `SleepingUtilities` — type — line 36

## `world/createStandingTorches.ts`

- `createStandingTorches` — function — line 72
  - domain: items-player
- `StandingTorchEntry` — type — line 17
- `StandingTorches` — type — line 31

## `world/createTerrainPreparations.ts`

- `createTerrainPreparations` — function — line 70
- `TerrainPreparationEntry` — type — line 14
- `TerrainPreparations` — type — line 16

## `world/createTransportOrders.ts`

- `CreateTransportOrderParams` — type — line 14
- `createTransportOrders` — function — line 53
- `TransportOrders` — type — line 34
  - domain: settlements-npcs

## `world/createWater.ts`

- `createChunkWater` — function — line 46
- `WorldWater` — type — line 15

## `world/createWorkContracts.ts`

- `CreateWorkContractParams` — type — line 35
- `createWorkContracts` — function — line 180
  - domain: npc
- `WorkContractAssignmentLookup` — type — line 53
- `WorkContracts` — type — line 58

## `world/cropLifecycle.ts`

- `CROP_DEFS` — const — line 26
- `CROP_IDS` — const — line 32
- `CropDefinition` — type — line 13
- `CropGrowthStage` — type — line 7
- `CropHarvestYield` — type — line 89
- `CropId` — type — line 11
- `CropPlacement` — type — line 36
- `resolveCropHarvest` — function — line 94
- `resolveCropStage` — function — line 70
- `rollCropPhase` — function — line 85

## `world/cropVisuals.ts`

- `createCropStageMesh` — function — line 12

## `world/cultivationAnchor.ts`

- `CultivationAnchor` — type — line 13
  - domain: world
  - system: cultivation
- `cultivationAnchorFromPlayerGarden` — function — line 18
- `cultivationAnchorFromSettlementGarden` — function — line 24
- `resolveCultivationAnchor` — function — line 34

## `world/dayNight.ts`

- `createDayNightState` — function — line 43
- `DayNightState` — type — line 29
- `DEFAULT_TIME_OF_DAY` — const — line 27
- `formatClock` — function — line 200
- `parseTimeOfDayFromUrl` — function — line 184
- `phaseName` — function — line 207
- `resetDayNightForNewGame` — function — line 57
- `skyParamsFromTime` — function — line 72
- `tickDayNight` — function — line 62

## `world/dryingRacks.ts`

- `DryingRackRecord` — type — line 10
- `DryingRecipe` — type — line 28
- `isDryingComplete` — function — line 58
- `pickDryingRecipe` — function — line 33
- `resolveDryingOutput` — function — line 68
  - domain: items-player
- `startDryingProcess` — function — line 41

## `world/fishing.ts`

- `applyFishingBait` — function — line 82
- `FISHING_BAIT_BASE_STRENGTH` — const — line 72
- `FISHING_BAIT_BONUS` — const — line 46
- `FISHING_BAIT_DURATION_DAYS` — const — line 71
- `FISHING_BAIT_MAX_STRENGTH` — const — line 73
- `FISHING_BASE_CATCH_CHANCE` — const — line 45
- `FISHING_CAST_DURATION_SEC` — const — line 58
- `FISHING_MAX_CATCH_CHANCE` — const — line 47
- `FishingBaitState` — type — line 64
- `fishingCatchChance` — function — line 49
- `fishingCatchRoll` — function — line 41
- `fishingSpotId` — function — line 14
- `isBaitActive` — function — line 75
- `rollFishingCatch` — function — line 54

## `world/foliageWind.ts`

- `FOLIAGE_ALPHA_CUTOFF` — const — line 49
- `hardenFoliageAlpha` — function — line 58
- `patchFoliageWindMaterial` — function — line 80
- `patchFoliageWindOnObject` — function — line 106
- `patchProceduralFoliageMaterial` — function — line 124
- `updateFoliageWind` — function — line 130

## `world/foodSources.ts`

- `createFoodSourceHooks` — function — line 163
- `FoodSourceTarget` — type — line 19
- `nearestFoodSource` — function — line 98
- `nearestHarvestableCrop` — function — line 138
- `SettlementFoodSourceHooks` — type — line 26

## `world/gardenPlotProp.ts`

- `createGardenPlotProp` — function — line 9

## `world/grassForage.ts`

- `depleteGrassPatch` — function — line 105
- `GRASS_PATCH_CELL_SIZE` — const — line 22
  - domain: fauna
  - system: grass-forage
  - role: Owns deterministic patch placement and depletion/regrowth state.
  - owns: GrassForageOverrides
- `GRASS_PATCH_EXISTS_CHANCE` — const — line 26
- `GRASS_PATCH_JITTER` — const — line 27
- `GRASS_REGROWTH_DAYS` — const — line 30
- `GrassForageOverrides` — type — line 94
- `grassPatchCandidate` — function — line 51
- `GrassPatchCandidate` — type — line 32
- `grassPatchCandidatesNear` — function — line 69
- `grassPatchCellCoord` — function — line 40
- `grassPatchId` — function — line 44
- `isGrassPatchAvailable` — function — line 96
- `pruneGrassForageOverrides` — function — line 113

## `world/groundFog.ts`

- `createGroundFog` — function — line 191
- `GroundFogSystem` — type — line 177

## `world/helperDeliveryHooks.ts`

- `createHelperDeliveryHooks` — function — line 28
- `HelperDeliveryHooks` — type — line 11

## `world/hiddenFinds.ts`

- `ExplicitBuriedPlacement` — type — line 169
- `findExplicitBuriedSpot` — function — line 210
- `findHiddenFindSpot` — function — line 185
- `HIDDEN_FIND_SEARCH_RADIUS` — const — line 49
- `HiddenFindLandmark` — type — line 51
- `HiddenFindLoot` — type — line 61
- `HiddenFindMatch` — type — line 161
- `resolveHiddenFindLoot` — function — line 233

## `world/largeCaves.ts`

- `LARGE_CAVE_MAX_LENGTH` — const — line 36
- `LARGE_CAVE_MIN_HOME_DIST` — const — line 38
- `LARGE_CAVE_MIN_LENGTH` — const — line 35
- `LARGE_CAVE_MIN_SEPARATION` — const — line 37
- `LARGE_CAVE_MOUTH_WIDTH` — const — line 34
- `LargeCavePlacementInput` — type — line 22
- `LargeCaveSite` — type — line 10
- `pickLargeCaveSites` — function — line 101
- `VillageFootprint` — type — line 20

## `world/largeCaveVisual.ts`

- `createLargeCaveVisual` — function — line 14
- `placeLargeCaveVisual` — function — line 60

## `world/locations/darkForestTreasureSite.ts`

- `caveWorldLocationId` — function — line 80
- `DARK_FOREST_TREASURE_CHEST_COINS` — const — line 351
- `DARK_FOREST_TREASURE_LANDMARK_ID` — const — line 20
- `DARK_FOREST_TREASURE_LOCATION_ID` — const — line 18
- `DARK_FOREST_TREASURE_SITE_KEY` — const — line 16
- `darkForestTreasureChestId` — function — line 22
- `darkForestTreasureMapPickupId` — function — line 30
- `DarkForestTreasureSite` — type — line 52
- `DarkForestTreasureSiteInput` — type — line 68
- `darkForestTreasureWolfDenId` — function — line 26
- `isDarkForestTreasureChestLooted` — function — line 353
- `resolveDarkForestTreasureSite` — function — line 177
  - domain: quests-progression
- `resolveTreasureMapSourcePlace` — function — line 304
  - domain: quests-progression
- `ResolveTreasureMapSourcePlaceInput` — type — line 240
- `ruinsDiscoveryRadius` — function — line 373
- `siteChunkContainsPoint` — function — line 359
- `TREASURE_MAP_SOURCE_PREFERRED_MAX` — const — line 77
- `TREASURE_MAP_SOURCE_PREFERRED_MIN` — const — line 76
- `TreasureMapSourceCandidate` — type — line 231
- `TreasureMapSourceKind` — type — line 35
- `TreasureMapSourcePlace` — type — line 41
- `withTreasureMapSourcePlace` — function — line 343

## `world/locations/darkForestTreasureSiteRuntime.ts`

- `getActiveDarkForestTreasureSite` — function — line 11
- `setActiveDarkForestTreasureSite` — function — line 7

## `world/locations/locationConfig.ts`

- `CEMETERY_SEARCH_CHUNK_RADIUS` — const — line 45
- `FAR_RANGE_KM` — const — line 32
- `GUARD_LANDMARK_POOL_SIZE` — const — line 83
- `GUARD_REVEAL_MAX` — const — line 85
- `GUARD_REVEAL_MIN` — const — line 84
- `KM_PER_DAY` — const — line 15
- `kmToDays` — function — line 25
- `kmToWorldUnits` — function — line 21
- `LAKE_FLOOD_FILL_SAFETY_CAP` — const — line 79
- `LOCATION_SCAN_STEP` — const — line 39
- `LOCATION_TILE_CELLS` — const — line 63
- `MAX_CEMETERY_SETTLEMENTS_SEARCHED` — const — line 53
- `MEDIUM_RANGE_KM` — const — line 31
- `MERCHANT_MAP_LANDMARK_POOL_SIZE` — const — line 88
- `MIN_LAKE_CELLS` — const — line 57
- `NEAR_RANGE_KM` — const — line 30
- `PEAK_MERGE_RADIUS_CELLS` — const — line 71
- `PEAK_NEIGHBOR_MARGIN_CELLS` — const — line 70
- `PEAK_SCAN_HALO_CELLS` — const — line 72
- `WORLD_UNITS_PER_KM` — const — line 11
- `worldUnitsToKm` — function — line 17

## `world/locations/locationDiscovery.ts`

- `classifyRange` — function — line 5
- `formatDistance` — function — line 21
- `isWithinRange` — function — line 11
- `landmarksInBand` — function — line 66
- `landmarksInBandAsync` — function — line 77
- `pickRandomReveal` — function — line 51
- `pickRandomSubset` — function — line 40
- `settlementsInBand` — function — line 88
- `weightedTopN` — function — line 30

## `world/locations/locationKnowledge.ts`

- `createLocationKnowledge` — function — line 35
- `getActiveLocationKnowledge` — function — line 83
- `LocationKnowledge` — type — line 19
- `LocationKnowledgeEntry` — type — line 3
- `setActiveLocationKnowledge` — function — line 79

## `world/locations/locationProximityDiscovery.ts`

- `CAVE_ENTRANCE_DISCOVERY_RADIUS` — const — line 12
- `confirmHomeSettlement` — function — line 52
- `createLocationProximityDiscovery` — function — line 118
- `LocationProximityDiscovery` — type — line 111
- `revealCaveEntrancesInRange` — function — line 62
- `revealSettlementsInRange` — function — line 91
- `SETTLEMENT_PROXIMITY_CELL_RADIUS` — const — line 21
- `SettlementProximityDef` — type — line 27

## `world/locations/locationsCoarseCache.ts`

- `CoarseCachePersistence` — type — line 73
- `CoarseTilePayload` — type — line 26
- `createCoarseCachePersistence` — function — line 91
- `LOCATIONS_COARSE_NAMESPACE` — const — line 20
  - domain: world
  - system: worldgen-cache
  - role: Persistent-cache integration for `WorldLocationCatalog`'s coarse terrain tiles (plan world-015 §7/§11/§15) — reuses the exact tile shape `worldLocationCatalog.ts` already keeps in memory (`Uint8Array` state + `Float32Array` height per 16×16 tile), never a second coarse-terrain representation.
  - integration: The catalog stays fully synchronous; this module owns the async IndexedDB side (hydrate-on-activate, debounced dirty-tile upsert) behind a synchronous `hydrateTile`/`onTileDirty` seam the catalog calls through its `WorldLocationCatalogDeps`. A hydrate miss or write failure always falls back to normal procedural sampling — this is an optimization layer, never a correctness dependency.
- `LOCATIONS_COARSE_VERSION` — const — line 24
- `locationsCoarseFingerprint` — function — line 63
- `tileSubKey` — function — line 28

## `world/locations/navigationTargets.ts`

- `createNavigationTargets` — function — line 35
- `getActiveNavigationTargets` — function — line 94
- `MAX_NAVIGATION_TARGETS` — const — line 1
- `NavigationTargetEntry` — type — line 3
- `NavigationTargets` — type — line 21
- `setActiveNavigationTargets` — function — line 90
- `SetTargetResult` — type — line 12

## `world/locations/revealLocationKnowledge.ts`

- `revealLocationKnowledge` — function — line 17
  - domain: world
- `RevealLocationKnowledgeResult` — type — line 5

## `world/locations/seedProfile.ts`

- `generateSeedName` — function — line 82
- `sampleStartupTerrainProfile` — function — line 36
- `SeedTerrainProfile` — type — line 23

## `world/locations/worldLocationCatalog.ts`

- `abandonedCemeteryChunkIntersectsKmBand` — function — line 186
  - domain: world
- `COOPERATIVE_ABANDONED_PROBE_THRESHOLD` — const — line 131
- `createWorldLocationCatalog` — function — line 252
- `emptyLocationScanDiagnostics` — function — line 96
- `LandmarkQueryOptions` — type — line 120
- `LocationScanDiagnostics` — type — line 69
- `settlementLocationId` — function — line 774
- `WorldLocationCatalog` — type — line 133
- `WorldLocationCatalogDeps` — type — line 27

## `world/locations/worldLocationNames.ts`

- `landmarkName` — function — line 74

## `world/locations/worldLocationTypes.ts`

- `DiscoveryRange` — type — line 27
- `WorldLocation` — type — line 14
- `WorldLocationKind` — type — line 1
- `worldLocationKindFromId` — function — line 39

## `world/map/mapConfig.ts`

- `MAP_CELL_SIZE` — const — line 2
- `MAP_DISCOVERY_RADIUS` — const — line 5
- `MAP_EXTENT_HALF` — const — line 9
- `MAP_MINIMAP_ZOOM_MAX` — const — line 13
- `MAP_MINIMAP_ZOOM_MIN` — const — line 12
- `MAP_WORLD_MAX_CELLS_PER_AXIS` — const — line 21
- `MAP_WORLD_ZOOM_DEFAULT` — const — line 18
- `MAP_WORLD_ZOOM_MAX` — const — line 17
- `MAP_WORLD_ZOOM_MIN` — const — line 16

## `world/map/mapData.ts`

- `createMapData` — function — line 44
- `getActiveMapData` — function — line 112
- `MapData` — type — line 13
- `setActiveMapData` — function — line 108

## `world/map/mapDiscovery.ts`

- `cellsInDiscoveryRadius` — function — line 20
- `createMapDiscovery` — function — line 37
- `MapDiscovery` — type — line 5

## `world/map/mapProjection.ts`

- `createMapProjection` — function — line 125
- `mapCellBounds` — function — line 40
- `mapCellCenter` — function — line 33
- `mapCellKey` — function — line 22
- `MapProjection` — type — line 118
- `parseMapCellKey` — function — line 54
- `projectCellAt` — function — line 79
- `rawSampleParamsFromWorld` — function — line 63
- `worldToMapCell` — function — line 26

## `world/map/mapTypes.ts`

- `MapBiomeKind` — type — line 13
- `MapCellData` — type — line 15
- `MapCellKey` — type — line 1
- `MapConfidence` — type — line 28
- `MapKnownLocation` — type — line 32
- `MapLocationKind` — type — line 30
- `MapSource` — type — line 25
- `MapTerrainKind` — type — line 4
- `MapViewport` — type — line 43

## `world/npcGraves.ts`

- `createNpcGraves` — function — line 42
- `ensureNpcBurialGrave` — function — line 92
- `graveIdForDeceased` — function — line 27
- `NpcGraveRecord` — type — line 16
  - domain: npc
  - role: Persistent completed burial world result.
  - owns: NpcGraveRecord
- `NpcGraves` — type — line 31
- `SaveGrave` — type — line 25

## `world/palisade.ts`

- `isPalisadeConstructionComplete` — function — line 117
- `nearestPalisadeConnection` — function — line 151
- `PALISADE_FOOTPRINT_RADIUS` — const — line 46
- `PALISADE_HALF_LENGTH` — const — line 45
- `PALISADE_LENGTH` — const — line 44
- `PALISADE_MATERIAL_REQUIREMENTS` — const — line 82
- `PALISADE_PLACE_DURATION_SEC` — const — line 61
- `PALISADE_PLACE_REACH` — const — line 55
- `PALISADE_PLACEMENT_MESSAGE` — const — line 69
- `PALISADE_RECOVERY_RATE` — const — line 89
- `PALISADE_REQUIRED_WORK` — const — line 95
- `PALISADE_SEPARATION` — const — line 52
- `PALISADE_SNAP_RADIUS` — const — line 59
- `PALISADE_WORK_SESSION_HOURS` — const — line 103
- `PALISADE_WORK_SESSION_SEC` — const — line 98
- `palisadeEndpoints` — function — line 135
- `PalisadePlacementReason` — type — line 63
- `palisadePromptLabel` — function — line 125
- `palisadeRemainingWork` — function — line 109
- `PalisadeSegmentRecord` — type — line 28
  - domain: items-player
- `resolvePalisadeSite` — function — line 185

## `world/palisadeProp.ts`

- `createPalisadeSegmentProp` — function — line 20
- `disposePalisadeSegmentProp` — function — line 53

## `world/parseSeed.ts`

- `createSeededRandom` — function — line 2
- `hasExplicitUrlSeed` — function — line 34
- `parseSeedFromUrl` — function — line 14
- `randomSeed` — function — line 25
- `setUrlSearchParam` — function — line 41
- `syncSeedInUrl` — function — line 48

## `world/placementPreview.ts`

- `createPlacementPreviewGhost` — function — line 63
- `placementEntranceMarkerLocalZ` — function — line 59
- `PlacementPreviewFootprint` — type — line 5
- `PlacementPreviewGhost` — type — line 41

## `world/plantedCrops.ts`

- `CROP_PLANT_DURATION_SEC` — const — line 14
- `CROP_PLANT_FOOTPRINT_RADIUS` — const — line 10
- `CROP_PLANT_MESSAGE` — const — line 24
- `CROP_PLANT_REACH` — const — line 8
- `CROP_PLANT_SEPARATION` — const — line 12
- `CROP_SEED_ITEM` — const — line 18
- `GARDEN_PLANT_RADIUS` — const — line 39
- `isNearAnyGarden` — function — line 44
- `makePlantedCropId` — function — line 56
- `parsePlantedCrops` — function — line 66

## `world/plantedTrees.ts`

- `makePlantedTreeId` — function — line 44
- `parsePlantedTrees` — function — line 76
- `pickPlantedTreeSpecies` — function — line 53
- `PlantedTreeRecord` — type — line 12
- `TREE_PLANT_DURATION_SEC` — const — line 32
- `TREE_PLANT_FOOTPRINT_RADIUS` — const — line 27
- `TREE_PLANT_MESSAGE` — const — line 34
- `TREE_PLANT_REACH` — const — line 24
- `TREE_PLANT_SEPARATION` — const — line 29

## `world/playerGarden.ts`

- `applyCultivationMaintenance` — function — line 165
- `applyGardenWatering` — function — line 318
- `CARE_DEGRADATION_PER_DAY` — const — line 126
- `CARE_MAINTAINED_THRESHOLD` — const — line 128
- `CARE_NEGLECTED_THRESHOLD` — const — line 129
- `CARE_REMOVAL_THRESHOLD` — const — line 133
- `CultivationStatus` — type — line 135
- `cultivationYieldCount` — function — line 358
- `DROUGHT_STRESS_CAP_DAYS` — const — line 238
- `DROUGHT_STRESS_MAX_STEPS` — const — line 235
- `DROUGHT_STRESS_PERCENT_PER_STEP` — const — line 234
- `DROUGHT_STRESS_STEP_DAYS` — const — line 233
- `droughtYieldMultiplier` — function — line 251
- `findNearestGarden` — function — line 92
- `GARDEN_CAPABILITY` — const — line 60
- `GARDEN_COST` — const — line 49
- `GARDEN_FOOTPRINT_RADIUS` — const — line 64
- `GARDEN_PLACE_DURATION_SEC` — const — line 69
- `GARDEN_PLACE_REACH` — const — line 67
- `GARDEN_PLACEMENT_MESSAGE` — const — line 79
- `GARDEN_SEPARATION` — const — line 65
- `GardenHydrationState` — type — line 256
- `GardenMaterialCost` — type — line 48
- `gardenMaterialRequirements` — function — line 51
- `GardenPlacementReason` — type — line 77
- `gardenPlotPromptLabel` — function — line 379
- `getCultivationStatus` — function — line 137
- `HYDRATION_DROUGHT_THRESHOLD` — const — line 218
- `HYDRATION_DRY_RATE_PER_DAY` — const — line 203
- `HYDRATION_RAIN_GAIN_PER_DAY` — const — line 215
- `HYDRATION_SIM_WINDOW_DAYS` — const — line 231
- `MAINTENANCE_BASE_DURATION_SEC` — const — line 180
- `MAINTENANCE_CARE_GAIN` — const — line 160
- `MAINTENANCE_TOOL_DURATION_SEC` — const — line 186
- `maintenanceDurationSec` — function — line 189
- `PLAYER_GARDEN_PLANT_RADIUS` — const — line 75
- `PlayerGardenRecord` — type — line 28
- `resolveCultivationCare` — function — line 150
- `resolveGardenHydration` — function — line 277
- `resolveGardenHydrationAfterHarvest` — function — line 330
- `WATERING_DURATION_SEC` — const — line 211
- `WATERING_HYDRATION_GAIN` — const — line 205
- `WATERING_LITRES` — const — line 208
- `weedGrowthMultiplier` — function — line 242

## `world/playerTrough.ts`

- `clampPlayerTroughWaterLitres` — function — line 75
- `isPlayerTroughConstructionComplete` — function — line 67
- `PLAYER_TROUGH_CAPACITY_LITRES` — const — line 25
- `PLAYER_TROUGH_FILL_DURATION_SEC` — const — line 61
- `PLAYER_TROUGH_FOOTPRINT_RADIUS` — const — line 29
- `PLAYER_TROUGH_MATERIAL_REQUIREMENTS` — const — line 47
- `PLAYER_TROUGH_PLACE_DURATION_SEC` — const — line 32
- `PLAYER_TROUGH_PLACE_REACH` — const — line 31
- `PLAYER_TROUGH_PLACEMENT_MESSAGE` — const — line 36
- `PLAYER_TROUGH_RECOVERY_RATE` — const — line 52
- `PLAYER_TROUGH_REQUIRED_WORK` — const — line 55
- `PLAYER_TROUGH_SEPARATION` — const — line 30
- `PLAYER_TROUGH_WORK_SESSION_HOURS` — const — line 57
- `PLAYER_TROUGH_WORK_SESSION_SEC` — const — line 56
- `playerTroughFreeCapacity` — function — line 71
- `PlayerTroughPlacementReason` — type — line 34
- `playerTroughPromptLabel` — function — line 79
- `PlayerTroughRecord` — type — line 14
  - domain: items-player
- `playerTroughRemainingWork` — function — line 63

## `world/playerWell.ts`

- `activeWellStage` — function — line 546
- `advanceWellConstruction` — function — line 321
- `applyWellRoofConditionDelta` — function — line 481
  - domain: world
- `applyWellRoofRepairWork` — function — line 276
  - domain: world
- `beginWellRoofRepair` — function — line 239
  - domain: world
- `formatHours` — function — line 606
- `formatWorkDuration` — function — line 611
- `getWellPitWorkHours` — function — line 89
- `hasActiveWellRoofRepair` — function — line 185
- `hasWellRoofCondition` — function — line 406
- `initializeWellRoofCondition` — function — line 425
  - domain: world
- `initialWellRoofCondition` — function — line 412
- `isWellCompleted` — function — line 385
- `isWellStageWorkComplete` — function — line 376
- `isWellWaterAvailable` — function — line 503
- `NearbyPlayerWellLookup` — type — line 648
- `nextWellStage` — function — line 371
- `PlayerWellRecord` — type — line 37
- `quoteWellRoofRepair` — function — line 212
  - domain: world
- `resolveWellRoofCondition` — function — line 440
  - domain: world
- `WELL_FOOTPRINT_RADIUS` — const — line 563
- `WELL_PLACE_DURATION_SEC` — const — line 569
- `WELL_PLACE_REACH` — const — line 566
- `WELL_PLACEMENT_MESSAGE` — const — line 553
- `WELL_RECOVERY_RATE` — const — line 159
- `WELL_ROOF_PASSIVE_DECAY_PER_DAY` — const — line 393
- `WELL_ROOF_RAIN_DECAY_PER_DAY` — const — line 394
- `WELL_ROOF_REPAIR_COST_FACTOR` — const — line 164
- `WELL_ROOF_REPAIR_WORK_LABEL` — const — line 587
- `WELL_ROOF_SIM_WINDOW_DAYS` — const — line 396
- `WELL_ROOF_SNOW_DECAY_PER_DAY` — const — line 395
- `WELL_SEPARATION` — const — line 564
- `WELL_STAGE_CAPABILITY` — const — line 124
- `WELL_STAGE_COST` — const — line 112
- `WELL_STAGE_START_PROMPT` — const — line 590
- `WELL_STAGE_WORK_HOURS` — const — line 75
- `WELL_WATER_UNAVAILABLE_DURING_REPAIR` — const — line 509
- `WELL_WORK_LABEL` — const — line 597
- `WELL_WORK_SESSION_HOURS` — const — line 584
- `WELL_WORK_SESSION_SEC` — const — line 575
- `WellMaterialCost` — type — line 106
- `WellPlacementReason` — type — line 551
- `wellPromptLabel` — function — line 623
- `wellRemainingWork` — function — line 356
- `wellRoofProtectionFactor` — function — line 469
- `WellRoofRepairQuote` — type — line 166
- `WellRoofRepairStartOutcome` — type — line 173
- `WellStage` — type — line 30
- `wellStageCapabilities` — function — line 137
- `wellStageRequirements` — function — line 149
- `wellStageWorkHours` — function — line 102
- `wellWaterSource` — function — line 519
- `WellWorkOutcome` — type — line 308

## `world/playerWellProp.ts`

- `createPlayerWellStageProp` — function — line 64

## `world/pointLightBudget.ts`

- `countVisibleRealPointLights` — function — line 143
- `createNullPointLightBudget` — function — line 333
- `createPointLightBudget` — function — line 159
- `POINT_LIGHT_CULL_USERDATA` — const — line 34
- `POINT_LIGHT_PAD_NAME` — const — line 33
- `POINT_LIGHT_PAD_USERDATA` — const — line 32
- `POINT_LIGHT_PROTECT_RADIUS` — const — line 42
- `PointLightBudget` — type — line 71
- `PointLightBudgetSnapshot` — type — line 44

## `world/repair.ts`

- `applyRepairWork` — function — line 39
  - domain: world
- `isRepairComplete` — function — line 27
- `RepairProgress` — type — line 11
  - domain: world
- `repairRemainingWork` — function — line 23

## `world/residentialBuilding.ts`

- `applyResidentialBuildingWork` — function — line 317
- `coveringPreparationSize` — function — line 390
- `createUnfinishedResidentialBuildingRecord` — function — line 281
- `isPlayerOwnedResidentialBuilding` — function — line 248
- `isResidentialBuildingComplete` — function — line 157
- `isResidentialBuildingMaterialBlocked` — function — line 161
- `isResidentialConstructionStage` — function — line 122
- `nextResidentialConstructionStage` — function — line 189
- `RESIDENTIAL_BUILDING_DEFINITIONS` — const — line 99
- `RESIDENTIAL_BUILDING_MATERIAL_BLOCK_WAIT_SEC` — const — line 145
- `RESIDENTIAL_BUILDING_PLACE_DURATION_SEC` — const — line 140
- `RESIDENTIAL_BUILDING_WORK_SESSION_HOURS` — const — line 142
- `RESIDENTIAL_BUILDING_WORK_SESSION_SEC` — const — line 141
- `RESIDENTIAL_CONSTRUCTION_STAGES` — const — line 69
- `RESIDENTIAL_PLACEMENT_MESSAGE` — const — line 149
- `residentialBuildingApproachLocal` — function — line 256
- `residentialBuildingApproachPoint` — function — line 276
- `residentialBuildingCompletedWork` — function — line 219
- `residentialBuildingDefinition` — function — line 118
- `ResidentialBuildingDefinition` — type — line 60
- `residentialBuildingFootprintRadius` — function — line 126
- `ResidentialBuildingKind` — type — line 17
  - domain: settlements
- `residentialBuildingLodgingId` — function — line 374
- `residentialBuildingPlaceReach` — function — line 135
- `residentialBuildingPromptLabel` — function — line 378
- `ResidentialBuildingRecord` — type — line 33
- `residentialBuildingRemainingWork` — function — line 201
- `residentialBuildingSeparation` — function — line 131
- `ResidentialBuildingStage` — type — line 21
- `residentialBuildingTotalRemainingWork` — function — line 234
- `residentialBuildingTotalRequiredWork` — function — line 209
- `ResidentialConstructionStage` — type — line 19
- `residentialConstructionStageLabel` — function — line 238
- `residentialHomePlaceId` — function — line 244
- `ResidentialOwner` — type — line 27
- `ResidentialPlacementReason` — type — line 147
- `ResidentialStageDefinition` — type — line 55
- `residentialStageRequiredWork` — function — line 167
- `residentialStageRequirements` — function — line 174
- `residentialTotalRequirements` — function — line 184
- `ResidentialWorkContribution` — type — line 305
- `rotateLocalToWorld` — function — line 261
- `supplyResidentialStageMaterials` — function — line 367

## `world/residentialBuildingProp.ts`

- `createResidentialBuildingPlaceholder` — function — line 26
- `disposeResidentialBuildingProp` — function — line 45

## `world/riverGeometry.ts`

- `buildRiverRibbonGeometry` — function — line 134
- `clipChainToRect` — function — line 62
- `RIVER_SURFACE_OFFSET` — const — line 12

## `world/riverWaterMaterial.ts`

- `createRiverWaterMaterial` — function — line 146

## `world/riverWaterQuality.ts`

- `applyRiverWaterQualityModifiers` — function — line 64
- `CALIBRATED_HIGH_RIVER_ELEVATION` — const — line 43
  - domain: world
  - system: river-water-quality
  - role: Pure hydrology + settlement-proximity classifier feeding contextual river `WaterSource.quality` (well/lake/ocean remain static, see `WaterSource.ts::createWaterSource`).
- `classifyBaseRiverWaterQuality` — function — line 53

## `world/riverWaterQualityResolver.ts`

- `createRiverWaterQualityResolver` — function — line 32
- `RiverWaterQualityResolver` — type — line 26
  - domain: world
  - system: river-water-quality
  - role: Owns the only river-water-quality cache; composes a river-context query and a settlement-def lookup through the pure classifier in `riverWaterQuality.ts`.

## `world/seedLibrary.ts`

- `clearSeedCache` — function — line 96
- `DeleteSeedError` — type — line 78
- `deleteSeedGuarded` — function — line 84
- `DeleteSeedResult` — type — line 79
- `ensureSeedRecordsForSeeds` — function — line 68
- `isSeedInLibrary` — function — line 23
- `resolveInitialSeedChoice` — function — line 35
- `resolveNewGameSeed` — function — line 54
- `SeedChoice` — type — line 18
  - domain: world
  - system: seed-library
  - role: New Game seed-intent resolution + lifecycle orchestration (plan world-015 §3/§10/§13) — the single seam both New Game entrypoints (boot `StartScreen`, in-app pause menu) go through, so "reuse an existing seed" can never quietly fall back to `randomSeed()`.
  - uses: SeedRecord

## `world/settlementForestHooks.ts`

- `SettlementForestHooks` — type — line 4

## `world/siteInfrastructure.ts`

- `pointInSite` — function — line 39
- `querySiteInfrastructure` — function — line 53
  - domain: world
  - system: site-infrastructure
- `SiteBounds` — type — line 13
  - domain: world
  - system: site-infrastructure
- `SiteInfrastructure` — type — line 27
  - domain: world
  - system: site-infrastructure
- `SiteInfrastructureStores` — type — line 33

## `world/sleepingUtilities.ts`

- `BEDROLL_FOOTPRINT_RADIUS` — const — line 55
- `BEDROLL_MATERIAL_REQUIREMENTS` — const — line 68
- `BEDROLL_ON_PLATFORM_RADIUS` — const — line 102
- `BEDROLL_PLACE_DURATION_SEC` — const — line 58
- `BEDROLL_PLACE_REACH` — const — line 57
- `BEDROLL_PLACEMENT_MESSAGE` — const — line 77
- `BEDROLL_RECOVERY_RATE` — const — line 71
- `BEDROLL_REST_RADIUS` — const — line 96
- `BEDROLL_SEPARATION` — const — line 56
- `BedrollPlacementReason` — type — line 74
- `BedrollRecord` — type — line 26
- `findNearestSleepingUtility` — function — line 108
- `PLATFORM_FOOTPRINT_RADIUS` — const — line 60
- `PLATFORM_MATERIAL_REQUIREMENTS` — const — line 70
- `PLATFORM_PLACE_DURATION_SEC` — const — line 63
- `PLATFORM_PLACE_REACH` — const — line 62
- `PLATFORM_PLACEMENT_MESSAGE` — const — line 85
- `PLATFORM_RECOVERY_RATE` — const — line 72
- `PLATFORM_SEPARATION` — const — line 61
- `PlatformPlacementReason` — type — line 75
- `PlatformRecord` — type — line 41
- `resolveSleepingUtilityCondition` — function — line 201
- `resolveWeatherDrivenCondition` — function — line 159
  - domain: items-player
- `SLEEPING_UTILITY_CONDITION_MAX` — const — line 128
- `SLEEPING_UTILITY_RAIN_DECAY_PER_DAY` — const — line 134
- `SLEEPING_UTILITY_SIM_WINDOW_DAYS` — const — line 140
- `SLEEPING_UTILITY_SNOW_DECAY_PER_DAY` — const — line 135
- `SleepingUtilityVariant` — type — line 24
  - domain: items-player
- `WeatherDrivenConditionRates` — type — line 142

## `world/sleepingUtilityProp.ts`

- `BEDROLL_LENGTH` — const — line 11
- `BEDROLL_WIDTH` — const — line 12
- `createBedrollProp` — function — line 15
- `createPlatformProp` — function — line 53
- `disposeSleepingUtilityProp` — function — line 83
- `PLATFORM_FOOTPRINT_LENGTH` — const — line 49
- `PLATFORM_FOOTPRINT_WIDTH` — const — line 48
- `PLATFORM_LENGTH` — const — line 45
- `PLATFORM_VISUAL_SCALE` — const — line 47
- `PLATFORM_WIDTH` — const — line 46

## `world/standingTorch.ts`

- `isStandingTorchConstructionComplete` — function — line 131
- `resolveStandingTorchBurnState` — function — line 107
  - domain: items-player
- `STANDING_TORCH_BURN_DURATION_DAYS` — const — line 98
- `STANDING_TORCH_FOOTPRINT_RADIUS` — const — line 46
- `STANDING_TORCH_MATERIAL_REQUIREMENTS` — const — line 77
- `STANDING_TORCH_PLACE_DURATION_SEC` — const — line 53
- `STANDING_TORCH_PLACE_REACH` — const — line 50
- `STANDING_TORCH_PLACEMENT_MESSAGE` — const — line 60
- `STANDING_TORCH_RECOVERY_RATE` — const — line 83
- `STANDING_TORCH_REQUIRED_WORK` — const — line 89
- `STANDING_TORCH_SEPARATION` — const — line 47
- `STANDING_TORCH_WORK_SESSION_HOURS` — const — line 95
- `STANDING_TORCH_WORK_SESSION_SEC` — const — line 92
- `standingTorchBurnUntilDays` — function — line 118
- `StandingTorchPlacementReason` — type — line 55
- `standingTorchPromptLabel` — function — line 139
- `StandingTorchRecord` — type — line 30
  - domain: items-player
- `standingTorchRemainingWork` — function — line 124

## `world/standingTorchProp.ts`

- `createStandingTorchVisual` — function — line 28
- `preloadStandingTorchTemplate` — function — line 15

## `world/terrainPreparationPreview.ts`

- `createTerrainPreparationPreview` — function — line 42
- `TerrainPreparationPreview` — type — line 15

## `world/terrainPreparationProp.ts`

- `createTerrainPreparationMarker` — function — line 14

## `world/timeConversion.ts`

- `GAME_HOURS_PER_DAY` — const — line 13
- `gameDaysToGameHours` — function — line 19
- `gameDaysToRealSeconds` — function — line 27
- `gameHoursToGameDays` — function — line 15
- `gameHoursToRealSeconds` — function — line 35
- `realSecondsToGameDays` — function — line 23
- `realSecondsToGameHours` — function — line 31

## `world/timeSkip.ts`

- `createTimeSkip` — function — line 67
- `TimeSkip` — type — line 25
- `TimeSkipFadeStrength` — type — line 8
- `TimeSkipTickResult` — type — line 10

## `world/transportOrder.ts`

- `assignTransportOrder` — function — line 100
- `cancelTransportOrder` — function — line 152
- `completeTransportDelivery` — function — line 129
- `completeTransportPickup` — function — line 112
- `createTransportOrderRecord` — function — line 79
- `failTransportOrder` — function — line 145
- `isTransportOrderActive` — function — line 75
- `isTransportOrderTerminal` — function — line 71
- `TransportEndpointRef` — type — line 34
- `TransportOrder` — type — line 44
- `TransportOrderState` — type — line 24
  - domain: settlements-npcs

## `world/transportTransactions.ts`

- `executeTransportPickup` — function — line 48
- `executeTransportUnload` — function — line 92
- `transferInventoryItems` — function — line 19
- `TransportPickupResult` — type — line 36
- `TransportUnloadResult` — type — line 83

## `world/trapProp.ts`

- `createTrapProp` — function — line 56
- `disposeTrapProp` — function — line 132
- `preloadTrapProps` — function — line 41
- `setTrapPropState` — function — line 118

## `world/treasureSites.ts`

- `abandonedTreasureKeyPickups` — function — line 535
- `AbandonedTreasureKeyPlacement` — type — line 64
- `attemptTreasureUnlock` — function — line 560
  - domain: world
- `authoredTreasureReservedIds` — function — line 170
- `BuriedTreasureKeyPlacement` — type — line 52
- `buriedTreasureKeyPlacements` — function — line 529
- `CAVE_TREASURE_ENABLED` — const — line 114
- `completeTreasureSites` — function — line 484
  - domain: world
- `CompleteTreasureSitesInput` — type — line 470
- `KEY_HOST_KINDS` — const — line 101
- `MAX_KEY_DISTANCE` — const — line 98
- `MAX_TREASURE_HOME_DIST` — const — line 96
- `MIN_KEY_DISTANCE` — const — line 97
- `MIN_TREASURE_HOME_DIST` — const — line 95
- `MIN_TREASURE_SITE_SEPARATION` — const — line 94
- `resolveTreasureChestDrafts` — function — line 286
  - domain: world
- `ResolveTreasureChestDraftsInput` — type — line 271
- `resolveTreasureSites` — function — line 515
  - domain: world
- `ResolveTreasureSitesInput` — type — line 502
- `RUINS_CHEST_KINDS` — const — line 108
- `sampleDeepForestTreasureCandidates` — function — line 222
  - domain: world
- `TARGET_TREASURE_SITE_COUNT` — const — line 93
- `TREASURE_KEY_SEARCH_CHUNK_RADIUS` — const — line 100
- `TREASURE_SITE_SEARCH_CHUNK_RADIUS` — const — line 99
- `TreasureArchetype` — type — line 33
- `treasureBuriedSpotId` — function — line 166
- `TreasureChestDraft` — type — line 85
- `treasureChestId` — function — line 154
- `TreasureChestPlacement` — type — line 45
- `treasureKeyInstanceId` — function — line 158
- `treasureKeyPickupId` — function — line 162
- `TreasureKeyPlacement` — type — line 74
- `TreasureLandmarkCandidate` — type — line 35
- `TreasureSiteDefinition` — type — line 76
- `treasureSiteForContainer` — function — line 541
- `treasureSiteId` — function — line 150
- `TreasureSiteId` — type — line 32
  - domain: world
- `TreasureUnlockAttempt` — type — line 548

## `world/treeHarvest.ts`

- `advanceWorldTreeHarvest` — function — line 39
- `CHOP_DURATION_SEC` — const — line 7
- `harvestWorldTree` — function — line 79
- `harvestWorldTreeFully` — function — line 59
- `TreeHarvestResult` — type — line 9

## `world/treeLifecycle.ts`

- `advanceStage` — function — line 416
- `bonusYieldForChopStage` — function — line 217
- `BRANCH_REGENERATION_DAYS` — const — line 172
- `BRANCH_YIELD_BY_SIZE` — const — line 177
- `BranchHarvestResult` — type — line 183
- `canopyGrowthFactor` — function — line 397
- `canReachOld` — function — line 202
- `CHOP_SCALE_MULT` — const — line 136
- `CHOP_YIELDS` — const — line 150
- `clamp01` — function — line 267
- `coastalFactor` — function — line 355
- `createTreeLifecycle` — function — line 558
- `envGrowthFactor` — function — line 365
- `FELLING_BEAM_YIELD` — const — line 167
- `HARVEST_YIELD` — const — line 158
- `HarvestYield` — type — line 145
- `HEIGHT_RANGE_M` — const — line 98
- `isCanopyStage` — function — line 198
- `isChoppableStage` — function — line 194
- `lerp` — function — line 271
- `livingHeightM` — function — line 281
- `makeTreeId` — function — line 547
- `OLD_SPAWN_CHANCE` — const — line 123
- `parseTreeOverrides` — function — line 964
- `PINE_SPECIES_INDICES` — const — line 133
- `quantizeTreeCoord` — function — line 539
- `ResolvedTreeState` — type — line 258
- `rollLivingAge` — function — line 328
- `rollSizeClass` — function — line 317
- `SIZE_CLASS_T` — const — line 106
- `SIZE_CLASS_WEIGHTS` — const — line 113
- `SIZE_JITTER_HALF` — const — line 120
- `sizeT` — function — line 276
- `speciesPrefs` — function — line 343
- `STAGE_DURATION_DAYS` — const — line 88
- `templateHeightM` — function — line 290
- `TREE_SPECIES_PREFS` — const — line 234
- `TREE_TEMPLATE_HEIGHT_M` — const — line 129
- `TreeEnvSample` — type — line 54
- `TreeGrowthStage` — type — line 14
  - domain: world-terrain
  - system: tree-lifecycle
  - role: Owns tree growth stage progression and multi-stage chop state.
  - simulation: tick
  - lifecycle: growth
- `TreeHarvestStepResult` — type — line 459
- `TreeId` — type — line 32
- `TreeLifecycle` — type — line 463
- `TreeLivingAge` — type — line 24
- `TreePresence` — type — line 246
- `TreeSizeClass` — type — line 27
- `TreeSpeciesPrefs` — type — line 74
- `TreeStateOverride` — type — line 36
- `treeVisualKind` — function — line 221
- `TreeVisualKind` — type — line 30
- `visualScaleForTree` — function — line 298
- `yieldForChopStage` — function — line 206

## `world/treeVisuals.ts`

- `applyHarvestedTreeVisual` — function — line 126
- `applyTreeStageVisual` — function — line 100
- `createTreeStageMesh` — function — line 59
- `felledYawFromTreeId` — function — line 20
- `preloadTreeStumpTemplate` — function — line 36
- `readTreeLivingStage` — function — line 88
- `readTreeSizeClass` — function — line 78
- `readTreeSizeJitter` — function — line 84
- `tagTreeMesh` — function — line 131

## `world/waterMaterial.ts`

- `createWaterMaterial` — function — line 235
- `DAY_LAKE_DEEP` — const — line 15
- `DAY_LAKE_FOAM` — const — line 17
- `DAY_LAKE_SHALLOW` — const — line 16
- `DAY_OCEAN_DEEP` — const — line 22
- `DAY_OCEAN_FOAM` — const — line 24
- `DAY_OCEAN_SHALLOW` — const — line 23
- `NIGHT_LAKE_DEEP` — const — line 18
- `NIGHT_LAKE_FOAM` — const — line 20
- `NIGHT_LAKE_SHALLOW` — const — line 19
- `NIGHT_OCEAN_DEEP` — const — line 25
- `NIGHT_OCEAN_FOAM` — const — line 27
- `NIGHT_OCEAN_SHALLOW` — const — line 26
- `setWaterDayNight` — function — line 281
- `tickWaterTime` — function — line 277
- `WaterMaterialOptions` — type — line 35

## `world/waterMirror.ts`

- `AGENT_RENDER_LAYER` — const — line 24
- `assignRenderLayer` — function — line 83
- `bindWaterMirror` — function — line 260
- `createWaterMirror` — function — line 126
- `MirrorCadenceState` — type — line 66
- `REFLECTION_DISTANT_LAYER` — const — line 43
- `REFLECTION_SKIPPED_LAYER` — const — line 35
- `setSubtreeCastShadow` — function — line 89
- `shouldRenderMirror` — function — line 77
- `WATER_MIRROR_SIZE` — const — line 46
- `WATER_RENDER_LAYER` — const — line 19
- `WaterMirror` — type — line 102
- `WaterMirrorUniforms` — type — line 96

## `world/WaterSource.ts`

- `createWaterSource` — function — line 96
- `DRINK_THIRST_RELIEF` — const — line 75
- `UNCOVERED_WELL_CONSUMPTION_RISK` — const — line 59
- `UNCOVERED_WELL_WARNING` — const — line 67
- `UNDRINKABLE_WATER_WARNING` — const — line 86
- `UNSAFE_WATER_WARNING` — const — line 81
- `WaterBodyKind` — type — line 25
- `WaterConsumptionRisk` — type — line 39
- `WaterQuality` — type — line 18
  - domain: world
  - system: water-source
  - role: Shared well/lake/river/ocean drink/fill abstraction; future polluted/treated sources should reuse it.
- `WaterSource` — type — line 47
- `WELL_ROPE_REQUIRED_WARNING` — const — line 70

## `world/weather.ts`

- `ClimateState` — type — line 279
- `computeClimate` — function — line 265
- `computeRainExposureDays` — function — line 221
- `computeSnowExposureDays` — function — line 240
- `computeSurfaceWeather` — function — line 167
- `computeWeather` — function — line 117
- `createClimateState` — function — line 292
- `DAYS_PER_SEASON` — const — line 31
- `DAYS_PER_YEAR` — const — line 32
- `getSeason` — function — line 34
- `getSeasonProgress` — function — line 40
- `Season` — type — line 8
- `SEASON_LABELS` — const — line 14
- `SNOW_ACCUMULATE_WINDOW_DAYS` — const — line 141
- `SNOW_MELT_WINDOW_DAYS` — const — line 144
- `SurfaceWeatherState` — type — line 152
- `temperatureFor` — function — line 70
- `tickClimate` — function — line 296
- `WEATHER_CYCLE_DAYS` — const — line 78
- `WEATHER_LABELS` — const — line 21
- `WeatherState` — type — line 102
- `WeatherType` — type — line 9
- `WETNESS_DRY_WINDOW_DAYS` — const — line 137
- `WorldClimateState` — type — line 256

## `world/weatherParticles.ts`

- `createWeatherParticles` — function — line 221
- `WeatherParticles` — type — line 207
- `WeatherParticlesOptions` — type — line 200

## `world/weatherVisuals.ts`

- `applyWeatherOverlay` — function — line 39
- `WeatherVisualOverlay` — type — line 11

## `world/wellGroundwater.ts`

- `DEEP_WELL_DEPTH_THRESHOLD` — const — line 52
- `isDeepWellDepth` — function — line 54
- `resolveWellWater` — function — line 91
- `WELL_WATER_DEPTH_MAX` — const — line 31
- `WELL_WATER_DEPTH_MIN` — const — line 30
- `WellWaterKind` — type — line 18
  - domain: world
  - system: well-groundwater
  - role: Pure placement-time depth/water-kind resolution for player-built wells.
- `WellWaterResult` — type — line 20

## `world/workContract.ts`

- `acceptWorkContract` — function — line 512
- `activeWorkAssignmentCount` — function — line 299
- `assignmentRewardCoinsDue` — function — line 262
- `beginContractTravel` — function — line 546
- `beginContractWork` — function — line 554
- `canAcceptContract` — function — line 505
- `cancelWorkContract` — function — line 469
- `canPostContract` — function — line 326
- `completeContractWork` — function — line 577
- `ConstructionContractTarget` — type — line 91
- `contractHasActiveTarget` — function — line 318
- `contractRewardRate` — function — line 670
- `ContractTarget` — type — line 129
- `createWorkContractRecord` — function — line 365
- `DEFAULT_PAYMENT_PATIENCE_DAYS` — const — line 62
- `expectedCandidateWork` — function — line 679
- `expireWorkAssignmentPayment` — function — line 624
- `findAssignment` — function — line 312
- `frozenAssignmentClaimSum` — function — line 248
- `groupRemainingWork` — function — line 308
- `hasUnresolvedPaymentClaims` — function — line 274
- `invalidateWorkContract` — function — line 486
- `isAssignmentClaimTerminal` — function — line 242
- `isAssignmentPayable` — function — line 238
- `isAssignmentWorkActive` — function — line 227
- `isContractDiscoverable` — function — line 336
- `isContractTerminal` — function — line 221
- `isNpcCommitmentFulfilled` — function — line 664
- `isPaymentRequestEligible` — function — line 286
- `markWorkAssignmentPaid` — function — line 615
- `markWorkAssignmentUncollectable` — function — line 638
- `normalizeRequestedWorkerCount` — function — line 360
- `noticeBoardId` — function — line 348
- `PalisadeContractTarget` — type — line 109
- `PAYMENT_REQUEST_INTERVAL_DAYS` — const — line 59
- `postWorkContract` — function — line 407
- `recordNpcWorkContribution` — function — line 692
- `recordWorkAssignmentPaymentRequest` — function — line 649
- `refreshContractSettlement` — function — line 280
- `releaseWorkContract` — function — line 594
- `ResidentialBuildingContractTarget` — type — line 122
- `sameContractTarget` — function — line 714
- `StandingTorchContractTarget` — type — line 116
- `TerrainPreparationContractTarget` — type — line 100
- `WORK_SHARE_PRESETS` — const — line 354
- `WorkContractAdvertisement` — type — line 79
- `WorkContractAssignment` — type — line 140
- `WorkContractAssignmentState` — type — line 35
- `WorkContractClaimTiming` — type — line 53
- `workContractPaymentPatienceDays` — function — line 68
- `WorkContractRecord` — type — line 160
- `WorkContractRelationLevel` — type — line 65
- `WorkContractReleaseReason` — type — line 48
- `WorkContractState` — type — line 21
  - domain: npc
- `WORKER_COUNT_PRESETS` — const — line 358
- `WorkType` — type — line 83

## `world/worldContext.ts`

- `createWorldContext` — function — line 39
- `WorldContext` — type — line 17

## `world/worldGeneratedContainers.ts`

- `createWorldGeneratedContainers` — function — line 86
  - domain: world
- `SaveWorldGeneratedContainer` — type — line 10
- `WorldGeneratedContainerEntry` — type — line 20
- `WorldGeneratedContainers` — type — line 30
- `WorldGeneratedContainerSpec` — type — line 65
