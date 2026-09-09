# NPC Burial & Graves — Implementation Notes

**Plan:** `npc-011-npc-burial-and-graves.md`  
**Recon:** 2026-09-09, current `main` (`ab454a54` baseline)

## Najważniejsza zmiana od poprzedniego reconu

`npc-010` nie jest już hipotetycznym dependency contractem. Corpse lifecycle działa w kodzie i `npc-011` powinien go rozszerzyć w jednym miejscu.

### Authoritative post-death ownership

`src/settlement/npcState.ts`

```text
NpcAuthoritativeState
  health
  personalInventory
  activePlan
  postDeath: NpcPostDeathState | null
```

`NpcStateSnapshot.postDeath` jest serializowany przez `NpcStateRegistry.serialize()` i trafia do `SaveData.npcStates`. Registry żyje na `SettlementsManager`, więc ten stan przeżywa disposal/recreate `NpcAgent`, settlement stream-out/in, `WorldBundle` rebuild i pełny save/load.

Nie dodawać corpse state do `Settlement`, `NpcAgent`, `WorldBundle` ani osobnego registry.

## Rzeczywisty corpse contract

`src/settlement/npcPostDeath.ts` jest głównym seamem.

### Typy

- `NpcPostDeathStatus = 'active' | 'claimed' | 'terminal'`
- `NpcCorpseCleanupReason = 'buried' | 'decay' | 'legacy'`
- `NpcPostDeathState` owns:
  - `status`
  - death `x/z/yaw`
  - `deathAtDays`
  - `loot`
  - `cleanupReason`

Nie istnieje osobny `corpseId`. Obecna stable identity to deceased `NpcId` + jego `postDeath` record.

### Alive → dead

`commitNpcDeath()` jest one-shot:

- nic nie robi, jeśli `postDeath` już istnieje,
- zapisuje transform i absolute world-day anchor,
- `extractNpcLoadoutLoot()` przenosi actual loadout belongings z `personalInventory` do `postDeath.loot`.

To chroni reconstruction / `die(true)` przed ponownym mintowaniem loot i death transform.

### Loot ownership

Nie mylić trzech kontenerów:

```text
NpcAuthoritativeState.personalInventory
  persisted personal belongings

NpcPostDeathState.loot
  persisted corpse loot snapshot

NpcAgent.carried
  transient work/logistics cargo
```

`npc-011` nie powinien ponownie snapshotować inventory przy burial.

Natural decay używa `dropNpcCorpseLoot()` i wypuszcza pozostały corpse loot jako world drops przed `terminal/decay`.

Dla burial plan powinien świadomie przyjąć inną semantykę: pozostały corpse loot zostaje pochowany/wyczyszczony bez world drop. To zapobiega „loot explosion” dokładnie w chwili pogrzebu i nie tworzy jeszcze grave inventory/ekshumacji.

## Claim / handoff — co już jest i czego brakuje

Obecne API:

- `claimNpcCorpseForBurial(postDeath)` — tylko `active → claimed`,
- `releaseNpcCorpseBurialClaim(postDeath)` — tylko `claimed → active`.

Ważne: `npcCorpseReadyToRemove()` zwraca true **wyłącznie dla `active`**, więc status `claimed` już blokuje `finalizeExpiredNpcCorpse()` i natural cleanup.

Brakujący element dla realnej koordynacji to claimant identity. Minimalna zmiana 011 powinna rozszerzyć **ten sam** `NpcPostDeathState`, np. o nullable `burialClaimantNpcId`.

Docelowa semantyka helperów:

- claim active by A → claimed/A,
- claim claimed/A by A → true/no-op,
- claim claimed/A by B → false,
- release claimed/A by A → active/null,
- release by B → false,
- terminal state nigdy nie może być claimowany/release'owany.

Claim musi round-tripować przez `cloneNpcPostDeath()` i obecny `NpcStateSnapshot` path. Nie dodawać osobnego save field.

## Cleanup ordering i reconstruction

`src/settlement/createSettlement.ts` przed `NpcAgent.create()` robi aktualnie:

```text
npcStateRegistry.getOrCreate(npcId, ...)
→ if (postDeath) finalizeExpiredNpcCorpse(postDeath, nowDays, droppedItems)
→ if (shouldSkipNpcCorpsePresentation(...)) return null
→ NpcAgent.create(... npcState ...)
```

Konsekwencje dla 011:

- expired `active` corpse może stać się `terminal/decay` zanim dostanie mesh,
- `claimed` corpse nie jest usuwany przez ten lazy cleanup,
- `terminal` corpse nie jest materializowany,
- corpse transform ma być czytany z `postDeath`, nie z poprzedniego mesh.

Release starego claimu po reconstruction może natychmiast uczynić corpse eligible do istniejącego decay path, jeśli jego `deathAtDays` przekroczył `NPC_CORPSE_REMOVE_DAYS`. Nie potrzebujemy osobnego burial timeru.

## Stale claim po stream/reload

`NpcAgent` runtime execution nie jest persisted: `phase`, `pendingAction`, pathfinding i timery akcji znikają przy reconstruction. `activePlan` i claim mogą zostać.

Deterministyczna recovery rule dla v1:

1. jeśli claimant NPC nadal istnieje, żyje i jego persisted burial plan wskazuje ten sam deceased `NpcId`, claim pozostaje resumable;
2. inaczej claim jest release'owany;
3. po release corpse wraca do zwykłej arbitration/decay semantyki.

Nie stosować `Date.now()`, wall-clock leases ani transient `Set<corpseId>`.

## Decision / pressure / plan pipeline

### Top-level decision

`src/ai/npcDecision.ts`

- `NpcDecisionInput.wonNeed` dostaje winnera wcześniejszej pressure arbitration,
- `NpcDecisionKind` rozstrzyga potem vigor collapse / pressure winner / schedule / idle,
- aktualne pressure targets obejmują needs, weather (`seekShelter`) i healing.

Burial powinien wejść jako kolejny social/world pressure target do tej samej ścieżki. Nie robić burial scheduler ani fake `NeedId`.

### Persistent plan

`src/ai/npcPlan.ts` nadal jest need-centric:

- `NpcGoalId` ma tylko work/wood/food/water,
- `NpcPlan.strategy` to `NpcStrategyId`,
- `goalForNeed()` / `needForGoal()` zakładają mapping z `NeedId`.

Najmniejsza zmiana 011: rozszerzyć `NpcPlan`/goal union tak, by burial plan mógł przechować target `deceasedNpcId`, ale nie przechodził przez `goalForNeed()`/`needForGoal()`.

Nie przebudowywać całej AI na generic goal framework.

## Social eligibility

Reuse istniejących źródeł:

- family mapping już dostępny przy settlement construction,
- `Household` registry jest persistent/reconstructed,
- `NpcRelationships` jest osobnym persisted symmetric NPC↔NPC store.

Nie tworzyć `knowsNpcIsDead`, global death event busa ani burial relationship store.

Najbardziej naturalny v1 candidate order:

1. same household/family,
2. mocna istniejąca relacja/uzasadniona rola,
3. lokalny fallback tylko jeśli obecne scoring/availability daje uzasadnienie.

Awareness/eligibility może być re-derived z `postDeath` + social state.

## Action execution

Burial ma użyć zwykłego `NpcAgent` execution lifecycle.

Preferowana sekwencja:

```text
pressure/plan selected
→ acquire/revalidate claim
→ resolve corpse destination from postDeath.x/z
→ normal goTo
→ timed interaction przy corpse
→ resolve cemetery + grave slot
→ normal goTo
→ timed burial interaction
→ atomic/idempotent finalization
→ complete plan
```

Nie dodawać burial-specific FSM, movement loop ani pathfindingu.

Cancellation/obsolete/unreachable powinny iść przez istniejące action failure/replan seams. Przy cancellation release claim tylko jeśli caller jest jego persisted ownerem.

## Cemetery lookup — world-terrain-016 już istnieje w kodzie

Nie korzystać z nearest-landmark heuristics.

### Canonical topology

`src/terrain/cemeteryAssignment.ts`

- `resolveCemeteryTopologyForSettlement(settlementId, peekRef)` — deterministic dedicated/shared assignment,
- `cemeteryIdForAssignment()` — stable cemetery id,
- `servedSettlementIdsForCemeteryId()` — canonical reverse lookup.

### Resolved physical placement

`src/terrain/cemeteryPlacement.ts`

`ResolvedCemeteryPlacement` zawiera:

- `assignmentId`
- `servedSettlementIds`
- `size`
- `x/z`
- `rotationY`
- `variant`
- stable `id`

### Runtime public seam

`ChunkManager.resolveCemeteryForSettlement(settlementId)` jest właściwym entry pointem dla burial. `WorldLocationCatalog.cemeteryForSettlement()` już go używa.

Plan 011 powinien zapisywać `cemeteryId` na grave record. Shared cemetery jest poprawnym wynikiem i nie wolno zamieniać go na nearest settlement/cemetery logic.

## Grave placement wewnątrz cemetery

`world-terrain-016` wyznacza cemetery footprint/anchor, ale nie jest ownerem dynamicznych pochówków.

011 powinien wyznaczyć grave slot deterministycznie z:

```text
(cemetery placement, stable grave id / deceasedNpcId)
```

Slot musi mieścić się w cemetery footprint i być stabilny po reload. Nie zapisywać „nearest cemetery” ani kolejnego mutable slot registry, jeśli pozycję można deterministycznie wyliczyć i kolizje rozstrzygnąć przez istniejące graves collection.

Praktyczny v1: deterministic candidate sequence per `graveId`, wybór pierwszego wolnego slotu na podstawie persisted graves tego `cemeteryId`, a wybrany `x/z/yaw` zostaje potem zapisany w recordzie. Po zapisaniu pozycja jest authoritative i nie jest ponownie losowana.

## Persistent grave world-object pattern

Dobry obecny template: `src/world/createResidentialBuildings.ts`.

Wzorzec:

```text
plain authoritative Record
+ runtime Entry = Record + mesh
+ collection.list()/nodes()/find()
+ spawn(initial records)
+ dispose()
```

Dla graves potrzebne jest additionally idempotent `ensure(record)` zamiast player-style losowego `place()`.

Suggested files/seams:

- nowy wąski `src/world/grave.ts` — `GraveRecord` + deterministic id/slot helpers,
- nowy `src/world/createGraves.ts` — persistent collection + runtime grave visual,
- `src/app/worldBundle.ts` — `WorldBundle.graves`, creation/disposal/rebuild threading,
- `src/app/saveState.ts` — `buildSaveData()` assembly,
- `src/persistence/saveData.ts` — `SaveGrave`, `SaveData.graves`, version/migration/validation.

Nie używać `Date.now()` dla grave id. Naturalny stable id przy obecnym single-death-per-`NpcId` modelu: `grave:${deceasedNpcId}`.

## SaveData

Recon baseline ma `CURRENT_SAVE_VERSION = 20`, ale implementation agent powinien zawsze sprawdzić aktualny numer przed zmianą.

Dodanie `SaveData.graves` oraz claimant metadata zmienia persisted representation/semantics. Claimant metadata jest nested w `npcStates`; grave collection jest top-level.

Zgodnie z obecnym fail-closed pipeline:

- bump `CURRENT_SAVE_VERSION`,
- dodać `SAVE_MIGRATIONS[current-1]`,
- migration legacy corpse `claimed` bez claimant-a musi deterministycznie wrócić do bezpiecznego `active` (nie zgadywać ownera),
- dodać `graves: []` dla starszych save'ów,
- zaktualizować `isSaveData()` i fixtures/tests.

Legacy `terminal/legacy` dead NPC nie dostaje grave.

## Atomic/idempotent finalization

To najważniejszy seam 011.

Dwa authoritative owners:

```text
NpcAuthoritativeState.postDeath
Graves collection
```

Nie wystarczy zrobić dwóch niezależnych efektów bez retry semantics.

Recommended orchestration helper powinien przyjmować co najmniej:

```text
deceasedNpcId
claimantNpcId
settlementId
nowDays
NpcStateRegistry lookup/access
Graves collection
resolveCemeteryForSettlement
```

Semantyka:

1. resolve `postDeath` by deceased `NpcId`,
2. require `claimed` + matching claimant,
3. resolve canonical cemetery,
4. derive deterministic `graveId`,
5. `graves.ensure(...)` — existing same-id grave is success if identity matches,
6. terminalize `postDeath` with existing `markNpcPostDeathTerminal(postDeath, 'buried')`,
7. clear claimant metadata and corpse loot,
8. retry on already `terminal/buried` + matching grave returns successful no-op.

Jeżeli helper wykryje conflicting existing grave identity, fail closed/debug assert — nie twórz drugiego grobu.

Important ordering: ensure grave przed terminalization daje możliwość bezpiecznego retry bez stanu „buried corpse, no grave”. Temporary „grave exists + corpse still claimed” jest convergent: retry widzi ten sam deterministic grave i kończy terminalization. Save assembly jest synchronicznym snapshotem całego bundle/state, więc normalny completed helper kończy oba effects przed save.

## Settlement streaming

`SettlementsManager` ma persistent registries, ale `Settlement.update()` / `NpcAgent.update()` wykonuje loaded-agent behaviour.

011 nie implementuje off-screen walking.

Po stream-in:

- `createSettlement.ts` odtwarza corpse presentation z authoritative state,
- burial plan/claim są rewalidowane,
- movement/action timers zaczynają się od nowa,
- grave collection istnieje niezależnie od settlement mesh.

To zachowuje world continuity bez tworzenia równoległego off-screen executora.

## Testy o najwyższym ROI

### `npcPostDeath.test.ts`

- claimant ownership + idempotent same-owner claim,
- non-owner claim/release rejection,
- claimed blocks `finalizeExpiredNpcCorpse`,
- release expired claim pozwala decay,
- clone/snapshot preserves claimant,
- burial clears loot without invoking decay drop semantics.

### burial orchestration tests

- same finalization called twice → one grave + terminal/buried,
- grave ensured, then retry terminalizes corpse,
- terminal/buried + matching grave → success no-op,
- conflicting grave id/data → fail closed,
- corpse terminal/decay cannot be buried,
- stale claimant cannot finalize.

### cemetery integration

- dedicated cemetery lookup,
- shared cemetery lookup returns same cemetery id for both settlements,
- grave record persists `cemeteryId`, not nearest-settlement inference.

### persistence/rebuild

- claim owner round-trip,
- stale legacy claimed-without-owner migration is safe,
- graves save/load round-trip,
- `WorldBundle` rebuild does not duplicate grave,
- terminal buried corpse is not rematerialized by `createSettlement`.

## Guardrails

Nie tworzyć:

- `NpcCorpseManager`,
- corpse-only save path,
- burial lock/claim registry,
- burial movement FSM,
- burial scheduler,
- nowego relationship/memory store,
- off-screen NPC executor,
- cemetery assignment duplicate,
- random grave ids on retry.

Nie cofać obecnego `npc-010` lifecycle. Extend existing `NpcPostDeathState` + helper functions i utrzymać obecny lazy cleanup/materialization ordering.

Docs-only recon: bez browser verification, bez `pnpm docs:sync`.
