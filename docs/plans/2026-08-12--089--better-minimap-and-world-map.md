# Plan: Lepsza minimapa i nowa duża mapa

**Status:** `planned` — **DO REVIEW**  
**Created:** 2026-08-12  
**Priority:** 🟡 medium  
**Effort:** XL  
**Depends on:** ~~025~~, ~~028~~, ~~029~~, ~~046~~, ~~067~~

## Cel

Rozwinąć istniejącą minimapę bez przeciążania HUD-u oraz wprowadzić osobną, dużą mapę świata.

Mapa nie powinna być wyłącznie wizualizacją wygenerowanego świata. Docelowo ma być wizualizacją **wiedzy o świecie**: gracz widzi to, co odkrył, informacje zdobyte od NPC lub z książek/map mogą pojawiać się jako przybliżone lub niepotwierdzone, a eksploracja potwierdza rzeczywisty stan świata.

Świat nie powinien być domyślnie w pełni znany. Nieznany teren jest ukryty przez Fog of War.

> **Ten dokument jest draftem przeznaczonym do review.** Szczegóły UX, model wiedzy, zakres warstw, sposób cache'owania i granice odpowiedzialności między mapą a istniejącymi systemami należy zatwierdzić przed implementacją.

## Kontekst obecnego kodu

- Istniejąca minimapa została wprowadzona w planie [029](./2026-08-07--029--minimap.md).
- Plan [067](./2026-08-11--067--minimap-heading-and-north.md) dodał heading-up oraz prawdziwą północ.
- Obecna minimapa jest renderowana przez Vue: `src/ui-vue/lib/drawMinimap.ts` + `MinimapScreen.vue`, z facade `src/ui/createMinimap.ts`.
- Świat ma chunk streaming, generację terenu w workerach, biomy i regiony biomów.
- Istnieją settlementy, landmarki, drogi/ścieżki oraz system dialogów NPC i książek, które mogą w przyszłości dostarczać informacji o świecie.

## Zakres

### 1. Lepsza minimapa

Minimapa pozostaje **lekkim narzędziem orientacyjnym**, a nie miniaturą dużej mapy.

- ograniczony zoom in/out
- podstawowe kolory terenu/biomów
- Fog of War
- nieznany teren domyślnie ukryty
- podstawowe markery: gracz, osady i istotne lokalizacje
- zachowanie heading-up + kompas N z planu 067
- możliwość show/hide warstw typu terenu/biomu, jeśli nie pogorszy to czytelności
- zachowanie obecnego collapse/toggle
- czytelność na desktopie i touch

**Poza zakresem minimapy:** pełny system wiedzy, rozbudowane markery zasobów, szczegółowe mapy dróg i duży zakres zoomu.

### 2. Duża mapa świata

Nowa mapa powinna być osobnym ekranem/overlayem, przeznaczonym do eksploracji i planowania.

Podstawowe możliwości:

- duży zakres zoom in/out
- przesuwanie mapy
- Fog of War
- nieznany teren ukryty
- kolorowanie biomów/typów terenu
- warstwy włączane/wyłączane przez użytkownika
- osady, miasta i inne ważne lokalizacje
- drogi i ścieżki, jeśli są znane
- własne markery gracza
- oznaczenie lokalizacji jako potwierdzonej albo szacunkowej
- możliwość wyświetlania informacji pochodzących z różnych źródeł

### 3. Wiedza o świecie

Mapa powinna docelowo korzystać ze wspólnego modelu wiedzy, zamiast posiadać własną równoległą logikę „odkrywania”.

Potencjalne źródła informacji:

- **eksploracja** — gracz rzeczywiście odwiedził obszar
- **rozmowa z NPC** — NPC może wskazać miasto, ruinę, drogę lub inne miejsce
- **książka** — opis lub mapa może przekazać wiedzę o świecie
- **istniejąca mapa** — może odkrywać obszar lub lokalizacje

Informacja przekazana przez NPC/książkę/mapę nie musi być dokładna. Przykład:

> „Na zachód, za dużym lasem, znajduje się stare miasto.”

Mapa może wtedy pokazać **szacunkową lokalizację** miasta, a dopiero eksploracja potwierdzi jej rzeczywiste położenie.

To otwiera możliwość poziomów pewności informacji, np.:

- `unknown` — brak wiedzy
- `rumored` / `estimated` — informacja zasłyszana lub znaleziona w źródle
- `discovered` — lokalizacja została odnaleziona
- `confirmed` — dokładne położenie/kształt zostało potwierdzone

Nazewnictwo i dokładny model stanów są **do review**.

### 4. Szacunkowe lokalizacje

Nieznane lokalizacje mogą być przedstawiane orientacyjnie:

- przybliżony punkt
- większy obszar zamiast dokładnego markera
- znak zapytania / wizualne oznaczenie niepewności
- źródło informacji i opcjonalny opis

Po odkryciu miejsce powinno zostać zastąpione rzeczywistą lokalizacją wynikającą ze świata gry.

NPC może się również mylić. Nie należy zakładać, że każda informacja przekazana przez NPC jest prawdziwa.

### 5. Fog of War

Podstawowa zasada:

> **Nieznany teren jest domyślnie ukryty.**

Do ustalenia w review:

- czy odkryty teren pozostaje zawsze widoczny po odkryciu
- czy istnieje rozróżnienie między `seen` i `currently visible`
- jaki promień odkrywania stosuje gracz
- czy odkrywanie zależy od wysokości terenu / punktu obserwacyjnego
- czy mapa z książki/NPC odkrywa teren, czy tylko przekazuje informację o lokalizacji

Dla pierwszej wersji preferowany jest prosty model: **odkryty teren pozostaje znany**, bez kosztownego realtime visibility systemu.

### 6. Warstwy mapy

Proponowane warstwy:

- teren
- biom
- woda
- Fog of War
- osady / miasta
- landmarki
- drogi / ścieżki
- własne markery
- opcjonalnie zasoby

Nie wszystkie warstwy muszą trafić do pierwszej wersji.

## Cache i wydajność

Mapa nie powinna być wyliczana od zera przy każdym renderowaniu ani przy każdym otwarciu ekranu.

### Założenia

- cache mapy **per chunk** lub dla odpowiednich kafli mapy
- aktualizacja tylko zmienionych obszarów
- Fog of War przechowywany jako dane odkrycia, a nie wyliczany ponownie z całego świata
- render mapy może korzystać z przygotowanych reprezentacji dla różnych poziomów zoomu
- minimapa nie powinna wykonywać pełnej analizy świata co klatkę
- duża mapa powinna być generowana leniwie i korzystać z cache

### Potencjalne poziomy cache

1. **Dane mapy** — terrain/biome/FoW/known locations.
2. **Przygotowana reprezentacja kafla** — np. raster/bitmap/tekstura Canvas.
3. **Poziomy zoomu** — opcjonalne agregaty dla dalszego widoku.

Nie należy od razu zakładać bitmapy jako jedynego rozwiązania. W review należy porównać koszt pamięci, aktualizacji i serializacji z prostszym cache danych.

### Aktualizacja cache

Cache powinien być aktualizowany event-driven lub batched, np. gdy:

- gracz odkryje nowy obszar
- zmieni się stan Fog of War
- pojawi się/usunie/zmieni znana lokalizacja
- świat zmieni element, który ma być widoczny na mapie

Nie jest wymagane przeliczanie mapy w każdej klatce.

### Persistence

Wiedza gracza i Fog of War powinny być rozważone jako część zapisu gry.

Nie należy zapisywać całego renderu mapy, jeśli można zapisać kompaktowe dane odkrycia i odtworzyć reprezentację z cache po wczytaniu.

Dokładny format persistence jest **do review**.

## Integracja z istniejącymi systemami

Preferowane jest rozszerzenie istniejących mechanizmów zamiast budowania niezależnego systemu mapy:

- `ChunkManager` — źródło danych przestrzennych/chunków
- istniejący system biome/environment — źródło typów terenu i biomów
- settlement/landmark systems — źródło znanych lokalizacji
- dialogi NPC — potencjalne źródło informacji
- książki/mapy — przyszłe źródła informacji
- persistence — zapis Fog of War i wiedzy

Mapa powinna być przede wszystkim **projekcją danych**, a nie właścicielem świata.

## Proponowany podział odpowiedzialności

### World/map data

Odpowiada za:

- dane potrzebne do narysowania mapy
- chunk/tile representation
- biome/terrain classification
- znane lokalizacje
- stan odkrycia
- cache

### Knowledge / discovery

Odpowiada za:

- co gracz wie
- skąd pochodzi informacja
- poziom pewności
- odkrywanie/potwierdzanie lokalizacji

### Minimap / World Map UI

Odpowiada wyłącznie za:

- prezentację
- zoom/pan
- warstwy
- interakcję użytkownika
- wybór informacji do pokazania

Nazwy i dokładne granice nowych modułów są **do review**.

## UX — propozycja

### Minimap

Minimalna, kolorowa i szybka:

- gracz pozostaje centralnym punktem odniesienia
- teren jest czytelny bez dużej liczby markerów
- Fog of War jest wyraźny, ale nie dominuje
- zoom ma niewielki zakres
- warstwy biom/terrain są opcjonalne

### Duża mapa

Powinna dawać poczucie fizycznej mapy świata:

- swobodne przesuwanie
- zoom
- czytelne kolory biomów
- subtelne oznaczenie niepewnych informacji
- wyraźne rozróżnienie „wiem” vs „słyszałem o tym”
- możliwość dodawania własnych markerów

## Poza zakresem pierwszej wersji

- pełna nawigacja GPS
- automatyczne wyznaczanie tras dla gracza
- dynamiczna mapa satelitarna 3D
- szczegółowe mapowanie każdego obiektu świata
- realtime line-of-sight dla całej mapy
- skomplikowany system błędnych map NPC
- automatyczne odkrywanie całego świata przez same informacje z dialogów

## Otwarte pytania do review

1. Czy `knowledge/discovery` powinien być osobnym wspólnym systemem, czy na początek wystarczy model wiedzy przy mapie?
2. Czy Fog of War ma być tylko permanentnym „discovered/not discovered”, czy od razu `seen/currently visible`?
3. Czy informacja z NPC/książki ma odkrywać tylko marker, czy również przybliżony obszar mapy?
4. Jak mocno chcemy pozwolić NPC na błędne informacje?
5. Czy własne markery mają być częścią pierwszej wersji dużej mapy?
6. Czy zasoby powinny być osobną warstwą mapy, czy pozostać poza zakresem?
7. Czy cache powinien przechowywać dane, raster mapy, czy hybrydę?
8. Czy Fog of War i wiedza mają być częścią `SaveData` od pierwszej implementacji?
9. Jaki powinien być maksymalny zakres dużej mapy względem proceduralnie nieskończonego/streamowanego świata?
10. Czy minimapa i duża mapa mają korzystać dokładnie z tego samego cache/modelu danych?

## Proponowane etapy implementacji

### Phase 1 — fundament danych

- zdefiniować map tile/chunk representation
- zdefiniować Fog of War
- zdefiniować cache
- ustalić persistence

### Phase 2 — minimapa

- rozbudować obecną minimapę
- ograniczony zoom
- kolory biomów/terenu
- Fog of War
- podstawowe warstwy

### Phase 3 — duża mapa

- nowy ekran mapy
- pan/zoom
- warstwy
- markery
- Fog of War

### Phase 4 — knowledge/discovery

- informacje z NPC
- książki/mapy
- szacunkowe lokalizacje
- potwierdzanie lokalizacji podczas eksploracji

Etapy 1–4 mogą zostać zmienione po review.

## Done when

- [ ] Review zakończony i otwarte pytania rozstrzygnięte.
- [ ] Minimap ma ograniczony zoom, kolory biomów/terenu i Fog of War.
- [ ] Nieznany teren nie jest widoczny na mapie.
- [ ] Duża mapa pozwala na pan/zoom i obsługę podstawowych warstw.
- [ ] Znane i szacunkowe lokalizacje są wizualnie rozróżnione.
- [ ] Mapa nie przelicza całego świata przy każdym renderowaniu.
- [ ] Cache aktualizuje tylko zmienione obszary.
- [ ] Fog of War/wiedza są zgodne z persistence.
- [ ] Minimap i duża mapa korzystają ze wspólnego źródła danych zamiast dwóch niezależnych implementacji.
- [ ] Techniczne i manualne testy zostały wykonane.

## Powiązane

- [029 — minimap](./2026-08-07--029--minimap.md)
- [067 — minimap heading + north](./2026-08-11--067--minimap-heading-and-north.md)
- [025 — multi settlements](./2026-08-07--025--multi-settlements.md)
- [028 — biome regions](./2026-08-07--028--biome-regions.md)
- [046 — Vue + Tailwind UI](./2026-08-09--046--vue-tailwind-ui-stack.md)
