# Plan: Pory roku i pogoda

**Created:** 2026-08-15  
**Status:** `verification needed` 🔍 — Etap 1–3 done (GPU weather 2026-08-15); Etap 4 (debug/save) partial; Etap 5 (browser/perf) open. See [implementation notes](./2026-08-08--040--seasons-weather-implementation-notes.md).  
**Priority:** medium 🟡 · **Effort:** L  
**Depends on:** ~~003~~ ~~028~~

**domain:** `world-terrain`

---

## 1. Cel

Dodać do Seedvale **deterministyczny system pór roku i pogody**, oparty na istniejącym czasie świata.

Pierwsza implementacja ma:

- wprowadzić 4 pory roku,
- wyznaczać sezon z istniejącego `elapsedDays`,
- generować pogodę jako stan świata,
- zapewnić płynne przejścia między stanami pogody,
- wykorzystać istniejący system day/night do zmian oświetlenia i atmosfery,
- dodać podstawowe wizualne efekty deszczu, śniegu, mgły i zachmurzenia,
- udostępnić sezon i pogodę jako dane dla przyszłych systemów.

**Nie implementuje jeszcze pełnej sezonowości zasobów, NPC ani ekonomii.**

---

## 2. Zasada Performance-first

Pogoda nie może stać się kolejnym kosztownym systemem symulacji.

Najważniejsze założenia:

- koszt symulacji klimatu powinien być praktycznie **O(1) względem liczby NPC, zwierząt i chunków**,
- stan pogody nie jest liczony ponownie w każdej klatce,
- nie tworzyć encji pogodowych w świecie,
- nie symulować fizycznie każdej kropli deszczu lub płatka śniegu,
- nie tworzyć obiektów Three.js per kropla/płatek,
- nie wykonywać per-frame alokacji,
- efekty pogodowe renderować lokalnie wokół gracza/kamery,
- preferować obliczenia wykonywane przez GPU,
- wykorzystać istniejący rendering zamiast tworzyć równoległe systemy,
- intensywność efektów skalować zależnie od jakości/performance settings, jeśli istniejący system na to pozwala.

### Preferowana technika

Dla deszczu i śniegu preferować **GPU shader-based weather effects**, a nie klasyczne particles aktualizowane na CPU.

```text
Weather State
      ↓
GPU Weather Renderer
      ├── Rain shader
      ├── Snow shader
      ├── Existing fog
      └── Sky / cloud parameters
```

Shader powinien wyliczać ruch cząstek na podstawie czasu, seedowanej pozycji i parametrów pogody, zamiast aktualizować pozycję tysięcy cząstek na CPU.

`THREE.Points` / klasyczny particle system może być użyty tylko wtedy, gdy okaże się prostszy lub wizualnie wyraźnie lepszy przy akceptowalnym koszcie.

---

## 3. Aktualny stan codebase

Istnieje już `DayNightState` w `src/world/dayNight.ts`:

```ts
type DayNightState = {
  timeOfDay: number
  elapsedDays: number
  dayLengthSec: number
  timeMultiplier: number
  enabled: boolean
}
```

`elapsedDays` jest już używane przez systemy zależne od upływu świata i jest zapisywane w save.

Nie należy tworzyć drugiego zegara dla sezonów.

Istnieją również:

- day/night,
- sky,
- directional sun,
- ambient light,
- hemisphere light,
- fog,
- chunk streaming,
- systemy performance/debug,
- fauna/NPC simulation,
- player needs,
- save/load z `elapsedDays`.

Weather powinien rozszerzać istniejącą architekturę, a nie tworzyć osobny system czasu, oświetlenia lub fog.

---

## 4. Model sezonu

Wprowadzić:

```ts
export type Season =
  | 'spring'
  | 'summer'
  | 'autumn'
  | 'winter'
```

Sezon jest funkcją `elapsedDays`.

Domyślnie:

- 7 dni świata = 1 sezon,
- 28 dni = pełny rok.

```text
elapsedDays
    ↓
seasonIndex
    ↓
spring → summer → autumn → winter → spring
```

Nie przechowywać osobnego licznika sezonu.

API:

```ts
getSeason(elapsedDays: number): Season
getSeasonProgress(elapsedDays: number): number
```

`seasonProgress` określa postęp od `0` do `1` w aktualnym sezonie.

---

## 5. Climate state

Wprowadzić jeden współdzielony kontrakt:

```ts
export type WorldClimateState = {
  season: Season
  seasonProgress: number
  weather: WeatherState
}
```

Pozwala to przyszłym systemom korzystać z klimatu bez znajomości implementacji generatora pogody.

---

## 6. Weather state

Wprowadzić:

```ts
export type WeatherType =
  | 'clear'
  | 'cloudy'
  | 'rain'
  | 'fog'
  | 'snow'

export type WeatherState = {
  type: WeatherType
  intensity: number
  temperature: number
  startedAt: number
  endsAt: number
}
```

Weather jest **stanem świata**, a nie tylko efektem renderingu.

Przejścia mogą wyglądać np.:

```text
clear
  ↓
cloudy
  ↓
rain
  ↓
cloudy
  ↓
clear
```

Nie losować pogody per frame.

---

## 7. Deterministyczna pogoda

Pogoda powinna być deterministyczna względem:

```text
world seed
+
elapsedDays
+
weather cycle
```

Generator powinien umożliwiać bezpośrednie wyznaczenie pogody dla dowolnego momentu świata.

Dzięki temu:

- save/load odtwarza ten sam stan,
- time-skip może przeskoczyć wiele zmian,
- nie trzeba symulować każdej pominiętej sekundy,
- nie trzeba utrzymywać długiego runtime history weather.

Preferować funkcję deterministyczną zamiast losowego generatora działającego ciągle w game loop.

---

## 8. Sezonowe prawdopodobieństwa

Każdy sezon posiada wagi dla typów pogody.

Przykładowo:

### Spring

- clear — średnie,
- cloudy — wysokie,
- rain — wysokie,
- fog — średnie,
- snow — bardzo niskie.

### Summer

- clear — wysokie,
- cloudy — średnie,
- rain — średnie,
- fog — niskie,
- snow — brak.

### Autumn

- clear — średnie,
- cloudy — wysokie,
- rain — wysokie,
- fog — średnie,
- snow — niskie.

### Winter

- clear — średnie,
- cloudy — wysokie,
- rain — niskie,
- fog — średnie,
- snow — wysokie.

To są wagi, a nie twarde reguły.

---

## 9. Temperatura

Temperatura jest częścią `WeatherState`.

Powinna zależeć od:

```text
season
+
weather
+
time of day
+
small deterministic variation
```

Przykładowy kierunek:

```text
winter + snow   → cold
winter + clear  → cold
summer + clear  → hot
summer + rain   → cooler
```

Dokładne wartości powinny być skoncentrowane w jednym miejscu i łatwe do strojenia.

Pierwsza wersja nie wykorzystuje temperatury do symulowania chorób, staminy ani innych potrzeb.

---

## 10. Integracja z day/night

Istniejący `dayNight.ts` już steruje:

- słońcem,
- ambient light,
- hemisphere light,
- sky,
- fog.

Weather nie powinien tworzyć drugiego systemu oświetlenia.

Docelowo:

```text
DayNight
     +
Weather
     +
Season
     ↓
Environment rendering
```

Przykładowe modyfikatory:

- cloudy → niższa intensywność światła,
- rain → ciemniejsza atmosfera,
- fog → mniejszy visibility range,
- winter → chłodniejszy wygląd,
- summer → cieplejsza atmosfera.

Zmiany powinny być interpolowane, aby nie występowały widoczne skoki.

---

## 11. Deszcz — shader-first

Deszcz powinien być pierwszym testem GPU weather rendering.

Preferowana implementacja:

- jeden lokalny weather mesh/buffer,
- prosty shader WebGL2,
- pozycje kropli wyznaczane proceduralnie w shaderze,
- ruch zależny od czasu,
- deterministyczne rozmieszczenie,
- opcjonalny wpływ kierunku wiatru,
- intensywność sterowana uniformem.

Schemat:

```text
CPU
 └── weather state
       ↓ uniforms
GPU
 └── rain shader
       ├── position
       ├── fall speed
       ├── wind
       └── intensity
```

Nie:

```text
CPU
 ├── drop 1 position
 ├── drop 2 position
 ├── drop 3 position
 ├── ...
 └── drop N position
```

Efekt powinien być ograniczony do obszaru wokół gracza/kamery.

---

## 12. Śnieg — shader-first

Śnieg wykorzystuje tę samą ogólną infrastrukturę co deszcz, ale inny shader/parametry.

Shader powinien obsługiwać:

- opadanie,
- lekki ruch boczny,
- wiatr,
- różne prędkości,
- proceduralną losowość,
- intensywność.

Nie symulować fizyki pojedynczych płatków.

Śnieg również powinien być lokalnym efektem renderingu.

---

## 13. Reuse weather renderer

Nie tworzyć osobnego dużego systemu dla każdego rodzaju opadu.

Preferować:

```text
WeatherRenderer
    ├── shared geometry
    ├── shared lifecycle
    ├── rain shader
    └── snow shader
```

lub wspólny shader z parametrem typu efektu, jeżeli okaże się to prostsze i nie pogorszy czytelności.

Weather renderer powinien:

- tworzyć zasoby raz,
- utrzymywać je przez cały czas życia świata,
- zmieniać tylko parametry,
- nie wykonywać `new` / `dispose` przy każdej zmianie pogody.

---

## 14. Mgła

Wykorzystać istniejący system Three.js fog.

Weather może modyfikować:

```text
fogNear
fogFar
fogColor
```

Nie tworzyć osobnego systemu fog.

Mgła powinna być sterowana parametrami istniejącego środowiska.

---

## 15. Zachmurzenie

Pierwsza wersja nie powinna implementować ciężkich volumetric clouds.

Wykorzystać:

- istniejący sky,
- zmianę parametrów atmosfery,
- ewentualnie tani shaderowy efekt chmur, jeśli jest potrzebny wizualnie.

**Volumetric clouds pozostają poza zakresem.**

---

## 16. Lokalność efektów

Świat jest streamingowany, więc efekty pogodowe nie powinny być generowane dla wszystkich załadowanych chunków.

```text
World climate
     ↓
global state

Player / camera
     ↓
local weather renderer
     ↓
rain / snow around player
```

Efekt może być ograniczony np. do lokalnego obszaru 40–80 m, zależnie od wyników benchmarku.

Nie tworzyć deszczu/śniegu jako encji świata.

---

## 17. Aktualizacja bez kosztu per-frame

Climate state nie powinien być przeliczany co klatkę.

Przykładowo:

```text
World time changes
       ↓
weather cycle boundary
       ↓
calculate new weather
       ↓
interpolate visual transition
```

W czasie przejścia:

- CPU aktualizuje tylko niewielką liczbę uniformów/parametrów,
- GPU wykonuje wizualny efekt.

Nie wykonywać generatora pogody dla każdej klatki.

---

## 18. Time skip

Istniejący time-skip może przeskoczyć wiele dni.

Po zmianie `elapsedDays`:

```text
elapsedDays changes
        ↓
season recalculated
        ↓
weather recalculated
        ↓
visual state updated
```

Nie odtwarzać wszystkich pominiętych zmian pogody.

Jeżeli gracz przeskoczył np. 5 dni, system ma od razu określić aktualny stan świata.

---

## 19. Save / Load

Nie zwiększać save schema wyłącznie dla sezonu i pogody, jeśli stan można deterministycznie odtworzyć z istniejących danych.

Źródło prawdy:

```text
elapsedDays
+
world seed
+
timeOfDay
```

Po load:

```text
Save
 ↓
elapsedDays
 ↓
Climate
 ↓
Season + Weather
```

Jeżeli implementacja wykaże konieczność przechowywania dodatkowego stanu, najpierw sprawdzić możliwość wyprowadzenia go deterministycznie.

---

## 20. API dla innych systemów

System powinien udostępnić read-only climate state:

```ts
type WorldClimateState = {
  season: Season
  seasonProgress: number
  weather: WeatherState
}
```

Przyszłe systemy mogą pytać:

```ts
climate.season
climate.seasonProgress
climate.weather.type
climate.weather.intensity
climate.weather.temperature
```

Nie powinny modyfikować pogody bezpośrednio.

---

## 21. NPC i fauna — tylko kontrakt

Pierwsza implementacja nie zmienia zachowania NPC ani zwierząt.

Nie dodawać:

- `WeatherAI`,
- nowych FSM,
- nowych potrzeb,
- nowych weather-specific actions.

Docelowo:

```text
Climate
   ↓
existing DecisionContext
   ↓
existing NPC / fauna decision systems
```

Pogoda ma dostarczać dane, a istniejące systemy mają decydować, jakie konsekwencje z nich wynikają.

---

## 22. Zasoby i rolnictwo — później

Sezon powinien być przygotowany do przyszłej integracji:

```text
season
   ↓
food sources
   ↓
production
   ↓
household
   ↓
settlement economy
```

Nie implementować w tym planie pełnej sezonowości:

- upraw,
- ryb,
- owoców,
- grzybów,
- polowań,
- produkcji,
- ekonomii.

Będą to rozszerzenia istniejących systemów.

---

## 23. Debug

Dodać do istniejącego debug UI:

```text
Season: Summer
Season progress: 0.42

Weather: Rain
Intensity: 0.68
Temperature: 21°C
Remaining: 0.7 days
```

Dodać możliwość wymuszenia:

- sezonu,
- pogody,
- intensywności.

Debug override nie powinien zmieniać deterministycznego modelu świata.

---

## 24. Implementacja

### Etap 1 — Climate foundation

- [ ] `Season`
- [ ] `getSeason(elapsedDays)`
- [ ] `seasonProgress`
- [ ] `WeatherType`
- [ ] `WeatherState`
- [ ] deterministic weather selection
- [ ] seasonal weather weights
- [ ] deterministic temperature
- [ ] testy jednostkowe

### Etap 2 — Existing rendering integration

- [ ] weather modifiers dla day/night
- [ ] fog integration
- [ ] sky/light integration
- [ ] płynne przejścia
- [ ] brak równoległego systemu fog/light

### Etap 3 — GPU weather renderer

- [x] wspólna infrastruktura weather renderer (jeden shader, rain/snow jako parametry emitera)
- [x] rain shader
- [x] snow shader
- [x] lokalny weather volume
- [x] proceduralne pozycje w shaderze
- [x] uniform-based intensity
- [x] wind parameter (sinusoidalny `uDrift`, ten sam koncept co w CPU stopgapie — bez nowego pola `WeatherState`)
- [x] brak per-particle CPU updates
- [x] brak per-frame allocations

### Etap 4 — Debug + time/save verification

- [ ] debug climate state
- [ ] weather/season overrides
- [ ] time-skip przez zmianę sezonu
- [ ] save/load
- [ ] deterministyczność po reloadzie

### Etap 5 — Performance verification

- [ ] benchmark baseline przed implementacją
- [ ] benchmark clear
- [ ] benchmark rain
- [ ] benchmark snow
- [ ] benchmark fog
- [ ] sprawdzenie CPU frame time
- [ ] sprawdzenie GPU frame time
- [ ] sprawdzenie draw calls
- [ ] sprawdzenie allocations/GC
- [ ] sprawdzenie frame pacing
- [ ] weryfikacja braku hitchów przy zmianie pogody

---

## 25. Performance acceptance criteria

Weather implementation powinna spełniać:

### CPU

- brak iterowania po NPC/chunkach tylko z powodu pogody,
- brak aktualizacji pojedynczych kropli/płatków,
- brak per-frame alokacji,
- climate calculation wykonywane tylko przy zmianie wymagającej aktualizacji.

### GPU

- batched rendering,
- lokalny weather volume,
- prosty shader,
- brak volumetric effects w pierwszej wersji,
- brak dużych tekstur wymagających wysokiego bandwidth,
- liczba fragmentów ograniczona przez lokalny obszar efektu.

### Memory / lifecycle

- weather renderer tworzony raz,
- zasoby shaderów/geometry współdzielone,
- brak ciągłego `create/dispose`,
- brak dynamicznego powiększania struktur w game loop.

---

## 26. Poza zakresem

Nie implementować:

- stamina zależnej od temperatury,
- nowych potrzeb NPC,
- weather-specific FSM,
- sezonowego spawn systemu fauna,
- migracji zwierząt,
- rozmnażania sezonowego,
- sezonowych cropów,
- globalnej snow cover,
- ekonomii sezonowej,
- handlu zależnego od sezonu,
- volumetric clouds,
- regionalnego systemu klimatu,
- fizycznej symulacji opadu,
- globalnych weather entities.

---

## 27. Kryteria ukończenia

Plan można uznać za technicznie ukończony, gdy:

1. Sezon wynika z istniejącego `elapsedDays`.
2. Pełny rok przechodzi:
   `spring → summer → autumn → winter → spring`.
3. Pogoda jest deterministyczna.
4. Pogoda nie jest losowana per frame.
5. Pogoda ma różne wagi zależnie od sezonu.
6. Temperatura jest dostępna jako climate state.
7. Deszcz jest widoczny.
8. Śnieg jest widoczny.
9. Mgła wykorzystuje istniejący fog.
10. Weather nie tworzy równoległego systemu oświetlenia.
11. Deszcz i śnieg preferują shader/GPU zamiast CPU particle simulation.
12. Weather renderer nie tworzy obiektów per kropla/płatek.
13. Time-skip poprawnie aktualizuje klimat.
14. Save/load odtwarza ten sam klimat.
15. Nie powstał osobny system AI dla pogody.
16. Testy jednostkowe przechodzą.
17. Browser verification potwierdza wizualnie efekty.
18. Benchmark potwierdza akceptowalny CPU/GPU cost.

---

## 28. Docelowy przepływ

```text
World Time
    │
    ├── Day / Night
    │
    └── elapsedDays
           │
           └── Climate
                │
                ├── Season
                ├── Weather
                └── Temperature
                     │
                     ├── Rendering
                     │      ├── Sky
                     │      ├── Fog
                     │      ├── Rain shader
                     │      └── Snow shader
                     │
                     ├── NPC decisions   ← później
                     ├── Fauna            ← później
                     ├── Resources        ← później
                     └── Economy          ← później
```

Najważniejsza zasada:

> **Climate dostarcza stan i dane. Istniejące systemy decydują, jak ten stan wpływa na świat.**

Pogoda nie może stać się centralnym managerem symulacji ani kosztowną kolekcją globalnych encji.

---

## 29. Weryfikacja

### Techniczna

```text
npm run typecheck
npm test
npm run build
```

### Browser

Zweryfikować:

- wszystkie 4 sezony,
- rain,
- snow,
- fog,
- cloudy,
- day/night + weather,
- time skip przez zmianę sezonu,
- save/load,
- debug override,
- płynne przejścia.

### Performance

Porównać baseline z:

```text
clear
rain
snow
fog
```

Mierzyć:

- CPU frame time,
- GPU frame time,
- FPS/frame pacing,
- draw calls,
- memory,
- allocations/GC.

**Wizualna poprawność Three.js wymaga browser verification.**

---

> **Zrób git commit i push do main, rebase jeżeli trzeba**