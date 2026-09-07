# Plan: Wilki podchodzą pod osadę

**Created:** 2026-09-07
**Status:** `draft` 📝
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** fauna-016
**Domain:** `quests-progression`
**Subdomains:** `quests` `progression`
**Tags:** `wolves` `wolf-den` `pressure` `fauna`
**Roadmap:** -

## Cel

Dodać systemowy scenariusz „Wilki podchodzą pod osadę”, w którym rzeczywiste siedlisko wilków staje się źródłem utrzymującej się presji na pobliską osadę.

Problem ma wynikać ze stanu świata, a nie z questowego spawnu:

```text
wolf den
+ elevated pressure
+ learned human taste
→ większa lokalna populacja wilków
→ częstsza agresja wobec ludzi
→ realne ataki w pobliżu osady
→ NPC zgłaszają problem i wskazują możliwe źródło
→ gracz odnajduje siedlisko
→ zniszczenie siedliska trwale usuwa źródło presji
→ skutki pozostają w świecie po zakończeniu questa
```

Quest ma obserwować i prowadzić gracza przez rzeczywisty stan fauny. Nie może tworzyć `questSpawn`, własnej populacji wilków ani równoległego combat/lifecycle systemu.

## Stan obecny i mechanizmy do ponownego użycia

Aktualny `main` ma już większość potrzebnych fundamentów:

- `src/fauna/AnimalSpawner.ts` posiada `wolfDen` jako prawdziwy habitat spawner z deterministycznym `WOLF_DEN_ID`, population cap, death accounting, stanami `active` / `depleted` / `disabled` / `recovering` oraz thin persistence.
- Wilki z den mogą być powiązane ze spawnerem przez `AnimalAgent.spawnPointId`; śmierci wpływają na lifecycle siedliska.
- Dzisiejszy `wolfDen` ma `respawnIntervalDays: Infinity`, więc jest jednorazowym zagrożeniem. Ten kontrakt trzeba rozszerzyć dla scenariusza presji.
- `AnimalAgent` i `predatorHumanDecision.ts` mają istniejącą agresję predator-vs-human opartą o hunger, strach, dystans, crowd/fire fear i prowokację.
- Runtime `frenzied` potrafi kierować predatora przeciw pobliskim NPC, ale nie może być źródłem trwałego stanu scenariusza, bo jest runtime-only.
- NPC mają już `senseImmediateAnimalThreat()` / `decideAnimalThreatResponse()` i używają normalnego `NpcAgent` combat pipeline do obrony lub ucieczki.
- Obecny kod pozwala rozpoczętemu poza osadą pościgowi wilka za NPC wejść do osady, ponieważ village exclusion jest sprawdzane przy acquisition, nie przy utrzymaniu istniejącego `npcTarget`.
- fauna-016 dodała species-specific roaming oraz rozróżnienie lokalnego wander od dalszych tripów; scenariusz powinien wykorzystywać istniejący movement ownership zamiast spawnować wilki przy osadzie.
- `src/quests/quests.ts` ma już `clear_wolf_den`, a `QuestManager` potrafi obserwować rzeczywisty stan den bez importowania i skanowania fauny jako questowego subsystemu.
- istniejące `wilcza-jama` i `grozny-wilk` są wcześniejszymi wolf-related questami; nowy scenariusz powinien ponownie użyć istniejących objective/world-binding seams tam, gdzie pasują, zamiast tworzyć alternatywną ścieżkę.

Kod pozostaje źródłem prawdy podczas implementacji. Jeśli aktualny `main` zmieni którykolwiek z powyższych kontraktów, implementator powinien dostosować plan do bieżącego ownershipu zamiast odtwarzać starszą strukturę.

## 1. Persistent wolf-den pressure

Rozszerzyć realny `wolfDen` o dwa systemowe parametry stanu:

```text
pressure
humanTaste
```

Nie przechowywać ich w `QuestManager` ani w quest state.

### `pressure`

`pressure` reprezentuje zwiększoną presję siedliska i wpływa bezpośrednio na realną populację generowaną przez den.

W V1 zwiększona wartość ma powodować:

- większy effective population cap,
- trochę krótszy interval spawn/respawn,
- większą szansę utrzymywania realnej obecności wilków wokół siedliska i osady.

Nie tworzyć drugiego population managera. Rozszerzyć istniejący spawner/lifecycle tak, aby effective cap i spawn interval wynikały z jego własnego systemowego stanu.

`pressure` ma należeć do siedliska i być persistowane wraz z jego stanem, ponieważ po save/load problem nadal ma istnieć.

### `humanTaste`

`humanTaste` reprezentuje nabyte traktowanie człowieka jako atrakcyjnej zdobyczy.

W V1 wpływa na istniejącą decyzję predator-vs-human przez modyfikację dwóch rzeczy:

- obniżenie strachu przed ludźmi,
- podniesienie apetytu / attack pressure wobec ludzi.

Nie dodawać disease/rabies ani nowego human-hunting FSM.

`humanTaste` ma modyfikować istniejący scoring/aggression path, najlepiej przez jawny input do czystej reguły `predatorHumanDecision`, nie przez globalny `kind === 'wolf' && questActive` exception.

Wilki związane z problematycznym den powinny dziedziczyć zachowanie wynikające z `humanTaste` od źródła problemu. Quest nie ustawia flag bezpośrednio na konkretnych wilkach.

## 2. Populacja i spawn podczas presji

Aktualny `wolfDen` jest jednorazowy (`respawnIntervalDays: Infinity`). Dla elevated pressure musi stać się źródłem podtrzymywanej populacji.

V1:

```text
normal wolf den
→ bazowy cap / spokojniejszy spawn

elevated pressure
→ większy effective cap
→ trochę szybszy spawn
→ więcej realnych wilków
```

Nie wymagać pełnego ecosystem/population simulatora.

Nie spawnuj wilków bezpośrednio przy settlement. Wszystkie osobniki mają być normalną fauną z normalnym `home`, movement, combat i death lifecycle.

Zabicie kilku wilków ma chwilowo zmniejszać lokalną populację, ale nie usuwa problemu, dopóki aktywne źródło nadal istnieje.

## 3. Zachowanie wobec osady i ludzi

Wszystkie wilki związane z podwyższonym `humanTaste` mają być bardziej skłonne do ataku na ludzi.

Nie implementować quest-specific target selection.

Rozszerzyć istniejące predator-human / predator-NPC mechanizmy tak, aby parametr `humanTaste` wpływał na ten sam decision pipeline, którego zwykłe wilki już używają.

Presja nie powinna oznaczać bezwarunkowego beeline na settlement. Wilki nadal są autonomiczną fauną. Większa populacja + zmienione fear/appetite powinny zwiększyć realną częstotliwość spotkań i ataków.

Jeśli do uzyskania czytelnego scenariusza potrzebne okaże się ukierunkowanie części ruchu w stronę osady, należy rozszerzyć istniejący `trip`/destination mechanism z fauna-016. Nie tworzyć nowego movement pipeline ani teleportować/spawnować wilków przy celu.

## 4. Źródło problemu i trwałe rozwiązanie

Kill count nie jest warunkiem ukończenia problemu.

Warunek systemowy:

```text
problem active
⇔ źródłowy wolfDen nadal istnieje
```

Zabijanie wilków redukuje bieżące zagrożenie, ale nie kończy scenariusza.

Ostatecznym rozwiązaniem V1 jest **zniszczenie siedliska**.

Należy ponownie użyć istniejącego `depleted → Zniszcz → disabled` lifecycle tam, gdzie to możliwe, ale dla tego scenariusza zniszczenie ma być trwałe.

Po skutecznym zniszczeniu problematycznego wolfDen:

- `pressure` przestaje generować populację,
- den nie może wejść ponownie w normalne recovery,
- problem nie może spontanicznie wrócić po obecnych `RECOVERY_DAYS`,
- stan musi przetrwać save/load i `WorldBundle` rebuild,
- istniejące żyjące wilki mogą umrzeć/rozejść się zgodnie z normalnym systemem; nie usuwać ich magicznie tylko dlatego, że quest się zakończył.

Nie wprowadzać globalnej zasady, że każde zniszczone habitat spawner jest permanentne, jeśli istniejące cave/thicket recovery nadal ma być poprawne. Permanentność powinna wynikać z właściwości/stanu tego konkretnego źródła, bez quest-only managera.

## 5. Quest flow V1

Quest ma prowadzić przez realny problem świata, a nie tworzyć go na potrzeby stages.

Proponowany przebieg:

### Etap A — problem przy osadzie

NPC zgłasza, że wilki coraz częściej podchodzą pod osadę i atakują ludzi.

Nie wymagać dokładnego kill count. Gracz może odpierać i zabijać wilki, ale to tylko doraźne zmniejszenie zagrożenia.

### Etap B — wskazówka od NPC

Rozmowa z NPC daje wskazówkę, że wilki prawdopodobnie mają pobliskie siedlisko / jamę i problem będzie wracał, dopóki źródło istnieje.

To jest jawnie ustalony discovery mechanism V1 — nie implementować śledzenia tropów ani nowego investigation systemu tylko dla tego questa.

### Etap C — odnalezienie siedliska

Gracz odnajduje istniejący `wolfDen`.

Ponownie użyć obecnych world interaction / spawner interaction / quest objective seams tam, gdzie pasują.

### Etap D — eliminacja źródła

Gracz eliminuje wymaganą lokalną watahę w stopniu pozwalającym na użycie istniejącego destroy interaction, a następnie **niszczy siedlisko**.

Quest objective powinien reagować na rzeczywisty trwały stan den, nie na liczbę zabitych wilków.

### Etap E — raport

Po trwałym zniszczeniu źródła quest przechodzi do `ready_to_report` / istniejącego flow zakończenia.

NPC dialog powinien odzwierciedlać, że zniknęło źródło problemu, a nie tylko że gracz zabił N wilków.

## 6. Quest objectives i world-state binding

Preferować rozszerzenie istniejącego `clear_wolf_den` lub najbliższego obecnego objective contract zamiast dodawania kilku wolf-specific objective typów.

Objective powinien odpowiadać na pytanie:

```text
czy źródłowy den został trwale zniszczony?
```

Nie powinien odpowiadać na:

```text
ile wilków zabił gracz?
czy quest ustawił lokalny bool complete?
```

`QuestManager` pozostaje obserwatorem stanu świata. Nie powinien być właścicielem `pressure`, `humanTaste`, population cap ani spawn timers.

Jeżeli obecne `clear_wolf_den` oznacza tylko śmierć początkowej watahy, należy skorygować/rozszerzyć semantykę lub dodać bardziej precyzyjny generic world-state ref tak, aby nowy scenariusz wymagał rzeczywistego destruction state bez psucia istniejącego questa `wilcza-jama`.

Nie zmieniać semantyki starego questa niejawnie. Jeśli stary content wymaga kompatybilności, zachować ją jawnie.

## 7. Persistence

Nowy systemowy stan musi przetrwać save/load.

Persistować co najmniej dane konieczne do odtworzenia:

- `pressure`,
- `humanTaste`,
- permanentne zniszczenie / brak recovery,
- istniejący spawn-point lifecycle state.

Nie persistować całych dzikich wilków tylko na potrzeby tego questa.

Po restore:

- aktywny problem ma ponownie utworzyć normalną populację z właściwym cap/spawn behaviour,
- wilki mają otrzymać zachowanie wynikające z persisted `humanTaste`,
- zniszczone siedlisko nie może się odrodzić,
- aktywny quest ma dalej obserwować ten sam stabilny den identity.

Jeśli persisted representation `SavedSpawnPointState` się zmienia, zaktualizować `SaveData`, parser/defaulting i migration zgodnie z bieżącym `CURRENT_SAVE_VERSION` contract. Nie dodawać wersji save, jeśli finalna implementacja może zachować kompatybilny optional/defaulted representation zgodnie z aktualnymi zasadami persistence.

## 8. Konsekwencje świata po zakończeniu

Po zakończeniu questa:

- source pozostaje trwale zniszczony,
- elevated pressure nie wraca,
- den nie generuje nowych wilków,
- lokalna populacja może z czasem zmaleć przez realny death/movement lifecycle,
- historia questa/reward/reputation może pozostać w obecnym progression systemie,
- nie resetować zachowania świata do pre-quest stanu.

Nie despawnować natychmiast wszystkich żywych wilków jako quest cleanup.

## 9. Relacja do istniejących wolf questów

Aktualne `grozny-wilk` i `wilcza-jama` są prostszymi wcześniejszymi scenariuszami.

Podczas implementacji ustalić najmniejszą spójną integrację:

- reuse ich objective/world binding,
- nie duplikować kolejnego `WOLF_DEN_ID` ani osobnego den registry,
- nie wymuszać automatycznie przebudowy istniejącego contentu, jeśli nie jest to konieczne,
- nie łączyć questów w hardcoded chain, jeśli obecny system nadal nie ma generic quest prerequisites.

Nowy scenariusz może być osobnym questem korzystającym z tego samego systemowego typu problemu. Konkretna nazwa `QuestDef.id`, giver i reward mogą zostać dobrane przy finalizacji draftu po sprawdzeniu kolizji/content sequencing na aktualnym `main`.

## 10. Performance i determinism

Nie dodawać globalnych per-frame scans.

W szczególności:

- pressure powinno wpływać na istniejące low-frequency spawner updates,
- humanTaste powinno być małym dodatkowym inputem do już wykonywanego predator-human scoring,
- nie skanować settlement/NPC dodatkowo per wolf, jeśli istniejące bounded candidate lists wystarczają,
- ewentualne settlement-directed trips wybierać rzadko i zachowywać destination,
- nie uzależniać długotrwałego population state od uncontrolled frame-time randomness,
- preserve world-day/time-skip semantics istniejącego spawner pipeline.

Rozwiązanie powinno pozostawać kompatybilne z przyszłą hybrid/off-screen fauna simulation.

## Zależności

### `fauna-016`

Wymagany fundament: habitat/roaming/trip ownership jest już zaimplementowany i technicznie zweryfikowany, ale plan pozostaje w statusie `verification needed` do manualnego browser checku.

Nie blokować implementacji wyłącznie z powodu statusu manual verification, jeśli aktualny kod potwierdza wymagany kontrakt.

### `fauna-017`

Nie deklarować obecnie twardej zależności.

`fauna-017-animal-agent-refactor.md` jest nadal draftem i czeka na architectural review. Jeśli implementacja tego planu wymaga tylko małego inputu/state propagation do obecnego `AnimalAgent`, nie należy czekać na refactor. Jeśli review przed implementacją wskaże zmianę ownershipu dokładnie w dotykanym obszarze, dostosować implementation notes do zaakceptowanej struktury.

### Existing wolf-den / quest infrastructure

Ponownie użyć obecnego `AnimalSpawner`, `createFauna`, `AnimalAgent`, `predatorHumanDecision`, fauna↔NPC combat hooks oraz `QuestManager` wolf-den objective/ref seams.

## Testy

Dodać focused tests przede wszystkim dla czystych reguł i persistence:

- elevated `pressure` zwiększa effective wolf population cap,
- elevated `pressure` skraca effective spawn interval w ograniczony sposób,
- normalny den zachowuje bazowe zachowanie,
- `humanTaste = 0` zachowuje dotychczasowy predator-human scoring,
- większy `humanTaste` zmniejsza human fear contribution,
- większy `humanTaste` zwiększa human attack/appetite pressure,
- fire/crowd/provocation nadal działają zgodnie z istniejącymi regułami,
- wilk dziedziczy pressure-derived behaviour z właściwego `spawnPointId` / source state bez zależności od active quest,
- zabicie części wilków nie kończy problemu,
- trwałe zniszczenie den blokuje dalsze spawny,
- permanentnie zniszczony den nie wraca przez obecny recovery timer,
- save/load zachowuje `pressure`, `humanTaste` i permanent destruction,
- quest objective kończy się po realnym destruction state,
- quest nie kończy się po samym kill count / depletion, jeśli den nie został jeszcze zniszczony,
- istniejący `wilcza-jama` zachowuje zamierzoną kompatybilność.

## Manual verification

Manual verification wykonuje użytkownik w przeglądarce.

Sprawdzić co najmniej:

1. Przy aktywnej wysokiej presji wokół den utrzymuje się wyraźnie większa liczba wilków niż normalnie.
2. Zabicie kilku wilków chwilowo zmniejsza zagrożenie, ale po czasie populacja wraca, dopóki den istnieje.
3. Wilki z `humanTaste` wyraźnie częściej angażują ludzi niż zwykłe wilki, ale nadal reagują przez ten sam predator AI.
4. Wilk może rozpocząć pogoń poza osadą i kontynuować ją w obrębie osady.
5. NPC atakowany przez wilka używa normalnego defend/flee/combat behaviour.
6. Rozmowa z NPC daje wskazówkę o siedlisku i prowadzi do dalszego etapu.
7. Odnalezienie istniejącego `wolfDen` nie tworzy nowej questowej populacji.
8. Zabicie watahy bez zniszczenia siedliska nie kończy problemu.
9. Zniszczenie siedliska kończy systemowe źródło presji.
10. Po odczekaniu ponad obecny recovery window siedlisko nadal pozostaje trwale zniszczone.
11. Save/load przed rozwiązaniem zachowuje problem, a save/load po rozwiązaniu zachowuje jego trwałe usunięcie.
12. Po ukończeniu questa pozostałe żywe wilki nie znikają magicznie; świat dochodzi do nowego stanu przez normalne mechanizmy fauny.

## Non-goals V1

Poza zakresem:

- disease/rabies jako fabularne źródło problemu,
- pełny ecological pressure simulator,
- shortage-driven wolf migration,
- prey scarcity i competition jako dynamiczne źródła pressure,
- regionalne migracje i zaawansowane watahy,
- breeding/reproduction overhaul,
- alternatywne rozwiązania den bez zniszczenia,
- negotiation / feeding / relocation rozwiązujące problem,
- emergentne automatyczne tworzenie nowych analogicznych questów,
- quest-only wolf spawns,
- osobny wolf manager,
- osobny human-hunting FSM,
- globalny pathfinding overhaul,
- persistence konkretnych dzikich wilków,
- śledzenie tropów/investigation subsystem,
- przebudowa całego istniejącego wolf quest contentu bez konkretnej potrzeby integracyjnej.

## Późniejsze rozszerzenia

System powinien pozostawić naturalny punkt rozszerzenia, aby `pressure` mogło w przyszłości wynikać z realnego ekosystemu:

```text
prey shortage
+ habitat degradation
+ competition
+ migration
+ settlement activity
→ wolf pressure
→ population / behaviour changes
```

`humanTaste` może w przyszłości być nabywany przez doświadczenie watahy/populacji, zamiast być ustawionym scenariuszowo.

Nie implementować tych producerów w V1.

## Implementation notes

Przed przejściem draftu do `planned` przygotować:

`docs/plans/implementation-notes/quests-progression-007-wolves-approach-settlement-implementation-notes.md`

Implementation notes mają zweryfikować na aktualnym `main` dokładne symbole i call sites dla:

- tworzenia `wolfDen` i jego `PreySpawner` config,
- propagowania `spawnPointId` / source state do nowych wilków,
- `predatorHumanDecision` inputs i NPC-target path,
- destruction/recovery lifecycle,
- `SavedSpawnPointState` / `SaveData` / save assembly + restore,
- istniejącego `clear_wolf_den` event/objective contract,
- giver/content sequencing istniejących wolf questów.

Nie powtarzać szerokiego reconu; zapisać tylko ustalenia, które oszczędzą implementatorowi ponownego śledzenia ownershipu i call sites.

Dodać JSDoc dla nowych lub istotnie zmienionych publicznych/architektonicznych funkcji i typów tam, gdzie poprawi to późniejszy preflight; użyć `@domain fauna` lub `@domain quests-progression` odpowiednio do ownershipu.

## Kryteria przejścia z `draft` do `planned`

Przed finalizacją ustalić jeszcze:

- konkretny `QuestDef.id`, giver i tekst/reward,
- czy obecne `clear_wolf_den` może bezpiecznie zachować starą semantykę i dostać drugi destruction-oriented objective/ref, czy powinno zostać rozszerzone wstecznie kompatybilnie,
- dokładny persisted shape `pressure` / `humanTaste` / permanent destruction,
- dokładną reprezentację effective cap/spawn interval bez psucia generic cave/thicket lifecycle,
- czy settlement-directed movement jest potrzebny po pierwszym playteście samego większego population + `humanTaste`, czy naturalne roaming/chase wystarcza.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
