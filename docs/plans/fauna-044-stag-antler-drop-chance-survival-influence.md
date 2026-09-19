# Plan: Higher stag antler drop chance with light Survival influence

**Created:** 2026-09-19
**Status:** `planned` 📋
**Type:** polish
**Priority:** medium · **Effort:** XS
**Depends on:** none
**Domain:** `fauna`
**Subdomains:** `lifecycle`
**Tags:** `harvest` `antler` `survival`
**Roadmap:** -

## Goal

Increase adult stag antler availability while keeping the result deterministic per corpse and letting the player's existing Survival skill provide only a modest bonus.

Target chance:

```ts
chance = 0.75 + 0.15 * survivalValue
```

where `survivalValue` is clamped to `[0, 1]`.

Because `PlayerSkills` currently has a minimum derived skill value of `0.2`, normal player gameplay spans **78% at novice Survival to 90% near mastery**. The underlying formula still has a 75% actor-neutral baseline.

## Current state

- `src/fauna/animalTrophyLoot.ts::trophyLootKindsForHarvest()` owns trophy generation.
- Adult `stag` currently uses a deterministic seeded roll with a fixed **50%** threshold.
- Juvenile stags never drop an antler.
- `src/fauna/animalHarvest.ts::harvestAnimalIntoInventory()` is the shared authoritative harvest operation used by both player and NPC hunter flows.
- `src/player/PlayerSkills.ts` already owns the authoritative `survival.value` in `[0,1]`; do not create a second Survival/proficiency state.
- Existing tests in `src/fauna/animalHarvest.test.ts` verify juvenile exclusion, deterministic per-corpse loot, and no reroll after harvest.

## Scope

### 1. Make antler probability an explicit input to trophy resolution

Extend the existing trophy/harvest path rather than adding a second player-only loot roll.

The trophy resolver should continue to:
- reject non-stag and juvenile animals,
- derive the random roll from the corpse/animal id exactly once,
- return `antler` only when that deterministic roll is below the resolved chance.

Keep chance computation small and pure, preferably as an exported/testable helper in `animalTrophyLoot.ts`.

### 2. Apply the agreed balance

Use:

```ts
antlerChance = clamp(0.75 + 0.15 * survivalValue, 0.75, 0.90)
```

Expected values:
- actor-neutral / no Survival input: **75%**,
- Survival `0.2`: **78%**,
- Survival `0.5`: **82.5%**,
- Survival `1.0`: **90%**.

Do not normalize the existing `0.2` skill floor to zero. The intent is deliberately weak Survival influence, not a full 15 percentage-point progression across the normal player skill range.

### 3. Reuse player skill ownership

For the player harvest call site, pass the current authoritative `playerSkills.survival.value` into the shared harvest/trophy operation.

Do not:
- read global player state from `animalTrophyLoot.ts`,
- move player skill ownership into fauna,
- make trophy resolution camera/player dependent,
- introduce a separate harvesting skill.

The shared harvest API should accept the harvester-specific coefficient/value explicitly.

### 4. Preserve NPC/world independence

NPC hunter harvesting also uses `harvestAnimalIntoInventory()`. NPCs do not own `PlayerSkills`, so they must not implicitly read the player's Survival value.

When no actor-specific Survival value is supplied, use the **75% baseline**. This keeps the shared world mechanic deterministic and independent from the player while raising the general antler availability from today's 50%.

A future NPC hunting/harvesting proficiency system may provide its own explicit coefficient through the same input; that is outside this plan.

## Relevant files

Primary:
- `src/fauna/animalTrophyLoot.ts`
- `src/fauna/animalHarvest.ts`
- `src/fauna/animalHarvest.test.ts`

Player integration:
- locate the current player `harvestAnimalIntoInventory()` call under `src/app/actions/survivalActions.ts` and pass `skills.survival.value` through its existing dependencies/state access.

NPC regression:
- `src/ai/NpcAgent.ts` — verify its shared harvest call remains actor-independent and receives/defaults to baseline rather than player skill.

Skill source of truth:
- `src/player/PlayerSkills.ts`

## Verification

Automated tests should cover at minimum:

1. juvenile stag: 0% regardless of Survival input;
2. non-stag: no antler;
3. chance helper:
   - 0 → 0.75,
   - 0.2 → 0.78,
   - 0.5 → 0.825,
   - 1 → 0.90,
   - malformed/out-of-range input is safely clamped/defaulted;
4. deterministic corpse roll remains stable for repeated evaluation with the same animal id and same coefficient;
5. increasing Survival can turn a borderline deterministic roll from no-drop into drop, never the reverse;
6. successful harvest still cannot reroll the same corpse;
7. NPC/default harvest uses the 75% baseline and does not depend on player state.

Run the focused fauna tests plus the normal project typecheck/test command required by the repository.

Manual browser verification is performed by the user, not the AI agent.

## Non-goals

- changing meat or hide yields,
- multiple antlers per stag,
- antlers from juvenile deer,
- adding Survival XP for harvesting,
- NPC skill/profession redesign,
- changing trophy inventory semantics,
- changing deterministic seeded RNG ownership,
- rebalancing other animal trophy drops.

## Implementation guardrails

- Reuse `trophyLootKindsForHarvest()` and `harvestAnimalIntoInventory()`; do not add a parallel player-only roll.
- Preserve deterministic per-corpse behavior.
- Pass actor capability explicitly rather than importing player state into fauna.
- Add/update JSDoc on the shared trophy probability/helper or harvest input if the new contract is not obvious; use `@domain fauna` where useful for preflight discovery.
- Keep the change local; no unrelated harvest, skill, or fauna refactors.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
