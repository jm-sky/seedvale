# Plan: Wilki podchodzą pod osadę

**Created:** 2026-09-07
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** fauna-016
**Domain:** `quests-progression`  
**Type:** `feature`  
**Roadmap:** -

## Cel

Dodać systemowy scenariusz „Wilki podchodzą pod osadę”, w którym prawdziwe siedlisko wilków staje się trwałym źródłem presji na pobliską osadę.

Problem ma istnieć niezależnie od aktywnego questa:

```text
wolf den
→ od 2. dnia gry: pressure = 0.75 + humanTaste = true
→ większa realna populacja wilków
→ okresowe wyprawy w stronę obrzeży osady
→ większa skłonność do traktowania ludzi jako zdobyczy
→ realne ataki na NPC / gracza
→ NPC zgłasza problem i wskazuje pobliskie siedlisko
→ gracz odnajduje den
→ zabicie części wilków tylko chwilowo redukuje zagrożenie
→ trwałe zniszczenie den usuwa źródło presji
→ stan pozostaje usunięty po save/load i upływie recovery window
```

Quest ma obserwować rzeczywisty stan świata. Nie może tworzyć `questSpawn`, własnej populacji wilków ani równoległego combat/lifecycle systemu.

## Stan obecny i mechanizmy do ponownego użycia

Aktualny `main` ma większość potrzebnych fundamentów:

- `src/fauna/AnimalSpawner.ts` posiada `wolfDen` jako prawdziwy habitat spawner ze stabilnym `WOLF_DEN_ID`, population cap, death accounting i lifecycle `active` / `depleted` / `disabled` / `recovering`.
- Wilki z den są powiązane przez `AnimalAgent.spawnPointId`; ich śmierci wpływają na lifecycle siedliska.
- Dzisiejszy `wolfDen` ma `respawnIntervalDays: Infinity`, więc jest jednorazowym zagrożeniem. Ten kontrakt trzeba rozszerzyć tylko dla aktywnej presji.
- `AnimalAgent` + `predatorHumanDecision.ts` mają istniejącą agresję predator-vs-human opartą o hunger, fear, dystans, fire/crowd fear i prowokację.
- Runtime `frenzied` jest niezależny od rabies i pokazuje istniejący integration seam dla bardziej agresywnego zachowania, ale nie może być trwałym źródłem stanu scenariusza.
- NPC mają normalny defend/flee/combat pipeline dla zagrożeń ze strony zwierząt.
- Obecny pościg rozpoczęty poza osadą może być kontynuowany wewnątrz osady.
- fauna-016 dodała species-specific roaming i `trip`/destination ownership; ten sam mechanizm ma służyć do wypraw wilków w stronę osady.
- `src/quests/quests.ts` ma `clear_wolf_den`, ale obecna semantyka oznacza śmierć początkowej watahy, nie trwałe zniszczenie den.
- istniejące `grozny-wilk` i `wilcza-jama` są wcześniejszym wolf contentem i muszą zachować kompatybilność.

Kod jest źródłem prawdy podczas implementacji.

## 1. World-owned problem state

Rozszerzyć realny `wolfDen` o trzy systemowe właściwości/state inputs:

```ts
pressure: number       // 0..1
humanTaste: boolean
canRecover: boolean
```

Nie przechowywać ich w `QuestManager` ani w quest state.

### `pressure`

`pressure` jest znormalizowaną wartością `0..1` opisującą presję siedliska.

V1:

```text
normalny stan przed aktywacją: pressure = 0
problem od 2. dnia gry:        pressure = 0.75
```

`pressure` wpływa na realną populację i częstotliwość wypraw z den. W przyszłości ta sama wartość może być wyliczana z prey shortage, habitat degradation, competition, migration lub działalności osady.

### `humanTaste`

`humanTaste` jest booleanem.

```text
false → normalny predator-human scoring
true  → mniejszy fear/cost ludzi + większa atrakcyjność ludzi jako zdobyczy
```

Nie dodawać disease/rabies ani nowego human-hunting FSM.

`humanTaste` ma wejść jako jawny input do istniejącego predator-human decision path. Nie używać warunku `questActive` ani globalnego `kind === 'wolf'` wyjątku.

### `canRecover`

Dla problematycznego den:

```text
canRecover = false
```

Po rzeczywistym zniszczeniu i przejściu do `disabled` den nie może wejść do istniejącego recovery path. Zwykłe cave/thicket zachowują dotychczasowe recovery semantics.

## 2. Aktywacja problemu

Den istnieje od początku świata, ale problem nie zaczyna działać natychmiast.

V1 aktywuje stan problemu na początku **2. dnia gry**, jeśli den nadal istnieje i nie został wcześniej trwale zniszczony:

```text
pressure = 0.75
humanTaste = true
```

To jest world-state activation, nie quest activation.

Rozmowa z NPC ani przyjęcie questa nie może być triggerem presji. Gracz może nigdy nie przyjąć questa, a problem i jego konsekwencje nadal powinny istnieć.

Aktywacja ma używać istniejącego world-day/time ownershipu. Nie dodawać real-time timera zależnego od liczby klatek.

## 3. Population scaling i respawn

Bazowy questowy `wolfDen` ma obecnie cap `2` i `respawnIntervalDays: Infinity`.

Przy `pressure === 0` zachować bazowe zachowanie den.

Przy `pressure > 0` użyć effective values wyliczanych z baseline config, bez destrukcyjnego przepisywania bazowej konfiguracji:

```text
effectiveCap = baseCap + round(pressure * 4)

effectiveRespawnIntervalDays = lerp(3.0, 1.5, pressure)
```

Dla V1:

```text
pressure = 0.75
baseCap = 2

effectiveCap = 5
effectiveRespawnIntervalDays ≈ 1.9 dnia
```

Wymagania:

- nie tworzyć drugiego population managera,
- nie spawnować wilków przy settlement,
- każdy nowy wilk jest normalnym `AnimalAgent` z normalnym `home`, movement, health, combat i death lifecycle,
- śmierć kilku wilków chwilowo obniża lokalne zagrożenie,
- dopóki den istnieje, populacja może wrócić do effective cap,
- zniszczony permanentnie den nie generuje nowych wilków.

## 4. `humanTaste` w predator-human decision

Wilki powiązane z problematycznym den dziedziczą `humanTaste` z realnego źródła problemu.

Nie persistować flagi na poszczególnych dzikich wilkach jako authoritative state. Po save/load lub rebuild nowe instancje powinny ponownie otrzymać zachowanie z persisted den state.

Przy `humanTaste = true` istniejący scoring ma zostać zmodyfikowany w dwóch miejscach:

- zmniejszyć effective human fear contribution,
- zwiększyć human-oriented attack/appetite score.

Nie wyłączać całkowicie fire fear, crowd fear, HP/self-preservation ani innych istniejących komponentów. Wilk nadal ma być autonomicznym drapieżnikiem, nie bezwarunkowym beeline na ludzi.

## 5. Settlement-directed trips

V1 **wymaga** okresowych wypraw w stronę osady. Nie odkładać tego do późniejszego playtestu.

Rozszerzyć istniejący fauna-016 `trip`/destination mechanism zamiast dodawać nowy movement pipeline.

Kontrakt V1:

```text
source: aktywny wolfDen z pressure > 0
destination: obrzeże settlement, nie środek osady
max concurrent settlement-directed trips per den: 1
minimum cooldown between opportunities: 0.5 dnia gry
traveller: pojedynczy normalny wilk z den
```

Trip nie jest gwarantowanym atakiem. Po dotarciu w pobliże ludzi normalny predator-human/NPC decision path — zmodyfikowany przez `humanTaste` — decyduje o reakcji.

Nie teleportować wilków, nie spawnować ich przy celu i nie tworzyć quest-specific target selection.

Ten limit ma też chronić osadę przed szybkim NPC wipe na początku gry.

## 6. Źródło problemu i trwałe rozwiązanie

Kill count nie jest warunkiem ukończenia problemu.

```text
problem active
⇔ źródłowy wolfDen nadal może generować presję
```

Zabijanie wilków redukuje bieżące zagrożenie, ale nie usuwa źródła.

Ostateczne rozwiązanie V1 to **trwałe zniszczenie siedliska**.

Ponownie użyć istniejącego flow:

```text
active
→ depletion wymagane przez obecną interakcję
→ [E] Zniszcz
→ disabled
```

Dla tego den `canRecover = false`, więc `disabled` jest trwałe.

Po zniszczeniu:

- `pressure` nie może generować nowych wilków,
- żaden settlement-directed trip nie może zostać rozpoczęty,
- den nie może wejść do `recovering`,
- stan musi przetrwać save/load i `WorldBundle` rebuild,
- istniejące żywe wilki nie są despawnowane quest cleanupem; mogą umrzeć lub rozejść się przez normalne mechanizmy.

Nie zmieniać globalnie semantyki ordinary habitat recovery.

## 7. Quest objective i world binding

Zachować obecne `clear_wolf_den` bez zmiany semantyki, żeby nie psuć istniejącego `wilcza-jama`.

Dodać generic objective:

```ts
{ type: 'destroy_spawn_point', spawnerId: string }
```

Objective kończy się dopiero wtedy, gdy wskazany realny spawn point osiągnie trwały destruction state (`disabled` i brak możliwości recovery zgodnie z source state).

`QuestManager` pozostaje obserwatorem świata. Nie jest właścicielem:

- `pressure`,
- `humanTaste`,
- `canRecover`,
- cap/respawn timers,
- settlement trips.

Nie kończyć questa na `depleted`, `isWolfDenCleared()` ani kill count.

## 8. Quest content V1

Dodać osobny authored quest:

```text
QuestDef.id: wilki-pod-osada
giver: Anna
availability: Anna / trusted
```

Anna pozostaje giverem, ponieważ obecny wolf-related content (`grozny-wilk`, `wilcza-jama`) już jest z nią związany.

Quest nie uruchamia problemu. Po spełnieniu availability Anna opisuje widoczne skutki i daje wskazówkę, że wilki mają pobliską jamę/siedlisko.

### Flow

1. Anna zgłasza, że wilki coraz częściej podchodzą pod osadę i atakują ludzi.
2. W rozmowie wskazuje, że źródłem może być pobliskie siedlisko i samo zabijanie pojedynczych wilków nie wystarczy.
3. Gracz odnajduje istniejący `wolfDen`.
4. Gracz redukuje lokalną watahę na tyle, żeby móc użyć istniejącej interakcji `Zniszcz`.
5. Gracz trwale niszczy den.
6. `destroy_spawn_point` przechodzi do completion i quest staje się `ready_to_report`.
7. Anna potwierdza usunięcie źródła zagrożenia.

Nie dodawać tropów, śledztwa, marker-only den, questSpawn ani nowego investigation subsystemu.

## 9. Reward i konsekwencje społeczne

Nie przyznawać EXP.

Nie wymagać fizycznego item reward w V1.

Używać istniejącego relation/social consequence systemu:

```text
relation with Anna: +2
competence: +20
courage: +22
benevolence: +8
renown: +35
```

Jeżeli aktualny main w chwili implementacji przeszedł już na nowy `QuestOutcome`/reward contract z zależnych planów, odwzorować te same wartości w aktualnym ownershipie zamiast reaktywować legacy `QuestDef.effects.exp`.

## 10. Persistence

Persistować stan źródła wystarczający do odtworzenia scenariusza:

- `pressure`,
- `humanTaste`,
- `canRecover` lub równoważny source-owned permanent-destruction contract,
- istniejący spawn-point lifecycle state,
- dane konieczne do poprawnego kontynuowania world-day activation, jeżeli nie da się jej deterministycznie wyprowadzić wyłącznie z dnia świata i destruction state.

Nie persistować konkretnych dzikich wilków tylko na potrzeby tego questa.

Po restore:

- przed 2. dniem problem pozostaje nieaktywny,
- od 2. dnia aktywny niezniszczony den ma `pressure = 0.75`, `humanTaste = true`,
- populacja wraca zgodnie z effective cap/respawn,
- zniszczony den nie wraca,
- quest nadal obserwuje ten sam stabilny `WOLF_DEN_ID`.

Jeżeli `SavedSpawnPointState` się zmienia, zaktualizować `SaveData`, parser/defaulting i migrację zgodnie z aktualnym `CURRENT_SAVE_VERSION` contract.

## 11. Performance i determinism

Nie dodawać globalnych per-frame scans.

- pressure scaling liczyć w istniejącym low-frequency spawner path lub przez mały pure helper,
- `humanTaste` jest małym inputem do istniejącego predator-human scoring,
- settlement-directed trip korzysta z istniejącego trip ownershipu i ma cooldown,
- nie dokładać osobnego per-wolf settlement scan,
- zachować bounded NPC candidate lists,
- world-day activation i trip cooldown muszą być deterministic/time-system-driven,
- zachować kompatybilność z przyszłą hybrid/off-screen fauna simulation.

## 12. Zależności

### `fauna-016`

Wymagany fundament: habitat/roaming/trip ownership. Kod jest zaimplementowany i technicznie zweryfikowany; manual browser verification nie jest twardym blockerem tego planu, jeśli aktualny kod nadal zachowuje wymagany kontrakt.

### `fauna-017`

Nie jest twardą zależnością. Jeśli implementacja może zostać wykonana przez mały state/input propagation i istniejące pure decision seams, nie czekać na refactor.

### Existing wolf infrastructure

Ponownie użyć aktualnych:

- `AnimalSpawner`,
- `createFauna`,
- `AnimalAgent`,
- `predatorHumanDecision`,
- fauna↔NPC combat hooks,
- `QuestManager` world-objective seams.

## 13. Testy automatyczne

Dodać focused tests dla:

- aktywacja problemu nie występuje przed 2. dniem,
- od 2. dnia niezniszczony den ustawia `pressure = 0.75`, `humanTaste = true`,
- zniszczony wcześniej den nie aktywuje problemu,
- `pressure = 0` zachowuje bazowy wolf-den contract,
- `pressure = 0.75` daje effective cap `5`,
- `pressure = 0.75` daje respawn interval około `1.9` dnia,
- scaling pozostaje bounded dla `pressure ∈ [0,1]`,
- `humanTaste = false` zachowuje dotychczasowy predator-human scoring,
- `humanTaste = true` obniża human fear contribution i podnosi human attack/appetite score,
- fire/crowd/self-preservation nadal działają,
- source behaviour jest propagowane po `spawnPointId`, bez active quest dependency,
- aktywne pressure pozwala na settlement-directed trip,
- nie więcej niż 1 taki trip z den naraz,
- cooldown `0.5` dnia blokuje zbyt częste wyprawy,
- zabicie części wilków nie kończy problemu,
- `depleted` bez `Zniszcz` nie kończy questa,
- `destroy_spawn_point` kończy się po trwałym destruction state,
- `clear_wolf_den` zachowuje starą semantykę,
- permanentnie zniszczony den nie wraca przez recovery timer,
- save/load zachowuje active problem i permanent destruction,
- istniejący `wilcza-jama` pozostaje kompatybilny.

## 14. Manual verification

Manual verification wykonuje użytkownik w przeglądarce.

Sprawdzić co najmniej:

1. Dzień 1 nie powoduje agresywnych wypraw z den.
2. Na początku 2. dnia problem staje się widoczny bez przyjmowania questa.
3. W pobliżu den utrzymuje się wyraźnie większa populacja, ale nie dochodzi szybko do wybicia całej osady.
4. Wilki okresowo kierują się ku obrzeżom settlement przez normalny movement/trip system.
5. Wilki z `humanTaste` częściej angażują ludzi, ale nadal reagują na normalne czynniki predator AI.
6. NPC używają normalnego defend/flee/combat behaviour.
7. Anna daje wskazówkę o pobliskim siedlisku.
8. Zabicie kilku wilków chwilowo redukuje zagrożenie, ale problem wraca.
9. Zabicie całej bieżącej watahy bez zniszczenia den nie kończy questa.
10. `Zniszcz` trwale usuwa źródło presji.
11. Po odczekaniu ponad recovery window den nadal pozostaje zniszczony.
12. Save/load przed rozwiązaniem zachowuje problem, a po rozwiązaniu zachowuje trwałe usunięcie.
13. Pozostałe żywe wilki nie znikają magicznie po zakończeniu questa.

## 15. Non-goals V1

Poza zakresem:

- disease/rabies jako źródło problemu,
- pełny ecological pressure simulator,
- prey scarcity / competition / migration jako dynamiczne producery `pressure`,
- breeding/reproduction overhaul,
- zaawansowane watahy,
- alternatywne rozwiązania problemu,
- feeding / relocation / negotiation,
- emergentne automatyczne tworzenie analogicznych questów,
- quest-only wolf spawns,
- osobny wolf manager,
- osobny human-hunting FSM,
- globalny pathfinding overhaul,
- persistence konkretnych dzikich wilków,
- tracking/investigation subsystem,
- przebudowa istniejących wolf questów bez konkretnej potrzeby kompatybilności.

## 16. Późniejsze rozszerzenia

System ma zostawić naturalny punkt rozszerzenia:

```text
prey shortage
+ habitat degradation
+ competition
+ migration
+ settlement activity
→ pressure
→ population / trip frequency / behaviour changes
```

`humanTaste` może później być nabywany przez watahę/populację z doświadczenia zamiast być authored booleanem.

Nie implementować tych producerów w V1.

## Implementation notes

Aktualne implementation notes:

`docs/plans/implementation-notes/quests-progression-007-wolves-approach-settlement-implementation-notes.md`

Przed kodowaniem implementator ma wykonać tylko krótki preflight bieżącego `main` w wymienionych tam call sites i zaktualizować notes, jeśli ownership się zmienił. Nie powtarzać szerokiego reconu.

Dodać JSDoc dla nowych lub istotnie zmienionych publicznych/architektonicznych funkcji i typów tam, gdzie poprawia to późniejszy preflight; użyć `@domain fauna` lub `@domain quests-progression` zgodnie z ownershipem.

> **Zrób git commit i push do main, rebase jeżeli trzeba**