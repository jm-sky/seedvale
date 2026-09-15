# Plan: Lost Treasure Chronicles — elder trust foundation

**Created:** 2026-09-15  
**Status:** `planned` 📋  
**Type:** feature  
**Priority:** high · **Effort:** M  
**Depends on:** ~~quests-progression-032~~, ~~quests-progression-033~~, ~~quests-progression-034~~  
**Domain:** `quests-progression`  
**Subdomains:** `quests` `relationships` `progression`  
**Tags:** `lost-treasure-chronicles` `elder` `authored-npc` `relationship` `reputation` `multi-solution`  
**Roadmap:** `quests-lost-something-chronicles.md`

## Goal

Implement the first chapter of **Lost Treasure Chronicles**:

```text
guaranteed elderly NPC in a real settlement
→ small local problems
→ several ways to help
→ different Player↔elder relationship
→ different local reputation
→ elder becomes credible source of the later archaeologist lead
```

This plan does **not** introduce the archaeologist or treasure hunt yet.

Its purpose is to establish:

- the future story elder as a real inhabitant,
- a personal relationship with him,
- local social standing,
- prior quest outcomes that later story stages can use.

Do not introduce:

- `elderTrustPoints`,
- story-specific reputation,
- parallel NPC identity,
- quest-owned household state.

---

## 1. Guaranteed authored elder

The elder is a **predefined / reserved NPC embedded in normal settlement generation**.

He is not selected randomly from whatever NPCs happen to exist.

At the same time he remains a normal world inhabitant and must use the same authoritative systems as any other NPC:

- stable `NpcId`,
- normal household membership,
- authored name,
- authored age,
- normal physical state,
- normal schedule,
- normal needs,
- normal profession/role,
- normal relationships,
- normal lifecycle.

The quest system does not own him.

### Placement

Guarantee him in one suitable nearby non-home settlement.

Preferred settlement profile:

- `SM` or `MD`,
- reasonably close to the home region,
- ordinary accessible village rather than a resource outpost,
- deterministic placement from the existing world seed / settlement grid.

The exact settlement-selection seam must be verified against current `main` during implementation.

The important contract is:

> the story guarantees that one suitable settlement contains this NPC, but does not guarantee a hardcoded world coordinate.

### Character direction

Suggested authored profile:

```text
age: approximately 72–78
current life: ordinary village inhabitant doing light/local work
past: worked in a larger town or on an archaeological expedition
```

Prefer an already-supported role such as `miner`, `trader` or `farmer` if it fits the final settlement composition.

Do not introduce a new profession merely to encode his backstory.

---

## 2. Authored-resident scope guardrail

Do **not** create a global `StoryNpcManager` or broad narrative-character framework in this plan.

The home settlement already provides precedent for guaranteed named residents inside normal settlement/family generation. Reuse or minimally extend that ownership model.

The first implementation should solve only what this story needs:

```text
one guaranteed authored resident
→ normal FamilyDef / settlement population
→ stable ordinary NpcId
```

The code should not change global settlement generation so that every settlement starts receiving reserved residents.

A small reusable helper/spec is acceptable if it naturally falls out of the existing generator, but do not generalize beyond demonstrated need.

Future major story characters such as the archaeologist or deciphering specialist may reuse the same seam after this first case proves it.

Authored name is presentation/content. Stable `NpcId` remains authoritative identity.

---

## 3. Story quest materialization

Do not append this generated-settlement story directly to the fixed-name `QUESTS` array.

Create a focused module following the existing generated/contextual story patterns, conceptually:

```text
src/quests/lostTreasureChroniclesElder.ts
```

Responsibilities:

- resolve the guaranteed elder's stable `NpcId`,
- resolve supporting NPCs where needed,
- construct the two ordinary `QuestDef`s,
- attach the elder's real settlement id,
- use stable story quest ids,
- return ordinary quest definitions for normal `QuestManager` composition.

Do not create a separate story runtime or story state store.

Because this is one guaranteed authored elder, stable semantic IDs are preferred if current composition guarantees uniqueness, for example:

```text
story:lost-treasure-chronicles:elder:winter
story:lost-treasure-chronicles:elder:dispute
```

If current materialization can produce more than one valid story instance, include the required stable settlement/NPC identity instead.

Never derive identity from the elder's display name.

---

# 4. Quest A — Preparing for winter

## Story

The elder is having difficulty preparing his household before colder weather.

The problem is intentionally small and believable. This first quest exists to introduce the Player to him and establish that the same need can be solved through different strategies.

Design target:

```text
one household problem
→ materially different approaches
→ different relationship/reputation results
```

Do not reduce the final design to three cosmetically different versions of the same item hand-in.

## Required solution paths

Implement at least **two meaningfully different solutions**.

A third solution is optional and should only land when it can reuse an existing generic world/action seam cleanly.

### Solution A — direct material help

The Player supplies real fuel/resources through the ordinary inventory system.

Use current item/economy conventions during implementation recon to choose the concrete requirement, for example branches/wood-like material or coal.

This is the straightforward material-help route.

Intended consequence direction:

```text
elder relation: positive
benevolence: positive
```

Do not create a story-specific fuel item.

### Solution B — arrange help through another villager

The elder mentions another household or inhabitant who can plausibly help, but he is reluctant or unable to ask directly.

The Player can solve the need socially by talking to that NPC and arranging assistance.

This path should use ordinary quest/dialogue mechanisms and a real stable supporting `NpcId`.

Intended consequence direction:

```text
elder relation: positive
trust: positive
supporting NPC relation: potentially positive
```

This must feel mechanically distinct from giving the elder goods personally.

Do not add a persistent `elderHelpArranged` flag if the same result can be represented by quest outcome/progress.

### Optional Solution C — solve it through physical work

Only implement this route if recon finds an existing reusable world/work action suitable for the problem, for example a real gathering, repair, clearing or household-related interaction.

Intended consequence direction:

```text
elder relation: stronger
competence: positive
benevolence: positive
```

Do **not** build a quest-only repair/work interaction just to ensure three routes exist.

Two strong paths are preferable to three artificial paths.

## Quest structure

Prefer one nonlinear stage using the existing multi-objective/transition model where that matches the final interactions.

Conceptually:

```text
mode: any

material_help → material_help outcome
neighbor_help → neighbor_help outcome
optional work_help → work_help outcome
```

Each path resolves to a distinct successful outcome carrying its own relation/reputation consequences.

If more than one solution is currently possible at the same time, the Player must consciously choose which one to perform/hand in.

Do not silently resolve the first satisfiable objective by array order.

Before implementation, verify current `QuestManager` projection for simultaneously satisfiable alternative objectives. If a generic dialogue/hand-in ambiguity exists, fix the smallest reusable generic seam instead of adding a winter-quest special case.

---

# 5. Quest B — The old dispute

## Availability

Unlock after **any successful outcome** of Quest A using the existing `quest_outcome` prerequisite.

Conceptually:

```ts
{
  type: 'quest_outcome',
  questId: winterQuestId,
  outcomeIds: ['material_help', 'neighbor_help', 'work_help'],
}
```

Only include outcome ids actually implemented by Quest A.

The same elder remains the giver.

## Story

The elder has an old unresolved disagreement with another villager or household.

Possible subject matter:

- borrowed equipment that was never returned,
- unpaid work,
- disputed ownership of a mundane item,
- an old promise,
- responsibility for damaged property.

Do not add a generic debt/legal/economic subsystem for this quest.

The dispute exists to create a social decision and to establish that the elder is not automatically the morally correct side merely because he is the story anchor.

### Supporting NPC

Use a real adult NPC from the same settlement, preferably another household, with stable `NpcId`.

This supporting NPC may remain generated/semi-authored. Do not reserve another major story character unless later content actually needs that identity.

Do not infer kinship or identity from display names.

---

## 6. Quest B stage flow

### Stage 1 — hear the elder's version

The elder explains the dispute and points the Player to the other participant.

### Stage 2 — hear the other version

Use ordinary `talk_to_npc` with the supporting NPC.

The second NPC gives a conflicting but plausible account.

**Both accounts must be credible.**

Do not write this as:

```text
good elder
vs
obviously dishonest neighbour
```

The ambiguity is part of the quest design.

### Stage 3 — conscious resolution

Use explicit player dialogue actions / existing choice mechanics.

#### Outcome A — support the elder

The Player pressures or persuades the other NPC to make amends.

Direction:

```text
elder relation +2
other NPC relation -1
trust +1
competence +1
```

This rewards loyalty and decisiveness but carries a social cost.

#### Outcome B — reconcile the dispute

The Player persuades the elder to let the old grievance go or reaches a compromise both sides can live with.

Direction:

```text
elder relation +1
other NPC relation +1
benevolence +2
integrity +1
```

This provides less personal loyalty from the elder but a stronger communal/social result.

#### Optional Outcome C — self-funded settlement

Only add if current physical/economic interactions make it coherent for the Player to cover the disputed item/value personally.

This must remain a real physical/economic action, not a fake dialogue choice that grants resolution without cost.

Two strong outcomes are sufficient for V1.

---

# 7. Relationship gradient

Reuse existing relation tiers:

```text
stranger     0
acquainted   1
friendly     3
trusted      6
```

The two quests should create visibly different trajectories.

Target behaviour:

```text
minimal / weaker help
+ conciliatory resolution
→ acquainted or low friendly

stronger help
+ good social resolution
→ friendly
```

Do **not** guarantee `trusted` merely for completing these two quests.

Reaching `trusted` should normally require the strongest authored path plus prior/other positive interaction, or later story/world consequences.

This preserves value in the wider relationship system instead of turning two quest completions into an automatic trust unlock.

---

# 8. Settlement reputation

Use only existing reputation dimensions:

```text
trust
competence
benevolence
integrity
```

Do not award `courage` for these household/social problems.

Renown should remain zero or very small. Helping one elderly resident is local social knowledge, not a famous heroic deed.

The next Lost Treasure Chronicles plan should be able to derive information quality from ordinary state such as:

```text
elder relation
+
settlement reputation
+
specific prior quest outcomes
```

Do not add a separate story trust meter.

---

# 9. Information-quality contract for the next plan

This plan does not reveal the archaeologist yet.

It must, however, leave enough authoritative state for the next plan to distinguish different levels of confidence/information without persisting an `informationTier`.

Conceptual later outcomes:

### Basic lead

The elder reveals:

```text
archaeologist name
+ settlement/town where he can be found
```

### Better lead

He additionally reveals:

```text
his own connection to the former expedition
+ useful historical context
```

### Best lead

He additionally provides one concrete clue useful during the chronicle search, such as:

- likely cemetery,
- researcher/expedition surname,
- approximate ruin area,
- specific landmark reference.

The next plan derives this from existing relation/reputation/outcomes rather than this plan persisting a new tier.

---

# 10. Authored/generated NPC balance

Lost Treasure Chronicles should deliberately mix authored and generated inhabitants.

### Fully authored and guaranteed

Use for major story anchors where continuity matters:

- elder,
- later archaeologist,
- later deciphering specialist.

They still remain ordinary settlement inhabitants.

### Semi-authored / guaranteed when needed

Use when a later story needs a particular social role but not a fixed personality. Preserve seeded name/appearance/traits where practical.

### Fully generated

Use for supporting roles where any plausible inhabitant works, such as the neighbour in Quest B.

Prefer the least-authored category that still guarantees coherent storytelling.

This categorization is a design rule, **not** a request to implement a generic three-tier NPC framework in this plan.

---

# 11. State ownership

```text
settlement/family generation
→ owns the elder as a normal resident
→ owns household membership, age and role

NPC systems
→ own normal lifecycle, needs, schedule and physical state

Lost Treasure Chronicles materialization
→ binds story content to stable NpcIds

QuestManager
→ owns quest lifecycle/outcomes
→ owns Player↔NPC relations

Inventory
→ owns any physical resources before hand-in

ReputationManager
→ owns settlement reputation
```

There is no `LostTreasureChroniclesState` store in this plan.

Do not persist copied:

- elder age,
- relation tier,
- information tier,
- story trust,
- settlement reputation.

---

# 12. Persistence and lifecycle

The same world seed must reconstruct the same guaranteed elder and stable story bindings.

Existing quest/relation/reputation persistence remains authoritative.

Save/load must not:

- duplicate the elder,
- change his `NpcId`,
- repeat consumed hand-ins,
- reapply completed outcome consequences,
- reopen completed quests.

Do not make the elder immortal solely because later story stages use him.

If normal NPC lifecycle can remove him, later plans must decide how the larger storyline responds. This plan must not silently respawn or recreate him through quest code.

---

# 13. Reuse targets

Verify and prefer these existing mechanisms during implementation:

- `src/settlement/families.ts`
  - `FamilyDef`
  - `FamilyMember`
  - existing reserved home-resident precedent;
- `src/settlement/settlementGenerator.ts`
  - normal deterministic settlement generation;
- `src/settlement/npcIdentity.ts`
  - stable settlement NPC identity;
- `src/quests/opportunities/settlementNpcMaterialization.ts`
  - settlement NPC projections where useful for supporting-NPC binding;
- `src/quests/quests.ts`
  - `QuestDef`
  - `QuestPrerequisite`
  - `QuestOutcome`
  - `QuestConsequences`
  - nonlinear objectives/transitions;
- `src/quests/QuestManager.ts`;
- `src/reputation/ReputationManager.ts`;
- generated-story binding patterns such as `src/quests/lostTreasureExpedition.ts`;
- `src/app/createApp.ts`
  - composition.

Add concise JSDoc with appropriate `@domain` tags to important new reusable/public APIs.

Current code remains the source of truth if any symbol/ownership boundary changes before implementation.

---

# 14. Non-goals

Do not implement in this plan:

- wealthy archaeologist,
- deciphering specialist,
- chronicle,
- grave / ruins search,
- cemetery access alternatives,
- dark-forest estate,
- alpha bear,
- treasure map,
- dungeon,
- missing key,
- land deed,
- larger Player estate,
- generic story-NPC manager,
- generic authored-resident framework beyond the smallest demonstrated seam,
- generic dialogue-tree engine,
- new reputation dimensions,
- story-specific trust meter,
- generic debt/legal simulation.

---

# 15. Automated verification

Cover at least:

## Guaranteed elder

- intended story settlement contains exactly one elder story resident;
- the elder is part of normal `FamilyDef` / settlement population;
- same seed reconstructs the same stable `NpcId`;
- authored age/name/profile survive ordinary materialization;
- no duplicate standalone quest NPC exists;
- unrelated settlements do not begin receiving reserved residents as a side effect.

## Quest A

- every implemented route can complete the quest;
- each route resolves to its intended distinct outcome;
- physical hand-in consumes only the selected goods where applicable;
- the social route targets the correct supporting NPC;
- consequences differ as authored;
- multiple simultaneously valid alternatives never silently choose an unintended route;
- consequences apply exactly once.

## Quest B

- unavailable before a successful Quest A outcome;
- every implemented successful Quest A outcome unlocks it;
- supporting NPC is a real stable resident and not the elder;
- both mandatory social resolutions work;
- correct relations change for both NPCs;
- reputation consequences apply once;
- neither branch assumes one side is mechanically designated as the objectively truthful side.

## Persistence

- quest outcomes survive save/load;
- relations survive save/load;
- settlement reputation survives save/load;
- elder identity reconstructs correctly;
- terminal consequences do not replay.

Run focused tests plus the project's current typecheck/lint/build verification.

Manual browser verification remains the User's responsibility.

---

# 16. Completion criteria

The plan is complete when:

1. one guaranteed authored elder exists as a normal inhabitant of a real settlement;
2. the story reliably references him through ordinary stable `NpcId`;
3. no broad Story NPC / reserved-resident framework has been introduced without demonstrated need;
4. the Player can complete two small local quests for him;
5. Quest A has at least two materially different solution strategies;
6. Quest B contains a genuine ambiguous social conflict with at least two conscious resolutions;
7. different choices produce different personal relationship trajectories;
8. local reputation changes coherently alongside personal relation;
9. `trusted` is not automatically granted merely for completing both quests;
10. no parallel trust/reputation/story-state system exists;
11. the resulting ordinary state is sufficient input for the next plan to determine how much the elder reveals about the archaeologist and old expedition.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
