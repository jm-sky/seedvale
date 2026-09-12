# Plan: Underground cave pool

**Created:** 2026-09-12
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** world-terrain-024
**Domain:** `world-terrain`
**Subdomains:** `terrain` `landmarks`
**Tags:** `caves` `dungeon` `water`
**Roadmap:** -

## Cel

Dodać do każdego zaakceptowanego `dungeon` cave jedno deterministyczne podziemne jeziorko / pool, będące rzeczywistą częścią geometrii i semantyki jaskini.

Pool ma:

- znajdować się w jednej z dungeon chambers,
- posiadać fizyczne zagłębienie w cave floor,
- posiadać widoczną powierzchnię wody,
- udostępniać wspólną semantykę `WaterSource`,
- być `unsafe` dla gracza,
- wystawiać stabilny environmental contract dla późniejszej integracji fauna.

Nie tworzyć osobnego systemu `DungeonWater`.

Docelowy przepływ:

```text
dungeon topology candidate
→ deterministic pool chamber selection
→ pool geometry intent
→ CaveHeightfieldRepresentation + basin
→ geometry / dry-traversal validation
→ accepted dungeon
→ water presentation + semantic water source
```

Ten plan nie implementuje ryb ani animal foraging. Pool przygotowuje world authority, którą późniejszy plan fauna wykorzysta jako wodę oraz miejsce environmental fish source.

---

## 1. Pool jako acceptance criterion dungeon

Każdy **zaakceptowany** `dungeon` musi posiadać dokładnie jeden poprawny underground pool.

Nie dodawać pool do `natural` ani `adventure`.

Nie używać dodatkowego probability roll.

Nie wciskać pool na siłę do topology, która nie może go poprawnie pomieścić. Jeżeli candidate dungeon nie pozwala wygenerować pool spełniającego geometryczne i traversal guardrails, cały dungeon candidate jest rejected.

To rozszerza acceptance criteria z `world-terrain-024`:

```text
accepted dungeon
=
valid topology
+ valid pool chamber
+ valid basin
+ valid dry traversal
```

Guaranteed dungeon z `world-terrain-024` może wtedy próbować kolejnych istniejących cave sites / deterministic candidates zamiast osłabiać guardrails.

---

## 2. Pool jako semantic cave feature

Nie dodawać `pool`, `lake` ani `water` do `CaveTopologyNodeKind`.

`CaveTopology` nadal opisuje shape i connectivity. Pool jest environmental content przypisanym do konkretnej chamber.

Wprowadzić najmniejszy representation-neutral cave environmental-water contract wymagany przez heightfield, presentation i przyszłych consumers. Dokładne pola i ownership ustalić podczas implementation recon na podstawie istniejących cave call-sites.

Contract musi co najmniej umożliwiać ustalenie:

- stable source identity,
- `caveId`,
- stable chamber identity,
- geometry footprint,
- water level,
- usable shoreline / approach semantics.

Nie tworzyć globalnego mutable `CaveWaterManager` ani drugiego modelu dungeon rooms.

---

## 3. Stable identity i determinizm

Pool musi posiadać stabilną tożsamość wynikającą z cave identity i semantic role, np. `<caveId>:underground-pool`.

Nie używać runtime UUID, indeksu `topology.nodes[]` ani kolejności streamowania.

Dla tego samego `world seed + caveId + dungeon topology` wybór chamber, footprint, basin i water level muszą być deterministyczne.

Użyć osobnego deterministic RNG salt dla pool geometry/content tak, aby późniejsze rozszerzenia nie przesuwały structural dungeon RNG.

---

## 4. Wybór pool chamber przed heightfieldem

Pool chamber wybrać na poziomie dungeon recipe po zbudowaniu topology candidate, ale **przed** finalnym `CaveHeightfieldRepresentation`.

Wykorzystać stable dungeon chamber semantics z `world-terrain-024`.

Kandydat musi:

- być rzeczywistą chamber, nie passage,
- mieć wystarczający footprint,
- pozwalać na basin bez blokowania connectivity,
- pozostawiać użyteczny suchy brzeg,
- znajdować się poza bezpośrednią strefą entrance.

Preferować środkową lub głębszą część dungeon. Nie kodować pozycji typu `chamber #4`.

Nie wymagać final chamber; zachować ją dla przyszłego contentu, chyba że deterministic selection uzna ją za poprawnego kandydata bez ograniczania użytecznej przestrzeni.

Jeżeli żadna chamber nie spełnia guardrails, candidate dungeon jest rejected.

---

## 5. Realny basin w `CaveHeightfieldRepresentation`

Pool nie może być wyłącznie transparentnym water plane nad zwykłym cave floor.

Pool intent musi wpływać na finalny cave heightfield tak, aby powstało rzeczywiste zagłębienie z:

- łagodnym wejściem / obrzeżem,
- obniżonym dnem,
- nieregularnym naturalnym footprintem,
- czytelnym przejściem między dry floor i wodą.

Nie tworzyć idealnego walca, koła ani prostokątnego dołu.

Reuse istniejące heightfield sampling, floor, clearance, overburden i rejection mechanisms. Nie tworzyć osobnego high-resolution pool heightfieldu.

---

## 6. Depth i dry traversability

Pool powinien wyglądać jak małe podziemne jeziorko, nie kałuża, ale nie może stać się obowiązkowym water crossing.

Dungeon musi pozostać traversable suchą drogą.

Pool basin nie może:

- przecinać chamber entrance,
- blokować segment connectivity,
- niszczyć required route,
- tworzyć niemożliwego do opuszczenia zagłębienia,
- naruszać wall/ceiling clearance.

Wokół części pool pozostawić suchy shoreline corridor.

Nie implementować w tym planie nowej mechaniki pływania.

---

## 7. Naturalny footprint

Pool nie powinien być idealnym kołem.

Użyć taniej deterministic deformation: np. elliptical/radial footprint z low-frequency perturbation lub równie prostego mechanizmu zgodnego z istniejącym cave representation.

Nie dodawać hydrology simulation.

Basin, water surface i interaction/environmental queries muszą wynikać z tej samej geometry authority. Nie losować niezależnych kształtów dla heightfield i water mesh.

---

## 8. Water presentation

Dodać cave-local water surface zgodną z finalnym footprint i `waterLevel`.

Najpierw reuse istniejący water rendering/material mechanism, jeśli nadaje się do małej lokalnej powierzchni. Jeżeli surface water renderer jest silnie związany z globalnym terrain/water level, wydzielić najmniejszy reusable presentation primitive zamiast tworzyć drugi pełny renderer.

Water surface:

- znajduje się poniżej otaczającego chamber floor,
- nie przecina cave walls,
- nie wystaje poza basin,
- aktywuje/dezaktywuje się razem z cave presentation.

Nie dodawać osobnego render pass, physics water ani dynamicznej hydrologii.

---

## 9. Wspólny `WaterSource`

Pool jest rzeczywistym environmental water source, nie tylko dekoracją.

Reuse istniejący `WaterSource`; nie tworzyć równoległych gameplay abstractions typu `DungeonDrinkSource` czy `AnimalCaveWater`.

Dla V1 underground pool ma semantykę zwykłego niebezpiecznego lake water:

```ts
{
  kind: 'lake',
  quality: 'unsafe'
}
```

Nie zakładać, że podziemna woda jest czysta. Obecność zwierząt dodatkowo uzasadnia `unsafe`.

---

## 10. Player drink/fill — bounded integration

Nie rozszerzać zakresu planu o nowy player-water subsystem.

Jeżeli istniejący player drink/fill pipeline może przyjąć cave pool przez mały semantic/spatial adapter do istniejącego `WaterSource`, podłączyć go i reuse istniejące:

- drink action,
- fill action,
- contamination/risk handling,
- inventory water logic.

Jeżeli obecny resolver jest na tyle związany z surface terrain, że integracja wymaga nowej architektury lub szerszego refactoru, **nie wykonywać go w tym planie**. W takim przypadku pozostawić stabilny cave water contract i zapisać follow-up plan.

Nie udawać, że underground pool jest globalnym surface lake ani nie rozszerzać globalnego terrain water detection specjalnymi cave wyjątkami.

---

## 11. Reusable shoreline approach

Środek pool nie jest poprawnym interaction/navigation targetem.

Environmental contract powinien pozwalać deterministycznie uzyskać co najmniej jeden usable shoreline approach point lub równoważną query semantics.

Approach powinien:

- znajdować się na suchym cave floor,
- leżeć przy brzegu,
- posiadać odpowiedni clearance,
- być osiągalny z chamber route,
- nie znajdować się wewnątrz basin.

Nie tworzyć osobnych player i animal shoreline points bez potrzeby. Późniejsza fauna powinna móc reuse tę samą environmental authority.

---

## 12. Fauna integration contract

Ten plan nie implementuje animal behavior i nie może wprowadzać zależności `world-terrain → fauna`.

World/cave subsystem publikuje environmental state; fauna jest przyszłym konsumentem.

Contract musi być wystarczający, aby późniejszy plan fauna nie musiał analizować water mesh, odtwarzać pool geometry ani odczytywać presentation objects w celu znalezienia wody.

Rozszerzenie `AnimalCaveWorldContract` lub `animalForaging` pozostaje własnością późniejszego planu fauna.

---

## 13. Fish source poza zakresem

Pool będzie później niewyczerpywalnym źródłem ryb dla cave animals, ale nie implementować tego tutaj.

Nie:

- spawn fish items,
- dodawać fish population,
- dodawać player fishing spot,
- dodawać bear-specific logic,
- rozszerzać `animalForaging`,
- dodawać hunger relief.

Późniejszy fauna plan zwiąże environmental fish food source z istniejącym cave pool bez modyfikowania jego geometrii.

Player fishing również pozostaje poza zakresem.

---

## 14. Streaming i lifecycle

Pool należy do tej samej lifecycle boundary co cave.

Semantic definition może być deterministycznym cave/world state, ale water mesh i presentation resources muszą aktywować/dezaktywować się razem z cave.

Po unload nie pozostawiać mesh, material instances, interaction helpers ani listenerów.

Nie utrzymywać globalnie renderowanych underground water surfaces dla nieaktywnych caves.

---

## 15. Persistence

Chamber selection, geometry, water level i shoreline są deterministyczne i nie powinny być persistowane, jeżeli można je odtworzyć z world seed/cave identity/topology.

Pool V1:

- nie wysycha,
- nie zmienia poziomu,
- nie posiada dynamicznej contamination state,
- nie posiada mutable fish population.

Nie dodawać save schema tylko dla pool.

---

## 16. Performance

Koszt musi pozostać lokalny dla rzadkich dungeon caves.

Unikać:

- dodatkowego high-resolution heightfieldu,
- physics water simulation,
- osobnego reflection render pass,
- per-frame shoreline generation,
- dynamicznej hydrologii,
- update loops dla nieaktywnych caves.

Pool shape i mesh mogą zostać policzone przy generation/activation. Runtime powinien być praktycznie statyczny poza reused water material animation, jeśli taka istnieje.

---

## 17. Testy automatyczne

Dodać targeted tests dla nowych contracts i guardrails.

### Generation / acceptance

- accepted `dungeon` posiada dokładnie jeden pool,
- dungeon candidate bez poprawnego pool jest rejected,
- pool wskazuje istniejącą chamber, nie passage,
- selection i geometry są deterministyczne,
- `natural` i `adventure` nie otrzymują pool.

### Placement / heightfield

Sprawdzić:

- pool mieści się w wybranej chamber,
- basin nie przecina required route,
- istnieje dry shoreline approach,
- water level jest poniżej otaczającego floor,
- samples w basin są niższe niż shoreline,
- samples poza footprint zachowują bazowy chamber floor,
- clearance/ceiling guardrails są zachowane.

### Water semantics

Sprawdzić wspólną semantykę:

```text
kind = lake
quality = unsafe
```

### Regression

Sprawdzić:

- natural cave generation bez zmian,
- adventure cave generation bez zmian,
- dungeon connectivity pozostaje poprawne,
- istniejące surface lake/river/ocean semantics bez zmian.

---

## 18. Manual browser verification

Browser verification wykonuje User.

Sprawdzić ręcznie:

1. Każdy zaakceptowany dungeon posiada dokładnie jeden underground pool.
2. Pool znajduje się w rzeczywistej chamber, nie w tunnel.
3. Wygląda jak część cave floor, a nie water plane położony na kamieniu.
4. Basin ma widoczną głębokość i naturalny, nieregularny shoreline.
5. Wokół części pool można przejść suchą drogą.
6. Pool nie blokuje dalszej eksploracji dungeon.
7. Player nie wpada w miejsce, z którego nie może wyjść.
8. Water surface nie przecina cave walls.
9. Player może podejść do stabilnego brzegu.
10. Jeżeli bounded drink/fill integration została wykonana, korzysta z istniejącego UX i traktuje wodę jako `unsafe`.
11. Po odstreamowaniu cave water presentation znika poprawnie.
12. Natural i adventure caves nie otrzymały pool.
13. Brak zauważalnego regresu wydajności cave rendering.

AI nie wykonuje browser verification.

---

## 19. Dokumentacja

Po implementacji zaktualizować odpowiednie current-state docs.

Udokumentować wyłącznie stan faktycznie zaimplementowany:

- accepted dungeon posiada guaranteed underground pool,
- pool jest częścią cave environmental state,
- posiada realny heightfield basin,
- korzysta ze wspólnej semantyki `WaterSource`,
- woda jest `unsafe`,
- istnieje reusable shoreline/water contract dla przyszłych consumers.

Nie dokumentować jeszcze fish source, bear feeding, cave animal drinking ani player fishing.

Ważne publiczne/architektoniczne funkcje i typy opisać JSDoc tam, gdzie poprawia to preflight discovery; użyć `@domain world-terrain`.

---

## Non-goals

Poza zakresem:

- fish population,
- infinite fish source,
- player fishing,
- animal drinking behavior,
- animal hunger/foraging,
- bear-specific behavior,
- fauna spawning,
- dungeon residents,
- swimming redesign,
- underwater combat,
- dynamic water level,
- hydrology simulation,
- water purification,
- dynamic contamination,
- nowy globalny water system,
- szeroki refactor player water interactions.

---

## Kryterium zakończenia

Plan jest wykonany, gdy każdy **zaakceptowany** `dungeon` posiada deterministyczne podziemne jeziorko, które:

- znajduje się w poprawnej dungeon chamber,
- jest częścią dungeon acceptance criteria,
- posiada rzeczywisty basin w `CaveHeightfieldRepresentation`,
- posiada spójną water presentation,
- zachowuje suchą traversable route,
- posiada stabilną semantic identity,
- korzysta ze wspólnej semantyki `WaterSource`,
- jest `unsafe` dla gracza,
- udostępnia reusable shoreline/water contract dla przyszłego fauna integration,
- nie wprowadza równoległego cave-water gameplay systemu,
- nie zmienia zachowania `natural` i `adventure` caves.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
