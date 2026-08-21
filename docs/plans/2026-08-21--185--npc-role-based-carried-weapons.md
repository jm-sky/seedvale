# Plan: NPC Role-Based Carried Weapons

**Created:** 2026-08-21  
**Status:** `verification needed` 🔍  
**Priority:** high · **Effort:** S  
**Depends on:** ~~177~~ ~~179~~ ~~184~~

domain: settlements-npcs
tags: [npcs, combat, inventory, items]

## 1. Cel

Zapewnić NPC realną broń noszoną przy sobie, dobraną na podstawie ich roli/profesji.

Broń ma być istniejącym itemem w `Inventory`, tak aby NPC Combat 177 oraz decyzja z planu 179 mogły korzystać z niej bez specjalnych wyjątków.

Docelowo:

```text
NPC
 ↓
role / profession
 ↓
default carried weapon
 ↓
Inventory
 ↓
existing NPC weapon resolver / capability
 ↓
melee capability
 ↓
animal threat
 ↓
defend
 ↓
NPC Combat 177
```

Nie tworzyć nowego equipment systemu.

## 2. Istniejący miecz — source of truth

Przed implementacją znaleźć istniejący przypadek NPC, który już otrzymuje miecz.

Ustalić:

- gdzie ten NPC jest tworzony,
- gdzie miecz jest przydzielany,
- jakiego itemu używa,
- jak trafia do `Inventory`,
- jak `npcCombat.ts` go rozpoznaje.

Ta ścieżka jest źródłem prawdy. Nie tworzyć drugiego mechanizmu wyposażania tego NPC.

Jeżeli obecna implementacja jest wyjątkiem, przenieść ją do wspólnego mechanizmu role → weapon.

## 3. Reconnaissance — pliki

Przed zmianami przeanalizować aktualny codebase, w szczególności:

```text
src/ai/NpcAgent.ts
src/ai/characters.ts
src/ai/npcCombat.ts
src/items/Inventory.ts
src/items/
src/combat/
```

Wyszukać:

```text
sword
axe
knife
Inventory
addItem
resolveNpcMeleeWeapon
NpcAgent
```

Dodatkowo sprawdzić istniejące `ITEM_CATALOG` i capability abstraction z planu 184. Nie zakładać nazw API na podstawie planów — aktualny kod jest źródłem prawdy.

## 4. Wspólna mapa role → weapon

Wprowadzić jedno miejsce odpowiedzialne za domyślną broń NPC, np.:

```ts
defaultWeaponForRole(role)
```

lub odpowiednik zgodny z istniejącą architekturą.

Nie rozrzucać po `NpcAgent`, settlementach i combat:

```ts
if (role === ...) addAxe()
if (role === ...) addSword()
```

Najpierw ustalić z aktualnego kodu:

1. wszystkie istniejące role/profesje,
2. wszystkie istniejące melee weapons,
3. istniejące wyjątki wyposażenia,
4. minimalne sensowne mapowanie.

Przykładowy kierunek, do potwierdzenia w kodzie:

```text
woodcutter → axe
guard       → sword
farmer      → knife
```

Nie tworzyć nowych itemów tylko na potrzeby tego planu, jeżeli odpowiednia broń już istnieje.

Jeżeli dla roli nie ma odpowiedniej istniejącej broni, może pozostać bez domyślnej broni.

## 5. Broń jako realny item

NPC otrzymuje broń przez istniejący `Inventory`.

Nie dodawać równoległego pola typu:

```ts
npc.weapon = 'sword'
```

jeżeli nie jest ono częścią istniejącego modelu.

Źródłem prawdy ma być Inventory, a istniejący resolver/capability ma ustalać, czy NPC może użyć broni melee.

## 6. Inicjalizacja NPC

W `src/ai/NpcAgent.ts` znaleźć konstruktor/factory/initialization path odpowiedzialny za stworzenie inventory.

Przy tworzeniu NPC:

```text
create NPC
 ↓
create Inventory
 ↓
determine role
 ↓
defaultWeaponForRole(role)
 ↓
add weapon to Inventory
```

Broń dodawana jest raz podczas inicjalizacji.

Nie dodawać jej w `update()`, przy wykryciu zagrożenia ani przy rozpoczęciu combat.

## 7. Nie nadpisywać istniejącego wyposażenia

Jeżeli NPC posiada już broń z istniejącej ścieżki:

```text
existing carried melee weapon
    → preserve it

no melee weapon
    → assign default weapon for role
```

Szczególnie zachować istniejący przypadek NPC z mieczem i nie dopuścić do dodania drugiego miecza.

## 8. Zmiana roli

Domyślna broń jest wyposażeniem początkowym.

Jeżeli role/profesje mogą się zmieniać podczas życia NPC, nie wymieniać automatycznie broni przy każdej zmianie roli, chyba że istniejący equipment system już definiuje taki lifecycle.

Nie tworzyć tutaj nowego systemu wymiany wyposażenia.

## 9. Integracja z item capability / NPC combat

Wykorzystać mechanizm z planu 184 oraz istniejący `src/ai/npcCombat.ts`.

Zweryfikować `resolveNpcMeleeWeapon()` i capability query.

Docelowo istniejące bronie powinny być rozpoznawane przez wspólny mechanizm:

```text
NPC + axe
→ melee capability / resolveNpcMeleeWeapon()
→ axe

NPC + sword
→ melee capability / resolveNpcMeleeWeapon()
→ sword

NPC + knife
→ melee capability / resolveNpcMeleeWeapon()
→ knife
```

Jeżeli resolver wymaga rozszerzenia, rozszerzyć istniejący mechanizm. Nie tworzyć alternatywnego weapon registry.

## 10. Integracja z planem 179

Nie dodawać do `src/ai/npcAnimalThreat.ts` warunków zależnych od konkretnej broni:

```text
if sword → defend
if axe → defend
if knife → defend
```

Decyzja ma nadal operować na capability:

```text
hasMeleeCapability
hasRangedCapability
healthRatio
```

Po wyposażeniu:

```text
NPC + melee weapon
→ hasMeleeCapability = true
→ animal threat can select defend
```

Brak broni nadal może prowadzić do `flee`.

## 11. NPC Combat 177

Nie tworzyć nowego combat pipeline.

Broń ma wejść do istniejącego przepływu:

```text
CombatIntent
 ↓
NPC Combat 177
 ↓
resolve weapon / capability
 ↓
melee attack
 ↓
damage
 ↓
HealthState
```

Nie tworzyć `NpcAnimalCombat`, `NpcWeaponCombat` ani specjalnego `KnifeAttack`/`AxeAttack`.

## 12. Item count / lifecycle

Każdy NPC powinien otrzymać jedną domyślną broń, jeżeli jego rola ją definiuje.

Nie dodawać broni ponownie podczas:

- `update`,
- zmiany fazy,
- rozpoczęcia combat,
- reloadu/persistencji świata.

Jeżeli inventory jest serializowane, uwzględnić istniejący lifecycle zamiast tworzyć drugi stan.

## 13. Testy

Dodać testy w istniejących miejscach testowych.

### Mapping

```text
role → expected default weapon
```

### Inventory

```text
new NPC
→ inventory contains expected weapon
```

### Existing weapon

```text
NPC already carrying sword
→ no second sword is added
```

### Weapon resolution / capability

```text
NPC with axe
→ existing resolver/capability finds axe

NPC with sword
→ existing resolver/capability finds sword

NPC with knife
→ existing resolver/capability finds knife
```

### Threat decision

```text
healthy NPC + melee weapon
→ decideAnimalThreatResponse()
→ defend
```

### Unarmed regression

```text
NPC without weapon
→ flee
```

## 14. Browser verification

Zweryfikować rzeczywisty gameplay:

1. Uruchomić świat.
2. Znaleźć NPC różnych profesji.
3. Potwierdzić ich Inventory i broń.
4. Uruchomić `setFrenzyWolf()`.
5. Potwierdzić atak wilka.
6. Potwierdzić percepcję zagrożenia NPC.
7. Potwierdzić wybór `defend`.
8. Potwierdzić wejście w NPC Combat 177.
9. Potwierdzić faktyczny atak odpowiednią bronią.
10. Potwierdzić obrażenia wilka.

Szczególnie sprawdzić NPC, który już wcześniej otrzymywał miecz.

## 15. Performance

Nie dodawać nowego update loop, globalnego equipment managera, weapon registry ani workerów.

Mapowanie role → weapon wykonywać wyłącznie podczas inicjalizacji NPC.

Nie skanować inventory co klatkę poza istniejącym mechanizmem combat/capability.

## 16. Zakres V1

### W zakresie

- znalezienie istniejącego mechanizmu miecza,
- ujednolicenie istniejącego wyjątku z role → weapon, jeżeli jest potrzebne,
- role → default melee weapon,
- nóż dla odpowiednich NPC,
- siekiera dla odpowiednich NPC,
- miecz dla odpowiednich NPC,
- zachowanie istniejącego miecza,
- zapis broni w `Inventory`,
- wykorzystanie capability abstraction z 184,
- integracja z `resolveNpcMeleeWeapon()`/istniejącym NPC combat,
- integracja z `hasMeleeCapability`,
- testy,
- scenariusz wilk → NPC → obrona.

### Poza zakresem

- pełny equipment system,
- sloty equipment,
- durability,
- loot,
- crafting,
- automatyczna wymiana broni przy zmianie roli,
- losowanie broni,
- ranged weapons,
- inventory UI,
- weapon upgrades,
- nowe typy broni tworzone wyłącznie na potrzeby tego zadania.

## 17. Acceptance criteria

```text
NPC
→ posiada broń zgodną z rolą, jeśli istnieje odpowiedni item

woodcutter
→ może mieć axe

farmer / odpowiedni zwykły NPC
→ może mieć knife

guard / odpowiednia istniejąca rola
→ może mieć sword

istniejący NPC z mieczem
→ nadal posiada miecz
→ nie dostaje drugiego miecza

broń
→ znajduje się w Inventory

Inventory
→ jest źródłem prawdy dla NPC combat

istniejący resolver/capability
→ rozpoznaje bronie

NPC z bronią
→ hasMeleeCapability === true

NPC z bronią + animal threat
→ może wybrać defend

defend
→ korzysta z NPC Combat 177

NPC faktycznie atakuje wilka
→ istniejącą bronią

brak nowego equipment/combat/threat systemu
```

## 18. Verification

Sprawdzić:

- wszystkie istniejące role/profesje,
- istniejące itemy melee,
- istniejącego NPC z mieczem,
- wszystkie miejsca inicjalizacji `NpcAgent`,
- `Inventory` lifecycle,
- `resolveNpcMeleeWeapon()` oraz capability abstraction z 184,
- testy inventory/NPC/combat,
- typecheck,
- lint,
- build,
- browser/gameplay scenario z planu 179.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
