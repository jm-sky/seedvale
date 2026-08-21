# Plan 179 — Implementation Notes

**Reviewed:** 2026-08-21  
**Plan:** `2026-08-20--179--animal-attack-and-npc-defense.md`  
**Status:** implementation notes  
**Source of truth:** current code + tests + build configuration. `docs/STATE.md`, plan 179 and the completed plan 177 were reviewed before writing this note.

## 1. Review verdict

Plan 179 is architecturally sound and is now correctly unblocked by plan 177. The important change since the original plan was that **177 is fully implemented, including NPC ranged combat**.

The main implementation work for 179 is therefore no longer combat infrastructure. It is the missing **behaviour/decision layer** that gets an animal to an NPC and causes the NPC to choose `defend` or `flee` before damage is received.

The implementation should stay small. Do not turn this plan into a generic threat system, new animal combat system, new pathfinding system or new NPC AI framework.

Current `docs/STATE.md` confirms the relevant architecture:

- `NpcAgent` already owns NPC needs, decisions, movement and action lifecycle.
- `AnimalAgent` already owns predator/prey behaviour, player awareness and health/death.
- `predatorHumanDecision.ts` already provides deterministic predator-vs-human attack/flee scoring.
- plan 177 now provides both melee and ranged NPC combat execution through `CombatIntent`.

Plan 179 should connect these existing pieces rather than replace them.

## 2. Important current-code observations

### 2.1 Plan 177 is complete

Do not implement any combat plumbing as part of 179.

Plan 177 currently provides:

```text
CombatIntent
  target: CombatTargetHandle
  mode: 'melee' | 'ranged'
        ↓
NpcAgent combat phase
        ↓
melee / ranged lifecycle
        ↓
existing projectile / hit / critical / defense / damage mechanisms
```

`NpcAgent.beginCombat()` is intentionally an execution seam. It does **not** choose a target or reason to fight.

The latest implementation also reuses plan 162's ranged primitives unchanged. NPC ranged projectiles are owned by the individual `NpcAgent`; there is no global projectile manager or `ArcherAI`.

Therefore 179 should only create the intent and call the existing 177 API.

### 2.2 `predatorHumanDecision.ts` is player-oriented today

The existing `PredatorHumanDecisionInput` contains:

- `humanDistance`;
- `playerNoticeRange`;
- `playerPanicRange`;
- `nearbyHumanCount`;
- `provoked` state tied to the player;
- wolf/fox aggression scoring.

`decidePredatorHumanIntent()` therefore cannot simply be called unchanged for an NPC target.

The correct extension is to make the existing predator-human decision seam support a **generic noticed human**, while preserving the existing player behaviour and deterministic scoring.

Do not create `predatorNpcDecision.ts` as a parallel system.

### 2.3 Animal perception already has a throttled decision cadence

`AnimalAgent` uses a cached human decision interval (`HUMAN_DECISION_INTERVAL_SEC`) for predator-vs-human scoring while movement remains per-frame.

Preserve this pattern:

```text
movement / steering       → existing cadence
perception / decision     → throttled cadence
combat contact / damage   → existing attack cooldown
```

Do not add a new global animal update loop.

### 2.4 Settlement data is already available to fauna

`SettlementsManager.update()` already receives `villages: readonly VillageInfo[]`, and `AnimalAgent` already has village-avoidance/flee behaviour based on real settlement footprint information.

This means plan 179 should not invent a second settlement registry just to make a wolf find a village.

If a strategic target must be stored on the wolf, prefer a small settlement identity/position reference or the existing `VillageInfo`-compatible data already supplied to fauna. Do not retain a heavyweight `Settlement`/Three.js object inside `AnimalAgent`.

## 3. Frenzy state — recommended decision

`frenzied` should be **runtime animal state**, not a new animal species and not a debug-only branch.

Recommended shape:

```ts
private frenzied = false
```

or the equivalent existing state container if `AnimalAgent` already has a suitable trait/state structure at the final edit point.

Do not create:

- `FrenzyWolf` class;
- separate wolf FSM;
- separate wolf AI;
- a permanent change to the species definition.

The debug function `setFrenzyWolf()` is only a way to create the state. The behaviour itself must run through normal `AnimalAgent` logic.

### Persistence

Do not add save data for individual frenzy state in V1.

Wild animal instances are not a persistent per-agent save source in the current architecture. A debug-created frenzy wolf can therefore remain runtime state only.

## 4. `setFrenzyWolf()`

The developer helper should operate on the existing fauna population.

Recommended behaviour:

```text
setFrenzyWolf()
    ↓
get current living wolves
    ↓
filter !frenzied
    ↓
find nearest to a settlement
    ↓
mark frenzied
    ↓
assign strategic settlement target
```

Each subsequent call repeats the same selection over the remaining non-frenzied wolves.

If no eligible wolf exists, return without spawning anything.

### Important: do not use `Math.random()`

The helper is a debug action, not a simulation roll. Selection should be deterministic from the current fauna state.

### Nearest settlement

Use the existing `VillageInfo[]`/settlement data available to fauna. Do not scan settlement meshes or Three.js objects.

A one-off `wolves × villages` search from a DevTools command is acceptable. This is explicitly not a hot path.

## 5. Strategic target vs combat target

Keep these concepts separate.

```text
strategic target
    = settlement / village location

combat target
    = concrete NPC
```

The wolf should be able to move toward a settlement without pretending that the settlement itself is a combatant.

Recommended state is a small strategic reference such as:

```ts
strategicSettlementId: string | null
```

plus resolution through existing village data, or the smallest equivalent already present in `AnimalAgent`.

Do not store a `Settlement` object, scene node or `NpcAgent` in the strategic target.

The combat target should only exist once the wolf has locally perceived a valid NPC.

## 6. Frenzy changes existing predator behaviour

The intended semantic change is:

```text
normal wolf
    → settlement avoidance / human fear

frenzied wolf
    → reduced human fear
    → allowed to approach settlement
    → willing to attack a human
```

Do not special-case every movement branch with `if (frenzied)`.

Prefer changing the inputs/weights of the existing predator-human decision and settlement avoidance behaviour so the ordinary animal pipeline naturally produces the new behaviour.

A frenzied wolf may still use normal movement, stamina, obstacle handling, water rules and attack cooldowns.

## 7. Predator → NPC targeting

This is the largest missing fauna-side capability.

Current predator-human logic is centered on the player. Plan 179 needs the same concept for a nearby NPC.

Recommended flow:

```text
frenzied wolf
    ↓
local human perception
    ↓
player + nearby NPC candidates
    ↓
choose a concrete human target
    ↓
predator decision
    ↓
attack
```

Do not introduce a global `HumanTargetRegistry`.

### Candidate lookup

Use bounded/local data already available at the caller. The existing `countNearbyHumans()` helper demonstrates the intended performance direction: callers can precompute nearby NPC positions instead of every animal scanning every NPC.

For the actual combat target, the candidate must retain the concrete identity/reference needed to build the existing `CombatTargetHandle` for an NPC later.

Do not make `AnimalAgent` iterate over every NPC in the world every frame.

## 8. Target selection policy

V1 does not need sophisticated target scoring.

For a frenzied wolf inside a settlement context:

1. collect alive NPCs within the bounded perception/attack-interest radius;
2. reject invalid/stale NPCs;
3. choose the nearest valid NPC;
4. feed that human into the existing predator-human decision seam;
5. if the result is `attack`, move toward that NPC and use the existing animal attack contact path.

Keep target selection deterministic.

If two NPCs have exactly the same distance, use a stable identity tie-breaker rather than array order if practical.

Do not add personality/relationship scoring to wolves in this plan.

## 9. Animal damage to NPC

Do not create a second NPC damage system.

Plan 177 already provides the incoming NPC damage path:

```text
animal attack
    ↓
NpcAgent.applyIncomingCombatDamage(...)
    ↓
resolveIncomingNpcDamage()
    ↓
HealthState
    ↓
NpcAgent death/reaction
```

The existing animal bite damage table remains owned by `faunaCombat.ts` / `AnimalAgent` logic.

The only new work should be making the existing animal attack result able to target an NPC as well as the player/animal target types already supported by the current architecture.

Do not move animal-specific damage constants into `npcCombat.ts`.

## 10. NPC threat perception

NPC reaction must happen **before damage**.

The important distinction is:

```text
perception event
    ↓
pressure
    ↓
decision
    ↓
action
    ↓
possible combat damage later
```

Do not implement:

```ts
if (health.hp < health.previousHp) {
    fleeOrFight()
}
```

Damage may still reinforce the threat/reaction, but it must not be the first trigger.

## 11. Local NPC perception

Do not make every NPC scan every animal.

The cleanest architecture is to use a bounded lookup from the existing fauna/NPC update context.

Possible approaches, in order of preference:

1. reuse an existing local fauna lookup if one exists at the final edit point;
2. pass a bounded nearby-animal lookup into `NpcAgent` through the existing settlement/world hooks;
3. if neither exists, add a small spatially bounded query over the existing `Fauna.getAgents()` data, throttled to NPC decision cadence.

Avoid a new manager or registry solely for this feature.

The query should return only the small information needed by decision logic:

```text
animal id
kind
position
alive
aggressive/threatening state
```

The decision layer can then keep the selected threat reference.

## 12. Threat semantics

Use an explicit pressure meaning equivalent to:

```text
ImmediateAnimalThreat
```

The pressure should contain enough context to act on the threat, for example:

```text
threat animal id
threat animal kind
threat distance
threat direction / position
```

Do not make the pressure itself mean `fight`.

Correct:

```text
ImmediateAnimalThreat
    ↓
NPC decision
    ├── defend
    └── flee
```

Incorrect:

```text
ImmediateAnimalThreat
    ↓
combat()
```

The pressure is a current situation, not an action.

## 13. Pressure lifetime

The threat should be transient.

Recommended behaviour:

```text
wolf enters perception
    → threat pressure becomes active

wolf leaves threat range / dies / becomes non-hostile
    → threat pressure disappears
```

Do not persist a permanent NPC problem just because a wolf was seen once.

A short hysteresis/cooldown may be reused from existing NPC/animal perception patterns if necessary to prevent decision flicker, but do not add a large memory system here.

## 14. Defend vs flee

The exact scoring should reuse existing NPC decision/trait mechanisms.

Do not hardcode:

```ts
if (wolf) defend
else flee
```

The important inputs should be the same kinds of inputs already used by NPC decisions:

- immediate threat pressure;
- current health/injury state;
- carried weapon availability;
- relevant traits/personality/abilities;
- current action/context;
- possibly relationship/group context if the existing decision system already exposes it.

### Minimal V1 rule

If the existing decision system needs a simple deterministic baseline, use:

```text
capable combatant + immediate threat
    → defend has a positive score

no usable combat capability / badly compromised NPC
    → flee has a higher score
```

The exact numeric tuning should live in the existing scoring mechanism, not in a new `AnimalDefenseAI`.

## 15. Combat intent from NPC decision

When the NPC chooses `defend`, create the existing 177 intent:

```ts
npc.beginCombat({
  target: combatTargetForAnimal(...),
  mode: 'melee' | 'ranged',
})
```

The mode should be determined by the same carried-state rules already implemented by plan 177.

Do not duplicate weapon selection in plan 179.

If the NPC has a ranged weapon + compatible ammo and the existing 177 resolver can use it, pass `mode: 'ranged'`. Otherwise use the valid melee path. If neither is available, the decision should prefer `flee` rather than creating a combat intent that 177 will immediately reject.

## 16. Animal target handle

Plan 177 already has the generic `CombatTargetHandle` seam and `fauna/faunaCombat.ts` has `combatTargetForAnimal()`.

For NPC → animal:

```text
NPC decision
    ↓
selected AnimalAgent
    ↓
existing combatTargetForAnimal()
    ↓
CombatIntent
    ↓
NpcAgent.beginCombat()
```

Do not create `NpcAnimalTarget`, `AnimalCombatTarget`, or another target abstraction.

For animal → NPC, add the smallest symmetric adapter necessary for the existing `CombatTargetHandle` shape, ideally colocated with NPC combat/entity integration rather than in a new manager.

## 17. NPC flee

Flee must use the existing NPC movement/action machinery.

Do not create `AnimalFleeSystem`.

The threat pressure should result in a normal NPC action/strategy whose destination is away from the selected threat.

Use the existing movement helpers and watchdog if the flee action naturally passes through those mechanisms.

The flee target should be calculated from the threat position, not from a hardcoded settlement/player direction.

If the NPC is inside a settlement, it is acceptable for the existing movement system to choose a nearby safe position rather than attempting complex path planning.

## 18. Combat interruption / threat cleanup

A successful defense should replace the NPC's ordinary work/routine with combat through the existing `NpcAgent` phase/action mechanism.

When the combat ends:

```text
combat ends
    ↓
existing NPC decision flow resumes
```

Do not permanently change the NPC schedule.

When fleeing:

```text
flee action ends / threat gone
    ↓
normal decision flow resumes
```

If the wolf dies while the NPC is defending, the combat target should become invalid and 177 should end combat cleanly.

## 19. No new combat code in 179

Forbidden additions for this plan:

```text
NpcCombatManager
AnimalCombatManager
AnimalNPCCombat
ThreatManager
HumanTargetRegistry
NpcDefenseResolver
NpcDamageSystem
NpcHealthSystem
ArcherAI
NpcBowSystem
```

Plan 177 already solved the combat execution seam.

## 20. Performance

The dangerous implementation is:

```text
for every NPC:
    for every animal:
        check threat
```

or the inverse on every frame.

Prefer:

```text
bounded/local query
    ↓
small candidate list
    ↓
throttled NPC/animal decision
```

The DevTools `setFrenzyWolf()` command may do a one-off scan because it is not a simulation hot path.

Do not use a Web Worker.

Do not add a per-frame global registry update.

## 21. Tests

Prioritize pure behaviour tests.

### Frenzy

- `setFrenzyWolf()` chooses the nearest eligible wolf;
- repeated calls choose different non-frenzied wolves;
- already frenzied wolves are ignored;
- no eligible wolf means no mutation/spawn;
- frenzy changes the existing human-fear/attack decision as intended.

### Predator human targeting

- a frenzied wolf can select an NPC as a human target;
- dead NPCs are rejected;
- NPC outside the bounded perception range is rejected;
- selection is deterministic;
- existing player predator behaviour remains green.

### NPC threat

- threatening wolf produces `ImmediateAnimalThreat` before damage;
- threat disappears when the animal is dead/out of range/non-threatening;
- threat pressure does not directly invoke combat;
- decision can select defend or flee;
- defend creates a valid 177 combat intent;
- flee uses the normal NPC action path.

### Combat integration

- NPC defending against an animal can start melee combat through 177;
- NPC defending with bow/ammo can start ranged combat through 177;
- animal damage reaches NPC through the existing incoming-damage path;
- NPC death still uses the 177/NpcAgent owner path;
- invalid/dead combat targets terminate combat cleanly.

Prefer pure tests for scoring, target selection and pressure construction. Use only a small number of integration tests for the NPC/animal seam.

## 22. Browser verification scenario

The most useful manual scenario is intentionally simple:

```text
1. Start the game with a settlement loaded.
2. Open DevTools.
3. Call setFrenzyWolf().
4. Observe the selected wolf approaching the settlement.
5. Let it reach an NPC.
6. Confirm the NPC reacts before the first damage event when the wolf is
   clearly threatening.
7. Confirm the NPC chooses defend or flee through the normal decision path.
8. If defend is chosen, confirm 177 combat starts against that exact wolf.
9. Confirm animal → NPC damage works through the existing health/defense path.
10. Kill the wolf or let the NPC flee and confirm normal NPC behaviour resumes.
```

A second call to `setFrenzyWolf()` should produce another independent wolf; there is intentionally no pack coordination in V1.

## 23. Documentation / status notes

The plan currently says `Depends on: ~~177~~`, which is correct.

Do not add 150/162 as direct dependencies of 179. Those are already consumed by completed 177/its underlying combat implementation and are not behaviour dependencies of this plan.

The plan should remain `planned` until the implementation is actually complete. After implementation, update the plan's `Status:` and `docs/plans/README.md` according to the normal workflow.

## 24. Suggested implementation order

Recommended agent order:

1. Re-read `CLAUDE.md`, `docs/STATE.md`, plan 179 and this note.
2. Inspect the current 177 implementation and `CombatIntent` before touching combat code.
3. Identify the existing animal human-perception path in `AnimalAgent` and `predatorHumanDecision.ts`.
4. Extend predator-human perception/decision to support NPC humans without duplicating the player path.
5. Add runtime `frenzied` state and the `setFrenzyWolf()` debug command.
6. Add the smallest strategic settlement target representation needed by the existing fauna movement pipeline.
7. Add bounded wolf → NPC target selection.
8. Add bounded NPC → animal threat perception.
9. Add transient `ImmediateAnimalThreat` pressure through the existing NPC decision flow.
10. Add `defend` / `flee` scoring using existing decision/trait mechanisms.
11. Connect `defend` to `NpcAgent.beginCombat()` from plan 177.
12. Connect animal → NPC damage through the already implemented 177 incoming-damage seam.
13. Add focused tests.
14. Run typecheck/lint/build/tests.
15. Browser-test the complete wolf → NPC → defend/flee scenario.

Do not start by changing `src/combat/` unless the current code audit proves a genuine missing seam. The completed 177 implementation should already provide it.

## 25. Key decisions for the agent

```text
frenzy                 = runtime AnimalAgent state, not new species
frenzy persistence     = none in V1
strategic wolf target  = settlement, lightweight reference/data
combat target          = concrete NPC / AnimalAgent only after local perception
wolf target selection  = bounded + deterministic
NPC threat             = transient pressure, not combat command
NPC decision           = existing pressure → decision → action flow
NPC defend             = existing 177 CombatIntent
NPC ranged             = existing 177 ranged mode, no new ranged system
NPC flee               = existing movement/action pipeline
animal damage          = existing fauna damage + 177 NPC incoming damage seam
health/death           = existing HealthState + owning agent
coordination           = none between frenzied wolves
pack AI                = out of scope
new manager            = none
new worker              = none
```

> **Zrób git commit i push do main, rebase jeżeli trzeba**
