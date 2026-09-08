# Symbols

Generated from exported TypeScript symbols.

## `shared/agentAnimationSet.ts`

- `AgentAnimationSet` — type — line 17
- `createAgentAnimationSet` — function — line 55

## `shared/bootMark.ts`

- `useBootMark` — const — line 11

## `shared/corpseLifecycle.ts`

- `CorpseDecayPhase` — type — line 8
- `decayPhaseFromElapsed` — function — line 12

## `shared/enduranceStamina.ts`

- `applyDerivedStaminaMax` — function — line 28
- `resolveEnduranceStaminaRecoveryMultiplier` — function — line 22
- `resolveMaxStaminaFromEndurance` — function — line 14
  - domain: shared
  - system: physical-attributes
  - role: Shared Endurance → Stamina capability resolvers (plan npc-021). Pure mapping from effective Endurance to max Stamina and recovery multiplier — consumer-agnostic; activity drain rates stay owned by each consumer. `StaminaState` remains the mutable `{ max, current }` pool.
  - uses: PhysicalAttributes

## `shared/fireParticles.type.ts`

- `BurstPool` — type — line 29
- `FireVisualOptions` — type — line 54
- `ParticlePool` — type — line 16
- `PoolParticle` — type — line 3
- `PoolTuning` — type — line 31

## `shared/getFireParticles.ts`

- `createEmberParticles` — function — line 356
- `createFireSparks` — function — line 346
- `createFireVisual` — function — line 438
- `createFlameParticles` — function — line 330
- `createIgniteBurst` — function — line 378
- `FIRE_SIZE_CLAMP` — const — line 414
- `fireFlicker` — function — line 404
- `FireVisual` — type — line 416
- `ParticleLayerOptions` — type — line 324

## `shared/HealthState.ts`

- `createHealthState` — function — line 13
- `damageHealth` — function — line 19
- `healHealth` — function — line 28
- `HealthState` — type — line 7
  - domain: shared
  - system: health
  - role: Shared health/damage/death state used by the player, NPCs and fauna.
  - owns: HealthState
- `isAlive` — function — line 33

## `shared/HungerState.ts`

- `createHungerState` — function — line 16
- `drainHunger` — function — line 20
- `getHungerRatio` — function — line 34
- `HUNGER_STARVING_THRESHOLD` — const — line 14
- `HungerState` — type — line 4
- `isStarving` — function — line 30
- `restoreHunger` — function — line 25

## `shared/PhysicalAttributes.ts`

- `PhysicalAttributes` — type — line 22
  - domain: shared
  - system: physical-attributes
  - role: Shared SPEA (Strength/Perception/Endurance/Agility) physical-attribute primitive used by the player and NPCs (plan npc-019), later fauna. Stable individual base attributes only — profile data, not a mutable resource pool like `HealthState`/`StaminaState`. Must not know about combat, work, movement, species, UI, age, sex, injuries, illness or temporary conditions; those live in per-consumer profile/effective resolvers (see `settlement/npcPhysicalProfile.ts`'s `resolveHumanStrengthProfile`/ `resolveHumanAgilityProfile`/`resolveHumanEnduranceProfile` and `combat/meleeStrength.ts`/`combat/meleeAgility.ts`, plus `player/physicalWorkStrength.ts`, `player/humanCarryCapacity.ts` and `shared/enduranceStamina.ts`.
  - owns: PhysicalAttributes

## `shared/SettlementName.ts`

- `generateSettlementName` — function — line 77
- `SettlementTerrain` — type — line 8

## `shared/StaminaState.ts`

- `createStaminaState` — function — line 12
- `drainStamina` — function — line 16
- `getStaminaRatio` — function — line 30
- `isExhausted` — function — line 26
- `restoreStamina` — function — line 21
- `StaminaState` — type — line 7
  - domain: shared
  - system: stamina
  - role: Shared physical-effort capacity used by the player, NPCs and fauna.
  - owns: StaminaState

## `shared/ThirstState.ts`

- `createThirstState` — function — line 15
- `drainThirst` — function — line 19
- `getThirstRatio` — function — line 33
- `isDehydrated` — function — line 29
- `restoreThirst` — function — line 24
- `THIRST_DEHYDRATED_THRESHOLD` — const — line 13
- `ThirstState` — type — line 3

## `shared/torchConfig.ts`

- `TORCH_DEFAULT_FIRE_VISUAL` — const — line 3

## `shared/VigorState.ts`

- `createVigorState` — function — line 15
- `drainVigor` — function — line 19
- `getVigorRatio` — function — line 33
- `isCollapsed` — function — line 29
- `restoreVigor` — function — line 24
- `VIGOR_COLLAPSE_THRESHOLD` — const — line 13
- `VigorState` — type — line 7
  - domain: shared
  - system: vigor
  - role: NPC daily physiological budget; collapse gates sleep through the NPC FSM. Not used by fauna.
  - owns: VigorState
