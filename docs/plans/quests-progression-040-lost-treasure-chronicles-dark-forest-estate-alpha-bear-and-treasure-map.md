# Plan: Lost Treasure Chronicles — dark-forest estate, alpha bear and treasure map

**Created:** 2026-09-15  
**Status:** `planned` 📋  
**Priority:** high · **Effort:** L  
**Depends on:** quests-progression-039, ~~quests-progression-009~~, ~~quests-progression-036~~, ~~fauna-022~~  
**Domain:** `quests-progression`  
**Type:** `feature`  
**Subdomains:** `quests` `progression`  
**Tags:** `lost-treasure-chronicles` `dark-forest` `estate` `alpha-bear` `treasure-map` `world-location`  
**Roadmap:** `quests-lost-something-chronicles.md`

## Goal

Implement the fourth chapter of **Lost Treasure Chronicles**:

```text
decoded chronicle
→ bounded dark-forest search area
→ locate old estate
→ real one-off alpha bear creates environmental danger
→ investigate estate
→ recover one physical treasure map
→ map carries the clue for the next expedition stage
```

The estate, bear and map must exist independently of quest activation.

The Player may:

- discover the estate early,
- encounter or kill the bear early,
- avoid the bear completely,
- recover the map before formally receiving the clue.

The quest observes authoritative world state and catches up.

---

# 1. `quests-progression-009` is superseded narratively

This plan makes an explicit compatibility decision.

`quests-progression-009-dark-forest-ruins-treasure-map` is **superseded as an independent authored quest**.

Its valuable world content and infrastructure are reused by Lost Treasure Chronicles.

Do not maintain two separate authored narratives around:

```text
deepForest
+ large ruins
+ dangerous fauna
+ treasure map
+ treasure container
```

The old Piotr quest binding should be removed, retired or otherwise made unavailable as an independent quest.

Its world systems remain useful.

---

# 2. Reuse the existing `009` world site

Reuse the existing deterministic dark-forest site as the Lost Treasure Chronicles estate.

Preserve, where still appropriate:

- deterministic placement resolver,
- stable site ID,
- stable `WorldLocation`,
- larger ruins landmark,
- world-generated container infrastructure,
- authored one-time pickup infrastructure,
- early discovery semantics,
- early loot semantics,
- persistence contracts.

Do **not** create a second dark-forest estate.

Target invariant:

```text
one estate
one story map
one authoritative map source
one authored alpha bear
```

---

# 3. Estate narrative identity

The existing larger ruins become the remains of the old estate/manor described by the decoded chronicle.

Narrative identity:

```text
former estate / manor
→ partially ruined
→ abandoned
→ reclaimed by forest
→ linked to the old expedition
→ treasure map was deliberately left there
```

Do not require a fully modelled mansion.

The existing ruins may be sufficient with small additions such as:

- estate-specific props,
- wall/foundation remnants,
- abandoned storage,
- heraldic/owner marker.

Only add new geometry/layout where the current larger ruins cannot plausibly communicate former estate/manor.

Environmental confirmation is optional; do not require another major journal or dedicated evidence item solely to prove that this is the estate.

Avoid a dedicated estate renderer.

---

# 4. Stable world identity

The estate remains a normal world feature:

```text
world seed
→ existing dark-forest site resolver
→ stable site/location id
→ landmark
→ world location
```

Quest activation does not create it.

Plan 039 reveals only a bounded search region that leads toward this already-existing site.

Do not persist quest-only coordinates.

---

# 5. Search-area → discovery flow

Desired progression:

```text
known dark-forest search region
→ exploration
→ estate becomes discoverable
→ ordinary WorldLocation discovery
```

Do not reveal the treasure map's exact position from the start.

The search clue may reference:

- road,
- river,
- forest edge,
- nearby landmark,
- approximate direction/distance.

Reuse normal world-location/navigation knowledge.

---

# 6. Alpha bear

The estate is associated with one exceptional **alpha bear**.

This is not:

```text
QuestBoss
QuestBear
ScriptedEncounter
```

It is an ordinary fauna animal with:

```ts
kind: 'bear'
variant: 'alpha'
```

Reuse the existing fauna-owned individual variant system.

Do not add a new `AnimalKind`.

---

# 7. One-off authored alpha individual

The alpha bear is a **specific authored individual**, not a recurring habitat role.

Desired contract:

```text
estate site
→ stable authored fauna occupant
→ bear
→ variant alpha
→ one individual
```

The same world seed should bind the same stable individual.

The bear's stable story identity must not depend only on an ephemeral runtime spawn slot if current fauna persistence cannot preserve that slot across rebuild/save boundaries.

After that alpha bear dies:

```text
specific alpha bear remains dead
```

Do not spawn a replacement alpha bear.

The surrounding habitat may still later contain ordinary bears according to normal fauna population/repopulation rules.

This distinction is intentional:

```text
authored alpha individual
≠
generic bear population slot
```

---

# 8. Fauna owns the bear

Fauna owns:

- stable animal identity,
- variant,
- HP,
- damage,
- scale,
- movement,
- hunger,
- roaming,
- combat,
- death,
- corpse,
- persistence/lifecycle.

The quest only observes world state.

Do not store:

```text
bearAlive
bearKilled
bearSpawned
```

inside Lost Treasure Chronicles progress.

---

# 9. Bear behaviour remains systemic

The bear may:

- roam around the estate area,
- leave the immediate ruins footprint,
- forage/hunt according to normal fauna rules,
- attack only through normal AI behaviour,
- die through ordinary combat or other real world causes.

The Player may:

- fight it,
- sneak around it,
- lure it away,
- wait for it to move,
- approach from another direction.

Map recovery must **not require killing it**.

No:

```text
kill alpha bear
→ unlock map
```

---

# 10. Early bear death

If the alpha bear dies before the Player receives the estate clue:

- it remains dead,
- the quest does not respawn it,
- the estate remains valid,
- the map remains recoverable.

Do not substitute another alpha animal merely to restore difficulty.

Normal unrelated wildlife may still occupy the surrounding region.

---

# 11. Alpha variant integration

Verify whether current alpha modifiers are sufficiently species-generic.

If current tuning is wolf-centric, extend the existing variant system cleanly.

Prefer:

```text
AnimalKind base stats
+
AnimalVariant modifiers
→ final individual stats
```

Do not add a quest-only:

```text
ALPHA_BEAR_HP
ALPHA_BEAR_DAMAGE
```

table unless the fauna variant architecture itself already supports species-specific modifier profiles.

---

# 12. Existing `009` wolf dens

The old site-specific authored `wolfDen` content from `009` is **removed by default** during takeover.

The estate's intentional authored danger becomes the one-off alpha bear.

Ordinary wolves may still appear through normal regional fauna/habitat simulation if the environment naturally supports them.

Only retain any `009` authored den if implementation recon proves that removing it would break a reusable ecosystem/world contract rather than merely reduce an old quest encounter.

Do not intentionally stack:

```text
alpha bear
+
2–3 authored wolf dens
```

at the estate.

Target direction:

```text
one authored alpha bear
+
normal regional fauna
```

---

# 13. One physical treasure map

There is exactly one Lost Treasure Chronicles treasure map.

Reuse existing physical treasure-map infrastructure where practical, but do not preserve misleading semantics merely for naming compatibility.

If the existing `treasure_map_dark_forest` kind/metadata still semantically means "map leading to the dark-forest ruins", rename/refactor it consistently or introduce the correctly named story-map kind while migrating existing ownership state.

The map must have:

- one stable physical identity/source,
- ordinary inventory ownership,
- persistence,
- readable/use action.

Do not mirror map possession in quest-local state.

---

# 14. Reverse the old `009` map semantics

Current `009` semantics are effectively:

```text
map
→ reveals dark-forest ruins
```

Lost Treasure Chronicles requires:

```text
chronicle clue
→ reveals/searches for estate
→ estate contains map
→ map leads toward later expedition
```

Therefore the existing map's old role must be changed.

After this plan:

> the Lost Treasure Chronicles map does **not** reveal the estate that contains it.

Remove or refactor any old item metadata/action that still points the story map back to `DARK_FOREST_TREASURE_LOCATION_ID`.

---

# 15. Map source

The map exists physically at the estate before quest activation.

Use one authoritative persistent source.

Preferred reuse:

- existing one-time authored world pickup from plans 009/036,
- or existing world-generated container if that better matches final estate layout.

Choose one source.

Do not leave:

```text
old map pickup
+
new map container copy
```

simultaneously active.

Target invariant:

```text
one map
→ one physical source
→ one stable consumed/depleted state
```

---

# 16. `quests-progression-036` reuse

Plan 036 already establishes persistence for authored one-time pickup identity.

Reuse that contract if the treasure map remains a one-time world pickup.

Do not reintroduce runtime-only:

```text
respawnTime = Infinity
```

as the sole persistence mechanism.

Consumed authored pickup identity remains authoritative.

---

# 17. Existing chest loot

The existing `009` chest containing coins + ruby may remain as incidental estate loot.

This is acceptable because it is not the final Lost Treasure Chronicles treasure.

Desired semantics:

```text
estate
├─ story map
└─ incidental valuables
   ├─ coins
   └─ ruby
```

Do not duplicate the same valuables through quest completion rewards.

If implementation simplification makes the existing chest unnecessary, it may be removed, but preserve generic world-generated-container infrastructure.

---

# 18. Old `009` quest binding

Remove/supersede the old Piotr-authored quest flow that:

- tells the Player about the old map,
- requires reading the map before reaching the ruins,
- treats the ruins as the map's destination.

After this plan there should not be an independently offerable quest whose story contradicts Lost Treasure Chronicles.

Do not preserve it for backward narrative compatibility if doing so creates two incompatible meanings for the same site/map.

---

# 19. Old-save compatibility policy

Use an explicit policy rather than attempting to convert an old `009` run into the middle of the new Lost Treasure Chronicles chain.

## Old `009` offered / active / ready-to-report

Retire the old quest binding.

Do **not** migrate it into a partially completed plan-040 quest.

Preserve all authoritative world state that already happened.

## Old `009` complete

Keep the historical completed record as needed for save compatibility, but do not re-offer or replay the retired narrative.

Preserve all world/item/location facts produced by that playthrough.

## Existing world facts

Always preserve where present:

- estate/ruins discovery,
- chest depletion / prior loot,
- owned treasure map,
- consumed authored map pickup,
- location knowledge,
- fauna mutations that remain valid under the final takeover.

Do not reset real world state just because the story binding changed.

Core migration rule:

```text
old 009 quest → retire, no mid-quest narrative migration
old world state → preserve
```

---

# 20. Archaeologist expedition support

Archaeologist support is optional scope.

Implement only if existing quest consequence/item-transfer seams make it trivial.

Possible support:

- coins,
- food,
- bandages,
- arrows,
- other existing expedition supplies.

Eligibility may derive from:

- archaeologist relation,
- previous integrity/trust consequences,
- ordinary settlement reputation.

Do not build a funding/debt/service subsystem for this plan.

If this adds significant scope, defer it.

It must never block progression.

---

# 21. Quest flow

Preferred chapter structure:

```text
Stage 1
receive/use decoded estate clue

Stage 2
locate/discover estate

Stage 3
recover physical treasure map

Stage 4
read map
→ confirm next expedition clue exists
→ complete
```

The alpha bear is not a quest objective.

---

# 22. Map reading boundary

This plan should **not bind the map to a concrete dungeon yet**.

The next plan needs recon against:

- existing caves/dungeons,
- quests-progression-026,
- quests-progression-027,
- collapsed-access requirements.

Therefore Stage 4 only establishes:

> the map contains actionable authored geographical information for the next expedition.

The exact dungeon `WorldLocation` is resolved/bound in the next plan.

Do not create a fake temporary dungeon marker here.

---

# 23. No kill objective

Explicitly do not add:

```text
kill_alpha_bear
clear_estate
kill_bear_before_looting
```

The authored objective is:

> recover the map.

The bear changes world difficulty, not quest progression rules.

---

# 24. Early discovery and early mutation

Handle at least:

- Player discovers estate before plan 039;
- Player discovers estate before this chapter activates;
- alpha bear dies early;
- map is recovered early;
- map is read early;
- existing `009` chest is looted early.

Later story progress must catch up.

Do not:

- respawn bear,
- respawn map,
- refill container,
- require rediscovery,
- create replacement quest objects.

---

# 25. Map ownership catch-up

If Player already owns the exact map when this chapter becomes active:

```text
estate discovery/recovery steps
→ catch up from authoritative ownership
→ proceed to map-read completion
```

Do not require returning it to the estate.

---

# 26. State ownership

```text
dark-forest site resolver
→ estate identity and position

landmark / WorldLocation systems
→ estate representation

fauna
→ one-off alpha bear identity/state/lifecycle
→ ordinary surrounding wildlife

authored world pickup OR world-generated container
→ one authoritative map source

Inventory / item systems
→ physical map ownership

LocationKnowledge
→ estate/search-region discovery knowledge

QuestManager
→ narrative lifecycle only

ReputationManager
→ social consequences

world-generated container
→ incidental chest loot
```

No estate-specific state manager.

---

# 27. Persistence

Reuse existing persistence boundaries.

Save/load must preserve:

- consumed/depleted map source,
- physical map ownership,
- alpha bear death/lifecycle state,
- estate/chest mutable state,
- location knowledge,
- quest progress.

Do not:

- persist deterministic estate position unnecessarily,
- duplicate alpha bear after fauna rebuild,
- respawn map,
- restore old contradictory `009` quest state as a new offer.

---

# 28. Performance

Reuse existing bounded site resolver and stable IDs.

Do not add:

- loaded-chunk global scans,
- per-frame bear searches,
- per-frame container polling,
- quest-specific world search loops.

Use events and stable world-state predicates.

---

# 29. Reuse targets

Verify current `main`, especially:

- `docs/plans/quests-progression-009-dark-forest-ruins-treasure-map.md`;
- `docs/plans/implementation-notes/quests-progression-009-dark-forest-ruins-treasure-map-implementation-notes.md`;
- `docs/plans/quests-progression-036-one-shot-authored-treasure-map-pickup.md`;
- `docs/plans/quests-progression-039-lost-treasure-chronicles-chronicle-deciphering-and-specialist.md`;
- `src/world/locations/darkForestTreasureSite.ts`;
- `src/world/locations/darkForestTreasureSite.test.ts`;
- `src/items/authoredWorldPickups.ts`;
- `src/items/items.ts`;
- `src/items/itemCatalog.ts`;
- inventory item read/reveal pipeline;
- `src/fauna/animalVariants.ts`;
- fauna authored occupant/habitat/spawner code;
- `src/quests/quests.ts`;
- `src/quests/QuestManager.ts`;
- `src/app/worldBundle.ts`;
- `src/app/createApp.ts`;
- persistence/save-data code.

Current code overrides older assumptions.

---

# 30. Non-goals

Do not implement:

- exact dungeon binding,
- collapsed dungeon blockage,
- dungeon interior story,
- expedition remains,
- missing key,
- locked final passage,
- final treasure,
- land deed,
- property ownership,
- new boss framework,
- generic expedition funding system,
- new combat system,
- new fauna AI solely for this story.

---

# 31. Automated verification

Cover at least:

## `009` takeover

- no second equivalent dark-forest estate is created;
- old independent 009 quest is no longer offered as a contradictory storyline;
- existing dark-forest site identity remains stable;
- old persisted world state is not reset.

## Old-save compatibility

- old `009` offered/active/ready-to-report state is retired without mid-quest conversion;
- old `009` complete state does not replay;
- prior map ownership remains authoritative;
- prior consumed pickup remains consumed;
- prior site discovery remains authoritative;
- prior chest loot remains authoritative.

## Estate

- same world seed → same estate identity/position;
- estate exists without quest activation;
- plan 039 clue leads to bounded search, not exact map source.

## Alpha bear

- `kind === 'bear'`;
- `variant === 'alpha'`;
- stable authored individual identity survives the required persistence/rebuild boundaries;
- alpha is not spawned by quest activation;
- death persists;
- alpha does not respawn as another alpha;
- ordinary regional bears remain possible;
- map remains recoverable with bear alive or dead.

## Existing wolf dens

- authored 009 wolf dens are removed by default;
- normal regional wolf ecology still operates independently;
- no accidental stacking of obsolete 009 encounter content with alpha bear.

## Map

- exactly one story map source;
- no old map copy remains elsewhere;
- map no longer reveals the estate containing it;
- misleading old item metadata/name is migrated or refactored where necessary;
- source depletion persists;
- early pickup catches up;
- read action is idempotent;
- map reading does not yet require concrete dungeon binding.

## Chest

- incidental coins/ruby do not duplicate after restore;
- chest state survives the 009 narrative takeover.

Manual browser verification remains the User's responsibility.

---

# 32. Completion criteria

The plan is complete when:

1. `quests-progression-009` is superseded as an independent authored quest;
2. its dark-forest world site becomes the Lost Treasure Chronicles estate;
3. no second equivalent estate exists;
4. old active/offered 009 quests are retired without attempting mid-chain narrative conversion;
5. existing 009 world/item/location state is preserved;
6. old authored site-specific wolf dens are removed by default, leaving normal regional fauna;
7. one one-off fauna-owned alpha bear is bound to the estate with stable identity;
8. killing the bear is optional;
9. the alpha individual does not respawn after death;
10. ordinary regional wildlife remains systemic;
11. exactly one physical Lost Treasure Chronicles map exists;
12. the map no longer points back to the estate that contains it;
13. existing one-time pickup/container/location persistence is reused;
14. early estate discovery, bear death, map pickup/read and chest loot are respected;
15. the plan ends with the Player owning/reading the map while the exact dungeon binding remains for the next plan.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
