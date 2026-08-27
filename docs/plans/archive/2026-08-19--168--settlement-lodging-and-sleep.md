# Plan: Settlement Lodging and Sleep

**Created:** 2026-08-19
**Status:** `verification needed` 🔍 — implemented + `tsc`/lint/build/test 2026-08-23; browser/gameplay verification pending
**Priority:** 🔴 high · **Effort:** L
**Depends on:** ~~165~~
**Domain:** `items-player`
**Tags:** `settlements-npcs`

## Cel

Przebudować nocowanie gracza w osadzie tak, aby sen był wykonywany w rzeczywistym miejscu świata, a wybór noclegu wynikał z dostępnych możliwości.

Gracz nie teleportuje się do snu. Wysokopoziomowa akcja „Nocuj w mieście” wybiera najlepszą dostępną opcję, prowadzi postać do miejsca i dopiero po dotarciu uruchamia istniejący mechanizm snu.

Plan nie tworzy nowego systemu regeneracji. Wykorzystuje istniejący Rest/Sleep oraz mechanizmy czasu z planu 165.

## Zasady wyboru noclegu

Preferowana kolejność:

1. własne / dostępne łóżko o wysokiej jakości;
2. nocleg u przyjaciela;
3. płatny nocleg po potwierdzeniu kosztu;
4. stóg siana jako awaryjna opcja o niskiej jakości.

Dokładna kolejność i kryteria wyboru powinny być zapisane w jednym resolverze, a nie rozproszone po UI i movement.

## Kontrakt miejsca noclegu

Wprowadzić wspólny opis miejsca noclegu, zawierający co najmniej:

- stabilny `id`;
- typ miejsca;
- pozycję docelową;
- punkt podejścia / interaction point;
- kierunek, w którym postać ma stanąć;
- jakość snu;
- właściciela / gospodarstwo, jeżeli dotyczy;
- cenę, jeżeli dotyczy;
- dostępność.

Kontrakt powinien być niezależny od konkretnego UI.

Nie tworzyć osobnego systemu interakcji tylko dla noclegu. Wykorzystać istniejące miejsca, landmarki, interaction points i movement.

## Źródła noclegu

### Łóżko

Łóżko zapewnia wysokiej jakości sen.

W tym planie zdefiniować wymagany kontrakt dla łóżka, ale fizyczne wyposażenie domów zostawić planowi 169.

### Przyjaciel

Jeżeli gracz ma odpowiednią relację z NPC i NPC posiada dostępne miejsce noclegowe:

- nocleg jest dostępny;
- resolver wskazuje konkretny dom / łóżko;
- nie jest pobierana opłata.

Nie tworzyć specjalnego „friend sleep system”. Wykorzystać istniejące relacje i ownership/household.

### Płatny nocleg

Jeżeli dostępne jest miejsce wymagające zapłaty:

1. resolver wybiera ofertę;
2. UI pokazuje miejsce i cenę;
3. gracz potwierdza;
4. pieniądze są sprawdzane i pobierane;
5. postać otrzymuje cel ruchu;
6. po dotarciu uruchamiany jest sen.

Nie pobierać pieniędzy przed potwierdzeniem ani ponownie po rozpoczęciu ruchu.

Jeżeli postać nie dotrze do miejsca, transakcja nie może pozostać w nieokreślonym stanie.

### Stóg siana

Stóg siana jest awaryjnym miejscem noclegowym.

Zapewnia gorszą jakość snu, ale pozwala odpocząć bez pieniędzy i relacji.

Nie powinien być teleportem ani specjalnym rodzajem snu.

## „Nocuj w mieście”

Dodać akcję wysokiego poziomu `Nocuj w mieście`.

Jej odpowiedzialność:

1. znaleźć dostępne miejsca;
2. ocenić je;
3. wybrać najlepsze;
4. jeżeli wymagana jest płatność — poprosić o potwierdzenie;
5. ustawić cel ruchu;
6. po dotarciu aktywować sen.

Akcja nie zna szczegółów implementacji poszczególnych typów miejsc.

Nie teleportować gracza i nie uruchamiać snu zanim postać nie znajdzie się przy wybranym miejscu.

## Sleep interaction

Sen powinien być uruchamiany przez rzeczywiste miejsce.

Po dotarciu do interaction point:

- sprawdzić, czy miejsce nadal jest dostępne;
- rozpocząć istniejący mechanizm Sleep;
- zastosować jakość wybranego miejsca;
- zakończyć akcję po zakończeniu snu.

Jeżeli miejsce stało się niedostępne podczas ruchu, nie uruchamiać snu i poprawnie zakończyć / ponowić wybór.

## Jakość snu

Nie tworzyć równoległego systemu regeneracji.

Istniejący Rest/Sleep pozostaje właścicielem regeneracji Vigor/Stamina.

Miejsce noclegu dostarcza parametr jakości, który istniejący mechanizm może wykorzystać.

Minimalne poziomy:

- `high` — łóżko;
- `normal` — płatny nocleg / przyjaciel, zależnie od miejsca;
- `low` — siano.

Dokładne wartości regeneracji dobrać na podstawie istniejącego systemu z planu 165.

## UI

Akcja „Nocuj w mieście” powinna jasno pokazywać:

- znaleziony typ noclegu;
- miejsce;
- koszt, jeżeli występuje;
- jakość;
- wymagane potwierdzenie płatności.

Nie implementować osobnego menu hotelowego, jeżeli istniejący system dialogów/interakcji może obsłużyć potwierdzenie.

## Implementacja

1. Przeanalizować istniejące `campRest`, `restCampSequence`, Player Needs i Sleep.
2. Nie dublować istniejącej logiki czasu ani regeneracji.
3. Zdefiniować wspólny kontrakt miejsca noclegu.
4. Zaimplementować resolver dostępnych miejsc.
5. Dodać źródła: łóżko, przyjaciel, płatny nocleg, siano.
6. Zintegrować resolver z istniejącym movement.
7. Dodać potwierdzenie płatnego noclegu.
8. Uruchamiać Sleep dopiero po osiągnięciu interaction point.
9. Obsłużyć zmianę dostępności podczas dojścia.
10. Przygotować kontrakt, który plan 169 wykorzysta do rejestracji łóżek w domach.

## Poza zakresem

- meble i rozmieszczanie modeli;
- budowa wnętrz domów;
- Asset Alignment Browser;
- karczma jako pełny system biznesowy;
- NPC-owy system nocowania innych NPC;
- nowy system regeneracji;
- teleport gracza.

## Weryfikacja

- „Nocuj w mieście” wybiera dostępne miejsce.
- Gracz faktycznie idzie do miejsca.
- Sen nie rozpoczyna się przed dotarciem.
- Płatność wymaga potwierdzenia.
- Pieniądze są pobierane dokładnie raz.
- Przyjaciel pozwala na nocleg bez płatności.
- Siano działa jako fallback.
- Łóżko jest miejscem wysokiej jakości.
- Zmiana dostępności podczas ruchu nie powoduje niepoprawnego snu.
- Istniejący Rest/Sleep i plan 165 pozostają właścicielem regeneracji.
- Testy/build/lint zgodnie z `CLAUDE.md`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
