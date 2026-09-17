# Plan: NPC emergency locomotion for settlement threats

**Created:** 2026-09-17
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** none
**Domain:** `npc`
**Subdomains:** `behavior` `decision-making`
**Tags:** `threats` `flee` `movement` `stamina` `animation`
**Roadmap:** -
**Model:** Sonnet, Composer

## Goal

Give NPCs a real semantic emergency `run` locomotion mode and make the already-existing immediate animal-threat flee path use it.

This plan is the movement foundation for later livestock/shepherd/guard threat-response plans. It deliberately does **not** implement livestock safety destinations, shepherd flock defense, local alarms or guard assistance.

Target flow:

```text
existing immediate animal threat
→ existing arbitrateAnimalThreat()
→ response = flee
→ existing movement destination / escape semantics
→ locomotion mode = run
→ run speed + run animation + existing stamina drain/exhaustion
→ threat ends → ordinary movement returns to walk
```

## Current foundation verified on `main`

### NPC movement is single-speed

`src/ai/NpcAgent.ts` currently owns detailed movement execution and has one movement speed:

```ts
const WALK_SPEED = 2.4
```

`steerTo()` plus the existing navigation/watchdog path owns destination execution and stuck recovery. Do not create another movement controller or pathfinder.

### Animation has no semantic `run`

Current `NpcAnimClip` includes:

```ts
'attackMelee' | 'attackRanged' | 'death' | 'hurt' |
'idle' | 'interact' | 'walk'
```

`AgentAnimationSet` already owns semantic clip resolution/fallback. Add `run` through that mechanism instead of addressing raw clip names from threat code.

### Immediate animal-threat arbitration already exists

`src/ai/npcAnimalThreat.ts` already owns:

- `ThreateningAnimalCandidate`,
- bounded `senseImmediateAnimalThreat()`,
- `ImmediateAnimalThreat`,
- `arbitrateAnimalThreat()`,
- defend/flee scoring from usable combat capability, HP ratio and neuroticism.

This plan must not introduce another threat scorer. It only changes how a selected emergency flee is executed.

### Stamina already exists

NPC stamina is authoritative `NpcAuthoritativeState` through the existing `StaminaState` path. Fatigue/exhaustion/recovery already exist in `NpcAgent`; running must consume that resource rather than introducing a second emergency-energy field.

## Scope

### 1. Semantic locomotion mode

Add the narrowest execution-level contract needed to distinguish ordinary walking from emergency running, for example:

```ts
type NpcLocomotionMode = 'walk' | 'run'
```

The exact representation may differ if the current movement/action episode already provides a cleaner owner.

Requirements:

- ordinary work, patrol, schedules, logistics, social movement and idle movement remain `walk`,
- an immediate animal-threat response resolved as `flee` uses `run`,
- destination/path ownership remains unchanged,
- locomotion mode must not be inferred from role, broad FSM phase or world-space velocity,
- repeated `steerTo()` calls must not accidentally reset the committed emergency locomotion mode.

Useful invariant:

```text
movement destination ownership != locomotion mode
```

### 2. Central run speed

Add one dedicated NPC run speed beside the walking movement policy rather than multiplying `WALK_SPEED` ad hoc at call sites.

Keep normal off-screen travel assumptions unchanged: this plan adds emergency detailed locomotion, not a global faster travel model.

### 3. Run stamina coupling

Running consumes the existing NPC stamina resource.

V1 may use one fixed emergency run drain rate. Requirements:

- walking does not consume the emergency drain,
- ordinary fatigue/recovery semantics continue to work,
- exhaustion prevents unlimited sprinting,
- exhausted emergency movement degrades safely to the existing allowed movement behaviour rather than creating a stuck NPC,
- avoid applying normal recovery and run drain incompatibly in the same update step.

### 4. Semantic run animation

Extend `NpcAnimClip` with `run` and resolve it through `AgentAnimationSet`.

Presentation semantics:

```text
stationary → existing idle/action presentation
moving + walk → walk
moving + run → run
```

Prefer an authored `Run` clip when present. Historical NPC assets without a run clip must fall back safely to walk presentation while still moving at real run speed.

### 5. Wire existing personal-threat flee

When existing animal-threat arbitration chooses `flee`, execute the same escape destination/path logic with emergency locomotion.

Do not change defend/flee scoring as part of this plan. Do not make all combat movement run.

### 6. Threat interruption boundary

A live immediate threat must be able to pre-empt low-priority execution that would otherwise keep the NPC standing or walking through danger.

Reuse the existing interruption/cancellation lifecycle:

- cancel the in-flight low-priority action,
- preserve persistent Plan semantics (`interrupted`, not silently erased),
- re-arbitrate normally after the threat clears,
- collapse/death remain higher-priority safety states.

Keep this limited to making the already-existing immediate personal threat actionable; role-specific shepherd/guard interruption belongs to later plans.

## Expected files

Likely implementation surface, subject to current-code verification:

- `src/ai/NpcAgent.ts` — locomotion mode, run speed execution, stamina drain, animation selection and threat-flee wiring.
- `src/ai/npcAnimalThreat.ts` — expected little/no behavioural change; only narrow contract adjustments if needed by execution wiring.
- existing animation-resolution module/types used by `AgentAnimationSet` if `run` aliases belong there.
- targeted NPC movement/threat tests.

Add JSDoc with `@domain npc` to important new architectural/public helpers where it improves preflight discovery.

## Non-goals

- Livestock flee destinations or safety anchors.
- Shepherd reaction to threatened owned livestock.
- Shepherd defensive loadout.
- Local assistance/alarm signals.
- Guard response or guard perception tuning.
- Guard SPEA/HP/candidate-quality tuning.
- New NPC pathfinding.
- New threat registry or scorer.
- Global sprinting in combat/work/travel.
- Off-screen travel-speed changes.

These are intentionally split into follow-up plans.

## Verification

Automated tests should cover at minimum:

- ordinary NPC movement remains walk-speed,
- existing immediate animal-threat flee selects run locomotion,
- run uses the dedicated run speed,
- run drains existing stamina,
- exhaustion prevents unlimited running and degrades safely,
- ordinary walking does not receive run drain,
- semantic `run` selects an authored Run animation when available,
- missing Run animation falls back safely without changing movement speed,
- pathfinding/watchdog destination commitment is unchanged by locomotion mode,
- threat interruption preserves persistent Plan interruption semantics,
- after danger clears ordinary movement returns to walk,
- `pnpm type-check`,
- targeted Vitest suites for NPC movement/threat behaviour.

Manual browser verification belongs to the User:

- provoke a predator into threatening an unarmed/injured NPC,
- fleeing NPC visibly moves faster than normal walking,
- Run animation plays when the model provides it,
- stamina falls while running and exhaustion limits continued sprinting,
- after the threat clears the NPC returns to normal behaviour without a stuck run state.

> **Zrób git commit i push do main, rebase jeżeli trzeba**