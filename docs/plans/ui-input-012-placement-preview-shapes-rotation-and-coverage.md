# Plan: Placement preview shapes, rotation and coverage

**Created:** 2026-09-07
**Status:** `planned` 📋
**Type:** polish
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** `ui-input`
**Subdomains:** `input` `feedback`
**Tags:** `placement` `preview` `rotation`
**Roadmap:** -

## Problem

Wspólny system placement preview nie przekazuje graczowi wystarczającej informacji o rzeczywistym kształcie i orientacji stawianego obiektu.

Obecnie:

- studnia omija wspólny placement-preview lifecycle i jest stawiana bez preview,
- wspólny ghost przedstawia placement jako okrągły footprint niezależnie od kształtu obiektu,
- `yaw` jest częścią placement result, ale ghost go wizualnie nie wykorzystuje,
- obiekty kierunkowe, przede wszystkim palisada, nie pokazują w preview swojej orientacji,
- orientacja palisady wynika bezpośrednio z kierunku patrzenia gracza,
- gracz nie ma jawnego sterowania obrotem obiektu podczas placementu,
- na mobile brakuje ekwiwalentu sterowania rotacją.

W efekcie trudno świadomie ustawić płot, palisadę i inne wydłużone lub asymetryczne obiekty.

## Goal

Rozszerzyć istniejący wspólny placement-preview system tak, aby:

1. wszystkie istotne obiekty budowane przez gracza korzystały z tego samego preview lifecycle,
2. preview przedstawiał użyteczny footprint odpowiadający rzeczywistemu kształtowi obiektu,
3. preview respektował orientację obiektu,
4. placeables wspierające rotację można było obracać jawnie w krokach co 45°,
5. obrót działał zarówno z klawiatury, jak i przez UI mobile,
6. preview i finalne placement validation nadal korzystały z tych samych istniejących mechanizmów domenowych.

Nie tworzyć osobnych systemów preview dla studni, palisady ani kolejnych typów budowli.

## Scope

### 1. Well placement preview

Włączyć studnię do istniejącego `PlacementPreviewActions`.

Studnia powinna:

- wejść w preview mode przed rozpoczęciem budowy,
- korzystać z tych samych reguł ground placement co obecne `placeWellAtAim`,
- pokazywać valid/invalid feedback przed potwierdzeniem,
- dopiero po confirm uruchamiać istniejący placement/construction flow.

Preview pozostaje read-only i nie może tworzyć obiektu ani rozpoczynać budowy.

### 2. Placement preview footprint

Rozszerzyć wspólny kontrakt preview tak, aby renderer nie był ograniczony do `footprintRadius`.

Minimalnie wspierać:

- `circle`,
- `box` / prostokątny footprint.

Opis footprintu powinien należeć do danych preview, a renderer ma jedynie go wizualizować.

Nie duplikować reguł kolizji ani suitability w rendererze.

Dla wszystkich istniejących placeables objętych wspólnym preview ustalić jawnie odpowiedni shape i wymiary. Implementation notes powinny zawierać tabelę `placeable → footprint → dimensions → rotation yes/no`, aby implementacja nie pozostawiała coverage do przypadkowej decyzji podczas kodowania.

### 3. Directional object previews

Dla obiektów, których orientacja jest istotna, preview powinien pokazywać ich faktyczny kierunek.

W pierwszej kolejności obejmuje to palisadę, namiot, podest i posłanie, a recon implementation notes powinien wskazać wszystkie pozostałe istniejące placeables, dla których shape lub orientation ma znaczenie. Implementacja powinna objąć wszystkie takie obecne przypadki, zamiast ograniczać rozwiązanie do palisady.

Palisada powinna wizualnie odpowiadać długości segmentu, zamiast być reprezentowana małym kołem clearance radius.

Nie jest wymagane renderowanie pełnego modelu GLB. Prostą geometrię footprint/ghost należy preferować, jeśli wystarczająco jasno pokazuje zajmowane miejsce i kierunek.

### 4. Shared placement rotation state

Aktywny placement mode powinien posiadać własny stan rotacji.

Po rozpoczęciu placementu wspierającego rotation:

- aktualny kierunek gracza/kamery stanowi bazę orientacji,
- bazowy yaw zostaje zaokrąglony do najbliższego kroku 45°, dzięki czemu placement korzysta z ośmiu wspólnych orientacji,
- bazowa orientacja jest ustalana raz przy wejściu w placement mode,
- późniejszy obrót kamery lub postaci nie zmienia samoczynnie orientacji stawianego obiektu,
- orientacja zmienia się wyłącznie przez jawny input rotacji.

Implementacja może reprezentować wynikowy yaw np. jako `placementStartYaw + rotationSteps * 45°`, przy czym `placementStartYaw` musi być wcześniej snapnięty do siatki 45°, lub zastosować równoważną reprezentację o tych samych właściwościach.

Rotation state należy do placement lifecycle, nie do renderera ghosta.

### 5. Rotation capability

Możliwość ręcznej rotacji powinna być jawną cechą/deskryptorem danego placementu, np. `supportsRotation`, zamiast być wyprowadzana wyłącznie z typu footprintu.

Nie zakładać, że:

- każdy `box` musi być obracany,
- każdy `circle` nigdy nie potrzebuje yaw.

Pozwala to zachować wspólny mechanizm dla przyszłych asymetrycznych lub kierunkowych placeables bez kodowania wyjątków według kształtu ghosta.

### 6. Rotation controls

Obrót jest zawsze skokowy co **45°** dla wszystkich placeables wspierających rotation.

Desktop:

- `F` — obrót o `-45°`,
- `G` — obrót o `+45°`.

Bindingi należy podłączyć przez istniejący input system i aktywować tylko podczas placement mode.

Nie nadpisywać istniejącego znaczenia `E`.

UI placementu powinno pokazywać czytelny hint dostępnych klawiszy, np. `F / G — Obróć`.

### 7. Mobile rotation controls

Placement UI musi zapewniać pełny odpowiednik sterowania rotacją na urządzeniach dotykowych.

Podczas aktywnego placementu wspierającego rotation pokazać:

- przycisk obrotu w lewo,
- przycisk obrotu w prawo.

Każde naciśnięcie zmienia orientację dokładnie o 45°.

Przyciski powinny korzystać z tego samego shared rotation state co input klawiaturowy i nie implementować osobnej logiki yaw.

Kontrolki nie powinny być widoczne dla placementów, które nie deklarują wsparcia rotacji.

### 8. Palisade snapping

Istniejący snapping palisady pozostaje domenowym mechanizmem palisady.

Nowa rotacja musi współpracować z `resolvePalisadeSite()`:

- wynikowy yaw ze shared placement rotation jest wejściem do istniejącego snappingu,
- snapped preview musi pokazywać dokładnie transform wynikający z resolvera,
- narożniki i zmiana kierunku łańcucha muszą pozostać możliwe,
- segmenty powinny naturalnie pozwalać na połączenia pod kątami wynikającymi z kroku 45°.

Nie wprowadzać osobnego systemu połączeń ani trwałego grafu segmentów.

### 9. Shared placement contract

Zachować obecne rozdzielenie odpowiedzialności:

- domain/action code odpowiada za aim, transform i suitability,
- `PlacementPreviewActions` odpowiada za lifecycle preview, rotation state i sterowanie placement mode,
- placement ghost odpowiada tylko za prezentację,
- UI odpowiada za prezentację sterowania desktop/mobile i wywołanie wspólnych akcji rotacji.

Jeśli kontrakt `PlacementPreviewResult` wymaga rozszerzenia, zrobić to jako ogólny mechanizm reusable przez istniejące i przyszłe placeables.

### 10. Preview and confirm consistency

Preview nie może być authoritative.

Confirm musi:

- ponownie obliczyć aktualny placement site,
- wykorzystać ten sam aktualny rotation state,
- ponownie uruchomić domenową walidację,
- dopiero potem wykonać właściwą akcję placementu.

Nie przechowywać w preview gotowego wyniku walidacji jako źródła prawdy dla confirm.

## Constraints

- Stały krok rotacji: **45°**.
- Orientacja startowa placeables wspierających rotation jest snapnięta do najbliższych 45°.
- Nie stosować różnych kroków dla różnych typów obiektów.
- Obrót kamery po rozpoczęciu placementu nie może obracać stawianego obiektu.
- Nie kopiować validation logic do preview renderera ani UI.
- Nie dodawać palisade-specific rotation state.
- Nie dodawać osobnego mobile placement systemu.
- Nie wiązać `supportsRotation` na sztywno z `circle`/`box`.
- Nie dodawać `PalisadeManager` ani podobnego równoległego systemu.
- Nie ładować osobnych modeli GLB tylko na potrzeby podstawowego footprint preview, jeśli prosta geometria wystarcza.
- Preview nie może powodować istotnych alokacji ani przebudowy geometrii co frame.
- Zachować możliwość rozszerzenia wspólnego placement mode o przyszłe budynki i obiekty.

## Non-goals

- przebudowa całego construction systemu,
- zmiana kosztów lub czasu budowy,
- zmiana persistence palisady lub studni,
- zmiana zasad terrain suitability,
- rozbudowany building editor,
- free rotation lub obrót o dowolny kąt,
- różne rotation steps dla różnych placeables,
- sterowanie orientacją przez drag gesture na mobile,
- dowolne przesuwanie obiektu po świecie niezależnie od istniejącego aim systemu,
- pełny hologram/model finalnego obiektu, jeśli footprint ghost zapewnia wystarczające UX.

## Expected result

Po zmianie gracz przed postawieniem obiektu widzi:

- gdzie dokładnie obiekt zostanie ustawiony,
- jaki obszar i kierunek zajmie,
- czy placement jest dozwolony,
- dla kierunkowych placeables — aktualną orientację,
- dla placeables wspierających rotation — jasną informację o możliwości obrotu.

Na desktopie placeable wspierający rotation można obracać `F/G` w krokach co 45°.

Na mobile dostępne są przyciski obrotu w lewo i prawo wykonujące identyczną operację.

Kierunek stawianego obiektu pozostaje stabilny podczas poruszania kamerą po rozpoczęciu placement mode.

Studnia korzysta z tego samego preview flow co pozostałe budowane obiekty.

Palisadę można świadomie obrócić, zobaczyć segment w odpowiednim kierunku i obserwować snapping przed potwierdzeniem.

## Verification

Manual browser verification by User:

- rozpoczęcie budowy studni pokazuje preview zamiast natychmiastowego placementu,
- valid/invalid studni odpowiada finalnej walidacji,
- palisada pokazuje wydłużony footprint i jego kierunek,
- początkowy yaw rotowalnego placementu jest snapnięty do najbliższych 45°,
- `F` obraca rotowalny placeable o 45° w jedną stronę,
- `G` obraca rotowalny placeable o 45° w drugą stronę,
- wielokrotne użycie rotacji daje przewidywalne 8 orientacji w pełnym obrocie,
- obrót kamery po rozpoczęciu placementu nie zmienia yaw obiektu,
- mobile pokazuje kontrolki obrotu tylko dla placeables wspierających rotation,
- mobile rotation korzysta z tego samego kroku 45°,
- rotated palisade prawidłowo snapuje do istniejącego końca segmentu,
- możliwe jest tworzenie prostych odcinków oraz narożników 45°/90°,
- wszystkie istniejące placeables, dla których shape/orientation ma znaczenie, pokazują odpowiedni footprint i orientację,
- circular placeables bez `supportsRotation` nie pokazują zbędnych kontrolek rotacji,
- cancel preview nie powoduje żadnych zmian świata,
- ponowne wejście w placement zaczyna z nową bazową orientacją zamiast dziedziczyć rotation state z poprzedniego placementu,
- confirm ponownie waliduje aktualny transform i yaw,
- istniejące circular placeables nadal zachowują poprawne preview,
- brak regresji w Esc, busy state i mutual exclusion z terrain-preparation preview.

## Implementation notes

Przed implementacją przygotować osobny plik implementation notes zgodnie z `docs/plans/PLANNING.md`.

W szczególności zapisać tam:

- aktualny ownership `PlacementPreviewActions`,
- kontrakt `PlacementPreviewResult`,
- renderer `placementPreview.ts`,
- sposób wyliczania aim/yaw dla directional placeables,
- lifecycle bazowej orientacji i rotation steps,
- istniejący palisade snapping,
- istniejący input lifecycle aktywnego preview,
- miejsce integracji klawiszy `F/G`,
- istniejący mobile placement UI i właściwe miejsce dodania przycisków rotacji,
- tabelę wszystkich obecnych placeables: `placeable → footprint → dimensions → rotation yes/no`,
- źródło wymiarów footprintu, tak aby nie duplikować arbitralnych wartości między validation i preview.

Dla nowych lub istotnie zmienionych publicznych/architektonicznych funkcji dodać JSDoc i, gdzie pomocne dla preflight discovery, `@domain ui-input`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
