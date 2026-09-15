# Plan: NPC expedition assignment and provisioning

**Created:** 2026-09-08
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** ~~settlements-npcs-026~~
**Domain:** `settlements-npcs`
**Subdomains:** `logistics` `household`
**Tags:** `expedition` `staffing` `provisioning` `assignment`
**Roadmap:** `quests-abandoned-gold-mine-colony.md`
**Model:** `Sonnet`, `Composer`

## Goal

Dostarczyć reusable world mechanism, dzięki któremu sponsoring settlement może deterministycznie wybrać, zarezerwować i przygotować grupę realnych istniejących NPC do długiej ekspedycji.

Pierwszym use case jest wysłanie **3 NPC** do odległej lokalizacji w roadmapie opuszczonej kopalni. Plan nie implementuje questa, kopalni, podróży ani kolonii.

## Core invariants

```text
current settlement population
+ authoritative NPC state
+ current external commitments
+ household staffing safety
+ deterministic eligibility/ranking
+ real settlement-owned equipment
↓
world-owned persistent expedition assignment
↓
3 existing NPC identities with real personal inventories
```

Nie:

- rezerwować trzech UUID podczas worldgen,
- spawnąć replacement człowieka przy rozpoczęciu questa,
- tworzyć questowych proxy NPC,
- wybierać martwego lub niezdolnego do wymaganej podróży NPC,
- zostawiać household z dziećmi bez dorosłego,
- niszczyć krytycznej obsady mother settlement przez partial dispatch,
- tworzyć wyposażenia z niczego.

## Current architecture confirmed by review

Plan opiera się na istniejących wdrożonych mechanizmach:

- `settlements-npcs-026` — `NpcAuthoritativeState.personalInventory` + persistent personal belongings,
- `settlements-npcs-023` — generation-time profession staffing; **nie** runtime workforce manager,
- `settlements-npcs-019` — persistent world-owned registry/off-screen continuity pattern dla późniejszego `028`,
- `WorkContracts.findActiveWorkByNpc(npcId)` — aktywne work commitment,
- `TransportOrders.findByCarrier(npcId)` — aktywne transport commitment,
- stable NPC identity z `settlementNpcId()` + `flattenedSettlementMembers()`.

Nie tworzyć parallel population, staffing, inventory ani assignment systemu, jeżeli istniejący owner już dostarcza potrzebny stan.

## Candidate data

Candidate selection korzysta z rzeczywistych danych:

- `FamilyMember.age`,
- `FamilyMember.gender`,
- `CharacterDef.role`, w tym istniejący `miner`,
- authoritative `NpcAuthoritativeState.health` / `postDeath`,
- persistent `helperAssignment`, `accompanyCommitment`, `travel`,
- aktywny WorkContract / TransportOrder,
- settlement/family membership wynikający z `SettlementDef.families`,
- stable NPC ID wynikający z flattened family/member order.

Nie wymyślać `miningSkill`, `fit`, `healthy`, nowych traits ani nowych profession fields.

## Candidate eligibility

### Static hard eligibility

Kandydat musi:

- być członkiem population sponsor settlement,
- mieć stable real NPC identity,
- mieć `age >= 18`,
- pasować do dozwolonego tieru wieku/płci opisanego niżej.

### Mutable hard eligibility

Bezpośrednio przed commit kandydat musi:

- być żywy (`health.dead === false`, `postDeath === null`),
- nie należeć już do aktywnego expedition assignment,
- mieć `helperAssignment === null`,
- mieć `accompanyCommitment === null`,
- mieć `travel === null`,
- nie mieć aktywnego WorkContract (`findActiveWorkByNpc`),
- nie być carrierem aktywnego TransportOrder (`findByCarrier`),
- przejść full-party staffing safety.

`activePlan !== null` nie dyskwalifikuje NPC. To normalny stan jego zachowania, nie zewnętrzny długotrwały commitment.

Nie zakładać osobnego `incapacitated` boolean. Jeżeli istniejący current code ma konkretny temporary condition jawnie uniemożliwiający podróż, można dodać mały helper nad tym istniejącym stanem; nie tworzyć nowego health subsystemu.

## Deterministic candidate hierarchy

Pierwszy use case zachowuje świadomą hierarchy:

```text
Tier 1: male, age 18–35, role === 'miner'
Tier 2: male, age 18–35
Tier 3: male, age 36–45
```

Resolver:

1. odfiltruj hard-ineligible,
2. przypisz tier,
3. sortuj po tier,
4. finalny tie-break: stable flattened settlement member order / NPC ID.

Nie używać `Math.random()` ani generation RNG.

SPEA (`strength`, `endurance`, itd.) nie jest potrzebne w pierwszej wersji. Nie używać go jako ukrytego substytutu `miningSkill` bez osobnego powodu gameplayowego.

## Staffing safety

`settlements-npcs-023` definiuje initial role composition podczas generation i nie posiada runtime hard minimum profession coverage. `027` nie ma tworzyć drugiego workforce managera.

Dispatch-time safety jest małym reusable household/population contractem:

```text
canDispatchParty(settlementDef, memberNpcIds, currentNpcState)
```

Pełna wybrana trójka musi spełnić razem:

- wszyscy members są żywymi adultami,
- po ich usunięciu co najmniej **jeden żywy adult** pozostaje w sponsor settlement,
- żaden household zawierający dziecko nie zostaje bez żywego nie-ekspedycyjnego dorosłego,
- reserved/forced home inhabitants nie są kandydatami, jeśli current generation data identyfikuje ich jako reserved,
- wszystkie incompatible commitments są sprawdzone ponownie tuż przed commit.

Nie wymuszać `Farmer >= 1`, `Guard >= 1` itp. — obecny runtime nie ma authoritative profession-minimum contractu.

Ta reguła naturalnie blokuje one-adult OUTPOST i większość zbyt małych osad bez size-specific magic numbers.

## Persistent expedition assignment

Assignment jest world-owned plain data, nie częścią `NpcAgent` ani kopią w każdym `NpcAuthoritativeState`.

Wzorzec ownership ma odpowiadać istniejącym world-owned registries takim jak `TransportOrders` / `WorkContracts`:

```text
ExpeditionAssignments
└── ExpeditionAssignment
    ├── id
    ├── sponsorSettlementId
    ├── destination
    ├── ordered memberNpcIds[3]
    ├── state
    └── timestamps
```

Minimalny lifecycle:

```text
forming
  ↓ successful provisioning
provisioned
  ↓ caller confirms departure can begin
ready
```

`028` konsumuje tylko `ready` assignments i jest właścicielem travel/execution lifecycle.

Nie dodawać tutaj `travelling`, `off-screen`, `arrived`, route/path state ani movement metadata.

### Assignment invariants

- jeden NPC może należeć do najwyżej jednego aktywnego expedition assignment,
- member IDs nie zmieniają się po commit,
- śmierć po commit nie powoduje silent replacement,
- repeated caller/reload nie tworzy drugiego assignment dla tego samego commitment,
- assignment nie zmienia settlement/home/household membership.

## Atomic party resolution and commit

Resolver nie rezerwuje osób podczas samego rankingu.

```text
resolve current candidates
→ choose ordered top 3
→ revalidate mutable eligibility
→ validate whole-party staffing safety
→ create one forming assignment
```

Jeżeli kandydat umrze lub stanie się niekwalifikujący **przed commit**, resolver może zostać uruchomiony ponownie na aktualnym stanie.

Po commit nie podmieniać członka po cichu innym NPC.

## Provisioning source

V1 używa **`SettlementEconomy.items` sponsoring settlement** jako authoritative expedition stock.

Powody:

- jest settlement-level generic `Inventory`,
- przeżywa streaming/rebuild/save,
- jest właściwym ownerem wspólnego konkretnego stocku osady,
- nie narusza własności householdów.

Nie pobierać automatycznie z `Household.items`. To rodzinna własność/pantry, nie domyślny village depot.

Jeżeli sponsor settlement nie ma odpowiednich realnych przedmiotów, provisioning kończy się jawnie failure. Nie mintować braków i nie kraść ich z householdów.

## Initial expedition loadout

### Per NPC

Każdy z 3 członków ma dostać do `NpcAuthoritativeState.personalInventory`:

- `pickaxe` ×1,
- `knife` ×1,
- `blanket` ×1,
- `bandage` ×2,
- food ×3 z istniejącego `dried_meat` / `dried_fish`,
- jeden **filled `waterskin_medium` instance**.

Food selection jest deterministyczny:

```text
dried_meat first
→ dried_fish uzupełnia brakujące required units
```

### Shared group gear

Nie tworzyć group inventory.

Wspólne wyposażenie dostaje pierwszy NPC w ordered member list:

- `shovel` ×1,
- `firestarter` ×1,
- `tent` ×1 real instance.

To jest zwykła własność konkretnego NPC. Późniejsze transfery/camp setup mogą zmienić ownera osobnym mechanizmem.

## Transactional provisioning

Provisioning obejmuje pełny manifest wszystkich trzech NPC jako jedną transakcję logiczną.

```text
SettlementEconomy.items
→ resolve exact counts + exact item instances
→ preflight full manifest
→ transfer real items/instances
→ 3× NpcAuthoritativeState.personalInventory
→ mark assignment provisioned
```

Użyć istniejących generic transfer semantics:

- `transferInventoryCount()`,
- `transferInventoryInstance()`.

Wymagania:

1. preflight pełnego source availability,
2. preflight cumulative destination capacity,
3. exact instance IDs dla waterskin/tent,
4. żadnej mutacji przed pozytywnym full preflight,
5. unexpected failure podczas commit musi rollbackować już przeniesione elementy,
6. assignment przechodzi do `provisioned` dopiero po pełnym sukcesie.

Nie używać `inventory.add()` do tworzenia braków.

Repeated provisioning na `provisioned`/`ready` jest idempotentnym no-op.

## Failure semantics

Preferować typed failure reason dla quest/debug caller:

```text
not-enough-candidates
conflicting-assignment
staffing-unsafe
missing-settlement-storage
missing-equipment
inventory-capacity
```

### Not enough candidates

Assignment nie powstaje. Nie spawnować NPC.

### Staffing unsafe

Nie dispatchować częściowej grupy.

### Missing equipment / capacity

Assignment może pozostać `forming`, ale żadna partial provisioning mutation nie może zostać zachowana.

### Candidate death before commit

Re-resolve current candidates deterministycznie.

### Candidate death after commit

Nie robić automatycznego replacement. To późniejsze zdarzenie ekspedycji.

## Persistence and idempotency

Expedition assignment registry musi przeżyć:

- settlement streaming,
- `NpcAgent` reconstruction,
- `WorldBundle` rebuild,
- save/load.

Użyć istniejącego `initial*` + snapshot/serialize pattern.

Legacy save bez expedition assignments → pusty registry.

Repeated restoration nie może:

- ponownie wybrać party,
- zmienić member IDs,
- ponownie pobrać equipment,
- odtworzyć assignment jako nowy rekord,
- ponownie oznaczyć memberów jako available.

Personal inventory nadal persistuje własną istniejącą ścieżką w `NpcStateRegistry`; nie kopiować itemów do assignment snapshot.

## Relationship with households/home/membership

Dispatch nie zmienia formalnie:

- settlement membership,
- household identity,
- home,
- profession/role.

NPC pozostaje tą samą osobą należącą do mother settlement podczas ekspedycji. Formalne relocation do przyszłej kolonii jest osobnym późniejszym zakresem.

Nie zmieniać NPC ID na ID destination settlement.

## Relationship with `settlements-npcs-028`

`027` kończy się na `ready` assignment z realnymi members i realnym equipment.

`028` odpowiada za:

- departure movement,
- generic travel commitment,
- detailed ↔ off-screen handoff,
- survival/provision consumption podczas podróży,
- arrival.

`027` nie powinien mutować `NpcAuthoritativeState.travel` ani utrzymywać drugiego travel lifecycle.

## Non-goals

- global/off-screen travel implementation,
- colony settlement creation,
- relocation/migration membership transfer,
- runtime profession changes,
- quest stages/dialogue/rewards,
- worldgen UUID reservation,
- zwiększanie population specjalnie dla questa,
- expedition combat/encounters,
- camp setup at destination,
- group inventory,
- runtime profession-minimum manager,
- household confiscation/fallback provisioning.

## Implementation boundaries

Najważniejsze integration points:

- `src/settlement/npcIdentity.ts`,
- `src/settlement/families.ts`,
- `src/settlement/npcState.ts`,
- `src/settlement/household.ts`,
- `src/economy/settlementEconomy.ts`,
- `src/items/inventoryTransfer.ts`,
- `src/world/createWorkContracts.ts`,
- `src/world/createTransportOrders.ts`,
- `src/settlement/SettlementsManager.ts`,
- `src/app/worldBundle.ts`,
- `src/app/saveState.ts`,
- `src/persistence/saveData.ts`.

Szczegółowy verified recon jest w:

`docs/plans/implementation-notes/settlements-npcs-027-npc-expedition-assignment-and-provisioning-implementation-notes.md`.

## Verification

Automated tests powinny objąć:

- deterministic tier selection + stable tie-break,
- child/dead/incompatible-assignment filtering,
- dokładną hierarchy 18–35 miner → 18–35 male → 36–45 male,
- death-before-commit fallback,
- brak spawn fallback,
- one-adult OUTPOST blocked,
- household-with-child safety dla pełnej trójki,
- one active expedition assignment per NPC,
- exact per-NPC/shared provisioning manifest,
- filled waterskin/tent instance preservation,
- deterministic dried meat/fish selection,
- full rollback przy missing-equipment/capacity failure,
- idempotent repeated provisioning,
- save/load + WorldBundle rebuild continuity bez re-selection/re-transfer.

Manual browser verification wykonuje użytkownik; AI nie wykonuje browser verification.

## Documentation

Dla ważnych nowych public/architectural functions/classes dodać JSDoc, gdy pomaga preflight discovery; użyć `@domain settlements-npcs` tam, gdzie pasuje.

Jeżeli implementation tworzy nową authoritative world-state boundary dla assignments, zaktualizować odpowiedni `docs/state/*` zamiast opisywać ją wyłącznie w planie.

> **Zrób git commit i push do main, rebase jeżeli trzeba**