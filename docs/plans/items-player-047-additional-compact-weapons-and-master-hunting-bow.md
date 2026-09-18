# Plan: Additional compact weapons and master hunting bow

**Created:** 2026-09-18
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** `items-player`
**Subdomains:** `items` `inventory`
**Tags:** `weapons` `merchant` `combat` `trade`
**Roadmap:** `quests-travelling-merchant-journeys.md`

## Goal

Dodać trzy brakujące nisze uzbrojenia bez tworzenia nowego rarity systemu:

1. `dagger` — lekka broń osobista pomiędzy zwykłym nożem a krótkim mieczem;
2. `hatchet` — mały toporek bojowy, mocniejszy od noża/sztyletu, ale krótszy i mniej uniwersalny od miecza;
3. `masterwork_hunting_bow` — wyjątkowo dobry, drogi i rzadki łuk myśliwski przeznaczony przede wszystkim jako nagroda questowa.

Nie dodawać kolejnych odpowiedników:

- `damascus_knife` — pozostaje premium małym ostrzem;
- `masterwork_sword` — pozostaje premium mieczem;
- `battle_axe` — pozostaje ciężkim toporem bojowym.

Nowe bronie mają wejść do istniejących systemów itemów, walki, handlu, inventory oraz weapon maintenance.

## 1. Istniejące mechanizmy do reuse

Wykorzystać bez tworzenia równoległych systemów:

- `ItemKind` / `ITEM_DEFS` — label, masa, size, kategorie;
- `ITEM_CATALOG` — melee/ranged/defense/capabilities;
- `MERCHANT_PRICES` — bazowa wartość handlowa;
- `MERCHANT_STOCK` — towary możliwe do normalnego assortmentu;
- `src/settlement/merchantTrade.ts` — regionalność, specjalizacje i premium availability;
- `WeaponMaintenanceItemInstance` — durability + sharpness dla broni białej;
- `WEAPON_MAINTENANCE_KINDS`;
- `sharpenWeapon()`;
- normalny `HeldTool`;
- istniejący ranged lifecycle dla łuków;
- normalne ammo: `arrow`, `broadhead_arrow`, `war_arrow`.

Nie tworzyć:

- `WeaponTier`;
- `ItemRarity`;
- osobnego merchant weapon catalog;
- osobnych statystyk walki NPC;
- quality systemu dla wszystkich broni.

## 2. Dagger — sztylet

### Rola

Sztylet jest lepszą i bardziej bojową wersją zwykłego noża.

Ma pasować szczególnie do:

- handlarzy;
- podróżników;
- bogatszych cywilów;
- lekkiego wyposażenia NPC.

Powinien pozostać zdecydowanie słabszy od pełnego miecza.

### Item definition

Proponowany `ItemKind`:

`dagger`

Label:

`sztylet`

Kategorie:

`weapon`, `tool`

Masa:

**0.45 kg**

Size:

**SM**

### Combat

| Parametr | Knife | Dagger | Damascus knife |
|---|---:|---:|---:|
| Damage | 12 | **14** | 16 |
| Range | 1.60 | **1.70** | 1.60 |
| arcDot | 0.60 | **0.58** | 0.60 |
| Wind-up | 0.12 | **0.11** | 0.11 |
| Hit window | 0.08 | **0.08** | 0.08 |
| Recovery | 0.18 | **0.17** | 0.16 |
| Stamina | 4 | **4** | 4 |
| Block chance | 0.12 | **0.14** | 0.16 |
| Partial reduction | 0.35 | **0.38** | 0.40 |

Czytelna progresja:

```text
knife
→ dagger
→ damascus_knife
```

Sztylet nie może wypierać damasceńskiego wariantu.

### Capabilities

Ponieważ jest normalnym małym ostrzem:

- `meat_harvesting`;
- `branch_trimming`.

Nie tworzyć nowych capability specyficznych dla sztyletu.

### Weapon maintenance

Dodać do istniejącego `WEAPON_MAINTENANCE_KINDS`.

Powinien:

- mieć concrete instance;
- mieć `durability`;
- mieć `sharpness`;
- używać `sharpenWeapon()`;
- korzystać z normalnego sharpness damage modifier.

### Cena

**24 monety**

Punkty odniesienia:

- knife: 12;
- dagger: 24;
- short sword: 40;
- damascus knife: 90.

### Dostępność u sprzedawców

Normalny `MERCHANT_STOCK`.

**Nie premium.**

Merchant profile:

- `weapons-tools`: preferowany;
- `general`: normalnie dostępny;
- `imports-luxury`: nie traktować jako luxury;
- `food-materials`: brak specjalnego affinity.

Regionalność:

- mountain / metal-producing settlement → `local`;
- forest → `import`, zgodnie z obecną zasadą dla metalowych weapons;
- inne → `neutral`.

Dodać do istniejącego `METAL_KINDS`.

Rozważyć dodanie do `BASIC_WEAPON_TOOL_ARMOR_KINDS`, aby był traktowany podobnie do `knife` / `short_sword`.

## 3. Hatchet — toporek

### Nazwa

Proponowany internal kind:

`hatchet`

Polski label:

`toporek`

Nie używać:

- `axe` — istniejąca siekiera robocza;
- `battle_axe` — istniejący ciężki topór bojowy.

`toporek` ma być kompaktową bronią jednoręczną.

### Item definition

Kategorie:

`weapon`

Masa:

**1.0 kg**

Size:

**SM**

### Combat

Proponowane wartości:

- damage: **18**
- range: **1.85**
- arcDot: **0.42**
- windUp: **0.20 s**
- hitWindow: **0.10 s**
- recovery: **0.28 s**
- staminaCost: **7**

Defense:

- baseBlockChance: **0.16**
- partialReduction: **0.40**

Pozycja:

```text
dagger
→ szybszy i lekki

hatchet
→ więcej obrażeń, szersze cięcie, ale wolniejszy

short_sword
→ podobny damage, większy zasięg i lepszy blok
```

Toporek nie zastępuje krótkiego miecza.

### Capabilities

**Nie dodawać `wood_chopping`.**

Rozróżnienie:

```text
axe
= narzędzie + broń

battle_axe
= ciężka broń z istniejącym wood_chopping

hatchet
= kompaktowa broń osobista
```

Nie powinien automatycznie stać się optymalnym narzędziem drwala.

### Weapon maintenance

Dodać do `WEAPON_MAINTENANCE_KINDS`.

Normalne:

- sharpness;
- durability;
- whetstone;
- per-hit wear.

### Cena

**34 monety**

Punkty odniesienia:

- dagger: 24;
- spear: 32;
- short sword: 40;
- axe: 25.

Toporek jest bronią, nie narzędziem gospodarczym, ale nie osiąga wartości pełnego miecza.

### Dostępność

Normalny `MERCHANT_STOCK`.

**Nie premium.**

Dodać do:

- `METAL_KINDS`.

Nie dodawać do `HUNTING_KINDS` tylko dlatego, że jest mały.

Merchant profile:

- `weapons-tools`: wysoki affinity;
- `general`: normalny;
- reszta zgodnie z istniejącymi category rules.

Regionalność:

- mountain / metal resource → `local`;
- forest → `import`;
- inne → `neutral`.

## 4. Masterwork Hunting Bow

### Nazwa

Internal kind:

`masterwork_hunting_bow`

Polski label:

`mistrzowski łuk myśliwski`

### Rola

Nie ma być po prostu „long bow z większym damage”.

Ma być elitarnym łukiem myśliwskim:

- szybkim;
- lekkim;
- bardzo precyzyjnym;
- mocnym;
- wygodniejszym w użyciu niż long bow.

To uzasadnia wysoką cenę mimo niższego maksymalnego damage niż ciężki long bow.

### Ranged stats

| Parametr | Hunting bow | Masterwork hunting bow | Long bow |
|---|---:|---:|---:|
| Damage | 20 | **24** | 28 |
| Range | 15 | **17** | 20 |
| Projectile speed | 30 | **32** | 34 |
| Draw time | 0.45 | **0.38** | 0.65 |
| Recovery | 0.30 | **0.25** | 0.40 |
| Stamina | 8 | **7** | 11 |
| Accuracy | 0.78 | **0.90** | 0.70 |
| Critical chance | 0.05 | **0.10** | 0.08 |

Kluczowa przewaga:

**szybkość + accuracy + stamina efficiency**, a nie najwyższy raw damage.

Long bow nadal pozostaje bronią o:

- największym zasięgu;
- większym pojedynczym damage.

### Weight

Proponowana masa:

**1.15 kg**

Dokładną relację względem obecnych bow weights zweryfikować podczas implementacji przeciw aktualnemu `ITEM_DEFS`; nie zwiększać masy ponad zwykły `hunting_bow`.

Size:

**LG**

### Ammo

Bez nowego ammo.

Używa dokładnie:

- `arrow`;
- `broadhead_arrow`;
- `war_arrow`.

Nie dodawać „master arrows”.

## 5. Cena i dostępność Masterwork Hunting Bow

Base trade value:

**220 monet**

Pozycja cenowa:

- hunting bow: 75;
- long bow: 120;
- masterwork sword: 160;
- masterwork hunting bow: 220;
- Damascus long sword: 240;
- obsidian sword: 320.

### Normalni sprzedawcy

**Nie dodawać do `MERCHANT_STOCK` w V1.**

Nie powinien losowo pojawiać się w zwykłym assortment.

### Premium merchant

Również **nie dodawać do `PREMIUM_MERCHANT_KINDS` w V1**.

Ma pozostać nagrodą, którą gracz zapamięta, zamiast przedmiotem możliwym do znalezienia wcześniej u losowego kupca.

### Acquisition class

`quest / exceptional`

Pierwszy production acquisition:

**quest reward**.

Możliwe przyszłe źródła:

- Hunters Brotherhood;
- wyjątkowy łowca;
- bardzo późny authored treasure;
- unikalny rich travelling merchant.

Te źródła należą do osobnych planów/contentu.

Ten plan ma zapewnić item i możliwość przyznania go jako reward, nie dodawać konkretnego questa.

## 6. Merchant occurrence matrix

| Item | Normal merchant | Premium roll | Quest-only |
|---|---|---|---|
| Knife | tak | nie | nie |
| Dagger | **tak** | **nie** | nie |
| Damascus knife | tak przez obecny premium system | **tak** | nie |
| Hatchet | **tak** | **nie** | nie |
| Short sword | tak | nie | nie |
| Masterwork sword | tak przez obecny premium system | tak | nie |
| Masterwork hunting bow | **nie** | **nie** | **tak** |

Nie dodawać nowej klasy rarity do `ItemKind`.

## 7. Models / presentation

Nowe visual assets są wymagane dla:

- dagger;
- hatchet;
- masterwork hunting bow.

Najpierw sprawdzić istniejące asset packs / parked assets.

Nie używać `damascus_knife.glb` jako zwykłego daggera, ponieważ wizualnie sugerowałoby to premium Damascus.

Nie używać `battle_axe.glb` przeskalowanego jako hatchet, jeśli sylwetka nadal wygląda jak ciężki topór bojowy.

Dla masterwork bow wymagany jest wizualnie wyróżniony wariant.

Jeżeli odpowiedni model nie znajduje się obecnie w repo:

- dodać wpis do `docs/assets/MODELS.md`;
- zachować procedural/load-failure fallback zgodnie z obecnym item pipeline;
- nie blokować domeny combat na specjalnym rendererze tylko dla tych broni.

## 8. Integration points

Plan powinien dotknąć przede wszystkim:

- `src/items/items.ts`
  - nowe `ItemKind`;
  - `ITEM_DEFS`;
  - weight / size / label / categories;

- `src/items/itemCatalog.ts`
  - melee/ranged/defense/capabilities;
  - model URL;

- `src/items/itemInstances.ts`
  - dagger + hatchet jako weapon-maintenance instances;

- `src/items/tradeCatalog.ts`
  - dagger 24;
  - hatchet 34;
  - masterwork hunting bow trade value 220;
  - zwykły merchant stock tylko dagger/hatchet;

- `src/settlement/merchantTrade.ts`
  - `METAL_KINDS`;
  - ewentualnie basic assortment classification;
  - bez nowego rarity systemu;

- `src/items/itemModels.ts`
  - visual mapping/fallback;

- obecne held-item attachment/presentation;

- `docs/items/WEAPONS.md`;
- `docs/items/CATALOG.md`;
- `docs/assets/MODELS.md` tylko jeśli asset status faktycznie się zmieni.

Add JSDoc with `@domain items-player` for any new public/architectural helper introduced by implementation.

## 9. Balance invariants

Po implementacji muszą pozostać czytelne nisze.

Melee:

```text
knife
→ najtańsze małe ostrze

dagger
→ lepsze małe ostrze

damascus_knife
→ premium small blade

hatchet
→ kompaktowa broń o większej sile

short_sword
→ pełniejsza broń z większym reach/block

masterwork_sword
→ premium sword

battle_axe
→ ciężka broń z bardzo szerokim atakiem
```

Ranged:

```text
short_bow
→ szybki i tani

hunting_bow
→ balanced

masterwork_hunting_bow
→ szybki, bardzo celny, efektywny i rzadki

long_bow
→ najwyższy normalny range/raw damage
```

## 10. Tests

Dodać focused tests dla:

- kompletności `ItemKind` → `ITEM_DEFS` → `ITEM_CATALOG`;
- dagger/hatchet jako instance-backed maintenance weapons;
- sharpening dagger/hatchet;
- melee stat presence;
- masterwork hunting bow ranged config;
- zgodnych ammo kinds;
- merchant prices / trade values;
- dagger/hatchet obecnych w `MERCHANT_STOCK`;
- masterwork hunting bow nieobecnego w `MERCHANT_STOCK`;
- masterwork hunting bow nieobecnego w `PREMIUM_MERCHANT_KINDS`;
- regional classification nie omija istniejących merchant rules;
- deterministic merchant assortment po rozszerzeniu katalogu.

## 11. Explicit non-goals

Nie implementować tutaj:

- merchant poor/normal/rich;
- merchant guard loadouts;
- NPC equipment selection;
- juków;
- nowego questa;
- Hunters Brotherhood reward;
- item rarity framework;
- crafting nowych broni;
- Blacksmith recipes;
- bow durability;
- nowych arrow types;
- NPC combat AI.

## 12. Definition of done

Plan jest wykonany, gdy:

- trzy nowe item kinds istnieją w canonical item definitions;
- dagger i hatchet działają w normalnym melee pipeline;
- dagger i hatchet posiadają realny sharpness/durability lifecycle;
- masterwork hunting bow korzysta z normalnego ranged pipeline;
- wszystkie mają właściwą wagę, wartość i inventory size;
- dagger i hatchet mogą występować w normalnym merchant assortment;
- masterwork hunting bow pozostaje poza normalnym i premium merchant assortment;
- itemy mogą być normalnie posiadane przez playera i NPC;
- dokumentacja katalogu i weapon table odpowiada kodowi;
- targeted automated tests przechodzą.

Manualne/browser gameplay verification wykonuje User.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
