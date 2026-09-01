# Plans — Current Planning Map

Current planning map for implementation plans: backlog, dependencies, active threads and verification queue. Detailed implementation lives in the plan files; implementation notes and reviews live in their dedicated folders; history lives in [archive/](./archive/README.md).

Status: `in progress` 🔄 · `verification needed` 🔍 · `planned` 📋 · `done` ✅
Priority: 🔴 high · 🟡 medium · ⚪ low
Effort: `XS` minutes · `S` ~15–30 min · `M` ~30–90 min · `L` ~1–3 h · `XL` several sessions

Unless noted otherwise, `verification needed` means implementation has passed automated checks but still needs browser/manual verification.

**Depends on** = implementation prerequisites (plan IDs). ~~done~~ is crossed out. Thematic overlap is not a dependency.

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

| File                                                                   | Summary   | Pri | Effort | Depends |
| ---------------------------------------------------------------------- | --------- | --- | ------ | ------- |
| ◼️ `world-008-player-world-placement-foundation.md`                    | - | 🟡 | M | - |
| 💡 `items-player-003-player-physical-effort-stamina-vigor.md`          | - | 🟡 | M | - |
| ◼️ `items-player-009-player-built-torch-and-ignition.md`               | - | 🟡 | M | 008 |
| ◼️ `items-player-010-player-built-palisade-and-building-removal.md`    | - | 🟡 | M | 008 |
| ◼️ `fauna-004-sheep-wool-and-shepherd.md`                              | Owce, cykl wełny i profesja Pasterz | 🟡 | L | - |
| ◼️ `settlements-npcs-006-wool-to-material.md`                          | Wełna → materiał | 🟡 | M | ~~fauna-004~~ |
| ◼️ `settlements-npcs-007-bandages-and-herbal-medicine.md`              | Bandaże, zioła i opatrunki | 🟡 | M | ~~006~~ |
| 💡 `npc-002-npc-healing.md`                                            | NPC używa opatrunków | 🟡 | M | ~~177~~ |
| 💡 `settlements-npcs-012-physical-storage-inspection.md`               | - | 🟡 | S | ~~009~~ ~~010~~ |
| ◼️ `settlements-npcs-014-local-goods-circulation.md`                   | - | 🔴 | M | ~~008~~ ~~009~~ ~~010~~ |
| ◼️ `settlements-npcs-015-economic-production-and-input-integration.md` | - | 🔴 | M | ~~014~~ |
| ◼️ `settlements-npcs-017-production-demand-and-economic-pressures.md`  | - | 🔴 | M | ~~015~~ |
| 💡 `settlements-npcs-013-hierarchical-domain-history.md`               | - | 🔴 | M | `none` |
| ◼️ `npc-004-npc-genealogy-lineages.md`                                 | Rody NPC | ⚪ | L | ~~022~~ ~~031~~ |
| 💡 `world-004-well-depth-groundwater-and-protection.md`                | - | 🟡 | M | ~~127~~ |
| 💡 `2026-08-21--191--mountain-peaks-and-massifs.md`                    | - | 🟡 | L | 181 |
| 💡 `2026-08-14--104--underground-caves.md`                             | Prawdziwe jaskinie podziemne; wstępny | 🟡 | XL | ~~097~~ |
| 💡 `items-player-002-food-provenance-freshness-and-storage.md`         | - | 🟡 | M | ~~155~~ ~~159~~ ~~164~~ ~~184~~ |
| ◼️ `persistence-001-full-simulation-persistence.md`                    | - | 🔴 | L | - |
| ◼️ `tools-000-weapon-browser-observatory.md`                           | Weapon Browser w Observatory/Admin | 🟡 | M | - |
| ◼️ `tools-003-house-browser-and-tools-menu.md`                         | - | 🟡 | M | ~~111~~ |
| ◼️ `tools-005-seedvale-character-preparation-panel.md`                 | - | 🔴 | M | - |
| 💡 `tools-006--world-observatory.md`                                   | Panel obserwacji życia świata | ⚪  | XL     | ~~071~~, ~~069~~ |
| ◼️ `tools-007--mpfb2-npc-hero-character-pipeline.md`                   | - | 🔴 | L | - |

---

## Verification needed

Implementation is complete; only meaningful browser/manual verification remains.

| File | Check |
|------|-------|
| `npc-006-shared-npc-animal-pathfinding.md` | NPCs and wolves navigate around obstacles without getting stuck; no obvious performance regression |
| `ai-004-npc-goals-and-persistent-plans.md` | NPC goals survive interruptions and resume correctly; blocked/completed plans behave correctly |
| `settlements-npcs-005-local-resource-exchange.md` | Household ↔ household and settlement ↔ household exchange works with real shortages/surpluses and physical NPC movement |
| `settlements-npcs-008-household-and-settlement-food-storage-model.md` | NPC eating, gathering and food exchange work correctly |
| `settlements-npcs-009-physical-storage-destinations-and-resource-delivery.md` | NPCs deliver wood and food to the correct physical storage |
| `2026-08-20--177--npc-combat.md` | NPC combat behaves correctly in an actual encounter |
| `2026-08-20--179--animal-attack-and-npc-defense.md` | Animal attacks trigger correctly and NPCs respond/defend as expected |
| `persistence-001-full-simulation-persistence.md` | Save/load preserves important simulation state correctly |
| `ui-input-005-lodging-navigation-recovery-and-cancellation.md` | Lodging arrival, cancellation and stuck-movement recovery work correctly |
| `ui-input-006-fishing-ux-and-water-support.md` | Fishing works from lake, river and ocean; Quick Action equips the rod correctly |
| `ui-input-004-construction-placement-and-terrain-preparation-ux.md` | Construction placement, terrain preparation and Quick Actions behave correctly |
| `2026-08-14--111--house-construction.md` | Verify house assembly and confirm the known assembly bug is resolved |
| `npc-007-interaction-destination-approach.md` | NPCs reach the well serving point and queue without repath/escape looping; ordinary NPC movement still avoids colliders and rescue still works |

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

- ai: `005`
- fauna: `005`
- items-player: `012`
- npc: `008`
- persistence: `002`
- quests-progression: `001`
- settlements: `003`
- settlements-npcs: `018`
- tools: `008`
- ui-input: `007`
- world: `009`
- world-terrain: `004`

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

## Index completeness

Every base plan in this folder belongs to exactly one section above. Implementation notes, reviews, `README.md`, `NEXT-IDEAS.md`, `LOOSE-ENDS.md` and `archive/` are excluded.

When a plan reaches `done` and is no longer relevant to an active dependency, it stays here until the next deliberate archive snapshot.

Keep summaries short. The README should contain only information useful for choosing, planning or verifying another plan. Implementation detail belongs in the plan and its companion notes/reviews.
