# Plans — Current Planning Map

Implementation plans. This file is the **current planning map**: backlog, dependencies, active threads and verification queue. Detailed implementation lives in the plan files; history lives in [archive/](./archive/README.md). New plans stay in this folder regardless of status.

Status: `in progress` 🔄 · `verification needed` 🔍 · `planned` 📋 · `todo` ⬜ · `done` ✅
Priority: 🔴 high · 🟡 medium · ⚪ low
Effort: `XS` minuty · `S` ~15–30 min · `M` ~30–90 min · `L` ~1–3 h · `XL` kilka sesji
Verification: unless a row says otherwise, it has passed `tsc`/lint/build/test but has **not** been manually browser-tested — check the plan's own `Status:` header for detail. `Summary` below is trimmed to what matters for planning a *new* plan (key decisions, reuse vs new systems, explicit scope exclusions); full implementation detail lives in each plan's `*-implementation-notes.md`.

**Depends on** = implementation prerequisites (plan IDs). ~~done~~ is crossed out. A plan is ready when every dependency is struck. Thematic overlap is not a dependency.

Paths below are files in this folder unless noted. Implementation notes / reviews stay next to the plan (`*-implementation-notes.md`, `*-review.md`) and are not indexed separately.

## Plan naming

New plans use the following filename format:

`<domain>-<id>-<title>.md`

Examples:

- `world-terrain-001-natural-mountains-and-rivers.md`
- `settlements-npcs-001-household-economy.md`
- `fauna-001-animal-attack-and-npc-defense.md`
- `items-player-001-inventory-item-instances.md`
- `quests-progression-001-world-problems-and-reputation.md`
- `persistence-001-save-state.md`
- `ui-input-001-mobile-input-improvements.md`

The `<id>` is a three-digit number local to the domain. New plans do not use the old global numeric sequence.

## Plan domains

New plans should declare a primary `domain:` in frontmatter. If a plan genuinely spans more than one area, use optional `tags:` for the secondary domain(s).

Canonical domains match [docs/STATE.md](../STATE.md)'s section headers, so a domain always maps onto exactly one part of the current-state doc:

| Domain | Covers |
|---|---|
| `world-terrain` | Procedural terrain, chunk streaming, ocean, environment/landmarks |
| `settlements-npcs` | Villages, NPC needs/FSM/schedule, dialogue, household/settlement economy |
| `fauna` | Wildlife needs, predator/prey, herds |
| `items-player` | Inventory, held tools, player survival needs, world items (dropped items, fires, tents) |
| `quests-progression` | `QuestManager`, relations, EXP |
| `persistence` | `SaveData` schema, IndexedDB, config persistence |
| `ui-input` | Vanilla + Vue UI, input, HUD |

`domain` is "where to look first" — pick one, even for a plan that touches several systems. Use `tags` for a second domain only when the plan is genuinely about both (e.g. a quest wired to a specific fauna mechanic is `domain: quests-progression`, `tags: [fauna]`). Don't tag every domain a plan happens to touch a file in.

## Domain-local IDs

The numeric ID is unique within its domain, not globally.

For example:

- `world-terrain-001-*`
- `world-terrain-002-*`
- `fauna-001-*`
- `fauna-002-*`

`world-terrain-002` and `fauna-002` are therefore two different plan IDs.

Plan dependencies use the complete domain-local ID for new plans, for example:

`Depends on: ~~world-terrain-001~~ ~~fauna-002~~`

IDs are never reused within a domain, even after a plan is archived.

Existing plans keep the historical date-based/global-ID naming scheme. They are **not renamed solely to adopt the new convention**. Their existing numeric IDs remain valid references. All newly created plans use the domain-local naming scheme.

## Next plan IDs

Next IDs are tracked separately for each canonical domain. Until the first new plan is created in a domain, its next ID is `001`.

- ai: `003`
- fauna: `001`
- items-player: `001`
- npc: `002`
- persistence: `001`
- quests-progression: `001`
- settlements: `001`
- settlements-npcs: `001`
- tools: `003`
- ui-input: `003`
- world: `001`
- world-terrain: `003`

This ids section is maintained automatically from the plan files.

Next ideas backlog is in [docs/plans/NEXT-IDEAS.md](./NEXT-IDEAS.md). Loose ends (blockers/spun-off ideas found mid-plan) are in [docs/plans/LOOSE-ENDS.md](./LOOSE-ENDS.md).

---

## Active threads

High-level map of how the current backlog chains together. Not a replacement for the `Depends on` column — a quick orientation for where a new plan would slot in. Only current/still-relevant chains; entries in parens are done — either kept as [Recent context](#recent-context) or already moved to [archive/](./archive/README.md).

```text
Combat & weapons
  (155 inventory instances) → (160 HQ melee) → (161 weapon maintenance, verification needed)
  (150 combat mode) + (155) → (162 bows/ranged, verification needed) → (177 NPC combat melee+ranged, verification needed — no live AI trigger yet) → 179 animal attack & NPC defense [verification needed]

Household economy & storage
  (106 food/cooking) + (069 household resources) + (122 water distribution) → (156 storage logistics)
      → 152 NPC food/drink help
      → 159 fishing/preservation/bait
  (122) → 126 seed planting, (127 player-built well, verification needed)

World-driven quests
  (049 landmarks, archived) + 093 quests-v3 (in progress) + (110 quests-v3 closure) → 132 landmark quests [verification needed]

Rendering performance
  (157 PointLight budget 16, archived) → 149 shader program first-use hitch [in progress]

Construction & lodging
  (109 megakit catalog) → 111 house construction [verification needed — assembly bug from playtest]
      → 169 house interior furniture/bed anchors
  (165 vigor/hunger/thirst/rest, verification needed) → 168 settlement lodging/sleep → 169 house interior furniture/bed anchors

NPC diagnostics
  170 NPC simulation inspector/trace observes needs + decisions + actions + interaction queues across the existing NPC systems

Natural vegetation
  (140 landscape flora) → (172 natural crop lifecycle, verification needed) → (126 seed planting, verification needed)
```

---

## In progress

| File | Summary | Pri | Effort | Depends |
|------|---------|-----|--------|---------|
| `2026-08-13--093--quests-v3-world-problems-reputation.md` | Questy z problemów świata + reputacja; Etap A–G (relation levels, availability, effects, 4 world-problem questy end-to-end) zaimplementowane; lifecycle/identity gaps domknięte przez plan `110`. Etap H (drzewa/kopanie) i bandyci otwarte | 🔴 | XL | ~~015~~ ~~018~~ |
| `2026-08-17--149--shader-program-first-use-hitch.md` | Phase 0 closed; Phase 1 B production PointLight budget **16** landed in ~~157~~. Phase 1 A (`compileAsync` loading-window prewarm) **implemented + real-GPU verified** ([review 025](../reviews/2026-08-19--025--plan-149-phase-1a-compileasync-prewarm.md)). Phase C leftover: `Green` / `MI_WindowGlass` / `Wood`. Plan not `done`. | 🔴 | M/L | — |
| `2026-08-21--181--natural-mountains-and-rivers.md` | Etap 1–6: mountain tuning + pure D8 drainage prototype + river network as fixed 256m tiles with a halo (chunk-boundary-continuous ribbon geometry, own lightweight water material reusing `waterMaterial.ts`'s day/night uniforms unmodified) — rivers now render in the world. Etap 7 (meanders, waterfalls, full shader/rendering parity, worker offload) explicitly deferred | 🔴 | M | - |
| `2026-08-16--126--seed-planting.md` | Sadzenie nasion drzew (`tree_seed`, species z lokalnej przydatności siedliska) i cropów (`seed_carrot`/`seed_potato`/`seed_cabbage`, tylko przy ogródku osady) przez gracza — Quick Actions, `evaluateGroundPlacement` + krótki busy channel; drzewo wchodzi w istniejący `TreeLifecycle` jako `sapling` zakotwiczony w momencie sadzenia (`TreeLifecycle.setOverride`, nowa metoda), crop korzysta z `CropLifecycle` (plan 172) bez zmian. `SaveData` v25 (`plantedTrees`/`plantedCrops`). Technical verification green (`tsc`/lint/build/test, 1514 tests); no browser/gameplay verification yet | 🟡 | L | ~~106~~ ~~122~~ |

---

## Planned

| File | Summary | Pri | Effort | Depends |
|------|---------|-----|--------|---------|
| `2026-08-20--176--garden-and-field-maintenance.md` | Wspólny mechanizm utrzymania grządek/pól | 🟡 | M | ~~174~~ ~~126~~ |
| `2026-08-19--169--house-interior-furniture-and-bed-anchors.md` | Wyposażenie domów w meble; łóżko dostarcza miejsce noclegu dla planu 168 | 🟡 | L | ~~168~~ ~~111~~ |
| `2026-08-18--151--social-places-and-social-behaviour.md` | Social Places v1: istniejący settlement campfire jako `PlaceType: 'social'`, NPC↔NPC `conversation` | 🟡 | M | ~~020~~ |
| `2026-08-18--152--npc-player-food-drink-help.md` | NPC dobrowolna pomoc graczowi jedzeniem/piciem z carried inventory | 🟡 | M | ~~106~~ ~~069~~ ~~122~~ ~~156~~ |
| `2026-08-19--167--npc-helper-resource-delivery.md` | NPC who gathers food for player | 🟡 | M | ~~164~~ |
| `2026-08-21--180--npc-healing.md` | NPC używa opatrunków w razie obrażeń | 🟡 | M | ~~177~~ |
| `2026-08-20--178--hunter-profession-and-household.md` | Profesja myśliwego + gospodarstwo  | 🟡 | L | ~~177~~ ~~162~~ ~~159~~ 175 |
| `2026-08-14--104--underground-caves.md` | Prawdziwe jaskinie podziemne (`CaveVolume`, siatka 500 m); wstępny, do review | 🟡 | XL | ~~097~~ |
| `2026-08-19--171--weapon-browser-observatory.md` | Weapon Browser w Observatory/Admin | 🟡 | M | - |
| `2026-08-21--191--mountain-peaks-and-massifs.md` | - | 🟡 | L | 181 |
| `2026-08-22--203--well-depth-groundwater-and-protection.md` |- | 🟡 | M | ~~127~~ |
| `ai-001-npc-pressure-layer.md` | - | 🔴 | M | - |
| `ai-002-npc-personality-decisions.md` | - | 🔴 | M | ~~ai-001~~ |
| `npc-001-npc-physical-stats-sex-and-age.md` | - | 🟡 | M | - |
| `tools-001-performance-benchmark-determinism-and-reliability.md` | - | 🔴 | M | - |
| `world-terrain-002-terrain-modification-and-land-preparation.md` | - | 🟡 | L | - |
| `ui-input-001-developer-debug-api.md` | - | 🔴 | M | - |
| `tools-002-trace-analyzer-application-cpu-attribution.md` | - | 🔴 | M | - |
| `ui-input-002-ui-ux-interaction-and-action-system-polish.md` | - | 🟡 | L | - |

### Fresh new

> Place for plans links


---

## Todo

| File | Summary | Pri | Effort | Depends |
|------|---------|-----|--------|---------|
| `2026-08-11--070--world-observatory.md` | Panel obserwacji życia świata | ⚪ | XL | 071 (archived, verification needed), ~~069~~ |
| `2026-08-08--037--npc-genealogy-lineages.md` | Rody NPC (kompas N → ~~067~~) | ⚪ | L | ~~022~~ ~~031~~ |

### Issues without plans

- Merchant UX / Handel:
  - Podczas handlu brakuje podglądu kupowanego przedmiotu. Nie wiemy, co kupujemy, jakie ma obrażenia, wagę itp.
  - Pewnie można dodać inne poprawki UX, szczególnie pod mobile.

---

## Verification needed

Implementation complete; needs play/browser check. Do not treat as normal backlog — a plan here is not "ready to build", it is "already built, waiting on confirmation" (or, for `111`, a known bug from a playtest that already happened). Status matches each plan's own `Status:` header, not just this table — when in doubt, open the plan.

| File | Notes | Pri | Effort | Depends |
|------|-------|-----|--------|---------|
| `world-terrain-001-clouds.md` | New `world/clouds.ts` (`createClouds`): bounded pool of 28 `THREE.Sprite` billboards from the existing `public/images/clouds/*.png`, XZ-follows the player, wind-drift wraps outside `camera.far` (no destroy/recreate). Weather-driven coverage/tint via pure `cloudAppearanceFor` (mirrors `weatherVisuals.ts`'s `applyWeatherOverlay`, lerped by `weather.intensity`), unit-tested in `clouds.test.ts`. New shared `assets/loadTexture.ts` cache (`loadGltf.ts`'s cache-the-promise pattern, adapted for `TextureLoader`). Owned/lifecycled next to `sky`/`weatherParticles` in `createApp.ts`/`gameLoop.ts`, not `WorldBundle`. `tsc`/lint/build/test green (1640 tests); no browser verification yet | 🟡 | M | - |
| `2026-08-20--179--animal-attack-and-npc-defense.md` | [implementation notes](./2026-08-20--179--animal-attack-and-npc-defense-implementation-notes.md) | 🔴 | M | ~~177~~ |
| `2026-08-21--184--item-capability-abstraction.md` | [implementation notes](./2026-08-21--184--item-capability-abstraction-implementation-notes.md) | 🟡 | M | - |
| `2026-08-14--111--house-construction.md` | **known bug from 2026-08-18 playtest** — [implementation notes](./2026-08-14--111--house-construction-implementation-notes.md) | 🔴 | XL | ~~109~~ |
| `2026-08-16--129--coins-and-land-sales.md` | | 🔴 | L | ~~093~~ |
| `2026-08-16--132--landmark-quests.md` | | 🟡 | M | ~~049~~ ~~093~~ ~~110~~ |
| `2026-08-19--170--npc-simulation-inspector-and-trace.md` | | 🔴 | L | - |
| `2026-08-18--159--natural-food-fishing-preservation-and-bait.md` | | 🟡 | M | ~~155~~ ~~156~~ ~~106~~ |
| `2026-08-18--161--weapon-maintenance-and-sharpening.md` | | 🟡 | M | ~~155~~ ~~160~~ |
| `2026-08-18--162--bows-arrows-ranged-combat-and-critical-hits.md` | | 🟡 | L | ~~150~~ ~~155~~ |
| `2026-08-19--165--vigor-hunger-thirst-and-rest.md` | | 🟡 | M | - |
| `2026-08-20--172--natural-crop-lifecycle.md` | | 🟡 | M | ~~140~~ |
| `2026-08-19--164--player-storage-and-container-system.md` | | 🔴 | M | - |
| `2026-08-21--183--slope-movement-constraint.md` | | 🟡 | S | - |
| `2026-08-20--177--npc-combat.md` | | 🔴 | M | ~~150~~ ~~162~~ |
| `2026-08-21--189--river-channel-carving.md` | [implementation notes](./2026-08-21--189--river-channel-carving-implementation-notes.md) | 🔴 | M | ~~181~~ |
| `2026-08-21--185--npc-role-based-carried-weapons.md` | [implementation notes](./2026-08-21--185--npc-role-based-carried-weapons-implementation-notes.md) | 🔴 | S | ~~177~~ ~~179~~ ~~184~~ |
| `2026-08-21--182--deep-forest-biome-and-forest-generation-overhaul.md` | [implementation notes](./2026-08-21--182--deep-forest-biome-and-forest-generation-overhaul-implementation-notes.md) | 🟡 | M | ~~063~~ |
| `2026-08-21--186--combat-and-player-interactions.md` | [implementation notes](./2026-08-21--186--combat-and-player-interactions-implementation-notes.md) | 🔴 | L | - |
| `2026-08-21--187--building-resources.md` | Resources/construction scope only (mountains split to `191` before implementation) — `beam` `ItemKind` + bonus yield on the felled→harvested tree-bucking step, `beam`/`branch` as shared campfire fuel, generic world-item construction material resolver (`items/constructionMaterials.ts`) wired into the player-built well. [implementation notes](./2026-08-21--187--building-resources-implementation-notes.md) | 🔴 | L | 181 ~~184~~ ~~111~~ |
| `2026-08-21--188--fauna-and-dead-animal-lifecycle.md` | Corpse decay & Bear | 🔴 | M | ~~138~~ ~~177~~ ~~179~~ |
| `2026-08-20--175--cooking-vessels-grates-and-iron-rods.md` | [implementation notes](./2026-08-20--175--cooking-vessels-grates-and-iron-rods-implementation-notes.md) | 🟡 | M | ~~106~~ |
| `2026-08-20--174--player-garden-and-npc-need-sources.md` | Player garden plot (single-stage, `constructionMaterials.ts` cost) widens `plantedCrops.ts`'s `isNearAnyGarden`; generic `NeedSource` resolver (`world/foodSources.ts`) lets a hungry NPC discover/select a real natural-food item or mature crop before falling back to the pre-existing abstract settlement-garden gather — thirst's well-source discovery was already done by plan 127, untouched here. No `HelperAI`/`GardenAI`/global registry/per-frame scan. [implementation notes](./2026-08-20--174--player-garden-and-npc-need-sources-implementation-notes.md) | 🟡 | L | ~~159~~ ~~172~~ ~~126~~ ~~127~~ |
| `2026-08-22--192--arch--time-and-simulation-consistency.md` | New stateless `world/timeConversion.ts` dedupes 5 inline `24/dayLengthSec` reimplementations; `PlayerNeeds.ts`'s hardcoded `480` (real bug — desynced from live `dayLengthSec`, unlike NPC `ai/Needs.ts` which was already correct) now derives from game-days via live `dayLengthSec`, tuning unchanged. Found but explicitly out of scope (logged to `LOOSE-ENDS.md`): NPC/fauna needs double-tick during a time-skip (live accelerated `worldDt` + `resolveTimeSkip` catch-up both apply). [implementation notes](./2026-08-22--192--arch--time-and-simulation-consistency-implementation-notes.md) | 🔴 | M | - |
| `2026-08-20--173--terrain-aware-procedural-placement.md` | Scope limited to `stoneCircle`/`cemetery` per implementation notes (houses/roads/fields deferred). Added `propUtils.ts` terrain-orientation helpers (`sampleLocalTerrain`/`applyTerrainTilt`/`rotateOffsetY`) reused by both; each stone/grave now samples its own exact world position instead of the whole landmark sitting at one shared height, with a clamped lean (20°/12°). `evaluateGroundPlacement()` untouched. New `CemeterySize` (`SM`/`MD`/`LG`) drives an actual block/row/column/aisle grid (`CEMETERY_LAYOUTS` in `decorProps.ts`), not a scale multiplier — rolled deterministically per chunk (`rollCemeterySize`, 50/35/15 weights) with size-specific chunk margins. [implementation notes](./2026-08-20--173--terrain-aware-procedural-placement-implementation-notes.md) | 🟡 | M | - |
| `2026-08-22--194--arch--entity-identity-lifecycle.md` | Audit-only (4 parallel sub-audits by entity family) + 2 small fixes. Entity Contract Map + P0–P3 findings in [implementation notes](./2026-08-22--194--arch--entity-identity-lifecycle-implementation-notes.md). Fixed now: `NpcAgent.resolveTimeSkip()` missing dead-NPC guard (teleported corpses on rest/wait), `createApp.ts`'s `rebuildWorld()` unconditionally teleporting the player to home spawn on any same-seed terrain rebuild (contradicted `ARCHITECTURE.md`'s documented survive-rebuild contract). Headline new finding (P0): NPC runtime state, including death, does not survive ordinary settlement unload/reload — a killed NPC is fully alive again on revisit, same session, no reload needed. Also new: quest-giver/relation identity is a non-unique name string (collision risk); mid-session rebuild can silently corrupt wild-fauna quest bindings; ore-deposit depletion resets on ordinary walk-away/return within its own streaming radius (farming exploit) and on any `rebuildWorldBundle` (confirms plan 193's unconfirmed finding). Follow-ups logged to `LOOSE-ENDS.md` | 🔴 | M | ~~193~~ |
| `2026-08-22--195--arch--data-state-consistency.md` | Focused data/state-consistency audit (5 parallel sub-audits); State Contract Matrix + P0–P3 findings. Fixed now: stale `BenchmarkHost.chunkManager` closure surviving a `WorldBundle` rebuild (accessor pattern), `worldConfig` terrain fallback pulling from a different world's localStorage cache instead of the hardcoded default for a field an older save predates (new `defaultTerrainConfig`), plus doc drift (save schema v25→v26 undocumented, `SettlementEconomy` wrongly documented as unsaved). Follow-ups logged to `LOOSE-ENDS.md`: `Household` stock not carried across an in-session rebuild (unlike `SettlementEconomy`), player starvation/dehydration duration timers not persisted, `NpcAgent` ore-gathering add/remove mismatch. Confirmed the already-tracked dropped-instance-item durability-loss finding still applies. [implementation notes](./2026-08-22--195--arch--data-state-consistency-implementation-notes.md) | 🔴 | M | ~~193~~ ~~194~~ |
| `2026-08-22--196--arch--time-skip-simulation-semantics.md` | Closes the plan-193 P0 finding: `gameLoop.ts` now gates `settlementsManager.update`/`fauna.update`/`placedTraps.update` behind `!timeSkip.isActive()` (fully frozen during a skip, no accelerated `worldDt`, player-needs' own scaled-`worldDt` contract untouched) instead of double-processing NPC needs/household/economy via both a live accelerated tick and `NpcAgent.resolveTimeSkip`'s replay. New minimal, non-full-simulation fauna catch-up (`AnimalAgent.resolveTimeSkip`/`Fauna.resolveTimeSkip`, one-shot `tickAnimalLife` + corpse `timeSinceDeath` bump) mirrors the existing NPC catch-up. [implementation notes](./2026-08-22--196--arch--time-skip-simulation-semantics-implementation-notes.md) | 🔴 | M | ~~192~~ ~~193~~ |
| `2026-08-22--197--arch--npc-runtime-state-lifecycle-continuity.md` | Closes plan 194's headline P0 finding: new `NpcStateRegistry` on `SettlementsManager` (mirrors `HouseholdRegistry`/`EconomyRegistry`) holds `health`/`stamina`/`vigor`/`needs` keyed by stable `npc.id`; `NpcAgent` now holds direct references into it instead of constructing fresh state, so HP/needs/vigor/stamina — including death — survive settlement unload/reload and `WorldBundle` rebuild (`snapshotNpcStates()`/`initialNpcStates`, mirrors `carriedEconomies`) instead of resetting every stream cycle. Also closes plan 195's `Household` rebuild-carry gap (same pattern, `snapshotHouseholds()`) and plan 193's death-propagation finding by decision, not a new hook — audit found no live consumer needing one; the one concrete consequence found (dialogue still opening on a dead NPC) is fixed directly (`interactables.ts` dead-NPC filter, same as combat's existing filter). [implementation notes](./2026-08-22--197--arch--npc-runtime-state-lifecycle-continuity-implementation-notes.md) | 🔴 | L | ~~194~~ ~~196~~ |
| `2026-08-22--198--arch--world-resource-state-continuity.md` | Closes plan 194's ore-deposit farming-exploit finding: new `ResourceDepletionState` (`Map<NaturalResource.id, remaining>`, `terrain/depositMining.ts`'s `resolveRemaining`/`recordMined`/`isDepleted`) replaces `resourceDeposits.ts`'s session-only `depletedIds`; owned by `createApp.ts` (same "carried across rebuild, reset only on a genuinely new world" contract as `collectedItemIds`), threaded through `createWorldBundle`/`rebuildWorldBundle`. Player and NPC mining already shared one `ResourceDeposits` instance — the fix is entirely inside `mine()`. No `SaveData` change (cross-session persistence logged as a follow-up to plan 200). [implementation notes](./2026-08-22--198--arch--world-resource-state-continuity-implementation-notes.md) | 🔴 | M | ~~195~~ |
| `2026-08-22--199--arch--entity-identity-transfer-continuity.md` | Closes plan 194's dropped-instance-item condition-loss finding (all 4 call sites, new `DroppedItem`/`SaveDroppedItem.instance?: SaveItemInstance`, `Inventory.toSaveItemInstance()`) plus Findings 3/4 (quest-giver name-collision — `generateNpcName()` now excludes the 4 reserved names; `QuestManager.invalidateStaleAnimalTargets()` closes the mid-session-rebuild wild-fauna quest-binding gap). Deliberately did **not** migrate `QuestDef`/quest relations to `NpcId` — see implementation notes for why name-uniqueness was the actual bug. No new NPC-resolution utility added (verified already satisfied by plan 197). [implementation notes](./2026-08-22--199--arch--entity-identity-transfer-continuity-implementation-notes.md) | 🔴 | M | ~~194~~ ~~197~~ |
| `2026-08-22--200--arch--persistence-gaps-authoritative-state.md` | Findings matrix (192–195 persistence/continuity findings vs. 196–199 coverage) confirms only one still-open finding meets the plan's fix condition: `PlayerNeeds.starvationDuration`/`.dehydrationDuration` (plan 165) not persisted in `SavePlayerNeeds`, silently pausing the HP-drain grace period on a save/reload mid-crisis. Fixed: save schema v27 (`SavePlayerNeedsV27`, `toV27` migration defaulting both to `0`), `saveState.ts`/`restorePersistedNeeds` round-trip both fields. [implementation notes](./2026-08-22--200--arch--persistence-gaps-authoritative-state-implementation-notes.md) | 🔍 | M | ~~195~~ ~~196~~ ~~197~~ |
| `2026-08-22--201--arch--deferred-architecture-state-cleanup.md` | Reconciled every 192–195 finding against 196–200: all P0/P1s resolved or intentionally deferred with a recorded reason, all remaining P2/P3s kept their original "acceptable" disposition. Small fixes: `NpcAgent.beginOreGathering` add/remove mismatch, `DecisionContext.extras`/`.entity` dead-field trim, `ResourceDeposits` depletion now persisted (`SaveData.resourceDeposits`, closing 198's deferred follow-up). Also did the unrelated save-format hard cut: `src/persistence/saveData.ts` dropped its entire v1→v27 migration chain (26 versioned types/guards, ~18 migration functions) down to a single `SaveData` v1 contract with no backward compatibility. [implementation notes](./2026-08-22--201--arch--deferred-architecture-state-cleanup-implementation-notes.md) | ⚪ | M | ~~192~~ ~~193~~ ~~194~~ ~~195~~ ~~196~~ ~~197~~ ~~198~~ ~~199~~ ~~200~~ |
| `2026-08-19--168--settlement-lodging-and-sleep.md` | New `LodgingOption`/`resolveBestLodging` (`src/settlement/lodging.ts`/`lodgingResolver.ts`) — one preference policy (bed > friend > paid > hay, quality desc, distance asc, id tie-break), pure/unit-tested. Friend lodging reuses existing `NpcAgent.household`/`Household.homeId` + `getPlayerSocial` relation levels (`friendly`/`trusted`), no new friendship registry. Hay fallback anchors on the settlement's existing `landmarks.garden`. Bed and paid candidates deliberately return `[]` — no physical bed provider exists before plan 169, no inn/hotel economy exists in the repo; the contract is ready for both without an API change. "Nocuj w mieście" (`restActions.ts`) now resolves + walks the player to the option's `approachPoint` (steers the existing `PlayerController` via the same shared `KeyState`/`LookState` it already reads — no new movement pipeline, no pathfinding) and only starts the existing Sleep/time-skip on arrival, re-validating availability first; a manual movement key press cancels the walk. Paid confirmation (`onConfirmLodging`/`onCancelLodging`, `QuickActionsScreen.vue`) commits payment exactly once via `Inventory`'s existing coin semantics, but is unreachable in current gameplay content (no paid provider registered yet). [implementation notes](./2026-08-19--168--settlement-lodging-and-sleep-implementation-notes.md) | 🔴 | L | ~~165~~ |

---

## Recent context

Done plans kept visible here (not archived) because a current plan above still depends on them. Everything else that reached `done`/`verification needed` before this snapshot (2026-08-19) is in [archive/](./archive/README.md#snapshot-2--2026-08-14--2026-08-19); after this snapshot, new `done` work stays in this file and only gets pulled in here if it becomes load-bearing for the backlog above — see [Index completeness](#index-completeness).

| File | Why it's here |
|------|----------------|
| `2026-08-14--106--player-needs-food-and-cooking.md` | Głód/pragnienie/stamina/vigor + jedzenie/gotowanie — dependency of `126`, `152`, `159` |
| `2026-08-11--069--npc-household-resources.md` | Gospodarstwa NPC + przepływ zasobów — dependency of `152`, `070` |
| `2026-08-14--109--megakit-construction-catalog.md` | Audyt 176 MegaKit GLB + `ConstructionCatalog` — dependency of `111` |
| `2026-08-14--110--quests-v3-closure-world-identity-and-lifecycle.md` | Domknięcie 093: lifecycle `failed`/`invalidated`, `landmarkId`/rebind — dependency of `132`, narrative closure for the in-progress `093` |
| `2026-08-15--122--natural-resource-gathering-and-water-distribution.md` | Studnia → NPC → household barrel/trough — dependency of `126`, `127`, `152` |
| `2026-08-18--150--combat-mode-defense-and-downed-state.md` | Combat mode + soft lock, defense resolver, player `downed`; save v18 — dependency of `162` (own status note: browser verification pending) |
| `2026-08-18--155--inventory-item-instances-and-trap-lifecycle.md` | Generyczny `ItemInstance` + lifecycle pułapek — dependency of `159`, `161`, `162` |
| `2026-08-18--156--npc-household-and-settlement-storage-logistics.md` | Fizyczny household/settlement crate + `[E]` stock — dependency of `152`, `159` |
| `2026-08-18--160--high-quality-melee-weapons.md` | Sześć HQ broni białych, Kupiec + quest rewards — dependency of `161` |
| `2026-08-19--166--named-save-slots.md` | Nazwane sloty IndexedDB; browser verified 2026-08-19 — kept until the next archive snapshot |
| `2026-08-22--193--arch--simulation-architecture-consistency.md` | Audit-only (no refactor), docs-only change (one `ARCHITECTURE.md` sentence). Full tick/contract/ownership/mutation/coupling maps in [implementation notes](./2026-08-22--193--arch--simulation-architecture-consistency-implementation-notes.md). Headline new finding (P0, not previously logged): fauna's full behavior tree (movement/predator-prey combat/player-NPC damage) runs unthrottled at up to ~20× and with zero catch-up during an active time-skip, contradicting both `gameLoop.ts`'s and `timeSkip.ts`'s own doc comments — can silently kill livestock/NPCs or hit the player during a "safe" rest skip. Also broadens the already-logged NPC-needs time-skip double-count (192/195) to confirm it duplicates real household/economy resource quantities, not just need bars. New P1: `NpcAgent.die()` has no death-propagation hook (unlike livestock's `onAnimalDeath`). Follow-ups logged to `LOOSE-ENDS.md` — dependency of `194`/`195` |

---

## Index completeness

Every base plan file in **this folder** belongs in exactly one section above (`In progress` / `Planned` / `Todo` / `Verification needed` / `Recent context`), regardless of status. Base plan files use either the legacy `YYYY-MM-DD--NNN--*.md` format or the new `<domain>-<id>-*.md` format. Implementation notes/reviews, `README.md`, `NEXT-IDEAS.md`, `LOOSE-ENDS.md`, and `archive/` are excluded.

New plan: `<domain>-<id>-slug.md` with a primary `Domain:` and optional `Tags:` per [Plan domains](#plan-domains). The ID is the next unused three-digit number within that domain. Existing legacy plans are not renamed as part of this transition.

When a plan reaches `done` and nothing above still depends on it, it stays here until the next archive snapshot — do not move it to `archive/` yourself; that only happens as a deliberate periodic snapshot (see [archive/README.md](./archive/README.md)).

**Keep `Summary` short — this file must stay small enough to load whole (e.g. into ChatGPT) as a planning map.** One sentence, or a few short clauses. Include only what a *future plan* needs as context: key architectural decisions (reuse vs new system, explicit scope exclusions/deferrals), SaveData version bumps, known bugs. Do not restate the filename/slug, list touched file or function names, quote test counts, or repeat the standard tech-verification sentence (already covered once under [Verification](#plans--current-planning-map) above) — that detail belongs in the plan's own `*-implementation-notes.md`/`*-review.md`.

**`Verification needed` is the exception: its column is `Notes`, not `Summary`, and stays empty by default.** Whoever verifies a plan there opens the plan file directly — the table only needs a link to `*-implementation-notes.md`/`*-review.md` when one exists, or a one-line flag for something a verifier must know before testing (e.g. a known bug from a prior playtest). No prose summary of what was built.
