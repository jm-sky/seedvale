# Plan: Time skip (odpoczynek) — NPC nie nadążają za przyspieszonym czasem

**Status:** `verification needed` 🔍
**Created:** 2026-08-12
**Priority:** 🟡 medium
**Effort:** M
**Depends on:** —

## Problem

Zgłoszenie: **odpoczynek przyspiesza zegar świata, ale NPC nadal poruszają się z tą samą prędkością co zwykle** — po przespaniu np. 8h w grze, NPC-e wyglądają tak, jakby czas dla nich w ogóle nie minął (wciąż idą tam, gdzie szły przed odpoczynkiem, zamiast być już np. w pracy albo w łóżku). Dodatkowo — i to jest istotna część zgłoszenia — **noc nie powinna być dla NPC „pusta"**: powinni w jej trakcie realnie odpocząć (stamina), zaspokoić potrzeby (`thirst`/`hunger`) i wykonać swój obowiązek (`woodDuty`), a nie obudzić się z tymi samymi metrami co przed snem.

To zgodne z obecną, **świadomą** implementacją w `src/world/timeSkip.ts`: `createTimeSkip()` podbija tylko `dayNight.timeMultiplier` (zegar/niebo), a **nie** skaluje `dt` przekazywanego do reszty świata — komentarz w kodzie wprost mówi, że naiwne skalowanie `dt` wysłałoby NPC/faunę "off into the void" (fizyka ruchu/steerowanie nie jest zaprojektowane pod duże `dt`). W efekcie:

- **Pozycja/ruch**: `NpcAgent`'s FSM (`goTo`/`goSleep`/`steerTo`, `WALK_SPEED`) nadal prowadzi NPC do celu w realnym czasie pieszo, mimo że zegar w kilka sekund przeskoczył o kilka godzin.
- **Potrzeby**: `tickNeeds()` (`Needs.ts`) i `drainStamina`/`restoreStamina` (`StaminaState.ts`) też liczą się z realnego `dt` klatka po klatce podczas skipu (`SECONDS_PER_SKIPPED_HOUR = 1` — 8h skip trwa ~8 realnych sekund) — czyli w praktyce dostają ~8 sekund „życia", a nie 8 godzin. Stąd wrażenie, że nic się nie wydarzyło: śpiący NPC nie zdążył realnie odpocząć (mało realnych sekund w `REST_PHASES`), a ci co mieli akurat pracować/pić/jeść nie zdążyli tego zrobić.

## Cel i przyjęty kierunek

Nie przyspieszać ruchu NPC (ryzyko fizyki, odrzucone już w `timeSkip.ts`). Zamiast tego, w momencie zakończenia skipu (`TimeSkipTickResult.justFinished`) **rozwiązać skipnięty okres przez „headless" symulację krokową** dla każdego `NpcAgent` — bez `steerTo`/ruchu klatka po klatce, tylko przeliczanie stanu w dyskretnych krokach czasu gry, widoczne dopiero jako efekt końcowy.

### Krok próbkowania — co ile symulować

Zamiast jednego dużego skoku na koniec (ryzyko: potrzeba przekracza próg 2-3 razy w nocy, a policzylibyśmy zaspokojenie tylko raz), symulacja idzie krokami po **30 minut gry**. To nie jest arbitralne — przy domyślnych stawkach w `Needs.ts` (`thirst +0.04/s`, próg zaspokojenia `0.35`) i domyślnym `dayLengthSec = 480` (`dayNight.ts`, czyli 20 realnych sekund na godzinę gry), `thirst` w normalnym (nie-skipowanym) biegu gry przekracza próg co ok. **26 minut gry** — to najszybciej odświeżająca się potrzeba. 30 minut jest więc blisko naturalnej granulacji, przy której i tak NPC „odwiedzałby" źródło potrzeby w zwykłej grze; grubszy krok (np. 1h) realnie gubiłby cykle, drobniejszy (np. 5 min) tylko mnoży iteracje bez zysku (to i tak liczone raz, nie per-frame). Wartość warto trzymać jako nazwaną stałą (np. `TIME_SKIP_SAMPLE_HOURS = 0.5`), żeby łatwo dostroić przy testach.

### Pętla kroków (per NPC, raz na `justFinished`)

Dla `hours` przekazanych do `TimeSkip.start()`, iterując `for (let t = 0; t < hours; t += TIME_SKIP_SAMPLE_HOURS)`:

1. Policzyć wirtualny `timeOfDay` dla tego kroku i `scheduledActivity = getScheduledActivity(timeOfDay)` (`schedule.ts`, cyklicznie już to obsługuje przez `activityAt`).
2. **Potrzeby**: doliczyć do `thirst`/`woodDuty`/`hunger` narost odpowiadający `TIME_SKIP_SAMPLE_HOURS` godzin gry (przeliczone na ekwiwalent `dt` wg `dayLengthSec`, tak jak robiłby to `tickNeeds` w normalnym biegu).
3. **Zaspokojenie w tym kroku**: jeśli `scheduledActivity` pozwala NPC zająć się sobą (czyli **nie** `sleep`) i `pickNeed(needs)` wskazuje realną potrzebę powyżej progu — zredukować odpowiednią metrę tak, jakby NPC właśnie ją zaspokoił (analogicznie do tego, co `beginNeed()` i tak by wywołało). Podczas `sleep` potrzeby narastają, ale nie są zaspokajane (nikt nie pije przez sen) — zaspokoją się w pierwszym kroku po przebudzeniu.
4. **Stamina**: jeśli `scheduledActivity` odpowiada fazie z `REST_PHASES` (czyli efektywnie `sleep`) — `restoreStamina` za ten krok; jeśli fazie z `FATIGUE_PHASES` (`work`) — `drainStamina` za ten krok. To dosłownie realizuje „odpoczynek ma sprawić, że NPC odpoczną".
5. Zapamiętać ostatni krok (`scheduledActivity`, pozycję docelową) — to jest stan po zakończeniu pętli.

Po pętli: **teleport** — ustawić NPC (pozycja + `phase`) na stan odpowiadający ostatniemu wyliczonemu `scheduledActivity`, tak jakby FSM już tam doszło, bez animacji przejścia (efekt jak w przyspieszonym wideo — widać NPC tylko tam, gdzie „zatrzymała się klatka"):

- `sleep` → `this.home`, `phase = 'sleep'`.
- `work` → workplace (jeśli ustawiony), `phase` odpowiednia dla `work`/`execute`.
- inne (`eat`/`home`/`wake`/brak) → `phase = 'choose'` od nowej pozycji (zwykle `home`), niech normalny `pickNeed`/`beginIdle` przejmie od tego miejsca.

Miejsce w kodzie: `gameLoop.ts` już konsumuje `timeSkip.tick(dt)` i `skip.justFinished` (ok. linii 222-227) — naturalne miejsce na wywołanie np. `settlementsManager.resolveTimeSkip(startTimeOfDay, hoursSkipped)` raz, gdy skip się kończy; sama pętla kroków może żyć jako helper obok `NpcAgent` (albo metoda na nim), żeby nie rozdmuchiwać `update()`.

`wood` tu = obecny per-NPC `woodDuty` need (drewno na własny użytek NPC) — **nie** jest to jeszcze magazyn/gospodarka osady (`docs/plans/2026-08-11--069--npc-household-resources.md` / `...071...` — wciąż `todo`). Ten plan nie wprowadza realnych zapasów drewna/jedzenia osady; operuje na istniejących abstrakcyjnych metrach potrzeb.

### Poza zakresem v1 (do rozważenia osobno)

- Fauna (`AnimalAgent.ts`) — podobny FSM/`steerTo`, mniej widoczne niż NPC-e w wiosce; osobny follow-up, jeśli po v1 nadal będzie widocznie „nie nadążać".
- Prawdziwa gospodarka zasobów osady (magazyny drewna/jedzenia/wody per gospodarstwo) — to zakres planów 069/071, nie tego planu.

## Kryterium sukcesu

Po zakończeniu odpoczynku (`onRest`/`onWait`, `createQuickActions.ts`):

1. NPC-e w polu widzenia gracza są **od razu** tam, gdzie powinny być wg nowego `timeOfDay` i swojego `schedule` (`schedule.ts`) — bez pieszego „doganiania" zegara.
2. Metry potrzeb (`thirst`/`hunger`/`woodDuty`) i stamina odzwierciedlają to, że skipnięte godziny **faktycznie się wydarzyły** — NPC, który spał 8h, budzi się wypoczęty; NPC, który miał w tym czasie pracować/jeść/pić, nie wraca z pustymi/przepełnionymi metrami, jakby nic nie robił.

## Zaimplementowane

1. **`world/timeSkip.ts`** — `TimeSkipTickResult` += `hours`/`startTimeOfDay` (zapamiętane w `start()` z ówczesnego `dayNight.timeOfDay`), zwracane na każdym `tick()`, w tym na `justFinished`.
2. **`NpcAgent.resolveTimeSkip(startTimeOfDay, hours, dayLengthSec)`** — pętla krokowa co `TIME_SKIP_SAMPLE_HOURS = 0.5`h gry: `tickNeeds` za ekwiwalent `dt` (`step * dayLengthSec / 24`), `restoreStamina`/`drainStamina` wg `scheduledActivity` (`sleep` → rest, `work` → fatigue, reszta → rest), i poza `sleep` — jednorazowe zaspokojenie `pickNeed()`-owej potrzeby tymi samymi wartościami co `beginNeed()` (`WATER_/FOOD_/WOOD_SATISFY_AMOUNT`, teraz stałe dzielone między oba miejsca). Po pętli: teleport (`mesh.position.set` + `sampleHeight`) na `workplace` (jeśli `work` i ustawiony) albo `home`, reset FSM do `phase = 'choose'` (czyszczone `pendingAction`/`wait`/`pathWaypoints`).
3. **`SettlementsManager.resolveTimeSkip`** — iteruje załadowane osady i wywołuje `npc.resolveTimeSkip(...)` na każdym NPC; nieaktywne (unloaded) osady nie mają NPC-ów do domknięcia — przy ponownym załadowaniu i tak startują od `SCHEDULE_TEMPLATES`/`home`.
4. **`gameLoop.ts`** — na `skip.justFinished` wywołuje `bundle.settlementsManager.resolveTimeSkip(skip.startTimeOfDay, skip.hours, dayNight.dayLengthSec)`, tuż obok istniejącego `timeSkipOverlay.hide()`/`player.standUp()`.

Fauna i prawdziwa gospodarka zasobów osady pozostają poza zakresem (patrz „Poza zakresem v1" wyżej).

## Update (playtest po pierwszym przejściu) — screen filter + freeze ruchu

Pierwsze przejście (punkty 1-4 wyżej) samo w sobie okazało się **niewidoczne w grze**: `onRest` w `createApp.ts` wywoływał `timeSkip.start(8, { fade: false, ... })` — `fade` był zahardkodowany na `false`, mimo że komentarz w `createTimeSkipOverlay.ts` już wtedy dokumentował, że `true` ma pokazywać ekran podczas odpoczynku. Efekt: gracz przez cały ~8-sekundowy real-time skip patrzył na świat symulujący się normalnie pod spodem (per `timeSkip.ts`'s świadomy design) i dopiero ostatnia klatka (mój teleport) była inna — łatwo niezauważalne, zwłaszcza że osady są małe i NPC bywał już blisko celu.

Dodatkowe zmiany:

5. **`TimeSkipOverlay.vue`** — pełnoekranowy filtr `backdrop-blur-[2px] backdrop-grayscale backdrop-brightness-90` (monochromatyczny + lekki blur + przyciemnienie ~10%) na istniejącym div-ie z animacją opacity; poprzednio div miał `bg-black` (pełna czerń), ale nic go nie pokazywało (patrz wyżej), więc efekt był i tak martwy. Pierwsza wersja użyła `backdrop-blur-sm` (8px w Tailwind v4 — zbyt mocne, feedback „zbyt duży blur"), zmniejszone do `[2px]`.
6. **`createApp.ts`** — `onRest` teraz woła `timeSkip.start(8, { fade: true, ... })` (oba warianty `camp`/`town`), więc filtr faktycznie się pokazuje. `onWait` zostaje przy `fade: false` (obserwowanie nieba, bez filtra — zgodnie z istniejącym zamysłem).
7. **`gameLoop.ts`** — **freeze ruchu NPC/fauny podczas skipu**, nie tylko blur: `const worldDt = timeSkip.isActive() ? 0 : dt`, użyte jako pierwszy argument `bundle.settlementsManager.update(worldDt, ...)` i `bundle.fauna.update(worldDt, ...)` (zamiast realnego `dt`). `tickDayNight(dayNight, dt)` i cała reszta bloku (`ambientAudio`, `chunkManager`, `ocean.follow`, itd.) nadal dostają realny `dt` — tylko zegar ma dalej realnie „biec". Sam blur/grayscale nie ukrywał **ruchu** (tylko szczegół obrazu) — feedback „NPC dalej spokojnie chodzą w tle" po pierwszym filtrze potwierdził, że trzeba faktycznie zatrzymać symulację NPC/fauny na czas skipu, nie tylko zamazać ekran. `dt=0` jest bezpieczne dla `NpcAgent.update`/`AnimalAgent` (`tickNeeds`/`drainStamina`/`restoreStamina`/`steerTo`/`mixer.update` wszystkie no-op przy `dt=0`) — nic nie ginie, bo `resolveTimeSkip` i tak dolicza cały skipnięty okres osobno, headless, dokładnie raz na końcu.

Teraz: odpoczynek = ekran w filtrze (monochrom/lekki blur/przyciemnienie) + świat wizualnie zamrożony (poza zegarem) → na końcu filtr znika i NPC są już przeteleportowani/domknięci — bez okna, w którym widać "stary" stan w realnym czasie.

## Technicznie zweryfikowane

`npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test` — przechodzą dla plików tego planu (`world/timeSkip.ts`, `ai/NpcAgent.ts`, `settlement/SettlementsManager.ts`, `app/gameLoop.ts`, `app/createApp.ts`, `ui/createTimeSkipOverlay.ts`, `ui-vue/screens/TimeSkipOverlay.vue`); testy 292/292. W trakcie tego przejścia repo miało równolegle niepowiązany refaktor (`playSound` → `playAt`/`PlayAt`) w innych plikach (`props.ts`, `createSettlement.ts` i in.) — chwilowe błędy typów/lint stąd nie dotyczyły tego planu i ustąpiły same. Brak nowych testów jednostkowych dla `resolveTimeSkip` / freeze — logika nie ma dedykowanego pokrycia poza istniejącymi testami `Needs`/`schedule`.

## Do zweryfikowania w grze

Nie testowane manualnie w przeglądarce przez agenta. Do sprawdzenia na żywym dev serwerze:

- Odpoczynek (`onRest`, 8h) w nocy — ekran wchodzi w filtr, świat (NPC/zwierzęta) wizualnie zamiera, po zakończeniu NPC-e stoją w domach/łóżkach zamiast w połowie drogi.
- `onWait` na kilka godzin w środku dnia pracy — bez filtra (jak dotąd), ale NPC też zamiera na czas skipu i teleportuje się do workplace na koniec, zamiast kontynuować przerwany spacer.
- Siła filtra (blur `[2px]`, grayscale, brightness 90%) — czy 2px jest wystarczająco subtelne, czy jeszcze za mocne/za słabe.
- Pasek staminy/needs (etykieta nad NPC) tuż po odpoczynku — czy wygląda sensownie (nie utknięty na starej wartości, nie „przeleczony" do zera/maksimum w dziwny sposób).
