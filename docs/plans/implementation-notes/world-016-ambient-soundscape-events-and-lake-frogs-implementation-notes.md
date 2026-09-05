# World 016 — Ambient Soundscape Events and Lake Frogs — Implementation Notes

> Recon against `main` at `4f75eb9e0ecfce078db6b474a1425b6543600afa` on 2026-09-05. Current code wins over plan text.

## 1. The three audio categories fit the current architecture, but do not make them three managers

`src/audio/createAmbientAudio.ts` currently owns both continuous layers and the owl one-shot. The continuous side is already coherent:

- `ambientWeightsAt()` supplies broad terrain weights;
- `createAmbientAudio()` applies time/weather and chooses target gains;
- `WorldAudio.createLoop()` owns loading, buffer reuse, looping and gain smoothing;
- `WorldAudio.update()` advances all loop gains every frame.

Keep that path for forest/coast/wind/meadow/birds/crickets. The useful refactor is to make **ambient events** and **local ambience** small collaborators of `createAmbientAudio()`, not to introduce `AmbientManager`, separate lifecycle trees or another audio backend.

A good end state is still one `AmbientAudio.update(...)` boundary, with one throttled context snapshot feeding:

```text
continuous gain calculation
ambient-event runtime
local-environment gain calculation
```

`WorldAudio` should remain the playback/mixer owner.

## 2. The owl is exactly the special case to extract

The plan accurately describes current code. `createAmbientAudio.ts` contains all owl-specific runtime state and policy:

- `owlCooldownSec`;
- `lastForestWeight`;
- cooldown min/max and recheck constants;
- eligibility (`nightPhase()` + minimum forest weight);
- `Math.random()` chance;
- random radial placement around the player;
- direct `worldAudio.playAt()`.

Extract the runtime, not merely the constants. A definition should carry policy/data while one shared runtime owns cooldown/recheck/chance/variant selection/spatial placement/playback.

Do not preserve `Math.random()` calls hidden inside event logic if the runtime is being made testable. Inject a small RNG function (defaulting to `Math.random`) or use an already-established deterministic RNG mechanism if one is available at implementation time. Tests should be able to force chance, variant and placement without mocking globals.

Preserve the owl's current gameplay tuning unless there is a concrete reason not to: 5–12 min successful cooldown, 20 s failed/ineligible recheck, 0.15 chance, forest threshold 0.3, 8–22 m offset, night eligibility.

## 3. Important discrepancy: natural-water classification is not yet a clean shared sampler

`src/world/WaterSource.ts` owns the shared type:

```ts
export type WaterBodyKind = 'lake' | 'river' | 'ocean'
```

but the actual shoreline classification is currently assembled in `src/app/interactables.ts` from three different owners:

- `nearestShoreProbePoint` / `shoreProbeHits` from `src/fauna/AnimalAgent.ts` for the existing lake/ocean shoreline probe;
- `oceanMixAt()` from `src/terrain/waterBodies.ts`;
- `ChunkManager.riverShoreDistance()` backed by `src/terrain/riverNetwork.ts`.

`resolveWaterBodyKind(...)` in `interactables.ts` is a pure decision helper, but the surrounding sampling/orchestration is app interaction code. **Do not import `app/interactables.ts` into audio, and do not make audio depend on `fauna/AnimalAgent.ts`.**

Before adding frogs, extract the minimum reusable natural-water context/proximity primitive into an existing `world`/`terrain` boundary. Then make interaction code and ambient code consume that primitive. This is the main architectural cleanup world-016 should perform.

Avoid moving `WaterBodyKind` into audio; `WaterSource.ts` is already the shared semantic type owner unless the extraction reveals a more natural existing water module.

## 4. Do not use the fauna shore probe unchanged as the frog proximity weight

`shoreProbeHits()` / `nearestShoreProbePoint()` were created for fauna/gameplay shoreline targeting. They are useful evidence and can help define the shared water sampler, but a binary probe hit is not automatically the right local-ambience signal.

Frogs need a stable continuous `0..1` lake proximity suitable for gain. Prefer a shared result shaped conceptually like:

```ts
type LocalWaterContext = {
  kind: WaterBodyKind | null
  shoreDistance: number | null
  // or a directly derived continuous proximity
}
```

The exact type should follow the available terrain APIs. The important properties are:

- lake, river and ocean remain distinguishable;
- distance/proximity is continuous enough to crossfade;
- the calculation is bounded/local;
- it does not scan a registry of all lakes;
- it can be reused outside audio.

If the existing lake/ocean terrain representation cannot provide exact shore distance cheaply, a bounded deterministic probe around the listener is acceptable. Keep it in terrain/world code, use fixed sample offsets/radii, and derive a smooth proximity from the nearest qualifying lake sample rather than exposing an audio-only `isNearLakeForFrogs()` boolean.

## 5. River and ocean rejection must happen before deriving frog gain

Do not infer frogs from moisture, low elevation, `ambientWeightsAt().ocean === 0`, or generic “water nearby”. Those cannot distinguish a lake from river terrain.

Use the shared water classification and explicitly require `kind === 'lake'` before producing lake proximity. In ambiguous overlap cases, preserve the same precedence used by the interaction shoreline resolver so the player does not see one water kind while ambient hears another.

This also means `ambientWeightsAt()` should probably stay responsible for **broad biome/environment weights**. Do not overload its existing `{ ocean, forest, mountain }` result with every local place signal unless the extraction naturally yields a small combined context. Lake proximity is a different spatial scale and can live beside those weights in `AmbientContext`.

## 6. Build one throttled `AmbientContext` snapshot

`createAmbientAudio.update()` already resamples terrain every `SAMPLE_INTERVAL = 0.25` s while `WorldAudio` smooths gain every frame. Extend that existing cadence rather than introducing another timer for frogs.

Current update work is split awkwardly:

- weather factor and cricket target are calculated every frame;
- owl cooldown ticks every frame but consumes the last throttled forest weight;
- broad terrain weights are sampled every 0.25 s.

A small internal snapshot can make the dependencies explicit without becoming a global manager. It can contain only values actually needed by the three consumers, e.g. broad weights + lake proximity + time/weather snapshot + listener/player XZ.

Keep expensive/local terrain sampling inside the 0.25 s block. Cooldown clocks and cheap gain target calculation may still tick every frame where useful.

Do not make camera state the geography source. The existing API passes player X/Z; continue deriving environment from world coordinates. The audio listener remains presentation-only in `WorldAudio`.

## 7. Local frog ambience should reuse `createLoop()` unless proven insufficient

`WorldAudio.createLoop()` is listener-attached/non-positional but already gives exactly the important lifecycle properties for a proximity bed:

- one buffer cached by URL;
- one persistent loop handle;
- target gain with smoothing;
- ambient mixer bus;
- no node churn when crossing a threshold.

For the first frog implementation, a single loop whose target gain is:

```text
lake proximity × frog time factor × frog weather factor × max volume
```

is the lowest-cost solution and still makes the sound geographically local because lake proximity is sampled from the world.

Do **not** extend `WorldAudio` with positional-loop support merely because the plan mentions locality. Add that abstraction only if listening tests demonstrate that gain-only locality is insufficient. `playAt()` is designed for one-shots; continuously respawning positional frog clips would be the wrong workaround.

Create the frog loop lazily on the first non-zero/relevant lake weight, as current coast/wind/meadow/birds loops do. Once created, keep it alive and fade to zero rather than dispose/recreate on every approach/departure.

## 8. Reuse the existing night profile machinery, but give frogs their own pure profile

`createAmbientAudio.ts` already has `nightPhase(timeOfDay)` and `cricketsTimeFactor(timeOfDay)`. `nightPhase()` is currently private and encodes dusk `0.75`, dawn through wraparound, and normalized night progress.

Do not derive frog timing from `dayFactor`; the code comments correctly note that it is flat across too much of the night. Either:

- expose/rehome the small night-phase primitive and build `frogsTimeFactor()` from it, or
- extract a generic pure cyclic time-profile helper if that actually makes both profiles simpler.

Do not build a generic scheduling/rule DSL. A pure frog factor function with explicit dusk/rise/peak/taper tuning is enough and easy to unit-test.

Likewise, `weatherAmbientFactor()` currently returns only `{ birds, crickets }`. Extend the factor model deliberately (e.g. add `frogs`) rather than piggybacking frogs onto cricket numbers. Weather values are tuning policy, not a reason for another subsystem.

## 9. Event spatial placement: keep the current owl behaviour initially

The existing owl event chooses a random world X/Z offset around the player and calls `WorldAudio.playAt()`. Although the source is generated relative to the current player position, it is only a transient one-shot position, not persistent world truth; that is acceptable for this ambience category.

The generic event runtime can express the same radial placement policy. Do not introduce persisted ambient-event entities, world registries or settlement/fauna ownership for the owl.

If future events need geography-anchored positions, add a placement callback/policy at that time rather than designing the full abstraction in world-016.

## 10. `WorldAudio` already solves most playback concerns

Reuse `src/audio/createWorldAudio.ts` as-is where possible:

- module-level `bufferCache` already deduplicates `AudioLoader.loadAsync()` by URL;
- `createLoop()` starts at gain 0 and ramps via the existing active-loop update;
- `playAt()` provides distance attenuation for event one-shots;
- ambient and SFX buses already exist;
- browser AudioContext resume handling is already centralized.

Do not create another `AudioLoader`, buffer cache, gain interpolation loop or autoplay-resume hook in the new modules.

One policy decision to make explicitly: owl-like ambient events should likely use the `ambient` bus even though `playAt()` defaults to `sfx`. Verify the current `playAt()` call path/default before changing behaviour, and choose intentionally so the ambient volume control governs ambient events if that is the desired UX. Avoid silently changing existing owl mix during the migration without a test/manual check note.

## 11. Suggested module boundaries

Keep modules small. A likely shape, adjusted to actual code during implementation:

```text
src/audio/createAmbientAudio.ts
  composition + continuous/local gain wiring

src/audio/ambientEvents.ts
  definitions/runtime/eligibility/cooldown/RNG/spatial one-shot policy

src/audio/ambientWeights.ts
  broad biome weights only, unless a small context refactor clearly improves it

src/world/... or src/terrain/...
  shared natural-water kind + proximity sampling
```

The shared water sampler should not live under `src/app/` or `src/audio/`.

If extracting the fauna shoreline probe would cause a large unrelated `AnimalAgent.ts` refactor, move only the pure sampling helpers needed by both callers and leave animal behaviour untouched.

## 12. Tests with highest value

Prefer pure tests over WebAudio integration tests.

1. **Ambient event runtime:** ineligible event does not roll/play; cooldown blocks; failed chance uses recheck; successful event draws the next cooldown; injected RNG deterministically controls chance, variant and placement.
2. **Owl migration:** night + sufficient forest weight is eligible; day or weak forest is not; preserve current tuning constants/semantics.
3. **Water classification/proximity:** lake produces a continuous non-zero weight near shore; distance fades to zero; river and ocean produce zero lake weight; ambiguous cases follow the interaction resolver's precedence.
4. **Frog time/weather gain:** day zero, dusk rise, night active, pre-dawn taper; weather factor multiplies rather than replaces proximity/time.
5. **Composition:** frog gain is zero for `kind !== 'lake'` regardless of moisture/biome.

Existing relevant tests around the shoreline helpers are in `src/fauna/foodWaterTargeting.test.ts`; interaction/water classification tests should be located and updated rather than duplicated after extracting the shared helper.

No browser verification by AI. Leave audible tuning/locality verification to the player after technical tests/typecheck/lint/build required by the plan.

## 13. Asset handling is an implementation step, not part of this review

Do not move the frog asset while preparing/reviewing this plan. During implementation, Claude can place the provided/staged source in the final `public/sounds/` location, convert/name it consistently if needed, and wire that final URL.

`public/sounds/README.md` is the provenance/source-of-truth table for shipped audio and already has an `Ambient / background` section. Add the frog entry there with source/license information when the asset is moved. Staged candidates are documented under `_temp/Sounds/README.md` where applicable.

Avoid introducing a new sounds subdirectory just for frogs unless the current asset conventions change first; existing ambient assets are flat under `public/sounds/` and use `ambient-*` names.

## 14. Recommended implementation order

1. Extract/shared-own the minimum natural-water classification/proximity primitive; switch `interactables.ts` (and only necessary fauna helpers) to it so there is one semantic source.
2. Add focused tests for lake/river/ocean classification and continuous lake proximity.
3. Extract the owl's special-case logic into a small testable ambient-event runtime with injectable RNG, preserving behaviour.
4. Build one throttled ambient context snapshot in `createAmbientAudio()` and feed both existing broad weights and local lake proximity from it.
5. Add pure frog time/weather factor(s), then wire one lazy persistent frog loop through `WorldAudio.createLoop()`.
6. Keep `WorldAudio` unchanged unless implementation evidence proves a missing primitive.
7. Add/adjust tests and JSDoc (`@domain world` where useful for preflight navigation).
8. During implementation only, move/convert the provided frog asset, update `public/sounds/README.md`, and wire its final URL.

Do not run `pnpm docs:sync` manually; GitHub workflow owns generated-doc synchronization.
