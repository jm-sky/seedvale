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

## Zalecana implementacja

Publiczny `DroppedItem` może pozostać rekordem pozycji spoczynkowej.

Runtime powinien mieć osobny stan:

```ts
type FallingDrop = {
  vy: number
}
