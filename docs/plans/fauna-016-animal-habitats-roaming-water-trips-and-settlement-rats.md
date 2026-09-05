# Plan: Animal habitats, roaming, water trips and settlement rats

**Created:** 2026-09-05
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** L
**Depends on:** fauna-015
**Domain:** `fauna`
**Subdomains:** `habitat` `predation` `population`
**Tags:** `spawn` `roaming` `water` `rats`
**Roadmap:** -

## Cel

Sprawić, aby lokalizacja i przemieszczanie się zwierząt wynikały w większym stopniu z geografii i warunków świata, zamiast głównie z punktu początkowego i małego losowego wander.

Plan obejmuje:

- naturalniejszy habitat i spawn saren/jeleni,
- unikanie dróg podczas spawnów dzikiej fauny,
- species-specific zasięg lokalnego roamingu,
- dalsze, celowe wyprawy poza zwykły wander,
- wyprawy do dostępnej wody,
- szczury jako niewielką, zależną od warunków populację osadniczą.

Wspólna zasada:

```text
world conditions
→ habitat / local pressure
→ animal location and movement
→ interaction with resources and inhabitants
→ persistent world consequences
```

Nie tworzyć pełnego ecosystem/population simulatora ani osobnych systemów movement dla poszczególnych przypadków.

## Stan obecny

`createFauna.ts` ma już proste profile spawnów (`open`, `meadow`, `forest`, `water`), ale `deer` i `stag` nadal używają ogólnego profilu `open`. Rabbit, boar i duck mają już bardziej konkretne preferencje habitatowe.

`AnimalAgent` utrzymuje `home` i lokalny `wanderRadius`; zwykły wander wybiera punkty w ograniczonym promieniu od home. Ten mechanizm nadaje się do częstego lokalnego ruchu, ale nie reprezentuje rzadszych wypraw do konkretnego celu.

Road-corridor avoidance istnieje już dla części fauna habitat/spawner placement i powinno zostać ponownie wykorzystane zamiast tworzenia równoległej reprezentacji dróg.

Plan fauna-015 wprowadza physical water traversal dla zwierząt. Ten plan korzysta z tego fundamentu, ale odpowiada na inne pytanie: nie tylko czy zwierzę może wejść do wody, lecz kiedy i dlaczego autonomicznie wybiera wodę jako destination.

Psy są już pełnoprawnymi zwierzętami household i uczestniczą w istniejących systemach fauny, żywienia, ownership i walki. Szczury powinny rozszerzyć te mechanizmy, nie tworzyć osobnego combat/lifecycle systemu.

## 1. Habitat saren i jeleni

Obecne `deer` i `stag` używają ogólnego profilu `open`.

Zastąpić to wyborem miejsca lepiej odpowiadającym ich środowisku:

- las,
- skraj lasu,
- polany,
- łąki w pobliżu lasu.

Nie wymagać gęstego lasu. Preferować obszary przejściowe zamiast prostego binarnego `forest=true`.

Wykorzystać istniejące informacje terrain/vegetation, przede wszystkim istniejący forest-factor sampling, zamiast tworzyć drugi system biomów dla fauny.

Habitat selection powinno być tanim mechanizmem wyboru miejsca, nie stale aktualizowanym score liczonym dla każdego zwierzęcia co frame.

## 2. Spawn z dala od dróg

Wild fauna nie powinna rozpoczynać życia bezpośrednio:

- na drodze,
- przy drodze,
- na ścieżkach osady.

Rozszerzyć istniejący mechanizm road-corridor avoidance używany już przy fauna habitat/spawner placement na zwykłe wild-fauna spawn candidates.

Nie tworzyć drugiej reprezentacji dróg ani fauna-specific road index.

Unikanie drogi podczas spawnu nie oznacza zakazu późniejszego przekraczania drogi przez zwierzę.

## 3. Species-specific roaming

Obecny wspólny zakres wander nie powinien definiować jednakowego obszaru życia wszystkich gatunków.

Wprowadzić deklaratywny zakres zależny od gatunku, wykorzystując istniejący `AnimalDef` lub najbliższy obecny species config ownership.

Przykładowa relacja, bez traktowania konkretnych wartości jako wymaganego finalnego balansu:

```text
rabbit      small
fox         medium
boar        medium / large
deer/stag   large
wolf        large
```

Nie kodować species rules przez `kind === ...` w runtime.

Zachować istniejący `home` jako lokalny punkt odniesienia.

## 4. Lokalny wander vs celowa wyprawa

Rozdzielić dwa znaczenia ruchu:

```text
wander
= częste, lokalne poruszanie się wokół home

trip
= rzadsze wyjście dalej do konkretnego destination
```

Nie implementować dalszych wypraw przez samo zwiększenie `wanderRadius` do kilkudziesięciu lub stu metrów.

Trip powinien mieć:

- konkretny target/destination,
- powód,
- stan trwający przez całą wyprawę zamiast ponownego losowania celu co tick,
- możliwość zakończenia i powrotu do zwykłego local behaviour.

Pierwszym rzeczywistym zastosowaniem trip będzie woda.

Mechanizm powinien pozostać mały i wystarczająco ogólny, aby później mógł obsłużyć inne celowe wyprawy bez tworzenia kolejnego movement systemu.

Nie przebudowywać przy okazji istniejącego predator/prey target selection.

## 5. Wyprawy do wody

Wybrane gatunki powinny okresowo korzystać z dostępnej wody.

Podstawowy flow:

```text
home / local roaming
→ deterministic opportunity / cooldown
→ wybór dostępnego water destination
→ podróż
→ krótki pobyt przy wodzie
→ zakończenie trip
→ powrót do local behaviour
```

Wykorzystać physical water traversal z fauna-015.

Nie implementować osobnego fauna water model ani drugiej reprezentacji hydrologii.

Water destination może znajdować się wyraźnie dalej niż normalny `wanderRadius`, np. dziesiątki metrów od home.

Na tym etapie nie dodawać pełnego `thirst` need, jeśli prosty deterministyczny/okresowy trip daje naturalne zachowanie. Trigger powinien być deklaratywny dla gatunków, które faktycznie korzystają z takich wypraw, bez runtime `kind === ...` exceptions.

Nie wyszukiwać całej hydrologii świata co frame i dla każdego zwierzęcia. Water target powinien być wybierany rzadko i zachowywany przez czas aktywnej wyprawy.

## 6. Dalsze wyprawy i home

Architektura trip nie może zakładać, że zwierzę zawsze pozostaje w pierwotnym kilkunastometrowym home circle.

Minimalny model:

```text
home area
→ destination outside local wander
→ temporary movement outside home area
→ trip completion
→ local behaviour
```

Jeżeli podczas implementacji okaże się to naturalnym rozszerzeniem istniejącego ownership, można umożliwić kontrolowaną zmianę `home` po trwałym przemieszczeniu. Nie jest to jednak wymagane do ukończenia water trips.

Nie implementować w tym planie pełnej migracji populacji, sezonowych tras ani regionalnego herd movement.

Celem jest usunięcie architektonicznego założenia, że spawn point musi być centrum całego późniejszego życia zwierzęcia.

## 7. Szczury jako settlement habitat species

Dodać `rat` jako normalny gatunek fauny, ale z habitat/spawn pressure wynikającym z warunków osady.

Pierwsza wersja powinna utrzymywać tylko niewielką liczbę widocznych szczurów. Docelowy gameplayowy zakres to około 0–5 aktywnych osobników na osadę, ale nie wymuszać stałej liczby jako twardego invariant, jeśli pressure naturalnie prowadzi do mniejszej populacji.

Pojawianie się szczurów powinno zależeć przede wszystkim od rzeczywistej dostępności żywności i możliwości żerowania w osadzie.

Pierwsza wersja może używać prostego pressure/scoring:

```text
food availability
+ accessible stored food
- dog pressure
→ rat habitat pressure
→ small active rat population
```

Nie tworzyć osobnego `RatManager` ani osobnego small-animal simulation system.

Szczur powinien korzystać z istniejącego:

- `AnimalAgent`,
- health/death lifecycle,
- movement,
- fauna ownership,
- istniejących mechanizmów walki/predation tam, gdzie pasują.

## 8. Szczury i jedzenie

Szczury powinny powodować realną stratę zasobów.

Okresowo szczur może pobrać niewielką ilość rzeczywistego jedzenia z odpowiedniego household/settlement storage.

Nie tworzyć abstrakcyjnego licznika `ratFoodDamage`.

Efekt powinien przechodzić przez istniejące inventory/economy ownership:

```text
stored food
→ rat consumes food
→ less real food
→ existing shortage/economy pressures react
```

To jest główny systemowy sens szczurów: ich obecność ma tworzyć konsekwencję w istniejącej gospodarce osady.

Nie implementować przy okazji nowego sanitation/cleanliness systemu tylko po to, aby zasilić rat pressure.

## 9. NPC i psy kontra szczury

Szczur jest normalnym zwierzęciem możliwym do zabicia przez istniejący animal damage/death path.

Psy powinny móc wykrywać i atakować szczury przez istniejący animal combat/guarding mechanism, rozszerzony tylko tam, gdzie obecne target rules tego wymagają.

NPC również mogą zabić szczura, jeśli istniejący combat/animal-threat model daje do tego naturalny integration point. Nie tworzyć wysokopriorytetowego globalnego `rat hunting` job ani osobnego NPC pest-control systemu.

Szczury mają być lokalnym problemem wynikającym ze stanu osady, nie questowym przeciwnikiem wymagającym ciągłej uwagi wszystkich NPC.

## 10. Performance i determinism

Naturalniejsza geografia nie może oznaczać nowych globalnych wyszukiwań per animal/frame.

W szczególności:

- habitat oceniać podczas wyboru miejsca, nie co frame,
- road avoidance wykonywać podczas wyboru spawn point,
- water destination wyszukiwać tylko przy rozpoczęciu wyprawy,
- zachowywać aktywny trip target,
- nie skanować wszystkich water features dla każdego zwierzęcia,
- rat pressure aktualizować z niską częstotliwością odpowiednią dla settlement/population state,
- nie zwiększać częstotliwości istniejących fauna proximity scans.

Preferować deterministyczne decyzje oparte o world time/seed/stable IDs zamiast nowego niekontrolowanego `Math.random()` tam, gdzie decyzja wpływa na długotrwały stan świata.

Projekt musi pozostać kompatybilny z przyszłą hybrid/off-screen fauna simulation.

## Testy

Dodać testy przede wszystkim dla czystych reguł:

- deer/stag preferują odpowiedni habitat zamiast dowolnego `open`,
- wild spawn candidate przy drodze jest odrzucany,
- species mogą mieć różne roaming ranges,
- zwykły wander pozostaje lokalny,
- trip może wyjść poza `wanderRadius`,
- aktywny trip zachowuje destination zamiast ponownie go wybierać co tick,
- zakończenie trip przywraca zwykłe local behaviour,
- water-trip opportunity jest deterministyczne/cooldown-bounded,
- brak odpowiednich warunków może oznaczać brak szczurów,
- rat pressure pozostaje ograniczone do małej aktywnej populacji,
- szczur konsumuje rzeczywiste stored food,
- zabicie szczura korzysta z normalnego animal death lifecycle.

## Manual verification

Manual verification wykonuje użytkownik w przeglądarce.

Sprawdzić co najmniej:

1. Deer/stag pojawiają się w bardziej naturalnym otoczeniu las/skraj lasu/polana zamiast dowolnego otwartego terenu.
2. Wild fauna nie spawnuje się na drogach ani bezpośrednio przy nich.
3. Różne gatunki wizualnie wykorzystują różnej wielkości obszary.
4. Zwykły wander nadal wygląda lokalnie i nie staje się przypadkową daleką wędrówką.
5. Deer/stag lub inny skonfigurowany gatunek potrafi odbyć wyraźnie dalszą wyprawę do wody.
6. Zwierzę zachowuje cel wyprawy i po jej zakończeniu wraca do normalnego zachowania.
7. Szczury czasem występują w osadzie, ale nie są obowiązkowe dla każdej osady/stanu.
8. W osadzie widoczna jest tylko niewielka liczba szczurów.
9. Szczury zmniejszają rzeczywiste zapasy jedzenia.
10. Pies może wykryć i zabić szczura przez istniejące mechanizmy fauny.
11. NPC może zabić szczura tam, gdzie przewiduje to istniejący combat integration.
12. Normalne predator/prey, flee, guarding i fauna movement nie ulegają regresji.

## Non-goals

Poza zakresem:

- pełny population simulator,
- pełna migracja zwierząt,
- sezonowe migracje,
- regionalne stada przemieszczające się przez świat,
- nowy system biomów,
- osobny small-animal simulation system,
- osobny `RatManager`,
- pełny thirst/needs redesign,
- sanitation/cleanliness simulation,
- NPC rat-catching profession,
- questy o szczurach,
- pathfinding overhaul,
- przebudowa predator/prey target selection,
- przebudowa całej ekonomii osad.

## Implementation notes

Przygotować i utrzymywać:

`docs/plans/implementation-notes/fauna-016-animal-habitats-roaming-water-trips-and-settlement-rats-implementation-notes.md`

Implementation preflight powinien ponownie potwierdzić aktualny stan fauna-015 oraz aktualne ownership dla:

- `createFauna.ts` i spawn/habitat selection,
- `AnimalAgent` home/wander/movement,
- species configuration / `AnimalDef`,
- terrain forest sampling,
- road corridor queries,
- canonical water lookup/traversal,
- household/settlement food inventory ownership,
- dog guarding/animal combat target selection.

Dla ważnych publicznych/architektonicznych funkcji związanych z habitat selection i trip behaviour dodać JSDoc tam, gdzie poprawia to późniejszy preflight; użyć `@domain fauna` tam, gdzie ma to sens.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
