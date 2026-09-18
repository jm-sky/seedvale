# Plan: NPC destination threat assessment

**Created:** 2026-09-18
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** `npc`
**Subdomains:** `decision-making` `work` `combat`
**Tags:** `threat` `risk` `fauna` `resources`
**Roadmap:** -

## Goal

Add a small, reusable NPC destination-risk assessment used before selected voluntary outdoor activities.

An NPC considering a resource/work destination should account for:

- current animal threats near the destination,
- species-level danger to humans,
- exceptional danger of the concrete animal,
- distance from the destination,
- multiple simultaneous threats,
- current health,
- real usable combat capability,
- role,
- personality / risk sensitivity,
- the activity's own risk profile.

The mechanism must stay deterministic, inspectable and cheap. It is not a quest system and must not become a per-frame danger simulation.

V1 has one gameplay consumer: Herbalist wild-herb gathering.

## Current architecture to preserve

### Immediate animal threat

`src/ai/npcAnimalThreat.ts` already owns the immediate response through `senseImmediateAnimalThreat()`, `scoreAnimalThreatIntents()`, `arbitrateAnimalThreat()` and `decideAnimalThreatResponse()`.

That pipeline answers:

> The danger is already near me. Do I defend or flee?

Destination assessment answers:

> Should I voluntarily start an activity at a place where I can already observe danger?

Do not replace or fold the existing `defend | flee` pipeline into this plan.

### Fauna-owned danger

`AnimalAgent` already owns kind, live/dead state, position and `dangerSignificance`.

`dangerSignificance` is an individual multiplier for exceptional danger, such as an alpha / dangerous individual. It is **not** a species-level danger-to-human value: a normal fox and a normal bear may both have significance near 1 while representing very different risks.

NPC AI must not gain a species table such as `wolf = 5`, `bear = 10`.

### Herbalist work

`src/ai/npcProfessionWork.ts::planHerbalistWork()` currently deposits carried goods, tries dressing production, calls `herbalGather.queryNearest(...)`, walks to the real world item, harvests it and returns goods to the household.

`HERBAL_GATHER_RADIUS = 60`. There is currently no destination-safety check.

### Existing hook precedent

`src/fauna/huntingHooks.ts::SettlementHuntingHooks` demonstrates the intended boundary:

```text
Fauna / live world objects
→ bounded read-only adapter
→ primitive snapshot
→ NPC-side decision
```

Keep `AnimalAgent` behind the fauna boundary.

## 1. Fauna-owned human danger projection

Add one fauna-owned pure resolver for danger to a human.

Fauna should own the semantic distinction between:

- harmless / human-avoiding wildlife,
- meaningful latent danger near a work destination,
- an actively aggressive state,
- exceptional individuals.

Conceptually:

```text
species behaviour/capability
→ baseHumanDanger

current behavioural state
→ currentHumanDangerModifier

individual variant / dangerous trait
→ dangerSignificance

final human danger
= baseHumanDanger
  × currentHumanDangerModifier
  × dangerSignificance
```

Exact tuning belongs in one fauna-owned resolver and must be tested.

Required semantics:

- a normal fox that naturally avoids humans contributes zero or negligible destination risk,
- a frenzied/aggressive fox must not remain harmless merely because normal fox behaviour is evasive,
- a normal wolf is meaningful risk before it commits to attacking this NPC,
- a bear projects greater human danger than a normal wolf,
- alpha/dangerous individuals scale their species baseline through existing `dangerSignificance`,
- harmless prey/livestock do not block destinations merely because they are nearby.

Do not reuse `dangerSignificance` as the species baseline and do not duplicate fauna behaviour knowledge in `ai/`.

## 2. Bounded destination-threat snapshot

Add a narrow read-only fauna hook following the `SettlementHuntingHooks` pattern.

Illustrative contract:

```ts
type DestinationAnimalThreat = {
  animalId: string
  x: number
  z: number
  humanDanger: number
}

type SettlementDestinationThreatHooks = {
  queryThreats(
    centerX: number,
    centerZ: number,
    radius: number,
  ): readonly DestinationAnimalThreat[]
}
```

Exact names may follow existing conventions.

Requirements:

- query only loaded/live fauna,
- return plain primitive data,
- include meaningful latent danger even when `isThreateningHuman()` is false,
- exclude dead animals,
- keep the query spatially bounded,
- own no simulation state,
- do not make NPC decisions,
- do not expose `AnimalAgent` to `ai/`.

## 3. Performance guardrail: one bounded fauna scan per destination-selection decision

This is a hard requirement.

Forbidden:

```text
every NPC
× every frame
× fauna.getAgents()
```

Also avoid:

```text
5 resource candidates
× one full fauna scan per candidate
```

Preferred V1 flow:

```text
NPC enters one work/target-selection decision
→ obtain a bounded set of resource candidates
→ perform one bounded fauna scan covering the candidate area
→ obtain one small local threat snapshot
→ score at most a few candidate destinations against that same snapshot
→ choose one destination
→ zero destination-risk work until another decision is required
```

The per-candidate work after the snapshot should be cheap distance/scoring math only.

No per-frame destination watcher, global danger heatmap, continuously refreshed cache or world-wide polling.

If implementation cannot preserve this cost shape, revise the design rather than shipping per-frame or N×M scans.

## 4. Pure NPC destination-risk assessment

Add a stateless pure module, e.g. `src/ai/npcDestinationThreat.ts`.

Illustrative input:

```ts
type NpcDestinationThreatInput = {
  destination: { x: number, z: number }
  threats: readonly DestinationAnimalThreat[]
  healthRatio: number
  hasMeleeCapability: boolean
  hasRangedCapability: boolean
  role: Role
  neuroticism: number
  activityRiskProfile: ActivityRiskProfile
}
```

Return an inspectable result rather than only a boolean:

```ts
type DestinationThreatAssessment = {
  acceptable: boolean
  riskScore: number
  toleranceScore: number
  dominantThreatId?: string
}
```

A richer breakdown is acceptable for diagnostics/tests, but there must be one authoritative scorer.

## 5. Risk score

Each threat contribution should depend on:

```text
humanDanger
× distance influence from destination
```

The threat radius is around the **destination**, not only the NPC's current position.

Distance attenuation must be deterministic and monotonic.

### Multiple threats

Multiple threats must matter:

```text
one wolf < two wolves < a pack
```

but do not use an unbounded naive sum.

Prefer bounded aggregation, for example:

```text
dominant threat
+ diminishing contribution from additional threats
```

so group danger rises meaningfully without exploding linearly.

## 6. NPC tolerance

Tolerance uses the NPC's real current state.

### Health

Lower HP means lower tolerance. Health should remain one of the strongest modifiers.

### Real combat capability

Reuse existing combat resolution:

- `resolveNpcMeleeWeapon(...)`,
- `resolveNpcRangedWeapon(...)`,
- actual compatible ammo for ranged capability.

Do not equate `role === 'hunter'` with being able to fight.

A hunter without usable weapons/ammo or with critically low HP may reject a destination.

### Role

Role provides only a bounded bias.

Examples:

- hunter: higher voluntary outdoor-risk tolerance,
- guard: higher tolerance/responsibility,
- herbalist: no special combat bonus.

Role must not override severe injury or lack of usable combat capability.

### Personality

Reuse `BigFivePersonality.neuroticism`.

Higher neuroticism lowers risk tolerance.

Preserve the `ai-002` rule: personality biases an already meaningful decision; it does not manufacture a threat signal.

Do not invent new traits solely for this plan.

## 7. Activity risk profile

Destination safety is not universally binary.

Introduce a small explicit activity risk profile / tolerance modifier so future consumers do not accumulate role-specific exceptions.

V1 needs only the minimum profile(s) required by the first consumer, with conservative ordinary gathering.

Conceptually:

```text
NPC tolerance
+ activity risk allowance
→ final toleranceScore
```

Possible future consumers may differ: gathering is conservative, ordinary work may be neutral, hunting deliberately accepts more risk.

Do not integrate those future consumers in this plan.

## 8. First consumer: Herbalist wild-herb gathering

Integrate destination assessment into `planHerbalistWork()`.

Current:

```text
nearest herb
→ gather
```

Target:

```text
bounded herb candidates
+ one bounded local fauna threat snapshot
→ assess a small number of destinations
→ discard unacceptable candidates
→ nearest acceptable candidate
→ existing gather action
```

### Candidate limit

Do not evaluate every herb in the 60-unit radius.

Use a small deterministic cap, target range **3–5 nearest candidates**. Exact value should be a named constant and tested.

### Safe alternative

If the nearest mint is unsafe but another herb slightly farther away is safe, Herbalist should choose the safe alternative.

If every bounded candidate is unsafe, `planHerbalistWork()` returns no gather action and the existing profession fallback remains authoritative.

Do not invent an Herbalist-specific waiting/fear FSM.

### Resource lifecycle

Keep existing resource ownership and harvest revalidation unchanged.

If a resource disappears between planning and arrival, existing revalidation remains authoritative.

## 9. Decision cadence and stability

Destination assessment happens only while selecting a new destination/activity.

Once a trip has started:

- do not continuously recompute destination risk,
- do not make the NPC oscillate around a threshold,
- do not add another movement-interruption system.

If danger approaches during travel, the existing immediate-threat pipeline remains authoritative:

```text
travel in progress
→ immediate threat sensed
→ existing reactToAnimalThreat()
→ defend / flee
→ action lifecycle returns to choose when appropriate
→ a future decision re-evaluates destination risk from fresh world state
```

This provides stable behaviour without adding a new hysteresis/cache subsystem.

## 10. Ownership

```text
Fauna owns:
  animal identity/live state/position
  species behaviour/capability
  human-danger projection
  dangerSignificance

NPC AI owns:
  risk/tolerance scoring
  role/personality interpretation
  activity risk profile
  accept/reject decision

NpcAgent owns:
  current HP
  inventory/combat capability
  personality
  role
  action lifecycle

Profession planner owns:
  concrete work-target selection
```

Do not add quest-owned safety flags, duplicated predator/aggression state, persistent fear memory, per-resource danger state, pathfinding danger fields or a second combat-capability system.

## 11. Diagnostics

Keep the assessment inspectable.

Prefer existing NPC trace/inspector surfaces.

Useful breakdown:

```text
destination
riskScore
toleranceScore
dominant threat
base human danger
danger significance
distance contribution
group contribution
health/combat/role/personality/activity tolerance modifiers
```

Diagnostics must reuse the authoritative scoring result, not recompute it.

## 12. Tests

### Fauna human danger

Cover at least:

1. human-avoiding normal fox → zero/negligible destination danger,
2. aggressive/frenzied fox → meaningful danger,
3. normal wolf → meaningful danger,
4. normal bear > normal wolf,
5. exceptional/dangerous individual scales the same species baseline through `dangerSignificance`,
6. harmless prey/livestock does not become a work blocker.

### Pure destination scoring

Cover at least:

1. no threats → destination accepted,
2. closer equivalent threat > farther one,
3. two wolves > one wolf,
4. group contribution remains bounded,
5. lower HP lowers tolerance,
6. usable weapon raises tolerance,
7. ranged capability requires compatible ammo,
8. higher neuroticism lowers tolerance,
9. hunter/guard bias is bounded,
10. hunter without usable combat capability or with very low HP can still reject danger,
11. conservative gathering accepts less risk than a deliberately riskier activity profile,
12. deterministic tie/boundary behaviour.

### Herbalist integration

Cover at least:

1. safe nearest herb → unchanged normal gather target,
2. nearest herb unsafe + farther candidate safe → choose the safe candidate,
3. all bounded candidates unsafe → no gather trip,
4. removed threat → next work-selection cycle can select the resource,
5. removed resource between planning/arrival → existing harvest revalidation remains authoritative,
6. candidate count is capped,
7. one fauna threat snapshot is reused across candidate assessments instead of re-querying fauna per candidate.

### Regression

Keep green:

- `npcAnimalThreat` defend/flee tests,
- Hunter hunting,
- guard local threat assistance,
- fauna behaviour,
- Herbalist renewable-resource lifecycle,
- TypeScript/build.

## Non-goals

This plan does not implement:

- the authored boar/meadow quest,
- a herb meadow landmark,
- pseudo-Herbalist household fallback,
- route-risk scoring along the whole path,
- danger-aware A* / pathfinding,
- world danger heatmaps,
- NPC memory/rumours about danger,
- proactive hunting of destination threats,
- dynamic patrol assignment,
- off-screen regional danger simulation,
- destination checks for every profession,
- continuous/per-frame danger assessment.

## Future consumers

The mechanism should remain reusable later by explicit integrations such as ordinary food gathering, remote resource work, woodcutting, fishing, transport/travel, authored world activities and the planned boar-at-herb-meadow story.

Each consumer should be integrated deliberately because activities may use different risk profiles.

## Implementation guidance

Before coding, read current `CLAUDE.md`, `docs/STATE.md`, this plan and its implementation notes if present.

Prefer existing hook, scorer, combat-capability and trace conventions over parallel mechanisms.

Add JSDoc to important public/architectural functions where useful for AI preflight discovery; use an appropriate `@domain` tag where consistent with the codebase.

Do not run browser verification; manual browser verification belongs to the user.

## Verification

Automated:

- focused fauna human-danger tests,
- focused `npcDestinationThreat` tests,
- Herbalist profession integration tests,
- relevant `npcAnimalThreat` regressions,
- TypeScript/build.

Manual browser verification by the user:

1. Herbalist with safe herbs nearby performs ordinary gathering.
2. A wolf near the closest herb causes selection of a safer nearby herb when available.
3. If every nearby herb is unsafe, the NPC does not start the dangerous gather trip.
4. Removing/leaving threats makes the resource eligible again on a later work decision.
5. A healthy equipped higher-tolerance NPC may accept a situation that an injured/unarmed conservative NPC rejects.
6. No visible decision jitter and no measurable per-frame CPU regression from destination-risk evaluation.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
