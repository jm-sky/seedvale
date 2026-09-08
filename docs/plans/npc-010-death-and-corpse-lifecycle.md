# Plan: NPC Death & Corpse Lifecycle

**Created:** 2026-09-01
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** medium · **Effort:** L
**Depends on:** ~~177~~
**Domain:** `npc`
**Roadmap:** `npc-professions-households-and-age`  

## Cel

Wprowadzić spójny lifecycle śmierci NPC, wykorzystując istniejące mechanizmy combat, `HealthState`, persisted `NpcAuthoritativeState`, `Inventory` oraz fauna corpse lifecycle jako punkt odniesienia.

Śmierć NPC ma stać się trwałą zmianą świata:

```
NPC alive
  ↓
lethal damage
  ↓
HealthState dead
  ↓
persisted NPC post-death state
  ↓
corpse
  ↓
loot / natural decay
  ↓
cleanup / terminal state
```

System ma działać niezależnie od gracza i kamery oraz zachowywać spójność przez settlement streaming, `WorldBundle` rebuild i pełny save/load.

## Zakres

### 1. Death transition

Wykorzystać `HealthState` jako jedyne źródło prawdy o życiu NPC.

Po rzeczywistym przejściu alive → `dead`:

- combat i aktywne akcje zostają zakończone,
- NPC nie wykonuje dalszych zwykłych akcji,
- inicjowany jest post-death/corpse state,
- śmierć jest przetwarzana dokładnie raz.

`NpcAgent.takeDamage()` pozostaje wejściem dla aktualnych źródeł obrażeń, a `NpcAgent.die()` pozostaje cleanup/presentation runtime. Nie podpinać tworzenia corpse bezpośrednio pod każde wywołanie `die()`: konstruktor wywołuje `die(true)` także dla NPC odtworzonego z już zapisanym `health.dead`.

Nie tworzyć osobnego systemu HP/death.

### 2. Authoritative post-death state

`NpcAuthoritativeState` / `NpcStateRegistry` już przeżywa settlement unload/reload, `WorldBundle` rebuild oraz pełny save/load przez `SaveData.npcStates`.

Rozszerzyć ten istniejący ownership boundary o minimalny persisted post-death/corpse state zamiast tworzyć równoległy globalny registry wyłącznie dla zwłok.

Stan potrzebny do odtworzenia corpse powinien obejmować co najmniej informacje, których nie da się odzyskać z samego `health.dead`, np.:

- miejsce i orientację śmierci,
- trwały anchor czasu śmierci/lifecycle,
- stan processing/cleanup potrzebny do idempotencji,
- persisted corpse loot, jeżeli loot istnieje,
- minimalny handoff/claim state potrzebny później przez `npc-011`.

Nie przechowywać referencji do `NpcAgent`, mesh ani innych obiektów Three.js.

Po terminal cleanup NPC pozostaje dead w `NpcAuthoritativeState`; stan post-death musi jednocześnie jednoznacznie mówić, że aktywnego corpse nie należy już odtwarzać.

### 3. Corpse representation i streaming

NPC corpse nie jest aktywnym NPC i nie może zależeć od lifetime `NpcAgent`.

Gdy settlement jest załadowany, prezentacja/interakcja corpse może być settlement-owned. Po stream-out wystarcza authoritative post-death state. Po stream-in reprezentację odtworzyć z tego stanu, bez ponownego uruchamiania death transition.

Nie tworzyć osobnego `NpcCorpseManager`, jeśli persisted state + istniejący settlement lifecycle wystarczą.

Fauna corpse lifecycle jest punktem odniesienia, ale nie gotowym generycznym managerem: `AnimalAgent` nadal posiada własne `timeSinceDeath`, `corpseHeld`, harvesting i cleanup.

### 4. Lifecycle i world independence

Docelowo:

```
fresh
  ↓
rotting
  ↓
remains / bones
  ↓
removed
```

Nazewnictwo i timing fauna można współdzielić tylko tam, gdzie semantyka faktycznie jest wspólna. Preferować wyciągnięcie małej czystej funkcji lifecycle nad uzależnianie NPC od `AnimalAgent`.

Lifecycle ma być liczony z trwałego czasu symulacji (np. world-days/death-time anchor), nie z `NpcAgent.simClock`, render frames ani lifetime mesh. Dzięki temu corpse może logicznie postarzeć się podczas stream-out/time skip i rozwiązać aktualną fazę po ponownym załadowaniu bez ciągłego off-screen tickowania.

Plan nie dodaje pełnej symulacji NPC w niezaładowanych settlementach. Nowa śmierć nie musi powstawać tam, gdzie NPC w ogóle nie jest aktualnie symulowany; wymaganiem jest niezależny od renderingu lifecycle już istniejącej śmierci/corpse.

### 5. NPC inventory → corpse loot

`NpcAgent.carried` pozostaje runtime-only i nie jest personal inventory. Służy jednocześnie do krótkiego transportu zasobów oraz combat/loadout.

Aktualny `npcLoadout.ts` daje:

- `woodcutter`: `axe` + `knife`,
- `guard`: `long_sword`,
- `hunter`: `hunting_bow` + `knife` + początkowe arrows,
- pozostałe role: co najmniej `knife` przez fallback.

Sama obecność przedmiotu w `carried` nie oznacza ownership. Nie przenosić do corpse automatycznie:

- ore i innych transportowanych zasobów,
- payloadów household exchange/delivery,
- household/economy stock,
- przypadkowo niesionych materiałów pracy.

Jeżeli do loot mają wejść role/loadout belongings, klasyfikować je jawnie na podstawie istniejących loadout semantics i przenosić rzeczywisty item/instance z `carried` na alive→dead edge. Nie regenerować lootu na podstawie roli podczas load/stream-in.

Wykorzystać istniejący `Inventory` / `ItemInstance`. Zachować:

- stack quantities,
- item instance IDs,
- durability/sharpness i inne dane instances.

Persisted corpse loot musi od tej chwili być własnością post-death state, aby save/load nie regenerował nowych instance IDs ani nie duplikował przedmiotów.

### 6. Loot interaction

Interakcja z corpse ma wykorzystywać istniejące inventory/item-transfer semantics.

Transfer musi respektować istniejące limity i atomicity:

- weight,
- size,
- item instances.

Najpierw sprawdzić capacity odbiorcy, potem usunąć dokładnie przenoszony item/instance z corpse. Przy braku miejsca item pozostaje w corpse.

Nie tworzyć osobnego inventory systemu dla corpse.

### 7. Relationships / unauthorized looting

Aktualny codebase nie ma mechanizmu legal ownership/authorization dla zabierania własności po zmarłym:

- `NpcRelationships` to persisted NPC↔NPC social relation store,
- `QuestManager` posiada osobny player↔NPC relation/standing model,
- family/household membership nie definiuje prawa do corpse loot.

Nie używać żadnego z tych mechanizmów jako zastępczego systemu własności i nie implementować nowego globalnego reputation/legal systemu w `npc-010`.

V1 ma mieć neutralny transfer lootu. Jeżeli istniejący interaction flow potrzebuje punktu rozszerzenia, można zostawić minimalny, inert seam na przyszłe rozstrzygnięcie authorized/unauthorized, bez naliczania konsekwencji bez źródła prawdy.

### 8. Existing harvesting / corpse processing

Wykorzystać istniejący fauna corpse/harvesting pipeline tylko tam, gdzie semantyka pozwala na reuse.

Nie kopiować `animalHarvest.ts` ani nie dodawać human-harvesting tylko po to, aby współdzielić pipeline. `harvestedRemains.ts` może być wykorzystany wyłącznie jako prezentacyjny building block, jeśli wizualnie pasuje.

### 9. Burial handoff

Corpse lifecycle musi pozostawić możliwość przejęcia corpse przez przyszły burial system:

```
NPC death
    ↓
corpse
    ├── loot / decay ← npc-010
    │
    └── burial       ← npc-011
```

Nie implementować tutaj:

- decyzji o pochówku,
- wyboru wykonawcy,
- navigation do corpse,
- burial action,
- grave.

Nie ustalać przedwcześnie konkretnego API `canBeBuried()` / `bury()`. Wystarczy minimalny persisted stan pozwalający `npc-011` później przejąć corpse i zablokować natural cleanup.

### 10. Natural cleanup

Cleanup musi być idempotentny i oddzielony od zniknięcia mesh.

Wymagania:

- brak duplicate removal,
- brak aktywnego NPC AI powiązanego z corpse,
- brak dangling references,
- terminalny persisted state zapobiega ponownemu corpse po stream/reload,
- burial claim blokuje natural cleanup,
- nieodebrany loot ma jawną regułę; nie może znikać tylko dlatego, że wygasł mesh.

### 11. Save/load i migration

NPC health/death już jest persisted. `NpcStateRegistry.serialize()` trafia do `SaveData.npcStates`, `createWorldBundle()` przyjmuje zapisane `npcStates`, a `rebuildWorldBundle()` używa tego samego snapshot/restore boundary.

Dlatego `npc-010` nie może pozostawić persisted `health.dead` bez persisted informacji potrzebnej do rozstrzygnięcia corpse. Nie dodawać osobnego top-level corpse save systemu, jeśli rozszerzenie `NpcStateSnapshot` zachowuje jednego właściciela stanu.

Zmiana persisted `NpcStateSnapshot` wymaga użycia aktualnego mechanizmu save versioning/migrations oraz validatorów. Nie omijać go przez „opcjonalne pole bez migracji”.

Migration istniejących save'ów musi być bezpieczna dla NPC, którzy już mają `health.dead === true`, ale nie mają historycznej pozycji śmierci ani lootu. Nie wolno na loadzie:

- generować im nowego loadout loot,
- udawać, że home position jest miejscem śmierci,
- ponownie odpalać alive→dead consequence.

Domyślna migracja takiego legacy dead NPC powinna oznaczyć post-death state jako terminalny/no-active-corpse (lub równoważny stan), zamiast fabrykować nieistniejące dane. Alive NPC dostają pusty post-death state.

Od nowej wersji save wszystkie nowe śmierci muszą round-tripować corpse state i loot bez duplikacji.

## Ownership

Preferowany podział:

```
HealthState
  → alive/dead source of truth

NpcAuthoritativeState / NpcStateRegistry
  → persisted NPC + post-death state

NpcAgent
  → live NPC execution + death presentation cleanup

Combat
  → damage/combat resolution

Settlement/world presentation
  → materialization/interactions corpse while loaded

Inventory
  → actual corpse item contents / transfer semantics

Relationships/reputation
  → bez corpse-ownership semantics w v1
```

Nie tworzyć jednego managera posiadającego health, AI, inventory, social state i corpse rendering.

## Powiązanie z npc-009 i npc-019

`npc-009` odpowiada za death animation/SFX. `NpcAgent.die(true)` celowo odtwarza już martwego NPC w settled death pose i nie może stać się triggerem tworzenia nowego corpse.

`npc-019` dodał wspólny Strength→melee damage rule, ale nie zmienił ownership death ani persistence: lethal melee nadal kończy się w tym samym `NpcAgent.takeDamage()` / `HealthState` flow.

## Debug

Rozszerzyć istniejące NPC inspection/trace o minimum potrzebne do sprawdzenia:

- NPC id + `health.dead`,
- post-death/corpse state i source NPC id,
- death position/time anchor,
- lifecycle phase,
- loot classification + actual persisted contents,
- burial/held state,
- cleanup reason.

Nie tworzyć osobnego systemu diagnostycznego. Debug ma czytać authoritative state, nie obecność mesh.

## Verification

### Death / idempotency

1. Lethal damage ustawia `HealthState.dead`.
2. Combat/akcje zostają zakończone.
3. Alive→dead consequence wykonuje się dokładnie raz.
4. Powstaje authoritative post-death state i corpse representation.
5. `die(true)` po reconstruction nie tworzy drugiego corpse ani lootu.

### Streaming / rebuild / save-load

1. Stream-out/in zachowuje corpse state, death transform, lifecycle i loot.
2. `WorldBundle` rebuild zachowuje ten sam stan przez `NpcStateRegistry` snapshot/restore.
3. Save/load martwego NPC nie resurrectuje go i nie przenosi corpse do home position.
4. Save/load nie generuje ponownie role loadout ani nowych item instance IDs.
5. Corpse usunięty przed save pozostaje terminalny po reloadzie.
6. Migration legacy dead NPC nie fabrykuje corpse/loot.

### Loot

1. Do corpse trafiają tylko jawnie kwalifikujące się belongings.
2. Transportowane zasoby/towary household/economy nie stają się lootem.
3. Item instances zachowują ID i stan.
4. Stacki nie są duplikowane.
5. Transfer respektuje weight/size/capacity.
6. Przy braku miejsca item pozostaje w corpse.

### Lifecycle

1. Lifecycle wynika z simulation-time anchor, nie render frames.
2. Po stream-out/time skip aktualna faza jest poprawna po ponownym materialize.
3. Burial handoff pozostaje możliwy dla `npc-011`.
4. Cleanup jest idempotentny i zapisuje stan terminalny.
5. Nieodebrany loot podlega jawnej regule.

### Regression

Uruchomić istniejące testy NPC/persistence oraz build. Dodać focused tests dla:

- `NpcStateSnapshot` post-death round-trip,
- migration legacy alive/dead records,
- one-shot death transition,
- reconstruction bez duplicate corpse/loot,
- lifecycle time-anchor resolution,
- inventory transfer atomicity.

Nie zmieniać bez potrzeby:

- combat damage / critical / defense,
- Strength melee rule z `npc-019`,
- NPC combat decisions,
- player inventory semantics,
- animal corpse behaviour.

## Poza zakresem

- combat feedback i nowe animacje — `npc-009`,
- household response na śmierć,
- burial decisions/actions/grave — `npc-011`,
- pełna off-screen symulacja NPC,
- persisted runtime execution (`phase`, pathfinding, combat intent, carried work payload),
- pełny ownership/legal/reputation system,
- nowe AI combat decisions,
- player-vs-NPC combat,
- nowe NPC harvesting mechanics bez istniejącego uzasadnienia.

## Powiązane plany

- **177 — NPC Combat**
- **179 — Animal Attack & NPC Defense**
- **009 — NPC Combat Feedback**
- **011 — NPC Burial & Graves**
- **npc-019 — Shared SPEA foundation and Strength-driven melee**

> **Zrób git commit i push do main, rebase jeżeli trzeba**
