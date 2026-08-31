# Implementation notes — NPC & Animal Target Commitment

**Plan:** `docs/plans/npc-005-npc-animal-target-commitment.md`
**Status:** planned
**Purpose:** provide Claude Code with a focused implementation map based on the current `main` codebase; avoid repeating broad recon.

## 1. Review of the plan

The plan direction is correct, but implementation must avoid introducing a second target abstraction where the code already has a usable combat target contract.

The important architectural distinction is:

```
decision/scoring
    ↓
select target
    ↓
commit target
    ↓
strategy/action/combat
    ↓
validate target
    ↓
release only when invalid/interrupted
```

Do **not** turn every existing `if/else` into utility scoring. Existing conditionals can remain lifecycle gates and interrupt handling.

Do **not** create a global `TargetManager`.

The plan should be implemented as a small extension of existing ownership in `NpcAgent` and `AnimalAgent`, with a reusable primitive only if the actual current types make that worthwhile.

## 2. Current code anchors

### NPC

Primary file:

```
src/ai/NpcAgent.ts
```

Relevant existing mechanisms:

- `beginCombat()`
- `applyIncomingCombatDamage()`
- existing combat target handling
- `senseImmediateAnimalThreat()`
- `reactToAnimalThreat()`
- `resolveTimeSkip()`

Animal-threat decision:

```
src/ai/npcAnimalThreat.ts
```

Use the existing `decideAnimalThreatResponse()` for defend/flee. Do not replace it with a new matrix.

Combat:

```
src/ai/npcCombat.ts
src/combat/combatIntent.ts
```

`CombatTargetHandle` is already the stable identity/contract used by combat. Reuse it rather than creating a parallel combat-target representation.

### Animals

Primary file:

```
src/fauna/AnimalAgent.ts
```

Relevant paths:

- predator/prey target selection,
- NPC targeting,
- chase,
- attack,
- frenzy state,
- existing strategic village target,
- combat target handling.

Predator → human scoring:

```
src/fauna/predatorHumanDecision.ts
```

Fauna combat:

```
src/fauna/faunaCombat.ts
```

Hunter integration:

```
src/fauna/huntingHooks.ts
```

### Utility selection

```
src/simulation/scoreActions.ts
```

Existing `pickHighestScore()` is sufficient for candidate selection. The missing concern is persistence of the selected target after the decision.

## 3. Recommended implementation shape

Prefer a small target commitment abstraction with **identity + lifecycle**, not a large manager.

Conceptually:

```ts
type TargetCommitment<T> = {
  target: T
  committedAt?: number
  reason?: string
}
```

However, before creating this exact type, inspect the existing target types and determine whether a simpler per-agent field is sufficient.

The abstraction must not own world entities and must not perform discovery.

Possible minimal API:

```text
commit(target)
getTarget()
hasTarget()
clearTarget()
```

Validation should remain contextual because an NPC and a wolf have different definitions of "valid".

Therefore prefer:

```text
agent owns commitment
agent owns validation predicate
decision system owns scoring
```

rather than putting validation rules into a generic target class.

## 4. Important distinction: strategic target vs combat target

Do not collapse these into one concept.

Example:

```text
frenzy wolf:
  strategic target = village
  ↓
  detects NPC
  ↓
  combat/engagement target = NPC
```

Once the wolf commits to NPC A, its village destination must no longer compete with NPC A on every update.

Similarly:

```text
hunter:
  hunt strategy target = deer A
  ↓
  movement/combat uses deer A
```

Do not replace existing strategy state with a generic target field unless recon proves they are semantically identical.

## 5. AnimalAgent: target stability

Focus on all places in `AnimalAgent.ts` where a target is selected during normal update.

For each occurrence:

1. identify candidate discovery,
2. identify selection/scoring,
3. identify where the result is consumed,
4. determine what currently invalidates it.

Change the lifecycle from:

```
every update:
  discover candidates
  select target
  act
```

to:

```
if target exists and is valid:
  act on current target
else:
  discover/select
  commit
  act
```

Do not call candidate selection every frame for an already committed target.

### Frenzy specifically

Current observed problem:

- frenzy wolf reaches the village,
- NPCs can be detected,
- wolf can attack intermittently,
- target/direction can oscillate.

The intended flow is:

```
frenzy
  ↓
move toward village
  ↓
first valid NPC selected
  ↓
commit NPC
  ↓
chase/attack same NPC
```

The presence of a closer NPC must not replace the committed target automatically.

After the NPC becomes invalid, clear the commitment and permit a new selection.

Do not use the village center as an active movement target once an NPC target has been committed.

Frenzy must continue to bypass fire avoidance using the existing `!this.frenzied` guard. Do not broaden that behavior to normal predators.

## 6. Predator/prey target switching

Find the current wolf/deer and other predator/prey candidate-selection call sites.

Do not assume every target lookup is wrong.

Some perception calls may legitimately need to run every update to detect threats. The distinction is:

```
perception can refresh
target selection should not necessarily refresh
```

Keep sensing current while keeping the chosen target stable.

A closer prey animal should not cause a switch merely because its distance changed.

Target release should use existing ecological/combat rules where available rather than inventing a generic distance timeout.

If the current system has no meaningful "lost prey" rule, introduce the smallest explicit condition needed and cover it with tests.

## 7. NPC animal-threat response

Do not rewrite:

```
senseImmediateAnimalThreat()
→ decideAnimalThreatResponse()
→ defend/flee
```

Instead ensure that once the response chooses a concrete animal:

```
defend
  ↓
commit that animal
  ↓
existing CombatIntent / beginCombat
```

For flee, preserve the existing movement/flee pipeline. Commitment should not turn fleeing into permanent fixation on the attacker if the current flee implementation is intentionally destination-based.

The NPC must still be able to choose flee when fighting is inappropriate.

## 8. NPC combat target

Inspect existing combat target lifecycle in `NpcAgent.ts` and `npcCombat.ts` before adding any new field.

If combat already stores a stable `CombatTargetHandle`, do not duplicate it with another combat-specific target.

The important fix is to prevent higher-level decision code from overwriting an active combat target.

Expected:

```
NPC attacks wolf A
  ↓
wolf B appears
  ↓
NPC keeps wolf A
```

until the existing combat target becomes invalid or combat ends.

## 9. Animal → NPC hit integration

The plan must preserve the existing attack callback architecture.

Trace:

```
AnimalAgent attack
  ↓
onNpcHit(...)
  ↓
NPC damage handling
  ↓
ImmediateAnimalThreat / response
```

Do not add a second damage path.

If the current callback lacks attacker identity and the NPC threat system needs it to establish a concrete target, extend the existing callback minimally with the animal identity/handle.

Do not pass an entire `AnimalAgent` object into unrelated layers if an existing stable identifier/handle is available.

The goal is:

```
wolf attacks NPC A
→ NPC A knows the attacker is wolf X
→ existing animal-threat decision can defend/flee
```

not merely:

```
wolf attacks NPC A
→ HP decreases
→ NPC continues drinking water
```

## 10. Utility / hysteresis

Do not introduce arbitrary numeric thresholds until current score ranges are inspected.

First implement commitment stability.

Only add hysteresis if there is a real requirement for an agent to reconsider a still-valid target.

If needed, prefer:

```
newScore > currentScore + switchThreshold
```

over:

```
newScore > currentScore
```

But for combat/pursuit, invalidation/end-of-strategy should normally be the primary release mechanism.

## 11. Generic abstraction placement

Before adding a new shared file, inspect whether the existing architecture has an appropriate shared location for small AI primitives.

Avoid placing target commitment in:

- `NpcAgent.ts` if it is intended to be shared,
- `AnimalAgent.ts` if it is intended to be shared,
- `combat/` if it is not combat-only.

If the abstraction is genuinely generic, place it in the existing AI/shared simulation area that best matches current repository conventions.

Do not create a new directory solely for one small type.

## 12. Tests

Current tests generally prefer pure exported functions over constructing full THREE/NPC/fauna agents.

Follow that convention.

Good unit coverage should target the commitment lifecycle without requiring live GLTF/THREE scenes:

- commit stores target,
- committed valid target is reused,
- invalid target is released,
- no automatic switch to a merely better target,
- new target can be selected after release.

For integration-level NPC/fauna behavior that requires live agents, rely on existing browser verification rather than building a large new test harness.

Do not create an elaborate mock world just for this plan.

## 13. Search checklist for Claude Code

Before editing, run focused searches for:

```text
senseNpcThreat
target selection in AnimalAgent
nearest prey / predator selection
beginCombat
CombatTargetHandle
CombatIntent
senseImmediateAnimalThreat
reactToAnimalThreat
decideAnimalThreatResponse
beginHuntExpedition
hunting target
onNpcHit
nearbyAnimalThreats
nearbyNpcs
frenzied
strategicVillage
```

Then map every target-selection path to one of:

```text
A. transient perception only
B. strategic target
C. combat target
D. escape/threat context
```

Only B/C/D need commitment semantics.

## 14. Avoid these mistakes

Do not:

- recompute and overwrite target every tick,
- make `pickHighestScore()` itself stateful,
- put target state in a global manager,
- make all AI decisions use one giant matrix,
- make all if/else disappear,
- add a generic distance timeout without domain justification,
- make frenzy a special combat engine,
- duplicate `CombatTargetHandle`,
- make NPCs always fight wolves,
- bypass existing defend/flee scoring,
- scan all NPCs/animals globally,
- move this work to a worker.

## 15. Expected end state

The code should make this invariant obvious:

```text
Utility/scoring:
  "this is the best target now"

Commitment:
  "this remains my target"

Validation:
  "this target is no longer usable"

Release:
  "make a new decision"
```

Examples:

```text
Wolf → Deer A
Deer B gets closer
→ keep Deer A

Wolf → NPC A
NPC B gets closer
→ keep NPC A

NPC → Wolf A
Wolf B appears
→ keep Wolf A

Target dies / becomes invalid
→ release
→ next decision may select another
```

## 16. Verification commands

Run the repository's existing verification commands after implementation, using the package manager/scripts actually present in the current repo.

At minimum verify:

- typecheck,
- lint,
- build,
- tests.

Do not launch browser/headless browser automation. Browser verification is manual.

Manual scenarios:

1. wolf hunts deer and does not oscillate between deer,
2. frenzy wolf enters village and commits one NPC,
3. frenzy wolf ignores fire,
4. NPC attacked by wolf reacts,
5. NPC chooses defend when appropriate,
6. NPC chooses flee when appropriate,
7. multiple nearby targets do not cause per-tick target switching,
8. target death/loss causes release and allows a new target.

## 17. Documentation

If implementation changes the actual architecture beyond what the plan currently states, update the plan/notes accordingly.

Do not mark the plan implemented merely because tests pass; browser verification remains manual.

After implementation update the plan status/checklist according to repository conventions.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
