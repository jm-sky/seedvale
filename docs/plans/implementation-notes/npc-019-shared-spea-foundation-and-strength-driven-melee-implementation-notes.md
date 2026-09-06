# Implementation Notes: npc-019 — Shared SPEA foundation and Strength-driven melee

These notes capture the focused recon already performed for `npc-019`. They are implementation guidance, not a restatement of the plan.

## Existing ownership to preserve

### Shared mutable physical pools

`src/shared/HealthState.ts` already owns the shared Player/NPC/fauna HP primitive, and `StaminaState` follows the same shared-state pattern. SPEA should reuse the shared-primitive idea, but base SPEA is profile data rather than a mutable resource pool. Avoid putting combat/work methods on the attribute shape.

### NPC physical identity/profile

`src/settlement/npcPhysicalProfile.ts` is the existing deterministic physical-profile boundary established by `npc-001`.

Current `PhysicalProfile` contains sex, age, life stage, a generic age multiplier, independent capacity variations, and derived `maxHp`, `maxStamina`, `maxVigor`. Its header already identifies strength/agility/build/appearance as future extensions.

`generatePhysicalProfile(seed, sex, age)` uses deterministic seeded RNG. Extend this mechanism for base SPEA rather than introducing a second NPC generator or registry.

Important: the current capacity variation is uniform approximately ±10%. Do not reuse that distribution for SPEA; the SPEA design reference calls for a bell-shaped deterministic distribution around `0.5`.

The current `ageMultiplierForAge()` is a capacity curve for HP/Stamina/Vigor. Do not reuse it as the Strength age curve. Strength needs its own development/age resolution from `docs/world/human-strength-calibration.md`.

### NPC authoritative runtime state

`src/settlement/npcState.ts` owns mutable runtime state through `NpcAuthoritativeState` and `NpcStateSnapshot`: health, stamina, vigor, needs, physical injury, helper assignment and active plan.

`createNpcAuthoritativeState(..., maxima)` consumes only physical maxima from the generated profile.

Do not add deterministic base SPEA to this runtime/persistence state merely because it belongs to an NPC. Base SPEA should reconstruct with the physical profile. Later temporary conditions are a separate concern and may eventually need runtime/persistence ownership.

### NPC construction/reconstruction

`NpcAgent.create()` already has a fallback construction path that calls `generatePhysicalProfile(treeIndex, member.character.gender, member.age)` when it must create authoritative state. The normal settlement construction path also generates the physical profile from a deterministic member seed and passes the maxima into the state registry.

Before wiring SPEA through combat, verify the exact current construction path and reuse its stable seed/profile object rather than regenerating attributes from a new unrelated seed at the attack site.

The invariant to protect is: the same NPC identity/profile inputs reconstruct the same base SPEA after settlement unload/reload, WorldBundle rebuild and save/load.

## Base vs profiled Strength

Keep three concepts distinct during implementation:

1. base individual SPEA — stable latent individual variation centered around `0.5`;
2. human profile/development effects — sex and age/development calibration;
3. consumer effect — melee maps the resolved human Strength to damage.

Do not encode the adult male/female means directly by changing the base-roll distribution. The clean model is a neutral individual base distribution plus human profile calibration, with overlapping final distributions.

The adult calibration reference is approximately male `0.58`, female `0.42`, individual SD approximately `0.10`. The plan permits a practical v1 sex shift around the neutral reference (`+0.08` / `-0.08`) but this belongs in the human profile resolution, not in `PhysicalAttributes` itself.

For age, use the dedicated Strength anchors from the calibration document. Juveniles do not yet have a researched Seedvale-specific Strength curve; use a small explicit temporary development mapping and document it rather than silently treating the existing capacity curve as biological Strength calibration.

Avoid exposing a broadly named final `effectiveStrength()` API if it only knows base + sex + age. Conditions/injury/disease are deliberately not implemented yet. A narrower human/profile resolver leaves room for the later true effective-attribute layer.

## Player ownership

`src/player/PlayerController.ts` directly owns current Player physical/runtime concepts such as `health`, `needs` and `skills`.

Add the shared physical-attribute primitive there rather than creating a Player-specific attribute subsystem. For this plan the Player values are all fixed at `0.6`.

This is only a starting-profile choice. Keep `0.5` as the shared typical-adult/reference point and as the neutral point for consumer mappings.

Do not modify `SavePlayer`/save schema for these constants. Current `src/persistence/saveData.ts` also has an unrelated Player-HP persistence gap; leave it untouched.

## Melee integration seams

### Player

`src/player/playerMelee.ts` owns melee attack lifecycle/hit windows/geometry. It should remain attribute-agnostic.

The current Player outgoing melee damage is resolved in `src/app/gameLoop.ts`. The relevant calculation applies the weapon's damage and current sharpness modifier before `resolveCriticalHit(...)`.

Insert the shared Strength contribution after the existing sharpness contribution and before critical resolution:

```text
weapon base damage
× sharpness
× Strength contribution
→ critical
→ existing target defense / accepted damage
```

Do not alter hit range, arc, wind-up, hit window, recovery, lunge, target acquisition or current stamina/Vigor costs.

### NPC

`src/ai/npcCombat.ts::applyNpcMeleeHit(...)` currently resolves `config.damage` through `resolveCriticalHit(...)` and then calls the target's damage entry point.

`NpcAgent` calls this helper after its existing melee geometry/lifecycle has established a hit.

Thread the NPC's already-resolved/profiled Strength into this path and apply the same shared Strength rule before critical resolution. Do not duplicate the formula in `NpcAgent` and `npcCombat.ts`.

NPC ranged combat is separate and outside scope.

### Existing Player/NPC asymmetry

Player melee currently applies weapon sharpness before damage; NPC melee does not have the same maintenance/sharpness path. Do not fix that asymmetry in `npc-019`. It is unrelated to SPEA and would broaden the combat refactor.

## Shared melee rule

The agreed consumer mapping is linear and neutral at `0.5`:

```text
multiplier = 0.7 + strength * 0.6

0.00 → 0.70
0.25 → 0.85
0.50 → 1.00
0.75 → 1.15
1.00 → 1.30
```

Prefer one small pure combat-owned helper that applies or resolves this contribution. The attribute primitive must not know melee damage.

If sharing the helper between Player and NPC starts requiring a large combat abstraction, stop at the small pure shared helper. Do not introduce a CombatManager/capability manager for this plan.

Do not introduce a new minimum-damage rule or rebalance weapon catalog values.

## Relevant tests

### `npcPhysicalProfile.test.ts`

This is the natural home for deterministic generation/profile tests. Useful contracts:

- same seed/sex/age → same base SPEA;
- different seeds can produce different values;
- four attributes use independent deterministic streams rather than one hidden athleticism roll;
- base values stay in `0..1`;
- a broad deterministic sample is centered near `0.5` and mostly in the intended ordinary range;
- sex-profiled Strength distributions overlap;
- Strength age resolution is independent from the generic capacity age multiplier.

Use broad statistical assertions, not an exact sampled mean that couples tests to the precise normal-sampler implementation.

### Combat tests

`npcCombat.test.ts` is the existing focused NPC combat seam. Protect neutral legacy behaviour (`0.5 → ×1.0`), low/high boundaries, and critical determinism.

For Player, prefer testing the shared pure melee-strength rule rather than forcing a large `gameLoop.ts` integration harness solely for the arithmetic. Existing Player melee tests should remain focused on lifecycle/geometry unless there is already a clean damage seam to extend.

Also protect the Player starting profile separately: all four starting attributes are `0.6`. Do not change the neutral melee assertion to `0.6`; the consumer rule remains neutral at `0.5`.

## Documentation boundaries

After implementation update the canonical state docs that own these concepts, especially:

- `docs/state/npc.md` for deterministic NPC physical-profile/SPEA ownership;
- `docs/state/player-systems.md` for Player-owned starting SPEA (`0.6` in all four attributes) and the first melee consumer.

Do not duplicate the biological/species tables. `docs/world/species-physical-reference.md` remains authoritative for species-relative SPEA semantics and `docs/world/human-strength-calibration.md` for human Strength calibration.

Add JSDoc to important new shared/public architectural symbols where it improves preflight discovery; use `@domain` where appropriate per `PLANNING.md`.

## Suggested implementation order

1. Add the shared physical-attribute type and only the minimal invariant/helper surface actually needed.
2. Extend deterministic NPC physical-profile generation with four independent bell-shaped base rolls and focused tests.
3. Add human Strength profile/development resolution and tests, keeping it separate from the generic capacity age multiplier.
4. Give `PlayerController` starting shared attributes of `0.6` in Strength, Perception, Endurance and Agility.
5. Add the small shared melee Strength rule and boundary tests.
6. Thread Player Strength into the existing Player damage calculation before critical resolution.
7. Thread NPC profiled Strength into `applyNpcMeleeHit(...)` before critical resolution.
8. Run focused tests, then repository typecheck/build/test gates from the current `package.json`.
9. Update canonical state docs and implementation status as required by the repository workflow.

Do not run `pnpm docs:sync` manually; the GitHub workflow handles derived documentation.

## Pitfalls / stop conditions

- Do not create `PlayerAttributes`, `NpcAttributes` or fauna-specific parallel primitives.
- Do not persist deterministic NPC base SPEA as a shortcut for an unstable generation path; fix/use a stable identity seed instead.
- Do not persist the Player's four constant `0.6` values in this plan.
- Do not move the shared neutral/reference point from `0.5` just because the Player starts at `0.6`.
- Do not mutate base SPEA for age, injury, illness or fatigue.
- Do not interpret raw SPEA as an absolute cross-species capability.
- Do not reuse the generic HP/Stamina/Vigor age multiplier as the Strength curve.
- Do not rebalance current NPC HP/Stamina/Vigor maxima while touching `npcPhysicalProfile.ts`.
- Do not migrate fauna combat, carrying, work, Endurance, Agility or Perception here.
- Do not build a generic modifier stack before there is a real condition/modifier consumer.
- Do not move melee hit geometry/lifecycle into the attribute system.
- If current code has changed since this recon, follow current code ownership and update these notes rather than forcing stale symbol assumptions.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
