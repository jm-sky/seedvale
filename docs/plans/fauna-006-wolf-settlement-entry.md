# Plan: Wolf Settlement Entry

**Created:** 2026-09-02
**Status:** `verification needed` 🔍
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** `fauna`
**Subdomains:** `predator` `settlements`
**Tags:** `wolf` `village` `avoidance` `hunting`

## Cel

Usunąć sztuczne ograniczenie, przez które zwykły wilk traktuje osadę jako obszar, do którego nie powinien wchodzić. Wilk ma być zdolny wejść do wioski jako część normalnego świata — np. w pogoni za NPC, graczem lub ofiarą — bez wymagania stanu `frenzied`.

Nie chodzi o dodanie nowego systemu nawigacji ani o fizyczne „przebicie” colliderów. Obecne collidery budynków nadal mają blokować ruch. Zmiana dotyczy wyłącznie AI-owego village avoidance.

## Recon — stan obecny

Kod nie tworzy twardej niewidzialnej ściany wokół wioski. Ograniczenie jest behawioralne:

- `AnimalAgent.isNearVillage()` rozpoznaje obszar `VillageInfo.radius + VILLAGE_AVOID_MARGIN`.
- `pickPointNear()` odrzuca cele w wiosce dla dzikich zwierząt, z wyjątkiem `frenzied`.
- `findForageTarget()` i `findWaterTarget()` również odrzucają cele w wiosce dla wild fauna.
- `updatePredator()` przerywa normalny pościg za prey, jeśli prey znajduje się w village avoidance radius.
- `senseNpcThreat()` po npc-008 odrzuca NPC znajdującego się w village avoidance radius dla non-frenzied predator.
- `resolveNpcTarget()` nie sprawdza ponownie exclusion po zablokowaniu celu, więc predator może kontynuować pościg za NPC, który dopiero później wejdzie do wioski. Jest to już zapisany loose end.
- `moveTowardStrategicVillage()` jest celowo dostępne dla frenzied wolf i prowadzi go do centrum wioski; nie jest to fizyczna blokada.

Źródło prawdy: `src/fauna/AnimalAgent.ts` oraz obecne założenia planu 044 o village avoidance.

## Zakres

1. Zdefiniować wilka jako wyjątek od wild-fauna village avoidance w sytuacjach, w których AI ma powód wejść do settlementu.
2. Pozwolić zwykłemu wilkowi kontynuować pościg za legalnie wybranym celem, gdy cel znajduje się w village avoidance radius.
3. Pozwolić zwykłemu wilkowi wybrać NPC znajdującego się w village avoidance radius, jeżeli pozostałe warunki NPC threat są spełnione.
4. Zachować istniejący movement/collider system — budynki, teren, wodę i pathfinding nadal ograniczają faktyczną trasę.
5. Nie zmieniać zachowania innych wild animals bez wyraźnej potrzeby.
6. Nie zmieniać frenzied behaviour poza zapewnieniem, że pozostaje poprawne.
7. Rozstrzygnąć i przetestować target commitment: wejście celu do wioski po rozpoczęciu pościgu nie powinno powodować nagłego przerwania tylko z powodu village avoidance.

## Ważna decyzja gameplayowa

Village avoidance nie powinno być rozumiane jako „wilki nigdy nie wchodzą do wioski”. Dla wilka settlement może być miejscem realnego konfliktu i pościgu. Nadal można pozostawić avoidance dla zwykłego wander/forage/water, jeżeli ma ono utrzymywać naturalny roaming poza osadą — wejście do wioski powinno wynikać z konkretnego celu, a nie z losowego wander targetu.

## Non-goals

- Nie usuwać colliderów budynków ani innych przeszkód.
- Nie tworzyć osobnej nawigacji dla wilków.
- Nie pozwalać wszystkim dzikim zwierzętom swobodnie chodzić po osadach.
- Nie usuwać `isNearVillage()` jako wspólnego helpera, jeśli nadal jest potrzebny do roamingu/forage/water.
- Nie zmieniać ogólnego scoringu agresji wilka poza koniecznym usunięciem village gate.
- Nie rozwiązywać innych loose ends z `npc-008`.

## Implementacja

Preferować małą zmianę istniejących guardów zamiast nowego systemu. Najważniejsze miejsca:

- `src/fauna/AnimalAgent.ts`: `senseNpcThreat()`, `updatePredator()`, ewentualnie helper używany przez target-selection/target-validation.
- Zachować osobne zasady dla wander/source search, chyba że testy pokażą, że blokują zamierzone wejście podczas aktywnego pościgu.
- Rozważyć jawny predicate typu „czy ten predator może wejść do settlementu” tylko wtedy, gdy zapobiega duplikowaniu warunku dla wilka; nie tworzyć globalnego managera.

## Testy

Dodać testy pure decision/target-selection tam, gdzie obecna architektura na to pozwala, obejmujące co najmniej:

- non-frenzied wolf może wybrać NPC w village avoidance radius;
- non-frenzied wolf może kontynuować chase celu, który wszedł do village;
- frenzied wolf zachowuje dotychczasową możliwość wejścia do village;
- inne wild fauna nadal respektuje swoje obecne village avoidance;
- wander/forage/water nie zaczynają losowo prowadzić zwykłego wilka do wioski, jeśli pozostaje to zamierzonym zachowaniem;
- collider budynku nadal blokuje faktyczny ruch.

## Weryfikacja manualna

W przeglądarce sprawdzić:

1. zwykły wilk wybiera NPC stojącego w wiosce i może wejść do settlementu;
2. NPC uciekający do wioski nie powoduje anulowania pościgu;
3. wilk może wejść między budynki tak daleko, jak pozwala rzeczywista geometria/collidery;
4. zwykły wilk nie zaczyna bez powodu spacerować po wiosce podczas wander;
5. frenzied wolf nadal poprawnie dociera do settlementu;
6. zachowanie innych wild animals nie zmieniło się przypadkowo.

## Kryterium sukcesu

Zwykły wilk nie traktuje granicy wioski jako sztucznej bariery AI. Może wejść do settlementu, jeśli aktywny cel lub sytuacja tego wymaga, a ograniczenia ruchu wynikają wyłącznie z rzeczywistej nawigacji/kolizji i innych obowiązujących reguł ruchu.

**Zrób git commit i push do main, rebase jeżeli trzeba**
