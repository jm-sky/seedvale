# Plan: Natural Resource Gathering & Water Distribution

**Created:** 2026-08-15
**Status:** `verification needed` 🔍 — first complete water path (well → NPC carrying → household `WaterBarrel`/`AnimalTrough`) implemented per the [implementation notes](./2026-08-15--122--natural-resource-gathering-and-water-distribution-implementation-notes.md)'s narrower scope; technical verification green; no browser test yet. Village Storehouse (§6) and wood/branches/stone/ore generalisation beyond the water path (§7/§8, mostly already covered by the pre-existing chop/deposit + garden gather flow) intentionally deferred — see implementation notes §6/§8.
**Priority:** high · **Effort:** M
**Depends on:** ~~032~~

## Cel

Dodać rzeczywiste pozyskiwanie naturalnych zasobów przez NPC oraz przepływ zasobów do gospodarstw i osady.

Pierwszym pełnym przykładem będzie woda:

```text
Studnia
  ↓
NPC pobiera wodę
  ↓
NPC Inventory
  ↓
beczka / koryto przy domu
  ↓
NPC / zwierzę pije
```

Pozostałe zasoby powinny korzystać z tego samego mechanizmu:

```text
Natural Resource
      ↓
NPC gathering
      ↓
Inventory
      ↓
Household / Settlement storage
      ↓
Consumption / Production
```

Nie tworzyć równoległego systemu Natural Resources. Wykorzystać istniejące `NaturalResource`, deposits, `Inventory`, `ItemKind`, profesje, work/actions, `Household` i `SettlementEconomy`.

---

## Zakres

### 1. Generic resource gathering

Dodać generyczny mechanizm pozyskiwania zasobów przez NPC.

Pierwsze typy:

- wood
- branches
- stone / ore
- food
- water

Mechanizm powinien pozwalać rozszerzać listę zasobów przez konfigurację, a nie przez osobne implementacje dla każdego typu.

```text
NPC decision
    ↓
wybór potrzebnego zasobu
    ↓
findBestResource(...)
    ↓
konkretny resource / source
    ↓
goTo(...)
    ↓
gather action
    ↓
NPC Inventory
```

---

### 2. Woda jako pierwszy pełny resource flow

Woda powinna być traktowana jako zasób transportowany przez świat.

#### Źródło

Wykorzystać istniejącą studnię jako źródło wody.

```text
studnia
  ↓
nabranie wody
  ↓
water w Inventory
```

Nie dodawać teleportowania wody bezpośrednio do gospodarstwa.

#### Magazynowanie

Dodać fizyczne miejsca przechowywania wody przy domu:

- `WaterBarrel` — woda dla domowników
- `AnimalTrough` — woda dla zwierząt domowych

Obiekty powinny być rzeczywistymi miejscami świata i możliwymi celami istniejących mechanizmów `Place` / interakcji.

```text
Well
 ↓
NPC Inventory
 ├──→ Water Barrel
 └──→ Animal Trough
```

Nie tworzyć osobnego systemu storage wyłącznie dla wody.

---

### 3. Potrzeba wody NPC

NPC z potrzebą `thirst` powinien wyszukiwać dostępne źródło wody.

```text
Need: thirst
      ↓
findNearestUsableWaterSource()
      ↓
Water Barrel / other valid source
      ↓
goTo(...)
      ↓
drink
      ↓
water source quantity -= consumption
```

Preferować lokalną, zgromadzoną wodę zamiast każdorazowego chodzenia do studni.

Przykładowo:

```text
1. własny / domowy Water Barrel
2. inne dostępne magazynowane źródło
3. publiczne źródło wody
4. naturalne źródło, jeżeli jest dopuszczone
```

Dokładna hierarchia powinna zostać oparta o istniejące mechanizmy `Place`, potrzeb i dostępności.

---

### 4. Potrzeba wody zwierząt domowych

Zwierzęta domowe powinny korzystać z tego samego ogólnego modelu wyszukiwania źródła wody.

```text
Animal: thirst
      ↓
findNearestUsableWaterSource()
      ↓
Animal Trough
      ↓
drink
      ↓
trough quantity -= consumption
```

Koryto powinno być przypisane do gospodarstwa / miejsca, w którym utrzymywane są zwierzęta.

Nie tworzyć osobnego mechanizmu zaopatrywania zwierząt w wodę.

---

### 5. NPC jako dostawca wody

NPC powinien uzupełniać wodę w domu jako normalną pracę / działanie.

```text
Water Barrel low
      ↓
Household problem / pressure
      ↓
NPC wybiera water gathering
      ↓
goTo(Well)
      ↓
gather water
      ↓
Inventory
      ↓
goTo(Home / Barrel)
      ↓
deposit water
```

Analogicznie dla `AnimalTrough`.

Woda nie powinna pojawiać się automatycznie w kontenerze.

---

### 6. Domowy / wiejski storage

Dodać fizyczny obiekt magazynowy dla zasobów wioski, jeżeli istniejący `SettlementEconomy` nie ma już odpowiednika w świecie.

Preferowany kierunek:

```text
Village Storehouse / Storage Shed
```

Nie tworzyć nowego abstrakcyjnego systemu magazynowania.

Obiekt powinien pełnić rolę:

```text
Place
  +
Storage
```

i wykorzystywać istniejące `Inventory` / `ItemKind` / `SettlementEconomy`.

Pierwszy zakres może ograniczyć magazyn do:

- wood
- branches
- stone / ore
- food

Woda może pozostać lokalnie magazynowana w beczkach i korytach.

---

### 7. Gathering food

Dodać `gather food` jako kolejnego konsumenta generycznego mechanizmu.

Źródło powinno wynikać z istniejącego świata, np.:

- field
- garden
- forest food
- odpowiednie istniejące world resources

Nie tworzyć osobnego food gathering system.

```text
Food source
    ↓
NPC gathers
    ↓
Inventory
    ↓
Household / Settlement storage
    ↓
NPC consumption
```

---

### 8. Gathering wood / branches / stone / ore

Podłączyć istniejące zasoby do tego samego przepływu.

Szczególnie ważne:

- wykorzystać istniejący `TreeLifecycle`,
- wykorzystać istniejące harvest/depletion,
- nie tworzyć drugiego systemu ścinania drzew,
- wykorzystać istniejące resource deposits,
- zachować odnawialność tam, gdzie istnieje już lifecycle zasobu.

Przykład:

```text
Living Tree
    ↓
NPC gathers wood
    ↓
existing tree harvest/lifecycle
    ↓
wood item
    ↓
Inventory
    ↓
Storage
```

---

### 9. Decyzja o pracy

Nie dodawać osobnego `ResourceGatheringManager`.

Gathering powinien zostać podłączony do istniejącego przepływu:

```text
NPC state
 + needs
 + profession
 + household demand
 + settlement demand
 + available resources
        ↓
decision
        ↓
work/gather action
```

Profesja powinna wpływać na preferencję i efektywność pracy, ale nie powinna być jedynym warunkiem możliwości zebrania zasobu.

---

### 10. Transport

Transport powinien być rzeczywistym działaniem NPC.

Nie:

```text
gather()
→ addToStorage()
```

jeżeli NPC ma transportować zasób.

Preferowany przepływ:

```text
source
 ↓
gather
 ↓
NPC Inventory
 ↓
walk
 ↓
destination
 ↓
deposit
```

Dzięki temu transport stanie się później podstawą bardziej zaawansowanej ekonomii.

---

### 11. Reuse existing systems

Przed dodaniem nowych typów sprawdzić istniejące implementacje:

- `NaturalResource`
- resource deposits
- `Inventory`
- `ItemKind`
- `Household`
- `SettlementEconomy`
- `Place`
- NPC `Schedule`
- NPC FSM / actions
- professions / roles
- needs
- existing resource-aware decisions
- tree lifecycle / harvest
- existing water well interaction

Nowe mechanizmy powinny rozszerzać te systemy.

Nie tworzyć:

- `WaterSystem`
- `FoodGatheringSystem`
- `WoodGatheringSystem`
- `NpcResourceManager`
- osobnego storage systemu
- osobnej ekonomii gospodarstwa

jeżeli istniejące systemy mogą pełnić te role.

---

### 12. Persistence

Gathered resources i stan kontenerów muszą zachowywać się poprawnie przy streamingu świata.

W szczególności sprawdzić:

```text
Water Barrel quantity
Animal Trough quantity
Storage quantity
resource depletion
tree lifecycle
```

Nie wystarczy przechowywanie stanu wyłącznie w aktywnych obiektach Three.js.

Wykorzystać istniejący world persistence.

---

## Implementation phases

### Phase 1 — Audit istniejących systemów

Zweryfikować aktualny codebase i wskazać konkretne pliki / funkcje odpowiedzialne za:

- resources,
- deposits,
- Inventory,
- ItemKind,
- Household,
- SettlementEconomy,
- Place,
- NPC decisions,
- NPC actions,
- needs,
- water well,
- domestic animals,
- tree lifecycle.

Nie implementować przed zakończeniem audytu.

---

### Phase 2 — Generic resource gathering

Dodać generyczny mechanizm:

```text
resource target
    ↓
find target
    ↓
goTo
    ↓
gather
    ↓
Inventory
```

Najpierw uruchomić go dla jednego prostego zasobu.

---

### Phase 3 — Water logistics

Dodać:

```text
Well
 ↓
Water
 ↓
NPC Inventory
 ↓
Water Barrel / Animal Trough
```

oraz:

```text
NPC thirst
 ↓
nearest usable water source
 ↓
drink
```

i:

```text
Animal thirst
 ↓
nearest usable water source
 ↓
drink
```

---

### Phase 4 — Resource gathering expansion

Podłączyć:

- wood,
- branches,
- stone / ore,
- food.

Wykorzystywać istniejące resource/lifecycle mechanisms.

---

### Phase 5 — Village storage

Dodać fizyczny `Village Storehouse` / `Storage Shed`, jeżeli audyt potwierdzi brak odpowiedniego istniejącego obiektu.

Podłączyć go do istniejących `Inventory` / `SettlementEconomy`.

---

### Phase 6 — Household / settlement demand

Sprawić, aby brak zasobów mógł wpływać na decyzje NPC:

```text
low water
 ↓
household problem
 ↓
pressure
 ↓
NPC gathers water
```

Analogicznie dla podstawowych zasobów.

Nie tworzyć osobnego `resource request system`, jeśli istniejący `needs/problems/pressures` może obsłużyć ten przepływ.

---

## Acceptance criteria

### Water

- NPC może pobrać wodę ze studni.
- Pobrana woda znajduje się w `Inventory`.
- NPC może dostarczyć wodę do beczki.
- NPC może dostarczyć wodę do koryta.
- Beczka ma rzeczywisty stan ilości wody.
- Koryto ma rzeczywisty stan ilości wody.
- NPC z potrzebą picia może znaleźć dostępne źródło.
- NPC preferuje lokalną zgromadzoną wodę, jeżeli jest dostępna.
- Zwierzę domowe może znaleźć koryto i napić się.
- Zużycie wody zmniejsza ilość w kontenerze.
- Brak wody może prowadzić do ponownego gathering/transport.

### Other resources

- NPC może zebrać wood.
- NPC może zebrać branches.
- NPC może zebrać stone/ore tam, gdzie istnieje odpowiedni resource.
- NPC może zebrać food z istniejących źródeł.
- Rezultat trafia do `Inventory`.
- Zasób w świecie zmienia stan zgodnie z istniejącym lifecycle/depletion.

### Storage

- Wieś ma fizyczne miejsce magazynowania materiałów, jeśli audyt potwierdzi brak istniejącego odpowiednika.
- Storage wykorzystuje istniejący `Inventory` / `ItemKind`.
- Nie powstaje drugi niezależny system ekonomicznego storage.

### Simulation

- Gathering działa bez obecności gracza.
- NPC korzystają z istniejącego decision/action/FSM flow.
- Transport jest rzeczywistym ruchem NPC.
- Stan zasobów i storage jest kompatybilny z world streaming/persistence.
- Nie powstaje osobny system dla każdego typu zasobu.

---

## Verification

### Code / tests

- uruchomić istniejące testy,
- dodać testy generycznego resource targeting/gathering,
- dodać testy water container consumption,
- dodać testy wyboru źródła wody,
- sprawdzić persistence.

### Browser / gameplay

Zweryfikować w rzeczywistym świecie:

1. NPC pobiera wodę ze studni.
2. NPC wraca do domu.
3. Woda pojawia się w beczce.
4. NPC może napić się z beczki.
5. Zwierzę może napić się z koryta.
6. NPC ponownie uzupełnia wodę po jej zużyciu.
7. NPC zbiera drewno i odkłada je w storage.
8. NPC zbiera food.
9. Kilku NPC może wykonywać gathering jednocześnie.
10. Wszystko działa bez aktywnej ingerencji gracza.

Zweryfikować również:

- streaming chunków,
- brak duplikacji zasobów,
- brak utraty stanu kontenerów,
- brak blokowania NPC przy studni,
- brak niekończących się pętli `gather → deposit`,
- zachowanie przy pustych źródłach.

---

## Expected emergent behaviour

Po implementacji powinien być widoczny pierwszy rzeczywisty łańcuch gospodarczy:

```text
Natural resources
      ↓
NPC work
      ↓
Gathering
      ↓
Transport
      ↓
Household / Village storage
      ↓
Consumption
      ↓
Shortage
      ↓
New work
```

W szczególności:

```text
dużo zwierząt
    ↓
większe zużycie wody
    ↓
puste koryto
    ↓
problem gospodarstwa
    ↓
NPC pobiera więcej wody
```

oraz:

```text
więcej mieszkańców
    ↓
większe zużycie zasobów
    ↓
większe zapotrzebowanie
    ↓
więcej gathering
```

To jest ważniejsze niż sama możliwość „podnoszenia itemów”.

---

> **Zrób git commit i push do main, rebase jeżeli trzeba**