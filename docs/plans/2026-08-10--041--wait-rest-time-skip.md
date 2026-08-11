# Plan: akcje "Czekaj" (1/3/6h) i "Odpoczynek" (obóz/miasto, 8h) w Quick Actions

**Status:** `done` — zaimplementowane, `npx tsc --noEmit`/`npm run lint`/`npm run build`/`npm run test` czyste i zweryfikowane w przeglądarce.
**Created:** 2026-08-10

## Skąd to się wzięło

Prośba użytkownika: możliwość poczekania 1/3/6h (z widocznie przyspieszonym czasem) oraz odpoczynku 8h (rozbicie obozu gdziekolwiek lub odpoczynek w mieście), dostępne z popupu Quick Actions (`docs/plans/... quick actions` — dodany w poprzedniej turze obok "Zbuduj ognisko").

## Kluczowa decyzja projektowa

Gracz **nie ma dziś żadnego zasobu** (HP/stamina/głód) — potwierdzone przeszukaniem kodu (`PlayerController.ts` to czysta pozycja/kamera/animacja; `HealthState`/`Needs` używane wyłącznie przez NPC/faunę; zwierzęta nigdy nie atakują gracza). Potwierdzone z userem: **Rest to czysty skok czasu w v1, bez nowego stanu gracza** — różnica obóz/miasto to tylko wymóg lokalizacji + flavor text, nie mechanika. Rozszerzenie o player-stat system (i realny efekt odpoczynku) to naturalna kolejna iteracja, osobny plan.

## Implementacja

- `src/world/timeSkip.ts` (nowy) — `createTimeSkip(dayNight)`: `start(hours, {fade, label})` tymczasowo podbija `dayNight.timeMultiplier` na `hours × 1` realną sekundę (`SECONDS_PER_SKIPPED_HOUR = 1`), `tick(dt)` woływane co klatkę niezależnie od stanu modali/pauzy, przywraca oryginalny mnożnik po zakończeniu. **Celowo nie skaluje `dt` niczego innego** (ruch NPC/fauny przy dt×20 poleciałby w kosmos) — świat symuluje się dalej w realnym tempie pod spodem, tylko niebo/zegar (`tickDayNight` w normalnym per-klatkowym flow) lecą szybciej dzięki podbitemu mnożnikowi. Formuła mnożnika: `dayLengthSec / (24 × SECONDS_PER_SKIPPED_HOUR)` — przy domyślnym `dayLengthSec=480` wychodzi `20` (mieści się w zakresie istniejącego slidera debug GUI 0-20), stały niezależnie od wybranej liczby godzin.
- `src/ui/createTimeSkipOverlay.ts` (nowy) — warstwa wizualna: label ("Czekasz... (3h)" / "Rozbijasz obóz...") zawsze widoczny gdy aktywny; opcjonalny czarny fade (`fade:true`, dla Rest) z przejściem CSS + `transitionend` cleanup (wzorem `createLoadingScreen.ts`, ale osobny komponent — inny czas życia, wielokrotnie pokazywany/chowany w trakcie gry).
- `src/ui/createQuickActions.ts` — `QuickActionsHandlers` += `onWait?(hours)`, `onRest?(variant): 'ok'|'too-far'`. Nowe sekcje w popupie: nagłówek "Czekaj" + 3 przyciski (1h/3h/6h, w rzędzie), nagłówek "Odpoczynek" + "Rozbij obóz (8h)" / "Odpocznij w mieście (8h)" (ten drugi pokazuje status "Musisz być bliżej wioski" i **nie** zamyka popupu gdy `onRest` zwróci `'too-far'`; wszystkie pozostałe akcje zamykają popup od razu, w przeciwieństwie do "Zbuduj ognisko" które zostaje otwarte). Popup dostał `max-height`/`overflow-y:auto`/`enableTouchScroll` (nowe sekcje mogą przekroczyć wysokość ekranu na niskich viewportach).
- `src/app/createApp.ts`: `REST_IN_TOWN_RADIUS = 40` (pokrywa domyślny promień wioski `ringMax + houseRadius*2 ≈ 39.6`); `timeSkip`/`timeSkipOverlay` utworzone obok `quickActions`; `onRest('town')` sprawdza `settlementsManager.getLoaded().some(s => s.center.distanceTo(player.position) <= REST_IN_TOWN_RADIUS)`. W `tick()`: `timeSkip.tick(dt)` na samym początku (przed `menuPaused`/gatingiem — **świat ma dalej tykać** podczas skoku), zeruje ciągłe flagi ruchu (`keyboard.state.forward/backward/left/right/sprint`) gdy aktywny; nowy branch `else if (timeSkip.isActive())` w istniejącym łańcuchu interact-handlingu (konsumuje `[E]`/`[L]`/`[G]`, blokuje highlight) — **nie** dołączony do `anyModalOpen`/gated world-update bloku, żeby `tickDayNight`/NPC/fauna/spawnery dalej działały normalnie. `touchControls?.setInputEnabled` rozszerzony o `&& !timeSkip.isActive()`. Cleanup: `timeSkip.cancel()` + `timeSkipOverlay.dispose()`.

**Aktualizacja (2026-08-10, po feedbacku):** user nie chciał czarnego ekranu na 8s dla Rest — chciał, żeby postać **fizycznie się położyła**. `onRest` woła teraz `fade: false` (identycznie jak Wait — widoczny świat, bez zaciemnienia) + `player.lieDown()` tuż przed `timeSkip.start(...)`; `player.standUp()` wołane w `tick()` przy `skip.justFinished`. `src/player/PlayerController.ts` += `lieDown()`/`standUp()` — przechyla `modelRoot` (osobny od `mesh`-wrappera, żeby etykieta z imieniem nie przewracała się razem z ciałem) o `-90°` wokół lokalnego X (ta sama sztuczka co `fauna/AnimalAgent.ts::collapse()` dla padłych zwierząt — brak dedykowanej animacji "spania" w riggu Quaternius), + mały offset Y żeby leżące ciało nie wbijało się w teren; `update()` podczas `resting` pomija ruch/synchronizację animacji całkowicie (kamera i mixer nadal aktualizowane). Mechanizm `fade` w `timeSkip`/`createTimeSkipOverlay` zostaje (nieużywany teraz, ale gotowy na przyszłe akcje, które faktycznie chcą zaciemnienia).

## Poza zakresem tej iteracji

- Efekt przywracający stan gracza (HP/stamina/głód) — brak takiego stanu dziś, potwierdzone z userem.
- Mechaniczna różnica obóz vs miasto poza wymogiem lokalizacji (np. atak w nocy) — brak wrogiej-wobec-gracza mechaniki.
- Przerwanie skoku w trakcie — czas trwania krótki (1-8s), nieprzerywalny.
- Syntetyczne "doganianie" NPC needs/fatigue/respawn timerów o pełne przeskoczone godziny — świadomie pominięte (ryzyko przy skalowaniu ruchu), NPC/fauna/spawnery przeżywają tylko realny czas trwania skoku.
- Persystencja `dayNight.timeOfDay` w zapisie — już dziś nie jest zapisywana, bez zmian.
- Duplikat w menu pauzy — tylko Quick Actions (decyzja usera).

## Weryfikacja

- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test` — czyste.
- **Do zrobienia przez użytkownika (`localhost:5577`):** "Czekaj 1h/3h/6h" widocznie przyspiesza niebo/zegar na ~1-6 realnych sekund, brak ruchu gracza w tym czasie, po zakończeniu normalne tempo/kontrola wracają. "Rozbij obóz"/"Odpocznij w mieście" (~8s, zegar +8h) — sprawdzić że postać **kładzie się na ziemi** (widocznie, bez czarnego ekranu) i wstaje po zakończeniu; ocenić czy kąt/wysokość leżenia wygląda naturalnie (`LIE_DOWN_ROTATION_X`/`LIE_DOWN_Y_OFFSET` w `PlayerController.ts` mogą wymagać dostrojenia). "Odpocznij w mieście" pokazuje "Musisz być bliżej wioski" gdy za daleko. NPC/zwierzęta/ogniska nie zachowują się dziwnie (bez teleportacji) podczas/po skoku.

## Powiązane

- `src/world/dayNight.ts`, `src/ui/createQuickActions.ts` (poprzednia sesja), `src/ui/createLoadingScreen.ts` (wzorzec fade)
