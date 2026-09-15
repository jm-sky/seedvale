# Implementation Notes: Long-distance NPC travel and expedition movement

**Plan:** `docs/plans/settlements-npcs-028-long-distance-npc-travel-and-expedition-movement.md`  
**Reviewed:** 2026-09-15  
**Codebase:** `main`

## Review outcome

Plan może przejść do `planned`.

Najważniejsza zmiana względem pierwotnego draftu: generic spatial travel continuity już istnieje i nie trzeba go projektować od zera. `src/ai/npcTravel.ts` oraz `NpcAuthoritativeState.travel` dostarczają per-NPC detailed↔off-screen ownership, deterministic `arrivesAtDays`, interpolation, reification i persistence-friendly plain data.

`settlements-npcs-027` dodatkowo ustalił czystą granicę wejściową: `028` konsumuje wyłącznie world-owned `ExpeditionAssignment` w stanie `ready`. Nie wybiera kandydatów i nie provisionuje ich ponownie.

Implementacja `028` powinna więc rozszerzyć istniejący generic travel seam o expedition dispatch, arrival handoff i generic off-screen survival continuity. Nie tworzyć `ExpeditionTravelRegistry`.

## 1. Upstream contract from 027

`settlements-npcs-027` definiuje:

```text
ExpeditionAssignment
- sponsorSettlementId
- destination
- ordered memberNpcIds[3]
- state: forming | provisioned | ready
```

`028` zaczyna pracę dopiero dla `ready`.

Istotne invariants:

- members są już wybrani i committed,
- provisioning jest zakończony,
- real gear/food/water znajduje się w `NpcAuthoritativeState.personalInventory`,
- repeated dispatch nie może reselectować party ani transferować itemów drugi raz,
- settlement/home/household membership pozostaje bez zmian.

Po implementacji 027 użyć jego faktycznych nazw plików/API zamiast zakładać nazwy z planu.

## 2. Existing generic travel owner

`src/settlement/npcState.ts` już posiada:

```ts
travel: NpcTravelContinuity | null
```

To jest authoritative per-NPC travel state przeżywający reconstruction/persistence.

`src/ai/npcTravel.ts` obecnie definiuje:

- `NpcTravelPoint`,
- `NpcTravelExecution`,
- `NpcTravelContinuity`,
- `beginOffscreenNpcTravel()`,
- `travelProgress01()`,
- `interpolateNpcTravelPosition()`,
- `reifyNpcTravel()`,
- `stampNpcTravelCheckpoint()`,
- `resolveOffscreenNpcTravel()`.

Nie tworzyć drugiego per-expedition travel recordu.

## 3. Important limitation of current `NpcTravelContinuity`

Aktualny record zna spatial commitment:

```ts
{
  destination,
  lastPosition,
  execution?
}
```

ale nie zna semantycznego caller/contextu podróży.

To wystarcza dla accompany/return, ale expedition arrival musi zostać zauważony przez expedition lifecycle dokładnie raz. Obecny `resolveOffscreenNpcTravel()` dla traveller bez `accompanyCommitment` po osiągnięciu czasu arrival ustawia po prostu:

```ts
state.travel = null
```

Nie używać tego zachowania bezpośrednio dla expedition arrival, bo caller utraci informację o zakończeniu commitmentu.

Najmniejsza poprawka powinna pozostać generic, np. przez małe travel-purpose/context metadata albo generic arrival callback/result na checkpoint seam. Nie hardcode'ować quest/cave semantics w `npcTravel.ts`.

## 4. Per-member travel, not group spatial state

Assignment jest grupowy, travel jest per-NPC.

Dla każdego `memberNpcId`:

- ten sam `NpcAuthoritativeState`,
- własny `travel`,
- własny `lastPosition`,
- własne execution timestamps,
- własny survival checkpoint.

Nie tworzyć group position/timing recordu. Nie synchronizować members teleportem do leadera.

Shared destination i wspólny dispatch moment są wystarczające jako group-level relation.

## 5. Dispatch seam

Potrzebny jest mały world/simulation-level operation typu koncepcyjnego:

```text
dispatchReadyExpedition(assignmentId, nowDays)
```

Powinien:

1. pobrać `ready` assignment,
2. resolve current states wszystkich committed members,
3. odrzucić membera martwego lub posiadającego konfliktujący travel commitment,
4. resolve destination do plain world-space point,
5. zainicjalizować generic per-member travel commitment bez zmiany inventories/membership,
6. pozostawić detailed agentom wykonanie ruchu, jeżeli są live.

Commit musi być idempotentny. Repeated call nie może resetować `lastPosition`, `departedAtDays` ani ETA.

Nie używać assignment resolvera z 027 ponownie.

## 6. Detailed movement integration

`NpcAgent` już używa `beginOffscreenNpcTravel()` dla istniejącego travel/accompany flow. W implementacji sprawdzić aktualne call-sites w `src/ai/NpcAgent.ts` i rozszerzyć istniejącą arbitration zamiast dodawać osobny expedition update loop.

Detailed movement powinien nadal korzystać z obecnego local movement/navigation stacku. Nie budować globalnego A* dla całej trasy.

Travel commitment musi przetrwać temporary detailed action interruption.

## 7. Detailed → off-screen handoff

Reuse istniejącego handoff:

```ts
beginOffscreenNpcTravel(from, destination, nowDays, dayLengthSec)
```

Istotne:

- `from` pochodzi z live position jeszcze przed dispose,
- ETA liczy istniejący `estimateOffscreenTravelDays()`,
- `lastPosition` to checkpoint, nie per-frame persisted path,
- off-screen execution przejmuje ownership dokładnie raz.

Nie dodawać expedition-specific duration estimator.

## 8. Reification

Reuse:

- `interpolateNpcTravelPosition()`,
- `reifyNpcTravel()`.

Reification w trakcie podróży ma umieścić NPC w deterministycznej pozycji pomiędzy ostatnim checkpointem a destination i usunąć off-screen execution ownership.

Nie wracać do sponsor settlement i nie teleportować od razu do destination przed arrival.

## 9. Generic off-screen survival is the main missing seam

Spatial continuity jest zaimplementowane; generic survival continuity nadal wymaga domknięcia.

Nie implementować drugiego decision loop. Preferować mały deterministic elapsed-time resolver operujący na existing `NpcAuthoritativeState`.

Relevant existing owners do zweryfikowania podczas implementation preflight:

- `src/ai/Needs.ts` — hunger/thirst state/progression,
- `src/ai/npcPersonalProvisions.ts` — consumption z `personalInventory`,
- injury lazy recovery timestamp/state w `NpcAuthoritativeState`,
- vigor/stamina owner używany przez live NPC.

Docelowy seam powinien wyglądać koncepcyjnie:

```text
resolveNpcOffscreenTravelInterval(
  npcState,
  fromDays,
  toDays,
  journeyContext
)
→ continue | cannot-progress
```

Wymagania:

- bounded/lazy, nie per-frame,
- idempotentny względem timestamp/checkpoint,
- używa tego samego `personalInventory`,
- nie resetuje vigor,
- nie duplikuje injury recovery,
- nadaje się również dla innych generic NPC travel flows.

Jeżeli potrzeba nowego timestampu, należy on do generic authoritative travel/survival checkpointu, nie do expedition assignment.

## 10. Provision consumption

027 wkłada realne food/water do `personalInventory`.

028 nie może tworzyć `ExpeditionRations`, temporary food pool ani group inventory.

Food/water consumption powinno reuse obecne semantics personal provisions. Jeżeli istniejący helper jest zbyt związany z detailed action execution, wydzielić najmniejszą pure/domain część potrzebną do deterministic off-screen consumption zamiast kopiować logikę.

## 11. Arrival handoff

Arrival musi mieć jawny generic output/context.

Nie pozostawiać expedition na obecnym zachowaniu:

```text
arrivesAt reached
→ state.travel = null
→ brak informacji dla caller
```

Preferowany flow:

```text
arrival detected
→ survival interval settled exactly once
→ caller-specific logical arrival observed exactly once
→ generic travel cleared/terminalized
```

Nie dodawać colony membership transfer w tym miejscu.

Dla 3 members arrival jest per-member. Whole-expedition readiness at destination może być derived z member outcomes przez caller/later plan; nie tworzyć formation synchronizer.

## 12. Death / cannot-progress

Przed każdym coarse progression/arrival resolve sprawdzić authoritative death state.

Death:

- nie oznacza arrival,
- nie usuwa membera z assignment,
- nie tworzy replacement,
- nie recreates provisions.

`cannot-progress` powinno pozostać neutralnym generic travel resultem. Quest/expedition policy może zdecydować później co zrobić z takim memberem.

## 13. Persistence

Nie tworzyć osobnego save field dla expedition travel.

Rozszerzyć istniejący `NpcStateSnapshot.travel` tylko wtedy, gdy nowy generic context/checkpoint wymaga dodatkowych plain-data pól.

Sprawdzić:

- `src/settlement/npcState.ts`,
- `src/app/saveState.ts`,
- `src/persistence/saveData.ts`,
- `src/app/worldBundle.ts`.

Legacy snapshot bez nowych optional travel metadata musi pozostać poprawny.

## 14. Time skip / checkpoint integration

Nie dodawać globalnej per-frame pętli.

Off-screen travel/survival resolve powinien być wywoływany z istniejących bounded world checkpoints używanych przez streaming/time skip/restore. Sprawdzić aktualne integration points w `SettlementsManager` i world time skip po zmianach od 019/029.

Partial skips i jeden równoważny duży skip powinny kończyć z tym samym authoritative state.

## 15. Highest-value tests

### Dispatch

- only `ready` assignment dispatches,
- repeated dispatch does not restart travel,
- committed member IDs stay unchanged,
- no re-provisioning.

### Spatial continuity

- 3 members own independent `NpcTravelContinuity`,
- detailed→off-screen captures each live position,
- interpolation/reification preserves progress,
- no detailed+off-screen double execution.

### Survival

- hunger/thirst progress over elapsed off-screen time,
- real food/water consumed from each member's same `personalInventory`,
- vigor is not reset,
- injury recovery not applied twice,
- repeated checkpoint is idempotent.

### Arrival/failure

- each member arrival is observed exactly once,
- death before arrival is not arrival,
- `cannot-progress` preserves identity/state,
- save/load and time skip preserve travel progress and survival checkpoint.

## 16. Implementation order

1. Verify final `027` registry/API after implementation and wire `ready` lookup only.
2. Extend generic `NpcTravelContinuity` with the minimum caller/arrival context needed for expedition.
3. Add idempotent expedition dispatch into existing per-NPC travel state.
4. Wire detailed movement through current `NpcAgent` travel path.
5. Add generic bounded off-screen survival checkpoint using existing needs/provisions/injury/vigor owners.
6. Integrate arrival handoff so expedition completion is observable exactly once.
7. Wire persistence/time-skip/streaming checkpoints.
8. Add focused tests and update state docs/JSDoc.

## Pitfalls

- Do not create `ExpeditionTravelRegistry`.
- Do not put a second copy of assignment on each NPC.
- Do not use `transportCargo` for expedition belongings.
- Do not rerun 027 candidate/provisioning logic.
- Do not clear expedition travel at arrival before caller observes it.
- Do not implement an off-screen `NpcAgent.choose()` loop.
- Do not add global road routing/formation/random encounters in this plan.
- Do not transfer settlement/home membership at arrival.

> **Zrób git commit i push do main, rebase jeżeli trzeba**