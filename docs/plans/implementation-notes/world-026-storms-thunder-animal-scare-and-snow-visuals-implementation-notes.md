# Implementation notes: world-026 — Storms, thunder, animal scare and snow visuals

Recon against `main` on 2026-09-12. These notes intentionally resolve implementation seams that are not obvious from the plan; current code remains authoritative if it changes before implementation.

## 1. Current ownership to preserve

### Weather state and deterministic history

`src/world/weather.ts` is the canonical weather model.

- `WeatherType = 'clear' | 'cloudy' | 'rain' | 'fog' | 'snow'`.
- `computeWeather(seed, elapsedDays, season)` hashes `cycleIndex = floor(elapsedDays / WEATHER_CYCLE_DAYS)` and returns the whole cycle snapshot. It is pure and is also replayed by bounded historical consumers.
- `ClimateState` is only a mutable runtime cache/debug override around the pure model; do **not** put lightning history or timers into it.
- `WEATHER_CYCLE_DAYS = 0.3`; surface-weather and exposure helpers intentionally replay cycle snapshots, so adding `storm` must update their precipitation semantics too.
- `hash01()` is currently private to `weather.ts`. Do not import terrain noise just to obtain randomness. If storm-event/scare code needs the same style of stable hashing, extract a tiny world/shared deterministic hash helper or keep domain-local pure hashes with explicit salts; do not introduce a stateful RNG.

Recommended weather change:

```ts
export type WeatherType = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow'

export function isRainWeather(type: WeatherType): boolean {
  return type === 'rain' || type === 'storm'
}
```

Use `isRainWeather()` only where the semantics are genuinely precipitation/wetness. Do not mechanically replace every `type === 'rain'`: presentation and NPC pressure need storm-specific tuning.

### Existing rain-like call sites found in recon

At minimum inspect/update these together:

- `src/world/weather.ts`
  - `computeSurfaceWeather()` — storm must feed wetness like rain, probably with the same intensity input.
  - `computeRainExposureDays()` — storm must count as rain exposure; this affects blood fading and any other callers of this helper.
- `src/world/playerGarden.ts` — it currently checks `weather.type === 'rain'` directly while replaying deterministic cycles. Reuse `isRainWeather()` so storm hydrates gardens.
- `src/ai/weatherPressure.ts` — currently only rain/snow produce `seekShelter`. Storm should be a distinct severe rain profile, not merely inherit ordinary rain thresholds accidentally.
- `src/world/weatherParticles.ts` — storm should activate the existing rain emitter with stronger presentation; no second particle system.
- `src/audio/weatherSounds.ts` — ordinary rain loop is currently rain-only.
- `src/world/weatherVisuals.ts` and `src/world/clouds.ts` — both have exhaustive `Record<WeatherType, ...>` tables, so TypeScript will force a storm profile.

Search again for direct `WeatherType` records / `type === 'rain'` before coding because this union is intentionally exhaustive in several presentation modules.

## 2. Storm probability and intensity

Extend the existing tables in `weather.ts`; do not add a storm calendar.

The current seasonal weights are:

- spring: clear 3 / cloudy 4 / rain 4 / fog 3 / snow 0,
- summer: 6 / 3 / 2 / 0.5 / 0,
- autumn: 2 / 4 / 4 / 3 / 0.5,
- winter: 2 / 3.5 / 0.5 / 1.5 / 4.

Add storm as a low weight concentrated in spring/summer, lower in autumn and zero or near-zero in winter. Keep the total frequency noticeably below ordinary rain. `computeWeather()` already supplies a deterministic `intensityRoll`; reuse it rather than adding mutable intensity state.

`temperatureFor()` also has an exhaustive `WEATHER_TEMPERATURE_DELTA` record. Give storm its own delta, semantically close to rain.

Debug forced weather is already `ClimateState.forced: WeatherType | 'auto'`; extending `WeatherType` automatically makes `storm` available to the existing forced-weather path once the GUI options are sourced from the type list/current weather choices. Verify that GUI list rather than creating a storm-only debug switch.

## 3. Important architectural constraint: current weather is global, not spatial

There is currently **no spatial weather-cell/front system**. Weather is one global cycle snapshot derived from `(seed, elapsedDays)`. Therefore do not make lightning position depend on player/camera position merely to ensure a nearby strike: that would make the world event camera-dependent and violate Seedvale's simulation rules.

For V1 keep the meteorological schedule global and deterministic. A lightning event should contain a deterministic event identity plus presentation/scare parameters; if an absolute strike `x/z` is introduced, it must be derived from world-stable inputs, never from current player/camera coordinates.

If the current code at implementation time still has no stable world-space storm-region anchor, prefer a **non-positional/global thunder event with deterministic simulated distance/strength** over inventing player-relative `x/z`. In that case adapt the plan's draft `AnimalScareStimulus` shape to the actual architecture, e.g. source/eventId/strength/radius-equivalent acoustic strength, and let the bounded livestock adapter apply it to already-local candidates. Do not create a fake spatial weather grid solely to satisfy the draft type example.

This is the main plan/code discrepancy found by recon: the plan sketches `x/z`, while current canonical weather has no spatial ownership from which a strike coordinate can honestly be derived.

## 4. Deterministic lightning schedule: keep it pure

Prefer a small new world module such as `src/world/stormEvents.ts` rather than growing `weather.ts` with runtime presentation logic.

Suggested pure contract:

```ts
export type LightningEvent = {
  eventId: string
  cycleIndex: number
  slot: number
  flashAtDays: number
  strength: number
  simulatedDistanceM: number
  thunderDelaySec: number
}

export function lightningEventsForCycle(
  seed: number,
  weather: WeatherState,
): readonly LightningEvent[]
```

Key points:

- only return events when `weather.type === 'storm'`;
- derive count/slot occurrence/strength/distance from `(seed, cycleIndex, slot, salt)`;
- keep a small fixed maximum slot count per weather cycle so generation is O(1);
- `eventId` must be reproducible from stable inputs, e.g. `storm:${cycleIndex}:${slot}` plus seed namespace if necessary;
- `flashAtDays` must lie inside `weather.startedAt..endsAt`;
- `thunderDelaySec` is presentation time derived from simulated distance, not a second random roll at playback time;
- no `Math.random()` in event occurrence, event identity, scare roll or thunder variant selection.

Do not persist these events. Save/load derives the same schedule from world time.

### Crossing semantics in `gameLoop.ts`

`gameLoop.ts` already owns the per-frame sequence: `tickDayNight` / `tickClimate`, day-night/weather presentation, `weatherParticles.update`, `weatherAudio.update`, then the rest of live simulation. This is the correct integration layer for detecting that world time crossed a lightning `flashAtDays`.

Keep a tiny runtime cursor/last elapsed-days value in the game-loop closure (or a dedicated lightweight storm runtime object), not in save data. On ordinary frames emit only events whose `flashAtDays` crossed between previous and current `elapsedDays`.

For large time skips / restore, **do not replay a backlog of historical lightning/thunder one-shots**. Advance the cursor to the new world time and resume from future events. Deterministic world state does not require retroactively playing presentation events the player skipped.

## 5. One event identity, two moments: flash and thunder

The physical/presentation sequence is flash now, thunder after `thunderDelaySec`. Keep the same `eventId` through both moments.

Do not let `weatherSounds.ts`, fauna and visuals independently regenerate/roll the event. The orchestration seam should resolve one `LightningEvent`, then:

```text
cross flashAtDays
→ start short visual flash for eventId
→ enqueue delayed thunder for same eventId
→ when delay expires:
   → play thunder variant
   → emit AnimalScareStimulus for same eventId
```

This makes "same concrete event" testable and prevents audio/fauna divergence.

A small pending queue is sufficient because the cycle schedule is bounded. It is runtime-only and should be cleared/disposed with the app-level weather presentation lifetime.

## 6. Lightning flash: layer over existing lighting, never mutate day/night base

`src/app/gameLoop.ts::applyDayNight()` currently computes `skyParamsFromTime()`, applies `applyWeatherOverlay()`, then writes sun/ambient/hemi intensity. `weatherVisuals.ts` owns the weather overlay profile.

Do not permanently write flash values into `DayNightState`, `WeatherState`, sky time or terrain materials.

Clean seam:

- add a tiny runtime flash envelope (`0..1`) driven from a received `LightningEvent`;
- extend `applyWeatherOverlay(...)` with an optional flash factor **or** apply a final multiplicative/additive light boost immediately after its normal result in `applyDayNight()`;
- ensure the next normal `applyDayNight()` call naturally restores the baseline.

Be aware that `gameLoop.ts` deliberately throttles day/night/weather visual reapplication (`DAY_NIGHT_APPLY_THRESHOLD`). A short flash cannot rely on waiting for the ordinary day/night threshold. While a flash envelope is active, force the lighting overlay to be applied each frame (cheap light/fog writes only), then return to the existing throttled path. Do not rebuild chunks/materials.

Storm's static visual profile belongs in `WEATHER_VISUAL_PROFILES`; flash is a transient overlay and should not be encoded as a fake weather type/intensity mutation.

## 7. Clouds and precipitation reuse

`src/world/clouds.ts` already has:

- fixed `CLOUD_COUNT = 28`,
- `light` / `dense` categories,
- pure `cloudCategoryWeightsFor(weather, season?)`,
- `cloudAppearanceFor(...)`,
- gradual category turnover only when sprites are assigned/recycled.

Add `storm` to both exhaustive weather tables and bias it heavily toward `dense`; do not force-reassign all sprites on storm start and do not add a storm cloud scene graph.

`src/world/weatherParticles.ts` already has one fixed GPU rain emitter (`RAIN_MAX_COUNT = 900`) and one snow emitter (`SNOW_MAX_COUNT = 500`). Per-frame JS updates only uniforms and emitter transform. For storm:

- reuse `rain` emitter;
- treat `storm` as rain-active;
- if stronger storm rain is needed, change only uniforms/density/opacity/drift/size through a storm multiplier bounded by the same fixed `RAIN_MAX_COUNT` and quality ceiling;
- do not allocate another geometry or upload per-particle data each frame.

## 8. Snow shader fix is local and cheap

Current bug is explicit in `weatherParticles.ts`:

- `SNOW_WIDTH_FRAC = 1`,
- fragment shader only applies a horizontal streak mask when `uWidthFrac < 0.999`,
- therefore snow uses the entire square point sprite.

Do not solve this with a texture or CPU particle changes. The simplest safe change is to give the shader an emitter shape discriminator (`uSnow` / `uShape`) or infer the snow branch from an explicit uniform, then use `gl_PointCoord` for a feathered radial/irregular alpha mask.

Example shape logic conceptually:

```glsl
vec2 p = gl_PointCoord - vec2(0.5);
float r = length(p);
float edge = 1.0 - smoothstep(0.34, 0.5, r);
// optional very cheap lobe modulation from angle / abs(p.x*p.y)
if (edge <= 0.001) discard;
alpha *= edge;
```

Keep rain's existing thin-streak mask unchanged. Preserve `aRandom`, `uTime`, size variation, fall speed, drift, `uVisibleFraction`, `qualityCeiling`, fixed buffers and no per-frame attribute uploads.

Tests should assert shader/config contract at the module level where practical; visual correctness still needs User browser verification.

## 9. Weather audio: reuse mixer and cave seam

`src/audio/weatherSounds.ts` currently owns exactly one lazy shared non-positional rain loop and receives `inCaveInterior` from `gameLoop.ts`. `createWorldAudio.ts` already supplies:

- `createLoop()` on ambient bus,
- `playOnce()` for non-positional SFX,
- `playAt()` for world-position distance attenuation,
- buffer caching and shared mixer buses.

Do not add WebAudio plumbing or a second cave detector.

Recommended V1 shape:

- keep ordinary rain loop;
- add a storm wind/strong-rain loop only if an asset exists; otherwise reuse rain with a storm gain profile and leave the missing layer documented;
- thunder one-shots use `worldAudio.playOnce()` if the V1 event stays non-positional, or `playAt()` only if a legitimate world-stable strike coordinate exists;
- select thunder clip variant deterministically from `eventId`/event hash, not `Math.random()`;
- cave attenuation must use the already-passed `inCaveInterior` flag. For one-shots, apply a reduced volume rather than inventing cave acoustics.

`WeatherAudio.update()` currently has no `dt` and no event input. If delayed thunder scheduling is kept in a storm runtime above audio, keep `WeatherAudio` simple: loops in `update(weather, inCaveInterior)` plus a new `playThunder(event, inCaveInterior)` method. This is preferable to hiding the authoritative delay/event cursor inside audio, because fauna must react to the same delayed event.

## 10. Audio assets are currently missing for storms

`docs/assets/SOUNDS.md` currently has wired rain (`S07`) and no thunder/storm rows. `public/sounds/README.md` is the inventory source of truth for actual files.

Implementation must not invent asset paths. Before wiring thunder/storm wind, inspect `public/sounds/README.md` / `public/sounds/` again. If absent:

- add explicit `needed` entries to `docs/assets/SOUNDS.md` for thunder variants and storm wind/heavy-rain layer;
- code may support an empty thunder URL pool as a silent no-op only if that pattern is already acceptable in the audio layer, otherwise land the deterministic event/flash/scare plumbing and leave audio asset wiring pending;
- once files exist and are wired, update both `docs/assets/SOUNDS.md` and `public/sounds/README.md` with provenance/license.

Do not block snow polish or simulation/scare logic on missing audio assets.

## 11. Generic animal scare belongs in fauna, not weather

Create a small pure fauna module, preferably `src/fauna/animalScare.ts`, for stimulus typing, probability and stable roll. Weather should know only that it emits a scare stimulus; it must not know livestock ownership, home, herd or movement internals.

Suggested separation:

```ts
export type AnimalScareStimulus = {
  source: 'thunder'
  eventId: string
  strength: number
  // optional spatial fields only if backed by real world-space event data
}

export type AnimalScareContext = {
  animalId: string
  fearBaseline: number
  distanceFactor?: number
  homeDistanceFactor?: number
  ownerNearby?: boolean
  herdNearby?: boolean
  sheltered?: boolean
}

export function animalScareProbability(...): number
export function animalScareRoll(eventId: string, animalId: string): number
export function shouldAnimalFleeFromScare(...): boolean
```

Keep the pure resolver independent of `THREE`, `AnimalAgent` and settlements so it is cheap to unit test.

### Species baseline

`src/fauna/animalDefs.ts::AnimalDef` is the canonical per-species tuning data. If a fear baseline is needed, add one reusable data field there (e.g. `scareSensitivity`) rather than a `switch(kind)` in weather or `animalScare.ts`.

Do not reuse `fleeRange` as fear sensitivity: it is explicitly predator-detection distance for prey and is `0` for some domestic/guard roles, so its semantics are wrong for thunder susceptibility.

## 12. Bounded livestock integration already has the right adapter

Do **not** scan all fauna from `gameLoop.ts` per animal.

`src/settlement/livestock.ts::tickSettlementLivestock()` is the shared per-frame adapter for settlement-owned livestock and detached/player-owned persistent livestock. It already receives bounded contextual arrays and forwards them to each `AnimalAgent.update()`:

- `nearbyPredators`,
- `nearbySettlementNpcs`,
- `nearbyRats`,
- `playerControlPos`,
- settlement-local `livestock` as `others`.

Extend this adapter with an optional current/pending scare stimulus (or a very small readonly list if overlapping thunder is allowed). It is the correct place to avoid repeated global lookup work and to pass the same event to each candidate animal.

`SettlementsManager` already calls this same helper for detached livestock; preserve that single update path.

For V1 the plan explicitly asks for livestock reaction, so do not also thread thunder through ordinary wild `Fauna.update()` unless scope is intentionally expanded. The `AnimalScareStimulus` resolver should still be generic enough for wild fauna later.

## 13. Owner/home/herd context available today

Use only cheap context that already exists.

### Home

Every `AnimalAgent` already owns a stable `home` vector and ordinary movement is home-bounded (`ROAM_RADIUS` / `clampBounds()` outside committed trips/player-owned exceptions). Home distance is therefore available locally without a world query.

Do not duplicate a persisted storm-home field.

### Household owner / nearby owner NPC

Household livestock already has `ownerHouseId`. `tickSettlementLivestock()` already receives `nearbySettlementNpcs`; `NearbyNpcCandidate` includes the NPC identity/home information used by dog logic. Use that bounded array to check whether an NPC whose `homeId === animal.ownerHouseId` is nearby, if the exact candidate shape still exposes it at implementation time.

Do not search all settlements/NPC registries from each animal.

### Herd/social

`AnimalAgent` already has herd/mother cohesion (`herdId`, `pickHerdLeader`, `HERD_*` helpers) and `others` is the local livestock array. If a cheap herd-nearby multiplier can be derived from that already-local list, use it. Otherwise omit it in V1 rather than add a new social registry.

### Shelter/interior

There is no verified generic livestock shelter/interior query in the current update context. Cave interior exists for cave-bound animals and player/camera channels, but household livestock shelter is not a general world service. Do **not** create a shelter system in this plan. Omit this multiplier unless current code has gained a cheap canonical query by implementation time.

## 14. Stable per-animal evaluation and de-duplication

A thunder event must be evaluated at most once per animal.

Do not store an unbounded `Set<eventId>` on every `AnimalAgent`. Event ids are monotonically ordered by weather cycle/slot, so a single runtime `lastScareEventId` (or compact numeric event ordinal) is enough for active agents. It is ephemeral; it does not need persistence because historical thunder is not replayed on restore.

The actual roll must be a pure hash of `(eventId, animalId)` so repeated evaluation would still produce the same answer, but the one-event-once guard prevents repeatedly restarting flee every frame.

## 15. Flee integration: expose a narrow impulse, reuse existing movement

Current `AnimalAgent` already has the real flee movement implementation:

- prey threat/alert branches call private `fleeFrom(x, z, dt)`,
- `fleeFrom` computes an away vector, applies existing domestic-vs-wild village bias, sets sprint if stamina allows, writes `fleeTarget`, and uses the existing `fleeNav` / navigation rescue path,
- `steerToward()` is the shared slope/collision movement choke point.

Do not add `ThunderFleeAI`, a second movement FSM or direct mesh displacement.

The clean extension is a short-lived **scare impulse state** on `AnimalAgent`, set through one public/narrow method such as:

```ts
applyScareStimulus(stimulus: AnimalScareStimulus, context: ...): boolean
```

On successful roll, record a short flee commitment/source direction and let the normal top-level behaviour arbitration consume it before needs/lure/wander but below immediate lethal/combat threats. The method must not itself advance movement using an arbitrary caller `dt`; movement stays in `update()`.

If the event is non-positional in V1, choose a deterministic flee direction from `(eventId, animalId)` rather than `Math.random()`. If a real strike `x/z` exists, reuse the existing away-from-source direction and `fleeFrom` mechanics.

The impulse must expire quickly and normal arbitration resumes. Existing direct predator threat must continue to win.

### `clampBounds()` caveat

Normal household livestock is clamped around `home` when no committed trip exists. A scare that is meant to cause meaningful displacement cannot merely call the current one-frame private `fleeFrom()` and then be clamped back by ordinary home bounds.

Implement the scare as a short committed movement/impulse recognized by the same movement ownership so `clampBounds()` can intentionally allow that temporary displacement, rather than mutating `ROAM_RADIUS` globally. Keep this narrow: world-026 causes flee/displacement only; it still does not create authoritative `stray` state.

## 16. Relationship to queued fauna plans

The current queue contains:

- `fauna-024-lost-livestock-stray-displacement.md` — planned, depends on `quests-progression-016` + `fauna-020`;
- `fauna-025-livestock-stray-return-and-recovery.md` — planned, depends on `fauna-024`;
- `world-026` intentionally has no dependency on either.

Preserve that ordering contract:

```text
world-026 thunder
→ probabilistic scare
→ existing/temporary flee movement
→ actual spatial displacement

later fauna-024/025
→ classify sufficiently displaced household livestock as stray
→ return/recovery semantics
```

Never call future `startLivestockStray()` from storm code. `fauna-025` explicitly documents thunder as only one possible source of real flee/displacement and says storm must not directly create stray or quest state.

Also do not couple this work to `fauna-022` animal variants. If variants are implemented first and expose a generic modifier seam suitable for fear sensitivity, compose with it; otherwise `AnimalDef.scareSensitivity` is sufficient V1 data and variants can multiply it later.

## 17. NPC shelter pressure

`src/ai/weatherPressure.ts` is already a pure world-condition pressure producer feeding the normal NPC decision architecture. Add storm there; do not create storm-specific NPC AI.

Recommended semantics:

- storm always produces meaningful shelter pressure at non-trivial intensity;
- severe storms should exceed `WEATHER_SEVERE_SHELTER_THRESHOLD` often enough to interrupt schedule work through the existing critical-interrupt path;
- snow/rain existing thresholds remain unchanged unless tests demonstrate a regression.

This is a gameplay consequence of adding `WeatherType = 'storm'`; without it NPCs would treat a thunderstorm as clear weather because the current guard is `rain || snow` only.

## 18. Tests: exact files to extend/add

### Extend `src/world/weather.test.ts`

Cover:

- storm deterministic selection for same inputs;
- no unintended seasonal storm states according to chosen weights;
- `temperatureFor(..., 'storm')`;
- `isRainWeather('rain'/'storm')` true and others false;
- `computeSurfaceWeather()` wetness during storm;
- `computeRainExposureDays()` includes storm;
- forced `ClimateState.forced = 'storm'` round-trip.

Avoid brittle tests that assume one hard-coded seed/cycle remains a storm forever after weight tuning. Search bounded cycles for a storm, as existing tests already do for rain/snow.

### New `src/world/stormEvents.test.ts`

Cover:

- same `(seed, cycle)` → identical event list;
- non-storm → none;
- ids unique within/across cycles;
- bounded event count;
- event times inside cycle;
- distance/strength bounds;
- thunder delay monotonic with simulated distance.

### Extend/add `src/world/weatherVisuals.test.ts` / cloud tests if present

Cover exhaustive storm profile and ensure flash helper returns to baseline when factor becomes zero. Do not attempt pixel rendering tests.

### Weather particles

Keep tests structural/pure if practical: storm activates rain semantics; snow branch uses procedural mask and does not change max counts/quality ceiling contract. Do not add headless GPU screenshot complexity for this plan.

### New `src/fauna/animalScare.test.ts`

Cover:

- stable `(eventId, animalId)` roll;
- probability clamped `[0,1]`;
- stronger event increases probability;
- protective home/owner/herd signals reduce probability when supplied;
- different species baselines affect probability;
- missing optional context is valid and deterministic.

### `src/settlement/livestock.test.ts`

Extend the existing `tickSettlementLivestock()` tests to prove:

- one stimulus is forwarded to all local candidates without a new global scan;
- same event is not repeatedly applied to one animal;
- failed roll leaves normal movement intent untouched;
- successful roll enters the existing flee/locomotion path;
- immediate predator threat still outranks scare;
- detached livestock uses the same adapter path.

### `src/ai/weatherPressure.test.ts`

Add storm shelter-pressure cases, including severe threshold behaviour.

### Audio tests

If `weatherSounds.ts` is refactored enough to warrant tests, inject/mock the existing `WorldAudio` interface and assert loop gains, thunder variant selection/event de-duplication and dispose. Do not test browser AudioContext itself.

## 19. Implementation order that minimizes churn

1. Extend `WeatherType`, tables and `isRainWeather()`; fix all exhaustive/direct-rain consumers and tests first.
2. Add pure `stormEvents.ts` + tests. Resolve the non-spatial-vs-world-space event contract before presentation/fauna wiring.
3. Add storm static visuals/cloud/rain-emitter reuse.
4. Add transient flash envelope and game-loop crossing logic; ensure short flash bypasses the normal day/night visual throttle only while active.
5. Add weather-audio storm loop support and the event-driven thunder playback seam; document missing assets instead of inventing paths.
6. Fix snow fragment mask independently; this is low-risk and should not be entangled with scare code.
7. Add pure `fauna/animalScare.ts` + per-species baseline.
8. Add narrow `AnimalAgent` scare-impulse integration reusing existing flee/nav/slope/collision ownership.
9. Thread the current stimulus through `tickSettlementLivestock()` / existing manager call sites; use only bounded owner/herd context already present.
10. Finish regression tests and update `docs/state/terrain-and-world-generation.md`, `docs/state/fauna.md`, `docs/assets/SOUNDS.md` / `public/sounds/README.md` as applicable.

## 20. Guardrails / do not do

- No `StormManager` with a second weather clock.
- No player/camera-relative lightning source masquerading as world state.
- No persisted lightning/thunder history.
- No `Math.random()` for event schedule, thunder variant, scare probability or scare direction.
- No per-frame global scan of all animals/NPCs for thunder.
- No weather → quest or weather → `stray` mutation.
- No new animal movement engine; reuse `AnimalAgent` flee/nav/steering.
- No global `ROAM_RADIUS` increase to make thunder displacement possible.
- No shelter system added just for a probability multiplier.
- No second cloud/rain scene graph.
- No CPU snow particle loop, texture requirement or per-frame buffer upload.
- No duplicated cave/interior detector in audio.
- No invented sound asset paths.

For new important public weather/event/scare functions add concise JSDoc with `@domain world` or `@domain fauna` so preflight/code-map discovery can find the seam without another broad recon.

> **Zrób git commit i push do main, rebase jeżeli trzeba**

## Implemented (2026-09-12)

Code is authoritative; this section records the V1 seams, not a second spec.

- `WeatherType` includes `storm`. `isRainWeather()` is a type predicate used for wetness, rain exposure, gardens, particles, rain loop, and NPC shelter pressure. Storm has its own visual/cloud/audio/pressure profile and temperature delta.
- Lightning lives in `src/world/lightningEvents.ts` (not `stormEvents.ts`). The cycle schedule is pure and non-positional: `eventId`, `strength`, `simulatedDistanceM`, `flashAtDays`, `thunderDelaySec`. No player/camera `x/z`.
- `createLightningRuntime()` is the presentation cursor. Flash starts when world time crosses `flashAtDays`. Thunder cue and scare stimulus emit together after `thunderDelaySec`. Time-skip (`present: false` or a large world-dt jump) consumes the event without flash/thunder/scare. Nothing is persisted.
- Thunder audio uses `worldAudio.playOnce()` with volume from simulated distance and cave muffle. Clips `/sounds/weather-thunder-01.ogg`…`03.ogg` are documented as S28 `needed` and currently silent. Storm rain reuses the rain loop louder; storm wind reuses the existing wind loop.
- `AnimalScareStimulus` is `{ source, eventId, strength, simulatedDistanceM }`. Probability uses acoustic distance plus home/owner/herd; species `AnimalDef.fearBaseline` is the sensitivity field. Failed roll does not change movement. Success records a hash-derived flee origin via `scareFleeOrigin(eventId, animalId)` and reuses `fleeFrom()`. `clampBounds()` skips while the scare impulse is active so the displacement is real; it does not set `stray`.
- Stimulus is forwarded only through `tickSettlementLivestock()` (settlement + detached livestock). No global fauna scan.
- Snow flake mask is a `uFlakeMask` branch in the existing GPU fragment shader. Rain streak mask, fixed buffers, and quality ceiling are unchanged.
- Debug forced weather includes `storm` through the existing `ClimateState.forced` / GUI weather list.

