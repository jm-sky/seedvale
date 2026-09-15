# Plan: Lost Treasure Chronicles — archaeologist and chronicle search

**Created:** 2026-09-15  
**Status:** `verification needed` 🔍 
**Priority:** high · **Effort:** L  
**Depends on:** quests-progression-037, ~~quests-progression-008~~, ~~quests-progression-009~~, ~~quests-progression-011~~, ~~quests-progression-032~~  
**Domain:** `quests-progression`  
**Type:** `feature`  
**Subdomains:** `quests` `relationships` `progression`  
**Tags:** `lost-treasure-chronicles` `archaeologist` `chronicle` `grave` `ruins` `investigation` `multi-solution`  
**Roadmap:** `quests-lost-something-chronicles.md`
**Model:** Opus, Sonnet

## Goal

Implement the second chapter of **Lost Treasure Chronicles**:

```text
elder relation / local reputation
→ elder reveals archaeologist lead
→ guaranteed archaeologist in another settlement
→ previous researcher and missing encoded chronicle
→ two credible bounded search locations:
   cemetery OR expedition ruins
→ exactly one contains the real chronicle
→ the other contains corroborating evidence
→ physical encoded chronicle acquired
```

This plan ends when the Player obtains the encoded chronicle.

It does **not** implement:

- return-to-archaeologist follow-up,
- deciphering specialist,
- deciphering itself,
- dark-forest estate,
- alpha bear,
- treasure map,
- final dungeon,
- land deed.

The chapter should feel like an investigation rather than a sequence of exact waypoint pickups.

---

## 1. Story entry from plan 037

The story starts from the ordinary state created by `quests-progression-037`.

Do not introduce a new story trust score.

Use existing:

```text
elder relation
+
elder quest outcomes
+
elder settlement reputation
```

to decide whether the elder gives the archaeologist lead and whether he adds one useful extra clue.

Keep this intentionally simple:

### Basic lead

The elder reveals:

- archaeologist identity,
- settlement/town where the archaeologist lives.

### Strong lead

With stronger relation/reputation/outcomes, the elder additionally provides one useful historical clue, for example:

- researcher surname,
- cemetery name,
- a recognizable description of the expedition ruins,
- another bounded geographic hint.

Do not implement three or more information tiers.

Do not persist `leadTier` / `informationTier`.

Prefer one pure story-facing resolver that derives the result from authoritative relation/reputation/outcome state.

---

## 2. Guaranteed archaeologist

Introduce the second major authored NPC of Lost Treasure Chronicles.

The archaeologist is a guaranteed resident of a larger settlement than the elder's village.

Preferred settlement profile:

- `MD`, `LG` or `XL`,
- non-home,
- ordinary settlement rather than outpost,
- reasonably reachable from the elder's settlement.

Reuse the smallest authored-resident seam landed by plan 037.

Do not build a global `StoryNpcManager` or broad authored-character framework.

### Character direction

The archaeologist is:

- wealthy relative to ordinary villagers,
- educated / well travelled,
- financing exploration rather than doing all field work personally,
- interested in the missing chronicle because it may lead to a larger treasure.

Use an existing simulation role where practical. `trader` is acceptable if no scholar profession exists.

Do not add an `archaeologist` profession solely for narrative flavour.

The archaeologist remains a normal NPC with normal household, needs, schedule, physical state and lifecycle.

Stable `NpcId` is authoritative identity; authored name is presentation/content.

---

## 3. Archaeologist introduction

Talking to the archaeologist after receiving the elder lead begins the investigation.

He explains:

- an earlier researcher was searching for the treasure,
- the researcher kept a personal chronicle,
- the chronicle contains encoded clues,
- nobody recovered it after the earlier expedition failed.

Crucially:

> the archaeologist does **not know where the chronicle is**.

He has two credible hypotheses:

1. it was buried with the researcher;
2. it was left at ruins used by the failed expedition.

The Player may investigate either location first.

---

## 4. Two bounded search locations

The quest must reveal two real, bounded destinations.

Not:

```text
search some ruins somewhere
```

but conceptually:

```text
cemetery belonging to settlement X
```

and:

```text
old expedition ruins near known landmark / road / river Y
```

Both destinations must be:

- stable world identities,
- deterministically reconstructable,
- independently discoverable where normal world systems permit it,
- compatible with existing world-location/navigation mechanisms.

The archaeologist may reveal the destination/area, but must not reveal the exact hidden-item coordinate.

Reuse `LocationKnowledge` / normal navigation rather than quest-only map markers.

---

## 5. Deterministic world truth

For each world, exactly one candidate site contains the chronicle:

```text
cemetery
OR
ruins
```

This choice must be derived **before quest acceptance/materialization of visit-order dependent state**, from deterministic world/story identity.

Conceptually:

```ts
chronicleLocation(worldSeed, storyKey)
→ 'grave' | 'ruins'
```

Requirements:

- same world seed → same answer,
- no runtime `Math.random()`,
- no reroll on reload,
- no reroll on quest acceptance,
- no moving the chronicle because the Player visited one candidate first,
- persistence is unnecessary if the value is fully deterministic.

This is necessary so early discovery and early looting remain coherent.

---

## 6. Search branch A — researcher's grave

One hypothesis says the chronicle may have been buried with the researcher.

Use existing cemetery/grave/Hidden Find systems.

Existing ownership should remain conceptually:

```text
grave identity / geometry → cemetery/world
hidden-find one-shot      → Hidden Finds
social exposure           → reputation
quest observation         → QuestManager
```

The chronicle-bearing grave must have stable identity.

Do not create a second fake grave layered over a real cemetery.

---

## 7. Direct grave-robbing path

The Player may directly dig the relevant grave with normal shovel/ground interaction.

This is the fastest route.

If the disturbance becomes socially exposed, reuse the existing grave-disturbance reputation path from the cemetery/grave-robbing systems.

Do not add a second Lost Treasure Chronicles integrity penalty for the same disturbance.

The quest only observes whether the relevant world find/evidence was recovered.

---

## 8. Sanctioned grave-access path

Provide at least one authored alternative to straightforward grave robbery.

Preferred narrative:

```text
cemetery caretaker / family / settlement authority
→ small cemetery maintenance or related favour
→ grants permission to examine/open the specific grave
```

The exact favour must reuse current mechanics where possible.

Do **not** begin by designing a broad generic grave-permission framework.

Preferred implementation order:

1. recon the existing grave-disturbance/exposure call path;
2. determine whether a small reusable "authorized disturbance" input already fits naturally;
3. add only the smallest shared seam needed for this exact use case.

It is acceptable for permission to originate from an authored quest outcome/stage effect if the world interaction can consume that authorization without importing Lost Treasure Chronicles logic into `groundActions`.

Do not add:

```text
questAllowsDiggingHere = true
```

directly inside generic ground-action code.

The important invariant is:

> the same physical grave interaction may be socially illicit or sanctioned depending on authoritative access state, without the grave action knowing which story granted it.

If this still proves disproportionately large during implementation recon, reduce the sanctioned route to the smallest coherent authored exemption rather than building a generic cemetery-job subsystem.

---

## 9. Animal burial remains emergent only

Animal corpse burial already exists as a normal world action.

Do not make:

```text
bury animal at the grave → unlock chronicle
```

a required authored solution.

During implementation recon, verify whether normal digging/burial near a Hidden Find can naturally expose it.

If so, allow that behaviour to remain emergently valid.

Do not special-case species, corpse identity or quest stage for this story.

---

## 10. Search branch B — expedition ruins

The second hypothesis says the chronicle may have been left at ruins used by the failed expedition.

Prefer reuse of an existing stable ruins mechanism.

Current code already contains procedural `smallRuins` and authored ruin-site patterns.

Do **not** create a new authored ruin archetype if an existing deterministic `smallRuins` placement can provide:

- stable identity,
- bounded location knowledge,
- a stable evidence/container anchor.

Only introduce a new authored ruin-site binding if recon proves generic ruins cannot safely host persistent story evidence.

This chapter's ruins are an **earlier expedition site**.

Do not reuse the later dark-forest estate from the same questline, because that would collapse two distinct narrative stages.

---

## 11. Wrong-site evidence

Investigating the non-chronicle site must still produce meaningful evidence.

The invariant is:

```text
chronicle source = one physical source
wrong-site evidence = one separate physical/world fact
quest = only observes both
```

Do not represent wrong-site investigation only as:

```text
questProgress.checkedGrave = true
```

Examples:

### Chronicle is in grave

Ruins may contain:

- expedition supplies,
- a note saying the researcher took his papers away,
- a personal effect,
- expedition marking or ledger.

### Chronicle is in ruins

Grave may yield:

- burial evidence indicating he was buried without his papers,
- a personal object showing possessions were separated,
- another physical clue pointing back toward the ruins.

Use the smallest existing persistent representation:

- Hidden Find,
- physical story item,
- world-generated container,
- readable evidence item,
- another stable world fact.

Never spawn a second chronicle as consolation loot.

---

## 12. Investigation order

The Player may investigate either site first.

Required flows:

```text
grave → chronicle
```

```text
grave → evidence only → ruins → chronicle
```

```text
ruins → chronicle
```

```text
ruins → evidence only → grave → chronicle
```

The quest must not assume fixed site order.

Prefer one nonlinear chapter quest rather than two mutually exclusive independent quests.

Use existing multi-objective/nonlinear flow and world-state observation where sufficient.

Do not add parallel investigation state when Hidden Find/container/item ownership already proves what happened.

---

## 13. Early discovery and catch-up

The world remains authoritative.

Handle at least:

- cemetery discovered before meeting the archaeologist;
- ruins discovered earlier;
- target grave disturbed earlier;
- relevant Hidden Find already recovered;
- ruins evidence/container already looted;
- chronicle already acquired before the archaeologist formally explains the mystery.

Quest activation must catch up from persisted world state.

Do not:

- respawn the chronicle,
- reset the grave,
- refill a looted evidence container,
- require location discovery to happen again.

If the Player already owns the chronicle, the chapter should converge immediately to its successful end state rather than forcing redundant investigation.

---

## 14. Physical encoded chronicle

The chronicle is one real physical story item.

Prefer reuse of the exact-instance pattern already used by `expedition_journal` / other identity-backed story items.

Do not invent a new story-item ownership mechanism.

Conceptually:

```text
kind: encoded_chronicle
category: story
stable instance id: story:lost-treasure-chronicles:chronicle
```

Exact naming must follow current `ItemKind` / `ItemInstance` conventions.

Requirements:

- physical inventory ownership,
- normal persistence,
- exactly one authoritative instance,
- later transferable to other NPCs if future plans need it,
- quest progress never duplicates ownership.

---

## 15. Chronicle source materialization

The deterministic true-location decision controls which world source owns the chronicle.

### Grave truth

```text
stable grave Hidden Find
→ exact chronicle instance
```

### Ruins truth

```text
stable ruins container/find
→ exact chronicle instance
```

The false site owns only its separate evidence.

The two sources must never both materialize the chronicle.

A same-seed rebuild/save-load must preserve that invariant.

---

## 16. Quest progression model

Prefer one chapter quest.

Conceptually:

```text
Stage 1
meet archaeologist / receive both hypotheses

Stage 2
investigate candidate locations in any order

Stage 3
acquire exact chronicle
→ chapter completes
```

Stage 2 must distinguish:

```text
candidate investigated
```

from:

```text
chronicle acquired
```

Wrong-site evidence is useful progress but not completion.

Use world-state facts and objective slots before adding story booleans.

The chapter should end **on physical acquisition of the chronicle**.

Do not require a report-back to the archaeologist in this plan.

The next plan may begin with:

```text
return to archaeologist with chronicle
→ confirms authenticity
→ directs Player to deciphering specialist
```

This keeps the implementation boundary clean.

---

## 17. Social consequences

This chapter should primarily react to prior standing and world actions.

Possible small consequences:

- archaeologist relation increases when the Player accepts/progresses meaningfully if current dialogue model supports a natural point;
- competence may increase from successful investigation only if there is one clear socially-known resolution event;
- exposed grave robbery uses existing cemetery reputation consequences;
- sanctioned grave access must not receive the same illicit penalty.

Do not double-count one act through both generic grave systems and quest outcome consequences.

Avoid large renown rewards at this stage.

---

## 18. State ownership

```text
037 elder chapter
→ owns only its normal quest outcomes/relations

settlement generation
→ owns archaeologist as ordinary resident

cemetery/world
→ owns cemetery and grave identity

Hidden Finds
→ own grave one-shot recovery state

ruins/world location
→ owns ruins identity

WorldGeneratedContainers / item world ownership
→ own ruins evidence/chronicle source when applicable

Inventory / ItemInstances
→ own physical chronicle

LocationKnowledge
→ owns discovered/revealed locations

ReputationManager
→ owns social standing

QuestManager
→ owns chapter lifecycle/progress only
```

No dedicated Lost Treasure investigation state registry.

---

## 19. Collision guardrails

This plan overlaps existing treasure content and must reuse mechanisms without duplicating stories.

### `quests-progression-008`

Already provides:

- grave Hidden Find,
- grave disturbance,
- treasure-related physical discovery.

Reuse the mechanics, not the same grave/site/item.

### `quests-progression-009`

Already owns major dark-forest ruins treasure content.

Do not use that later dark-forest estate here.

This chapter's ruins are an earlier expedition evidence site.

### `quests-progression-026/027`

Dungeon expedition evidence belongs to later Lost Treasure Chronicles stages.

Do not move dungeon/final-expedition content into this surface-world chronicle search.

### Story-item identity

Reuse the established identity-backed item pattern from `expedition_journal` rather than adding a parallel exact-story-item mechanism.

---

## 20. Persistence and lifecycle

Persist only through existing owners:

- quest progress,
- relations,
- reputation,
- location knowledge,
- Hidden Find resolution,
- world-container depletion,
- item instance ownership.

Do not persist deterministic:

- grave-vs-ruins truth,
- information tier,
- archaeologist selection when fully reconstructable from authored world generation.

Save/load must preserve:

> exactly one chronicle exists and it remains owned by the authoritative world/inventory source.

Do not make the archaeologist immortal.

Do not respawn story actors/items to repair lifecycle outcomes.

Future plans may define fallback story behaviour if important actors die.

---

## 21. Reuse targets

Verify current `main` before implementation, especially:

- `docs/plans/quests-progression-037-lost-treasure-chronicles-elder-trust-foundation.md`;
- `src/quests/quests.ts`;
- `src/quests/QuestManager.ts`;
- `src/reputation/ReputationManager.ts`;
- `src/world/hiddenFinds.ts`;
- `src/app/actions/groundActions.ts`;
- cemetery generation / grave layout in settlement/world modules;
- `src/reputation/socialExposure.ts`;
- `src/world/worldGeneratedContainers.ts`;
- `src/items/itemInstances.ts`;
- `src/items/items.ts`;
- world location / knowledge / navigation modules;
- procedural/authored ruins in `src/terrain/chunkEnvironment.ts` and existing ruin-site modules;
- identity-backed story-item pattern in `src/quests/lostTreasureExpedition.ts`;
- `src/app/createApp.ts`.

Add concise JSDoc with relevant `@domain` tags for important shared/public additions.

Current code remains the source of truth if any listed symbol or ownership boundary changes before implementation.

---

## 22. Non-goals

Do not implement:

- return-to-archaeologist follow-up,
- deciphering specialist,
- decoded chronicle contents,
- cipher puzzle,
- dark-forest estate,
- alpha bear,
- treasure map,
- collapsed dungeon,
- key hunt,
- final treasure,
- land deed,
- Player estate,
- generic archaeology profession,
- generic investigation/clue engine,
- generic legal system,
- broad cemetery-job framework,
- broad grave-permission framework,
- arbitrary story-state registry.

---

## 23. Automated verification

Cover at least:

### Story entry

- archaeologist lead derives from real 037 relation/reputation/outcomes;
- basic and strong lead variants work;
- no persisted information tier.

### Archaeologist

- exactly one intended authored archaeologist exists;
- stable `NpcId` reconstructs for same world;
- ordinary settlement population owns him.

### True-location selection

- deterministic for same seed;
- only `grave` or `ruins`;
- fixed before visit order matters;
- does not reroll on reload/acceptance;
- exactly one chronicle source materializes.

### Grave branch

- target grave identity stable;
- unauthorized disturbance uses existing grave consequences;
- sanctioned access does not apply the illicit consequence;
- Hidden Find resolves once;
- false grave branch yields only evidence when ruins owns the chronicle.

### Ruins branch

- stable ruins binding;
- evidence/chronicle source persists;
- false ruins branch contains evidence only;
- no duplication on rebuild/save-load.

### Nonlinear investigation

- grave-first success;
- grave-first evidence then ruins;
- ruins-first success;
- ruins-first evidence then grave;
- wrong-site investigation never completes the chapter by itself.

### Early state

- prior cemetery discovery respected;
- prior ruins discovery respected;
- prior hidden-find recovery caught up;
- prior ruins loot caught up;
- prior chronicle ownership completes/catches up coherently.

### Chronicle identity

- one exact instance;
- follows existing story-item persistence pattern;
- never exists simultaneously in both sources;
- quest observes ownership rather than duplicating possession state.

### Social consequences

- grave penalty is not duplicated by quest resolution;
- sanctioned path does not receive illicit grave penalty.

Manual browser verification remains the User's responsibility.

---

## 24. Completion criteria

The plan is complete when:

1. plan 037 can lead the Player to one guaranteed archaeologist;
2. the archaeologist is a normal resident of another real settlement;
3. prior elder standing produces a basic or stronger lead without new story trust state;
4. the archaeologist presents two bounded candidate locations;
5. world/story seed deterministically decides whether the chronicle is in the grave or ruins before visit order matters;
6. both sites can be investigated in either order;
7. the false site contains one stable meaningful evidence source;
8. direct grave robbery uses existing social-risk mechanics;
9. one coherent sanctioned grave-access path exists without a broad new permission framework;
10. generic/procedural ruins are reused if technically sufficient;
11. the chronicle follows the existing identity-backed story-item pattern;
12. early discovery/looting/digging is respected;
13. no later dark-forest/dungeon content is duplicated;
14. the chapter ends when the Player physically acquires the encoded chronicle.

> **Zrób git commit i push do main, rebase jeżeli trzeba**