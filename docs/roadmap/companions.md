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
travel / combat / work / needs / item use / return home
```

A temporary expedition and a long-term Companion relationship are distinct. Temporary accompaniment must not require moving the NPC out of its household or permanently changing its identity.

## Scope

The companion direction includes:

- believable candidates emerging from normal settlement demographics,
- temporary paid accompaniment,
- temporary voluntary accompaniment,
- follow/travel behaviour,
- autonomous needs and interruption/resumption during travel,
- player-to-NPC transfer of useful items such as weapons, food and tools,
- controlled NPC access to player-owned storage,
- configurable permissions and resource-reserve limits for shared storage,
- NPC decisions about whether and when permitted resources should actually be taken or used,
- combat and mutual defense,
- shared work such as construction and farming,
- relationship consequences from shared experiences,
- return to normal life after temporary commitments,
- later long-term relocation / household change,
- multiple independent companions later.

It does not include a classic RPG party manager, player-owned NPCs, teleport-follow, a second combat/work/needs/inventory implementation or special recruit-only inhabitants.

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

## Stage 5 — Player-to-NPC item transfer and equipment

### Goal

Allow the player to deliberately provide an NPC with useful world items, especially equipment needed for an expedition or shared work.

### Direction

The transfer should use normal item ownership and NPC personal inventory rather than a separate companion inventory.

Relevant item classes include:

- weapons,
- ammunition where applicable,
- food and drink,
- tools,
- medicine / healing supplies where supported,
- work materials where an NPC action legitimately carries them.

The transfer itself and item use are separate concerns:

```text
player gives item
    ↓
NPC personal inventory owns item
    ↓
normal NPC decisions/actions determine whether and when to use it
```

Receiving a sword should not force the NPC to equip or use it if the item is unusable, inappropriate for the current action, inferior to another available option or conflicts with normal combat/equipment rules.

Likewise, food transferred to an NPC should become an ordinary usable resource for that NPC rather than a companion-only provision counter.

### Player interaction

A later UI may expose simple actions such as:

- Give item,
- Take back / request return where socially and mechanically appropriate,
- inspect relevant carried equipment where normal interaction rules allow it.

The first implementation should prefer existing inventory/item-transfer interaction patterns instead of creating a full party inventory screen.

### Architectural constraints

- Item ownership must remain authoritative in the existing item/inventory systems.
- Do not duplicate equipment or consumable state inside companion state.
- NPC item-use decisions remain part of normal NPC behaviour.
- The same transfer mechanism should be reusable for non-companion NPC interactions where appropriate.

---

## Stage 6 — Controlled access to player storage

### Goal

Allow trusted/authorized NPCs to use resources from player-owned storage without giving them unrestricted access to everything the player owns.

### Core distinction

Three concepts must remain separate:

```text
item ownership
    ≠
storage access permission
    ≠
NPC decision to take/use an item
```

A permission means an NPC **may** use a resource. It does not itself create a need or command the NPC to consume/take it.

### Permission model

Player storage should expose an access policy that can be evaluated by normal NPC actions.

The policy may define permissions by resource class or use case, for example:

- food,
- water,
- tools,
- weapons,
- ammunition,
- medicine,
- work materials,
- valuables / protected items.

Possible policy modes may include:

- forbidden,
- allowed,
- assigned-only for equipment such as weapons/tools,
- later more granular rules if gameplay demonstrates a need.

### Reserve / consumption limits

The player should be able to protect a minimum reserve so companions do not consume the last critical supplies.

Examples:

```text
Food       allowed     keep at least 5
Water      allowed     keep at least 3
Tools      assigned only
Weapons    assigned only
Materials  allowed for authorized work
Valuables  forbidden
```

Potential limits include:

- minimum quantity to leave in storage,
- maximum amount one NPC may take at once,
- later time-based quotas only if simpler reserve rules prove insufficient.

Prefer a small, understandable policy model over per-item micromanagement.

### Use cases

An authorized NPC may decide to:

- eat or drink when needs justify it,
- take a weapon or tool that it is allowed/assigned to use,
- take materials required by an active work action,
- return unused resources or deposit produced/collected goods where normal logistics rules support it.

### UI direction

Player-owned storage should eventually expose a compact permissions/configuration interface rather than requiring hidden debug configuration.

The UI should express player intent, not directly drive NPC actions. A setting such as `Food: Allowed` grants access; the NPC's needs and decisions determine actual consumption.

### Architectural constraints

- Extend general storage/logistics permissions rather than creating `CompanionChest` semantics if practical.
- Storage remains authoritative for contained items/resources.
- Access policy remains authoritative for permission.
- NPC inventory/action systems remain authoritative for carried items and actual usage.
- Rules must remain deterministic and enforceable off-screen.
- Multiple NPCs accessing the same storage must not bypass reserve limits through independent stale reads.

### Related roadmap

- [`physical-resource-storage-and-logistics.md`](physical-resource-storage-and-logistics.md)
- [`physical-goods-transport.md`](physical-goods-transport.md)

---

## Stage 7 — Expedition survival and combat

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

Transferred items and permitted shared storage should feed these same systems. For example, an NPC with permission to use player food may obtain food when hungry, but critical needs, pathing, availability and reserve policy still determine whether that actually happens.

An NPC may protect the player or another group member when relationship/commitment/context produces sufficient pressure, but accompaniment must not imply suicidal loyalty.

A frightened, badly injured or overwhelmed NPC may flee, refuse to continue or abandon an expedition.

---

## Stage 8 — Shared work and expedition activities

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

Shared-storage permissions can provide authorized materials/tools, but work actions must still use normal authoritative resource consumption and contribution mechanisms.

### Related roadmap

- [`player-construction.md`](player-construction.md)
- [`physical-goods-transport.md`](physical-goods-transport.md)
- [`physical-resource-storage-and-logistics.md`](physical-resource-storage-and-logistics.md)

---

## Stage 9 — Shared experience and relationship development

### Goal

Make repeated expeditions produce persistent social consequences.

Potential relationship-relevant events include:

- successful expedition,
- fair or unfair payment,
- fighting together,
- rescuing/helping one another,
- providing useful equipment,
- providing food/water/shelter,
- withholding promised support/resources,
- abandoning an injured NPC,
- repeated dangerous decisions,
- successful shared work,
- treatment of the NPC's household/settlement.

The existing Player↔NPC relationship should be extended if necessary rather than introducing `CompanionBondSystem`.

If richer dimensions such as trust or attachment become necessary, they should be reusable for ordinary Player↔NPC relationships too.

Shared history should later influence dialogue, willingness to accompany again and larger life decisions.

---

## Stage 10 — Long-term companion life

### Goal

Allow a sufficiently motivated NPC to make a persistent life decision to live near/with the player.

Possible consequences:

- leaving or restructuring an existing household where world rules allow it,
- moving to a player camp/house/settlement,
- acquiring a normal place of life,
- using shared/local storage under explicit permissions,
- continuing a profession or adopting another supported role,
- retaining needs, schedules, relationships and autonomy.

Do not create a `CompanionHomeSystem`. Reuse normal places, households, settlement/player-built infrastructure and schedules.

Long-term companionship is not an automatic reward for completing enough expeditions. It should remain a contextual NPC decision.

---

## Stage 11 — Multiple companions and group behaviour

### Goal

Support several accompanying NPCs without introducing a God Object party controller.

Each NPC keeps independent:

- needs,
- navigation/execution state,
- combat decisions,
- personal inventory,
- relationships,
- commitments,
- reasons for staying or leaving.

Later group-level effects may emerge from:

- NPC↔NPC relationships,
- complementary professions/skills,
- conflict,
- danger,
- resource availability,
- shared storage contention,
- travel speed and injuries.

Any group coordination mechanism should remain lightweight and should not replace individual NPC decision making.

Shared-storage limits must be enforced authoritatively across all NPC consumers so several companions cannot independently consume resources below the configured reserve.

---

## Cross-cutting requirements

### Persistence

Temporary and long-term commitments, relevant relationship consequences, NPC-owned items, player-storage access policies and life changes must survive save/load. Transient path/action state may reconstruct through existing NPC mechanisms.

### Off-screen simulation

An accompanying or returning NPC remains world state even when not rendered. Hybrid simulation may reduce navigation/combat detail at distance while preserving meaningful continuity and consequences, including item ownership, resource consumption and storage limits.

### Determinism and observability

Joining decisions, commitment state, item transfers and storage-access decisions should be inspectable in NPC debug/history tools where useful. Prefer deterministic scoring/modifiers over opaque random recruitment rolls.

### Player-independent world

The same young NPC who could accompany the player must remain free to develop through other world systems. The player missing an opportunity should not freeze that NPC's life.

### Resource authority

Item/storage integration must preserve clear ownership:

```text
storage owns stored resources
NPC inventory owns carried resources
access policy owns permission
NPC AI owns decision to use permitted resources
world action owns authoritative consumption/work effect
```

---

## Suggested implementation-plan slices

Roadmap stages are capability ordering, not mandatory one-plan-per-stage boundaries. Concrete plans should be created only after recon against current code and `docs/plans/PLANNING.md`.

Likely implementation slices:

1. **NPC accompany/follow commitment** — shared runtime foundation.
2. **Paid escort Work Contract** — contract objective + duration/termination + evaluation.
3. **Voluntary expedition decision** — personality/relation/reputation/life-context evaluation and NPC initiative.
4. **Player-to-NPC item transfer and equipment** — ownership transfer, personal inventory and normal item use.
5. **NPC access to player storage** — permission policy, UI/configuration and authoritative reserve limits.
6. **Expedition survival integration** — needs, provisions, interruption/resumption and return-home behaviour.
7. **Companion combat cooperation** — protection pressure, combat/flee behaviour and supplied weapons/equipment.
8. **Shared activities** — verify/extend actor-neutral construction, cultivation and other useful actions for accompanying NPCs, including authorized tools/materials.
9. **Relationship consequences** — shared-experience events and future willingness.
10. **Long-term relocation** — household/place-of-life transition when broader lifecycle systems are ready.
11. **Multiple companions** — only after one-NPC accompaniment and shared-resource access are robust.

Plans 4 and 5 should precede broad shared-work integration because survival, combat and work increasingly depend on ordinary access to weapons, tools, food and materials.

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
                  ┌─────────────┴─────────────┐
                  ▼                           ▼
       player→NPC item transfer       player storage access
                  │                           │
                  └─────────────┬─────────────┘
                                ▼
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
- No companion-specific inventory or equipment store when normal NPC inventory/item systems can own the state.
- Giving an NPC an item transfers/assigns real world inventory state; it is not a temporary stat bonus.
- Storage permission is separate from storage ownership and separate from NPC item-use decisions.
- Prefer general storage access policies over a special Companion Chest system.
- Reserve/limit checks must be authoritative and safe with multiple NPC consumers.
- Needs, combat, work, item use and navigation remain authoritative in their existing systems.
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
- Which existing item/equipment mechanisms already support NPC ownership and active weapon/tool selection, and what general gaps remain?
- Should a player-given weapon become fully NPC-owned, remain player-owned but assigned, or should both semantics be supported explicitly?
- At what level should player-storage access policy live: individual storage, player household/place, individual NPC authorization, relationship role, or a combination?
- What is the smallest useful permission vocabulary for food/water/tools/weapons/materials without creating per-item micromanagement?
- How should reserve thresholds remain atomic when several NPCs consume from one storage in the same simulation interval?
- Should companions normally return unused assigned tools/weapons at expedition end, and how should refusal/loss/death be represented as real item ownership consequences?
- Which shared activities already have actor-neutral seams sufficient for companions, and which require general NPC-system extensions?

## Related systems

- NPC demographics, age and households
- NPC personality and decision modifiers
- NPC needs/pressures/strategies/actions
- Work Contracts and payment
- Player↔NPC relationships
- settlement reputation and renown
- NPC personal inventory and item use
- player inventory / item transfer
- weapons, tools and equipment
- NPC combat, health and healing
- player/NPC construction
- cultivation/farming
- storage/logistics/transport
- player-owned storage permissions
- places and schedules
- persistence
- dialogue and quests
