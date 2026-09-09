# Plan: NPC Burial & Graves

**Created:** 2026-09-01
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** L
**Depends on:** ~~npc-010~~, ~~world-terrain-016~~
**Domain:** `npc`
**Subdomains:** `lifecycle` `behavior` `relationships`
**Tags:** `burial` `corpse` `grave` `cemetery`
**Roadmap:** `npc-professions-households-and-age`

## Cel

Dodać społeczną reakcję NPC na śmierć oraz pochówek zakończony trwałym grobem, **rozszerzając istniejący persisted corpse lifecycle z `npc-010`** i używając istniejącego settlement → cemetery assignment z `world-terrain-016`.

Nie powstaje drugi corpse registry, burial manager, movement FSM, relationship store ani off-screen NPC executor.

Docelowy flow:

```text
NpcAuthoritativeState.postDeath (active corpse)
  → local burial pressure
  → persistent burial plan
  → acquire corpse burial claim
  → ordinary NpcAgent action/navigation
  → reserve grave identity + cemetery slot
  → idempotent burial finalization
  → postDeath terminal(reason='buried') + persistent grave
```

## Aktualny punkt wyjścia

`npc-010` jest już zaimplementowany.

- `src/settlement/npcState.ts`
  - `NpcAuthoritativeState.postDeath: NpcPostDeathState | null` jest authoritative ownerem stanu po śmierci.
  - `NpcStateSnapshot.postDeath` round-tripuje przez `NpcStateRegistry.serialize()` i `SaveData.npcStates`.
  - `personalInventory` również należy do `NpcAuthoritativeState`; transient `NpcAgent.carried` pozostaje osobnym work/logistics cargo.
- `src/settlement/npcPostDeath.ts`
  - `NpcPostDeathStatus = 'active' | 'claimed' | 'terminal'`.
  - corpse identity jest dziś identity zmarłego (`NpcId` / jego `postDeath` record); nie istnieje drugi corpse id.
  - `commitNpcDeath()` zapisuje death transform/time i jednokrotnie przenosi loadout loot z `personalInventory` do `postDeath.loot`.
  - `claimNpcCorpseForBurial()` robi `active → claimed`; `releaseNpcCorpseBurialClaim()` robi `claimed → active`.
  - `npcCorpseReadyToRemove()` zwraca true tylko dla `active`, więc `claimed` już blokuje naturalny cleanup.
  - `finalizeExpiredNpcCorpse()` najpierw wypuszcza pozostały corpse loot jako world drops, potem ustawia `terminal/decay`.
  - `markNpcPostDeathTerminal(..., 'buried')` już wspiera terminal reason pochówku.
- `src/settlement/createSettlement.ts`
  - przed materializacją NPC wykonywane jest `finalizeExpiredNpcCorpse(...)`, następnie `shouldSkipNpcCorpsePresentation(...)`.
  - terminal lub naturalnie wygasły corpse nie dostaje ponownie `NpcAgent`/mesh przy reconstruction.

`npc-011` musi dopasować się do tego kontraktu zamiast projektować hipotetyczne API.

## Zakres

### 1. Burial claim — rozszerzenie istniejącego handoff

Obecny `claimed` jest właściwym seamem, ale sam boolean-status nie mówi **kto** posiada claim. Rozszerzyć `NpcPostDeathState` minimalnie o persisted claimant identity, np. `burialClaimantNpcId: NpcId | null` albo równoważne pole.

Wymagana semantyka istniejących helperów po rozszerzeniu:

```text
claim(active, claimantNpcId)
  → claimed + claimantNpcId

claim(claimed, same claimant)
  → idempotent success

claim(claimed, different claimant)
  → false

release(claimed, same claimant)
  → active + no claimant

release by non-owner
  → false
```

Nie tworzyć osobnego claim registry. Claim pozostaje częścią `NpcAuthoritativeState.postDeath` i przez to automatycznie podlega obecnej persistence/rebuild ścieżce.

### 2. Decay / cleanup ordering

Zachować istniejący invariant: naturalny decay finalizuje wyłącznie `active` corpse. `claimed` blokuje `npcCorpseReadyToRemove()` / `finalizeExpiredNpcCorpse()`.

Przy próbie burial zawsze najpierw rewalidować authoritative record:

- `postDeath != null`,
- `status === 'claimed'`,
- claimant zgadza się z wykonawcą,
- cleanupReason nadal `null`,
- corpse nie został wcześniej terminalnie rozstrzygnięty.

Release/cancel claimu przywraca `active`; jeżeli corpse jest już starszy niż `NPC_CORPSE_REMOVE_DAYS`, istniejący cleanup może wtedy przy najbliższej materializacji/tick seam rozstrzygnąć decay. Nie dodawać drugiego corpse timeru.

### 3. Corpse identity, materialization i reconstruction

Stable identity dla burial to `NpcId` zmarłego + jego authoritative `postDeath`. Nie dodawać corpse entity registry ani losowego corpse id, dopóki kod nie potrzebuje wielu śmierci tego samego `NpcId` (obecny model tego nie wspiera).

Corpse transform (`x/z/yaw`) i `deathAtDays` są czytane z `postDeath`, nie z mesh.

`createSettlement.ts` już:

1. pobiera persisted NPC state z `NpcStateRegistry`,
2. lazy-finalizuje expired active corpse,
3. pomija terminal corpse,
4. materializuje active/claimed corpse przez normalnego `NpcAgent`.

Burial nie może zmieniać tej reconstruction boundary.

### 4. Personal inventory i corpse inventory

Ownership pozostaje rozdzielony:

```text
NpcAuthoritativeState.personalInventory
  → trwałe osobiste belongings NPC

NpcPostDeathState.loot
  → snapshot corpse loot wyjęty przez commitNpcDeath()

NpcAgent.carried
  → transient work/logistics cargo, poza corpse loot
```

Burial nie może ponownie snapshotować `personalInventory` ani kopiować `carried` do corpse.

Przy successful burial trzeba jawnie rozstrzygnąć pozostałe `postDeath.loot`. Preferowana semantyka v1: **pochówek zamyka corpse razem z pozostałą zawartością** (nie dropować jej na ziemię jak przy natural decay). To odróżnia burial od `finalizeExpiredNpcCorpse()` i zapobiega powstaniu loot pile po pogrzebie. Jeżeli późniejszy plan doda ekshumację, grave inventory będzie osobnym świadomym rozszerzeniem.

### 5. Burial jako pressure/problem, nie `NeedId`

Aktualny top-level wybór ma dwa poziomy:

- `NpcAgent` produkuje/scoruje pressure targety (`NeedId`, weather, healing),
- `src/ai/npcDecision.ts` (`decideNpcAction`) rozstrzyga outer sequencing razem z vigor/schedule/idle.

Burial jest social/world problem. Dodać go jako kolejny pressure/decision target w tej **samej** ścieżce, bez fake `NeedId` i bez burial-only schedulera.

`src/ai/npcPlan.ts` nadal ma need-centric `NpcGoalId`/`NpcStrategyId`. Rozszerzyć persisted `NpcPlan` minimalnie o burial goal/context tak, aby plan mógł przechowywać stable deceased `NpcId` bez przepychania burial przez `goalForNeed()` / `needForGoal()`.

Nie robić przy okazji pełnego generic Goal/Problem frameworka.

### 6. Eligibility / social responsibility

Burial candidate ma być lokalny dla settlementu. Preferowana kolejność odpowiedzialności:

1. żywy członek tego samego household/family,
2. istniejąca silna NPC↔NPC relationship / rola społeczna,
3. fallback lokalnego wykonawcy tylko jeśli system decyzji ma rzeczywisty powód.

Korzystać z istniejących `Household`/family mappings oraz `NpcRelationships`; nie tworzyć persisted `knowsNpcIsDead` ani nowego relationship store.

Eligibility jest re-derivable z persisted corpse + household/relationship state.

### 7. Cemetery assignment i miejsce grobu

Nie szukać „najbliższego cmentarza”. Użyć kanonicznego assignment z `world-terrain-016`:

- `ChunkManager.resolveCemeteryForSettlement(settlementId)` — publiczny runtime lookup,
- underlying `resolveCemeteryTopologyForSettlement()` / `ResolvedCemeteryPlacement`,
- `servedSettlementIdsForCemeteryId()` — reverse lookup shared cemetery → settlements.

`ResolvedCemeteryPlacement` daje stable `id`, `assignmentId`, `servedSettlementIds`, `x/z`, `rotationY`, `size`.

Grave record powinien zapisać `cemeteryId` (oraz settlement/deceased identity), a nie ponownie wyprowadzać ownera z nearest-settlement heuristics.

Slot/offset grobu w obrębie cemetery powinien być deterministyczny z `graveId`/`deceasedNpcId` + cemetery placement, z walidacją footprintu. Nie modyfikować proceduralnego cemetery assignment po fakcie i nie tworzyć osobnego cemetery registry.

### 8. Persistent grave world object

Grave jest world-owned completed consequence, nie polem NPC poza reference w finalization.

Dodać mały record, np.:

```ts
type GraveRecord = {
  id: string
  deceasedNpcId: NpcId
  settlementId: string
  cemeteryId: string
  x: number
  z: number
  yaw: number
  buriedAtDays: number
}
```

Wzorzec implementacyjny: plain authoritative record + runtime projection + `nodes()`/`find()`/idempotent `ensure()` + `dispose()`, analogicznie do `createResidentialBuildings.ts` i innych world collections w `WorldBundle`.

Grave ID musi być deterministic/stable dla jednego deceased burial, np. `grave:${deceasedNpcId}`. `ensure()` po tym id zwraca istniejący record zamiast tworzyć duplikat.

Thread przez:

```text
WorldBundle.graves
→ createWorldBundle(initialSave.graves)
→ rebuildWorldBundle(carried graves)
→ buildSaveData() / SaveData.graves
```

Dodanie pola wymaga aktualnego `CURRENT_SAVE_VERSION` bump + nowej `SAVE_MIGRATIONS` entry + `isSaveData()`/fixtures/tests. Nie hardcodować numeru wersji z planu — sprawdzić go przy implementacji.

### 9. Atomic / idempotent corpse → grave finalization

Wymagany invariant:

```text
one deceased NpcId
→ at most one burial claim owner
→ at most one successful burial finalization
→ exactly one persistent grave for successful burial
```

Nie wykonywać finalizacji jako luźnego „terminal corpse, potem losowo create grave”.

Zaprojektować jeden wąski orchestration helper (w burial/grave domain, nie manager), który przy jednym wywołaniu:

1. rewaliduje claimed corpse + claimant,
2. wylicza deterministic grave id i cemetery slot,
3. `ensureGrave(graveRecord)` — idempotentnie zapewnia world result,
4. terminalizuje **ten sam** `postDeath` przez istniejący `markNpcPostDeathTerminal(postDeath, 'buried')`,
5. czyści claim metadata i corpse loot zgodnie z burial semantics,
6. przy retry rozpoznaje już istniejący grave/terminal-buried state jako sukces/no-op.

Ponieważ `NpcStateRegistry` i graves collection są dwoma in-memory ownerami zapisywanymi razem przez `buildSaveData()`, helper ma gwarantować convergent state przy repeated call/reconstruction. Testy muszą obejmować retry na każdej granicy. Nie wprowadzać transakcyjnego subsystemu tylko dla burial.

### 10. Action / navigation lifecycle

Burial używa istniejącego `NpcAgent` action lifecycle i normalnego movement/pathfinding:

```text
pressure wins
→ ensure burial plan
→ claim corpse
→ goTo corpse
→ execute pickup/prepare interaction
→ goTo assigned cemetery grave slot
→ execute timed burial
→ finalize burial
→ complete plan
```

Nie dodawać burial-specific movement FSM. `phase`, `pendingAction`, pathfinding i execution timers pozostają transient.

Po reconstruction plan/claim są rewalidowane, ale movement zaczyna się od nowa z authoritative state.

### 11. Settlement streaming / off-screen

`SettlementsManager` utrzymuje authoritative `NpcStateRegistry` poza konkretnym `Settlement`, ale pełne `NpcAgent.update()` wykonuje się dla loaded settlements.

`npc-011` nie dodaje off-screen walking/action executora.

Wymagane zachowanie:

- corpse/claim state przeżywa stream-out,
- grave przeżywa stream-out,
- loaded executor po powrocie rewaliduje claim/plan,
- stale claim może zostać deterministycznie odzyskany przez tego samego claimant-a, jeśli jego persisted burial plan nadal wskazuje ten deceased; w przeciwnym razie claim jest release'owany przed nową arbitrażową próbą,
- natural decay pozostaje lazy/world-time-driven przez istniejące `postDeath.deathAtDays`.

### 12. Debug

Rozszerzyć istniejący NPC trace/debug, nie tworzyć osobnego frameworka. Widoczne minimum:

- deceased `NpcId`, corpse status/phase/cleanupReason,
- claimant `NpcId`,
- burial eligibility/pressure winner,
- burial plan target,
- assigned cemetery/grave id,
- finalization result / cancellation reason.

## Ownership

```text
HealthState.dead
  → alive/dead truth

NpcAuthoritativeState.postDeath
  → corpse transform/time/status/loot/cleanup + burial claim

NpcStateRegistry / SaveData.npcStates
  → persistence post-death + burial plan

Household + NpcRelationships
  → social eligibility inputs

NpcAgent + npcDecision + NpcPlan + normal action lifecycle
  → loaded-settlement choice and execution

world-terrain cemetery assignment
  → settlement → cemetery truth

Graves collection / WorldBundle / SaveData.graves
  → completed persistent burial result
```

## Verification

Focused automated verification podczas implementacji:

- claim ownership: same claimant retry succeeds; second claimant fails; non-owner release fails,
- claimed corpse nie natural-decayuje; release po expiry pozwala istniejącemu cleanupowi zakończyć corpse,
- `commitNpcDeath()` nadal jest one-shot i nie mintuje loot po reconstruction,
- burial nie kopiuje `personalInventory`/`carried` do corpse,
- burial pressure nie używa `NeedId`,
- same-household/socially relevant NPC może dostać candidate; unrelated NPC nie dostaje globalnej wiedzy,
- canonical `resolveCemeteryForSettlement()` jest używany także dla shared cemetery,
- repeated finalization daje jeden terminal `buried` corpse + jeden grave,
- terminal buried corpse nie materializuje się po settlement reload,
- grave round-tripuje przez save/load i `WorldBundle` rebuild,
- stale claim po reconstruction ma deterministyczną recovery rule,
- legacy terminal corpse nie fabrykuje grave.

Docs-only recon nie wymaga browser verification, test/build ani `pnpm docs:sync`.

## Poza zakresem

- drugi corpse registry / corpse manager,
- osobny burial scheduler/scoring engine,
- burial-specific movement/pathfinding FSM,
- pełny off-screen NPC executor,
- grief/mourning/funeral ceremony,
- inheritance / household restructuring,
- nowy relationship store,
- player-only burial quest,
- global death knowledge registry,
- reputation/legal consequences,
- ekshumacja i grave inventory.

## Powiązane plany

- **npc-010 — NPC Death & Corpse Lifecycle** — implemented dependency; corpse lifecycle/loot/claim seam.
- **world-terrain-016 — Settlement Cemeteries & Abandoned Graveyards** — implemented code seam; canonical cemetery assignment/placement.
- **npc-026 — NPC Grave Visits** — downstream consumer of persistent graves.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
