# Plan: NPC Physical Stats — Sex & Age

**Created:** 2026-08-23  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** M  
**Depends on:** none  
**Domain:** `npc`

## Goal

Introduce deterministic generation of a basic NPC physical profile from `sex` and `age`, and use it to derive `maxHp`, `maxStamina` and `maxVigor`.

Currently all NPCs use the same baseline values of 100.

This is the first step toward the physical model described in `docs/vision/npc-physical-state.md`.

## Target physical model

The current `HP`, `stamina` and `vigor` values are not the complete future set of NPC physical attributes.

Future attributes are expected to include at least:

- `strength`
- `agility`
- potentially additional physical attributes

Those attributes are **out of scope for this plan**. The current plan should establish a profile/generation boundary that can later be extended without replacing the existing runtime state model.

Conceptually:

```text
sex + age + deterministic individual variation
                    ↓
            PhysicalProfile
                    ↓
        max HP / stamina / vigor
```

## 1. Age

Add real age as first-class NPC data instead of representing children only through `relation + scale`.

### Age range

NPC age is an integer in the range **0–100**.

### Life stages

| Age | Stage |
|---:|---|
| 0–4 | infant |
| 5–8 | child |
| 9–12 | child |
| 13–17 | teen |
| 18–24 | young adult |
| **25–35** | **adult prime** |
| 36–49 | adult |
| 50–64 | mature |
| 65–84 | elderly |
| **85–100** | **very elderly** |

The physical curve should be continuous rather than introducing hard stat jumps at life-stage boundaries.

### Age multiplier

Use the following target physical-capacity ranges:

| Age | Target multiplier |
|---:|---:|
| 0–4 | 0.20–0.30 |
| 5–8 | 0.30–0.45 |
| 9–12 | 0.45–0.60 |
| 13–17 | 0.60–0.85 |
| 18–24 | 0.90–1.00 |
| **25–35** | **1.00** |
| 36–49 | 0.98–1.00 |
| 50–64 | 0.95–0.98 |
| 65–74 | 0.88–0.94 |
| 75–84 | 0.80–0.87 |
| 85–100 | 0.70–0.79 |

The implementation should interpolate within these ranges rather than selecting an arbitrary value per life stage.

The post-prime decline is intentionally mild. An older NPC can remain physically capable and individual variation can outweigh age differences for particular NPCs.

## 2. Sex

Use the existing NPC `gender` value as the input for the physical profile, without redesigning identity in this plan.

Sex modifiers for adult baseline physical capacity are:

| Sex | HP | Stamina | Vigor |
|---|---:|---:|---:|
| Male | 1.10 | 1.10 | 1.00 |
| Female | 0.90 | 0.90 | 1.05 |

Thus sex has a meaningful but bounded influence:

- HP: ±10%
- stamina: ±10%
- vigor: female +5%, male baseline

Sex must not completely determine an individual's capability. Age and individual variation remain independent inputs, and future `build`, traits and physical attributes will add further variation.

## 3. Individual variation

Every NPC receives deterministic individual variation of **±10%**.

Use separate variation values for each derived capacity:

```text
hpVariation
staminaVariation
vigorVariation
```

This means two otherwise identical NPCs do not necessarily receive identical physical capacities, and one NPC does not simply get a single global `+7%` or `-7%` modifier across all stats.

The variation must be deterministic for the NPC's stable generation seed.

## 4. Baseline values

Keep the existing adult baseline scale:

```text
HP      = 100
Stamina = 100
Vigor   = 100
```

These are neutral reference values, before sex, age and individual modifiers.

## 5. Final generation formula

For each derived capacity:

```text
finalMax = adultBase × sexModifier × ageModifier × individualVariation
```

For example, a prime-age male with average variation uses:

```text
HP      = 100 × 1.10 × 1.00 × variation
Stamina = 100 × 1.10 × 1.00 × variation
Vigor   = 100 × 1.00 × 1.00 × variation
```

A prime-age female uses:

```text
HP      = 100 × 0.90 × 1.00 × variation
Stamina = 100 × 0.90 × 1.00 × variation
Vigor   = 100 × 1.05 × 1.00 × variation
```

The implementation should define explicit clamping/rounding rules so generated runtime values remain valid and stable.

## 6. Deterministic generation

The physical profile must be generated from the existing deterministic NPC/family generation flow.

The same NPC seed/input must produce the same:

- age,
- physical profile,
- HP variation,
- stamina variation,
- vigor variation.

Different NPCs should normally produce different values.

Family generation must remain coherent with the existing deterministic family-generation model.

## 7. Family age generation

Age generation must be integrated with family generation rather than assigning arbitrary independent ages to every NPC.

The implementation must preserve sensible relationships between:

- parents and children,
- siblings,
- household members.

Children need actual ages, not only a `child` relation/visual scale.

Exact parent-age constraints and family-generation ranges should be implemented deterministically and documented in code/tests.

## 8. Integration point

Generate the physical profile before creating `NpcAuthoritativeState`.

Target flow:

```text
character / family generation
        ↓
     sex + age
        ↓
generatePhysicalProfile()
        ↓
NpcAuthoritativeState
 ├── health.maxHp
 ├── stamina.max
 └── vigor.max
```

Do not create a second independent physical-stat system inside `NpcAgent`.

Existing runtime primitives remain in use:

- `HealthState`
- `StaminaState`
- `VigorState`

## 9. Existing mechanics remain unchanged

This plan changes the baseline capacities, not the mechanics that consume them.

Do not redesign in this plan:

- stamina drain,
- stamina restoration,
- vigor costs,
- vigor regeneration,
- sleep/recovery mechanics,
- combat damage,
- healing,
- NPC decisions,
- work actions.

Those systems should automatically use the newly generated capacities through the existing runtime state.

## 10. Tests

Add focused tests for:

- deterministic age generation,
- deterministic physical profile generation,
- valid age range `0–100`,
- life-stage classification,
- continuous age multiplier behaviour,
- sex modifiers,
- independent ±10% variation for HP/stamina/vigor,
- valid/clamped final values,
- correct values passed into `NpcAuthoritativeState`,
- sensible parent/child ages,
- sensible sibling ages,
- preservation of existing health/stamina/vigor runtime behaviour.

Include distribution-oriented checks to catch accidental pathological generation ranges.

## Out of scope

Do not implement in this plan:

- `strength`,
- `agility`,
- additional future physical attributes,
- body build,
- height,
- physical traits,
- heredity,
- hair/face/appearance,
- injuries,
- illnesses/diseases,
- temporary conditions,
- age-related visual appearance,
- 3D body variants.

These are future extensions of the physical profile described in `docs/vision/npc-physical-state.md`.

## Verification

Run:

- TypeScript check,
- lint,
- unit tests,
- production build.

Review the existing NPC/family generation paths to ensure all NPC creation paths receive a physical profile.

Browser verification is not the primary verification target because this plan changes deterministic simulation data rather than rendering.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
