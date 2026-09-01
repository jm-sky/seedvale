# Implementation Notes: Blood Traces

**Reviewed:** 2026-09-01  
**Source:** current `main` codebase + `docs/STATE.md` + `docs/plans/PLANNING.md` + `world-009-blood-traces.md`

## 1. Najważniejsza korekta względem planu

Nie dodawać callbacku bezpośrednio do `HealthState.damageHealth()`. `HealthState` jest świadomie combat-agnostic i wspólny dla player/NPC/fauna. Blood trace potrzebuje rzeczywistego, dodatniego damage po rozstrzygnięciu obrony, więc integracja powinna być na istniejących ownerach damage:

- player: `src/player/playerDamage.ts::applyPlayerDamage()` — callback `onCombatHit` już istnieje i jest wywoływany tylko dla `finalDamage > 0`;
- NPC: `src/ai/NpcAgent.ts::takeDamage()` / `applyIncomingCombatDamage()`;
- fauna: odnaleźć faktyczny damage entry point w `AnimalAgent` i podłączyć trace po finalnym damage, nie przed defense.

Nie zmieniać semantyki `HealthState`, combat resolution ani death lifecycle.

## 2. World-time zamiast render-time

Pogoda jest deterministyczna funkcją `(seed, elapsedDays)`, a `computeWeather()` zwraca również `startedAt/endsAt`. Nie przechowywać w trace sekundowego timera ani historii wszystkich zmian pogody.

Najprostszy stabilny model:

- trace przechowuje `createdAtDays`;
- fading obliczany z aktualnego `elapsedDays`;
- wpływ deszczu liczony jako deterministyczna funkcja skumulowanej ekspozycji na rain w ograniczonym oknie;
- nie próbować odtwarzać całej historii świata od day 0.

Istotne: obecny `computeSurfaceWeather()` ma własny bounded lookback, więc nie należy automatycznie zakładać, że jest odpowiednim API do blood exposure. Lepiej wydzielić mały, blood-specific helper w `world/weather.ts` albo funkcję wykorzystującą te same cykle pogodowe. Zachować koszt stały względem wieku świata.

## 3. Nie wiązać stanu blood z chunkem

ChunkManager ma wyraźną granicę render/streaming: chunk jest usuwany z pamięci GPU przy unload, ale stan świata może żyć poza nim. Blood trace powinien mieć world-level authoritative state oraz chunk-local render representation.

Nie zapisywać trace do `ChunkRecord`. W przeciwnym razie unload oznaczałby utratę śladu albo wymuszał dodatkową synchronizację.

Przy reloadzie chunk powinien jedynie odtworzyć wizualne reprezentacje istniejących, nadal żywych trace'ów znajdujących się w jego footprint.

## 4. WorldBundle / lifecycle

`src/app/worldBundle.ts` jest miejscem wspólnego lifecycle systemów. Nowy system powinien być tam dodany tylko jeśli rzeczywiście ma własny runtime lifecycle/dispose. Nie rozszerzać `HealthState` ani `Combat` o globalny singleton.

Jeżeli system będzie małym world-state + renderer service, preferować jawne API w stylu istniejących systemów zamiast God Objecta. Przy rebuildzie `WorldBundle` pamiętać, że wiele runtime state'ów jest obecnie przenoszonych przez rebuild; dla krótkotrwałych blood traces nie dodawać persistence do `SaveData`, ale nie wolno przypadkiem resetować ich przy zwykłym same-session rebuildzie, jeśli implementacja ma ten sam lifecycle co pozostałe world effects.

## 5. Rendering — nie zakładać, że terrain shader jest łatwym miejscem na overlay

Aktualny terrain/chunk pipeline używa jednego współdzielonego materiału dla wszystkich chunków i instanced/batched vegetation. ChunkManager ma już świadome ograniczenia dotyczące lifecycle, materiałów i finalize queue.

Dlatego kolejność decyzji:

1. sprawdzić rzeczywisty terrain material/shader i jego dane per chunk;
2. jeśli blood może być przekazane jako chunk-local mask/texture bez tworzenia nowego materiału dla każdego chunku — to preferowane;
3. jeśli wymaga to przebudowy shaderów/material ownership albo dużych tekstur dynamicznych, wybrać batched/instanced overlay;
4. absolutnie nie robić `Mesh` + `Material` + draw call per trace.

Dla instancingu naturalny podział to chunk-local representation, z pozycją/skalą/rotacją/variant/opacity jako per-instance data. GPU reprezentacja powinna istnieć tylko dla załadowanych chunków.

## 6. Pozycja i terrain

Blood powinien używać istniejącego `chunkManager.sampleHeight()`/odpowiednika do ustawienia wysokości, ale nie przechowywać tylko Y jako źródła prawdy — world X/Z + czas wystarczą do odtworzenia reprezentacji po streamingu.

Unikać tworzenia geometrii dopasowanej osobno do każdego trace. Overlay powinien leżeć minimalnie nad powierzchnią, z uwzględnieniem istniejących zasad render layer / depth, aby uniknąć z-fighting.

## 7. Size i determinism

Rozmiar powinien być funkcją victim size + finalDamage, ale z saturacją. Nie używać `Math.random()` w systemie, który ma być stabilny przy reloadzie/chunk streaming.

Dla wariantu/rotacji/scale użyć stabilnego hashu z trace id / source entity id + hit sequence lub innego istniejącego deterministycznego identyfikatora. Trace powinien mieć własny stabilny id.

Uwaga: player damage może być ułamkowy (np. starvation), więc sizing musi działać również dla bardzo małych wartości.

## 8. Accumulation

Nie agregować damage events na poziomie combat. Agregacja jest wyłącznie prezentacyjna.

Najpierw zastosować prosty bounded policy zamiast skomplikowanego merge:

- limit trace'ów na chunk / obszar;
- przy przekroczeniu limitu scalać najbliższe świeże reprezentacje albo zastępować je jednym agregatem;
- wygasłe rekordy usuwać przed dokładaniem nowych.

Ważniejsze od agresywnej agregacji jest uniknięcie nieograniczonego GPU state. Jeżeli overlay jest instanced, limit powinien być jawny i łatwy do diagnostyki.

## 9. Aktualne systemy, które trzeba wykorzystać

- `src/shared/HealthState.ts`: tylko jako wspólny model HP; nie modyfikować dla blood.
- `src/player/playerDamage.ts`: final damage callback / miejsce integracji playera.
- `src/ai/NpcAgent.ts`: `takeDamage()` jest wspólnym NPC-owned damage entry point; `applyIncomingCombatDamage()` rozwiązuje defense przed nim.
- `src/fauna/AnimalAgent.ts`: istniejący shared HealthState + collapse/death lifecycle; znaleźć rzeczywisty damage owner przed implementacją.
- `src/world/weather.ts`: `computeWeather()`, `WEATHER_CYCLE_DAYS`, `elapsedDays`; nie tworzyć drugiego weather modelu.
- `src/terrain/chunkManager.ts`: chunk load/unload jest granicą GPU representation; nie authoritative blood state.
- `src/app/worldBundle.ts`: composition/lifecycle systemu, jeśli nowy blood service jest potrzebny.
- istniejące instancing/batching terrain/vegetation: wykorzystać wzorzec danych chunk-local zamiast per-object meshes.

## 10. Pułapki

- **NPC death:** `takeDamage()` może natychmiast wywołać `die()`; blood creation musi nastąpić po finalnym damage, ale nie może zmieniać kolejności/semantyki death cleanup.
- **Player downed:** player przy 0 HP wchodzi w `downed`, nie w `HealthState.dead`; blood nadal wynika z dodatniego finalDamage.
- **Defense:** nie tworzyć śladu dla całkowicie zablokowanego hitu.
- **Time skip:** lifecycle musi działać po skoku `elapsedDays`, bez konieczności wykonywania ticka dla każdego dnia.
- **Weather debug override:** jeśli blood exposure ma używać rzeczywistej pogody, jasno rozstrzygnąć czy korzysta z deterministycznego `computeWeather()`, czy z runtime `ClimateState.weather`. Nie pozwolić, by debug override przypadkiem stał się persisted world state.
- **Chunk rebuild:** ponowne załadowanie chunku nie może tworzyć drugich trace'ów.
- **GC:** nie budować/usuwać dużych tablic Three.js per frame. Aktualizować/rebuildować instancje tylko przy zmianie reprezentacji, streamingu albo cleanup.

## 11. Zalecana kolejność implementacji

1. Zdefiniować minimalny `BloodTrace` world state + deterministic id/variation.
2. Zaimplementować bounded lifetime/weather exposure jako czystą logikę day-based.
3. Podłączyć trzy rzeczywiste damage entry points bez zmian combat semantics.
4. Dodać world-level lifecycle i chunk queries.
5. Dopiero wtedy wybrać i wdrożyć finalny batched/instanced renderer po inspekcji aktualnego terrain shader/material pipeline.
6. Dodać cleanup, chunk streaming i diagnostykę.
7. Testy jednostkowe dla sizing/lifetime/weather oraz istniejący build/test suite.

## 12. Zakres review

Plan jest architektonicznie sensowny, ale jego najważniejszą niedookreśloną decyzją pozostaje sposób terrain overlay. Nie należy przesądzać konkretnego shader implementation przed obejrzeniem aktualnych shaderów/materialów. Reszta planu dobrze pasuje do obecnej architektury: damage pozostaje własnością istniejących systemów, a blood jest krótkotrwałym world/environment state.

**Zrób git commit i push do main, rebase jeżeli trzeba**
