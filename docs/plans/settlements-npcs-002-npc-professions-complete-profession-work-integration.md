# Plan: NPC professions — complete profession work integration

**Created:** 2026-08-25
**Status:** `planned` 📋
**Priority:** high · **Effort:** L
**Depends on:** ~~178~~ ~~184~~
**Domain:** `settlements-npcs`

| Domain             | Covers                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------- |
| `settlements-npcs` | NPC professions, schedules, work actions, households and profession-specific behaviour |
| `settlements`      | Profession workplaces, settlement resources and economy integration                    |
| `world`            | Natural resources and world interactions used by professions                           |
| `items-player`     | Tools, inventory and profession equipment                                              |

---

## 1. Cel

Rozwinąć istniejący system `Role` tak, aby **wszystkie podstawowe profesje NPC wykonywały rzeczywistą pracę w świecie**, korzystając z istniejących systemów symulacji.

Docelowy przepływ:

```text
NPC role
  ↓
daily schedule: work
  ↓
profession-specific decision
  ↓
existing world interaction
  ↓
PlannedAction
  ↓
world/resource change
  ↓
household / settlement economy
```

Nie tworzyć osobnych systemów `ProfessionAI`, `ProfessionScheduler` ani równoległego FSM.

### Profesje objęte planem

| Role         | Status                              |
| ------------ | ----------------------------------- |
| `woodcutter` | istnieje — referencja               |
| `hunter`     | istnieje po planie 178 — referencja |
| `farmer`     | implementacja                       |
| `fisher`     | implementacja                       |
| `miner`      | implementacja                       |
| `guard`      | implementacja                       |
| `trader`     | implementacja                       |
| `blacksmith` | implementacja                       |

`Woodcutter` i `Hunter` nie są przepisywani.

MPFB2 pozostaje poza zakresem.

Age-based participation i rozszerzone household work sharing również pozostają poza zakresem.

---

# 2. Stan obecny

## 2.1 Role

`src/ai/characters.ts` posiada już:

```ts
type Role =
  | 'woodcutter'
  | 'farmer'
  | 'guard'
  | 'trader'
  | 'miner'
  | 'fisher'
  | 'hunter'
```

Nie tworzyć nowego typu `Profession`.

---

## 2.2 Schedules

`src/ai/schedule.ts` posiada już osobne harmonogramy dla wszystkich powyższych profesji.

Istniejący `work` jest punktem wejścia do pracy zawodowej.

Nie tworzyć osobnych schedulerów dla profesji.

---

## 2.3 NPC action system

`NpcAgent` korzysta z istniejącego:

```text
PlannedAction
→ goTo
→ execute
→ onComplete
```

oraz istniejących mechanizmów queue/lifecycle/watchdog.

Nowe profesje powinny korzystać z tego samego mechanizmu.

---

# 3. Farmer

## Cel gameplayowy

Farmer ma zapewniać gospodarstwu lokalną produkcję żywności i utrzymywać uprawy.

### Wykorzystać istniejące systemy

* gardens/crops,
* planting,
* watering/hydration,
* harvesting,
* existing food/household systems.

Nie tworzyć drugiego systemu farmingu dla NPC.

### Zachowanie

Podczas `work` Farmer powinien wybierać potrzebną czynność na podstawie stanu upraw:

```text
needs attention?
 ├─ dry → water
 ├─ ready → harvest
 ├─ empty/plantable → plant
 └─ otherwise → maintain / suitable work target
```

Priorytet powinien wynikać z rzeczywistego stanu świata, nie z losowania akcji.

### Efekt

```text
crop
 → harvest
 → food/item
 → household / settlement
```

Woda używana do podlewania ma przechodzić przez istniejące mechanizmy zasobów/well, jeśli wymagane przez aktualną implementację.

---

# 4. Fisher

## Cel

Fisher ma pozyskiwać ryby z istniejących źródeł wody.

### Wykorzystać

* istniejący fishing system,
* fishing spots / natural food sources,
* `fishing_rod`,
* istniejące item capabilities,
* household food storage.

### Zachowanie

```text
work
 → find valid fishing location
 → travel
 → fish
 → obtain fish
 → household
```

NPC nie powinien wykonywać player-only input logic.

Jeżeli istnieje już wspólna reprezentacja `fishing` capability, użyć jej zamiast dodawać specjalny NPC-only item flag.

### Uwzględnić

* brak odpowiedniego miejsca,
* brak narzędzia,
* brak dostępnych ryb,
* powrót do sensownego fallbacku.

---

# 5. Miner

## Cel

Miner ma pozyskiwać naturalne zasoby mineralne.

### Wykorzystać

* existing deposit mining,
* `SettlementMiningHooks`,
* istniejące ore/economic item types,
* inventory,
* household/economy.

### Zachowanie

```text
work
 → find accessible deposit
 → approach
 → mine
 → obtain ore
 → deposit/store
```

Istniejący mining action powinien pozostać źródłem prawdy.

### Priorytety

Preferować depozyty:

1. dostępne,
2. odpowiednie dla settlement,
3. najbliższe / ekonomicznie sensowne.

Nie wprowadzać osobnego NPC mining simulation.

---

# 6. Guard

## Cel

Guard ma być faktycznym elementem bezpieczeństwa settlementu, a nie NPC-em posiadającym wyłącznie `guard` role.

Istniejący nocny schedule zostaje zachowany.

### Zachowanie

W czasie pracy:

```text
patrol / observe
       ↓
detect threat
       ↓
existing combat / threat response
```

### Wykorzystać

* istniejący combat,
* NPC threat detection,
* movement,
* existing settlement positions/landmarks,
* istniejące night-watch schedule.

### Patrol

Nie tworzyć dużego systemu patrol routes.

Na v1 wystarczy deterministyczny zestaw sensownych punktów:

```text
home / settlement centre / important landmark
```

oraz przechodzenie pomiędzy nimi.

### Combat

Guard ma używać istniejącego systemu combat.

Nie tworzyć `GuardCombatAI`.

---

# 7. Trader

## Cel

Trader ma reprezentować rzeczywistego uczestnika lokalnej ekonomii.

Istniejący reserved `Kasia` pozostaje traderem.

### Wykorzystać

* istniejący economy,
* household inventory,
* existing trade mechanisms,
* settlement surplus/shortage.

### Zachowanie v1

Trader podczas `work`:

```text
inspect settlement goods
        ↓
identify trade opportunity
        ↓
trade / move goods
        ↓
update household/economy
```

Nie tworzyć jeszcze pełnego globalnego market simulation.

### Ważne

Nie traktować Trader jako:

```text
NPC → idle at stall
```

Profesja powinna mieć **ekonomiczny efekt**.

Jeżeli istniejący system handlu jest player-centric, należy wyodrębnić minimalny wspólny mechanizm umożliwiający NPC participation zamiast kopiować go dla NPC.

---

# 8. Blacksmith

## Cel v1

Blacksmith ma przede wszystkim wykonywać **maintenance i sharpening**, a nie od razu posiadać kompletną produkcję metalurgiczną.

### Istniejące assety

```text
public/models/parked/anvil.glb
public/models/parked/workbench-grind.glb
```

Przenieść/wykorzystać je jako settlement workplace assets zgodnie z istniejącym mechanizmem props/workplaces.

### Workplace

Blacksmith powinien mieć dostęp do:

* anvil,
* grind/workbench.

Nie tworzyć specjalnego Blacksmith scene system.

### v1 actions

```text
work
 ↓
find item requiring maintenance
 ↓
travel to grind/workbench
 ↓
sharpen / maintain
 ↓
update item durability/sharpness
```

Wykorzystać istniejące:

* item capability abstraction,
* durability,
* sharpness,
* `sharpenWeapon()`,
* inventory.

### Production

Pełna produkcja:

```text
ore → ingot → weapon/tool/item
```

nie jest warunkiem pierwszej wersji profesji.

Jeżeli istniejące production primitives pozwolą zrobić to bez tworzenia równoległego systemu, można uwzględnić je jako rozszerzenie planu implementacyjnego. W przeciwnym razie pozostawić na kolejny plan.

---

# 9. Wspólna warstwa profession work

Po implementacji poszczególnych profesji uporządkować wspólny przepływ pracy.

Docelowo `NpcAgent` nie powinien zawierać dużego:

```ts
if (role === 'farmer') ...
else if (role === 'fisher') ...
else if ...
```

Preferowany jest istniejący mechanizm dispatch/role-specific hooks, np. koncepcyjnie:

```text
role
 ↓
resolveProfessionWork(...)
 ↓
PlannedAction
```

ale tylko jeśli aktualna struktura kodu uzasadnia takie wydzielenie.

**Nie tworzyć abstrakcji wyłącznie dla abstrakcji.**

Woodcutter/Hunter powinny zostać podłączone do wspólnego mechanizmu tylko wtedy, gdy nie wymaga to niepotrzebnego refaktoru.

---

# 10. Wspólne zasady wszystkich profesji

Każda profesja musi:

* korzystać z istniejącego `schedule`,
* działać przez `PlannedAction`,
* respektować movement watchdog,
* respektować stamina/vigor,
* korzystać z istniejącego inventory,
* mieć sensowny fallback, gdy praca jest niemożliwa,
* mieć rzeczywisty efekt w świecie,
* działać bez obecności gracza,
* być deterministyczna tam, gdzie wymaga tego simulation,
* nie tworzyć player-only mechaniki.

### Nie robić

* osobnego AI per profesja,
* osobnych schedulerów,
* profesji sterowanych przez LLM,
* teleportowania NPC do workplace,
* fake production tylko po to, żeby pokazać animację,
* osobnych resource stores dla profesji.

---

# 11. Profession workplaces

Podczas implementacji sprawdzić istniejące `Place` / landmarks / settlement props.

Profesje potrzebujące fizycznego miejsca:

| Profession | Workplace                     |
| ---------- | ----------------------------- |
| Farmer     | existing garden/field         |
| Fisher     | fishing location              |
| Miner      | ore deposit                   |
| Guard      | settlement patrol points      |
| Trader     | existing trade/stall location |
| Blacksmith | anvil + grind workbench       |

Nie wprowadzać nowego globalnego `ProfessionWorkplaceManager`, jeśli istniejące settlement places wystarczą.

---

# 12. Profession generation

**Nie rozszerzać teraz losowania profesji o skomplikowany staffing algorithm.**

Po dodaniu wszystkich profesji sprawdzić:

* `RANDOM_ROLES`,
* reserved characters,
* resource-driven role assignment,
* natural resource role forcing.

Następnie zapewnić, że nowa pula profesji może rzeczywiście pojawiać się w settlementach.

Szczególnie sprawdzić, czy:

```text
blacksmith
trader
guard
farmer
miner
fisher
hunter
woodcutter
```

nie prowadzą do settlementu pozbawionego podstawowych producentów żywności/drewna.

To może wymagać osobnego mechanizmu **profession staffing**, ale nie należy go projektować w ciemno przed uruchomieniem wszystkich profession loops.

---

# 13. Testy

Dodać/zmodyfikować testy dla:

### Role

* wszystkie role są poprawnie rozpoznawane,
* każdy role ma schedule.

### Profession work

Dla każdej nowej profesji:

* `work` prowadzi do właściwego typu działania,
* valid target → action,
* brak targetu → fallback,
* completion → właściwa zmiana stanu.

### Farmer

* harvest,
* watering,
* planting.

### Fisher

* valid fishing spot,
* fish acquisition,
* no valid spot fallback.

### Miner

* valid deposit,
* mining result,
* no deposit fallback.

### Guard

* patrol,
* threat response.

### Trader

* valid trade,
* no trade opportunity.

### Blacksmith

* item requiring maintenance,
* sharpening,
* no maintenance target.

---

# 14. Verification

### Techniczna

Uruchomić:

```text
typecheck
tests
build
```

oraz odpowiednie testy domenowe.

### Browser/gameplay

Zweryfikować w działającym świecie:

* Farmer rzeczywiście pracuje przy uprawach.
* Fisher rzeczywiście łowi.
* Miner rzeczywiście wydobywa.
* Guard patroluje i reaguje na zagrożenia.
* Trader wykonuje ekonomiczną pracę.
* Blacksmith pracuje przy anvil/grind workbench.
* NPC nie zawieszają się na workplace.
* profesje działają bez obecności gracza.
* istniejący Woodcutter i Hunter nadal działają.

Szczególnie sprawdzić wizualnie placement nowych assetów Blacksmitha.

---

# 15. Poza zakresem

* MPFB2 / nowe modele NPC.
* dzieci i age-based work participation.
* profession inheritance.
* zaawansowane household labour sharing.
* pełny globalny market simulation.
* pełna metalurgia i crafting chain Blacksmitha, jeśli wymaga nowego systemu production.
* LLM-driven profession decisions.
* multiplayer.

---

# 16. Kolejność implementacji

```text
Phase 1 — wspólny recon/API
    ↓
Phase 2 — Farmer
    ↓
Phase 3 — Fisher
    ↓
Phase 4 — Miner
    ↓
Phase 5 — Guard
    ↓
Phase 6 — Trader
    ↓
Phase 7 — Blacksmith
    ↓
Phase 8 — profession work cleanup/integration
    ↓
Phase 9 — profession generation/staffing review
    ↓
Phase 10 — tests + browser verification
```

Kolejność wynika głównie z zależności istniejących systemów, a nie z kolejności alfabetycznej.

---

# 17. Kryterium ukończenia

Profession system uznajemy za wykonany, gdy:

* każda profesja v1 ma realną pracę,
* praca powoduje trwałe zmiany świata/ekonomii/household,
* NPC używają wspólnego action/simulation pipeline,
* profesje działają autonomicznie bez playera,
* nie powstały równoległe AI/scheduler/resource systems,
* Woodcutter i Hunter pozostają kompatybilne,
* Blacksmith wykorzystuje rzeczywiste workplace assets,
* testy przechodzą,
* gameplay został zweryfikowany w browserze.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
