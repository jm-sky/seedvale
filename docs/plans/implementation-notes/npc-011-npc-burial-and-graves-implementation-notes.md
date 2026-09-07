# NPC Burial & Graves — Implementation Notes

**Plan:** `npc-011-npc-burial-and-graves.md`
**Recon:** 2026-09-07, current `main`

## Najważniejsza korekta względem starego reconu

Stare notes były nieaktualne w najważniejszym miejscu: `NpcAuthoritativeState` **jest persisted**.

Aktualny flow:

```text
NpcStateRegistry.serialize()
→ SaveData.npcStates
→ createWorldBundle(initialSave?.npcStates)
→ SettlementsManager(initialNpcStates)
→ createNpcStateRegistry(initialNpcStates)
```

`rebuildWorldBundle()` używa tego samego snapshot/restore boundary. W efekcie `health.dead`, `activePlan` i pozostałe authoritative NPC fields przeżywają settlement stream-out/in, `WorldBundle` rebuild i pełny save/load.

`npc-011` nie może więc traktować burial jako systemu stojącego obok persistence NPC. Musi wykorzystać persisted post-death state, który `npc-010` ma dodać do istniejącego `NpcStateSnapshot`.

## Stan `npc-010`

`npc-010` nadal jest `planned`, ale jego plan/notes zostały już odświeżone pod aktualny kod.

Najważniejsze ustalenia, które 011 ma odziedziczyć:

- `HealthState.dead` pozostaje jedynym alive/dead truth,
- `die()` / `die(true)` nie jest one-shot death eventem — hydration dead NPC też je wywołuje,
- post-death/corpse state ma żyć w `NpcAuthoritativeState` / `NpcStateSnapshot`, nie w osobnym globalnym corpse registry,
- aktywny corpse musi mieć persisted death transform/time/lifecycle/processing state,
- terminal/no-active-corpse musi być persisted, aby corpse nie wracał po stream/reload,
- `npc-010` ma zostawić mały persisted burial claim/handoff seam, który blokuje natural cleanup,
- legacy dead NPC bez historycznej death position ma migrować do terminal/no-active-corpse zamiast fabrykowanego corpse.

011 ma konsumować faktyczną implementację tego modelu. Nie kopiować go do własnego state.

## Aktualna architektura decision/plan

Top-level NPC arbitration nie jest już tylko `NeedId → strategy`.

`NpcAgent.choose()` zbiera obecnie niezależne pressure candidates z:

- Needs,
- weather,
- healing,

po czym rozstrzyga jednego zwycięzcę i przekazuje go przez `npcDecision.ts` do dispatchu.

To jest właściwy seam dla burial: dodać kolejnego social/world-problem producer, nie sztuczny `NeedId`.

### Nadal istnieje ograniczenie `NpcPlan`

`src/ai/npcPlan.ts` jest nadal need-centric:

- `NpcGoalId` = `fulfilWorkDuty | obtainWood | secureFood | secureWater`,
- `goalForNeed()` i `needForGoal()` tworzą 1:1 mapping z `NeedId`,
- `NpcStrategyId` jest need-strategy union.

Burial nie powinien wejść do `NeedId`.

Najmniejsza spójna zmiana przy implementacji 011 to pozwolić persistent planowi typu `buryDeceased` istnieć niezależnie od `goalForNeed()` i zawierać stable deceased/corpse identity potrzebne do rewalidacji. Nie rozbudowywać przy okazji pełnego generic Goal/Problem frameworka.

Uwaga persistence: `activePlan` jest już częścią `NpcStateSnapshot`. Zmiana jego persisted union/shape musi być objęta bieżącym `SaveData` versioningiem, validatorem i migracją zgodnie z aktualną konwencją repo.

## Death awareness

Nie ma obecnie generic death-awareness/event propagation systemu.

Naturalny locality boundary to settlement + istniejące deterministic family/household mapping oraz persisted NPC↔NPC relationships.

Preferuj:

```text
active corpse from npc-010
→ resolve deceased household/family
→ same-household candidates
→ optional existing relationship/role candidates
→ produce burial pressure candidate
```

Nie potrzeba persisted `knowsNpcIsDead` flag, jeśli eligibility można deterministycznie przeliczyć z corpse + household/relationship state po stream/reload. Dodawanie osobnego knowledge store tylko dla burial tworzyłoby drugi lifecycle/idempotency problem.

Nie używać player-facing `QuestManager` relations. `NpcRelationships` jest osobnym, persisted symmetric store keyed NPC ids.

## Corpse identity / claim handoff

011 potrzebuje po `npc-010` wąskiego contractu. Nazwy API pozostają do faktycznej implementacji 010, ale semantyka musi obejmować:

1. lookup aktywnego corpse po stable identity,
2. `active/buryable` vs terminal/no-active-corpse,
3. persisted claim owner/state,
4. acquire/release/revalidate claim,
5. claim blokujący natural decay/cleanup,
6. idempotentny terminal transition oznaczający successful burial,
7. recovery stale claim po reconstruction.

### Stale claim jest ważniejszy niż wcześniej

`NpcAgent` execution state nie jest persisted:

- `phase`,
- `pendingAction`,
- pathfinding/watchdog,
- combat intent.

Dlatego persisted claim nie może oznaczać „runtime executor na pewno nadal wykonuje burial”. Po load/rebuild/stream reconstruction claim musi mieć deterministyczną recovery/revalidation rule.

Dopuszczalne kierunki (wybiera 010 implementation contract):

- claim zawiera stable claimant NPC id i jest uznawany za resumable tylko gdy ten NPC po reconstruction ponownie posiada zgodny burial plan,
- albo claim ma persisted lease/state pozwalający bezpiecznie go odzyskać/release'ować.

Nie używać wall-clock expiry. Semantyka ma być deterministyczna względem simulation/persisted state.

## Coordination invariant

Wymaganie:

```text
one active corpse
→ one winning claim
→ one successful burial consequence
→ one grave
```

Claim należy do `npc-010` post-death state. Nie tworzyć globalnego lock managera ani transient `Set<corpseId>` na `NpcAgent`/Settlement.

Każdy executor rewaliduje claim tuż przed final action effect.

## Burial action lifecycle

`NpcAgent` ma już generic action FSM oraz shared `PlannedAction` / `ActionLifecycle`.

Preferowany flow:

```text
pressure wins
→ ensure/resume burial plan
→ acquire/revalidate claim
→ resolve corpse position / approach point
→ ordinary goTo
→ ordinary execute/timed interaction
→ atomic burial transition
→ create persistent grave
→ complete plan
```

Nie dodawać burial FSM, osobnego movement loop ani pathfindingu.

Aktualny movement używa normalnego steeringu + bounded local A* przy stuck oraz watchdog/repath/recovery. Corpse destination ma wejść przez te same seams.

Jeżeli corpse znika, decay wygrał przed claimem, claim został stracony albo destination staje się niedostępny, plan/action ma użyć normalnego cancel/obsolete/replan lifecycle.

## Atomicity corpse → grave

Największa implementacyjna pułapka: dwa authoritative owners muszą przejść przez jeden logiczny consequence:

- `NpcStateSnapshot.postDeath` (lub faktyczna nazwa z 010) owns corpse terminal state,
- `Graves` world collection owns persisted grave.

Nie może powstać trwały stan:

```text
corpse marked buried
AND
no grave
```

ani:

```text
grave created
AND
corpse still active/buryable
```

po normalnym retry/reload.

Najbezpieczniejszy kierunek: grave stable ID deterministycznie związane z corpse/deceased identity (np. jedna grave identity na jeden death/corpse) + idempotent `ensure/add` po successful corpse transition. Konkretna kolejność zapisów zależy od API 010/world-object collection, ale testy muszą wymuszać convergent result po repeated call/reconstruction.

Nie generować losowego grave id przy każdym retry.

## Grave world object

Aktualny `SaveData` nie ma grave field.

Grave powinien podążyć istniejącym persistent world-object wzorcem:

```text
plain GraveRecord
↕
runtime collection (`nodes()` / add/remove/dispose equivalent)
↕
WorldBundle.graves
↕
SaveData.graves
↕
createWorldBundle initial graves
↕
rebuildWorldBundle carried graves
```

Minimalny record:

- stable `id`,
- `x/z` (+ yaw jeśli model potrzebuje),
- deceased `NpcId` / corpse/death reference,
- optional simulation-time burial anchor tylko jeśli realnie używany.

Nie kopiować household, relationships, corpse phase ani loot.

### Persistence change

Dodanie graves to persisted representation change, więc podczas implementation:

- bump `CURRENT_SAVE_VERSION`,
- add migration,
- update `isSaveData()` validation,
- update save fixtures/migration tests,
- thread `SaveData.graves` przez create/rebuild/save assembly.

Nie dodawać `graves?: []` bez migracji jako shortcut.

## Save/load / rebuild — właściwy podział ownership

Po implementacji obu planów oczekiwany obraz:

```text
SaveData.npcStates[deadNpc]
  → health.dead
  → persisted postDeath/corpse lifecycle
  → persisted claim/handoff
  → persisted activePlan burial intent

SaveData.graves
  → completed world result
```

Reconstruction nie patrzy na mesh ani previous `pendingAction`.

Cases:

- active corpse, no valid claim → burial może ponownie wejść jako pressure candidate,
- active corpse, valid resumable claim/plan → executor może ponownie zaplanować action od początku,
- active corpse, stale claim → deterministic release/recovery,
- terminal buried corpse + grave → no-op,
- legacy terminal dead without corpse → no burial, no fabricated grave.

## Settlement streaming / off-screen

`SettlementsManager.update()` tickuje loaded settlements. `NpcAgent`s nie istnieją jako pełny executor dla unloaded settlements.

Stary plan miał zbyt mocne sformułowanie „NPC może notice → navigate → bury poza aktywnym obszarem”. Dziś nie ma ogólnego systemu, który to wykona bez materialized agent.

Nie dodawać go w 011.

World-independence w obecnej architekturze oznacza:

- death/corpse state przeżywa stream-out bez mesh,
- decay/terminal state z 010 może rozwiązywać się z persisted simulation-time anchor,
- grave przeżywa stream-out,
- burial intent/claim jest rebuild-safe,
- actual movement/execution zachodzi na poziomie symulacji aktualnie wspieranym przez loaded settlement.

Jeżeli settlement unloaduje się w trakcie burial, execution runtime znika; po powrocie system rewaliduje authoritative plan/corpse/claim i planuje świeżą action, zamiast udawać kontynuację pathfindingu.

## Household / relationships

Family → household mapping jest deterministic i stabilny; household registry oraz NPC relationships persistują.

To wystarcza do odpowiedzialności/social context bez tworzenia:

- grief,
- inheritance,
- funeral ceremonies,
- legal ownership,
- nowego relationship store.

Nie zapisuj burial result do household tylko po to, by „pamiętać pogrzeb”. Persistent grave + deceased authoritative state są właściwymi world facts.

## World-time

Jeżeli grave potrzebuje czasu pochówku, użyć tego samego simulation-time domain co `npc-010` death/lifecycle anchor (`elapsedDays`/world time), nie `Date.now()` ani runtime seconds.

Sam burial claim nie powinien potrzebować wall-clock timeoutów.

## Files / seams do sprawdzenia po implementacji `npc-010`

Najpierw ponownie otworzyć:

- `src/settlement/npcState.ts` — final post-death/claim shape,
- actual 010 corpse materialization/lifecycle files,
- `src/ai/NpcAgent.ts` — final death hook + pressure/action seams,
- `src/ai/npcPlan.ts`, `src/ai/npcDecision.ts`, `src/ai/npcStrategies.ts`,
- `src/settlement/createSettlement.ts` / `SettlementsManager.ts`,
- `src/app/worldBundle.ts`,
- `src/app/saveState.ts`,
- `src/persistence/saveData.ts` + tests,
- one simple existing persistent world-object collection as concrete template.

Nie opierać implementacji 011 na nazwach sugerowanych w tym reconie, jeśli 010 wyląduje z innym poprawnym API.

## Focused tests

Najbardziej wartościowe testy 011:

- burial pressure nie wymaga fake `NeedId`,
- same-household eligible corpse produces candidate; unrelated/no-context NPC does not,
- two claimants → exactly one successful claim,
- claim survives/revalidates save/load bez duplicate consequence,
- stale claim po reconstruction jest odzyskiwany deterministycznie,
- corpse disappears before execution → plan obsolete/cancel, no stuck action,
- repeated burial finalization → one terminal corpse + one grave,
- grave stable ID / save round-trip,
- WorldBundle rebuild → no duplicate grave,
- legacy dead terminal/no-corpse → no fabricated burial/grave.

Docs-only recon nie wymaga test/build i nie należy uruchamiać `pnpm docs:sync`.

## Kontrakty blokujące 011 do czasu implementacji 010

Plan 011 jest wystarczająco przygotowany architektonicznie, ale coding powinien zaczekać aż 010 odpowie kodem na:

1. final post-death state shape,
2. stable corpse identity,
3. active/buryable/terminal semantics,
4. acquire/release claim API/state,
5. natural cleanup vs claim ordering,
6. idempotent burial terminal transition,
7. stale claim recovery semantics.

To są zależności kontraktowe, nie powód do projektowania ich ponownie w 011.

## Non-goals

Nie rozszerzać 011 o full NPC persistence (już istnieje authoritative persistence), full off-screen NPC executor, grief/mourning/funeral, inheritance, household restructuring, global death/memory registry, legal ownership, player-only quest logic, nowe navigation/pathfinding ani drugi corpse lifecycle.
