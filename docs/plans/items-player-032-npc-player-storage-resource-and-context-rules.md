# Plan: NPC player-storage resource and context rules

**Created:** 2026-09-14
**Status:** `planned` 📋
**Priority:** medium · **Effort:** L
**Depends on:** items-player-028
**Domain:** `items-player`
**Type:** `feature`
**Subdomains:** `inventory` `items` `interaction`
**Tags:** `storage` `permissions` `npc-resources` `logistics` `provisioning`
**Roadmap:** `companions.md`
**Model:** Sonnet, Composer

## Goal

Rozszerzyć actor-level player-storage access z `items-player-028` o **resource- i context-aware rules**, bez zmiany podstawowego ownership storage ani tworzenia równoległego inventory/logistics systemu.

Etap 1 odpowiada:

> czy ten NPC może wykonać `withdraw` albo `deposit` na tej skrzyni?

Etap 2 dodaje kolejne pytania:

> czy może wykonać tę operację na tym konkretnym resource i w tym konkretnym celu/authority context?

Docelowy flow:

```text
actor-level permission from items-player-028
+ resource rule
+ optional assignment/work/expedition authority
+ reserve / operation limit
→ current-state revalidation
→ authoritative transfer
```

## Dependency contract from `items-player-028`

Ten plan zakłada istniejący foundation:

- policy owned by one physical player container;
- policy survives placed → carried → placed, rebuild i save/load;
- separate actor-level `withdraw` / `deposit` policies;
- `default`, `companions`, `hired`, explicit `NpcId` override;
- pure actor authorization precedence;
- current-state group revalidation;
- one NPC-facing policy-aware transfer seam;
- atomic count/instance transfer reuse;
- existing helper-delivery path routed through that seam;
- compact ContainerScreen policy editing.

Etap 2 ma **rozszerzyć ten sam seam i policy**, nie zastępować ich.

## Core invariants

```text
actor permission
!= resource permission
!= assignment/work authority
!= knowledge / reachability
!= resource claim / reservation
!= NPC need / decision
!= item ownership
!= item use/equip/consume
```

Policy może ograniczyć transfer, ale nie tworzy powodu do transferu.

Nie budować:

- `CompanionStorageManager`,
- `NpcPlayerInventory`,
- osobnego provisioning inventory,
- osobnej item taxonomy tylko dla storage,
- nowego assignment systemu,
- nowego reservation systemu bez konkretnego use case.

## Resource-aware policy

Stage 2 dodaje rules dla konkretnych zasobów i/lub canonical intrinsic item categories.

Koncepcyjnie:

```ts
type StorageAccessMode =
  | 'forbidden'
  | 'allowed'
  | 'assigned_only'

type StorageResourceRule = {
  withdraw?: StorageAccessMode
  deposit?: StorageAccessMode
  minimumReserve?: number
  maxPerWithdrawal?: number
}
```

Dokładny shape ma rozszerzać persisted Stage 1 policy additively.

### Rule fallback

Preferowany model:

```text
specific item rule
→ canonical category rule
→ operation-level actor permission from Stage 1
```

Resource rule nie może niejawnie autoryzować aktora, który został denied przez Stage 1 actor policy.

Actor-level deny pozostaje górnym gate.

### `forbidden`

Resource nie może być transferowany w tej operacji przez NPC.

### `allowed`

Resource może zostać transferowany, jeśli:

- actor-level gate pozwala;
- caller ma realny reason/action;
- source istnieje i jest reachable/known przez normalny system;
- destination ma capacity;
- reserve/limit pozwala;
- request nadal jest aktualny przy commit.

### `assigned_only`

Autonomiczny transfer jest zabroniony.

Transfer jest możliwy wyłącznie z validated structured authority context pochodzącym z istniejącego systemu pracy/assignment/provisioning.

Nie używać luźnego:

```ts
assigned: true
```

## Storage access purpose / authority

Wprowadzić mały discriminated request wyłącznie dla realnych consumerów.

Koncepcyjnie:

```ts
type StorageAccessPurpose =
  | { type: 'personal_need'; need: 'food' | 'water' }
  | { type: 'assigned_item'; authorityId: string; itemKind: ItemKind }
  | { type: 'work_material'; authorityId: string; workId: string; itemKind: ItemKind; requiredAmount: number }
  | { type: 'expedition_provisioning'; authorityId: string; assignmentId: string; memberNpcId: NpcId; itemKind: ItemKind; requiredAmount: number }
```

To jest przykład kontraktu, nie obowiązek implementacji wszystkich wariantów od razu. Finalny union ma zawierać tylko contexts wymagane przez wdrażanych consumerów.

Storage module nie powinien importować całych Work Contract / expedition / quest modeli i interpretować ich lifecycle.

Authority ma być:

- zweryfikowane przez owning system przez narrow validator; albo
- reprezentowane przez identifier, który owning system może sprawdzić przy commit.

## Resource classification

Nie tworzyć drugiej broad taxonomy niezależnej od item definitions.

Kategorie storage mają wynikać z canonical item metadata/capabilities.

Relevant existing sources obejmują m.in.:

- food / consumable metadata;
- `melee`, `ranged`, `defense` / canonical item categories;
- tool capabilities;
- container metadata;
- treatment/medicine metadata;
- ammo relationships z ranged configs.

Jeżeli istniejący codebase ma już canonical `itemCategories` helper, reuse go zamiast ponownie wyprowadzać kategorię w storage module.

### Context is not a category

Nie zapisywać np. `work_material` jako intrinsic item category.

Ten sam `wood` może być:

- materiałem budowlanym,
- paliwem,
- towarem,
- prywatnym zasobem.

`work_material` należy do `StorageAccessPurpose`, nie do item definition.

## Water and instance-backed resources

Nie modelować wody jako scalar `water`.

Filled bottle/bucket/waterskin pozostaje realnym item instance z własnym stanem liquid contents.

Access check i transfer muszą zachować:

- instance identity;
- current liquid contents;
- capacity;
- condition/maintenance state tam, gdzie dotyczy;
- normalne destination ownership semantics.

## Resource-specific reserves

`minimumReserve` oznacza ilość konkretnego fungible resource, która ma pozostać w storage po withdrawal.

Przykład:

```text
bread:
  withdraw: allowed
  minimumReserve: 5
```

Nie stosować jednego numeric reserve do heterogeneous category takiej jak całe `food`, chyba że canonical quantity semantics dla tej kategorii rzeczywiście istnieje.

Evaluation przy authoritative commit:

```text
availableToNpc = max(0, currentEligibleQuantity - minimumReserve)
```

Reserve nie jest resource reservation.

## Per-withdrawal limit

Policy może ograniczyć pojedynczą operację:

```ts
maxPerWithdrawal?: number
```

Kolejność:

```text
requested by action
→ destination capacity
→ policy maxPerWithdrawal
→ reserve-safe amount
→ authoritative transfer
```

Limit nie jest target quantity.

Nie dodawać per-day/weekly quotas ani replenishing allowance bez osobnego use case.

## Temporary/source-based grants

Stage 1 ma manual explicit NPC override oraz dynamic group selectors.

Stage 2 może dodać temporary grant entries tylko dla przypadków, w których konkretny owning system musi nadać access niezależnie od broad `companions`/`hired`.

Przykład:

```ts
type StorageAccessGrant = {
  npcId: NpcId
  source:
    | { type: 'manual' }
    | { type: 'work_contract'; id: string }
    | { type: 'expedition'; id: string }
}
```

Najważniejsza reguła:

```text
revoke one source
!= revoke all access for this NPC
```

Jeżeli ten sam NPC ma manual grant i expedition grant, zakończenie expedition usuwa tylko expedition source.

### Prefer derived authority where possible

Nie utrwalać temporary grant state tylko dlatego, że można.

Jeżeli active Work Contract/assignment sam w sobie jest wystarczającym authoritative źródłem i można go sprawdzić przy commit, preferować derived validation zamiast kopiowania lifecycle do storage policy.

Persisted source grants są uzasadnione tylko wtedy, gdy storage policy rzeczywiście musi pamiętać niezależną decyzję/grant gracza/systemu.

## Query vs commit

Rozszerzyć Stage 1 current-state revalidation.

Final commit ma sprawdzić ponownie:

1. container nadal exists/placed;
2. actor-level Stage 1 permission;
3. concrete resource / instance;
4. current resource rule;
5. current `StorageAccessPurpose`;
6. authority validity dla `assigned_only`;
7. reserve;
8. operation limit;
9. destination capacity;
10. semantic relevance requestu;
11. authoritative transfer.

Nie cache'ować pozytywnej decyzji z planning jako durable permission.

## NPC needs integration

Player storage ma stać się **jednym z możliwych source candidates** w istniejących strategy flows, nie globalnym shortcutem.

Przykład:

```text
NPC hungry
→ existing hunger strategy evaluation
→ personal inventory?
→ household/economy/other normal sources?
→ known reachable authorized player storage?
→ choose normal action
```

Nie dodawać:

```text
if (hasPlayerStorageAccess) fetchFood()
```

### Food

Withdrawal do `NpcAuthoritativeState.personalInventory` ma zachować freshness batches. Po transferze normalna food-use logic decyduje o konsumpcji.

### Water

NPC pobiera realny supported liquid-container instance. Normalny water-use flow decyduje, kiedy i jak z niego pić.

## Weapons and tools

`assigned_only` może ograniczyć weapon/tool withdrawal do realnego loadout/work/assignment context.

Storage policy nie wdraża equipment systemu.

Jeżeli istniejący consumer potrafi już określić wymagany weapon/tool i destination ownership, storage może być tylko source transferu.

## Work materials

NPC może pobrać materiał tylko dla konkretnej active work authority, jeśli reguła wymaga `assigned_only`.

Request powinien być bounded przez:

- required item kind;
- required amount;
- work/assignment identity;
- caller-owned destination inventory/cargo.

Storage policy nie tworzy pracy ani nie wybiera materiału za work system.

## Expedition provisioning

`settlements-npcs-027-npc-expedition-assignment-and-provisioning.md` jest ważnym consumerem Stage 2.

Responsibility boundary:

### Expedition/provisioning system owns

- assignment;
- member selection;
- required loadout;
- completeness;
- lifecycle/idempotency;
- kiedy provisioning jest potrzebny.

### Storage access owns

- actor permission;
- resource permission;
- authority validation contract;
- reserve/limit;
- final transfer permission.

Multi-item provisioning powinien zrobić complete-loadout preflight przed oznaczeniem membera jako provisioned.

`permission != claim != reservation`.

Nie budować nowego reservation subsystemu w storage layer tylko dla expedition.

## Deposit rules

Resource-specific deposit może być ograniczany niezależnie od withdrawal.

Przykład:

```text
loot/materials: deposit allowed
valuables: withdraw forbidden
```

Deposit nadal respektuje:

- actor-level permission;
- resource rule;
- authority/context tam, gdzie wymagana;
- container compatibility/capacity;
- freshness/instance identity.

Reserve nie dotyczy deposit.

## Player UI

Rozszerzyć Stage 1 permissions section w istniejącym container UI.

Minimalny Stage 2 UI ma obsługiwać tylko realne wdrożone reguły:

- category/item rule mode;
- reserve dla wspieranych fungible resources;
- max-per-withdrawal;
- temporary/manual grant management, jeśli ten slice jest faktycznie wdrożony.

Nie tworzyć:

- scripting UI;
- nested general-purpose rule builder;
- time schedules;
- per-day quotas;
- party inventory management.

## Persistence

Rozszerzyć istniejące `accessPolicy` na container recordach additively.

Old Stage 1 save bez Stage 2 fields musi zachować dokładnie Stage 1 semantics.

Brak resource rule oznacza fallback do Stage 1 operation result, nie broad implicit override.

Temporary/source grant serialization musi używać stable source ids i bezpiecznie tolerować stale source references.

## Failure semantics

Rozszerzyć Stage 1 semantic result o potrzebne Stage 2 reasons, np.:

```text
resource_forbidden
assigned_context_required
invalid_assignment_authority
reserve_reached
operation_limit
resource_unavailable
destination_capacity
action_no_longer_relevant
```

Nie wszystkie muszą być player-visible.

## Scope

### Included

1. Additive resource-aware extension of Stage 1 policy.
2. Canonical item/category classification reuse.
3. `forbidden / allowed / assigned_only` resource modes.
4. Structured purpose/authority request for real consumers.
5. Resource-specific minimum reserve.
6. Per-withdrawal maximum.
7. Instance-aware rules including liquid containers.
8. Current-state authority revalidation.
9. Optional source-based temporary grants where concrete consumers require them.
10. Food/water acquisition integration through existing NPC strategies.
11. Existing weapon/tool/work-material source integration where consumers already exist.
12. Expedition provisioning compatibility/integration.
13. Resource-aware deposit rules.
14. Additive UI and persistence.
15. Automated tests and diagnostics.

### Non-goals

- replacing Stage 1 actor policy;
- companion-specific inventory/economy;
- new NPC decision engine;
- global player warehouse;
- new item taxonomy independent from canonical item metadata;
- new work/assignment system;
- automatic gifting;
- remote/teleport withdrawal;
- global storage scans;
- long-lived resource reservation subsystem;
- time-based quotas;
- new equipment slots;
- crafting redesign;
- settlement/household storage permissions;
- general-purpose authorization framework for unrelated game systems.

## Implementation order

1. Confirm final `items-player-028` policy/transfer API and preserve it as the actor-level gate.
2. Add canonical resource classification adapter using existing item metadata/category helpers.
3. Add resource rule resolution and fallback.
4. Add reserve and max-per-withdrawal enforcement at commit.
5. Add minimal structured purpose/authority model required by first `assigned_only` consumer.
6. Integrate first concrete consumers incrementally: food/water, work material/tool, provisioning as supported by current code.
7. Add source-based grants only where derived authority is insufficient.
8. Extend UI/persistence only for implemented rule types.
9. Add JSDoc to important public/architectural functions/classes; use `@domain items-player` where useful for preflight discovery.

## Verification

### Automated

Verify at least:

- Stage 1 actor deny cannot be overridden by resource allow;
- specific item rule beats category rule;
- missing resource rule falls back to Stage 1 actor permission;
- `assigned_only` rejects missing/invalid authority;
- authority revoked between planning and commit blocks transfer;
- reserve is preserved across sequential NPC commits;
- max-per-withdrawal caps permission but does not force excess quantity;
- concrete liquid/weapon/tool instance identity/state survives transfer;
- food freshness survives transfer;
- temporary grant source revoke preserves independent manual/other source access;
- stale source grant is harmless after restore;
- deposit and withdraw resource rules remain independent;
- provisioning cannot mark complete after incomplete/failed transfers;
- no alternate NPC storage mutation path bypasses the shared gate.

### Manual browser verification — User

AI does not perform browser verification.

User should verify representative cases:

1. Companion may take food but not valuables/weapons under different rules.
2. `assigned_only` tool/material cannot be taken without the relevant active work context.
3. Reserve prevents NPCs from consuming the player's protected stock.
4. Changing rule/ending authority while NPC walks to chest causes final commit to fail safely.
5. Water container keeps its actual liquid state after transfer.
6. Temporary expedition/work access disappears when its source ends without removing independent manual access.
7. Existing Stage 1 default/group/NPC rules still behave identically.

## Completion criteria

Plan is complete when the Stage 1 actor-level policy remains the first authorization gate and the same player-storage seam can additionally enforce resource/context rules such as:

```text
actor: companion → allow withdraw
food: allowed, reserve bread=5
weapons: assigned_only
work material: assigned_only with active work authority
valuables: forbidden
```

with all decisions revalidated against current authoritative state at transfer time and without creating parallel inventory, assignment, logistics or item-classification systems.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
