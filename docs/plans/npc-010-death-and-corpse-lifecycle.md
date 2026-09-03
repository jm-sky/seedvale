# Plan: NPC Death & Corpse Lifecycle

**Created:** 2026-09-01
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** L
**Depends on:** 177
**Domain:** `npc`

## Cel

Wprowadzić spójny lifecycle śmierci NPC, wykorzystując istniejące mechanizmy combat, `HealthState`, inventory oraz istniejący corpse/harvesting/world-object pipeline.

Śmierć NPC ma stać się trwałą zmianą świata:

```
NPC alive
  ↓
lethal damage
  ↓
HealthState dead
  ↓
NPC death state
  ↓
corpse
  ↓
loot / dostępne przetwarzanie / natural decay
  ↓
cleanup
```

System ma działać niezależnie od gracza i kamery.

## Zakres

### 1. Death transition

Wykorzystać `HealthState` jako jedyne źródło prawdy o życiu NPC.

Po przejściu NPC do `dead`:

- combat zostaje zakończony,
- NPC nie wykonuje dalszych zwykłych akcji,
- uruchamiany jest death/corpse lifecycle,
- śmierć jest przetwarzana dokładnie raz.

Śmierć musi działać niezależnie od istniejącego źródła lethal damage.

Nie tworzyć osobnego systemu HP/death.

### 2. NPC corpse

Rozszerzyć istniejący corpse/world-object lifecycle, używany przez fauna, tak aby NPC corpse był jego równorzędnym przypadkiem tam, gdzie architektura na to pozwala.

Corpse powinien:

- pozostać w miejscu śmierci,
- posiadać lifecycle,
- być możliwy do znalezienia/interakcji,
- nie być częścią aktywnej symulacji NPC,
- być niezależny od kamery.

Nie tworzyć osobnego `NpcCorpseManager`, jeśli istniejący mechanizm można rozszerzyć.

### 3. NPC inventory → corpse loot

Przed implementacją ustalić na podstawie aktualnego codebase, które elementy `NpcAgent.carried` są faktycznie własnością osobistą NPC, a które są:

- tymczasowo transportowanym zasobem,
- materiałem pracy,
- towarem gospodarstwa/osady,
- innym runtimeowym stanem.

Nie zakładać, że całe `NpcAgent.carried` jest personal loot.

Do corpse loot przechodzą wyłącznie przedmioty, dla których istniejące ownership semantics uzasadniają taki transfer.

Wykorzystać istniejący `Inventory` / `ItemInstance` zamiast tworzyć nowy kontener przedmiotów.

Należy zachować:

- stack quantities,
- item instance IDs,
- durability/sharpness,
- inne istniejące dane item instances.

Loot nie może być duplikowany ani pozostawać jednocześnie w dwóch miejscach.

### 4. Loot interaction

Interakcja z corpse ma wykorzystywać istniejący inventory/item-transfer flow.

Transfer musi respektować istniejące limity:

- weight,
- size,
- item instances.

Jeżeli inventory odbiorcy nie mieści przedmiotu, pozostaje on w corpse.

Nie tworzyć osobnego inventory systemu dla corpse.

### 5. Unauthorized looting / reputation

Jeżeli istniejący relationships/reputation system posiada mechanizm konsekwencji za zabranie cudzej własności, rozszerzyć go o loot po zmarłym NPC.

Nie tworzyć nowego globalnego reputation ani legal/ownership systemu.

Rozróżnić:

```
authorized recovery
        vs
unauthorized looting
```

Jeżeli obecny model nie ma wystarczającego seam'u, dodać minimalny kontrakt potrzebny do integracji.

### 6. Existing harvesting / corpse processing

Wykorzystać istniejący fauna corpse/harvesting pipeline tam, gdzie semantyka pozwala na reuse.

Nie kopiować `animalHarvest.ts` ani tworzyć równoległego NPC harvesting systemu.

Jeżeli NPC corpse nie powinien obsługiwać określonego rodzaju harvestu, pozostawić go poza zakresem zamiast dodawać nową mechanikę tylko na potrzeby tego planu.

### 7. Corpse lifecycle

Wykorzystać istniejący lifecycle fauna corpse jako punkt odniesienia i wspólny mechanizm, jeśli jest to możliwe bez sztucznego uogólnienia.

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

Nazewnictwo istniejącego systemu ma pozostać źródłem prawdy.

Lifecycle jest stanem symulacyjnym i nie może zależeć od renderingu.

### 8. Burial handoff

Corpse lifecycle musi pozostawić możliwość przejęcia corpse przez przyszły burial system.

Docelowy model:

```
NPC death
    ↓
corpse
    ├── loot / processing / decay ← npc-010
    │
    └── burial                  ← npc-011
```

Nie implementować tutaj:

- decyzji o pochówku,
- wyboru wykonawcy,
- navigation do corpse,
- burial action,
- grave.

Nie ustalać przedwcześnie konkretnego API `canBeBuried()` / `bury()`. Stabilny kontrakt zostanie określony podczas przygotowania `npc-011`.

### 9. Natural cleanup

Po zakończeniu corpse lifecycle reprezentacja zwłok może zostać usunięta.

Cleanup musi być bezpieczny:

- brak duplicate removal,
- brak aktywnego NPC AI powiązanego z corpse,
- brak dangling references,
- brak cichego znikania nieodebranego lootu bez jawnej reguły.

Jeżeli burial przejął corpse, natural decay nie może przedwcześnie usunąć obiektu potrzebnego do burial.

### 10. World independence

Dla NPC znajdującego się daleko od gracza:

```
death
→ corpse state
→ decay
→ cleanup
```

musi zachodzić w symulacji.

Streaming/rendering może tworzyć lub usuwać reprezentację 3D, ale nie może być źródłem prawdy dla corpse state.

### 11. Persistence boundary

Nie rozszerzać pełnej persistence runtime NPC.

Jeżeli istniejący persistence mechanism pozwala zachować corpse/loot przez save/reload, wykorzystać go w minimalnym koniecznym zakresie.

Nie tworzyć nowego save systemu wyłącznie dla corpse.

Jeżeli obecna architektura nie obsługuje persistence corpse, udokumentować tę granicę zamiast rozszerzać scope planu.

Po reloadzie nie może jednak dojść do przypadkowego:

- ponownego wygenerowania lootu,
- ponownego przetworzenia śmierci,
- duplikacji przedmiotów.

## Ownership

Preferowany podział:

```
HealthState
  → alive/dead state

NpcAgent
  → NPC runtime lifecycle

Combat
  → damage/combat resolution

Death/Corpse system
  → post-death world representation

Inventory
  → actual item contents

World/streaming
  → runtime representation/loading

Reputation/relationships
  → social consequences
```

Nie tworzyć jednego managera posiadającego wszystkie te stany.

## Powiązanie z npc-009

`npc-009` odpowiada za feedback:

```
HealthState → dead
    ↓
death animation / SFX
```

`npc-010` zaczyna się na rzeczywistym przejściu do `dead`:

```
HealthState → dead
    ↓
NPC death lifecycle
    ↓
corpse
```

`npc-009` nie może usuwać NPC ani konsumować jego inventory.

## Debug

Dodać minimalne diagnostyki pozwalające sprawdzić:

- NPC w stanie dead,
- corpse powiązany z NPC,
- klasyfikację i zawartość loot,
- lifecycle corpse,
- stan itemów,
- przyczynę cleanup.

Nie tworzyć osobnego systemu diagnostycznego.

## Verification

### Death

1. NPC otrzymuje lethal damage.
2. `HealthState` przechodzi do `dead`.
3. Combat zostaje zakończony.
4. Death jest przetworzony dokładnie raz.
5. Powstaje corpse.

### Loot

1. Do corpse trafiają tylko kwalifikujące się personal belongings.
2. Transportowane zasoby/towary gospodarstwa nie stają się przypadkowo personal lootem.
3. Item instances zachowują ID i stan.
4. Stacki nie są duplikowane.
5. Transfer respektuje weight/size.
6. Przy braku miejsca item pozostaje w corpse.
7. Item nie pozostaje równocześnie w inventory NPC i corpse.

### Reputation

1. Authorized recovery nie generuje fałszywej kary.
2. Unauthorized loot wykorzystuje istniejący mechanism.
3. Nie powstaje równoległy reputation system.

### Lifecycle

1. Corpse korzysta z istniejących stanów lifecycle.
2. Processing/harvesting reuse istniejące mechanizmy tam, gdzie semantycznie poprawne.
3. Burial handoff pozostaje możliwy dla `npc-011`.
4. Cleanup następuje tylko po spełnieniu warunków.
5. Nieodebrany loot ma jawnie określony lifecycle.

### Off-screen

1. NPC może umrzeć poza zasięgiem kamery.
2. Corpse lifecycle działa bez renderingu.
3. Cleanup działa bez obecności gracza.
4. Streaming nie resetuje corpse state.

### Regression

Uruchomić istniejące testy i build.

Nie zmieniać bez potrzeby:

- combat damage,
- critical hits,
- defense,
- NPC combat decisions,
- player inventory semantics,
- animal corpse behaviour.

## Poza zakresem

- combat feedback i nowe animacje — `npc-009`,
- household response na śmierć,
- burial decisions,
- burial actions,
- grave/gravestone,
- funeral/social mourning,
- pełna persistence NPC,
- pełny ownership/legal system,
- nowe AI combat decisions,
- player-vs-NPC combat,
- nowe NPC harvesting mechanics bez istniejącego uzasadnienia.

## Powiązane plany

- **177 — NPC Combat**
- **179 — Animal Attack & NPC Defense**
- **009 — NPC Combat Feedback**
- **011 — NPC Burial & Graves**

**Zrób git commit i push do main, rebase jeżeli trzeba**
