# Plan: Settlement threat response and livestock safety

**Created:** 2026-09-17
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** L
**Depends on:** none
**Domain:** `npc`
**Subdomains:** `behavior` `decision-making` `combat`
**Tags:** `threats` `guards` `livestock` `shepherd` `flee`
**Roadmap:** -
**Model:** Sonnet, Composer

## Goal

Make settlement inhabitants and domestic animals react coherently to immediate predator attacks so a pasture incident does not end with a shepherd, horse and flock passively dying together.

Target flow:

```text
predator commits to livestock / attacks nearby NPC
→ threatened livestock runs toward a contextual safe anchor
→ shepherd notices threat against owned flock
→ shepherd defends when capable, otherwise runs and raises local alarm
→ nearby NPCs perceive the same local danger/alarm
→ guards respond earlier and more decisively
→ civilians defend or flee through the existing NPC threat arbitration
→ threat ends → normal work/roaming resumes
```

This is an extension of the existing fauna threat/flee, shepherd-flock and NPC animal-threat mechanisms. Do not create a settlement combat manager, guard AI FSM, shepherd combat AI or second threat registry.

## Current foundation verified on `main`

### Fauna already has real sprint movement

`AnimalDef` already owns both:

```ts
walkSpeed: number
sprintSpeed: number
```

`AnimalAgent` already has `walkSpeedNow()` / `sprintSpeedNow()` and high-priority flee/chase movement uses sprint speed. Livestock are ordinary `AnimalAgent`s, not a separate movement type.

Therefore **do not add a second run system for livestock**. Extend the destination/safety semantics of existing flee behaviour while preserving `sprintSpeedNow()` execution.

### NPC movement has only one speed

`src/ai/NpcAgent.ts` currently has:

```ts
const WALK_SPEED = 2.4
```

Normal `steerTo()` movement uses this single walking speed. NPC threat `flee` reuses normal movement rather than owning a real emergency locomotion mode.

NPC semantic animation keys currently include:

```ts
'attackMelee' | 'attackRanged' | 'death' | 'hurt' |
'idle' | 'interact' | 'walk'
```

There is no semantic `run` key. The implementation must therefore add a real NPC emergency run mode end-to-end: movement intent, speed and animation selection. Do not merely play a faster animation over walking movement.

### Existing threat decisions

`src/ai/npcAnimalThreat.ts` already provides:

- bounded `senseImmediateAnimalThreat()`,
- `ImmediateAnimalThreat`,
- `arbitrateAnimalThreat()`,
- defend/flee scoring from usable weapon capability, HP ratio and neuroticism.

An unarmed or badly hurt NPC already prefers flee. Reuse this scorer. Guard/shepherd behaviour should bias or feed the same decision mechanism rather than bypassing it with role-specific combat FSMs.

### Shepherd flock protection already has a semantic seam

`src/fauna/shepherdFlock.ts` already exposes `senseOwnedFlockThreat()` over predators whose committed prey belongs to the shepherd household, with a bounded `FLOCK_THREAT_RADIUS`.

This is the correct signal for shepherd protection. Do not add predator→shepherd callbacks or copy predator target state into NPC state.

### Guard equipment already exists

`src/ai/npcLoadout.ts` maps `guard → long_sword` through the same role-loadout mechanism used by hunters/woodcutters. Do not create a separate guard inventory or combat damage table.

### SPEA already exists

NPC physical profile/effective attributes already provide Strength, Perception, Endurance and Agility. Current profession staffing chooses guard coverage from settlement signals, but does not select the guard candidate using those physical attributes.

## 1. NPC emergency locomotion

Introduce a small semantic NPC locomotion mode instead of scattering `role === ... ? speed : ...` checks.

Suggested shape:

```ts
type NpcLocomotionMode = 'walk' | 'run'
```

or an equivalent narrow execution-level contract owned by `NpcAgent` movement.

Requirements:

- ordinary work, schedules, logistics, patrol and social movement remain `walk`,
- immediate flee from a live threat uses `run`,
- guard response to an immediate local danger may use `run`,
- shepherd emergency response to threatened owned livestock may use `run`,
- combat attack/recovery timing remains owned by combat code; this plan does not globally make combatants sprint,
- navigation/pathfinding/watchdog semantics stay unchanged; locomotion changes speed, not destination ownership or pathfinding ownership.

Add a dedicated NPC run speed rather than multiplying `WALK_SPEED` ad hoc at call sites. Keep the value centralized and suitable for later SPEA/stamina tuning.

### Stamina

Running must consume existing NPC stamina through the existing `StaminaState`; do not add an emergency stamina resource.

V1 may use one fixed run drain rate. When stamina is exhausted, movement should degrade safely rather than allowing infinite sprint. Reuse the existing exhaustion/recovery semantics where practical.

Do not make normal walking consume the emergency run drain.

## 2. NPC run animation

Extend `NpcAnimClip` with `run` and resolve it through the existing `AgentAnimationSet`.

Resolution should prefer an authored `Run` clip when available and fall back safely when a model lacks one. Do not require every historical NPC asset to have a run clip before the feature works.

`syncAnimation()` should select locomotion presentation from the actual current locomotion mode:

```text
stationary → idle / existing action clip
moving + walk → walk
moving + run → run (or safe walk fallback if run clip absent)
```

Do not infer run presentation from world-space velocity thresholds when the movement executor already knows the semantic mode.

## 3. Livestock flee toward safety

Keep fauna's existing high-priority flee branch and sprint speed, but improve **where domestic livestock tries to escape**.

For `role === 'livestock'` / domestic animals under a real predator threat, resolve a contextual safe anchor in this order when available:

```text
1. nearby responsible shepherd / handler context
2. owning household / livestock home
3. owning settlement safe area
4. existing away-from-threat flee vector fallback
```

Exact anchor data must come through existing settlement/fauna ownership seams; do not let `AnimalAgent` scan all NPCs or settlements globally.

The selected safe anchor is a directional preference, not a teleport and not a guarantee that the animal reaches it. Immediate separation from the predator remains mandatory: never choose an anchor that makes the first movement step run through/toward the attacker.

This should apply coherently to household livestock such as sheep, horse, donkey, cow and poultry where their existing movement capability permits it. Do not implement sheep-only flee code.

Preserve:

- existing `sprintSpeedNow()` execution,
- water traversal rules,
- slope/collision/navigation watchdog,
- normal roaming/trips once the threat is gone,
- animal update-cadence classification (`flee` remains immediate/full-priority).

## 4. Shepherd emergency response

A predator committed against the shepherd's owned flock is an immediate interruption, not ordinary profession work.

Reuse `senseOwnedFlockThreat()` and current NPC combat target handles.

Flow:

```text
owned flock threat sensed
→ interrupt ordinary shepherd work
→ evaluate existing defend/flee arbitration
→ capable + sufficiently healthy: run toward / engage predator through existing beginCombat()
→ otherwise: run toward safety and emit local assistance/alarm stimulus
```

Shepherd shearing, deposit and flock-care actions must remain normal work and resume through ordinary arbitration after danger clears.

Do not create persistent shepherd combat state.

### Shepherd defensive loadout

A shepherd is responsible for livestock protection and should not rely on the generic fallback `knife` as the only combat option.

Every generated shepherd must receive:

```text
knife: 100%
```

The knife is both a normal utility tool and a last-resort melee weapon. It remains in the same personal-inventory/loadout path as other NPC belongings.

In addition, each shepherd receives exactly one deterministic primary defensive weapon:

```text
spear:     45%
pitchfork: 30%
axe:       25%
```

Requirements:

- selection is deterministic from stable NPC/world identity using an isolated RNG salt; it must not reroll when the settlement/NPC is reconstructed,
- the selected weapon is a real personal inventory item and persists through the existing NPC inventory/save path,
- `knife` is always present independently of the primary weapon,
- `shears` remain a separate profession tool and do not count as the shepherd's primary defensive weapon,
- do not grant `long_sword` to shepherds; that remains guard-specific equipment,
- do not add shepherd-specific damage multipliers — combat capability comes from the selected real weapon + normal Strength/combat resolution,
- preserve existing loadout idempotency: reconstructing an NPC must not duplicate the knife, primary weapon or shears.

The weighted selection belongs in the central role/personal-loadout mechanism (`src/ai/npcLoadout.ts` or a small pure helper used by it), not in shepherd combat code.

## 5. Local alarm / assistance stimulus

Add the smallest reusable **local threat assistance signal** needed for nearby NPC cooperation.

This is not a settlement-wide event bus or persisted alarm registry. It should be transient, bounded and derived from live danger.

A useful V1 contract is a read-only local candidate describing:

```ts
{
  sourceNpcId
  threatAnimalId
  x
  z
  target: CombatTargetHandle
  kind: 'predator' // or similarly narrow semantic category
}
```

The settlement/NPC update composition point should expose only nearby active alarm candidates to NPCs. Avoid per-NPC scans over all fauna or all settlements.

Alarm consumers still run their own `arbitrateAnimalThreat()`; an alarm is information, not a command to fight.

## 6. Guard response

Guard remains an ordinary NPC with the same combat/movement/inventory systems, but role affects threat awareness and decision weighting.

V1 guard behaviour:

- notices relevant settlement-local predator danger/alarm at a larger radius than ordinary civilians,
- may respond to danger threatening another NPC or livestock without first being personally targeted,
- uses `run` for emergency response,
- has a strong defend bias while healthy and armed,
- still flees when critically hurt / genuinely unable to fight,
- returns to ordinary patrol/work after the threat disappears.

Do not make guards omniscient. Response remains bounded by local perception/alarm range and live threat information.

## 7. Guard equipment and physical capability

Keep the existing `guard → long_sword` personal loadout as the authoritative weapon path. Add ammunition only if a ranged guard loadout is introduced later; this plan does not require changing guards to bows.

Do **not** implement `guardDamageMultiplier` or a second HP formula.

Instead strengthen guards through existing systems where justified:

### Candidate quality

At generation/staffing time, when multiple eligible adult slots can satisfy a guard assignment, prefer a physically suitable candidate using deterministic already-derived profile data, primarily:

- Perception,
- Strength,
- Endurance,
- optionally Agility as a weaker tie-breaker.

Do not regenerate attributes or add role-owned duplicate stats.

If the current staffing call site does not have access to the candidate profiles without creating a circular generation dependency, leave staffing order unchanged and apply only a narrow guard training modifier through the existing effective-attribute mechanism. Do not force a large family-generation refactor solely for candidate ranking.

### HP

Do not set `role === 'guard' ? maxHp * X` directly in combat code.

If guard durability needs an explicit V1 increase after testing, represent it as training/physical-profile policy at the existing physical-state layer, with one documented source and tests. Prefer Endurance/physical-profile consequences over arbitrary combat-only HP multiplication.

## 8. Threat priority and interruption

Immediate live threat must pre-empt normal low-priority activities:

- profession work,
- patrol,
- conversation/social activity where current interruption contracts allow it,
- idle/wander,
- flock care/shearing.

Do not silently erase persistent Plans/commitments. Use existing interruption/cancellation lifecycle so work can later re-arbitrate or resume according to current rules.

Critical physiological collapse and death continue to outrank this feature.

## 9. Performance and simulation independence

The response must work without the player/camera being present.

Requirements:

- no camera-distance trigger for threat correctness,
- no world-wide NPC × animal scans,
- build bounded active threat/alarm candidate lists once at the existing settlement/fauna integration seam,
- reuse `AnimalAgent`'s existing immediate update cadence for flee/combat,
- keep transient alarms unpersisted,
- off-screen/aggregated simulation may simplify presentation but must not make remote settlements immune to meaningful predator consequences.

Do not introduce a Web Worker for local threat arbitration.

## 10. Expected files

Likely implementation surface, subject to current-code verification:

- `src/ai/NpcAgent.ts` — locomotion mode/run execution, threat interruption, guard/shepherd response wiring, animation selection.
- `src/ai/npcAnimalThreat.ts` — reusable perception/scoring inputs and guard role bias if this remains the narrowest owner.
- `src/ai/npcLoadout.ts` — shepherd knife + deterministic weighted defensive weapon + existing guard loadout tests.
- `src/settlement/professionStaffing.ts` — only if candidate-quality selection can reuse already-available deterministic profile data without generation-cycle duplication.
- `src/fauna/AnimalAgent.ts` — domestic flee destination preference while retaining existing sprint execution.
- `src/fauna/animalDefs.ts` — expected no new run capability; existing `sprintSpeed` remains authoritative.
- `src/fauna/shepherdFlock.ts` — existing owned-flock threat query; extend only if a reusable narrow hook is missing.
- fauna/settlement composition hook that currently supplies `ThreateningAnimalCandidate[]` to NPCs — extend this same bounded bridge for local alarm/safety context instead of adding a registry.
- targeted tests beside the modules above.

Add JSDoc with `@domain npc` / `@domain fauna` to important new architectural/public helpers so preflight/code-map discovery stays useful.

## Non-goals

- Bandit/warfare settlement defense.
- Formation AI or tactical squads.
- Global settlement alert state.
- Persisted alarm history.
- Guard barracks, shifts or watch towers.
- New weapon/damage system.
- New livestock FSM or pathfinder.
- Teleporting livestock to safety.
- Making every NPC automatically fight.
- Player/camera-dependent protection.

## Verification

Automated tests should cover at minimum:

- ordinary NPC movement remains walk-speed,
- NPC immediate flee selects run-speed,
- run drains existing stamina and exhaustion prevents unlimited sprint,
- locomotion semantic `run` selects Run animation when present and safely falls back when absent,
- existing NPC pathfinding/watchdog destination commitment remains unchanged by locomotion mode,
- animal flee still uses `sprintSpeedNow()`,
- domestic livestock chooses a valid safe anchor only when it does not initially move toward the predator,
- livestock without a safe anchor keeps existing away-from-threat flee behaviour,
- shepherd detects predator committed to its owned livestock and interrupts ordinary work,
- shepherd always has `knife`,
- shepherd receives exactly one deterministic primary defensive weapon with `spear` 45% / `pitchfork` 30% / `axe` 25%,
- shepherd reconstruction does not reroll or duplicate knife/weapon/shears,
- healthy armed shepherd can defend through existing combat target/beginCombat path,
- vulnerable shepherd flees/runs and produces a bounded local assistance signal,
- ordinary NPC receiving an alarm still uses defend/flee arbitration rather than always fighting,
- guard reacts at the configured larger local awareness radius and runs to a live threat,
- badly injured guard can still choose flee,
- guard retains real `long_sword` personal loadout,
- threat/alarm signals disappear when the underlying threat is no longer live,
- no player/camera presence is required by decision tests,
- `pnpm type-check`,
- targeted Vitest suites for NPC threat/movement, shepherd flock and fauna flee behaviour.

Manual browser verification belongs to the User:

- send shepherd + owned sheep/livestock to pasture near predators,
- attacked sheep/horse visibly **run**, not walk,
- fleeing livestock heads toward shepherd/home/settlement when that is safely reachable,
- shepherd reacts immediately rather than continuing work,
- an armed healthy shepherd may fight; a vulnerable one runs for help,
- nearby guards visibly run to help and engage,
- civilians do not all suicide-rush the predator,
- injured/unarmed NPCs visibly run away,
- after danger ends surviving animals/NPCs return to normal behaviour without stuck combat/flee state.

> **Zrób git commit i push do main, rebase jeżeli trzeba**