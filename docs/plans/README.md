# Plans — Current Planning Map

Current planning map for implementation plans: backlog, dependencies, active threads and verification queue. Detailed implementation lives in the plan files; implementation notes and reviews live in their dedicated folders; history lives in [archive/](./archive/README.md).

Status: `in progress` 🔄 · `verification needed` 🔍 · `planned` 📋 · `todo` ⬜ · `done` ✅
Priority: 🔴 high · 🟡 medium · ⚪ low
Effort: `XS` minutes · `S` ~15–30 min · `M` ~30–90 min · `L` ~1–3 h · `XL` several sessions

Unless noted otherwise, `verification needed` means implementation has passed automated checks but still needs browser/manual verification.

**Depends on** = implementation prerequisites (plan IDs). ~~done~~ is crossed out. Thematic overlap is not a dependency.

## Plan naming

New plans use:

`<domain>-<id>-<title>.md`

The ID is three-digit and local to the domain.

Existing legacy plans keep their current date/global-ID names and are not renamed.

## Plan domains

New plans declare a primary `Domain:` in frontmatter. Use optional `Tags:` only for genuinely secondary domains.

| Domain | Covers |
|--------|--------|
| `ai` | AI-assisted dialogue, characterisation and related AI systems |
| `fauna` | Wildlife, predators/prey, herds, ecosystem simulation |
| `items-player` | Inventory, tools, player needs, world items |
| `npc` | NPC behaviour, needs, goals, traits, decisions and actions |
| `persistence` | SaveData, IndexedDB, persistence |
| `quests-progression` | Quests, relationships, EXP and progression |
| `settlements` | Settlements, buildings, population, resources and development |
| `settlements-npcs` | Settlements + NPCs, households, schedules, economy, dialogue |
| `tools` | Development/debugging tools and utilities |
| `ui-input` | UI, HUD, input and player interaction |
| `world` | World state, resources, places, time, weather and global systems |
| `world-terrain` | Terrain, chunks, ocean, environment and landmarks |

`Ddomain` means "where to look first". Use `Tags` sparingly.

`Roadmap` is optional, and should point to a file in `docs/roadmap` folder.

## Next plan IDs

- ai: `004`
- fauna: `005`
- items-player: `002`
- npc: `003`
- persistence: `001`
- quests-progression: `001`
- settlements: `003`
- settlements-npcs: `008`
- tools: `004`
- ui-input: `005`
- world: `006`
- world-terrain: `003`

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

Construction & lodging
  (109) → (111) → (169)
  (165) → (168) → (169)

Natural vegetation
  (140 landscape flora) → (172 natural crop lifecycle) → (126 seed planting)
```

---

## In progress

| File                                                      | Summary                                                               | Pri | Effort | Depends         |
| --------------------------------------------------------- | --------------------------------------------------------------------- | --- | ------ | --------------- |
| `2026-08-13--093--quests-v3-world-problems-reputation.md` | Etap H: drzewa/kopanie + bandyci                                      | 🔴  | XL     | ~~015~~ ~~018~~ |
| `2026-08-17--149--shader-program-first-use-hitch.md`      | Phase C: `Green` / `MI_WindowGlass` / `Wood`                          | 🔴  | M/L    | -               |

- `settlements-001-house-collision-geometry.md`

---

## Planned

> 💡 - plan have `-implementation-notes.md`, ◼️ - have not

| File | Summary | Pri | Effort | Depends |
| ---------------------------------------------------------------------- | --------- | --- | --- | --- |
| 💡 `npc-002-npc-healing.md`                                            | NPC używa opatrunków | 🟡 | M | ~~177~~ |
| 💡 `2026-08-14--104--underground-caves.md`                             | Prawdziwe jaskinie podziemne; wstępny | 🟡 | XL | ~~097~~ |
| 💡 `2026-08-21--191--mountain-peaks-and-massifs.md`                    | - | 🟡 | L | 181 |
| ◼️ `settlements-npcs-004-animal-and-npc-social-audio.md`               | - | 🟡 | S | ~~151~~ |
| ◼️ `fauna-001-rabies-and-animal-infection.md`                          | - | 🟡 | M | ~~188~~ |
| 💡 `world-004-well-depth-groundwater-and-protection.md`                | - | 🟡 | M | ~~127~~ |
| ◼️ `npc-000--mpfb2-npc-hero-character-pipeline.md`                     | - | 🔴 | L | - |
| ◼️ `tools-002-trace-analyzer-application-cpu-attribution.md`           | - | 🔴 | M | - |
| ◼️ `tools-003-house-browser-and-tools-menu.md`                         | - | 🟡 | M | ~~111~~ |
| ◼️ `tools-000-weapon-browser-observatory.md`                           | Weapon Browser w Observatory/Admin | 🟡 | M | - |
| ◼️ `world-005-new-game-time-reset.md`                        | - | 🟡 | S | - |
| ◼️ `settlements-npcs-005-local-resource-exchange.md`         | - | 🔴 | M | ~~156~~ ~~002~~ |
| ◼️ `ui-input-004-construction-placement-and-terrain-preparation-ux.md` | - | 🟡 | M | - |

### Fresh new

> Place for newly created plans.

| ◼️ `fauna-004-sheep-wool-and-shepherd.md` | Owce, cykl wełny i profesja Pasterz | 🟡 | L | - |
| ◼️ `settlements-npcs-006-wool-to-material.md` | Wełna → materiał | 🟡 | M | ~~fauna-004~~ |
| ◼️ `settlements-npcs-007-bandages-and-herbal-medicine.md` | Bandaże, zioła i opatrunki | 🟡 | M | ~~006~~ |

---

## Todo

| File                                         | Summary                       | Pri | Effort | Depends                                      |
| -------------------------------------------- | ----------------------------- | --- | ------ | -------------------------------------------- |
| `2026-08-11--070--world-observatory.md`      | Panel obserwacji życia świata | ⚪  | XL     | 071 (archived, verification needed), ~~069~~ |
| `2026-08-08--037--npc-genealogy-lineages.md` | Rody NPC                      | ⚪  | L      | ~~022~~ ~~031~~                              |

### Issues without plans

- **Merchant UX / Handel**:
  - Podczas handlu brakuje podglądu kupowanego przedmiotu. Nie wiemy, co kupujemy, jakie ma obrażenia, wagę itp.
  - Pewnie można dodać inne poprawki UX, szczególnie pod mobile.

---

## Verification needed

Implementation is complete; only browser/manual verification remains unless noted.

| File        | Notes              |
| ----------- | ------------------ |
| `items-player-001-containers-waterskins-and-copper-items.md` | [notes](./implementation-notes/items-player-001-containers-waterskins-and-copper-items-implementation-notes.md); new waterskin sizes/fill/drink, buckets, saddlebags, copper ore/copper need browser verification |
| `fauna-002-livestock-food-production.md` | [notes](./implementation-notes/fauna-002-livestock-food-production-implementation-notes.md); egg laying/collection, milking (both bucket kinds, capacity clamp, cooldown) need browser verification |
| `settlements-npcs-002-npc-professions-complete-profession-work-integration.md` | [notes](./implementation-notes/settlements-npcs-002-npc-professions-complete-profession-work-integration-implementation-notes.md); new blacksmith prop placement + all 5 new profession behaviours need browser verification |
| `2026-08-18--151--social-places-and-social-behaviour.md` | [notes](./implementation-notes/2026-08-18--151--social-places-and-social-behaviour-implementation-notes.md) |
| `2026-08-18--152--npc-player-food-drink-help.md` | [notes](./implementation-notes/2026-08-18--152--npc-player-food-drink-help-implementation-notes.md) |
| `world-terrain-001-clouds.md` | browser verification |
| `2026-08-20--179--animal-attack-and-npc-defense.md` | [notes](./implementation-notes/2026-08-20--179--animal-attack-and-npc-defense-implementation-notes.md) |
| `2026-08-21--184--item-capability-abstraction.md` | [notes](./implementation-notes/2026-08-21--184--item-capability-abstraction-implementation-notes.md) |
| `2026-08-14--111--house-construction.md` | known assembly bug |
| `2026-08-16--129--coins-and-land-sales.md` | - |
| `2026-08-16--132--landmark-quests.md` | - |
| `2026-08-19--170--npc-simulation-inspector-and-trace.md` | - |
| `2026-08-18--159--natural-food-fishing-preservation-and-bait.md` | - |
| `2026-08-18--161--weapon-maintenance-and-sharpening.md` | - |
| `2026-08-18--162--bows-arrows-ranged-combat-and-critical-hits.md` | - |
| `2026-08-19--165--vigor-hunger-thirst-and-rest.md` | - |
| `2026-08-20--172--natural-crop-lifecycle.md` | - |
| `2026-08-19--164--player-storage-and-container-system.md` | - |
| `2026-08-21--183--slope-movement-constraint.md` | - |
| `2026-08-20--177--npc-combat.md` | - |
| `2026-08-21--189--river-channel-carving.md` | [notes](./implementation-notes/2026-08-21--189--river-channel-carving-implementation-notes.md) |
| `2026-08-21--181--natural-mountains-and-rivers.md` | Etap 1–7 complete including waterfalls; full lake/ocean shader parity + hydrology worker offload deliberately deferred pending measured need, see plan's Etap 7 completion summary |
| `2026-08-21--185--npc-role-based-carried-weapons.md` | [notes](./implementation-notes/2026-08-21--185--npc-role-based-carried-weapons-implementation-notes.md) |
| `2026-08-21--182--deep-forest-biome-and-forest-generation-overhaul.md` | [notes](./implementation-notes/2026-08-21--182--deep-forest-biome-and-forest-generation-overhaul-implementation-notes.md) |
| `ui-input-002-ui-ux-interaction-and-action-system-polish.md` | [notes](./implementation-notes/ui-input-002-ui-ux-interaction-and-action-system-polish-implementation-notes.md) |
| `2026-08-21--186--combat-and-player-interactions.md` | [notes](./implementation-notes/2026-08-21--186--combat-and-player-interactions-implementation-notes.md) |
| `2026-08-21--187--building-resources.md` | [notes](./implementation-notes/2026-08-21--187--building-resources-implementation-notes.md) |
| `2026-08-21--188--fauna-and-dead-animal-lifecycle.md` | - |
| `2026-08-20--175--cooking-vessels-grates-and-iron-rods.md` | [notes](./implementation-notes/2026-08-20--175--cooking-vessels-grates-and-iron-rods-implementation-notes.md) |
| `2026-08-20--174--player-garden-and-npc-need-sources.md` | [notes](./implementation-notes/2026-08-20--174--player-garden-and-npc-need-sources-implementation-notes.md) |
| `world-001-playtest-gameplay-fixes-stamina-fire-timeskip-bear.md` | - |
| `2026-08-22--192--arch--time-and-simulation-consistency.md` | [notes](./implementation-notes/2026-08-22--192--arch--time-and-simulation-consistency-implementation-notes.md) |
| `ai-001-npc-pressure-layer.md` | [notes](./implementation-notes/ai-001-npc-pressure-layer-implementation-notes.md) |
| `2026-08-20--173--terrain-aware-procedural-placement.md` | [notes](./implementation-notes/2026-08-20--173--terrain-aware-procedural-placement-implementation-notes.md) |
| `2026-08-22--194--arch--entity-identity-lifecycle.md` | [notes](./implementation-notes/2026-08-22--194--arch--entity-identity-lifecycle-implementation-notes.md) |
| `2026-08-22--195--arch--data-state-consistency.md` | [notes](./implementation-notes/2026-08-22--195--arch--data-state-consistency-implementation-notes.md) |
| `2026-08-22--196--arch--time-skip-simulation-semantics.md` | [notes](./implementation-notes/2026-08-22--196--arch--time-skip-simulation-semantics-implementation-notes.md) |
| `2026-08-22--197--arch--npc-runtime-state-lifecycle-continuity.md` | [notes](./implementation-notes/2026-08-22--197--arch--npc-runtime-state-lifecycle-continuity-implementation-notes.md) |
| `2026-08-22--198--arch--world-resource-state-continuity.md` | [notes](./implementation-notes/2026-08-22--198--arch--world-resource-state-continuity-implementation-notes.md) |
| `2026-08-22--199--arch--entity-identity-transfer-continuity.md` | [notes](./implementation-notes/2026-08-22--199--arch--entity-identity-transfer-continuity-implementation-notes.md) |
| `2026-08-22--200--arch--persistence-gaps-authoritative-state.md` | [notes](./implementation-notes/2026-08-22--200--arch--persistence-gaps-authoritative-state-implementation-notes.md) |
| `2026-08-22--201--arch--deferred-architecture-state-cleanup.md` | [notes](./implementation-notes/2026-08-22--201--arch--deferred-architecture-state-cleanup-implementation-notes.md) |
| `2026-08-20--176--garden-and-field-maintenance.md` | [notes](./implementation-notes/2026-08-20--176--garden-and-field-maintenance-implementation-notes.md) |
| `settlements-npcs-001-cultivation-hydration-and-watering.md` | [notes](./implementation-notes/settlements-npcs-001-cultivation-hydration-and-watering-implementation-notes.md); browser/gameplay verification per plan §19 |
| `2026-08-20--178--hunter-profession-and-household.md` | [notes](./implementation-notes/2026-08-20--178--hunter-profession-and-household-implementation-notes.md) — bow crafting/trade bridge and NPC-triggered cooking/drying deliberately out of scope, see notes §18 |
| `2026-08-19--168--settlement-lodging-and-sleep.md` | [notes](./implementation-notes/2026-08-19--168--settlement-lodging-and-sleep-implementation-notes.md) |
| `2026-08-19--169--house-interior-furniture-and-bed-anchors.md` | [notes](./implementation-notes/2026-08-19--169--house-interior-furniture-and-bed-anchors-implementation-notes.md) |
| `world-terrain-002-terrain-modification-and-land-preparation.md` | [notes](./implementation-notes/world-terrain-002-terrain-modification-and-land-preparation-implementation-notes.md) |
| `world-003-faster-application-startup.md` | [notes](./implementation-notes/world-003-faster-application-startup-implementation-notes.md) |
| `tools-001-performance-benchmark-determinism-and-reliability.md` | [notes](./implementation-notes/tools-001-performance-benchmark-determinism-and-reliability-implementation-notes.md); repeated-run stability (§8) needs manual `?benchmark=` browser verification |

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

## Index completeness

Every base plan in this folder belongs to exactly one section above. Implementation notes, reviews, `README.md`, `NEXT-IDEAS.md`, `LOOSE-ENDS.md` and `archive/` are excluded.

When a plan reaches `done` and is no longer relevant to an active dependency, it stays here until the next deliberate archive snapshot.

Keep summaries short. The README should contain only information useful for choosing, planning or verifying another plan. Implementation detail belongs in the plan and its companion notes/reviews.
