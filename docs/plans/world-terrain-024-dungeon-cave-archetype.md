# Plan: Dungeon cave archetype

**Created:** 2026-09-12
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~world-terrain-020~~
**Domain:** `world-terrain`
**Subdomains:** `terrain` `landmarks`
**Tags:** `caves` `dungeon` `exploration`
**Roadmap:** -

## Cel

Dodać trzeci production cave archetype: **`dungeon`**.

Dungeon cave ma być wyraźnie większą i bardziej złożoną przestrzenią eksploracyjną niż istniejące `natural` i `adventure` caves, przeznaczoną jako przyszły habitat dla kilku niebezpiecznych zwierząt oraz miejsce dla podziemnych zasobów i encounterów.

Ten plan obejmuje wyłącznie:

- wybór archetypu,
- generowanie większej i bardziej rozgałęzionej `CaveTopology`,
- integrację z istniejącym cave runtime,
- deterministyczną semantykę komnat potrzebną kolejnym planom.

Nie implementuje jeszcze:

- podziemnego jeziorka,
- zwierząt,
- fish/water resources,
- nowych questów,
- specjalnych dungeon enemies.

Dungeon nie jest osobnym systemem podziemi.

Musi korzystać z istniejącego pipeline:

```text
cave site
→ CaveArchetype
→ CaveTopology
→ CaveHeightfieldRepresentation
→ cave ground / collision / interior / presentation / streaming
```

Nie tworzyć `DungeonManager`, `DungeonGraph`, osobnej reprezentacji geometrii ani równoległego systemu caves.

---

## 1. Rozszerzenie `CaveArchetype`

Obecny production contract posiada:

```ts
type CaveArchetype = 'natural' | 'adventure'
```

Rozszerzyć go do:

```ts
type CaveArchetype = 'natural' | 'adventure' | 'dungeon'
```

Relevant code:

- `src/world/caves/caveArchetype.ts`
- `src/world/createCaves.ts`
- `src/world/caves/productionTopology.ts`
- `src/world/caves/adventureTopology.ts`

Dungeon ma oznaczać **inny recipe `CaveTopology`**, nie inny cave runtime.

Natural i adventure pozostają istniejącymi archetypami i nie mogą zostać funkcjonalnie zmienione przy okazji tego planu.

---

## 2. Osobny dungeon topology recipe

Dodać dedykowany builder, np.:

```text
src/world/caves/dungeonTopology.ts
```

z publicznym wejściem analogicznym do istniejącego:

```ts
buildDungeonCaveTopology(input: CaveRecipeInput): CaveTopology | null
```

Reuse istniejące primitives z:

- `caveRoute.ts`,
- `caveRng.ts`,
- `caveHeightfieldRepresentation.ts`,
- terrain/overburden adaptation,
- route grade constraints,
- disconnected passage clearance,
- topology acceptance/rejection.

Nie kopiować całego `adventureTopology.ts`.

Jeżeli dungeon i adventure potrzebują wspólnych helperów, wydzielić tylko rzeczywiście współdzielone representation-neutral route/layout primitives bez zmiany wyników istniejącego adventure recipe.

---

## 3. Charakter dungeon cave

Dungeon ma różnić się od adventure nie tylko długością.

Docelowo ma mieć **większą liczbę kolejnych przestrzeni i decyzji nawigacyjnych**, tak aby później można było przypisać mieszkańców i zasoby do konkretnych komnat.

### Minimalne właściwości

Zaakceptowany dungeon musi posiadać:

- co najmniej **5 chamber nodes**,
- docelowo typowo **5–8 komnat**,
- co najmniej **2 czytelne junctions / branch decisions**,
- co najmniej **1 side branch** zakończony komnatą,
- głęboką część końcową,
- stabilnie identyfikowalne komnaty,
- wyraźnie większą całkowitą długość trasy niż `adventure`.

Nie wymagać dokładnie 8 komnat dla każdego seed/site. Terrain guardrails mają pierwszeństwo.

Jeżeli wygenerowany wariant nie spełnia minimalnego kontraktu dungeon, recipe powinien retry/reject, nie degradować się po cichu do krótszej struktury nazywanej dungeon.

---

## 4. Docelowy charakter layoutu

Dungeon powinien przypominać sieć kolejnych podziemnych sekcji, np.:

```text
entrance
   │
passage
   │
chamber A
   │
junction 1
  /       \
 /         \
side       main
chamber B    │
             │
         chamber C
             │
         junction 2
          /      \
         /        \
 chamber D       passage
                   │
               chamber E
                   │
               deep passage
                   │
               chamber F
                   │
               final chamber
```

To jest **wzorzec semantyczny**, nie sztywny geometryczny template.

Generator może deterministycznie zmieniać:

- długości passages,
- kąty zakrętów,
- szerokości i wysokości,
- stronę branches,
- dokładną liczbę opcjonalnych chambers,
- lokalne centerline wobble,
- kolejność nieobowiązkowych section variants.

Musi jednak zachować czytelną connectivity oraz stable semantic identity.

---

## 5. Stable chamber identity

Późniejsze plany będą przypisywać do komnat:

- cave residents,
- underground pool,
- environmental resources,
- potencjalne quest/world content.

Nie wolno identyfikować komnaty przez pozycję w `topology.nodes[]`.

Każda semantycznie istotna dungeon chamber powinna posiadać stabilne role-based albo deterministic node ID.

Przykładowo:

```text
dungeon-chamber-1
dungeon-side-chamber-1
dungeon-chamber-2
dungeon-side-chamber-2
dungeon-deep-chamber
dungeon-final-chamber
```

Dokładna nomenklatura może zostać dopasowana do generatora, ale dla tego samego:

```text
world seed + caveId + accepted layout
```

identity komnat musi być stabilne.

Nie dodawać `animal`, `pool`, `loot` ani innych content roles do `CaveTopologyNodeKind`.

`CaveTopology` nadal opisuje przestrzeń i connectivity.

---

## 6. Chamber discovery contract

Kolejne systemy nie powinny znać layout-specific constants ani importować szczegółów `dungeonTopology.ts`, jeśli potrzebują po prostu listy użytkowych komnat.

Dodać lub rozszerzyć representation-neutral helper umożliwiający uzyskanie dungeon chamber candidates na podstawie `CaveTopology`, np. przez:

```ts
topology.nodes.filter(node => node.kind === 'chamber')
```

uzupełnione o stabilne zasady exclusion/classification tam, gdzie będą potrzebne.

Nie tworzyć na tym etapie `DungeonRoom` jako drugiego modelu stanu.

Jeżeli potrzebne jest rozróżnienie:

- entrance-adjacent chamber,
- regular chamber,
- side chamber,
- deep/final chamber,

preferować istniejące stable node IDs / layout semantics zamiast mutowania bazowego `CaveTopologyNodeKind` w content vocabulary.

Celem jest, aby kolejny plan fauna mógł wybrać chamber residents bez ponownego rekonstruowania dungeon layoutu.

---

## 7. Większy, ale kontrolowany footprint

Dungeon będzie większy od `adventure`, ale production cave representation nadal używa prostokątnego XZ heightfield.

Nie można więc skalować długości poprzez szerokie rozrzucenie trasy po świecie.

Preferować:

- folded routes,
- zawracające sections,
- zwarty footprint,
- kilka branchy mieszczących się blisko głównego przebiegu,
- kontrolowany dystans między niepołączonymi passages.

Reuse wzorca z `adventureTopology.ts`, gdzie footprint jest szacowany przed budową finalnego heightfieldu.

Dodać dungeon-specific budget, np. odpowiednik:

```ts
DUNGEON_MAX_HEIGHTFIELD_CELLS
```

Nie ustalać wartości mechanicznie jako wielokrotności `ADVENTURE_MAX_HEIGHTFIELD_CELLS`. Dobrać ją na podstawie realnego layoutu i `estimateHeightfieldGrid()`.

Nie zmieniać globalnego:

```text
DEFAULT_HEIGHTFIELD_CONFIG.cellSize
```

ani wspólnych limitów wszystkich caves.

Przekroczenie dungeon budget ma skutkować bounded deterministic retry/reject.

---

## 8. Generation attempts i bounded work

Większy topology recipe nie może generować nieograniczonej liczby prób.

Dungeon builder musi posiadać stały bounded attempt budget podobny do adventure.

Każda próba:

1. deterministycznie generuje layout,
2. sprawdza terrain/overburden,
3. sprawdza grade i clearance,
4. sprawdza minimalny dungeon semantic contract,
5. sprawdza estimated heightfield footprint,
6. acceptuje albo przechodzi do kolejnej próby.

Nie generować pełnego expensive heightfieldu dla layoutu, który już na etapie topology/bounds można odrzucić.

---

## 9. Archetype assignment

Rozszerzyć istniejący `assignCaveArchetypes()` zamiast tworzyć osobny dungeon assignment system.

### Guaranteed dungeon

Świat powinien posiadać co najmniej jeden `dungeon`, o ile którykolwiek z istniejących cave sites potrafi zaakceptować dungeon topology.

Istniejący cave siting tworzy sites w world-scale pierścieniu, a adventure posiada własną gwarancję bliżej home. Dungeon powinien być wyraźnie dalszym celem wyprawy.

Preferowany dungeon band:

- minimum: **300 m od home**,
- maksimum: istniejący outer cave siting radius (`RING_MAX`, obecnie 620 m),
- preferować środkowo-zewnętrzną część tego zakresu, szczególnie okolice **400–550 m**, aby dungeon nie konkurował przestrzennie z guaranteed adventure cave.

Nie wymagać obecności site dokładnie w 400–550 m. Jest to preferencja rankingowa, nie nowy siting constraint.

Bounded deterministic flow:

1. zachować existing guaranteed home adventure selection bez zmian,
2. wyłączyć wybrany guaranteed adventure site z dungeon candidate selection,
3. spośród pozostałych istniejących sites deterministycznie uporządkować dungeon candidates,
4. najpierw próbować sites w preferred dungeon band, z rankingiem preferującym środkowo-zewnętrzną część zakresu,
5. pierwszy site z zaakceptowanym dungeon topology staje się guaranteed dungeon,
6. jeśli preferred candidates zawiodą, próbować pozostałe istniejące sites w stabilnej kolejności,
7. nie syntetyzować nowego cave site i nie osłabiać terrain/topology acceptance guardrails,
8. guaranteed dungeon nie bierze udziału w późniejszym random dungeon roll.

Jeśli żaden istniejący site nie potrafi zaakceptować dungeon topology, świat może nie posiadać dungeon. Nie wolno dla samej gwarancji tworzyć sztucznej jaskini ani osłabiać spatial/terrain constraints.

Wybór musi zależeć od stabilnego world seed + cave/site identity, nie od kolejności streamowania.

### Additional dungeon caves

Pozostałe caves otrzymują niezależny deterministic **5% dungeon attempt chance**.

Dungeon powinien być rzadszy od `adventure`, ale nie ograniczony do dokładnie jednej sztuki na świat.

Nie używać wspólnego RNG stream w sposób, który przesunie istniejące adventure rolls. Dungeon roll musi mieć własny salt/stream.

Assignment priority dla sites nieobjętych gwarancjami:

```text
dungeon roll
→ existing adventure roll
→ natural
```

Jeżeli site wylosuje dungeon, ale dungeon topology zostanie odrzucona:

1. nadal powinien zachować możliwość stania się `adventure` zgodnie ze swoim istniejącym adventure roll,
2. następnie fallback do `natural`.

Dungeon failure nie może usuwać cave site ani zmieniać wcześniejszego natural/adventure fallback contract.

### Regression requirement

Dodanie dungeon archetype nie może:

- usunąć istniejącej guaranteed home adventure cave,
- zmienić jej wyboru,
- zmieniać `rollsAdventure(caveId)`,
- zmieniać natural/adventure topology dla tego samego seed/site,
- powodować utraty cave, którą obecne recipes potrafią zaakceptować.

---

## 10. Determinizm

Dla tego samego world seed + cave sites stabilne muszą być:

- guaranteed dungeon selection,
- dungeon roll,
- archetype assignment,
- topology,
- liczba chambers,
- branch topology,
- node IDs,
- accepted layout attempt,
- footprint.

Dungeon RNG powinien otrzymać osobne salts dla co najmniej logicznie niezależnych decyzji, analogicznie do istniejących:

- archetype,
- layout,
- branch,
- centerline/shape.

Dodanie późniejszego content roll nie powinno przesuwać structural RNG.

---

## 11. Bez contentu dungeon na tym etapie

Plan nie dodaje jeszcze:

- treasure,
- wagonów,
- lamp,
- nowych props,
- underground pool,
- animals.

Istniejące adventure content anchors muszą pozostać adventure-only.

Kod w rodzaju:

```ts
if (input.archetype !== 'adventure') return EMPTY_ANCHORS
```

nie powinien być rozszerzany sztucznie tylko po to, aby dungeon dostał przypadkowe adventure props.

Dungeon content będzie dodawany przez osobne plany.

---

## 12. Integracja z `Caves`

`createCaves.ts` ma nadal tworzyć jeden wspólny `CaveRuntime` niezależnie od archetypu.

Dungeon musi automatycznie odziedziczyć istniejące:

- cave identity,
- retained `CaveTopology`,
- `CaveHeightfieldRepresentation`,
- ground query,
- horizontal containment,
- interior detection,
- player traversal,
- streaming,
- cave habitat resolution.

Nie dodawać dungeon-specific path do:

- player movement,
- ground sampling,
- cave collision,
- cave interior state,
- streaming.

Jeżeli któreś z tych miejsc wymaga switcha po archetypie do działania dungeon, traktować to jako sygnał niewłaściwego ownershipu i najpierw sprawdzić, czy istniejący common cave contract można wykorzystać bez specjalnego przypadku.

---

## 13. Relacja z cave habitats

`fauna-019` już umożliwia wyprowadzenie `CaveTraversalDescriptor` z realnego `CaveTopology`.

Dungeon topology musi zachować ten kontrakt.

Szczególnie:

- graph `segments` musi odpowiadać realnej connectivity,
- każda chamber musi być osiągalna od entrance,
- centerlines muszą wystarczać do późniejszego route traversal,
- dungeon nie może wymagać navmesh lub osobnego dungeon routing systemu.

Ten plan nie tworzy `AnimalHabitatBinding`.

Późniejszy fauna plan będzie konsumentem wygenerowanych dungeon chambers.

---

## 14. Performance

Dungeon jest rzadki, ale pojedyncza jaskinia będzie większa.

Sprawdzić szczególnie:

- `estimateHeightfieldGrid()` cells,
- final heightfield memory,
- generated mesh vertex/index count,
- topology generation attempts,
- koszt cave streaming,
- brak dodatkowej pracy dla odległych dungeon caves po zbudowaniu world definitions.

Nie zwiększać kosztu każdej `natural`/`adventure` cave dla mechanizmu potrzebnego wyłącznie dungeonowi.

Nie przenosić generatora do Workera tylko z powodu większego recipe. Najpierw zachować obecny pipeline i zmierzyć realny koszt.

---

## 15. Testy automatyczne

Dodać targeted tests.

### Archetype

Sprawdzić:

- `CaveArchetype` obsługuje `dungeon`,
- dungeon roll jest deterministyczny,
- jego RNG nie wpływa na istniejący `rollsAdventure()`,
- guaranteed home adventure nadal istnieje według dotychczasowych zasad i zachowuje ten sam wybór,
- guaranteed dungeon jest wybierany spośród pozostałych istniejących cave sites,
- preferowany jest dungeon site w dalszym bandzie, jeśli potrafi zaakceptować topology,
- brak akceptowalnego site w preferred dungeon band uruchamia fallback po pozostałych istniejących sites,
- guaranteed dungeon nie tworzy nowego site i nie osłabia acceptance guardrails,
- guaranteed dungeon nie bierze udziału w dodatkowym 5% dungeon roll,
- site z zaakceptowanym dungeon roll może dostać dungeon,
- rejected dungeon próbuje dalej existing adventure/natural fallback,
- rejected dungeon nie usuwa istniejącej cave.

### Topology

Zaakceptowany dungeon:

- posiada minimum 5 chamber nodes,
- posiada co najmniej 2 branch/junction decisions,
- posiada side chamber,
- wszystkie chambers są osiągalne od entrance,
- ma stabilne node IDs,
- jest wyraźnie dłuższy od adventure baseline fixture,
- zachowuje `minClearance`,
- nie przekracza grade guardrails,
- zachowuje disconnected path clearance,
- mieści się w dungeon-specific footprint budget,
- daje identyczny topology output dla tego samego seed/site.

### Rejection

Sprawdzić:

- zbyt duży footprint powoduje retry/reject,
- brak wystarczającego overburden powoduje reject,
- layout niespełniający minimalnej liczby chambers nie jest acceptowany jako dungeon,
- attempt count pozostaje bounded.

### Regression

Sprawdzić istniejące fixed fixtures dla:

- `natural`,
- `adventure`,
- archetype assignment,
- adventure home guarantee.

Dodanie dungeon nie może zmienić ich topology output ani istniejących deterministic rolls.

---

## 16. Manual browser verification

Browser verification wykonuje User.

Sprawdzić ręcznie:

1. Natural i adventure caves nadal wyglądają i działają jak wcześniej.
2. W normalnym świecie istnieje guaranteed dungeon, jeżeli przynajmniej jeden istniejący cave site potrafi zaakceptować dungeon topology.
3. Guaranteed dungeon znajduje się wyraźnie dalej od home niż adventure i stanowi cel wyprawy.
4. Możliwe są dodatkowe dungeon caves, ale pozostają rzadkie.
5. Dungeon jest wyraźnie większy od adventure.
6. Dungeon posiada kilka kolejnych chambers, nie tylko dłuższe passages.
7. Występują co najmniej dwa czytelne rozwidlenia.
8. Nie ma oczywistych przecięć niepołączonych tunnels.
9. Nie ma niedostępnych chambers.
10. Player przechodzi przez całość przy użyciu obecnego cave movement/collision.
11. Ground i cave interior detection działają w głębokich i bocznych chambers.
12. Streaming wejście/wyjście nie pozostawia dungeon geometry ani nie gubi jej fragmentów.
13. Nie widać istotnego regresu startup/runtime performance.

AI nie wykonuje browser verification.

---

## 17. Dokumentacja

Po implementacji zaktualizować odpowiednie state docs tylko w zakresie rzeczywiście zmienionego current state:

- caves posiadają trzeci archetyp `dungeon`,
- jego generation/rarity,
- guaranteed dungeon selection,
- stable chamber topology contract.

Nie dokumentować jeszcze underground pool ani dungeon animals jako zaimplementowanych.

Ważne publiczne/architektoniczne funkcje i klasy dodać do JSDoc tam, gdzie poprawia to preflight discovery; używać `@domain world-terrain`.

Nie uruchamiać ręcznie repo-wide unrelated refactors.

---

## Non-goals

Poza zakresem:

- underground lake/pool,
- fish source,
- water interaction,
- cave fauna population,
- dungeon guard/enemy system,
- aggression changes,
- animal variants,
- treasure/content rewards,
- quests,
- NPC cave traversal,
- procedural navmesh,
- nowy cave spatial representation,
- multiplayer-specific networking.

Dungeon ma przygotować **world geometry i semantic chamber structure**, z których te systemy będą później korzystać.

---

## Kryterium zakończenia

Plan jest wykonany, gdy istniejący production cave pipeline potrafi deterministycznie wygenerować trzeci archetyp `dungeon`, który:

- korzysta ze zwykłego `CaveRuntime`,
- ma gwarantowaną próbę umieszczenia co najmniej jednego dungeon w dalszej części istniejącego cave siting range,
- pozwala również na rzadkie dodatkowe dungeon caves przez niezależny 5% roll,
- zawiera minimum 5 i typowo 5–8 komnat,
- posiada co najmniej dwa branch decisions,
- zachowuje istniejące terrain/spatial guardrails,
- mieści się w kontrolowanym heightfield budget,
- udostępnia stabilną topology/identity komnat dla kolejnych systemów,
- nie zmienia dotychczasowego zachowania `natural` i `adventure` caves.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
