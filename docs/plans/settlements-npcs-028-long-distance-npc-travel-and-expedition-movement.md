# Plan: Long-distance NPC travel and expedition movement

**Created:** 2026-09-08
**Status:** `draft` 📝
**Type:** feature
**Priority:** high · **Effort:** L
**Depends on:** settlements-npcs-026, settlements-npcs-027, settlements-npcs-019
**Domain:** `settlements-npcs`
**Subdomains:** `logistics` `schedules`
**Tags:** `travel` `expedition` `off-screen` `persistence`
**Roadmap:** `quests-abandoned-gold-mine-colony.md`

> **Draft note:** ten plan jest wstępnym szkicem fundamentu pod ekspedycję NPC. Przed zmianą statusu na `planned` wymaga osobnego review aktualnego kodu oraz szczególnie uzgodnienia wspólnego contractu z `settlements-npcs-019`, aby nie powstał drugi system off-screen travel. Plan należy poprawić po tym review; nie implementować go w obecnej formie.

## Goal

Umożliwić realnym NPC z persistent expedition assignment fizyczne opuszczenie mother settlement, długą podróż do odległej world location w adaptive fidelity oraz realne osiągnięcie destination bez questowych proxy i bez teleportowania tylko dlatego, że gracz nie obserwuje trasy.

Mechanizm ma być reusable poza questem kopalni.

## Core simulation contract

```text
real NPC identity
+ real world destination
+ detailed movement while relevant
↓
detailed → off-screen handoff
↓
deterministic elapsed-world-time travel
↓
off-screen → detailed handoff when relevant
↓
same NPC identity arrives
```

Adaptive simulation oznacza zmianę fidelity, nie zmianę tożsamości ani udawanie podróży markerem.

## Existing movement baseline

Aktualny `NpcAgent` owns locomotion/action flow. Shared navigation ma bounded local-grid A* i waypoint simplification; nie jest globalnym world navmesh/routerem.

Nie próbować wykonywać local A* przez setki/metraż całej odległej trasy ani utrzymywać `NpcAgent` aktywnego tylko dlatego, że podróżuje.

## Critical relationship with settlements-npcs-019

`settlements-npcs-019-persistent-and-off-screen-transport` już projektuje:

- persistent carrier/cargo continuity,
- detailed ↔ off-screen execution handoff,
- remaining travel commitment / `arrivesAt`,
- save/load,
- time skip,
- idempotent arrival/delivery semantics.

**028 nie może implementować równoległego expedition-only off-screen engine.**

Przed implementacją wykonać review aktualnego stanu 019:

1. jeśli 019 jest zaimplementowany z reusable travel primitive — użyć go bezpośrednio;
2. jeśli jest nadal planowany/transport-specific — uzgodnić i wydzielić najmniejszy shared travel-commitment contract używany przez transport i expedition;
3. nie kopiować lifecycle/timing registries pod innymi nazwami.

## Travel commitment

Expedition member powinien mieć world-owned travel commitment związany z istniejącym assignment/member ID.

Minimalne informacje do rozważenia:

- traveller NPC ID,
- assignment ID,
- source/departure context,
- destination world/location ref,
- execution mode (`detailed` / `off-screen`) jeśli 019 używa takiego metadata,
- timing/progression metadata,
- lifecycle state tylko jeśli nie jest już owned przez assignment/shared travel primitive.

Nie persistować runtime object refs, movement closures ani pełnego pathfinding state.

## Detailed departure

NPC musi faktycznie rozpocząć ruch z bieżącej pozycji w mother settlement.

W detailed mode:

- użyć istniejącego NPC action/movement arbitration,
- użyć shared local navigation do lokalnego opuszczenia obszaru/osiągania kolejnych odpowiednich targets,
- normalne critical interrupts mają zachować priorytet tam, gdzie aktualny NPC system tego wymaga,
- off-screen executor nie może równolegle przesuwać tego samego traveller.

Nie dodawać questowego `setPosition(destination)` jako departure.

## Detailed → off-screen handoff

Gdy NPC przestaje wymagać detailed simulation — np. settlement/world streaming usuwa live agent — travel commitment pozostaje authoritative.

W momencie handoff, gdy live position jest jeszcze dostępna, capture najmniejszy potrzebny remaining commitment zgodny z 019, preferencyjnie:

```text
remainingTravelDuration
```

lub:

```text
arrivesAt = currentWorldTime + remainingTravelDuration
```

Nie próbować po dispose rekonstruować dokładnej przebytej ścieżki z niczego.

## Off-screen progression

Off-screen travel ma być:

- deterministic,
- world-time based,
- bounded kosztowo,
- bez per-frame pathfinding,
- bez utrzymywania renderowanego NPC,
- spójny z time skip.

Pierwsza wersja może używać prostego deterministycznego travel-duration estimate zgodnego z shared contract z 019.

Nie implementować w tym planie bez osobnego uzasadnienia:

- global road graph routing,
- terrain-cost route planner,
- weather travel penalties,
- detailed sleep/rest itinerary,
- random encounters,
- caravan formation,
- per-segment detailed food/water actions.

Jednocześnie off-screen travel nie może zamrażać authoritative NPC survival state. Shared generic travel/off-screen contract musi rozliczać continuity dla normalnego NPC state w coarse/lazy formie, bez companion/expedition-specific systemu.

Minimalny wymagany invariant:

```text
detailed NPC simulation
XOR
off-screen NPC travel simulation
```

obie ścieżki używają tego samego authoritative:

- hunger/thirst,
- stamina/vigor,
- `physicalInjury` + lazy natural recovery,
- `personalInventory`,
- realnych personal provisions.

### Generic off-screen survival continuity

028 nie powinien implementować drugiego decision loop ani symulować każdej czynności NPC poza ekranem. Powinien jednak konsumować shared travel primitive z 019, który umożliwia deterministyczne rozliczenie elapsed travel consequences.

Preferowany contract:

```text
off-screen interval
+ authoritative NPC state
+ journey context/duration
→ bounded coarse/lazy survival progression
→ same authoritative NPC state
```

W szczególności:

- hunger/thirst pogarszają się zgodnie z elapsed world time zamiast zatrzymywać się przy stream-out;
- stamina/vigor nie mogą zostać magicznie zresetowane przy reification; coarse travel może stosować wspólną travel/rest policy bez utrzymywania dokładnego per-frame stamina tick;
- injury natural recovery korzysta z istniejącego lazy elapsed-time ownera, nie travel-specific kopii;
- personal food/water są konsumowane z `personalInventory` przez shared survival/provision semantics, bez `ExpeditionRations`;
- depletion pozostawia realną konsekwencję zamiast magicznego refill;
- save/load/time-skip muszą być równoważne z tym samym elapsed interval.

Jeżeli pełne hunger/thirst consumption nie da się bezpiecznie wdrożyć w pierwszym slice 019/028 bez powielenia AI, shared contract może użyć bounded deterministic checkpoints zamiast detailed actions, ale nie może ignorować survival continuity całkowicie.

Nie tworzyć:

- `CompanionOffscreenSimulation`,
- `ExpeditionNeedsState`,
- expedition-only hunger/thirst meters,
- osobnej kopii `personalInventory`,
- per-frame off-screen NPC update loop.

Te same generic semantics mają obsłużyć później accompany/return travel z `npc-029` oraz `npc-032`.

## Position/fidelity semantics

Plan musi jawnie rozstrzygnąć podczas review, co oznacza spatial state off-screen traveller.

Nie wymagać persistence dokładnej pozycji co metr tylko po to, aby udowodnić, że NPC podróżuje.

Wystarczający v1 contract może być:

```text
detailed: exact live world position authoritative

off-screen: source/destination + elapsed/remaining commitment authoritative

reification: derive a safe world position consistent with current progress
```

Jeśli reification przed arrival jest potrzebne, nie teleportować traveller z powrotem do source. Wyznaczyć deterministyczną przybliżoną pozycję zgodną z postępem lub innym shared 019 contractem.

## Off-screen → detailed handoff

Gdy traveller znów staje się istotny dla detailed simulation:

1. zatrzymać off-screen execution ownership,
2. rozwiązać ten sam NPC authoritative state,
3. rozliczyć shared off-screen survival/recovery interval dokładnie raz,
4. odtworzyć jego persistent personal inventory po tym samym authoritative ownerze,
5. ustalić safe world position zgodną z travel progress,
6. wznowić movement do tego samego destination,
7. nie rozpoczynać expedition od nowa.

## Arrival

`arrivesAt`/equivalent oznacza logiczne osiągnięcie destination.

Po arrival:

- ten sam NPC ID pozostaje członkiem assignment,
- jego belongings pozostają jego własnością,
- travel commitment staje się terminalny,
- repeated tick/load/time-skip nie może wykonać arrival drugi raz,
- destination może zażądać detailed materialization, gdy obszar jest aktywny.

Arrival nie tworzy jeszcze colony inhabitant ani nie zmienia formalnego settlement membership/home.

## Multi-member expedition

Trzech NPC należy do jednego assignment, ale nie tworzyć ciężkiego formation/path synchronization systemu.

Pierwsza wersja może mieć:

- wspólny destination,
- wspólny departure commitment,
- per-member travel execution/progress,
- bounded tolerance arrival window.

Podczas review rozstrzygnąć, czy shared travel primitive z 019 lepiej reprezentuje group journey jednym timing commitment czy trzema member commitments. W obu przypadkach każdy członek pozostaje realną identity i może później mieć własne konsekwencje (np. death/interruption).

Nie teleportować dwóch NPC do leadera co tick.

## Interruption and failure semantics

### NPC death

Death nie oznacza arrival ani replacement. Assignment zachowuje konsekwencję śmierci. Nie spawnować zastępcy po dispatch.

### Temporary detailed interruption

Normalna potrzeba/combat/action może przerwać local detailed movement zgodnie z istniejącym arbitration. Nie może jednak skasować persistent travel commitment bez jawnego cancellation semantics.

### Off-screen survival interruption

Coarse off-screen progression może wykryć, że travel nie może logicznie kontynuować bez naruszenia normalnych survival invariants, np. skrajne wyczerpanie zasobów/stan zdrowia zgodnie z finalnym shared contractem.

Nie kończyć assignmentu automatycznie w tym planie. Zamiast tego shared travel execution powinien zatrzymać/oznaczyć brak możliwości dalszego progressu w neutralny sposób, który caller może później rozstrzygnąć.

Nie tworzyć expedition-specific abandonment policy.

### Destination unavailable

Travel pozostaje unresolved/arrival-ready zgodnie ze shared contract; nie kasować traveller ani belongings.

### World reload/save-load

Odtworzyć commitment, survival checkpoint i jego execution ownership dokładnie raz.

## Persistence and idempotency

Travel state musi przeżyć:

- settlement stream-out/in,
- `NpcAgent` dispose/reconstruction,
- WorldBundle rebuild, jeśli ten boundary nadal istnieje,
- save/load,
- time skip.

Repeated restoration nie może:

- restartować zegara od source,
- wykonywać arrival ponownie,
- podwójnie rozliczać hunger/thirst/vigor/injury recovery interval,
- ponownie provisionować inventory,
- zmieniać member identity,
- uruchamiać detailed i off-screen execution równocześnie.

Nie persistować derived pressure scores ani second-copy survival state. Potrzebne checkpoint/timestamp metadata ma należeć do generic travel execution lub istniejącego authoritative ownera danej domeny.

## Performance

Nie dodawać globalnego per-frame loop przez wszystkich historycznych travellerów.

Preferować:

- registry tylko aktywnych commitments,
- world-time timestamp comparisons,
- processing przy istniejących simulation/streaming/time-skip checkpoints,
- bounded work proportional to active journeys,
- lazy/coarse survival resolution per active traveller,
- detailed pathfinding tylko dla aktywnie materializowanych NPC.

## Relationship with settlement membership and future colony

Podczas całej podróży NPC zachowuje istniejącą identity i mother-settlement membership/home.

Formalny transfer:

```text
mother settlement inhabitant
→ colony inhabitant
```

jest osobnym późniejszym planem związanym z colony bootstrap/relocation. Nie zmieniać settlement-scoped NPC IDs ad hoc w 028.

## Non-goals

- quest logic/dialogue/rewards,
- abandoned mine implementation,
- colony creation,
- migration/membership transfer,
- expedition candidate selection,
- provisioning policy,
- personal inventory ownership redesign,
- random encounters,
- full road/world route graph,
- high-fidelity simulation całej trasy,
- detailed per-action off-screen AI replay,
- multiplayer networking.

## Likely integration points to verify during review

- `src/ai/NpcAgent.ts`,
- `src/navigation/navigation.ts`,
- settlement streaming/manager lifecycle,
- NPC authoritative state registry,
- world time/time skip integration,
- SaveData schema/migrations,
- `settlements-npcs-019` implementation/plan,
- `settlements-npcs-027` assignment representation,
- `src/ai/Needs.ts` / authoritative NPC need state,
- `src/ai/npcPersonalProvisions.ts`,
- injury lazy-recovery owner from `npc-025`.

## Verification

Automated tests powinny objąć:

- detailed → off-screen single ownership,
- off-screen elapsed-time progression,
- hunger/thirst continuity across off-screen interval,
- personal provision consumption uses the same `personalInventory`,
- vigor/stamina semantics do not reset on reification,
- injury lazy recovery is not skipped or double-applied,
- save/load continuity,
- time-skip equivalence,
- off-screen → detailed before arrival,
- arrival idempotency,
- three-member assignment continuity,
- death does not imply replacement/arrival,
- belongings remain attached to same NPC identities.

Manual browser verification trasy, departure i arrival wykonuje użytkownik; AI nie wykonuje browser verification.

## Documentation

Dla ważnych nowych public/architectural functions/classes dodać JSDoc, gdy pomaga preflight discovery; użyć `@domain settlements-npcs` tam, gdzie pasuje.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
