# Plan: Construction Placement & Terrain Preparation UX

**Created:** 2026-08-29
**Status:** `verification needed` 🔍 — implemented, browser/gameplay verification pending (see implementation notes)
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** `ui-input`

## Cel

Usprawnić kilka powiązanych elementów interakcji gracza:

- tempo ręcznej budowy studni,
- placement skrzyń, namiotów i ognisk,
- organizację Quick Actions,
- przygotowanie większych obszarów terenu,
- precyzyjne rozszerzanie istniejących płaskich obszarów,
- tolerancję nierówności terenu,
- czytelność panelu przygotowania terenu na mobile.

Implementacja ma rozszerzać istniejące mechanizmy. Nie tworzyć równoległych systemów placement, time-skip ani terrain preparation.

## 1. Budowa studni — większa sesja pracy

### Obecny mechanizm

Budowa studni jest już obsługiwana przez istniejący system pracy i przyspieszenia czasu.

Istniejące wymagania etapów pozostają bez zmian:

```
pit   = 2 h
well  = 1 h
roof  = 1 h
```

Problemem jest ilość pracy wykonywana podczas pojedynczej sesji.

Obecnie sesja wykorzystuje `WELL_WORK_SESSION_SEC = 8`, a faktyczny postęp odpowiada około `0.4 h` pracy.

### Zmiana

Jedna sesja pracy nad studnią powinna wykonywać około:

```
2 h pracy
```

Rozpoczęcie pracy nadal korzysta z istniejącego `timeSkip`.

Nie zmieniać wymagań etapów.

### Efekt

- dół studni (`2 h`) może zostać wykonany jedną sesją,
- korpus (`1 h`) jedną sesją,
- daszek (`1 h`) jedną sesją.

Nie skracać `roof` z obecnej wartości `1 h`.

### Implementacja

Przed zmianą dokładnie prześledzić:

- `WELL_WORK_SESSION_SEC`,
- `workOnWell`,
- obliczanie `workHours`,
- wywołanie `timeSkip.start(...)`,
- naliczanie progresu konkretnego etapu.

Zmienić tylko parametr/obliczenie określające ilość wykonanej pracy podczas sesji.

Nie tworzyć nowego mechanizmu przyspieszania czasu.

### Weryfikacja

Sprawdzić w browserze:

- rozpoczęcie budowy uruchamia time-skip,
- pojedyncza sesja wykonuje około 2 h pracy,
- nie dochodzi do przekroczenia wymaganej pracy danego etapu,
- po ukończeniu etapu poprawnie przechodzi do kolejnego,
- daszek nadal wymaga 1 h pracy.

## 2. Wspólny placement obiektów

### Problem

Obecne stawianie obiektów jest zbyt trudne do precyzyjnego wykonania.

Codebase posiada już wspólne mechanizmy oceny lokalizacji, m.in. `evaluateGroundPlacement()`, oraz entry pointy dla różnych obiektów.

Nie należy tworzyć osobnego placement systemu dla każdego obiektu.

### Docelowy UX

Po wybraniu konkretnej akcji:

- `Postaw skrzynię`,
- `Postaw namiot`,
- `Zbuduj ognisko`,

gracz wchodzi w tryb wyboru lokalizacji.

### Flow

```
wybór akcji
    ↓
placement mode
    ↓
ghost / obrys obiektu
    ↓
ruch kursora / wskaźnika
    ↓
walidacja lokalizacji
    ↓
zielony / żółty / czerwony preview
    ↓
klik / tap
    ↓
zatwierdzenie
    ↓
istniejąca akcja placement/build
```

### Kolory

- **zielony** — lokalizacja poprawna,
- **żółty** — lokalizacja możliwa z ostrzeżeniem,
- **czerwony** — lokalizacja niedozwolona.

Dokładne warunki kolorów należy oprzeć na istniejącej walidacji placement, a nie tworzyć drugiego zestawu reguł.

### Zakres pierwszej wersji

Nie dodawać:

- rotacji obiektu,
- zaawansowanych gestów rotacji,
- snapowania do dodatkowej siatki,
- nowych zasad gameplayowych dotyczących placement.

### Implementacja

Wykorzystać istniejące:

- `placementActions.ts`,
- `evaluateGroundPlacement()`,
- istniejące callbacki placement,
- `onPlaceContainer`,
- istniejące ground-suitability flow dla namiotu/skrzyni.

Wspólny placement powinien dostarczać:

```
selected object/action
current position
placement validity
preview state
confirm/cancel
```

Logika faktycznego postawienia obiektu pozostaje w istniejących akcjach.

## 3. Quick Actions — hierarchia kategorii

### Problem

Quick Actions zaczynają zawierać zbyt wiele bezpośrednich akcji.

Dodawanie kolejnych obiektów do głównego poziomu będzie pogarszać UX.

### Docelowa struktura

```
Quick Actions
│
├── Budowa
│   ├── Postaw skrzynię
│   ├── Postaw namiot
│   └── Zbuduj ognisko
│
├── Teren
│   └── Przygotuj teren
│
└── ...
```

Czyli:

```
poziom 1 → kategoria
poziom 2 → konkretna akcja
```

### Implementacja

Rozszerzyć istniejący system:

- `createQuickActions`,
- `ui.quickActions`,
- istniejące Vue UI/store.

Nie tworzyć drugiego katalogu akcji tylko na potrzeby hierarchicznego UI.

Akcje nadal powinny korzystać z istniejących:

- availability,
- callbacków,
- kosztów,
- warunków,
- wykonania.

Hierarchia jest warstwą prezentacji istniejących akcji.

### UX

Potrzebny jest mechanizm:

- wejścia do kategorii,
- wyboru akcji,
- powrotu do listy kategorii.

Na mobile powrót powinien być jednoznaczny i łatwy do użycia.

## 4. Przygotowanie terenu — maksymalnie 9×9 m

### Obecny stan

`PreparationSize` obecnie operuje na rozmiarach:

```
2 m
3 m
4 m
```

Rozdzielczość próbek jest wyliczana względem terrain resolution:

```
Math.round(sizeMeters / step) + 1
```

Dlatego rozszerzenie powinno zachować model:

> rozmiar = metry, nie liczba próbek.

### Zmiana

Dodać możliwość wyboru:

```
9 m × 9 m
```

i odpowiednio rozszerzyć zakres `PreparationSize`.

Nie zmieniać znaczenia istniejącego `step`.

### Zakres

Sprawdzić wszystkie miejsca zależne od `PreparationSize`:

- typ,
- UI wyboru rozmiaru,
- walidację,
- preview,
- sample resolution,
- footprint,
- obliczanie kosztu/pracy, jeśli zależy od powierzchni.

Nie zakładać, że wystarczy zmiana jednego union type.

### Weryfikacja

- można wybrać 9×9,
- preview poprawnie obejmuje 9×9 m,
- próbki odpowiadają rzeczywistej rozdzielczości terenu,
- istniejące mniejsze rozmiary nadal działają.

## 5. Przygotowanie terenu — wizualizacja zgodności wysokości

### Problem

Gracz ma już wyrównany obszar i chce go rozszerzyć.

Trudno ręcznie znaleźć sąsiedni fragment terenu znajdujący się dokładnie na tym samym poziomie.

### Istniejąca infrastruktura

Codebase posiada już:

- `TerrainPreparationPreview`,
- grid preview,
- `resolvePreparationSamples()`,
- sampling wysokości,
- istniejący `targetHeight`,
- walidację różnicy wysokości.

Nie tworzyć osobnego systemu odczytu wysokości.

### Zmiana

Rozszerzyć istniejący preview tak, aby poszczególne fragmenty siatki mogły mieć różne kolory.

Dla każdej komórki:

```
terrain height
      ↓
porównanie z planned targetHeight
      ↓
visual state
```

### Przykładowy stan

```
zielony → zgodny poziom
inny kolor → różnica wysokości
```

Kolor nie powinien oznaczać jedynie globalnego `valid/invalid` całego footprintu.

### Ważne rozróżnienie

`targetHeight` powinien pozostać poziomem docelowym całego przygotowywanego obszaru.

Wizualizacja ma odpowiedzieć:

> Czy ten fragment terenu jest na poziomie, który chcę uzyskać?

Nie należy zmieniać automatycznie target height dla każdej komórki.

### Implementacja

Rozszerzyć:

- `terrainPreparationActions.ts`,
- `terrainPreparationPreview.ts`.

Wykorzystać istniejące wyniki `resolvePreparationSamples()` i `sampleHeight()`.

Nie wykonywać dodatkowego, niezależnego skanowania całego terenu tylko dla UI.

## 6. Przygotowanie terenu — panel mobile

### Problem

Panel informacji i przycisków zajmuje zbyt dużo ekranu.

Na mobile utrudnia obserwowanie przygotowywanego terenu.

### Zmiana

Panel powinien otrzymać bardziej przezroczyste tło.

Preferowane:

```
panel background → semi-transparent
tekst / przyciski → pełna czytelność
teren → widoczny pod panelem
```

Nie zmniejszać opacity całego komponentu razem z tekstem i przyciskami.

### Implementacja

Zmiana powinna dotyczyć warstwy/tła istniejącego panelu Vue.

Nie zmieniać:

- logiki przycisków,
- terrain preparation state,
- input handling.

Jeżeli istnieje osobna wersja mobile/layout breakpoint, użyć jej zamiast globalnego pogarszania czytelności UI.

## 7. Wspólna infrastruktura placement

Punkty 2 i 3 powinny zostać zaimplementowane tak, aby nowy mechanizm można było wykorzystać dla kolejnych obiektów.

Pierwsze zastosowania:

- skrzynia,
- namiot,
- ognisko.

Istniejące obiekty powinny pozostać właścicielami swoich zasad gameplayowych.

Wspólny placement odpowiada za:

```
preview
position
validation state
confirm
cancel
```

Nie za:

```
koszt obiektu
zużycie itemów
czas budowy
konkretne konsekwencje gameplayowe
```

## 8. Przygotowanie terenu — zwiększenie tolerancji wysokości

### Obecny stan

W `terrainPreparation.ts` istnieje:

```ts
MAX_PREPARATION_DELTA = 3
```

Walidacja porównuje:

```ts
Math.abs(targetHeight - sample.height)
```

z tym limitem.

Obecne `3 m` jest zbyt restrykcyjne dla praktycznego wyrównywania terenu.

### Zmiana

Zwiększyć `MAX_PREPARATION_DELTA`.

Nowa wartość powinna być parametrem balansu, a nie zaszytą dodatkowo w walidacji.

### Zasada

Zwiększenie tolerancji nie oznacza zmiany poziomu docelowego.

Dokładny zakres zależy od wybranej wartości `MAX_PREPARATION_DELTA`.

### Relacja z punktem 5

Punkty mają różne cele:

- **punkt 5:** znaleźć fragment na właściwym poziomie,
- **punkt 8:** pozwolić wyrównać teren mimo większych lokalnych różnic wysokości.

Nie łączyć ich w jedną regułę.

## 9. Kolejność implementacji

Zalecana kolejność:

### Etap 1 — teren

1. rozszerzenie `PreparationSize` do 9 m,
2. zwiększenie `MAX_PREPARATION_DELTA`,
3. rozszerzenie preview o per-cell/per-region height visualization,
4. poprawa panelu mobile.

### Etap 2 — placement

5. wspólny placement preview,
6. skrzynia,
7. namiot,
8. ognisko,
9. podpięcie pod Quick Actions.

### Etap 3 — Quick Actions

10. hierarchia kategorii,
11. nawigacja kategoria → akcja → placement,
12. powrót do kategorii/anulowanie.

### Etap 4 — studnia

13. zmiana ilości pracy wykonywanej podczas pojedynczej sesji,
14. weryfikacja time-skip i wszystkich etapów studni.

Kolejność może zostać zmieniona, jeśli analiza konkretnych komponentów podczas implementacji pokaże mocniejsze zależności.

## 10. Weryfikacja techniczna

Po implementacji:

```
pnpm exec tsc --noEmit
pnpm run lint
pnpm run test
pnpm run build
```

Jeżeli repozytorium posiada aktualne dedykowane komendy CI/preflight, użyć ich zgodnie z `CLAUDE.md`.

## 11. Weryfikacja browser/gameplay

### Studnia

Sprawdzić:

- rozpoczęcie pracy,
- aktywację time-skip,
- ilość pracy wykonanej w jednej sesji,
- ukończenie etapów,
- przejście między etapami,
- ukończenie daszku,
- brak nadmiernego naliczania pracy.

### Placement

Osobno przetestować:

- skrzynię,
- namiot,
- ognisko.

Sprawdzić:

- preview,
- podążanie za kursorem,
- poprawność kolorów,
- niedozwolone lokalizacje,
- zatwierdzenie,
- anulowanie,
- brak rotacji.

### Quick Actions

Sprawdzić:

- kategorię,
- wejście do kategorii,
- wybór konkretnej akcji,
- powrót,
- mobile,
- desktop,
- zachowanie availability.

### Teren

Sprawdzić:

- 2/3/4 m,
- 9 m,
- preview 9×9,
- różne wysokości,
- zwiększoną tolerancję,
- wyrównywanie górki,
- istniejący płaski teren + sąsiedni fragment,
- kolorowanie poszczególnych fragmentów,
- zgodność z target height.

### Mobile

Sprawdzić:

- panel preparation,
- widoczność terenu pod panelem,
- czytelność tekstu,
- czytelność przycisków,
- placement,
- Quick Actions.

## 12. Dokumentacja

Po implementacji zaktualizować odpowiednie dokumenty projektu, jeżeli zmienione zachowanie wpływa na opis aktualnego stanu.

Nie aktualizować roadmapy/planu tylko mechanicznie — dokumentacja musi odzwierciedlać faktycznie zaimplementowany stan.

**Zrób git commit i push do main, rebase jeżeli trzeba**
