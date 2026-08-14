# Plans

Implementation plans. Active work is **In progress / Planned / Todo**. New plans stay in this folder regardless of status.

Status: `in progress` 🔄 · `verification needed` 🔍 · `planned` 📋 · `todo` ⬜ · `done` ✅  
Priority: 🔴 high · 🟡 medium · ⚪ low  
Effort: `XS` minuty · `S` ~15–30 min · `M` ~30–90 min · `L` ~1–3 h · `XL` kilka sesji

**Depends on** = implementation prerequisites (plan IDs). ~~done~~ is crossed out. A plan is ready when every dependency is struck. Thematic overlap is not a dependency.

Paths below are files in this folder unless noted. Implementation notes / reviews stay next to the plan (`*-implementation-notes.md`, `*-review.md`) and are not indexed separately.

Plans from 2026-08-07–2026-08-14 that reached `done` or `verification needed` live in [archive/](./archive/README.md) (one-time freeze). New completed plans are **not** moved there.

---

## In progress

| File | Summary | Pri | Effort | Depends |
|------|---------|-----|--------|---------|
| `2026-08-14--105--ui-ux-review.md` | Audyt UI/UX ✅ ([review 007](../reviews/2026-08-14--007--ui-ux.md)); H1+H2(2/3)+ekran Character zaimplementowane, bez weryfikacji w przeglądarce (§11); H2.1/H3/H4 otwarte | 🟡 | L | ~~046~~ ~~005~~ ~~023~~ |
| `2026-08-13--093--quests-v3-world-problems-reputation.md` | Questy z problemów świata + reputacja (nr 059 z 12.08; nie mylić z SFX 059); Etap A–G (relation levels, availability, effects, `animalId`, questy "groźny wilk" + "wilcza jama" + "zagubiona owca" + "drewno na naprawę" end-to-end, livestock `ownerHouseId`) zaimplementowane i przetestowane; lifecycle/identity gaps (event śmierci, `failed`/`invalidated`, dangerous wolf, `landmarkId`) domknięte przez plan 110; bez weryfikacji w przeglądarce; Etap H (drzewa/kopanie) i bandyci otwarte | 🔴 | XL | ~~015~~ ~~018~~ |

---

## Planned

| File | Summary | Pri | Effort | Depends |
|------|---------|-----|--------|---------|
| `2026-08-14--112--chunk-streaming-hitch-optimization.md` | Rozłożenie kosztu `buildAndAttachMesh` na wiele klatek przez istniejący scheduler; cel: mniej i krótsze hitchy `chunk mesh` w benchmarku `stream` | 🔴 | M | — |
| `2026-08-14--104--underground-caves.md` | Prawdziwe jaskinie podziemne (`CaveVolume`, siatka 500 m); wstępny, do review | 🔴 | XL | ~~097~~ |
| `2026-08-08--040--seasons-weather.md` | Pory roku i pogoda | 🟡 | XL | ~~003~~ ~~028~~ |

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
| `2026-08-14--111--house-construction.md` | House Builder: składanie domów z MegaKit Construction Catalog, instancing/batch statycznych części, drzwi z hinge pivotem, integracja z `buildSettlementProps`; techniczna weryfikacja zielona; brak testu w przeglądarce / `?perf=1` | 🔴 | XL | ~~109~~ |
| `2026-08-14--108--npc-stuck-at-house-locomotion.md` | NPC utyka w/przy domku (drewno, woda) — P0+P1 zaimplementowane (cel na obręczy, rescue na zewnątrz, bez moonwalku); brak testu w przeglądarce | 🔴 | M | ~~097~~ |
| `2026-08-14--107--asset-browser-agent-discovery.md` | Asset Browser: search + parked MegaKit + authored scale (review [008](../reviews/2026-08-14--008--asset-browser-modular-cottage.md)); v1 zaimplementowane, bez weryfikacji w przeglądarce | 🟡 | M | ~~088~~ |
| `2026-08-13--103--performance-diagnostics-benchmark.md` | Diagnostyka wydajności, benchmarki, profile jakości (etapy 1–4; Adaptive = później) | 🔴 | XL | — |
| `2026-08-14--106--player-needs-food-and-cooking.md` | Głód/pragnienie/stamina/vigor gracza + jedzenie/woda/gotowanie — zaimplementowane, techniczna weryfikacja zielona; brak testu w przeglądarce | 🔴 | L | — |
| `2026-08-11--069--npc-household-resources.md` | Gospodarstwa NPC + przepływ zasobów — zaimplementowane, techniczna weryfikacja zielona; brak testu w przeglądarce | 🟡 | L | ~~060~~ ~~071~~ |
| `2026-08-14--110--quests-v3-closure-world-identity-and-lifecycle.md` | Domknięcie planu 093: lifecycle `failed`/`invalidated`, generyczny sygnał śmierci zwierzęcia (predator kills), trait "groźny wilk", failure "zagubionej owcy", stabilne `landmarkId` (tylko pole, bez rejestru), rebind/invalidate animal target po save/load — zaimplementowane, techniczna weryfikacja zielona; brak testu w przeglądarce | 🔴 | L | ~~093~~ |

Historical playtest queue (files in archive): [below](#playtest-queue-archived-batch).

---

## Done

Completed plans **in this folder**. After the 2026-08-14 archive freeze new `done` work belongs here.

| File | Summary |
|------|---------|
| `2026-08-14--109--megakit-construction-catalog.md` | Audyt 176 MegaKit GLB + `ConstructionCatalog` (review [009](../reviews/2026-08-14--009--megakit-construction-audit.md)); weryfikacja w przeglądarce [011](../reviews/2026-08-14--011--megakit-construction-browser-verification.md) |
| `2026-08-09--049--procedural-world-landmarks.md` | Landmarki v1: monolith / stoneCircle / smallRuins / cemetery + bias terenu |

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

New plan: `YYYY-MM-DD--{NNN}--slug.md` (next sequential NNN), then a row in the matching section. Do not move completed plans into `archive/`.

---

## Quick notes / bugs

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
