# Plan: Shared SPEA foundation and Strength-driven melee

**Created:** 2026-09-06
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~npc-001~~
**Domain:** `npc`
**Subdomains:** `combat` `behavior`
**Tags:** `spea` `physical-attributes`
**Roadmap:** `physical-attributes-health-and-medicine.md`

## Goal

Introduce the shared Seedvale physical-attribute foundation:

- Strength,
- Perception,
- Endurance,
- Agility,

and make **Strength** the first real consumer by integrating it into the existing Player and NPC melee-damage paths.

This is deliberately a small vertical slice. It establishes shared attribute semantics and one meaningful gameplay consequence without prematurely building the later condition, capability, fauna or progression systems.

Authoritative design references:

- `docs/world/species-physical-reference.md` — SPEA meaning, species-relative semantics and the boundary between attributes and absolute capability;
- `docs/world/human-strength-calibration.md` — Seedvale's human Strength calibration;
- `docs/vision/npc-physical-state.md`;
- `docs/roadmap/physical-attributes-health-and-medicine.md`.

Do not invent new biological coefficients inside the implementation. If the current code conflicts with these references, call out the discrepancy and resolve the source-of-truth issue rather than hiding it in a local workaround.

## 1. Shared SPEA primitive

Introduce one shared physical-attribute shape for Player, NPCs and later fauna:

```ts
export type PhysicalAttributes = {
  strength: number
  perception: number
  endurance: number
  agility: number
}
```

Each attribute uses the `0..1` SPEA scale from `docs/world/species-physical-reference.md`.

`0.5` means a typical healthy adult **within the relevant species/reference profile**. Raw SPEA is not an absolute cross-species capability and must never be interpreted as one.

`PhysicalAttributes` stores stable individual base attributes only. It must not know about combat, work, movement, species, UI, age, sex, injuries, illness or temporary conditions.

Prefer `PhysicalAttributes` over a `*State` name unless current code conventions make `State` materially clearer: these values are profile data, unlike mutable pools such as `HealthState` and `StaminaState`.

Perception, Endurance and Agility are intentionally data-only in this plan. Their consumers belong to later plans.

## 2. Base attributes vs physical profile vs effective capability

Preserve this ownership model:

```text
species reference capability
+ stable individual base SPEA
+ age / development / sex / build / persistent profile
+ temporary conditions
→ effective attribute/capability
→ concrete consumer
```

Do not fold age or sex permanently into the NPC's individual base SPEA roll.

This separation is important because an NPC should remain the same underlying individual while aging, becoming injured or recovering. Later temporary conditions must be able to alter effective capability without rewriting base attributes.

`npc-019` should establish the boundary needed for Strength, but must **not** introduce a generic `AttributeModifier[]`, modifier manager, stacking framework or duration system.

Avoid naming a partial v1 helper as though it already represented the final global `effectiveStrength()` semantics. Prefer a narrowly scoped human/profile resolver until the later condition layer exists.

## 3. Deterministic NPC base SPEA

Extend the existing deterministic physical-profile generation in `src/settlement/npcPhysicalProfile.ts` rather than creating a parallel NPC attribute generator or registry.

`PhysicalProfile` should expose the NPC's shared base `PhysicalAttributes` alongside the physical-profile data it already derives.

Generate the four base attributes from the same stable NPC-generation input already used by `generatePhysicalProfile()`, with independent deterministic streams per attribute.

Use a bell-shaped distribution around `0.5`, following the species physical reference recommendation:

```text
latent z ≈ truncated normal(mean = 0, sd = 1, bounds ≈ [-3,+3])
base SPEA = 0.5 + z × 0.10
```

The intended population shape is:

- roughly two thirds of ordinary healthy adults around `0.40..0.60`;
- most around `0.30..0.70`;
- `0.2` / `0.8` unusual;
- values near `0` / `1` exceptional rather than routine rolls.

Do not reuse the existing uniform `±10%` HP/Stamina/Vigor variation as the SPEA distribution, and do not use `Math.random()`.

Do not introduce one hidden shared "athleticism" roll: Strength, Perception, Endurance and Agility should initially have independent latent variation unless a later plan introduces explicit, evidence-backed correlations.

## 4. Human Strength profile calibration

For humans, keep the base individual roll separate from demographic/development effects.

The adult population calibration recorded in `docs/world/human-strength-calibration.md` is:

```text
male population mean   ≈ 0.58
female population mean ≈ 0.42
individual SD          ≈ 0.10
```

A practical v1 interpretation is a profile shift around the neutral human reference:

```text
male   ≈ +0.08
female ≈ -0.08
```

This is a Seedvale modelling calibration, not a universal `maleStrengthBonus`. The distributions must overlap, and sex must never determine the final value of an individual NPC.

The implementation should preserve the conceptual distinction between:

```text
individual base variation
vs
population/profile calibration
```

## 5. Strength age/development calibration

Do **not** reuse `npcPhysicalProfile.ts::ageMultiplierForAge()` as the Strength age curve. That existing curve belongs to HP/Stamina/Vigor capacity generation and has different semantics.

Use a Strength-specific age/development mapping based on `docs/world/human-strength-calibration.md`.

Adult anchors:

```text
20      0.95
25      0.98
30–39   1.00
40      0.98
50      0.92
60      0.84
70      0.73
80      0.60
90      0.48
```

Interpolate deterministically between anchors.

Exact child/adolescent biological calibration is intentionally deferred. For NPCs under 18, use an explicitly documented temporary development mapping compatible with the existing age model; do not pretend that this plan establishes a researched juvenile Strength curve.

Do not change or rebalance the existing HP/Stamina/Vigor sex/age maxima in this plan even if their older calibration differs from the new Strength model.

## 6. Player SPEA

Give the Player the same shared `PhysicalAttributes` primitive.

The initial Player profile is slightly above the typical healthy-adult reference:

```ts
{
  strength: 0.6,
  perception: 0.6,
  endurance: 0.6,
  agility: 0.6,
}
```

This changes only the Player's starting attributes. It does not move the shared neutral/reference point: `0.5` still means a typical healthy adult and remains the neutral point for consumer mappings such as melee.

Do not create `PlayerAttributes`, a separate Player-only attribute system or character creation/progression in this plan.

Do not persist Player SPEA yet. All four values are currently deterministic constants, so storing them would add save schema/migration work without preserving information that cannot already be reconstructed. Persistence belongs in the plan that makes Player base attributes configurable, progressable or otherwise non-deterministic.

Do not expand this task into fixing the existing Player HP persistence gap.

## 7. NPC persistence and reconstruction

Do not add base SPEA to `NpcAuthoritativeState` or `NpcStateSnapshot` merely because it is character data.

NPC base SPEA belongs to the same deterministic physical-profile construction boundary already established by `npc-001`. Existing saves should remain valid and should not need a save-version bump solely for `npc-019`.

The same NPC must reconstruct to the same base SPEA from the existing stable generation inputs across settlement unload/reload, `WorldBundle` rebuild and save/load reconstruction.

If recon during implementation shows that the existing generation input is not actually stable enough for that guarantee, stop and establish a stable deterministic input rather than persisting random output as a shortcut.

## 8. Shared Strength → melee rule

Strength becomes the first SPEA consumer through one shared, pure melee rule used by both Player and NPC melee damage resolution.

The agreed mapping is:

```text
Strength   melee multiplier
0.00       0.70
0.25       0.85
0.50       1.00
0.75       1.15
1.00       1.30
```

Equivalent linear mapping:

```ts
0.7 + strength * 0.6
```

`Strength = 0.5` must preserve current melee damage exactly.

Prefer a shared damage-facing helper such as:

```ts
applyMeleeStrength(baseDamage, strength)
```

rather than duplicating `damage * multiplier` in Player and NPC code. The exact symbol name may follow existing combat naming conventions.

This rule belongs to the melee consumer, not to `PhysicalAttributes`. Do not add methods such as `attributes.getDamageMultiplier()`.

Do not add a new global minimum-damage clamp or any other hidden balance change unless the existing combat pipeline already requires it.

## 9. Player melee integration

Integrate Strength into the existing Player melee damage path without changing melee geometry, targeting or lifecycle.

The intended damage ordering is:

```text
weapon base damage
× current sharpness modifier
× Strength melee contribution
→ critical hit
→ target defense / accepted damage
```

Keep these behaviours unchanged:

- `resolveMeleeHits()` range/arc hit testing;
- wind-up / hit-window / recovery timing;
- lunge and fallback approach;
- stamina and Vigor costs;
- target acquisition and target memory;
- critical-hit determinism.

Strength must modify the resolved attack, not the weapon catalog's base definition.

## 10. NPC melee integration

Integrate NPC effective human Strength into the existing NPC melee path and use exactly the same shared melee Strength rule as the Player.

Do not duplicate the formula in `NpcAgent`, `npcCombat.ts` and `gameLoop.ts`.

Keep NPC target selection, combat lifecycle, weapon selection, defense handling and ranged combat unchanged.

Player melee currently has weapon-sharpness handling that NPC melee does not. This is an existing weapon-maintenance asymmetry and is **out of scope** for `npc-019`; do not turn the SPEA work into a broader combat refactor.

If sharing the Strength rule would require a large combat-pipeline redesign, prefer the smallest shared pure helper over introducing a `CombatManager`, generic capability manager or other new orchestration layer.

## 11. Tests

Add focused tests that protect the architectural and balance contracts rather than overfitting implementation details.

Cover at least:

- shared attribute values remain within `0..1`;
- Player starting attributes are exactly `0.6`;
- NPC SPEA is deterministic for the same generation inputs;
- independent attribute streams do not collapse to one shared roll;
- a broad deterministic sample remains centered around `0.5` and overwhelmingly inside the intended ordinary-adult range without requiring an unrealistically exact sample mean;
- human sex calibration preserves overlapping Strength distributions;
- Strength age/development resolution is independent of the existing generic HP/Stamina/Vigor age multiplier;
- `Strength 0.0 → ×0.70`, `0.5 → ×1.00`, `1.0 → ×1.30`;
- Player and NPC melee use the same rule;
- `Strength = 0.5` preserves legacy melee damage;
- deterministic critical-hit behaviour remains deterministic.

Prefer exact deterministic fixtures for stable boundaries and broad statistical invariants for distribution shape. Do not write fragile tests that require a sampled mean to match `0.500` to tiny tolerances.

## 12. Documentation and discovery

Update the relevant canonical state documentation after implementation so ownership is clear:

```text
shared PhysicalAttributes
NPC deterministic PhysicalProfile → base SPEA
human profile/development resolution → melee-relevant Strength
Player starting SPEA = 0.6
melee as the first SPEA consumer
```

Do not duplicate the authoritative biological/species tables into state docs.

Add or update JSDoc on important architectural/public functions and types where it materially helps preflight discovery, using `@domain` tags where appropriate per `docs/plans/PLANNING.md`.

## Non-goals

`npc-019` does **not** implement:

- fauna SPEA or fauna combat migration;
- cross-species absolute Strength comparison;
- Strength → carrying, encumbrance, work duration, productivity or stamina cost;
- Endurance consumers;
- Agility consumers;
- Perception / Observation;
- temporary condition/modifier framework;
- injury severity, disease, poisoning or Medicine;
- doctor/herbalist treatment;
- attribute UI;
- character creation or attribute progression;
- Player SPEA persistence;
- Player HP persistence;
- NPC weapon sharpness/maintenance integration;
- ranged Strength effects or bow requirements;
- generic `PhysicalCapabilityManager`, `AttributeManager` or similar God Object;
- rebalance of existing weapon base damage;
- rebalance of existing NPC HP/Stamina/Vigor maxima.

## Expected integration points

Recon identified these existing seams as the likely implementation surface:

- `src/settlement/npcPhysicalProfile.ts` and its tests — deterministic NPC physical profile;
- `src/player/PlayerController.ts` — Player-owned physical attributes;
- `src/combat/` — shared melee Strength rule;
- `src/ai/npcCombat.ts` / `src/ai/NpcAgent.ts` — NPC outgoing melee;
- `src/app/gameLoop.ts` — current Player melee damage resolution;
- `docs/state/npc.md` and `docs/state/player-systems.md` — canonical ownership docs.

These are integration seams, not a mandate to create a specific number of new modules. Prefer extending the existing mechanisms with the smallest clear ownership boundary.

## Verification

Automated verification should use the repository's current scripts from `package.json`, including targeted tests plus the normal typecheck/build/test gates applicable to the changed files.

Do not run `pnpm docs:sync` manually; derived documentation is handled by the repository workflow.

Browser/manual verification is performed by the User, not the AI implementation agent.

Manual checks should confirm that:

- the Player starts with `0.6` Strength and therefore receives the existing Strength consumer effect without changing the consumer curve itself;
- temporarily varied Player Strength changes melee damage as expected;
- NPCs with different resolved Strength values deal different damage with the same melee weapon;
- melee targeting/range/timing remain unchanged;
- reconstruction does not reroll the same NPC's base SPEA.

## Completion criteria

The plan is complete when:

- there is one shared SPEA physical-attribute primitive, with no Player/NPC parallel types;
- NPC base SPEA is deterministic and belongs to the existing physical-profile boundary;
- base individual attributes remain distinct from age/sex/development effects;
- Player starts with `0.6` in all four shared SPEA attributes;
- one shared Strength→melee rule is used by both Player and NPC;
- `Strength = 0.5` preserves legacy melee damage;
- existing melee lifecycle/hit testing remains attribute-agnostic;
- existing saves remain compatible without a save-version bump solely for SPEA;
- no generic modifier/capability manager or unrelated combat rebalance is introduced;
- tests and canonical docs reflect the new ownership and semantics.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
