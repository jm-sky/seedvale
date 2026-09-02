# Symbols

Generated from exported TypeScript symbols.

## `shared/bootMark.ts`

- `useBootMark` — const — line 11

## `shared/getFireParticles.ts`

- `BurstPool` — type — line 40
- `createEmbers` — function — line 236
- `createIgniteBurst` — function — line 278
- `createSparks` — function — line 216
- `createTorchSparks` — function — line 257
- `ParticlePool` — type — line 30

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
