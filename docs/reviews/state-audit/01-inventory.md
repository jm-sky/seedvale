# State Documentation Audit — Stage 1: Inventory & Audit Matrix

**Date:** 2026-09-06
**Baseline:** `28c5dfd6cc79c61358d300649e66578265b7c6a7`
**Agent:** Claude Code — Sonnet 5
**Scope:** `docs/STATE.md`, `docs/state/*.md`, `docs/state/README.md`, `docs/architecture/*.md` (headings + targeted sections), `docs/items/{CATALOG,WEAPONS}.md`, `docs/CODE_INDEX.md`; full `src/` top-level domain listing (file counts + directory contents for `settlement/`, `ai/`, `items/`, `fauna/`, `economy/`, `simulation/`, `combat/`, `world/`); cross-domain import fan-out for `HealthState`, `Inventory`, `WaterSource`, `simulation/*` contracts, and the NPC-state modules physically located under `src/settlement/`.

This is a recon pass per the audit brief. No current-state documentation or gameplay code was changed.

---

## 1. Documentation inventory

| Doc | Lines | Language | Declared scope | Last verified |
|---|---|---|---|---|
| `docs/STATE.md` | 201 | en | "short, current snapshot... enough to start a plan" | 2026-09-04 |
| `docs/state/README.md` | 17 | en | index/scope-map for `docs/state/*.md` | — |
| `docs/state/settlements.md` | 125 | pl | "source of truth for settlement generation and NPC life as implemented" | 2026-08-25 |
| `docs/state/combat.md` | 100 | en | melee/ranged/critical/NPC-combat/animal-attack state machines | (per-section, no single stamp) |
| `docs/state/player-systems.md` | 128 | en | player survival/skills/busy-channels/camp-rest/wells/traps/planting/fishing/carry | (per-section) |
| `docs/state/terrain-and-world-generation.md` | 85 | en | chunk streaming, vegetation/rocks, trees, mountains, weather/seasons, slope | (per-section) |
| `docs/state/water.md` | 355 | pl | ocean/lakes/rivers: technical + visual state, decisions, **and fix history** | 2026-09-05 |
| `docs/architecture/ARCHITECTURE.md` | 222 | en | runtime composition, `WorldBundle`, dependency direction, save schema pointer | — |
| `docs/architecture/GRAPHICS.md` | 285 | en | shader/visual contracts | — |
| `docs/architecture/performance-and-workers.md` | 142 | en | worker/perf architecture | — |
| `docs/items/CATALOG.md` | 158 | en | per-`ItemKind` flags | — |
| `docs/items/WEAPONS.md` | 123 | en | weapon numbers | — |

No `docs/state/*.md` exists for **NPC AI/decision-making**, **fauna**, **persistence**, **quests**, or **runtime composition/UI/audio** — those domains are documented only as dense prose paragraphs inside `docs/STATE.md` itself (see §3).

## 2. Code inventory (top-level `src/` domains)

| Dir | `.ts`/`.tsx` files | Notes |
|---|---|---|
| `world/` | 157 | Largest domain. Mixes **terrain/hydrology/weather generation**, **player-built/placed world-object infrastructure** (wells, palisades, torches, sleeping utilities, traps, beehives, drying racks, gardens, containers, work contracts), and **locations/map/discovery** (`world/locations/`, `world/map/`). Three loosely-related concerns under one directory. |
| `settlement/` | 84 | Mixes **settlement generation/visuals/roads/houses** (`settlementGenerator`, `villagePlan*`, `houseBuilder`, `roadNetwork`, props), **household economy/storage** (`household`, `householdExchange`, `storageDestinations`, `landOwnership`, `lodging*`), and **NPC runtime state** (`npcState.ts`, `npcRelationships.ts`, `npcPhysicalProfile.ts`, `families.ts`) that is consumed almost exclusively by `ai/`, not by settlement-generation code. |
| `ai/` | 57 | NPC decision/behaviour core: `NpcAgent.ts` + needs/decision/strategies/logistics/professionWork/dialogue/schedule/socialBehaviour/weatherPressure/healingPressure/npcWorkContract/npcCombat/characters/nameCultures. Entirely undocumented as a domain in `docs/state/`. |
| `fauna/` | 46 | Predator/prey AI, spawners, corpse/decay, livestock production, riding, water traversal, habitats/roaming/rats, vocalization, threat perception. Entirely undocumented as a domain in `docs/state/`. |
| `items/` | 53 | Inventory/catalog/containers/liquid containers/trade/books/construction materials/food freshness. Reasonably matched by `player-systems.md` + `items/CATALOG.md` + `items/WEAPONS.md`, but `STATE.md` still duplicates large chunks of this in prose. |
| `terrain/` | 70 | Chunk streaming, vegetation, water sampling, resource deposits, slope. Matched by `terrain-and-world-generation.md`, but that doc is only 85 lines against 70 source files — likely too shallow relative to `STATE.md`'s own terrain prose. |
| `economy/` | 16 | Settlement bulk economy — no dedicated doc; covered thinly in `settlements.md`'s "Ekonomia" section and heavily in `STATE.md` prose. |
| `combat/` | 14 | Matched by `state/combat.md` — one of the better-aligned domains. |
| `simulation/` | 11 | Shared `PlannedAction`/`ActionLifecycle`/`DecisionContext` contracts, consumed by `ai`, `fauna`, `settlement`, `assets`. Documented only as a two-line bullet in `STATE.md`'s "Important shared concepts." |
| `persistence/` | 13 | Save schema owned canonically by `ARCHITECTURE.md`'s "Save schema" section, but `STATE.md`'s "Persistence" paragraph independently narrates the same migrations in prose (v1→v6 history) — duplication, not a pointer. |
| `player/` | 23 | Matched by `player-systems.md`. |
| `quests/` | 4 | Small; covered by one short `STATE.md` paragraph only. `ai/dialogue*.ts` (dialogue) lives in `ai/`, not `quests/` — a naming/ownership split worth flagging, not necessarily fixing. |
| `app/` | 36 | Composition root + player actions; matched by `CODE_INDEX.md`'s "Application composition"/"Player actions" sections and `ARCHITECTURE.md`. |
| `render/`, `scene/`, `audio/`, `ui/`, `ui-vue/`, `perf/` | 14/2/23/17/15/24 | Runtime composition/UI/audio — covered piecemeal across `STATE.md`'s "UI/input" section, `ARCHITECTURE.md`, `GRAPHICS.md`, `performance-and-workers.md`. No single current-state owner. |
| `navigation/`, `debug/`, `tools/`, `house-browser/`, `assets/`, `badges/`, `config/`, `input/`, `interaction/`, `math/`, `types/` | small | Developer tooling / small support domains, covered adequately by short `STATE.md` bullets ("Developer tooling" section) or not state-doc-worthy at current size. |

## 3. `docs/STATE.md` — the core problem

`STATE.md` declares itself a "short, current snapshot" that should not become "an implementation history... a detailed catalogue of every feature." In practice, its **"Settlements / NPCs"**, **"Fauna"**, and **"Items / player"** subsections are each multi-paragraph, plan-by-plan changelogs — naming specific plan IDs (`npc-018`, `fauna-016`, `settlements-npcs-014`, `items-player-017`, …), specific refactors, and dated internals, at a level of detail well beyond "concise snapshot." The "Settlements / NPCs" section alone is longer than all of `docs/state/settlements.md`.

This is exactly the failure mode the audit brief calls "implementation-history leakage," and it is the proximate cause of the two other big gaps below: NPC AI and fauna never got their own `docs/state/*.md` files, so every new plan's landing note was appended to `STATE.md` instead — where it accumulated for months to its 25 KB/~35k-token current size (this file alone consumed the full single-page-read budget of the audit tool). `docs/state/water.md` shows the same pattern in miniature via its own "Historia poprawek" (fix history) section, and `settlements.md` explicitly claims to own "NPC life ... as implemented" but its own "NPC" section is ~12 lines — the substance lives in `STATE.md` instead.

`docs/state/README.md`'s auto-generated "Covers" column is empty (`-`/`—`) for exactly the two domain docs with the deepest scope mismatch (`settlements.md`, `water.md`) — the generator apparently can't extract a description from documents this discursive, which is itself a symptom of the same issue.

## 4. Audit matrix

| Area | Current docs | Code roots | Integrations (discovered) | Audit artifact | Recommended model |
|---|---|---|---|---|---|
| World / terrain / hydrology / weather | `state/terrain-and-world-generation.md`, `state/water.md`, `STATE.md` §World/terrain, `architecture/GRAPHICS.md` (visual contracts) | `src/terrain/`, `src/world/{weather,dayNight,clouds,groundFog,foliageWind,createOcean,createWater,createRiverWater,riverGeometry,riverWaterMaterial,waterMaterial,waterMirror,parseSeed,seedLibrary,WaterSource.ts,caves/,map/,locations/}` | terrain↔settlements (site placement), terrain↔fauna (habitat/spawn/water traversal), weather↔NPC decisions (`weatherPressure`), weather↔garden hydration, `WaterSource`↔items/player/NPC drinking-filling | `02-world-terrain-water.md` | Sonnet |
| Player-built world objects & construction (buildables) | Split: `STATE.md` §Items/player + §Settlements/NPCs (work contracts), `state/player-systems.md` (wells/torches/traps/planting) | `src/world/{playerWell*,standingTorch*,palisade*,sleepingUtilities*,createTerrainPreparations,terrainPreparation*,workContract*,createWorkContracts,animalTraps,beehives,dryingRacks,createPlayerGardens,playerGarden,cropLifecycle,containerProp}`, `src/items/constructionMaterials.ts`, `src/app/actions/{placementActions,workContractActions,groundActions}` | player↔NPC (work-contract hiring shares the same buildable "contribute work" seam), items↔construction materials, settlements (notice board posting) | fold into `06-player-items.md` (below); flag the shared buildable/work-contract mechanism explicitly in `20-cross-domain-integrations.md` | Sonnet, cross-domain seam reviewed at Opus stage |
| Settlements generation, households, economy | `state/settlements.md` (thin relative to code+`STATE.md` prose), `STATE.md` §Settlements/NPCs (mostly NPC-AI content, see below) | `src/settlement/{settlementGenerator,villagePlan*,createSettlement,SettlementsManager,houseBuilder,houseCatalog,houseDoors,families,household*,landOwnership,landPurchase,lodging*,places,props*,decorProps,roadNetwork,storageDestinations,storageVisuals,villageClearing,wellInteractionQueue,findSettlementSite,minorLocations,merchantWagon,settlementNightCycle,settlementPalisade,settlementPlanCache,settlementSignposts,settlementStructures,settlementTerrain,settlementPropColliders,rats,livestock,hiddenTreasure,gardenScale,frameYield,campfireProps,PlacedFires,VillageFire}`, `src/economy/*` | settlements↔NPC (household ownership of NPCs), settlements↔economy, settlements↔fauna (livestock/rats spawn+population), settlements↔items (storage destinations) | `03-settlements-economy.md` | Sonnet |
| NPC behaviour / decisions / work / relationships | **None.** Only `STATE.md` §Settlements/NPCs prose + `CODE_INDEX.md`'s "NPC AI internals" note + `docs/reviews/2026-09-03--NpcAgent-refactor-review.md` | `src/ai/*` (57 files), plus `src/settlement/{npcState.ts,npcRelationships.ts,npcPhysicalProfile.ts}` (physically misplaced — consumed almost exclusively by `ai/`, per import-fanout check) | NPC↔household (economy pull/push), NPC↔settlement (schedule/social places), NPC↔fauna (combat, hunting, threat), NPC↔items (inventory, carried claims), NPC↔work-contracts (buildables), NPC↔quests (relations/dialogue) | `04-npc.md` | **Opus** — largest undocumented domain, highest churn (most recent commits), and the one most likely to need real architectural judgment about where the eventual doc boundary sits relative to `settlements.md`/`combat.md` |
| Fauna / ecosystem | **None.** Only `STATE.md` §Fauna prose | `src/fauna/*` (46 files) | fauna↔terrain (habitat/spawn/water traversal), fauna↔NPC (hunting, threat perception, combat), fauna↔settlements (livestock, rats, avoidance), fauna↔combat | `05-fauna.md` | Sonnet |
| Player / items / world-objects / survival | `state/player-systems.md`, `items/CATALOG.md`, `items/WEAPONS.md`, `STATE.md` §Items/player (large overlap) | `src/items/*` (53), `src/player/*` (23), player-built world-object files (see row above) | items↔player/NPC/household/economy (shared `Inventory`), items↔construction, player↔fauna (riding/mounts), player↔world (WaterSource) | `06-player-items.md` | Sonnet |
| Combat (player/NPC/fauna) | `state/combat.md` — best-aligned domain doc currently | `src/combat/*` (14), `src/ai/npcCombat.ts`, `src/fauna/faunaCombat.ts`, `src/ai/healingPressure.ts` | combat↔NPC (phase/loadout), combat↔fauna (attack/defense), combat↔player (melee/ranged), combat↔items (weapons) | `07-combat.md` | Sonnet (light — mostly currency-check, e.g. confirm `npc-002` healing is reflected) |
| Persistence & authoritative runtime state | `architecture/ARCHITECTURE.md` §Save schema (canonical field list) + `STATE.md` §Persistence (duplicate prose narrating the same migration history) | `src/persistence/*` (13) | persistence touches every domain's authoritative state (NPC/household/economy/livestock/work-contracts/buildables) by construction | `08-persistence.md` | **Opus** — inherently cross-domain (what's authoritative vs. derived across every other domain), best done after domain audits 02–07 feed it real findings rather than as a first pass |
| Quests / dialogue / progression | `STATE.md` short paragraph only | `src/quests/*` (4), `src/ai/dialogue*.ts` | quests↔fauna (bound world-problem targets), quests↔NPC (relations/dialogue), quests↔player (EXP/relation gates) | Merge into `04-npc.md`'s scope (dialogue lives in `ai/`) rather than a standalone artifact — too small to justify its own pass | — (covered by NPC audit) |
| Runtime composition / UI / audio | `STATE.md` §UI/input, `architecture/ARCHITECTURE.md`, `GRAPHICS.md`, `performance-and-workers.md` | `src/app/*` (36), `src/render/`, `src/scene/`, `src/audio/`, `src/ui/`, `src/ui-vue/`, `src/perf/` | UI↔every gameplay domain (thin facade layer, by design) | `09-runtime-ui-audio.md` — **only if Stage 1 review agrees it's worth a pass**; current architecture docs already track composition reasonably well | Sonnet, low priority |

## 5. Cross-domain fan-out evidence (spot-checked shared mechanisms)

| Mechanism | Owner | Confirmed consumers |
|---|---|---|
| `shared/HealthState` | shared | `ai`, `app/actions`, `fauna`, `player`, `settlement` |
| `items/Inventory` | items | `ai`, `app`, `economy`, `fauna`, `persistence`, `quests`, `settlement`, `terrain`, `world` |
| `world/WaterSource` | world | `app`, `app/actions`, `interaction`, `items`, `terrain` |
| `simulation/*` (PlannedAction/ActionLifecycle/DecisionContext) | simulation | `ai`, `assets`, `fauna`, `settlement` |

`Inventory`/`ItemKind` is confirmed as the single most cross-cutting mechanism in the codebase (9 of ~30 top-level domains import it directly) — `STATE.md`'s existing "Important shared concepts" list already calls this out correctly; it's one of the few places `STATE.md`'s prose length is actually justified.

## 6. Integration seams discovered (feed into Stage 3)

| Producer / owner | Consumer(s) | Mechanism | Documentation |
|---|---|---|---|
| `world/workContract.ts` + per-object `contributeWork` seams (`playerWell`, `terrainPreparation`, `palisade`, `standingTorch`) | `ai/NpcAgent.ts` (`pursueAcceptedContract`), player actions | shared "clamp to remaining, credit only accepted work" buildable contract | described only in `STATE.md` prose, split across §Settlements/NPCs and §Items/player |
| `ai/*` (NpcAgent, needs, strategies, decision) | none — this is the seam itself | NPC decision core | **undocumented as a domain** |
| `settlement/npcState.ts` / `npcRelationships.ts` / `npcPhysicalProfile.ts` | `ai/` (near-exclusively) | NPC authoritative runtime state physically hosted outside its consumer's directory | ownership boundary unclear in docs (`settlements.md` claims "NPC life", code says `ai/`) |
| `economy/localExchange.ts` claim seam | `ai/npcLogistics.ts`, `settlement/householdExchange.ts` | atomic surplus claim, revalidated live | `STATE.md` prose only |
| `world/grassForage.ts` / `GrassForageService` | `fauna/AnimalAgent.ts` (wild + livestock) | shared virtual forage grid | `STATE.md` §Fauna prose only |
| `terrain/waterSample.ts` (`sampleLocalWater`) | `fauna/waterTraversal.ts`, `world/riverNetwork.ts` | single physical water-presence answer | `STATE.md` §Fauna prose only; not in `terrain-and-world-generation.md` or `water.md` |
| `simulation/{actionLifecycle,scoreActions,types}` | `ai/`, `fauna/faunaDecision.ts` | shared decision/priority-scan contract (`decideFaunaBehaviour`, `decideNpcAction` both built on it) | two-line bullet in `STATE.md`, no worked example |
| `persistence/saveData.ts` (`CURRENT_SAVE_VERSION`, migrations) | every domain with `SaveData` fields | schema/migration authority | canonical in `ARCHITECTURE.md`, **duplicated** narratively in `STATE.md` |

Only seams that looked materially load-bearing (touch ownership, invariants, or would trip up a future plan) are listed; this is not an exhaustive dependency graph, per the brief's "documentation significance" rule.

## 7. Documentation boundary problems (feeds Stage 4)

1. **`STATE.md` is not concise.** Its Settlements/NPCs, Fauna, and Items/player sections are implementation-history changelogs, not snapshots. This is the single highest-value fix and the direct cause of #2–#3.
2. **No `docs/state/npc-ai.md`** despite `ai/` being a 57-file, high-churn domain with zero dedicated current-state doc.
3. **No `docs/state/fauna.md`** despite `fauna/` being a 46-file domain in the same situation.
4. **`settlements.md` over-claims scope** ("NPC life ... as implemented") relative to what it actually documents (~12 lines on NPC), and is written in Polish while three of five sibling `state/` docs are English — a smaller but real consistency gap.
5. **`water.md` contains a "Historia poprawek" section** — explicit implementation-history content inside a current-state document, against the brief's own rule for `docs/state/*.md`.
6. **`persistence/` has no dedicated doc**; `ARCHITECTURE.md`'s "Save schema" section is canonical per its own text, but `STATE.md` independently re-narrates the v1→v6 migration history — duplication rather than a pointer.
7. **Directory-vs-domain mismatch** in `src/settlement/` (settlement generation + household economy + NPC runtime state) and `src/world/` (terrain/hydrology generation + player-built object infrastructure + locations/map) means no single `docs/state/*.md` can cleanly mirror "one file per top-level `src/` dir" — Stage 2/4 should organize by actual domain, not by directory.
8. **`docs/state/README.md`'s generated "Covers" column is blank for exactly the two most bloated docs** (`settlements.md`, `water.md`), so the index itself is silently incomplete for the two domains readers most need routing help for.

## 8. Recommended Stage 2 split

Relative to the audit brief's 9 candidate groups:

- **Keep, unchanged in scope:** world/terrain/water (1), combat (6, light pass).
- **Keep, but scope now evidence-backed:** settlements/economy (2) — narrow it to settlement generation + household/economy code; explicitly exclude the NPC-state files that live under `settlement/` but belong to the NPC audit.
- **Elevate to full audits (previously undocumented, now confirmed substantial):** NPC behaviour/work/relationships (3), fauna (4).
- **Merge:** quests/dialogue (8) into the NPC audit — 4 source files plus `ai/dialogue*.ts`, not enough surface for its own pass.
- **Keep as-is:** player/items/world-objects (5), including the buildable/work-contract infrastructure currently split across `STATE.md`'s two largest sections.
- **Keep, reduced urgency, run after 2–6:** persistence (7) — inherently a synthesis job over other domains' authoritative state; front-loading it before the domain audits exist would mean redoing it.
- **Optional/low-priority:** runtime/UI/audio (9) — architecture docs already track this reasonably; only worth a pass if Stage 1 reviewers want ARCHITECTURE.md's currency double-checked.

Concrete Stage 2 artifact list:

```text
docs/reviews/state-audit/
  02-world-terrain-water.md        Sonnet
  03-settlements-economy.md        Sonnet
  04-npc.md                        Opus   (undocumented domain, highest churn, needs judgment on doc boundary vs. settlements/combat)
  05-fauna.md                      Sonnet
  06-player-items.md               Sonnet (covers buildables/work-contract infra too)
  07-combat.md                     Sonnet (light — currency check against npc-002 healing)
  08-persistence.md                Opus   (run after 02–06/07 land; cross-domain synthesis, not a first pass)
  09-runtime-ui-audio.md           Sonnet (optional — confirm need before running)
  20-cross-domain-integrations.md  Opus   (per brief, after all domain passes)
```

`01-quests-dialogue.md` and a `10-` numbered slot are deliberately **not** created — quests/dialogue is folded into `04-npc.md`'s scope instead.

## 9. Open questions

- Should `04-npc.md` also take ownership of writing the eventual `docs/state/npc-ai.md`, or should the reconciliation stage (4) decide whether NPC content stays folded into an expanded `settlements.md`? Recommend deciding this in Stage 4, once the NPC audit shows how much genuinely load-bearing content there is (my guess from `STATE.md`'s current volume: enough to justify its own file, but Stage 4 should confirm rather than assume).
- Should the player-built/placed world-object infrastructure (wells, torches, palisades, sleeping utilities, work contracts) get its own `docs/state/world-objects.md`, or stay folded into `player-systems.md` as today? Left to the `06-player-items.md` audit to recommend, since it also depends on how much of it Stage 3's cross-domain pass ends up needing to reference from the NPC side.
- Is `persistence` substantial enough to warrant its own `docs/state/persistence.md`, or should its content stay a short pointer to `ARCHITECTURE.md`'s "Save schema" section plus a trimmed `STATE.md` paragraph? Recommend the latter unless `08-persistence.md` finds persistence-specific invariants (not just a field list) that don't fit `ARCHITECTURE.md`'s scope.
- Runtime/UI/audio (9): worth confirming with the user whether this pass is wanted at all before scheduling it, given the existing architecture docs already look reasonably current from this recon.
