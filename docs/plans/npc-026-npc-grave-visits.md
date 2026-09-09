# Plan: NPC Grave Visits

**Created:** 2026-09-08
**Status:** `planned` 📋
**Priority:** medium · **Effort:** S
**Depends on:** `npc-011`, ~~world-terrain-016~~
**Domain:** `npc`  
**Type:** `feature`  
**Roadmap:** -

## Cel

Dodać małe autonomiczne zachowanie, w którym żyjący NPC może okazjonalnie odwiedzić **konkretny persistent grave** zmarłego członka swojej rodziny.

```text
persisted family membership
+ completed burial / persistent grave
+ cooldown expired
+ low optional pressure
→ normal NPC arbitration
→ normal goTo → execute action
→ krótki pobyt przy grobie
→ persisted visit timestamp
→ normal AI
```

Wizyta wynika wyłącznie ze stanu świata i AI. Nie zależy od obecności gracza ani kamery.

## Aktualny punkt wyjścia

### `npc-010` jest zaimplementowany

`NpcAuthoritativeState.postDeath` jest rzeczywistym persisted ownerem corpse lifecycle. `NpcPostDeathState` ma status `active | claimed | terminal`, death transform, `deathAtDays`, loot i cleanup reason. Stable corpse identity to obecnie `NpcId` zmarłego + jego `postDeath` record; nie istnieje osobny corpse id.

`createSettlement.ts` odtwarza ten stan przez `NpcStateRegistry`, lazy-finalizuje expired active corpse i nie materializuje terminal corpse. `npc-026` nie może projektować alternatywnego post-death modelu.

### `world-terrain-016` jest zaimplementowany

Canonical settlement → cemetery lookup istnieje jako:

```text
ChunkManager.resolveCemeteryForSettlement(settlementId)
```

oraz underlying deterministic topology/placement (`cemeteryAssignment.ts`, `cemeteryPlacement.ts`). Shared cemetery jest normalnym wynikiem tego samego contractu.

`npc-026` **nie powinien sam wybierać cemetery**. Po `npc-011` konsumuje już gotowy persistent grave.

### `npc-011` jest zaimplementowany

`npc-011` dostarcza completed burial result:

```text
GraveRecord
+ stable grave id
+ deceasedNpcId
+ cemeteryId
+ persisted world position
+ Graves collection / SaveData
```

oraz idempotent corpse → grave finalization.

`npc-026` nie może tworzyć tymczasowego grave registry ani wykorzystywać proceduralnych grave meshes z cemetery layout jako substytutu.

## 1. Stable grave identity / lookup

V1 odwiedza grób konkretnego zmarłego, nie abstrakcyjny cmentarz.

Docelowy lookup po `npc-011`:

```text
deceasedNpcId
→ deterministic grave id (preferowane przez 011: `grave:${deceasedNpcId}`)
→ Graves.find(graveId) / równoważny bounded lookup
→ GraveRecord
→ x / z / yaw
```

`deceasedNpcId` jest semantic identity używanym przez NPC behaviour i cooldown. `GraveRecord.id` jest stable world-object identity.

Nie używać:

- nearest cemetery,
- cemetery scan,
- procedural grave mesh identity,
- osobnego `GraveVisitRegistry`.

## 2. Eligibility — family/household bez drugiego modelu

`Household` nie przechowuje listy członków. Family membership jest deterministycznie generowana w `SettlementDef.families`.

`createSettlement.ts` zachowuje dziś invariant:

```text
1 family = 1 household = 1 house
```

oraz flattenuje `def.families`, tworząc stabilne `npcId = ${settlementId}:npc:${flatIndex}`.

V1 powinien zbudować bounded family-member lookup przy settlement construction, tam gdzie `def.families`, `familyIndex`, `npcId` i household są już razem dostępne. Nie rekonstruować członkostwa przez skan `HouseholdRegistry` i nie dodawać member list tylko dla grave visits.

Eligibility V1:

```text
living NPC
→ same generated family as deceased NPC
→ deceased NPC has completed persistent grave
→ eligible candidate
```

`NpcRelationships` nie daje obecnie canonical semantic threshold typu „meaningful relationship”, więc nie dodawać relationship-only eligibility w V1. Rozszerzenie może przyjść później, gdy wspólny contract będzie już istniał.

## 3. Candidate resolver — bounded i lokalny

Nie skanować wszystkich graves ani wszystkich NPC.

Preferowany seam przekazany do `NpcAgent`:

```text
resolveGraveVisitCandidates(visitorNpcId)
→ mała lista / at most one candidate z własnej family
```

Resolver korzysta z lokalnej informacji settlement/family i stable grave lookup z `npc-011`.

Candidate powinien zawierać co najmniej:

```text
deceasedNpcId
graveId
position
```

Nie przepychać całego grave registry do `NpcAgent`.

## 4. Persisted cooldown jest potrzebny

Aktualny `NpcAuthoritativeState` nie ma generic memory/history field odpowiedniego do wizyt. `activePlan` nie jest cooldown store, a transient `NpcAgent.simClock` resetuje się przy reconstruction.

Aby save/load i settlement stream-out nie powodowały natychmiastowych ponownych wizyt, dodać mały NPC-owned persisted state, np. bounded entries:

```text
graveVisits: [
  { deceasedNpcId, lastVisitedAtDays }
]
```

lub równoważny minimalny shape.

Wymagania:

- klucz semantic: `deceasedNpcId` / stable grave identity,
- timestamp: absolute simulation `elapsedDays`,
- bounded tylko do rzeczywiście odwiedzonych grobów rodzinnych,
- round-trip przez `NpcStateSnapshot` / `NpcStateRegistry.serialize()` / `SaveData.npcStates`,
- bez globalnego visit history managera.

Per-deceased cooldown jest preferowany nad jednym globalnym `lastGraveVisitAtDays`, ponieważ odwiedzenie jednego grobu nie powinno blokować wszystkich innych rodzinnych grobów.

## 5. Simulation-time seam

Cooldown musi używać world simulation time.

Aktualnie:

```text
game loop / SettlementsManager
→ Settlement.update(..., nowDays = dayNight.elapsedDays, ...)
→ NpcAgent.update(...)
```

ale `createSettlement.ts` **nie przekazuje dziś `nowDays` do `NpcAgent.update()`**.

Implementacja 026 powinna minimalnie doprowadzić `nowDays` do decision/completion seam (argument update albo równie wąski existing-style dependency). Nie używać:

- `Date.now()`,
- wall clock,
- `NpcAgent.simClock` do persisted cooldownu.

Nie dodawać off-screen tickera; absolute `elapsedDays` pozwala ocenić cooldown lazy po ponownym załadowaniu.

## 6. Grave-visit pressure — dokładny integration seam

Aktualny wybór ma dwa etapy:

1. `NpcAgent` generuje pressure candidates i wykonuje jeden `pickActionKind<NpcDecisionTarget>()` nad needs + `seekShelter` + `heal`.
2. `decideNpcAction()` nakłada outer priority: collapse → pressure winner → scheduled sleep → idle.

Grave visit ma wejść do **pierwszego etapu**, w `NpcAgent` w tym samym miejscu, w którym dokładane są weather/healing pressure candidates.

Rozszerzyć shared union `NpcDecisionTarget` o `'visitGrave'`. Nie tworzyć fake `NeedId`.

Candidate powstaje tylko jeśli:

```text
eligible persistent grave exists
+ cooldown expired
+ deterministic low-frequency opportunity permits visit
```

Pressure ma być niskie/optional. Musi przegrywać z realnymi potrzebami, healing/weather i scheduled sleep, ale może wygrać z idle.

Najmniejsza outer-decision zmiana: dodać `visitGrave` do `NpcDecisionKind` z rangą pomiędzy `scheduledSleep(70)` i `idle(60)`, albo równoważnie zachować identyczną semantykę przez istniejący pressure winner. Nie budować drugiego arbitrażu.

## 7. Deterministic opportunity

Wizyta nie powinna być próbą co każdy `choose()` po wygaśnięciu cooldownu.

Użyć prostego deterministycznego opportunity gate na istniejącym decision cadence, opartego na stable NPC/grave identity + simulation time bucket. Nie używać `Math.random()` ani wall clock.

Nie dodawać grief score, anniversaries, stages ani cemetery schedule.

## 8. `NpcPlan` — nie rozszerzać bez potrzeby

Aktualny `NpcPlan` jest nadal jawnie need-centric:

```text
NpcGoalId = fulfilWorkDuty | obtainWood | secureFood | secureWater
strategy: NpcStrategyId | null
```

`goalForNeed()` / `needForGoal()` utrzymują mapping z `NeedId`.

Grave visit jest krótkim optional pressure reaction, bliższym `heal` / `shelter` / `social` niż długiemu persistent resource goal.

Dlatego **npc-026 nie powinien rozszerzać `NpcPlan`**. `npc-011` może wcześniej rozszerzyć plan model dla wieloetapowego burial; 026 nie ma obowiązku reuse burial plan tylko dlatego, że dotyczy grobu.

W toku wizyty semantic target może pozostać transient w `NpcAgent` / `NpcPlannedAction`. Cooldown jest osobno authoritative i persisted.

## 9. Action / movement lifecycle

Reuse `src/ai/npcAction.ts`:

```text
ActionId += 'visitGrave'
NpcPlannedAction
→ destination = GraveRecord position snapshot
→ normal goTo
→ normal execute
→ durationSec > 0
→ onComplete updates persisted graveVisits timestamp
→ choose
```

Nie dodawać cemetery-specific pathfindingu, movement mode ani osobnego FSM.

`visitGrave` jest pressure reaction, nie Need: `activeNeed` powinien pozostać `'idle'`, analogicznie do `heal`/`shelter`/`social`. Dzięki temu istniejący `tickCriticalInterrupt()` może przerwać wizytę przy vigor collapse, critical need lub severe weather bez nowego cancellation subsystemu.

Cooldown aktualizować dopiero po successful timed stay, nie przy samym wyborze candidate ani rozpoczęciu drogi.

## 10. Revalidation

Przed dispatch i przy completion rewalidować stable grave identity.

Jeżeli grave zniknie / lookup przestanie być valid, action staje się obsolete i NPC wraca do normalnej arbitration. Nie próbować wtedy wybierać nearest cemetery ani proceduralnego grobu.

## 11. Settlement streaming / reconstruction

`NpcStateRegistry` żyje na `SettlementsManager` i przeżywa unload/reload; `NpcAgent` runtime (`phase`, `pendingAction`, pathfinding, action timers) nie jest persisted.

V1 akceptuje:

```text
stream-out podczas wizyty
→ transient travel/action przepada
→ persisted cooldown nie zmienia się, jeśli visit nie ukończono
→ po stream-in NPC może ponownie rozważyć wizytę
```

Nie dodawać off-screen movement executora.

Persistent grave z `npc-011` jest world-owned i również musi przeżyć reconstruction niezależnie od settlement mesh.

## 12. Scope exclusions

Poza V1:

- grief / mourning simulation,
- anniversaries,
- flowers/candles/offerings,
- funeral procession,
- coordinated family visits,
- cemetery conversations,
- player witness/reputation logic,
- relationship-only eligibility,
- global NPC memory manager,
- grave registry drugi względem `npc-011`,
- cemetery scheduler,
- cemetery-specific navigation,
- off-screen visit executor.

## 13. Implementation order

1. Zaimplementować / zweryfikować finalny `npc-011` grave contract.
2. Użyć stable `deceasedNpcId → graveId → GraveRecord` lookup z 011.
3. Przy `createSettlement.ts` zbudować bounded family-member/deceased lookup bez duplikowania family modelu.
4. Dodać minimalny persisted per-deceased grave-visit history do `NpcAuthoritativeState` / snapshot persistence.
5. Doprowadzić `nowDays` (`dayNight.elapsedDays`) do NPC decision/completion seam.
6. Dodać pure/bounded grave-visit pressure candidate i `'visitGrave'` do istniejącego arbitration path.
7. Dodać zwykły `NpcPlannedAction` `visitGrave` z normalnym navigation + timed execute.
8. Aktualizować cooldown wyłącznie po completion.
9. Dodać focused tests dla eligibility, priority, cooldown, persistence i reconstruction.
10. Zaktualizować implementation notes / state docs, jeśli publiczne ownership/contracts się zmienią.

## 14. Automated verification

Najwyższe ROI:

- same-family living NPC + persistent grave daje bounded candidate,
- unrelated NPC / corpse without grave nie daje candidate,
- lookup używa stable grave id, nie nearest cemetery,
- cooldown per deceased przeżywa save/load i `WorldBundle` rebuild,
- elapsed world days, nie wall clock/simClock, sterują cooldownem,
- critical need / severe weather / scheduled sleep wygrywają z visit,
- visit może wygrać z idle,
- action używa normalnego `goTo → execute` i nie kończy się w ticku arrival,
- cooldown zapisuje się dopiero po successful completion,
- unload/reload nie wymaga persisted path/action state,
- player presence nie generuje candidate.

## Manual verification

Manualną weryfikację wykonuje User w browserze po implementacji feature.

AI agent nie wykonuje browser verification.

Nie uruchamiać `pnpm docs:sync` ręcznie — repozytorium ma automatyczny GitHub workflow.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
