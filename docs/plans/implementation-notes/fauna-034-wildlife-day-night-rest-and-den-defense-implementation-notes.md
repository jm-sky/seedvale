# Implementation notes: fauna-034 — Wildlife day/night rest and den defense

**Plan:** [fauna-034](../fauna-034-wildlife-day-night-rest-and-den-defense.md)

## Verified current-code facts

- `AnimalDef` in `src/fauna/animalDefs.ts` is the canonical species tuning table. It already uses optional capability/config blocks (`roaming`, `trips`, `water`, `affinity`, etc.); activity and territorial tuning belong here rather than in `AnimalAgent` species switches.
- `AnimalUpdateContext` already carries both `dayFactor` and optional raw `timeOfDay`. `timeOfDay` was added for wolf/rooster vocalization specifically because `dayFactor` cannot distinguish dawn from dusk. Do not add another world-clock input; use `ctx.timeOfDay ?? 0.5` for activity calculations that need a phase.
- `createFauna().update(...)` already receives raw `timeOfDay` and derives `dayFactor` through the existing day/night path before calling wild `AnimalAgent.update()`. No new world-system dependency is required.
- `AnimalLifeState` owns hunger/thirst/shared `StaminaState`. `tickAnimalLife()` drains stamina only for sprint/swim and otherwise regenerates it. `STAMINA_REST_THRESHOLD = 0.35` already exists, but today it is used only by `wander()` to probabilistically extend idle time.
- Current fauna has a legacy night proxy: `AnimalAgent` stores `isNight = dayFactor <= 0`, and normal update calls `tickLife(..., SLEEP_HUNGER_THIRST_RATE)` whenever it is night and the animal is not sprinting. This means today **all** stationary/free-roaming fauna get the sleep hunger/thirst slowdown at full night regardless of species or whether they actually chose to rest. This is not a real activity cycle.
- Mounted animals bypass normal `update()` and `driveMounted()` receives `dayFactor` explicitly so the legacy night hunger/thirst slowdown is not stale. Do not break this path. `fauna-034` targets wild autonomous activity; mounted/livestock behaviour is out of scope.
- `faunaDecision.ts` is only the top-level threat/social override table. Its catch-all `predator-normal` / `prey-normal` branches delegate hunger/thirst/trips/roaming internally in `AnimalAgent`; needs are not separate top-level candidates. Routine rest should therefore be integrated inside the normal branch layer, not inserted above player/NPC/fire/scare branches unless the implementation first restructures the whole decision model (out of scope).
- `predatorHumanDecision.ts` is the one pure attack/flee/ignore scorer for both player and ordinary NPC encounters. `predatorIntentCommitment.ts` re-scores each tick with an encounter-frozen aggression roll, then holds adopted attack/flee for 2 s unless existing hard flee overrides break the hold.
- `PreySpawner` already contains stable `id`, `x`, `z`, `type`, `kind`, lifecycle state and quest pressure fields. `SpawnerType` is `rockDen | thicket | grove | wolfDen`.
- `createFauna.ts` already owns `spawnerById: Map<string, PreySpawner>` and the `agents` list. This is the correct ownership boundary for resolving an animal's `spawnPointId` back to its current habitat record. Do not move the map into `AnimalAgent` and do not add a den registry.
- `AnimalAgent.spawnPointId` identifies agents actually associated with a managed spawner. Ring spawns/livestock do not automatically have a managed spawner identity. Existing `home`/`currentRoamHome()` is the movement anchor and must remain the home-return destination; `spawnPointId` is identity/context, not a replacement movement coordinate.
- Existing `wolfDen` pack wolves carry the real den `spawnPointId`; this is already used by death accounting, quests and habitat pressure. `wolfDen` therefore needs no new membership mechanism.
- `fauna-028` update cadence keeps sensing/decision and `tickLife()` at full rate while movement behaviour may be throttled. New activity scoring must be cheap/pure and rest movement must tolerate accumulated movement `dt`; do not create a separate periodic timer/scheduler.

## Architectural decisions

### 1. Add one pure activity-policy module

Create `src/fauna/animalActivity.ts` (name may vary only if an equivalent fauna module already appears before implementation).

Keep it Three.js-free and make it own the small policy contract, for example:

- `AnimalActivityProfile = 'diurnal' | 'nocturnal' | 'crepuscular'`;
- primitive input type containing `profile`, `timeOfDay`, `dayFactor`, `staminaRatio`, tuning values and stable per-animal phase if used;
- a pure `activityRestPressure(...)` / `shouldRoutineRest(...)` seam;
- default thresholds/phase windows that are fauna-domain constants rather than `AnimalAgent` constants.

Do not create a schedule/FSM. Output should answer whether routine rest is desirable now (or a normalized pressure consumed by a small threshold), not create a persistent sleep timetable.

Use raw `timeOfDay` for `crepuscular`: `dayFactor` alone cannot identify dawn vs dusk. `diurnal`/`nocturnal` may use the same policy inputs for consistency.

If staggering is needed, derive it from stable `animalId` + coarse world-time bucket/phase using a deterministic helper. Never roll `Math.random()` per frame. Prefer a stable phase offset over repeatedly changing random decisions, so identical world state produces identical behaviour.

### 2. `AnimalDef` activity and territorial data

Add optional data blocks rather than booleans plus parallel tables. Suggested shape:

- `activity?: { profile; restBias; staminaThreshold?; ... }`
- `territorial?: { defendedSpawnerTypes; radius; attackBias; fleeReduction? }`

Exact field names can follow existing naming conventions, but keep the following invariants:

- absence means existing behaviour;
- livestock/rats remain absent in this plan;
- `wolf` is the initial required territorial species for `wolfDen`;
- do not infer den defense solely from `role === 'predator'` or from `spawnPointId !== undefined`;
- do not make `rockDen` automatically defended just because its name contains `Den`; opt-in must come from species/config + allowed spawner type.

Initial activity tuning should be conservative. Configure only wild species whose phase is intentional. Avoid pretending every species needs a distinct numeric threshold in V1; shared defaults plus profile/bias are preferable.

### 3. Preserve legacy physiology for non-opted-in fauna

There is a current behaviour discrepancy the source plan did not spell out: night already halves hunger/thirst growth for any non-sprinting free animal via `this.isNight`, independent of actual rest.

For species **without** the new `activity` config (livestock/rats and any intentionally untouched kind), preserve that legacy rule so `fauna-034` does not silently change them.

For species **with** the new activity config, hunger/thirst slowdown should track the actual routine-rest state rather than global `isNight`. Otherwise a nocturnal animal would still receive "sleep" metabolism during its intended active night.

Do not change `tickAnimalLife()` stamina semantics merely to make resting look stronger: it already regenerates stamina whenever not sprinting/swimming. Routine rest should primarily suppress voluntary movement so the existing regen can work. If V1 needs a small explicit rest-regen multiplier, put it in the activity policy/config and implement it through the existing stamina API, not a second energy pool; however prefer no multiplier unless playtesting proves normal regen too weak.

Do not alter `driveMounted()` metabolism behaviour in this plan. Mounted animals have no `activity` config in V1 and should retain the legacy path.

### 4. Routine-rest state belongs on `AnimalAgent`, but should be transient

A small transient boolean/enum such as `routineResting` is sufficient if needed for execution/presentation/metabolism. Do not persist it in `AnimalSaveState`; it is derived again from world time, stamina and current urgent state.

Do not add a new long-lived action scheduler. Reuse the existing normal predator/prey branch flow:

1. existing high-priority top-level decision resolves first;
2. inside `predator-normal` / `prey-normal`, existing committed trips and urgent food/water work retain precedence;
3. if no urgent/committed work is active, evaluate routine-rest desire;
4. if rest is desired and animal is not sufficiently near its existing roam home, move toward that home using existing movement/path/walkability helpers;
5. when near home, stay idle/rest until pressure drops or any existing higher-priority branch/need interrupts;
6. otherwise continue existing normal roaming.

Do not put `routine-rest` at a priority above `predator-normal` / `prey-normal` in `faunaDecision.ts`: that would bypass need/trip logic that currently lives inside those branches. It is acceptable for diagnostic `FaunaAiBranch` to remain `predator-normal`/`prey-normal` in V1; if the debug inspector genuinely needs to expose rest, add a subordinate diagnostic field rather than distorting arbitration just for labels.

### 5. Home return must reuse current movement ownership

Use the existing `home` / `currentRoamHome()` anchor. Do not use the spawner's `x/z` as a new movement authority when the agent already owns the correct roaming home.

This matters for existing special cases handled by `currentRoamHome()` (for example paddock/owned behaviour) even though they are not activity-configured in V1. Keep routine-rest evaluation gated to activity-configured wild animals before invoking home-return behaviour.

For a cave-backed persistent occupant, do not flatten its home route to a direct surface vector. Existing cave trip/home navigation must remain authoritative. If `fauna-034` activity config is not initially applied to cave residents, explicitly leave them unchanged rather than adding an unsafe shortcut through cave walls. If activity is applied to them, reuse the existing cave route/home movement seam used by return trips.

### 6. Resolve den-defense context at the `createFauna` ownership boundary

Do not give `AnimalAgent` the entire `PreySpawner` map and do not make `AnimalAgent` scan spawners.

For each wild agent update, `createFauna.ts` can perform an O(1) lookup when `agent.spawnPointId` exists:

`spawnerById.get(agent.spawnPointId)`

Adapt that record to a narrow plain-data update input, e.g. `{ id, type, x, z, state }`, or precompute the final territorial modifier before the call. Prefer a narrow habitat context because the pure territorial helper can then be tested independently and `AnimalAgent` stays unaware of spawner lifecycle implementation details beyond what it needs.

Do not expose quest-only `pressure`/`humanTaste` as territoriality inputs. `humanTaste` already has its own explicit scorer field and should continue to compose separately.

Defense requires all of:

- species has `territorial` config;
- `spawnPointId` resolves to a current managed spawner;
- the spawner type is explicitly allowed by the species config;
- spawner identity matches the animal association;
- animal is in ordinary autonomous predator-human encounter flow.

A missing/unknown `spawnPointId` or missing map entry must yield zero territorial modifier and preserve current behaviour.

### 7. Pure territorial-distance helper

Create a small pure helper either in `animalActivity.ts` only if cohesion remains good, or preferably `animalTerritory.ts` if activity and territorial logic would otherwise become unrelated.

Input should be primitive data: human X/Z, habitat X/Z, configured radius and tuning. Output should be a normalized `0..1` strength or a compact scorer modifier.

Use squared distance if the runtime helper is called per animal/tick and only needs threshold/falloff; `Math.hypot` is also acceptable at current fauna scale, but avoid allocations.

Use continuous falloff: strength `1` at/near the den, approaching `0` at defense radius. Outside radius return exactly `0`, which is important for regression tests proving ordinary predator-human behaviour is unchanged.

The modifier is based on **human distance to the habitat**, not animal distance to the habitat. The wolf may be slightly away from its den and still react to a human entering the defended area. Do not teleport/pull the animal to the den and do not manufacture an encounter when the predator has not noticed/targeted that human through existing perception.

### 8. Compose territoriality inside `predatorHumanDecision.ts`

Extend `PredatorHumanDecisionInput` with an optional numeric field such as `territorialDefense?: number` normalized to `0..1`.

Apply it in `scorePredatorHumanIntents()` as an explicit attack-pressure increase and/or flee-pressure reduction. Keep it separate from:

- `humanTaste`;
- hunger pressure;
- close/provoked aggression roll;
- `fireNearby`;
- human crowd fear.

Do not turn territoriality into an unconditional attack branch. Existing low-HP provoked flee, fire suppression and crowd suppression remain safety/context gates.

Because `resolveCommittedPredatorIntent()` already re-scores every call using the live input while holding the adopted result, den-distance drift automatically participates without a new commitment mechanism. Do not add a second den commitment timer.

One subtle boundary case: a wolf can enter the defense radius while a 2 s `flee` commitment is still held. The plan says den response should use existing commitment rather than oscillate at the boundary, so **do not** automatically break a held flee merely because territorial score rose. Let the existing hold expire, unless implementation identifies a genuinely hard territorial override and updates tests/documentation intentionally. Conversely, moving out of radius should not instantly break a held attack; existing commitment semantics already provide the desired hysteresis.

Apply the same territorial input shape to NPC-human scoring when the targeted NPC is inside the defended habitat radius. `predatorHumanDecision.ts` is shared; avoid player-only den behavior. The caller must compute distance from the actual targeted human to the habitat (player position for player encounter, selected NPC position for NPC encounter).

### 9. Perception remains authoritative

Do not expand `playerNoticeRange`, bypass `playerAwareness.ts`, or create a den trigger volume that directly starts combat. A predator defends a den only after the ordinary player/NPC sensing path has produced an active human encounter.

This preserves Sneak, facing, forest/day visibility, NPC target resolution and existing alert hysteresis.

A resting animal still executes full-rate sensing/decision under `fauna-028`; therefore ordinary threat selection can interrupt rest immediately without changing cadence.

### 10. Day/night activity must coexist with update cadence

`tickLife()` and sensing/decision already run every frame; movement may run at `immediate`/`active`/`routine` cadence. Evaluate activity/rest desire in the decision/sensing portion or otherwise from current inputs each update, but only execute return-home movement inside the existing behaviour movement section.

Do not add a rest timer that decrements only on movement cadence; it would run at different simulated rates depending on distance from the player. If any temporal hysteresis is needed, decrement it with real frame `dt` in the full-rate section.

A routine-resting animal should remain `routine` importance unless an existing immediate condition activates. Do not mark rest itself as `immediate`; that would defeat fauna-028's optimization.

## Suggested implementation seams

### `src/fauna/animalDefs.ts`

Add activity/territorial config types and optional `AnimalDef` fields. Keep all numeric tuning centralized here/default helpers rather than scattered in `AnimalAgent`.

### `src/fauna/animalActivity.ts`

Pure activity/rest-pressure policy, deterministic phase/stagger helper if needed, unit tests in `animalActivity.test.ts`.

### `src/fauna/animalTerritory.ts`

Optional separate pure module for defended-habitat eligibility and distance falloff. Prefer this split if activity module would otherwise mix unrelated concerns. Unit tests should use plain records only.

### `src/fauna/createFauna.ts`

Reuse `spawnerById` to adapt `spawnPointId` into narrow habitat context for wild updates. No placement/generation/state mutation. Do not change `spawnerId()`, spawner construction, `SPAWNER_RADIUS`, respawn, depletion or recovery logic.

### `src/fauna/AnimalAgent.ts`

Consume activity policy in the normal predator/prey execution path; retain transient rest state only if needed. Reuse current home-return/movement/walkability mechanisms. Compute player/NPC territorial strength from narrow habitat context and pass it to the existing human-intent input.

Preserve current `AnimalUpdateContext.timeOfDay` optional default. No new clock pipeline.

### `src/fauna/predatorHumanDecision.ts`

Only scorer composition changes: optional territorial strength, deterministic score contribution, no new encounter state.

### `src/fauna/predatorIntentCommitment.ts`

Ideally no production change. Extend tests to prove territorial input re-scores under the existing hold rules. Change production code here only if a concrete hard-override requirement emerges; the current plan does not require one.

### `src/fauna/faunaDecision.ts`

Prefer no structural production change. Rest belongs below its `predator-normal`/`prey-normal` catch-all because urgent needs/trips are also below that boundary. Update tests/types only if a diagnostic surface requires it.

## Tests

### Activity policy

New pure tests should cover at least:

- nocturnal profile: stronger rest pressure during daylight than night;
- diurnal profile: stronger rest pressure during night than daylight;
- crepuscular profile: dawn/dusk differs from noon and midnight using raw `timeOfDay`;
- low stamina increases rest desire, but healthy stamina alone does not force synchronized sleep;
- deterministic staggering returns the same result for identical id/time inputs if staggering is implemented;
- no `Math.random()` dependency.

### Runtime rest integration

Use the lightest existing `AnimalAgent` test seam; do not construct a full world just to test policy. Verify:

- urgent thirst/hunger/committed trip wins over routine rest;
- player/NPC/fire/scare branches interrupt rest through the existing top-level decision;
- a tired activity-configured wild animal returns toward its existing home before settling;
- once near home, routine rest does not select a new wander target;
- activity-unconfigured livestock/rat behaviour retains legacy night metabolism;
- configured nocturnal wild animal is not given the old blanket night "sleep" metabolism while active;
- time skip remains physiology-only; do not simulate movement-to-den during `resolveTimeSkip()`.

### Territorial helper/scorer

Extend `predatorHumanDecision.test.ts` and add helper tests as appropriate:

- `territorialDefense = 0` yields exactly the pre-plan scoring/result for representative wolf/fox/bear cases;
- strength rises toward den center and is exactly 0 outside radius;
- wolf near defended `wolfDen` gains attack pressure/reduced flee pressure;
- same wolf with unrelated/missing spawner context gets no modifier;
- fire and crowd still suppress close/retaliation attack rolls as before;
- provoked low-HP flee remains a hard override;
- `humanTaste` and territorial defense compose independently;
- held attack/flee intent is not boundary-thrashed by territorial strength changes during the existing commitment window;
- NPC target uses that NPC's den distance, not player distance.

### Spawn/worldgen regression

No test should need new expected coordinates. Existing `AnimalSpawner` / `createFauna` spawn tests should remain unchanged except any typing needed for the narrow update context. Add an explicit assertion only if useful that the implementation never mutates `spawner.x/z` or spawn construction inputs.

## Performance / ownership guardrails

- no spawner scan per animal; use existing `spawnerById.get()`;
- no new per-frame arrays/maps for territorial lookup;
- no scene graph search to find den meshes;
- no terrain/vegetation generation for rest;
- no new worker; the policy/scoring cost is trivial and coupled to per-agent decisions;
- no persistence schema change;
- no camera/visibility input to activity cycle;
- no movement/rest simulation in a second update loop;
- no `VigorState` import into fauna.

## Implementation order

1. Add activity + territorial config types to `animalDefs.ts` and pure `animalActivity.ts` / `animalTerritory.ts` helpers with tests.
2. Wire activity-configured wild species into normal predator/prey routine flow; preserve legacy metabolism for unconfigured species.
3. Reuse `spawnerById` in `createFauna.ts` to provide narrow managed-habitat context to the associated wild agent.
4. Extend `PredatorHumanDecisionInput` and scorer with territorial strength; add scorer tests before touching commitment semantics.
5. Feed player and NPC habitat-distance strength from `AnimalAgent` encounter construction; verify existing `predatorIntentCommitment` hold behavior without adding a second timer.
6. Add focused integration/regression tests around rest interruption/home return and unchanged out-of-radius predator behavior.
7. Typecheck, targeted tests, lint, build. Browser verification remains for the User.

Add concise JSDoc with `@domain fauna` to the new public/pure activity and territorial seams so preflight/code-map discovery can find them.

> **Zrób git commit i push do main, rebase jeżeli trzeba**