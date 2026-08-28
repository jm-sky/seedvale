# MPFB2 Female Face Research

**Date:** 2026-08-28
**Status:** `completed` ✅
**MPFB2:** 2.0.17
**Purpose:** Identify a practical base female face for Seedvale NPC generation.

---

## Goal

Find a visually appealing, natural-looking female face using MPFB2 2.0.17 facial targets.

The objective was **not** to find a single mathematically ideal face. Instead, the research focused on identifying a small set of useful facial morphs and a base combination that can later be reused for different NPC archetypes.

The research deliberately avoided exhaustive exploration of all available MPFB2 targets.

---

## Research Method

The process was split into progressively smaller selections:

1. Inspect selected head-shape targets.
2. Inspect selected facial target directions.
3. Build several complete female face combinations.
4. Select the most appealing combinations.
5. Blend the best candidates.
6. Stop once a sufficiently good base face was identified.

The target values were intentionally kept relatively subtle. Extreme morph values were not considered necessary for the base female.

---

## 1. Head Shape

Initial head-shape candidates:

```text
head-oval   0.25
head-square 0.25
head-round  0.25
```

All three were considered potentially useful.

The research did not establish one universally superior head shape. Instead, they should be treated as useful stylistic directions for future character variation.

For the final female base, the **oval direction** was retained.

---

## 2. Nose Research

The following nose morph directions were inspected:

```text
nose-width2
nose-volume
nose-hump
nose-curve
nose-point
```

At approximately `0.25`, both directions of most morphs produced visually interesting results.

Important observation:

**The useful range for natural female faces appears to be relatively subtle.**

Values around `0.25` were sufficient to create visible variation without immediately producing exaggerated facial features.

No single nose morph was selected as the defining feature of the base face. Instead, the final face uses a combination of several subtle nose adjustments.

---

## 3. Complete Face Variants

Nine complete female faces were generated:

```text
01 SOFT
02 CLASSIC
03 PRETTY
04 NORDIC
05 FRIENDLY
06 ELEGANT
07 STRONG
08 RUSTIC
09 HEROINE
```

### Selection

```text
Best:
03 PRETTY
09 HEROINE

Good:
05 FRIENDLY
08 RUSTIC

Rejected:
01 SOFT
07 STRONG
```

The remaining variants were not selected for further refinement.

---

## 4. Pretty vs Heroine

The two strongest candidates were:

```text
03 PRETTY
09 HEROINE
```

A second comparison was performed by blending these two faces:

```text
03A — 100% PRETTY
03B — 75% PRETTY + 25% HEROINE

09A — 100% HEROINE
09B — 25% PRETTY + 75% HEROINE

HYB1 — 50% PRETTY + 50% HEROINE
HYB2 — 45% PRETTY + 55% HEROINE
```

### Result

All six variants were considered reasonably good.

The differences between them were relatively subtle.

The preferred variants were:

```text
🥇 HYB1 — 50% PRETTY / 50% HEROINE
🥈 HYB2 — 45% PRETTY / 55% HEROINE
```

---

## 5. Female Base Face v1

The resulting base facial direction is:

```text
Head
  oval

Cheeks
  moderate volume
  moderate cheek-bone definition

Eyes
  slightly larger
  slightly inset

Eyebrows
  slight upward angle

Nose
  slightly narrower
  moderate/reduced volume
  subtle shaping

Chin / Jaw
  slightly narrower chin
  moderate chin prominence

Mouth
  slightly wider
  fuller upper lip
  fuller lower lip
  slightly raised mouth corners
```

The resulting face should be considered a **base facial template**, not a final character.

---

## 6. Preferred Base

The preferred starting point for future female characters is:

```text
Female Base Face v1

Primary:
  HYB1

Alternative:
  HYB2
```

The two variants are close enough that they can potentially serve as natural variation around the same base.

---

## 7. Character Variation Strategy

Future female NPC archetypes should **reuse this base** rather than creating unrelated facial systems.

Examples:

```text
Village Woman
  → Female Base
  → softer / rounder variation
  → subtle natural asymmetry

Bard
  → Female Base
  → more distinctive eyes / eyebrows
  → slightly stronger mouth features

Noble Woman
  → Female Base
  → more elegant head / cheek structure

Warrior
  → Female Base
  → stronger jaw / cheek bones
  → less soft facial proportions

Old Woman
  → Female Base
  → age
  → appropriate facial changes
  → potentially stronger nose / jaw variation
```

The base should remain recognizable while character-specific targets introduce identity.

---

## Conclusion

The research successfully identified a practical female facial base for Seedvale.

The most successful source faces were:

```text
03 PRETTY
09 HEROINE
```

and the preferred combined result was:

```text
HYB1 — 50% PRETTY + 50% HEROINE
```

with:

```text
HYB2 — 45% PRETTY + 55% HEROINE
```

as the closest alternative.

Further exhaustive research of female facial targets is **not currently justified**. The next useful step is to establish the equivalent **male base face**, after which both bases can be used to construct distinctive NPC archetypes.

---

## Important Limitation

This research is based on visual inspection of generated MPFB2 models.

It does **not** establish that these are objectively optimal facial parameters, nor that the chosen targets are the only useful ones. The result is a practical art-direction decision for Seedvale rather than a complete analysis of the MPFB2 target library.
