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
| `2026-08-13--093--quests-v3-world-problems-reputation.md` | Questy z problemów świata + reputacja (nr 059 z 12.08; nie mylić z SFX 059); Etap A–G (relation levels, availability, effects, `animalId`, questy "groźny wilk" + "wilcza jama" + "zagubiona owca" + "drewno na naprawę" end-to-end, livestock `ownerHouseId`) zaimplementowane i przetestowane; lifecycle/identity gaps (event śmierci, `failed`/`invalidated`, dangerous wolf, `landmarkId`) domknięte przez plan 110; bez weryfikacji w przeglądarce; Etap H (drzewa/kopanie) i bandyci otwarte | 🔴 | XL | ~~015~~ ~~018~~ |
| `2026-08-08--040--seasons-weather.md` | Pory roku i pogoda — deterministyczny sezon/pogoda jako czysta funkcja `(seed, elapsedDays)` (`world/weather.ts`, bez pola w save), zintegrowany z day/night + fog (`weatherVisuals.ts`) i renderingiem (`weatherParticles.ts` — od 2026-08-15 GPU `ShaderMaterial`/`Points`, domyka odejście od CPU stopgapu), `audio/weatherSounds.ts`; techniczna weryfikacja zielona, bez testu w przeglądarce i bez benchmarku wydajności (patrz [implementation notes](./2026-08-08--040--seasons-weather-implementation-notes.md)) | 🟡 | L | ~~003~~ ~~028~~ |
| `2026-08-16--133--weather-surface-effects.md` | Wet ground + puddles + snow cover jako czysta pochodna deterministycznego `(seed, elapsedDays)` weather (`weather.ts`'s `computeSurfaceWeather`), rozszerza istniejący współdzielony terrain shader (`buildChunkGeometry.ts` — `uWetness`/`uSnowAmount` uniformy, `vSlopeUp`), 0 nowych draw calli/meshy/per-chunk state; techniczna weryfikacja zielona, bez testu w przeglądarce (patrz [implementation notes](./2026-08-16--133--weather-surface-effects-implementation-notes.md)) | 🟡 | M | — |
| `2026-08-16--131--natural-resource-gathering.md` | Zbieractwo naturalnych zasobów: wood `chop → deposit` teraz warunkuje depozyt realnym sukcesem harvestu; nowy NPC ore gathering (`miner` → `ResourceDeposits` przez wstrzyknięte hooki → NPC-owy generyczny `Inventory` → `SettlementEconomy` jako nowe `iron`/`coal`/`gold` `EconomicKind`, poza `Household`); `ResourceDeposits` dogrywa też depozyty przy aktywnych osadach, nie tylko przy graczu; food bez zmian (już spełniało kryteria); techniczna weryfikacja zielona, bez testu w przeglądarce (patrz [implementation notes](./2026-08-16--131--natural-resource-gathering-implementation-notes.md)) | 🟡 | M | ~~032~~ |
| `2026-08-16--134--item-expansion-and-world-placement.md` | 10 nowych itemów: dzida/krótki miecz (wymagane, merchant stock, `ITEM_CATALOG[].melee` + `HELD_ATTACH`, brak GLB → procedural fallback), mięso per gatunek jako osobne `ItemKind` (`deer_meat`/`wolf_meat`/`boar_meat`/`rabbit_meat`/`beef`, mapowane z `AnimalAgent.def.kind` w `createApp.ts`'s `startHarvestMeat`, wszystkie gotują się do istniejącego `roasted_meat`) + `hide` jako uboczny yield harvestu, `cheese`/`dried_meat` jako Kupiec food; world placement celowo bez zmian w `createItemSpawners.ts`/`chunkItems.ts` (wszystkie `spawn: 'none'` — merchant/harvest, wzorem `long_sword`/`bread`); `InventoryScreenItemDetails.vue` rozszerzony o warunkowe staty (zasięg/szybkość ataku/efekt/wartość) + miejsce na przyszłą grafikę (fallback: ikona kategorii z `lucide-vue-next`); techniczna weryfikacja zielona (tsc/build/test, 852 testy), bez testu w przeglądarce (patrz [implementation notes](./2026-08-16--134--item-expansion-and-world-placement-implementation-notes.md)) | 🟡 | M | — |
| `2026-08-16--132--landmark-quests.md` | Questy landmarkowe: `ChunkManager.findLandmarkNear`/`getNearbyLandmarks` (deterministyczny, bounded ring-search resolver + loaded-chunk query, bez globalnego registry) + nowy `interact_landmark` objective (`quests.ts`/`QuestManager.ts`, dopasowanie po `landmarkId`, bez wstrzykniętego resolvera — landmarki nigdy się nie zmieniają, więc nie ma czego rebindować po reloadzie) + `[E]` interakcja (`Interactable{kind:'landmark'}`, reużywa istniejącą generyczną gałąź `gameLoop.ts`, zero zmian w `gameLoop.ts`) + 3 questy (`stare-ruiny`/Piotr, `slad-przy-monolicie`/Anna, `zapomniany-cmentarz`/Kasia), landmarkId rozwiązywany raz w `createApp.ts` przy starcie; techniczna weryfikacja zielona (tsc/build/test, 860 testów), bez testu w przeglądarce (patrz plan's "Implementation summary") | 🟡 | M | ~~049~~ ~~093~~ ~~110~~ |
| `2026-08-16--125--fauna-spawn-point-population-limits.md` | Lifecycle spawn pointów fauny (`active→depleted→disabled→recovering→active`) rozszerza istniejący `PreySpawner`/`createFauna`/`AnimalAgent`, bez nowego menedżera: stabilne `PreySpawner.id` (`settlementId:type`), `AnimalAgent.spawnPointId` (tylko zwierzęta z zarządzanych spawnerów), śmierć liczona raz przez istniejący `onDeath` hook, próg `>50%` (`depletionThreshold`), `[E] Zniszcz` (4 gałęzie → `disabled`, reużywa `PlacedFires`/`tintPropMaterials`/`ChunkManager.modifyTerrain`), recovery co najwyżej raz/dzień (`RECOVERY_DAYS=21`, `MIN_RECOVERY_POPULATION=2`); `wolfDen` celowo wyłączony z lifecycle (nigdy nie otrzymuje `spawnPointId`); stan spawn pointów nie jest persystowany (patrz [implementation notes](./2026-08-16--125--fauna-spawn-point-population-limits-implementation-notes.md) i [LOOSE-ENDS](./LOOSE-ENDS.md)); techniczna weryfikacja zielona (tsc/build/test, 890 testów), bez testu w przeglądarce | 🟡 | L | ~~110~~ ~~118~~ |
| `2026-08-16--129--coins-and-land-sales.md` | `coin` jako drugi, prawie nieważki `ItemKind` obok istniejącej waluty barterowej `shell` (`shell` zostaje niską-wartościową walutą handlu z Kupcem; `coin` obsługuje większe kwoty — nagrody questowe 10–50 i ceny działek 500–3200, gdzie waga `shell` przekroczyłaby limit udźwigu) + nagrody `coin` w 4 questach (istniejący `QuestDef.reward`) + deterministyczne działki sprzedażowe jako nowa rola `VillagePlot.role === 'sale'` (ten sam `pickPlot`/scorer co reszta planu, bez drugiego generatora; 0–1/0–2 wg rozmiaru, cena z centralnej tabeli) + tabliczka „NA SPRZEDAŻ” (reużyty `createSignpost()` + CSS2D) + `LandOwnershipRegistry` (`settlement/landOwnership.ts`, sparse `settlementId:plotId` set) + `purchaseLandPlot()` (`settlement/landPurchase.ts`, pełna walidacja przed mutacją) + `SaveData` v14 (`ownedLandPlots`); brak skarbca osady (`SettlementEconomy` nie ma pojęcia pieniądza); techniczna weryfikacja zielona (tsc/build/test, 881 testów), bez testu w przeglądarce (patrz plan's "Implementation summary") | 🔴 | L | ~~093~~ |
| `2026-08-16--136--threejs-180-to-185-upgrade.md` | Upgrade `three` `0.180.0`→`0.185.1` przez cały Migration Guide r180→r185: audyt potwierdził tylko 2 realnie używane API (`PCFSoftShadowMap`→`PCFShadowMap` w `createRenderer.ts`; `Clock`→`Timer` w `gameLoop.ts` + prototype-patch dialogue slowdown w `dialogueTimeControl.ts`), reszta (PMREM/PBR to visual-only, WebGPU node API/`FirstPersonControls`/`SVGLoader`/`DRACOLoader`/pixel storage/env rotation nieużywane) bez zmian kodu; `@types/three` już był na `0.185.4`; techniczna weryfikacja zielona (tsc/build/test 892 testy, lint — 12 pre-existing błędów niezwiązanych potwierdzonych na `main`), bez testu w przeglądarce/benchmarku streamingu (patrz [implementation notes](./2026-08-16--136--threejs-180-to-185-upgrade-implementation-notes.md)) | 🟡 | M | — |
| `2026-08-17--149--shader-program-first-use-hitch.md` | First-use shader/program hitch przy streamingu chunków (frame max / liczba hitchy, nie średni FPS); Phase 0 zamknięte — instrumentacja + real-GPU census ×3 na Intel Arc 140V ([review 021](../reviews/2026-08-18--021--plan-149-phase-0-real-gpu.md)): ~225–241 programów, hitch 1.6–6 s skorelowany z `programDelta>0` na mirror/postprocess, plateau po first-use family; rekomendacja A (loading-time prewarm), najpierw dump `cacheKey`; Phase 1 niezaczęte (patrz [implementation notes](./2026-08-17--149--shader-program-first-use-hitch-implementation-notes.md)) | 🔴 | M/L | — |

---

## Planned

| File | Summary | Pri | Effort | Depends |
|------|---------|-----|--------|---------|
| `2026-08-17--140--landscape-flora-and-village-cobble.md` | Sosny textured (3× `PineTree_*` FBX), paproć/grzyb w wilgotnym lesie, trzcina przy brzegu, pień po harvestcie, oszczędny bruk MD+; wierzba jeśli będzie textured GLB | 🟡 | L | ~~024~~ ~~073~~ ~~101~~ |
| `2026-08-14--104--underground-caves.md` | Prawdziwe jaskinie podziemne (`CaveVolume`, siatka 500 m); wstępny, do review | 🔴 | XL | ~~097~~ |
| `2026-08-16--126--seed-planting.md` | Sadzenie nasion drzew (rozszerza istniejący `TreeLifecycle`) i cropów (nowy prosty `CropLifecycle`) przez gracza, integracja z inventory/garden gather/persistence; wstępny | 🟡 | L | ~~106~~ ~~122~~ |
| `2026-08-16--127--player-built-well.md` | Fizyczna studnia budowana przez gracza; wstępny | 🟡 | M | ~~122~~ |
| `2026-08-18--151--social-places-and-social-behaviour.md` | Social Places v1: istniejący settlement campfire jako `PlaceType: 'social'`, NPC↔NPC `conversation` (2–5 min czasu świata) przez istniejący Schedule/FSM (activity `social`), partner tylko spośród NPC przy tym samym ognisku, symetryczna zmiana relacji NPC↔NPC; bez nowego social managera/schedulera; wstępny, do implementacji | 🟡 | M | ~~020~~ |
| `2026-08-18--152--npc-player-food-drink-help.md` | NPC dobrowolna pomoc graczowi jedzeniem/piciem z carried `NpcAgent.inventory` (V1 celowo bez `Household.stock`/`.water` i bez teleportu NPC do domu), decyzja z relacji + openness/traits + istniejący `getPlayerStanding()`/`reactionChance`, nowa opcja w dialogu NPC v2 (`request_food`/`request_water`); wstępny, do implementacji | 🟡 | M | ~~106~~ ~~069~~ ~~122~~ |
| `2026-08-18--150--combat-mode-defense-and-downed-state.md` | Combat mode + soft lock (`Tab` living / `Shift+Tab` world), obrona z skillu bojowego, stan `downed`; bez regeneracji HP/apteczek; wstępny | 🔴 | L | ~~123~~ ~~124b~~ |
| `2026-08-18--153--mobile-playtest-fixes.md` | Mobile playtest: NPC przy studni, interakcje/harvest, health, quest „Wypatrz jelenia”, skill HUD, cycling kandydatów, inventory sort; combat poza zakresem | 🟡 | M | — |


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
| `2026-08-14--105--ui-ux-review.md` | Audyt UI/UX ✅ ([review 007](../reviews/2026-08-14--007--ui-ux.md)); H1–H3 + Character + handel 2-kolumnowy + przycisk Umiejętności `[U]` zaimplementowane, bez weryfikacji w przeglądarce (§11–§12); H4 poza handlem otwarte | 🟡 | L | ~~046~~ ~~005~~ ~~023~~ |
| `2026-08-17--145--shadow-budget-optimization.md` | Shadow rendering: R1 pull-based fail-open dirty/budget shadow map update (`renderer.shadowMap.needsUpdate` był bezwarunkowy co klatkę, `gameLoop.ts`; nowy `render/shadowBudget.ts` reużywa `NPC_SHADOW_DISTANCE`/`FAUNA_SHADOW_DISTANCE`, zweryfikowane że `WebGLShadowMap` bezpiecznie no-opuje pominiętą klatkę) + R2 próg rozmiaru dla proceduralnych item fallbacków (`items.ts`'s `createItemMesh`, reużywa wyeksportowany `SMALL_MESH_SHADOW_THRESHOLD` z `loadGltf.ts`); analiza potwierdziła że NPC/fauna distance-based shadow filtering i terrain frustum culling już istniały (nic do zrobienia tam). Techniczna weryfikacja zielona (tsc/lint/build/test, 997 testów, +10 nowych); brak testu w przeglądarce i brak benchmarku — [implementation notes](./2026-08-17--145--shadow-budget-optimization-implementation-notes.md) | 🟡 | M | — |
| `2026-08-17--141--animal-traps.md` | Pułapki: placed world object (`PlacedTents`/`PlacedFires`), 2 rodzaje, stany `placed → active → placed/broken`, skill `traps`, save v16. Playtest 2026-08-18: **brak `Zastaw` na Inventory (Vue)** — tylko Quick Actions. Zostaje 🔍 — [implementation notes](./2026-08-17--141--animal-traps-implementation-notes.md) | 🟡 | M | ~~128~~ |
| `2026-08-15--121--footstep-sound-refresh.md` | Kroki: Anton Z default (sand/grass/stone). Playtest 2026-08-18: **sprint po trawie jak kamienny korytarz** (za głośno). Zostaje 🔍 | 🟡 | S | — |
| `2026-08-15--119--chunk-streaming-performance.md` | Hitchy chunk streaming: preload GLB + kolejka mesh/content (1 etap/klatkę, priorytet mesh); stampede po `await` szablonów usunięty; techniczna weryfikacja zielona, brak `?benchmark=*` vs review 015 / capture planu | 🔴 | M | ~~112~~ |
| `2026-08-14--113--rendering-performance-gpu-scaling.md` | P0/P1 (+ tani P2 LOD/cienie): tańsze N8AO na High, cień raz/klatkę, instancing palisady/krzaków, lustro 30 Hz bez NPC, agresywniejszy grass LOD; P3/P4 i merge vegetation odłożone; techniczna weryfikacja zielona, brak `?benchmark=*` vs review 012 | 🔴 | L | ~~112~~ |
| `2026-08-14--112--chunk-streaming-hitch-optimization.md` | Rozłożenie `buildAndAttachMesh` na 1/klatkę przez istniejącą kolejkę `ChunkManager`; hitch `chunk mesh` w `?benchmark=stream` do porównania z review 012; techniczna weryfikacja zielona, brak testu w przeglądarce | 🔴 | M | — |
| `2026-08-14--111--house-construction.md` | House Builder (MegaKit). Playtest 2026-08-18: **niektóre domki źle złożone** — zostaje 🔍 — [implementation notes](./2026-08-14--111--house-construction-implementation-notes.md) | 🔴 | XL | ~~109~~ |
| `2026-08-13--103--performance-diagnostics-benchmark.md` | Diagnostyka wydajności, benchmarki, profile jakości (etapy 1–4; Adaptive = później) | 🔴 | XL | — |
| `2026-08-14--110--quests-v3-closure-world-identity-and-lifecycle.md` | Domknięcie planu 093: lifecycle `failed`/`invalidated`, predator `onDeath`, groźny wilk, failure owcy, `landmarkId` / rebind po save. Playtest 2026-08-18 **odłożony** — zostaje 🔍 | 🔴 | L | ~~093~~ |

Historical playtest queue (files in archive): [below](#playtest-queue-archived-batch).

---

## Done

Completed plans **in this folder**. After the 2026-08-14 archive freeze new `done` work belongs here.

| File | Summary |
|------|---------|
| `2026-08-17--143--cross-chunk-vegetation-batching.md` | Region 3×3 vegetation batching. |
| `2026-08-17--144--water-reflection-gpu-optimization.md` | Mirror outer-ring cull (Stage S). |
| `2026-08-17--148--grass-gpu-performance.md` | Grass geometry LOD (S). |
| `2026-08-14--107--asset-browser-agent-discovery.md` | Asset Browser: search + parked MegaKit + authored scale. |
| `2026-08-14--108--npc-stuck-at-house-locomotion.md` | NPC nie utyka w/przy chatce (rim + rescue, bez moonwalku). |
| `2026-08-14--116--super-dialogue-audio-pack.md` | Dialog NPC: hello/bye/confirm, głos per NPC (5 aktorów). |
| `2026-08-11--069--npc-household-resources.md` | Gospodarstwa NPC + przepływ zasobów. (limited observability) |
| `2026-08-14--117--npc-reaction-to-player.md` | Reakcje NPC: nie każdy auto-greet; osobowość/relacja/reputacja. |
| `2026-08-15--122--natural-resource-gathering-and-water-distribution.md` | Water: studnia → NPC → household barrel/trough. (limited observability) |
| `2026-08-16--130--fire-lighting-polish.md` | Zapalanie z kanałem, burst/SFX tylko od gracza, iskry+żar. |
| `2026-08-16--135--campfire-glb-body.md` | Ciało ogniska `campfire_unlit.glb` + `fx/fire.glb`. |
| `2026-08-14--106--player-needs-food-and-cooking.md` | Głód/pragnienie/stamina/vigor + jedzenie/woda/gotowanie. |
| `2026-08-15--124--player-skills-sneak.md` | Skills foundation + Sneak (toggle, ×0.65 speed, animal detection). |
| `2026-08-16--128--player-skills-survival-and-camp.md` | Skills v2: XP krzywa, Survival, camp rest quality. |
| `2026-08-15--123--universal-melee-combat.md` | Uniwersalny melee: `ITEM_CATALOG[].melee` + `playerMelee.ts` windUp→hit→recovery. |
| `2026-08-15--124b--forgiving-melee-targeting-gap-close.md` | Target acquisition + gap-close (lunge ≤3 m). |
| `2026-08-17--142--mobile-combat-target-acquisition.md` | Touch: szerszy stożek + commit yaw na cel; desktop bez zmian. |
| `2026-08-14--118--fauna-stada-i-mlode.md` | Stada deer/stag/boar + luźne króliki; młode pomniejszone, follow matki, dorastanie 600 s. |
| `2026-08-15--120--fauna-probabilistic-perception.md` | Percepcja: falloff dystansu × facing × dzień/noc/las, deterministyczny roll. |
| `2026-08-17--137--animal-habitat-and-carcass-visuals.md` | `[E] Zniszcz` kanał 5 s, spalony cave/thicket, czarna ziemia, ogień ~5 min; po harvestcie pozostałości ~90 s. |
| `2026-08-17--138--harvested-remains-glb.md` | Po harvestcie GLB `bones_pile` + kości + skóra + skrawki mięsa. |
| `2026-08-17--139--fauna-day-scale-respawn.md` | Respawn cave/thicket w dniach świata (jeleń 1/dzień, stag 1/2 dni), catch-up przy skipie. |
| `2026-08-14--109--megakit-construction-catalog.md` | Audyt 176 MegaKit GLB + `ConstructionCatalog` (review [009](../reviews/2026-08-14--009--megakit-construction-audit.md)); weryfikacja w przeglądarce [011](../reviews/2026-08-14--011--megakit-construction-browser-verification.md); guardrails wydajnościowe dla przyszłego `HouseBuilder` (review [012](../reviews/2026-08-14--012--perf-bottleneck-diagnosis.md)) |
| `2026-08-09--049--procedural-world-landmarks.md` | Landmarki v1: monolith / stoneCircle / smallRuins / cemetery + bias terenu |
| `2026-08-14--114--npc-critical-need-vigor-interrupt.md` | Krytyczna potrzeba / kolaps wigoru przerywa akcję NPC już w locie (`goTo`/`execute`); nowa opcja `critical` w `pickNeed()`, throttled check w `NpcAgent.update()`; zwykła zmiana godziny nadal nie przerywa (plan 060 dalej obowiązuje); techniczna weryfikacja zielona, bez formalnego testu w przeglądarce |

Older completed work: [archive/README.md](./archive/README.md).

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

**UI / audio / rest** — `059` SFX pick/drop · `075` time-skip catch-up NPC · `078` `playAt` falloff · `084` obóz + town rest · `088` asset alignment browser · `089` minimapa + mapa świata / FoW · `090` miecz/kupiec/namiot/jaskinie/kilof · `102` frame-yield budowy osady (issue 027)

**NPC** — `060` wykonywalny grafik (`eat`/`home`/`wake`) + overlay traits (`night_owl` / `fast_worker` / `sociable`) · `092` stamina (burst) + dzienny wigor / zasypianie w pracy

---

## Index completeness

Every `docs/plans/YYYY-MM-DD--NNN--*.md` in **this folder** (except `*-implementation-notes.md`, `*-review.md`, `README.md`, `archive/`) belongs in a section above, regardless of status.

New plan: `YYYY-MM-DD--{NNN}--slug.md` (next sequential NNN), a `domain:`/optional `tags:` per [Plan domains](#plan-domains) above, then a row in the matching section. Do not move completed plans into `archive/`.

---

## Quick notes / bugs

- **Czarny świat 3D na telefonie** — issue [032](../issues/2026-08-15--032--mobile-black-world-screen.md): boom kamery w terenie/domu + 0-size composer. Fix w kodzie; playtest: wioska, look-up, orbit przy dachach, obrót telefonu, `?camdebug=1`.
- **NPC utyka w/przy domku** — P0+P1 planu [108](./2026-08-14--108--npc-stuck-at-house-locomotion.md) w kodzie; playtest w `?debug=1` otwarty.
- **Światło w domach** — `findWallMount` raycastuje bryłę; 2026-08-11: nadal nierówne, potrzeba mapowania per model.
- **Latające obiekty** — `waitForChunks` przed propsami osady; 2026-08-11: nadal nieidealne.
- **Morze (telefon)** — artefakty krawędzi, plamy; spróbować bardziej przezroczystej wody.
- **Woda** — plan [098](./archive/2026-08-13--098--water-unified-shader-shore-reflections.md) `done` (2026-08-13). Telefon: off odbić jako ucieczka od artefaktów krawędzi (notatka wyżej).

## Audits (not implementation plans)

| File | Summary | Date |
|------|---------|------|
| `2026-08-14--asset-audit-3d-models.md` | Możliwości GLB/GLTF (drzwi, szkielety, klipy, packi Quaternius) + rekomendacja pipeline’u | 2026-08-14 |

Related review (tool, not GLB capability): [008 — Asset Browser × modular cottage](../reviews/2026-08-14--008--asset-browser-modular-cottage.md); implementation: [107](./2026-08-14--107--asset-browser-agent-discovery.md).

## Related

`docs/research/README.md` · `docs/reviews/README.md` · `docs/issues/README.md` · [archive/README.md](./archive/README.md)
