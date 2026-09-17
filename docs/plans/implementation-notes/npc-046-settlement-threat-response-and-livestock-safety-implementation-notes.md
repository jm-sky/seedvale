# Implementation Notes: npc-046 — NPC emergency locomotion for settlement threats

**Plan:** `docs/plans/npc-046-settlement-threat-response-and-livestock-safety.md`  
**Reviewed:** 2026-09-17  
**Source:** current `main` + targeted NPC movement/threat/stamina/animation recon

## Verified current seams

### Detailed NPC movement is owned by `NpcAgent`

`src/ai/NpcAgent.ts` owns detailed movement execution. Current baseline:

```ts
const WALK_SPEED = 2.4
```

`steerTo()` already executes committed destinations and cooperates with the existing movement watchdog/local navigation fallback. The plan should add locomotion urgency at this execution seam, not another destination/path system.

`src/world/transportOffscreen.ts` intentionally duplicates the same `2.4` speed as `OFFSCREEN_TRAVEL_SPEED` for ordinary off-screen carrier travel. Do **not** change that constant merely because emergency detailed locomotion gains a run speed; emergency run is not the generic travel model.

### Semantic animation is already centralized

`NpcAgent.ts` currently declares:

```ts
type NpcAnimClip =
  | 'attackMelee'
  | 'attackRanged'
  | 'death'
  | 'hurt'
  | 'idle'
  | 'interact'
  | 'walk'
```

Existing calls resolve semantic keys through `AgentAnimationSet`. Add `run` following the same alias/fallback mechanism. Fallback belongs in animation resolution/presentation: an asset without Run should still execute real run movement.

### Personal animal-threat response already exists

`src/ai/npcAnimalThreat.ts` owns:

- `ThreateningAnimalCandidate`,
- `senseImmediateAnimalThreat(...)`,
- `ImmediateAnimalThreat`,
- `arbitrateAnimalThreat(...)`,
- score helpers used to choose defend vs flee.

`NpcAgent.update(...)` already accepts caller-bounded `nearbyAnimalThreats: readonly ThreateningAnimalCandidate[]`. Do not add per-NPC fauna scans or a second threat registry.

The existing scorer already makes defend depend on usable combat capability and accounts for HP/neuroticism. This plan should not retune that decision. Its vertical slice starts **after** the response is `flee`.

### Existing interruption semantics matter

`NpcAgent` already has an interrupt/revalidation lifecycle for in-flight actions. Persistent `activePlan` intent is marked interrupted rather than erased, then ordinary arbitration recreates the next action later.

Emergency personal threat should enter that lifecycle rather than directly wiping `pendingAction`, `activePlan` or unrelated authoritative state.

### Stamina is authoritative existing state

NPC stamina is part of `NpcAuthoritativeState` and is referenced directly by `NpcAgent`. Existing fatigue/recovery/exhaustion policy already uses the same state.

Before inserting run drain, trace the update ordering around the existing base fatigue/recovery constants so one frame does not both recover and drain as if the NPC were resting and sprinting simultaneously.

## Recommended implementation order

1. Add the narrow `walk | run` semantic locomotion contract without changing any callers.
2. Centralize walk/run speed resolution at the current movement execution seam.
3. Add `run` to `NpcAnimClip` and animation alias/fallback resolution.
4. Couple `run` to existing `StaminaState` drain/exhaustion.
5. Wire only the current `arbitrateAnimalThreat() === 'flee'` execution to run.
6. Route personal-threat pre-emption through the existing interruption lifecycle.
7. Add focused tests before any shepherd/guard/livestock follow-up work.

This order keeps the first four steps testable without changing decision behaviour.

## Locomotion ownership

Prefer locomotion mode to belong to the current committed movement/action episode rather than adding a `run` boolean that arbitrary call sites toggle each frame.

Invariant:

```text
destination/route commitment != locomotion urgency
```

A practical implementation may keep a transient execution-level mode on `NpcAgent`, but it must reset deterministically when the emergency episode ends and must not survive reconstruction/save-load.

Avoid deriving run from:

- `role`,
- broad `phase`,
- movement velocity thresholds,
- animation state.

Those are downstream/orthogonal signals and would make ordinary patrol/work accidentally sprint.

## Speed policy

Keep run speed near the existing movement constants or extract a tiny pure resolver only if it materially improves tests.

Do not reuse player sprint tuning implicitly. NPC movement owns its own value.

Do not change `OFFSCREEN_TRAVEL_SPEED` in `transportOffscreen.ts`; that file documents ordinary travel equivalence with `WALK_SPEED`, not emergency response.

## Stamina coupling

Use the existing stamina operations/state. A fixed V1 run-drain rate is sufficient.

Important behaviours to preserve:

- walking remains free of emergency run drain,
- exhausted NPC cannot sprint indefinitely,
- exhaustion fallback still produces movement instead of freezing,
- normal recovery resumes once emergency running stops,
- current Endurance/energetic modifiers remain authoritative where already applied.

If a pure helper such as `resolveNpcLocomotionSpeed(mode, staminaState)` reduces test coupling, keep it small and stateless; do not create a locomotion manager.

## Animation mapping

Follow the existing semantic alias-resolution style. Prefer authored `Run`/known run aliases where the current resolver already supports alias lists.

Do not make missing animation capability disable gameplay capability. Expected fallback:

```text
semantic run + Run clip exists    → play Run
semantic run + no Run clip        → play safe Walk fallback
movement execution in both cases  → run-speed rules
```

## Threat interruption integration

The immediate threat path is already bounded by caller-supplied candidates. The implementation should elevate a live personal threat above low-priority movement/execution using existing cancellation/revalidation semantics.

Do not yet make NPCs react to:

- predators attacking somebody else,
- livestock being attacked,
- shepherd alarms,
- guard-local danger.

Those belong to the follow-up plans and are the main reason `npc-046` was narrowed.

## Tests worth keeping focused

Prefer pure/unit tests for:

- locomotion speed resolution,
- run eligibility under stamina/exhaustion,
- run animation semantic fallback.

Use `NpcAgent` integration tests for:

- current personal animal-threat flee selects `run`,
- low-priority action is interrupted through the existing lifecycle,
- locomotion resets to walk after the threat disappears,
- destination/path/watchdog behaviour is unchanged.

## Explicit split from the former scope

The previous `npc-046` combined several independent systems. Those responsibilities are now intentionally moved out:

- domestic livestock contextual safe flee → `fauna-037-domestic-livestock-safe-flee.md`,
- shepherd flock-threat response/loadout → `npc-047-shepherd-livestock-threat-response.md`,
- transient local threat assistance + guard response → `npc-048-local-threat-assistance-and-guard-response.md`.

Guard SPEA/candidate-quality/HP tuning is not part of any of these initial four plans; measure the response system first before adding physical-stat policy.

## Documentation follow-up

After implementation, update only the relevant current-state documentation:

- `docs/state/npc.md` — semantic emergency run + personal-threat interruption behaviour.

No fauna/state update belongs to this plan.

## Manual verification boundary

AI implementation should run automated/type checks only. Browser gameplay verification is the User's responsibility.

> **Zrób git commit i push do main, rebase jeżeli trzeba**