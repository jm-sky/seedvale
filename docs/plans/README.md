# Plans

Implementation plans. Active work is **In progress / Planned / Todo**. New plans stay in this folder regardless of status.

Status: `in progress` 🔄 · `verification needed` 🔍 · `planned` 📋 · `todo` ⬜ · `done` ✅
Priority: 🔴 high · 🟡 medium · ⚪ low
Effort: `XS` minuty · `S` ~15–30 min · `M` ~30–90 min · `L` ~1–3 h · `XL` kilka sesji

**Depends on** = implementation prerequisites (plan IDs). ~~done~~ is crossed out. A plan is ready when every dependency is struck. Thematic overlap is not a dependency.

Paths below are files in this folder unless noted. Implementation notes / reviews stay next to the plan (`*-implementation-notes.md`, `*-review.md`) and are not indexed separately.

## Plan domains

New plans should declare a primary `domain:` in frontmatter (and, if the plan genuinely spans more than one area, optional `tags:` for the secondary domain(s)). This is **not retroactive** — the 147 existing plans (live + archived) are not being touched.

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

Plans from 2026-08-07–2026-08-14 that reached `done` or `verification needed` live in [archive/](./archive/README.md) (one-time freeze). New completed plans are **not** moved there.

---

Next ideas backlog is in `docs/plans/NEXT-IDEAS.md`

---

## In progress

| File | Summary | Pri | Effort | Depends |
|------|---------|-----|--------|---------|
| `2026-08-13--093--quests-v3-world-problems-reputation.md` | Questy z problemów świata + reputacja (nr 059 z 12.08); Etap A–G (relation levels, availability, effects, `animalId`, questy "groźny wilk" + "wilcza jama" + "zagubiona owca" + "drewno na naprawę" end-to-end, livestock `ownerHouseId`) zaimplementowane; lifecycle/identity gaps (event śmierci, `failed`/`invalidated`, dangerous wolf, `landmarkId`) domknięte przez plan 110; Etap H (drzewa/kopanie) i bandyci otwarte | 🔴 | XL | ~~015~~ ~~018~~ |
| `2026-08-17--149--shader-program-first-use-hitch.md` | Phase 0 closed; Phase 1 B confirmed and moved to plan 157 for production PointLight budget. Phase 1 A (`compileAsync` prewarm) remains unstarted and should be reassessed after 157 verification. | 🔴 | M/L | — |

---

## Planned

| File | Summary | Pri | Effort | Depends |
|------|---------|-----|--------|---------|
| `2026-08-14--104--underground-caves.md` | Prawdziwe jaskinie podziemne (`CaveVolume`, siatka 500 m); wstępny, do review | 🔴 | XL | ~~097~~ |
| `2026-08-16--126--seed-planting.md` | Sadzenie nasion drzew (rozszerza istniejący `TreeLifecycle`) i cropów (nowy prosty `CropLifecycle`) przez gracza, integracja z inventory/garden gather/persistence; wstępny | 🟡 | L | ~~106~~ ~~122~~ |
| `2026-08-16--127--player-built-well.md` | Fizyczna studnia budowana przez gracza; wstępny | 🟡 | M | ~~122~~ |
| `2026-08-18--151--social-places-and-social-behaviour.md` | Social Places v1: istniejący settlement campfire jako `PlaceType: 'social'`, NPC↔NPC `conversation` (2–5 min czasu świata) przez istniejący Schedule/FSM (activity `social`), partner tylko spośród NPC przy tym samym ognisku, symetryczna zmiana relacji NPC↔NPC; bez nowego social managera/schedulera; wstępny, do implementacji | 🟡 | M | ~~020~~ |
| `2026-08-18--152--npc-player-food-drink-help.md` | NPC dobrowolna pomoc graczowi jedzeniem/piciem z carried `NpcAgent.inventory` (V1 celowo bez `Household.stock`/`.water` i bez teleportu NPC do domu), decyzja z relacji + openness/traits + istniejący `getPlayerStanding()`/`reactionChance`, nowa opcja w dialogu NPC v2 (`request_food`/`request_water`); wstępny, do implementacji | 🟡 | M | ~~106~~ ~~069~~ ~~122~~ ~~156~~ |
| `2026-08-18--159--natural-food-fishing-preservation-and-bait.md` | Żywność naturalna, wędkowanie, zanęta, przynęta do pułapek | 🟡 | L | ~~155~~ ~~156~~ ~~106~~ |
| `2026-08-18--163--rest-mobile-ui-and-inventory-interaction-polish.md` | Odpoczynek: ekranowy `Esc` po >85% i auto-wybudzenie przy ~100%; responsywny Merchant Screen na mobile; ekranowy `Tab` do cycle target; Inventory z kategorią `Weapon` i wieloma kategoriami itemów | ✅ | S | — |
| `2026-08-18--161--weapon-maintenance-and-sharpening.md` | Weapon sharpness & flint stones | 🟡 | M | ~~155~~ ~~160~~ |
| `2026-08-18--162--bows-arrows-ranged-combat-and-critical-hits.md` | Bows and critial hits | 🟡 | L | ~~150~~ ~~155~~ |
| `2026-08-19--164--player-storage-and-container-system.md` | Players box for future companions | 🔴 | M | - |


### Fresh new

> Place for plans links

---

## Todo

| File | Summary | Pri | Effort | Depends |
|------|---------|-----|--------|---------|
| `2026-08-11--070--world-observatory.md` | Panel obserwacji życia świata | ⚪ | XL | 071, ~~069~~ |
| `2026-08-08--037--npc-genealogy-lineages.md` | Rody NPC (kompas N → ~~067~~) | ⚪ | L | ~~022~~ ~~031~~ |

---

## Verification needed

Implementation complete; needs play/browser check. This section lists **plans in this folder**. After the 2026-08-14 archive freeze it is empty; new verified-but-unplayed work belongs here.

| File | Summary | Pri | Effort | Depends |
|------|---------|-----|--------|---------|
| `2026-08-16--129--coins-and-land-sales.md` | `coin` jako drugi, prawie nieważki `ItemKind` obok istniejącej waluty barterowej `shell` (`shell` zostaje niską-wartościową walutą handlu z Kupcem; `coin` obsługuje większe kwoty — nagrody questowe 10–50 i ceny działek 500–3200, gdzie waga `shell` przekroczyłaby limit udźwigu) + nagrody `coin` w 4 questach (istniejący `QuestDef.reward`) + deterministyczne działki sprzedażowe jako nowa rola `VillagePlot.role === 'sale'` (ten sam `pickPlot`/scorer co reszta planu, bez drugiego generatora; 0–1/0–2 wg rozmiaru, cena z centralnej tabeli) + tabliczka „NA SPRZEDAŻ” (reużyty `createSignpost()` + CSS2D) + `LandOwnershipRegistry` (`settlement/landOwnership.ts`, sparse `settlementId:plotId` set) + `purchaseLandPlot()` (`settlement/landPurchase.ts`, pełna walidacja przed mutacją) + `SaveData` v14 (`ownedLandPlots`); brak skarbca osady (`SettlementEconomy` nie ma pojęcia pieniądza); techniczna weryfikacja zielona (tsc/build/test, 881 testów), bez testu w przeglądarce (patrz plan's "Implementation summary") | 🔴 | L | ~~093~~ |
| `2026-08-16--132--landmark-quests.md` | Questy landmarkowe: `ChunkManager.findLandmarkNear`/`getNearbyLandmarks` (deterministyczny, bounded ring-search resolver + loaded-chunk query, bez globalnego registry) + nowy `interact_landmark` objective (`quests.ts`/`QuestManager.ts`, dopasowanie po `landmarkId`, bez wstrzykniętego resolvera — landmarki nigdy się nie zmieniają, więc nie ma czego rebindować po reloadzie) + `[E]` interakcja (`Interactable{kind:'landmark'}`, reużywa istniejącą generyczną gałąź `gameLoop.ts`, zero zmian w `gameLoop.ts`) + 3 questy (`stare-ruiny`/Piotr, `slad-przy-monolicie`/Anna, `zapomniany-cmentarz`/Kasia), landmarkId rozwiązywany raz w `createApp.ts` przy starcie; techniczna weryfikacja zielona (tsc/build/test, 860 testów), bez testu w przeglądarce (patrz plan's "Implementation summary") | 🟡 | M | ~~049~~ ~~093~~ ~~110~~ |
| `2026-08-17--141--animal-traps.md` | Pułapki: placed world object (`PlacedTents`/`PlacedFires`), 2 rodzaje, stany `placed → active → placed/broken`, skill `traps`, save v16. Playtest 2026-08-18: **brak `Zastaw` na Inventory (Vue)** — tylko Quick Actions. Zostaje 🔍 — [implementation notes](./2026-08-17--141--animal-traps-implementation-notes.md) | 🟡 | M | ~~128~~ |
| `2026-08-15--121--footstep-sound-refresh.md` | Kroki: Anton Z default (sand/grass/stone). Playtest 2026-08-18: **sprint po trawie jak kamienny korytarz** (za głośno) — prawdopodobnie fałszywe land SFX (plan 158); po 158 playtest trawy/sprintu ma sens. Zostaje 🔍 | 🟡 | S | — |
| `2026-08-14--111--house-construction.md` | House Builder (MegaKit). Playtest 2026-08-18: **niektóre domki źle złożone** — zostaje 🔍 — [implementation notes](./2026-08-14--111--house-construction-implementation-notes.md) | 🔴 | XL | ~~109~~ |
| `2026-08-14--110--quests-v3-closure-world-identity-and-lifecycle.md` | Domknięcie planu 093: lifecycle `failed`/`invalidated`, predator `onDeath`, groźny wilk, failure owcy, `landmarkId` / rebind po save. Playtest 2026-08-18 **odłożony** — zostaje 🔍 | 🔴 | L | ~~093~~ |
| `docs/plans/2026-08-18--157--production-pointlight-budget.md` | Optymalizacja | 🔴 | M | - |
| `2026-08-18--155--inventory-item-instances-and-trap-lifecycle.md` | Generyczny mechanizm `ItemInstance`, price algo | ✅ | L | ~~141~~ |
| `2026-08-18--160--high-quality-melee-weapons.md` | Sześć HQ broni białych (`damascus_*` / `obsidian_sword` / `battle_axe` / `masterwork_sword`) w istniejącym katalogu/melee/defense; battle axe ścina drzewa; damascus knife harvestuje zwłoki; Kupiec 4 sztuki + 2 quest-only; brak GLB (M44–M49). Techniczna weryfikacja zielona (tsc/lint/build/test, 1130 testów); browser pending | 🟡 | M | ~~134~~ ~~150~~ |

Historical playtest queue (files in archive): [below](#playtest-queue-archived-batch).

---

## Done

Completed plans **in this folder**. After the 2026-08-14 archive freeze new `done` work belongs here.

| File | Summary |
|------|---------|
| `2026-08-19--165--reset-graphics-and-audio-settings.md` | Pauza → Ustawienia: Resetuj ustawienia (dźwięk 100% + preset grafiki High). |
| `2026-08-18--158--false-jump-land-sfx.md` | Slope-stick + próg land SFX; jump-land z packa terenu zamiast Kenney `footstep-01…04`. |
| `2026-08-18--150--combat-mode-defense-and-downed-state.md` | Combat mode + soft lock (`Tab` living / `Shift+Tab` world), defense resolver + skill, player `downed`; save v18 (`defense` skill); type-check/build/test zielone, browser pending. |
| `2026-08-18--156--npc-household-and-settlement-storage-logistics.md` | Fizyczny household/settlement crate + `[E]` stock (`Household` / `SettlementEconomy`); transport NPC już był (069/122/131). |
| `2026-08-18--153--mobile-playtest-fixes.md` | Mobile: well crowding, `[R]` quick-use, harvest knife, HP regen/`herb`/`bandage`, quest icons, inventory sort, `Tab` cycling. |
| `2026-08-18--154--audio-volume-controls.md` | Suwaki głośności (Wszystko / Otoczenie / Efekty) w Pauza → Ustawienia. |
| `2026-08-17--140--landscape-flora-and-village-cobble.md` | Sosny textured (`pine_1/3/5`), paproć, grzyb GLB, trzcina, pień harvestu, bruk MD+. |
| `2026-08-16--136--threejs-180-to-185-upgrade.md` | Upgrade `three` `0.180.0`→`0.185.1` (`PCFShadowMap`, `Clock`→`Timer`). |
| `2026-08-16--134--item-expansion-and-world-placement.md` | Dzida/krótki miecz, mięso per gatunek, `hide`, `cheese`/`dried_meat`; merchant/harvest, bez world spawn. |
| `2026-08-16--133--weather-surface-effects.md` | Mokry teren / kałuże / śnieg na shaderze chunka (`uWetness`/`uSnowAmount`). |
| `2026-08-16--131--natural-resource-gathering.md` | Wood deposit tylko po udanym harvestcie; NPC ore → `SettlementEconomy` (`iron`/`coal`/`gold`). |
| `2026-08-16--125--fauna-spawn-point-population-limits.md` | Lifecycle spawn pointów fauny + persistencja `SaveData` v17 `spawnPoints`. |
| `2026-08-14--105--ui-ux-review.md` | Audyt UI/UX + H1–H3 / Character / handel / `[U]`; H4 poza handlem otwarte. |
| `2026-08-08--040--seasons-weather.md` | Deterministyczny sezon/pogoda `(seed, elapsedDays)`, fog + GPU particles + rain SFX. |
| `2026-08-17--143--cross-chunk-vegetation-batching.md` | Region 3×3 vegetation batching. |
| `2026-08-17--144--water-reflection-gpu-optimization.md` | Mirror outer-ring cull (Stage S). |
| `2026-08-17--148--grass-gpu-performance.md` | Grass geometry LOD (S). |
| `2026-08-14--107--asset-browser-agent-discovery.md` | Asset Browser: search + parked MegaKit + authored scale. |
| `2026-08-14--108--npc-stuck-at-house-locomotion.md` | NPC nie utyka w/przy chatce (rim + rescue, bez moonwalku). |
| `2026-08-14--116--super-dialogue-audio-pack.md` | Dialog NPC: hello/bye/confirm, głos per NPC (5 aktorów). |
| `2026-08-11--069--npc-household-resources.md` | Gospodarstwa NPC + przepływ zasobów. Physical/interactive storage: plan 156. |
| `2026-08-14--117--npc-reaction-to-player.md` | Reakcje NPC: nie każdy auto-greet; osobowość/relacja/reputacja. |
| `2026-08-15--122--natural-resource-gathering-and-water-distribution.md` | Water: studnia → NPC → household barrel/trough. Physical/interactive storage: plan 156. |
| `2026-08-16--130--fire-lighting-polish.md` | Zapalanie z kanałem, burst/SFX tylko od gracza, iskry+żar. |
| `2026-08-16--135--campfire-glb-body.md` | Ciało ogniska `campfire_unlit.glb` + `fx/fire.glb`. |
| `2026-08-14--106--player-needs-food-and-cooking.md` | Głód/pragnienie/stamina/vigor + jedzenie/woda/gotowanie. |
| `2026-08-15--124--player-skills-sneak.md` | Skills foundation + Sneak (toggle, ×0.65 speed, animal detection). |
| `2026-08-16--128--player-skills-survival-and-camp.md` | Skills v2: XP krzywa, Survival, camp rest quality. |
| `2026-08-15--123--universal-melee-combat.md` | Uniwersalny melee: `ITEM_CATALOG[].melee` + `playerMelee.ts` windUp→hit→recovery. |
| `2026-08-15--124b--forgiving-melee-targeting-gap-close.md` | Target acquisition + gap-close (lunge ≤3 m). |
| `2026-08-17--142--mobile-combat-target-acquisition.md` | Touch: szerszy stożek + commit yaw na cel; desktop bez zmian. |
| `2026-08-14--118--fauna-stada-i-młode.md` | Stada deer/stag/boar + luźne króliki; młode pomniejszone, follow matki, dorastanie 600 s. |
| `2026-08-15--120--fauna-probabilistic-perception.md` | Percepcja: falloff dystansu × facing × dzień/noc/las, deterministyczny roll. |
| `2026-08-17--137--animal-habitat-and-carcass-visuals.md` | `[E] Zniszcz` kanał 5 s, spalony cave/thicket, czarna ziemia, ogień ~5 min; po harvestcie pozostałości ~90 s. |
| `2026-08-17--138--harvested-remains-glb.md` | Po harvestcie GLB `bones_pile` + kości + skóra + skrawki mięsa. |
| `2026-08-17--139--fauna-day-scale-respawn.md` | Respawn cave/thicket w dniach świata (jeleń 1/dzień, stag 1/2 dni), catch-up przy skipie. |
| `2026-08-14--109--megakit-construction-catalog.md` | Audyt 176 MegaKit GLB + `ConstructionCatalog` (review [009](../reviews/2026-08-14--009--megakit-construction-audit.md)); weryfikacja w przeglądarce [011](../reviews/2026-08-14--011--megakit-construction-browser-verification.md); guardrails wydajnościowe dla przyszłego `HouseBuilder` (review [012](../reviews/2026-08-14--012--perf-bottleneck-diagnosis.md)) |
| `2026-08-09--049--procedural-world-landmarks.md` | Landmarki v1: monolith / stoneCircle / smallRuins / cemetery + bias terenu |
| `2026-08-13--103--performance-diagnostics-benchmark.md` | Diagnostyka wydajności, benchmarki, profile jakości (etapy 1–4; Adaptive = później) |
| `2026-08-14--114--npc-critical-need-vigor-interrupt.md` | Krytyczna potrzeba / kolaps wigoru przerywa akcję NPC już w locie (`goTo`/`execute`); nowa opcja `critical` w `pickNeed()`, throttled check w `NpcAgent.update()`; zwykła zmiana godziny nadal nie przerywa (plan 060 dalej obowiązuje); techniczna weryfikacja zielona, bez formalnego testu w przeglądarce |
| `2026-08-14--112--chunk-streaming-hitch-optimization.md` | Rozłożenie `buildAndAttachMesh` na 1/klatkę przez istniejącą kolejkę `ChunkManager`; hitch `chunk mesh` w `?benchmark=stream` do porównania z review 012; techniczna weryfikacja zielona, brak testu w przeglądarce |
| `2026-08-14--113--rendering-performance-gpu-scaling.md` | P0/P1 (+ tani P2 LOD/cienie): tańsze N8AO na High, cień raz/klatkę, instancing palisady/krzaków, lustro 30 Hz bez NPC, agresywniejszy grass LOD; P3/P4 i merge vegetation odłożone |
| `2026-08-15--119--chunk-streaming-performance.md` | Hitchy chunk streaming: preload GLB + kolejka mesh/content (1 etap/klatkę, priorytet mesh); stampede po `await` szablonów usunięty |
| `2026-08-17--145--shadow-budget-optimization.md` | Shadow rendering: R1 pull-based fail-open dirty/budget shadow map update (`renderer.shadowMap.needsUpdate` był bezwarunkowy co klatkę, `gameLoop.ts`; nowy `render/shadowBudget.ts` reużywa `NPC_SHADOW_DISTANCE`/`FAUNA_SHADOW_DISTANCE`, zweryfikowane że `WebGLShadowMap` bezpiecznie no-opuje pominiętą klatkę) + R2 próg rozmiaru dla proceduralnych item fallbacków (`items.ts`'s `createItemMesh`, reużywa wyeksportowany `SMALL_MESH_SHADOW_THRESHOLD` z `loadGltf.ts`); analiza potwierdziła że NPC/fauna distance-based shadow filtering i terrain frustum culling już istniały (nic do zrobienia tam). |

What already landed in that period (snapshot, not a status tracker):

- **Fundament:** chunked terrain + workery + streaming/save, biomy, las jako `forestDensityAt`.
- **Osady:** `VillagePlan` → runtime, katalog domów, ogrody/pola, lokalna gospodarka (stock) + gospodarstwa NPC (069, `food`/`wood`).
- **NPC:** Place + executable schedule + vigor; dialog v2 / handel.
- **Przedmioty/świat:** inventory, held tools, kopanie/ścinanie, woda (plan 098) — szczegóły w [CATALOG](../items/CATALOG.md) / [WATER](../WATER.md) / [SETTLEMENTS](../SETTLEMENTS.md).
- **App:** `WorldBundle`, Vue Fazy 0–4 (weryfikacja w przeglądarce nadal otwarta).

---

## Playtest queue (archived batch)

Implementation complete before the 2026-08-14 freeze; files are in [archive/](./archive/). Still waiting on browser/play check.

**Osady / wioski** — `036` siting trudny teren (częściowo) · `074` katalog domów · `076` polish generatora · `077` ogrody S/M/L · `095` stóg siana + ogród poza placem · issue [029](../issues/2026-08-13--029--village-in-open-ocean.md) wioska na oceanie · `071` lokalna gospodarka osady (stock/produkcja/woodshed)

**Las / narzędzia / zbieractwo** — `058` cykl drzew · `061` dig UX · `065` GLB skały/złoża · `085` handheld lights + village torches · `086` trawa w workerze (zdrowy baseline `Simulate (ms)` potwierdzony w przeglądarce; pixel-identyczny layout nie porównany explicite) · `087` instancing roślinności/propsów (fazy 1–5+7; brak pomiaru Draw calls przed/po) · `091` odnawialne gałęzie · `096` fauna GLB / hold / światła / blood splat

**Fauna / jaskinie** — `056` głodny predator · `064` cave vs droga · `080` fauna vs footprint osady · `083` dziura w terenie przy jaskini · `094` realne jedzenie/woda dla sytości i nawodnienia

**Fizyka** — `097` opadanie przedmiotów, kolizje gracz/NPC/fauna, skok (3 fazy zaimplementowane)

**UI / audio / rest** — `059` SFX pick/drop · `075` time-skip catch-up NPC · `078` `playAt` falloff · `084` obóz + town rest · `088` asset alignment browser · `089` minimapa + mapa świata / FoW · `090` miecz/kupiec/namiot/jaskinie/kilof · `102` frame-yield budowy osady (issue 027) · `154` suwaki głośności (master / otoczenie / efekty)

**NPC** — `060` wykonywalny grafik (`eat`/`home`/`wake`) + overlay traits (`night_owl` / `fast_worker` / `sociable`) · `092` stamina (burst) + dzienny wigor / zasypianie w pracy

---

## Index completeness

Every `docs/plans/YYYY-MM-DD--NNN--*.md` in **this folder** (except `*-implementation-notes.md`, `*-review.md`, `README.md`, `archive/`) belongs in a section above, regardless of status.

New plan: `YYYY-MM-DD--{NNN}--slug.md` (next sequential NNN), a `domain:`/optional `tags:` per [Plan domains](#plan-domains) above, then a row in the matching section. Do not move completed plans into `archive/`.

---
