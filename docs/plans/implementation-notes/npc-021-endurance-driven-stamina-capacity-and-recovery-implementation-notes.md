# Implementation Notes: npc-021 — Endurance-driven stamina capacity and recovery

Focused recon against current `main`. Only implementation-relevant findings that are easy to miss from the plan are recorded here.

## Shared capability ownership

`npc-019` is implemented. `src/shared/PhysicalAttributes.ts` owns only the shared SPEA values and must stay consumer-agnostic.

Add small pure shared stamina-capability resolvers for:

- Endurance → max Stamina (`70 + endurance * 60`);
- Endurance → recovery multiplier (`0.7 + endurance * 0.6`).

Do not put these methods on `PhysicalAttributes` or inside `StaminaState`. `src/shared/StaminaState.ts` should remain the mutable `{ max, current }` pool plus generic drain/restore helpers.

Keep resolved simulation values as floats. The old NPC profile currently rounds maxima through `finalMax()`; do not carry that rounding into the new Endurance-derived Stamina path unless presentation explicitly needs it.

## NPC profile migration is the important part

`src/settlement/npcPhysicalProfile.ts::generatePhysicalProfile()` still computes `maxStamina` through the pre-SPEA path:

```text
100 × SEX_MODIFIERS[sex].stamina × ageMultiplier × staminaVariation
```

At the same time it now generates deterministic base `attributes.endurance`. Therefore simply multiplying current `profile.maxStamina` by the Endurance rule would double-model the same physical variation.

Establish an NPC human/profile Endurance resolver analogous in role to `resolveHumanStrengthProfile(profile)`, then derive `maxStamina` from that resolved Endurance. Remove the old final-capacity Stamina use of `SEX_MODIFIERS.stamina`, generic `ageMultiplier` and `staminaVariation`.

Do not regenerate SPEA or introduce another seed. `generatePhysicalProfile()` already has a dedicated deterministic Endurance stream.

If legacy sex/age/development information is retained for Endurance shaping, keep it upstream in the human Endurance resolver. Do not leave any of it as an additional multiplier after `resolveMaxStamina()`.

One compatibility detail: `PhysicalProfile` currently exposes `staminaVariation` and `ageMultiplier` because other profile capacities still use the old model. Do not remove shared profile fields merely to clean up Stamina unless searches confirm they are now unused by HP/Vigor/tests.

## NPC state restore has a derived-max trap

`src/settlement/npcState.ts::NpcStateSnapshot` currently serializes both `stamina.current` **and `stamina.max`**, and `fromSnapshot()` restores the saved max verbatim. `NpcStateRegistry.getOrCreate()` does receive current generated maxima, but ignores them when a snapshot exists.

That means changing only fresh construction would leave loaded saves and in-session `WorldBundle` rebuilds on legacy max-Stamina values.

Normalize restored NPC Stamina against the newly generated Endurance-derived maximum at the registry construction boundary:

```text
newMax = current generated maxStamina
current = min(saved current, newMax)
max = newMax
```

This also gives the plan's required runtime-capacity invariant for decreases and avoids granting free Stamina when max increases.

A save-schema migration/version bump is not inherently required: the existing snapshot shape may continue carrying `max` for compatibility while current code treats Stamina max as derived on reconstruction. Do not remove persisted fields unless doing so is intentionally handled across validator/migrations/tests.

## NPC recovery seam

`src/ai/NpcAgent.ts` currently owns:

```text
BASE_REST_RATE = 6
ENERGETIC_FATIGUE_MULT = 0.6
ENERGETIC_REST_MULT = 1.5
STAMINA_EXHAUSTED_RESUME_RATIO = 0.35
```

Construction already receives/reuses the same `PhysicalProfile` for Strength (`resolveHumanStrengthProfile`) and authoritative maxima. Resolve NPC Endurance from that same profile; do not reroll or look it up from a second source.

Compose recovery there as:

```text
BASE_REST_RATE
× enduranceRecoveryMultiplier
× energetic ? ENERGETIC_REST_MULT : 1
```

Leave `fatigueMult`, activity-specific drain rates, `REST_PHASES`, forced-rest decisions and the `0.35` resume ratio unchanged.

## Player integration

`PlayerController` already sets `this.attributes = PLAYER_STARTING_ATTRIBUTES` before constructing `this.needs = createPlayerNeeds()`. Starting Endurance is `0.6`.

Do not make `PlayerNeeds.ts` import `PlayerController.ts` just to read that constant. Prefer threading Endurance or the resolved max into `createPlayerNeeds(...)` from `PlayerController`, with an explicit neutral/legacy default only where useful for isolated tests/callers.

Current recovery ownership is concentrated in `src/player/PlayerNeeds.ts`:

```text
STAMINA_REGEN_PER_SEC = 12
sprinting → drain
else if recoveryAllowed → restore at 12/sec
```

Apply the Endurance recovery multiplier only to that restore amount. Keep `recoveryAllowed`, sprint drain, deprivation drain and `physicalEffort*` costs unchanged.

`restorePersistedNeeds()` intentionally does not restore Player Stamina; Player Stamina is transient today. Therefore no Player save migration is needed for this plan.

`resetPlayerNeeds()` refills to `needs.stamina.max`, so once construction uses `106` it should need no Endurance-specific branch.

## Construction paths to keep aligned

Real settlement NPCs are generated in `src/settlement/createSettlement.ts` from one stable `physicalSeed`, then the same `PhysicalProfile` is passed into the state registry and `NpcAgent`.

`NpcAgent.create()` also has an isolated fallback that calls `generatePhysicalProfile(...)`. Keep both paths deriving Stamina from the same profile resolver; do not let tests/fallback agents retain legacy Stamina while real settlement agents use Endurance.

## Tests worth focusing on

High-value coverage:

- pure shared mapping: exact `0/0.25/0.5/0.6/0.75/1` values and monotonicity;
- `npcPhysicalProfile.test.ts`: `maxStamina` comes from resolved Endurance and is no longer additionally multiplied by legacy `staminaVariation`/sex/generic age final-capacity factors;
- `npcState` restore: saved `current` is preserved when below the new max, clamped when above it, and a larger new max does not refill current;
- Player: starting max `106`, neutral recovery `12/sec`, starting recovery `12.72/sec`, existing recovery suppression/drain unchanged;
- NPC: base `6/sec` at neutral Endurance, Endurance multiplier + `energetic` multiplicative composition, existing fatigue rates and `0.35` resume threshold unchanged.

Avoid broad assertions that every NPC at the same sex/age must have the same Stamina: individual Endurance is intentionally deterministic per NPC.

## Pitfalls / stop conditions

- Do not multiply legacy `profile.maxStamina` by Endurance.
- Do not route `drainStamina()` through SPEA or alter activity costs.
- Do not make Endurance affect Vigor.
- Do not convert `energetic` into an Endurance bonus.
- Do not add a generic effective-attribute/modifier framework.
- Do not change fauna; it shares `StaminaState` but still owns species stamina tuning.
- Do not trust serialized NPC `stamina.max` as authoritative after this plan; the deterministic current profile must define it on reconstruction.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
