# Lost Treasure Chronicles

## Direction

Create a large authored quest network about a lost expedition, an encoded chronicle, a treasure map and a final dungeon treasure.

The story should feel like one connected investigation rather than a sequence of unrelated fetch quests:

```text
village elder and local trust
→ wealthy archaeologist
→ uncertain search for a lost chronicle
→ deciphering specialist
→ dark-forest estate and alpha bear
→ recovered treasure map
→ collapsed dungeon expedition
→ missing key trail
→ final treasure
→ ownership decision and persistent consequences
```

The questline should reuse existing world, quest, fauna, container, cave, reputation, relationship and land-ownership systems. It must not create parallel quest-owned substitutes for mechanics that already exist.

The intended result is a multi-stage, multi-solution quest network whose earlier choices affect later assistance, costs, information, relationships, reputation and final rewards.

## Core principles

- Existing treasure quests and world content are foundations, not templates to duplicate.
- Information should come from people, physical evidence and world locations rather than arbitrary quest markers.
- The Player should normally know a **bounded search area**, not the exact answer and not an unbounded world-wide search target.
- Important stages should support more than one valid solution where the world systems allow it.
- Relationships and settlement reputation should influence access, trust, prices, assistance and information instead of acting only as terminal rewards.
- World objects exist independently of quest activation whenever practical.
- Fauna remains fauna-owned. The alpha bear is a real animal, not a scripted quest encounter.
- Grave disturbance, animal burial, digging, containers, keys, caves and land ownership should reuse or extend shared systems.
- The final treasure must physically exist in the world and must not be duplicated by quest rewards.
- Quest progress should observe authoritative world state rather than mirror it in quest-specific flags.
- Earlier discovery, looting, animal death or other valid world changes must be respected rather than reset when a later quest stage becomes active.

## Planning rule

This roadmap defines direction and implementation stages, not current implementation status.

Before creating each implementation plan:

1. read `docs/plans/PLANNING.md`,
2. check `docs/state/quests.md` and other relevant state docs,
3. inspect the current `main` codebase,
4. inspect related plans and implementation notes,
5. verify current ownership boundaries and reusable contracts,
6. verify whether previously planned dependencies are now implemented,
7. identify collisions with existing authored quest content,
8. only then write the implementation plan.

Current code and completed plans take precedence over this roadmap.

---

# Existing content and collision guardrails

This story overlaps strongly with several existing questlines and must be designed around them rather than implemented as another independent treasure stack.

Relevant existing content includes:

- `quests-progression-008` — grave hidden find, map, persistent bear cave and treasure choice;
- `quests-progression-009` — dark-forest ruins, physical treasure map, dangerous fauna and world-generated treasure;
- `quests-progression-026` — dungeon caches, evidence, claimant and stolen property;
- `quests-progression-027` — lost expedition, journal/evidence, dungeon `finalTreasure` and multiple stakeholders;
- `world-024` and related treasure work — systemic treasure sites, physical keys and locked world containers.

The final implementation plans must decide whether selected existing authored quests are:

1. reused as chapters of this larger story,
2. refactored into shared content used by this story,
3. kept as independent stories with explicitly separate caves/sites/items,
4. or superseded/retired where keeping both would create obvious duplicate narrative beats.

Do not simply add another grave-map-bear-dungeon-treasure quest beside all four existing stories.

---

# Narrative structure

The intended authored cast spans at least two settlements and preferably three:

- **Village Elder / Former Expedition Worker** — lives in a small settlement and once worked in the city or for an archaeological expedition;
- **Wealthy Archaeologist** — lives in a larger settlement and finances the search;
- **Deciphering Specialist** — scholar, scribe, historian or other plausible specialist, preferably in another settlement or social context;
- optional secondary stakeholders connected to the old expedition, land deed or final property claim.

The cast should use stable NPC identity and ordinary relationship/reputation systems rather than a separate story reputation.

---

# Stage 1 — Elder relationship and story lead

## Goal

Make the first lead feel earned and establish relationships/reputation as active quest mechanics before the treasure hunt begins.

The elder should not immediately reveal everything to an unknown Player.

The Player should be able to build enough trust through a small local quest network before receiving the archaeologist lead.

## Local relationship content

Target **two or three small problems** associated with the elder, his household or immediate village.

Each problem should provide at least two meaningful approaches where practical, producing different relationship/reputation outcomes.

The exact tasks should be chosen during implementation planning after recon of existing reusable objective types and local world systems.

Suitable design patterns include:

### Household help

A real household shortage or practical problem can be solved by:

- supplying the needed goods directly,
- solving the underlying source problem,
- arranging help through another NPC / work / trade mechanism if available.

The Player who simply pays or supplies goods may earn gratitude; solving the root cause may earn more trust/competence.

### Lost or damaged property

The elder needs an ordinary physical item, animal or household asset recovered/repaired/replaced.

Possible outcomes may distinguish:

- returning the original property,
- replacing it at Player expense,
- discovering who caused the loss and resolving the underlying conflict.

### Local social problem

A dispute with another villager can be resolved by helping one side, mediating, paying a debt or uncovering the actual cause.

The result should affect the elder relation and potentially settlement reputation differently.

## Trust gate

The archaeologist lead should use a combination of:

- relationship with the elder,
- relevant settlement reputation dimensions,
- successful local outcomes.

The design should tolerate different paths.

For example:

- strong personal relationship alone can be sufficient;
- moderate relationship plus strong settlement reputation can be sufficient;
- poor reputation may require additional proof/help before the elder trusts the Player.

Do not introduce `elderTrustPoints` if existing relation/reputation and prior quest outcomes can express the gate.

## Better trust = better information

Trust should affect the **quality of the lead**, not merely whether a quest appears.

Possible gradation:

- minimum trust → archaeologist name and city/settlement;
- stronger trust → detail about the earlier expedition and approximate last-known search area;
- highest trust → an extra clue that later narrows one of the chronicle search locations or unlocks a cheaper/faster route.

## End state

The Player has a plausible relationship with the elder and receives a lead to the wealthy archaeologist.

---

# Stage 2 — Archaeologist and the uncertain chronicle search

## Goal

Introduce the central mystery and deliberately create an **OR search** rather than a single marked pickup.

The archaeologist knows the previous researcher possessed an important chronicle, but does **not** know where it ended up.

He has two credible possibilities:

1. the chronicle was buried with the researcher;
2. the chronicle was left behind in ruins used by the failed expedition.

The Player may investigate either location first.

## Bounded search areas

The quest must not say only "search some ruins" or "find the grave somewhere".

The archaeologist should provide enough historical/geographical information to identify two bounded areas, for example:

- a named cemetery near a specific settlement;
- a known ruin site or a small search region around a known road/river/landmark.

Use existing world-location knowledge/navigation mechanisms wherever possible.

The Player may know the **area** without knowing the exact interactable spot.

## Converging alternatives

Both search branches converge on the same physical chronicle.

The world must deterministically decide which candidate location actually contains it for that authored story/world seed, or use another explicit authored rule established by the implementation plan.

The unused location may still contain evidence explaining why the chronicle is absent, so investigating the "wrong" place is not wasted time.

Possible structure:

```text
cemetery first
→ evidence / chronicle
→ ruins become optional corroboration

or

ruins first
→ evidence / chronicle
→ cemetery becomes optional corroboration
```

Do not spawn a second copy of the chronicle.

## Grave access and alternatives to grave robbery

Directly digging up the grave should remain a valid fast path, using ordinary shovel/grave disturbance and its social/reputation consequences.

However the quest should support at least one less-obvious alternative that gives the Player a legitimate reason to disturb or reopen the ground.

Candidates to evaluate during recon:

### Cemetery maintenance / sanctioned work

A cemetery caretaker, family member or settlement authority needs cleanup, repair, relocation or another legitimate ground task near the grave.

Completing that work may expose the hidden find or grant permission to dig in that exact area.

This is preferred if it can be expressed through reusable cemetery/work/ground-action systems rather than a bespoke quest interaction.

### Animal burial route

Animal corpse burial already exists as an ordinary Player action. Explore whether a plausible quest/world contract can allow the Player to bring an animal corpse to a designated burial/cleanup site, with digging at the relevant ground exposing the same hidden find.

Do not implement a contrived `buryAnimalToUnlockChronicle` special case. If this route is used, it should extend generic burial/hidden-find interaction rules that remain meaningful outside this story.

### Permission / family route

If a living relative or authority can plausibly grant access, sufficient relation/reputation may allow sanctioned exhumation with reduced or absent grave-robbing consequence.

The final implementation plan should choose the smallest coherent set of alternatives supported by current systems.

## End state

The Player obtains the one physical encoded chronicle through one of several search/access paths, while the chosen method has social consequences.

---

# Stage 3 — Chronicle deciphering and specialist network

## Goal

Turn the chronicle into a social/information problem rather than an instant readable quest item.

The archaeologist can identify the chronicle but cannot fully decipher it.

He directs the Player to a specialist.

## Specialist solutions

The specialist should support multiple ways to gain help, based on systems available at implementation time:

- pay a normal service fee;
- complete a useful task/favour;
- receive reduced/free help because of relation or settlement reputation;
- potentially provide an additional source/reference item that reduces cost or effort.

Avoid a one-off "decode currency" or quest-only reputation.

## Decoded information

The chronicle reveals that the expedition's **treasure map** was deliberately left in an old estate/manor in a dark forest rather than carried into the final expedition.

It should provide a bounded search destination through normal world-location knowledge:

> named forest / known route / approximate estate area

not an arbitrary global search.

The chronicle may also contain partial contextual clues relevant later to the dungeon, key or land deed, rewarding Players who preserve/read the whole record.

## End state

The Player knows where to search for the estate and understands that recovering the map is the next expedition step.

---

# Stage 4 — Dark-forest estate and alpha bear

## Goal

Create a dangerous expedition to recover the physical treasure map from an existing or shared dark-forest world location.

This stage should strongly consider reusing/refactoring the world content from `quests-progression-009` rather than creating another equivalent dark-forest ruin site.

## Estate / ruins

The destination should be a stable world location that exists independently of quest activation.

It should be possible, though difficult, to discover it before receiving the chronicle clue.

The map and related evidence should physically exist there from world composition or another deterministic content mechanism.

## Alpha bear

The estate area is associated with a **large alpha bear**, not an ordinary scripted quest bear.

The codebase already has fauna-owned `normal | alpha` per-individual variants. The story should extend/reuse that mechanism for the bear if current code supports the required persistent occupant binding.

Desired properties:

- `kind === 'bear'` remains unchanged;
- `variant === 'alpha'` provides the larger/stronger individual profile;
- fauna owns HP, combat, movement, hunger, roaming, death and persistence;
- the quest does not respawn or tether the bear;
- the Player may kill, avoid, distract or arrive when the bear is elsewhere;
- killing the bear is not inherently required for map recovery.

The bear should be memorable environmental pressure, not a `kill_bear_to_unlock_map` gate.

## Archaeologist expedition support

Before leaving, the archaeologist may finance the expedition depending on the Player's demonstrated integrity/trustworthiness.

Possible inputs:

- elder relationship,
- settlement reputation,
- previous handling of grave/chronicle,
- relation with archaeologist.

High trust may produce travel/provision money or supplies.

Poor integrity may cause the archaeologist to refuse advance funding and promise payment only after proof.

Do not create a separate trust meter for this story.

## End state

The Player recovers the physical treasure map and can use it to reveal/navigate toward the final dungeon region.

---

# Stage 5 — Collapsed dungeon access

## Goal

Make reaching the treasure depend on ordinary tools and persistent world modification rather than only walking to a marker.

The map points to one exact real dungeon/cave using existing cave/world-location systems.

The dungeon must be kept distinct from incompatible existing authored cave claims, or deliberately integrated with `quests-progression-026/027` after recon.

## Collapsed entrance/passage

The dungeon is partially blocked by a collapse.

The desired generic mechanism is conceptually:

```text
stable world blockage
→ tool/work interaction
→ accumulated or atomic clearing work
→ persisted cleared state
→ ordinary traversal becomes possible
```

Tools should reuse normal capabilities:

- pickaxe / rock mining,
- shovel / digging where appropriate.

Do not store only `questRubbleCleared = true` in quest progress.

The blockage should be a reusable world mechanism suitable for caves, mine accidents, roads or future ruins.

## Multiple preparation paths

Tool possession should matter physically.

Possible solution differences to evaluate during planning:

- Player brings the required tools;
- Player buys/borrows suitable tools;
- sufficient relationship/reputation may allow the archaeologist or another NPC to provide equipment;
- future shared-work/work-contract systems may allow hired assistance if already implemented by the time this stage is planned.

The dungeon should not create temporary quest-only tools.

## End state

The collapsed section remains cleared permanently and can be traversed independently of quest state.

---

# Stage 6 — Expedition remains, locked passage and missing key trail

## Goal

Turn the dungeon into an investigation with a meaningful return to the outside world before the final chamber.

Inside the dungeon the Player finds:

- old chests / supplies,
- skeletal or corpse remains of expedition members,
- physical evidence/journal/item,
- a locked deeper passage leading toward the final treasure.

## Physical evidence

Evidence on the remains explains that one expedition member escaped or left carrying the key.

The clue should identify a bounded next search target rather than create a generic "find key" task.

Possible destinations include:

- an abandoned camp outside the dungeon;
- a grave near another settlement;
- remains near a river/road;
- an NPC or household that found the survivor's possessions years earlier.

This step deliberately creates:

```text
dungeon
→ evidence
→ external world / settlement
→ key investigation
→ return to dungeon
```

## Key ownership

The key must be a real physical item using the shared treasure/key/item-instance systems where compatible.

The locked passage/container must consume or validate the real key through shared interaction rules.

Do not use only a quest boolean such as `foundDungeonKey`.

If the current lock system applies only to containers, plan the smallest reusable locked-passage/door extension rather than a story-specific unlock callback.

## Alternative key solutions

Implementation planning should evaluate whether the final lock can support more than one approach, such as:

- recover the real key;
- force entry with appropriate tool/skill/system if shared forced-entry mechanics exist;
- obtain information from a stakeholder that reveals another entrance.

Do not promise alternatives that would require a large unrelated system solely for this quest.

## End state

The Player can open the final dungeon section through authoritative world state and return to the treasure chamber.

---

# Stage 7 — Final treasure, land deed and property ownership

## Goal

Make the final treasure valuable not only because of coins/items, but because it can permanently alter the Player's place in the world.

## Treasure composition

The final treasure should contain a combination such as:

- substantial coins/valuable goods,
- one distinctive historical artifact,
- a **land deed / ownership document** tied to a real property near a settlement.

Exact valuables should be balanced later against the current economy.

The physical treasure is world-owned inventory/container content and must not be duplicated as a quest reward.

## Land deed

The deed should connect to the existing Player land/plot ownership system rather than introduce a parallel `questEstateOwned` flag.

Current direction:

- create a larger special property outside or beside a town;
- visibly bound it with a fence or other world boundary;
- give it stable plot/property identity;
- allow ownership to be granted by a legitimate deed/claim transition as well as existing purchase mechanisms;
- persist ownership through the normal land ownership state;
- make the property usable by ordinary Player construction/land rules where appropriate.

The property should exist before the Player owns it. The quest changes ownership, not world existence.

Implementation planning must verify whether the current sale-plot model should be generalized to support multiple acquisition sources, for example:

```text
purchase
quest/deed grant
future inheritance/reward
```

without duplicating ownership semantics.

## Ownership conflict

The deed should create a final stakeholder conflict rather than acting as unquestioned free land.

Possible interpretations:

- archaeologist believes the expedition contract gives him claim to all discoveries;
- a settlement authority recognizes the deed only if the Player has sufficient local reputation;
- descendants or another household may claim historical ownership;
- the deed may be legally valid but socially controversial.

This creates several final outcomes without requiring a binary morality choice.

## Final outcome directions

The exact set should be selected after implementation recon, but target branches include:

### Honour the archaeologist agreement

Return agreed treasure/evidence or share it according to the original arrangement.

Effects:

- strong archaeologist relation/trust,
- strong integrity reputation,
- monetary reward/share,
- land deed may still be granted, transferred or negotiated depending on the contract.

### Keep the treasure and deed

Player keeps maximum material value and attempts to claim the property.

Effects depend on whether the behaviour was concealed or openly disputed.

### Share the treasure, claim the land

A negotiated middle path where the archaeologist receives archaeological valuables/evidence while the Player keeps or receives the estate.

### Donate historical material

Give artifact/chronicle/evidence to an institution/settlement/specialist while negotiating separately over money and land.

This may favour renown and settlement reputation over immediate wealth.

## End state

The quest can result in persistent changes to:

- Player wealth,
- ownership of a real estate/land plot,
- relation with the elder,
- relation with the archaeologist,
- relation with the specialist and other stakeholders,
- settlement reputation dimensions,
- discovered world locations,
- dungeon accessibility,
- fauna history,
- ownership/location of physical historical items.

---

# Stage 8 — Quest-network integration and consequence continuity

## Goal

Only after the shared world mechanisms are ready, connect the full authored network through the existing quest runtime.

This should be the thinnest implementation stage.

## Network rather than one linear quest

Prefer several linked `QuestDef`s / opportunities with explicit prior outcomes and world predicates over one enormous monolithic state machine where that matches current quest architecture.

Conceptually:

```text
elder local help A/B/C
        ↓
archaeologist lead
        ↓
chronicle search
   ↙             ↘
cemetery        ruins
   ↘             ↙
encoded chronicle
        ↓
specialist / deciphering
        ↓
dark-forest estate
        ↓
treasure map
        ↓
collapsed dungeon
        ↓
key investigation
        ↓
final treasure
        ↓
land / archaeologist / historical outcome
```

Earlier quests should remain meaningful through prerequisites, relations, reputation and physical world state.

## Catch-up and independent discovery

The network must tolerate Players who:

- already know the dark-forest location;
- already killed the alpha bear;
- already explored the dungeon exterior;
- already possess relevant physical evidence because world content was discovered early;
- have strong/weak reputation before meeting the elder;
- investigate the second chronicle location after already finding the chronicle.

Quest activation must never recreate consumed loot, revive fauna or re-collapse a cleared passage.

## Consequence continuity

The quest network should use existing consequence channels rather than a dedicated story ledger wherever possible:

- NPC relationship,
- settlement reputation / renown,
- quest outcomes,
- physical ownership of items,
- location knowledge,
- land ownership,
- world container state,
- cave blockage state,
- fauna state.

Only truly authored historical decisions that cannot be derived from those systems should become quest outcome/progress state.

## Dialogue

Dialogue should reflect current world facts and earlier choices:

- elder remembers which help the Player provided;
- archaeologist reacts differently to integrity/reputation and funding risk;
- specialist recognizes prior relation or payment/favour;
- later stakeholders can react to grave disturbance, stolen/returned evidence or ownership claims where those consequences are actually observable.

Do not build a separate dialogue engine solely for this story.

## End state

The entire story behaves as a connected network built from existing Seedvale systems rather than a scripted tunnel.

---

# Suggested implementation order

The likely plan sequence is:

```text
1. Elder local relationship quest slice
2. Chronicle dual-location search + sanctioned/unsanctioned grave access
3. Chronicle physical item + deciphering specialist flow
4. Dark-forest estate integration + persistent alpha bear + map recovery
5. Generic persistent cave/dungeon blockage clearing
6. Dungeon expedition evidence + locked passage + external key trail
7. Generalized deed/land-grant ownership + special fenced estate
8. Final treasure/outcomes
9. Full quest-network integration, catch-up and consequence pass
```

Some steps can be combined if recon shows the current code already provides the required shared mechanisms.

Do not create all implementation plans mechanically in advance if an earlier plan materially changes the contracts used by later stages. Re-recon `main` between stages.

---

# Dependency direction

Conceptually:

```text
relationships / reputation / quest prerequisites
        ↓
elder local quest network
        ↓
world-location knowledge + hidden finds + cemetery/grave interaction
        ↓
physical chronicle + specialist interaction
        ↓
dark-forest world site + fauna alpha variant + physical map
        ↓
Cave V2 / dungeon anchors + persistent blockage
        ↓
physical evidence + physical keys / lock interaction
        ↓
land ownership / deed grant
        ↓
final authored quest-network integration
```

Existing treasure/cave quests must be reconciled before claiming world anchors or authored sites.

---

# Success criteria

The roadmap succeeds when the final experience is not reducible to:

> NPC → marker → item → marker → treasure.

Instead:

- the Player first earns or leverages social trust;
- information quality depends on relationships/reputation;
- the chronicle genuinely may be in one of two plausible places;
- grave access has socially distinct approaches;
- clues narrow real search areas rather than reveal arbitrary answers;
- the specialist is a real social/economic dependency;
- the alpha bear is a real fauna-owned individual and can be handled in multiple ways;
- tools and persistent world modification matter in the dungeon;
- evidence sends the Player back into the broader world to recover the key;
- the final treasure creates a meaningful ownership decision;
- the land deed can grant a real persistent property rather than a quest-only reward;
- earlier choices continue affecting relations, reputation, assistance and later outcomes;
- removing the active quest UI would not remove the cave, bear, estate, chronicle, key, treasure, cleared passage or Player-owned land from the world.
