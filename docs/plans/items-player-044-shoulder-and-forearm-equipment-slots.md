# Plan: Shoulder and forearm equipment slots

**Created:** 2026-09-17
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Model:** Sonnet, Composer
**Depends on:** items-player-039
**Domain:** `items-player`
**Type:** `feature`
**Subdomains:** `items` `inventory` `presentation`
**Tags:** `equipment` `armor` `ubc` `bracers`
**Roadmap:** -

## Cel

Rozdzielić obecny zbyt ogólny slot `arms` na dwie niezależne warstwy wyposażenia:

- `shoulders` — naramienniki,
- `forearms` — karwasze / ochraniacze przedramion i nadgarstków.

Gracz musi móc jednocześnie nosić naramienniki oraz ochraniacze przedramion. Nie tworzyć równoległego systemu akcesoriów — oba pozostają zwykłymi elementami istniejącego `EquipmentState` i armor pipeline.

Plan dodaje też dwa pierwsze itemy dla `forearms`:

- `leather_bracers` — źródło `Male_Ranger_Arms_Bracer`,
- `steel_bracers` — źródło `Male_Noble_Arms_Guards`.

## Problem obecnego modelu

`EquipmentSlot` obecnie zawiera:

```ts
'head' | 'body' | 'arms' | 'hands' | 'legs' | 'feet'
```

Plan `items-player-039` przypisał wszystkie naramienniki do `arms`. Użycie tego samego slotu dla karwaszy powodowałoby sztuczną wzajemną blokadę dwóch wizualnie i funkcjonalnie niezależnych warstw.

Nie dodawać `wrist`, `bracer`, `accessory` ani osobnego stanu tylko dla tych assetów. Najmniejszy spójny model to jawne `shoulders` + `forearms`.

## Docelowy kontrakt slotów

`EquipmentSlot` ma zostać zmieniony na:

```ts
type EquipmentSlot =
  | 'head'
  | 'body'
  | 'shoulders'
  | 'forearms'
  | 'hands'
  | 'legs'
  | 'feet'
```

Semantyka:

| Slot | Zakres |
|---|---|
| `head` | hełm / nakrycie głowy |
| `body` | główny pancerz / outfit |
| `shoulders` | naramienniki |
| `forearms` | karwasze, bracers, arm guards |
| `hands` | rękawice |
| `legs` | nogi |
| `feet` | buty |

`arms` przestaje być aktywnym slotem runtime po migracji kompatybilności save.

## Migracja istniejących naramienników

Zmienić `armor.slot` dla:

- `leather_pauldron`,
- `ranger_pauldron`,
- `knight_pauldron_spike`,
- `knight_pauldron_round`

z `arms` na `shoulders`.

Nie zmieniać ich `ItemKind`, instance ID, quality ani statystyk.

## Kompatybilność save

Istniejące save mogą zawierać:

```ts
playerEquipment: {
  arms: '<instance-id>'
}
```

Nowy runtime nie może po prostu zignorować tego klucza.

Podczas `createEquipmentState(...)` dodać wąską migrację legacy:

1. jeśli zapis ma prawidłowy `shoulders`, użyć go;
2. w przeciwnym razie, jeśli legacy `arms` wskazuje nadal posiadany armor instance, którego aktualny katalog mówi `slot: 'shoulders'`, przypisać go do `shoulders`;
3. nie eksportować ponownie `arms` — kolejne save zapisują już tylko nowy kontrakt;
4. nigdy nie przenosić legacy `arms` do `forearms`.

Nie dodawać wersjonowanego drugiego equipment state ani osobnego save migration managera tylko dla tej zmiany.

## Nowe itemy forearms

Dodać dwa `ArmorKind` / `ItemKind`:

| ItemKind | Nazwa | Slot | Asset źródłowy |
|---|---|---|---|
| `leather_bracers` | Skórzane karwasze | `forearms` | `Male_Ranger_Arms_Bracer` |
| `steel_bracers` | Stalowe karwasze | `forearms` | `Male_Noble_Arms_Guards` |

Oba są normalnymi instance-backed armor items i używają istniejącego `ArmorQuality` (`poor/common/good/masterwork`) oraz istniejącego resolvera efektywnych statystyk.

Nie tworzyć osobnej klasy `AccessoryItemInstance`.

## Balans V1

Karwasze chronią mniejszą powierzchnię niż body armor i nie powinny być mocniejsze od ciężkich naramienników.

Startowe wartości do tuningu:

| Item | Weight | Damage reduction | Base value |
|---|---:|---:|---:|
| `leather_bracers` | ~0.5 kg | 0.02 | ~20 |
| `steel_bracers` | ~1.0 kg | 0.04 | ~45 |

`steel_bracers` może dostać bardzo mały koszt stamina/recovery, ale bez wyraźnego movement penalty. Finalne liczby pozostają tuningiem w obrębie istniejącego armor modelu.

## Presentation / runtime visuals

Reuse istniejącego `src/player/playerEquipmentVisual.ts` oraz slot-aware runtime attachment z `items-player-039`.

Dodać mapowanie:

```text
leather_bracers -> male_leather_bracers.glb
steel_bracers   -> male_steel_bracers.glb
```

Runtime musi pozwalać na jednoczesne attachmenty:

```text
shoulders = ranger_pauldron
forearms  = leather_bracers
```

Zmiana jednego slotu nie może usuwać visualu drugiego.

Nie tworzyć `applyBracers()` / `applyPauldron()` jako oddzielnych ścieżek. Attachment lifecycle pozostaje indeksowany przez `EquipmentSlot`.

## Asset pipeline

Źródła:

```text
Male_Ranger_Arms_Bracer
Male_Noble_Arms_Guards
```

Finalne runtime assets:

```text
public/models/characters/ubc/accessories/
  male_leather_bracers.glb
  male_steel_bracers.glb
```

Wymagania identyczne jak dla naramienników z `items-player-039`:

- zachować skinning i zgodność z aktywnym UBC/UAL skeletonem,
- brak własnego `AnimationMixer`,
- accessory binduje się do bieżącego skeletonu gracza,
- finalny GLB nie zawiera niepotrzebnych animacji,
- reuse istniejącego asset preparation pipeline zamiast ręcznie duplikować glTF processing.

### Znany blocker źródłowych GLB (2026-09-17)

Próby eksportu z Blender 5.2 dla:

```text
male_leather_bracers.glb
male_steel_bracers.glb
```

są obecnie **niepoprawne dla runtime bindingu**. `gltf-transform inspect` nie pokazuje `JOINTS_0` ani `WEIGHTS_0`, mimo że obiekty w Blenderze mają `Armature` modifier. W tej postaci `bindAccessoryToPlayerSkeleton` nie ma danych skinningowych i pominie accessory.

Dodatkowo pliki źródłowe były bardzo duże:

```text
male_leather_bracers.glb ≈ 28 MB
male_steel_bracers.glb   ≈ 60 MB
```

Powodem rozmiaru są głównie osadzone atlasowe tekstury PNG 4K (Ranger/Noble: BaseColor + Normal + ORM); sam mesh ma rozmiar rzędu dziesiątek KB. Nie commitować/przywracać tych eksportów jako runtime assets.

Przed implementacją visuali tego planu trzeba:

1. poprawić eksport z Blendera tak, aby wynik zawierał skin + `JOINTS_0` + `WEIGHTS_0` zgodne z UBC skeletonem;
2. zweryfikować `gltf-transform inspect` przed wpięciem do runtime;
3. przepuścić poprawne źródło przez istniejący `compose_ubc_player.py` / `prepare-ubc-player-alpha.sh` (resize/WebP/prune/gltfpack), zamiast przechowywać surowe 4K embedded GLB;
4. zachować `-kn` / nazwy kości wymagane przez obecny binding.

Szczegółowy zapis diagnostyczny: `docs/blender/TROUBLESHOOTING.md`. Powiązany loose end: `docs/plans/LOOSE-ENDS.md`.

Oba assety dodać jawnie do Asset Browser jako skinned UBC accessories dopiero po przejściu powyższego gate.

Jeśli potrzebny jest alignment, przechowywać go w istniejącym `PlayerEquipmentVisual.alignment`, nie w `PlayerController`.

## Gameplay / inventory / economy

Rozszerzyć istniejące źródła prawdy:

```text
src/items/items.ts
src/items/itemInstances.ts
src/items/itemCatalog.ts
src/items/tradeCatalog.ts
```

Nowe itemy mają `categories: ['armor']` oraz `armor.slot: 'forearms'`.

Nie dodawać specjalnych warunków `kind === leather_bracers` w equip flow. `EquipmentState.equip()` ma nadal rozwiązywać slot wyłącznie z katalogu.

Dostępność handlowa powinna korzystać z istniejących źródeł merchant/specialist stock. Preferowany V1: skórzane karwasze u Huntera / rangera lub Kupca, stalowe u Blacksmitha / odpowiedniego specialist stock, jeśli istniejący stock model pozwala to dodać bez nowego systemu.

## UI

Zaktualizować player-facing labels:

```text
shoulders -> Naramienniki
forearms  -> Przedramiona
```

Character Screen / Inventory powinny dostać oba sloty przez istniejące iterowanie `EQUIPMENT_SLOTS`; nie tworzyć dedykowanego panelu dla karwaszy.

Kolejność prezentacji:

```text
head
body
shoulders
forearms
hands
legs
feet
```

## Spodziewane pliki / integracje

```text
src/items/equipment.ts
src/items/equipment.test.ts
src/items/items.ts
src/items/itemInstances.ts
src/items/itemCatalog.ts
src/items/tradeCatalog.ts
src/player/playerEquipmentVisual.ts
src/player/PlayerController.ts               # tylko jeśli obecny slot-aware runtime wymaga rozszerzenia
src/assets/assetIndex.ts
scripts/assets/compose_ubc_player.py
scripts/assets/prepare-ubc-player-alpha.sh
public/models/characters/ubc/accessories/
```

Dodatkowo zaktualizować bezpośrednie testy / dokumentację, które nadal zakładają `arms` jako aktualny slot. Nie robić repo-wide refactorów niezwiązanych z kontraktem equipment.

## Testy automatyczne

### Slot contract

Potwierdzić:

- `EQUIPMENT_SLOTS` zawiera `shoulders` i `forearms`, nie zawiera aktywnego `arms`,
- wszystkie cztery pauldrons mapują się na `shoulders`,
- oba bracers mapują się na `forearms`,
- equip pauldron + bracers jednocześnie działa,
- wymiana `shoulders` nie usuwa `forearms` i odwrotnie,
- agregacja modifierów składa oba elementy normalnym `composeEquipmentModifiers()`.

### Save migration

Testy legacy save:

- legacy `arms` z pauldron instance -> `shoulders`,
- nowy save eksportuje `shoulders`, bez `arms`,
- nieprawidłowy/stale legacy instance nie tworzy ghost itemu,
- jawny nowy `shoulders` ma pierwszeństwo przed legacy `arms`.

### Armor / presentation

- oba nowe kind są `ArmorKind` i instance-backed,
- quality resolver działa bez wyjątków,
- oba mają poprawny `PlayerEquipmentVisual`,
- non-accessory nadal zwraca `null`,
- slot-aware visual lifecycle utrzymuje jednocześnie `shoulders` + `forearms`.

## Manual verification

Browser verification wykonuje User.

Sprawdzić ręcznie:

- pauldron + leather bracers jednocześnie,
- pauldron + steel bracers jednocześnie,
- Peasant / Ranger / Knight,
- idle / walk / sprint / attack / crouch / jump,
- clipping między naramiennikiem, rękawem, karwaszem i dłonią,
- equip/unequip/swap każdego slotu niezależnie,
- save/reload starego save z `arms`,
- save/reload nowego `shoulders + forearms`.

Agent nie wykonuje browser verification.

## Guardrails / poza zakresem

Nie implementować w tym planie:

- osobnego `wrist` slotu,
- pierścieni / `finger`,
- rękawic,
- helmet/hair rules,
- NPC modular equipment,
- pełnego draftu `items-player-037`,
- nowego accessory state/save schema,
- drugiego skeletonu lub mixera,
- automatycznego rozwiązywania clippingu między częściami.

Jeżeli obecny runtime z `items-player-039` nadal jest w `verification needed`, implementacja tego planu powinna zachować jego architekturę i poprawić kontrakt slotów bez przebudowy całego attachment systemu.

## Definition of Done

Plan jest zakończony, gdy:

- `arms` zostało zastąpione runtime przez `shoulders` + `forearms`,
- istniejące pauldrons używają `shoulders`,
- legacy save `arms` migruje do `shoulders`,
- `leather_bracers` i `steel_bracers` są pełnoprawnymi armor items w `forearms`,
- gracz może jednocześnie nosić pauldron i bracers,
- oba nowe GLB mają zweryfikowany skinning (`JOINTS_0` / `WEIGHTS_0`) i są przygotowane przez istniejący UBC asset pipeline,
- oba nowe GLB są podpinane przez istniejący UBC accessory runtime,
- UI pokazuje oba sloty,
- testy jednostkowe/typecheck/build przechodzą,
- manual browser verification pozostaje do wykonania przez Usera.

Podczas implementacji dodać/utrzymać JSDoc dla ważnych publicznych/architektonicznych helperów; użyć `@domain items-player` tam, gdzie pomaga preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
