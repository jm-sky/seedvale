# Plan: Animal Attack & NPC Defense

**Created:** 2026-08-20  
**Status:** `verification needed` 🔍  
**Priority:** high · **Effort:** M  
**Depends on:** ~~177~~

domain: fauna
tags: [settlements-npcs, combat]

## 1. Cel

Wprowadzić zachowanie, w którym agresywne zwierzę może zaatakować NPC, a NPC może zauważyć zagrożenie jeszcze przed otrzymaniem obrażeń i przez istniejący system `pressure → decision` zdecydować o obronie albo ucieczce.

Combat pozostaje odpowiedzialnością planu **177 — NPC Combat**. Ten plan dostarcza wyłącznie:

- zachowanie wściekłego wilka,
- target strategiczny wilka,
- percepcję zagrożenia przez NPC,
- pressure związany z bezpośrednim zagrożeniem zwierzęciem,
- decyzję NPC: obrona lub ucieczka,
- przekazanie wybranej intencji do NPC Combat 177.

Nie implementować ponownie żadnego systemu walki.

## 2. Docelowy przepływ

```text
setFrenzyWolf()
        ↓
najbliższy wilk bez frenzy
        ↓
frenzied
        ↓
target strategiczny = settlement
        ↓
wilczy AI kieruje się do wioski
        ↓
wykrywa NPC
        ↓
animal decision → attack NPC
        ↓
NPC perceives attacking wolf
        ↓
animal threat pressure
        ↓
NPC pressure → decision
        ├── defend
        └── flee
             ↓
        combat intent
             ↓
        NPC Combat 177
```

Obrażenia nie są warunkiem rozpoczęcia reakcji NPC.

## 3. `setFrenzyWolf()`

Udostępnić funkcję developerską dostępną z DevTools:

```ts
setFrenzyWolf()
```

Każde wywołanie:

1. znajduje wilka najbliżej wioski,
2. pomija wilki posiadające już `frenzied`,
3. wybiera najbliższego pozostałego wilka,
4. ustawia mu trait/state `frenzied`,
5. zmniejsza jego strach przed ludźmi,
6. ustawia wioskę jako jego strategiczny target.

Kolejne wywołania wybierają kolejne wilki, dzięki czemu można utworzyć wiele wściekłych wilków.

Jeżeli nie ma już kwalifikującego się wilka, funkcja powinna zakończyć się bez tworzenia nowego zwierzęcia.

### Ważne

`settlement` nie jest combat targetem.

Rozróżniamy:

```text
strategic/behavior target
    → settlement

combat target
    → konkretny NPC
```

Wilk może więc dążyć do wioski, a po wejściu w odpowiedni kontekst znaleźć konkretnego człowieka do ataku.

## 4. Frenzy

`frenzied` powinno być częścią stanu/traitów zwierzęcia, a nie jednorazowym debugowym wyjątkiem.

Trait powinien wpływać na istniejącą decyzję zwierzęcia:

```text
normal wolf
    → strong fear of humans

frenzied wolf
    → reduced fear of humans
    → willing to approach settlement
    → willing to attack humans
```

Nie tworzyć osobnej klasy `FrenzyWolf`, osobnego FSM ani osobnego AI.

Należy wykorzystać istniejący mechanizm `AnimalAgent` i istniejącą decyzję predator-human.

## 5. Animal → NPC

Rozszerzyć istniejące zachowanie drapieżnika tak, aby NPC był pełnoprawnym human targetem obok playera.

Nie tworzyć:

- `AnimalCombat`,
- `AnimalNPCCombat`,
- `ThreatManager`,
- osobnego NPC target registry.

Istniejące animal perception/decision powinny prowadzić do:

```text
human detected
      ↓
existing predator decision
      ↓
attack
      ↓
NPC combat target
```

Wykorzystać istniejący `HealthState` i mechanizmy obrażeń.

## 6. NPC perceives threat

NPC powinien wykrywać agresywnego wilka **przed otrzymaniem obrażeń**.

Przykład:

```text
wolf approaches NPC
        ↓
NPC perception
        ↓
wolf recognised as immediate threat
```

Nie czekać na `damageHealth()`.

Obrażenia są późniejszym zdarzeniem.

Percepcja powinna być lokalna i ograniczona, bez globalnego skanowania wszystkich zwierząt przez każdego NPC.

## 7. Animal threat pressure

Dodać do istniejącego systemu pressure osobne miejsce dla bezpośredniego zagrożenia zwierzęciem.

Semantycznie:

```text
ImmediateAnimalThreat
```

Pressure powinien reprezentować **aktualną sytuację**, a nie być decyzją:

```text
animal threat
    ≠
fight
```

Pressure dostarcza informacji do normalnego systemu decyzyjnego NPC.

## 8. NPC decision

Decyzja musi przechodzić przez istniejący:

```text
state
+ needs
+ problems
+ goals
+ pressures
+ traits
+ relationships
        ↓
decision
        ↓
strategy
        ↓
action
```

Nie dodawać specjalnego wyjątku:

```ts
if (animalAttacking) combat()
```

NPC powinien otrzymać presję natychmiastowego zagrożenia i na jej podstawie wybrać odpowiednią strategię.

Minimalne decyzje:

```text
defend
flee
```

Dokładne różnice wynikają z istniejącego systemu traits/abilities/pressures, a nie z osobnego animal-defense systemu.

## 9. Integracja z NPC Combat 177

Jeżeli NPC wybierze obronę:

```text
NPC decision
    ↓
combat intent
    ↓
NPC Combat 177
    ↓
animal target
```

177 pozostaje właścicielem:

- combat lifecycle,
- combat target contract,
- melee/ranged attack,
- defense,
- damage,
- death,
- carried weapon,
- wspólnych resolverów.

Ten plan nie tworzy drugiego combat pipeline.

## 10. Ucieczka

Jeżeli NPC wybierze `flee`:

```text
animal threat pressure
        ↓
NPC decision
        ↓
flee strategy
        ↓
existing movement/action mechanisms
```

Nie tworzyć specjalnego `AnimalFleeSystem`.

Ucieczka powinna wykorzystywać istniejący NPC movement/action pipeline.

## 11. Damage

Docelowo możliwe są oba kierunki:

```text
animal → NPC
NPC → animal
```

Pierwszy pozostaje po stronie istniejącego fauna attack pipeline.

NPC damage:

```text
animal attack
    ↓
NPC defense, jeżeli odpowiedni
    ↓
damage
    ↓
HealthState
    ↓
death
```

Nie tworzyć nowego health/damage systemu.

## 12. Granice odpowiedzialności

### Animal systems

Odpowiadają za:

- frenzy,
- wybór wioski jako celu strategicznego,
- percepcję NPC,
- decyzję atak/flee,
- wybór konkretnego NPC jako combat targetu,
- wykonanie ataku.

### NPC AI

Odpowiada za:

- percepcję zagrożenia,
- utworzenie `animal threat pressure`,
- ocenę pressure,
- wybór defend/flee,
- wygenerowanie combat intent.

### NPC Combat 177

Odpowiada za:

- wykonanie walki,
- target,
- atak,
- defense,
- damage,
- death.

## 13. Performance

Nie dodawać:

- globalnego `AnimalThreatManager`,
- O(animals × all NPCs) skanowania,
- globalnego per-frame target scan,
- nowego update loop,
- Web Workera.

Wykorzystać lokalną percepcję i istniejące update frequencies.

`setFrenzyWolf()` może wykonać jednorazowe wyszukanie najbliższego wilka — nie jest to hot path.

## 14. Zakres V1

### W zakresie

- `setFrenzyWolf()`,
- wielokrotne wywołanie wybierające kolejne wilki,
- `frenzied` trait/state,
- zmniejszenie fear przed ludźmi,
- strategiczny target wioski,
- wolf → NPC targeting,
- NPC perception of attacking wolf,
- animal threat pressure,
- NPC pressure → decision,
- defend,
- flee,
- integracja defend z NPC Combat 177,
- wykorzystanie istniejącego damage/HealthState,
- testy decyzji i pressure.

### Poza zakresem

- nowy combat system,
- nowy threat manager,
- nowe health system,
- nowe movement/pathfinding,
- pack AI,
- koordynacja wielu wściekłych wilków,
- specjalny system obrony osady,
- automatyczne leczenie,
- revive/respawn,
- NPC equipment/storage,
- nowe zachowania bandytów,
- questy.

W szczególności **wiele wściekłych wilków nie oznacza koordynacji**. Każdy wilk działa niezależnie.

## 15. Acceptance criteria

```text
setFrenzyWolf()
→ wybiera najbliższego niewściekłego wilka

setFrenzyWolf()
→ ponownie wybiera innego wilka

frenzied wolf
→ mniej boi się ludzi

frenzied wolf
→ kieruje się do wioski

frenzied wolf
→ może zaatakować NPC

NPC widzi agresywnego wilka
→ otrzymuje animal-threat pressure

NPC
→ przez normalny pressure-decision wybiera defend albo flee

NPC wybiera defend
→ korzysta z NPC Combat 177

NPC może rozpocząć obronę
→ zanim otrzyma pierwsze obrażenia

animal → NPC
→ korzysta z istniejącego damage/HealthState

brak dodatkowego combat systemu
```

## 16. Verification

Sprawdzić:

- deterministyczną decyzję frenzy wolf,
- wybór kolejnych wilków przez `setFrenzyWolf()`,
- brak ponownego wyboru już `frenzied` wilka,
- wykrywanie NPC przed damage,
- generowanie animal-threat pressure,
- decyzję defend/flee przez istniejący pressure-decision,
- poprawne przekazanie combat intent do 177,
- istniejące fauna/combat/HealthState tests,
- typecheck/lint/build zgodnie z `CLAUDE.md`,
- browser/gameplay dla pełnego scenariusza wilk → NPC → reakcja.

## 17. Implementation summary (2026-08-21)

Zaimplementowane zgodnie z implementation notes — bez nowego combat/threat-manager systemu, wyłącznie rozszerzenie istniejących `AnimalAgent`/`NpcAgent`.

**Fauna (`src/fauna/AnimalAgent.ts`):**

- `frenzied`/`strategicVillage` — runtime pola instancji (nie osobny gatunek/FSM), `setFrenzied(village)` + `isFrenzied()`. Frenzy nie ma osobnej gałęzi "reduced fear" — wpina się w istniejącą decyzję jako `provoked: provokedTimer > 0 || frenzied` (ta sama retaliation-branch co realna prowokacja gracza), więc frenzowany wilk zachowuje się jak trwale sprowokowany (mniejszy strach, chętny do ataku, wciąż ucieka przy bardzo niskim HP).
- `moveTowardStrategicVillage()` — beeline do zapamiętanej pozycji wioski (nie żywego `Settlement`/scene ref) dopóki wilk nie wejdzie w jej footprint; `pickPointNear()` dostaje jednolinijkowy bypass (`this.frenzied ||`) omijania village-avoidance, więc frenzowany wilk może faktycznie wędrować po wiosce zamiast ją omijać.
- Wilk → NPC targeting: `AnimalAgent.update()` dostaje opcjonalny bounded/local `nearbyNpcs: NearbyNpcCandidate[]` (id/x/z, dostarczany przez wywołującego — `Fauna`/`gameLoop.ts`, załadowane osady, nie globalny skan) — konsultowany tylko dla frenzowanego drapieżnika i tylko gdy gracz nie jest aktywnym zagrożeniem. `decideNpcResponse()` woła dokładnie ten sam `decidePredatorHumanIntent()` co ścieżka gracza, tylko z dystansem/crowd do wybranego NPC. `chaseNpc()`/`attackNpc()` są symetryczne do `chaseHuman()`/`attackHuman()`.
- `AnimalAgent.isThreateningHuman()` — mały publiczny sygnał ("mój ostatni throttled decision to `attack`"), czytany przez `NpcAgent`'s threat perception bez importowania logiki `AnimalAgent`.
- `pickNearestEligibleWolf()` — czysta, deterministyczna (bez `Math.random()`) selekcja za `setFrenzyWolf()`; DevTools glue w `src/debug/npcInspector.ts` (`setFrenzyWolf(bundle)`), wystawione jako `window.seedvale.debug.setFrenzyWolf()` (ten sam `?debug`-gated surface co plan 170's `npc()`/`npcs()`).

**NPC (nowy `src/ai/npcAnimalThreat.ts` + `src/ai/NpcAgent.ts`):**

- `senseImmediateAnimalThreat()` — czysta percepcja: najbliższy żywy `ThreateningAnimalCandidate` w promieniu `IMMEDIATE_ANIMAL_THREAT_RADIUS`. `decideAnimalThreatResponse()` — czysta `defend`/`flee` decyzja (ten sam `pickHighestScore` co `predatorHumanDecision.ts`) z carried-weapon capability + health ratio; brak broni → zawsze `flee` (nigdy combat intent, który 177 i tak odrzuci).
- `NpcAgent.update()` liczy `currentAnimalThreat` co klatkę z bounded `nearbyAnimalThreats` (dostarczane przez `Settlement.update()`/`SettlementsManager.update()`, wypełniane w `gameLoop.ts` z `bundle.fauna.getAgents().filter(isThreateningHuman)` — zwykle puste), throttlowany re-decision (`ANIMAL_THREAT_REACTION_INTERVAL_SEC`) woła `reactToAnimalThreat()` przed przełącznikiem faz — więc NPC reaguje zanim dostanie obrażenia, wyprzedza pauzę "lookAtPlayer", nigdy nie przerywa `combat`/`sleep`.
- `defend` → istniejący 177 `beginCombat({ target: threat.target, mode })`, gdzie `threat.target` to `fauna/faunaCombat.ts`'s `combatTargetForAnimal()` zbudowany raz w `gameLoop.ts`. `flee` → `fleeFromThreat()`, ten sam cleanup co `beginCombat`/`interruptCurrentAction`, cel poza istniejącą fazę `wander` (bez nowego `AnimalFleeSystem`).
- Animal → NPC damage: `gameLoop.ts`'s `onNpcHit` callback szuka NPC po id w załadowanych osadach i woła istniejące `NpcAgent.applyIncomingCombatDamage()` (ten sam seam co `player → NPC`/`NPC → NPC`, plan 177 §8/§10) — brak nowego damage/health systemu.

**Poza zakresem (jak w planie):** brak `AnimalThreatManager`/`NpcCombatManager`/`HumanTargetRegistry`, brak koordynacji między frenzowanymi wilkami, brak persystencji `frenzied` (runtime-only, plan 179 §3), brak nowego update loop/Web Workera.

Techniczna weryfikacja zielona: `tsc --noEmit`, `lint:fix`, `build`, `test` (1443 testów, w tym nowe `src/fauna/frenzyWolf.test.ts` i `src/ai/npcAnimalThreat.test.ts`). Bez testu w przeglądarce (patrz `CLAUDE.md`) — scenariusz z §22 do ręcznej weryfikacji: `setFrenzyWolf()` → wilk idzie do wioski → atakuje/NPC broni się lub ucieka → obrażenia przez istniejący health/defense path.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
