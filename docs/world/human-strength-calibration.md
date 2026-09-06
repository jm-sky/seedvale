# Human Strength Calibration

**Status:** authoritative modelling supplement  
**Scope:** human `Strength` generation for SPEA  
**Created:** 2026-09-06

## Purpose

This document records the agreed Seedvale modelling calibration for human `Strength` before the first SPEA implementation plan.

It supplements `docs/world/species-physical-reference.md`. The species reference remains authoritative for SPEA semantics, species-relative scaling and absolute capability boundaries. This file narrows only the current human `Strength` population model.

The values below are **Seedvale modelling choices**, not direct laboratory measurements. Biological evidence establishes the direction and approximate magnitude of sex- and age-related population differences; Seedvale maps those observations onto its normalized `0..1` SPEA scale.

## Shared human scale

Human `Strength` uses one common human scale:

```text
0.5 = typical healthy adult human reference
```

Do **not** reinterpret `0.5` separately for men and women. A `Strength` value can therefore be compared directly between two humans.

Sex affects the population distribution used when generating a physical profile. It is not a runtime bonus and does not determine an individual's final Strength.

## Healthy-adult population calibration

Initial Seedvale model:

| Sex | Mean Strength | SD |
|---|---:|---:|
| male | `0.58` | `0.10` |
| female | `0.42` | `0.10` |

The distributions intentionally overlap substantially. For example, a woman with `Strength 0.65` is stronger in this model than a man with `Strength 0.55`.

These means are marked **M (Seedvale modelling choice)**. They are deliberately less extreme than mapping a single measured strength test such as grip strength directly onto SPEA, because SPEA Strength represents general force-producing physical capacity rather than one muscle group or test.

Generation must remain deterministic. Ordinary individual variation should retain the bell-shaped/truncated-normal semantics established in `species-physical-reference.md`; do not replace it with uniform random rolls.

## Age calibration

Human Strength should use an attribute-specific development/decline curve rather than reuse a generic HP/Stamina/Vigor age multiplier.

Initial adult-potential reference curve:

| Age | Strength potential factor |
|---:|---:|
| 20 | `0.95` |
| 25 | `0.98` |
| 30–39 | `1.00` |
| 40 | `0.98` |
| 50 | `0.92` |
| 60 | `0.84` |
| 70 | `0.73` |
| 80 | `0.60` |
| 90+ | `0.48` |

Interpolate between anchors where needed.

These factors are also **M (Seedvale modelling choice)**. Evidence supports peak adult strength around early/middle adulthood followed by age-related decline, with the rate depending strongly on muscle group, activity and individual history. The table is a simulation curve, not a claim that every person's strength changes by these exact percentages.

### Juveniles

Do not over-calibrate juvenile Strength in the first SPEA/melee implementation.

Children and adolescents require a development model that accounts for growth and the emergence of sex differences around maturation. Until a dedicated calibration is justified by a real consumer, the first implementation may reuse the existing NPC development/life-stage mechanism conservatively, provided it does not redefine the adult SPEA reference or pretend the adult sex distribution applies unchanged to children.

## Base vs effective Strength

The intended ownership remains:

```text
human reference population
+ deterministic individual variation
+ sex / age / physical-profile inputs
→ stable current base Strength

base Strength
+ temporary conditions
→ effective Strength
```

Temporary injury, illness, poisoning, exhaustion or similar state must never rewrite the stable base roll.

Do not persist separate derived/effective Strength as another source of truth.

## Consumer boundary

This calibration does **not** define melee damage, carrying capacity, work speed or another gameplay multiplier.

Consumers decide how much Strength matters to their own mechanic. In particular:

- melee retains weapon/action base damage and uses Strength only as one contribution;
- carrying must not invent a universal biological human lift maximum;
- pushing/collision must keep body mass, velocity, leverage and footing separate;
- future skills and conditions remain separate inputs.

The first SPEA implementation plan may define its own conservative melee mapping, but that mapping belongs to combat/plan documentation rather than this biological/profile calibration.

## Evidence basis

Research used to calibrate the modelling direction:

- Dodds et al./later global normative synthesis of adult handgrip strength: large population evidence for substantial sex differences and peak strength in early/middle adulthood. Handgrip is an evidence anchor, **not** a direct SPEA conversion. PubMed: https://pubmed.ncbi.nlm.nih.gov/39647778/
- Longitudinal evidence of age-related strength decline and acceleration with ageing. PubMed: https://pubmed.ncbi.nlm.nih.gov/9310077/
- Longitudinal older-adult lower-extremity strength evidence showing substantial decline and variation by sex/body composition/activity. PubMed: https://pubmed.ncbi.nlm.nih.gov/11320101/
- Pediatric/adolescent normative evidence supports age- and maturation-dependent development rather than applying adult sex offsets uniformly to children. PubMed: https://pubmed.ncbi.nlm.nih.gov/36696264/

## Implementation rule

Implementation plans should reference this file for the current human Strength population calibration and `docs/world/species-physical-reference.md` for the broader SPEA/species model. If better evidence or a better simulation model changes these numbers, update the design reference first and then migrate consumers deliberately.
