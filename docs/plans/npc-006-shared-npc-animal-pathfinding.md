# Plan: Shared NPC and Animal Pathfinding

**Created:** 2026-08-31
**Status:** `planned` 📋
**Priority:** high · **Effort:** L
**Depends on:** `none`
**Domain:** `npc`
**Subdomains:** `locomotion` `navigation`
**Tags:** `pathfinding` `A*` `animals` `performance`

## Cel

Dodać wspólną warstwę nawigacji dla NPC i animals, która zastępuje bezpośrednie przemieszczanie się do odległego celu lokalną trasą z waypointami, bez tworzenia osobnych systemów dla obu typów agentów.

Pathfinding rozszerza istniejący movement, nie zastępuje `steerTo`/`steerToward` ani `stepWithSlopeAndCollision()`.

Główne problemy: ruch po linii prostej i zakleszczanie na przeszkodach; istniejący `npcMovementWatchdog` ma `repath`, ale bez rzeczywistego path search; predator/flee potrzebuje omijania przeszkód bez utraty targetu; house colliders nie są wiarygodną mapą nawigacji, bo drzwi mogą mieć collider mimo logicznej możliwości przejścia; pathfinding nie może wykonywać kosztownego searchu co frame.

## Zakres

### 1. Wspólna warstwa Navigation

Wprowadzić mały mechanizm niezależny od `NpcAgent`/`AnimalAgent`, odpowiedzialny za walkability, lokalny search, waypointy i unieważnianie tras. Pierwszy wariant: bounded local grid + A*. Nie tworzyć globalnego navmesha.

### 2. NavigationQuery

Pathfinding nie powinien traktować `ColliderRegistry` jako kompletnej mapy nawigacji. Wprowadzić abstrakcję określającą walkability dla profilu agenta, koszt nachylenia/terenu i ograniczenia wody/obszarów specjalnych. Ponownie użyć istniejącego slope sampling i collision mechanisms bez kopiowania ich logiki.

House collision geometry pozostaje osobnym problemem. Pathfinding nie może uzależniać przechodniości wejścia wyłącznie od wadliwego collidera drzwi. Naprawa całego house collider generation jest poza zakresem.

### 3. NPC

Zachować action/decision/plan lifecycle i destination jako własność istniejącego state. Przed ruchem do dalszego celu uzyskać path; `steerTo()` nadal realizuje movement między waypointami. Repath tylko po blocked/stuck, istotnym przesunięciu targetu albo utracie ważności trasy. Wykorzystać istniejący `npcMovementWatchdog`, bez drugiego stuck detectora. Repath nie może oznaczać retargetingu.

### 4. Animals

Użyć tego samego mechanizmu dla chase, flee oraz w razie potrzeby wander/forage/drink/eat. Profil agenta może określać promień, maksymalne nachylenie i dopuszczalny teren/wodę. Target commitment z `npc-005` pozostaje bez zmian: repath prowadzi do tego samego prey targetu.

### 5. Performance

Implementacja request-based, nie per-frame: brak A* w każdej klatce, bounded search radius/node count, waypoint simplification i brak globalnego przeliczania świata. Pierwsza wersja na main thread. Worker, cache i shared spatial navigation index pozostają decyzjami po benchmarku.

### 6. Streaming / hybrid simulation

Navigation musi być lokalna i zgodna ze streamingiem chunków. Szczegółowy pathfinding dotyczy aktywnych/istotnych agentów; odległa symulacja nie powinna automatycznie otrzymywać szczegółowych paths.

## Poza zakresem

- globalny navmesh i globalny navigation graph,
- pełny hierarchical pathfinding,
- Web Worker dla A*,
- przebudowa house collider generation,
- osobny NPC/animal pathfinder,
- zmiana decision/goal/target selection,
- zastąpienie collision resolution przez navigation,
- cache/spatial-index bez pomiaru potrzeby.

## Performance constraints

`docs/performance/README.md` wskazuje obecnie relatywnie niski koszt CPU simulation, ale przyszłą skalowalność jako ryzyko. Implementacja ma umożliwiać pomiar path requests/s, search time, visited nodes/request, active paths, repaths oraz frame p50/p95/max i NPC/fauna time. Przy wzroście kosztu kolejne kandydatury to batching, cache/coarse routes, hierarchical navigation lub worker — dopiero po benchmarku.

## Kolejność implementacji

1. Potwierdzić aktualne movement/collision/chunk integration points i wyznaczyć minimalny `NavigationQuery`.
2. Zaimplementować bounded local grid + A* oraz waypoint simplification.
3. Dodać agent profiles i testy czystej logiki path search.
4. Podłączyć NPC do path → existing steering → existing slope/collision.
5. Podłączyć animals, zaczynając od chase/flee.
6. Podłączyć watchdog/repath bez równoległego stuck detection.
7. Dodać instrumentation i benchmark z reprezentatywną populacją NPC/animals.
8. Dopiero na podstawie pomiarów zdecydować o cache/batchingu/workerze.

## Istotne decyzje architektoniczne

- `Navigation` jest wspólne dla NPC i animals.
- Navigation dostarcza trasę; agent nadal posiada decyzję, target i lifecycle działania.
- `steerTo`/`steerToward` pozostają warstwą locomotion.
- `stepWithSlopeAndCollision()` pozostaje końcowym zabezpieczeniem fizycznego ruchu.
- Navigation geometry nie jest automatycznie równoważna collision geometry.
- Repath nie zmienia targetu.
- Szczegółowość pathfindingu musi być zgodna z hybrid/adaptive simulation.

## Weryfikacja

### Automated

- A* znajduje trasę wokół przeszkód i poprawnie obsługuje brak trasy.
- profile agentów wpływają na walkability.
- slope/water constraints są respektowane.
- waypoint simplification zachowuje wymagane obejścia.
- repath nie zmienia committed targetu.
- zwykłe follow nie wykonuje path request co frame.

### Browser/manual

- NPC omija przeszkody i dociera do house/work/storage destinations.
- logicznie przechodnie wejście nie staje się fałszywym dead-endem przez collider drzwi.
- wilk omija przeszkodę podczas chase i nadal ściga ten sam prey target.
- animal potrafi uciec wokół przeszkody.
- wander/forage/drink nie powoduje pathfinding spam.
- brak widocznego pogorszenia frame time przy reprezentatywnej populacji.

### Performance

Porównać benchmark przed/po: FPS, frame p50/p95/max, NPC time, fauna time, path requests/s, search time, visited nodes i repaths. Sukces wymaga poprawy zachowania bez nieproporcjonalnego kosztu CPU.

## Implementation guidance

Podczas implementacji dodać JSDoc dla ważnych publicznych/architektonicznych funkcji i klas, jeśli są potrzebne do discovery przez preflight; dla elementów domenowych sugerować `@domain npc` lub odpowiedni tag domenowy.

**Zrób git commit i push do main, rebase jeżeli trzeba**