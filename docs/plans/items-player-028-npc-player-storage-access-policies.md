# Plan: NPC player-storage access policies

**Created:** 2026-09-11
**Status:** `planned` 📋
**Priority:** high · **Effort:** M
**Depends on:** ~~items-player-027~~
**Domain:** `items-player`
**Type:** `feature`
**Subdomains:** `inventory` `items` `interaction`
**Tags:** `companions` `storage` `permissions` `npc-resources` `logistics`
**Roadmap:** `companions.md`
**Model:** Sonnet, Composer

## Goal

Dodać pierwszy, prosty i reusable poziom kontroli dostępu NPC do konkretnego player-owned storage.

Ten plan jest **etapem 1**. Ma ustanowić ownership policy, persistence, actor-level authorization i jeden authoritative transfer gate bez wdrażania jeszcze resource-specific/context-aware reguł.

Docelowy flow:

```text
normal NPC need / work / assignment
+ known and reachable player storage
+ actor-level storage permission
→ physical action
→ current-state permission revalidation
→ authoritative inventory transfer
```

Policy nie tworzy potrzeby, celu, pracy, assignmentu ani wiedzy o skrzyni. Odpowiada wyłącznie na pytanie, czy dany NPC może wykonać `withdraw` albo `deposit` na tym storage.

Etap 2 jest opisany w `items-player-032-npc-player-storage-resource-and-context-rules.md` i rozszerza foundation z tego planu o resource rules, context/authority, `assigned_only`, reserves, limits i temporary source grants.

## Recon decision: why two stages

Podział jest celowy i wynika z aktualnej architektury:

- `createPlacedContainers.ts` już posiada stable container identity i authoritative `Inventory`, więc actor-level policy można dodać bez zmiany modelu item ownership;
- `NpcAuthoritativeState.accompanyCommitment` jest authoritative źródłem aktualnego companion state — nie trzeba dodawać `isCompanion`;
- `WorkContracts.findActiveWorkByNpc(npcId)` jest authoritative źródłem aktywnego paid-work/hired state — nie trzeba dodawać `isHired`;
- istniejący `helperDeliveryHooks.ts` daje realnego pierwszego NPC-side consumer dla policy-aware deposit;
- atomic inventory transfer primitives już istnieją w `src/items/inventoryTransfer.ts`;
- resource classification, assignment authority, expedition provisioning, reserves i per-resource limits są niezależną warstwą z dodatkowymi consumerami i lifecycle semantics.

Etap 1 ma więc stworzyć stabilny seam, który etap 2 rozszerzy zamiast zastępować.

## Core invariants

```text
item ownership
!= storage access permission
!= NPC relationship / role
!= knowledge / reachability
!= NPC need / goal / decision
!= assignment / work authority
!= resource reservation
!= item transfer
```

Nie tworzyć:

- `CompanionStorageManager`,
- `NpcPlayerInventory`,
- globalnego `PlayerWarehouse`,
- companion-specific inventory/economy,
- duplicated NPC role flags tylko dla storage,
- drugiego item ledger.

## Existing mechanisms to reuse

### Player container ownership

`src/world/createPlacedContainers.ts` pozostaje authoritative ownerem contents i physical container lifecycle.

Policy należy do tej samej physical container identity co contents:

```text
PlacedContainerRecord
  ├─ id
  ├─ contents
  └─ accessPolicy
```

Policy musi przeżyć:

```text
placed
→ picked up
→ carried by player
→ placed again
→ WorldBundle rebuild
→ save/load
```

NPC nie może korzystać ze storage, gdy container jest aktualnie niesiony przez gracza. Policy nadal podąża z container identity.

### Inventory transfer

Reuse:

- `src/items/Inventory.ts`,
- `src/items/inventoryTransfer.ts::{transferInventoryCount, transferInventoryInstance}`,
- istniejące freshness/instance/capacity semantics.

Player-side container UI/actions mogą nadal używać niższego `PlacedContainers` API. NPC-side access ma przechodzić przez jeden policy-aware gate.

### Existing NPC identity/state

Nie utrwalać derived group membership w policy.

`companions` rozstrzygać z authoritative NPC state, przede wszystkim aktywnego `NpcAuthoritativeState.accompanyCommitment`.

`hired` rozstrzygać z authoritative Work Contract state przez `WorkContracts.findActiveWorkByNpc(npcId)` lub równoważny narrow resolver oparty na tym samym źródle prawdy.

Membership jest oceniane **w chwili query i ponownie przy commit**, nie snapshotowane do storage policy.

## Stage 1 actor policy

Policy ma dwa niezależne kanały operacji:

```ts
type StorageAccessEffect = 'allow' | 'deny'

type StorageActorPolicy = {
  default: StorageAccessEffect
  companions?: StorageAccessEffect
  hired?: StorageAccessEffect
  npcs?: Partial<Record<NpcId, StorageAccessEffect>>
}

type PlayerStorageAccessPolicy = {
  withdraw: StorageActorPolicy
  deposit: StorageActorPolicy
}
```

Dokładny persisted shape może zostać lekko dostosowany do istniejących save/runtime types, ale semantics i precedence mają pozostać takie same.

### Restrictive default

Nowy storage i old save bez policy zaczynają od:

```text
withdraw.default = deny
deposit.default = deny
```

Nie otwierać automatycznie istniejących skrzyń NPC po migracji.

### Precedence

Ocena jednej operacji:

```text
1. explicit NPC rule
2. matching group rules
3. default
```

Jeżeli NPC pasuje do wielu grup i brak explicit NPC override:

```text
any matching deny → deny
otherwise any matching allow → allow
otherwise default
```

Przykład:

```text
withdraw:
  default: deny
  companions: allow
  hired: allow
  npc-47: deny
```

`npc-47` pozostaje denied nawet jeśli aktualnie jest companionem albo hired.

### Dynamic groups are selectors, not grants

`companions: allow` znaczy:

> każdy NPC, który **teraz** spełnia canonical companion predicate, może wykonać operację.

Nie tworzyć przy tym persistent grant entry per NPC.

Analogicznie `hired: allow` nie kopiuje Work Contract assignment do policy.

Zakończenie commitmentu/kontraktu może więc natychmiast zmienić wynik policy przy następnym commit.

### Explicit NPC override

`npcs[npcId]` jest manualną, storage-owned regułą gracza.

Ma być stable przez unload NPC, save/load i śmierć/brak runtime agenta. Missing/dead NPC ID jest harmless.

Etap 1 nie przechowuje source identity dla takiej reguły. Temporary/source grants należą do etapu 2.

## Separate withdraw and deposit

`withdraw` i `deposit` są niezależne.

Przykład:

```text
withdraw:
  default: deny
  companions: allow

deposit:
  default: deny
  hired: allow
```

NPC może więc np. odkładać materiały do skrzyni, ale nie pobierać jej zawartości.

Stage 1 policy nie rozróżnia rodzaju itemu: jeżeli operacja jest allowed dla aktora, permission dotyczy dowolnego resource, który konkretny caller/action rzeczywiście próbuje transferować.

To **nie oznacza**, że NPC zaczyna autonomicznie wybierać dowolne przedmioty. Existing decision/action system nadal musi dostarczyć realny powód i konkretny transfer request.

## Policy-aware storage seam

Dodać mały reusable domain/application seam nad `PlacedContainers`, np. w `src/world/playerStorageAccess.ts`.

Preferowane responsibilities:

```ts
evaluateStorageAccess(...)
tryWithdraw(...)
tryWithdrawInstance(...)
tryDeposit(...)
tryDepositInstance(...)
```

Stage 1 request potrzebuje co najmniej:

- container id,
- actor `NpcId`,
- operation,
- concrete item kind albo instance,
- source/destination `Inventory` dla realnego transferu,
- current time tam, gdzie wymaga tego freshness.

Policy seam ma:

1. resolve current placed container;
2. resolve current policy;
3. resolve current companion/hired membership;
4. evaluate actor rule precedence;
5. validate current source/destination capacity/availability;
6. wykonać authoritative transfer przez istniejące inventory primitives;
7. zwrócić semantic result/failure.

Nie przenosić NPC logistics/decision logic do tego modułu.

## Query vs commit

Read-only evaluation jest advisory.

```text
planning: actor ma access
→ NPC idzie do skrzyni
→ player zmienia policy albo kończy się contract
→ commit re-resolves current state
→ allow / deny według stanu teraz
```

Nie grandfatherować permission z momentu planowania.

Minimum current-state revalidation:

- container nadal jest placed;
- actor nadal istnieje semantycznie jako `NpcId`;
- dynamic group membership nadal pasuje;
- current policy nadal pozwala;
- source resource nadal istnieje;
- destination nadal może przyjąć transfer.

## Atomic transfer safety

Nie może istnieć path:

```text
remove from chest
→ destination add fails
→ item disappears
```

Count i instance transfer mają reuse `transferInventoryCount` / `transferInventoryInstance` tam, gdzie source i destination są realnymi `Inventory`.

Raw `PlacedContainers.withdraw*`/`deposit*` pozostają lower-level container operations dla istniejących player-owned flows, ale NPC-side callers objęci policy nie mogą ich omijać.

## Existing helper delivery migration

`src/world/helperDeliveryHooks.ts` jest pierwszym realnym consumerem etapu 1.

Obecny `deposit(containerId, kind, amount, ...)` nie zna actor identity i deleguje bezpośrednio do `PlacedContainers.deposit()`.

Zmienić ten path tak, aby finalny deposit:

- znał `npcId` wykonującego delivery;
- przeszedł przez wspólną actor-level deposit policy;
- nadal wykonywał physical travel;
- nadal rewalidował capacity przy commit;
- nadal pozwalał na partial acceptance tam, gdzie obecny logistics flow tego wymaga;
- pozostawiał nieprzyjęty cargo przy NPC;
- nie dawał automatycznie withdraw access tylko dlatego, że istnieje helper assignment.

Helper assignment sam w sobie nie jest nową persistent storage group w V1. Gracz może użyć explicit NPC override albo istniejącej grupy, jeżeli NPC ją spełnia.

## Player UI

Rozszerzyć istniejący `ContainerScreen`/container action flow zamiast tworzyć osobny companion/storage management screen.

Minimalny UI etapu 1 ma pozwalać edytować dla aktualnej skrzyni:

- `withdraw.default`,
- `withdraw.companions`,
- `withdraw.hired`,
- `deposit.default`,
- `deposit.companions`,
- `deposit.hired`,
- explicit per-NPC override dla obu operacji.

Nie tworzyć rule buildera.

UI nie powinien mutować policy object bezpośrednio. Użyć focused application action, która waliduje patch i zapisuje go na authoritative container state.

Jeżeli lista NPC jest potrzebna do explicit override, reuse istniejące NPC/villager presentation/identity data zamiast tworzyć drugi registry tylko dla tego ekranu.

## Persistence

Rozszerzyć cały istniejący container lifecycle, nie osobny top-level save registry.

Expected shapes do zweryfikowania i aktualizacji:

- `PlacedContainerRecord`,
- `SaveCarriedContainer`,
- `PlacedContainerEntry`,
- runtime `CarriedContainer`,
- `spawn()`,
- `place()`,
- `pickUp()`,
- `putDownCarried()`,
- `adoptCarried()`,
- `toRecord()`,
- `carriedNode()`,
- mirror/validation w `src/persistence/saveData.ts`.

Missing policy w old save → restrictive Stage 1 default.

## Failure semantics

Minimum semantic outcomes:

```text
allowed
unauthorized_actor
container_missing
container_not_world_accessible
resource_unavailable
destination_capacity
```

Nie trzeba teraz projektować pełnego enumu etapu 2.

## Scope

### Included

1. Persistent policy owned by each player container.
2. Separate `withdraw` / `deposit` actor policy.
3. `default: allow | deny`.
4. Dynamic `companions` selector.
5. Dynamic `hired` selector.
6. Explicit per-`NpcId` manual override.
7. Deterministic precedence and deny-safe overlap semantics.
8. Restrictive old-save/new-container defaults.
9. Policy survival across placed → carried → placed and WorldBundle rebuild.
10. Policy-aware advisory evaluation and authoritative commit seam.
11. Count and instance transfer through existing Inventory ownership primitives.
12. Current-state revalidation / TOCTOU safety.
13. Migration of existing helper delivery deposit through the policy gate.
14. Minimal ContainerScreen configuration UI.
15. Automated tests and diagnostics.

### Deferred to `items-player-032`

- resource/category-specific rules;
- `forbidden / allowed / assigned_only` resource modes;
- `StorageAccessPurpose` and assignment/work/expedition authority;
- minimum reserve floors;
- max-per-withdrawal;
- temporary/source-based grants;
- grant lifecycle tied to contract/expedition source ids;
- food/water autonomous acquisition integration;
- weapons/tools/work-material specialized rules;
- expedition provisioning integration;
- category/item policy UI.

### Non-goals

- companion inventory/economy;
- new NPC decision engine;
- party inventory;
- global warehouse;
- automatic access from friendship/reputation/proximity/settlement membership;
- storage access while carried by player;
- global scan of all player storage;
- item use/equip/consume redesign;
- settlement/household storage permission redesign;
- reservation system;
- time/day quotas;
- rule scripting.

## Implementation order

1. Define Stage 1 policy types, restrictive defaults and pure actor-policy evaluator.
2. Add policy to the complete placed/carried container lifecycle and persistence.
3. Add canonical companion/hired resolver inputs without duplicating state.
4. Add policy-aware advisory/commit seam using existing atomic inventory transfers.
5. Migrate helper delivery deposit to the policy-aware path.
6. Add focused ContainerScreen/application-action editing.
7. Add tests for precedence, dynamic membership revalidation, persistence and transfer safety.
8. Add JSDoc to important public/architectural functions and types; use `@domain items-player` where useful for preflight discovery.

## Verification

### Automated

Verify at least:

- missing/legacy policy restores deny/deny defaults;
- policy survives placed → carried → placed;
- policy survives serialization/restore and WorldBundle carried-state path;
- explicit NPC rule overrides group rules;
- conflicting matching groups resolve to deny;
- no group match falls back to default;
- ending accompany commitment between evaluation and commit revokes companion-derived permission;
- ending paid work between evaluation and commit revokes hired-derived permission;
- deposit permission does not imply withdraw permission;
- failed destination capacity leaves source unchanged;
- instance transfer preserves instance identity/state;
- carried container is unavailable to NPC while retaining its policy;
- helper delivery cannot bypass deposit policy;
- player-side normal chest transfers remain unchanged.

### Manual browser verification — User

AI does not perform browser verification.

User should verify at least:

1. A chest starts denied for NPC access.
2. Enabling `companions` allows an active companion and stopping accompaniment removes that access.
3. Enabling `hired` allows an active paid worker and ending the contract removes that access.
4. A specific NPC `deny` overrides a group `allow`.
5. Withdraw and deposit can be configured independently.
6. Policy survives picking the chest up, putting it down and save/load.
7. Existing player chest UI/transfers still behave normally.
8. Helper delivery respects the configured deposit permission.

## Completion criteria

Plan is complete when one physical player-owned container carries a persistent Stage 1 policy such as:

```text
withdraw:
  default: deny
  companions: allow
  hired: allow

deposit:
  default: deny
  hired: allow
```

and every NPC-side transfer covered by this plan is decided at commit time through one shared authoritative permission gate, without duplicated companion/hired state or a parallel inventory system.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
