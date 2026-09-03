# Implementation Notes: Wolf Howling and Rooster Vocalization

## Current codebase findings

- The plan's statement that spontaneous vocalization is already available for fauna is only **partly true**. `AnimalAgent` already owns a per-instance `spontaneousVocalizeCooldownSec` and calls `tickSpontaneousVocalizeCooldown()` in `update()`, but `src/audio/animalSounds.ts` currently configures spontaneous vocalization only for `cow`, `sheep` and `chicken`. There is no wolf howl path yet.
- More importantly, wild fauna currently has **no spontaneous-vocalization callback wired through `createFauna.ts`**. `Fauna.update()` forwards `onAnimalAggro`, but not `onVocalize`; `AnimalAgent.update()` supports the hook. Livestock already receives `onAnimalVocalize` through `createSettlement.ts`.
- `playSpontaneousAnimalSound()` in `src/audio/animalSounds.ts` is the existing global concurrency guard (3 plays / 6 s). Reuse it for howl/crow; do not add another spam limiter.
- `createWorldAudio.playAt()` currently uses the shared `distanceGain()` with `DISTANCE_MAX = 28`. A howl cannot be made audible farther away merely by increasing its species volume. If the larger range is implemented, extend this existing API/configuration (prefer an optional distance profile/max distance) rather than bypassing spatial audio or creating a second playback path.

## Wolf howl

- Keep the cooldown state on `AnimalAgent`. Extend the existing audio configuration rather than adding a wolf-specific timer/state.
- Time-of-day is currently available at the `Fauna.update()` boundary as raw `timeOfDay`, but `AnimalAgent.update()` receives only `dayFactor`. Pass the existing world time through to the agent (or to a pure vocalization helper) so dawn/dusk/night weighting can be expressed explicitly. Do not create an animal clock.
- Gate howl as a **presentation/vocalization event**, not as an AI behaviour. It must not alter `FaunaBehaviourKind`, `pendingAction`, chase/flee targets, or the decision arbitration.
- Suppress howl while the wolf is actively pursuing/attacking/fleeing. The safest gate is based on the already-resolved movement/behaviour state in `AnimalAgent.update()`, before firing the callback; do not infer this from animation alone.
- If no howl animation exists, avoid introducing a new persistent FSM state. A short presentation pause should reuse existing animation/movement controls; do not let it affect authoritative AI movement or target commitment.

## Rooster integration

- `AnimalKind` is currently a closed union and `ANIMAL_DEFS` is the central species-definition table. Add `rooster` there and make the definition data-driven like other livestock.
- Owned livestock is created by `src/settlement/livestock.ts`, not `createFauna.ts`. A rooster should therefore enter the same livestock pipeline if it is intended to be a domestic world animal.
- **Do not simply insert rooster into `SPECIES_WEIGHTS` or otherwise change the existing cumulative chicken/sheep/cow/donkey/horse roll.** Those rolls are deterministic per house and are also part of the persistence identity contract. Changing the boundaries can cause an existing save's deterministic kind to differ after reload. Prefer an additional deterministic rooster roll/companion rule that leaves the existing species stream unchanged.
- Extend `LivestockKind`, `LIVESTOCK_URLS`, `MODEL_BUILDERS`/visual selection and any exhaustive `AnimalKind` maps together. The fallback must remain functional when no rooster GLB exists.
- The current chicken fallback is procedural (`createChickenModel()`). A rooster placeholder can be procedural and use the same feet-rooted/pipeline convention; keep the model selection separate from behaviour so a later GLB replacement does not touch simulation code.
- Do not add sex/gender state to `AnimalAgent` for this plan. `rooster` is a distinct kind, as the plan requires.

## Audio

- Add `rooster` and `wolf` entries to the existing spontaneous-vocalization configuration. Keep the existing per-agent cooldown + probabilistic retry mechanism and global concurrency cap.
- Rooster timing should be a weighting/gating function over the existing `timeOfDay`: strongest around dawn, low but non-zero during daytime, effectively disabled at night. Avoid a second schedule/timer.
- Wolf timing should favour night and allow weaker dawn/dusk activity; daytime should be disabled or very low according to the plan.
- The new WAV files are **not currently present as shipped OGGs** in `public/sounds/` on `main`. Treat the plan's WAVs as staging/input assets, not as already-installed runtime assets.
- Follow the existing sound convention in `public/sounds/README.md`: shipped fauna one-shots are OGG and mapped from `src/audio/animalSounds.ts`. Update `public/sounds/README.md`, `docs/assets/SOUNDS.md` and `docs/assets/MODELS.md`/credits only when the corresponding asset actually enters the repository.
- The wolf source must be manually shortened before OGG conversion as specified by the plan; do not implement an automatic runtime trim.

## Integration / ownership

- Recommended flow for wild fauna: `gameLoop/world` → `Fauna.update(timeOfDay,..., onAnimalVocalize)` → `AnimalAgent.update(..., onVocalize)` → `playSpontaneousAnimalSound()` → existing `WorldAudio.playAt()`.
- Preserve the existing split: `AnimalAgent` decides **when a vocalization event is eligible**, while `animalSounds.ts` owns species audio configuration and playback throttling.
- The world must remain independent of player proximity. Do not add a camera-distance check before generating the event; existing spatial audio may legitimately suppress playback when the listener is too far away.
- Be careful with callback ordering: livestock currently uses the same callback both for spontaneous vocalization and contextual egg-laid vocalization. Do not accidentally apply the new dawn/night gating to the contextual egg event unless deliberately separated; the existing contextual event is not the same semantic trigger.

## Tests / pitfalls

- Extend `src/audio/animalSounds.test.ts` for the new species and time-of-day gating/weighting, preferably through pure exported helpers so tests do not instantiate Three.js.
- Preserve the existing concurrency-cap tests; the cap is module-global and test state can affect later cases if new tests invoke it.
- Verify exhaustive TypeScript maps after adding `rooster`; `AnimalKind` is used in several record types and exhaustive definitions.
- Check persistence implications carefully. Livestock identity is deterministic by settlement/house/species/index and existing saved records are validated against the recomputed kind. Avoid changing existing species-roll outcomes.
- No new audio manager, rooster manager, animal scheduler, gender system, or social/wolf-pack communication system is warranted.

**Zrób git commit i push do main, rebase jeżeli trzeba**