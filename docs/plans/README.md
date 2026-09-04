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

---

## Planned

> 💡 - plan have `-implementation-notes.md`, ◼️ - have not

| File                                                                        | Summary | Pri | Effort | Depends |
| --------------------------------------------------------------------------- | ------- | --- | ------ | ------- |
| 💡 `items-player-014-rope-pullable-resource-transport.md`                   | -       | 🟡 | M | ~~155~~ ~~122~~ |
| 💡 `settlements-npcs-015-economic-production-and-input-integration.md`      | -       | 🔴 | M      | settlements-npcs-014 |
| 💡 `settlements-npcs-018-physical-goods-transport-foundation.md`            | -       | 🔴 | M      | ~~settlements-npcs-014~~ |
| ◼️ `settlements-npcs-019-persistent-and-off-screen-transport.md`            | -       | 🔴 | M      | settlements-npcs-018 |
| ◼️ `settlements-npcs-016-first-processing-chain-and-blacksmith-production.md` | -     | 🔴 | M      | settlements-npcs-015 |
| ◼️ `settlements-npcs-017-production-demand-and-economic-pressures.md`       | -       | 🔴 | M      | settlements-npcs-016 |
| 💡 `fauna-004-sheep-wool-and-shepherd.md`                                   | -       | 🟡 | L      | -       |
| 💡 `items-player-002-food-provenance-freshness-and-storage.md`              | -       | 🟡 | M      | ~~155~~ ~~159~~ ~~164~~ ~~184~~ |
| 💡 `settlements-npcs-006-wool-to-material.md`                               | -       | 🟡 | M      | fauna-004 |
| 💡 `settlements-npcs-007-bandages-and-herbal-medicine.md`                   | -       | 🟡 | M      | settlements-npcs-006 |
| ◼️ `settlements-npcs-022-household-help-and-age-based-work-participation.md` | -       | 🔴 | M      | ~~settlements-npcs-002~~ |
| ◼️ `settlements-npcs-023-profession-staffing-and-settlement-composition.md` | -       | 🔴 | M      | -      |
| 💡 `fauna-007-animal-leading-and-cart-harness.md`                           | -       | 🟡 | L      | ~~014~~ ~~006~~ |
| 💡 `npc-016-work-contracts-payment-and-employer-interaction.md`             | -       | 🟡 | M      | npc-015 |
| 💡 `npc-017-work-contracts-food-and-drink.md`                               | -       | 🟡 | M      | ~~npc-015~~ |
| 💡 `npc-002-npc-healing.md`                                                 | -       | 🟡 | M      | ~~177~~ |
| 💡 `npc-010-death-and-corpse-lifecycle.md`                                  | -       | 🟡 | L      | 177    |
| 💡 `npc-011-npc-burial-and-graves.md`                                       | -       | 🟡 | L      | 010    |
| ◼️ `npc-004-npc-genealogy-lineages.md`                                      | -       | ⚪ | L      | ~~022~~ ~~031~~ |
| 💡 `world-terrain-008-underground-caves-v2.md`                              | -       | 🟡 | XL     | -      |
| ◼️ `tools-000-weapon-browser-observatory.md`                                | -       | 🟡 | M      | -       |
| ◼️ `tools-005-seedvale-character-preparation-panel.md`                      | -       | 🔴 | M      | -       |
| 💡 `tools-006--world-observatory.md`                                        | -       | ⚪ | XL     | ~~071~~, ~~069~~ |
| ◼️ `tools-007--mpfb2-npc-hero-character-pipeline.md`                        | -       | 🔴 | L      | -       |
| 💡 `fauna-012-animal-threat-perception-and-vocalization-responses.md`       | -       | 🟡 | M      | fauna-010, fauna-011 |
| ◼️ `fauna-013-animal-hand-feeding-and-human-affinity.md`                    | -       | 🟡 | M      | fauna-010, fauna-011 |
| ◼️ `items-player-016-books-and-skill-learning.md`                           | -       | 🟡 | M      | ~~world-012~~ |
| ◼️ `world-013-world-location-catalog-performance-optimization.md`           | -       | 🔴 | M      | ~~world-012~~ |
| ◼️ `tools-012-draft-plans-readme-automatic-sync.md`                         | -       | 🟡 | S      | ~~tools-011~~ |
| ◼️ `world-terrain-010-waterways-and-vegetation.md`                          | -       | 🟡 | M      | -      |

---

## Verification needed

Implementation is complete; only meaningful browser/manual verification remains.

## Do sprawdzenia

| Plan | Sprawdź |
|------|---------|
| `fauna-009-wolf-howling-and-rooster-vocalization.md` | Wycie wilków i pianie kogutów: timing, zachowanie i brak spamowania audio |
| `items-player-003-player-physical-effort-stamina-vigor.md` | Odczuwalny balans Stamina/Vigor podczas ruchu, pracy i regeneracji |
| `npc-006-shared-npc-animal-pathfinding.md` | NPC i zwierzęta poruszają się naturalnie, omijają przeszkody i nie zacinają się |
| `settlements-npcs-014-local-goods-circulation.md` | Naturalny obieg dóbr: producent → handlarz → magazyn → gospodarstwo |
| `npc-009-combat-feedback-and-death-consequences.md` | Walka NPC/zwierząt: animacje, audio, obrażenia i śmierć |
| `ui-input-004-construction-placement-and-terrain-preparation-ux.md` | UX budowania, placementu i przygotowania terenu |
| `npc-007-interaction-destination-approach.md` | NPC naturalnie podchodzą do studni i nie wpadają w pętle ruchu |
| `2026-08-21--191--mountain-peaks-and-massifs.md` | Góry, doliny, rzeki, seamy i płynność streamingu |
| `npc-013-night-campfire-gathering.md` | Naturalność nocnych spotkań NPC przy ognisku |
| `npc-012-weather-reaction-and-shelter.md` | Naturalność reakcji NPC na złą pogodę i powrotu do rutyny |
| `npc-015-work-contracts-npc-work-and-construction.md` | Pełny przebieg kontraktu NPC w świecie, w tym przerwanie przez potrzeby i wznowienie |
| `fauna-006-wolf-settlement-entry.md` | Wilk sensownie ściga cel do osady, ale nie wchodzi do niej bez powodu |
| `world-terrain-005-distance-based-terrain-detail-lod.md` | Jakość i wydajność grass/road LOD z różnych odległości |
| `world-terrain-006-world-generation-placement-correctness.md` | Rzeki, brzegi, góry, roślinność, placement obiektów i seamy chunków |
| `fauna-011-domestic-dogs-and-household-guarding.md` | Psy: warianty modeli/animacje, dieta bez huntingu, karmienie, szczekanie kontekstowe, obrona household przed wilkiem, powrót do domu po zagrożeniu |

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
- fauna: `014`
- items-player: `017`
- npc: `018`
- persistence: `004`
- quests-progression: `001`
- settlements: `003`
- settlements-npcs: `024`
- tools: `013`
- ui-input: `008`
- world: `014`
- world-terrain: `011`

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
