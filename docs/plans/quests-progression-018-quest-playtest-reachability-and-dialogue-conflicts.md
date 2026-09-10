# Plan: Quest playtest reachability and dialogue conflicts

**Created:** 2026-09-11
**Status:** `planned` 📋
**Type:** fix
**Priority:** high · **Effort:** M
**Depends on:** ~~quests-progression-005~~, quests-progression-014
**Domain:** `quests-progression`
**Subdomains:** `quests` `relationships`
**Tags:** `dialogue` `merchant` `reachability` `playtest`
**Roadmap:** `quests-and-reputation.md`

## Cel

Usunąć trzy problemy wykryte w manualnym playteście authored questów bez tworzenia równoległego systemu questów/dialogów:

1. `Zioła dla Anny` może być praktycznie zablokowane przez rzadki seed-dependent spawn `herb`.
2. `Zwiad okolicy` wymusza realne wypatrzenie `stag`, mimo że dla konkretnego seeda zwierzę może nie występować w rozsądnej odległości.
3. `Dzik przy szlaku` może zostać zablokowany, gdy Piotr ma równocześnie własny aktywny quest — giver reminder wygrywa obecnie przez kolejność `QuestDef` i zasłania wymagane `talk_to_npc`.

Zmiany mają wzmacniać istniejące mechanizmy (`tradeCatalog`, `QuestManager`, `QuestDialogOverride.actions`) i zachować prawdziwy world state jako źródło faktów. Nie dodawać debug API w ramach tego planu.

## Stan obecny

### Zioła

`ziola-dla-anny` ma finalny objective:

```ts
{ type: 'gather_item', kind: 'herb', count: 3 }
```

`herb` jest world-chunk collectible generowanym przez `terrain/chunkItems.ts`. Home chunk nie generuje chunk items, a `herbWeight` jest celowo niski i zależny od biome/tree proximity. Quest nie ma gwarancji, że trzy sztuki znajdą się blisko home settlement.

Handel ma już jedno centralne źródło kupieckiej oferty i cen w `src/items/tradeCatalog.ts`: `MERCHANT_PRICES` + `MERCHANT_STOCK`. `herb` ma obecnie fallback `RESOURCE_TRADE_VALUE = 3`, ale nie znajduje się w stocku kupca.

### Zwiad / jeleń

`zwiadowca` ma sekwencję:

```text
interact_spawner cave
→ spot_animal stag (range 16)
→ gather_item stone ×2
→ report to Piotr
```

`spot_animal` przechodzi etap dopiero po realnym zdarzeniu obserwacji. Jeżeli gracz wróci do Piotra przed obserwacją, `handleGiverInteract()` zwraca tylko `reminderLine` — nie ma akcji pozwalającej świadomie zgłosić brak obserwacji ani skłamać.

Istotna własność obecnego flow: jeśli quest nadal jest na etapie `spot_animal`, to samo w sobie jest wiarygodnym dowodem, że poprawne `spot_animal` nie nastąpiło. Nie trzeba dodawać osobnego persisted flag `didSeeStag`.

### Piotr / wiele questów

`QuestManager.onInteract(npcId)` iteruje `defs` i zwraca pierwszy pasujący `QuestDialogOverride`.

Dla NPC będącego giverem aktywnego questa `handleGiverInteract()` może zwrócić reminder zanim pętla dojdzie do innego aktywnego questa, w którym ten sam NPC jest targetem `talk_to_npc`. W efekcie wynik zależy od kolejności definicji.

To jest błąd arbitration, nie błąd konkretnej definicji `dzik-przy-szlaku`.

## Zakres

### 1. Dodać `herb` do kupca jako awaryjne źródło

Rozszerzyć istniejący `src/items/tradeCatalog.ts`:

- dodać `herb` do `MERCHANT_PRICES`,
- dodać `herb` do `MERCHANT_STOCK`,
- nie zmieniać naturalnego spawnu ziół ani `gather_item`.

Cena powinna sprawić, że kupno jest fallbackiem, a nie opłacalnym sposobem farmienia nagrody z `Zioła dla Anny`.

Przy obecnym `RESOURCE_TRADE_VALUE.herb = 3` i nagrodzie questa 8 monet za 3 sztuki przyjąć **5 monet za jedno zioło**:

```text
3 herbs bought = 15 coins
quest reward = 8 coins
```

Gracz może odblokować quest pieniędzmi, ale zbieranie w świecie pozostaje korzystniejsze.

Nie tworzyć quest-specific merchant stock ani specjalnego zakupu „na potrzeby questa”.

### 2. Pozwolić wrócić do Piotra bez wypatrzenia jelenia

Nie usuwać realnego `spot_animal` — gracz, który faktycznie wypatrzy `stag`, powinien nadal przejść etap automatycznie jak dziś.

Gdy `zwiadowca` jest aktywny dokładnie na etapie `spot_animal stag` i gracz rozmawia z giverem (Piotr), dialog powinien dodatkowo pozwalać wybrać jedną z dwóch świadomych wypowiedzi:

```text
„Tak, widziałem jelenia.”
„Nie widziałem jelenia.”
```

Ponieważ te akcje są dostępne tylko wtedy, gdy etap `spot_animal` nadal jest aktywny:

- `Tak, widziałem jelenia.` jest świadomym kłamstwem,
- `Nie widziałem jelenia.` jest uczciwym przyznaniem braku obserwacji.

Obie odpowiedzi mają pozwolić kontynuować quest do istniejącego etapu `gather_item stone ×2`, aby seed nie mógł zablokować questa.

Kłamstwo powinno mieć niewielką, jawnie modelowaną konsekwencję społeczną zgodną z istniejącym systemem reputacji — preferowana jest ujemna zmiana `integrity`, bez tworzenia osobnego morality/lie systemu. Uczciwa odpowiedź nie powinna karać `integrity`.

Nie dopisywać persisted `didSeeStag`: realne wypatrzenie już powoduje przejście do następnego etapu, więc alternatywne odpowiedzi są potrzebne wyłącznie w nierozwiązanym `spot_animal` stage.

### 3. Reużywalna akcja dialogowa aktywnego etapu

Obecny model ma:

- giver offer/report,
- `talk_to_npc`,
- terminalny `talk_to_npc_choice`,
- `QuestDialogOverride.actions`.

Nie specjalizować `QuestManager` przez warunek `def.id === 'zwiadowca'`.

Dodać najmniejszy reużywalny mechanizm authored stage dialogue action, który może:

- pojawić się przy rozmowie z określonym NPC/giverem podczas aktywnego etapu,
- mieć player-facing label,
- przejść do następnego etapu bez terminalnego resolution całego questa,
- opcjonalnie zastosować istniejącą konsekwencję społeczną.

Mechanizm ma korzystać z istniejącego `QuestDialogOverride.actions` i `advanceStage()`. Nie tworzyć dialogue tree ani drugiego managera dialogów.

Nazwę/kształt typu ustalić spójnie z obecnym `QuestStage`; ważny jest kontrakt, nie konkretna nazwa pola.

Walidacja definicji powinna odrzucać puste player lines i niepoprawne targety/konsekwencje analogicznie do istniejącej walidacji `talk_to_npc_choice`.

### 4. Naprawić arbitration wielu questów na jednym NPC

Zmienić `QuestManager.onInteract()` tak, aby aktywny `talk_to_npc` / `talk_to_npc_choice` / stage dialogue action skierowany do danego NPC **nie mógł zostać zasłonięty przez reminder innego questa, którego ten NPC jest giverem**.

Minimalny wymagany przypadek:

```text
zwiadowca = active, giver Piotr
  +
dzik-przy-szlaku = active, current objective talk_to_npc Piotr

→ rozmowa z Piotrem musi udostępnić akcję z dzik-przy-szlaku
```

Preferować deterministyczne zebranie questowych akcji dla danego NPC przed wyborem czysto informacyjnego giver reminder. Jeśli kilka aktywnych questów daje różne jawne akcje na tym samym NPC, UI powinno móc pokazać je razem przez istniejące `QuestDialogOverride.actions`, zamiast wybierać jedną na podstawie kolejności `defs`.

Nie scalać automatycznie terminalnych outcome'ów i nie wykonywać kilku progresji jednym kliknięciem. Każda akcja musi zachować własny callback i rewalidować stan/stage w momencie wyboru, tak jak obecne `selectTalkToNpc*`.

Kolejność prezentacji musi być stabilna/deterministyczna.

### 5. Markery questowe

Sprawdzić `labelMarker()` pod tym samym scenariuszem wielu questów.

Jeśli Piotr jest jednocześnie giverem aktywnego questa i wymaganym targetem rozmowy innego questa, marker powinien preferować stan oznaczający **wymaganą akcję rozmowy**, a nie zwykłe „quest in progress”.

Nie dodawać nowego systemu markerów — zachować istniejące `QUEST_MARKER_*`.

## Testy automatyczne

Rozszerzyć istniejące testy `QuestManager` / quest definitions / trade catalog, co najmniej o:

1. `herb` jest merchant stock i ma cenę 5.
2. `ziola-dla-anny` nadal wymaga normalnego `gather_item herb ×3`; zakupione zioła działają przez zwykły inventory path.
3. Realne `spot_animal stag` nadal przechodzi `zwiadowca` do kamieni bez dodatkowej rozmowy.
4. Podczas nierozwiązanego etapu `spot_animal stag` Piotr pokazuje dwie authored akcje: kłamstwo i uczciwe przyznanie braku obserwacji.
5. Każda z tych akcji przechodzi tylko bieżący etap, nie kończy całego questa i prowadzi do `gather_item stone ×2`.
6. Kłamstwo stosuje tylko zamierzoną konsekwencję społeczną; uczciwa odpowiedź jej nie stosuje.
7. Aktywny giver reminder Piotra nie zasłania `talk_to_npc Piotr` z `dzik-przy-szlaku`.
8. Dwa równoczesne jawne quest actions na jednym NPC są dostępne deterministycznie i wybór jednej nie odpala drugiej.
9. `labelMarker(Piotr)` wskazuje wymagany talk target, gdy Piotr jest jednocześnie giverem innego aktywnego questa.
10. Istniejące offer/report/talk choice oraz completed fallback nadal działają.

## Relevant files / systems

Zweryfikowane punkty wejścia:

- `src/quests/quests.ts`
  - `QuestStage`, `QuestObjective`, `QuestConsequences`,
  - `validateQuestDefinitions()`,
  - `zwiadowca`, `ziola-dla-anny`, `dzik-przy-szlaku`.
- `src/quests/QuestManager.ts`
  - `onInteract()`,
  - `handleGiverInteract()`,
  - `resolveTalkToNpcChoice()`,
  - `selectTalkToNpc()`, `selectTalkToNpcChoice()`,
  - `advanceStage()`,
  - `labelMarker()`.
- `src/quests/QuestManager.test.ts`
- `src/quests/quests.test.ts`
- `src/items/tradeCatalog.ts`
- odpowiednie testy trade catalogu / merchant UI tylko jeśli istniejący kontrakt stocku tego wymaga.

Ważne publiczne/architektoniczne nowe helpery lub typy opisać JSDoc z `@domain quests-progression`, jeśli ułatwi to późniejszy preflight.

## Guardrails

- Nie dodawać debug API — będzie osobnym zadaniem.
- Nie gwarantować spawnów `herb` ani `stag` przez quest-specific worldgen.
- Nie teleportować/spawnować jelenia na potrzeby questa.
- Nie tworzyć osobnego systemu kłamstw/moralności.
- Nie tworzyć dialogue tree.
- Nie opierać arbitration na display name; zachować `NpcId` jako identity.
- Nie rozwiązywać konfliktu przez zmianę kolejności `QUESTS`.
- Nie zmieniać `wolf-den` / `Wilki u kupca` w tym planie.
- Nie robić unrelated refactoru `QuestManager`.
- Nie uruchamiać `pnpm docs:sync`; synchronizacja dokumentacji jest obsługiwana przez workflow repozytorium.

## Weryfikacja manualna

Browser verification wykonuje User.

Scenariusze:

1. Przyjąć `Zioła dla Anny`, kupić 3 zioła u kupca i oddać je Annie; quest kończy się normalnie.
2. `Zwiad okolicy`: realnie wypatrzyć jelenia → etap kamieni działa jak wcześniej.
3. `Zwiad okolicy`: nie wypatrywać jelenia, wrócić do Piotra → widoczne są `Tak, widziałem jelenia.` oraz `Nie widziałem jelenia.`; obie ścieżki pozwalają przejść do kamieni.
4. Mieć równocześnie aktywny `Zwiad okolicy` i `Dzik przy szlaku` na etapie rozmowy z Piotrem → Piotr udostępnia akcję związaną z dzikiem mimo własnego reminderu.
5. Po wybraniu akcji dzika tylko ten quest przechodzi do kolejnego etapu; `Zwiad okolicy` zachowuje swój stan.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
