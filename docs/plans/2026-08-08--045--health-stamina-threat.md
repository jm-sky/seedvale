# Plan 045: Health, Stamina & Threat System

**Status:** `planned` 📋  
**Priority:** 🔴 `high`  
**Effort:** L  
**Depends on:** ~~010~~, ~~022~~

## Cel

Wzmocnić istniejący wspólny fundament fizycznego stanu żywych encji tak, aby:

- zwierzęta zachowały istniejące HP/damage/death,
- NPC miały prawdziwe HP niezależne od fatigue,
- gracz otrzymał podstawowe HP,
- NPC i fauna korzystały ze wspólnego `StaminaState` zamiast osobnych mechanizmów zmęczenia,
- późniejsze zachowania `attack/flee` mogły korzystać ze wspólnego stanu bez tworzenia równoległych systemów.

Plan **nie implementuje pełnego combat systemu**. Ma dostarczyć mały fundament, który będzie wykorzystany m.in. przez plan `056` i późniejszą `055 Shared Simulation Architecture`.

## Ważna decyzja architektoniczna

`Health`, `Stamina` i `Threat` są stanem/kontekstem domenowym. Nie są systemem AI.

```text
HealthState   → ile zdrowia pozostało
StaminaState  → ile wysiłku można wykonać
Threat        → jakie zagrożenie jest istotne

AI / FSM / Decision → co encja robi w odpowiedzi
```

Plan `055` pozostaje właścicielem wspólnego modelu `perception → decision → action`. Plan `045` nie tworzy drugiego systemu decyzyjnego.

---

## 1. Istniejący codebase — stan wyjściowy

Repozytorium już posiada wspólny `HealthState` w `src/shared/HealthState.ts`:

```ts
type HealthState = {
  maxHp: number
  currentHp: number
  dead: boolean
}
```

Istnieją też `createHealthState()`, `applyFatigue()` i `rest()`. `applyFatigue()` / `rest()` są pozostałością po wykorzystaniu HP jako modelu zmęczenia NPC i powinny zostać usunięte po migracji NPC do staminy. fileciteturn67file0L2-L6

Fauna już korzysta ze wspólnego `HealthState` oraz istniejącego predator/prey damage/death. Plan `010` jest więc fundamentem, a `045` nie powinien tworzyć nowego `AnimalHealth`. fileciteturn66file3L17-L20

NPC również już posiada `HealthState`, ale obecnie HP jest używane jako fatigue: fazy pracy zmniejszają `currentHp`, a odpoczynek je regeneruje. To należy rozdzielić. fileciteturn68file0L1-L2

Gracz nie powinien dostać osobnego modelu HP. Ma zostać podłączony do tego samego `HealthState`.

---

## 2. HealthState — wspólny fundament

Pozostawić `src/shared/HealthState.ts` jako jedyne źródło prawdy dla HP.

Odpowiada wyłącznie za:

- `maxHp`,
- `currentHp`,
- `dead`,
- utworzenie stanu,
- podstawowe damage/heal/death semantics.

Jeżeli obecny kod nie ma jeszcze wspólnych operacji `damage` / `heal`, dodać je w tym module w sposób czysty i domenowo neutralny.

Przykładowy kontrakt:

```ts
createHealthState(maxHp)
damageHealth(health, amount)
healHealth(health, amount)
isAlive(health)
```

Zasady:

- `currentHp` nigdy nie spada poniżej `0`,
- `currentHp` nigdy nie przekracza `maxHp`,
- osiągnięcie `0` ustawia `dead = true`,
- damage/heal nie zna napastnika, osobowości ani AI,
- Health nie steruje ruchem ani animacją.

Istniejące zachowanie fauna należy zachować, chyba że implementacja wymaga minimalnej korekty API.

---

## 3. NPC — oddzielić HP od fatigue

NPC już ma HP, więc nie dodajemy kolejnego health systemu.

Obecnie istnieje jednak niepożądane sprzężenie:

```text
work / goTo
    ↓
HP ↓
    ↓
rest
    ↓
HP ↑
```

Po 045:

```text
work / physical effort
    ↓
Stamina ↓
    ↓
existing Needs / FSM
    ↓
rest / sleep
    ↓
Stamina ↑
```

HP NPC pozostaje dostępne dla rzeczywistych obrażeń.

Istniejący HP floor `15` był mechanizmem ochrony przed śmiercią przez fatigue. Po migracji nie powinien być potrzebny do tego celu.

Nie zmieniać istniejącego `Needs → FSM` ani harmonogramu NPC. Stamina dostarcza stan fizyczny; istniejący system decyduje o odpoczynku.

---

## 4. Gracz — podstawowe HP

Dodać graczowi `HealthState` z prostą wartością bazową, np. `100 HP`.

Na tym etapie:

- gracz posiada stan HP,
- można odczytać `currentHp / maxHp`,
- można zastosować damage/heal przez wspólny API,
- śmierć może być jedynie stanem domenowym.

**Nie implementować jeszcze:**

- ekranów death/game over,
- respawnu,
- leczenia przedmiotami,
- pancerza,
- broni gracza,
- pełnego combat UI.

Najważniejsze jest to, aby plan `056` miał istniejący wspólny target health dla gracza.

---

## 5. StaminaState

Dodać jeden wspólny typ w module niezależnym od Three.js:

```ts
type StaminaState = {
  max: number
  current: number
}
```

Podstawowe operacje:

```ts
createStaminaState(max)
drainStamina(stamina, amount)
restoreStamina(stamina, amount)
isExhausted(stamina)
getStaminaRatio(stamina)
```

Stamina:

- jest ograniczona do `[0, max]`,
- nie może zmieniać HP,
- nie zna NPC/fauny/gracza,
- nie podejmuje decyzji AI,
- jest testowalna bez Three.js.

---

## 6. Fauna — migracja istniejącego `energy`

`AnimalLifeState` już posiada `hunger`, `thirst` i `energy`, a `energy` jest faktycznie zasobem wysiłku: sprint ją zużywa, a brak sprintu regeneruje. Nie tworzyć równolegle `energy` i `StaminaState.current`.

Docelowo:

```text
AnimalLifeState
├── hunger
├── thirst
└── stamina
```

z zachowaniem odpowiedzialności `AnimalLife` za ticking biologiczny.

W pierwszej wersji zachować obecne wartości drain/regeneration i istniejący mechanizm odpoczynku, zmieniając tylko reprezentację zasobu.

Nie tworzyć nowej FSM ani nowego update loop.

---

## 7. NPC — migracja fatigue do StaminaState

Dodać NPC wspólny `StaminaState` i przenieść do niego istniejące mechanizmy fatigue/rest:

- praca → stamina ↓,
- wysiłek/ruch → zgodnie z obecnym zachowaniem,
- odpoczynek/sen → stamina ↑,
- zero stamina ≠ śmierć.

Zachować istniejący rytm pracy i odpoczynku.

Nie przenosić automatycznie wszystkich efektów obecnego low-HP slowdown na stamina. Najpierw oczyścić semantykę. Dodatkowe gameplayowe konsekwencje mogą zostać dodane później, jeśli będą miały konsumenta.

---

## 8. Threat — minimalny kontekst, bez AI frameworka

`Threat` jest potrzebny jako wspólny język dla późniejszego `flee/attack`, ale decyzje należą do agentów/FSM i planu `055`.

Pierwsza wersja powinna być minimalna. Nie wprowadzać `ThreatManager`, globalnego rejestru zagrożeń ani trwałej pamięci zagrożeń.

Jeżeli konkretny konsument potrzebuje stanu zagrożenia, użyć najmniejszego typu/contextu potrzebnego przez istniejące systemy, np. poziomu zagrożenia i opcjonalnego istniejącego targetu.

Nie tworzyć teraz generycznego `EntityRef` tylko dla symetrii.

---

## 9. Attack / damage

045 nie tworzy nowego combat systemu.

Istniejący fauna attack/damage ma pozostać kompatybilny ze wspólnym `HealthState`.

Jeżeli potrzebne jest wspólne minimum, używać:

```text
attack/action
    ↓
damageHealth(target.health, amount)
    ↓
HealthState
    ↓
agent reacts
```

`HealthState` nie decyduje, czy po obrażeniach należy walczyć, uciekać czy kontynuować pracę.

Koszt stamina ataku może zostać dodany tylko do istniejących ataków, jeśli jest potrzebny do spójnego działania systemu. Nie rozszerzać tego do broni/hitboxów/combos.

---

## 10. Reakcja na obrażenia

Damage jest sygnałem dla agenta, nie zachowaniem Health.

Docelowo:

```text
damage
  ↓
HealthState
  ↓
existing agent decision
  ↓
fight / flee / retreat / continue
```

Nie implementować tutaj osobnego combat FSM.

---

## 11. Relacja do planu 055

`055 Shared Simulation Architecture` definiuje wspólne kontrakty:

```text
state / needs
    ↓
perception
    ↓
decision
    ↓
action
    ↓
world effect
```

`045` dostarcza przede wszystkim **state/context**, które 055 może później wykorzystać:

```text
HealthState
StaminaState
minimal Threat context
```

Nie uzależniać 045 od wykonania 055. Dzięki temu 045 może zostać zaimplementowany wcześniej, a 055 później uporządkuje sposób używania tych danych przez NPC/faunę.

---

## 12. Kolejność implementacji

### Phase 1 — Health API audit + cleanup

- zweryfikować wszystkich konsumentów `HealthState`,
- zachować fauna HP/damage/death,
- dodać brakujące neutralne `damage/heal/isAlive`, jeśli potrzebne,
- usunąć/oznaczyć stare fatigue helpers dopiero po migracji NPC.

### Phase 2 — Player Health

- dodać `HealthState` do gracza,
- ustawić podstawowe HP,
- zapewnić możliwość damage/heal przez wspólny API,
- bez death UI/respawn/combat.

### Phase 3 — Shared StaminaState

- dodać typ i operacje,
- testy jednostkowe,
- brak zależności od Three.js.

### Phase 4 — Animal stamina migration

- zastąpić `AnimalLifeState.energy` wspólną reprezentacją,
- zachować obecne tempo drain/regeneration,
- zaktualizować `AnimalAgent` i testy,
- nie utrzymywać dwóch źródeł prawdy.

### Phase 5 — NPC stamina migration

- zastąpić HP-fatigue stamina,
- zachować Needs/FSM i rytm pracy/odpoczynku,
- HP pozostawić wyłącznie jako health.

### Phase 6 — Minimal Threat context

- tylko jeśli istniejący consumer potrzebuje wspólnego typu,
- bez ThreatManager i bez nowego AI.

### Phase 7 — Regression verification

- fauna combat,
- fauna life,
- NPC fatigue/rest,
- player state,
- shared health/stamina unit tests.

---

## 13. Poza zakresem

Nie obejmuje:

- pełnego combat systemu,
- broni,
- pancerza,
- hitboxów,
- combos,
- combat UI,
- death screen,
- respawnu,
- XP combat,
- skill tree,
- osobnego AI managera,
- GOAP/utility-AI frameworka,
- LLM AI,
- worker-based simulation.

---

## 14. Kryteria akceptacji

- `HealthState` jest jednym wspólnym źródłem prawdy dla NPC, fauny i gracza.
- NPC nie tracą HP podczas zwykłego fatigue/work.
- Odpoczynek NPC regeneruje stamina, nie HP.
- Fauna nie posiada równolegle `energy` i `StaminaState` jako dwóch mutable źródeł tego samego zasobu.
- Gracz posiada podstawowe HP korzystające z `HealthState`.
- Istniejący fauna predator/prey damage/death nadal działa.
- `HealthState` nie zawiera logiki AI.
- `StaminaState` nie zawiera logiki AI.
- Threat, jeśli jest potrzebny, pozostaje małym kontekstem używanym przez decyzje, a nie osobnym managerem.
- Implementacja nie wymaga wykonania 055 wcześniej.
- Plan 056 może wykorzystać player `HealthState` jako wspólny cel obrażeń bez tworzenia nowego health/combat systemu.

## Powiązane plany

- `2026-08-07--010--predator-prey-system.md` — istniejące HP/damage/death fauny.
- `2026-08-07--022--npc-character-depth.md` — istniejące NPC HP/character state.
- `2026-08-07--021--npc-3-animal-life.md` — hunger/thirst/energy fauny.
- `2026-08-10--055--shared-simulation-architecture.md` — wspólny model perception → decision → action.
- `2026-08-10--056--hungry-predator-human-aggression.md` — konsument player/NPC health i późniejszego threat/decision.
- `2026-08-10--041--wait-rest-time-skip.md` — istniejący wait/rest/time-skip kontekst.
- `2026-08-10--042--fauna-player-awareness.md` — istniejąca percepcja gracza przez faunę.
