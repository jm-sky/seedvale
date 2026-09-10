# Plan: Settlement Cemeteries & Abandoned Graveyards

**Created:** 2026-09-08
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** `world-terrain`
**Subdomains:** `landmarks` `terrain`
**Tags:** `cemetery` `settlements` `placement` `worldgen`
**Roadmap:** -
**Implemented at:** 2026-09-10 19:15

## Cel

Przebudować proceduralne rozmieszczenie cmentarzy tak, aby cmentarze związane z żyjącymi społecznościami były deterministyczną infrastrukturą osad, przy jednoczesnym zachowaniu rzadkich, opuszczonych cmentarzy występujących niezależnie od osad.

Docelowy model:

```text
SM settlement
→ own cemetery
lub
→ shared cemetery z pobliską SM settlement

MD settlement
→ own cemetery

LG settlement
→ own cemetery

XL settlement
→ own cemetery

far from settlements
→ rare abandoned cemetery
```

Cmentarz nadal pozostaje istniejącym proceduralnym `cemetery` landmarkiem. Plan nie tworzy drugiego systemu cmentarzy ani osobnego `CemeteryManager`.

## 1. Dwa znaczenia istniejącego cemetery landmarku

Nie wprowadzać nowego technicznego typu tylko po to, aby odróżnić aktywny i opuszczony cmentarz. Fizycznie oba pozostają `kind: 'cemetery'` i reuse istniejące:

- `EnvironmentPlacement`,
- stable landmark identity,
- cemetery grave layout,
- renderer/create path,
- `WorldLocation`,
- Hidden Finds,
- grave-robbing interaction.

Semantyka wynika z assignmentu:

```text
active settlement cemetery
→ served settlements.length >= 1

abandoned cemetery
→ served settlements.length === 0
```

Nie dodawać `CemeteryKind`/`CemeteryManager`, dopóki realny consumer nie potrzebuje odrębnego stanu poza assignmentem.

## 2. Główne invariants

Po implementacji obowiązują następujące reguły:

```text
each settlement
→ exactly 1 active assigned cemetery

active cemetery
→ serves 1 or 2 settlements

abandoned cemetery
→ serves 0 settlements
```

Shared cemetery w V1 może obsługiwać maksymalnie dwie osady i sharing dotyczy wyłącznie `SM`.

Te invariants mają być jednym źródłem prawdy dla późniejszych burial, NPC visits, reputation i witness systems. Consumenci nie mogą niezależnie odtwarzać ownership przez nearest-settlement heuristics.

## 3. Settlement cemeteries są deterministyczną infrastrukturą

Aktualny probabilistyczny cemetery roll nie powinien już decydować, czy osada w ogóle ma burial destination.

Docelowo:

```text
settlement topology
→ cemetery assignment
→ bounded terrain-aware placement
→ active cemetery
```

Losowość może nadal wpływać na dokładną pozycję, rotację, variant i niewielką variation rozmiaru, ale nie na sam fakt istnienia assigned cemetery.

Cemetery assignment i placement są częścią świata, niezależną od gracza, kamery, odkrycia lokacji, pierwszej śmierci NPC i kolejności ładowania chunków.

## 4. Reguły według wielkości settlementu

### `SM`

Mała osada:

1. próbuje współdzielić cemetery z odpowiednio bliską inną `SM`,
2. jeżeli sharing nie jest możliwy albo wspólny placement nie znajduje poprawnego miejsca, otrzymuje własny dedicated cemetery.

### `MD`

`MD` zawsze posiada własny dedicated cemetery i nie uczestniczy w sharing.

### `LG`

`LG` zawsze posiada własny dedicated cemetery.

### `XL`

`XL` zawsze posiada własny dedicated cemetery.

Canonical rule:

```text
SM → own or shared
MD → own
LG → own
XL → own
```

## 5. Assignment przed terrain placementem

Rozdzielić dwie decyzje:

```text
settlement topology
→ who should share with whom

terrain
→ where that cemetery can physically exist
```

Najpierw deterministycznie wyznaczyć intended assignment/parę `SM`. Dopiero potem próbować fizycznego shared placementu.

Jeżeli shared placement nie przejdzie bounded search:

```text
SM A + SM B intended shared cemetery
→ shared placement fails
→ cancel pair
→ A gets dedicated cemetery
→ B gets dedicated cemetery
```

Nie pozwalać terrain query kolejnościowo zmieniać pairingu innych osad.

## 6. Deterministyczne lokalne parowanie `SM`

Nie wykonywać globalnego pairingu wszystkich settlements ani `O(N²)` po świecie.

Sharing sprawdza małe lokalne sąsiedztwo istniejącego settlement gridu. `SETTLEMENT_GRID_STEP` jest naturalnym punktem odniesienia dla maksymalnego sharing distance.

Dwie `SM` mogą zostać sparowane, jeżeli:

- znajdują się w ustalonym lokalnym zasięgu,
- żadna nie jest już przypisana do innego shared cemetery,
- pairing jest canonical dla tego neighborhood.

Tie-breaki używają stable settlement IDs.

Ten sam:

```text
world seed
+ settlement definitions/topology
```

musi dawać ten sam pairing niezależnie od kolejności ładowania chunków, query i pozycji gracza.

## 7. Dedicated cemetery placement

Dla `SM` bez sharing oraz dla `MD/LG/XL` placement powinien preferować obszar na obrzeżu settlementu:

```text
settlement center
→ houses / clearings
→ settlement fringe
→ cemetery
```

Reuse istniejące mechanizmy, szczególnie:

- `cemeteryFitsVillageFringe()`,
- cemetery footprint,
- clearing avoidance,
- slope/terrain validation,
- road footprint rejection,
- deterministic landmark generation.

Nie umieszczać cemetery między domami ani w centralnej części settlementu.

## 8. Shared cemetery placement

Dla pary `SM` szukać cmentarza w sensownym korytarzu/obszarze pomiędzy settlements.

Midpoint może być pierwszym anchor candidate, ale nie jest wymaganym finalnym miejscem. Droga, rzeka, woda, nachylenie lub inne terrain constraints mogą przesunąć cemetery w stronę lepszego miejsca.

Preferować candidate, który:

- pozostaje sensownie dostępny dla obu settlements,
- nie jest skrajnie związany tylko z jedną z nich,
- przechodzi wszystkie physical placement constraints.

Nie wymagać matematycznej symetrii.

## 9. Shared cemetery nie używa single-village fringe jako twardego gate

Obecne `cemeteryFitsVillageFringe()` opisuje cemetery związany z jednym village disk.

Nie rozszerzać sztucznie tej funkcji tak, aby midpoint dwóch settlements zaczął przechodzić ten sam test.

Rozdzielić placement intents:

```text
dedicated cemetery
→ settlement-fringe preference

shared cemetery
→ between-settlements corridor preference
```

Oba intents reuse wspólną niższą warstwę physical cemetery validation.

## 10. Physical cemetery validation pozostaje wspólna

Nie implementować drugiego zestawu terrain rules.

Candidate powinien reuse istniejące wymagania dotyczące:

- dry/usable terrain,
- slope,
- cemetery grave-grid footprint,
- road corridor clearance,
- grounding,
- chunk/placement constraints,
- settlement clearings tam, gdzie mają zastosowanie.

Preferowany podział odpowiedzialności:

```text
cemetery assignment
→ who needs cemetery

placement intent/search
→ where to look

shared physical validation
→ can cemetery safely exist here?

existing cemetery create/render path
→ actual landmark
```

## 11. Bounded placement fallback

Nie gwarantować cemetery przez łamanie terrain constraints.

Resolver powinien wykonywać deterministic, bounded widening search:

```text
preferred anchor/area
→ nearby deterministic candidates
→ physical validation
→ first/best valid result
```

Dla prawidłowo wygenerowanego settlementu oczekujemy znalezienia burial destination. Jeżeli bounded fallback mimo wszystko nie znajdzie poprawnego miejsca, traktować to jako jawny diagnostic/invariant failure do naprawy w generatorze, a nie powód do postawienia cemetery na wodzie, drodze lub ekstremalnym zboczu.

## 12. Rozmiar cmentarza zależny od obsługiwanej społeczności

Obecne cemetery layouts `SM / MD / LG` pozostają.

Rozmiar nie powinien być już wyłącznie niezależnym weighted random roll. Preferować wynik oparty o rzeczywistą skalę obsługiwanej społeczności, wykorzystując istniejące settlement data.

Sprawdzić podczas implementacji, czy lepszym istniejącym proxy jest `SettlementDef.size`, `families.length`, czy ich prosta kombinacja. Nie tworzyć nowego population modelu tylko dla cemetery sizing.

Kierunek:

```text
1 × SM settlement
→ mostly cemetery SM

2 × SM settlements
→ SM or MD

MD settlement
→ mostly MD

LG settlement
→ mostly MD or LG

XL settlement
→ mostly LG
```

Pozostawić niewielką deterministic variation.

Nie implementować dynamicznego powiększania cemetery w tym planie.

## 13. Abandoned cemeteries

Zachować możliwość powstawania rzadkich, niczyich/opuszczonych cmentarzy w wilderness.

Abandoned cemetery:

- nie obsługuje żadnej aktualnej osady,
- znajduje się odpowiednio daleko od settlements,
- pozostaje normalnym `cemetery` landmarkiem,
- może być `WorldLocation`,
- może zawierać Hidden Finds,
- może uczestniczyć w questach,
- może być rozkopywany.

To zapewnia starszą warstwę historii świata:

```text
current settlements
→ active cemeteries

wilderness
→ abandoned remnants of older communities
```

## 14. Abandoned generation jest osobną ścieżką od assignmentu

Obecny probabilistyczny cemetery generation może zostać zaadaptowany do roli abandoned cemetery generation, ale nie zachowywać automatycznie obecnego `0.28` jako wilderness chance.

Obecna wartość jest dostrojona do silnego village-fringe filtra; po usunięciu tego filtra byłaby znacząco zbyt wysoka.

Docelowo:

```text
active settlement cemetery
→ assignment-driven

abandoned cemetery
→ rare deterministic wilderness roll
```

Abandoned candidate musi przejść minimalny settlement-separation gate, tak aby nie wyglądał jak drugi lokalny cemetery aktywnej społeczności.

## 15. Jeden canonical assignment owner

Nie pozwalać kilku systemom niezależnie wyliczać:

```text
settlement ↔ cemetery
```

Assignment powinien mieć jedno architectural source of truth, reuse'owane przez World Locations i przyszłe burial/reputation/NPC systems.

`WorldLocationCatalog.cemeteryForSettlement()` jest naturalnym istniejącym consumer-facing seam, ale nie zakładać z góry, że sam `WorldLocationCatalog` powinien być właścicielem topology. Podczas implementation recon ustalić najbliższy istniejący owner, unikając nowego globalnego managera.

## 16. Canonical settlement lookup

Obecne zachowanie typu:

```text
settlement
→ find nearby cemetery
```

powinno semantycznie stać się:

```text
settlement
→ resolve assigned active cemetery
```

Dwie sharing `SM` otrzymują dokładnie ten sam cemetery ID.

`MD/LG/XL` otrzymują swój dedicated cemetery nawet wtedy, gdy bliżej geometrycznie znajduje się:

- shared cemetery dwóch innych `SM`,
- abandoned cemetery.

Abandoned cemetery nigdy nie może zostać canonical burial destination wyłącznie dlatego, że jest najbliżej.

## 17. Reverse lookup

Zapewnić tani deterministic sposób uzyskania:

```text
cemeteryId
→ servedSettlementIds
```

Dla abandoned cemetery wynik jest pusty.

Nie musi to oznaczać persisted mutable array w `EnvironmentPlacement`. Jeżeli relację można deterministycznie odtworzyć z world seed + settlement topology + placement, preferować derivation/cache zamiast duplicated save state.

## 18. Stable identity

Zachować istniejący stable cemetery landmark identity tam, gdzie to możliwe.

Shared cemetery to jeden fizyczny landmark i jeden stable ID, nie dwa nałożone obiekty przypisane osobno do settlements.

Ten sam:

```text
seed + settlement topology + terrain
```

powinien dawać ten sam assignment, placement i cemetery identity.

Jeżeli zmiana generatora z konieczności przesuwa istniejące cemetery IDs dla starych seedów, potraktować to jako jawny compatibility concern i opisać w implementation notes przed implementacją.

## 19. WorldLocation i discovery

Active/shared/abandoned cemeteries pozostają normalnymi:

```text
WorldLocation(kind = cemetery)
```

Shared cemetery pojawia się w discovery tylko raz mimo dwóch served settlements.

Nie duplikować WorldLocation per assignment edge. Deduplication pozostaje po stable cemetery ID.

## 20. Hidden Finds i grave robbing

Existing cemetery Hidden Finds nadal działają zarówno dla active, jak i abandoned cemeteries.

Plan nie zmienia podstawowej grave digging / loot mechanics.

Późniejszy reputation/witness plan powinien móc rozróżnić:

```text
active cemetery
→ one or two served communities

abandoned cemetery
→ no currently served community
```

Dokładna polityka reputacji dla shared/abandoned cemetery pozostaje poza zakresem.

## 21. Kontrakt dla NPC burial i visits

Późniejszy burial flow powinien używać:

```text
deceased NPC
→ home settlement
→ assigned active cemetery
→ persistent grave
```

Nie `nearest cemetery`.

Późniejszy cemetery-visit flow może następnie używać persistent grave bez ponownego wyboru cemetery.

Shared cemetery naturalnie może powodować spotkania mieszkańców dwóch `SM`.

Burial, mourning i NPC visits nie są implementowane w tym planie.

## 22. Brak dynamicznego reassignmentu w V1

Assignment jest deterministyczny z generated/current settlement topology używanej przez worldgen.

Nie rozwiązywać w tym planie przyszłego przypadku:

```text
SM grows into MD
→ should it leave shared cemetery?
```

Dynamic cemetery migration/expansion wraz z settlement development jest osobnym problemem. V1 nie przepina istniejących cemetery assignments w runtime.

## 23. Persistence

Preferować pełną deterministyczność.

Nie dodawać top-level save segmentu dla cemetery assignment, jeżeli można go odtworzyć z istniejącego świata.

Runtime cache jest dopuszczalny i pożądany, szczególnie że obecny cemetery lookup był już źródłem kosztownych unloaded-chunk searches.

Cache musi być invalidated przy world rebuild analogicznie do obecnego `WorldLocationCatalog` cache.

## 24. Performance

Performance jest częścią acceptance criteria.

Preferować:

- lokalne settlement neighborhood,
- bounded pairing,
- bounded placement candidate search,
- cemetery-only lightweight terrain sampling,
- istniejący unloaded-landmark path,
- caching.

Nie:

- globalne `O(N²)` settlement pairing,
- global cemetery scan,
- pełne chunk materialization tylko dla cemetery lookup,
- per-frame cemetery logic.

## 25. Relevant implementation points

Przed implementacją wykonać focused recon aktualnego `main`, szczególnie:

```text
src/terrain/chunkEnvironment.ts
  EnvironmentPlacement
  LandmarkKind
  cemeteryFitsVillageFringe()
  cemeteryFootprintClearsRoads()
  rollCemeterySize()
  resolveCemeteryPlacement()

src/terrain/chunkManager.ts
  findLandmarkNear()
  resolveUnloadedLandmark()

src/settlement/settlementGenerator.ts
  SettlementDef
  VillageSize
  SETTLEMENT_GRID_STEP
  cellsWithinRadius()
  cellSeed()

src/world/locations/worldLocationCatalog.ts
  cemeteryForSettlement()
  cemeteryCandidates()
  getById()
  cemetery cache

src/world/locations/locationConfig.ts
  CEMETERY_SEARCH_CHUNK_RADIUS
```

Sprawdzić również:

- settlement lookup ownership,
- current cemetery create/render path,
- world rebuild invalidation,
- WorldLocation deduplication,
- Hidden Finds assumptions dotyczące cemetery ID/size,
- terrain-aware placement tests,
- road/river/water placement gates,
- current settlement population/family data suitable for cemetery sizing.

Current code pozostaje źródłem prawdy.

## 26. Implementation direction

Preferowany high-level pipeline:

```text
settlement topology
        ↓
canonical cemetery assignment
        ↓
dedicated/shared placement intent
        ↓
bounded terrain candidate search
        ↓
existing/shared cemetery physical validation
        ↓
normal EnvironmentPlacement(kind = cemetery)
        ↓
WorldLocation
```

Niezależna wilderness ścieżka:

```text
wilderness candidate
        ↓
far enough from settlements
        ↓
rare deterministic roll
        ↓
abandoned cemetery
```

Nie mieszać obu ścieżek przez nearest-cemetery heuristics.

Dla nowych ważnych publicznych/architektonicznych resolverów dodać JSDoc potrzebny do AI preflight; użyć `@domain world-terrain` tam, gdzie pasuje.

## 27. Implementation order

1. Zweryfikować aktualny cemetery generation i unloaded lookup parity.
2. Ustalić canonical owner cemetery assignment w istniejącej architekturze.
3. Zdefiniować invariants active/abandoned/served settlements.
4. Dodać deterministic local pairing `SM`.
5. Wprowadzić dedicated assignment dla `MD/LG/XL` i isolated `SM`.
6. Ustalić bounded sharing distance względem settlement gridu.
7. Dodać dedicated placement intent oparty o settlement fringe.
8. Dodać shared placement intent oparty o corridor między settlements.
9. Reuse wspólną physical cemetery validation.
10. Dodać shared-placement failure → dedicated fallback.
11. Powiązać cemetery size z istniejącą skalą/populacją served settlements.
12. Przekształcić probabilistyczny cemetery generation w rzadką abandoned cemetery ścieżkę daleko od settlements.
13. Rozwinąć settlement cemetery lookup do canonical assignment semantics.
14. Zapewnić reverse lookup cemetery → served settlements.
15. Zachować stable IDs i WorldLocation deduplication.
16. Zweryfikować Hidden Finds i grave-robbing assumptions.
17. Dodać focused deterministic/performance tests.
18. Utworzyć implementation notes zgodnie z `PLANNING.md`.
19. Zaktualizować relevant STATE/docs.

## 28. Automated verification

### Assignment

- `SM` może otrzymać shared cemetery z pobliskim `SM`,
- isolated `SM` otrzymuje dedicated cemetery,
- `MD` zawsze otrzymuje dedicated cemetery,
- `LG` zawsze otrzymuje dedicated cemetery,
- `XL` zawsze otrzymuje dedicated cemetery,
- `MD/LG/XL` nigdy nie uczestniczą w sharing,
- shared cemetery obsługuje maksymalnie 2 settlements,
- każda settlement ma dokładnie 1 active assigned cemetery,
- pairing jest symetryczny,
- kolejność query nie wpływa na wynik,
- ten sam seed/topology daje ten sam assignment.

### Placement

- dedicated cemetery preferuje settlement fringe,
- shared cemetery znajduje się w sensownym corridor między settlements,
- shared cemetery nie wymaga single-village fringe gate,
- cemetery nie przecina road footprint,
- cemetery nie trafia na invalid terrain/water,
- shared placement failure daje dwa dedicated cemeteries,
- bounded fallback nie łamie physical constraints.

### Abandoned cemeteries

- mogą powstać z `served settlements = 0`,
- nie powstają zbyt blisko aktualnych settlements,
- są wyraźnie rzadsze od active cemetery infrastructure,
- generation jest deterministic,
- nie mogą zostać zwrócone jako assigned settlement cemetery.

### Size

- cemetery size nie maleje systematycznie wraz ze wzrostem served population,
- shared cemetery dwóch `SM` może być większy niż cemetery pojedynczego `SM`,
- variation pozostaje deterministic.

### Identity / World Locations

- shared cemetery ma jeden stable ID,
- obie settlements wskazują ten sam ID,
- `getById()` rozwiązuje cemetery do tego samego miejsca,
- chunk reload nie zmienia cemetery,
- shared cemetery nie jest duplikowany w discovery,
- abandoned cemetery pozostaje discoverable.

### Performance

- pairing jest lokalny,
- brak globalnego `O(N²)`,
- unloaded lookup nie materializuje pełnego chunk environment,
- wielokrotne lookupy reuse cache/derived assignment.

## 29. Manual verification

Manualną weryfikację wykonuje User w browserze.

Sprawdzić na kilku seedach:

1. pojedynczą `SM` z własnym cemetery,
2. dwie pobliskie `SM` ze shared cemetery,
3. dwie zbyt odległe `SM`,
4. `MD` z własnym cemetery,
5. `LG/XL` z własnym cemetery,
6. trudny terrain między potencjalnie sharing settlements,
7. abandoned cemetery daleko od settlements,
8. brak abandoned cemetery bezpośrednio przy aktywnej osadzie,
9. WorldLocation/discovery dla shared cemetery,
10. unload/reload cemetery chunku.

AI agent nie wykonuje browser verification.

## Poza zakresem

- NPC burial implementation,
- mourning / NPC cemetery visits,
- witness detection,
- reputation consequences,
- gossip / observation memory,
- dynamic cemetery expansion,
- runtime reassignment po rozwoju settlementu,
- cemetery roads/paths,
- funeral ceremonies,
- osobny cemetery manager lub duplicate grave system.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
