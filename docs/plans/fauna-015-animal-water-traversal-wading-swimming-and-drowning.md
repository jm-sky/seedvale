# Plan: Animal water traversal, wading, swimming and drowning

**Created:** 2026-09-05
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** fauna-010
**Domain:** `fauna`
**Subdomains:** `habitat` `lifecycle`
**Tags:** `water` `movement` `stamina` `mounts`
**Roadmap:** -

## Cel

Rozszerzyć istniejący movement fauny tak, aby zwierzęta potrafiły sensownie poruszać się przez wodę zamiast traktować ją jako twardą ścianę.

Podstawowy model traversalu:

```text
dry land
→ shallow water / wading
→ swimming
→ swimming exhaustion
→ drowning
```

Te same fizyczne reguły mają obowiązywać niezależnie od tego, czy zwierzę:

- porusza się autonomicznie,
- ściga lub ucieka,
- wykonuje trasę navigation,
- jest aktualnie dosiadane przez gracza.

Nie tworzyć osobnego swimming controller, horse-only movement ani player-only water rules dla wierzchowców.

## Stan obecny

`AnimalAgent` obecnie odrzuca wodę w `isWalkable()` przez próg oparty o `sampleHeight <= waterLevel + WATER_MARGIN`, więc woda jest dla fauny nieprzekraczalna.

Ruch autonomiczny i mounted movement ostatecznie korzystają z tego samego `AnimalAgent` movement path. `mountActions.ts` dostarcza intent sterowania i synchronizuje gracza z wierzchowcem, ale sam nie powinien stać się właścicielem logiki traversalu przez wodę.

Shared navigation również widzi obecnie wyłącznie binarne `isWalkable(): boolean`, więc nie potrafi jeszcze rozróżnić:

- fizycznie możliwe,
- możliwe, ale kosztowne,
- preferowane.

Player ma już własne użycie floor/water sampling dla pływania, a współczesne rzeki mają canonical water/bed data niezależne od globalnego `waterLevel`.

## 1. Jedno źródło prawdy dla lokalnej wody

World/terrain powinien odpowiadać na pytanie:

> Co fizycznie znajduje się w tym punkcie świata?

Fauna nie może osobno implementować logiki głębokości dla jeziora/oceanu i osobno dla rzek.

Wykorzystać lub minimalnie rozszerzyć istniejące terrain/water sampling tak, aby gameplay mógł tanio uzyskać co najmniej:

```text
water present?
water surface height
ground / bed height
water depth
```

Query musi respektować aktualną architekturę:

- lakes/ocean: powierzchnia wody + rzeczywisty terrain floor,
- rivers: canonical river water surface + carved bed/channel data,
- bez założenia, że każda woda używa globalnego `terrain.waterLevel`.

Niskopoziomowy wynik powinien być wystarczająco ogólny, aby później mógł zostać wykorzystany także przez NPC/player, ale bez tworzenia nowego globalnego water managera.

## 2. Fauna-side traversal classification

Fauna odpowiada na osobne pytanie:

> Co ten konkretny gatunek może zrobić z tymi warunkami?

Ruch zwierzęcia powinien rozróżniać aktywne tryby:

```text
dry
wading
swimming
```

Brak możliwości wejścia do danego miejsca jest wynikiem oceny traversalu, nie osobnym movement mode.

Klasyfikacja ma wynikać z:

- lokalnej głębokości/warunków wody,
- istniejącego `AnimalDef`, movement config i metabolism,
- wyłącznie minimalnych nowych species capabilities, jeśli faktycznie są niezależne od istniejących danych.

Nie dodawać od razu rozbudowanej listy parametrów typu `waterFear`, `swimSpeed`, `wadeDepth`, `swimDrain` bez rzeczywistej potrzeby.

## 3. Wading

Zwierzęta powinny móc wejść do wystarczająco płytkiej wody i nadal korzystać z grounded movement.

Wading:

- nie uruchamia drowning,
- nie jest swimming,
- może redukować movement speed,
- nadal korzysta z istniejącego slope/collision resolution tam, gdzie ma to zastosowanie.

Zero stamina podczas wading nie powoduje obrażeń.

## 4. Swimming

Zwierzęta zdolne do pływania powinny przechodzić w `swimming`, gdy woda jest zbyt głęboka dla normalnego grounded movement.

Swimming pozostaje częścią `AnimalAgent` locomotion:

- ten sam high-level target/intent,
- ten sam agent,
- bez drugiego movement loop,
- bez osobnego `SwimmingManager`.

Swimming może wymagać innej prędkości oraz innego prowadzenia Y względem powierzchni wody, ale nie może tworzyć równoległego systemu pozycji lub lifecycle.

## 5. Species capability — minimum potrzebne dla biologicznie różnych zachowań

Nie wszystkie gatunki powinny traktować wodę jednakowo.

Co najmniej trzeba umożliwić rozróżnienie między:

- zwierzęciem lądowym zdolnym brodzić i ewentualnie pływać,
- zwierzęciem dobrze przystosowanym do pływania,
- zwierzęciem, które nie potrafi bezpiecznie pływać.

Szczególnie ważny przypadek: **kaczki**.

Dla kaczki woda jest normalnym środowiskiem ruchu. Kaczka powinna móc autonomicznie wejść do wody, utrzymywać ruch po powierzchni i korzystać z niej bez traktowania każdego pływania jako awaryjnego wysiłku prowadzącego szybko do drowning.

To oznacza, że sam istniejący metabolism nie wystarczy do wyrażenia wszystkich różnic — implementacja może dodać minimalną declarative water/swim capability do `AnimalDef`, ale powinna zachować mały i czytelny kontrakt.

Nie kodować wyjątków typu `kind === 'duck'` w movement runtime.

## 6. Swimming stamina

Swimming powinno używać istniejącego `AnimalLifeState.stamina`.

Nie dodawać `swimEnergy` ani drugiego zasobu energii.

Obecne `tickAnimalLife()` regeneruje stamina, gdy zwierzę nie sprintuje, więc implementacja musi uwzględnić, że aktywne pływanie jest wysiłkiem, a nie odpoczynkiem.

Kontekst `swimming` należy do locomotion/traversal; nie przenosić całej wiedzy o ruchu wodnym do `AnimalLife` tylko po to, aby sterować stamina.

Species dobrze przystosowane do wody, jak kaczka, mogą mieć znacznie niższy efektywny koszt pływania lub inny minimalny parametr capability, ale nadal korzystają z tego samego stamina system.

## 7. Drowning

Drowning damage może wystąpić tylko wtedy, gdy zwierzę **aktualnie pływa** i wyczerpało stamina.

Invariant:

```text
stamina == 0 on dry land
→ exhausted, no drowning damage

stamina == 0 while wading
→ exhausted, no drowning damage

swimming && stamina == 0
→ drowning damage
```

Przejście ze `swimming` do `wading` lub `dry` natychmiast zatrzymuje drowning damage.

Nie tworzyć osobnego drowning health systemu. Wykorzystać istniejące:

- `HealthState`,
- `damageHealth()` / animal damage path,
- istniejący death lifecycle.

## 8. Mounted parity

Mounted animal musi korzystać dokładnie z tej samej fizycznej klasyfikacji traversalu co autonomous animal.

Acceptance invariant:

> Ten sam koń, w tym samym miejscu, z tym samym health/stamina, ma tę samą fizyczną możliwość wejścia do wody niezależnie od tego, czy jest sterowany autonomicznie, czy przez gracza.

`mountActions.ts` nie powinien zawierać osobnych reguł:

- water depth,
- can swim,
- wading,
- drowning.

`mountActions` dostarcza input intent; właścicielem fizycznego ruchu pozostaje `AnimalAgent`.

## 9. Physical ability vs route preference

Ten plan implementuje przede wszystkim **physical traversal**.

Rozdzielić pojęcia:

```text
ability
= czy zwierzę może fizycznie przejść / przepłynąć

preference
= czy autonomiczne AI chce wybrać tę drogę
```

Przykład:

- koń może przejść przez płytki strumień,
- koń może być zdolny przepłynąć głębszą rzekę,
- ale w normalnym ruchu może preferować suchą trasę lub most,
- podczas ucieczki/pogoni może zaakceptować wodę.

Nie przebudowywać w tym planie shared A* do pełnego terrain-cost systemu, jeśli nie jest to konieczne do samego poprawnego water traversal.

Obecne navigation może otrzymać minimalną zmianę pozwalającą traktować fizycznie traversable water jako passable dla danego zwierzęcia.

Docelowy kierunek `passable + traversal cost` pozostaje future compatibility/follow-up, nie warunkiem ukończenia tego planu.

## 10. Autonomous water use

Po usunięciu hard water wall autonomiczne zachowanie nie może zakładać, że każda woda jest zabroniona.

W scope tego planu:

- chase/flee/navigation mogą fizycznie przejść przez wodę, jeśli species traversal na to pozwala,
- duck może używać wody jako normalnego traversalu,
- nie implementować rozbudowanej psychologii unikania wody.

Nie dodawać w tym planie:

- `waterFear`,
- hesitation,
- panic near water,
- personality-driven water preferences.

Takie decyzje mogą później korzystać z traversal cost/decision scoring bez zmiany fizycznego modelu wody.

## 11. Shared-system boundary

NPC mają obecnie podobny binary water restriction, ale NPC swimming nie należy do tego planu.

Nie tworzyć jednak fauna-only reprezentacji fizycznej głębokości wody, jeśli można umieścić ją w naturalnym terrain/world ownership.

Docelowa granica:

```text
world / terrain
    ↓
local water + ground sample
    ↓
fauna traversal policy
    ↓
AnimalAgent: dry / wading / swimming
    ↓
movement + stamina + health
```

Player swimming może służyć jako źródło istniejących sampling seams, ale `PlayerController` nie powinien stać się właścicielem fauna traversal.

## 12. Performance

Water classification może być wykonywane w hot movement path, więc musi pozostać tanie i deterministyczne.

Unikać:

- alokacji per movement tick,
- globalnego skanowania river network per animal/frame,
- kopiowania water state do każdego `AnimalAgent`,
- wykonywania dodatkowego pathfinding tylko po to, aby ustalić głębokość.

Preferować istniejące chunk/spatial lookup oraz lokalne canonical river data.

Projekt musi pozostać kompatybilny z przyszłym hybrid/off-screen fauna simulation.

## Testy

Dodać testy przede wszystkim dla czystych reguł traversalu i lifecycle:

- dry point klasyfikuje się jako dry,
- płytka woda zgodna z capability klasyfikuje się jako wading,
- głęboka woda dla pływającego gatunku klasyfikuje się jako swimming,
- gatunek bez bezpiecznego swimming nie może wejść w wymagające pływania miejsce,
- swimming zużywa istniejącą stamina zgodnie z capability/metabolism,
- zero stamina na dry nie powoduje health damage,
- zero stamina podczas wading nie powoduje health damage,
- zero stamina podczas swimming uruchamia drowning damage,
- przejście swimming → wading/dry natychmiast zatrzymuje drowning damage,
- lethal drowning kończy się przez istniejący death lifecycle,
- mounted i autonomous traversal zwracają tę samą fizyczną możliwość przejścia,
- river depth korzysta z canonical river water/bed data, a nie tylko globalnego `waterLevel`,
- duck jest zdolny do normalnego water traversal i nie wymaga runtime `kind === 'duck'` exception.

## Manual verification

Manual verification wykonuje użytkownik w przeglądarce.

Sprawdzić co najmniej:

1. Koń nadal porusza się normalnie po suchym terenie.
2. Koń może wejść do płytkiej wody i brodzić.
3. Koń może przejść z wading do swimming tam, gdzie capability na to pozwala.
4. Dosiadany koń zachowuje te same fizyczne możliwości co autonomiczny koń.
5. Swimming zużywa stamina zwierzęcia.
6. Koń ze stamina 0 stojący na trawie nie otrzymuje damage.
7. Koń ze stamina 0 brodzący w płytkiej wodzie nie otrzymuje drowning damage.
8. Koń ze stamina 0 podczas swimming otrzymuje drowning damage.
9. Wyjście z głębokiej wody do wading lub dry zatrzymuje drowning damage natychmiast.
10. Kaczka może autonomicznie wejść do wody i normalnie pływać po powierzchni.
11. Kaczka nie traktuje typowego pływania jako krótkiego awaryjnego sprintu prowadzącego szybko do drowning.
12. Rzeka wykorzystuje własną canonical water surface/bed geometry.
13. Istniejące slope/collision zachowanie na suchym terenie nie ulega regresji.

## Non-goals

Poza zakresem tego planu:

- NPC swimming,
- redesign player swimming,
- aquatic-only species simulation,
- diving / underwater locomotion,
- water currents / flow forces,
- swimming animation overhaul,
- generic `SwimmingManager`,
- horse-specific water controller,
- osobny swimming stamina resource,
- pełny traversal-cost navigation redesign,
- water fear / hesitation / panic,
- personality-based water preference,
- bridge-aware route preference jako osobny decision system.

## Implementation notes

Przygotować i utrzymywać:

`docs/plans/implementation-notes/fauna-015-animal-water-traversal-wading-swimming-and-drowning-implementation-notes.md`

Implementation preflight powinien ponownie potwierdzić aktualne ownership i kontrakty w szczególności dla:

- `src/fauna/AnimalAgent.ts`,
- `src/fauna/AnimalLife.ts`,
- `src/shared/StaminaState.ts`,
- `src/shared/HealthState.ts`,
- `src/navigation/navigation.ts`,
- `src/terrain/slopeConstraint.ts`,
- terrain floor/water sampling,
- `src/terrain/riverNetwork.ts`,
- river channel data w `src/terrain/chunkHeightmap.ts`,
- `src/app/actions/mountActions.ts`,
- `src/player/PlayerController.ts` jako reference/reuse seam, nie owner fauny.

Dla nowych lub istotnie zmienionych architectural/public functions/classes dodać JSDoc tam, gdzie poprawia to AI preflight discovery; użyć odpowiedniego `@domain` tagu.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
