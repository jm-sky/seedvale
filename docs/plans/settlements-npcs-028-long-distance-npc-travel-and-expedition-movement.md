# Plan: Long-distance NPC travel and expedition movement

**Created:** 2026-09-08
**Status:** `verification needed` 🔍 (implemented 2026-09-15 — browser/gameplay checks are User-owned)
**Type:** feature
**Priority:** high · **Effort:** L
**Depends on:** ~~settlements-npcs-026~~, settlements-npcs-027, settlements-npcs-019
**Domain:** `settlements-npcs`
**Subdomains:** `logistics` `schedules`
**Tags:** `travel` `expedition` `off-screen` `persistence`
**Roadmap:** `quests-abandoned-gold-mine-colony.md`
**Model:** `Sonnet`, `Composer`

## Goal

Umożliwić realnym NPC z `ready` expedition assignment fizyczne opuszczenie sponsoring settlement, długą podróż do odległej world location w adaptive fidelity oraz osiągnięcie destination bez questowych proxy, bez utrzymywania live `NpcAgent` przez całą trasę i bez teleportowania tylko dlatego, że gracz nie obserwuje podróży.

Mechanizm ma rozszerzać istniejący generic NPC travel continuity i być reusable poza questem kopalni.

## Current architecture confirmed by review

Plan opiera się na wdrożonych mechanizmach:

- `settlements-npcs-027` definiuje world-owned `ExpeditionAssignment`; `028` konsumuje wyłącznie assignment w stanie `ready`,
- `027` pozostawia member IDs, provisioning, settlement/home membership i assignment lifecycle bez travel states,
- `NpcAuthoritativeState.travel` już przechowuje persistent generic `NpcTravelContinuity`,
- `src/ai/npcTravel.ts` już implementuje detailed ↔ off-screen spatial continuity, deterministic `arrivesAtDays`, progress interpolation, reification i checkpoint,
- `settlements-npcs-019` dostarcza bazowy off-screen duration model i execution-ownership pattern,
- `NpcAgent` już używa `beginOffscreenNpcTravel()` dla istniejących travel/accompany flows,
- `personalInventory` jest authoritative ownerem expedition belongings/provisions.

**028 nie tworzy drugiego travel registry ani expedition-only off-screen engine.**

## Core simulation contract

```text
ready ExpeditionAssignment
+ 3 real NPC identities
+ real destination
↓
per-member NpcAuthoritativeState.travel
↓
detailed movement while relevant
↓
detailed → off-screen handoff
↓
deterministic elapsed-world-time progression
↓
off-screen → detailed reification when relevant
↓
same NPC identities arrive
```

Adaptive simulation zmienia fidelity, nie identity ani ownership stanu.

## Ownership boundaries

### ExpeditionAssignment owns

- sponsor settlement,
- ordered member NPC IDs,
- expedition destination reference,
- provisioning/ready state.

### NpcAuthoritativeState owns per member

- generic travel continuity,
- health/needs/vigor/injury state,
- `personalInventory`,
- real provisions and belongings.

### NpcAgent owns only detailed execution

- local movement/action execution,
- current live position,
- detailed arbitration.

Nie kopiować assignment ani inventory do travel state.

## Travel commitment

Użyć i rozszerzyć istniejący `NpcTravelContinuity` zamiast tworzyć `ExpeditionTravel`, `ExpeditionJourneyRegistry` albo drugi timing store.

Aktualny contract posiada:

```text
destination
lastPosition
execution?: {
  mode: off-screen
  departedAtDays
  arrivesAtDays
}
```

`028` może dodać najmniejsze plain-data metadata potrzebne do rozróżnienia celu podróży i poprawnego arrival handling, np. generic travel purpose/context odwołujący się do expedition assignment. Nie dodawać quest object refs ani runtime closures.

Wymagany invariant:

```text
detailed NPC travel
XOR
off-screen NPC travel
```

## Dispatch from `ready` assignment

Start podróży jest osobnym idempotentnym krokiem po `027`.

Dla assignment w stanie `ready`:

1. resolve te same ordered member NPC IDs,
2. ponownie sprawdź, że członek żyje i nie ma incompatible active travel/commitment,
3. resolve destination do world-space target,
4. utwórz/ustaw per-member generic travel commitment,
5. rozpocznij detailed movement dla aktualnie materializowanych NPC,
6. nie zmieniaj provisioning ani settlement/home membership.

Nie reselectować party i nie provisionować ponownie.

Repeated dispatch nie może restartować już rozpoczętej podróży ani nadpisywać jej startu.

## Detailed departure

NPC musi faktycznie rozpocząć ruch z bieżącej pozycji.

W detailed mode:

- użyć istniejącego `NpcAgent` action/movement flow,
- używać istniejącej bounded local navigation tylko do lokalnego ruchu,
- destination pozostaje długodystansowym world targetem, nie globalnym A* path,
- normalne critical interrupts zachowują istniejące priorytety,
- persistent travel commitment nie znika przez tymczasowy interrupt.

Nie dodawać questowego `setPosition(destination)` ani globalnego pathfindingu przez całą mapę.

## Detailed → off-screen handoff

Reuse `beginOffscreenNpcTravel()` / istniejącego handoff pattern.

Handoff następuje, gdy live agent przestaje być potrzebny. Musi użyć ostatniej znanej live pozycji **przed** dispose i zapisać remaining commitment jako `arrivesAtDays`.

Nie rekonstruować trasy po dispose i nie utrzymywać `NpcAgent` tylko dlatego, że traveller jest w podróży.

## Off-screen progression

Off-screen travel ma być:

- deterministic,
- world-time based,
- bounded kosztowo,
- bez per-frame pathfinding,
- spójny z save/load i time skip,
- oparty na istniejącym `NpcTravelContinuity`.

V1 zachowuje obecny prosty duration model z `estimateOffscreenTravelDays()`; nie dodaje:

- road graph routing,
- terrain-cost route planner,
- weather penalties,
- camp/rest itinerary,
- random encounters,
- caravan formation.

## Generic off-screen survival continuity

Spatial continuity już istnieje, ale `028` musi domknąć survival continuity dla generic travelling NPC bez drugiego AI loop.

Preferowany reusable contract:

```text
elapsed off-screen travel interval
+ same NpcAuthoritativeState
+ same personalInventory
→ bounded deterministic survival checkpoint
→ same authoritative state
```

Co najmniej:

- hunger/thirst postępują wraz z elapsed world time,
- personal food/water są konsumowane z istniejącego `personalInventory`,
- stamina/vigor nie resetują się magicznie przy reification,
- `physicalInjury` korzysta z istniejącego lazy recovery ownera,
- depletion ma realną konsekwencję,
- repeated checkpoint/save/load/time skip nie stosuje tego samego elapsed interval drugi raz.

Nie implementować pełnego `NpcAgent.choose()` poza ekranem ani per-frame needs loop.

Nie tworzyć:

- `ExpeditionNeedsState`,
- `CompanionOffscreenSimulation`,
- osobnego expedition inventory,
- drugiej kopii hunger/thirst/injury.

Ten sam hook ma pozostać generic dla innych travel flows.

## Position and reification semantics

Reuse istniejące semantics `NpcTravelContinuity`:

```text
detailed:
  exact live position authoritative

off-screen:
  lastPosition + destination + departedAtDays/arrivesAtDays authoritative

reification:
  deterministic interpolated position consistent with progress
```

Reuse `interpolateNpcTravelPosition()` / `reifyNpcTravel()`.

Nie persistować per-meter path ani exact off-screen movement samples.

Reification przed arrival nie może cofać NPC do source.

## Arrival semantics

Obecny generic `resolveOffscreenNpcTravel()` może wyczyścić zakończony travel dla zwykłego return flow. `028` potrzebuje jawnego generic arrival result/context, aby expedition arrival nie zniknęło bez poinformowania caller-owned lifecycle.

Wymagany contract:

```text
travel reaches destination
→ generic travel marks/resolves logical arrival exactly once
→ expedition caller observes member arrival
→ travel execution becomes terminal/cleared safely
```

Arrival nie może:

- tworzyć nowego NPC,
- zmieniać member ID,
- provisionować ponownie,
- zmieniać jeszcze settlement/home membership,
- tworzyć colony inhabitant.

Nie dodawać `arrived` tylko jako UI flag, jeśli idempotent caller handoff można osiągnąć mniejszym generic contractem.

## Multi-member expedition

Jedno assignment ma trzech realnych members, ale **travel jest per-member**, wykorzystując istniejący `NpcAuthoritativeState.travel`.

Nie tworzyć jednego wspólnego spatial/timing recordu dla całej grupy.

Powody:

- każdy NPC ma własną identity i authoritative state,
- każdy może zostać zraniony, zatrzymany lub umrzeć niezależnie,
- istniejący generic travel primitive jest per-NPC,
- reification i streaming są per-agent.

V1 może używać tego samego destination i tego samego dispatch momentu, ale każdy member posiada własny `lastPosition`, timing i survival checkpoint.

Nie synchronizować pozycji przez teleport do leadera i nie implementować formation systemu.

## Interruption and failure semantics

### NPC death

Death zatrzymuje dalszy progress tego membera. Nie oznacza arrival ani replacement. Assignment zachowuje tę samą member identity.

### Temporary detailed interruption

Combat/critical needs mogą przerwać detailed movement zgodnie z istniejącą arbitration, ale nie kasują persistent travel commitment bez jawnego cancellation/failure contractu.

### Off-screen cannot-progress

Generic survival checkpoint może zwrócić neutralny rezultat `cannot-progress`/equivalent, jeżeli authoritative state nie pozwala logicznie kontynuować podróży.

Nie kończyć całego assignment automatycznie i nie tworzyć expedition-specific abandonment AI.

### Destination unavailable

Zachować travel/arrival-ready state bez usuwania NPC lub belongings. Resolution ma być idempotentne po ponownym pojawieniu się destination context.

## Persistence and idempotency

Nie tworzyć nowego persistence store dla travel.

Rozszerzyć istniejący `NpcStateSnapshot.travel` / generic travel serialization tylko o metadata rzeczywiście potrzebne przez nowy generic contract.

Travel musi przeżyć:

- settlement stream-out/in,
- `NpcAgent` dispose/reconstruction,
- WorldBundle rebuild,
- save/load,
- time skip.

Repeated restoration/checkpoint nie może:

- restartować podróży,
- zmieniać destination,
- podwójnie rozliczać survival interval,
- wykonywać arrival drugi raz,
- ponownie provisionować,
- zmieniać member IDs,
- uruchamiać detailed i off-screen execution równocześnie.

## Performance

Nie dodawać globalnej per-frame pętli przez historycznych travellers.

Preferować:

- istniejące active NPC authoritative states,
- world-time timestamp comparisons,
- bounded processing przy streaming/time-skip/restore checkpoints,
- work proporcjonalny do aktywnych travellers,
- detailed pathfinding tylko dla live NPC.

## Relationship with settlement membership and future colony

Podczas podróży NPC zachowuje:

- stable NPC ID,
- sponsor-settlement membership,
- household/home,
- profession/role,
- personal belongings.

Formalny transfer do przyszłej colony należy do późniejszego planu. `028` kończy się na poprawnym osiągnięciu destination przez istniejące identities.

## Non-goals

- quest stages/dialogue/rewards,
- abandoned mine implementation,
- colony creation,
- migration/membership transfer,
- candidate selection,
- provisioning policy,
- personal inventory redesign,
- random encounters,
- global road/world route graph,
- terrain/weather travel modifiers,
- high-fidelity off-screen AI replay,
- formation/caravan movement,
- multiplayer networking.

## Implementation boundaries

Najważniejsze integration points:

- `src/ai/npcTravel.ts`,
- `src/ai/NpcAgent.ts`,
- `src/settlement/npcState.ts`,
- `src/settlement/SettlementsManager.ts`,
- `src/ai/Needs.ts`,
- `src/ai/npcPersonalProvisions.ts`,
- injury lazy-recovery path,
- world time/time skip checkpoints,
- `src/app/worldBundle.ts`,
- `src/app/saveState.ts`,
- `src/persistence/saveData.ts`,
- expedition assignment registry/API introduced by `settlements-npcs-027`.

Szczegółowy verified recon jest w:

`docs/plans/implementation-notes/settlements-npcs-028-long-distance-npc-travel-and-expedition-movement-implementation-notes.md`.

## Verification

Automated tests powinny objąć:

- only `ready` assignment can dispatch,
- repeated dispatch is idempotent,
- three members use independent generic travel continuity,
- detailed → off-screen single ownership,
- off-screen elapsed-time progression,
- deterministic reification position before arrival,
- hunger/thirst continuity,
- personal provision consumption from the same `personalInventory`,
- vigor/stamina not reset on reification,
- injury recovery not skipped/double-applied,
- save/load + WorldBundle rebuild continuity,
- time-skip equivalence,
- member arrival observed exactly once,
- death does not imply replacement/arrival,
- belongings remain attached to the same NPC identities.

Manual browser verification departure/travel/arrival wykonuje użytkownik; AI nie wykonuje browser verification.

## Documentation

Dla ważnych nowych public/architectural functions/classes dodać JSDoc, gdy pomaga preflight discovery; użyć `@domain settlements-npcs` lub istniejącego właściwego domain tagu dla generic NPC travel.

Jeżeli generic travel/survival contract zmieni authoritative state boundary, zaktualizować odpowiedni `docs/state/*`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**