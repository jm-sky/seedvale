# Plan: Adventure cave variant with treasure and abandoned props

**Created:** 2026-09-11
**Status:** `in progress` 🔄 — Stages A–B (archetypes + adventure topology + content-anchor seam) implemented + technically verified. Stages C+ (chests, container Y seam, props, wagon, lanterns, loot tiers) are still open.
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~world-terrain-019~~, world-024
**Domain:** `world-terrain`
**Subdomains:** `terrain` `landmarks`
**Tags:** `caves` `exploration` `treasure`
**Roadmap:** -

## Cel

Dodać drugi, wyraźnie większy wariant istniejącej jaskini: **adventure cave**.

Adventure cave ma tworzyć loop eksploracyjny:

`wejście → długa eksploracja → rozwidlenie → boczny skarb → dalsza głęboka trasa → końcowa komora ze skarbem`

Nie tworzyć osobnego dungeon systemu ani drugiego systemu geometrii podziemi.

Wariant ma korzystać z istniejącego:

`CaveTopology → CaveHeightfieldRepresentation → presentation / collision / ground / interior`

oraz istniejącego systemic treasure/container pipeline.

## 1. Adventure cave jako archetyp CaveTopology

Rozszerzyć production cave generation o co najmniej dwa archetypy:

- obecna `natural` cave,
- `adventure` cave.

Archetyp powinien zmieniać przede wszystkim generowaną `CaveTopology`, nie tworzyć osobnego runtime cave implementation.

Nie duplikować cave spatial queries, heightfield representation, collision, interior detection, cave ground, player traversal ani streaming/lifecycle.

### Adventure topology

Adventure cave powinna być około **3–4× dłuższa od obecnej typowej jaskini** i zawierać kilka kolejnych etapów eksploracji.

Docelowy układ semantyczny:

```text
entrance
   │
long passage
   │
chamber
   │
long passage
   │
junction
  /      \
 /        \
side       main passage
chamber         │
chest #1      chamber
                 │
           long passage
                 │
          final chamber
            chest #2
```

Generator może deterministycznie zmieniać zakręty, szerokości, wysokości, lokalne nierówności przebiegu i długości sekcji.

Adventure cave musi gwarantować:

- znacznie większą długość od normal cave,
- co najmniej jedno czytelne rozwidlenie,
- co najmniej jedną boczną komorę,
- głęboką końcową komorę.

Junction nie powinien wyglądać jak przypadkowa szczelina. Odnogi muszą mieć wystarczającą szerokość i czytelność, aby wybór trasy był świadomą decyzją eksploracyjną.

## 2. Zachować obecny model CaveTopology

Obecny `CaveTopology` już posiada `nodes`, `segments`, `features` i połączenia pomiędzy nodes. Production generator posiada optional branch oraz mechanizm zabezpieczający odnogi przed przypadkowym połączeniem przez representation smoothing.

Rozszerzyć ten mechanizm zamiast tworzyć `DungeonGraph`.

Relevant code:

- `src/world/caves/caveTopology.ts`
- `src/world/caves/productionTopology.ts`
- `src/world/caves/caveHeightfieldRepresentation.ts`

Zachować istniejące mechanizmy:

- terrain/overburden adaptation,
- traversable floor grade,
- deterministic cave RNG,
- disconnected passage clearance,
- production cave acceptance/rejection.

Dłuższa jaskinia nie może omijać istniejących guardrails tylko po to, aby osiągnąć docelową długość.

### Natural cave regression guard

Adventure jest rozszerzeniem obecnego generatora, nie powodem do zmiany istniejącej natural cave.

Dla tego samego seed + site obecny `natural` recipe musi zachować dotychczasowy wynik i acceptance behavior. W ramach tego planu nie retunować natural cave dimensions, RNG consumption/order, `BRANCH_CHANCE`, terrain adaptation, grade/overburden thresholds ani acceptance limits.

Jeżeli rozdzielenie generatora na recipes wymaga refaktoru, ma to być minimalne wydzielenie współdzielonych primitives bez zmiany zachowania `natural`.

## 3. Archetype assignment

Adventure cave jest wariantem zwykłego cave site, nie osobnym typem world landmark.

### Home-area guarantee

W pobliżu home settlement świat musi zawsze posiadać co najmniej jedną `adventure` cave, o ile którykolwiek z istniejących cave sites potrafi zaakceptować adventure topology przy zachowaniu wszystkich production guardrails.

Nie wybierać guaranteed archetype dopiero po zbudowaniu natural topology i nie „relabelować” natural cave. Adventure topology musi być rzeczywiście zbudowana i zaakceptowana dla danego site.

Bezpieczny bounded flow:

1. wygenerować istniejący zestaw sites przez `pickLargeCaveSites()` bez zmiany sitingu,
2. deterministycznie uporządkować kandydatów w preferowanym home-area band,
3. próbować adventure topology na tych sites w kolejności; pierwszy zaakceptowany staje się guaranteed adventure cave,
4. jeśli żaden kandydat w podstawowym band nie akceptuje adventure topology, rozszerzyć wybór na pozostałe istniejące sites i próbować najbliższe według stabilnego tie-breaku,
5. nie tworzyć dodatkowego/sztucznego cave site i nie osłabiać topology acceptance tylko po to, aby wymusić gwarancję,
6. pozostałe sites przechodzą zwykły deterministic 15% adventure roll opisany niżej.

Guaranteed cave powinna być w okolicy home settlement, ale nie tuż przy zabudowaniach. Ustalić minimalny i maksymalny preferowany dystans zgodny z istniejącym `LARGE_CAVE_MIN_HOME_DIST`, tak aby nie walczyć z aktualnym siting authority.

Wybór musi zależeć od stabilnego world seed + cave/site identity, a nie kolejności streamowania.

### Other caves

Dla pozostałych caves:

- `15%` → spróbować `adventure`,
- `85%` → `natural`.

Guaranteed home adventure cave nie bierze udziału w tym rollu.

**Ważny fallback regresyjny:** jeśli niegwarantowany site wylosował `adventure`, ale adventure topology zostaje odrzucona przez istniejące terrain/overburden/grade/clearance/footprint guardrails, spróbować dla tego samego site niezmienionego `natural` recipe. Nie wolno utracić jaskini, która przed tym planem zostałaby poprawnie zaakceptowana jako natural tylko dlatego, że wylosowała adventure archetype.

Nie persistować archetypu, jeśli można go bezpiecznie odtworzyć z world seed, cave sites i home settlement identity.

## 4. Kontrola footprintu i kosztu heightfield

Adventure cave będzie znacznie większa niż obecna, ale nie powinna bez potrzeby tworzyć ogromnego prostokątnego heightfield bounds.

Preferować długą, zawijaną trasę o względnie zwartym footprint zamiast bardzo szerokiego rozrzutu XZ.

Nie zwiększać globalnie resolution wszystkich caves tylko dlatego, że adventure cave jest większa. Nie zmieniać `DEFAULT_HEIGHTFIELD_CONFIG.cellSize` w ramach tego planu.

Przed budową finalnego heightfield adventure topology musi mieć mierzalny, adventure-specific safety budget dla prostokątnego XZ bounds / szacowanej liczby grid cells. Layout przekraczający ten budżet ma zostać deterministycznie odrzucony/retried zgodnie z recipe, a nie powodować globalnej zmiany heightfield resolution lub limitów.

Sprawdzić koszt heightfield bounds, number of cells, generated mesh vertices/indices, topology generation, streamed geometry, props i lights.

## 5. Dwie komory ze skarbem

Adventure cave ma mieć **dwie systemic treasure chests**.

### Chest #1 — side chamber

Umieszczona w bocznej odnodze. Powinna stanowić nagrodę za sprawdzenie opcjonalnej części jaskini. Loot umiarkowany.

### Chest #2 — final chamber

Umieszczona w końcowej/deep chamber. Powinna być główną nagrodą za przejście całej adventure cave i mieć wyraźnie lepszy loot od chest #1.

Rola skrzyń jest stała: side chest jest nagrodą poboczną, final chest główną. Nie losować, która skrzynia dostaje lepszy loot.

### Integracja

Nie tworzyć `CaveLootSystem`, osobnego cave inventory ani specjalnej implementacji chest tylko dla caves.

Reuse istniejącego systemic treasure/container pipeline z `world-024`.

Każda skrzynia musi mieć stabilne, deterministyczne world/container ID związane z cave identity i rolą, np. side treasure / final treasure.

Loot definition powinien być deterministyczny. Persistować wyłącznie mutable gameplay state wymagany przez istniejący treasure/container system.

Save/load nie może respawnować opróżnionych skrzyń.

## 6. Environmental storytelling

Adventure cave nie powinna wyglądać jak tylko dłuższa proceduralna dziura.

Dodać małą liczbę deterministycznych props świadczących o wcześniejszej obecności ludzi.

### Required

Dodać **stary wagon/wóz** w jednej z głębszych komór lub przy przejściu.

Najpierw reuse istniejącego assetu wagonu używanego już w repo. Nie dodawać drugiego asset pipeline tylko dla caves.

### Dodatkowy clutter

Jeżeli istniejące repo assets umożliwiają to bez tworzenia nowych systemów, dodać kilka elementów spośród:

- drewniane belki/podpory,
- crates,
- work debris,
- lanterns,
- kamienie/rubble.

Preferować reuse istniejących props. Nie blokować planu brakiem konkretnego dekoracyjnego assetu.

Props są presentation/environmental storytelling, nie spatial authority.

## 7. Oświetlenie / lampy

W głębszej części adventure cave umieścić niewielką liczbę istniejących lantern props.

Lampy powinny pomagać prowadzić gracza w stronę śladów dawnej działalności, nie oświetlać całej jaskini równomiernie i nie tworzyć dużej liczby dynamicznych lights.

Najpierw sprawdzić istniejący lighting/lantern implementation i wykorzystać najtańszy istniejący mechanizm.

Performance ma pierwszeństwo przed dużą liczbą real-time lights.

## 8. Placement props względem CaveHeightfield

Nie hardkodować Y na podstawie topology waypoint, jeśli realny cave floor może być inny.

Props wymagające ustawienia na ziemi powinny korzystać z istniejącego cave spatial/ground query lub finalnej heightfield representation.

Dotyczy szczególnie wagonu, chestów i floor props.

Placement musi być deterministyczny i stabilny względem wygenerowanej finalnej jaskini.

Chest/wagon nie mogą wejść w ścianę, wisieć nad podłożem, blokować obowiązkowej trasy ani pojawiać się w przejściu o zbyt małym clearance.

Preferować semantic anchors wynikające z `CaveTopology`, np. chamber/node, a dokładną pozycję dopasować do finalnej representation.

## 9. Streaming i ownership

Adventure cave pozostaje częścią istniejącego `Caves` lifecycle.

Nie tworzyć globalnego `AdventureCaveManager`.

Cave subsystem odpowiada za cave identity, topology, representation i cave-specific presentation anchors.

Istniejące world/container systems nadal odpowiadają za mutable chest state.

Presentation props powinny streamować się razem z właściwą cave/site i nie istnieć permanentnie w scenie dla odległych jaskiń.

## 10. Determinizm

Dla tego samego seed + cave site muszą być stabilne:

- archetyp,
- guaranteed home cave selection,
- topology,
- branch,
- treasure chamber selection,
- chest IDs,
- wagon/prop placement.

Nie używać globalnego przypadkowego RNG zależnego od kolejności streamowania.

Reuse `createCaveRandom()` / cave RNG ownership.

## 11. Testy

Dodać targeted automated tests obejmujące co najmniej:

### Archetype assignment

- w home-area istnieje dokładnie jedna gwarantowana adventure cave, gdy istnieje site akceptujący adventure topology,
- wybór jest deterministyczny,
- brak akceptowalnego site w podstawowym radius uruchamia fallback po istniejących sites,
- fallback nie tworzy nowego sztucznego cave site ani nie osłabia acceptance guardrails,
- pozostałe caves używają 15% deterministic adventure roll,
- guaranteed cave nie jest ponownie losowana przez 15% roll,
- niegwarantowany site z adventure roll, którego adventure topology zostaje odrzucona, próbuje niezmienionego natural recipe,
- taki fallback zachowuje natural cave, jeśli ten sam site byłby wcześniej zaakceptowany jako natural.

### Topology

Adventure cave:

- jest znacznie dłuższa od baseline natural cave,
- ma gwarantowany branch,
- posiada side chamber,
- posiada final chamber,
- junction jest wystarczająco czytelny/szeroki,
- zachowuje `minClearance`,
- nie łamie maximum traversable floor grade,
- odnogi zachowują wymagane disconnected clearance,
- topology jest deterministyczna,
- footprint/bounds nie rosną nieproporcjonalnie do długości trasy,
- przekroczenie adventure-specific heightfield bounds/cell budget powoduje deterministic reject/retry zamiast zmiany globalnego heightfield config.

### Treasure anchors

- powstają dokładnie 2 treasure anchors,
- mają różne stabilne IDs,
- side chest jest przypisana do side branch/chamber,
- final chest jest przypisana do deep/final chamber,
- final chest korzysta z lepszego reward tier niż side chest,
- ponowne wygenerowanie z tego samego seed daje te same wyniki.

### Regression

Normal cave:

- dla istniejących fixed seed/site fixtures zachowuje dotychczasowy topology output i acceptance behavior,
- nie zmienia istniejącego RNG consumption/order ani branch probability,
- nie otrzymuje automatycznie adventure props/chests,
- istniejące cave tests nadal przechodzą.

## 12. Manual browser verification

Browser verification wykonuje User.

Sprawdzić ręcznie:

1. W okolicy home settlement istnieje adventure cave, ale nie stoi bezpośrednio przy zabudowaniach.
2. Poza home-area da się znaleźć zarówno natural, jak i adventure caves.
3. Wejście nadal działa jak w obecnej Cave V3.
4. Adventure cave jest wyraźnie dłuższa od standardowej.
5. Eksploracja trwa przez kilka kolejnych przestrzeni, a nie jeden tunel + chamber.
6. Junction daje czytelny wybór dwóch dróg.
7. Side branch prowadzi do chest #1.
8. Main route prowadzi dalej do final chamber.
9. Final chamber zawiera chest #2.
10. Final chest daje wyraźnie lepszą nagrodę.
11. Wagon i pozostałe props stoją poprawnie na cave floor.
12. Props nie blokują przejścia.
13. Save/load po zabraniu loot nie respawnuje zawartości.
14. Normal caves nadal generują się normalnie i nie znikają przez nieudany adventure roll.
15. Brak widocznych nowych cave traversal/collision regressions.
16. Brak istotnego freeze przy wejściu/streamowaniu większej cave.

## Non-goals

Ten plan **nie obejmuje jeszcze**:

- zwierząt mieszkających w jaskini,
- NPC cave navigation,
- dungeon/kwadratowych tuneli,
- kopalni jako osobnego archetypu,
- ore deposits,
- wydobycia w ścianach jaskini,
- zawaliska rozwalanego kilofem,
- podziemnego jeziora,
- wody wewnątrz cave,
- pułapek projektowanych specjalnie dla jaskiń,
- proceduralnych ruin,
- questów,
- map skarbów,
- nowych modeli 3D wymagających zewnętrznego asset sourcing.

Fauna powinna później wejść przez `fauna-019`, a nie przez adventure-cave-specific spawn logic.

Kopalnia powinna zostać osobnym kolejnym archetypem korzystającym z tego samego `CaveTopology → CaveHeightfieldRepresentation` pipeline.

## Architectural guardrails

- Heightfield pozostaje jedynym production cave spatial authority.
- Nie przywracać SDF jako równoległego runtime.
- Nie tworzyć osobnego dungeon/cave graph.
- Nie tworzyć `AdventureCaveManager`.
- Nie tworzyć cave-specific chest/container system.
- Nie duplikować persistence treasure.
- Nie uzależniać cave generation od camera/player position.
- World seed i cave identity pozostają źródłem deterministycznego layoutu.
- Mutable state persistować tylko tam, gdzie istniejący system tego wymaga.
- Nie zmieniać istniejącego natural cave recipe ani jego seeded output/acceptance behavior.
- Adventure rejection dla niegwarantowanego site nie może usuwać natural cave, która byłaby zaakceptowana dla tego site.
- Nie zmieniać globalnego heightfield resolution/config w celu zmieszczenia adventure cave; kontrolować adventure footprint przed buildem.
- Zachować możliwość późniejszego dodania kolejnych archetypów, zwłaszcza `mine`, bez kolejnej przebudowy Cave subsystem.

Przed implementacją użyć istniejących implementation notes i zweryfikować tylko integration points, które materialnie zmieniły się od ich baseline, w szczególności:

- `buildProductionCaveTopology()`,
- cave lifecycle / streaming,
- CaveHeightfield ground queries,
- systemic treasure sites/containers,
- existing wagon/lantern/wood props.

Dla nowych ważnych publicznych/architektonicznych funkcji dodać użyteczny JSDoc z `@domain world-terrain`, jeśli poprawia to preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**