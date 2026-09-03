# Plan: NPC Healing

**Created:** 2026-08-21  
**Status:** `planned` 📋  
**Type:** feature  
**Priority:** medium · **Effort:** M  
**Depends on:** ~~177~~  
**Domain:** `npc`  

## Cel

Dodać NPC możliwość reagowania na **uleczalne obrażenia** poprzez istniejący system decyzji, akcji, inventory i consumables.

NPC powinien:
- wykrywać potrzebę leczenia,
- posiadać informację, czy aktualny stan jest uleczalny,
- użyć dostępnego consumable przeznaczonego do leczenia,
- zdecydować kiedy i gdzie się leczyć,
- działać zarówno podczas normalnego życia, jak i po zakończeniu walki,
- nie próbować leczyć HP utraconego wskutek głodu lub pragnienia.

Nie tworzyć osobnego `NpcHealingSystem`.

## Kluczowa zasada: niskie HP ≠ potrzeba leczenia

NPC nie powinien podejmować decyzji o leczeniu wyłącznie dlatego, że:

```text
currentHp < maxHp
```

HP może być niskie z różnych powodów:

```text
physical injury → leczenie może pomóc
starvation       → potrzebne jedzenie
dehydration      → potrzebne picie
```

Decyzja healing powinna opierać się na **uleczalnym stanie/obrażeniu**, a nie samym HP.

Jeżeli NPC jest odwodniony i ma niski poziom HP, bandaż nie powinien być traktowany jako rozwiązanie problemu odwodnienia.

## Przygotowanie pod przyszłe injuries / conditions

Nie implementować teraz pełnego systemu obrażeń/chorób, ale nie projektować Healing w sposób, który go zablokuje.

Docelowo zdrowie może wyglądać np.:

```text
Health
├── HP
└── Conditions / Injuries
    ├── physical wound
    ├── disease
    ├── arm fracture
    ├── leg fracture
    ├── head injury
    ├── impaired vision
    └── ...
```

V1 może posiadać tylko jeden ogólny stan `physical injury`.

W przyszłości można rozszerzyć model o:

```text
type
severity
duration
effects
treatable
treatment
```

Healing powinien być projektowany jako leczenie **konkretnego stanu zdrowotnego**, a nie jako proste „dodaj HP”.

## Źródła obrażeń

Przyszły model powinien pozwalać odróżniać co najmniej:

```text
physical injury
starvation
dehydration
```

Dzięki temu:

```text
HP low
    ├── physical injury
    │       → healing
    ├── starvation
    │       → food
    └── dehydration
            → water
```

Nie tworzyć w ramach tego planu pełnego systemu condition/injury. Jeżeli obecna implementacja nie ma jeszcze odpowiedniej reprezentacji źródła obrażeń, dodać **minimalny mechanizm pozwalający odróżnić uleczalne obrażenie od damage wynikającego z Hunger/Thirst**.

## Consumables

Healing ma korzystać z istniejącego consumable flow.

Nie kodować leczenia na sztywno pod konkretny item typu `bandage`. Wyszukiwać consumable przeznaczony do leczenia, np. przez istniejące `consumable.need === 'health'`.

Obecnie bandaż może być jedynym takim przedmiotem. Przyszłe lekarstwa i lepsze opatrunki powinny być możliwe bez przebudowy AI.

Przepływ powinien wykorzystywać istniejące:

```text
Inventory
→ remove item
→ consumable effect
→ heal health
```

Nie tworzyć równoległego inventory/consumable API.

## Kiedy NPC powinien się leczyć?

Proponowane zachowanie:

```text
brak uleczalnego obrażenia
    → nie leczy

lekki uraz
    → może kontynuować aktualną aktywność

średni uraz
    → healing staje się istotnym pressure

poważny uraz
    → healing otrzymuje wysoki priorytet
```

Dokładne progi ustalić podczas implementacji na podstawie istniejącego HealthState i decision flow.

Healing powinien być **decyzją**, a nie automatycznym efektem damage.

## Walka

Healing nie powinien być częścią wyłącznie combat systemu.

```text
combat
    ↓
NPC receives injury
    ↓
combat ends
    ↓
normal NPC decision
    ↓
healing pressure
    ↓
healing action
```

Podczas aktywnej walki NPC nie powinien po prostu przerywać combat i używać bandaża.

Po zakończeniu walki normalny decision flow może wybrać leczenie.

## Leczenie poza walką

To jest pełnoprawny przypadek:

```text
NPC working
    ↓
takes physical damage
    ↓
continues / finishes activity
    ↓
decision
    ↓
healing
```

Healing nie może być uzależniony od `NpcCombat`. Dzięki temu późniejsze źródła obrażeń, np. środowisko, mogą automatycznie korzystać z tego samego systemu.

## Gdzie NPC się leczy?

V1 nie potrzebuje osobnego systemu placówek medycznych.

Preferencja:

```text
1. własny dom / bezpieczne miejsce
2. inne znane bezpieczne miejsce
3. awaryjnie aktualne bezpieczne miejsce
```

NPC powinien fizycznie dotrzeć do wybranego miejsca przez istniejący movement/action flow.

Nie teleportować NPC do domu tylko dlatego, że chce się leczyć.

Nie tworzyć jeszcze szpitala, lekarza, medical station ani osobnego systemu `HealingLocation`.

## Wykonanie leczenia

Logiczny przebieg akcji:

```text
Healing
    ↓
move to treatment location
    ↓
wait / treatment action
    ↓
consume health consumable
    ↓
apply healing
    ↓
action complete
```

Po zakończeniu leczenia NPC **nie powinien automatycznie wracać do poprzedniej czynności**. Zamiast tego:

```text
healing complete
    ↓
normal decision
    ↓
nowa decyzja
```

Świat mógł się w międzyczasie zmienić.

## Priorytet wobec Hunger / Thirst

Jeżeli NPC ma jednocześnie physical injury oraz starvation/dehydration, decyzja powinna uwzględniać oba problemy.

Nie należy marnować bandaża jako odpowiedzi na damage wynikający wyłącznie z deprivation.

Przykładowo:

```text
critical thirst
    → drink

physical injury
    → heal

healthy
    → normal activity
```

Dokładny scoring/prioritization zintegrować z istniejącym NPC pressure/decision flow, bez tworzenia osobnego systemu priorytetów.

## Integracja z przyszłymi injuries

Healing V1 powinien mieć minimalną abstrakcję pozwalającą później przejść z:

```text
physical injury
```

do:

```text
injuries[]
conditions[]
```

Nie implementować pełnego modelu w ramach obecnego planu, jeśli obecny kod go jeszcze nie potrzebuje.

## Zakres implementacyjny

1. Przeanalizować aktualny `HealthState` i wszystkie źródła damage NPC.
2. Zidentyfikować sposób odróżnienia physical injury od starvation/dehydration damage.
3. Dodać minimalną reprezentację informacji potrzebnej do określenia **healable damage/state**.
4. Dodać healing jako pressure/decision w istniejącym NPC decision flow.
5. Dodać `PlannedAction` dla leczenia.
6. Wykorzystać istniejący movement/action lifecycle.
7. Wykorzystać istniejący `Inventory`.
8. Wykorzystać istniejący consumable flow (`need: 'health'`).
9. Po użyciu consumable zastosować istniejące `HealthState` healing.
10. Dodać preferencję bezpiecznego miejsca leczenia bez tworzenia nowego systemu lokacji medycznych.
11. Zapewnić działanie poza combat.
12. Zapewnić poprawne przejście `combat → normal decision → healing`.
13. Nie tworzyć osobnego systemu injuries/conditions poza minimalnym wymaganiem V1.
14. Nie tworzyć osobnego healing FSM ani równoległego inventory/consumable flow.

## Przypadki do sprawdzenia

### Physical injury

```text
NPC injured
→ has health consumable
→ healing pressure
→ goes to safe location
→ uses consumable
→ HP increases
```

### Brak lekarstwa

```text
NPC injured
→ no health consumable
→ cannot heal
→ continues normal decision behaviour
```

### Głód

```text
NPC low HP
→ damage caused by starvation
→ no healing pressure from that damage
→ food remains the appropriate response
```

### Pragnienie

```text
NPC low HP
→ damage caused by dehydration
→ no healing pressure from that damage
→ water remains the appropriate response
```

### Combat

```text
NPC injured during combat
→ does not stop combat merely to heal
→ combat ends
→ normal decision
→ healing may be selected
```

### Jednoczesne problemy

```text
physical injury + dehydration
→ decision considers both
→ does not assume bandage solves dehydration
```

### Brak specjalnego miejsca

NPC powinien móc wyleczyć się bez istniejącej placówki medycznej.

## Weryfikacja techniczna

- istniejące testy przechodzą,
- build/lint przechodzą zgodnie z `CLAUDE.md`,
- healing korzysta z istniejącego action/consumable/inventory flow,
- brak równoległego systemu leczenia,
- starvation/dehydration nie generują fałszywego healing pressure,
- healing działa niezależnie od combat,
- brak niepowiązanych refaktorów.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
