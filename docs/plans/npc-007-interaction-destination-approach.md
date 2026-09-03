# Plan: NPC Navigation — Interaction Destination Approach

**Created:** 2026-09-01
**Status:** `verification needed` 🔍
**Priority:** high · **Effort:** M
**Depends on:** ~~npc-006~~
**Domain:** `npc`
**Subdomains:** `navigation` `movement` `interaction`
**Tags:** `pathfinding` `collider` `interaction-queue` `well`

## Cel

Zdiagnozować i naprawić zapętlenie movement rescue przy osiągalnych interaction destinations znajdujących się przy colliderach.

Przypadek referencyjny:

```
NPC
→ water need
→ well strategy
→ interaction queue
→ serving destination
→ collider
→ movement / A*
→ repath / escape
→ abandon
```

Rozwiązanie ma być generyczne dla interaction points przy colliderach. Well jest przypadkiem regresyjnym, nie specjalnym wyjątkiem.

## Potwierdzony stan obecnego systemu

### Interaction queue

`InteractionQueue.worldDestination(agentId)` zwraca serving point dla NPC serving/head-of-queue oraz odpowiedni waiting slot dla pozostałych NPC.

`NpcAgent.goTo` odświeża destination z kolejki podczas ticka.

Nie dodawać mechanizmu invalidacji destination bez potwierdzenia konkretnego przypadku, w którym aktywna trasa A* jest już niezgodna z aktualnym celem.

### Well interaction geometry

Proceduralny well posiada interaction anchor na południowym rimie. Serving point jest budowany z interaction anchor i serving offset, przez co znajduje się bardzo blisko krawędzi collidra.

To jest celowe: interaction point ma być osiągalny z zewnątrz bez przesuwania collidra ani geometrii studni.

### Locomotion

`NpcAgent.isWalkable()` dopuszcza ograniczoną penetrację collidera, jeżeli aktualny destination znajduje się w `NPC_COLLIDER_APPROACH_BUFFER`.

`resolveSteerTarget()` dodatkowo obsługuje destination znajdujący się blisko collidra.

Model jest więc:

```
normal destination
→ collider is hard obstacle

interaction destination near collider
→ controlled final approach is allowed
```

### A*

`navigation.findPath()` korzysta z callbacku `NavigationQuery.isWalkable`.

`NpcAgent.attemptNavRepath()` przekazuje `isWalkableExterior()`, podczas gdy locomotion korzysta z destination-aware `isWalkable()`.

A* pracuje na gridzie 1.5m i może zastąpić niewalkable goal nearest walkable grid cell.

Po znalezieniu trasy `steerWithRescue()` prowadzi NPC przez waypointy, a następnie wraca do rzeczywistego destination.

## Hipoteza problemu

Istnieją dwa poziomy walkability:

```
A*:
  exterior walkability

Locomotion:
  exterior walkability
  + destination approach exception
```

oraz dwa poziomy celu:

```
A*:
  grid goal / nearest walkable goal cell

Interaction:
  dokładny world-space serving point
```

Ta różnica może powodować brak progressu na końcowym podejściu.

Nie traktować tego jako potwierdzonego root cause przed instrumentacją.

## Scope

### 1. Odtworzenie przypadku Piotra

Prześledzić:

```
queue.joined
→ queue.worldDestination
→ currentMovementDestination
→ attemptNavRepath
→ A* goal
→ A* result
→ repath waypoint
→ resolveSteerTarget
→ steerTo
→ stepWithSlopeAndCollision
→ watchdog
→ rescue
```

Dla każdego etapu ustalić position, actual destination, A* goal cell, waypointy, odległość od collidra, signed distance, odrzucone kroki movement, rzeczywisty progress oraz ewentualną zmianę destination.

### 2. Ustalenie właściwego kontraktu A* ↔ final approach

Na podstawie reconu wybrać minimalne rozwiązanie spośród:
- jawnego final approach poza A*,
- destination-aware goal handling,
- poprawy goal-cell resolution,
- poprawy locomotion/collider, jeśli tam znajduje się root cause.

Nie przebudowywać A* przed potwierdzeniem przyczyny.

### 3. Jedno źródło prawdy dla colliderów

Jeżeli potrzebna jest zmiana, wykorzystać istniejące `colliderSignedDistance`, `isWalkable`, `isWalkableExterior` i `stepWithSlopeAndCollision`.

Nie tworzyć drugiej implementacji geometrii colliderów.

### 4. Queue destination lifecycle

Sprawdzić transition waiting slot → serving slot. Jeżeli aktywna trasa A* rzeczywiście staje się nieaktualna, dodać minimalną invalidację/repath. Jeżeli obecne odświeżanie destination jest wystarczające, nie dodawać mechanizmu.

### 5. Watchdog / rescue

Zweryfikować, czy repath i escape faktycznie przywracają progress. Nie zmieniać progów watchdogu bez dowodu.

## Docelowy model

Jeżeli recon potwierdzi problem navigation/final-approach:

```
interaction destination
        ↓
navigation approach target
        ↓
bounded A*
        ↓
exterior waypoint
        ↓
normal steerTo()
        ↓
destination-aware final approach
        ↓
interaction
```

A* odpowiada za drogę wokół przeszkód, locomotion za dokładne dojście do interaction pointu, a collider pozostaje własnością wspólnego collision systemu.

## Non-goals

- brak specjalnego pathfindera dla wells,
- brak `if (well)` w movement,
- brak teleportowania NPC,
- brak zmniejszania well collidra,
- brak przesuwania serving pointu tylko po to, aby ukryć problem,
- brak globalnego zwiększania collider clearance,
- brak przebudowy całego A* / navmesha,
- brak nowego systemu collision,
- brak zmian decision/needs/strategy,
- brak zmian player movement.

## Testy regresyjne

### Well

1. NPC z wysokim thirst idzie do studni i wykonuje `drink`.
2. NPC oczekujący dochodzi do waiting slotu.
3. Po zwolnieniu serving pointu NPC dochodzi do nowego serving pointu.
4. Wielu NPC nie powoduje pętli rescue.

### Interaction points

Sprawdzić inne istniejące interaction destinations przy colliderach, jeżeli występują w aktualnym codebase.

### Normal movement

Potwierdzić, że zwykłe cele nadal omijają collidery, A* znajduje obejścia, rescue działa przy rzeczywistym stuck i nie występuje niekontrolowana penetracja colliderów.

### Regression trace

Poprawny przypadek:

```
queue.joined
→ movement
→ queue.served
→ execute
```

Nie:

```
repath
→ escape
→ repath
→ escape
→ abandon
```

## Implementacja

Przed implementacją wykonać krótki preflight aktualnego codebase i potwierdzić symbole oraz ownership.

Ważne publiczne mechanizmy navigation, movement i interaction powinny otrzymać JSDoc, jeśli brak dokumentacji utrudnia discovery; w razie potrzeby użyć `@domain`.

Kolejność:

1. instrumentacja/reprodukcja przypadku Piotra,
2. ustalenie rzeczywistego punktu blokady,
3. minimalna poprawka odpowiedniego systemu,
4. testy unit/regression dla navigation/queue,
5. test całego flow well,
6. test normalnego movement i rescue,
7. build/test,
8. aktualizacja `docs/STATE.md`, jeżeli zmienia się kontrakt systemu.

Nie wykonywać szerokiego refaktoru navigation.

**Zrób git commit i push do main, rebase jeżeli trzeba**
