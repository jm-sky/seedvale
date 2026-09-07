# Plan: Authored RPG Quests

**Created:** 2026-09-06  
**Status:** `planned` 📋  
**Type:** feature  
**Priority:** high · **Effort:** L  
**Depends on:** quests-progression-002, quests-progression-003, quests-progression-004  
**Domain:** `quests-progression`  
**Subdomains:** `quests` `relationships` `rewards`  
**Tags:** `quests` `rpg` `story` `outcomes` `rewards`  
**Roadmap:** `quests-and-reputation.md`

## Cel

Dodać pierwszy pakiet ręcznie zaprojektowanych questów RPG, wykorzystujących istniejące systemy Seedvale zamiast kolejnej warstwy infrastruktury.

Pakiet zawiera **3 historie / 5 `QuestDef`**:

1. `zaginiona-przesylka` — eksploracja i wybór komu zaufać,
2. `sporne-drewno` + jeden z dwóch outcome-dependent follow-upów — lokalny konflikt,
3. `dzik-przy-szlaku` — ważniejsza sprawa społeczności, odblokowana przez renown.

Implementator ma wdrożyć poniższy content, a nie ponownie projektować historie.

## Kontrakty zależności

Plan implementować po `quests-progression-002`–`004`:

- outcomes/rewards/consequences, `resultText` i `resolvedOutcomeId` z `002`,
- reward scale, paid-content baseline i atomic final `gather_item` delivery z `003`,
- `QuestPrerequisite` (`quest_outcome`, `relation`, `reputation`, `renown`) oraz quest-definition validation seam z `004`.

Aktualny `main` podczas review jest jeszcze przed implementacją `002`; nazwy prywatnych helperów mogą się zmienić podczas realizacji zależności, ale powyższe kontrakty domenowe są wiążące.

# Questline A — Zaginiona przesyłka

## `zaginiona-przesylka`

**Giver:** `Kasia` (`trader`). To lepiej odpowiada aktualnej roli niż pierwotnie proponowany Piotr.

### Przesyłka

**Nie dodawać `sealed_package` jako `ItemKind`.**

Odnalezienie przesyłki jest stanem aktywnego questa po ukończeniu pierwszego stage. Nie tworzyć quest-item inventory, world-item spawnu ani specjalnej persistence tylko po to, by fizycznie nosić paczkę.

### Stages

1. `{ type: 'interact_spawner', spawnerType: 'cave' }` — sprawdź jaskinię przy szlaku; stage completion oznacza odnalezienie przesyłki.
2. nowy wąski objective `talk_to_npc_choice`:
   - rozmowa z `Kasia` → `returned_sealed`,
   - rozmowa z `Marek` → `turned_over_to_guard`.

Nie ma outcome `opened_and_returned`: codebase nie posiada taniego, istniejącego mechanizmu otwierania takiego quest-only przedmiotu.

### Outcomes

`returned_sealed`:

- state: `complete`,
- hidden reward: `15 x coin`,
- relation: `Kasia +2`,
- reputation: `trust +5`, `integrity +6`,
- renown: `+3`.

`turned_over_to_guard`:

- state: `complete`,
- hidden reward: `2 x bandage`,
- relation: `Kasia -1`, `Marek +2`,
- reputation: `competence +4`, `courage +2`, `integrity +1`,
- renown: `+2`.

To nie jest morality choice: pierwszy wynik premiuje dotrzymanie zobowiązania handlowego, drugi ostrożność i zaufanie straży.

# Questline B — Sporne drewno

Anna i Piotr mają sprzeczne priorytety wobec najbliższej partii materiału: Anna chce materiał na bieżące potrzeby gospodarstwa, Piotr na własne prace drwala/naprawy. Nie twierdzić, że po queście wizualnie powstał lub został naprawiony konkretny obiekt.

## `sporne-drewno`

**Giver:** `Anna` (`farmer`).

Stages:

1. `{ type: 'talk_to_npc', npcName: 'Piotr' }` — poznaj drugą stronę.
2. `talk_to_npc_choice`:
   - rozmowa z `Anna` → `support_anna`,
   - rozmowa z `Piotr` → `support_piotr`.

Nie dodawać `compromise` w tym pakiecie. Bez trzeciego realnego content branch byłby tylko dodatkowym przyciskiem/tekstem.

`support_anna`:

- state: `complete`,
- relation: `Anna +2`, `Piotr -1`,
- reputation: `benevolence +3`, `trust +1`,
- renown: `+2`,
- brak item/coin reward.

`support_piotr`:

- state: `complete`,
- relation: `Piotr +2`, `Anna -1`,
- reputation: `competence +3`, `trust +1`,
- renown: `+2`,
- brak item/coin reward.

## `drewno-dla-anny`

Availability:

```ts
{ type: 'quest_outcome', questId: 'sporne-drewno', outcomeIds: ['support_anna'] }
```

**Giver:** `Anna`.

Stage:

```ts
{ type: 'gather_item', kind: 'branch', count: 5 }
```

Outcome `delivered_to_anna`:

- state: `complete`,
- hidden reward: `3 x seed_carrot`,
- relation: `Anna +1`,
- brak dodatkowego social consequence.

## `drewno-dla-piotra`

Availability:

```ts
{ type: 'quest_outcome', questId: 'sporne-drewno', outcomeIds: ['support_piotr'] }
```

**Giver:** `Piotr`.

Stage:

```ts
{ type: 'gather_item', kind: 'branch', count: 5 }
```

Outcome `delivered_to_piotra`:

- state: `complete`,
- shown reward: `8 x coin`,
- relation: `Piotr +1`,
- brak dodatkowego social consequence.

Tylko odpowiedni follow-up staje się dostępny. To jest wymagany przykład outcome-dependent continuation bez `QuestChainManager`.

# Questline C — Dzik przy szlaku

## `dzik-przy-szlaku`

**Giver:** `Marek` (`guard`).

Problem: mieszkańcy omijają część okolicy, w której regularnie widywany jest duży dzik. Quest nie twierdzi, że istnieje specjalny patrol route, uszkodzona infrastruktura ani system niszczenia pól — rozwiązuje problem konkretnego, realnego zwierzęcia.

Availability:

```ts
{ type: 'renown', minimum: 10 }
```

Nie dodawać relation gate do Marka: po usunięciu implicit relation przez `002` aktualny content nie gwarantuje bez grind dostępu do `friendly`.

Stages:

1. `{ type: 'talk_to_npc', npcName: 'Piotr' }` — drwal potwierdza problem w lesie.
2. `{ type: 'kill_target_animal', kind: 'boar' }` — bind do jednego istniejącego dzika.

Nie używać `dangerous: true`: obecny `markDangerous()` jest mechanizmem zaprojektowanym/tuningowanym dla „groźnego wilka”, nie generic aggressive-animal authoring API.

Outcome `boar_removed`:

- state: `complete`,
- hidden reward: `1 x book_defense_intermediate`,
- relation: `Marek +2`,
- reputation: `competence +6`, `courage +6`, `benevolence +2`,
- renown: `+8`.

Reward jest konkretnym fallbackiem po odrzuceniu land grant: istniejąca książka ma realny efekt przez `PlayerSkills`, bez nowego ownership/unlock systemu.

# Minimalne rozszerzenie objective

Dodać jeden wąski objective używany przez questline A i B:

```ts
{
  type: 'talk_to_npc_choice'
  choices: readonly {
    npcName: string
    outcomeId: QuestOutcomeId
  }[]
}
```

Semantyka:

```text
aktywny stage
→ gracz naprawdę rozmawia z jednym z authored NPC
→ matching choice wybiera outcomeId
→ ten sam terminal resolution path z 002
```

Nie dodawać modala A/B, dialogue tree engine ani generic action scripting.

`QuestManager.onInteract()` musi obsłużyć ten objective przed zwykłym giver reminder path, ponieważ giver (`Kasia`/`Anna`) może sam być jedną z choices. `labelMarker()` ma oznaczać wszystkie NPC będące aktualnymi choice targets.

Definition validator z `004` rozszerzyć o minimum 2 choices, unikalne `npcName` w objective i istnienie każdego `outcomeId` w outcomes tego samego questa. Nie tworzyć drugiego validatora w `005`.

# Land reward — decyzja po review

**Nie implementować land reward w `005`.**

Aktualny land ownership nie daje bezpiecznego istniejącego kontraktu dla authored grantu:

- `LandOwnershipRegistry.setOwned(settlementId, plotId)` jest tylko prymitywem zapisu,
- walidowany `purchaseLandPlot()` obsługuje zakup, nie grant,
- liczba sale plots jest deterministyczna, ale może wynosić `0`,
- gracz może wcześniej kupić dostępną działkę,
- nie istnieje rezerwacja/allocation konkretnej wolnej działki dla questa.

Nie dodawać w tym planie `grant_land`, rezerwacji plotów ani questowego ownership state.

Konkretny fallback: hidden `book_defense_intermediate` z `dzik-przy-szlaku`.

# Reward / outcome rules

- Wszystkie gałęzie kończyć przez unified terminal resolution z `002`; outcome/reward/consequences exact-once.
- Każdy authored outcome w tym pakiecie ma mieć konkretny `resultText` zgodny z faktycznym wynikiem; UI pokazuje tekst, nigdy surowe outcome ID.
- Coins pozostają zwykłym `ItemKind = 'coin'` i korzystają z istniejącego injected quest grant path.
- Item rewards również korzystają z tego samego grant path; nie mutować `Inventory` bezpośrednio z quest definition/runtime.
- Public social consequence korzysta z istniejącego `ReputationManager` seam i resolved `settlementId`.
- Nie dodawać implicit relation fan-out.

# Existing systems / non-goals

Reuse:

- `talk_to_npc`, `interact_spawner`, `gather_item`, `kill_target_animal`,
- reserved NPC names/roles,
- Inventory / quest item grant,
- ReputationManager,
- quest prerequisites z `004`,
- existing fauna target binding/death event,
- istniejący Quest Log.

Nie tworzyć:

- `sealed_package` item,
- quest-item inventory,
- generic dialogue tree,
- generic quest scripting/condition DSL,
- `QuestChainManager`,
- land grant/allocation,
- horse/helper/follower unlock,
- generic morality system.

# Persistence i lifecycle

`005` nie dodaje nowej save schema ponad kontrakt `002` (`resolvedOutcomeId`) i `004` (availability jest derived).

`dzik-przy-szlaku` dziedziczy aktualną semantykę wild `kill_target_animal`: bound `animalId` jest runtime-only i aktywny wild target może zostać `invalidated` po save/load lub same-session world rebuild. Nie próbować naprawiać tej ogólnej polityki w `005`.

# Implementation order

1. Upewnić się, że `002`–`004` są zaimplementowane i użyć ich faktycznych nazw typów/publicznych kontraktów.
2. Dodać `talk_to_npc_choice` do istniejącego quest modelu/managera oraz rozszerzyć validator z `004`.
3. Dodać pięć powyższych `QuestDef` do statycznego authored setu.
4. Dodać testy contentu, outcomes, prerequisites i exact-once.
5. Zaktualizować canonical docs/vision.

Dla ważnego nowego integration seam dodać JSDoc z `@domain quests-progression`, jeżeli pomaga preflight.

# Verification

## Automated

Uruchomić:

- quest definition tests,
- `QuestManager` tests,
- availability/prerequisite tests,
- reputation integration tests,
- inventory/reward tests,
- persistence tests związane z outcome restore,
- typecheck,
- build.

Nie uruchamiać `pnpm docs:sync` ręcznie.

## Manual — User

User sprawdza w przeglądarce:

1. Są trzy różne historie RPG i łącznie pięć nowych quest definitions.
2. `zaginiona-przesylka`: jaskinia → realna rozmowa z Kasią lub Markiem daje różny outcome i consequence.
3. Nie istnieje fake `sealed_package` w inventory.
4. `sporne-drewno`: rozmowa z Anną/Piotrem wybiera stronę i odblokowuje tylko właściwy follow-up.
5. `dzik-przy-szlaku` jest ukryty przed `renown >= 10` i po odblokowaniu prowadzi do konkretnego targetu.
6. Shown/hidden rewards działają zgodnie z definicjami.
7. Outcomes, relation, reputation i renown nie aplikują się ponownie po kolejnych interakcjach/save-load.
8. Existing quests nie mają regresji.

> **Zrób git commit i push do main, rebase jeżeli trzeba**