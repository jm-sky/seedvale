# Plan: Player-Built Well

**Created:** 2026-08-17  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** M  
**Depends on:** `none`

## Cel

Pozwolić graczowi zbudować studnię w świecie i używać jej jako lokalnego źródła wody, bez tworzenia równoległego `WellSystem`.

Studnia ma być zwykłym persistent world object. Jej pozycja i tożsamość należą do stanu świata, natomiast dostępność wody jest opisana przez istniejący model `WaterSource`. Zapasy wody gospodarstwa pozostają własnością `Household`.

## Istniejące mechanizmy

Należy wykorzystać istniejące systemy:

- `WaterSource` jako model źródła wody,
- istniejące water interactions i wybór źródła wody,
- `Household.water` jako zapas gospodarstwa,
- istniejący `Inventory` / `ItemInstance` dla przedmiotów i materiałów,
- istniejące mechanizmy player placement (`Placed*`),
- `WorldBundle` i istniejący save/load,
- istniejący rejestr colliderów,
- istniejącą infrastrukturę settlement,
- istniejące storage/logistics, gdy studnia będzie źródłem dla transportu wody,
- istniejący model potrzeb gracza/NPC.

Nie tworzyć osobnego systemu zarządzającego studniami.

## Ownership stanu

Studnia powinna mieć minimalny persistent record, np.:

```text
wellId
x
z
yaw
```

Runtime może zawierać mesh i dane pochodne, ale persistent record jest źródłem prawdy.

Podział odpowiedzialności:

```text
PlayerWell record
    = istniejąca studnia umieszczona przez gracza

WaterSource
    = źródło / punkt, z którego można pobierać wodę

Household.water
    = aktualny zapas wody gospodarstwa
```

Studnia **nie przechowuje zapasu `Household.water`** i nie należy dublować tego stanu.

Jeżeli istniejący model `WaterSource` wymaga identyfikatora właściciela lub referencji do źródła, należy rozszerzyć go minimalnie zamiast tworzyć `WellSource` równoległy do `WaterSource`.

## Placement

Gracz powinien móc wybrać legalne miejsce i postawić studnię z wykorzystaniem istniejącego mechanizmu placement.

Placement powinien:

- korzystać z istniejącego próbkowania wysokości / `placeOnGround`,
- respektować istniejące ograniczenia miejsca,
- używać istniejących materiałów/itemów i `Inventory`,
- utworzyć stabilny `wellId`,
- dodać persistent record do właściciela stanu świata,
- utworzyć reprezentację renderowaną,
- zarejestrować collider w istniejącym rejestrze colliderów.

Nie tworzyć osobnego `WellPlacementSystem` ani osobnego mechanizmu kolizji.

## Water interaction

Studnia ma być dostępna przez istniejący mechanizm interakcji ze źródłami wody.

Przepływ powinien pozostać zgodny z istniejącym modelem:

```text
well
 ↓
WaterSource
 ↓
water interaction / fetch
 ↓
water carried by actor
 ↓
Household water / existing water destination
```

Nie tworzyć osobnego `WellInteraction` tylko dlatego, że źródło jest player-built.

Jeżeli istniejący wybór źródła wody rozpoznaje źródła przez wspólny interfejs/typ, studnia powinna zostać do niego podłączona.

## Household water

`Household.water` pozostaje własnością gospodarstwa.

Studnia nie zmienia bezpośrednio zapasu gospodarstwa tylko dlatego, że istnieje.

Uzupełnienie zapasu powinno odbywać się przez istniejący przepływ pobierania/transportu wody:

```text
source → gather/fetch → carry → household storage
```

Należy wykorzystać istniejące mechanizmy z planu natural resource gathering / water distribution oraz household/settlement storage logistics.

Player-built well ma być kolejnym źródłem, a nie nowym rodzajem transportu.

## Persistence

Stan studni musi przetrwać:

- save/load,
- rebuild `WorldBundle`,
- ponowne utworzenie świata,
- streaming/rebuild odpowiedniego obszaru, jeżeli obiekt zostanie objęty streamingiem.

Persistent state powinien być przechowywany razem z innymi player-placed world objects.

Nie tworzyć osobnego save systemu.

Save powinien przechowywać tylko stan niezbędny do odtworzenia obiektu; geometria, collider i `WaterSource` powinny być odtwarzane z tego rekordu.

## WorldBundle

`WorldBundle` powinien pozostać głównym punktem składania stanu świata.

Docelowo:

```text
SaveData
  ↓
WorldBundle
  ↓
PlacedWell collection
  ├── runtime mesh
  ├── collider registration
  └── WaterSource registration
```

Nie tworzyć osobnego globalnego managera studni.

## Colliders

Studnia ma być normalnym elementem wspólnego rejestru colliderów.

NPC i inne systemy nie powinny potrzebować specjalnego `if (well)` tylko po to, aby ominąć jej geometrię.

Jednocześnie dostęp do źródła powinien pozostać możliwy z rim/approach point zgodnie z istniejącymi zasadami collider approach.

## Settlement infrastructure

Player-built well nie jest settlement landmarkiem tylko dlatego, że dostarcza wodę.

Nie należy dopisywać jej do istniejącej generacji settlementu jako zwykłego `SettlementLandmark`.

Jeżeli infrastruktura settlementu korzysta ze wspólnego modelu źródeł wody, studnia powinna być dostępna przez ten model jako world object.

Dzięki temu późniejsze systemy mogą traktować ją jako element infrastruktury bez tworzenia osobnej ścieżki dla player-built wells.

## Inventory / koszt budowy

Koszt budowy powinien korzystać z istniejącego `Inventory`.

Nie dodawać osobnego magazynu materiałów dla budowy studni.

Jeżeli potrzebne są item instances, należy użyć istniejącego modelu `ItemInstance` zgodnie z aktualnym inventory item-instance lifecycle.

Plan storage nie jest wymagany do implementacji studni; architektura ma jedynie pozostać kompatybilna z przyszłym storage.

## Player needs

Player thirst ma korzystać z tego samego pojęcia źródła wody co inne systemy.

Nie tworzyć osobnego `WellDrinkSystem`.

Przyszły przepływ powinien być możliwy przez istniejące potrzeby/interactions:

```text
Thirst
 ↓
find usable WaterSource
 ↓
player water interaction
 ↓
Thirst restored
```

Dokładny model regeneracji Thirst pozostaje własnością systemu potrzeb, zgodnie z aktualnym planem survival needs.

## NPC compatibility

NPC powinny móc korzystać z player-built well jako zwykłego `WaterSource`, jeżeli znajduje się w zasięgu ich działania.

Nie tworzyć specjalnego NPC API dla studni.

Istniejący wybór źródła powinien uwzględniać player-built wells na równi z innymi odpowiednimi źródłami.

## Implementation

1. Zidentyfikować aktualny typ/kontrakt `WaterSource` i wykorzystać go bez tworzenia równoległego modelu.
2. Zidentyfikować właściciela persistent state player-placed world objects i dodać tam rekord studni.
3. Zintegrować studnię z `WorldBundle` oraz istniejącym save/load.
4. Zintegrować placement z istniejącym mechanizmem wyboru pozycji i wysokości.
5. Zarejestrować studnię w istniejącym collider registry.
6. Podłączyć studnię do istniejącego water-source discovery / interaction flow.
7. Upewnić się, że pobieranie wody kończy się przez istniejący przepływ do `Household.water`, a nie przez bezpośrednią mutację z nowego systemu.
8. Wykorzystać istniejący `Inventory` do kosztu budowy.
9. Udostępnić player-built well istniejącemu systemowi player thirst.
10. Udostępnić player-built well istniejącemu systemowi NPC water gathering.
11. Nie tworzyć `WellSystem`, `WellInteractionSystem`, `WellSaveSystem` ani równoległego storage wody.

## Poza zakresem

Nie implementować w tym planie:

- studni jako settlement landmarku,
- własnego magazynu wody studni,
- sieci wodociągowej,
- rur,
- automatycznego transportu bez istniejącego logistics flow,
- osobnego systemu naprawy studni,
- zaawansowanej symulacji poziomu wód gruntowych,
- multiplayer-specific ownership.

## Weryfikacja

### Placement

- gracz może postawić studnię w legalnym miejscu,
- studnia jest poprawnie ustawiona na terenie,
- collider jest obecny,
- istniejące NPC navigation/approach nie przechodzi przez studnię.

### Water

- studnia jest wykrywana jako `WaterSource`,
- istniejąca interakcja pobierania wody działa,
- pobrana woda trafia przez istniejący przepływ do właściwego odbiorcy,
- `Household.water` nie jest dublowane w stanie studni.

### Needs

- player może wykorzystać studnię zgodnie z istniejącym modelem Thirst,
- NPC może wykorzystać ją jako źródło wody, jeżeli spełnia istniejące kryteria dostępności.

### Persistence

- studnia przetrwa save/load,
- `wellId`, pozycja i orientacja są zachowane,
- po reloadzie odtwarzane są mesh, collider i `WaterSource`,
- rebuild `WorldBundle` nie tworzy duplikatu studni.

### Techniczne

- brak nowego `WellSystem`,
- brak duplikacji `WaterSource`,
- brak osobnego save systemu,
- istniejące mechanizmy Inventory, placement, colliderów i water interactions są ponownie wykorzystane,
- testy/build/lint przechodzą zgodnie z `CLAUDE.md`,
- brak niepowiązanych refaktorów.

## Kryterium ukończenia

Gracz może zbudować i postawić persistentną studnię, która jest normalnym `WaterSource` świata, działa przez istniejące interakcje wody, może zasilać istniejący przepływ `Household.water`, jest dostępna dla player thirst i NPC water gathering oraz poprawnie odtwarza się z save/load — bez tworzenia osobnego `WellSystem`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
