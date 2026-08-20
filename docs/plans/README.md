# Plans — Current Planning Map

Implementation plans. This file is the **current planning map**: backlog, dependencies, active threads and verification queue. Detailed implementation lives in the plan files; history lives in [archive/](./archive/README.md). New plans stay in this folder regardless of status.

Status: `in progress` 🔄 · `verification needed` 🔍 · `planned` 📋 · `todo` ⬜ · `done` ✅
Priority: 🔴 high · 🟡 medium · ⚪ low
Effort: `XS` minuty · `S` ~15–30 min · `M` ~30–90 min · `L` ~1–3 h · `XL` kilka sesji

**Depends on** = implementation prerequisites (plan IDs). ~~done~~ is crossed out. A plan is ready when every dependency is struck. Thematic overlap is not a dependency.

Paths below are files in this folder unless noted. Implementation notes / reviews stay next to the plan (`*-implementation-notes.md`, `*-review.md`) and are not indexed separately.

## Plan domains

New plans should declare a primary `domain:` in frontmatter (and, if the plan genuinely spans more than one area, optional `tags:` for the secondary domain(s)). This is **not retroactive** — existing plans (live + archived) are not being touched.

Canonical domains (match [docs/STATE.md](../STATE.md)'s section headers, so a domain always maps onto exactly one part of the current-state doc):

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

Next ideas backlog is in [docs/plans/NEXT-IDEAS.md](./NEXT-IDEAS.md). Loose ends (blockers/spun-off ideas found mid-plan) are in [docs/plans/LOOSE-ENDS.md](./LOOSE-ENDS.md).

---

## Active threads

High-level map of how the current backlog chains together. Not a replacement for the `Depends on` column — a quick orientation for where a new plan would slot in. Only current/still-relevant chains; entries in parens are done — either kept as [Recent context](#recent-context) or already moved to [archive/](./archive/README.md).

```text
Combat & weapons
  (155 inventory instances) → (160 HQ melee) → 161 weapon maintenance
  (150 combat mode) + (155) → 162 bows/ranged

Household economy & storage
  (106 food/cooking) + (069 household resources) + (122 water distribution) → (156 storage logistics)
      → 152 NPC food/drink help
      → 159 fishing/preservation/bait
  (122) → 126 seed planting, 127 player-built well

World-driven quests
  (049 landmarks, archived) + 093 quests-v3 (in progress) + (110 quests-v3 closure) → 132 landmark quests [verification needed]

Rendering performance
  (157 PointLight budget 16, archived) → 149 shader program first-use hitch [in progress]

Construction & lodging
  (109 megakit catalog) → 111 house construction [verification needed — assembly bug from playtest]
      → 169 house interior furniture/bed anchors
  165 vigor/hunger/thirst/rest → 168 settlement lodging/sleep → 169 house interior furniture/bed anchors

NPC diagnostics
  170 NPC simulation inspector/trace observes needs + decisions + actions + interaction queues across the existing NPC systems
```

---

## In progress

| File | Summary | Pri | Effort | Depends |
|------|---------|-----|--------|---------|
| `2026-08-13--093--quests-v3-world-problems-reputation.md` | Questy z problemów świata + reputacja (nr 059 z 12.08); Etap A–G (relation levels, availability, effects, `animalId`, questy "groźny wilk" + "wilcza jama" + "zagubiona owca" + "drewno na naprawę" end-to-end, livestock `ownerHouseId`) zaimplementowane; lifecycle/identity gaps (event śmierci, `failed`/`invalidated`, dangerous wolf, `landmarkId`) domknięte przez plan `110` (done, kept as [recent context](#recent-context)); Etap H (drzewa/kopanie) i bandyci otwarte | 🔴 | XL | ~~015~~ ~~018~~ |
| `2026-08-17--149--shader-program-first-use-hitch.md` | Phase 0 closed; Phase 1 B production PointLight budget **16** landed in ~~157~~. Phase 1 A (`compileAsync` loading-window prewarm) **implemented + real-GPU verified** ([review 025](../reviews/2026-08-19--025--plan-149-phase-1a-compileasync-prewarm.md)). Phase C leftover: `Green` / `MI_WindowGlass` / `Wood`. Plan not `done`. | 🔴 | M/L | — |

---

## Planned

| File | Summary | Pri | Effort | Depends |
|------|---------|-----|--------|---------|
| `2026-08-18--159--natural-food-fishing-preservation-and-bait.md` | Żywność naturalna, wędkowanie, zanęta, przynęta do pułapek | 🟡 | L | ~~155~~ ~~156~~ ~~106~~ |
| `2026-08-18--162--bows-arrows-ranged-combat-and-critical-hits.md` | Bows and critial hits | 🟡 | L | ~~150~~ ~~155~~ |
| `2026-08-19--165--vigor-hunger-thirst-and-rest.md` | Urealnić zachowanie Vigor, Hunger i Thirst | 🟡 | M | - |
| `2026-08-19--164--player-storage-and-container-system.md` | Players box for future companions | 🔴 | M | - |
| `2026-08-19--168--settlement-lodging-and-sleep.md` | Nocowanie w osadzie: wybór łóżka, przyjaciela, płatnego noclegu lub siana; „Nocuj w mieście” prowadzi gracza do miejsca i dopiero wtedy uruchamia sen | 🔴 | L | ~~165~~ |
| `2026-08-19--169--house-interior-furniture-and-bed-anchors.md` | Wyposażenie domów w łóżko, stół, lampę i skrzynię z authorowaniem placementu przez Asset Alignment Browser; łóżko dostarcza miejsce noclegu dla planu 168 | 🟡 | L | ~~168~~ ~~111~~ |
| `2026-08-18--151--social-places-and-social-behaviour.md` | Social Places v1: istniejący settlement campfire jako `PlaceType: 'social'`, NPC↔NPC `conversation` (2–5 min czasu świata) przez istniejący Schedule/FSM (activity `social`), partner tylko spośród NPC przy tym samym ognisku, symetryczna zmiana relacji NPC↔NPC; bez nowego social managera/schedulera; wstępny, do implementacji | 🟡 | M | ~~020~~ |
| `2026-08-18--161--weapon-maintenance-and-sharpening.md` | Weapon sharpness & flint stones | 🟡 | M | ~~155~~ ~~160~~ |
| `2026-08-16--126--seed-planting.md` | Sadzenie nasion drzew (rozszerza istniejący `TreeLifecycle`) i cropów (nowy prosty `CropLifecycle`) przez gracza, integracja z inventory/garden gather/persistence; wstępny | 🟡 | L | ~~106~~ ~~122~~ |
| `2026-08-16--127--player-built-well.md` | Fizyczna studnia budowana przez gracza; wstępny | 🟡 | M | ~~122~~ |
| `2026-08-18--152--npc-player-food-drink-help.md` | NPC dobrowolna pomoc graczowi jedzeniem/piciem z carried `NpcAgent.inventory` (V1 celowo bez `Household.stock`/`.water` i bez teleportu NPC do domu), decyzja z relacji + openness/traits + istniejący `getPlayerStanding()`/`reactionChance`, nowa opcja w dialogu NPC v2 (`request_food`/`request_water`); wstępny, do implementacji | 🟡 | M | ~~106~~ ~~069~~ ~~122~~ ~~156~~ |
| `2026-08-19--167--npc-helper-resource-delivery.md` | NPC who gathers food for player | 🟡 | M | 164 |
| `2026-08-14--104--underground-caves.md` | Prawdziwe jaskinie podziemne (`CaveVolume`, siatka 500 m); wstępny, do review | 🟡 | XL | ~~097~~ |

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

| File | Summary | Pri | Effort | Depends |
|------|---------|-----|--------|---------|
| `2026-08-14--111--house-construction.md` | House Builder (MegaKit). Playtest 2026-08-18: **niektóre domki źle złożone** — wymaga poprawy assembly — [implementation notes](./2026-08-14--111--house-construction-implementation-notes.md) | 🔴 | XL | ~~109~~ |
| `2026-08-16--129--coins-and-land-sales.md` | `coin` jako drugi, prawie nieważki `ItemKind` obok istniejącej waluty barterowej `shell` (`shell` zostaje niską-wartościową walutą handlu z Kupcem; `coin` obsługuje większe kwoty — nagrody questowe 10–50 i ceny działek 500–3200, gdzie waga `shell` przekroczyłaby limit udźwigu) + nagrody `coin` w 4 questach (istniejący `QuestDef.reward`) + deterministyczne działki sprzedażowe jako nowa rola `VillagePlot.role === 'sale'` (ten sam `pickPlot`/scorer co reszta planu, bez drugiego generatora; 0–1/0–2 wg rozmiaru, cena z centralnej tabeli) + tabliczka „NA SPRZEDAŻ” (reużyty `createSignpost()` + CSS2D) + `LandOwnershipRegistry` (`settlement/landOwnership.ts`, sparse `settlementId:plotId` set) + `purchaseLandPlot()` (`settlement/landPurchase.ts`, pełna walidacja przed mutacją) + `SaveData` v14 (`ownedLandPlots`); brak skarbca osady (`SettlementEconomy` nie ma pojęcia pieniądza); techniczna weryfikacja zielona (tsc/build/test, 881 testów), bez testu w przeglądarce (patrz plan's "Implementation summary") | 🔴 | L | ~~093~~ |
| `2026-08-16--132--landmark-quests.md` | Questy landmarkowe: `ChunkManager.findLandmarkNear`/`getNearbyLandmarks` (deterministyczny, bounded ring-search resolver + loaded-chunk query, bez globalnego registry) + nowy `interact_landmark` objective (`quests.ts`/`QuestManager.ts`, dopasowanie po `landmarkId`, bez wstrzykniętego resolvera — landmarki nigdy się nie zmieniają, więc nie ma czego rebindować po reloadzie) + `[E]` interakcja (`Interactable{kind:'landmark'}`, reużywa istniejącą generyczną gałąź `gameLoop.ts`, zero zmian w `gameLoop.ts`) + 3 questy (`stare-ruiny`/Piotr, `slad-przy-monolicie`/Anna, `zapomniany-cmentarz`/Kasia), landmarkId rozwiązywany raz w `createApp.ts` przy starcie; techniczna weryfikacja zielona (tsc/build/test, 860 testów), bez testu w przeglądarce (patrz plan's "Implementation summary") | 🟡 | M | ~~049~~ ~~093~~ ~~110~~ |
| `2026-08-19--170--npc-simulation-inspector-and-trace.md` | NPC Simulation Inspector: `NpcTraceEvent` bounded ring buffer (150/agent) instrumented at authoritative `NpcAgent` transitions, read-only `createInspectionSnapshot()`/`why()` (pure `projectNpcWhy()`), `window.seedvale.debug.npc(id)`/`.npcs(filter)` console API, debug-only vanilla-DOM inspector modal + freeze/re-evaluate controls; **Ctrl+click adapted to Ctrl+mousedown-while-gazing** (pointer-lock FPS has no cursor raycast) — see plan's "Implementation summary"; techniczna weryfikacja zielona (tsc/lint/build/test, 1188 testów), bez testu w przeglądarce | 🔴 | L | - |

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

---

## Index completeness

Every `docs/plans/YYYY-MM-DD--NNN--*.md` in **this folder** (except `*-implementation-notes.md`, `*-review.md`, `README.md`, `NEXT-IDEAS.md`, `LOOSE-ENDS.md`, `archive/`) belongs in exactly one section above (`In progress` / `Planned` / `Todo` / `Verification needed` / `Recent context`), regardless of status.

New plan: `YYYY-MM-DD--{NNN}--slug.md` (next sequential NNN), a `domain:`/optional `tags:` per [Plan domains](#plan-domains) above, then a row in the matching section. When a plan reaches `done` and nothing above still depends on it, it stays here until the next archive snapshot — do not move it to `archive/` yourself; that only happens as a deliberate periodic snapshot (see [archive/README.md](./archive/README.md)).

---
