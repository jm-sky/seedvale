# Plan: NPC personal inventory and persistent belongings

**Created:** 2026-09-08
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** none
**Domain:** `settlements-npcs`
**Subdomains:** `logistics` `household`
**Tags:** `npc-inventory` `ownership` `persistence` `equipment`
**Roadmap:** `quests-abandoned-gold-mine-colony.md`
**Implemented at:** 2026-09-09 09:17

## Goal

Dać każdemu NPC trwałą własność osobistych przedmiotów niezależną od lifetime konkretnego `NpcAgent`, tak aby NPC mógł posiadać wyposażenie, zachować je podczas settlement streaming, save/load i długiej podróży oraz później używać tych samych realnych itemów.

Personal inventory jest fundamentalną częścią tożsamości każdego NPC, nie mechanizmem tworzonym dopiero dla ekspedycji lub „ważnych” postaci. Każdy NPC ma zawsze personal inventory, nawet jeśli jest ono puste.

Pierwszym konsumentem ma być ekspedycja z mother settlement do odległej lokalizacji w roadmapie opuszczonej kopalni, ale mechanizm nie może być quest-specific.

## Recon baseline

Aktualny kod już ma:

- generic `Inventory` używane przez różnych właścicieli,
- `ItemKind`/catalog, item instances, food freshness i liquid-container instances,
- `NpcAuthoritativeState` / `NpcStateRegistry` keyed by stable `npc.id`, przeżywające settlement reconstruction, `WorldBundle` rebuild i pełny save/load,
- household `items: Inventory`,
- krótkotrwałe `NpcAgent.carried` używane przez bieżące akcje i transport.

Aktualne `NpcAgent.carried` nie jest właściwym authoritative miejscem dla wielodniowych osobistych belongings. Nie tworzyć expedition-specific tablicy itemów ani drugiej klasy inventory.

## Required ownership model

Wymagany invariant:

```text
item belongs to exactly one authoritative owner

source storage
    ↓ transactional transfer
NPC personalInventory
    ↓ optional later transfer/use/death handoff
another authoritative owner
```

Personal inventory należy do stabilnej tożsamości NPC przez `NpcAuthoritativeState`, nie do renderowanego `NpcAgent`, household ani ekspedycji.

Docelowy ownership:

```text
NpcStateRegistry
└── npcId
    └── NpcAuthoritativeState
        ├── health / needs / plans / ...
        └── personalInventory: Inventory
```

Nie tworzyć osobnego `NpcInventoryRegistry`: byłby drugim registry keyed tym samym `npcId`, z tym samym lifecycle i persistence boundary.

Live `NpcAgent` może udostępniać cienkie API lub bezpośrednią referencję do tego samego authoritative `Inventory`, analogicznie do innych pól `NpcAuthoritativeState`, ale reconstruction nie może tworzyć świeżej kopii ani seedować wyposażenia ponownie.

## Scope

### 1. Personal inventory on every NPC

Każdy `NpcAuthoritativeState` ma zawsze posiadać `personalInventory`, również gdy jest ono puste.

Nie tworzyć inventory lazy tylko dla NPC podróżujących, wyposażonych, ważnych dla questa lub aktualnie załadowanych. Brak przedmiotów oznacza pusty `Inventory`, nie brak ownership container.

### 2. Authoritative state ownership

Rozszerzyć istniejący `NpcAuthoritativeState` o authoritative personal inventory.

Preferowany model:

```ts
type NpcAuthoritativeState = {
  readonly id: NpcId
  // existing authoritative state
  readonly personalInventory: Inventory
}
```

`NpcStateRegistry.getOrCreate()` tworzy pusty personal inventory tylko przy rzeczywistym utworzeniu nowego authoritative NPC state lub podczas migracji legacy state bez tego pola.

Nie rozszerzać runtime-only stanu `NpcAgent` o drugą kopię inventory.

### 3. Reuse generic Inventory semantics

Zachować istniejące semantics generic `Inventory`:

- stack counts,
- item instances,
- food freshness batches,
- liquid-container instance state,
- weight/size/capability metadata tam, gdzie obecny `Inventory` je egzekwuje.

Nie tworzyć uproszczonego `ExpeditionItem[]`, `NpcItem[]` ani osobnego inventory modelu dla NPC.

Ten plan nie buduje nowego RPG encumbrance/carry-weight systemu. Jeżeli generic `Inventory` już egzekwuje ograniczenia, NPC mają ich używać. Brakujące bardziej zaawansowane limity udźwigu są osobnym zakresem.

### 4. Streaming and reconstruction

Scenariusz obowiązkowy:

```text
NPC owns item
→ settlement streams out / NpcAgent disposed
→ settlement streams in / NpcAgent reconstructed
→ same NPC still owns same item instance/count/state
```

`NpcAgent` po reconstruction ma dostać dostęp do tego samego authoritative personal inventory przez istniejący `NpcStateRegistry` ownership boundary.

Reconstruction nie może ponownie pobierać itemu ze źródła ani seedować loadoutu.

### 5. Save/load

Rozszerzyć istniejący `NpcStateSnapshot` / `SaveData.npcStates` persistence flow o snapshot personal inventory zamiast tworzyć osobny top-level save registry.

Preferowany przepływ:

```text
NpcAuthoritativeState.personalInventory
    ↓
NpcStateRegistry.serialize()
    ↓
NpcStateSnapshot
    ↓
SaveData.npcStates
    ↓ load
createNpcStateRegistry(...)
    ↓
restored personalInventory
```

Snapshot musi zachować wszystkie wspierane przez generic `Inventory` dane potrzebne do pełnego round-trip, w tym item instance state, freshness i liquid-container state.

Użyć aktualnego SaveData version/migration/validation mechanism. Existing saves bez personal inventory odtwarzają pusty personal inventory dla każdego NPC. Nie seedować przy migracji wyposażenia na podstawie profession, role, household ani loadoutu.

### 6. Relationship with transient `NpcAgent.carried`

Zachować dwa różne pojęcia:

```text
personalInventory = rzeczy należące do NPC
carried           = transient payload transportowany w ramach bieżącej akcji
```

Przykłady personal inventory:

- własny kilof/nóż,
- prowiant wydany NPC na wyprawę,
- własny waterskin,
- osobiste belongings.

Przykłady `carried`:

- drewno przenoszone las → magazyn,
- ruda przenoszona kopalnia → storage,
- towar dostarczany dla household/economy,
- inny krótkotrwały work/action payload.

Nie migrować mechanicznie istniejących `carried` usages do personal inventory. Sama obecność itemu w `carried` nie oznacza ownership.

Jeżeli istniejące combat/loadout semantics wykorzystują `carried` także jako tymczasowy runtime dostęp do broni, przed implementacją rozdzielić ownership od runtime-use bez tworzenia drugiego authoritative inventory. Docelowo osobista broń należąca do NPC powinna pochodzić z `personalInventory`, nawet jeżeli runtime combat nadal potrzebuje cienkiego view/reference dla bieżącej akcji.

### 7. Transactional transfers

Transfer authoritative ownership do lub z NPC musi używać istniejących generic inventory/item-transfer semantics i być transactional.

Wymagany invariant:

```text
before: item belongs to source
transfer succeeds exactly once
after:  item belongs to NPC
```

Nie dopuszczać stanów, w których ten sam instance/count pozostaje równocześnie w source storage i personal inventory.

Transfer failures nie mogą częściowo usuwać item instances, freshness batches ani liquid state.

### 8. Equipment/use semantics

Ten plan zapewnia ownership i dostęp do istniejących itemów. Nie tworzy pełnego RPG equipment-slot systemu.

Jeżeli istniejące NPC work/action semantics potrafią użyć capability z inventory, należy je reuse. Nowe generic NPC-use API dodawać tylko wtedy, gdy jest potrzebne do zachowania spójności ownership.

## Death / corpse handoff

`settlements-npcs-026` nie implementuje corpse lifecycle ani corpse interaction, ale ustanawia ownership contract wymagany przez `npc-010-death-and-corpse-lifecycle.md`.

Po wdrożeniu personal inventory właściwy death handoff ma być jawny i transactional:

```text
NPC alive
└── NpcAuthoritativeState.personalInventory

alive → dead
      ↓ ownership handoff

NpcPostDeathState / corpse
└── corpse Inventory
```

Zasady:

- śmierć nie może automatycznie zwracać belongings do household/economy,
- belongings nie mogą znikać ani być regenerowane na podstawie profession/role,
- `NpcAgent.carried` nie jest źródłem osobistego corpse loot,
- rzeczy należące do NPC mają przejść z `personalInventory` do authoritative corpse/post-death inventory dokładnie raz,
- szczegółowy trigger alive→dead, corpse persistence, loot interaction, decay i burial handoff pozostają własnością `npc-010` / `npc-011`.

`npc-010` wymaga follow-up integration po implementacji `settlements-npcs-026`, tak aby jego obecne loadout/corpse semantics zostały przełączone na authoritative personal belongings bez tworzenia parallel ownership path.

## Expedition items confirmed during recon

Nie kodować zestawu ekspedycyjnego w tym planie, ale projekt musi poprawnie obsłużyć istniejące realne kinds/instances potrzebne kolejnemu planowi, m.in.:

- `pickaxe`,
- `knife`,
- `shovel`,
- `tent`,
- `blanket`,
- `dried_meat`,
- `dried_fish`,
- `firestarter`,
- `bandage`,
- istniejące waterskin liquid-container instances.

Nie wymyślać nowych `ItemKind` tylko dla ekspedycji.

## Persistence and idempotency invariants

- każdy NPC ma zawsze dokładnie jeden authoritative personal inventory,
- personal inventory należy do `NpcAuthoritativeState`,
- nie istnieje osobny `NpcInventoryRegistry`,
- stream-in nie seeduje inventory ponownie,
- save/load nie duplikuje item instances,
- legacy save bez personal inventory daje pusty inventory,
- transfer do/z NPC jest transactional,
- item metadata/freshness/liquid state nie giną przy persistence,
- `NpcAgent.carried` pozostaje transient action payload, a nie ownership source,
- dead/unloaded NPC nie powoduje automatycznego zwrotu ani recreation belongings,
- death handoff do corpse jest one-shot ownership transfer wykonywany przez `npc-010` integration.

## Non-goals

- expedition candidate selection,
- expedition provisioning policy,
- spawning NPC,
- profession changes,
- global travel,
- relocation/migration,
- colony bootstrap,
- quest implementation,
- pełny wearable/equipment-slot system,
- nowy RPG encumbrance system,
- corpse lifecycle / decay / burial,
- corpse interaction redesign poza wymaganym ownership contract.

## Likely integration points

- `src/items/Inventory.ts`,
- `src/items/items.ts` / item catalog,
- `src/ai/NpcAgent.ts`,
- `src/settlement/npcState.ts` (`NpcAuthoritativeState`, `NpcStateSnapshot`, `NpcStateRegistry`),
- `src/settlement/household.ts`,
- SaveData schema/migrations/validators,
- existing transport/carrying implementation,
- `npc-010-death-and-corpse-lifecycle.md` jako downstream death ownership integration.

Implementation preflight ma zweryfikować aktualne nazwy helperów/snapshotów i istniejące Inventory serialization semantics, ale nie ponownie otwierać ustalonego ownership modelu bez konkretnego konfliktu z kodem.

## Verification

Automated tests powinny pokryć:

- każdy nowy NPC dostaje pusty personal inventory,
- dwa różne NPC nie współdzielą tego samego inventory object/state,
- transfer source → NPC bez duplikacji,
- transfer failure pozostawia source i NPC w spójnym stanie,
- stream-out/in continuity,
- `WorldBundle` rebuild continuity,
- save/load continuity,
- legacy save → empty personal inventory,
- item-instance/liquid/freshness preservation,
- repeated restoration/idempotency,
- `carried` work payload nie zostaje automatycznie przeniesiony do personal inventory.

Death/corpse integration tests należą do follow-up `npc-010` i powinny potwierdzić one-shot `personalInventory → corpse Inventory` bez duplikacji.

Manual browser verification wykonuje użytkownik; AI nie wykonuje browser verification.

## Documentation

Dla ważnych nowych public/architectural functions/classes dodać JSDoc, gdy pomaga preflight discovery; użyć `@domain settlements-npcs` tam, gdzie pasuje.

Po implementacji zaktualizować state docs opisujące authoritative NPC state oraz relację `personalInventory` ↔ transient `NpcAgent.carried`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**