# Plan 045: Health, Stamina & Threat System

**Status:** `draft`
**Scope:** wspólny fundament dla `Health`, `Stamina`, zachowań `flee/attack` oraz przyszłego combat systemu.
**Zasada:** rozszerzać istniejące systemy (`HealthState`, needs, FSM, fauna), zamiast tworzyć równoległe mechanizmy.

---

## 1. Cel

Wprowadzić wspólny model stanu fizycznego istot żyjących w Seedvale:

- `HealthState` — zdrowie, obrażenia, śmierć.
- `StaminaState` — wysiłek, zmęczenie, regeneracja.
- `Threat` — zagrożenie i reakcja na nie.
- `Attack` — zadawanie obrażeń jako konsument `HealthState`.
- `Flee` — ucieczka zależna m.in. od zdrowia i staminy.

System powinien działać dla zwierząt, NPC i docelowo gracza.

Nie projektować osobnego systemu dla każdej kategorii encji.

## 2. Istniejące fundamenty

Seedvale posiada już `HealthState` z `maxHp`, `currentHp` i `dead`. Istnieją również operacje `applyFatigue()` i `rest()`, będące zalążkiem modelu zmęczenia NPC.

Fauna posiada już HP, obrażenia, śmierć, predator/prey, pościg, ucieczkę i sprint.

NPC posiada needs, FSM, zmęczenie i odpoczynek.

Nie tworzyć niezależnych mechanizmów typu `AnimalEnergy`, `NpcFatigue`, `PlayerStamina`. Docelowo wspólnym prymitywem powinien być `StaminaState`.

## 3. HealthState

Pozostawić `HealthState` jako wspólny system. Odpowiada wyłącznie za:

- `maxHp`,
- `currentHp`,
- damage,
- heal,
- dead.

Nie powinien wiedzieć, kto zaatakował, dlaczego nastąpiły obrażenia ani czy encja powinna uciekać.

Decyzję co zrobić po otrzymaniu obrażeń podejmuje agent.

## 4. StaminaState

Dodać wspólny typ:

```ts
type StaminaState = {
  max: number
  current: number
}
```

oraz podstawowe operacje:

```ts
drainStamina(stamina, amount)
restoreStamina(stamina, amount)
isExhausted(stamina)
```

Opcjonalnie później `getStaminaRatio(stamina)`.

Stamina reprezentuje zdolność do wysiłku, a nie zdrowie.

Przykłady kosztów:

- sprint → stamina ↓
- chase → stamina ↓
- flee → stamina ↓
- attack → stamina ↓
- heavy work → stamina ↓
- rest → stamina ↑
- walking → niewielki lub zerowy koszt

Nie należy automatycznie zamieniać staminy na HP.

## 5. Exhaustion

Niska stamina nie oznacza śmierci.

Proponowane poziomy:

```text
100% ───────── normal
 50% ───────── zmęczenie
 20% ───────── exhausted
  0% ───────── chwilowa niezdolność do wysiłku
```

Exhaustion powinno wpływać na zachowanie: mniej sprintu, częstszy odpoczynek i regeneracja. Pierwsza wersja nie powinna wprowadzać skomplikowanych modyfikatorów statystyk.

## 6. Integracja ze zwierzętami

Obecny `AnimalAgent` posiada już informację o sprintingu podczas polowania, pościgu i ucieczki. To naturalny punkt integracji.

Docelowo:

```text
AnimalAgent
├── HealthState
└── StaminaState
```

Podczas sprintu stamina spada, poza sprintem regeneruje się. Przy exhaustion predator może przerwać pościg, prey może przestać sprintować, a zwierzę może przejść w odpoczynek.

Nie tworzyć nowej FSM — rozszerzać istniejące predator/prey.

## 7. Integracja z NPC

NPC już posiada model zmęczenia związany z pracą i odpoczynkiem. Docelowo należy ujednolicić go ze `StaminaState`.

```text
chop wood → stamina ↓
stamina low → rest
rest → stamina ↑
```

Istniejące `Needs → FSM` pozostaje odpowiedzialne za decyzję. `StaminaState` dostarcza stan fizyczny.

## 8. Threat

Dodać wspólne pojęcie zagrożenia. Pierwsza wersja nie wymaga rozbudowanego systemu AI.

Minimalny model może zawierać:

```ts
type ThreatState = {
  target?: Entity
  level: number
}
```

lub prostszy mechanizm lokalny, jeżeli pełny stan okaże się niepotrzebny.

Zagrożenie może pochodzić z drapieżnika, atakującego zwierzęcia, NPC, gracza, a później także ze środowiska.

## 9. Health + Stamina + Threat

Kluczowe sprzężenie:

```text
Threat
   ↓
Decision
   ├── Fight
   ├── Flee
   └── Ignore

Fight
   ├── stamina ↓
   └── target.health ↓

Flee
   └── stamina ↓

Health low
   ↓
większa preferencja Flee

Stamina low
   ↓
mniejsza zdolność Fight/Flee
   ↓
Rest / Retreat
```

To powinno być jednym z ważniejszych mechanizmów emergentnego zachowania Seedvale.

## 10. Attack

Pierwsza wersja ataku powinna być bardzo prosta:

```ts
attack(attacker, target)
```

Atak:

1. sprawdza możliwość wykonania ataku,
2. zużywa staminę,
3. nakłada damage na `HealthState`,
4. generuje reakcję targetu.

Na tym etapie bez inventory weapons, rozbudowanych hitboxów, combos i combat UI.

## 11. Reakcja na obrażenia

Obrażenia powinny być sygnałem dla AI:

```text
damage → HealthState → reaction
```

Prey zwykle przechodzi w `Flee`; predator może wybrać `Fight` lub `Flee`; NPC może przejść w zachowanie defensywne.

Sposób reakcji może zależeć od osobowości i powinien rozszerzać istniejące `personality → behavior`.

## 12. Personality

Nie tworzyć osobnego systemu combat personality. Wykorzystać istniejący system osobowości NPC.

Przykładowo:

- `Brave` → Fight bardziej prawdopodobne,
- `Cowardly` → Flee wcześniej,
- `Calm` → dłuższa ocena zagrożenia,
- `Aggressive` → większa szansa na attack.

## 13. Flee

Ucieczka powinna wykorzystywać istniejący system ruchu. Nie tworzyć osobnego navigation system.

```text
Threat → Flee target → istniejący movement
```

Na decyzję wpływają m.in. HP, stamina, typ encji, personality, typ zagrożenia i dystans do zagrożenia.

## 14. Kolejność implementacji

### Etap 1 — Stamina foundation

- `StaminaState`,
- create/drain/restore,
- exhaustion,
- testy jednostkowe.

Bez zmiany zachowania świata.

### Etap 2 — Animal stamina

- sprint drains stamina,
- regeneracja poza sprintem,
- exhaustion ogranicza sprint,
- predator/prey wykorzystuje istniejące zachowania.

Bez nowych lokacji i UI.

### Etap 3 — NPC stamina

Połączyć istniejące zmęczenie NPC ze wspólnym `StaminaState`:

- praca,
- wysiłek,
- odpoczynek,
- regeneracja.

### Etap 4 — Threat / reaction

Wprowadzić minimalne:

```text
Threat → Decision → Fight/Flee/Ignore
```

Najpierw dla fauny.

### Etap 5 — Attack + damage reaction

Rozszerzyć istniejący system obrażeń:

```text
Attack → HealthState → Reaction
```

Bez pełnego combat systemu gracza.

### Etap 6 — Personality + combat behavior

Połączyć reakcję z istniejącą osobowością NPC.

```text
personality + health + stamina + threat
                     ↓
                  decision
```

### Etap 7 — Player

Dopiero później:

- player stamina,
- sprint,
- attack,
- damage,
- death,
- ewentualne bronie.

Gracz powinien korzystać z tych samych fundamentów co NPC i fauna.

## 15. Poza zakresem

Na tym etapie nie planować:

- inventory,
- weapons system,
- armor,
- XP combat,
- skill trees,
- combos,
- bossów,
- rozbudowanego combat UI,
- multiplayer combat,
- LLM combat AI.

System ma przede wszystkim sprawić, że żywe istoty mają fizyczne ograniczenia i reagują na zagrożenie.

## 16. Docelowe sprzężenie

```text
                Personality
                     │
                     ▼
Needs ────────→ Decision ←────── Threat
                     │
             ┌───────┴───────┐
             ▼               ▼
           Work            Combat
             │           ┌────┴────┐
             ▼           ▼         ▼
         Stamina       Attack     Flee
             │           │         │
             ▼           ▼         ▼
           Rest       Health     Stamina
                         │
                         ▼
                     Reaction
```

To powinno pozostać jednym systemem sprzężeń, a nie kolekcją niezależnych funkcji.

## 17. Przyszłość

Po ukończeniu fundamentów można rozszerzyć system o:

- stamina modifiers zależne od gatunku,
- różne koszty ataków,
- regenerację zależną od jedzenia,
- obrażenia wpływające na zachowanie,
- śmierć NPC,
- leczenie,
- choroby,
- pogodę wpływającą na stamina,
- temperaturę,
- starvation,
- animal hunting → food → village economy,
- player combat.

Elementy te powinny być dodawane dopiero wtedy, gdy istniejący system daje im realnego konsumenta.

## Zasada projektowa

**Health mówi, czy żyjesz.  
Stamina mówi, ile wysiłku możesz wykonać.  
Threat mówi, na co reagujesz.  
AI/FSM decyduje, co z tym zrobić.**

Żaden z tych systemów nie powinien przejmować odpowiedzialności drugiego.
