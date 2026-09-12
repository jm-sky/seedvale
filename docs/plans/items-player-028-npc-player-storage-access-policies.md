# Plan: NPC player-storage access policies

**Created:** 2026-09-11
**Status:** `planned` 📋
**Priority:** high · **Effort:** L
**Depends on:** ~~items-player-027~~
**Domain:** `items-player`
**Type:** `feature`
**Subdomains:** `inventory` `items` `interaction`
**Tags:** `companions` `storage` `permissions` `npc-resources` `logistics`
**Roadmap:** `companions.md`

## Goal

Dodać kontrolowany, persistent i reusable mechanizm pozwalający normalnym NPC korzystać z wybranych zasobów znajdujących się w storage należącym do gracza.

Dostęp ma wynikać z jawnej policy przypisanej do konkretnego storage i być egzekwowany podczas rzeczywistego transferu zasobu.

Mechanizm ma wspierać m.in.:

- jedzenie i wodę,
- broń i narzędzia,
- materiały potrzebne do wykonywanej pracy,
- provisioning wypraw,
- odkładanie loot/materials do storage gracza,

bez tworzenia:

- companion inventory,
- companion economy,
- osobnej AI dla towarzyszy,
- globalnego magazynu gracza,
- równoległego systemu item ownership.

## Core invariants

```text
item ownership
!= storage access permission
!= knowledge / reachability
!= NPC need / goal / decision
!= assignment / work authority
!= resource claim / reservation
!= item transfer
!= item use / equip / consume
```

Policy odpowiada wyłącznie na pytanie:

> czy ten konkretny actor, w tym konkretnym kontekście, może teraz wykonać określoną operację na zasobie w tym storage?

Policy nie:

- tworzy potrzeby,
- zwiększa priority decyzji,
- rozkazuje NPC pobrać item,
- wyposaża NPC,
- konsumuje itemu,
- tworzy pracy ani assignment,
- rezerwuje zasobu,
- teleportuje zasobów,
- daje NPC wiedzy o lokalizacji storage.

NPC nadal korzysta z normalnego flow:

```text
world state
+ needs/problems/goals
+ work/assignment context
+ knowledge/reachability
+ storage permission
→ decision
→ physical action
→ authoritative transfer
→ normal use/equip/consume/work
```

## Existing mechanisms to reuse

Plan ma rozszerzać istniejące mechanizmy zamiast budować równoległy storage/logistics system.

Relevant ownership/integration points obejmują obecnie:

- `src/world/createPlacedContainers.ts`
  - player-placed containers,
  - authoritative container `Inventory`,
  - deposit/withdraw,
  - item instances,
  - food freshness,
  - capacity,
  - stable container identity;

- `src/items/Inventory.ts`
  - authoritative item counts/instances;

- `src/items/container.ts`
  - physical container semantics;

- `src/world/helperDeliveryHooks.ts`
  - istniejący narrow seam dla NPC/helper deposit do player storage;

- `src/ai/npcLogistics.ts`
  - claim → carry → deposit,
  - current-state revalidation,
  - settlement/household logistics,
  - partial deposit semantics;

- `NpcAuthoritativeState.personalInventory`
  - persistent personal belongings/provisions/weapons/tools NPC;

- `NpcAgent.carried`
  - transient work/logistics cargo;

- istniejące inventory transfer helpers;
- istniejące NPC need/work/combat/item-use strategies;
- `items-player-027` — bezpośredni Player → NPC Item Transfer;
- `settlements-npcs-027` — expedition assignment and provisioning;
- Work Contracts / helper assignment / accompany commitments;
- physical-resource-storage-and-logistics roadmap.

Nie budować `CompanionStorageManager`, `NpcPlayerInventory`, globalnego `PlayerWarehouse` ani alternatywnego item ledger.

## Related plans

- `items-player-027-player-to-npc-item-transfer-and-equipment.md` — direct Player → NPC ownership transfer; dependency.
- `settlements-npcs-027-npc-expedition-assignment-and-provisioning.md` — ważny consumer player-storage provisioning, ale nie twarda zależność tego planu.
- `npc-029-npc-accompany-follow-commitment.md` — accompany/follow nie daje automatycznie storage access.
- `npc-030-paid-expedition-escort-work-contracts.md` — może dostarczać authority/context, ale nie własny storage mechanism.
- `npc-031-voluntary-expedition-joining.md` — voluntary joining nie daje automatycznie permanent access.

## Storage policy ownership

Policy należy do konkretnego physical player-owned storage.

Preferowany ownership:

```text
PlacedContainerRecord
  └─ accessPolicy
```

Policy powinna podążać za tożsamością tej samej skrzyni/containera podczas:

```text
placed
→ picked up
→ carried by player
→ placed again
```

Nie przechowywać policy:

- w `NpcAgent`,
- w companion commitment,
- w quest state,
- jako duplicated map należący do AI,

chyba że implementation recon wykaże, że container-owned registry keyed by stable container ID daje wyraźnie czystszy ownership.

### Carried player container

W V1 NPC nie korzysta bezpośrednio ze storage aktualnie niesionego przez gracza.

Policy pozostaje związana z container identity, ale physical storage target musi istnieć w świecie.

## Actor authorization

Dostęp musi być jawny i oparty o stable NPC identity.

Nie inferować access wyłącznie z:

- `isCompanion`,
- accompany/follow,
- friendship,
- reputation,
- settlement membership,
- proximity,
- aktualnej obecności `NpcAgent`,
- renderowanego modelu.

Policy powinna umożliwiać explicit grant dla konkretnego `NpcId`.

Nie utrwalać jednak zbyt wcześnie samego `authorizedNpcIds: NpcId[]` jako finalnego modelu. Implementacja powinna rozważyć minimalne grant entries z source/lifecycle identity, aby odróżnić np.:

- manual grant gracza,
- work-contract grant,
- expedition grant.

Dzięki temu revoke jednego źródła nie usuwa niezależnego manualnego dostępu.

### Temporary access

Tymczasowa wyprawa nie może przypadkiem pozostawić trwałego dostępu po jej zakończeniu.

Jeśli assignment/commitment tworzy storage grant:

```text
assignment start
→ explicit grant

assignment end/cancel
→ revoke only that grant source
```

Manualny grant gracza nie może zostać usunięty dlatego, że zakończyła się wyprawa.

## Permission modes

Dla withdrawal w V1 użyć prostego, jawnego modelu:

```ts
type StorageAccessMode =
  | 'forbidden'
  | 'allowed'
  | 'assigned_only'
```

### `forbidden`

NPC nie może pobierać danego zasobu ze storage.

### `allowed`

NPC może pobrać zasób, jeśli:

- jest authorized,
- normalna AI/action ma rzeczywisty powód,
- resource jest fizycznie dostępny,
- reserve/limit pozwala,
- destination inventory może go przyjąć,
- action nadal jest aktualna przy commit.

`allowed` nie tworzy powodu do pobrania.

### `assigned_only`

Autonomiczne pobranie jest zabronione.

Transfer jest możliwy tylko w istniejącym explicit context, np.:

- item przypisany NPC,
- konkretne wyposażenie expedition provisioning,
- tool wymagany przez zadanie,
- materiały wymagane przez active work action.

Nie tworzyć nowego równoległego assignment systemu.

Storage access layer ma otrzymać structured access purpose/context od istniejącego systemu, który już posiada authority.

Nie używać luźnego:

```ts
assigned: true
```

Preferować mały discriminated request, np. koncepcyjnie:

```ts
type StorageAccessPurpose =
  | { type: 'personal_need'; need: 'food' | 'water' }
  | { type: 'assigned_item'; authority: ...; itemKind: ... }
  | { type: 'work_material'; authority: ...; workId: ...; itemKind: ...; requiredAmount: number }
  | { type: 'expedition_provisioning'; authority: ...; assignmentId: ...; memberNpcId: ...; itemKind: ...; requiredAmount: number }
```

Dokładny shape ma być tak mały jak rzeczywiste consumers.

Storage layer nie powinna interpretować całego Work Contract/Expedition/Quest. Authority powinien zostać zweryfikowany przez właściwy system lub narrow shared helper.

## Resource classification

Policy może grupować permissions według resource classes, ale nie tworzyć niezależnej taxonomy konkurującej z item definitions.

Kategorie powinny wynikać przede wszystkim z intrinsic item capabilities/metadata, np. food, weapon, tool, medicine, ammunition, valuable, container.

Nie traktować kontekstowych pojęć takich jak `work_material` jako trwałej klasy itemu, jeśli ten sam zasób może pełnić inne role. Kontekst pracy należy do `StorageAccessPurpose`.

Dokładną klasyfikację ustalić po recon istniejącego item metadata/capabilities.

### Water

Nie modelować wody jako prostego scalar `water`.

Woda pozostaje zawartością realnego liquid-container instance.

Withdrawal dla wody musi zachować:

- konkretną instance identity,
- current liquid contents,
- pojemność,
- aktualny stan pojemnika.

Normalny NPC water-use flow następnie decyduje, czy i kiedy z niej pić.

## Resource-specific reserves

Reserve oznacza ilość zasobu, która ma pozostać w storage po operacji.

Reserve powinien być definiowany dla konkretnego zasobu lub spójnego fungible resource key, nie szerokiej heterogeneous kategorii.

Przykład:

```text
bread:
  mode: allowed
  minimumReserve: 5
```

Nie:

```text
food:
  minimumReserve: 5
```

jeśli oznaczałoby to niejasną sumę chleba, ryb, mięsa i marchwi.

Categories mogą sterować permission defaults, ale reserve powinien mieć jednoznaczną quantity semantics.

### Reserve evaluation

Reserve musi być sprawdzany przy authoritative mutation.

```text
availableToNpc = max(0, currentEligibleQuantity - minimumReserve)
```

Nie rezerwować ilości tylko podczas planning.

Przykład:

```text
storage: 10 bread
reserve: 5
maxPerWithdrawal: 3

NPC A requests 4
→ receives 3
→ 7 remain

NPC B requests 3
→ receives 2
→ 5 remain

NPC C requests 1
→ receives 0
→ reserve preserved
```

## Per-operation limits

Policy może opcjonalnie określać:

```ts
maxPerWithdrawal?: number
```

Limit jest górną granicą permission, nie target quantity.

NPC action musi najpierw określić rzeczywistą ilość potrzebną dla:

- current need,
- assignment,
- loadout,
- work action,
- destination capacity.

Dopiero potem policy może ją ograniczyć.

```text
requested by action
→ destination capacity
→ policy max
→ reserve-safe amount
→ authoritative transfer
```

NPC nie powinien pobierać trzech itemów tylko dlatego, że policy pozwala na trzy, jeśli action potrzebuje jednego.

### No rolling quota in V1

Nie dodawać:

- per-day limits,
- weekly quotas,
- cooldown counters,
- replenishing allowance.

Wymagałyby dodatkowej persistent temporal state bez obecnego konkretnego use case.

## Withdraw and deposit are separate permissions

Withdrawal i deposit muszą być niezależne.

Typowy przypadek:

```text
NPC:
  may deposit hunt loot
  may deposit work materials
  may NOT withdraw valuables
```

Deposit:

- nadal wymaga authorization/context,
- respektuje container capacity,
- respektuje compatibility,
- zachowuje freshness/instances,
- nie korzysta z reserve floor.

Nie traktować `canDeposit` jako implicit `canWithdraw`.

## Policy-aware storage seam

Dodać mały reusable application/domain seam nad istniejącym `PlacedContainers`.

Preferować nazwę rozdzielającą ocenę policy od mutacji, np. koncepcyjnie:

```ts
evaluateStorageAccess(...)
tryWithdraw(...)
tryWithdrawInstance(...)
tryDeposit(...)
tryDepositInstance(...)
```

`evaluateStorageAccess(...)` nie obiecuje przyszłej dostępności i nie tworzy reservation.

Warstwa powinna posiadać:

- resolve container,
- resolve current policy,
- actor authorization,
- item/resource classification,
- purpose validation,
- reserve calculation,
- per-operation limit,
- final current-state revalidation,
- authoritative mutation through existing Inventory/container APIs,
- semantic result/failure reason.

Nie przenosić całej logistyki NPC do storage module.

## Query vs commit

Read-only availability/policy evaluation jest advisory.

```text
planning:
  "prawdopodobnie dostępne 3 bread"

NPC travels...

commit:
  authoritative current state decides
```

Final mutation musi ponownie sprawdzić:

- storage nadal istnieje,
- actor nadal authorized,
- policy nadal pozwala,
- assignment/work authority nadal valid,
- resource nadal istnieje,
- reserve,
- operation cap,
- destination capacity,
- request nadal jest semantycznie aktualny.

### Policy TOCTOU example

```text
NPC selects sword from chest
→ starts walking
→ player changes weapons: allowed → forbidden
→ NPC reaches chest
→ withdrawal fails
```

Nie grandfatherować permission z momentu planning.

## Atomic withdrawal semantics

Authoritative withdrawal powinien wykonać kolejno:

```text
resolve current container
→ resolve current policy
→ validate actor grant
→ classify concrete resource
→ validate access mode
→ validate purpose / assignment authority
→ inspect current inventory
→ calculate requested meaningful amount
→ apply destination capacity
→ apply max-per-operation
→ apply reserve
→ remove exact real item/count/instance
→ return exact transfer result
```

Nie używać stale planning quantity.

Multiple NPCs wykonują commit sekwencyjnie na authoritative main-thread state.

Nie potrzeba distributed locks ani worker synchronization.

Nie wprowadzać długotrwałej reservation state, chyba że późniejsze testy wykażą rzeczywisty problem.

## Transfer safety

Nie może istnieć:

```text
withdraw from chest
→ destination add fails
→ item disappears
```

Transfer musi:

- preflightować destination capacity, lub
- używać istniejącego transactional transfer primitive, lub
- posiadać bezpieczny rollback zgodny z Inventory semantics.

Preferować reuse istniejącego transfer mechanism.

## Destination ownership

Storage access nie decyduje docelowego inventory arbitralnie.

Caller/action wskazuje prawidłowy owner.

### Personal resources

```text
food
water container
personal weapon
assigned personal tool
expedition personal gear
→ NpcAuthoritativeState.personalInventory
```

### Work cargo

```text
construction material
harvest transport
logistics delivery
→ NpcAgent.carried
```

Nie tworzyć wspólnego companion/group inventory.

## Knowledge and reachability

Permission nie oznacza, że NPC wie o każdej skrzyni gracza.

NPC acquisition candidate może rozważać wyłącznie storage wynikający z bounded normalnego contextu, np.:

- explicit assigned storage,
- camp/place context,
- work target context,
- expedition provisioning source,
- known authorized nearby storage,
- istniejący world/location lookup.

Nie robić globalnego scan wszystkich player containers przy każdej decyzji NPC.

Storage musi być również fizycznie reachable przez normalny movement/action system.

Nie teleportować zasobów do NPC.

## Off-screen and simulation independence

Access policy należy do authoritative world state, nie presentation state.

Mechanizm nie może zależeć od:

- Three.js object existence,
- rendered chest mesh,
- camera,
- current chunk visual detail,
- obecności runtime `NpcAgent`, jeśli operacja wykonywana jest przez niższą fidelity simulation.

Persistent actor/container identities mają być wystarczające do oceny permission.

Jeżeli niższa fidelity simulation wykonuje transfer bez pełnego action runtime, musi używać tego samego authoritative policy/transfer contract. Nie tworzyć drugiej ścieżki mutacji zasobów.

## NPC needs integration

Storage permission ma być jednym z możliwych resource sources dla istniejących strategy candidates.

Przykład:

```text
NPC hungry
→ normal hunger strategy evaluation
→ personalInventory?
→ household/economy/existing alternatives?
→ authorized known player storage?
→ choose action according to normal decision system
```

Nie dodawać globalnego `if (hasPlayerStorageAccess) fetchFood()`.

### Food

Pobranie żywności musi zachować:

- freshness batches,
- exact item count,
- normalne personalInventory semantics.

Po transferze normalna food-use logic decyduje o konsumpcji.

### Water

NPC pobiera realny supported liquid-container instance.

Po transferze normalna water strategy korzysta z istniejących liquid-container helpers i instance update.

## Weapons and tools

Permission `assigned_only` może pozwolić NPC pobrać weapon/tool tylko wtedy, gdy istnieje realne authority/use context.

Nie wdrażać speculative equipment systemu w ramach tego planu.

Jeżeli aktualny kod potrafi już obsłużyć assigned weapon, required work tool albo expedition loadout, storage layer może być source transferu.

Jeśli consumer nie istnieje, sama policy nie ma go tworzyć.

## Work materials

NPC może pobrać work material wyłącznie dla konkretnej aktywnej pracy.

Request powinien zawierać:

- concrete work/action authority,
- required resource kind,
- bounded required amount.

Policy może pozwolić lub odmówić transferu.

Nie może zamienić storage w autonomiczny free material pool.

## Expedition provisioning integration

`settlements-npcs-027-npc-expedition-assignment-and-provisioning.md` jest ważnym consumerem tego mechanizmu, ale nie twardą zależnością implementacyjną tego planu.

Tamtejszy provisioning zakłada:

```text
authoritative source storage
→ validate complete required loadout
→ transfer real items/instances
→ NPC personal inventory
→ mark assignment/member provisioned
```

Ten plan może dostarczyć reusable player-storage source dla takiego provisioning.

### Responsibility boundary

`settlements-npcs-027` owns:

- expedition assignment,
- member selection,
- required loadout,
- provisioning completeness,
- provisioning lifecycle/idempotency.

`items-player-028` owns:

- czy konkretny NPC/assignment może pobrać konkretny resource z konkretnego player storage,
- ile wolno pobrać,
- reserve/limit,
- authoritative item transfer permission.

Nie przenosić expedition semantics do storage policy.

### Complete-loadout preflight

Provisioning wyższego poziomu musi móc sprawdzić cały wymagany loadout bez mutacji przed rozpoczęciem transferów.

Preferowany flow:

```text
preflight complete loadout
→ verify current authorized sources and bounded quantities
→ if existing claim mechanism fits, establish bounded claim/intent there
→ perform transfers
→ mark provisioned only after complete success
```

`permission != reservation != resource claim`.

Nie budować nowego reservation subsystemu tylko dla storage policy. Implementation notes mają sprawdzić, czy istniejący claim mechanism z `npcLogistics` można bezpiecznie reuse dla provisioning.

Storage access API nie powinno posiadać całej multi-item expedition transaction jako własnej domeny.

Nie tworzyć brakujących itemów.

## Relationship with Player → NPC item transfer

`items-player-027` pozostaje innym flow.

### Direct transfer

```text
player Inventory
→ explicit player action
→ NPC personalInventory
```

### Storage access

```text
player-owned storage
→ NPC normal decision/work/assignment
→ authorized physical withdrawal
→ NPC personalInventory / carried
```

Nie traktować storage access jako automatycznego gift systemu.

## Helper delivery integration

Existing `HelperDeliveryHooks` już pozwala na narrow NPC/helper deposit do player storage.

Implementation powinien sprawdzić, czy:

- da się go oprzeć na wspólnej policy-aware deposit primitive,
- czy lepiej pozostawić istniejący seam i użyć tych samych niższych helpers.

Nie refaktorować helper delivery tylko dla architektonicznej symetrii.

Existing behavior nie może zostać przypadkowo zepsuty.

## Persistence

Policy musi przeżyć:

- save/load,
- chunk/world streaming,
- container pickup and placement,
- WorldBundle reconstruction,
- NPC unload/reload.

Current placed/carried container persistence należy rozszerzyć świadomie.

### Old saves

Bezpieczny migration default:

```text
no explicit policy
→ no NPC withdrawal permission
```

Nie otwierać istniejących skrzyń automatycznie NPC po załadowaniu starego save.

Existing helper delivery compatibility należy rozstrzygnąć oddzielnie, aby nie zepsuć istniejącego use case.

### Missing NPC IDs

Policy może zawierać grant do NPC, który umarł, nie jest aktualnie załadowany albo został później usunięty przez lifecycle.

Taki wpis ma być harmless.

Nie wymagać obecności runtime agent podczas deserializacji policy.

## Player UI

Runtime + persistence + pierwszy vertical consumer nie powinny być blokowane przez pełny UI.

Po ustabilizowaniu contractu storage interaction UI powinien dostać kompaktową sekcję permissions.

Minimalny V1 UI:

- list authorized NPCs,
- add/remove explicit authorization,
- withdraw category/resource rules,
- `forbidden / allowed / assigned_only`,
- reserve dla wspieranych fungible resources,
- max-per-withdrawal,
- deposit permission.

Nie dodawać:

- pełnego scripting UI,
- nested rule builder,
- party inventory UI,
- companion management screen,
- time schedules,
- per-hour/day quotas,
- global warehouse management.

Vue nie mutuje container policy bezpośrednio.

Użyć focused application action, np. koncepcyjnie:

```ts
updatePlayerStorageAccessPolicy(containerId, patch)
```

Action odpowiada za validation, clamping, stable IDs i persistence-compatible state.

## Failure semantics

Policy-aware transfer powinien zwracać semantic result/failure reason.

Przykłady:

```text
unauthorized_actor
withdraw_forbidden
assigned_context_required
invalid_assignment_authority
resource_not_allowed
reserve_reached
operation_limit
resource_unavailable
destination_capacity
container_missing
container_not_world_accessible
action_no_longer_relevant
```

Nie wszystkie muszą być publicznym enum, jeśli istniejący error/result model sugeruje lepszą reprezentację.

Powody mają pomagać AI replan, diagnostics, automated tests i debugging.

Nie spamować gracza technicznymi failure notifications.

## Scope

### Included

1. Persistent per-storage NPC access policy.
2. Explicit stable NPC authorization/grants.
3. Intrinsic resource/category access rules.
4. `forbidden / allowed / assigned_only`.
5. Separate withdraw/deposit permissions.
6. Resource-specific reserve floors.
7. Optional per-withdrawal maximum.
8. Narrow policy-aware evaluate/commit API.
9. Atomic current-state enforcement.
10. Instance/freshness-safe transfer.
11. Food integration through normal NPC need flow.
12. Water/liquid-container support.
13. Assigned weapon/tool source where existing consumers support it.
14. Active-work material withdrawal.
15. Expedition provisioning compatibility with `settlements-npcs-027`.
16. Supported NPC/helper deposit.
17. Persistence/migration.
18. Diagnostics and automated tests.
19. Compact storage permissions UI after runtime contract stabilizes.

### Non-goals

- companion inventory,
- companion economy,
- new NPC decision engine,
- party/group inventory,
- global player warehouse,
- settlement storage permission redesign,
- household storage redesign,
- automatic gifting,
- automatic access from accompany/friendship,
- time-based quotas,
- rule scripting,
- arbitrary per-item scripting UI,
- remote/teleport withdrawal,
- global storage scans,
- use/equip/consume logic redesign,
- new equipment slots,
- work-contract redesign,
- expedition assignment implementation,
- expedition loadout definition,
- new crafting system,
- accessing player-carried container while carried,
- long-term companion home/household semantics,
- new reservation subsystem.

## Implementation phases

### Phase A — Policy ownership and persistence

- define policy/grant types,
- define restrictive defaults,
- attach policy to stable storage identity,
- persist placed/carried container policy,
- restore across pickup/place cycle,
- implement old-save migration,
- test identity/persistence.

### Phase B — Policy-aware storage API

Implement narrow reusable layer for:

- policy evaluation,
- count-based withdrawal,
- instance-based withdrawal,
- deposit,
- actor grants,
- access mode,
- purpose validation,
- reserve,
- max-per-operation,
- semantic result.

Preserve existing Inventory/container ownership.

### Phase C — Atomic transfer and concurrency semantics

Verify:

- final revalidation,
- multiple NPC sequential withdrawal,
- reserve cannot be crossed,
- destination capacity safety,
- no item loss,
- policy changes during travel,
- chest pickup/removal during travel.

Nie wprowadzać reservation subsystem bez potrzeby.

### Phase D — First vertical consumer: food

Pierwszym end-to-end consumerem powinien być prosty normalny NPC need use case:

```text
hungry NPC
→ knows authorized storage
→ normal decision selects it
→ walks
→ policy commit
→ bread enters personalInventory
→ normal food behavior may consume
```

To zweryfikuje architecture bez jednoczesnego implementowania wszystkich consumers.

### Phase E — Water, assignment and work consumers

Po food:

- liquid-container acquisition,
- assigned weapon/tool where supported,
- active-work materials,
- expedition provisioning integration when `settlements-npcs-027` is implemented/reviewed.

Każdy consumer ma używać tej samej storage permission layer.

### Phase F — Deposit integration

- normal loot/material deposit,
- helper delivery compatibility,
- capacity/partial deposit,
- no item mint/drop.

### Phase G — UI

Dodać compact player storage permissions UI po ustabilizowaniu runtime contract.

### Phase H — Diagnostics and regression coverage

- failure reasons,
- automated tests,
- state/persistence regression,
- existing storage/helper flows.

## Verification

### Authorization

- unauthorized NPC cannot withdraw,
- authorized NPC can use `allowed`,
- removing grant immediately blocks future commit,
- revoking expedition/work grant does not remove independent manual grant,
- dead/unloaded NPC grant is harmless.

### Access modes

- `forbidden` always blocks withdrawal,
- `allowed` permits normal justified action,
- `assigned_only` blocks autonomous need acquisition,
- valid assignment/work/expedition authority permits supported request,
- stale/invalid authority fails at commit.

### Permission is not motivation

- satiated NPC does not fetch food merely because allowed,
- hungry NPC may consider authorized storage,
- existing alternatives remain valid,
- weapon permission does not make civilian arm itself.

### Reserve and concurrency

Given:

```text
10 bread
minimumReserve = 5
maxPerWithdrawal = 3
```

Expected:

```text
NPC A requests 4 → receives 3 → 7 remain
NPC B requests 3 → receives 2 → 5 remain
NPC C requests 1 → receives 0 → 5 remain
```

### Meaningful quantity

NPC needing one bread with `maxPerWithdrawal=3` receives at most one.

Work action requiring two planks does not take five just because policy allows five.

### TOCTOU

```text
NPC plans allowed withdrawal
→ player revokes permission
→ NPC reaches chest
→ commit denied
```

Also verify:

- reserve changed by another NPC,
- item consumed by player,
- chest becomes full before deposit,
- chest picked up before arrival,
- assignment cancelled during travel.

### Instances and freshness

- food batches preserved,
- waterskin instance identity preserved,
- liquid state preserved,
- weapon/tool instance preserved,
- no minting or duplicate instances.

### Destination safety

- full NPC personalInventory does not lose withdrawn item,
- full `carried` storage does not lose material,
- partial transfer has explicit semantics.

### Expedition provisioning

For `settlements-npcs-027` compatibility:

- higher-level provisioning can preflight complete loadout without mutation,
- assignment may query authorized provisioning source,
- missing required item blocks complete provisioning,
- no missing item is created,
- provisioned gear ends in correct NPC personalInventory,
- policy reserve can prevent expedition from consuming protected player resources,
- repeated restoration does not duplicate provisioning.

### Persistence

- policy roundtrip through save/load,
- container pickup/replace preserves policy,
- old save defaults safely,
- grants survive NPC unload,
- no duplicated policy state.

### Existing behavior regression

Verify no regressions in:

- normal player chest deposit/withdraw,
- carried container behavior,
- helper delivery,
- household/settlement logistics,
- food freshness,
- water instances,
- `items-player-027` direct Player → NPC transfer,
- NPC personal inventory persistence.

Manual browser verification wykonuje użytkownik; AI nie wykonuje browser verification.

## Implementation notes recon checklist

Przed codingiem implementation notes powinny rozstrzygnąć:

1. Czy policy jest embedded w `PlacedContainerRecord`, czy w container-owned registry keyed by stable ID.
2. Jaki minimalny grant model pozwala bezpiecznie łączyć manual access z temporary expedition/work access.
3. Jak dokładnie istniejący item metadata klasyfikuje intrinsic categories/capabilities.
4. Jak reprezentować reserve keys bez duplicated item taxonomy.
5. Jaki minimalny `StorageAccessPurpose` jest potrzebny dla realnych consumers.
6. Jak istniejący transfer helper obsługuje atomic destination capacity.
7. Czy `HelperDeliveryHooks` powinien korzystać ze wspólnego deposit primitive.
8. Jak NPC odkrywa bounded authorized storage w need/work/accompany contexts.
9. Które weapon/tool consumers rzeczywiście istnieją w momencie implementacji.
10. Jak `settlements-npcs-027` wybiera provisioning source i jak przekazuje authority bez coupling storage layer do expedition domain.
11. Czy istniejący claim mechanism z `npcLogistics` może wspierać complete-loadout provisioning bez tworzenia storage-specific reservation systemu.
12. Jak policy zachowuje się w niższej fidelity/off-screen simulation przy zachowaniu jednego authoritative transfer contract.
13. Czy istniejące save version/migration helpers wymagają bump schema version.

## Documentation

Dla ważnych nowych public/architectural functions/classes dodać JSDoc tam, gdzie pomaga preflight discovery; użyć `@domain items-player` tam, gdzie pasuje.

## Guardrail

Docelowy ownership chain:

```text
player-owned physical storage Inventory owns item
→ storage policy says whether this actor/context may move it
→ NPC decision/work/assignment says why it is needed
→ knowledge + reachability says whether NPC can act on that storage
→ authoritative transfer moves one real resource
→ personalInventory / carried becomes new owner
→ existing need/combat/work logic decides what happens next
```

Nigdy:

```text
companion status
→ magic access to player resources
→ automatic consumption/equipment
```

> **Zrób git commit i push do main, rebase jeżeli trzeba**
