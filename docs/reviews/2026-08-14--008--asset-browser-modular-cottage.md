# Review 008: Asset Browser jako narzędzie agenta — case study jednego domku

**Status:** `done`  
**Date:** 2026-08-14  
**Scope:** czy obecny Asset Browser (`/asset-browser.html`, `src/tools/assetBrowser/`, `src/assets/assetIndex.ts`) pozwala kolejnemu agentowi **znaleźć, ocenić i dobrać** części do jednego prostego domku z modularnych elementów.  
**Nie w zakresie:** system modularnych budynków, zmiana settlement generation, produkcja nowych GLB, migracja MegaKit do runtime.  
**Powiązane:** [audyt możliwości assetów](../plans/2026-08-14--asset-audit-3d-models.md), [plan 088](../plans/archive/2026-08-12--088--asset-alignment-browser.md), [ANCHORS](../assets/ANCHORS.md), [megakit/README](../../public/models/settlement/megakit/README.md)  
**Follow-up implementacyjny:** [plan 107](../plans/2026-08-14--107--asset-browser-agent-discovery.md) (nie zrobiony w tej sesji)

**Metoda:** praca jak kolejny agent Seedvale — bez zgadywania nazw plików z pamięci. Kolejność: dokumenty → registry `buildAssetIndex()` → UI browsera → manifest `/asset-browser-models.json` → Free URL → pomiar natywnego AABB/materiałów/tris z GLB (Three.js + Meshopt w stronie) → próba porównania wariantów w UI.

Środowisko: Vite `localhost:5577`, Cursor browser na `/asset-browser.html`.

---

## Werdykt

**Fix first.** Obecny Asset Browser **nie jest wystarczający**, żeby agent rozpoczął większą pracę nad modularnymi domami.

Narzędzie jest dobre w tym, do czego powstało (plan 088): **alignment pary reference/target** (głównie postać + trzymany przedmiot, lampa na `lamp_mount`). Nie jest katalogiem semanticznym ani przeglądarką kitu budowlanego.

Same parked kawałki MegaKit **są** modularne w skali (ściany 2.00 × 3.12 × 0.41 m). Browser tego nie pokazuje — a Free URL aktywnie **kłamie o skali**. Z parked zestawu **nie da się** złożyć kompletnego domku (brak dachu, narożnika, okna, skrzydła drzwi, podłogi). Tę lukę agent powinien zobaczyć w 30 sekund; dziś wymaga znajomości `public/models/` i README.

Nie wymyślam nowego systemu assetów. Największy zysk to **ten sam** `AssetIndexEntry` + wyszukiwarka + uczciwy prepare/AABB.

---

## 1. Case study

**Domek:** jednokondygnacyjna chata tynkowana (plaster + drewniana listwa), jeden otwór drzwiowy, kamienna obrzeże, komin. Wizualny odpowiednik obecnej `hut_d` / „Chata”, ale ze ścian MegaKit zamiast fused mesh Fantasy RTS.

Uzasadnienie wyboru: audyt 3D już ustalił, że `hut_d` nie ma geometrycznego wejścia, a MegaKit `Wall_*_Door` ma otwór. To najmniejszy realny kit, który kiedyś odblokuje entrance/collider — bez budowania całego miasteczka.

### Minimalny zestaw

| Rola | Potrzeba | W dropdownie registry | W manifeście `public/models/` | Werdykt |
|------|----------|----------------------|-------------------------------|---------|
| Ściana prosta | tak | tylko `settlement:wall` = palisada RTS | `megakit/wall_plaster_straight`, `wall_brick_straight` | parked, poza indexem |
| Narożnik | tak | nie | **brak** | luka biblioteki |
| Drzwi | tak | nie | `wall_*_door` = **ściana z otworem**, nie skrzydło | brak `Door_*` / framugi |
| Okno | tak | nie | **brak** | luka |
| Fundament / podłoga | tak | nie | `border_straight` (obrzeże 2 m, nie podłoga) | częściowo |
| Dach | tak | nie | **brak** (`roof` → 0 plików) | luka |
| Komin | opcjonalnie | nie | `chimney`, `chimney_2` | parked |
| Dekor | opcjonalnie | nie | `vine_1/6`, `support`, `stairs_exterior` | parked |

**Czy da się złożyć kompletny domek z tego, co leży w `public/models/`?** Nie. Ściany + otwór drzwiowy + komin + obrzeże + schody — tak. Dach / narożnik / okno / skrzydło drzwi — nie, dopóki nie wrócą z pełnego MegaKit (lokalnie `_temp` w tym worktree **nie istnieje**).

---

## 2. Jak agent szukał części

### Krok 1 — otwarcie narzędzia

`/asset-browser.html` ładuje się jako **Asset Alignment Browser**, nie katalog. Domyślnie:

- Reference = `Player (Adventurer)`
- Anchor = `hand.right`
- Target = none
- Layout quad, tryb Diagnostic / Alignment

To jest workflow **grip/held**, nie „dobierz ściany do chaty”.

### Krok 2 — dropdown Reference/Target (`buildAssetIndex()`)

73 pozycje, 9 grup, **brak pola Search**. Grupy: `character:1`, `fauna:9`, `fx:2`, `held:9`, `house:5`, `item:9`, `nature:21`, `npc:8`, `settlement:9`.

Grupa `house` (labele z `HOUSE_CATALOG`, nie id):

| Label | id | Co to naprawdę |
|-------|----|----------------|
| Chata | `house:hut_d` | Second Age, fused mesh, drzwi = tekstura |
| Chałupa | `house:hut_a` | First Age, ażur |
| Chałupa | `house:hut_b` | First Age, ażur — **ten sam label** |
| Szałas | `house:hut_c` | First Age |
| Wieża mieszkalna | `house:towerhouse` | nie cottage |

Jedyna „ściana” w `settlement`: **Wall segment** → `/models/settlement/wall.glb` (palisada Fantasy RTS, native ~1.35 × 0.53 × 0.06 m, prepare height 1.85 m). To nie jest ściana domu.

MegaKit **nie występuje** w dropdownie. `wagon.glb` jest używany w runtime (`src/settlement/props.ts`, `preparePropFitMax(..., 3.8)`), ale **też nie ma wpisu** w indexie — „czy asset jest używany?” nie da się odczytać z UI.

### Krok 3 — Free URL + datalist

Manifest: **108** plików GLB. Datalist nie ma grup, podglądu ani flagi wired/parked. Żeby znaleźć ściany, agent musi:

1. zauważyć pole Free URL,
2. wiedzieć, że wolno tam wpisać ścieżkę,
3. zgadnąć fragment nazwy (`wall`, `megakit`, `plaster`).

Filtrowanie `wall|door|roof|window|corner` po manifeście:

- `wall`: 5× megakit + `wall.glb`
- `door`: 2× `wall_*_door`
- `chimney`: 2
- `roof` / `window` / `corner` / `floor`: **pusto**

To już jest użyteczna odpowiedź — ale **tylko jeśli agent wyjdzie z UI do JSON-a** albo zna `ls public/models`. Browser nie ma search boxa.

### Krok 4 — załadowanie pary Chata + Wall segment

Deep link: `?reference=house:hut_d&target=settlement:wall`.

Tarcie:

- URL zachował `referenceAnchor=hand.right` po poprzednim playerze; hut_d ma `origin` + `lamp_mount`.
- Target jest przesunięty o **1.2 m** (`HELD_SIDE_OFFSET`) — layout held-item, nie kit.
- Raport: `mode: single`, `status: SINGLE_ASSET` (brak pary kotwic do alignmentu — poprawne, ale nic nie mówi o snapie ścian).
- `bounds.size_m` w overlayu: **setki–tysiące metrów** (np. `[500, 2.85, 2]` potem `[3276, 2, 2]`). Native hut_d to ~0.9 m; native palisada ~1.4 m. Overlay **nie nadaje się** do decyzji o skali.

### Krok 5 — MegaKit przez Free URL

`?url=/models/settlement/megakit/wall_plaster_straight.glb`

Target dostaje syntetyczny wpis `custom:url` z `prepare: { mode: 'fitMax', value: 1 }` (`AssetBrowser.vue` `loadTarget`). Native ściana **3.125 m** wysokości jest ściskana do 1 m po najdłuższej osi.

Reference **nie ma** pola Free URL — nie da się porównać `wall_plaster_straight` z `wall_plaster_door` w jednym widoku. Para = zawsze jeden wired + jeden URL, albo dwa wired.

Po Reframe kamera idzie w ślad za zepsutym AABB overlayu; viewport potrafi być pusty (ściana-pyłek w „scenie” kilometrowej). Agent **nie ocenia wizualnie** kitu.

### Krok 6 — prawda z GLB (poza UI)

Pomiar `Box3.setFromObject` na załadowanym GLB **bez** prepare browsera:

| Plik | Native size (m) | Tris | Materiały |
|------|-----------------|------|-----------|
| `hut_d.glb` | 0.89 × 0.77 × 0.86 | 2336 | Main, Walls, Stone, Wood, Wood_Light |
| `wall.glb` (RTS) | 1.35 × 0.53 × 0.06 | 404 | Wood, Wood_Light |
| `wall_plaster_straight` | **2.00 × 3.12 × 0.41** | 86 | MI_WoodTrim, MI_Plaster |
| `wall_plaster_door` | **2.00 × 3.12 × 0.41** | 109 | + MI_RockTrim |
| `wall_brick_straight` | **2.00 × 3.12 × 0.41** | 56 | MI_UnevenBrick, … |
| `wall_brick_door` | **2.00 × 3.12 × 0.41** | 85 | j.w. |
| `wall_arch` | 2.00 × 3.00 × 0.06 | 164 | MI_WoodTrim |
| `chimney` | 0.95 × 3.18 × 1.00 | 616 | MI_RockTrim, MI_Brick |
| `chimney_2` | 0.95 × 3.00 × 0.99 | 130 | MI_UnevenBrick |
| `border_straight` | 2.00 × 0.13 × 0.70 | 16 | MI_RockTrim |

Wniosek o kicie (z geometrii, nie z browsera): plaster i brick **są** tej samej siatki modularnej 2 m; doorway wall ma ten sam bbox co ślepa ściana (otwór wewnątrz); obrzeże ma szerokość 2 m. Animacji 0, node names po `gltfpack` puste, `SV_*` brak, extras brak.

Żadnej z tych liczb **nie ma w raporcie alignmentu**.

---

## 3. Co działa dobrze

Nie wymyślam zmian w tych miejscach — zostawić.

1. **Jedno narzędzie, jeden loader.** Preview idzie przez `loadGltf` / `prepareProp` / `createRenderer` (G10). Nie ma drugiego riga.
2. **Registry jest prawdą o wired runtime** — dropdown = to, co `HOUSE_CATALOG` / `propSpecs` / fauna / held naprawdę ładują (z wyjątkiem wagonu).
3. **Manifest 108 GLB** — parked MegaKit *jest* osiągalny, jeśli agent zna Free URL.
4. **Deep link** (`reference`, `target`, `url`, `layout`, `lighting`) — sesja odtwarzalna.
5. **Kotwice** — hut_d pokazuje `lamp_mount` z metadata; konwencja ANCHORS działa tam, gdzie jest zaauthorowana.
6. **Raport tekstowy** (YAML-like, `copy report`) — dobry kontrakt AI, gdyby pola były prawdziwe (AABB per slot, materiały, tris, status).
7. **Diagnostic overlays** — grid / axes / ground / bounds / wireframe / game-like lighting. Właściwy zestaw do oceny kitu, *jeśli* skala i framing są uczciwe.
8. **Same assety MegaKit (parked)** — spójna skala 2×3.12 m, materiały nazwane (`MI_Plaster` vs `MI_UnevenBrick`), doorway wall geometrycznie gotowy (klasa B z audytu 3D). To zasługa packa, nie UI.

---

## 4. Gdzie agent traci czas

| Tarcie | Koszt | Źródło |
|--------|-------|--------|
| Brak search — 73 labele + 108 ścieżek | trzeba znać strukturę repo albo `curl` manifest | `AssetBrowser.vue` |
| MegaKit poza dropdownem | agent myśli, że nie ma ścian domu | `assetIndex.ts` tylko z game registries |
| „Wall segment” = palisada | fałszywy hit na pytanie „jakie mamy ściany?” | label + jedyny `wall` w indexie |
| Dwa razy „Chałupa” | nie wiadomo, który hut | `HOUSE_CATALOG.label` |
| Free URL `fitMax: 1` | MegaKit 3.12 m → 1 m; porównanie z NPC 1.75 m / hut_d 8.2 m jest kłamstwem | `loadTarget` custom entry |
| Reference bez Free URL | nie porównasz dwóch parked ścian | UI tylko Target |
| Overlay AABB 10²–10³ m | Reframe patrzy w pustkę; „czy skala się zgadza?” = zgadywanie | `getBounds()` na group z helperami + camera persist |
| Target zawsze +1.2 m X | kit wygląda jak held prop | `HELD_SIDE_OFFSET` |
| Stale `hand.right` na domu | szum w URL i raporcie | default state + sync URL |
| „Czy używane w grze?” | wagon wired, brak w indexie; ściany parked, wyglądają tak samo jako `custom:url` | index ≠ runtime usage |
| Brak dachu/okna niewidoczny w UI | agent szuka w `_temp` / CREDITS / README | brak empty-state search |
| Materiały/tris/pack tylko z ręcznego GLB | otwieranie plików poza browserem | raport alignmentu |
| Nazwy node’ów puste | nie rozpoznasz „drzwi” z hierarchii | `gltfpack`; UI tego nie rekompensuje metadata |

---

## 5. Konkretne problemy Asset Browsera

### B1. Narzędzie alignmentu udaje katalog

Tytuł, default player+hand, grip editor, `HELD_ATTACH` snippet, offset 1.2 m. Modularny domek to inny job: lista kandydatów → filtry → porównanie wariantów → authored meters.

### B2. Index ≠ dysk

`buildAssetIndex()` agreguje **wired** registry. Manifest skanuje **wszystko** w `public/models/`. Agent widzi dwa rozłączne światy. Parked kit (M01 w MODELS.md) jest nieobecny tam, gdzie agent spodziewa się „naszych assetów”.

### B3. Prepare policy rozjeżdża skalę

| Źródło | Prepare | Skutek dla chaty |
|--------|---------|------------------|
| `house:hut_d` | height 8.2 m | natywne 0.77 m → dach ~8 m |
| `settlement:wall` | height 1.85 m | palisada |
| `character:player` | height ~1.75 m | NPC-scale |
| Free URL MegaKit | **fitMax 1 m** | ściana 3.12 m → 1 m |

Bez trybu `prepare: none` agent nie odpowie „czy te elementy mają zgodną skalę?”.

### B4. Nie da się porównać dwóch parked assetów

Reference = tylko id z indexu. Warianty dachu/ścian z jednej paczki wymagają albo wpisania obu do registry, albo ręcznego `ls` + dwóch sesji.

### B5. Raport kłamie o bounds i milczy o semantyce

`reportFromScene` bierze `target.getBounds() ?? reference.getBounds()` — jeden box, slot group (model + `Box3Helper` + gizmos). Brak: native AABB, prepared AABB, materials, triangle count, clip names, pack, wired/parked, role (`wall`/`door`/`roof`).

### B6. Labele gameplayowe zamiast tożsamości assetu

„Chata” / „Chałupa” są dla gracza (`[E] Obejrzyj`). Agent potrzebuje `house:hut_d` + plik + pack w tym samym wierszu.

### B7. Camera persist vs nowy asset

`localStorage` kamer (świadome dla grip) + zły AABB = po załadowaniu ściany agent widzi czarny viewport. Reframe pogarsza, bo framing idzie za `getBounds()`.

---

## 6. Brakujące dane / metadane

Nie proponuję osobnego „semantic graph service”. Pola, których brakuje **przy istniejącym** `AssetIndexEntry`:

| Pytanie agenta | Dziś | Gdzie to już leży |
|----------------|------|-------------------|
| Co to jest? (wall / door / house / chimney) | zgadywanie z filename | `megakit/README.md` kolumna „Intended use”; katalog domów |
| Medieval / plaster / wood / brick | nie | materiały GLB `MI_Plaster`, `MI_UnevenBrick`; ścieżka |
| Modular / ten sam grid | nie | native AABB (2×3.12×0.41) — zmierzone, nie zapisane |
| Source pack | nie | folder `megakit/` + CREDITS |
| Wired vs parked | nie w UI | index vs manifest; MODELS.md M01–M03 |
| Używane w Seedvale? | prawie (index), wyjątek wagon | `props.ts` hardcoded URL |
| Warianty | nie | prefix `wall_plaster_*` |
| Snap / entrance | tylko `lamp_mount` na hut_* | ANCHORS; MegaKit 0× `SV_*` |
| Animacje | Pose idle tylko jeśli clip istnieje | 0 klipów na budynkach |
| Poly / materiały | nie w raporcie | GLB, 1 request |

Agent **powinien** dojść do czegoś w stylu:

`wall / medieval / plaster / modular / exterior / 2.00×3.12×0.41 / pack:megakit / parked`

z indexu + jednego loada, nie z `find` + README + ręcznego Three.js.

Format: rozszerzyć `AssetIndexEntry` (opcjonalne `status`, `pack`, `kind` albo krótka `tags: string[]`). Parked MegaKit: wygenerować wpisy z manifestu albo z tabeli README — **nie** drugi registry.

---

## 7. P0 / P1 / P2

### P0 — realna strata czasu agenta

1. **Wyszukiwarka** po id, label, url (index + manifest). Empty state: „roof: 0”.
2. **Parked MegaKit (i ogólnie pliki z manifestu) w tym samym pickerze**, z flagą `parked` / `wired`. Id np. `parked:settlement/megakit/wall_plaster_straight`.
3. **Free URL / parked: `prepare: 'none'`** (authored meters). Opcjonalny override w UI. Przestać fitMax(1) na kicie metrowym.
4. **Raport: AABB per slot, native + po prepare, bez helperów.** Osobno reference i target. Wtedy Reframe ma szansę.
5. **Reference też ładuje URL / parked** — porównanie dwóch ścian.

### P1 — wyszukiwanie i porównywanie

6. Label = `id` + krótka nazwa (`hut_d — Chata`), nigdy dwa identyczne stringi.
7. `status: wired | parked | extra` + `pack` z segmentu ścieżki (`megakit`, `nature`, …).
8. Lekkie `kind` / tags tylko tam, gdzie już mamy tabelę (README MegaKit, HOUSE_CATALOG.role). Bez ontologii na cały `public/models`.
9. W raporcie po loadzie: materials, tris, clip count, node-name count (0 po gltfpack — też informacja).
10. Prepare toggle: `none` / `height` / `fitMax` widoczny przy slocie.
11. Nie stosować `HELD_SIDE_OFFSET`, gdy target nie jest held preview.
12. Camera persist **per para assetów** (albo wyłącz przy parked/kit), żeby domek nie dziedziczył kamery po siekierze.
13. „Used in runtime”: obecność w `buildAssetIndex()` z game registries **plus** skan hardcoded URL (wagon) — choćby ręczny extra w indexie, jak `held:pitchfork`.

### P2 — nice-to-have

14. Miniatury / pasek wariantów `wall_plaster_*`.
15. Widok składania kilku części (to już zahacza o building system — **nie** w 107).
16. Similarity / auto-tag z materiałów.
17. Przeglądarka klipów (niepotrzebna dla tego case study).
18. Authoring `entrance` / snap na MegaKit — należy do planu budynków z audytu 3D, nie do browsera.

---

## 8. Minimalny zakres, który najbardziej poprawi pracę AI

Jedna zmiana w istniejącym szwie, nie nowa biblioteka:

```text
AssetIndexEntry += status, pack?, kind?
buildAssetIndex() zostaje źródłem wired
+ wpisy z manifestu (lub tylko megakit/) ze status=parked
AssetBrowser: input search, prepare none default dla parked/url
reportFromScene: nativeSize + preparedSize per slot
Reference: ten sam Free URL
```

To odblokowuje odpowiedzi:

- jakie ściany — search `wall` + kind
- drzwi stylistycznie — `wall_plaster_door` vs brick, te same 2×3.12, materiały
- warianty dachu — 0 hitów, jasno
- skala — native AABB, bez fitMax 1
- używane w grze — `wired` vs `parked`
- paczka — `pack: megakit`
- kompletny domek — checklist ról z kind; dziś: nie

Szacunek: **M** (plan 107). Nie ruszać `SettlementsManager` / `houseCatalog` poza ewentualnym dopisaniem wagonu do indexu.

---

## 9. Czy browser wystarcza do startu większej pracy nad modularnymi domami?

**Nie.**

Dwa osobne limity:

| Limit | Czyj to problem | Blokuje agenta? |
|-------|-----------------|-----------------|
| UI/index/prepare/raport | Asset Browser | **tak** — nawet istniejące ściany są trudne do znalezienia i **źle przeskalowane** |
| Brak dachu/narożnika/okna/Door_* w `public/models/` | biblioteka (parked subset 19 szt.) | **tak** dla kompletnego prefabu; **nie** dla prototytu wall+door opening |

Większa praca nad modularnymi domami i tak wymaga doniesienia brakujących kawałków z pełnego MegaKit (to już jest wniosek audytu 3D). Browser powinien to **pokazać**, nie zmuszać do `find public/models | rg roof`.

---

## 10. Rekomendacja

**Fix first** — plan [107](../plans/2026-08-14--107--asset-browser-agent-discovery.md).

Nie „good enough”: agent, który dziś dostanie zadanie „dobierz części do plaster cottage”, albo (a) weźmie palisadę RTS jako ścianę, albo (b) znajdzie MegaKit po znajomości repo i porówna je w fałszywej skali 1 m, albo (c) wyjdzie z narzędzia do `ls` + README — czyli browser nie wykonał roboty.

Nie budować przy okazji modular building system, colliderów z otworem ani entrance w `NpcAgent`. To kolejny plan (audyt 3D §34 krok 1), **po** tym, jak agent w ogóle widzi kit w metrach.

---

## Findings (indeks)

| ID | Severity | Problem | Evidence |
|----|----------|---------|----------|
| F1 | High | Index ukrywa parked MegaKit | dropdown 73 vs manifest 108; brak `megakit` w `assetIndex.ts` |
| F2 | High | Free URL `fitMax: 1` niszczy authored scale | `AssetBrowser.vue` `loadTarget`; native wall 3.12 m |
| F3 | High | Overlay AABB nieużywalny do snap/skali | raport `size_m` 500–3276 m vs native ~2–3 m |
| F4 | High | Brak search / semantyki | UI: dwa `<select>` + datalist |
| F5 | Medium | Reference nie ładuje parked URL | tylko Target ma Free URL |
| F6 | Medium | „Wall segment” myli z murem domu | `settlement:wall` → `wall.glb` RTS |
| F7 | Medium | Duplikat labeli house | dwie „Chałupa” |
| F8 | Medium | Wagon wired, nie w indexie | `props.ts` vs `buildAssetIndex()` |
| F9 | Medium | Held offset + camera persist na kicie | `HELD_SIDE_OFFSET`, `cameraPersist` |
| F10 | Low | Stale anchor `hand.right` na hut_d | URL po zmianie reference |
| F11 | Info | Parked kit niekompletny na domek | manifest: 0 roof/window/corner |

---

## Weryfikacja

| Warstwa | Stan |
|---------|------|
| Kod + manifest + GLB AABB/materiały/tris | zrobione 2026-08-14 |
| Sesja `/asset-browser.html` (dropdown, Free URL, raport, deep link) | zrobione |
| Wizualna ocena MegaKit w viewportcie | **nie** — framing za zepsutym AABB; osobno: natywne wymiary z loadera są wiarygodne |
| Implementacja poprawek | nie (plan 107) |
