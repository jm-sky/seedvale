# Plan 090: Miecz, Kupiec, Namiot, Duże Jaskinie i Kilof

**Status:** `verification needed` 🔍 — kilof, miecz (hold/melee + Strażnik/Kupiec), kupiec/handel, namiot, duże jaskinie, wóz/koń zaimplementowane; wymaga sprawdzenia w przeglądarce
**Created:** 2026-08-12
**Priority:** 🟡 medium
**Effort:** XL
**Scope:** kilka powiązanych dodatków gameplay/world, które rozszerzają istniejące systemy itemów, NPC, handlu, campingu, zasobów i landmarków.

## Cel

Dodać cztery powiązane elementy świata:

1. **Miecz** — istniejący `long_sword` jako pełnoprawny item, zdobywany od Strażnika lub Kupca.
2. **Kupiec + wóz + koń** — pierwszy prosty punkt handlowy w domowej osadzie, z płatnością muszlami lub barterem.
3. **Namiot** — przenośny item do rozstawiania i odpoczynku.
4. **Duże proceduralne jaskinie** — osobny typ większego landmarku, wyraźnie większy i głębszy niż jaskinie fauny.
5. **Kilof** — narzędzie do wydobywania materiałów ze skał/złóż.

Nie tworzyć równoległych systemów tam, gdzie istnieją już odpowiednie mechanizmy. W szczególności wykorzystać istniejące `ItemKind`/Inventory/HeldTool, NPC roles/dialogue/quests, `ResourceDeposits`, `modifyTerrain`, camping/rest i pipeline landmarków.

---

## 1. ⚔️ Miecz

### Stan obecny

Model `long_sword` jest już przygotowany, a użytkownik rozpoczął kodowanie gripa. Item ma być prezentowany graczowi jako **„Miecz”**.

### Zakres

- dokończyć `ItemKind`/definicję itemu `long_sword` jako `Miecz`,
- inventory, waga i persistence,
- held visual z istniejącym grip/anchor,
- wykorzystać istniejący system melee zamiast tworzyć osobny combat system,
- ustalić obrażenia większe niż nóż (docelowo ok. 25–30, do strojenia podczas implementacji),
- obsłużyć interakcję z istniejącym systemem walki z fauną.

### Pozyskanie

Miecz nie jest zwykłym losowym spawnem świata.

**Strażnik:**
- może dać miecz jako nagrodę za quest,
- może dać miecz jako nagrodę za rozmowę,
- rozmowa może pozwolić graczowi poprosić Strażnika o miecz i otrzymać go, jeśli warunki dialogu na to pozwalają.

**Kupiec:**
- sprzedaje miecz za muszle,
- pozwala wymienić odpowiednią wartość innych przedmiotów.

Nie implementować durability w tym planie.

---

## 2. 🛒 NPC Kupiec, wóz i koń

### Kupiec

Dodać nową rolę/profesję NPC: **Kupiec**.

Na obecnym etapie:

- dokładnie **1 Kupiec w domowej osadzie**,
- brak Kupców w pozostałych osadach,
- Kupiec pozostaje zwykłym NPC korzystającym z istniejącej architektury NPC,
- ma miejsce pracy przy swoim wozie,
- podstawowy schedule/idle powinien korzystać z istniejącego systemu aktywności NPC.

Nie implementować jeszcze podróżujących kupców ani symulacji karawany.

### Wóz

Przy Kupcu umieścić wóz:

- istniejący lub nowy asset wozu,
- stabilne ustawienie obok Kupca,
- opcjonalny prosty ładunek/skrzynie,
- wóz stanowi wizualny punkt handlu.

Na tym etapie wóz nie podróżuje.

### Koń

Koń jest **dekoracyjny**:

- stoi przy wozie,
- może mieć prostą animację idle,
- brak jazdy,
- brak mount systemu,
- brak rozbudowanego AI konia.

### Interakcja i UI

Podejście do Kupca otwiera prosty ekran handlu.

Przykładowy zakres UI:

```text
KUPIEC

Muszle: 73

Nóż          12 muszli   [KUP]
Krzesiwo      8 muszli   [KUP]
Koc          10 muszli   [KUP]
Łopata       20 muszli   [KUP]
Siekiera     25 muszli   [KUP]
Widły        12 muszli   [KUP]
Sierp        12 muszli   [KUP]
Pochodnia     8 muszli   [KUP]
Kilof        30 muszli   [KUP]
Namiot       30 muszli   [KUP]
Miecz        50 muszli   [KUP]
```

Nie dodawać koszyka, negocjacji ani dynamicznych cen.

### Cennik

Pierwszy prosty cennik:

| Item | Cena w muszlach |
|---|---:|
| Krzesiwo | 8 |
| Pochodnia | 8 |
| Koc | 10 |
| Nóż | 12 |
| Widły | 12 |
| Sierp | 12 |
| Łopata | 20 |
| Siekiera | 25 |
| Kilof | 30 |
| Namiot | 30 |
| Miecz | 50 |

Ceny powinny być zebrane w jednym prostym katalogu/konfiguracji, aby można było je później łatwo zmienić.

### Towary

Kupiec sprzedaje przedmioty, które gracz może używać. Nie sprzedaje surowców/dekoracyjnych materiałów takich jak kamienie czy gałęzie.

W miarę dodawania nowych używalnych itemów powinny one móc zostać dodane do katalogu Kupca bez tworzenia osobnych mechanizmów.

### Barter

Handel ma od pierwszej wersji dwa tryby:

1. **muszle → item**,
2. **itemy → item**.

Do barteru wykorzystać wspólną wartość handlową itemów, np. `tradeValue`, zamiast kodować każdą możliwą parę wymian osobno.

Przykładowo:

```text
łączna wartość oferowanych itemów >= wartość kupowanego itemu
```

Barter powinien sprawdzać inventory i wykonywać transakcję atomowo: najpierw zweryfikować całość, następnie usunąć płatność i dodać zakupiony item.

Nie wprowadzać jeszcze pełnego systemu ekonomii, magazynów Kupca ani dynamicznego popytu/podaży. Ma to być mały system handlu, który później może zostać podłączony do szerszej ekonomii.

---

## 3. ⛺ Namiot

### Item

Dodać `ItemKind: tent`.

Namiot:

- jest pełnoprawnym itemem inventory,
- ma wagę,
- jest zapisywany w save,
- można go kupić u Kupca,
- nie jest zwykłym losowym pickupem świata.

### Rozstawianie

Gracz posiada namiot i wybiera akcję **„Rozstaw namiot”**.

Przed rozstawieniem należy sprawdzić:

- odpowiednio płaski teren,
- brak kolizji z istniejącymi obiektami,
- odpowiednią przestrzeń wokół namiotu,
- brak wody i niedozwolonego terenu,
- brak konfliktu z innymi obiektami/landmarkami.

Po udanym rozstawieniu:

`inventory: tent -1 → placed tent`

Namiot pozostaje w świecie do momentu złożenia.

### Interakcja z namiotem

Gdy namiot stoi, gracz dostaje interakcje:

- **Odpocznij**
- **Złóż namiot**

**Odpocznij** ma wykorzystywać istniejący system odpoczynku/time-skip oraz istniejącą sekwencję campingu, rozszerzając ją o prawdziwy namiot zamiast tworzyć drugi system odpoczynku.

**Złóż namiot:**

`placed tent → inventory: tent +1`

Namiot znika ze świata.

Na tym etapie nie dodawać trwałości namiotu ani uszkodzeń.

---

## 4. 🪨 Generator dużych jaskiń

### Cel

Dodać osobny proceduralny typ jaskini, wyraźnie większy i głębszy od istniejących jaskiń używanych przez lisy/wilki.

Istniejący mechanizm cave spawner i `ChunkManager.modifyTerrain` powinien zostać wykorzystany tam, gdzie ma to sens. Nie tworzyć drugiego systemu deformacji terenu tylko dla tego landmarku.

### Docelowa skala

- otwór około **3 × 3 m**,
- duże zagłębienie terenu przed wejściem,
- tunel około **10–15 m długości**,
- wyraźnie większa skala niż cave/thicket fauny,
- gracz może fizycznie wejść do środka,
- tunel kończy się ślepą ścianą w pierwszej wersji.

### Generator

Generator powinien:

1. znaleźć odpowiednią lokalizację,
2. preferować naturalne zbocze/teren odpowiedni do wejścia,
3. sprawdzić kolizję z drogami, osadami i innymi ważnymi landmarkami,
4. uformować większą depresję przed wejściem,
5. utworzyć przechodni tunel 10–15 m,
6. zbudować skalne otoczenie wejścia i ścian tunelu,
7. zapewnić wystarczającą wysokość/szerokość dla gracza,
8. wygenerować naturalne zakończenie tunelu.

### Wygląd

Unikać geometrycznego „tunelu z klocków”.

Preferowane:

- nieregularny otwór,
- skały o różnych rozmiarach,
- nierówne ściany,
- rumosz przy wejściu,
- nieregularna podłoga,
- ciemniejsze wnętrze,
- naturalne przejście między terenem zewnętrznym a jaskinią.

Otwór nie musi być mały — około 3 × 3 m jest zamierzonym rozmiarem.

### Zawartość

Pierwsza wersja jaskini jest **pusta**.

Nie dodawać jeszcze:

- skarbów,
- questów,
- przeciwników,
- złóż,
- specjalnych itemów.

Architektura powinna jednak pozwalać później osadzać w jaskiniach scenariusze specjalne, np. skarb + mob + dodatkowa lokacja.

### Rozmieszczenie

Generator powinien tworzyć wiele jaskiń w świecie, ale z rozsądnym rozstawem.

Jaskinie powinny:

- unikać osad,
- unikać dróg i ważnych obiektów,
- nie skupiać się wszystkie w jednym miejscu,
- korzystać z istniejących mechanizmów suitability/landmark placement tam, gdzie są dostępne.

---

## 5. ⛏️ Kilof i wydobywanie skał

### Item

Dodać `ItemKind: pickaxe`.

- inventory,
- waga,
- held tool,
- model `pickaxe.glb` jeśli dostępny,
- grip/attachment,
- persistence.

W katalogu itemów kilof jest już wskazany jako przyszły pełnoprawny item; dekoracyjny model istnieje w projekcie.

### Interakcja

Gdy kilof jest trzymany i gracz patrzy na odpowiednie złoże/skałę:

**`[E] Wydobądź`**

Akcja:

1. rozpoczęcie busy action,
2. krótka akcja kopania,
3. SFX uderzenia kilofem,
4. wydobycie materiału,
5. aktualizacja stanu złoża,
6. dodanie yield do inventory albo drop obok, zgodnie z istniejącym kontraktem inventory capacity.

### Współpraca z istniejącymi złożami

Nie tworzyć nowego `RockMiningManager`.

Wykorzystać istniejący `ResourceDeposits` i istniejące modele złóż.

Pierwszy zakres materiałów:

- kamień,
- węgiel,
- żelazo,
- złoto.

Łopata pozostaje narzędziem do deformowania terenu i znajdowania kamieni; kilof służy do wydobywania z istniejących złóż/obiektów skalnych.

### Stan złoża

W pierwszej wersji można zastosować prosty ograniczony stan wydobycia, np. liczba dostępnych uderzeń/yieldów. Nie implementować jeszcze pełnego systemu durability narzędzi.

Jeśli `ResourceDeposits` ma już odpowiedni stan/respawn, należy go wykorzystać zamiast tworzyć drugi mechanizm.

---

## 6. Powiązania między systemami

Docelowe zależności:

```text
ResourceDeposits
      ↓
    Kilof
      ↓
  materiały
      ↓
  inventory
      ↓
  ┌───────────────┐
  │   Kupiec      │
  └───────┬───────┘
          ↓
   muszle / barter
          ↓
  miecz / namiot / narzędzia
```

oraz:

```text
Namiot → camping → odpoczynek → eksploracja
                                  ↓
                             duże jaskinie
```

oraz:

```text
Strażnik → quest/dialog → nagroda → Miecz
```

Feature'y powinny rozszerzać istniejące systemy zamiast tworzyć równoległe mechanizmy.

---

## 7. Kolejność implementacji

Sugerowana kolejność:

1. **Kilof + mining** — wykorzystuje istniejący `ResourceDeposits` i wzorce HeldTool.
2. **Miecz** — domknięcie już rozpoczętego itemu i podłączenie do quest/dialog oraz Kupca.
3. **Kupiec + podstawowy handel** — NPC, ceny, muszle, barter i UI.
4. **Namiot** — nowy item i rozszerzenie istniejącego campingu.
5. **Generator dużych jaskiń** — wykorzystanie istniejącego terrain modification i landmark placement.
6. **Wóz + koń + polish Kupca** — wizualne domknięcie punktu handlowego.

Kolejność może być zmieniona, jeśli implementacja konkretnego elementu ujawni zależność techniczną.

---

## 8. Poza zakresem

Nie implementować w ramach tego planu:

- durability itemów,
- pełnej ekonomii osad,
- dynamicznych cen,
- podróżujących kupców/karawan,
- jazdy konnej,
- mount systemu,
- dużego systemu podziemi,
- osobnej mapy jaskiń,
- teleportacji do podziemi,
- generowania zawartości jaskiń,
- questów automatycznie generowanych dla jaskiń,
- pełnego systemu craftingu.

---

## 9. Kryteria akceptacji

### Miecz

- [x] `Miecz` jest prawidłowym itemem inventory.
- [x] Można go trzymać w dłoni z gripem (do strojenia w alignment browser).
- [x] Działa w istniejącym melee (28 dmg).
- [x] Strażnik może przekazać go jako nagrodę za quest/dialog.
- [x] Kupiec sprzedaje go za muszle i barter.

### Kupiec

- [x] W domowej osadzie istnieje dokładnie jeden Kupiec.
- [x] Kupiec ma wóz obok siebie.
- [x] Przy wozie znajduje się dekoracyjny koń.
- [x] Interakcja z Kupcem otwiera handel.
- [x] Działa płatność muszlami.
- [x] Działa barter item → item.
- [x] Ceny są skonfigurowane centralnie.

### Namiot

- [x] Namiot jest itemem inventory.
- [x] Można kupić go u Kupca.
- [x] Można go rozstawić na odpowiednim terenie.
- [x] Stojący namiot daje `Odpocznij` i `Złóż namiot`.
- [x] Złożenie zwraca namiot do inventory.
- [x] Odpoczynek wykorzystuje istniejący camping/time-skip.

### Jaskinie

- [x] Generator tworzy wiele dużych jaskiń.
- [x] Otwór ma około 3 × 3 m.
- [x] Tunel ma około 10–15 m.
- [x] Jaskinia jest fizycznie dostępna dla gracza.
- [x] Teren jest rzeczywiście zagłębiony, a nie przykryty wyłącznie wizualnym propem.
- [x] Wejście jest naturalnie otoczone skałami.
- [x] Jaskinie nie kolidują z osadami/drogami/ważnymi landmarkami.
- [x] Pierwsza wersja nie zawiera jeszcze zawartości gameplayowej.

### Kilof

- [x] Kilof jest itemem inventory i można go trzymać.
- [x] `[E] Wydobądź` działa tylko z odpowiednimi złożami (iron/coal/gold), gdy kilof jest w dłoni.
- [x] Można wydobywać węgiel, żelazo i złoto. Kamień zostaje przy łopacie (`dig`), zgodnie z podziałem narzędzi w planie.
- [x] Wydobycie korzysta z istniejącego `ResourceDeposits` (hits z `richness`, sesja bez save).
- [x] Yield respektuje istniejący system inventory/drop.
- [x] Nie powstaje drugi system zarządzania złożami.
- [x] Kilof u Kupca (po slice handlu).
