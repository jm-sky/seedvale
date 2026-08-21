# Plan: Item Capability Abstraction

**Created:** 2026-08-21
**Status:** `verification needed` 🔍 — implemented 2026-08-21, see [implementation notes](./2026-08-21--184--item-capability-abstraction-implementation-notes.md)
**Priority:** medium · **Effort:** M
**Depends on:** none

## Cel

Ujednolicić sposób, w jaki Seedvale odpowiada na pytanie:

> „Czy ten przedmiot potrafi wykonać daną operację?”

Obecnie część takich pytań korzysta z istniejących capability-like danych w `ITEM_CATALOG`, a część bezpośrednio z `ItemKind`.

Przykłady:

```ts
inventory.holdsAny('knife') || inventory.holdsAny('damascus_knife')
```

```ts
heldTool.held() === 'shovel'
```

```ts
heldTool.held() !== 'pickaxe'
```

Celem nie jest stworzenie całkowicie nowego systemu od zera.

Celem jest:

1. zmapowanie istniejących mechanizmów,
2. rozdzielenie identity/category/capability/state,
3. znalezienie miejsc, gdzie `ItemKind` jest używany jako proxy capability,
4. zaprojektowanie minimalnej abstrakcji wynikającej z istniejącego codebase,
5. stopniowa migracja odpowiednich przypadków,
6. usunięcie zbędnej duplikacji.

---

# 1. Source of Truth

Przed rozpoczęciem implementacji przeczytać:

- `CLAUDE.md`
- `docs/STATE.md`
- `docs/VISION.md`
- `docs/ROADMAP.md`
- `docs/plans/README.md`

Następnie zweryfikować istniejący reconnaissance względem aktualnego codebase.

**Aktualny kod jest źródłem prawdy.**

Nie zakładać, że wcześniejszy research jest w 100% aktualny.

---

# 2. Audit & Reconciliation

Przeanalizować istniejące mechanizmy:

- `ItemKind`
- `ItemCategory`
- `ITEM_CATALOG`
- `holdable`
- `melee`
- `ranged`
- `defense`
- `consumable`
- `food.bait`
- `ToolKind`
- `HELD_TOOL_KINDS`
- `WeaponMaintenanceKind`
- `WEAPON_MAINTENANCE_KINDS`
- `MeleeToolKind`
- `isMeleeTool()`
- `isChopTool()`
- `isHarvestKnife()`
- ręczne `ItemKind` checks,
- ręczne listy `ItemKind`,
- capability-derived sets.

Dla każdego mechanizmu ustalić, czy reprezentuje:

```text
Identity
Category
Capability
Instance State
Lifecycle / Metadata
Context-specific Rule
```

Nie łączyć mechanizmów tylko dlatego, że technicznie wyglądają podobnie.

---

# 3. Capability Matrix

Przed implementacją przygotować **Capability Matrix** wynikającą z aktualnego kodu.

Przykładowy format:

| Capability candidate | Obecne źródło | Itemy | Query | Substytucja | Uwagi |
|---|---|---|---|---|---|
| `melee` | `ITEM_CATALOG.melee` | wiele | held | tak | istniejące |
| `ranged` | `ITEM_CATALOG.ranged` | wiele | held | tak | istniejące |
| `defense` | `ITEM_CATALOG.defense` | wiele | held | tak | istniejące |
| `wood_cutting` | `isChopTool()` | axe/... | held | tak | kandydat |
| `meat_harvesting` | `isHarvestKnife()` | knife/... | inventory/held | tak | kandydat |
| `digging` | hardcoded | shovel/... | held/inventory | do ustalenia | wymaga analizy |
| `mining` | hardcoded | pickaxe/... | held | do ustalenia | wymaga analizy |
| `burying` | hardcoded | shovel/... | held | do ustalenia | kandydat |

To są **candidate capabilities**, a nie z góry ustalony finalny model.

Dla każdego kandydata ustalić:

- dokładną semantykę,
- obecne źródło prawdy,
- wszystkie znane itemy,
- miejsca użycia,
- czy capability jest statyczna,
- czy wymaga state/context constraints,
- czy istnieje sensowna substytucja,
- czy powinna być częścią wspólnego capability modelu.

---

# 4. Rozdzielenie Capability od Operation / Context

Nie zakładać automatycznie, że każda akcja powinna dostać osobną capability.

Szczególnie przeanalizować:

```text
soil digging
rock digging
ore mining
ground leveling
rock leveling
burying
tree chopping
meat harvesting
fishing
lighting
construction
```

Przykładowo obecny kod może wskazywać na:

```text
shovel → soil digging
pickaxe → rock digging / mining
```

ale nie należy tego automatycznie uogólniać do:

```text
shovel + pickaxe → digging
```

Podobnie `digging`, `mining` i `leveling` mogą być:

- osobnymi capabilities,
- capability + operation context,
- albo częścią bardziej szczegółowej konfiguracji.

**Rozstrzygnięcie ma wynikać z rzeczywistego gameplay i istniejącego kodu.**

Nie rozdrabniać capabilities bez realnej potrzeby.

---

# 5. Design Checkpoint

## WAŻNE

**Nie rozpoczynać implementacji capability abstraction przed zakończeniem tego etapu.**

Na podstawie audytu i Capability Matrix przygotować krótką decyzję projektową obejmującą:

1. które istniejące mechanizmy są już capability,
2. które powinny zostać ujednolicone,
3. które powinny pozostać specjalizowanymi konfiguracjami,
4. które hardcoded `ItemKind` checks powinny zostać zmigrowane,
5. jakie capability candidates faktycznie są potrzebne,
6. jaki jest minimalny model danych,
7. jakie API jest rzeczywiście potrzebne,
8. które mechanizmy zostaną usunięte po migracji.

### Nie zakładać z góry:

```ts
type ItemCapability = ...
```

ani:

```ts
capabilities: ItemCapability[]
```

ani:

```ts
hasCapability(...)
```

To są możliwe rozwiązania, nie wymagania.

Model powinien wynikać z istniejącego `ITEM_CATALOG`, gameplay i sposobu używania itemów.

---

# 6. Nie tworzyć drugiego systemu obok ITEM_CATALOG

`ITEM_CATALOG` jest obecnie centralnym miejscem gameplay metadata.

Istnieją już capability-like właściwości:

```text
melee
ranged
defense
holdable
consumable
food.bait
```

Dlatego najpierw sprawdzić, czy nowy mechanizm może być naturalnym rozszerzeniem tego modelu.

Unikać architektury:

```text
ITEM_CATALOG
+
osobny ItemCapabilityRegistry
+
osobne ToolRegistry
+
osobne WeaponRegistry
```

jeżeli nie ma ku temu konkretnej potrzeby.

**Jedno źródło prawdy jest preferowane.**

---

# 7. Capability nie musi być jednym technicznym mechanizmem

Nie wymuszać pełnej unifikacji tylko dlatego, że wszystkie właściwości opisują funkcje przedmiotu.

Przykładowo:

```text
melee
ranged
defense
```

mają już bogate konfiguracje:

```text
damage
range
arc
timing
ammo
block chance
damage reduction
...
```

Nie należy spłaszczać ich do prostych stringów, jeśli istniejący model jest semantycznie właściwy.

Nowa abstrakcja powinna **ujednolicać query semantics**, a niekoniecznie wszystkie dane konfiguracyjne.

---

# 8. Inventory API

Przeanalizować potrzebę zapytań typu:

```ts
inventory.hasCapability('meat_harvesting')
```

lub:

```ts
inventory.findWithCapability('meat_harvesting')
```

Nie implementować obu tylko dlatego, że są możliwe.

Ustalić minimalne API na podstawie rzeczywistych callerów.

API powinno pozwalać odpowiedzieć na pytanie:

> Czy inventory zawiera dowolny przedmiot spełniający wymaganie?

oraz, jeżeli potrzebne:

> Który konkretny item spełnia wymaganie?

Nie tworzyć osobnego helpera dla każdej capability.

---

# 9. HeldTool

`HeldTool` nadal powinien odpowiadać za equipment state:

- aktualnie trzymany item,
- `ItemInstance`,
- equip/unequip,
- synchronizację z Inventory.

Rozważyć query typu:

```ts
heldTool.hasCapability(...)
```

tylko jeżeli rzeczywiste użycie tego uzasadnia.

Nie przenosić całej logiki capability do `HeldTool`.

---

# 10. ItemInstance vs Capability

Zachować rozdzielenie:

```text
ItemKind
    ↓
static item definition / gameplay capabilities

ItemInstance
    ↓
instance-specific state
```

`ItemInstance` reprezentuje konkretny egzemplarz.

`WeaponItemInstance` posiada m.in.:

```text
durability
sharpness
```

`WeaponMaintenanceKind` jest klasyfikacją potrzebną do obsługi tego stanu.

Nie traktować `WeaponMaintenanceKind` jako capability.

Nie przenosić do capability:

- durability,
- sharpness,
- freshness,
- innych danych konkretnego egzemplarza.

Jeżeli możliwość wykonania operacji zależy od stanu:

```text
static capability
+
instance/state constraint
```

Przykład:

```text
item jest consumable
+
konkretny egzemplarz nie jest spoiled
```

---

# 11. Tool Substitution

Przeanalizować wszystkie miejsca, gdzie kod wymaga konkretnego narzędzia.

Szczególnie:

### Shovel

Obecne zastosowania:

- digging,
- leveling,
- burying.

### Pickaxe

Obecne zastosowania:

- rock digging,
- rock leveling,
- ore mining.

### Axe

Obecne zastosowanie:

- tree chopping.

### Knife

Obecne zastosowanie:

- meat harvesting.

### Inne

Przeanalizować:

- hammer,
- pitchfork,
- sickle,
- fishing rod,
- firestarter,
- torch,
- bows,
- weapons.

Substytucja jest dozwolona wyłącznie wtedy, gdy różne itemy faktycznie mogą poprawnie wykonać tę samą operację.

Nie zakładać:

```text
tool → capability
```

bez potwierdzenia w gameplay.

---

# 12. Combat jako istniejący wzorzec

Nie przebudowywać combat bez potrzeby.

Wykorzystać istniejący model:

```text
ITEM_CATALOG
    ↓
melee / ranged / defense
    ↓
capability-derived sets
    ↓
Inventory
```

NPC combat już realizuje ideę:

> znajdź dowolny przedmiot spełniający wymaganie.

Jeżeli capability abstraction obejmie combat, powinna:

- ograniczyć duplikację,
- zachować istniejące zachowanie,
- wykorzystywać obecne metadata,
- nie tworzyć drugiego weapon capability registry.

---

# 13. Usunięcie duplikatów

Po migracji ponownie przeanalizować:

- `ToolKind`,
- `HELD_TOOL_KINDS`,
- `MeleeToolKind`,
- `MELEE_CAPABLE_KINDS`,
- `RANGED_CAPABLE_KINDS`,
- `DEFENSE_CAPABLE_KINDS`,
- `isChopTool()`,
- `isHarvestKnife()`,
- ręczne listy `ItemKind`.

Każdy pozostały mechanizm powinien mieć jasną odpowiedzialność.

Usuwać tylko mechanizmy, których odpowiedzialność rzeczywiście przejęła nowa abstrakcja.

Nie robić niezwiązanego cleanupu.

---

# 14. Migracja istniejących przypadków

Po zakończeniu Design Checkpoint zmigrować odpowiednie miejsca.

Priorytetem są:

### High

- knife / damascus knife → meat harvesting,
- shovel → odpowiednie operacje,
- pickaxe → odpowiednie operacje,
- axe → wood cutting,
- hardcoded tool requirements.

### Medium

- leveling,
- fishing,
- inne tool interactions.

### Existing / Reconciliation

- melee,
- ranged,
- defense,
- holdable.

Nie migrować kodu tylko po to, żeby „wszędzie było capability”.

---

# 15. Construction / Building

Szczególnie przeanalizować wymagania narzędzi przy budowaniu.

Jeżeli istnieje:

```text
requiredTool: 'shovel'
```

ustalić, czy wymaganie oznacza:

```text
konkretny ItemKind
```

czy:

```text
zdolność potrzebną do wykonania operacji
```

Jeżeli jest to capability requirement, powinien zostać wyrażony semantycznie.

Przykładowo:

```text
requiredTool: 'shovel'
```

może stać się:

```text
requiredCapability: 'digging'
```

ale **tylko jeśli istnieje uzasadniona substytucja**.

---

# 16. Dodawanie nowego ItemKind jako test architektury

Po migracji sprawdzić mentalnie lub testowo scenariusz:

> Dodajemy nowy `ItemKind`, np. `iron_shovel`.

Idealny rezultat:

```text
ITEM_CATALOG
    ↓
item definition
    ↓
capabilities / existing capability metadata
```

i brak konieczności dopisywania go do wielu niezależnych:

```text
if kind === ...
Set<ItemKind>
ToolKind
isXTool()
switch(kind)
```

Jeżeli dodanie nowego itemu nadal wymaga wielu ręcznych zmian, zidentyfikować pozostałe miejsca, które nadal przechowują capability knowledge poza właściwym źródłem prawdy.

Nie eliminować jednak wszystkich `ItemKind` checks — część z nich może być semantycznie uzasadniona.

---

# 17. Testy

Dodać testy zabezpieczające nową abstrakcję.

Minimum:

- capability lookup,
- brak capability,
- wiele itemów z tą samą capability,
- Inventory capability query,
- HeldTool capability query, jeśli API powstanie,
- substytucja narzędzi,
- istniejący combat,
- istniejące zachowanie Inventory.

Przykłady:

```text
knife + damascus_knife
→ meat harvesting
```

```text
shovel
→ odpowiednie digging capability
```

```text
item bez wymaganej capability
→ brak możliwości wykonania operacji
```

Jeżeli dwa itemy mogą wykonać tę samą operację:

```text
item A + item B
→ capability query = true
```

---

# 18. Verification

Uruchomić odpowiednie testy zgodnie z `CLAUDE.md`.

Najpierw sprawdzić `package.json` i użyć faktycznie dostępnych skryptów.

Typowo:

```bash
npm test
npm run typecheck
npm run build
```

Nie zakładać, że każdy z powyższych skryptów istnieje.

Dla zmian gameplay/Three.js przeprowadzić wymagany browser verification.

Raportować osobno:

- implemented,
- technically verified,
- browser/manual verified.

---

# 19. Zakres poza planem

Nie robić:

- pełnego redesignu item systemu,
- nowego equipment systemu,
- zmian ekonomii,
- zmian combat mechanics niezwiązanych z capability,
- refaktoru wszystkich `ItemKind` references,
- capability levels bez realnego use case,
- multiplayer abstractions,
- niezwiązanych optymalizacji,
- szerokiego cleanupu kodu.

Celem jest **semantic item capability abstraction**, nie przebudowa całego systemu itemów.

---

# 20. Kryteria sukcesu

Po implementacji kod powinien w odpowiednich miejscach odpowiadać:

```ts
hasCapability('digging')
```

zamiast:

```ts
has('shovel')
```

oraz:

```ts
hasCapability('meat_harvesting')
```

zamiast:

```ts
holdsAny('knife') ||
holdsAny('damascus_knife')
```

ale **wyłącznie tam, gdzie pytanie gameplay faktycznie dotyczy capability**.

`ItemKind` nadal pozostaje podstawowym identyfikatorem konkretnego rodzaju przedmiotu.

`ItemInstance` nadal reprezentuje konkretny egzemplarz i jego stan.

---

# 21. Oczekiwany rezultat

Claude Code powinien dostarczyć:

1. zaktualizowany audit,
2. Capability Matrix,
3. Design Checkpoint z uzasadnieniem finalnego modelu,
4. określony zakres migracji,
5. implementację,
6. migrację istniejących capability-like checks,
7. usunięcie zbędnych duplikatów,
8. testy,
9. verification report,
10. krótkie podsumowanie miejsc, które celowo pozostały `ItemKind`-based.

Jeżeli podczas implementacji okaże się, że plan rozmija się z aktualnym kodem, należy dostosować implementację do rzeczywistego codebase i wyraźnie odnotować rozbieżność.

**Nie implementować rozwiązania tylko dlatego, że zostało zasugerowane w tym planie. Jeśli aktualny kod wskazuje lepsze rozwiązanie, wybrać rozwiązanie zgodne z istniejącą architekturą i udokumentować decyzję.**

---

## Definition of Done

- capability model wynika z aktualnego codebase,
- istniejące `melee/ranged/defense` nie zostały zdublowane,
- `ItemKind` nie jest używany jako proxy capability tam, gdzie capability jest właściwą semantyką,
- możliwa substytucja narzędzi działa przez wspólną funkcję,
- `ItemInstance` state pozostaje oddzielony od static item capabilities,
- dodanie nowego kompatybilnego ItemKind nie wymaga dopisywania go do wielu ręcznych capability lists,
- testy przechodzą,
- build/typecheck przechodzą,
- wymagane browser verification zostało wykonane,
- brak niepowiązanych refaktorów.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
