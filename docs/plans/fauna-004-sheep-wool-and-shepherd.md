
# Plan: Sheep wool cycle and shepherd

**Created:** 2026-08-29  
**Status:** `planned` 📋  
**Type:** feature  
**Priority:** medium · **Effort:** L  
**Depends on:** none  
**Domain:** `fauna`  
**Tags:** `settlements-npcs` `items-player`
**Roadmap:** `textiles-and-herbal-medicine`

## 1. Cel

Etap 1 roadmapy tekstyliów: rzeczywista produkcja wełny przez istniejące owce oraz szeroka profesja **Pasterz**.

Zakres:
- kalendarz 48 dni/rok i 12 dni/sezon,
- 24-dniowy cykl wzrostu wełny,
- 2 strzyżenia/rok,
- 4 jednostki wełny na strzyżenie,
- item wool,
- narzędzie/capability do strzyżenia,
- akcja NPC strzyżenia,
- podstawowy wypas i pilnowanie stada,
- reakcja pasterza na zagrożenie stada,
- dostarczenie wełny do istniejącego Household/Economy flow.

Poza zakresem: przędza, tkanina, len, bandaż, opatrunek, zioła i glina.

## 2. Stan obecny i punkty integracji

### AnimalAgent

Istnieje AnimalAgent z:
- AnimalKind sheep,
- livestock ownership przez ownerHouseId,
- Household,
- needs, stamina, movement i herd cohesion,
- threat/flee/combat,
- livestock production anchor.

Nie tworzyć nowej klasy zwierzęcia.

### livestockProduction

src/fauna/livestockProduction.ts posiada generyczny model produkcji oparty o absolutne elapsedDays.

Jest używany przez egg oraz milk.

Wool ma rozszerzyć ten sam mechanizm. Nie tworzyć osobnego wool timer.

### livestock spawning

src/settlement/livestock.ts już losuje sheep, tworzy AnimalAgent i przypisuje ownerHouseId oraz Household.

Nie tworzyć nowego spawnera.

### NPC work

NpcAgent ma role, schedules, work activity, PlannedAction, profession-specific dispatch, Household i carried inventory.

Shepherd ma wejść w ten sam pipeline.

## 3. Kalendarz

Obecny weather.ts ma DAYS_PER_SEASON = 7.

Zmienić wspólny kalendarz na:

~~~
1 rok       = 48 dni
1 miesiąc   = 4 dni
1 sezon     = 12 dni
4 sezony    = 48 dni
~~~

~~~
Wiosna = dni 0–11
Lato   = dni 12–23
Jesień = dni 24–35
Zima   = dni 36–47
~~~

Przed zmianą sprawdzić wszystkie użycia DAYS_PER_SEASON/getSeason/getSeasonProgress oraz wpływ zmiany na weather/climate i systemy sezonowe.

Nie tworzyć kalendarza tylko dla owiec.

## 4. Wool cycle

Minimalny model:

~~~
sheep
  ↓
wool growth
  ↓
ready for shearing
  ↓
shearing
  ↓
4 wool
  ↓
growth reset
  ↺
~~~

Parametry:

~~~
YEAR_DAYS = 48
SHEARINGS_PER_YEAR = 2
WOOL_GROWTH_DAYS = 24
WOOL_YIELD_PER_SHEARING = 4
~~~

Jedna owca:
- 4 wool na strzyżenie,
- 2 strzyżenia/rok,
- 8 wool/rok.

Założenie ekonomiczne:
- 1 wool ≈ 1 kg surowej wełny.

Nie implementować wpływu rasy, wieku, zdrowia, żywienia ani sezonu.

## 5. Stan owcy

Dodać stan cyklu wełny oparty o absolutne elapsedDays.

Preferowany stan:
- woolReadyAtDays: number | null.

Semantyka:
- null = cykl jeszcze nie został zainicjalizowany,
- woolReadyAtDays = moment, od którego owca może być ostrzyżona.

Pierwszy cykl:
~~~
woolReadyAtDays = nowDays + 24
~~~

Gotowość:
~~~
nowDays >= woolReadyAtDays
~~~

Po osiągnięciu gotowości owca pozostaje gotowa aż do strzyżenia.

Nie używać per-frame decrement.

Jeżeli istniejący livestock production mechanizm stosuje staggerowanie, zachować ten wzorzec, aby wszystkie owce nie stały się gotowe jednocześnie.

## 6. Strzyżenie

Strzyżenie jest rzeczywistą akcją NPC.

Flow:

~~~
Pasterz
  ↓
znajduje własną owcę
  ↓
sprawdza ready
  ↓
podchodzi
  ↓
shearing action
  ↓
re-validacja
  ↓
4 wool
  ↓
reset cycle
~~~

Na zakończeniu PlannedAction ponownie zweryfikować:
- sheep nadal żyje,
- sheep nadal jest gotowa,
- NPC nadal ma wymagane narzędzie,
- output może zostać przyjęty.

Yield nie może zostać usunięty przy rozpoczęciu akcji.

Po sukcesie:
~~~
woolReadyAtDays = nowDays + 24
~~~

## 7. Narzędzie

Dodać narzędzie do strzyżenia owiec.

Wykorzystać istniejący ItemKind + ITEM_CATALOG + ItemCapability.

Preferowana capability: shearing.

Nie stosować specjalnego warunku typu inventory.has('shears'), jeśli wymaganie można wyrazić przez capability.

Narzędzie musi być sprawdzane przez istniejący system capability/tool requirements.

Nie tworzyć ShearsSystem.

## 8. Item wool

Dodać stackowalny item wool.

Minimalna definicja:
- normalny ItemKind,
- normalna waga i rozmiar zgodne z istniejącym modelem itemów,
- brak ItemInstance,
- brak durability,
- ilość jest zwykłym stack count.

MVP nie zawiera itemu yarn.

Docelowy model, zachowany wyłącznie jako referencja:
~~~
1 kg wool
→ ~200 yarn units
→ ~3 m² wool cloth
~~~

Nie implementować tego przeliczenia w tym planie.

## 9. Pasterz — role i schedule

Dodać shepherd do istniejącego Role.

Dodać shepherd do istniejącego SCHEDULE_TEMPLATES.

Początkowy rytm może być taki jak farmer:
~~~
06:00 wake
07:00 work
12:00 eat
13:00 work
18:00 home
22:00 sleep
~~~

Nie tworzyć nowego scheduler-a.

Nie tworzyć typu Profession.

## 10. Pasterz — wybór stada

Pasterz obsługuje wyłącznie sheep należące do jego gospodarstwa.

Wykorzystać:
- AnimalAgent.ownerHouseId,
- Household.homeId,
- istniejące livestock ownership.

Nie skanować wszystkich owiec świata.

Jeżeli gospodarstwo ma kilka owiec:
- traktować je jako jedno stado gospodarstwa,
- wybór celu powinien być deterministyczny,
- preferować owcę wymagającą konkretnej pracy,
- nie zmieniać celu co klatkę.

## 11. Pasterz — wypas

MVP nie tworzy osobnej encji Pasture.

Podczas work pasterz powinien:
1. znaleźć swoje stado,
2. wybrać deterministyczny, bezpieczny punkt wypasu w pobliżu gospodarstwa,
3. udać się do stada/punktu,
4. pozostać przez określony czas przy stadzie,
5. ponownie sprawdzić stan stada.

Wykorzystać istniejący movement + PlannedAction.

Punkt wypasu powinien być wyznaczany z istniejącego terrain/placement API. Nie dodawać globalnego systemu pastwisk.

Jeżeli nie da się znaleźć poprawnego punktu, shepherd wykonuje bezpieczny fallback do istniejącego work/home behaviour.

## 12. Pasterz — pilnowanie

Podczas pracy sprawdzać, czy należące do niego sheep pozostają w rozsądnym zasięgu stada.

Jeżeli owca jest zbyt daleko:
~~~
sheep too far
 ↓
shepherd selects sheep
 ↓
move toward sheep
 ↓
return toward flock/pasture
~~~

Nie tworzyć nowego globalnego herding AI.

Nie teleportować owiec ani pasterza.

Wykorzystać istniejący movement, collision i herd cohesion.

## 13. Pasterz — priorytet strzyżenia

Jeżeli własna owca jest gotowa do strzyżenia, strzyżenie powinno mieć pierwszeństwo przed zwykłym przemieszczaniem na pastwisko.

Priorytet pracy:

~~~
ready sheep
  ↓
shearing
  ↓
deposit wool
  ↓
normal flock/pasture work
~~~

Jeżeli nie ma gotowej owcy:
~~~
flock/pasture/protection
~~~

Jeżeli nie ma własnych sheep:
~~~
existing generic work fallback
~~~

## 14. Ochrona stada

Pasterz korzysta z istniejącego threat/combat system.

Flow:

~~~
predator
 ↓
sheep threatened
 ↓
shepherd reacts
 ↓
approach threat
 ↓
existing NPC/animal combat or flee behaviour
~~~

Nie tworzyć ShepherdCombatAI.

Jeżeli istniejący threat interrupt nie ma informacji pozwalającej odróżnić zagrożenie własnego stada od innych zwierząt, dodać minimalny hook wykorzystujący ownerHouseId/Household.

Nie zmieniać globalnej semantyki threat detection bez potrzeby.

## 15. Delivery wool

Po strzyżeniu:
~~~
4 wool
 ↓
NpcAgent.carried
 ↓
powrót
 ↓
Household.items
 ↓
SettlementEconomy zgodnie z istniejącym delivery flow
~~~

Wykorzystać istniejące carried inventory i depositCarriedItems lub właściwy istniejący odpowiednik.

Nie tworzyć WoolStorage.

Akcja musi uwzględniać capacity carried inventory przed usunięciem yield.

## 16. Time skip / off-screen

Wool cycle musi działać poprawnie przy:
- normalnym ticku,
- time skip,
- długim braku obserwacji settlementu,
- stream-out/stream-in w ramach obecnych livestock guarantees.

Przykład:
~~~
readyAt = 24
time skip
now = 30
→ sheep ready
~~~

Nie replayować:
~~~
24 → 25 → 26 → 27 → 28 → 29 → 30
~~~

Po strzyżeniu ustawić nowy absolutny anchor.

## 17. Persistence

Nie tworzyć specjalnego wyjątku persistence tylko dla wool cycle bez wcześniejszego sprawdzenia obecnego kontraktu fauna persistence.

docs/STATE.md wskazuje, że runtime state zwierząt nie jest pełnym snapshotem SaveData.

Jeżeli aktualna architektura nadal nie persistuje runtime state AnimalAgent, wool powinien zachować tę samą semantykę co istniejąca livestock production.

Nie dodawać częściowej persistence tylko dla wełny.

## 18. Existing sheep milk production

Sheep już posiada produkcję milk.

Nowy wool state musi być niezależny od milk production anchor.

Zweryfikować:
- milk nadal produkuje się według istniejącego modelu,
- wool ma własny readyAt,
- oba procesy mogą działać równolegle,
- reset wool cycle nie resetuje milk cooldown.

Nie zmieniać milk recipe/cooldown w tym planie.

## 19. Rendering

Nie wymagać nowego modelu owcy.

Istnieją:
- public/models/fauna/sheep.glb,
- procedural sheep fallback.

Nie implementować wizualnego wzrostu runa.

Stan ready-for-shearing może być niewidoczny w MVP.

## 20. Testy

### Calendar
- season boundaries przy 12 dniach,
- 48 dni tworzy pełny cykl roku,
- weather/climate nadal używa poprawnej Season.

### Wool timing
- before 24 days = not ready,
- at 24 = ready,
- after 24 = ready,
- reset = now + 24.

### Yield
- ready sheep → exactly 4 wool,
- non-ready sheep → 0 wool,
- dead sheep → 0 wool,
- second shearing before reset → impossible.

### Tool
- missing shearing capability → action unavailable,
- valid tool → action allowed.

### Ownership
- shepherd targets only owned sheep,
- other household sheep are ignored.

### Action
- yield is created only on successful completion,
- state is revalidated at completion,
- successful shearing resets the cycle.

### Existing livestock
- sheep milk production unchanged,
- chicken egg production unchanged,
- other livestock production unchanged.

## 21. Browser/gameplay verification

1. Uruchomić settlement posiadające sheep.
2. Znaleźć shepherd NPC.
3. Obserwować jego work schedule.
4. Sprawdzić, że pracuje ze swoim stadem.
5. Ustawić/testować czas przed końcem 24-dniowego cyklu.
6. Sprawdzić, że sheep staje się ready.
7. Sprawdzić rzeczywiste strzyżenie przez shepherd.
8. Sprawdzić 4 wool w Household/economy.
9. Sprawdzić reset cyklu.
10. Sprawdzić ponowną gotowość po kolejnych 24 dniach.
11. Sprawdzić dwa strzyżenia w jednym 48-dniowym roku.
12. Sprawdzić reakcję shepherd na predator threat.
13. Sprawdzić, że sheep milk production nadal działa.
14. Sprawdzić time skip przed i po readyAtDays.
15. Sprawdzić brak działania na sheep należące do innego household.

## 22. Kryteria ukończenia

- [ ] kalendarz działa w modelu 48 dni/rok, 12 dni/sezon,
- [ ] weather/climate nie ma regresji po zmianie kalendarza,
- [ ] sheep ma 24-dniowy wool cycle,
- [ ] sheep staje się gotowa do strzyżenia,
- [ ] shearing daje dokładnie 4 wool,
- [ ] shearing resetuje cycle,
- [ ] sheep może być ostrzyżona 2×/rok,
- [ ] istnieje item wool,
- [ ] istnieje narzędzie/capability shearing,
- [ ] shepherd jest normalnym Role,
- [ ] shepherd ma normalny schedule,
- [ ] shepherd obsługuje tylko własne sheep,
- [ ] shepherd wykonuje podstawowy wypas/pilnowanie,
- [ ] shepherd reaguje na zagrożenie stada,
- [ ] shepherd wykonuje shearing przez PlannedAction,
- [ ] wool trafia do istniejącego Household/Economy flow,
- [ ] time skip nie wymaga catch-up replay,
- [ ] sheep milk production działa bez regresji,
- [ ] automated checks przechodzą,
- [ ] browser/gameplay verification przechodzi.

## 23. Poza zakresem

- yarn jako item,
- spinning,
- weaving,
- wool cloth,
- flax,
- bandage,
- dressing,
- herbs,
- clay,
- pottery,
- sheep breeds,
- age/health/nutrition/season effects on wool,
- visual wool growth,
- breeding,
- dedicated Pasture entity/system,
- advanced herd management,
- shepherd-specific combat AI,
- wool quality,
- full fauna runtime persistence.

## 24. Następny etap

Po tym planie kolejny etap może rozszerzyć:

~~~
wool
 ↓
yarn
 ↓
wool cloth
~~~

Nie implementować kolejnego etapu tutaj.

**Zrób git commit i push do main, rebase jeżeli trzeba**
