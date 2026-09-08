# Plan: Paid Quests & Player Income

**Created:** 2026-09-06  
**Status:** `done` ✅  
**Type:** feature  
**Priority:** high · **Effort:** M  
**Depends on:** quests-progression-002  
**Domain:** `quests-progression`  
**Subdomains:** `quests` `rewards`  
**Tags:** `quests` `coins` `income` `economy`  
**Roadmap:** `quests-and-reputation.md`

## Cel

Dodać pierwszą spójną pętlę gameplay:

```text
NPC potrzebuje pomocy
→ oferuje zwykły QuestDef z jawnym coin reward
→ gracz wykonuje istniejącą czynność w świecie
→ raportuje / oddaje wymagane przedmioty
→ otrzymuje coins
→ może wydać je u kupca
```

Nie tworzyć `PaidQuest`, `Job`, `ContractQuest`, `JobManager`, walletu, repeatable-job systemu ani drugiej ekonomii. Paid quest pozostaje zwykłym questem obsługiwanym przez `QuestManager` i outcome/reward model z `quests-progression-002`.

## Kontrakt z `quests-progression-002`

Ten plan zakłada jawny `QuestOutcome` z `QuestReward.items`, terminal resolution zapisujące `resolvedOutcomeId` i shared reward dispatch przez injected `QuestItemGrant` → `createApp.ts::grantItem()`.

Coins pozostają `ItemKind = 'coin'`:

```ts
reward: {
  visibility: 'shown',
  items: [{ kind: 'coin', count: 8 }]
}
```

Nie dodawać metadata `type: 'paid'`, jeżeli nie ma runtime/UI consumera.

## Economy baseline — aktualny kod

Źródłem prawdy jest `src/items/tradeCatalog.ts`.

Istotne `MERCHANT_PRICES`:

```text
bread                6
firestarter           8
knife                12
trap_simple          14
shovel               20
axe                  25
pickaxe              30
tent                 30
short_sword          40
long_sword           50
backpack             70
basic skill books    20–30
intermediate books   50–60
advanced books      100–120
```

Istotne resource `tradeValue()` / `sellPrice()`:

```text
branch  tradeValue 1  sellPrice 1
stone   tradeValue 1  sellPrice 1
herb    tradeValue 3  sellPrice 1
```

Quest reward jest authored zapłatą za towar + usługę/czas/ryzyko. Nie implementować `tradeValue × multiplier` ani osobnego katalogu quest values.

Orientacyjna skala:

```text
bardzo drobna przysługa       3–5 coins
prosta praca                  5–10 coins
większa praca                10–20 coins
niebezpieczne zadanie        20–40 coins
wyjątkowe zadanie            40+ lub reward specjalny
```

## Rebalance istniejących paid quests

### `woda-dla-marka`

Po `quests-progression-002` pozostaje:

```text
5 coins
Marek +1 (jawna personal relation consequence z 002)
```

Bez dalszego rebalansu.

### `zagubiona-owca`

Po `quests-progression-002` successful outcome to **`found_and_reported`**, nie `returned_to_owner` — obecny quest tylko znajduje konkretną owcę i raportuje Annie; nie istnieje transfer livestock ownership/pozycji.

```text
found_and_reported → 10 coins → Anna +1
sheep_died         → failed → no reward
```

Bez zmiany wypłaty.

### `drewno-na-naprawe`

Aktualnie 5 `branch` ma `tradeValue = 5` i bezpośredni `sellPrice = 5` łącznie. Zmienić reward z 15 na:

```text
5 branches → 8 coins
```

To daje umiarkowaną premię za konkretną dostawę. Formalne zlecenie nadal nie ma relation consequence zgodnie z `quests-progression-002`.

## Cztery nowe paid quests

Wszystkie są jednorazowymi authored `QuestDef` w istniejącym `QUESTS` (`src/quests/quests.ts`). Nie wymagają nowego objective type ani subsystemu.

### A. Zioła dla Anny

Anna jest istniejącym reserved NPC o roli `farmer` (`src/ai/characters.ts`).

```text
giver: Anna
objective: gather_item herb ×3
reward: 8 coins, shown
relation/social: none
```

Ekonomia: 3 herbs = `tradeValue 9`, bezpośrednia sprzedaż = 3 coins. Quest płaci 8 za konkretną dostawę, ale pozostaje poniżej barter value.

Offer text ma jawnie podać 8 monet.

### B. Kamienie dla Piotra

Piotr jest reserved `woodcutter`; istniejący `drewno-na-naprawe` już ustala dla niego motyw napraw w osadzie.

```text
giver: Piotr
objective: gather_item stone ×6
reward: 9 coins, shown
relation/social: none
```

Ekonomia: 6 stones = `tradeValue 6`, bezpośrednia sprzedaż = 6 coins; +3 jest premią za zamówienie/usługę.

Nie dodawać construction side effect — narracyjna naprawa nie tworzy nowego stanu świata w tym planie.

### C. Sprawdzenie szlaku dla Kasi

Kasia jest reserved `trader`. Zamiast dodawać drugi conditional landmark quest, użyć już istniejącego i statycznie definiowalnego objective:

```text
giver: Kasia
objective: interact_spawner { spawnerType: 'cave' }
reward: 12 coins, shown
relation/social: none
```

`interact_spawner: cave` jest już używany przez `zwiadowca`, więc nie wymaga nowego resolvera, landmarku ani subsystemu. Narracja: sprawdzenie przejścia/szlaku handlowego przy znanej jaskini.

### D. Lis przy osadzie

Marek jest reserved `guard`. Użyć istniejącego fauna objective i istniejącego dzikiego predatora:

```text
giver: Marek
objective: kill_target_animal { kind: 'fox' }
reward: 20 coins, shown
relation: none
social: competence +3, courage +3, renown +3
```

Nie używać wilka. Obecny `AnimalTargetResolver` wybiera pierwszy żywy osobnik danego gatunku i nie rezerwuje targetu między questami; drugi wolf quest mógłby współdzielić target z `grozny-wilk`. `fox` jest już spawnionym wild predator (`createFauna.ts`) i nie jest targetem istniejącego questa.

Nie ustawiać `dangerous: true`: to ma być zwykłe lokalne zlecenie, wyraźnie mniejsze niż `grozny-wilk` (`competence +10`, `courage +12`, `renown +15`) i `wilcza-jama` (`+15`, `+18`, `+25`).

## `gather_item` — dokładna semantyka i turn-in

Aktualny `QuestManager.handleGiverInteract()` dla aktywnego `gather_item` robi:

```text
inventory.has(kind, count)
→ inventory.remove(kind, count)
→ advanceStage(...)
→ jeżeli to ostatni etap: completeQuest(...)
```

Czyli przedmioty **już dziś są konsumowane** przy rozmowie z giverem; objective nie śledzi historii zebrania, tylko aktualny stan inventory. Quest Log pokazuje live `inventory.count(kind)`.

Zachować tę semantykę dla wszystkich `gather_item`: „przynieś/oddaj X”, nie „kiedykolwiek zbierz X”. Nie tworzyć osobnego delivery objective.

Po `quests-progression-002` finalny gather turn-in musi używać wspólnego outcome resolution path i zachować kolejność transakcyjną:

```text
1. zweryfikuj, że quest/stage nadal może zostać rozwiązany wybranym successful outcome
2. zweryfikuj inventory.has(kind, count)
3. inventory.remove(kind, count)
4. resolveQuest(...)
5. reward dispatch przez QuestReward.items → injected QuestItemGrant
```

Nie usuwać itemów przed walidacją outcome/state. Nie grantować reward przed konsumpcją. `Inventory.remove()` jest synchroniczne i zwraca `false` bez mutacji przy niedoborze; po wcześniejszym `has()` oczekiwać `true` i testować ten kontrakt.

Dla `gather_item` w środku wieloetapowego questa nadal: validate items → remove → `advanceStage()`. Reward/resolution występuje dopiero na terminalnym turn-in.

Nie dodawać rollback frameworku ani transaction managera; wymagany jest jeden synchroniczny, wspólny turn-in path bez możliwej gameplay mutacji między walidacją i consume/resolve.

## Reward / coin grant path

Nie dotykać player inventory bezpośrednio z quest definitions ani `QuestManager` reward code.

Istniejąca ścieżka w `src/app/createApp.ts`:

```text
QuestManager QuestItemGrant callback
→ grantItem(kind, count)
→ createAcquiredInstance(kind) lub Inventory.add(kind)
→ przy overflow bundle.droppedItems.drop(...)
→ HUD / held-tool / quick-action sync
```

Dla `coin` `createAcquiredInstance()` nie tworzy instance; monety idą przez zwykłe `Inventory.add('coin')`, a overflow przez ten sam world-drop fallback. `quests-progression-002` ma już rozszerzyć reward z jednej pozycji do `QuestReward.items[]`; 003 tylko definiuje coin rewards jako dane.

Nie tworzyć walletu ani bypassu `grantItem()`.

## Existing objectives / integration points

Nowe questy używają wyłącznie istniejących objective contracts z `src/quests/quests.ts`:

```text
gather_item         — herb, stone; lazy inventory check + consume przy giver turn-in
interact_spawner    — cave; `ObjectiveRef { type: 'interact_spawner', spawnerType }`
kill_target_animal  — fox; bind do konkretnego `animalId`, completion przez `animal_died`
```

Nie dodawać nowych `ObjectiveRef` ani world scanning do `QuestManager`.

Fauna binding pozostaje przez injected `AnimalTargetResolver` w `createApp.ts`; death dispatch pozostaje `onAnimalDeathTarget → questManager.onInteractObjective({ type: 'animal_died', animalId })`.

Wszystkie questy nadal dostają `settlementId` w `createApp.ts` przez mapowanie `QUESTS + landmarkQuests` na realne home settlement. Social consequence lisa korzysta z istniejącego `ApplySocialConsequence` seam do `ReputationManager`.

## Dialogue i Quest Log

Każdy nowy `shown` coin reward ma być zgodny z offer text (ta sama liczba monet). Nie dodawać dynamicznego formattera dialogów.

Quest Log korzysta wyłącznie z reward presentation dodanego przez `quests-progression-002`; nie tworzyć jobs/contracts screen.

## Persistence

003 nie dodaje nowego persisted state. Outcome/reward persistence i exact-once `resolvedOutcomeId` należą do `quests-progression-002`.

Save/load nie może umożliwiać ponownego rewardu: terminal state + `resolvedOutcomeId` z 002 pozostają jedynym źródłem prawdy. `gather_item` nie zapisuje osobnego „delivered” flag.

## Non-goals

Nie implementować:

- jobs/contracts/payment systemu,
- repeatable/daily jobs, job board, rotation ani procedural commissions,
- automatycznego reward calculatora,
- nowych NPC,
- nowych objective types,
- nowego landmarku/spawnera/species tylko dla questa,
- settlement/household resource demand integration,
- fikcyjnego construction/production state change po delivery,
- economy-wide rebalance,
- osobnego currency storage.

## Testy

Rozszerzyć przede wszystkim `src/quests/QuestManager.test.ts` po zmianach z 002:

- finalny `gather_item`: insufficient inventory → brak consume/state/reward;
- finalny `gather_item`: dokładna liczba itemów usunięta raz, potem exact-once coin reward;
- niepoprawny/niemożliwy outcome nie konsumuje delivery items;
- wieloetapowy `gather_item`: consume + advance, bez przedwczesnego rewardu;
- `drewno-na-naprawe` → 8 coins, bez relation;
- `woda-dla-marka` → 5 coins;
- `zagubiona-owca` successful `found_and_reported` → 10 coins; `sheep_died` → 0;
- każdy z 4 nowych questów ma właściwy objective/reward i brak implicit relation;
- fox quest binduje konkretny `fox` id, inny animal death nie progressuje; completion daje dokładnie `{ competence:+3, courage:+3, renown:+3 }` raz;
- repeated giver interaction / save-load terminal quest nie wypłaca drugi raz;
- reward callback nadal dostaje `coin` i wykorzystuje shared grant path z 002.

Nie dodawać osobnego test harnessu dla paid quests. Trade values są już kontraktem `tradeCatalog.ts`; jeżeli nie zmieniamy katalogu, nie kopiować jego testów do questów.

## Konkretne miejsca zmian

Po ukończeniu 002 zakres 003 powinien pozostać mały:

```text
src/quests/quests.ts
  - rebalance drewno-na-naprawe
  - 4 nowe QuestDef/outcomes
  - teksty zgodne z shown rewards

src/quests/QuestManager.ts
  - tylko wspólna atomic ordering dla gather_item turn-in, jeśli 002 nie pozostawi jej już w wymaganym kształcie

src/quests/QuestManager.test.ts
  - delivery atomicity + paid quest data/reward/social regressions
```

`src/app/createApp.ts`, `src/items/Inventory.ts`, `src/items/tradeCatalog.ts`, fauna/world integration powinny być reused bez nowego mechanizmu.

Po implementacji zaktualizować canonical quest/economy docs tylko tam, gdzie rzeczywiście opisują dostępne questy/rewards. Nie uruchamiać `pnpm docs:sync` ręcznie — robi to GitHub workflow.

## Verification

### Automated

Uruchomić quest tests, następnie typecheck i build. Jeżeli 003 nie zmienia innych domen, nie rozszerzać verification na niepowiązane suite'y.

### Manual — User

User sprawdza w przeglądarce:

1. 5 branches znika z inventory przy turn-in i Piotr daje dokładnie 8 coins.
2. Brak wymaganych herbs/stones blokuje oddanie bez utraty itemów/rewardu.
3. Anna/Piotr/Kasia/Marek oferują nowe questy z kwotą zgodną z Quest Log.
4. Coins trafiają do zwykłego inventory i można nimi kupować u Kupca.
5. Fox quest dotyczy konkretnego lisa i nie przejmuje targetu `grozny-wilk`.
6. Formalne paid quests nie podbijają relation.
7. Fox quest daje małą social consequence tylko raz.
8. Save/load ukończonego paid questa nie umożliwia ponownej wypłaty.

> **Zrób git commit i push do main, rebase jeżeli trzeba**