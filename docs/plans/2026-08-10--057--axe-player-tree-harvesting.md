# Siekiera i ścinanie drzew przez gracza — v1

**Status:** `verification needed`
**Created:** 2026-08-10
**Related:** [058 — Living Forest / Tree Lifecycle](./2026-08-10--058--living-forest-tree-lifecycle.md)
**Related pattern:** [052 — Shovel: digging & finding stones](./2026-08-10--052--shovel-digging-and-finding-stones.md)

**Implemented (2026-08-11):** siekiera + 3-etapowe ścinanie (`mature → limbed → felled → harvested`), yield `branch` (2/2/3), wspólny API z NPC. Fakty w [`docs/STATE.md`](../STATE.md); szczegóły decyzji w [implementation notes](./2026-08-10--057--axe-player-tree-harvesting-implementation-notes.md).

## Cel

Dodać pierwsze narzędzie służące do pozyskiwania zasobu ze świata:

```text
item → player action → world interaction → resource
```

Gracz może znaleźć / zdobyć siekierę, wyposażyć ją i użyć do ścinania dojrzałych drzew (oraz kontynuować kolejne etapy ściętego drzewa).

Plan powinien wykorzystywać lifecycle drzew z 058, a nie tworzyć osobnego systemu „player tree chopping”.

## Gameplay

Minimalny flow:

```text
Player
  ↓
axe held?
  ↓ yes
chop prompt on mature / limbed / felled
  ↓
[E] → BusyAction (~1.5 s)
  ↓
advanceHarvest (one step)
  ↓
TreeState: mature → limbed → felled → harvested
  ↓
branch → Inventory
```

Siekiera nie powinna działać na:

- saplings,
- young trees,
- już w pełni ścięte drzewa (`harvested` / sam pień czekający na regrowth),
- obiekty niebędące drzewami.

## Tool

Wykorzystać istniejący model inventory/equipment i istniejący mechanizm interakcji.

Nie tworzyć osobnego input handlera tylko dla siekiery.

Docelowo narzędzie powinno być opisane przez dane / capability, np.:

```text
Axe
 └── canHarvest(Tree)
```

Dzięki temu NPC i gracz mogą korzystać z tego samego mechanizmu harvestingu:

```text
advanceHarvest / harvestFully
├── NPC (harvestFully w jednym chop)
└── Player (jeden etap na [E])
```

## Tree lifecycle

Ścięcie przez gracza musi korzystać z `TreeState` z planu 058, rozszerzonego o etapy chopu:

```text
mature
  ↓  (+2 branch)  limbed   — tall trunk / stripped
  ↓  (+2 branch)  felled   — low stump + fallen log
  ↓  (+3 branch)  harvested — stump only
  ↓  (world days) sapling regrowth
```

`limbed` / `felled` nie awansują z czasem — tylko `harvested` wraca do regrowth.

Nie usuwać drzewa wyłącznie z renderera. Zmiana musi być zapisana w stanie świata, aby streaming chunków nie przywrócił pełnego drzewa.

## Resource

Ścięcie daje `branch` przez istniejący model item/resource (nie osobne `wood`).

Nie implementować jeszcze:

- pełnego magazynu drewna,
- craftingu,
- ekonomii,
- sprzedaży drewna.

Te mechanizmy powinny później konsumować wynik harvestingu.

## Feedback

Pierwsza wersja powinna mieć czytelny feedback:

- BusyAction + dźwięk siekiery na każdym etapie,
- zmiana modelu (limbed / pień+kłoda / pień),
- toast z liczbą gałęzi.

Nie jest wymagane realistyczne przewracanie drzewa w v1.

## Performance

Nie wykonywać ciągłego raycastu ani ciężkiej symulacji dla wszystkich drzew.

Interakcja jest lokalna i dotyczy wybranego celu. Lifecycle/growth pozostaje systemem danych z 058.

Nie przenosić prostej pojedynczej interakcji do workera tylko dlatego, że Seedvale używa workerów. Worker może mieć sens później dla masowej symulacji drzew/growth, nie dla pojedynczego `chop`.

## Poza zakresem

- realistyczna fizyka upadku,
- pniaki do dalszego kopania,
- różne typy siekier,
- durability narzędzia,
- crafting siekiery,
- animacja postaci wysokiej jakości,
- pełny system narzędzi.

## Kryteria akceptacji

- Gracz może posiadać i wyposażyć siekierę.
- Bez siekiery akcja ścinania nie jest dostępna.
- Gracz może ścinać tylko dojrzałe drzewa (oraz kontynuować etapy `limbed` / `felled`).
- Ścięcie zmienia faktyczny `TreeState` (3 etapy: mature → limbed → felled → harvested).
- Po opuszczeniu i ponownym załadowaniu chunku drzewo pozostaje na właściwym etapie.
- Gracz otrzymuje `branch` przez istniejący resource/inventory flow.
- Mechanizm harvestingu jest współdzielony z NPC zamiast tworzenia drugiej implementacji.
- Wizualny efekt jest jednoznaczny dla gracza (limbed / pień+kłoda / pień).

## Zasada projektowa

> **Siekiera jest narzędziem do istniejącej interakcji ze światem, a nie początkiem osobnego systemu ścinania drzew.**

Plan 058 odpowiada za życie drzewa. Ten plan odpowiada za możliwość wykonania harvestingu przez gracza (w tym wieloetapowego chopu).
