# Implementation Notes: NPC Personality-aware Decisions

**Plan:** `docs/plans/ai-002-npc-personality-decisions.md`
**Reviewed:** 2026-08-24
**Status:** `planned`

## Review summary

The plan fits the current architecture, but the implementation should stay very narrow: `ai-001` already exposes the authoritative need/shortage pressures, while `NpcAgent` still owns the actual arbitration and action execution. Add personality/role/trait preference modifiers at that existing decision seam; do not create a new AI controller or scoring framework.

The main code correction is that **schedule is not currently a peer candidate score**. `choose()` resolves needs first and only uses the effective schedule when the selected need is `idle`. Do not turn schedule into another pressure system in this plan.

## Existing systems to reuse

- `src/ai/NpcAgent.ts` — authoritative `choose()` / `beginNeed()` / schedule fallback / action boundary. Keep `PlannedAction` execution unchanged.
- `src/ai/Needs.ts` — `NpcPressure`, `generateNeedPressures()` and `pickFromPressures()` from `ai-001`. Personality must modify these existing candidate scores rather than recomputing need intensity.
- `src/simulation/types.ts` — generic `DecisionPressure` and `DecisionContext.pressures`. Keep `src/simulation` domain-agnostic.
- `src/simulation/scoreActions.ts` — reuse `pickHighestScore()` and its strict-`>` deterministic tie behaviour if a separate candidate list is needed.
- `src/ai/characters.ts` — canonical `Role`, `Trait` and `CharacterDef['personality']`. Do not introduce another personality/trait registry.
- `src/ai/dialogue.ts` — `BigFivePersonality` is the canonical OCEAN model. `pausePersonalityParams()` already demonstrates cheap continuous personality mapping.
- `src/ai/schedule.ts` — role schedule + trait overlays. It already owns `fast_worker`, `night_owl` and `sociable` schedule semantics.
- Existing `NpcWhy` / trace / inspection snapshot in `NpcAgent.ts` and `src/debug/npcTrace.ts` — extend this diagnostic path instead of creating a second explanation system.

`ai-001` deliberately made pressures plain data and recorded the exact list used for arbitration. Preserve that ownership: diagnostics should expose the decision inputs actually used, not independently recalculate them. fileciteturn11file0L2-L2

## Recommended scoring shape

Keep the modifier representation small and inspectable, conceptually:

```ts
type DecisionModifier = {
  source: string
  value: number
}
```

or extend the existing pressure/candidate representation if that is cleaner in the current `choose()` code. Avoid a generic reusable `PersonalityScoringEngine`.

The important invariant is:

```text
existing pressure
+ personality preference
+ trait preference
+ role preference
= candidate score
```

Personality/role/trait values are **biases**, not replacements for pressure. Keep them small enough that an urgent physiological pressure can still dominate. Do not clamp in a way that destroys relative differences; use one simple documented score domain and deterministic arithmetic.

Do not make personality able to create a candidate that the existing code did not produce. A modifier may change ranking among valid candidates only.

## Concrete mappings

Only implement mappings for candidates that already have meaningful semantics in the current NPC runtime. The current roles are `woodcutter`, `farmer`, `guard`, `trader`, `miner`, `fisher`; do not assume the older four-role model. fileciteturn7file0L2-L2

Suggested first mappings:

- **Conscientiousness:** modest positive bias toward existing duty/work candidates (`wood`, `waterDuty`, scheduled work where it is already a candidate). Do not invent a new “duty” action.
- **Openness:** only affect an existing meaningful alternative. If current `choose()` has no genuine exploratory alternative for a given pressure, leave it unused rather than inventing exploration.
- **Extraversion:** only affect an already-existing social/group candidate. There is currently no runtime social Place producer; `sociable` schedule support intentionally falls back to home when none exists. fileciteturn16file0L2-L2 Do not manufacture a social action for this plan.
- **Agreeableness:** only affect an existing cooperation/helping candidate. If the current candidate set has none, no modifier is required yet.
- **Neuroticism:** bias existing risk/threat candidates only where such a candidate already exists. Do not turn it into a new threat detector.

This means some Big Five dimensions may initially have no effect on some decisions. That is preferable to artificial behaviour whose only purpose is to demonstrate the dimension.

## Role and trait separation

Keep three independent inputs:

```text
Big Five personality
traits
profession / role
```

Do not encode role as a personality trait or derive a Big Five value from role.

Existing traits already have runtime meanings: `energetic`, `fast_worker`, `night_owl`, `sociable`; `fast_worker` also affects execution timing and schedule duration, so avoid duplicating those effects as generic personality bonuses. fileciteturn18file0L2-L2

Likewise, `curious` is already used in player-reaction scoring through `reactionChance.ts`; do not reuse that reaction formula as a generic decision modifier. fileciteturn17file0L2-L2

## Decision boundary

The likely implementation seam is inside the existing `NpcAgent.choose()` path, after the current pressure candidates are available and before the existing selected need/schedule action is started.

Do not move:

- need generation out of `Needs.ts`;
- action construction out of `NpcAgent`;
- world mutations into scoring;
- schedule transformation into the personality layer;
- personality data into `DecisionContext` as a large NPC object.

`DecisionContext` already has generic `pressures`; it should remain a lightweight snapshot contract. fileciteturn12file0L2-L2

## Diagnostics

Extend the existing pressure diagnostics with the modifiers contributing to the final candidate score. Prefer a bounded plain-data structure such as:

```text
candidate: wood
base pressure       +0.72
role                +0.20
conscientiousness   +0.08
final               1.00
```

The exact displayed values should come from the same calculation used for selection. Do not reconstruct them in `NpcWhy`, inspector code or UI.

If the existing diagnostic contract becomes awkward, extend it minimally rather than replacing `NpcWhy`/trace. The inspection snapshot is already explicitly designed as a read-only projection of authoritative NPC state. fileciteturn5file0L2-L2

## Critical needs and hard constraints

This is the most important behavioural guardrail.

`Needs.ts` already has a separate `critical` mode with substantially higher thresholds for in-flight interrupts. fileciteturn6file0L2-L2 Personality must not affect whether an action is physically/legalistically possible and must not suppress critical-need handling.

Do not apply personality modifiers to the critical-interrupt decision unless the implementation proves that the existing critical path itself uses candidate scoring. The safest v1 is to leave `tickCriticalInterrupt()` semantics untouched.

Likewise, queue blocking, missing workplace/landmark, invalid destinations and other existing execution constraints must remain authoritative. Scoring cannot turn an unavailable action into an executable one.

## Determinism / performance

- Use pure arithmetic over already-owned state.
- No `Math.random()` in personality scoring.
- Keep the existing `choose()` cadence; never move personality scoring into `NpcAgent.update()` every frame.
- Avoid allocating a large object graph per NPC decision. A small candidate/modifier array is sufficient.
- No worker is justified.
- Preserve strict deterministic tie-breaking. If personality produces equal final scores, retain the existing candidate order semantics rather than adding randomness.

The current `NpcPressure` generator is already cheap deterministic scalar arithmetic and is explicitly intended as the future seam for personality/role scoring. fileciteturn6file0L2-L2

## Tests

Prefer focused pure-function tests around the modifier/scoring layer plus existing `Needs.test.ts` / NPC decision tests.

At minimum cover:

- identical NPC state + identical personality → identical scores and selection;
- same valid candidates + different Big Five profile → different ranking where a mapped dimension applies;
- role/trait modifier changes only the intended candidate;
- no mapped semantic alternative → personality has no artificial effect;
- personality cannot make a non-candidate/action possible;
- critical need behaviour remains unchanged;
- deterministic tie-breaking remains unchanged;
- existing `pickNeed()`/pressure values remain unchanged.

Test extreme 0/1 personality values to make sign and scale errors obvious.

## Current-code pitfalls

1. **Do not rebuild `Needs.pickNeed()` scoring.** `generateNeedPressures()` is now the source of truth. Extend it only if the personality layer truly belongs in that domain; otherwise compose modifiers in `NpcAgent` so base pressure semantics remain reusable. fileciteturn11file0L2-L2
2. **Do not score schedule as a parallel candidate set.** Needs currently win over schedule; preserve that arbitration rule. The schedule implementation itself is already a deterministic role + trait transformation. fileciteturn16file0L2-L2
3. **Do not add `hardworking`.** The canonical trait union uses `energetic | fast_worker | night_owl | sociable`; the existing work-oriented trait is `fast_worker`. fileciteturn7file0L2-L2
4. **Do not duplicate existing trait effects.** `fast_worker` already changes execution timing and schedule; `sociable` already affects player reaction; `night_owl` already affects schedule. Personality decisions should add preference, not overwrite these mechanisms. fileciteturn18file0L2-L2
5. **Do not invent social/exploration/helping actions just to use Big Five dimensions.** The plan explicitly says existing behaviours only; current social-place production is intentionally missing. fileciteturn16file0L2-L2
6. **Do not confuse discrete dialogue archetype with OCEAN.** `nearestArchetype()` is a dialogue-line bucket; raw `BigFivePersonality` is the source for continuous personality behaviour. fileciteturn13file0L2-L2
7. **Do not modify `PlannedAction`.** Personality selects among existing decisions; execution remains the existing generic `goTo → execute` flow.

## Suggested implementation order

1. Inspect the final `ai-001` `choose()`/pressure integration on `main` and identify the exact candidate list at arbitration time.
2. Add a tiny pure personality/role/trait modifier function over those existing candidates.
3. Apply modifiers once per decision and preserve candidate ordering/tie semantics.
4. Store the exact scored candidates/modifiers for `NpcWhy`/trace.
5. Add deterministic unit tests, including critical-need and unavailable-action guards.
6. Run existing technical checks; browser verification should compare equivalent NPCs with deliberately different profiles and confirm understandable divergence.

## Verification

Technical verification can prove deterministic scoring and preserved constraints. Browser verification is still required for the gameplay claim that personality produces understandable behavioural variation; do not claim it until manually performed.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
