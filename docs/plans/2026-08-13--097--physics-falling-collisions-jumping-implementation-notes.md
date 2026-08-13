# Implementation Notes: 097 — Physics: falling, collisions, jumping

## Cel dokumentu

Ten dokument jest uzupełnieniem planu:

`docs/plans/2026-08-13--097--physics-falling-collisions-jumping.md`

Ma pomóc Claude Code przeprowadzić implementację bez ponownego analizowania całego repozytorium i bez tworzenia równoległych mechanizmów.

---

## 1. Najważniejsze zalecenie

**Nie wprowadzaj biblioteki fizyki (Rapier/Cannon/Ammo).**

Zakres Seedvale nie wymaga obecnie pełnego rigid-body physics. Potrzebujemy:

- gravity dla dropped items,
- gravity / vertical movement gracza,
- ground detection,
- kolizji postaci z prostymi przeszkodami,
- ograniczenia ruchu wewnątrz przyszłych `CaveVolume`,
- prostego jump.

Własny, deterministyczny collision layer oparty o proste prymitywy jest wystarczający.

Nie implementować:

- rigid bodies,
- impulse solver,
- restitution,
- friction solver,
- stacking,
- ragdolls,
- dynamicznych fizycznych propsów.

---

# 2. Kolejność implementacji

Implementować dokładnie w tej kolejności:

### Faza 2.1 — falling dropped items

Najpierw wyłącznie:

`DroppedItems → falling state → gravity → terrain landing`

Nie zaczynać jeszcze collision systemu.

### Faza 2.2 — collision foundation

Najpierw stworzyć **ogólny, mały collision/query layer**, a dopiero potem podłączać go do:

1. Player
2. NPC
3. Fauna
4. przyszłych CaveVolume

Nie tworzyć osobnego `playerCollision.ts`, `npcCollision.ts`, `caveCollision.ts` z własną logiką.

### Faza 2.3 — jumping

Dopiero po działającym vertical movement + collision.

---

# 3. Faza 2.1 — DroppedItems

Aktualny kod jest bardzo prosty:

`src/items/createDroppedItems.ts`

`DroppedItem` obecnie zawiera:

- `id`
- `kind`
- `x`
- `z`

Mesh jest ustawiany przez:

`placeOnGround(mesh, item.x, item.z, sampleHeight)`

To oznacza, że nie należy przebudowywać całego systemu itemów.

## Zalecana implementacja — zaimplementowane 2026-08-13

Publiczny `DroppedItem` pozostał rekordem pozycji spoczynkowej (`{ id, kind, x, z }`) —
schema save'a (v10) się nie zmieniła.

Runtime ma osobny stan lotu, lokalny do `createDroppedItems.ts`:

```ts
const falling = new Map<string, { vy: number }>()
```

- Stałe modułowe: `DROP_SPAWN_HEIGHT = 0.9` (dłoń/pas), `GRAVITY = 20` (celowo mocniejsza
  niż 9.81 — krótki, czytelny spadek zamiast realistycznego wolnego opadania).
- `drop()`: tworzy `DroppedItem` jak dotąd, wywołuje `spawnMesh(item, DROP_SPAWN_HEIGHT)`
  (nowy opcjonalny `yOffset` na `spawnMesh`, przekazywany dalej do `placeOnGround`'s istniejącego
  `yOffset`), potem `falling.set(item.id, { vy: 0 })`.
- `tick(dt)`: dla każdego wpisu w `falling` — `vy -= GRAVITY*dt`, kandydat
  `mesh.position.y + vy*dt`; jeśli `<= sampleHeight(x,z)` → przypina do gruntu i usuwa z `falling`
  (wraca do dzisiejszego stanu „stoi”, koszt 0); inaczej ustawia `mesh.position.y` na kandydata.
  Early-return gdy `falling.size === 0`.
- `collect()` i `dispose()` też czyszczą wpis z `falling` (usunięty/zebrany w locie item nie może
  zostać osieroconym wpisem w mapie).
- Wywoływane z `gameLoop.ts` obok `bundle.itemSpawners.update(...)`:
  `bundle.droppedItems.tick(dt)`.

**Save/load (rozstrzygnięcie otwartego pytania z planu §6/2.1):** **bez zmiany schematu.**
`x`/`z` nie zmieniają się w locie (brak `vx`/`vz` w v1 — patrz plan pytanie 7), więc zapisany
rekord jest identyczny w locie i po lądowaniu. Item złapany w zapisie w połowie spadku po
wczytaniu po prostu ląduje od razu na `sampleHeight(x,z)` — pominięty fragment lotu trwa
< 0.3 s i < 1 m, niezauważalne (dokładnie ta opcja, którą plan zostawił otwartą jako
akceptowalną). Nie dodano `SaveDataV11`.

**Status:** faza 2.1 zaimplementowana i zweryfikowana technicznie (`tsc`, `lint`, `build`,
`test` — wszystkie przechodzą). Manualna weryfikacja w przeglądarce (widoczny spadek po `G`,
poprawny pickup, save/reload w locie) czeka na usera — patrz plan, sekcja „Weryfikacja”, punkt 1.

Fazy 2.2 (kolizje) i 2.3 (skok) — nie rozpoczęte. Ich specyfikacja jest zamknięta w planie
głównym (sekcja 6); nie duplikować jej tutaj, dopisać do tego dokumentu dopiero przy
implementacji, jeśli w trakcie pracy wyjdą decyzje nieoczywiste z samego planu.
