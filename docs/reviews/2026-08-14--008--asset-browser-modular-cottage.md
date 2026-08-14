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

Same parked kawałki MegaKit **są** modularne w skali (ściany 2.00 × 3.12 × 0.41 m). Browser tego nie pokazuje — a Free URL aktywnie **kłamie o skali**.

**Biblioteka (2026-08-14, po konwersji):** pełny MegaKit Standard (176 GLB) jest w `public/models/settlement/megakit/`. Z tych plików **da się** zestawić plaster cottage (ściana / doorway / skrzydło / okno / podłoga 2×2 / dach wooden 2×1 / komin). To nie naprawia Asset Browsera — dropdown nadal 73 wired, kit nadal tylko w dataliście Free URL.

Nie wymyślam nowego systemu assetów. Największy zysk to **ten sam** `AssetIndexEntry` + wyszukiwarka + uczciwy prepare/AABB.

---

## 1. Case study

**Domek:** jednokondygnacyjna chata tynkowana (plaster + drewniana listwa), jeden otwór drzwiowy, kamienna obrzeże, komin. Wizualny odpowiednik obecnej `hut_d` / „Chata”, ale ze ścian MegaKit zamiast fused mesh Fantasy RTS.

Uzasadnienie wyboru: audyt 3D już ustalił, że `hut_d` nie ma geometrycznego wejścia, a MegaKit `Wall_*_Door` ma otwór. To najmniejszy realny kit, który kiedyś odblokuje entrance/collider — bez budowania całego miasteczka.

### Minimalny zestaw

| Rola | Potrzeba | W dropdownie registry | W manifeście `public/models/` (po 176 GLB) | Werdykt |
|------|----------|----------------------|-------------------------------------------|---------|
| Ściana prosta | tak | tylko `settlement:wall` = palisada RTS | `wall_plaster_straight` (+ `_l`/`_r`), brick | parked, poza indexem; bbox 2.00×3.12×0.41 |
| Narożnik | tak | nie | `corner_exterior_wood` (słupek 0.21×3.00) **albo** `wall_plaster_straight_l/r` | kit ma L/R wall, nie L-mesh 2 m |
| Drzwi | tak | nie | `wall_plaster_door_flat` (otwór) + `doorframe_flat_wooddark` + `door_1_flat` (liść 1.12×2.10) | komplet w parked |
| Okno | tak | nie | `wall_plaster_window_wide_flat` + `window_wide_flat1` + shutters | komplet w parked |
| Fundament / podłoga | tak | nie | `floor_wooddark` **2×2 m**; `border_straight` 2 m | komplet w parked |
| Dach | tak | nie | 39× `roof_*` (m.in. `roof_wooden_2x1` + `_l/_r/_corner/_middle`) | komplet w parked |
| Komin | opcjonalnie | nie | `chimney`, `chimney_2` | parked |
| Dekor | opcjonalnie | nie | vines, support, stairs, balcony, overhang | parked |

**Czy da się złożyć kompletny domek z `public/models/`?** **Tak, geometrycznie** — po konwersji pełnego MegaKit Standard (2026-08-14). Nadal **nie** da się tego zrobić *przez dropdown* Asset Browsera. Nadal **nie** ma prefabu ani wiring do osad.

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
| UI/index/prepare/raport | Asset Browser | **tak** — nawet 176 MegaKit jest w dataliście, nie w dropdownie; fitMax 1 nadal kłamie |
| Brak dachu/narożnika/okna/Door_* | biblioteka | **zamknięte 2026-08-14** — pełny Standard kit w `public/models/settlement/megakit/` (176 GLB) |

Biblioteka nie jest już blokerem kompletnego *zestawu plików*. Browser nadal nie pokazuje ról, skali ani wired/parked. Kolejny krok na kit: plan 107, potem (osobno) prefab + entrance z audytu 3D §34.

---

## 10. Rekomendacja

**Fix first** — plan [107](../plans/2026-08-14--107--asset-browser-agent-discovery.md).

Nie „good enough”: agent, który dziś dostanie zadanie „dobierz części do plaster cottage”, albo (a) weźmie palisadę RTS jako ścianę, albo (b) znajdzie MegaKit po znajomości repo i porówna je w fałszywej skali 1 m, albo (c) wyjdzie z narzędzia do `ls` + README — czyli browser nie wykonał roboty.

Nie budować przy okazji modular building system, colliderów z otworem ani entrance w `NpcAgent`. To kolejny plan (audyt 3D §34 krok 1), **po** tym, jak agent w ogóle widzi kit w metrach.

---

## Findings (indeks)

| ID | Severity | Problem | Evidence |
|----|----------|---------|----------|
| F1 | High | Index ukrywa parked MegaKit | dropdown 73 vs manifest **265**; 176× megakit poza `assetIndex.ts` |
| F2 | High | Free URL `fitMax: 1` niszczy authored scale | `AssetBrowser.vue` `loadTarget`; native wall 3.12 m |
| F3 | High | Overlay AABB nieużywalny do snap/skali | raport `size_m` 500–3276 m vs native ~2–3 m |
| F4 | High | Brak search / semantyki | UI: dwa `<select>` + datalist; agent musi wpisać `roof` żeby zobaczyć 39 dachów |
| F5 | Medium | Reference nie ładuje parked URL | tylko Target ma Free URL |
| F6 | Medium | „Wall segment” myli z murem domu | `settlement:wall` → `wall.glb` RTS |
| F7 | Medium | Duplikat labeli house | dwie „Chałupa” |
| F8 | Medium | Wagon wired, nie w indexie | `props.ts` vs `buildAssetIndex()` |
| F9 | Medium | Held offset + camera persist na kicie | `HELD_SIDE_OFFSET`, `cameraPersist` |
| F10 | Low | Stale anchor `hand.right` na hut_d | URL po zmianie reference |
| F11 | Info | ~~Parked kit niekompletny~~ | **zamknięte:** 176 GLB; Free URL `roof` → 39, `window` → 21, `corner` → 20 |

---

## Weryfikacja

| Warstwa | Stan |
|---------|------|
| Kod + manifest + GLB AABB/materiały | zrobione 2026-08-14 (19, potem 176) |
| Sesja `/asset-browser.html` | zrobione; po kopii: datalist 265, dropdown nadal 73 |
| Konwersja MegaKit Standard → `public/models/settlement/megakit/` | 157 nowych GLB + 19 legacy, 0 fail, ~18 MB |
| Wizualna ocena w viewportcie | nadal słaba (framing/AABB) — natywne wymiary z loadera OK |
| Implementacja poprawek browsera | nie (plan 107) |

---

## 11. Kontynuacja — pełny kit w `public/` (2026-08-14)

Źródło: `seedvale/_temp/Models/Medieval Village MegaKit - Standard/` (nie worktree seedvale-2). Pipeline: `@gltf-transform` WebP 512 + `gltfpack -cc`. 19 legacy nazw bez zmian (`wagon.glb`).

Manifest po kopii: **265** plików (`megakit`: 176). Dropdown: nadal **73**.

Native AABB zestawu plaster cottage (bez prepare browsera):

| Część | Size (m) | Uwaga |
|-------|----------|--------|
| `wall_plaster_straight` / `_l` / `_r` / `door_flat` / `window_wide_flat` | **2.00 × 3.12 × 0.41** | ten sam moduł |
| `floor_wooddark` | **2.00 × 0.02 × 2.00** | kafelek 2 m |
| `door_1_flat` | 1.12 × 2.10 × 0.12 | liść; szkło `MI_WindowGlass` |
| `doorframe_flat_wooddark` | 1.57 × 2.31 × 0.39 | pasuje do otworu |
| `window_wide_flat1` | 1.61 × 1.58 × 0.68 | wkładka, nie ściana |
| `corner_exterior_wood` | 0.21 × 3.00 × 0.24 | słupek, nie narożnik 2×2 |
| `roof_wooden_2x1` | 2.26 × 1.25 × 1.56 | okap > 2 m |
| `chimney` | 0.95 × 3.18 × 1.00 | |
| `border_straight` | 2.00 × 0.13 × 0.70 | ta sama szerokość co ściana |

Wniosek: **moduł 2 m trzyma się** na ścianach, oknie-ścianie i podłodze. Dach i narożnik-słupek wymagają świadomego składania, nie ślepego AABB-snap. Nadal 0 animacji / 0 `SV_*`.

Pytania z briefu **po kopii**, nadal przez obecny browser:

| Pytanie | Po 176 GLB |
|---------|------------|
| Jakie ściany? | Datalist `wall` → 20 megakit + palisada. Dropdown nadal kłamie. |
| Drzwi stylistycznie? | `door_1_flat` vs `_2/_4/_8`, flat/round — tylko z nazwy pliku. |
| Warianty dachu? | **39** w manifeście. UI nie grupuje. |
| Zgodna skala? | Tak w GLB (2 m). Browser nadal fitMax 1. |
| Używane w grze? | Nadal nie (oprócz wagonu poza indexem). |
| Kompletny domek? | **Pliki: tak.** Narzędzie i runtime: nie. |

Werdykt się nie zmienia: **fix first** (plan 107). Zmienił się tylko limit biblioteki.
