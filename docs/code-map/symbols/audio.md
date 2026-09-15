# Symbols

Generated from exported TypeScript symbols.

## `audio/actionSounds.ts`

- `ACTION_BOW_DRAW_SOUND_URL` — const — line 27
- `ACTION_BOW_RELEASE_SOUND_URL` — const — line 28
- `ACTION_BRANCH_BREAK_SOUND_URL` — const — line 18
- `ACTION_CHOP_SOUND_URLS` — const — line 14
- `ACTION_COOK_SOUND_URL` — const — line 26
- `ACTION_DIG_SOUND_URLS` — const — line 7
- `ACTION_DRINK_SOUND_URL` — const — line 25
- `ACTION_FISHING_CAST_SOUND_URL` — const — line 21
- `ACTION_GRINDSTONE_SHARPEN_SOUND_URL` — const — line 30
- `ACTION_MELEE_HIT_SOUND_URL` — const — line 22
- `ACTION_MELEE_KILL_SOUND_URL` — const — line 23
- `ACTION_TREE_FALL_SOUND_URL` — const — line 19
- `ACTION_WELL_CONSTRUCTION_SOUND_URL` — const — line 20
- `ACTION_WELL_SOUND_URL` — const — line 24
- `ACTION_WHETSTONE_SHARPEN_SOUND_URL` — const — line 29
- `playActionBowDraw` — function — line 129
- `playActionBowRelease` — function — line 134
- `playActionBranchBreak` — function — line 66
- `playActionChop` — function — line 59
- `playActionCook` — function — line 112
- `playActionDig` — function — line 52
- `playActionDrink` — function — line 107
- `playActionFishingCast` — function — line 81
- `playActionGrindstoneSharpen` — function — line 122
- `playActionMeleeHit` — function — line 92
- `playActionMeleeKill` — function — line 97
- `playActionMine` — function — line 86
- `playActionTreeFall` — function — line 71
- `playActionWell` — function — line 102
- `playActionWellConstruction` — function — line 76
- `playActionWhetstoneSharpen` — function — line 117
- `playAnimalCombatDeath` — function — line 162
- `playCombatBowDraw` — function — line 141
- `playCombatHit` — function — line 148
- `playNpcCombatDeath` — function — line 155

## `audio/ambientEvents.ts`

- `AmbientEventContext` — type — line 17
  - domain: world
  - system: ambient-audio
  - role: Shared runtime for sporadic ambient one-shots (owl hoot; future distant wolf howl, single bird calls, etc. — plan world-016). A definition is data plus a pure eligibility predicate; this module owns cooldown/recheck/chance/variant-selection/placement/playback so adding another event needs a definition, not a new dedicated timer in `createAmbientAudio.ts`.
- `AmbientEventDefinition` — type — line 27
- `AmbientEventRuntime` — type — line 44
- `createAmbientEventRuntime` — function — line 54

## `audio/ambientWeights.ts`

- `AmbientSamplers` — type — line 11
- `AmbientWeights` — type — line 5
- `ambientWeightsAt` — function — line 35

## `audio/animalSounds.ts`

- `ANIMAL_AGGRO_SOUND_URLS` — const — line 107
- `ANIMAL_DEATH_GENERIC_SOUND_URLS` — const — line 46
- `ANIMAL_DEATH_GROUP_BY_KIND` — const — line 23
- `ANIMAL_DEATH_GROUP_SOUND_URLS` — const — line 43
- `ANIMAL_DEATH_SOUND_URLS` — const — line 12
- `ANIMAL_SOUND_URLS` — const — line 67
- `AnimalDeathGroup` — type — line 14
- `initialSpontaneousVocalizeCooldownSec` — function — line 237
- `playAnimalAggroSound` — function — line 117
- `playAnimalSound` — function — line 91
- `playSpontaneousAnimalSound` — function — line 316
- `resolveAnimalDeathSoundUrl` — function — line 60
- `roosterCrowWeight` — function — line 203
- `spontaneousVocalizeTimeWeight` — function — line 222
- `tickSpontaneousVocalizeCooldown` — function — line 251
- `wolfHowlWeight` — function — line 181

## `audio/audioSettings.ts`

- `AUDIO_STORAGE_KEY` — const — line 3
- `AUDIO_VOLUME_KEYS` — const — line 5
- `AudioVolumeKey` — type — line 6
- `AudioVolumes` — type — line 8
- `DEFAULT_AUDIO_VOLUMES` — const — line 10
- `loadAudioVolumes` — function — line 31
- `normalizeAudioVolumes` — function — line 22
- `saveAudioVolumes` — function — line 41

## `audio/createAmbientAudio.ts`

- `AmbientAudio` — type — line 155
- `caveAmbientMix` — function — line 141
- `createAmbientAudio` — function — line 177
- `cricketsTimeFactor` — function — line 50
- `weatherAmbientFactor` — function — line 76
- `WeatherAmbientFactor` — type — line 67

## `audio/createWorldAudio.ts`

- `ActiveSound` — type — line 32
- `AudioBusId` — type — line 7
- `AudioLoopHandle` — type — line 9
- `createWorldAudio` — function — line 109
- `DISTANCE_GAIN_EPS` — const — line 71
- `DISTANCE_MAX` — const — line 69
- `DISTANCE_REF` — const — line 67
- `distanceGain` — function — line 96
- `PlayAt` — type — line 23
- `PlayAtCancelable` — type — line 37
- `WorldAudio` — type — line 45
- `WorldSoundPosition` — type — line 17

## `audio/doorSounds.ts`

- `createHouseDoorTracker` — function — line 59
- `DOOR_CLOSE_SOUND_URL` — const — line 6
- `DOOR_CREAK_SOUND_URLS` — const — line 8
- `DOOR_LATCH_SOUND_URL` — const — line 7
- `DOOR_OPEN_SOUND_URL` — const — line 5
- `HOUSE_DOOR_EXIT_SLOP` — const — line 15
- `houseContaining` — function — line 29
- `HouseDoorTarget` — type — line 17
- `playDoorClose` — function — line 53
- `playDoorOpen` — function — line 48

## `audio/fireSounds.ts`

- `ACTION_FIRE_EXTINGUISH_SOUND_URL` — const — line 7
- `ACTION_FIRE_IGNITE_SOUND_URL` — const — line 6
- `AMBIENT_FIRE_LOOP_URL` — const — line 8
- `createFireAudio` — function — line 29
- `FireAudio` — type — line 22
- `playActionFireExtinguish` — function — line 18
- `playActionFireIgnite` — function — line 14

## `audio/frogAmbience.ts`

- `frogsTimeFactor` — function — line 22

## `audio/inventorySounds.ts`

- `INVENTORY_DROP_SOUND_URL` — const — line 10
- `INVENTORY_PICK_UP_SOUND_URLS` — const — line 3
- `playInventoryDrop` — function — line 23
- `playInventoryPickUp` — function — line 17

## `audio/nightPhase.ts`

- `nightPhase` — function — line 19

## `audio/playerMoveSounds.ts`

- `applyFootstepPackFromUrl` — function — line 70
- `FOOTSTEP_PACK_IDS` — const — line 6
- `FootstepPackId` — type — line 7
- `footstepUrlsFor` — function — line 79
- `getFootstepPack` — function — line 57
- `getLastFootstepSurface` — function — line 65
- `JUMP_CLOTH_SOUND_URL` — const — line 84
- `playFootstep` — function — line 110
- `playJumpLand` — function — line 122
- `playJumpTakeoff` — function — line 117
- `playWaterLap` — function — line 132
- `setFootstepPack` — function — line 61
- `WATER_LAP_SOUND_URL` — const — line 86

## `audio/uiSounds.ts`

- `playUiClick` — function — line 11
- `playUiOpen` — function — line 15
- `UI_CLICK_SOUND_URL` — const — line 4

## `audio/weatherSounds.ts`

- `AMBIENT_RAIN_LOOP_URL` — const — line 9
- `AMBIENT_STORM_WIND_LOOP_URL` — const — line 10
- `createWeatherAudio` — function — line 83
- `rainGainFor` — function — line 45
- `stormWindGain` — function — line 54
- `THUNDER_MID_DISTANCE_M` — const — line 24
- `THUNDER_SOUND_URLS` — const — line 13
- `THUNDER_VERY_CLOSE_DISTANCE_M` — const — line 22
- `ThunderClip` — type — line 19
- `thunderClipFor` — function — line 64
  - domain: audio
- `thunderSoundUrl` — function — line 70
- `thunderVolume` — function — line 74
- `WeatherAudio` — type — line 36
