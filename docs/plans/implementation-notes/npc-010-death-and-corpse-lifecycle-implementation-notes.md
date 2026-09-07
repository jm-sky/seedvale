# Implementation Notes: NPC Death & Corpse Lifecycle

**Plan:** `npc-010-death-and-corpse-lifecycle.md`
**Recon:** 2026-09-07, current `main`

## Najważniejsza korekta względem starego planu

NPC runtime state nie jest już tylko in-session.

`NpcAuthoritativeState` jest właścicielem siedmiu pól (`health`, `stamina`, `vigor`, `needs`, `physicalInjury`, `helperAssignment`, `activePlan`), a `NpcStateRegistry.serialize()` zapisuje je jako `NpcStateSnapshot`. `buildSaveData()` umieszcza snapshot w `SaveData.npcStates`; load przekazuje go przez `createWorldBundle()` → `SettlementsManager` → `createNpcStateRegistry(initialNpcStates)`. `rebuildWorldBundle()` używa tego samego snapshot/restore boundary.

W praktyce `health.dead` przeżywa dziś:

- settlement unload/reload,
- `WorldBundle` rebuild,
- pełny save/load.

Nie budować corpse-only save path równolegle do tego mechanizmu.

Uwaga: komentarze w `src/settlement/npcState.ts` przy `helperAssignment`, `activePlan` i `NpcStateSnapshot` nadal miejscami twierdzą, że NPC state nie jest częścią `SaveData`. To stale comments po planie 197; zachowanie kodu i `SaveData.npcStates` są źródłem prawdy.

## Aktualny death flow

`NpcAgent.applyIncomingCombatDamage()` rozwiązuje defense i kieruje faktyczny damage do `takeDamage()`.

`takeDamage()`:

1. mutuje shared `HealthState`,
2. aktualizuje `physicalInjury`, vigor i blood trace,
3. przy `health.dead` wywołuje `die()`.

`die()` już poprawnie:

- zwalnia aktywny work contract,
- czyści in-flight action/conversation/combat state,
- resetuje attack/projectile state,
- odtwarza death animation albo fallback pose,
- zeruje prezentację HP,
- powoduje, że dalszy normalny update martwego NPC nie przebiega.

Nie przenosić tego cleanup do nowego corpse systemu.

### Krytyczna pułapka: `die()` nie jest edge eventem

Konstruktor po utworzeniu mesh ustawia NPC w `home.position`, a gdy hydrated `health.dead === true`, wywołuje `die(true)`. `npc-009` używa tego specjalnie, aby odtworzyć settled death pose bez replayowania animacji.

Dlatego:

```text
die() / die(true)
≠
"NPC właśnie umarł"
```

Nie tworzyć corpse/loot bezpośrednio w `die()`. Potrzebny jest idempotentny alive→dead consequence zapisujący post-death state tylko przy rzeczywistym pierwszym lethal transition. Reconstruction jedynie materializuje istniejący persisted state.

## Gdzie powinien żyć corpse state

Najmniejszy spójny ownership boundary to rozszerzenie istniejącego `NpcAuthoritativeState` / `NpcStateSnapshot` o post-death state.

Powód:

- registry już jest keyed stable `NpcId`,
- już ma dokładnie właściwy settlement/save/rebuild lifetime,
- martwy NPC pozostaje w deterministycznym rosterze, więc nie potrzeba osobnego identity registry,
- osobny top-level `SaveData.npcCorpses` duplikowałby lifecycle tego samego entity.

Preferowany model semantyczny:

```ts
NpcAuthoritativeState {
  health: HealthState
  // ...existing fields
  postDeath: NpcPostDeathState | null
}
```

Nie przywiązywać implementacji do tej konkretnej nazwy, ale stan musi rozróżniać co najmniej:

- brak śmierci,
- aktywny corpse,
- terminalny cleanup/no active corpse,
- przyszły burial claim/handoff bez wdrażania burial.

Dla aktywnego corpse potrzebne są dane, których obecnie nie ma w save:

- death position (`x/y?` lub `x/z` + ground resample) i yaw jeśli potrzebny,
- trwały lifecycle/death-time anchor,
- loot snapshot,
- flags potrzebne do idempotencji/processing.

### Death position jest konieczna

Obecnie dead NPC przy load/reconstruction startuje w `home.position`, bo pozycja NPC nie jest częścią `NpcStateSnapshot`. Bez nowej post-death pozycji corpse po save/load przeskoczyłby do domu.

Nie próbować rekonstruować death position z aktualnego `NpcAgent.mesh` podczas hydration — wtedy mesh już reprezentuje świeżo utworzonego NPC w home.

## Lifecycle: reuse idei z fauna, nie klasy

Animal corpse pipeline nie jest generic corpse systemem. Jest zaszyty w `AnimalAgent` przez m.in.:

- `timeSinceDeath`,
- `corpseHeld`,
- `meatHarvested`,
- `CorpsePhase`,
- `corpsePhaseFromElapsed()`,
- `readyToRemove()`,
- presentation helpers (`harvestedRemains`, rot FX).

Fauna daje dobry reference dla:

- faz `fresh → rotting → bones → removed`,
- separacji simulation truth od presentation,
- idempotentnego cleanup,
- tombstone po usunięciu deterministycznie respawnowanego livestock.

Nie uzależniać NPC od `AnimalAgent`. Jeżeli timing/phase rules mają być identyczne, wyciągnąć mały pure shared helper zamiast tworzyć hierarchię „generic corpse agent”.

### Preferuj absolute/lazy time anchor

Animal runtime może trzymać `timeSinceDeath` w sekundach. Dla NPC lepszy jest trwały anchor oparty o world simulation time (`elapsedDays`/world days), bo:

- `NpcAgent.simClock` jest runtime-only,
- settlement może być unloaded,
- save/load i time skip muszą zachować wiek corpse,
- nie trzeba globalnie tickować corpse daleko od gracza.

Po materialize można wyliczyć aktualną fazę z `nowDays - deathAtDays`. Processing/loot/burial flags pozostają authoritative, a czysto czasowa faza może być derived.

To spełnia world independence bez dodawania w tym planie pełnej off-screen symulacji żywych NPC.

## Persistence i migration

Aktualnie `CURRENT_SAVE_VERSION = 6`; istnieje realny `SAVE_MIGRATIONS` chain i write/read validation.

Jeżeli implementation rozszerza persisted `NpcStateSnapshot`, należy:

1. bumpnąć `CURRENT_SAVE_VERSION`,
2. dodać pojedynczą migrację z poprzedniej wersji,
3. rozszerzyć `isSaveData()`/validator post-death fields,
4. rozszerzyć test fixture i migration tests w `src/persistence/saveData.test.ts`,
5. przetestować `NpcStateRegistry` serialize → hydrate round-trip.

Nie obchodzić tego przez opcjonalne pole z komentarzem „stare save'y domyślnie null”: obecna konwencja repo wymaga migracji przy zmianie persisted representation/semantics.

### Legacy dead NPC

Stary save może mieć:

```ts
health.dead === true
```

ale nie ma:

- rzeczywistej death position,
- death time,
- corpse state,
- corpse loot.

Migracja nie może tych danych wiarygodnie odtworzyć.

Najbezpieczniejszy default:

```text
legacy alive → postDeath = null
legacy dead  → terminal/no-active-corpse legacy state
```

lub równoważna reprezentacja.

Nie generować dla legacy dead NPC świeżego corpse z `home.position` ani loadout lootu. To tworzyłoby fikcyjną historię i może duplikować item instances.

Od pierwszego save po implementacji nowe śmierci zapisują pełny post-death state i odtwarzają go normalnie.

## `NpcAgent.carried` i loot ownership

`carried` nadal jest prywatnym, runtime-only `Inventory` z małym carry capem. Domain docs trafnie opisują je jako krótki hold między claim/extraction a delivery; nie jest persisted belongings inventory.

Jednocześnie combat używa tego samego inventory do loadoutu.

Aktualny kod `npcLoadout.ts`:

| Role | startowy loadout |
|---|---|
| `woodcutter` | `axe` + `knife` |
| `guard` | `long_sword` |
| `hunter` | `hunting_bow` + `knife` + 6 `arrow` |
| pozostałe role | `knife` fallback |

`seedDefaultRoleWeapon()` tworzy realne weapon `ItemInstance`, więc durability/sharpness live na tej instancji podczas sesji.

`npc-019` nie zmienił tego ownership modelu. Dodał deterministic SPEA + shared Strength→melee rule; lethal damage dalej przechodzi przez ten sam `takeDamage()`.

### Jak klasyfikować loot

Nie robić:

```ts
corpse.inventory = npc.carried
```

bo `carried` może zawierać:

- ore w drodze do economy,
- household food/wood/water-related payload,
- harvest z polowania przed delivery,
- exchange/helper delivery goods,
- crafted/resupplied arrows i inne materiały pracy.

Role loadout jest dziś jedynym wyraźnym semantycznym sygnałem „to jest wyposażenie tego NPC”, ale nadal nie ma osobnego ownership tagu per item.

Jeżeli v1 ma lootować wyposażenie, dodaj minimalny classifier bazujący na istniejących `npcLoadout` semantics. Na alive→dead edge przenieś **rzeczywistą aktualną instancję** kwalifikującego się wyposażenia z `carried` do persisted corpse loot. Nie twórz nowej instancji na podstawie roli.

Dla arrows trzeba podjąć jawnie decyzję, czy są personal carried ammo czy household work supply. Kod nie daje ownership flag; nie zgadywać przez „wszystko co hunter niesie”.

Nie rozszerzać planu do persisted personal inventory żywego NPC, chyba że implementacja wykaże, że bez tego wymagane semantics są niemożliwe. Corpse loot może stać się persisted dopiero na death edge.

## Corpse loot storage / transfer

Nie potrzeba nowej klasy itemów. Reuse:

- `Inventory`,
- existing item instance serialization shape,
- `canAdd` / `canAddInstance` + atomic remove/add semantics,
- obecne capacity/weight rules.

Post-death snapshot powinien przechowywać plain data, nie `Inventory` object. Przy materialize można zbudować Inventory z persisted counts/instances, analogicznie do innych owners w repo.

Transfer musi mieć kolejność:

```text
validate receiver capacity
→ add receiver
→ remove/mutate corpse ownership exactly once
```

albo istniejący atomic helper o równoważnej semantyce. Failed transfer pozostawia corpse bez zmian.

## Relationships / reputation

Nie ma obecnie seam'u, który odpowiada na pytanie „czy gracz ma prawo zabrać przedmiot po tym NPC”.

Istnieją:

- `NpcRelationships`: symmetric NPC↔NPC, persisted, dziś używane przez conversation outcomes,
- `QuestManager` player↔NPC relation keyed by NPC name oraz standing lookup używany społecznie,
- family/household mapping z `createSettlement.ts`.

Żaden z tych systemów nie jest ownership/legal authority.

Nie stosować kary reputacji na podstawie samego faktu lootowania i nie traktować family/household jako automatycznego „heir authorization”. V1 powinno pozostać neutralne. Jeżeli UI/interact resolver potrzebuje seam'u, może istnieć inert callback/result do późniejszego ownership planu, ale bez nowego globalnego managera.

## Household / death consequences

Family → household → house mapping już istnieje i jest stabilnie odtwarzany deterministycznie. `Household` oraz NPC↔NPC relations są persisted.

Nie oznacza to, że `npc-010` ma aktualizować family roster, ekonomię albo relacje po śmierci. Household response, inheritance, mourning i burial decisions pozostają poza scope.

Ważne tylko, aby corpse state był keyed tym samym stable `NpcId`; `npc-011` może później rozwiązać family/household z istniejącej settlement definicji zamiast duplikować genealogy w corpse.

## Materialization i cleanup

Preferowany flow:

```text
real lethal edge
→ write postDeath state (position/time/loot/status)
→ die() runtime cleanup / death presentation
→ settlement materializes corpse while loaded
→ stream-out: mesh disappears, state stays in NpcStateRegistry
→ stream-in/load: resolve phase from persisted state + world time
→ terminal cleanup: mark postDeath terminal, dispose presentation
```

Do natural cleanup nie używać samego `scene.remove()` jako źródła prawdy.

Po terminal cleanup `health.dead` nadal pozostaje `true`. To jest ważna różnica względem livestock tombstone: NPC nie jest usuwany z deterministic roster, tylko jego corpse przechodzi do terminalnego stanu.

Nie kopiować `removedLivestockIds` tylko dlatego, że fauna go ma. Livestock potrzebuje tombstone, żeby deterministic spawning nie odtworzył całego zwierzęcia. NPC ma już persisted dead authoritative state keyed stable id.

## Burial handoff

`npc-011` potrzebuje później możliwości zatrzymania naturalnego cleanup i przejęcia corpse. W `npc-010` wystarczy mała persisted semantyka typu active/claimed/terminal albo równoważna.

Nie projektować teraz burial task queue, grave id ani funeral ownership.

## Testy, które realnie chronią regresje

Najważniejsze focused tests:

- `NpcStateRegistry`: alive/dead + postDeath serialize/hydrate round-trip,
- current-version save validator przy poprawnym/błędnym postDeath,
- migration: legacy alive → no postDeath,
- migration: legacy dead → terminal/no fabricated corpse,
- lethal edge tworzy state/loot raz,
- constructor hydration `die(true)` nie tworzy nowego state/loot,
- death transform round-trip — corpse nie wraca do home,
- lifecycle phase z absolute time anchor po dużym skoku czasu,
- terminal cleanup nie odtwarza corpse po stream/reload,
- item instance ID/durability zachowane przez corpse save/load,
- failed inventory transfer nie usuwa loot.

Docs-only update nie wymaga uruchamiania testów/build. Podczas implementacji uruchomić istniejące NPC/persistence tests i build.

## Pułapki

- Nie traktuj `die()` jako one-shot death event — hydration też je wywołuje.
- Nie zapisuj corpse tylko jako Three.js object/world prop bez authoritative record.
- Nie wykorzystuj `NpcAgent.simClock` jako persisted corpse age.
- Nie twórz corpse w home dla legacy dead NPC.
- Nie seeduj loadoutu drugi raz jako loot po loadzie.
- Nie zapisuj całego `carried` jako własności osobistej.
- Nie przenoś household/economy stock do corpse.
- Nie wprowadzaj osobnego corpse save collection bez potrzeby.
- Nie kopiuj livestock tombstone mechanicznie; problem identity NPC jest już rozwiązany przez `NpcStateRegistry`.
- Nie używaj NPC↔NPC relations ani `QuestManager` relation jako legal ownership.
- Nie rozszerzaj tego planu do full unloaded-settlement NPC simulation.
- Nie zmieniaj shared Strength/melee path z `npc-019`.

## Recon discrepancy poza scope tego update

`docs/state/combat.md` opisuje starszą wersję role loadout, w której część profesji była unarmed. Aktualny `src/ai/npcLoadout.ts` daje każdej roli co najmniej `knife` fallback. Dla implementacji `npc-010` kierować się kodem; tego osobnego state doc nie zmieniano w ramach tego zadania.
