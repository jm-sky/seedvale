# Plan: NPC weather reaction & shelter

**Created:** 2026-09-01
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** ~~040~~
**Domain:** `npc`

## Cel

Dodać reakcję NPC na istotnie niekorzystną pogodę poprzez istniejący mechanizm **Pressure → decision → strategy → action**.

NPC powinien w odpowiednich warunkach szukać schronienia, a pierwszą implementacją schronienia będzie jego istniejący `home` Place.

Nie tworzyć osobnego systemu AI pogody ani ogólnego `ShelterSystem`.

## Scope

### 1. Weather jako źródło Pressure

Dodać weather pressure jako osobne źródło pressure, zamiast dodawać `weather` do `NeedId`.

Istniejący model:

```
Needs → need pressures
Weather → weather pressures
                ↓
        pressure arbitration
```

Weather pressure powinien wykorzystywać aktualny `WeatherState`, w szczególności typ/intensity pogody oraz — jeśli potrzebne — temperaturę.

### 2. Pierwsza wersja severity

Pierwsza wersja powinna koncentrować się na rzeczywiście niekorzystnych warunkach:

- rain,
- snow,
- silna intensywność opadów,
- ewentualnie bardzo niska temperatura.

Nie każda pogoda powinna powodować reakcję.

Lekki deszcz może pozostawić NPC przy obecnym działaniu, podczas gdy silne warunki mogą wygenerować wystarczający pressure, aby zmienić decyzję.

Dokładne progi i wartości należy dobrać na podstawie istniejącego modelu pressure podczas implementacji, bez tworzenia nadmiernie rozbudowanego modelu ekspozycji.

### 3. Shelter strategy

Weather pressure powinien prowadzić do generycznej strategii:

```
weather pressure
    ↓
seek shelter
    ↓
resolve available shelter
    ↓
home Place
```

Strategia powinna być rozdzielona od konkretnego typu schronienia.

W tej wersji resolver powinien obsługiwać wyłącznie własny `home`.

Dzięki temu przyszłe typy schronienia (np. budynki publiczne, namioty lub inne miejsca) nie będą wymagały przebudowy weather pressure.

### 4. Movement

NPC powinien korzystać z istniejącego `goTo` / movement / action pipeline.

Nie teleportować NPC i nie tworzyć specjalnego movement code dla shelter.

### 5. Reakcja na aktualne działanie

Silny weather pressure może zmienić decyzję NPC podczas niskopriorytetowej aktywności.

Przykład:

```
NPC chopping wood
       ↓
heavy rain
       ↓
weather pressure wins arbitration
       ↓
seek shelter
       ↓
go home
```

Nie tworzyć osobnego FSM dla reakcji pogodowej.

Jeżeli istniejący mechanizm critical interrupt nadaje się do tego zastosowania, wykorzystać go dla odpowiednio silnych warunków.

### 6. Pobyt w schronieniu

Po dotarciu do domu NPC powinien respektować nadal aktywny weather pressure.

Przy utrzymującej się złej pogodzie:

```
bad weather
 → home
 → shelter
 → remain home
```

Po poprawie warunków decyzja powinna wrócić do normalnego:

```
schedule + needs + pressures
```

Nie dodawać osobnej trwałej `shelter state`, jeśli istniejący lifecycle NPC nie wymaga takiego stanu.

### 7. Schedule

Nie dodawać `shelter` do `ScheduleActivity`.

Schronienie jest reakcją na aktualny world pressure, a nie elementem codziennego harmonogramu.

### 8. Personality

Nie dodawać nowych traitów typu `weatherSensitive` lub `coldResistant`.

Jeżeli istniejący system personality/traits oferuje naturalny extension point, może zostać wykorzystany bez rozszerzania zakresu feature.

### 9. Off-screen simulation

Reakcja musi działać niezależnie od gracza i kamery.

Nie dodawać per-frame weather checks dla każdego NPC.

Weather pressure powinien być oceniany w istniejącym decision cadence NPC.

### 10. JSDoc

Dla ważnych nowych publicznych funkcji i klas dodać JSDoc, gdy jest to potrzebne do późniejszego preflight/discovery. Przy nowych architektonicznych funkcjach warto użyć `@domain npc`.

## Relevant systems / files

Przed implementacją potwierdzić aktualny kod i symbole w szczególności w:

- `src/ai/NpcAgent.ts`
  - decision flow,
  - strategy candidates,
  - critical interrupts,
  - movement/action lifecycle,
  - home Place.
- `src/ai/Needs.ts`
  - `NpcPressure`,
  - istniejący pressure arbitration.
- `src/ai/schedule.ts`
  - istniejący schedule jako kontekst; bez dodawania shelter activity.
- `src/settlement/places.ts`
  - `home` Place.
- istniejący system weather w `src/world/`
  - aktualny `WeatherState` i lifecycle pogody.

Nie zakładać, że dokumentacja lub wcześniejsze plany odpowiadają obecnemu kodowi.

## Verification

### Pressure

- clear/cloudy/fog nie powodują shelter pressure,
- rain generuje pressure zależny od severity,
- snow generuje pressure zależny od severity,
- bardzo niska temperatura może generować pressure,
- weather pressure konkuruje z istniejącymi pressures.

### Decision

- lekka pogoda nie przerywa bez potrzeby ważniejszej aktywności,
- silna pogoda może wygrać z niskopriorytetową aktywnością,
- odpowiednio silna pogoda może wykorzystać istniejący critical interrupt,
- krytyczne potrzeby NPC nadal zachowują właściwy priorytet.

### Shelter

- NPC wybiera własny `home`,
- NPC porusza się do domu przez istniejący movement pipeline,
- NPC nie teleportuje się,
- NPC nie próbuje bez końca wykonać niedostępnego shelter action,
- NPC pozostaje w domu przy utrzymującym się weather pressure,
- po poprawie pogody wraca do normalnego decision flow.

### Simulation / performance

- zachowanie działa bez udziału gracza,
- nie zależy od kamery/render distance,
- nie powstaje per-frame weather processing per NPC,
- nie powstaje globalny `WeatherAI` ani `ShelterSystem`.

## Out of scope

- night campfire gathering,
- social behaviour,
- clothing / insulation,
- `warmth` Need,
- szczegółowa temperatura ciała,
- różne poziomy ochrony budynków,
- namioty i inne shelter types,
- indoor/outdoor simulation,
- ochrona przed deszczem pod drzewami,
- wpływ pogody na produkcję/workplace,
- nowe weather-specific traits,
- persistence weather/shelter state.

## Acceptance criteria

Feature jest ukończony, gdy:

1. NPC rozpoznaje istotnie złą pogodę poprzez istniejący Pressure system.
2. Weather pressure jest osobnym źródłem pressure, a nie nowym Need.
3. Silna pogoda może spowodować wybór generycznej strategii `seek shelter`.
4. Pierwszym resolverem schronienia jest istniejący `home` Place.
5. NPC korzysta z istniejącego movement/action pipeline.
6. Pilniejsze potrzeby nadal mogą wygrać z weather pressure.
7. NPC pozostaje w domu podczas utrzymywania się złych warunków.
8. Po poprawie pogody wraca do normalnego decision flow.
9. Mechanizm działa niezależnie od gracza i kamery.
10. Nie powstaje równoległy `WeatherAI`, `ShelterSystem` ani drugi system movement.

**Zrób git commit i push do main, rebase jeżeli trzeba**
