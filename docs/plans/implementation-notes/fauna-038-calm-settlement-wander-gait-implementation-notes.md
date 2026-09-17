# Implementation notes: fauna-038 Calm settlement wander gait

**Plan:** `fauna-038-calm-settlement-wander-gait.md`

## Current movement ownership

`AnimalAgent` already owns all autonomous fauna movement. Do not introduce a second controller.

Relevant split:

```text
unmounted
→ AnimalAgent.update()
→ fauna decision branch
→ ordinary wander / needs / flee / chase / lead / trip
→ existing movement helpers

mounted
→ mountActions.update()
→ AnimalAgent.driveMounted()
→ mount.walkSpeed / mount.sprintSpeed + Riding multiplier
→ AnimalAgent.update() early-return
```

This boundary is already correct. The plan only changes the speed selected by the **ordinary wander** branch.

## Species data

`src/fauna/animalDefs.ts` currently exposes global autonomous:

```ts
walkSpeed: number
sprintSpeed: number
```

and mountable species independently expose:

```ts
mount: {
  ...
  walkSpeed: number
  sprintSpeed: number
}
```

Horse currently has autonomous `2.6 / 6.0` and mounted `10.5 / 17.5`.

Add one optional species-data seam such as:

```ts
calmWalkSpeed?: number
```

Do not move mount speeds into this field or derive mount speeds from it.

The field should be documented on `AnimalDef` as an ordinary local-wander baseline only. Absence means exact legacy behaviour.

## Where to consume it

Current ordinary wander eventually calls roughly:

```ts
stepNavRescue(..., walkSpeedNow(), ...)
```

Do not globally change `walkSpeedNow()`, because that helper is also the autonomous walking baseline for other purposeful behaviours.

Prefer a tiny helper near the existing speed helpers, e.g. conceptually:

```ts
private calmWalkSpeedNow(): number
```

with:

```text
base = def.calmWalkSpeed ?? def.walkSpeed
apply the same effective per-individual speed multiplier used by walkSpeedNow()
apply only modifiers that semantically belong to ordinary walking
```

Then change only the ordinary `wander()` movement call-site to use it.

Do not branch on `def.kind === 'horse'` in `AnimalAgent`.

## Variant composition

`animalVariants.ts` confirms `speedMultiplier` is a per-individual multiplier layered on species speed baselines. `walkSpeedNow()` / `sprintSpeedNow()` consume that resolved multiplier.

Even though current horse variants are effectively normal, the new calm speed should use the same multiplier path so this species-data seam remains correct for future variants and does not create a second speed semantics.

Avoid copying variant-resolution logic. If possible, factor the tiny common `baseSpeed * effectiveSpeedMultiplier` operation instead of duplicating the modifier stack.

## Night behaviour

`walkSpeedNow()` currently applies a night slowdown only to `role === 'prey'`. Horse is `role === 'livestock'`, so its present ordinary walking speed does not get that night modifier.

Do not broaden night semantics as part of this plan. Calm horse wander should not accidentally create a new night rule.

If the implementation reuses a common speed resolver, preserve the exact current night behaviour for existing `walkSpeedNow()` callers.

## Why no village-boundary query

Settlement livestock is constructed in `src/settlement/livestock.ts` with:

```ts
wanderRadius: LIVESTOCK_WANDER_RADIUS
```

where the current range is `[3, 6]`, and its ordinary wander is home-relative. That is already the semantic "walking casually around its settlement home" path.

Do not add a per-tick settlement containment query merely to decide speed. It would add coupling and work while solving no current case.

The calm speed is tied to the **ordinary local wander intent**, not to rendering/camera distance or a new geographic zone system.

## Mounted regression boundary

`driveMounted()` is intentionally separate and `AnimalAgent.update()` returns immediately while mounted.

Do not alter:

- `AnimalDef.mount.walkSpeed`,
- `AnimalDef.mount.sprintSpeed`,
- `ridingSpeedMultiplier`,
- `mountActions.update()`,
- mounted stamina/gait selection.

The user-facing invariant is exactly two mounted movement modes: walk and sprint/run.

`src/fauna/mountedSpeed.test.ts` should remain green; add an explicit regression assertion only if the new helper structure makes accidental coupling plausible.

## Other fauna / livestock ROI

The reusable optional field is worthwhile because every animal already uses the same `AnimalDef` + `AnimalAgent` path. That gives future donkey/cow/sheep tuning at data-only cost.

Do **not** set values for other species in this implementation without browser evidence. Their current speeds and animation scale differ, and mass retuning would turn a focused polish fix into balance work.

In particular:

- donkey is rideable, but no reported issue requires changing its loose wander yet,
- cow/sheep/chicken/rooster already have lower autonomous baselines,
- dog has behaviour where a blanket "calm" retune may interact with guard/follow expectations,
- wild fauna should retain current roaming speed semantics.

## NPC ROI

NPCs should not reuse this code.

`NpcAgent` owns an independent action/FSM → destination → `steerTo()` executor. A shared NPC/fauna gait layer would require a cross-domain movement abstraction and touch unrelated work/combat/travel behaviour. There is no current evidence that such a refactor pays for itself.

If NPC leisure-vs-purposeful speed later becomes a visible problem, create a separate `npc` plan around action intent; do not pull `AnimalDef` concepts into NPC movement.

## Suggested implementation order

1. Extend `AnimalDef` with the optional calm-wander speed and doc comment.
2. Set horse initial tuning value around `1.2–1.5` m/s; choose one deterministic constant for browser verification.
3. Add/reuse a small speed resolver preserving current variant semantics.
4. Switch only ordinary `wander()` to calm speed fallback.
5. Add focused unit tests around speed selection/fallback and mounted isolation.
6. Update `docs/state/fauna.md` with the optional species-data field and ordinary-wander distinction.
7. User performs browser tuning; adjust only the horse data value if needed.

## Test shape

Prefer testing speed selection without depending on full settlement construction.

Useful assertions:

- optional field absent → legacy walk result,
- optional field present → calm baseline selected,
- effective speed multiplier is preserved,
- horse calm speed is below horse autonomous `walkSpeed`,
- mounted config remains independent.

If calling a private `AnimalAgent` helper would make the test brittle, extract a tiny Three.js-free pure resolver in the fauna domain rather than exposing a new public `AnimalAgent` method solely for tests.

## Documentation / preflight

If a new pure resolver or public type field is introduced, add concise JSDoc with `@domain fauna` where useful for code-map/preflight discovery. Do not add documentation layers beyond the species-data contract and state-doc update.

> **Zrób git commit i push do main, rebase jeżeli trzeba**