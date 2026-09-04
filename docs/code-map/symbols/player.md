# Symbols

Generated from exported TypeScript symbols.

## `player/cameraBoom.ts`

- `CAMERA_BOOM_MIN_DISTANCE` — const — line 17
- `CAMERA_BOOM_PULL_IN` — const — line 20
- `CAMERA_GROUND_CLEARANCE` — const — line 4
- `CAMERA_OCCLUDER_HEIGHT` — const — line 13
- `CAMERA_OCCLUDER_MIN_RADIUS` — const — line 10
- `CAMERA_TERRAIN_SKIP_DISTANCE` — const — line 23
- `CameraBoomInput` — type — line 27
- `CameraBoomResult` — type — line 38
- `resolveCameraBoom` — function — line 52

## `player/playerCombat.ts`

- `collectLivingCombatTargets` — function — line 56
- `collectRangedAnimalCandidates` — function — line 138
- `COMBAT_MODE_TIMEOUT_SEC` — const — line 11
- `createPlayerCombat` — function — line 213
- `filterWorldCycleTargets` — function — line 182
- `findLivingTargetById` — function — line 186
- `LivingCombatTarget` — type — line 13
- `livingTargetIdForAnimal` — function — line 42
- `livingTargetIdForNpc` — function — line 46
- `PlayerCombat` — type — line 21
- `RangedAnimalCandidate` — type — line 130
- `resolveLivingInteractable` — function — line 197
- `resolveRangedAimYaw` — function — line 169

## `player/PlayerController.ts`

- `CaveGroundQuery` — type — line 162
- `ColliderSource` — type — line 154
- `HeightSampler` — type — line 151
- `MOVE_SPEED` — const — line 44
- `PLAYER_HEIGHT` — const — line 56
- `PLAYER_MODEL_URL` — const — line 149
- `PlayerController` — class — line 170
  - domain: items-player
  - system: player-controller
  - role: Owns player movement, animation and runtime transform state.
  - simulation: tick
- `PlayerMovementState` — type — line 39
- `SPRINT_MULTIPLIER` — const — line 48

## `player/playerDamage.ts`

- `applyDownedRecovery` — function — line 31
- `applyPlayerDamage` — function — line 58
- `ApplyPlayerDamageParams` — type — line 43
- `DOWNED_DURATION_SEC` — const — line 21
- `DOWNED_RECOVERY_HP_MAX` — const — line 23
- `DOWNED_RECOVERY_HP_MIN` — const — line 22
- `PlayerDamageResult` — type — line 37
- `rollDownedRecoveryHp` — function — line 25
- `tickPlayerStarvationDamage` — function — line 127

## `player/playerEncumbrance.ts`

- `computeEncumbrance` — function — line 32
- `Encumbrance` — type — line 8

## `player/playerMelee.ts`

- `AttackRequestResult` — type — line 49
- `COMBAT_TARGET_MEMORY` — const — line 27
- `createPlayerMelee` — function — line 94
- `FALLBACK_APPROACH_DISTANCE` — const — line 37
- `LUNGE_STAMINA_COST` — const — line 34
- `MAX_LUNGE_DISTANCE` — const — line 31
- `meleeSwingAngle` — function — line 230
- `MeleeTickResult` — type — line 22
- `pickCombatTarget` — function — line 148
- `PlayerMelee` — type — line 58
- `rankCombatTargets` — function — line 186

## `player/PlayerNeeds.ts`

- `applyRepresentedPhysicalEffortVigor` — function — line 147
- `BUSY_ACTION_STAMINA_COST_PER_SEC` — const — line 81
- `createPlayerNeeds` — function — line 208
- `DEHYDRATION_HP_PER_SEC` — const — line 181
- `drinkWater` — function — line 352
- `eatFood` — function — line 348
- `hungerSevereDurationSec` — function — line 167
- `isTakingDeprivationDamage` — function — line 360
- `physicalEffortBusyOptions` — function — line 131
- `PhysicalEffortIntensity` — type — line 89
- `physicalEffortStaminaCostPerSec` — function — line 117
- `physicalEffortVigorCostPerSec` — function — line 124
- `PLAYER_MAX_HUNGER` — const — line 41
- `PLAYER_MAX_STAMINA` — const — line 39
- `PLAYER_MAX_THIRST` — const — line 42
- `PLAYER_MAX_VIGOR` — const — line 40
- `PlayerNeeds` — type — line 30
  - domain: items-player
  - system: player-needs
  - role: Owns the player's stamina/vigor/hunger/thirst survival pools.
  - owns: PlayerNeeds
  - uses: StaminaState, VigorState
  - simulation: tick
- `resetPlayerNeeds` — function — line 220
- `restoreNeedsFromSleep` — function — line 342
- `restorePersistedNeeds` — function — line 241
- `STARVATION_HP_PER_SEC` — const — line 180
- `thirstSevereDurationSec` — function — line 170
- `tickHealthRegen` — function — line 369
- `tickPlayerMovementVigor` — function — line 320
- `tickPlayerNeeds` — function — line 266
- `tickPlayerStamina` — function — line 293
- `tickRidingStamina` — function — line 311

## `player/playerRanged.ts`

- `createPlayerRanged` — function — line 44
- `PlayerRanged` — type — line 21
- `RangedTickResult` — type — line 19

## `player/PlayerSkills.ts`

- `accumulateRidingUse` — function — line 218
- `accumulateSneakUse` — function — line 196
- `applySneakSpeedModifier` — function — line 237
- `awardSkillXp` — function — line 99
- `createPlayerSkills` — function — line 83
- `PlayerSkills` — type — line 38
- `RaiseSkillResult` — type — line 106
- `raiseSkillToValue` — function — line 118
- `restorePersistedSkills` — function — line 146
- `RIDING_XP_DISTANCE_M` — const — line 212
- `ridingSpeedMultiplier` — function — line 278
- `ridingStaminaDrainMultiplier` — function — line 292
- `setSkillValueForDebug` — function — line 136
- `SKILL_LABEL` — const — line 19
- `SKILL_MIN_VALUE` — const — line 44
- `SKILL_XP_AWARD` — const — line 165
- `SKILL_XP_HALF_VALUE` — const — line 49
- `SkillId` — type — line 13
  - domain: items-player
  - system: player-skills
  - role: Owns the player's skill XP curve and the single award path.
  - owns: PlayerSkills
- `SkillState` — type — line 28
- `SNEAK_LEGACY_VALUE` — const — line 76
- `SNEAK_LEGACY_XP` — const — line 77
- `SNEAK_SPEED_MULTIPLIER` — const — line 235
- `SNEAK_XP_DISTANCE_M` — const — line 188
- `survivalDurationMultiplier` — function — line 251
- `survivalFoodMultiplier` — function — line 301
- `toggleSneak` — function — line 159
- `xpForSkillValue` — function — line 66
- `xpToSkillValue` — function — line 53

## `player/PlayerTorch.ts`

- `createPlayerTorch` — function — line 112
- `PlayerTorch` — type — line 27
- `TORCH_FUEL_BRANCH` — const — line 21
- `TORCH_FUEL_WOODEN` — const — line 23
- `TorchSource` — type — line 25

## `player/ridingStability.ts`

- `fallDamage` — function — line 65
- `fallRiskPerSecond` — function — line 38
- `rollFall` — function — line 55
- `StabilityInput` — type — line 11

## `player/torchLightPresets.ts`

- `BRANCH_HELD_MAX` — const — line 13
- `BRANCH_URL` — const — line 12
- `TORCH_FLAME_OFFSET_WOODEN` — const — line 10
- `TORCH_LIGHT_BRANCH` — const — line 1
- `TORCH_LIGHT_DECAY` — const — line 3
- `TORCH_LIGHT_WOODEN` — const — line 2
- `TORCH_TIP_OFFSET_BRANCH` — const — line 5
- `TORCH_TIP_OFFSET_WOODEN` — const — line 6

## `player/verticalMotion.ts`

- `GRAVITY` — const — line 3
- `integrateVerticalMotion` — function — line 44
- `JUMP_HEIGHT` — const — line 5
- `JUMP_SPEED` — const — line 6
- `LAND_MIN_SPEED` — const — line 12
- `STEP_DOWN_MAX` — const — line 9
- `VerticalMotionInput` — type — line 14
- `VerticalMotionResult` — type — line 27
