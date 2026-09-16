# Plan: UBC runtime pauldrons

**Created:** 2026-09-16
**Status:** `verification needed` 🔍
**Priority:** medium · **Effort:** M
**Model:** Sonnet, Composer
**Depends on:** ~~items-player-030~~, ~~items-player-036~~
**Domain:** `items-player`
**Type:** `feature`
**Subdomains:** `items` `inventory` `presentation`
**Tags:** `player` `equipment` `ubc` `armor`
**Roadmap:** -

## Cel

Dodać pierwszy rzeczywisty modularny element ubioru gracza UBC: naramienniki zakładane runtime na istniejący model postaci, bez wymiany całego outfitu.

Zakres jest celowo ograniczony do istniejącego slotu `arms` i czterech itemów:

- `leather_pauldron`,
- `ranger_pauldron`,
- `knight_pauldron_spike`,
- `knight_pauldron_round`.

Plan jest małym, samodzielnym wycinkiem większego draftu `items-player-037-ubc-runtime-per-slot-outfits.md`. Nie implementować tutaj pełnego modularnego `body/head/legs/feet`.

## Stan obecny i ownership

`src/items/equipment.ts` posiada już sześć slotów:

```ts
'head' | 'body' | 'arms' | 'hands' | 'legs' | 'feet'
```

`EquipmentState` przechowuje instance ID per slot, waliduje zgodność itemu ze slotem, obsługuje equip/unequip, persistence i agregację modifierów. Character Screen również zna wszystkie sześć slotów.

Nie tworzyć nowego `AccessorySlot`, `AccessoryState` ani osobnej persistence. Naramiennik jest zwykłym wearable armor z:

```ts
armor.slot = 'arms'
```

Obecny `ArmorKind` zawiera tylko `leather_armor` i `chainmail`; rozszerzyć istniejący system armorów zamiast tworzyć równoległy typ itemów.

## Itemy

Dodać cztery `ItemKind` / `ArmorKind`:

| ItemKind | Nazwa robocza | Slot | Asset źródłowy |
|---|---|---|---|
| `leather_pauldron` | Skórzany naramiennik | `arms` | `Male_Noble_Acc_Pauldron` |
| `ranger_pauldron` | Naramienniki tropiciela | `arms` | `Male_Ranger_Acc_Pauldron` |
| `knight_pauldron_spike` | Kolczaste naramienniki płytowe | `arms` | `Male_Knight_Acc_Pauldron_Spike` |
| `knight_pauldron_round` | Okrągłe naramienniki płytowe | `arms` | `Male_Knight_Acc_Pauldron_Round` |

`Male_Noble_Acc_Pauldron_Lion` pozostawić parked i nie włączać do V1.

Każdy wariant jest osobnym itemem i ma własne:

- weight,
- base trade value,
- damage reduction,
- ewentualne restriction multipliers,
- opis i dostępność.

Asset wizualny nie jest źródłem statystyk.

## Quality

Reuse istniejącego:

```ts
type ArmorQuality = 'common' | 'good' | 'masterwork'
```

Nie tworzyć osobnych `ItemKind` dla jakości. Ten sam GLB obsługuje wszystkie jakości, a istniejący armor-quality resolver skaluje parametry.

`poor` / low quality jest poza zakresem tego planu.

## Balans V1

Naramienniki są tylko częścią ochrony ciała, więc ich `damageReduction` ma być wyraźnie niższy niż dla pełnego body armor (`leather_armor` 0.18, `chainmail` 0.32).

Startowe wartości do tuningu:

| Item | Weight | Damage reduction | Base value |
|---|---:|---:|---:|
| `leather_pauldron` | ~0.7 kg | 0.03 | ~25 |
| `ranger_pauldron` | ~1.0 kg | 0.05 | ~40 |
| `knight_pauldron_spike` | ~1.8 kg | 0.07 | ~70 |
| `knight_pauldron_round` | ~2.1 kg | 0.08 | ~85 |

Cięższe warianty mogą dostać niewielkie `staminaCostMultiplier`, `meleeRecoveryMultiplier` i `sprintStaminaMultiplier`, ale nie koszty porównywalne z pełnym `chainmail`.

## Asset source i pipeline

Tymczasowo istnieją źródłowe pliki:

```text
public/models/characters/ubc/accessories/
  Male_Knight_Acc_Pauldron_Round.gltf/.bin
  Male_Knight_Acc_Pauldron_Spike.gltf/.bin
  Male_Noble_Acc_Pauldron.gltf/.bin
  Male_Noble_Acc_Pauldron_Lion.gltf/.bin
  Male_Ranger_Acc_Pauldron.gltf/.bin
```

Nie traktować ich jako finalnych runtime assets. Brakujące materiały i tekstury pobrać z właściwego źródła:

```text
_temp/Models/people/Modular Character Outfits - Fantasy[Source]/
```

Nie kopiować ręcznie zależności `.gltf -> textures`. Rozszerzyć istniejący UBC asset pipeline (`scripts/assets/compose_ubc_player.py`, `scripts/assets/prepare-ubc-player-alpha.sh` lub współdzielony helper wydzielony z tego pipeline).

Finalny output:

```text
public/models/characters/ubc/accessories/
  male_leather_pauldron.glb
  male_ranger_pauldron.glb
  male_knight_pauldron_spike.glb
  male_knight_pauldron_round.glb
```

Wymagania:

- zachować skinning,
- zachować zgodność z 65-bone UBC/UAL rig,
- nie flattenować skinned meshes,
- nie bake'ować animacji do accessory,
- nie uruchamiać osobnego animation mixera dla accessory,
- finalny GLB ma zawierać tylko dane potrzebne do wyrenderowania części.

`Male_Noble_Acc_Pauldron` wykorzystać dla `leather_pauldron` z brązowym wariantem materiału/tintu. Tint jest presentation metadata, nie częścią gameplay stats.

## Assets Browser / manual alignment seam

Wszystkie cztery finalne accessory GLB muszą być dostępne w `asset-browser.html`, aby User mógł później ręcznie sprawdzić i wyrównać position/rotation/scale oraz clipping względem UBC playera.

**Implementacja tego planu nie czeka na ręczny alignment Usera.** Agent ma:

1. przygotować i zarejestrować assety w assets-browser,
2. zapewnić deklaratywne miejsce na ewentualne przyszłe alignment metadata,
3. użyć neutralnego/źródłowego transformu jako defaultu,
4. kontynuować implementację runtime i testy bez blokowania na manual verification.

Ręczny alignment zostanie wykonany osobno przez Usera. Nie zgadywać i nie hardcodować korekt typu `position.set(...)`, `rotation.set(...)`, `scale.set(...)` per pauldron w `PlayerController`.

Jeżeli późniejszy manual alignment wykaże potrzebę korekty, wartości mają trafić do asset/presentation metadata, nie do gameplay code.

## Gameplay vs presentation

Gameplay pozostaje w istniejących właścicielach:

```text
ITEM_DEFS
ITEM_CATALOG
ArmorItemInstance
trade catalog
EquipmentState
```

Presentation powinno mieć deklaratywny resolver/registry, np. kontrakt równoważny:

```ts
type PlayerEquipmentVisual = {
  modelUrl: string
  tint?: 'brown'
  alignment?: {
    position?: [number, number, number]
    rotation?: [number, number, number]
    scale?: number
  }
}

resolvePlayerEquipmentVisual(kind: ItemKind): PlayerEquipmentVisual | null
```

`alignment` może pozostać pusty/defaultowy do czasu ręcznego strojenia przez Usera. Nie przechowywać gameplay stats ani ceny w presentation registry.

## Runtime attachment

Dzisiaj `PlayerController.applyAppearance()` wymienia cały `modelRoot`. Tego mechanizmu nie przebudowywać na pełny modular-character renderer w tym planie.

Body nadal działa jak dziś:

```text
body empty    -> Peasant
leather_armor -> Ranger
chainmail     -> Knight
```

Nowe `arms` działa niezależnie:

```text
current full UBC outfit
        +
equipped arms item
        -> runtime pauldron SkinnedMesh
```

`PlayerController` powinien posiadać aktualnie dołączone equipment visuals per slot. V1 używa wyłącznie `arms`, ale API nie powinno być nazwane `applyPauldron()`; preferować slot-aware seam typu `applyEquipmentVisuals(...)` lub równoważny mechanizm, aby później można było rozszerzyć go na `head/legs/feet` bez drugiego systemu.

Nie tworzyć pełnego modular-character managera.

## Skeleton binding

Accessory korzysta z tego samego UBC/UAL rigu co obecny gracz.

Runtime nie powinien:

- tworzyć drugiego autorytatywnego riga,
- uruchamiać drugiego `AnimationMixer`,
- synchronizować dwóch animacji.

Skinned mesh accessory należy związać z aktualnym skeletonem gracza przez zgodne bone/joint names UBC.

Jeśli brakuje wymaganej kości lub skeleton jest niezgodny: nie attachować accessory i emitować development warning. Manual alignment nie może maskować błędnego skeleton bindu.

## Lifecycle

Visual accessory jest pochodną `EquipmentState + Inventory` i nie posiada własnego gameplay state.

Po:

- equip arms,
- unequip arms,
- drop/sell equipped item,
- load save,
- body appearance swap,

runtime visual musi zostać zsynchronizowany.

Szczególnie ważne: `applyAppearance()` wymienia cały UBC `modelRoot`, więc po zmianie body/outfitu accessory musi zostać ponownie zbindowany do nowego skeletonu.

Nie utrzymywać accessory przy życiu względem starej armatury.

## UBC-only

Runtime attachment działa tylko dla kompatybilnego UBC skeletonu (`peasant`, `ranger`, `knight`, `knight_cloth`, `noble`, `wizard`).

Dla `?player=adventurer` oraz capsule fallback:

- equipment gameplay nadal działa,
- accessory visual jest pomijany,
- nie zmieniać session-lock zachowania Adventurera.

## Inventory / economy

Rozszerzyć istniejące źródła prawdy o cztery nowe rodzaje:

```text
src/items/items.ts
src/items/itemInstances.ts
src/items/itemCatalog.ts
src/items/tradeCatalog.ts
```

Każdy ma `armor.slot: 'arms'`. `EquipmentState.equip()` powinien obsłużyć je bez specjalnych `kind === ...` warunków.

Cena ma wynikać z istniejącego systemu trade na poziomie `ItemKind`. Obecny `common/good/masterwork` skaluje statystyki i efektywną wagę armorów, ale nie cenę; nie dodawać quality-sensitive pricing w tym planie. Nie przechowywać ceny w visual registry.

Runtime worn visual i fizyczny ground/inventory representation są różnymi presentation contexts. Nie używać automatycznie skinned pauldron GLB jako ground prop. Jeśli potrzebny jest world model, użyć istniejącego `itemModels.ts` lub świadomie pozostawić brak ground modelu w V1, jeśli obecne flow handlu/inventory na to pozwala.

## Performance

Preferować lazy load przy pierwszym equip i cache przez istniejący `loadGltf`. Nie preloadować całego przyszłego modularnego wardrobe.

Przy wielokrotnym equip/unequip reuse cached asset; usuwać runtime clone ze sceny bez dispose współdzielonych zasobów cache.

## Spodziewane pliki / integracje

```text
src/items/items.ts
src/items/itemInstances.ts
src/items/itemCatalog.ts
src/items/tradeCatalog.ts
src/items/itemModels.ts                    # tylko jeśli potrzebny ground visual
src/player/PlayerController.ts
src/player/playerVisualPreset.ts           # tylko jeśli potrzebny integration seam
src/player/...equipment visual resolver/helper
src/app/createApp.ts                       # equipment/appearance sync wiring
scripts/assets/compose_ubc_player.py
scripts/assets/prepare-ubc-player-alpha.sh
asset-browser related registry/config
public/models/characters/ubc/accessories/
```

Nie wymuszać zmian we wszystkich plikach, jeśli recon implementacyjny wskaże istniejącego właściciela.

## Testy

### Equipment

Potwierdzić:

- wszystkie cztery itemy mapują się na `arms`,
- equip jednego zastępuje poprzedni item w `arms`,
- `body` pozostaje niezależne,
- save/load zachowuje equipped arms instance,
- utrata/sprzedaż itemu czyści slot przez istniejący lifecycle.

### Presentation resolver

Pure tests:

- każdy ItemKind -> właściwy accessory visual,
- non-accessory -> `null`,
- `leather_pauldron` -> brown variant,
- default alignment jest neutralny, dopóki User nie zapisze ręcznej korekty.

### Runtime helper

Tam gdzie możliwe bez browsera/WebGL:

- bone-name remap,
- missing-bone rejection,
- replacement/removal per slot,
- body-root replacement powoduje rebind accessory.

## Manual verification

Manual browser verification wykonuje User i nie blokuje pracy agenta.

Po implementacji User osobno sprawdzi w `asset-browser.html` alignment każdego wariantu i w grze:

- idle/walk/sprint,
- sword attack,
- crouch/jump,
- clipping z Peasant/Ranger/Knight,
- equip/unequip/swap,
- save/reload,
- body leather <-> chainmail,
- brown `leather_pauldron`.

Ewentualne ręczne korekty alignmentu są follow-upem/polishem i trafiają do presentation metadata.

## Poza zakresem

Nie implementować:

- `Male_Noble_Acc_Pauldron_Lion`,
- `poor` / low armor quality,
- helmetów,
- scarf,
- Knight body cloth/armor parts,
- modularnych legs/feet,
- gloves,
- hair/helmet interaction,
- female accessories,
- NPC accessories,
- pełnego `CharacterAppearanceDefinition`,
- edytora appearance,
- persistence tintów.

Te elementy zostają dla `items-player-037` lub kolejnych mniejszych planów.

## Definition of Done

Plan jest zakończony, gdy:

- istnieją cztery nowe armor item kinds w slocie `arms`,
- korzystają z istniejącego `common/good/masterwork`,
- mają różne gameplay/economic properties,
- cztery finalne accessory GLB są generowane z właściwego asset source wraz z teksturami,
- `leather_pauldron` posiada brązowy wariant,
- wszystkie cztery GLB są dostępne w assets-browser do późniejszego ręcznego alignmentu,
- runtime nie czeka na manual alignment Usera i używa neutralnego/defaultowego transformu,
- equipped `arms` item determinuje runtime accessory visual,
- accessory używa aktywnego UBC skeletonu i istniejących animacji,
- body outfit nadal korzysta z obecnego pełnego GLB,
- body swap poprawnie rebinduje accessory,
- save/load działa przez istniejący `EquipmentState`,
- Adventurer/capsule nie powodują błędu,
- Lion pozostaje parked,
- testy/build przechodzą,
- ważne nowe publiczne/architektoniczne helpery mają JSDoc z `@domain items-player`,
- manual browser verification pozostaje po stronie Usera.

> **Zrób git commit i push do main, rebase jeżeli trzeba**