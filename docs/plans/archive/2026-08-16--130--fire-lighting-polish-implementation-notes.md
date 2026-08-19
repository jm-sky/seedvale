# Plan: Fire & Lighting Polish — Implementation Notes

**Created:** 2026-08-16  
**Status:** `reviewed` 🔎 — core scope (§15) implemented 2026-08-16, see plan file's "Implementacja — stan faktyczny"; guard lighting (§9) split off, no profession/action foundation exists  
**Priority:** medium · **Effort:** M  
**Depends on:** ~~060~~

## Review summary

Plan 130 is directionally good and correctly tries to extend the existing fire implementation instead of creating a second fire framework. The main issue is that several parts of the plan describe systems that do **not** currently exist in the codebase, especially the "guard lights fires/torches" flow.

The current fire architecture is already reusable:

- `src/settlement/VillageFire.ts` owns `lit` + `fuelRemaining` and the burn tick.
- `src/settlement/props.ts` creates the settlement campfire visual and exposes `CampfireFlame`.
- `src/shared/getFireParticles.ts` already provides the shared `THREE.Points` spark implementation.
- `src/settlement/PlacedFires.ts` reuses the same `VillageFire` implementation for player-built fires.
- The previous fire plan is already implemented, including the deterministic 50% night ignition for settlement campfires.

Therefore plan 130 should be treated primarily as a **visual/interaction polish of the existing fire pipeline**, with NPC lighting as a separate dependency on the existing schedule/action system rather than something to invent inside this plan.

## 1. Important correction: `light()` is currently instantaneous

`VillageFire.light()` currently does all of the following in one call:

- sets `lit = true`,
- resets fuel to one branch,
- makes the flame visible,
- applies the final fuel-derived flame size,
- fires `onLight`.

So the requested `0 → 100%` ramp cannot be implemented only inside `CampfireFlame`. The fire state needs a small ignition phase.

Recommended shape:

```ts
type VillageFire = {
  isLit: () => boolean
  isIgniting: () => boolean
  getIgniteProgress: () => number
  light: () => void
  addFuel: () => void
  update: (dt: number) => void
}
```

Internally keep a small `igniteProgress` / `igniteRemaining` value. `light()` starts ignition; `update(dt)` advances it. Keep `fuelRemaining` independent from the visual ramp so the burn duration does not accidentally become the ignition duration.

The existing `IGNITE_DURATION_SEC = 3` is a good starting point for the visual/action duration and already matches the player's busy-channel ignition duration.

Do **not** make `isLit()` false during ignition unless callers are audited. Existing interaction and cooking logic may interpret `isLit()` as "usable fire". Prefer either:

- `isLit() === true` from ignition start, with `isIgniting()` controlling visuals, or
- explicitly audit every `isLit()` consumer before changing semantics.

The first option is safer and keeps the state model small.

## 2. `CampfireFlame` should expose visual intensity, not own fire state

`VillageFire` should remain the owner of fire state. `CampfireFlame` should remain a rendering helper.

Recommended API direction:

```ts
flame.setIntensity(normalizedIntensity)
flame.setSize(normalizedFuelSize)
flame.update(dt)
```

Do not move `fuelRemaining`, ignition timing, or NPC decisions into `CampfireFlame`.

Use the ignition intensity as a multiplier over the existing fuel-derived size/light. Conceptually:

`final visual intensity = fuel size × ignition ramp`

This preserves the current relationship between fuel and fire size after ignition completes.

At `0%`, keep the flame hidden and show only embers. Around `20–40%`, enable a small flame; approach the normal state non-linearly rather than using a perfectly linear scale if tuning looks better.

## 3. Sparks: extend the existing system, but remove the current physics gap

`src/shared/getFireParticles.ts` currently has exactly the right architectural location for this work, but the implementation is simpler than plan 130 assumes:

- 8 particles are allocated once per fire,
- velocity is upward + lateral,
- there is currently **no gravity**,
- particles respawn by replacing the `Spark` object,
- material opacity is not currently faded per particle.

The notes in plan 130 should therefore explicitly call for these changes rather than describing them as if already present.

Recommended implementation:

- keep one fixed particle array per `Sparks` instance,
- avoid `new Vector3()` / new object allocation in `update()`,
- add per-spark gravity to velocity Y,
- add a small lateral drift/damping,
- derive opacity from normalized lifetime,
- respawn by mutating the existing spark object instead of replacing `sparks[i]` with a new object,
- keep the default count deliberately small.

For per-particle fading, `THREE.PointsMaterial.opacity` is global, so if individual fade is required, do not immediately introduce a shader. First consider a very cheap shared alpha attribute/material approach only if the visual benefit is actually noticeable. Otherwise a short lifetime + respawn timing may be sufficient.

The implementation should not create a second particle abstraction just for fire.

## 4. Flint burst should be a one-shot event, not a permanent second particle system

The white ignition burst is the most valuable new visual element in this plan.

Implement it through the existing fire-particle module as a temporary burst mode, for example:

```ts
sparks.burst({ color: WHITE, count: 8-12, strength: ... })
```

or an equivalent small API that reuses the same `THREE.Points` buffers.

Avoid creating/destroying a new `THREE.Points` object every time a fire is lit. This matters because settlement fires may be ignited repeatedly and several fires can be active at once.

Normal fire sparks and ignition sparks can share the same underlying particle implementation but have different spawn parameters.

The burst should be triggered from the **fire ignition event**, not from `CampfireFlame.update()`; rendering code should not infer gameplay events.

## 5. Embers should stay inside the same fire FX ownership

The plan is correct that embers should reuse the fire particle infrastructure.

Do not create an `EmberManager` or another general-purpose system.

A good minimal representation is another small fixed `THREE.Points` buffer owned by the same fire visual object, with:

- 3–6 points,
- spawn height near the base,
- red/orange emissive appearance,
- very small upward velocity,
- short lifetime,
- irregular intensity/size.

If the implementation can cheaply represent embers as another mode of the existing fire particle system, prefer that over another module.

## 6. Existing fire audio already covers ignition

Do **not** add a new sound asset just because plan 130 says "add SFX".

`docs/assets/SOUNDS.md` already lists fire ignite/extinguish as `wired`, using:

- `action-fire-ignite-01`
- `action-fire-extinguish-01`

So implementation should locate and reuse the existing fire audio helper/channel. Only update `docs/assets/SOUNDS.md` if a genuinely different asset is required after testing.

The important change is synchronization: play the existing ignite SFX at the beginning of the ignition event, once per actual transition from unlit → igniting.

For world/settlement fire use the existing world-positioned audio path (`worldAudio.playAt`), not a new audio bus.

## 7. Player-built fires must get the same polish automatically

`PlacedFires.ts` reuses `createVillageFire()` and the same `createCampfireFlame()` visual path.

Therefore the visual changes should be implemented below the settlement-specific layer so that:

- settlement campfires,
- player-built campfires

receive the same ignition ramp, embers and normal sparks.

Do not add separate player-fire visual code.

The plan should explicitly verify both variants because a change that only touches `buildSettlementProps()` could accidentally leave placed fires behind.

## 8. Night ignition must remain compatible with the old system

The archived fire plan already implements a deterministic 50% settlement-fire ignition at the day → night transition.

Plan 130 should not remove or bypass that behaviour.

Instead, the existing night call to `fire.light()` should naturally enter the same ignition pipeline:

`night transition → fire.light() → ignite event → flint visual/audio → ramp → normal fire`

However, the flint visual/audio is arguably less appropriate for an autonomous NPC/night ignition than for a physical player action.

Recommended distinction:

```ts
light({ source: 'player' | 'npc' | 'night' })
```

or an equivalent small event parameter.

Use the white flint burst + flint SFX only for an actual ignition action. Autonomous night ignition can use the visual ramp and normal fire audio, or a future NPC-specific action sound, without pretending the player struck the flint.

This keeps the simulation and presentation truthful.

## 9. Guard lighting is currently an architectural gap, not a polish detail

The plan says:

> strażnik → zapala ognisko/pochodnie

but the current code/state does not establish a complete guard profession + night lighting action pipeline that can simply be "wired" to fire.

The plan should therefore **not** implement a one-off `if profession === guard` block in `createSettlement.ts` or `gameLoop.ts`.

If plan 060 introduces/finishes schedule actions and profession-specific action selection, use that system as the dependency. The fire work should expose a reusable action such as:

`ignite_fire(targetFire)`

and let the NPC decision/schedule system choose when and why it happens.

For this reason `Depends on` should include plan 060 if the guard behaviour remains in scope.

If 060 does not provide a suitable guard profession/action, split the guard/torch behaviour into a follow-up plan instead of expanding 130 into an NPC-AI plan.

## 10. Torches need a real runtime state before an NPC can light them

The plan correctly warns that the existing torch representation must be checked first.

The implementation should distinguish:

- purely decorative settlement torch/lantern geometry,
- a light source with runtime `lit` state,
- an NPC-action target.

Do not add `lit` to every decorative torch globally just because the guard needs one target. Add the smallest state to the actual settlement torch representation and expose a stable target/action API.

Prefer one shared concept such as:

```ts
type SettlementLightSource = {
  id: string
  position: THREE.Vector3
  kind: 'campfire' | 'torch'
  isLit(): boolean
  light(): void
}
```

Only introduce this abstraction if both campfires and torches genuinely need the same runtime behaviour. Otherwise keep campfire and torch state separate; do not create a generic manager pre-emptively.

## 11. Do not introduce `FireManager`

The existing ownership is already good:

`VillageFire` → fire state  
`CampfireFlame` → fire rendering  
`PlacedFires` → player-built fire collection/persistence  
`createSettlement` → settlement ownership/lifecycle

Plan 130 should strengthen this structure rather than add a global manager.

If an event/callback is needed for ignite SFX or burst particles, use the existing `VillageFireHooks` / a small event parameter. Avoid global registries.

## 12. Performance constraints need a more realistic verification target

The current fire particles are CPU-updated `THREE.Points`, so the important costs are:

- number of active fire particle instances,
- per-frame CPU loops,
- buffer uploads (`positionAttribute.needsUpdate`),
- additional materials/draw calls,
- dynamic `PointLight` count and shadow behaviour.

The plan's "few sources of fire do not significantly increase rendering cost" is good but should be measured against a defined scenario.

Suggested browser test:

1. baseline: settlement at night, all fire FX disabled;
2. 1 active campfire;
3. 3–5 active fires;
4. same scene while igniting several fires;
5. repeat on mobile/low-quality profile.

Record FPS/frame time plus draw calls/triangles. The key target is **no material/frame-loop explosion**, not zero additional draw calls.

Do not add workers or GPU particles for this plan.

## 13. Verification additions

Add these checks to the plan:

### Functional

- [ ] player ignition starts one ignition event only,
- [ ] adding fuel to an already-lit fire does not retrigger the flint burst,
- [ ] fire reaches the normal visual state after `IGNITE_DURATION_SEC`,
- [ ] fire still extinguishes according to `fuelRemaining`,
- [ ] player-built fires behave identically to settlement campfires,
- [ ] night-autolight still works and remains deterministic,
- [ ] night-autolight does not incorrectly play a player flint SFX,
- [ ] `isLit()` consumers such as cooking remain functional during ignition.

### Regression

- [ ] no duplicate fire audio after repeated streaming/rebuilds,
- [ ] no particle objects/materials are allocated every frame,
- [ ] fire visuals are disposed correctly with settlement/placed-fire lifecycle,
- [ ] unloaded/reloaded settlements do not accumulate particle or light objects.

### Browser

- [ ] test desktop and mobile/touch,
- [ ] test one and multiple simultaneous fires,
- [ ] inspect frame time and draw calls,
- [ ] visually confirm that embers remain visible before the flame reaches full size.

## 14. Recommended implementation order

1. **Audit consumers** of `VillageFire.isLit()` and `CampfireFlame` before changing semantics.
2. Add the ignition phase to `VillageFire` while keeping fuel/burn timing separate.
3. Add `CampfireFlame.setIntensity()` / equivalent visual control.
4. Extend `getFireParticles.ts` with gravity/drift and reusable ignition burst support.
5. Add embers through the same fire FX ownership.
6. Reuse existing fire ignite audio and gate it by ignition source.
7. Verify settlement campfires and `PlacedFires` together.
8. Only then integrate NPC/guard lighting through the existing schedule/action system if plan 060 provides the required capability.
9. Finish with browser/performance tuning.

## 15. Suggested scope decision

The cleanest version of plan 130 is:

**Core scope:**

- ignition ramp,
- flint burst,
- improved sparks,
- embers,
- existing ignite SFX synchronization,
- shared behaviour for settlement + placed fires,
- browser/performance tuning.

**Conditional scope:**

- guard lighting campfires/torches, only if the existing schedule/action system already provides the required profession/action foundation.

If that foundation is not ready, move guard lighting to a follow-up plan depending on 060. This keeps plan 130 focused and avoids creating a parallel NPC behaviour system.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
