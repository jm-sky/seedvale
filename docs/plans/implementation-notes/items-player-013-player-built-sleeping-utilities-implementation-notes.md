# Implementation Notes: Player-Built Sleeping Utilities

**Reviewed:** 2026-09-02  
**Plan:** items-player-013-player-built-sleeping-utilities.md  
**Codebase baseline:** main

## Review summary

Plan jest zgodny z architekturą world-owned player objects, ale wymaga jednej ważnej interpretacji: obecny camp-rest już ma blanket jako istniejącą powierzchnię spania. Nie należy budować drugiego systemu snu ani usuwać/migrować blanket tylko po to, aby wprowadzić bedroll.

Najmniejsza bezpieczna implementacja to dwa nowe persistent world-object records/runtime collections, które rozszerzają istniejący campRest, placement i SaveData. Bedroll powinien być traktowany jako dodatkowa fizyczna sleeping surface, a platforma jako modyfikator setupu tylko wtedy, gdy bedroll leży na platformie.

## 1. Istniejący camp-rest — najważniejsza zależność

src/app/campRest.ts jest właściwym ownerem jakości odpoczynku:

- CampRestContext;
- campRestQuality();
- hasTentNear();
- hasWarmFireNear().

src/app/actions/restActions.ts rozwiązuje kontekst jednorazowo przy rozpoczęciu snu, a potem przekazuje jakość do istniejącego restoreNeedsFromSleep().

Nie tworzyć osobnego sleepQuality, BedrollRestSystem ani drugiego recovery path.

### Ważna rozbieżność plan ↔ code

Obecnie CampRestContext.hasBlanket oznacza zarówno posiadanie koca, jak i podstawową powierzchnię spania. startRest() wymaga inventory.has('blanket', 1).

Bedroll nie powinien automatycznie usuwać tego zachowania. Najmniej inwazyjny kierunek:

- rozszerzyć rozstrzyganie camp context o pobliski, aktualnie użyteczny bedroll;
- zachować dotychczasowy blanket jako działającą opcję dla starego flow;
- nie zmieniać restoreNeedsFromSleep();
- platforma powinna być rozpoznawana jako raised bedroll, nie jako niezależne źródło rest quality.

Jeżeli UI nadal wymaga koca dla Rozbij obóz, nie omijać tego warunku przypadkowym dodaniem drugiej ścieżki. Jeśli plan ma pozwolić na spanie wyłącznie na zbudowanym bedrollu bez koca, trzeba zmienić ten konkretny gate w restActions.ts, ale nadal użyć tego samego CampRestContext/rest pipeline.

## 2. World-object ownership

Wzorzec powinien być taki jak:

- src/items/createPlacedTents.ts;
- src/settlement/PlacedFires.ts;
- src/world/createPlacedContainers.ts;
- src/world/createPlayerGardens.ts.

Preferowany podział:

- pure domain: src/world/sleepingUtilities.ts;
- runtime/presentation: src/world/createSleepingUtilities.ts;
- ewentualny sleepingUtilityProp.ts dla meshów.

Nie przechowywać obiektów w PlayerController ani w inventory po ich zbudowaniu.

Nie tworzyć globalnego managera.

Można mieć jeden SleepingUtilities w WorldBundle, ale rekordy bedroll/platform powinny pozostać odrębnymi typami. To zachowuje niezależność obiektów bez dwóch niezależnych lifecycle managerów.

## 3. Minimalne authoritative records

Bedroll:

{ id, x, z, yaw, variant, condition, lastConditionUpdateAtDays }

Platform:

{ id, x, z, yaw, condition, lastConditionUpdateAtDays }

variant powinien być jawny już teraz, np. 'leather', mimo że istnieje tylko jedna wartość.

Nie persistować meshów, Three.js objects, collider/runtime visual state ani wyliczonej bieżącej pogody.

Jeżeli condition ma być 0..100, wszystkie operacje powinny korzystać z jednego clamp/status helpera w module domain.

## 4. Materiały — nie dodawać nowego leather

W aktualnym ItemKind istnieje hide (skóra), ale nie ma osobnego leather.

Dlatego koszt leather bedroll powinien użyć istniejącego hide, a nie wprowadzać nowy materiał tylko dla tego planu.

Do pobierania materiałów użyć:

- src/items/constructionMaterials.ts::MaterialRequirement;
- hasMaterial();
- consumeMaterial();
- CONSTRUCTION_MATERIAL_RADIUS.

To zachowuje możliwość użycia materiału zarówno z inventory, jak i z pobliskich dropped items.

Koszt platformy powinien użyć istniejącego branch, zgodnie z planem. Nie dodawać nowego item kind.

Dokładne liczby kosztu są częścią implementacji/balansu; nie kopiować ich z innych konstrukcji bez uzasadnienia.

## 5. Placement

Bazowy validator to nadal src/items/tentPlacement.ts::evaluateGroundPlacement().

Wspólny placement seam:

- GroundPlacementDefinition;
- evaluatePlacementSite();
- previewGroundPlacement();
- src/app/actions/placementPreviewActions.ts.

Bedroll i platforma powinny dostać własne footprint/separation, ale korzystać z tego samego ground validation.

Nie tworzyć drugiego preview systemu.

Placement powinien:

1. rozwiązać aim;
2. sprawdzić teren/blokery/peer objects;
3. po sukcesie busy channel zużyć materiały;
4. dopiero wtedy utworzyć authoritative record.

Tak jak przy namiocie, materiał nie może zostać utracony po anulowaniu busy channel.

## 6. Relacja bedroll ↔ platform

Nie tworzyć trwałego platformId w bedrollu, jeśli nie jest to konieczne.

Platforma i bedroll mają być niezależnymi world objects, zgodnie z planem. Ich połączenie można wyliczać przestrzennie:

- najbliższa platforma w małym, stałym promieniu od bedrolla;
- deterministic tie-break po id, jeśli potrzebny;
- brak globalnej sieci/graph managera.

Camp-rest powinien pytać o setup, np. hasRaisedBedroll, a nie o samą platformę. Samotna platforma nie może dawać jakości snu.

To również zachowuje wymaganie: spakowanie namiotu nie może usuwać ani resetować bedrolla/platformy.

## 7. Tent interaction / shelter

Aktualny namiot to src/items/createPlacedTents.ts + src/items/tentProp.ts.

Namiot ma tylko id/x/z/yaw; nie ma osobnego shelter-volume systemu.

Dlatego dla sleeping utilities użyć istniejącego modelu proximity, analogicznego do campRest.ts::hasTentNear(). Nie wprowadzać nowego collidera/shelter volume tylko na potrzeby degradacji.

Praktyczna interpretacja:

- utility w promieniu namiotu = sheltered;
- poza nim = exposed;
- spakowanie namiotu automatycznie zmienia przyszłe exposure, ale nie usuwa utility.

Nie wiązać bedrolla z konkretnym tent id.

## 8. Degradation — reuse istniejącego lazy pattern

Najlepszym aktualnym wzorcem jest nie PlacedFires.update(dt), lecz src/world/playerGarden.ts:

- rekord ma anchor czasu;
- degradacja jest czystą funkcją;
- stan jest rozwiązywany na żądanie;
- nodes()/interaction/persistence mogą wymusić resolve;
- brak per-frame timerów.

Dla sleeping utilities zastosować ten sam model.

Dla rain wykorzystać istniejące src/world/weather.ts::computeRainExposureDays(). Nie duplikować jego cyklu/hashowania.

Snow nie ma obecnie analogicznego helpera. Jeżeli potrzebny jest snow exposure, zrobić mały lokalny helper w sleepingUtilities.ts, oparty bezpośrednio o istniejące computeWeather() + WEATHER_CYCLE_DAYS. Nie tworzyć ogólnego EnvironmentalDecay frameworku.

### Shelter modifier

Degradację licz jako exposure, nie jako render-frame timer:

- rain exposure × rate;
- snow exposure × rate;
- sheltered exposure × mniejszy/zerowy współczynnik.

Dokładne rates powinny być stałymi w module domain.

Nie zakładać, że computeSurfaceWeather() nadaje się do tego celu — jest globalnym efektem wizualnym z bounded lookback, nie historią exposure konkretnego obiektu.

## 9. Condition resolution

Preferowany seam:

resolveSleepingUtilityCondition(record, seed, nowDays, shelterLookup)

ale sam domain module nie powinien znać WorldBundle ani Three.js.

Runtime collection może:

1. znaleźć record;
2. wyliczyć aktualny condition;
3. przy mutacji zapisać nowy condition + lastConditionUpdateAtDays = nowDays.

Dla sleep-quality odczyt powinien zawsze używać aktualnego condition, nie wartości zapisanej przy ostatnim interaction.

Jeśli condition osiąga 0, nie usuwać automatycznie obiektu bez wyraźnej decyzji planu. Plan mówi o deterioration, nie o lifecycle removal. V1 powinno raczej clampować condition do 0 i pozostawić obiekt do dalszej obsługi/rozbudowy.

## 10. Weather + save/load

Weather jest deterministyczny z (seed, elapsedDays). Nie zapisywać weather state.

Persistować tylko anchor + condition:

- condition;
- lastConditionUpdateAtDays.

Przy load/spawn można od razu rozwiązać condition do aktualnego elapsedDays, tak jak createPlayerGardens() rozwiązuje stan obiektu przed spawnem.

Save path pozostaje explicit:

- src/persistence/saveData.ts;
- src/app/saveState.ts;
- src/app/createApp.ts;
- src/app/worldBundle.ts.

Nie rozszerzać SaveData o generic player-object registry.

Stare save'y muszą działać bez sleeping-utility fields — nowy field powinien mieć bezpieczny default pustej tablicy.

## 11. WorldBundle lifecycle

Obecny WorldBundle już ma typed fields dla placedTents, placedFires, playerWells, playerGardens, standingTorches, palisades itd.

Sleeping utilities powinny wejść w dokładnie ten lifecycle:

- field w WorldBundle;
- initial records w buildWorldSystems();
- restore z SaveData;
- snapshot nodes() przed rebuildWorldBundle();
- dispose;
- odtworzenie w nowym bundle.

Szczególnie ważne: rebuildWorldBundle() ma zasadę same-seed rebuild zachowuje player-positioned objects. Sleeping utilities muszą być snapshotowane przed dispose, tak jak tents/gardens/torches/palisades.

Nie tworzyć zewnętrznego singletonu, który omija ten lifecycle.

## 12. Camp-rest integration — setup, nie osobny sleep system

restActions.ts::resolveCampContext() jest właściwym integration point.

Rozszerzenie powinno rozstrzygać:

- istniejący blanket;
- nearby bedroll;
- tent;
- warm fire;
- raised bedroll/platform state.

Jakość powinna nadal kończyć w:

campRestQuality(context, survival) → restoreNeedsFromSleep().

Nie przenosić recovery do sleeping utility runtime.

Platforma powinna modyfikować jakość tylko przez kontekst. Przykładowo context może mieć hasRaisedBedroll albo podobny bool, ale nie powinien przechowywać mesh/record references.

Exact quality values należy dobrać względem istniejącego modelu:

- obecny baseline jest jawnie w campRest.ts;
- pełny camp (tent + blanket + fire) jest już jakość 1;
- nie wolno stworzyć nowego poziomu >1 ani popsuć istniejącego full-camp behaviour.

Najważniejsza pułapka: platforma nie może sama podnosić jakości do poziomu lodging/tent.

## 13. Visual/runtime

Nie ma potrzeby tworzyć osobnego gameplay managera dla meshów.

Wzorzec runtime:

record → prop → scene.add()

z placeOnGround() z settlement/props.ts.

Bedroll powinien mieć jawne variant w recordzie, ale v1 może mieć jeden visual.

Platforma powinna być prostym propem bez dodatkowej symulacji.

Nie dodawać collidera automatycznie, chyba że istniejący placement/collision model pokaże konkretną potrzebę. Sam plan nie wymaga fizycznej kolizji.

## 14. Interactions / rest entry point

Jeżeli bedroll ma być bezpośrednio używany przez [E], dodać nowy Interactable kind w src/app/interactables.ts i skierować akcję do istniejącego RestActions, zamiast implementować drugi sleep path.

Jeżeli UX planu ma korzystać wyłącznie z Quick Actions, nie dodawać interakcji tylko dlatego, że obiekt jest fizyczny. W obu wariantach camp-rest pozostaje jedynym ownerem sleep outcome.

Warto rozstrzygnąć to przed kodowaniem, bo obecny startTentRest(id) jest specjalnym path'em: ustawia gracza na tentRestPose(), a potem uruchamia restCamp.start().

Bedroll/platform powinny dostać analogiczny, mały target-resolution seam, a nie kopiować całej funkcji startTentRest().

## 15. Save schema

Obecny SaveData jest explicit v1. Wzorce:

- SavePlacedTent;
- SavePlacedFire;
- SavePlacedContainer;
- SavePlayerGarden;
- SaveStandingTorch;
- SavePalisade.

Dodać dedykowane typy dla sleeping utilities i validator fields w saveData.ts.

saveState.ts::buildSaveData() powinno serializować bundle.sleepingUtilities.nodes().

createApp.ts powinno przekazać saved records do world creation.

Nie zwiększać schema version tylko przez dodanie optional/new fieldów, jeśli aktualny migration/validation contract pozwala na backward-compatible default — najpierw sprawdzić istniejący pattern nowych fields.

## 16. Concrete implementation order

1. Domain records/constants: material costs, footprint/separation, condition rates, resolveCondition().
2. Runtime props + createSleepingUtilities().
3. WorldBundle create/rebuild/dispose lifecycle.
4. SaveData + saveState + load wiring.
5. Shared placement preview/actions for bedroll/platform.
6. Camp-rest context integration.
7. Optional direct [E] rest interaction, tylko jeśli UX wymaga tego w planie.
8. Weather/degradation verification and balance.

## 17. Main pitfalls

- Nie dodawać leather ItemKind — istnieje hide jako skóra.
- Nie tworzyć drugiego sleep/recovery systemu — campRest.ts + restActions.ts są authoritative.
- Nie robić per-frame degradation — wzorzec playerGarden.ts jest już dokładnie tym, czego potrzeba.
- Nie wiązać utility z tent id — shelter jest derived spatially.
- Nie używać computeSurfaceWeather() jako exposure history.
- Nie tworzyć globalnego environmental-durability frameworku.
- Nie traktować platformy jako samodzielnego lodging.
- Nie umieszczać world objects w PlayerController/inventory po placement.
- Nie resetować ani usuwać bedroll/platform przy pack tent.
- Nie ufać cached placement preview przy finalnym placement — finalna walidacja musi być świeża.
- Nie rozszerzać VillageFire ani tent lifecycle tylko po to, aby obsłużyć sleeping utilities.

## 18. Files / symbols to inspect first

- src/app/campRest.ts
- src/app/actions/restActions.ts
- src/app/actions/placementActions.ts
- src/app/actions/placementPreviewActions.ts
- src/app/interactables.ts
- src/items/tentPlacement.ts
- src/items/constructionMaterials.ts
- src/items/createPlacedTents.ts
- src/items/tentProp.ts
- src/world/playerGarden.ts
- src/world/createPlayerGardens.ts
- src/world/weather.ts
- src/app/worldBundle.ts
- src/app/saveState.ts
- src/persistence/saveData.ts
- src/app/createApp.ts

## Review conclusion

Plan można implementować bez zmian w ogólnej architekturze. Najważniejsza decyzja przed kodowaniem to zachowanie istniejącego blanket flow: bedroll powinien zostać dodany jako world-owned sleeping surface, a nie przez tworzenie nowego modelu potrzeb/snu. Degradację należy zaprojektować na wzór lazy PlayerGardenRecord, z istniejącym weather model jako źródłem deterministycznego exposure.

**Zrób git commit i push do main, rebase jeżeli trzeba**
