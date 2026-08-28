# Plan: Cultivation Hydration & Watering

**Created:** 2026-08-24  
**Status:** `verification needed` 🔍  
**Priority:** medium · **Effort:** M  
**Depends on:** ~~174~~ ~~126~~ ~~176~~  
**domain:** `settlements-npcs`  
**Tags:** [items-player, world-terrain, weather]

## Cel

Dodać wspólny system nawodnienia dla istniejących cultivation sites (`Grządka`), obejmujący:

- naturalne wysychanie,
- podlewanie playera,
- podlewanie NPC,
- podlewanie przez deszcz,
- wpływ suszy na cropy,
- wpływ hydration na tempo wzrostu chwastów.

Mechanizm ma rozszerzać istniejący model cultivation z planów `174`/`176`, bez tworzenia równoległego systemu farming.

## 1. Design decisions

| Mechanika | Decyzja v1 |
|---|---|
| Ownership | `hydration` należy do cultivation site |
| Zakres | `0..100` |
| Natural drying | `-20 hydration / world day` |
| Podlewanie | `+40 hydration` |
| Bucket | 1 charge → 1 watering action |
| Rain | zwiększa hydration zależnie od `WeatherState.intensity` |
| `0%` | crop umiera |
| `1–29%` | growth paused + drought stress |
| `≥30%` | normalny growth |
| Drought stress | `-10% yield` za każde 6 h poniżej 30%, max `-50%` |
| Weeds | rosną szybciej przy wyższej hydration |
| `care` | niezależne od hydration |
| NPC | istniejący decision/action lifecycle |
| Global scan | niedozwolony |
| `Pole` / `Ogród` | out of scope |

Wszystkie wartości są initial tuning values, centralizowane i łatwe do późniejszej zmiany.

## 2. Hydration state

Hydration należy do persistent cultivation object z `174`/`176`.

Preferowany model:

```ts
type CultivationHydration = {
  hydration: number // 0..100
  lastHydrationUpdateAtDays: number
}
```

Nie tworzyć osobnego rejestru hydration.

Przed każdą zmianą hydration należy najpierw rozliczyć naturalne wysychanie:

```text
stored hydration
      ↓
elapsed world time
      ↓
natural drying
      ↓
current hydration
      ↓
rain / watering
      ↓
new hydration + timestamp
```

Hydration jest rozliczana lazy.

## 3. Natural drying

Bazowe tempo:

```text
-20 hydration / world day
```

Hydration nie może spaść poniżej `0`.

Nie implementować per-frame/per-tick aktualizacji wszystkich cultivation sites.

W przyszłości tempo wysychania może zostać rozszerzone o istniejące czynniki środowiskowe, np. temperaturę lub sezon, ale nie jest to część v1.

## 4. Deszcz

Istniejący `WeatherState` pozostaje źródłem informacji o opadach.

Deszcz zwiększa hydration cultivation site:

```text
rain intensity
      ↓
rain contribution
      ↓
hydration
```

Efekt opadu powinien być zależny od intensywności deszczu i czasu jego trwania.

Hydration jest ograniczone do:

```ts
Math.min(100, hydration)
```

Nie tworzyć osobnego systemu rain-for-farming.

Nie skanować wszystkich pól podczas każdego deszczu. Efekt opadu powinien być rozliczany lazy na podstawie czasu, lokalizacji cultivation site i deterministycznego stanu pogody.

Jeżeli obecny weather system nie pozwala na takie rozliczenie, należy rozszerzyć istniejący model weather zamiast tworzyć farming-specific weather state.

## 5. Crop hydration

Nie zmieniać istniejącego `CropLifecycle` w drugi lifecycle.

Hydration jest warunkiem środowiskowym cultivation site.

### Reguły

```text
hydration = 0%
    → crop dies

hydration = 1–29%
    → growth paused
    → drought stress accumulates

hydration ≥ 30%
    → normal growth
```

Powrót powyżej `30%` zatrzymuje dalsze narastanie stressu i pozwala cropowi ponownie rosnąć.

Nie zmieniać długości istniejącego lifecycle `young → mature → spoiled` proporcjonalnie do hydration w v1.

## 6. Drought stress

Drought stress reprezentuje konsekwencje długotrwałego niedoboru wody.

Nie musi być przechowywany jako osobny tickowany stan.

Bazowa reguła:

```text
hydration < 30%
        ↓
6 h accumulated drought
        ↓
-10% harvest yield
```

Maksymalna kara:

```text
-50% yield
```

Czyli:

```text
0–6 h    → 0%
6–12 h   → -10%
12–18 h  → -20%
18–24 h  → -30%
24–30 h  → -40%
30 h+    → -50%
```

`0%` jest stanem śmiertelnym i powinien być rozstrzygany przed samą kalkulacją yield.

Stress powinien być deterministyczny i możliwy do wyliczenia z historii hydration, bez per-crop tickowania.

Jeżeli implementacja wymaga zachowania historii kilku okresów suszy, przechowywać minimalny stan potrzebny do deterministycznego rozliczenia, zamiast historii wszystkich zmian.

Drought stress resetuje się po zakończeniu/zbiorze cropa, a samo ponowne podlanie nie usuwa już naliczonego stresu.

## 7. Harvest productivity

Drought stress wpływa na końcowy yield cropa.

Nie modyfikować samego `CropLifecycle`.

Koncepcyjnie:

```text
CropLifecycle
    ↓
base harvest
    +
cultivation hydration/stress
    ↓
final yield
```

Przykład:

```text
base yield = 5
drought penalty = 20%
→ final yield = 4
```

Rounding musi być deterministyczny i zdefiniowany w jednym miejscu.

Nie pozwalać, aby zwykła kara za suszę przypadkowo zmieniała crop lifecycle.

## 8. Weeds

Hydration wpływa na tempo wzrostu chwastów.

Nie tworzyć osobnego weed simulation system.

Docelowo:

```text
hydration
   ↓
weed growth pressure
   ↓
weeds present
   ↓
maintenance pressure
```

Pierwsza wersja może używać progów:

```text
0–19%    → no/very slow weed growth
20–49%   → slow
50–79%   → normal
80–100%  → fast
```

Dokładne wartości wzrostu chwastów powinny być centralnymi parametrami.

`care` pozostaje niezależnym stanem:

```text
hydration → weed growth pressure
care      → current maintenance state
```

Nie tworzyć drugiego `weed lifecycle`.

## 9. Player: water container

Dodać prosty item na wodę, np. `bucket`, wykorzystując istniejący system itemów.

V1:

```text
Empty Bucket
    ↓
fill at WaterSource
    ↓
Full Bucket
    ↓
water cultivation site
    ↓
Empty Bucket
```

Jedno napełnienie = jedna akcja podlewania.

Nie implementować:

- częściowego napełnienia,
- różnych pojemności,
- jakości wiader,
- durability wiadra,
- specjalnego equipment system.

Jeżeli obecny item-instance model jest odpowiedni do reprezentowania stanu `empty/full`, wykorzystać istniejący mechanizm.

## 10. WaterSource

Wykorzystać istniejący `WaterSource`.

Źródła, które istniejący system udostępnia do pobierania wody, mogą napełniać bucket.

Nie tworzyć osobnych typów `FarmWaterSource`, `IrrigationSource` ani `WateringSource`.

WaterSource pozostaje wspólną abstrakcją dla całego świata.

## 11. Fill bucket

Player może napełnić pusty bucket przy kompatybilnym `WaterSource`.

Akcja powinna korzystać z istniejącego action/busy mechanism.

```text
Empty Bucket
     +
WaterSource
     ↓
timed action
     ↓
Full Bucket
```

Stan zmienia się dopiero po zakończeniu akcji.

## 12. Water cultivation site

Podlewanie jest istniejącą timed action, nie osobnym timerem.

```text
[E] Podlej
    ↓
validate site
    ↓
validate full bucket
    ↓
timed action
    ↓
revalidate
    ↓
hydration +40
    ↓
bucket becomes empty
```

Jeżeli akcja zostanie przerwana przed zakończeniem:

```text
hydration unchanged
bucket unchanged
```

Nie zwiększać hydration przy rozpoczęciu akcji.

## 13. NPC watering

NPC korzysta z tego samego cultivation hydration i tej samej watering action.

Nie tworzyć `WateringAI`, `FarmAI`, `GardenAI` ani `IrrigationAI`.

NPC może rozważyć podlewanie, gdy ma lokalny kontekst cultivation site i hydration jest niskie.

```text
NPC at cultivation site
        ↓
hydration low
        ↓
existing needs/health gates
        ↓
existing decision system
        ↓
watering action
```

NPC nie skanuje globalnie wszystkich pól i nie wymaga nowego schedulera.

## 14. NPC water handling

Wykorzystać istniejący NPC inventory/item/action model.

Docelowo:

```text
WaterSource
    ↓
fill container
    ↓
NPC carries water
    ↓
watering action
```

Jeżeli obecny NPC system nie pozwala jeszcze na sensowne przenoszenie/wykorzystanie bucketu, rozszerzyć istniejący mechanizm.

Nie tworzyć `NpcWaterSystem`, `NpcWateringTool` ani `NpcHeldWater`.

## 15. Care integration

Hydration i maintenance pozostają niezależne:

```text
CultivationSite
├── care
└── hydration
```

Przykłady:

```text
care 90 + hydration 10
→ zadbane, suche

care 20 + hydration 90
→ zaniedbane, mokre
```

Deszcz zwiększa hydration i może zwiększać weed pressure.

Maintenance zwiększa `care`, ale nie hydration.

Podlewanie zwiększa hydration, ale nie `care`.

## 16. Persistence & lazy simulation

Hydration musi działać po:

- save/load,
- time skip,
- chunk unload/load,
- world rebuild.

Nie przechowywać historii pogody ani historii podlewania.

Stan powinien być minimalny i deterministyczny.

Unloaded cultivation site nie wymaga aktywnej symulacji.

## 17. Performance

Wymagania:

- brak per-frame hydration tick,
- brak globalnego skanowania cultivation sites,
- brak globalnego skanowania NPC → fields,
- brak nowego workera,
- brak `WateringManager`,
- brak osobnego weather simulation dla farming,
- lazy hydration resolution,
- reuse istniejących world objects, Weather, WaterSource, Inventory i action systems.

## 18. Out of scope

Nie implementować:

- automatycznego irrigation,
- kanałów,
- systemów nawadniających,
- retencji wody,
- typów gleby,
- tile-level soil moisture,
- realistycznego parowania,
- nowych typów cultivation sites (`Pole`, `Ogród`),
- zaawansowanego weed lifecycle,
- automatycznego farmera.

Przyszły kierunek:

```text
Grządka
Pole
Ogród
```

powinien korzystać ze wspólnego `CultivationSite`, ale wymaga osobnego planu/rozszerzenia placementu.

## 19. Verification

### Technical

Testy:

- hydration degradation,
- hydration clamp `0..100`,
- watering `+40`,
- rain contribution,
- `0%` crop death,
- `<30%` growth pause,
- drought stress,
- yield penalty,
- stress cap `-50%`,
- weed growth rate zależny od hydration,
- bucket empty/full,
- fill bucket,
- watering consumes bucket charge,
- interrupted watering,
- save/load,
- time skip,
- chunk unload/load.

### Browser / gameplay

1. Grządka istniejąca z `174/176`.
2. Hydration spada wraz z czasem.
3. Player napełnia bucket przy WaterSource.
4. Player podlewa grządkę.
5. Bucket zostaje pusty.
6. Hydration wzrasta.
7. Deszcz zwiększa hydration.
8. Crop przy `≥30%` rośnie normalnie.
9. Crop przy `<30%` zatrzymuje wzrost.
10. Dłuższa susza zmniejsza potencjalny yield.
11. `0%` zabija crop.
12. Mokre pole generuje większą presję chwastów.
13. Suche pole generuje małą presję chwastów.
14. NPC może podlać cultivation site przez istniejący decision/action flow.
15. Wszystko działa po time skip/save/load/chunk reload.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
