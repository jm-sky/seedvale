# Plan: Settlement progression around home

**Created:** 2026-09-13
**Status:** `planned` 📋
**Priority:** medium · **Effort:** S
**Depends on:** none
**Domain:** `settlements`
**Type:** `feature`
**Roadmap:** -

## Cel

Zapewnić naturalną progresję eksploracji świata:

```text
home
  ↓
mniejsza osada startowa
  ↓
większa osada w rozsądnej odległości
  ↓
duża osada dalej
```

Nie tworzymy systemu dynamicznego rozwoju osad. Jest to wyłącznie deterministyczna reguła worldgen dla otoczenia osady startowej.

## V1

Dla domyślnego `homeSize: auto`:

- home generuje się jako `SM` lub `MD`;
- w bliższym pierścieniu wokół home gwarantowana jest co najmniej jedna osada reprezentująca kolejny poziom:
  - home `SM` → minimalny tier `MD`,
  - home `MD` → minimalny tier `LG`;
- w dalszym pierścieniu gwarantowana jest co najmniej jedna duża osada z minimalnym tierem `LG`;
- zwykły seeded roll może dać rozmiar większy niż minimum, w tym `XL`;
- pozostałe osady nadal korzystają z obecnego seeded `rollVillageSize()`.

Jawny `WorldConfig.settlements.homeSize` pozostaje nadrzędny i nie jest automatycznie zmieniany.

## Odległość

Nie kodować odległości jako przypadkowych metrów świata.

Oprzeć wybór na istniejącym settlement grid:

- **near ring:** kandydaci około 1–2 komórek od home;
- **far ring:** kandydaci około 3–5 komórek od home.

Przy `SETTLEMENT_GRID_STEP = 280` daje to skalę rzędu kilkuset jednostek dla pierwszej podróży i około kilometra+ dla dużej osady.

Dokładne granice trzymać jako małe konfigurowalne stałe i kalibrować później gameplayowo.

## Generowanie

Nie tworzyć drugiego generatora osad.

Rozszerzyć istniejący pipeline:

```text
SettlementCell
→ cellSeed
→ terrain/resources
→ settlement size policy
→ findSettlementSite
→ VillagePlan
→ SettlementDef
```

Dodać deterministyczną politykę rozmiaru dla niewielkiego zestawu komórek wokół home.

Polityka ma być czystą funkcją niezależną od streamingu i kolejności ładowania osad. Na podstawie world seed + `SettlementCell` powinna wyznaczać minimalny tier dla progression target albo brak override.

Polityka:

1. wyznacza seeded kolejność kandydatów w `near` i `far`;
2. wykonuje lekki feasibility pass oparty na istniejących regułach site/terrain, bez generowania wielu pełnych `VillagePlan` tylko po to, by wybrać zwycięzcę;
3. wybiera pierwszego poprawnego kandydata w danym ring;
4. dla wybranej komórki przekazuje wymagany minimalny tier rozmiaru;
5. cała dalsza generacja korzysta z istniejącego `generateSettlementDef()` / `VillagePlan`.

Nie zmieniać pozycji osady po wygenerowaniu i nie dodawać runtime correction.

## Terrain

Gwarancja rozmiaru nie może oznaczać ignorowania terenu.

Jeżeli pierwszy kandydat nie może poprawnie pomieścić wymaganej osady:

- sprawdzić kolejnego kandydata w tym samym ring;
- zachować istniejące `findSettlementSite`, water/river clearance i footprint scoring;
- nie stawiać `XL` na niewłaściwym site tylko dlatego, że zwykły roll dał `XL`.

Outpost nie może spełniać gwarancji `near` ani `far`.

## Minimalny wpływ na istniejący worldgen

Progression policy może wpływać wyłącznie na `provisionalSize` wybranej komórki.

Nie może zmieniać:

- `SettlementCell` ani settlement id,
- `cellSeed()`,
- pozycji centrum komórki,
- resource generation ani resource RNG,
- naming seed,
- layout RNG,
- kolejności streamingu.

Celem jest zachowanie istniejącego świata dla danego seeda wszędzie poza samym wymuszonym minimalnym tierem progression settlements.

## Determinizm

Dla:

```text
world seed + settlement cell
```

wynik musi być stabilny między uruchomieniami.

Nie zapisywać osobnej listy „progression settlements” do save, jeżeli można ją zawsze odtworzyć z world seed.

Zmiana kamery, kolejności streamingu lub kolejności ładowania chunków nie może wpływać na wybór gwarantowanych osad.

## Istniejące mechanizmy do reuse

Główne punkty integracji:

- `src/settlement/settlementGenerator.ts`
  - `SettlementCell`
  - `cellSeed()`
  - `cellsWithinRadius()`
  - `generateSettlementDef()`
  - istniejący home handling;
- `src/settlement/families.ts`
  - `VillageSize`
  - `rollVillageSize()`
  - `villageSizeConfig()`;
- `src/settlement/settlementPlanCache.ts`
  - zachować obecny cache i jeden canonical generation path;
- istniejący `findSettlementSite()` i footprint-aware site scoring.

Ważne funkcje/public contracts dodane w ramach planu udokumentować JSDoc, z `@domain settlements` tam, gdzie pomaga to późniejszemu preflightowi.

## Testy

Dodać testy deterministyczne obejmujące wiele seedów:

- `auto` home nigdy nie przekracza `MD`;
- home `SM` ma poprawnego progression target z minimum `MD` w near ring;
- home `MD` ma poprawnego progression target z minimum `LG` w near ring;
- far ring zawiera target z minimum `LG`;
- zwykły roll targetu może legalnie dać większy rozmiar niż minimum, w tym `XL`;
- target nie zostaje outpostem;
- niemożliwy site powoduje wybór kolejnego kandydata;
- ten sam seed zawsze wybiera te same komórki i minimalne tiery;
- kolejność wywołań/streamingu nie zmienia wyniku;
- zwykłe komórki poza progression rings nadal używają obecnego `rollVillageSize()`;
- progression override nie zmienia resource/name/layout RNG poza skutkami wynikającymi z innego `provisionalSize`.

## Poza zakresem

- dynamiczny wzrost osad podczas rozgrywki;
- regionalny handel;
- nowe profesje;
- outskirts;
- charakter osady;
- questy prowadzące gracza do większych osad;
- nowe drogi między gwarantowanymi osadami;
- zmiana settlement streaming;
- przebudowa `VillageSize`.

## Weryfikacja przez użytkownika

W browserze dla kilku nowych seedów:

1. home wygląda jak mała/średnia osada;
2. w rozsądnym dystansie istnieje zauważalnie większa osada;
3. dalej znajduje się duża osada;
4. żadna z nich nie jest ustawiona w wodzie lub na ewidentnie złym terenie;
5. świat poza tym nie wygląda na sztucznie uporządkowany według rozmiaru.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
