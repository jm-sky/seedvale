# Symbols

Generated from exported TypeScript symbols.

## `simulation/actionControl.ts`

- `abortActionLifecycle` — function — line 27
- `adoptPlannedAction` — function — line 35
- `finishActionLifecycle` — function — line 22
- `replaceActionLifecycle` — function — line 16

## `simulation/actionLifecycle.ts`

- `cancelActionLifecycle` — function — line 47
- `completeActionLifecycle` — function — line 33
- `createActionLifecycle` — function — line 9
- `failActionLifecycle` — function — line 40
- `isActionActive` — function — line 17
- `isActionTerminal` — function — line 13
- `resetActionLifecycle` — function — line 54
- `startActionLifecycle` — function — line 26

## `simulation/interactionQueue.ts`

- `createInteractionQueue` — function — line 80
- `InteractionQueue` — type — line 28
- `InteractionQueueConfig` — type — line 10
- `wellQueueId` — function — line 153

## `simulation/observation.ts`

- `assessHealthRatio` — function — line 90
- `assessStaminaRatio` — function — line 115
- `DEFAULT_PLAYER_OBSERVATION` — const — line 27
- `formatPhysicalAssessment` — function — line 138
- `formatPhysicalAssessmentFromQualitative` — function — line 108
- `NEUTRAL_PERCEPTION` — const — line 23
- `NPC_BROAD_IDENTITY_LABEL` — const — line 25
- `ObservationInput` — type — line 12
- `ObservationLevel` — type — line 10
  - domain: npc
  - system: observation
  - role: Pure observation-level resolution from observer Perception and distance. Intended for presentation now and simulation consumers later — no DOM/UI dependency.
- `observationRangeScale` — function — line 52
- `PlayerObservationInput` — type — line 17
- `QualitativeHealth` — type — line 44
- `qualitativeHealthFromInjurySeverity` — function — line 99
- `qualitativeHealthLabel` — function — line 121
- `QualitativeStamina` — type — line 45
- `qualitativeStaminaLabel` — function — line 130
- `resolveObservationLevel` — function — line 57
- `resolveStableObservationLevel` — function — line 83
- `stabilizeObservationLevel` — function — line 67

## `simulation/scoreActions.ts`

- `pickActionKind` — function — line 27
- `pickHighestScore` — function — line 14
- `plannedFromKind` — function — line 35
- `ScoredAction` — type — line 7

## `simulation/types.ts`

- `ActionLifecycle` — type — line 106
- `ActionLifecycleStatus` — type — line 99
- `copyVec3` — function — line 26
- `DecisionContext` — type — line 64
- `DecisionPressure` — type — line 47
- `PlannedAction` — type — line 90
- `SimulationEntityRef` — type — line 34
- `vec3` — function — line 21
- `Vec3` — type — line 15
  - domain: shared
  - system: simulation-contracts
  - role: Domain-agnostic shapes (`PlannedAction`, `DecisionContext`, `ActionLifecycle`) shared by NPC and fauna decision/action code.
  - uses: (none — deliberately Three.js- and domain-free)
