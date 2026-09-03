# Plan: Animal leading and cart harness

**Created:** 2026-09-02
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** L
**Depends on:** ~~014~~ ~~fauna-006~~
**Domain:** `fauna`
**Tags:** `leading` `harness` `cart` `transport`
**Roadmap:** `horse-and-riding`  

## Cel

Rozszerzyć istniejącą symulację koni i osłów o fizyczne prowadzenie zwierzęcia przez gracza oraz zaprzęganie zwierzęcia do wózka.

Podstawowy łańcuch:

    Player --lead--> Horse --pull--> Cart

Zwierzę pozostaje autonomicznym agentem symulacji. Prowadzenie i zaprzęgnięcie nie wyłączają jego potrzeb, decyzji ani istniejącego movement/pathfinding.

## 1. Prowadzenie zwierzęcia

Dla zwierząt posiadających odpowiednią capability gracz może rozpocząć prowadzenie:

    E — Prowadź na linie

lub odpowiednim istniejącym wariantem interakcji, jeżeli aktualny UX/terminologia dla danego zwierzęcia wykorzystuje uzdę.

Po rozpoczęciu:
- gracz pozostaje agentem sterowanym normalnie,
- zwierzę otrzymuje relację lead do gracza,
- zwierzę podąża za graczem przez istniejący movement/pathfinding,
- zwierzę nie jest teleportowane,
- zwierzę zachowuje własny stan, potrzeby i decyzje,
- prowadzenie można zakończyć.

Nie tworzyć osobnego systemu follow AI tylko dla prowadzenia.

## 2. Relacja lead

Prowadzenie powinno być reprezentowane jako relacja, a nie jako specjalny tryb ruchu konia.

    Player --lead--> Horse
    Player --lead--> Donkey

Pozwala to później użyć tego samego mechanizmu dla innych odpowiednich zwierząt lub prowadzenia przez NPC.

Relacja powinna mieć jasnego właściciela stanu i lifecycle:

    unattached → leading → detached

Nie tworzyć globalnego HorseManager ani równoległego systemu animal follow.

## 3. Zaprzęganie do wózka

Przy kompatybilnym wózku gracz może wykonać:

    E — Przywiąż do wózka

Docelowa relacja:

    Horse --pull--> Cart

Wózek:
- jest fizycznym obiektem świata,
- nie posiada własnego AI do podążania,
- pozostaje przywiązanym ładunkiem,
- podąża za ruchem transportera,
- może zostać odłączony.

Nie implementować bezpośredniego sterowania wózkiem przez gracza.

## 4. Łańcuch Player → Animal → Cart

Obsłużyć połączenie:

    Player --lead--> Horse --pull--> Cart

Ruch powinien propagować się przez relacje:

    Player
      ↓ lead
    Horse
      ↓ pull
    Cart

Każdy element pozostaje osobnym obiektem i zachowuje własny stan.

Nie implementować specjalnej logiki PlayerCart ani HorseCartController.

## 5. Autonomia zwierzęcia

Prowadzenie ani zaprzęgnięcie nie powinny wyłączać animal AI.

Zwierzę nadal może:
- reagować na hunger/thirst/fatigue i inne istniejące potrzeby,
- wykonywać swoje decyzje i rutyny,
- reagować na zagrożenia,
- korzystać z istniejącego pathfinding,
- zmieniać priorytet działania zgodnie z istniejącym systemem.

Prowadzenie jest stanem/relacją wpływającą na ruch, a nie zastąpieniem animal decision system.

## 6. Potrzeby podczas zaprzęgu

Jeżeli koń ciągnie wózek, a jego potrzeba jedzenia powoduje wybór trawy jako celu, wózek powinien naturalnie podążać za koniem.

Nie implementować Cart → seek grass. Wózek jest zależnym obiektem transportowym, a nie autonomicznym agentem.

## 7. Konflikt polecenia i potrzeb

Zwierzę nie powinno być bezwarunkowo podporządkowane relacji lead.

Należy wykorzystać istniejący system priorytetów/needs/decisions, aby np.:
- normalny lub umiarkowany głód nie przerywał automatycznie transportu,
- silna potrzeba mogła spowolnić lub przerwać wykonywaną aktywność,
- zagrożenie mogło spowodować reakcję obronną/ucieczkę,
- zwierzę nie było zmuszane do ignorowania własnego survival state.

Dokładne progi i zachowanie powinny wynikać z istniejącego systemu potrzeb i decyzji, a nie z nowych specjalnych reguł dla konia.

## 8. Animal capabilities

Nie hard-code'ować konia i osła w każdym miejscu systemu.

Jeżeli aktualny model gatunków/capabilities na to pozwala, określić przez dane:
- czy zwierzę może być prowadzone,
- czy może być zaprzęgnięte,
- czy może ciągnąć określony typ wózka.

Przykładowe semantyczne capability: leadable, draftAnimal.

Dokładne nazwy i model należy dopasować do istniejących typów/configuration po reconie implementacyjnym.

Nie tworzyć nowych capability, jeżeli obecny model może wyrazić tę samą informację.

## 9. Cart compatibility

Wózek powinien mieć możliwość określenia, czy może być ciągnięty przez danego transportera.

Nie zakładać, że każdy cart może być ciągnięty przez każde zwierzę.

Jeżeli obecny model nie ma jeszcze wózka, plan implementuje minimalny fizyczny cart potrzebny do demonstracji relacji tylko w zakresie wymaganym przez ten plan. Nie budować pełnego systemu pojazdów.

## 10. Interaction UX

Interakcje powinny być kontekstowe.

Przy zwierzęciu:

    E — Prowadź na linie

Przy odpowiednim wózku, gdy zwierzę może zostać zaprzęgnięte:

    E — Przywiąż do wózka

Podczas prowadzenia/zaprzęgu UI pokazuje minimalny stan aktywnej relacji.

Nie dodawać stałego, rozbudowanego panelu transportu.
Nie wymagać ręcznego sterowania pozycją liny, konia ani wózka.

## 11. Integration with existing movement

Wykorzystać istniejący animal movement, steering, pathfinding, collision/grounding oraz target/decision lifecycle.

lead powinno dostarczać odpowiedni target/constraint dla istniejącego movement, a nie zastępować locomotion.

Jeżeli zwierzę musi zmienić target z powodu własnej potrzeby lub zagrożenia, istniejący decision/target system powinien pozostać źródłem tej decyzji.

## 12. Integration with rope transport

Plan powinien być kompatybilny z koncepcjami wprowadzonymi przez items-player-014, ale nie należy sztucznie łączyć mechanizmu prowadzenia zwierzęcia z ropePullable dla przedmiotów.

Rozróżnić semantycznie:

    item --ropePull--> player
    player --lead--> animal
    animal --pull--> cart

Są to różne relacje, nawet jeżeli mogą wykorzystywać wspólne niskopoziomowe mechanizmy attachment/constraint, jeżeli takie mechanizmy są uzasadnione przez aktualną architekturę.

## 13. Simulation and performance

Prowadzenie i zaprzęg muszą działać również bez centralnego player-only simulation shortcut.

Zwierzę pozostaje częścią świata i jego zachowanie musi być spójne z istniejącą hybrid/adaptive simulation.

Nie zwiększać częstotliwości symulacji wszystkich zwierząt tylko z powodu prowadzenia/wózków.
Nie tworzyć globalnych skanów relacji.

## Poza zakresem

- jazda konna,
- siodła,
- mounted combat,
- hodowla,
- stajnie,
- NPC wykorzystujący wozy,
- zwierzęta zaprzęgowe inne niż konie/osły,
- automatyczne trasy transportowe,
- ekonomia transportu,
- zaawansowana fizyka harness/rope,
- realistyczna symulacja liny,
- nowy system potrzeb zwierząt,
- nowy system pathfinding,
- osobny Cart AI.

## Future extensions

Architektura powinna umożliwić później:

    Player --lead--> Horse
    Player --lead--> Donkey

    Horse --pull--> Cart
    Donkey --pull--> Cart

    NPC --lead--> Horse
    NPC --lead--> Donkey

oraz potencjalnie Animal --pull--> Cart.

Bez konieczności tworzenia osobnych systemów dla każdego gatunku lub typu transportera.

## Verification

### Leading
1. Koń może zostać rozpoczęty jako prowadzony przez gracza.
2. Osioł może zostać rozpoczęty jako prowadzony przez gracza.
3. Zwierzę podąża za graczem przez istniejący movement/pathfinding.
4. Zwierzę nie teleportuje się do gracza.
5. Odpięcie kończy relację lead.
6. Po odpięciu zwierzę wraca do normalnego animal behaviour.
7. Zwierzę zachowuje swoje potrzeby i decyzje podczas prowadzenia.
8. Zwierzę nie otrzymuje osobnego follow AI.

### Harness / cart
9. Kompatybilne zwierzę można przywiązać do kompatybilnego wózka.
10. Niekompatybilne zwierzę/wózek nie oferuje interakcji.
11. Wózek podąża za zwierzęciem.
12. Wózek nie posiada własnego AI do śledzenia gracza.
13. Można odłączyć wózek.
14. Po odłączeniu wózek pozostaje poprawnie w świecie.
15. Nie występuje teleportowanie, duplikowanie ani gubienie zwierzęcia/wózka.

### Chained transport
16. Player → Horse → Cart działa jako jeden łańcuch.
17. Gracz może prowadzić konia, a wózek podąża za koniem.
18. Zatrzymanie/zmiana kierunku gracza propaguje się stabilnie przez łańcuch.
19. Kolizje i ruch nie powodują oczywistego jitteru lub permanentnego zakleszczenia.

### Animal autonomy
20. Umiarkowanie głodny zaprzęgnięty koń może kontynuować transport.
21. Wystarczająco silna potrzeba jedzenia może spowodować wybór trawy zgodnie z istniejącym animal decision system.
22. Po zmianie celu na trawę wózek nadal podąża za koniem.
23. Silna reakcja na zagrożenie może przerwać lub zmienić transport zgodnie z istniejącym AI.
24. Zachowanie nie wymaga specjalnego Cart AI.

### Regression / performance
25. Istniejący animal movement/pathfinding nie ma regresji.
26. Prowadzenie i zaprzęg nie powodują globalnego wzrostu kosztu symulacji wszystkich zwierząt.
27. Istniejący player interaction/input nie ma regresji.
28. Build i istniejące testy przechodzą.

Ważne funkcje i klasy architektoniczne powinny otrzymać zwięzły JSDoc z @domain tam, gdzie jest to potrzebne do preflight/discovery.

**Zrób git commit i push do main, rebase jeżeli trzeba**
