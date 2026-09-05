# Plan: Animal threat perception and vocalization responses

**Created:** 2026-09-04
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** fauna-010, fauna-011
**Domain:** `fauna`
**Subdomains:** `predation` `domestication`
**Tags:** `perception` `threats` `vocalization`
**Roadmap:** -

## Cel

Rozwinąć wspólny model percepcji zagrożeń i semantycznych odgłosów zwierząt tak, aby fauna mogła reagować na znaczące zdarzenia zachodzące w otoczeniu, a nie wyłącznie na aktualną odległość od innych encji.

Zachować wyraźny przepływ:

```text
world state / transient event
→ perception
→ relevance
→ existing fauna decision
→ flee / guard / bark / ignore
```

System ma wzmacniać istniejące mechanizmy fauna, nie tworzyć uniwersalnego event busa ani osobnego AI per gatunek.

## Założenia

Plan zakłada ukończenie:

- `fauna-010` — species metabolism, deklaratywna dieta i wspólny food-source pipeline,
- `fauna-011` — dog jako domestic animal, household guarding, contextual barking i minimalna informacja o zagrożeniu potrzebna guard behaviour.

Mechanizmy wprowadzone przez `fauna-011` są punktem wyjścia. Nie tworzyć równoległej perception/threat/vocalization ścieżki.

## 1. Rozdzielenie current world state i transient stimuli

Nie przepakowywać każdej pobliskiej encji w event.

Zachować dwie różne drogi informacji:

```text
current nearby world state
→ istniejące bounded/spatial queries

things that happened
→ transient semantic stimuli
```

Normalna obecność wilka, NPC lub innego zwierzęcia pozostaje częścią spatial perception istniejącego świata.

Transient stimuli służą zdarzeniom takim jak:

- vocalization,
- aktualne/świeże zdarzenie combat/threat.

## 2. Konkretne semantic stimuli zamiast ogólnego event busa

Nie zaczynać od szerokiego `AnimalStimulus` z dowolnym payloadem.

Preferować konkretne, małe kontrakty dla rzeczywiście potrzebnych informacji, np. semantycznej vocalization i read-only combat threat.

Wspólną bazę wydzielić dopiero wtedy, gdy implementacja pokaże realnie wspólny lifecycle, storage lub query mechanism.

Stimulus opisuje informację o świecie, a nie decyzję odbiorcy.

```text
wolf howl ≠ flee
```

Ten sam bodziec może mieć różne znaczenie dla różnych gatunków.

## 3. Perception ≠ behaviour

Zachować podział:

```text
perception
→ relevance
→ decision
→ action
```

Nie implementować bezpośrednich handlerów w rodzaju:

```text
onWolfHowl() → flee()
```

Perception dostarcza informację istniejącemu mechanizmowi decyzji fauna, który uwzględnia aktualny stan i ważniejsze zachowania.

## 4. Semantic animal vocalizations

Rozwinąć istniejące vocalization hooks tak, aby odgłos był semantycznym zdarzeniem symulacji, niezależnym od audio presentation.

Rozróżniać co najmniej istniejące/planowane:

- `howl`,
- `bark`,
- `crow`.

Vocalization powinna przenosić minimalny kontekst przyczyny, gdy ma on znaczenie dla odbiorcy, np.:

```text
ambient
alert
```

Nie odtwarzać przyczyny szczekania po stronie odbiorcy, jeśli producent już ją zna.

Przykładowy flow:

```text
AnimalAgent decides to vocalize
→ semantic vocalization
   ├→ audio presentation
   └→ nearby fauna perception
```

Brak odtworzenia audio z powodu odległości gracza/kamery nie może zmieniać symulacji.

## 5. Spatial i temporal scope vocalizations

Vocalization jest krótkotrwałym, przestrzennym stimulus.

Ocena powinna uwzględniać co najmniej:

- pozycję źródła,
- zasięg istotny dla symulacji,
- wiek zdarzenia,
- gatunek/rodzaj źródła.

Nie wykonywać globalnego `every animal × every vocalization` per frame.

Preferować bounded recent-event storage/query oraz evaluation w istniejącym fauna decision cadence.

Nie wymagać raycast/LOS ani symulacji tłumienia dźwięku w V1.

## 6. Wolf howl jako rzeczywisty stimulus

Wycie wilka powinno mieć konsekwencje w symulacji.

Pobliskie zwierzę może zależnie od gatunku i relevance:

- zignorować wycie,
- zwiększyć threat/flee relevance,
- wejść w krótkotrwałą czujność,
- w przypadku psa uruchomić istniejącą ocenę guard threat,
- rozpoznać vocalization innego wilka.

Rozpoznanie howl przez wilka nie oznacza implementacji pack coordination ani automatycznej odpowiedzi wyciem.

## 7. Bark jako informacja, nie automatyczny trigger

Dog bark jest semantic vocalization dostępną dla pobliskich agentów.

Nie implementować reguły:

```text
heard bark → bark
```

ani:

```text
heard bark → flee
```

Odbiorca ocenia relevance.

`ambient` bark może mieć inne znaczenie niż `alert` bark.

Zapobiec kaskadom dog-to-dog poprzez identity/age bodźca, cooldown i suppression powtórnej reakcji na ten sam bodziec.

Nie wymaga to persistent animal memory.

## 8. Combat/threat perception

Uogólnić wyłącznie tyle minimalnej threat information z `fauna-011`, ile jest potrzebne do percepcji trwającego lub świeżego zagrożenia przez inne zwierzęta.

Combat system pozostaje właścicielem attacker/target state.

Perception otrzymuje tylko read-only informację potrzebną do oceny sytuacji.

Nie tworzyć drugiego combat target state ani rekonstruować ataku wyłącznie z odległości.

Powinno to umożliwić scenariusze typu:

```text
wolf attacks sheep
→ nearby prey evaluates threat

wolf attacks NPC
→ household dog evaluates guard threat
```

bez specjalnego callbacku dla każdej pary gatunków.

## 9. Relevance scoring

Nie każdy stimulus staje się reakcją.

Dodać małą deterministyczną ocenę relevance wykorzystującą tylko czynniki potrzebne obecnym przypadkom, np.:

- stimulus/vocalization type,
- source species,
- distance,
- target/home relevance,
- age,
- current higher-priority behaviour.

Nie tworzyć nowego utility-AI subsystem.

Wynik zasila istniejący fauna decision/scoring.

## 10. Krótkotrwała czujność tylko jeśli potrzebna

Nie wprowadzać obowiązkowo nowej potrzeby ani rozbudowanego `alertLevel`.

Najpierw próbować reprezentować reakcję poprzez stimulus relevance i istniejący decision state.

Jeżeli efekt musi przetrwać krótko po wygaśnięciu pojedynczego zdarzenia, dodać minimalny transient state, np. czas ostatniego istotnego zagrożenia / `alertUntil`.

Stan ten:

- naturalnie wygasa,
- nie jest nową potrzebą,
- nie wymaga persistence.

## 11. Pierwsze cross-species reactions

Wdrożyć mały zestaw przypadków potwierdzających wspólny mechanizm.

### Dog

```text
wolf howl
→ relevance
→ existing alert/guard evaluation
```

Relevant bark innego psa może zwiększyć awareness, ale nie wymusza bark echo.

### Domestic herbivore

```text
nearby predator/combat threat
→ increased flee relevance
```

Alert bark może zwiększyć czujność tylko wtedy, gdy species config/behaviour uznaje go za istotny.

### Wild prey

```text
nearby predator vocalization/threat
→ increased flee relevance
```

### Wolf

Wilk może rozpoznać howl innego wilka jako stimulus, ale behavioural pack response pozostaje poza zakresem.

## 12. Emergent alarm propagation

System powinien umożliwiać naturalny przepływ informacji:

```text
wolf threat
→ dog reacts
→ alert bark
→ nearby animal perceives bark
```

Nie implementować osobnego alarm-network ani specjalnego propagation system.

Każdy krok jest zwykłą decyzją i semantic vocalization istniejącego agenta.

Propagation musi naturalnie wygasać przez range, age, relevance i cooldown/suppression.

## 13. NPC-ready boundary bez NPC reactions

Projektować semantic vocalization/threat information tak, aby przyszły NPC perception mógł ją konsumować bez przebudowy producentów.

Nie implementować w tym planie reakcji NPC.

Fauna nie może zależeć od NPC reaction system.

Nie rozszerzać API spekulacyjnie o potrzeby przyszłych NPC, których aktualny przypadek fauna nie wymaga.

## 14. Debugging / observability

Rozszerzyć istniejący fauna debug output, jeżeli potrzebne, o informacje pozwalające odpowiedzieć:

> Dlaczego zwierzę właśnie uciekło, zaszczekało albo zignorowało zdarzenie?

Przydatne dane:

- ostatni istotny semantic stimulus,
- source/type/context,
- age/distance,
- relevance,
- wynikająca decyzja.

Nie tworzyć osobnego perception debug panelu, jeśli istniejący fauna inspector/debug output wystarcza.

## Testy

Dodać testy przede wszystkim dla czystej logiki:

- vocalization relevance zależy od distance i age,
- expired vocalization jest ignorowana,
- ten sam howl może mieć różne znaczenie dla różnych species,
- wolf howl zwiększa odpowiednią threat/flee relevance prey,
- dog może wykorzystać wolf howl w istniejącym guard evaluation,
- ambient bark i alert bark mogą mieć różną relevance,
- bark nie powoduje automatycznego bark echo,
- ten sam stimulus nie jest wielokrotnie traktowany jako nowy,
- combat threat może zostać zauważony przez pobliskie zwierzę,
- unrelated/distant combat jest ignorowany,
- ewentualny transient alert wygasa,
- perception nie omija istniejącego decision arbitration,
- reakcje działają bez obecności player/camera.

## Manual verification

W przeglądarce sprawdzić co najmniej:

1. Wycie wilka jest semantic stimulus niezależnym od audio/camera distance.
2. Pobliskie prey reaguje na istotne wycie/zagrożenie, a odległe je ignoruje.
3. Pies wykorzystuje howl w guard behaviour z `fauna-011`.
4. Alert bark może wpłynąć na pobliskie zwierzę bez bezpośredniego hard-coded callbacku.
5. Ambient bark nie powoduje nieuzasadnionej paniki.
6. Kilka psów nie tworzy nieskończonej kaskady szczekania.
7. Atak wilka na zwierzę może zwiększyć flee relevance pobliskiego prey.
8. Odległe/nieaktualne zdarzenia nie wpływają na zachowanie.
9. Ewentualna krótkotrwała czujność naturalnie wygasa.
10. Zachowanie działa również bez obserwacji gracza.
11. Większa liczba zwierząt nie powoduje zauważalnego regresu frame time.

## Performance

Nie wykonywać globalnego event scan per animal per frame.

Preferować:

```text
bounded spatial/recent stimuli
+ short lifetime
+ existing fauna decision cadence
+ lazy relevance evaluation
```

Nie utrzymywać permanentnej historii vocalizations/combat events.

Nie dodawać Web Workera wyłącznie dla perception events.

Nie dodawać per-stimulus raycast/LOS w V1, chyba że istniejący mechanizm dostarcza to praktycznie bez dodatkowego kosztu.

## Poza zakresem

- generic world event bus rewrite,
- event dla każdej pobliskiej encji,
- pełne herd/flock AI,
- wolf pack tactics/coordination,
- automatyczne wolf howl response,
- persistent animal memory,
- scent perception/tracking,
- territory marking,
- line-of-sight/hearing occlusion simulation,
- individual animal personality,
- learned fear,
- NPC reactions to animal sounds,
- player stealth/noise system,
- dog training/commands,
- companion behaviour,
- breeding/lifecycle,
- carcass scavenging psa,
- bezpańskie psy,
- ręczne karmienie zwierząt przez NPC,
- animal feeding jobs,
- nowe animal-food production chains.

## Dokumentacja / AI preflight

Dla nowych ważnych publicznych granic perception/vocalization/threat dodać JSDoc z `@domain fauna`.

Jeżeli kilka rodzajów transient stimuli rzeczywiście współdzieli ownership/lifecycle/query mechanism, udokumentować tę granicę jasno zamiast tworzyć niejawny globalny event bus.

> **Zrób git commit i push do main, rebase jeżeli trzeba**