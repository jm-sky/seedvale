# Plan: Player-Built Well

**Created:** 2026-08-16
**Status:** `planned` 📋
**Priority:** 🟡 medium · **Effort:** M
**Depends on:** ~~122~~
**domain:** `items-player`
**tags:** [world-terrain, settlements-npcs]

## Cel

Dodać możliwość zbudowania przez gracza fizycznej studni.

Studnia nie jest wyłącznie dekoracją. Po ukończeniu staje się istniejącym `WaterSource` i może być używana przez gracza, NPC, gospodarstwa i livestock.

Plan jest pierwszym małym krokiem w kierunku player-built structures, ale nie tworzy jeszcze generycznego systemu budowania.

## 1. Player Construction

Minimalny flow:

```text
łopata + wymagane materiały
        ↓
wykopanie dołu
        ↓
budowa studni
        ↓
budowa daszku
        ↓
gotowa studnia → WaterSource
```

Pierwszym typem konstrukcji jest `well`.

System może mieć prosty data-driven kontrakt pozwalający później dodać kolejne struktury, ale nie budować teraz pełnego frameworka.

## 2. Materials & Tool

Budowa wymaga:

- **łopaty** — narzędzie potrzebne do wykonania wykopu; nie jest zużywana jako materiał,
- **kamieni** — konstrukcja studni,
- **drewna** — konstrukcja i daszek.

Koszt korzysta z istniejących itemów/inventory. Nie tworzyć osobnego systemu resource economy.

## 3. Construction Stages

Studnia ma trzy widoczne etapy:

```text
1. pit     — wykopany dół
2. well    — wykonana właściwa studnia
3. roof    — ukończony daszek
```

Każdy etap jest rzeczywistym stanem świata.

Dopiero `roof` oznacza `completed` i aktywuje pełny `WaterSource`.

Wcześniejsze etapy pozostają widoczne jako niedokończona konstrukcja.

## 4. Construction Time

Budowa nie jest natychmiastowa.

Początkowe wartości:

```text
Dół       ~1 dzień
Studnia   ~1 dzień
Daszek    ~0.5 dnia
-------------------
Razem     ~2.5 dnia
```

Czas powinien być liczony przez istniejący czas świata, a nie przez real-time timer.

W przyszłości może być modyfikowany przez np. skill, narzędzie lub pomoc NPC bez zmiany modelu etapów.

Jeżeli gracz przerwie budowę, wykonana praca pozostaje. Można wrócić do konstrukcji później.

## 5. Placement

Przed rozpoczęciem sprawdzić:

- teren nie jest zbyt stromy,
- brak kolizji z istniejącymi strukturami,
- odpowiednią odległość od innych obiektów,
- podstawowe wymagania lokalizacji.

Nie wymagać realistycznej geologii ani systemu groundwater.

Wykorzystać istniejące funkcje próbkowania terenu i placementu.

## 6. Construction State

Struktura powinna mieć stabilne ID oraz minimalny zapis stanu:

```text
id
+
type = well
+
position
+
rotation
+
stage
+
stageStartedAt
```

Nie zapisywać stanu `WaterSource`, który można odtworzyć z ukończonej konstrukcji.

## 7. Stage Transitions

Preferowany flow:

```text
planned
  ↓
pit
  ↓
well
  ↓
roof
  ↓
completed
```

Przejście do kolejnego etapu wymaga:

- odpowiednich materiałów,
- odpowiedniego narzędzia, jeśli dany etap go wymaga,
- ukończenia czasu bieżącego etapu.

Na v1 można rozpocząć kolejny etap interakcją gracza po ukończeniu poprzedniego.

Nie implementować automatycznej budowy przez NPC.

## 8. Visuals

Każdy etap powinien mieć własną reprezentację:

- `pit` — wykop / dół,
- `well` — kamienny/wooden well body,
- `roof` — daszek.

Po zakończeniu etapu nie powinno być konieczne utrzymywanie wszystkich wcześniejszych elementów jako osobnych systemów runtime; można je złożyć w statyczną strukturę.

Nie tworzyć osobnego render managera.

## 9. WaterSource Integration

Najważniejsza zasada:

```text
Completed Well
      ↓
  WaterSource
```

Wykorzystać istniejący `WaterSource` oraz logikę planu 122.

Nie tworzyć `PlayerWellWaterSystem`.

Po ukończeniu studnia powinna automatycznie wejść do istniejącego mechanizmu wyszukiwania źródeł wody.

## 10. NPC Integration

Nie dodawać specjalnego zachowania:

```text
if playerBuiltWell then ...
```

Istniejący water logistics powinien znaleźć nową studnię przez wspólny mechanizm.

Docelowy przepływ:

```text
NPC
 ↓
find WaterSource
 ↓
player-built well
 ↓
carry water
 ↓
household.water
```

To jest podstawowy gameplayowy efekt budowy.

## 11. Player Interaction

Gracz powinien móc korzystać z ukończonej studni przez istniejący interaction flow.

Przykładowe prompty:

```text
[E] Wykop dół
[E] Buduj studnię
[E] Zbuduj daszek
[E] Nabierz wodę
```

Nie tworzyć osobnego input systemu.

Jeżeli istniejący system pobierania wody nie wymaga fizycznego itemu, zachować obecny model zamiast tworzyć specjalny `WellBucket`.

## 12. Persistence & Streaming

Studnia musi przetrwać:

- save/load,
- chunk unload/load,
- rebuild world.

Wszystkie etapy muszą być odtwarzalne z zapisanego stanu.

`WaterSource` powinien być rekonstruowany po załadowaniu ukończonej studni.

Należy zapobiec duplikacji źródeł wody przy ponownym streamingu/rebuildzie.

## 13. Future-proofing

Nie tworzyć teraz pełnego Building System.

Jednocześnie kontrakt może później umożliwić:

```text
PlayerStructure
├── Well
├── Fence
├── Campfire
├── Storage
└── ...
```

Struktury mogą opcjonalnie zapewniać usługi świata:

```text
Well       → WaterSource
Storage    → Storage
Campfire   → Heat/Rest
Workshop   → Production
```

Dzięki temu budowanie rozszerza istniejące systemy zamiast tworzyć player-only gameplay.

## 14. Performance

Budowanie jest zdarzeniem rzadkim.

- brak kosztownych obliczeń co frame,
- brak per-frame simulation konstrukcji,
- statyczna reprezentacja po ukończeniu,
- wykorzystanie istniejącego chunk lifecycle,
- brak Web Workera.

## 15. Verification

### Technical

- `tsc`
- lint
- tests
- build

### Browser

Sprawdzić:

- placement preview,
- poprawny/niepoprawny placement,
- wymaganie łopaty,
- wymagane ilości kamienia i drewna,
- zużycie materiałów,
- rozpoczęcie etapu,
- upływ czasu,
- przejście `pit → well → roof`,
- możliwość odejścia i powrotu do budowy,
- ukończona studnia jako `WaterSource`,
- pobieranie wody przez gracza,
- znalezienie studni przez NPC,
- transport wody do household,
- save/load,
- chunk unload/load,
- brak duplikacji `WaterSource`,
- poprawny dispose/rebuild.

### Gameplay

Najważniejszy test end-to-end:

```text
player builds well
        ↓
well becomes completed
        ↓
WaterSource becomes available
        ↓
NPC discovers it
        ↓
NPC collects water
        ↓
household water reserve increases
```

## Out of scope

Nie implementować:

- budowania domów przez gracza,
- systemu fundamentów,
- voxel/block building,
- blueprintów,
- NPC builders,
- automatycznego budowania,
- wieloetapowych konstrukcji innych niż studnia,
- edytora konstrukcji,
- zaawansowanego systemu placement grid.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
