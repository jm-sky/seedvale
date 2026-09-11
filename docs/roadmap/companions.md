# Companions

**Status:** concept / roadmap
**Domain:** `npc`, `quests-progression`, `items-player`

## Overview

Companions are ordinary Seedvale NPCs whose relationships, commitments and life decisions can lead them to help, travel with or eventually live alongside the player.

The roadmap deliberately does not create a separate Companion AI, party scheduler or recruitable-NPC population. It extends the same NPC simulation used by every inhabitant.

See [`../vision/companions.md`](../vision/companions.md) for the product/design vision. This roadmap defines the intended capability slices and their dependencies; implementation status belongs in plans, state docs and code.

## Core model

```text
normal NPC
    +
relationship / reputation / personality / life situation
    +
source of commitment
        ├── paid Work Contract
        └── voluntary social decision
    ↓
accompany / follow commitment
    ↓
existing NPC decision + action systems
    ↓
travel / combat / work / needs / return home
```

A temporary expedition and a long-term Companion relationship are distinct. Temporary accompaniment must not require moving the NPC out of its household or permanently changing its identity.

## Scope

The companion direction includes:

- believable candidates emerging from normal settlement demographics,
- temporary paid accompaniment,
- temporary voluntary accompaniment,
- follow/travel behaviour,
- autonomous needs and interruption/resumption during travel,
- combat and mutual defense,
- shared work such as construction and farming,
- relationship consequences from shared experiences,
- return to normal life after temporary commitments,
- later long-term relocation / household change,
- multiple independent companions later.

It does not include a classic RPG party manager, player-owned NPCs, teleport-follow, a second combat/work/needs implementation or special recruit-only inhabitants.

---

## Stage 1 — Population and candidate context

### Goal

Make the world capable of producing believable inhabitants who may consider leaving home temporarily or permanently without generating artificial player-facing recruits.

### Direction

Young inhabitants are especially relevant because they may have fewer established obligations and stronger incentives to explore, but eligibility must not be a hard `youngAdventurer` flag.

Candidate context may include:

- age / life stage,
- household role and responsibilities,
- profession and schedule,
- current needs and commitments,
- personality, especially openness,
- traits such as `curious`,
- personal Player↔NPC relation,
- settlement reputation and renown,
- previous shared experiences.

A young inhabitant can still choose work, household life, marriage, migration or another path instead of travelling with the player.

### Related roadmap

- [`npc-professions-households-and-age.md`](npc-professions-households-and-age.md)
- [`npc-ai.md`](npc-ai.md)
- [`quests-and-reputation.md`](quests-and-reputation.md)

---

## Stage 2 — Shared accompany/follow commitment

### Goal

Provide one actor-neutral NPC commitment for temporarily travelling with the player.

This is the central runtime capability required by both paid and voluntary joining.

### Behaviour

An accompanying NPC should:

- navigate with the player without being position-locked,
- maintain sensible distance,
- recover after temporary separation where physically plausible,
- stop/stay where supported,
- react to obstacles,
- satisfy urgent needs,
- rest when necessary,
- react to danger,
- interrupt and resume accompaniment through normal decision arbitration,
- finish or abandon the commitment for meaningful reasons,
- return to its normal place/routine when the temporary commitment ends.

### Architectural constraint

`follow` is execution of an NPC commitment, not a `CompanionAI` identity.

Do not create separate follow implementations for paid and voluntary companions.

---

## Stage 3 — Paid expedition / escort

### Goal

Allow the player to hire an NPC to accompany them for a bounded expedition.

### Direction

Extend the existing world-level Work Contract mechanism with an escort/accompany objective rather than creating a Companion hiring system.

Possible contract boundaries:

- defined duration,
- journey / destination,
- expedition objective,
- later combinations of time and objective.

Candidate evaluation should consider:

```text
expected reward
+ suitability
+ personal relation
+ relevant reputation
+ personality / curiosity
- duration
- distance from home
- danger
- household/profession opportunity cost
- conflicting commitments
- provisioning risk
```

Acceptance remains the NPC's decision.

Payment, non-payment and resulting social consequences should reuse Work Contract economics and relationship/reputation mechanisms.

### Related roadmap

- [`workforce-for-hire.md`](workforce-for-hire.md)

---

## Stage 4 — Voluntary expedition

### Goal

Allow an NPC to choose to accompany the player without payment.

### Direction

This is a social/life decision, not a zero-price Work Contract.

Likely positive influences:

- `curious`,
- high openness,
- suitable age/life stage,
- personal trust/relationship,
- Player renown,
- courage / competence / trust reputation,
- prior successful shared experiences,
- interest in the destination/activity.

Likely negative influences:

- household responsibilities,
- scheduled/professional duties,
- active needs/problems,
- existing commitments,
- high perceived danger,
- poor relation or reputation,
- previous harmful experiences with the player.

The decision should be deterministic/inspectable where practical and use the existing personality/decision/social mechanisms rather than a companion-specific probability table.

NPC initiative is desirable: a suitable inhabitant may offer to join rather than requiring the player to inspect every NPC for a Recruit action.

---

## Stage 5 — Expedition survival and combat

### Goal

Make accompaniment meaningful outside safe settlements.

### Direction

Reuse existing NPC systems for:

- hunger and thirst,
- fatigue/rest,
- provisions,
- injury/healing,
- threat evaluation,
- combat,
- flee/chase,
- death.

An NPC may protect the player or another group member when relationship/commitment/context produces sufficient pressure, but accompaniment must not imply suicidal loyalty.

A frightened, badly injured or overwhelmed NPC may flee, refuse to continue or abandon an expedition.

---

## Stage 6 — Shared work and expedition activities

### Goal

Let accompanying NPCs participate in the same useful world activities they already understand.

Priority activities:

- construction,
- farming/cultivation,
- hunting,
- fishing,
- gathering,
- carrying/transport,
- camp work,
- later production/crafting where general NPC systems support it.

Use actor-neutral work/action seams. Do not create `CompanionBuild`, `CompanionFarm` or equivalent parallel actions.

Profession, skills, traits and personality should make different companions useful in different situations.

### Related roadmap

- [`player-construction.md`](player-construction.md)
- [`physical-goods-transport.md`](physical-goods-transport.md)
- [`physical-resource-storage-and-logistics.md`](physical-resource-storage-and-logistics.md)

---

## Stage 7 — Shared experience and relationship development

### Goal

Make repeated expeditions produce persistent social consequences.

Potential relationship-relevant events include:

- successful expedition,
- fair or unfair payment,
- fighting together,
- rescuing/helping one another,
- providing food/water/shelter,
- abandoning an injured NPC,
- repeated dangerous decisions,
- successful shared work,
- treatment of the NPC's household/settlement.

The existing Player↔NPC relationship should be extended if necessary rather than introducing `CompanionBondSystem`.

If richer dimensions such as trust or attachment become necessary, they should be reusable for ordinary Player↔NPC relationships too.

Shared history should later influence dialogue, willingness to accompany again and larger life decisions.

---

## Stage 8 — Long-term companion life

### Goal

Allow a sufficiently motivated NPC to make a persistent life decision to live near/with the player.

Possible consequences:

- leaving or restructuring an existing household where world rules allow it,
- moving to a player camp/house/settlement,
- acquiring a normal place of life,
- using shared/local storage,
- continuing a profession or adopting another supported role,
- retaining needs, schedules, relationships and autonomy.

Do not create a `CompanionHomeSystem`. Reuse normal places, households, settlement/player-built infrastructure and schedules.

Long-term companionship is not an automatic reward for completing enough expeditions. It should remain a contextual NPC decision.

---

## Stage 9 — Multiple companions and group behaviour

### Goal

Support several accompanying NPCs without introducing a God Object party controller.

Each NPC keeps independent:

- needs,
- navigation/execution state,
- combat decisions,
- relationships,
- commitments,
- reasons for staying or leaving.

Later group-level effects may emerge from:

- NPC↔NPC relationships,
- complementary professions/skills,
- conflict,
- danger,
- resource availability,
- travel speed and injuries.

Any group coordination mechanism should remain lightweight and should not replace individual NPC decision making.

---

## Cross-cutting requirements

### Persistence

Temporary and long-term commitments, relevant relationship consequences and life changes must survive save/load. Transient path/action state may reconstruct through existing NPC mechanisms.

### Off-screen simulation

An accompanying or returning NPC remains world state even when not rendered. Hybrid simulation may reduce navigation/combat detail at distance while preserving meaningful continuity and consequences.

### Determinism and observability

Joining decisions and commitment state should be inspectable in NPC debug/history tools. Prefer deterministic scoring/modifiers over opaque random recruitment rolls.

### Player-independent world

The same young NPC who could accompany the player must remain free to develop through other world systems. The player missing an opportunity should not freeze that NPC's life.

---

## Suggested implementation-plan slices

Roadmap stages are capability ordering, not mandatory one-plan-per-stage boundaries. Concrete plans should be created only after recon against current code and `docs/plans/PLANNING.md`.

Likely implementation slices:

1. **NPC accompany/follow commitment** — shared runtime foundation.
2. **Paid escort Work Contract** — contract objective + duration/termination + evaluation.
3. **Voluntary expedition decision** — personality/relation/reputation/life-context evaluation and NPC initiative.
4. **Expedition integration** — combat, needs, interruption/resumption and return-home behaviour.
5. **Shared activities** — verify/extend actor-neutral construction, cultivation and other useful actions for accompanying NPCs.
6. **Relationship consequences** — shared-experience events and future willingness.
7. **Long-term relocation** — household/place-of-life transition when broader lifecycle systems are ready.
8. **Multiple companions** — only after one-NPC accompaniment is robust.

Do not create all plans up front if dependencies are still changing.

---

## Dependencies

```text
normal NPC demographics / households / personality / relationships
                         │
                         ├──────────────┐
                         │              │
                         ▼              ▼
              paid Work Contract   voluntary decision
                         │              │
                         └──────┬───────┘
                                ▼
                    accompany/follow commitment
                                │
                 ┌──────────────┼──────────────┐
                 ▼              ▼              ▼
              needs          combat        shared work
                 └──────────────┼──────────────┘
                                ▼
                     shared experience/history
                                │
                                ▼
                    long-term life decision
                                │
                                ▼
                    household/place transition
```

---

## Architectural constraints

- No separate Companion AI.
- No recruit-only NPC population.
- No duplicated follow implementation per joining source.
- Paid accompaniment extends Work Contracts.
- Voluntary accompaniment is a social/NPC decision, not a fake zero-price contract.
- Follow/accompany is a commitment/behaviour, not NPC identity.
- Needs, combat, work and navigation remain authoritative in their existing systems.
- Player↔NPC relationship improvements must be general-purpose where practical.
- Long-term relocation reuses household/place mechanisms.
- NPCs can refuse, interrupt, abandon and return home for systemic reasons.
- Preserve off-screen continuity and persistence.
- Prefer deterministic, inspectable decisions.

## Open questions for implementation planning

- What exact age/life-stage model should replace or extend the current child/adult boundary for roughly 16–18-year-old inhabitants?
- Where should an `accompany` commitment be authoritatively owned so both Work Contracts and voluntary decisions can reference it without duplicated state?
- Should temporary accompaniment end primarily by elapsed world time, explicit destination/objective, player release, NPC abandonment, or combinations of these?
- How should an NPC estimate expedition danger before departure and update that estimate during travel?
- Which current Player↔NPC relation data is sufficient for the first voluntary-joining slice, and when is a richer general relationship model justified?
- How should NPC initiative surface naturally in dialogue/interaction without creating a recruitment UI scan?
- How should returning home work under hybrid/off-screen navigation when an expedition ends far from the NPC's settlement?
- Which shared activities already have actor-neutral seams sufficient for companions, and which require general NPC-system extensions?

## Related systems

- NPC demographics, age and households
- NPC personality and decision modifiers
- NPC needs/pressures/strategies/actions
- Work Contracts and payment
- Player↔NPC relationships
- settlement reputation and renown
- NPC combat, health and healing
- player/NPC construction
- cultivation/farming
- storage/logistics/transport
- places and schedules
- persistence
- dialogue and quests
