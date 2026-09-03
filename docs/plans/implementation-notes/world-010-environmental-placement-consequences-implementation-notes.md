# Implementation Notes: Environmental Placement Consequences

**Plan:** world-010-environmental-placement-consequences.md
**Reviewed:** 2026-09-03
**Status:** planned

## 1. Najważniejsza korekta względem planu

Obecny evaluateGroundPlacement() nie sprawdza ogólnej „mokrości” terenu wynikającej z pogody. Warunek water oznacza:

sampleHeight(x, z) <= waterLevel + WATER_MARGIN

gdzie WATER_MARGIN = 0.8 w src/items/tentPlacement.ts.

To jest geometryczna/wodna dostępność miejsca, a nie world/weather.ts → computeSurfaceWeather().wetness.

Nie należy więc po prostu zamienić water → ok. Mogłoby to dopuścić placement w wodzie / przy brzegu, wbrew ograniczeniu zachowania rzeczywistych ograniczeń geometrycznych.

Jeżeli zgłoszony problem dotyczy deszczem mokrej powierzchni, obecny validator nie jest jego źródłem. Najpierw ustalić, czy problem dotyczy waterLevel + WATER_MARGIN, czy oczekiwanej reakcji na SurfaceWeatherState.wetness.

## 2. Istniejący placement contract

src/app/actions/placementActions.ts ma już fundament z world-008:
- GroundPlacementDefinition
- evaluatePlacementSite()
- previewGroundPlacement()
- PlacementPreviewResult

Preview i final placement korzystają z tego samego aim + evaluate, ale finalna akcja rewaliduje miejsce przy confirm/completion. Nie tworzyć drugiego placement systemu.

## 3. Wspólna walidacja jest szeroko używana

src/items/tentPlacement.ts zawiera GroundPlacementReason, GroundPlacementInput, evaluateGroundPlacement() i WATER_MARGIN.

evaluateGroundPlacement() jest współdzielone przez placement m.in. namiotu, pułapki, studni, skrzyni, grządki, pochodni, palisady, bedroll i platformy.

Zmiana semantyki water ma więc efekt globalny. Szczegółowe reason-y są nadal mapowane lokalnie przez poszczególne obiekty i nie należy ich przenosić do wspólnego systemu.

## 4. Preview vs consequence

src/app/actions/placementPreviewActions.ts odpowiada tylko za prezentację i dispatch. resolvePreview() pobiera read-only wynik, a confirm wywołuje prawdziwą akcję.

Jeżeli środowisko wpływa tylko na jakość/dalsze działanie obiektu, nie powinno zmieniać PlacementPreviewResult.valid. Czerwony ghost oznacza obecnie fizycznie niedozwolony placement, nie gorsze warunki.

Nie cache'ować environmental state jako podstawy finalnego placementu.

## 5. Istniejąca pogoda

src/world/weather.ts jest deterministyczne: computeWeather(seed, elapsedDays, season) daje WeatherState, a computeSurfaceWeather(seed, elapsedDays) daje globalne wetness/snowAmount.

Nie tworzyć per-object weather tickera.

Obecny wzorzec weather-dependent state jest lazy: PlayerGardenRecord → resolveGardenHydration() oraz BedrollRecord/PlatformRecord → resolveSleepingUtilityCondition(). Oba wykorzystują anchor czasu i bounded lookback zamiast aktualizacji per frame.

## 6. Visual wetness nie jest obecnie gameplayowym environmental state

computeSurfaceWeather().wetness jest opisane jako globalny/shared stan prezentacyjny powierzchni. Nie jest to soil simulation ani per-object state.

Nie tworzyć automatycznie ogólnego EnvironmentalState tylko po to, aby rozwiązać jeden przypadek. Jeśli modifier będzie potrzebny dla kilku rzeczywistych konsumentów, powinien być małym pure/read-only mechanizmem.

## 7. Właściwy podział odpowiedzialności

Preferować:

placement suitability → evaluateGroundPlacement() / object-specific wrapper
environmental condition → mały pure resolver/modifier, jeśli rzeczywiście potrzebny
object consequence → właściciel konkretnego world object

Nie umieszczać np. logiki trwałości ogniska w tentPlacement.ts.

## 8. Istniejące wzorce konsekwencji

Player garden w src/world/playerGarden.ts ma hydration, lastHydrationUpdateAtDays i droughtStressDays oraz resolveGardenHydration().

Sleeping utilities w src/world/sleepingUtilities.ts mają condition, lastConditionUpdateAtDays, rain/snow exposure i resolveSleepingUtilityCondition().

To są dobre wzorce dla deterministycznej, lazy degradacji. Nie kopiować ich jednak mechanicznie bez potwierdzenia, że dany obiekt faktycznie potrzebuje persisted condition/time anchor.

## 9. Nie zmieniać water restriction w ciemno

Jeśli decyzja będzie taka, że część obecnego water restriction ma zniknąć, najpierw rozdzielić:
- faktyczne wejście w wodę / geometryczną niedostępność,
- shoreline clearance,
- mokry, ale fizycznie poprawny teren.

WATER_MARGIN jest również współdzielone przez terrain preparation jako shoreline clearance. Nie zmieniać tej stałej tylko dla player placement.

## 10. Atomicity

Obecne placement actions mają właściwy wzorzec: walidacja przed busy channel, koszt dopiero przy completion i brak zużycia materiałów przy odrzuconym placement.

Environmental modifier nie może wprowadzić częściowego zużycia materiałów ani mutować świata podczas preview.

## 11. Zakres powinien pozostać mały

Po recon nie ma podstaw do budowania:
- EnvironmentalEffectRegistry,
- WeatherEffectsManager,
- per-object weather tick,
- soil moisture simulation,
- nowego PlayerConstructionManager.

Najpierw naprawić konkretną granicę pomiędzy hard placement restriction a environmental consequence. Wspólny modifier wyciągać dopiero, gdy istnieją co najmniej dwa realne konsumenty.

## 12. Sugerowana kolejność implementacji

1. Potwierdzić, który aktualny warunek powoduje obserwowaną odmowę.
2. Rozdzielić geometryczne water od faktycznego environmental wetness, jeśli oba są mieszane w wymaganiu.
3. Zachować evaluateGroundPlacement() jako źródło hard physical restrictions.
4. Pozostawić PlacementPreviewResult.valid semantycznie jako „fizycznie można postawić”.
5. Jeśli potrzebny jest modifier, wprowadzić go jako pure/read-only input do konkretnego object lifecycle.
6. Final placement nadal rewaliduje site; preview nie jest źródłem prawdy.
7. Dopiero potem dodać obserwowalną konsekwencję, jeśli istnieje już odpowiedni lifecycle.

## 13. Discrepancy względem planu

Plan zakłada problem „mokrego terenu” i sugeruje usunięcie twardej odmowy. Aktualny codebase ma już placement contract z world-008 i weather-aware object states, ale nie ma jednego ogólnego gameplayowego environmental modifier mechanism.

Co ważniejsze: obecny water rejection nie jest równoważny z weather wetness. Implementacja nie powinna udawać, że jest inaczej.

Jeżeli problem dotyczy wyłącznie wody/shoreline, plan należy zawęzić do rozdzielenia geometrycznego restriction od łagodniejszego environmental condition. Jeżeli chodzi o rain wetness, zakres planu wymaga korekty, bo obecny validator nie odrzuca terenu tylko dlatego, że padał deszcz.

## 14. Dokumentacja

Jeżeli implementacja zmieni semantykę GroundPlacementReason, WATER_MARGIN albo computeSurfaceWeather().wetness, zaktualizować odpowiednią dokumentację stanu. Szczegóły implementacyjne pozostawić w implementation notes.