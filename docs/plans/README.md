# Plans — Current Planning Map

Current planning map for implementation plans: backlog, dependencies, active threads and verification queue. Detailed implementation lives in the plan files; implementation notes and reviews live in their dedicated folders; history lives in [archive/](./archive/README.md).

## Metadata reference

Generated from `scripts/docs/config.ts` by `pnpm docs:generate-plan-docs` — see `docs/plans/PLAN-METADATA.md` for the full contract.

Status: `draft` 📝 · `planned` 📋 · `in progress` 🔄 · `verification needed` 🔍 · `done` ✅
Priority: 🔴 high · 🟡 medium · ⚪ low
Effort: `XS` minutes · `S` ~15–30 min · `M` ~30–90 min · `L` ~1–3 h · `XL` several sessions
Type: `feature` · `bug` · `fix` · `polish` · `optimization` · `refactor` · `infrastructure`

Unless noted otherwise, `verification needed` means implementation has passed automated checks but still needs browser/manual verification.

**Depends on** = implementation prerequisites (plan IDs). ~~done~~ is crossed out. Thematic overlap is not a dependency.

---

## In progress

| File                                                      | Summary                                                               | Pri | Effort | Depends         |
| --------------------------------------------------------- | --------------------------------------------------------------------- | --- | ------ | --------------- |
| `2026-08-13--093--quests-v3-world-problems-reputation.md` | Etap H: drzewa/kopanie + bandyci                                      | 🔴  | XL     | ~~015~~ ~~018~~ |
| `2026-08-17--149--shader-program-first-use-hitch.md`      | Phase C: `Green` / `MI_WindowGlass` / `Wood`                          | 🔴  | M/L    | -               |
| `world-terrain-007-underground-caves.md`                  | Faza 0-3 done (domain/generator/lifecycle/presentation/movement/collision); Faza 4 fauna/loot/persistence deferred — see plan's "Implementation status" | 🔴  | L      | ~~097~~ ~~125~~ |

- `settlements-001-house-collision-geometry.md`

---

## Planned

> 💡 - plan have `-implementation-notes.md`, ◼️ - have not

| File                                                                        | Summary | Pri | Effort | Depends |
| --------------------------------------------------------------------------- | ------- | --- | ------ | ------- |
| 💡 `fauna-007-animal-leading-and-cart-harness.md`                           | -       | 🟡 | L      | ~~014~~ ~~006~~ |
| 💡 `settlements-npcs-015-economic-production-and-input-integration.md`      | -       | 🔴 | M      | settlements-npcs-014 |
| ◼️ `settlements-npcs-016-first-processing-chain-and-blacksmith-production.md` | -     | 🔴 | M      | settlements-npcs-015 |
| ◼️ `settlements-npcs-017-production-demand-and-economic-pressures.md`       | -       | 🔴 | M      | settlements-npcs-015 |
| 💡 `fauna-004-sheep-wool-and-shepherd.md`                                   | -       | 🟡 | L      | -       |
| 💡 `items-player-002-food-provenance-freshness-and-storage.md`              | -       | 🟡 | M      | ~~155~~ ~~159~~ ~~164~~ ~~184~~ |
| 💡 `settlements-npcs-006-wool-to-material.md`                               | -       | 🟡 | M      | fauna-004 |
| 💡 `settlements-npcs-007-bandages-and-herbal-medicine.md`                   | -       | 🟡 | M      | settlements-npcs-006 |
| 💡 `npc-016-work-contracts-payment-and-employer-interaction.md`             | -       | 🟡 | M      | npc-015 |
| 💡 `npc-017-work-contracts-food-and-drink.md`                               | -       | 🟡 | M      | ~~npc-015~~ |
| 💡 `items-player-014-rope-pullable-resource-transport.md`                   | -       | 🟡 | M | ~~155~~ ~~122~~ |
| 💡 `npc-002-npc-healing.md`                                                 | -       | 🟡 | M      | ~~177~~ |
| 💡 `npc-010-death-and-corpse-lifecycle.md`                                  | -       | 🟡 | L      | 177    |
| 💡 `npc-011-npc-burial-and-graves.md`                                       | -       | 🟡 | L      | 010    |
| 💡 `world-004-well-depth-groundwater-and-protection.md`                     | -       | 🟡 | M      | ~~127~~ |
| ◼️ `npc-004-npc-genealogy-lineages.md`                                      | -       | ⚪ | L      | ~~022~~ ~~031~~ |
| ◼️ `tools-000-weapon-browser-observatory.md`                                | -       | 🟡 | M      | -       |
| ◼️ `tools-005-seedvale-character-preparation-panel.md`                      | -       | 🔴 | M      | -       |
| 💡 `tools-006--world-observatory.md`                                        | -       | ⚪ | XL     | ~~071~~, ~~069~~ |
| ◼️ `tools-007--mpfb2-npc-hero-character-pipeline.md`                        | -       | 🔴 | L      | -       |
| 💡 `settlements-npcs-018-physical-goods-transport-foundation.md`            | -       | 🔴 | M      | ~~settlements-npcs-014~~ |
| 💡 `world-terrain-008-underground-caves-v2.md`                              | -       | 🟡 | XL     | -      |
| ◼️ `settlements-npcs-019-persistent-and-off-screen-transport.md`            | -       | 🔴 | M      | settlements-npcs-018 |
| ◼️ `settlements-npcs-022-household-help-and-age-based-work-participation.md` | -       | 🔴 | M      | ~~settlements-npcs-002~~ |
| ◼️ `settlements-npcs-023-profession-staffing-and-settlement-composition.md` | -       | 🔴 | M      | -      |

---

## Verification needed

Implementation is complete; only meaningful browser/manual verification remains.

| File | Check |
|------|-------|
| `fauna-008-riding-skill-effects.md` | Mount the slowest rideable horse/donkey at low Riding, confirm walk and sprint are both visibly faster than the player's own walk/sprint; raise Riding and confirm mounted speed increases further; ride the same route for a fixed period at low vs. higher Riding and confirm stamina drains more slowly at higher Riding, with normal regeneration once stopped |
| `fauna-009-wolf-howling-and-rooster-vocalization.md` | Wolf howl fires mostly at night with reduced dusk/dawn activity and none by day, never during an active chase/attack/flee, wolf visibly stops briefly (no howl clip) rather than fighting its own movement, audible from farther than a normal one-shot; a rooster spawns as livestock (chicken-owning houses only, ~50% companion chance), has basic movement/idle, crows mostly at dawn with occasional daytime crows and no night spam; multiple wolves/roosters don't audio-spam (existing concurrency cap) |
| `world-012-world-locations-discovery-and-map-navigation.md` | New game shows no settlements on the map; talk to the home guard ("Opowiedz mi coś o okolicy") and confirm 1-3 landmarks reveal with feedback, repeat conversations reveal more from the pool, and nearby settlements always reveal; buy a Near map and a Far map from the trader and confirm they reveal different, non-overlapping locations and the knowledge survives selling the map item; open the world map (`M`), click a discovered location for the popover, set/remove up to 3 targets (stable slot colours), clear targets, center on player; confirm the minimap shows only active targets (marker in-range, arrow out-of-range); confirm a deep cave shows its entrance; save/load round-trips discovered locations and targets |
| `world-010-environmental-placement-consequences.md` | Pitch a tent and dig a well right up to the shoreline and confirm both can now be placed clearly closer to the water than before while never landing in water (including a footprint edge dipping in); steep shoreline terrain is still rejected as slope, not water; existing blocker/separation rejections (tree/house/well/peer) still work; verify terrain preparation's shoreline clearance is unchanged |
| `world-011-water-types-and-drinking.md` | Drink at a river bank restores thirst with no illness warning; drink/fill at an ocean shoreline is refused with the salty-water message and doesn't touch Inventory; lake keeps the existing unsafe-warning drink; well drink/fill unaffected; fishing prompt/action at river and ocean shorelines unaffected |
| `tools-009-plan-metadata-contract-migration-and-documentation-generation.md` | Skim the regenerated `docs/plans/README.md`/`PLANNING.md`/`PLAN-METADATA.md` sections for sense; spot-check `pnpm plans:migrate-metadata` and `pnpm plans:cleanup-metadata` dry-run output is sane on the real plan set (no proposed changes expected — migration already applied) |
| `world-008-player-world-placement-foundation.md` | Place/cancel a tent and a chest, preview validity matches actual placement result, open/carry/pick-up/put-down a chest, save/load restores both |
| `items-player-003-player-physical-effort-stamina-vigor.md` | idle/sprint/work Stamina behaviour, work/sprint/heavy-work Vigor drain, well/terrain-prep sessions leave Stamina reduced but not 0 with Vigor visibly lower, post-work recovery pacing, wolf-after-work combat with reduced capacity, sleep still restoring Vigor, fishing/light interactions staying uncosted |
| `npc-006-shared-npc-animal-pathfinding.md` | NPCs and wolves navigate around obstacles without getting stuck; no obvious performance regression |
| `ai-004-npc-goals-and-persistent-plans.md` | NPC goals survive interruptions and resume correctly; blocked/completed plans behave correctly |
| `settlements-npcs-005-local-resource-exchange.md` | Household ↔ household and settlement ↔ household exchange works with real shortages/surpluses and physical NPC movement |
| `settlements-npcs-008-household-and-settlement-food-storage-model.md` | NPC eating, gathering and food exchange work correctly |
| `settlements-npcs-009-physical-storage-destinations-and-resource-delivery.md` | NPCs deliver wood and food to the correct physical storage |
| `settlements-npcs-014-local-goods-circulation.md` | In a settlement with a Hunter, a Trader and at least one other household: let the Hunter hunt so meat lands in its household as surplus, observe the Trader physically walk there, collect it and deliver it to the settlement storage crate, then observe another household draw it via existing acquisition and an NPC eat it — all without player intervention; confirm no item duplication/loss and that the Trader doesn't continuously drain the producer household |
| `2026-08-20--177--npc-combat.md` | NPC combat behaves correctly in an actual encounter |
| `npc-009-combat-feedback-and-death-consequences.md` | NPC attack/hurt/death animation+audio plays correctly for NPC↔animal, animal↔NPC and NPC↔NPC combat; death pre-empts attack/hurt with no lingering attack loop; a dead NPC reconstructed on settlement reload shows the settled dead pose immediately, not a replayed collapse |
| `npc-008-agent-decision-architecture-refactor.md` | Frenzied wolf still reaches a settlement and attacks via `npc-attack-frenzied` (regression check); a non-frenzied predator can now `npc-attack`/`npc-flee`/`npc-ignore` a nearby NPC and the reaction reads as sensible (not jittery); a non-frenzied predator does not chase an NPC into a settlement; a predator near a lit campfire with an NPC nearby resolves to one coherent reaction instead of oscillating between fire-avoid and npc-flee |
| `tools-003-house-browser-and-tools-menu.md` | House Browser opens at `/house-browser.html`, all houses browse/switch without reload, camera/scene/collider controls work, padding is visual-only, rapid switching leaves no stale assembly, Main Menu `Narzędzia ›` reaches House Browser and Asset Browser, normal gameplay boots unchanged |
| `2026-08-20--179--animal-attack-and-npc-defense.md` | Animal attacks trigger correctly and NPCs respond/defend as expected |
| `ui-input-005-lodging-navigation-recovery-and-cancellation.md` | Lodging arrival, cancellation and stuck-movement recovery work correctly |
| `ui-input-006-fishing-ux-and-water-support.md` | Fishing works from lake, river and ocean; Quick Action equips the rod correctly |
| `ui-input-004-construction-placement-and-terrain-preparation-ux.md` | Construction placement, terrain preparation and Quick Actions behave correctly |
| `2026-08-14--111--house-construction.md` | Verify house assembly and confirm the known assembly bug is resolved |
| `npc-007-interaction-destination-approach.md` | NPCs reach the well serving point and queue without repath/escape looping; ordinary NPC movement still avoids colliders and rescue still works |
| `2026-08-21--191--mountain-peaks-and-massifs.md` | Visual seeds/peaks/valleys/chunk seams, streaming hitching, river continuity |
| `items-player-009-player-built-torch-and-ignition.md` | Place a standing torch (preview validity, rejected placement doesn't consume materials, successful placement consumes 1 beam + 1 wooden_torch), confirm unlit state, Ignite with/without fire_starting, flame/light appears and doesn't duplicate on repeated Ignite, save/load restores unlit and lit state, WorldBundle rebuild restores runtime |
| `items-player-010-player-built-palisade-and-building-removal.md` | Preview/place/snap palisade segments into a chain with a direction change, verify material consumption (2× belka) and rejected placement, save/load restores every segment, select + remove a single segment via `[R]`, confirm partial recovery (1× belka), remaining segments untouched, removal blocked when inventory is full |
| `world-009-blood-traces.md` | Player/NPC/animal damage spawns a blood decal at the hit position with plausible size/variant/rotation, decal fades over ~1-3 in-world days, rain visibly accelerates fading, decals don't reappear/duplicate on chunk reload or a same-session `WorldBundle` rebuild, no visible per-trace draw-call/mesh cost with many hits |
| `settlements-npcs-012-physical-storage-inspection.md` | Approach the primary wood stockpile, `[E] Zbadaj stertę drewna` prompt appears, inspecting shows the correct combined household+economy wood quantity, quantity updates after wood changes via simulation, settlement storage crate remains a separate aggregated interaction, LG/XL secondary/overflow piles don't create duplicate interactions, NPC navigation/colliders unchanged |
| `settlements-npcs-013-hierarchical-domain-history.md` | With `?debug=1`, run the household food-shortage scenario, then compare `debug.npc(id).history()` / `debug.household(id).history()` / `debug.settlement(id).history()` timelines — settlement view shows the shortage→decision→delivery→resolution chain without duplicated records, unrelated NPCs/households don't leak in, and a stream/rebuild of the settlement doesn't reference disposed objects |
| `npc-013-night-campfire-gathering.md` | At night with a lit settlement campfire, idle non-sociable NPCs (not just `sociable` ones) walk to it and can pair into a conversation with another NPC there; a hungry/thirsty/on-duty NPC still does its own thing first; an NPC already at the campfire leaves once the fire goes out or a real need appears; no unreasonable cross-settlement travel to a distant campfire |
| `npc-012-weather-reaction-and-shelter.md` | During heavy rain/snow an idle or low-priority (schedule-driven work) NPC walks home through normal movement (no teleport) and stays there while the bad weather persists, without endlessly restarting the walk once arrived; light rain/cloudy/fog/clear don't send anyone home; an active physiological need (e.g. drinking at the well) still finishes/takes priority over sheltering; once weather clears, the NPC resumes its normal schedule/need-driven routine |
| `items-player-013-player-built-sleeping-utilities.md` | Preview/place a bedroll (3× skóra) and a raised platform (6× gałąź), rejected placement doesn't consume materials; bedroll near a tent (with/without fire, with/without a platform under it) raises camp-rest quality without breaking the existing full tent+blanket+fire=1 quality; packing the tent leaves both in place; save/load and a same-session `WorldBundle` rebuild restore position/condition; leaving a bedroll/platform exposed to rain/snow visibly degrades it over world-days while a sheltered one doesn't |
| `world-terrain-004-chunk-mesh-streaming-geometry-optimization.md` | `?benchmark=stream&seed=42&res=193` — compare `chunk mesh` hitch count/avg/max, frame max/p1, STREAMING hitch count, RENDER avg/p95, FPS against the pre-migration baseline (51 hitches, avg 45.5 ms, max 92.6 ms); no visible terrain/color/normal regression while streaming or after dig/scorch/terrain-prep; revisiting an unmodified chunk shows a mesh-data cache hit |
| `fauna-005-animal-corpse-and-bone-feeding.md` | A wolf discovers and eats a fresh corpse; a sufficiently hungry wolf falls back onto a decaying corpse or bones only when no fresh alternative is reachable, not merely because one exists; bones remain eatable after the fresh/rotting food is gone; player harvest and wolf feeding converge on the same corpse without duplicating/corrupting state; behaviour works with the player away from the scene |
| `npc-014-work-contracts-foundation-and-physical-posting.md` | Create a construction contract (Quick Actions → Budowa → Zleć budowę, pick a reward) and confirm a flag appears at the target, state is `available`/not advertised; visit a settlement's notice board (`[E]`) and post the contract, confirm it becomes `advertised`; save/load before and after posting preserves contract/flag/board state; cancel a contract before and after posting via Quick Actions → Zlecenia, confirm the flag/advertisement are removed and it can't be posted again |
| `npc-015-work-contracts-npc-work-and-construction.md` | Post an attractive construction contract, confirm a settlement NPC discovers and accepts it (`?debug=1` inspector shows `Work Contract` id/state), travels to the well and starts working it through `pit`→`well`→`roof` (drop stone/branch near the well for the paid stages), ending in `payment_due`; confirm hunger/thirst/fatigue keep changing during the commitment and a critical need visibly interrupts then resumes work; confirm a low-reward or far-away contract gets rejected; save/load and an in-session rebuild mid-`travelling`/`working` still resume the same commitment; cancel/remove the target mid-work and confirm the contract ends up `invalidated`/`advertised` instead of stuck |
| `fauna-006-wolf-settlement-entry.md` | An ordinary (non-frenzied) wolf selects and enters a settlement to reach an NPC or fleeing prey it was already chasing; the chase isn't dropped just because the target crossed into the village avoidance radius; a frenzied wolf still reaches the village as before; fox/deer/other wild fauna still avoid the village for both wander and hunting; a wolf still doesn't wander into the village without an active target; building colliders still block actual movement |
| `world-terrain-005-distance-based-terrain-detail-lod.md` | Grass: baseline vs `grassFillerCoverage` (0/0.35/0.6/1) near camera and along a distant road, watching triangle/instance count and draw calls; Road: baseline (`surfaceDetailEnabled` off) vs on at a few `rutDepth`/`microBumpStrength` values close-up on a road segment, confirm no chunk-boundary seams and paths stay flatter than roads; combined on/off matrix per plan §7 |
| `persistence-001-full-simulation-persistence.md` | Adjust an NPC's needs/HP, give it a helper assignment/active plan, change household stock/items, nudge an NPC↔NPC relationship, move/injure/kill house livestock (some mid-production, one already removed via corpse lifecycle) — Save → Load and confirm every value round-trips, no duplicate/resurrected livestock, and old pre-persistence-001 saves still load with fresh deterministic NPC/household/livestock state |
| `persistence-003-save-schema-versioning-and-migrations.md` | Continue/New Game/manual Save+Load still round-trip an ordinary v1 save exactly as before (no version-related regression); the migration pipeline itself (version detection, chain-walking, invalid/migration-failed/unsupported-version distinction, write-guard refusal) has full automated coverage since no real v2 schema exists yet to exercise manually |
| `ui-input-007-player-action-contracts-and-quick-actions-availability.md` | Open Quick Actions → Ogień with a fresh inventory: all 5 fire actions are visible but disabled/50% opacity; carry firestarter+branches and confirm those rows become enabled and move above the still-disabled ones, and building/lighting actually works; Pause → Akcje shows the same list/states; a disabled row can't be clicked; reopening after an inventory change updates availability |
| `world-terrain-006-world-generation-placement-correctness.md` | Inspect a seed with several rivers and follow each to its visible terminal (no dead-ending on dry land); inspect river banks (including a mountain stream) for grass/tree intrusions; inspect cemetery edges against roads including larger cemeteries; inspect stone circles/ruins/monoliths on slopes; inspect mountain slopes from lowland through the upper vegetation band for continuity; confirm no chunk streaming/seam regressions |

---

## Recent context

Done plans kept here only while they are relevant to current planning or dependencies. Otherwise they belong in [archive/](./archive/README.md).

| File                                                                    | Why it's here                               |
| ----------------------------------------------------------------------- | ------------------------------------------- |
| `2026-08-14--106--player-needs-food-and-cooking.md`                     | Dependency of `126`, `152`, `159`           |
| `2026-08-11--069--npc-household-resources.md`                           | Dependency of `152`, `070`                  |
| `2026-08-14--109--megakit-construction-catalog.md`                      | Dependency of `111`                         |
| `2026-08-14--110--quests-v3-closure-world-identity-and-lifecycle.md`    | Dependency of `132`; closes `093` lifecycle |
| `2026-08-15--122--natural-resource-gathering-and-water-distribution.md` | Dependency of `126`, `127`, `152`           |
| `2026-08-18--150--combat-mode-defense-and-downed-state.md`              | Dependency of `162`                         |
| `2026-08-18--155--inventory-item-instances-and-trap-lifecycle.md`       | Dependency of `159`, `161`, `162`           |
| `2026-08-18--156--npc-household-and-settlement-storage-logistics.md`    | Dependency of `152`, `159`                  |
| `2026-08-18--160--high-quality-melee-weapons.md`                        | Dependency of `161`                         |
| `2026-08-19--166--named-save-slots.md`                                  | Recent browser-verified persistence work    |
| `2026-08-22--193--arch--simulation-architecture-consistency.md`         | Findings driving `194`/`195`                |

---

## Plan naming

New plans use:

`<domain>-<id>-<title>.md`

The ID is three-digit and local to the domain.

Existing legacy plans keep their current date/global-ID names and are not renamed.

## Plan domains

New plans declare a primary `Domain:` in frontmatter. Use optional `Tags:` only for genuinely secondary domains.

| Domain | Summary | Subdomains |
|---|---|---|
| `ai` | AI-assisted dialogue, characterisation and related AI systems | `dialogue`, `characterisation`, `generation`, `agents` |
| `fauna` | Wildlife, predators/prey and ecosystem simulation | `predation`, `prey`, `habitat`, `reproduction`, `migration`, `lifecycle`, `population`, `domestication` |
| `items-player` | Player inventory, items, tools and item interaction | `inventory`, `items`, `tools`, `interaction`, `player-needs` |
| `npc` | NPC behaviour, needs, goals, traits, decisions and actions | `behavior`, `needs`, `goals`, `decision-making`, `relationships`, `memory`, `lifecycle`, `work`, `combat`, `dialogue` |
| `persistence` | Save data, storage, serialization and migrations | `save-data`, `serialization`, `storage`, `migration` |
| `quests-progression` | Quests, relationships, progression and rewards | `quests`, `relationships`, `progression`, `rewards` |
| `settlements` | Settlements, buildings, population, resources and development | `buildings`, `population`, `resources`, `development`, `economy` |
| `settlements-npcs` | Households, schedules, settlement NPCs and local economy | `household`, `schedules`, `economy`, `logistics`, `social` |
| `tools` | Development tools, diagnostics and automation | `debug`, `development`, `diagnostics`, `automation` |
| `ui-input` | UI, HUD, input and player interaction | `hud`, `menus`, `input`, `interaction`, `feedback` |
| `world` | World state, resources, places, time, weather and simulation | `resources`, `places`, `time`, `weather`, `events`, `simulation` |
| `world-terrain` | Terrain, chunks, vegetation, roads and world rendering | `terrain`, `chunks`, `vegetation`, `roads`, `landmarks`, `rendering` |

`Domain` means "where to look first". Use `Tags` sparingly.

`Roadmap` is optional, and should point to a file in `docs/roadmap` folder.

## Next plan IDs

- ai: `005`
- fauna: `010`
- items-player: `016`
- npc: `018`
- persistence: `004`
- quests-progression: `001`
- settlements: `003`
- settlements-npcs: `024`
- tools: `012`
- ui-input: `008`
- world: `013`
- world-terrain: `009`

This ids section is maintained automatically from the plan files.

Next ideas: [NEXT-IDEAS.md](./NEXT-IDEAS.md)
Loose ends: [LOOSE-ENDS.md](./LOOSE-ENDS.md)

---

## Active threads

Current dependency chains and architectural threads. Not a replacement for `Depends on`.

```text
Combat & weapons
  (155 inventory instances) → (160 HQ melee) → (161 weapon maintenance)
  (150 combat mode) + (155) → (162 bows/ranged) → (177 NPC combat melee+ranged — no live AI trigger yet) → 179 animal attack & NPC defense

Household economy & storage
  (106 food/cooking) + (069 household resources) + (122 water distribution) → (156 storage logistics)
      → 152 NPC food/drink help
      → 159 fishing/preservation/bait
  (122) → (126 seed planting), (127 player-built well)

World-driven quests
  (049) + 093 + (110) → 132

Rendering performance
  (157 PointLight budget 16) → 149 shader program first-use hitch
  chunk mesh streaming → world-terrain-004

Construction & lodging
  (109) → (111) → (169)
  (165) → (168) → (169)

Natural vegetation
  (140 landscape flora) → (172 natural crop lifecycle) → (126 seed planting)
```

---

## Index completeness

Every base plan in this folder belongs to exactly one section above. Implementation notes, reviews, `README.md`, `NEXT-IDEAS.md`, `LOOSE-ENDS.md` and `archive/` are excluded.

When a plan reaches `done` and is no longer relevant to an active dependency, it stays here until the next deliberate archive snapshot.

Keep summaries short. The README should contain only information useful for choosing, planning or verifying another plan. Implementation detail belongs in the plan and its companion notes/reviews.
