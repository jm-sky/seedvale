# Siekiera i ścinanie drzew przez gracza — v1

**Status:** `planned`
**Created:** 2026-08-10
**Related:** [058 — Living Forest / Tree Lifecycle](./2026-08-10--058--living-forest-tree-lifecycle.md)
**Related pattern:** [052 — Shovel: digging & finding stones](./2026-08-10--052--shovel-digging-and-finding-stones.md)

## Cel

Dodać pierwsze narzędzie służące do pozyskiwania zasobu ze świata:

```text
item → player action → world interaction → resource
```

Gracz może znaleźć / zdobyć siekierę, wyposażyć ją i użyć do ścinania dojrzałych drzew.

Plan powinien wykorzystywać lifecycle drzew z 058, a nie tworzyć osobnego systemu „player tree chopping”.

## Gameplay

Minimalny flow:

```text
Player
  ↓
has axe?
  ↓ yes
chop action available
  ↓
select mature tree
  ↓
validate distance / target / tree state
  ↓
perform chop
  ↓
TreeState → harvested / stump
  ↓
wood → existing inventory/resource flow
```

Siekiera nie powinna działać na:

- saplings,
- young trees,
- już ścięte drzewa,
- stump / dead wood,
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
HarvestAction
├── NPC
└── Player
```

## Tree lifecycle

Ścięcie przez gracza musi korzystać z `TreeState` z planu 058:

```text
mature
  ↓
harvested
  ↓
stump / regrowth
```

Nie usuwać drzewa wyłącznie z renderera. Zmiana musi być zapisana w stanie świata, aby streaming chunków nie przywrócił pełnego drzewa.

## Resource

Ścięcie daje `wood` przez istniejący model item/resource.

Nie implementować jeszcze:

- pełnego magazynu drewna,
- craftingu,
- ekonomii,
- sprzedaży drewna.

Te mechanizmy powinny później konsumować wynik harvestingu.

## Feedback

Pierwsza wersja powinna mieć czytelny feedback:

- animacja / prosty efekt uderzenia,
- dźwięk siekiery,
- zmiana drzewa na stump,
- otrzymanie drewna.

Nie jest wymagane realistyczne przewracanie drzewa w v1.

## Performance

Nie wykonywać ciągłego raycastu ani ciężkiej symulacji dla wszystkich drzew.

Interakcja jest lokalna i dotyczy wybranego celu. Lifecycle/growth pozostaje systemem danych z 058.

Nie przenosić prostej pojedynczej interakcji do workera tylko dlatego, że Seedvale używa workerów. Worker może mieć sens później dla masowej symulacji drzew/growth, nie dla pojedynczego `chop`.

## Poza zakresem

- siekanie drzewa wieloma etapami,
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
- Gracz może ścinać tylko dojrzałe drzewa.
- Ścięcie zmienia faktyczny `TreeState`.
- Po opuszczeniu i ponownym załadowaniu chunku drzewo pozostaje ścięte.
- Gracz otrzymuje drewno przez istniejący resource/inventory flow.
- Mechanizm harvestingu jest współdzielony z NPC zamiast tworzenia drugiej implementacji.
- Wizualny efekt jest jednoznaczny dla gracza.

## Zasada projektowa

> **Siekiera jest narzędziem do istniejącej interakcji ze światem, a nie początkiem osobnego systemu ścinania drzew.**

Plan 058 odpowiada za życie drzewa. Ten plan odpowiada za możliwość wykonania harvestingu przez gracza.
