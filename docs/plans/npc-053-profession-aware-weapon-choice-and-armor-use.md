# Plan: NPC profession-aware weapon choice and armor use

**Created:** 2026-09-18
**Status:** `verification needed` 🔍
**Priority:** medium · **Effort:** M
**Depends on:** items-player-027, items-player-029, items-player-047
**Domain:** `npc`
**Type:** `feature`
**Roadmap:** `quests-travelling-merchant-journeys.md`
**Model:** Sonnet, Composer

## Goal

NPC ma korzystać z najlepszego sensownego wyposażenia znajdującego się w jego `personalInventory`.

Wybór broni ma pozostać prosty i deterministyczny:

1. istniejący combat intent nadal decyduje o trybie `melee` albo `ranged`;
2. dla danego trybu bierzemy wszystkie realnie posiadane, używalne bronie;
3. liczymy prosty combat score z istniejących statystyk;
4. bronie należące do preferowanej rodziny profesji dostają mnożnik `×1.5`;
5. najwyższy wynik wygrywa;
6. wybór jest cache'owany na czas bieżącego combat encounter.

NPC ma również automatycznie korzystać z najlepszego posiadanego armor per slot bez tworzenia nowego persistent equipment systemu.

## 1. Existing foundations

Reuse:

- `NpcAuthoritativeState.personalInventory` jako jedyne źródło osobistego wyposażenia;
- `resolveNpcMeleeWeapon()`;
- `resolveNpcRangedWeapon()`;
- `ITEM_CATALOG[kind].melee`;
- `ITEM_CATALOG[kind].ranged`;
- istniejący NPC combat `Phase`;
- istniejący cache `combatMeleeWeapon` / `combatRangedWeapon`;
- istniejące `EquipmentState`;
- `resolveEquipmentModifiers()`;
- armor instances + armor quality;
- istniejący corpse/death loot flow.

Nie tworzyć:

- `NpcEquipmentInventory`;
- `GuardLoadout`;
- `TraderLoadout`;
- persistent `equippedWeaponId`;
- persistent NPC `EquipmentState`;
- rarity/weapon-tier systemu;
- ogólnego AI scoring framework.

## 2. Current problem

Obecny `src/ai/npcCombat.ts` tworzy listy melee/ranged kinds z `ITEM_CATALOG` i wybiera pierwszy posiadany pasujący `ItemKind`.

W efekcie wybór zależy od kolejności katalogu zamiast od:

- profesji;
- statystyk broni;
- jakości alternatyw, które NPC faktycznie posiada.

Ten plan zastępuje katalog-order selection małym profession-aware resolverem.

## 3. Separate melee and ranged selection

Nie porównywać miecza z łukiem.

Istniejący `CombatIntent.mode` pozostaje właścicielem decyzji:

```text
melee vs ranged
```

Plan odpowiada tylko:

```text
mode = melee
→ którą broń melee wybrać?

mode = ranged
→ którą broń ranged wybrać?
```

Nie zmieniać decision/action flow ustalającego tryb walki.

## 4. Small weapon-family classification

Dodać lokalną klasyfikację używaną przez NPC combat selection.

Przykładowo:

```ts
type NpcMeleeWeaponFamily =
  | 'compact'
  | 'sword'
  | 'axe'
  | 'spear'
  | 'tool'

type NpcRangedWeaponFamily =
  | 'bow'
```

Wystarczy mały pure resolver/mapa w domenie NPC combat, np.:

```ts
npcMeleeWeaponFamily(kind)
npcRangedWeaponFamily(kind)
```

Nie dodawać na tym etapie `handling`, długości broni ani weapon family do każdego `ItemDef` / `MeleeConfig`.

### Suggested melee mapping

#### compact

- `knife`
- `dagger`
- `damascus_knife`

#### sword

- `short_sword`
- `long_sword`
- `damascus_short_sword`
- `damascus_long_sword`
- `masterwork_sword`
- `obsidian_sword`

#### axe

- `hatchet`
- `axe`
- `battle_axe`

#### spear

- `spear`
- `pitchfork`

#### tool / fallback

- `sickle`
- `shovel`
- inne melee-capable narzędzia, jeśli obecny katalog je zawiera.

### Ranged

W V1 wszystkie istniejące ranged weapons są rodziną `bow`:

- `short_bow`
- `hunting_bow`
- `masterwork_hunting_bow`
- `long_bow`

Jeśli w przyszłości pojawi się kusza lub inna rodzina ranged, dopiero wtedy rozszerzyć klasyfikację.

## 5. Profession preferences

Nie tworzyć długiej kolejności konkretnych itemów.

Każda profesja dostaje jedną preferowaną rodzinę melee albo mały równorzędny zestaw rodzin.

Suggested V1:

| Role | Preferred melee family |
|---|---|
| `guard` | `sword` |
| `trader` | `compact` |
| `hunter` | `compact` |
| `woodcutter` | `axe` |
| `farmer` | `spear`, `tool` |
| `blacksmith` | `axe`, `sword` |
| `miner` | `compact`, `axe` |
| `fisher` | `compact`, `spear` |
| `shepherd` | `spear` |
| `textile_worker` | `compact` |
| `herbalist` | `compact` |

Dla ról bez jawnej preferencji użyć małego defaultu `compact`.

### Ranged preference

Hunter preferuje `bow`.

Pozostałe role nie potrzebują osobnych preferencji ranged w V1, dopóki istnieje tylko jedna rodzina ranged.

Nie wpisywać preferencji typu:

```text
guard → masterwork_sword
```

Ma być:

```text
guard → sword
```

Dzięki temu nowy lepszy miecz automatycznie uczestniczy w wyborze.

## 6. Base combat score

Plan ma pozostać prosty.

### Melee

```text
attackCycle =
windUp + hitWindow + recovery

baseScore =
damage / attackCycle
```

Nie dodawać w V1 dodatkowego ważenia:

- block chance;
- partial reduction;
- stamina;
- range;
- arc;
- personality;
- Strength;
- durability;
- sharpness.

Te statystyki nadal wpływają na rzeczywistą walkę. Score służy tylko do sensownego wyboru spośród posiadanych broni.

### Ranged

```text
attackCycle =
drawTime + recovery

baseScore =
damage / attackCycle
```

Nie tworzyć osobnej rozbudowanej formuły dla accuracy/range/critical w V1.

## 7. Profession preference as ×1.5 bonus

Zamiast wieloetapowego rankingu użyć jednej reguły:

```text
effectiveScore =
baseScore × 1.5
jeżeli weapon family jest preferowana przez profesję

effectiveScore =
baseScore
w przeciwnym przypadku
```

Następnie wybrać broń z najwyższym `effectiveScore`.

To oznacza, że broń spoza preferowanej rodziny musi być co najmniej ~50% lepsza bazowo, aby wygrać.

### Example — Guard

```text
short_sword baseScore = 33
preferred sword bonus → 49.5

battle_axe baseScore = 45
→ short_sword
```

```text
short_sword baseScore = 33
preferred sword bonus → 49.5

future_super_axe baseScore = 55
→ future_super_axe
```

NPC zachowuje charakter profesji, ale nie ignoruje dramatycznie lepszego sprzętu.

### Example — Trader

```text
dagger baseScore = 39
preferred compact bonus → 58.5

long_sword baseScore = 45
→ dagger
```

Ale wyjątkowo mocna broń innej rodziny może wygrać, jeżeli przekroczy wynik po bonusie.

## 8. Deterministic tie-break

Przy równym `effectiveScore` wynik musi być deterministyczny.

Preferowany tie-break:

1. wyższy `baseScore`;
2. stabilny `ItemKind` lexical/catalog-independent order.

Nie opierać tie-breaku na aktualnej kolejności `Object.keys(ITEM_CATALOG)`.

## 9. Per-instance condition is deferred

Melee maintenance jest instance-backed, ale obecny resolver zwraca przede wszystkim:

```text
ItemKind + MeleeConfig
```

V1 selection używa **bazowych statystyk katalogu**, nie aktualnego:

- sharpness;
- durability.

To oznacza, że bardzo tępy miecz nadal może wygrać ranking nominalny.

Nie rozszerzać tego planu o persistent equipped-instance state tylko po to, żeby rozwiązać ten przypadek.

Future follow-up może zrobić condition-aware concrete-instance selection, jeśli gameplay pokaże taką potrzebę.

## 10. Selection lifetime

Nie przeliczać rankingu co tick.

Istniejący `NpcAgent` już cache'uje:

- `combatMeleeWeapon`;
- `combatRangedWeapon`.

Zachować flow:

```text
beginCombat()
→ resolve weapon once
→ cache weapon
→ execute combat
→ endCombat()
```

Przy następnym encounter wybór jest ponawiany i uwzględnia aktualny `personalInventory`.

## 11. Ranged integration

`resolveNpcRangedWeapon()` ma korzystać z tego samego podejścia:

```text
owned compatible ranged weapons
→ base ranged score
→ profession family bonus if applicable
→ deterministic best
```

Hunter mający:

```text
short_bow
hunting_bow
masterwork_hunting_bow
long_bow
```

nie wybiera pierwszego łuku z katalogu, tylko najlepszy według score.

Nie zmieniać:

- ammo ownership;
- ammo selection;
- projectile lifecycle;
- combat mode selection.

## 12. Worn armor derived from personal inventory

NPC posiadający armor w `personalInventory` powinien faktycznie korzystać z jego ochrony.

Nie dodawać persistent `EquipmentState` do `NpcAuthoritativeState`.

Zamiast tego:

```text
personalInventory
→ armor instances
→ best instance per EquipmentSlot
→ derived EquipmentState
→ resolveEquipmentModifiers()
```

Selection jest wyprowadzana z realnie posiadanych item instances.

Po zmianie inventory wynik może zostać ponownie wyprowadzony bez synchronizacji drugiego stanu.

## 13. Armor selection

Dla każdego `EquipmentSlot`:

1. zbierz kompatybilne armor instances z `personalInventory`;
2. użyj istniejących armor metadata / quality;
3. wybierz najlepszy effective armor item;
4. zbuduj derived equipment state.

Preferować reuse:

- `resolveArmorInstanceEffective()`;
- `resolveEquipmentModifiers()`;
- istniejące slot compatibility helpers.

Nie kopiować armor formulas do `npcCombat.ts`.

Najprostszy V1 ranking:

```text
highest effective damage reduction
```

Przy remisie zastosować deterministic tie-break po `ItemKind` / instance id.

## 14. Incoming NPC damage

Obecnie flow używa aktywnej defense z posiadanego defensive item:

```text
incoming damage
→ resolveNpcDefenseConfig(personalInventory)
→ active defense/block
→ HealthState
```

Po zmianie:

```text
incoming damage
→ existing active defense/block
→ derived worn armor modifiers
→ final damage
→ HealthState
```

Armor mitigation ma reuse dokładnie ten sam shared equipment resolver co player.

Nie redukować przez armor:

- starvation;
- dehydration;
- innych nie-combatowych damage sources, jeśli player armor również ich nie redukuje.

## 15. Armor restrictions

V1 ma przede wszystkim dodać ochronę.

Nie rozszerzać planu o pełne wykorzystanie:

- movement speed multiplier;
- sprint stamina multiplier;
- melee stamina multiplier;
- melee recovery multiplier.

Jeżeli podczas implementacji istniejący shared combat seam pozwala zastosować konkretny modifier bez dodatkowej architektury, można to zrobić wyłącznie gdy nie zwiększa istotnie zakresu.

Definition of done nie zależy od tych restriction modifiers.

## 16. Ownership and death

Broń i armor cały czas pozostają w:

```text
NpcAuthoritativeState.personalInventory
```

Selection nie przenosi itemów do innego inventory.

Flow pozostaje:

```text
player daje NPC item
→ personalInventory
→ NPC może go wybrać / używać
→ NPC umiera
→ existing corpse/belongings flow zachowuje item
```

Nie kopiować selected items do `carried`.

## 17. Persistence

Nie dodawać nowych pól save.

Nie zapisujemy:

- selected weapon;
- preferred family;
- derived armor equipment;
- combat score.

Po reload:

```text
role + personalInventory + ITEM_CATALOG
→ deterministic resolver
→ ten sam selection result
```

To zachowuje jedno źródło prawdy.

## 18. Proposed implementation seams

Najważniejszy plik:

`src/ai/npcCombat.ts`

Rozszerzyć o małe pure helpers, np.:

```ts
npcMeleeWeaponFamily(kind)
preferredNpcMeleeFamilies(role)
meleeCombatScore(config)
rangedCombatScore(config)
resolveNpcMeleeWeapon(inventory, role)
resolveNpcRangedWeapon(inventory, role)
resolveNpcArmorEquipment(inventory)
```

Nazwy są orientacyjne; nie tworzyć helperów, których aktualny kod nie potrzebuje.

`NpcAgent` powinien tylko przekazać:

- `personalInventory`;
- `role`;

i cache'ować wynik jak dziś.

Armor ma reuse `src/items/equipment.ts` oraz istniejące armor-instance helpers.

## 19. Future compatibility

Gdy pojawia się nowy sword:

1. item dostaje normalny combat config;
2. family resolver klasyfikuje go jako `sword`;
3. statystyki automatycznie decydują, czy jest najlepszym mieczem;
4. Guard nie wymaga zmiany rankingu.

Analogicznie:

- nowy dagger → `compact`;
- nowy axe → `axe`;
- nowy bow → `bow`.

Jeżeli nowa rodzina pojawi się często albo kilka subsystemów zacznie potrzebować tego samego metadata, wtedy można przenieść family classification do wspólnego item catalog.

Nie robić tego prewencyjnie w tym planie.

## 20. Tests

### Weapon family

Testy:

- aktualne combat weapons mają oczekiwaną rodzinę;
- `dagger`, `hatchet`, `masterwork_hunting_bow` są poprawnie sklasyfikowane po implementacji items-player-047.

### Best weapon in preferred family

Guard posiada:

```text
short_sword
long_sword
masterwork_sword
```

→ wybiera najlepszy sword.

Trader posiada:

```text
knife
dagger
damascus_knife
```

→ wybiera najlepszy compact weapon.

Hunter posiada kilka bows:

→ ranged resolver wybiera najlepszy bow.

### Preference bonus

Guard:

```text
preferred sword effective score
>
slightly better non-sword base score
```

→ sword.

### Override by clearly superior weapon

Jeśli:

```text
preferred baseScore = 40
non-preferred baseScore = 59
```

→ preferred wygrywa po bonusie 60.

Jeśli:

```text
preferred baseScore = 40
non-preferred baseScore = 60
```

→ wynik przy dokładnym remisie rozstrzyga deterministic tie-break.

Jeśli non-preferred > 60:

→ non-preferred wygrywa.

Test powinien zakotwiczyć dokładną semantykę progu `×1.5`.

### Determinism

Ten sam:

- role;
- inventory;
- catalog;

→ zawsze ten sam wynik niezależnie od object/map iteration order.

### Armor

- brak armor → brak armor mitigation;
- leather armor → redukcja combat damage;
- chainmail / lepsza jakość → odpowiednio większa ochrona;
- dwa items tego samego slotu → najlepszy wybrany;
- item po transferze/usunięciu przestaje wpływać bez stale equipped state;
- armor pozostaje w `personalInventory`;
- corpse/death path nadal zachowuje belongings.

## 21. Explicit non-goals

Nie implementować:

- ręcznego NPC equipment UI;
- player command `equip this weapon`;
- persistent equipped weapon;
- persistent NPC EquipmentState;
- zmian `CombatIntent.mode`;
- weapon switching podczas aktywnego encounter;
- personality-based weapon choice;
- skill-based weapon choice;
- weapon handling/length metadata;
- condition-aware sharpness/durability ranking;
- merchant wealth tiers;
- merchant guard composition;
- nowych weapon kinds;
- nowych armor items;
- NPC visual armor attachment;
- profesyjnego loadout/crafting overhaul.

## 22. Definition of done

Plan jest wykonany, gdy:

- NPC wybiera broń z `personalInventory`, a nie według kolejności katalogu;
- melee i ranged są oceniane osobno zgodnie z istniejącym combat mode;
- profesja daje prosty bonus `×1.5` preferowanej rodzinie;
- najlepsza broń w rodzinie wynika z aktualnych combat stats;
- wyraźnie lepsza broń innej rodziny może pokonać preference;
- nowe bronie tej samej rodziny nie wymagają ręcznego rankingu konkretnych `ItemKind`;
- selection jest deterministyczny i cache'owany na encounter;
- NPC automatycznie korzysta z najlepszego posiadanego armor per slot;
- armor korzysta z istniejącego shared equipment resolvera;
- nie powstaje nowy persistent equipment state;
- ownership pozostaje w `personalInventory`;
- targeted automated tests przechodzą.

Manualne/browser gameplay verification wykonuje User.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
