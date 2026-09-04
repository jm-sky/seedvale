# Plan: Persistent & Off-screen Transport

**Created:** 2026-09-04
**Status:** `planned` 📋
**Priority:** high · **Effort:** M/L
**Depends on:** settlements-npcs-018
**Domain:** `settlements-npcs`  
**Type:** `feature`  
**Roadmap:** `physical-goods-transport`

## Goal

Rozszerzyć `TransportOrder` z `settlements-npcs-018` tak, aby aktywny transport zachowywał poprawny stan, własność cargo i postęp poza lifetime konkretnego `NpcAgent`.

Transport ma pozostać spójny podczas:

- settlement stream-out / stream-in,
- `NpcAgent` dispose / reconstruction,
- `WorldBundle` rebuild,
- save / load,
- time skip,
- przejścia między detailed i off-screen simulation.

Kluczowy invariant pozostaje bez zmian:

```text
before pickup:
    source owns goods

after pickup:
    NPC identity owns goods

after unload:
    destination owns goods
```

`TransportOrder` nadal opisuje commitment. Nie staje się cargo inventory.

019 ma rozwiązać trzy powiązane problemy w tej kolejności:

```text
persistent transport cargo ownership
        ↓
transport + cargo persistence
        ↓
detailed ↔ off-screen execution handoff
        ↓
time skip
```

Nie implementować kolejnych etapów ekonomii ani remote production logistics w tym planie.

## Context

`settlements-npcs-018` wprowadza:

- world-owned `TransportOrder`,
- stable source/destination/carrier refs,
- physical pickup,
- real `source → carrier → destination` ownership,
- physical NPC travel,
- transactional pickup/unload,
- conservation semantics.

018 świadomie nie rozwiązuje:

```text
NPC unloaded while order is in-transit
save while NPC carries cargo
time skip while transport is active
off-screen travel
```

Obecny `NpcAuthoritativeState` przeżywa lifetime konkretnego `NpcAgent`, ale `carried` jest obecnie transient state należącym do `NpcAgent` i resetuje się przy reconstruction.

To jest poprawne dla krótkotrwałego runtime state, ale niewystarczające po successful transport pickup: realne goods nie mogą przestać istnieć tylko dlatego, że carrier przestał być detailed/live agentem.

019 ma domknąć tę granicę bez rozszerzania persistence na cały runtime NPC state.

## Core design decision

### Transport cargo must have persistent NPC-owned authority

Po successful pickup właścicielem cargo pozostaje carrier NPC także wtedy, gdy jego live `NpcAgent` nie istnieje.

Nie przesądzać przed implementation reconem, że całe istniejące `NpcAgent.carried` musi zostać mechanicznie przeniesione do `NpcAuthoritativeState`.

Zweryfikować dwa kierunki:

```text
A. authoritative NpcState.carried

B. narrower persistent transport-cargo state
   owned by NpcId
```

Wybrać najmniejszy model zgodny z istniejącymi semantics innych zastosowań `carried`.

Niezależnie od reprezentacji wymagane są invariants:

- cargo jest owned by NPC identity,
- live `NpcAgent` używa tego samego authoritative cargo state,
- nie istnieje druga authoritative copy,
- `TransportOrder` nie przechowuje cargo inventory,
- reconstruction nie odtwarza goods z `claimedQuantity`.

### Do not accidentally persist all NPC runtime state

019 ma persistować wyłącznie transport-relevant NPC cargo state wymagany do zachowania conservation.

Nie rozszerzać `SaveData` na:

- pathfinding state,
- current action closures,
- pending movement,
- presentation state,
- combat intent,
- pozostały transient `NpcAgent` runtime state.

## Ownership invariant

W żadnym momencie nie mogą istnieć równoległe authoritative copies:

```text
live NpcAgent cargo
+
persistent NPC cargo
+
TransportOrder cargo
```

Jeżeli live agent posiada `carried` API, powinno ono wskazywać na ten sam authoritative cargo state lub być cienką warstwą nad nim.

Nie implementować handoff modelu:

```text
NpcAgent inventory
↔ TransportOrder inventory
↔ NpcAgent inventory
```

`TransportOrder` może przechowywać metadata:

- expected `ItemKind`,
- requested quantity,
- claimed quantity,
- delivered quantity,
- carrier ID,
- lifecycle state,
- timing/progression metadata.

Metadata order nie jest proof of cargo ownership.

## Execution fidelity invariant

W każdym momencie aktywny transport ma dokładnie jednego execution owner:

```text
detailed execution
OR
off-screen execution
```

Nigdy oba jednocześnie.

### Detailed execution

Gdy carrier jest aktywnym detailed `NpcAgent`:

- istniejący NPC action/movement flow wykonuje transport,
- off-screen clock nie może równolegle ukończyć order,
- physical position/action state jest authoritative dla bieżącego progress.

### Off-screen execution

Gdy carrier zostaje abstracted/unloaded:

- physical action execution przestaje być authoritative,
- transport przechodzi na deterministic elapsed-time progression,
- cargo nadal należy do persistent NPC identity,
- `TransportOrder` pozostaje tym samym order.

Transition musi być jawny i idempotentny.

## Persistent NPC cargo

### Reconstruction requirement

Scenariusz:

```text
NPC picks up cargo
      ↓
order = in-transit
      ↓
NpcAgent disposed
      ↓
new NpcAgent created later
      ↓
same NPC-owned cargo is available
      ↓
same order resumes
```

Nie:

```text
new NpcAgent
    ↓
empty carried inventory
    ↓
order claims source again
```

### Inventory fidelity

Zachować wszystkie informacje wymagane przez realne items, w szczególności:

- quantities,
- freshness batches,
- item-instance metadata, jeżeli dany `ItemKind` tego wymaga.

Reuse istniejących `Inventory` snapshot/save primitives, jeśli pasują do tego ownership model.

Nie tworzyć transport-specific serializer, jeżeli generic inventory representation już wystarcza.

## WorldBundle rebuild continuity

Najpierw domknąć continuity bez off-screen travel.

Aktywny transport musi przeżyć in-session rebuild:

```text
pickup
  ↓
order = in-transit
  ↓
WorldBundle rebuild
  ↓
order restored/carried forward
NPC cargo restored/carried forward
  ↓
new live agent sees same cargo
```

Reconstruction nie może:

- ponawiać pickup,
- odtwarzać cargo z order metadata,
- oznaczać order jako completed,
- zwracać goods do source.

## Settlement streaming

### Detailed → unloaded

Jeżeli carrier zostaje odstreamowany podczas transportu:

```text
live NpcAgent execution stops
        ↓
NPC-owned cargo remains authoritative
TransportOrder remains authoritative
        ↓
off-screen execution becomes owner of progress
```

Nie utrzymywać live `NpcAgent` tylko dlatego, że posiada aktywny transport.

### Unloaded → detailed

Po ponownym loadzie:

1. resolve persistent NPC cargo,
2. reconstruct `NpcAgent`,
3. expose the same cargo state,
4. resolve active `TransportOrder`,
5. determine whether off-screen journey already reached logical arrival,
6. hand execution back to detailed NPC only once,
7. never repeat pickup or completed unload.

## Persistence

Persistence ownership jest fundamentem off-screen progression i powinno zostać wdrożone przed travel timing.

### TransportOrder persistence

Persist active/non-terminal order as plain data containing tylko dane potrzebne do reconstruction, np.:

- order ID,
- source ref,
- destination ref,
- `ItemKind`,
- requested quantity,
- claimed quantity,
- delivered quantity,
- carrier NPC ID,
- lifecycle state,
- off-screen timing metadata, jeśli transport został abstracted.

Nie persistować runtime object references ani action closures.

### Cargo persistence

Persist tylko NPC-owned cargo state potrzebny do zachowania transport ownership.

Nie persistować całego `NpcAuthoritativeState` tylko dlatego, że transport tego potrzebuje.

Jeżeli istniejący NPC snapshot jest właściwym miejscem dla in-session rebuild, a `SaveData` wymaga węższego transport-specific snapshotu, utrzymać ten podział zamiast rozszerzać persistence bez potrzeby.

### SaveData migration

Użyć istniejącego schema/versioning/migration mechanism.

Existing saves bez transport state powinny odtwarzać:

```text
no active transport orders
no persistent transport cargo
```

Nie wymagać resetowania save.

### Snapshot consistency

Order i cargo muszą tworzyć logicznie spójny save snapshot.

Niedopuszczalne:

```text
order = in-transit
claimed = 6
NPC-owned cargo = 0
```

jeżeli nie istnieje jawna inna ownership resolution.

Równie niedopuszczalne:

```text
order = completed
NPC still owns delivered cargo
destination also owns cargo
```

Nie naprawiać niespójności przez recreate goods z order metadata.

## Off-screen travel timing

Dopiero po domknięciu cargo/order persistence dodać lower-fidelity progression.

Nie wymagać persistence dokładnej pozycji NPC tylko dla transportu.

### Detailed → off-screen handoff

W momencie utraty detailed execution wyznaczyć remaining travel commitment na podstawie informacji dostępnych wtedy, gdy live NPC position jeszcze istnieje.

Preferować:

```text
remainingTravelDuration
```

lub bezpośrednio:

```text
arrivesAt = currentWorldTime + remainingTravelDuration
```

zamiast próbować po stream-out rekonstruować dokładną pozycję/path NPC.

Jeżeli transport zostaje abstracted przed pickup, nie traktować go jak `in-transit` cargo journey. Goods nadal należą do source, a continuation do source musi zachować semantics `assigned` order.

### Travel duration

Użyć najprostszego deterministycznego oszacowania zgodnego z aktualnym movement model, np. remaining distance / effective travel speed.

Nie implementować w 019:

- road quality,
- terrain routing graph,
- weather penalties,
- rest schedules,
- random encounters,
- caravan formation.

### No per-frame tick

Nie:

```text
for every frame:
    for every transport:
        progress += dt
```

Preferować timestamp comparison przy istniejących bounded simulation checkpoints.

## Off-screen arrival

`arrivesAt` oznacza logiczne osiągnięcie destination, ale nie może automatycznie wymuszać mutation dowolnego endpointu.

Przed off-screen unload endpoint musi dać się rozwiązać do authoritative simulation storage niezależnego od presentation/streamed object.

Koncepcyjnie:

```text
TransportEndpointRef
        ↓
resolve authoritative storage?
        ↓
yes → transactional unload may run off-screen
no  → keep cargo owned by NPC until safe resolution
```

Dla pierwszych endpointów zweryfikować aktualny ownership `Household` i `SettlementEconomy` zamiast zakładać, że każdy przyszły endpoint będzie off-screen mutable.

Nie tworzyć generic destination abstraction większej niż potrzebuje aktualny use case.

Jeżeli travel time upłynął, ale unload nie jest jeszcze bezpieczny, można traktować order jako arrival-ready derived condition.

Nie dodawać persistent `arrived` state wyłącznie dla UI, chyba że transactional recovery faktycznie go wymaga.

## Off-screen lifecycle

Preferować zachowanie małego lifecycle z 018:

```text
pending
   ↓
assigned
   ↓
in-transit
   ↓
completed
```

Informacje takie jak:

```text
executionMode = detailed/off-screen
arrivesAt
```

powinny być osobną execution metadata, nie mnożyć domenowych states bez potrzeby.

## Save/load restoration

Po loadzie:

### `pending`

Goods nadal należą do source.

### `assigned`

Goods nadal należą do source.

Nie recreate cargo.

### `in-transit`

Cargo musi istnieć w persistent NPC-owned cargo state.

Validate:

```text
carrier exists
cargo ownership exists
order quantities are compatible with owned cargo
```

Nie recreate cargo z `claimedQuantity`.

### `completed`

Nie wznawiać execution.

Nie deliverować ponownie.

## Time skip integration

Transport powinien korzystać z tej samej hybrid simulation philosophy co pozostały world state.

Nie symulować kroków/pathfinding NPC podczas skip.

Dla off-screen order:

```text
skipEnd < arrivesAt
    ↓
order remains travelling
cargo remains NPC-owned
```

oraz:

```text
skipEnd >= arrivesAt
    ↓
logical arrival reached
    ↓
transactional unload if destination can be safely resolved
```

Jeżeli destination nie może zostać bezpiecznie mutate podczas skip:

- cargo pozostaje u NPC,
- completion czeka na safe resolution,
- goods nie są teleportowane ani odtwarzane.

Repeated/partial time skips powinny dawać taki sam transport state jak równoważny elapsed world time.

## Fidelity transitions

### Detailed → off-screen

- stop detailed transport execution,
- capture remaining travel commitment,
- establish off-screen timing,
- preserve same order ID,
- preserve same carrier NPC ID,
- preserve same cargo owner,
- do not restart from source.

### Off-screen → detailed before arrival

- stop off-screen execution ownership,
- reconstruct live NPC with same cargo,
- resume appropriate movement toward destination,
- do not repeat pickup.

019 nie musi dokładnie odtwarzać każdego punktu przebytej off-screen trasy.

Nie dodawać pełnego NPC position persistence tylko dla tego celu.

### Off-screen → detailed after logical arrival

Jeżeli off-screen unload już nastąpił:

- order jest completed,
- NPC nie posiada delivered cargo,
- detailed agent nie wykonuje unload ponownie.

Jeżeli unload czekał na safe resolution:

- NPC nadal posiada cargo,
- detailed execution może wykonać final delivery.

## Interruption semantics

### Carrier temporarily unavailable

Order pozostaje authoritative.

Cargo pozostaje owned by NPC identity.

Nie recreate ani refund goods.

### Destination unavailable

Cargo pozostaje owned by NPC.

Order nie jest completed.

### Carrier death

019 nie implementuje pełnego death/corpse cargo recovery.

Wymagany invariant:

```text
carrier death != completed delivery
carrier death != source refund
carrier death != cargo recreation
```

Jeżeli aktualny death system oferuje bezpieczny istniejący ownership handoff, można go reuse po reconie. W przeciwnym razie pozostawić recovery jako jawny deferred case.

Nie tworzyć transport-specific corpse inventory w tym planie.

## Failure recovery principle

Preferować:

```text
transport unresolved but goods preserved
```

nad:

```text
automatic repair by creating/deleting goods
```

Order metadata nigdy nie jest podstawą do stworzenia brakującego cargo.

## Performance

Nie dodawać globalnego per-frame off-screen transport loop.

Preferować:

- direct order/carrier lookup,
- processing tylko aktywnych transport commitments,
- timestamp comparisons,
- existing world-time / streaming / time-skip checkpoints,
- bounded work proportional to active transports.

Nie dodawać arrival priority queue/indexingu bez realnej potrzeby skali.

## Files and systems to inspect

Przed implementacją sprawdzić aktualny kod, szczególnie:

- implementation of `settlements-npcs-018`,
- `src/settlement/npcState.ts`,
- `src/ai/NpcAgent.ts`,
- `src/items/Inventory.ts`,
- `src/settlement/SettlementsManager.ts`,
- `src/world/timeSkip.ts`,
- `src/persistence/saveData.ts`,
- `src/persistence/saveData.test.ts`,
- current SaveData schema/version/migration infrastructure,
- `WorldBundle` rebuild snapshot/carry mechanisms,
- `Household` snapshot/state ownership,
- `SettlementEconomy` snapshot/state ownership,
- NPC death/corpse handling,
- current world-time representation.

Zweryfikować szczególnie, czy inne użycia `NpcAgent.carried` zakładają transient semantics, zanim cały inventory zostanie przeniesiony do authoritative NPC state.

## Implementation stages

### Stage 1 — Persistent NPC-owned transport cargo

- Recon all current `NpcAgent.carried` usages.
- Choose the narrowest authoritative NPC-owned cargo representation.
- Ensure live `NpcAgent` uses the same cargo state rather than a duplicate.
- Preserve carrying capacity semantics.
- Preserve freshness and relevant item metadata.
- Verify `NpcAgent` dispose/recreate does not lose cargo.
- Verify `WorldBundle` rebuild does not lose cargo.

### Stage 2 — Transport and cargo persistence

- Add `TransportOrder` snapshot/restore.
- Add persistent transport cargo snapshot/restore.
- Integrate only transport-relevant NPC cargo into SaveData.
- Add schema migration/default for old saves.
- Restore order ↔ carrier relationship by stable IDs.
- Never restore cargo from order quantities.
- Add save snapshot consistency tests.

### Stage 3 — Streaming continuity

- Preserve active order/cargo across settlement stream-out/in.
- Establish explicit detailed/off-screen execution ownership.
- Ensure detailed execution stops before off-screen progression starts.
- Ensure off-screen progression stops before detailed execution resumes.
- Prevent repeated pickup/unload across transitions.

### Stage 4 — Off-screen travel timing

- Capture remaining travel commitment during detailed → off-screen handoff.
- Add minimal deterministic timing metadata.
- Use elapsed world time rather than per-frame movement.
- Resolve logical arrival at bounded simulation checkpoints.
- Allow off-screen unload only for endpoints with resolvable authoritative storage.

### Stage 5 — Time skip integration

- Advance off-screen transport against skip interval.
- Resolve eligible logical arrivals once.
- Keep unfinished transport in-transit.
- Preserve cargo if destination cannot safely receive it.
- Verify repeated skips are deterministic and idempotent.

### Stage 6 — Consistency and diagnostics

- Detect order/carrier/cargo mismatches.
- Add assertions or diagnostics for impossible ownership combinations.
- Preserve goods instead of reconstructing them from metadata.
- Expose minimal execution mode/timing debug information through existing tooling where useful.

## Automated verification

Add focused tests for:

- transport cargo survives `NpcAgent` dispose/recreate,
- transport cargo survives `WorldBundle` rebuild,
- transport cargo survives settlement stream-out/in,
- freshness survives reconstruction,
- active order survives registry reconstruction,
- save/load before pickup,
- save/load while assigned,
- save/load while in-transit,
- save/load after completion,
- old save without transport fields,
- no cargo recreation from `claimedQuantity`,
- no repeated pickup after restore,
- no repeated unload after restore,
- exactly one execution owner at a time,
- detailed → off-screen handoff,
- off-screen → detailed handoff,
- deterministic remaining travel timing,
- off-screen partial travel,
- off-screen logical arrival,
- time skip shorter than remaining travel,
- time skip longer than remaining travel,
- repeated time skips,
- destination unavailable at logical arrival,
- exact goods conservation across all fidelity transitions.

Core invariant:

```text
source
+
all authoritative NPC-owned cargo
+
destinations

=
constant
```

through:

```text
streaming
rebuild
save/load
time skip
```

Execution invariant:

```text
exactly one executor:
    detailed XOR off-screen
```

## Manual verification

Player performs browser verification.

### Scenario A — Reconstruction

```text
Trader picks up food
      ↓
order = in-transit
      ↓
NpcAgent / WorldBundle reconstructed
      ↓
same cargo remains NPC-owned
      ↓
pickup is not repeated
      ↓
delivery occurs once
```

### Scenario B — Settlement streaming

```text
Trader picks up food
      ↓
settlement/carrier streams out
      ↓
off-screen execution owns progress
      ↓
settlement loads again
      ↓
detailed execution resumes coherently
```

### Scenario C — Save/load

```text
Trader picks up food
      ↓
save while carrying
      ↓
reload
      ↓
same cargo still belongs to NPC identity
      ↓
same order resumes
      ↓
destination receives goods once
```

### Scenario D — Time skip

```text
active off-screen transport
      ↓
time skip
      ↓
remaining duration elapses
      ↓
logical arrival resolved once
```

Verify source, carrier and destination quantities before and after each scenario.

## Explicit non-goals

Do not implement in this plan:

- persistence of all NPC runtime state,
- exact off-screen NPC position/path reconstruction,
- economic transport demand generation,
- production pressure → transport matching,
- remote mine/resource-site logistics,
- inter-settlement trade,
- automatic world-wide carrier matching,
- carrier reassignment,
- full carrier death/corpse cargo recovery,
- carts,
- wagons,
- horses/donkeys as cargo carriers,
- caravans,
- travelling merchants,
- road quality simulation,
- terrain route graphs,
- weather travel penalties,
- random off-screen encounters,
- global logistics manager,
- global per-frame transport tick,
- dynamic market/pricing system.

## Follow-up plans

```text
settlements-npcs-018
Physical Goods Transport Foundation
        ↓
settlements-npcs-019
Persistent & Off-screen Transport
        ↓
settlements-npcs-020
Economic Transport Demand Integration
        ↓
settlements-npcs-021
Remote Production Site Logistics
```

019 makes transport independent from live `NpcAgent` lifetime and simulation fidelity.

020 decides when transport should be requested by the economy.

021 provides the first genuinely remote production/logistics flow.

## Success criteria

The plan is complete when:

1. Transport cargo after pickup has persistent NPC-owned authority independent from a specific live `NpcAgent` instance.
2. The implementation does not unnecessarily make all NPC runtime state persistent.
3. Live and persistent representations never duplicate authoritative cargo.
4. `TransportOrder` remains commitment metadata and never becomes cargo storage.
5. Active transport survives `NpcAgent` reconstruction and `WorldBundle` rebuild.
6. Active transport survives settlement stream-out/in.
7. Active transport order and required cargo ownership survive save/load.
8. Old saves remain loadable through existing schema/versioning conventions.
9. Detailed and off-screen transport execution are mutually exclusive.
10. Detailed → off-screen handoff captures remaining travel without requiring full NPC position persistence.
11. Off-screen travel progresses deterministically using elapsed world time rather than per-frame NPC simulation.
12. Time skip advances transport consistently and idempotently.
13. Off-screen unload occurs only when destination authoritative storage can be safely resolved.
14. Pickup is never repeated after goods already moved to carrier ownership.
15. Unload is never repeated after completion.
16. Missing destination/carrier situations preserve goods rather than recreating or deleting them.
17. Food freshness and required inventory metadata survive persistence/fidelity transitions.
18. Goods conservation holds across streaming, rebuild, save/load and time skip.
19. No global logistics tick, parallel cargo inventory or parallel off-screen simulation is introduced.
20. The resulting system is ready for economic order generation in `settlements-npcs-020`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
