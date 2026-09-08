# Plan: NPC personal inventory and persistent belongings

**Created:** 2026-09-08
**Status:** `draft` 📝
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** none
**Domain:** `settlements-npcs`
**Subdomains:** `logistics` `household`
**Tags:** `npc-inventory` `ownership` `persistence` `equipment`
**Roadmap:** `quests-abandoned-gold-mine-colony.md`

> **Draft note:** ten plan jest wstępnym szkicem fundamentu pod ekspedycję NPC. Przed zmianą statusu na `planned` wymaga osobnego review aktualnego kodu, ustalenia granic ownership/persistence oraz poprawek wynikających z tych ustaleń. Nie implementować bez tego review.

## Goal

Dać realnemu NPC trwałą własność osobistych przedmiotów niezależną od lifetime konkretnego `NpcAgent`, tak aby NPC mógł posiadać wyposażenie przed wyruszeniem, zachować je podczas settlement streaming, save/load i długiej podróży oraz później używać tych samych realnych itemów.

Pierwszym konsumentem ma być ekspedycja z mother settlement do odległej lokalizacji w roadmapie opuszczonej kopalni, ale mechanizm nie może być quest-specific.

## Recon baseline

Aktualny kod już ma:

- generic `Inventory` używane przez różnych właścicieli,
- `ItemKind`/catalog, item instances, food freshness i liquid-container instances,
- NPC authoritative state przeżywający reconstruction/save-load,
- household `items: Inventory`,
- krótkotrwałe NPC carrying/inventory semantics używane przez bieżące akcje.

Aktualne NPC carrying nie jest jednak właściwym authoritative miejscem dla wielodniowych osobistych belongings. Nie tworzyć expedition-specific tablicy itemów ani drugiej klasy inventory.

## Required ownership model

Wymagany invariant:

```text
item belongs to exactly one authoritative owner

source storage
    ↓ transactional transfer
NPC identity
    ↓ optional later transfer/use/drop
another authoritative owner
```

Osobisty inventory ma należeć do stabilnej tożsamości NPC, nie do renderowanego `NpcAgent`.

Live `NpcAgent` może udostępniać cienkie API do tego inventory, ale reconstruction nie może tworzyć świeżej kopii ani seedować wyposażenia ponownie.

## Scope

### 1. Persistent NPC belongings state

Wprowadzić najmniejszą reprezentację persistent personal inventory keyed by istniejący stable NPC identity.

Przed implementacją zweryfikować, czy najlepszym ownerem jest istniejący NPC authoritative-state registry, osobny bounded registry, czy rozszerzenie istniejącego snapshot contract. Nie rozszerzać całego runtime `NpcAgent` state tylko dlatego, że inventory wymaga persistence.

### 2. Reuse generic Inventory semantics

Zachować istniejące semantics:

- stack counts,
- item instances,
- food freshness batches,
- liquid-container instance state,
- weight/size/capability metadata tam, gdzie obecny `Inventory` je egzekwuje.

Nie tworzyć uproszczonego `ExpeditionItem[]`.

### 3. Streaming and reconstruction

Scenariusz obowiązkowy:

```text
NPC owns item
→ settlement streams out / NpcAgent disposed
→ settlement streams in / NpcAgent reconstructed
→ same NPC still owns same item instance/count
```

Reconstruction nie może ponownie pobierać itemu ze źródła.

### 4. Save/load

Personal belongings potrzebne dla długotrwałych commitments muszą przeżyć save/load przez istniejący SaveData version/migration mechanism.

Existing saves bez personal belongings powinny odtwarzać pusty personal inventory dla NPC, chyba że podczas review zostanie potwierdzony bezpieczny istniejący seeding contract.

### 5. Relationship with transient carrying

Przed implementacją rozstrzygnąć aktualne zastosowania `NpcAgent` carrying:

- które są wyłącznie transient action payload,
- które faktycznie reprezentują przedmioty należące do NPC,
- czy live carrying powinno wskazywać na personal inventory, czy pozostać osobnym krótkotrwałym mechanizmem.

Nie migrować mechanicznie wszystkich istniejących `carried` usages.

### 6. Equipment/use semantics

Ten plan zapewnia ownership i dostęp do istniejących itemów. Nie tworzy pełnego RPG equipment-slot systemu.

Jeżeli istniejące NPC work/action semantics potrafią użyć capability z inventory, należy je reuse. Nowe generic NPC-use API dodawać tylko wtedy, gdy jest potrzebne do zachowania spójności ownership.

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

- jeden authoritative personal inventory per NPC identity,
- stream-in nie seeduje inventory ponownie,
- save/load nie duplikuje item instances,
- transfer do NPC jest transactional,
- item metadata/freshness/liquid state nie giną przy persistence,
- dead/unloaded NPC nie powoduje automatycznego zwrotu ani recreation belongings.

Death/corpse recovery może pozostać osobnym problemem, jeśli aktualny death system nie daje bezpiecznego ownership handoff.

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
- corpse inventory redesign.

## Likely integration points to verify during review

- `src/items/Inventory.ts`,
- `src/items/items.ts` / item catalog,
- `src/ai/NpcAgent.ts`,
- NPC authoritative state/persistence registry,
- `src/settlement/household.ts`,
- SaveData schema/migrations,
- existing transport/carrying plans and implementation.

Nazwy/scope plików są wskazówką z reconu, nie zamiennikiem implementation preflight.

## Verification

Automated tests powinny pokryć:

- transfer source → NPC bez duplikacji,
- stream-out/in continuity,
- save/load continuity,
- item-instance/liquid/freshness preservation,
- repeated restoration/idempotency.

Manual browser verification wykonuje użytkownik; AI nie wykonuje browser verification.

## Documentation

Dla ważnych nowych public/architectural functions/classes dodać JSDoc, gdy pomaga preflight discovery; użyć `@domain settlements-npcs` tam, gdzie pasuje.

> **Zrób git commit i push do main, rebase jeżeli trzeba**