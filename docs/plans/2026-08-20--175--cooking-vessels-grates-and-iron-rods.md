# Plan: Cooking Vessels, Grates & Iron Rods

**Created:** 2026-08-20  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** M  
**Depends on:** ~~106~~

## Cel

Rozszerzyć istniejący system gotowania o wyposażenie zwiększające liczbę kawałków mięsa możliwych do przygotowania jednocześnie:

- patelnia → do 2 kawałków mięsa,
- ruszt → do 4 kawałków mięsa.

Dodatkowo wprowadzić **żelazny pręt** jako normalny przedmiot świata/inventory, używany między innymi do budowy rusztu.

Nie tworzyć nowego systemu craftingu ani równoległego systemu gotowania.

## 1. Patelnia

Patelnia jest normalnym przedmiotem inventory.

Jeżeli gracz posiada patelnię, istniejący proces gotowania może przyjąć jednocześnie:

- `2 × raw_meat`
- i wytworzyć `2 × roasted_meat`.

Patelnia nie jest osobnym cooking station.

Jeżeli dostępny jest ruszt, ruszt zapewnia większą pojemność i ma pierwszeństwo przed patelnią.

## 2. Ruszt do pieczenia

Ruszt jest **wyposażeniem istniejącego ogniska**, a nie przedmiotem noszonym w inventory.

Po zbudowaniu:

- jest fizycznie widoczny przy ognisku,
- pozostaje przypisany do konkretnego ogniska,
- zwiększa jego capacity gotowania do **4 kawałków mięsa jednocześnie**.

Nie zakładać w architekturze, że ruszt jest dostępny wyłącznie dla `firepit`.

`firepit` i `campfire` są różnymi istniejącymi typami/konceptami ogniska. Mechanika rusztu powinna być oparta na możliwości danego ogniska do obsługi rusztu, a nie na twardym sprawdzaniu jednego typu.

Docelowo pozwala to innym typom ognisk również wspierać ruszt bez przebudowy systemu gotowania.

## 3. Budowanie rusztu

Gracz może zbudować ruszt przy odpowiednim istniejącym ognisku.

Wymagania:

- istniejące ognisko,
- drewno,
- kamienie,
- żelazne pręty.

Konkretne ilości materiałów należy ustalić podczas implementacji na podstawie istniejącej ekonomii i systemu budowania; nie tworzyć nowych abstrakcyjnych zasobów wyłącznie dla tego planu.

Ruszt jest jednorazowym ulepszeniem danego ogniska.

Po zbudowaniu nie powinno być możliwe wielokrotne zużycie materiałów przez ponowne wykonanie tej samej konstrukcji.

Wykorzystać istniejący system interakcji/budowania obiektów świata, o ile zapewnia odpowiedni mechanizm.

## 4. Żelazny pręt

Dodać **żelazny pręt** jako normalny `ItemKind` / przedmiot świata.

Powinien:

- być przechowywalny w inventory,
- mieć własną definicję w istniejącym katalogu przedmiotów,
- być możliwy do wykorzystania jako materiał konstrukcyjny,
- być dostępny jako materiał wymagany przez ruszt.

Nie dodawać w tym planie pełnego systemu hutnictwa.

Jeżeli obecny kod nie zapewnia jeszcze sposobu pozyskania żelaznych prętów, implementacja powinna jasno oddzielić:

`iron rod jako item`

od

`produkcja iron rod`.

Produkcja może pozostać poza zakresem tego planu, ale ruszt nie może zostać zaprojektowany tak, aby wymagał nieistniejącego abstrakcyjnego zasobu `iron`.

## 5. Capacity gotowania

Istniejący cooking flow z planu 106 powinien zostać rozszerzony z pojedynczego wejścia:

`raw_meat + cooking station → roasted_meat`

do obsługi wielu sztuk:

`raw_meat × N + cooking station → roasted_meat × N`

Capacity:

| Wyposażenie | Maks. mięsa |
|---|---:|
| zwykłe ognisko | 1 |
| patelnia | 2 |
| ruszt | 4 |

Nie tworzyć osobnych recept dla 1/2/3/4 kawałków mięsa.

Capacity powinna być właściwością/cechą dostępnego wyposażenia stanowiska.

## 6. Priorytet wyposażenia

Jeżeli gracz posiada patelnię, ale korzysta z ogniska wyposażonego w ruszt:

**ruszt wygrywa** i dostępna jest pojemność 4.

Nie sumować pojemności:

`patelnia 2 + ruszt 4 ≠ 6`.

Maksymalna pojemność stanowiska wynosi 4.

## 7. Integracja z NPC

Nie dodawać specjalnego systemu gotowania dla NPC.

Jeżeli istniejący NPC cooking flow korzysta ze stanowisk gotowania, powinien automatycznie korzystać z capacity wynikającego z wyposażenia konkretnego ogniska.

Ruszt jest właściwością świata/stanowiska, więc NPC nie musi posiadać go w inventory.

Nie implementować w tym planie mechanizmu, dzięki któremu NPC sam buduje ruszt.

## 8. Suszenie mięsa

**Suszenie mięsa nie należy do tego planu.**

Istniejący plan `159 — Natural Food, Fishing, Preservation and Bait` obejmuje już suszarkę oraz preservation.

Ten plan nie powinien tworzyć drugiego mechanizmu suszenia ani zmieniać zakresu planu 159.

Gotowanie i suszenie pozostają dwoma różnymi procesami:

- ruszt → pieczenie,
- suszarka → suszenie/preservation.

## 9. Wizualizacja i assety

Przed implementacją sprawdzić istniejące assety zgodnie z:

- `docs/assets/MODELS.md`,
- `docs/assets/SOUNDS.md`.

Potrzebne mogą być:

- model patelni,
- model rusztu,
- model żelaznego pręta,
- elementy wizualne rusztu przy ognisku.

Jeżeli asset nie istnieje, postępować zgodnie z istniejącym asset backlogiem i zasadami `CLAUDE.md`.

Ruszt powinien wyglądać jak fizyczne wyposażenie ogniska, a nie jak niezależny obiekt magicznie udostępniający cooking interaction.

## Poza zakresem

- generalny crafting system,
- pełny system hutnictwa,
- produkcja żelaznych prętów, jeżeli wymaga nowego systemu metalurgii,
- nowe receptury żywności,
- spoilage/freshness,
- nutrition,
- drugi system suszenia,
- osobny system `GrateManager`,
- osobny system `CookingManager`,
- specjalny NPC cooking system,
- przebudowa `firepit` / `campfire` na jeden wspólny typ.

## Architektura

Rozszerzyć istniejące mechanizmy z planu 106:

- `Inventory`,
- `ItemKind` / item catalog,
- cooking/processing,
- istniejące ogniska,
- istniejące interakcje i budowanie obiektów świata.

Preferowana zależność:

`firepit/campfire → cooking capability → optional grate → cooking capacity`

oraz:

`inventory → pan → cooking capacity`

Nie tworzyć równoległych źródeł prawdy dla gotowania.

## Weryfikacja

### Techniczna

```text
pnpm tsc --noEmit
pnpm lint:fix
pnpm build
pnpm test
```

### Manualna / browser

1. zwykłe ognisko nadal pozwala przygotować 1 mięso,
2. patelnia zwiększa capacity do 2,
3. bez patelni capacity pozostaje 1,
4. gracz może zbudować ruszt przy obsługiwanym ognisku,
5. budowa zużywa drewno, kamienie i żelazne pręty,
6. po zbudowaniu ruszt jest widoczny przy właściwym ognisku,
7. ruszt zwiększa capacity do 4,
8. patelnia + ruszt nie daje capacity 6,
9. ruszt jest przypisany do konkretnego ogniska,
10. ponowna próba budowy istniejącego rusztu nie zużywa materiałów,
11. `iron_rod` działa jak normalny item inventory,
12. `raw_meat × N → roasted_meat × N` działa dla dostępnej capacity,
13. istniejące gotowanie z planu 106 nie ulega regresji,
14. suszenie z planu 159 nie zostaje zdublowane ani zepsute.

Oddzielić w implementation notes status:

- implemented,
- technically verified,
- browser/manual verified.

**Zrób git commit i push do main, rebase jeżeli trzeba**
