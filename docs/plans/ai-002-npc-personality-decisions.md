# Plan: NPC Personality-aware Decisions

**Created:** 2026-08-23  
**Status:** `verification needed` 🔍  
**Priority:** high · **Effort:** M  
**Depends on:** ~~ai-001~~
**Domain:** `ai`

## Goal

Make the existing NPC decision process sensitive to personality, traits and social role, with Big Five acting as a deterministic preference modifier rather than a direct action selector.

Target:

```text
Pressures
   ↓
DecisionContext
   + Big Five
   + traits
   + role
   ↓
scored candidates
   ↓
existing decision/action flow
```

This is the second implementation step of the NPC AI V1 foundation.

## Scope

### Big Five

Use the existing `BigFivePersonality` model as the source of personality values.

Initial influences should be deliberately limited to behaviours that already exist:

- **Conscientiousness** — preference for duties, preparation and persistence where those choices already exist.
- **Openness** — preference for alternative/exploratory choices where meaningful alternatives already exist.
- **Extraversion** — preference for existing social/group choices.
- **Agreeableness** — preference for existing cooperation/helping choices.
- **Neuroticism** — sensitivity to existing risk/threat signals.

Do not invent new behaviours solely to expose a Big Five dimension.

### Traits and role

Include existing traits and profession/social role as decision modifiers where the current systems already expose relevant behaviour.

Do not collapse Big Five, traits and profession into one generic personality field. They remain distinct inputs.

### Candidate scoring

Introduce an explicit, inspectable modifier/scoring layer around the current decision candidates.

Conceptually:

```text
base pressure
+ role modifier
+ trait modifier
+ personality modifier
+ existing contextual modifiers
= decision score
```

The exact formula should follow the current code and remain simple. Avoid a large generic scoring framework at this stage.

Personality should influence preference, not override hard simulation constraints or make impossible actions possible.

### Diagnostics

Extend existing NPC decision diagnostics so the reason for a personality-influenced choice can be inspected, for example:

```text
candidate: hunt
base pressure       +0.72
role                +0.20
conscientiousness   +0.08
risk                -0.05
final               0.95
```

Use existing `NpcWhy`/trace mechanisms where possible.

## Implementation steps

1. Review the pressure-layer output from `ai-001` and current decision candidates.
2. Locate the existing Big Five, trait and profession/role data access paths.
3. Define a minimal modifier representation compatible with existing diagnostics.
4. Add Big Five modifiers only to decisions for which the current code has a meaningful semantic mapping.
5. Add role and trait modifiers where already-supported behaviour exists.
6. Integrate modifiers into candidate scoring without replacing the existing action execution system.
7. Add deterministic tests covering identical state with different personalities.
8. Verify that personality creates meaningful variation without making critical needs or hard constraints fail.

## Behavioural rules

Personality is a tendency, not a rule:

```text
conscientiousness → stronger preference for completing duties
```

not:

```text
conscientiousness > 0.7 → always choose duty
```

Critical needs and simulation constraints remain authoritative.

Two NPCs in similar circumstances should be able to choose differently when personality legitimately changes the relative score, while still behaving within the same world rules.

## Performance

Decision scoring must remain cheap.

Do not re-evaluate every NPC every tick merely because personality is now part of the model. Reuse the current decision cadence. Adaptive re-evaluation based on cognitive ability/bystrość belongs to a later stage.

Avoid allocations in hot loops where practical.

## Out of scope

- persistent plans;
- strategy objects;
- hierarchical prerequisite planning;
- frustration/satisfaction feedback;
- semantic memory;
- adaptive re-evaluation frequency;
- replacing `PlannedAction`;
- behaviour trees/GOAP;
- LLM-driven decisions.

## Verification

### Automated

- deterministic results for identical NPC state;
- different Big Five profiles can produce different scores where expected;
- critical needs remain dominant where required;
- existing tests continue to pass.

### Browser/gameplay

Test representative NPCs with deliberately different Big Five profiles in equivalent situations and observe whether their decisions diverge in understandable ways.

Check that normal NPC activity remains stable and no personality modifier causes invalid or impossible actions.

This plan does not claim browser verification until it is actually performed.

## Implementation (2026-08-24)

**Implemented:**

- `src/ai/decisionModifiers.ts` (new) — `scoreNeedCandidates()`, a pure function composing `conscientiousness` (duty preference) and `role === 'woodcutter'` bonuses onto `Needs.ts`'s already-generated `wood`/`waterDuty` pressures. Only applied when the underlying pressure is already active (`base > 0`), so personality/role can re-rank valid candidates but never manufacture one. `openness`/`extraversion`/`agreeableness` are left unused at this seam — no meaningful alternative/social/cooperative candidate exists in the current `choose()` arbitration to bias.
- `src/ai/npcAnimalThreat.ts` — `neuroticism` (optional, defaults to neutral 0.5) now biases the existing `defend`/`flee` scoring in `scoreAnimalThreatIntents`/`decideAnimalThreatResponse`, the existing risk/threat candidate. Bounded well under the health-driven swing so an unarmed/badly-hurt NPC still flees regardless of personality.
- `src/ai/NpcAgent.ts` — `choose()` now scores need pressures through `scoreNeedCandidates()` before picking (`pickActionKind`), and `reactToAnimalThreat()` passes `this.personality.neuroticism` through. `role`/`traits` stay separate inputs from `BigFivePersonality`, per the implementation notes; no new trait modifier was added at this seam (traits already have runtime meaning elsewhere — `fast_worker`/`night_owl`/`sociable`/`curious`/`energetic` — and duplicating those wasn't in scope).
- Diagnostics: `NpcInspectionSnapshot.candidates` / `NpcTraceEvent`'s `need.selected.candidates` (both optional, additive) expose the base/modifier/final breakdown `choose()` actually used. `createNpcInspector.ts`'s "Decision / Why" panel renders the winning candidate's modifiers.

**Technically verified:** `npx tsc --noEmit`, `pnpm run lint:fix`, `pnpm run build`, `pnpm run test` (full suite) all pass. New deterministic unit tests: `src/ai/decisionModifiers.test.ts` (neutral personality is a no-op, conscientiousness biases only already-active duty candidates, woodcutter role bonus only affects `wood`, inactive candidates stay inactive, water/food/idle stay untouched, duty bonuses stay small enough that an urgent physiological need still outranks them) and additions to `src/ai/npcAnimalThreat.test.ts` (omitting/neutral `neuroticism` reproduces prior behaviour exactly; high/low neuroticism tips a genuine tie; an unarmed NPC still can't be pushed into defending).

**Browser/gameplay verification:** not yet performed — see the Verification section above.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
