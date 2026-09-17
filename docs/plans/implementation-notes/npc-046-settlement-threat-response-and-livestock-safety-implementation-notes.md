# Implementation Notes: npc-046 — Settlement threat response and livestock safety

**Plan:** `docs/plans/npc-046-settlement-threat-response-and-livestock-safety.md`  
**Reviewed:** 2026-09-17  
**Source:** current `main` + targeted NPC/fauna/threat/movement recon

## Current ownership and verified seams

### NPC movement is single-speed today

`src/ai/NpcAgent.ts` owns detailed NPC movement execution. The current baseline is:

```ts
const WALK_SPEED = 2.4
```

`steerTo()`/movement watchdog/navigation already own destination execution and stuck recovery. Do not add a second pathfinder or flee movement controller. Add locomotion speed selection at the existing movement execution seam.

The current semantic animation type is:

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

There is no `run` semantic key. `AgentAnimationSet` already handles missing clips safely, so adding `run` should follow the same alias-resolution pattern rather than special-casing raw `AnimationAction`s.

### Fauna already has sprint and immediate flee cadence

`src/fauna/animalDefs.ts::AnimalDef` already contains `walkSpeed` and `sprintSpeed` for every animal kind. `AnimalAgent` owns `walkSpeedNow()` / `sprintSpeedNow()` and its threat/flee/chase branches already call sprint-speed movement.

`docs/state/fauna.md` confirms flee/combat are `immediate` importance under `animalUpdateCadence.ts`; skipped routine cadence is not the reason livestock reacts slowly.

Therefore the livestock part of this plan should change **flee destination semantics**, not introduce run speed, a run flag or another animal movement state.

### Animal threat bridge already carries committed livestock prey

`src/ai/npcAnimalThreat.ts::ThreateningAnimalCandidate` already has:

```ts
preyAnimalId?: string
preyOwnerHouseId?: string
```

and carries the existing `CombatTargetHandle` for the predator. This is the correct cross-domain read-only bridge to reuse for shepherd/guard response.

`src/fauna/shepherdFlock.ts::senseOwnedFlockThreat()` already filters that candidate stream to predators committed against the shepherd household's livestock. Keep it pure/bounded.

### NPC defend/flee is already centralized

`src/ai/npcAnimalThreat.ts::arbitrateAnimalThreat()` already scores:

- usable melee/ranged capability,
- HP ratio,
- neuroticism,

and makes `defend` impossible for an NPC with no usable combat capability. Extend its input carefully if guard role bias is needed; do not fork a `guardThreatDecision()` unless the generic scorer cannot express the requirement.

### Guard equipment is already systemic

`src/ai/npcLoadout.ts::DEFAULT_WEAPON_BY_ROLE` contains:

```ts
guard: 'long_sword'
```

`seedInitialPersonalBelongingsIfNeeded()` persists the weapon through the normal personal-inventory path. The implementation should test/use this path, not seed a second transient guard sword into `NpcAgent.carried`.

### Guard staffing does not currently rank physical candidates

`src/settlement/professionStaffing.ts` owns generation-time role coverage. Guard policy is based on settlement `character` and `adultCapacity`; staffable adult slots are assigned independently of SPEA.

`src/settlement/npcPhysicalProfile.ts` / `src/shared/effectivePhysicalAttributes.ts` derive Strength/Perception/Endurance/Agility later from deterministic physical profile data.

Before changing candidate selection, trace generation order. If physical profiles do not exist yet at staffing time, do not duplicate attribute generation or perturb family RNG streams merely to rank guards. A small later training modifier is preferable to architectural inversion.

## Recommended implementation order

1. **NPC locomotion contract first.** Add semantic walk/run execution and tests without changing threat behaviour yet. Keep route/path/watchdog code identical.
2. **NPC animation mapping.** Add `run` to `NpcAnimClip`, resolve `Run` aliases, make `syncAnimation()` consume locomotion mode, verify missing-run fallback.
3. **NPC stamina coupling.** Run drains existing `StaminaState`; exhausted NPC falls back to walk/limited movement using existing exhaustion semantics.
4. **Wire current personal-threat flee to run.** This gives an isolated vertical slice before adding shepherd/guard cooperation.
5. **Domestic livestock safe-anchor preference.** Keep current flee arbitration and sprint execution; add only the contextual destination resolver/hook.
6. **Shepherd threatened-flock interruption.** Reuse `senseOwnedFlockThreat()` and existing combat target handles.
7. **Transient local alarm/assistance candidates.** Build at the existing settlement/fauna integration point, bounded to the materialized settlement/local fauna set.
8. **Guard perception/bias.** Guards consume the same alarm/threat candidates, with wider bounded awareness and a defend score bias; use normal `beginCombat()`.
9. **Only then evaluate guard physical tuning.** Prefer no explicit HP buff unless browser verification shows it is still necessary after response timing/equipment/run fixes.

## NPC locomotion design constraint

Avoid changing every `steerTo(target, ...)` caller signature if a smaller committed-movement context already exists. The semantic mode should belong to the current movement/action episode so repeated per-frame steering cannot accidentally reset it.

Useful invariant:

```text
movement destination ownership != locomotion mode
```

The destination remains whatever current action/combat/flee code committed; locomotion only answers how urgently the NPC moves there.

Do not derive `run` from `phase === 'wander'` or another broad phase because current animal-threat flee reuses ordinary movement/wander semantics.

## NPC run speed and stamina

Keep constants centralized near the existing movement constants or move both walk/run speeds into a tiny shared NPC locomotion module if tests need a pure resolver.

Do not reuse player `SPRINT_MULTIPLIER` implicitly; NPC physical movement should own its own tuning.

Potential pure helper shape:

```ts
resolveNpcLocomotionSpeed(mode, staminaState): number
```

Only extract this if it reduces test/runtime coupling; avoid creating a manager.

Run drain should use existing `drainStamina()` and existing exhaustion thresholds. Check current `NpcAgent` fatigue/recovery update ordering so emergency drain and normal recovery do not both apply in the same frame.

## Animation aliases

Current NPC assets historically map locomotion around `Walk`, while some character pipelines may expose `Run` or UAL-style run names. Follow the existing alias-resolution style in `NpcAgent.create()`/`anim.resolve()`.

Important: fallback belongs in animation resolution, not movement logic. An NPC with no Run clip should still move at run speed under threat; it may present Walk as fallback rather than lose gameplay behaviour.

## Domestic safe-anchor resolver

Keep the resolver outside raw `AnimalAgent` settlement scans. `AnimalAgent` should receive a narrow pre-resolved or queryable context from `createFauna()` / settlement integration, similar to existing ownership/hunting/shepherd hooks.

The resolver needs to know at most:

- animal ownership (`ownerHouseId`, already on livestock),
- current threat position,
- optional responsible shepherd position,
- optional household/home/settlement-safe anchor.

A safe candidate must pass a local directional guard before commitment. At minimum, the first movement direction should not reduce distance to the predator when an away-from-threat alternative exists.

Do not replace `fleeFrom()` wholesale: preserve it as fallback and, if practical, factor only destination/direction selection into a pure helper tested independently.

## Shepherd response

`NpcAgent` already imports:

```ts
FLOCK_THREAT_RADIUS
senseOwnedFlockThreat
ShepherdFlockHooks
```

so shepherd integration already exists in the coordination class. Trace the current call site before adding another one; the likely change is to elevate the existing flock-threat result from profession-work concern into the immediate threat interruption path.

The predator candidate already carries `target: CombatTargetHandle`; a defending shepherd should pass that through existing `beginCombat()` rather than resolve the animal again.

## Alarm ownership

Do not persist alarms and do not place them in `NpcAuthoritativeState`.

Best ownership is the materialized settlement update/composition layer that already has:

- local NPC collection,
- fauna threat candidate bridge,
- one update pass.

Build one small bounded candidate list per settlement/update, then let nearby NPCs query it. Avoid `each NPC → scan every animal` and avoid callbacks from `AnimalAgent` into arbitrary NPCs.

The alarm should disappear automatically when the live threat no longer exists / the combat target reports dead / the source situation is no longer relevant. No timeout registry is needed if it can be derived each update.

## Guard behaviour

Guard-specific differences should be data/scoring/perception differences, not a new FSM:

```text
same live threat/alarm
→ larger guard perception radius
→ guard defend-score bonus / lower flee bias while healthy + armed
→ same arbitrateAnimalThreat()
→ same beginCombat() or flee movement
```

Keep a hard escape path: critical HP, unusable weapon or exhaustion must still allow flee.

Do not change generic NPC weapon damage just because the attacker role is `guard`; the long sword and existing Strength/combat resolver should supply combat capability.

## Physical-stat tuning caveat

`resolveNpcEffectivePhysicalAttributes()` composes base physical profile + injury + temporary-condition modifiers. If guard training becomes necessary, add it at a source where it is visible as a normal modifier/contribution rather than mutating effective values ad hoc inside combat.

However, the first implementation should prioritize:

1. actual emergency detection,
2. run speed,
3. weapon availability,
4. cooperative response.

Only then tune guard durability/attributes. The original pasture failure can be caused by delayed/nonexistent response rather than insufficient max HP.

## Tests worth keeping pure

Prefer pure tests for:

- locomotion speed selection,
- run eligibility under stamina/exhaustion,
- guard bias in `arbitrateAnimalThreat`,
- alarm radius filtering,
- domestic safe-anchor selection,
- safe-anchor rejection when it points through the predator.

Use `NpcAgent`/`AnimalAgent` integration tests only for wiring that cannot be proven by the pure helpers.

## Documentation follow-up

If implemented, update:

- `docs/state/npc.md` — NPC locomotion run mode + local assistance/guard threat response,
- `docs/state/fauna.md` — domestic safe-anchor flee semantics while preserving sprint,
- `docs/state/combat.md` only if the cross-domain threat handoff contract changes materially.

Do not rewrite unrelated state sections.

## Manual verification boundary

AI implementation should run automated/type checks only. Browser gameplay verification is the User's responsibility per project rules.

> **Zrób git commit i push do main, rebase jeżeli trzeba**