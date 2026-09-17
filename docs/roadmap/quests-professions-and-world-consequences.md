# Profession & World Consequence Quests Roadmap

## Purpose

This roadmap defines the next content direction for profession-linked quests and authored world consequences.

It complements [`quests-and-reputation.md`](./quests-and-reputation.md). It does not replace the shared `QuestManager`, reputation systems, Work Contracts, settlement simulation, fauna systems, construction systems or economy.

The goal is to add concrete quest content that:

- gives professions distinctive local stories,
- makes non-home settlements worth visiting for specific people, services and situations,
- lets player actions leave persistent, visible consequences in the world,
- reuses simulation where it already exists,
- allows authored narrative consequences where the current simulation is not yet deep enough to produce them naturally.

This is a roadmap, not an implementation plan. Every item below must be turned into a focused plan under `docs/plans/` after a fresh current-code recon.

## Design rule

Do not require every quest consequence to emerge purely from simulation.

Prefer this order:

1. reuse an existing systemic cause/effect when it already exists,
2. otherwise create an authored consequence that uses normal world-domain objects and ownership,
3. use a purely narrative consequence only when a domain-backed implementation would add disproportionate complexity.

A quest may therefore deliberately cause a persistent world change, provided that change is represented through normal world concepts such as:

- settlements,
- places,
- buildings,
- NPCs,
- construction targets,
- items,
- fauna threats,
- routes,
- reputation,
- transport.

Avoid quest-local fake copies of domain state.

## Profession content structure

For a profession that receives a dedicated quest package, aim for:

- **1-2 short independent quests**, and
- **1-2 multi-stage quests**, usually 2-3 stages.

Short quests should represent ordinary but meaningful profession problems.

Multi-stage quests should represent important local stories and, where practical, leave a persistent consequence in the world.

Do not mechanically create this package for every profession. Hunter and Guard already have substantial quest content; new investment should focus first on professions with strong simulation foundations but weak quest content.

## Current overlap / existing foundations

### Hunter

Already substantially covered by existing profession quests, dangerous-animal deeds and Hunters Brotherhood plans/content.

Do not create another generic Hunter profession package now.

### Guard

Already substantially covered by Guard rewards / evening settlement duty and wider threat-response work.

Future Guard content should preferably participate in larger world-consequence stories rather than add more small generic Guard chores.

### Healer / medicine

Existing injury and treatment systems are strong foundations.

Existing quest plans around the injured cow and injured dog should be reused rather than duplicated.

The main missing content is human Healer-focused quest content.

### Builder

Builder-oriented authored quest content is a major gap, while current construction systems already provide useful foundations:

- player/NPC construction work,
- Work Contracts,
- wells,
- palisades,
- standing torches,
- residential buildings,
- structure repair.

Builder should be the first new profession vertical slice.

### Blacksmith

Blacksmith profession work and production/economy foundations already exist.

The missing layer is authored content that turns real material, tool and equipment needs into quests.

### Farmer

Farmer work, crops and cultivation systems exist, but settlement cultivation hydration has an important gap described below.

Farmer quest content should wait until that foundation is corrected.

### Travelling Merchant / Courier

Inter-settlement physical goods transport already exists.

Travelling Merchant is planned separately and should be reused when implemented.

Courier/carrier is a future logistics role. Do not invent a quest-only courier system merely for quest content.

---

# Foundation work

## Foundation 1 — Settlement cultivation hydration extension

### Goal

Extend the existing cultivation hydration system so settlement-owned `garden` / `field` cultivation participates in the same real hydration model as player-built cultivation.

The current hydration implementation already provides, for `PlayerGardenRecord`:

- persistent hydration,
- drought stress,
- natural drying,
- deterministic rain contribution,
- player watering,
- NPC watering,
- hydration-aware productivity,
- hydration-related weed/care pressure.

The remaining gap is that settlement garden/field crops do not have equivalent authoritative cultivation-site hydration state.

### Required direction

- settlement `garden` / `field` receives persistent hydration state,
- settlement cultivation receives drought stress where appropriate,
- rain contributes through the existing deterministic weather/hydration logic,
- drying uses the existing cultivation hydration rules,
- Farmer work reacts to real hydration state,
- Farmer performs a real watering action,
- watering uses a valid real water source,
- nearest suitable water sources should include wells where appropriate,
- harvest/yield uses the shared cultivation drought/productivity model,
- save/load, time skip and unloaded/off-screen continuity remain deterministic,
- no global per-frame field scan.

### Guardrails

Do not create:

- `SettlementWateringManager`,
- settlement-specific weather,
- a second hydration formula,
- a second crop lifecycle,
- global NPC-to-field scans.

Reuse or extract the narrow shared cultivation hydration primitives already present in the player-garden domain instead of copying their logic.

### Why this matters for quests

A well built near a field or garden can then create a real daily-life improvement:

```text
farmer needs water
→ nearest useful source is far away
→ local well is completed
→ local well becomes usable
→ watering route becomes shorter
→ cultivation remains hydrated more efficiently
```

This makes the first Builder quest mechanically meaningful rather than cosmetic.

---

## Foundation 2 — Authored persistent world consequences

### Goal

Provide the smallest reusable mechanism needed for authored quests/events to unlock a persistent world-place consequence.

Target concept:

```text
quest/world condition
→ authored consequence unlocked
→ persistent place/state exists
→ normal world systems may use it
```

Examples:

- outpost,
- rebuilt small farm,
- road stop,
- restored ruin,
- new local infrastructure.

### Minimal lifecycle

A consequence may need a narrow lifecycle such as:

```text
locked
→ construction
→ active
```

Not every consequence needs every stage.

### Required properties

- stable identity,
- deterministic reconstruction,
- persistence across save/load and world rebuild,
- world/domain ownership of the resulting object,
- quest layer stores only the outcome/fact needed to unlock it, not a duplicate building/place state.

### Guardrails

Do not build:

- a generic quest scripting DSL,
- a universal world-event engine,
- a generic settlement transformation graph,
- a second settlement/building registry.

The mechanism should support known concrete consequences first.

---

## Foundation 3 — Authored outpost occupants and construction lifecycle

### Goal

Allow an authored consequence such as a new outpost to become a real functioning place instead of a spawned decorative prop.

### Required direction

- stable authored NPC identities,
- deterministic NPC creation/injection using existing settlement/household identity conventions where practical,
- persistent place assignment,
- real construction targets before activation,
- NPC construction through existing work/construction seams,
- transition from construction site to active place,
- active-place inhabitants continue to use ordinary NPC systems after completion.

Example composition:

```text
cleared site
→ outpost consequence unlocked
→ construction targets appear
→ builders/workers perform real work
→ outpost completes
→ assigned persistent NPCs remain
→ ordinary schedules/work/threat behaviour continue
```

### Initial outpost composition

V1 should remain small, for example:

- short palisade section,
- campfire and/or standing torches,
- one shelter or minimal authored structure if an existing structure can be reused,
- 1-2 persistent NPCs.

Possible NPC composition:

- two guards,
- guard + worker/woodcutter,
- another combination justified by the specific story.

### Guardrails

Do not make outpost NPCs temporary quest puppets.

Do not introduce a separate outpost-NPC registry if existing stable `NpcId`, household, place or settlement mechanisms can own the identity.

---

# First quest wave

## Quest 1 — Builder: Finish the local well

**Type:** short independent profession quest.

### Scenario

A settlement has an unfinished well near a field, garden or other work area.

Because the well is incomplete, Farmers or nearby workers rely on a more distant water source, often closer to the settlement centre.

The Builder asks the player to help finish the existing physical well.

### Gameplay

Possible contribution:

- bring missing construction materials,
- perform part of the construction work,
- work alongside NPC builders where the existing work lifecycle supports it.

The quest must target the real well construction record rather than a quest-only fake object.

### Persistent consequence

The well completes and becomes a normal usable water source.

After Foundation 1, nearby Farmer watering should prefer/use this closer source where appropriate.

### Why this is the first vertical slice

It connects:

```text
profession quest
+ existing construction
+ settlement layout
+ real water source
+ Farmer work
+ cultivation hydration
```

without requiring a large new world-consequence system.

**Depends on:** Foundation 1.

---

## Quest 2 — Builder: Repair / complete the palisade

**Type:** short independent profession quest.

### Scenario

A settlement has a damaged or unfinished defensive section.

The Builder asks for help completing the real palisade work.

### Gameplay

- acquire/deliver existing building resources,
- contribute real construction/repair work,
- optionally cooperate with an NPC worker.

### Persistent consequence

A real palisade segment is completed or repaired and remains in the world.

V1 does not need a new settlement-defense score merely to justify the quest.

The story can explain why the work matters even if the full defensive simulation is not yet modeled.

---

## Quest 3 — Builder: New outpost

**Type:** multi-stage profession/world-consequence quest, target 3 stages.

### Stage 1 — Secure the site

A location near a forest, road, resource area or settlement edge is unsafe.

A concrete threat blocks the intended project. Prefer existing threat/world concepts such as a wolf den where appropriate.

The player clears the location.

### Stage 2 — Build

The Builder starts the project.

The player helps provide materials and/or construction work while NPC workers perform real construction through existing systems.

### Stage 3 — Activate

The outpost completes.

Persistent authored NPCs take up residence/duty there.

### Persistent consequence

The location becomes a real world place containing a small set of useful infrastructure and persistent NPCs.

Future systems and quests may reuse it.

**Depends on:** Foundations 2 and 3.

---

## Quest 4 — Healer: Injured resident

**Type:** short independent profession quest.

### Scenario

A real settlement NPC has an actual injury state.

The Healer asks the player to assist with treatment.

### Gameplay

Use the existing injury/treatment domain and existing medicine items where possible.

Possible tasks:

- provide a required dressing/bandage/herb,
- assist with an existing treatment interaction,
- retrieve a locally missing medical item.

### Persistent consequence

The actual NPC health/injury state improves and the NPC can return to ordinary work/routine.

Do not create quest-only health.

---

## Quest 5 — Healer: Difficult case

**Type:** multi-stage profession quest, target 2-3 stages.

### Stage structure

Example:

```text
diagnose the problem
→ obtain the appropriate treatment resource
→ perform / enable treatment
```

An optional final follow-up can confirm recovery through normal dialogue if it adds narrative value.

### Existing items to prefer

Reuse current medicine-related inventory where it fits, including for example:

- `herb`,
- `mint`,
- `yarrow`,
- `bandage`,
- `dressing`.

### Guardrail

Do not duplicate existing injured-cow or injured-dog quest threads. This quest package should primarily cover human Healer content.

---

## Quest 6 — Blacksmith: Missing tools

**Type:** short independent profession quest.

### Scenario

A real settlement work need is blocked or weakened by missing equipment/materials.

Examples:

- woodcutter needs an axe,
- miner needs a pickaxe,
- Farmer needs an appropriate tool,
- Blacksmith lacks an input required for the tool.

### Gameplay

Use existing items and production/economy state where practical.

Useful current kinds include:

- `axe`,
- `pickaxe`,
- `sickle`,
- `pitchfork`,
- `shovel`,
- `iron`,
- `iron_rod`,
- `coal`,
- `whetstone`.

### Persistent/systemic consequence

The resulting item should enter a real NPC/household/settlement inventory or stock path where supported rather than disappear into quest completion.

Do not add a quest-only tool token.

---

# Second wave / later content

The following ideas should remain on the roadmap but should not be planned until their dependencies and first-wave gameplay have been reassessed.

## Blacksmith — Equip the outpost

**Type:** multi-stage.

Possible flow:

```text
outpost exists
→ guards need equipment
→ obtain/produce materials and gear
→ real guard loadouts/stock are improved
```

Prefer real loadout/inventory effects.

---

## Farmer — Threatened farm

**Type:** short or 2-stage.

A predator/local threat prevents normal work.

The player removes the problem and ordinary farm work resumes.

This should rely on real threat/work interaction where current simulation can support it.

---

## Farmer — Restore an abandoned farm

**Type:** 3-stage world-consequence quest.

Candidate flow:

```text
clear the site
→ restore/build basic infrastructure
→ residents/livestock/resources arrive
```

The result should become a persistent inhabited/working place.

Likely depends on the authored consequence and occupant foundations.

---

## Travelling Merchant — Missing transport

**Type:** 2-3 stages.

Only plan after the Travelling Merchant implementation is available and verified.

Target flow:

```text
real journey/order fails to arrive
→ investigate merchant/carrier/cargo
→ recover/resume delivery
→ destination receives the actual goods
```

Reuse physical inter-settlement transport and real cargo.

Do not invent fake quest cargo when normal logistics can represent the delivery.

---

## Travelling Merchant — Dangerous road

**Type:** 3-stage world-consequence quest.

Candidate flow:

```text
merchant identifies recurring route problem
→ player removes threat
→ authored safety consequence is constructed/activated
```

Possible persistent result:

- small guard post,
- road stop,
- safe camp.

The resulting place may later be reused by merchants, carriers or other NPCs if those systems expose a clean seam.

---

## Wolf den → permanent local consequence

Existing wolf-den systems and quest opportunities should be reused.

Do not create another wolf-den simulation or another destroy-den quest infrastructure layer.

A cleared den may become the trigger for an authored local transformation such as:

- outpost,
- woodcutter camp,
- farm expansion,
- other context-specific authored place.

The consequence may be narrative/authored even if settlement AI would not independently decide to build it.

What matters is that the resulting world object/place is persistent and participates in normal systems where practical.

---

## Bridge-related quest

A bridge quest remains desirable but requires a focused recon before planning.

Current road/bridge generation and traversal are already implemented as deterministic terrain/road infrastructure.

Do not add a quest-specific bridge subsystem that conflicts with existing road generation.

A future plan must first determine whether the authored quest should:

- construct a bridge at a predeclared route crossing,
- repair an existing bridge,
- unlock an alternate route,
- or use another existing infrastructure seam.

---

# Settlement identity through concrete content

Avoid vague goals such as "make villages more characteristic" without concrete gameplay.

A non-home settlement becomes worth visiting when it contains specific useful people, services, items, places or situations.

Examples of concrete settlement identity hooks:

- horse-focused settlement: breeder, training, horses, courier/logistics links,
- healer/herbal settlement: Healer, medicinal forage/items, treatment quests,
- woodworking settlement: Builder/woodcutter, timber production, construction stories,
- mining settlement: mine/deposits, miner/Blacksmith links, valuable outbound goods,
- agricultural settlement: larger fields, livestock, food production problems,
- trade-route settlement: merchant stop, transport and road-related problems,
- archaeology/history settlement: elder, chronicler/archaeologist, exploration leads.

The desired player memory is concrete:

```text
"the village with the horse breeder"
"the settlement with the healer"
"the mining village"
"the place where the new outpost was built"
```

not merely "settlement #4".

Quest content should reinforce these concrete identities.

---

# Recommended implementation sequence

## Wave A — first vertical slice

1. Settlement cultivation hydration extension.
2. Builder — Finish the local well.

Reassess gameplay after this pair. The goal is to prove that a profession quest can create a real improvement in ordinary NPC work.

## Wave B — persistent world consequence foundation

3. Authored persistent world consequences.
4. Authored outpost occupants and construction lifecycle.
5. Builder — New outpost.
6. Builder — Repair / complete the palisade.

Reassess whether the consequence foundation is sufficiently narrow and whether the outpost feels like a real place rather than a quest prop.

## Wave C — profession content expansion

7. Healer — Injured resident.
8. Healer — Difficult case.
9. Blacksmith — Missing tools.

## Wave D — only after reassessment

- Blacksmith — Equip the outpost.
- Farmer quests.
- Travelling Merchant quests.
- wolf-den consequence variants.
- bridge-related quest.
- restored farm / road-stop stories.

---

# Planning constraints

Before creating each implementation plan:

1. read `docs/plans/PLANNING.md`,
2. verify the current code and latest implementation notes,
3. check for overlapping existing plans,
4. identify authoritative state ownership,
5. list concrete files/symbols/call-sites,
6. reuse existing construction, NPC, fauna, economy, transport, water and quest mechanisms,
7. explicitly describe persistence and off-screen behaviour,
8. keep browser/gameplay verification assigned to the User.

Do not implement this roadmap as one large feature.

Each roadmap item should become one focused implementation plan, except where recon proves two items are inseparable and combining them reduces rather than increases architectural coupling.
