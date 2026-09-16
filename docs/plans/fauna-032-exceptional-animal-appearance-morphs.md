# Plan: Exceptional animal appearance morphs

**Created:** 2026-09-16
**Status:** `draft` 📝
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~fauna-018~~, ~~fauna-022~~
**Domain:** `fauna`
**Subdomains:** `lifecycle` `population`
**Tags:** `variants` `appearance` `persistent-animals`
**Roadmap:** `quests-hunters-brotherhood.md`

## Goal

Extend the existing per-individual fauna variation model so one animal can have a rare, exceptional appearance independently from gameplay/combat semantics such as `alpha`.

The first consumer is `quests-progression-054`, for example a large pale or nearly white stag used in the Hunters Brotherhood finale. The mechanism must remain fauna-owned and reusable outside quests.

## Current problem

The current variant model is:

```ts
type AnimalVariant = 'normal' | 'alpha'
```

`alpha` currently bundles scale, health, damage, speed, danger significance and darkening. That makes it unsuitable for a rare white or pale animal that should remain a normal stag in combat terms.

Keep these concepts distinct:

```text
AnimalKind
+ gameplay variant
+ appearance profile
+ individual presentation scale
```

`alpha` must not become a synonym for rare, exceptional or albino.

## Architecture

### Gameplay variant

Preserve the existing `AnimalVariant` semantics for gameplay/combat differences such as `alpha`.

Appearance work must not silently change:

- max HP,
- outgoing damage,
- speed,
- aggression,
- danger significance.

### Appearance profile

Introduce a fauna-owned per-individual appearance descriptor separate from `AnimalVariant`.

V1 only needs one authored exceptional preset, provisionally `pale`, but the representation should not force the architecture into a closed `normal | pale` enum if a small descriptor fits the current code better.

A suitable contract may resemble:

```ts
type AnimalAppearanceProfile = {
  tintTarget?: number
  tintStrength?: number
}
```

Exact naming and fields should follow implementation recon and existing material utilities.

The first preset should support a visibly lighter, near-white presentation while preserving recognizable texture/model detail.

Do not assume plain RGB multiplication is sufficient for textured GLB assets. Preserve texture detail and avoid washing out eyes, antlers, hooves or material separation.

### Individual presentation scale

Do not make scale a property of the appearance morph itself.

An exceptional animal may be larger without being pale, and a pale animal may remain normal size. Represent individual presentation scale as a separate per-individual configuration axis and compose it with the existing gameplay variant scale in one clearly owned path.

The composition must be bounded and explicit so combinations such as `alpha + exceptional scale` cannot accidentally produce unreasonable sizes.

## Persistent occupants

Reuse `PersistentOccupantDecl` and the existing persistent habitat occupant lifecycle. Do not add another persistence manager.

For persistent exceptional animals, appearance and individual scale must be deterministic from stable world/fauna declaration or configuration rather than runtime randomization.

Preferred flow:

```text
world composition
→ persistent occupant declaration/config
→ stable animalId
→ appearance profile + individual scale
→ AnimalAgent
```

Do not add appearance fields to `AnimalSaveState` unless implementation recon proves deterministic declaration cannot safely restore the same presentation.

## World independence

The exceptional animal must not be created by quest activation.

For the Hunters Brotherhood consumer:

```text
world/fauna composition
→ persistent stag exists independently
→ quest later discovers and binds the existing animal
```

The quest gives the animal narrative meaning; fauna owns its identity, presentation and lifecycle.

## Rare morph scope

V1 provides the mechanism and one authored exceptional presentation. It does not introduce global random rare-morph spawning.

A future world-generation plan may deterministically assign rare appearances at low probability using the same mechanism, but this plan does not add:

- genetics,
- inheritance,
- breeding rules,
- rarity tables for all species,
- random runtime mutation.

## Existing variant compatibility

Existing `alpha` behavior must remain unchanged.

Appearance profiles should compose with gameplay variants without altering their meaning. A technically possible animal may therefore be:

```text
kind = wolf
variant = alpha
appearance = pale
```

whether or not current content uses that combination.

The legacy dangerous quest trait must continue to compose through the existing gameplay modifier path and must not become coupled to appearance profiles.

## Presentation requirements

- Resolve appearance and scale during `AnimalAgent` creation/presentation initialization.
- Apply material changes once, not per frame.
- Reuse existing material-cloning/tint utilities where they are appropriate.
- Generalize the current darkening-only helper only as much as required to support lighter/target tint presentation cleanly.
- Normal animals must render identically to current behavior.
- Existing alpha animals must retain their current darker presentation and gameplay stats.
- Support both loaded GLB presentation and fallback geometry.

## First consumer: Hunters Brotherhood

`quests-progression-054` should be able to bind an animal equivalent to:

```text
kind: stag
gameplay variant: normal
appearance profile: pale
individual scale: slightly larger
persistent occupant: yes
```

This produces an exceptional individual that:

- is still a `stag`,
- is not an `alpha`,
- can look nearly white,
- may be larger,
- does not automatically gain combat bonuses,
- remains the same individual across save/load.

## Performance

The feature should have effectively zero recurring simulation cost:

- no new tick,
- no per-frame tint calculation,
- no population scan,
- no worker,
- no additional pathfinding or AI work.

## Ownership

```text
fauna
├─ AnimalKind
├─ gameplay variant
├─ appearance profile
├─ individual presentation scale
└─ lifecycle

persistent occupants
└─ stable individual identity

quests
└─ narrative binding only
```

Do not introduce an `ExceptionalAnimalManager` or quest-owned appearance state.

## Implementation recon

Before implementation notes are finalized, verify:

1. where existing `scaleMultiplier` is applied for GLB and fallback animals;
2. how `tintPropMaterials()` clones and modifies textured materials;
3. whether the current material pipeline can lighten toward a target color while preserving texture detail;
4. where `variantTintHex()` and `visualDarken` are consumed and how to retain compatibility for alpha;
5. whether `AnimalSaveState` contains or depends on variant/presentation data;
6. where persistent declarations become `AnimalAgent` creation options;
7. the cleanest place to provide stable appearance/scale configuration for persistent occupants;
8. whether any current callers assume `AnimalVariant` is the only source of per-individual scale;
9. whether fallback geometry and GLB assets require different tint handling;
10. how `markDangerous()` composes with the refactored presentation path without creating another modifier pipeline.

## Guardrails

- Appearance is not combat significance.
- Pale/white does not imply alpha, stronger, rarer loot or higher danger.
- Scale is separate from appearance color.
- Persistent appearance is deterministic, not rerolled after reload.
- `AnimalKind` remains species taxonomy; do not add `white_stag` or similar kinds.
- Prefer extending existing `AnimalAgent` creation/presentation seams over parallel state.
- Add JSDoc with `@domain fauna` to important new public types/resolvers used by architecture or preflight discovery.

## Non-goals

- genetics or inheritance,
- breeding rare morphs,
- procedural global rarity spawning,
- new species,
- new GLB assets,
- new AI behavior,
- exceptional-animal combat buffs,
- trophy/loot redesign,
- Hunters Brotherhood quest logic,
- a new persistence subsystem.

## Verification

1. Normal animals look and behave identically to before.
2. Alpha wolves keep their existing scale, stats and darker presentation.
3. A pale stag is visibly lighter than a normal stag while retaining texture/material detail.
4. A pale stag can use a separate larger individual scale without receiving alpha combat modifiers.
5. Appearance works for both GLB and fallback presentation.
6. A persistent pale animal keeps the same identity and appearance after save/load.
7. Persistent death/corpse/tombstone behavior remains unchanged.
8. Quest activation is not required for the exceptional animal to exist.
9. No recurring per-frame work is added.
10. The dangerous quest trait still composes through the existing gameplay modifier path.
11. Tests cover separation of gameplay variant, appearance profile and individual scale.
12. User performs browser/manual verification.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
