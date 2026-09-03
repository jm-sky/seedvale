# Implementation Notes: Water Types and Drinking

**Reviewed:** 2026-09-03  
**Source:** current `main` codebase + `docs/STATE.md` + `docs/plans/PLANNING.md` + `world-011-water-types-and-drinking.md` + current water/drinking implementations

## 1. Najważniejsza korekta względem planu

Plan jest mały i dobrze pasuje do istniejącej architektury, ale obecny `WaterSource` nie rozróżnia jeszcze rzeki i oceanu pod względem drinkability:

- `src/world/WaterSource.ts::createWaterSource()` zwraca `safe` wyłącznie dla `well`, a **lake, river i ocean są obecnie `unsafe`**.
- `src/app/actions/survivalActions.ts::drinkFromWaterSource()` zawsze najpierw przywraca pragnienie, a `quality === 'unsafe'` wpływa tylko na toast.
- W efekcie ocean można obecnie normalnie wypić — z ostrzeżeniem — zamiast być blokowanym.
- Jeszcze ważniejsze: `fillWaterskin()` **nie przyjmuje `WaterSource`**, więc obecny `[R]` na oceanie może napełnić bukłak zwykłą wodą. To byłby prosty bypass blokady picia.

Dlatego źródło musi być przekazywane również do fill action. Nie próbować rozwiązywać tego samym promptem/UI.

## 2. Wykorzystać istniejący model WaterSource

Nie tworzyć nowego `WaterType`, `WaterSystem` ani player-only detectora.

Rozszerzyć istniejące `WaterQuality` w `src/world/WaterSource.ts` o trzeci stan, np.:

- `safe` — well + river,
- `unsafe` — obecne inland lake zachowujące dotychczasowe ostrzeżenie,
- `undrinkable` — ocean.

`WaterSource.kind` już poprawnie niesie `well | lake | river | ocean`; `resolveWaterBodyShore()` w `src/app/interactables.ts` poprawnie rozróżnia te trzy naturalne typy. Nie zmieniać tego detektora ani hydrologii.

Najprostsza klasyfikacja pozostaje centralnie w `createWaterSource()`. To jest właściwe miejsce, bo wszystkie consumer paths dostają ten sam kontrakt.

Nie dodawać jakości do `LiquidContainerItemInstance`. Obecny model kontenera przechowuje tylko `water | milk`, a plan wyraźnie nie wprowadza pełnego systemu jakości wody. Zachować więc dotychczasową semantykę `unsafe` przy bezpośrednim piciu. **Ocean musi być niefillable**, bo jego słonej wody nie da się obecnie odróżnić później w zwykłym `water` w kontenerze.

## 3. Drink + fill muszą mieć jeden source-aware boundary

W `src/app/actions/survivalActions.ts`:

- `drinkFromWaterSource(source)` powinno sprawdzać drinkability **przed** `drinkWaterNeeds()`;
- dla `undrinkable` nie zmieniać pragnienia i pokazać komunikat o słonej/niezdatnej wodzie;
- dla `unsafe` zachować obecne zachowanie i obecny warning;
- dla `safe` zachować obecne „Napito się wody.”.

Zmienić `fillWaterskin()` na source-aware API, np. `fillWaterskin(source)`. Następnie przepuścić konkretny `WaterSource` przez istniejący callback chain:

`src/app/interactables.ts` → `src/app/gameLoop.ts` → `createSurvivalActions()`.

Obecne dwa miejsca w `gameLoop.ts` są łatwe do rozdzielenia:

- `well` → `createWaterSource('well')`,
- `waterEdge` → już posiada `target.source`.

Dla oceanu fill powinien zostać odrzucony przed mutacją Inventory. Dla lake/river/well zachować obecne zachowanie.

## 4. Prompt nie jest źródłem autorytetu

`src/app/interactables.ts` tworzy synthetic `waterEdge` co klatkę i już poprawnie korzysta z `createWaterSource(waterBody.kind)`.

Można zmienić prompt dla oceanu na jawnie informujący o słonej wodzie, ale action musi ponownie zweryfikować `source`. Nie polegać na tym, że skoro prompt nie pokazuje `[E]`, handler nie zostanie wywołany.

Dla rzeki pozostawić normalny prompt. To automatycznie usuwa obecny warning po zmianie klasyfikacji `river → safe`.

Przy trzymanej wędce istniejący `FISHING_PROMPT` powinien nadal wygrywać z promptem picia. Nie mieszać drinkability z fishing availability — ocean/river fishing ma pozostać bez regresji.

## 5. Istniejące systemy, których nie ruszać

- `src/terrain/waterBodies.ts` — ocean/lake classification i `oceanMixAt()`; nie jest to klasyfikacja jakości wody.
- `src/terrain/riverNetwork.ts` / `ChunkManager.riverShoreDistance()` / `riverShorePoint()` — poprawny runtime detector rzeki; nie zmieniać geometrii ani channel carving.
- `src/app/interactables.ts::resolveWaterBodyShore()` — jedyne miejsce składania lake/river/ocean shoreline candidate; wykorzystać bez tworzenia drugiego detektora.
- `src/world/WaterSource.ts` — wspólny kontrakt źródła.
- `src/app/actions/survivalActions.ts` — właściwa granica mutacji `PlayerNeeds` i `Inventory`.
- `src/items/liquidContainer.ts` / `src/items/itemInstances.ts` — istniejący model częściowo napełnianych bukłaków/bucketów; bez rozbudowy jakości.
- `src/app/gameLoop.ts` — tylko transport source do action, bez własnej logiki klasyfikacji.

Plan 122 pozostaje właściwą zależnością: dostarczył wspólny `WaterSource` oraz rozdzielenie naturalnego źródła od player/NPC storage. Nie trzeba wracać do starego modelu lake-only.

## 6. Testy i pułapki

Najważniejsze regresje do zabezpieczenia:

- `createWaterSource('well')` → safe;
- `createWaterSource('river')` → safe;
- `createWaterSource('lake')` → unsafe;
- `createWaterSource('ocean')` → undrinkable;
- unsafe drink nadal zwiększa thirst i pokazuje warning;
- safe river drink zwiększa thirst bez warningu;
- ocean drink **nie** zwiększa thirst;
- ocean fill **nie** zmienia Inventory;
- river/lake/well fill nadal działa;
- fishing prompt/action dla river/ocean pozostaje niezależny.

Najlepsze miejsce na test klasyfikacji to nowy `src/world/WaterSource.test.ts` (obecnie go nie ma). Logikę action można pokryć testem na `survivalActions`, jeśli istniejący harness zostanie wykorzystany; nie tworzyć rozbudowanego frameworka testowego tylko dla tego fixa.

Nie dodawać chorób, damage ani probabilistycznych konsekwencji dla `unsafe` — obecny warning jest świadomie jedyną konsekwencją w tym zakresie.

## 7. Zalecana kolejność

1. Zmienić `WaterQuality` + `createWaterSource()`.
2. Zrobić `drinkFromWaterSource()` source-aware z blokadą `undrinkable`.
3. Zrobić `fillWaterskin(source)` source-aware i zablokować ocean.
4. Przepiąć dwa istniejące call sites w `gameLoop.ts`.
5. Dostosować prompt oceanu, jeśli potrzebny jest jawny feedback.
6. Dodać małe testy klasyfikacji i drink/fill.
7. Dopiero potem wykonać browser verification: river drink, ocean rejection, filling, fishing.

**Kluczowa decyzja:** nie zmieniać sposobu wykrywania wody. Fix dotyczy wyłącznie semantyki istniejącego `WaterSource` i wymuszenia, aby zarówno drink, jak i fill korzystały z tego samego, rzeczywistego źródła.