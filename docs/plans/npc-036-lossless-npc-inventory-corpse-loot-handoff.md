# Plan: Lossless NPC inventory → corpse loot handoff

**Created:** 2026-09-12
**Status:** `verification needed` 🔍
**Type:** fix
**Priority:** high · **Effort:** M
**Depends on:** ~~npc-010~~, ~~settlements-npcs-026~~
**Domain:** `npc`
**Subdomains:** `lifecycle` `inventory`
**Tags:** `corpse-loot` `personal-inventory` `freshness` `persistence`
**Roadmap:** -

## Goal

Naprawić alive → dead ownership handoff tak, aby śmierć NPC przenosiła **cały authoritative `NpcAuthoritativeState.personalInventory` losslessly** do istniejącego `NpcPostDeathState`, bez role/loadout filtering i bez spłaszczania stanu itemów.

Docelowy invariant:

```text
NPC posiada przedmiot
→ NPC umiera
→ dokładnie ten sam stan przedmiotu należy do corpse
→ albo został później zabrany / jawnie przeniesiony dalej
```

Dotyczy to zarówno zwykłych stacków, jak i instance-backed items oraz perishables z pełnymi freshness batches.

Nie tworzyć osobnego uproszczonego „death loot inventory”. Rozszerzyć istniejący corpse/post-death ownership boundary i reuse generic `Inventory` persistence/transfer semantics.

## Current code truth

### Authoritative live ownership

`NpcAuthoritativeState.personalInventory` w `src/settlement/npcState.ts` jest już authoritative osobistym inventory NPC i przeżywa settlement reconstruction, `WorldBundle` rebuild oraz save/load.

`NpcAgent.carried` pozostaje transient work/action payloadem i **nie** jest źródłem corpse belongings. `transportCargo` jest osobnym authoritative ownerem cargo transportowego i również nie należy automatycznie do corpse personal loot.

### Current death handoff

`NpcAgent` po lethal damage wywołuje istniejący one-shot `commitNpcDeath()`; samo `die()` nie jest death edge, bo hydration martwego NPC także używa `die(true)`.

`commitNpcDeath()` w `src/settlement/npcPostDeath.ts` jest już właściwym idempotentnym miejscem handoffu: jeżeli `postDeath` istnieje, niczego nie transferuje ponownie.

Problem leży w aktualnym source/shape lootu:

```text
personalInventory
→ extractNpcLoadoutLoot(personalInventory, role)
→ tylko role/loadout kinds
→ NpcCorpseLootSnapshot { counts, instances }
```

`extractNpcLoadoutLoot()` filtruje rzeczy przez `isNpcLoadoutBelonging()`, więc wszystkie pozostałe realne personal belongings pozostają po śmierci w `personalInventory` zmarłego.

### Persistence mismatch

Generic `Inventory` ma już canonical pełny persisted contents type:

```ts
InventoryContentsSnapshot {
  counts
  instances
  foodBatches?
}
```

oraz istniejące helpery snapshot/restore dla counts, stable item-instance state i food freshness batches.

Tymczasem `NpcCorpseLootSnapshot` przechowuje tylko:

```ts
{ counts, instances }
```

Przez to corpse nie jest dziś zdolny do lossless round-trip perishables nawet gdyby przenosił cały `personalInventory`.

## What is currently lost on NPC death

1. **Wszystkie personal belongings spoza role/loadout classifiera** — np. wydany prowiant, bandages, firestarter, tent/blanket, inne stackable items i przyszłe przekazane gracz→NPC przedmioty.
2. **Perishable freshness batches** — corpse loot schema nie ma `foodBatches`, więc samo `ItemKind + count` nie zachowuje `acquiredAtDays`, checkpointów decay, source species ani innych danych `FoodBatch`.
3. **Semantyczna ciągłość własności** — po śmierci nieprzeniesione personal items nadal siedzą w authoritative inventory martwego NPC, mimo że gameplayowym ownerem powinien być corpse/post-death state.
4. Instance-backed loadout, który faktycznie jest dziś przenoszony, zachowuje stable instance id i wspierany instance state (`durability`, `sharpness`, liquid fill, tent condition), ale tylko dla przefiltrowanych kinds.

Nie zaliczać `NpcAgent.carried` ani `NpcAuthoritativeState.transportCargo` do tej listy — są odrębnymi ownership domains i wymagają osobnych jawnych zasad przy śmierci.

## Authoritative corpse inventory type

Zastąpić corpse-specific persisted contents shape reuse'em istniejącego `InventoryContentsSnapshot` z `src/items/Inventory.ts` albo uczynić `NpcCorpseLootSnapshot` type aliasem do niego, jeżeli nazwa corpse-domain nadal poprawia czytelność API.

Preferowany kontrakt:

```ts
type NpcPostDeathState = {
  // existing transform/lifecycle/burial state
  loot: InventoryContentsSnapshot
}
```

Nie dodawać:

- `DeathLootInventory`,
- `CorpseItem[]`,
- drugiej serializacji itemów,
- corpse-only freshness modelu.

Runtime projection nadal może materializować zwykły `Inventory` przez generic restore helper.

## Lossless death transfer

### One-shot ownership edge

Zachować `commitNpcDeath()` jako jedyny alive → dead commit seam.

Nowy flow:

```text
real lethal transition
→ commitNpcDeath() sees postDeath === null
→ move full personalInventory contents into corpse Inventory
→ snapshot corpse with InventoryContentsSnapshot
→ personalInventory is empty
→ write postDeath atomically within the same death consequence
```

Reconstruction / save-load / stream-in:

```text
postDeath already exists
→ no handoff
→ no reseed
→ no new item ids
```

### Stackable items

Transferować wszystkie stack counts z `personalInventory`, nie whitelistę loadoutu.

Dla zwykłych stacków użyć istniejącego generic `transferInventoryCount()` albo równoważnej małej all-or-nothing composition. Corpse inventory powinien mieć nieograniczoną runtime capacity, więc handoff nie powinien odrzucać legalnie posiadanych przez NPC items.

### Perishables / freshness batches

Dla perishable counts **nie wolno** robić `remove(kind, count)` + `add(kind, count)`.

Reuse `transferInventoryCount(source, destination, kind, count, nowDays)`, które już używa:

```text
removeWithFreshness()
→ exact FoodBatch[]
→ addWithFreshness()
```

Dzięki temu przeniesienie checkpointuje decay pod `nowDays`, zachowuje remaining shelf life/provenance i przechodzi pod decay modifier corpse inventory bez resetu świeżości.

Corpse snapshot następnie zapisuje `foodBatchesToJSON()` poprzez istniejący generic `snapshotInventoryContents()`.

### Instance-backed items

Transferować każdą realną instancję przez istniejący `transferInventoryInstance()`.

Musi zostać zachowane to samo `instance.id` i wszystkie metadata obsługiwane przez `Inventory`/`SaveItemInstance`, w tym obecnie:

- durability,
- sharpness,
- liquid + `amountLitres`,
- tent condition,
- kolejne generic instance metadata dodawane do `Inventory` persistence w przyszłości.

Nie tworzyć nowej instancji na podstawie `ItemKind`, profession ani role.

### Transfer helper granularity

Jeżeli kod potrzebuje operacji „move all contents”, dodać mały generic helper w item layer, np. oparty na iteracji `Inventory` + istniejących `transferInventoryCount` / `transferInventoryInstance`.

Nie dodawać NPC-specific pętli kopiującej serializers ręcznie, jeżeli ten sam helper może bezpiecznie przenieść pełne `Inventory` pomiędzy dwoma ownerami.

## Corpse loot interaction

`corpseLootInventory()` / `snapshotCorpseLoot()` powinny przejść na generic full inventory restore/snapshot helpers.

Transfer corpse → player/receiver musi pozostać transactional i dla perishables używać freshness-aware transfer semantics.

Aktualne `transferCorpseCountTo()` rekonstruuje corpse `Inventory`, ale bez batches; po zmianie snapshotu ma odbudować pełne freshness state i przenosić count przez `transferInventoryCount(..., nowDays)`.

Jeżeli API corpse count transfer nie ma dziś `nowDays`, rozszerzyć je o world-day argument zamiast domyślnie resetować freshness/decay semantics.

`transferCorpseInstanceTo()` powinien reuse `transferInventoryInstance()` po materializacji corpse inventory.

## Natural cleanup / dropped items

Invariant lossless nie kończy się na corpse snapshotie.

`dropNpcCorpseLoot()` przy naturalnym cleanup/burial musi również zachować istniejący state, kiedy loot jest przenoszony do world drops:

- instance-backed item → ten sam `SaveItemInstance`,
- perishable stack → split batches losslessly do unit drops z `FoodBatch` (existing `DroppedItems.drop(..., foodBatch)` seam),
- plain non-perishable stacks → normalne world drops.

Nie wolno po dodaniu `foodBatches` do corpse znowu spłaszczyć ich podczas corpse → world-drop handoff.

Burial path zachowuje aktualną regułę planu npc-011 dotyczącą terminalizacji; jeżeli pozostały loot jest wyrzucany przed terminal state, musi użyć tego samego lossless drop path.

## Persistence and migration

Corpse inventory pozostaje nested w istniejącym:

```text
NpcAuthoritativeState.postDeath
→ NpcStateRegistry.serialize()
→ SaveData.npcStates
```

Nie dodawać top-level `SaveData.npcCorpses` ani osobnego corpse inventory registry.

Zmiana corpse loot persisted schema z `{ counts, instances }` na pełny `InventoryContentsSnapshot` zmienia `SaveData` representation.

Implementacja musi:

1. sprawdzić aktualny `CURRENT_SAVE_VERSION` w momencie implementacji (recon 2026-09-12: `32`),
2. bumpnąć o dokładnie 1,
3. dodać kolejny fail-closed migration step,
4. rozszerzyć current-save validation corpse loot o generic `InventoryContentsSnapshot` / food-batch validation,
5. zaktualizować `saveData.test.ts` fixtures/migration coverage.

Migracja istniejącego corpse lootu:

```text
old { counts, instances }
→ new { counts, instances, foodBatches: absent }
```

Nie można odtworzyć historycznej freshness, której stary save nigdy nie zapisał. Migration zachowuje dokładnie stare dostępne dane i nie fabrykuje batch provenance.

Generic `Inventory` może zastosować istniejący legacy fallback dla perishable counts without batches przy restore; nie wymyślać corpse-specific migracji freshness.

## Death → save/load → loot idempotency

Podstawowy invariant ma być chroniony przez dwa poziomy:

1. **Death edge latch:** `commitNpcDeath()` wykonuje ownership handoff tylko gdy `state.postDeath === null`.
2. **Persisted owner:** po handoff pełne contents żyją w `postDeath.loot`, a `personalInventory` jest puste; oba stany round-tripują razem w jednym `NpcStateSnapshot`.

Dzięki temu:

```text
alive inventory A
→ death transfers A → corpse
→ save stores personal = empty + postDeath.loot = A
→ load restores exactly that
→ die(true) does not call handoff
→ player loots from A once
→ next save stores only remainder
```

Nie używać role/profession/loadout przy restore corpse lub death reconstruction.

## Fauna reuse

Fauna corpse model można reuse'ować **tylko częściowo**:

- shared `decayPhaseFromElapsed` / corpse lifecycle phase semantics już są współdzielone,
- presentation/remains helpers mogą pozostać współdzielonym building blockiem tam, gdzie pasują.

Nie reuse'ować `AnimalAgent` jako corpse inventory ownera i nie przenosić fauna harvest fields (`meatHarvested`, `corpseHeld`) do NPC.

Fauna nie rozwiązuje problemu pełnego generic personal inventory → corpse ownership. Właściwym reuse'em dla lootu jest `Inventory`, `InventoryContentsSnapshot`, `inventoryTransfer.ts`, `FoodBatch` i `DroppedItems`.

## Files / symbols to change

Primary:

- `src/settlement/npcPostDeath.ts`
  - replace/alias `NpcCorpseLootSnapshot`,
  - retire `extractNpcLoadoutLoot()` role filtering,
  - full inventory handoff in `commitNpcDeath()`,
  - full restore/snapshot in corpse interaction,
  - freshness-aware corpse → receiver and corpse → world-drop paths.
- `src/items/Inventory.ts`
  - reuse `InventoryContentsSnapshot`, `snapshotInventoryContents()`, `inventoryFromContents()`; only add generic enumeration/move-all seam if truly missing.
- `src/items/inventoryTransfer.ts`
  - reuse existing count/instance transactional moves; optional generic `transferInventoryContents()` belongs here if needed.
- `src/items/foodItems.ts`
  - reuse batch splitting helpers for lossless perishable world drops; do not create corpse-specific batch utilities.
- `src/settlement/npcState.ts`
  - persisted owner remains unchanged structurally; ensure clone/serialize of `postDeath.loot` carries full snapshot.
- `src/persistence/saveData.ts`
  - current schema validation + version bump + migration.
- `src/items/createDroppedItems.ts`
  - reuse existing foodBatch-capable drop API; change only if current callback surface cannot preserve required batch state.

Tests:

- `src/settlement/npcPostDeath.test.ts`,
- `src/settlement/npcState.test.ts` or existing registry tests,
- `src/items/inventoryTransfer.test.ts`,
- `src/persistence/saveData.test.ts`,
- dropped-item tests only if corpse cleanup path gains new coverage there.

`src/ai/NpcAgent.ts` should require at most call-signature cleanup (`role` becomes unnecessary for corpse loot); do not move lifecycle ownership into `die()`.

## Non-goals

- moving `NpcAgent.carried` work payload into corpse,
- resolving `transportCargo` death recovery/order semantics,
- inheritance / household return of belongings,
- corpse legal ownership/reputation,
- burial redesign,
- fauna harvest redesign,
- equipment-slot redesign,
- changing personal inventory seeding policy,
- new top-level save collection.

## Verification

### Lossless ownership handoff

1. NPC with mixed personal inventory dies once.
2. After `commitNpcDeath()` personal inventory contains none of the transferred belongings.
3. Corpse contains every previous personal item, including kinds unrelated to role/loadout.
4. `NpcAgent.carried` and `transportCargo` are untouched.

### Stackables / perishables

5. Plain stack counts match exactly before vs corpse after.
6. Multiple freshness batches of the same food kind keep count, acquisition/decay checkpoint and provenance across death.
7. Corpse save/load preserves the same batches.
8. Corpse → player transfer preserves freshness and capacity failure leaves corpse unchanged.
9. Corpse cleanup → world drops preserves perishable batches instead of recreating day-0 food.

### Item instances

10. Weapon/trap/tent/liquid-container instances keep the same stable ids and supported state across death → save → load → loot.
11. No new instance is minted from role/profession on death, reconstruction or load.

### Idempotency

12. Calling the death consequence again with existing `postDeath` does not move/mint anything.
13. Save immediately after death, reload, then loot: item exists exactly once.
14. Save after partial looting, reload: only remainder exists.
15. Stream-out/in and `WorldBundle` rebuild do not replay handoff.

### Persistence / migration

16. Previous-version corpse `{ counts, instances }` migrates successfully to current shape without invented freshness.
17. Current-version validator rejects malformed food batches / invalid instance rows.
18. `NpcStateRegistry.serialize()` → restore round-trip preserves full corpse contents and empty post-death personal inventory.

### Regression

Run the smallest relevant automated set plus TypeScript/build as required by current repo workflow. Browser/manual gameplay verification is performed by the user, not AI.

## Implementation guidance

Add/update JSDoc for the authoritative handoff / full-corpse-inventory helpers when it improves preflight discovery; use `@domain npc` or `@domain items-player` according to ownership.

Prefer the smallest change that removes the lossy corpse-specific serialization path and composes existing generic inventory mechanisms.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
