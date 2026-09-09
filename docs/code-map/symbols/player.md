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
- `CameraBoomResult` — type — line 43
- `resolveCameraBoom` — function — line 58
- `withCaveFloorFallback` — function — line 302

## `player/humanCarryCapacity.ts`

- `HUMAN_CARRY_NEUTRAL_KG` — const — line 30
- `HUMAN_CARRY_STRENGTH_NEUTRAL` — const — line 26
  - domain: items-player
  - system: human-carry-capacity
  - role: Maps resolved human Strength onto body carry capacity in kilograms.
- `humanBodyCarryCapacityKg` — function — line 32

## `player/physicalWorkStrength.ts`

- `PHYSICAL_WORK_STRENGTH_NEUTRAL` — const — line 27
  - domain: items-player
  - system: physical-work-strength
  - role: Maps resolved Strength onto existing physical-work duration.
- `physicalWorkDuration` — function — line 35
- `physicalWorkSpeedMultiplier` — function — line 29

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

- `CaveGroundQuery` — type — line 193
- `CaveOccupancyQuery` — type — line 198
- `ColliderSource` — type — line 186
- `HeightSampler` — type — line 183
- `MOVE_SPEED` — const — line 57
- `PLAYER_COLLISION_RADIUS` — const — line 60
- `PLAYER_HEIGHT` — const — line 69
- `PLAYER_MODEL_URL` — const — line 181
- `PLAYER_STARTING_ATTRIBUTES` — const — line 85
- `PlayerController` — class — line 210
  - domain: items-player
  - system: player-controller
  - role: Owns player movement, animation and runtime transform state.
  - simulation: tick
- `PlayerMovementState` — type — line 52
- `rockCeilingMaxY` — function — line 74
- `SPRINT_MULTIPLIER` — const — line 61

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

- `AttackRequestResult` — type — line 50
- `COMBAT_TARGET_MEMORY` — const — line 28
- `createPlayerMelee` — function — line 100
- `FALLBACK_APPROACH_DISTANCE` — const — line 38
- `LUNGE_STAMINA_COST` — const — line 35
- `MAX_LUNGE_DISTANCE` — const — line 32
- `meleeSwingAngle` — function — line 236
- `MeleeTickResult` — type — line 23
- `pickCombatTarget` — function — line 154
- `PlayerMelee` — type — line 59
- `rankCombatTargets` — function — line 192

## `player/PlayerNeeds.ts`

- `applyRepresentedPhysicalEffortVigor` — function — line 151
- `BUSY_ACTION_STAMINA_COST_PER_SEC` — const — line 85
- `createPlayerNeeds` — function — line 212
- `DEHYDRATION_HP_PER_SEC` — const — line 185
- `drinkWater` — function — line 378
- `eatFood` — function — line 374
- `hungerSevereDurationSec` — function — line 171
- `isTakingDeprivationDamage` — function — line 386
- `physicalEffortBusyOptions` — function — line 135
- `PhysicalEffortIntensity` — type — line 93
- `physicalEffortStaminaCostPerSec` — function — line 121
- `physicalEffortVigorCostPerSec` — function — line 128
- `PLAYER_MAX_HUNGER` — const — line 45
- `PLAYER_MAX_STAMINA` — const — line 43
- `PLAYER_MAX_THIRST` — const — line 46
- `PLAYER_MAX_VIGOR` — const — line 44
- `PlayerNeeds` — type — line 34
  - domain: items-player
  - system: player-needs
  - role: Owns the player's stamina/vigor/hunger/thirst survival pools.
  - owns: PlayerNeeds
  - uses: StaminaState, VigorState
  - simulation: tick
- `resetPlayerNeeds` — function — line 224
- `restoreNeedsFromSleep` — function — line 368
- `restorePersistedNeeds` — function — line 245
- `STARVATION_HP_PER_SEC` — const — line 184
- `thirstSevereDurationSec` — function — line 174
- `tickHealthRegen` — function — line 395
- `tickPlayerMovementVigor` — function — line 346
- `tickPlayerNeeds` — function — line 270
- `tickPlayerStamina` — function — line 297
- `tickRidingStamina` — function — line 326

## `player/playerRanged.ts`

- `createPlayerRanged` — function — line 44
- `PlayerRanged` — type — line 21
- `RangedTickResult` — type — line 19

## `player/PlayerSkills.ts`

- `accumulateRidingUse` — function — line 254
- `accumulateSneakUse` — function — line 232
- `applySneakSpeedModifier` — function — line 273
- `awardSkillXp` — function — line 135
- `createPlayerSkills` — function — line 117
- `isTargetedSkill` — function — line 42
- `PlayerSkills` — type — line 72
- `RaiseSkillResult` — type — line 142
- `raiseSkillToValue` — function — line 154
- `restorePersistedSkills` — function — line 182
- `RIDING_XP_DISTANCE_M` — const — line 248
- `ridingSpeedMultiplier` — function — line 314
- `ridingStaminaDrainMultiplier` — function — line 328
- `setSkillValueForDebug` — function — line 172
- `SKILL_LABEL` — const — line 50
- `SKILL_MIN_VALUE` — const — line 78
- `SKILL_USE` — const — line 31
- `SKILL_XP_AWARD` — const — line 201
- `SKILL_XP_HALF_VALUE` — const — line 83
- `SkillId` — type — line 14
  - domain: items-player
  - system: player-skills
  - role: Owns the player's skill XP curve and the single award path.
  - owns: PlayerSkills
- `SkillState` — type — line 61
- `SkillUseKind` — type — line 29
- `SNEAK_LEGACY_VALUE` — const — line 110
- `SNEAK_LEGACY_XP` — const — line 111
- `SNEAK_SPEED_MULTIPLIER` — const — line 271
- `SNEAK_XP_DISTANCE_M` — const — line 224
- `survivalDurationMultiplier` — function — line 287
- `survivalFoodMultiplier` — function — line 337
- `toggleSneak` — function — line 195
- `xpForSkillValue` — function — line 100
- `xpToSkillValue` — function — line 87

## `player/PlayerTorch.ts`

- `createPlayerTorch` — function — line 118
- `PlayerTorch` — type — line 28
- `TORCH_FUEL_BRANCH` — const — line 22
- `TORCH_FUEL_WOODEN` — const — line 24
- `TorchSource` — type — line 26

## `player/ridingStability.ts`

- `fallDamage` — function — line 65
- `fallRiskPerSecond` — function — line 38
- `rollFall` — function — line 55
- `StabilityInput` — type — line 11

## `player/skillEvaluation.ts`

- `EvaluatedSkillInput` — type — line 15
- `evaluateSkillCompetence` — function — line 40
- `SkillCompetence` — type — line 30
  - domain: items-player
  - system: player-skills
- `SkillSupportInput` — type — line 11
  - domain: items-player
  - system: player-skills

## `player/targetedSkillSelection.ts`

- `createTargetedSkillSelection` — function — line 20
- `TargetedSkillSelection` — type — line 10
  - domain: items-player
  - system: player-skills

## `player/torchLightPresets.ts`

- `BRANCH_HELD_MAX` — const — line 38
- `BRANCH_URL` — const — line 37
- `resolveTorchLight` — function — line 17
- `TORCH_CAVE_DISTANCE_MULTIPLIER` — const — line 10
- `TORCH_CAVE_INTENSITY_MULTIPLIER` — const — line 9
- `TORCH_FLAME_OFFSET_WOODEN` — const — line 35
- `TORCH_LIGHT_BRANCH` — const — line 1
- `TORCH_LIGHT_DECAY` — const — line 3
- `TORCH_LIGHT_WOODEN` — const — line 2
- `TORCH_TIP_OFFSET_BRANCH` — const — line 30
- `TORCH_TIP_OFFSET_WOODEN` — const — line 31

## `player/verticalMotion.ts`

- `GRAVITY` — const — line 3
- `integrateVerticalMotion` — function — line 44
- `JUMP_HEIGHT` — const — line 5
- `JUMP_SPEED` — const — line 6
- `LAND_MIN_SPEED` — const — line 12
- `STEP_DOWN_MAX` — const — line 9
- `VerticalMotionInput` — type — line 14
- `VerticalMotionResult` — type — line 27
