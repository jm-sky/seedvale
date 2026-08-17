# Plan: NPC pomoc graczowi w jedzeniu i piciu — implementation notes

**Created:** 2026-08-17
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** ~~106~~ ~~069~~ ~~122~~

## Review summary

Plan 144 jest dobrze dopasowany do obecnej architektury i nie wymaga nowego systemu interakcji, inventory ani relacji. Najważniejsze rzeczy do doprecyzowania przed implementacją wynikają z faktycznego codebase:

1. NPC dialogue v2 już ma istniejący temat `help` oraz `QuestDialogOverride`; nie należy tworzyć drugiego mechanizmu ofert. `NpcDialogueMenu.vue` jest właściwym punktem UI.
2. `NpcDialogueMenu` już obsługuje `accept/decline`, a `store.ts` pobiera `QuestManager.onInteract()` przy otwieraniu dialogu. Pomoc żywnościowa nie powinna być wciskana do questowego `QuestDialogOverride`, jeśli nie jest questem. Lepiej rozszerzyć istniejący flow o osobny wynik/handler dla assistance.
3. `Inventory` ma już dokładnie potrzebne operacje `count()`, `has()`, `add()` i `remove()`. Nie dodawać osobnego API transferu, dopóki prosty atomowy resolver nie jest potrzebny.
4. `PlayerNeeds.eatFood()` i `drinkWater()` są właściwymi operacjami końcowymi. Nie modyfikować bezpośrednio `needs.hunger.current` / `needs.thirst.current`.
5. Istniejący `reactionChance.ts` jest **probabilistyczny**, bo finalny roll wykonuje caller przez `Math.random()`. Plan 144 mówi o deterministycznej decyzji. Nie kopiować bezrefleksyjnie `computeReactionChance()` z losowym roll'em. Jeśli deterministyczność jest wymagana, rozszerzyć istniejący model o czystą funkcję willingness/score i użyć stabilnego wejścia/rolla zgodnego z istniejącym RNG/deterministic simulation. Nie tworzyć osobnego utility-AI.
6. Największa rzecz do sprawdzenia podczas implementacji: aktualne `NpcAgent.inventory` jest generycznym carried inventory używanym przede wszystkim przez istniejące zachowania transportowe. Sam fakt istnienia inventory nie oznacza, że zwykli NPC faktycznie noszą `tomato`, `bread`, `raw_meat`, `roasted_meat` albo `waterskin_full`. V1 nie może udawać, że te itemy istnieją przy NPC. Najpierw sprawdzić realne źródła zapisów do NPC inventory. Jeśli zwykli NPC nie dostają consumables, plan powinien w implementacji ograniczyć pomoc do faktycznie dostępnych carried items albo zatrzymać się przed dodawaniem nowego mechanizmu zaopatrzenia NPC.
7. Woda ma dodatkową niejednoznaczność: `waterskin_full` jest itemem typu container-swap. Trzeba zachować istniejącą semantykę `full → empty` i nie tworzyć specjalnego `Household.water → Player` transferu.

## Potwierdzone punkty codebase

### Player needs

`src/player/PlayerNeeds.ts` ma publiczne:

- `eatFood(needs, hungerRelief)` → istniejący `restoreHunger()`;
- `drinkWater(needs, thirstRelief)` → istniejący `restoreThirst()`.

Te funkcje powinny być jedynym miejscem zastosowania efektu potrzeby podczas pomocy NPC. fileciteturn5file0L2-L2

### Inventory

`src/items/Inventory.ts` jest generycznym kontenerem używanym także przez NPC. Ma `count`, `has`, `add`, `remove`, `toJSON` oraz limit wagowy. Transfer powinien używać tych metod zamiast dostępu do prywatnego `counts`. fileciteturn6file0L2-L2

### Consumables

`src/items/itemCatalog.ts` jest źródłem prawdy dla tego, czy item jest consumable oraz jaki pool potrzeb i relief modyfikuje. Aktualnie food obejmuje m.in. `tomato`, `raw_meat`, `roasted_meat`, `bread`; woda używa `waterskin_empty` / `waterskin_full`. fileciteturn8file0L2-L2

### NPC social lookup

`src/ai/reactionChance.ts` definiuje już `PlayerSocialLookup`:

`(npcName) => { relationLevel, standing }`

oraz `computeReactionChance()` korzystające z relation, personality, `curious` i standing. `NpcAgent` już importuje ten moduł. Nie dodawać `QuestManager` jako zależności do `NpcAgent`. fileciteturn19file0L2-L2

### Dialogue v2

`src/ui-vue/NpcDialogueMenu.vue` już ma temat `help`, a stan dialogu posiada `helpResult` typu `QuestDialogOverride`. UI ma już mechanizm przyjęcia/odrzucenia oferty. fileciteturn15file0L2-L2

`src/ui-vue/store.ts` przy otwarciu dialogu wywołuje `questManager.onInteract(npc.name)`, a istniejący `acceptNpcDialogueOffer()` wykonuje `offer.onAccept()`. To jest istniejący questowy flow, którego nie należy przeciążać nową odpowiedzialnością. fileciteturn17file0L2-L2

`src/ui/createNpcDialog.ts` jest tylko compatibility facade; właściwy dialog v2 znajduje się w Vue. fileciteturn13file0L2-L2

## Zalecana architektura implementacji

### 1. Oddziel „quest help” od „survival assistance” na poziomie danych

Obecne `helpResult` reprezentuje questowy `QuestDialogOverride`. Nie dodawać do niego pól typu `food/water`, ponieważ zmieszałoby dwa różne mechanizmy.

Preferowany minimalny kierunek:

```text
NpcDialogueMenu
  ├─ istniejący quest/help offer
  └─ request food / request water
          ↓
      assistance resolver
          ↓
      NPC inventory + social state
          ↓
      Player inventory / PlayerNeeds
```

Może to być mały typ/result i callback skonfigurowany razem z istniejącym dialogiem. Nie tworzyć `NpcHelpManager` ani globalnego managera.

### 2. UI

W `src/ui-vue/NpcDialogueMenu.vue` dodać dwa przyciski tylko na ekranie tematów:

- `Poproś o jedzenie`;
- `Poproś o picie`.

Widoczność powinna być zależna od aktualnego stanu gracza/NPC:

- prośba o jedzenie ma sens, gdy gracz nie jest pełny i istnieje potencjalny carried food;
- prośba o picie ma sens, gdy gracz nie jest pełny i NPC może potencjalnie mieć carried water.

Nie robić dodatkowego ekranu.

Nie ukrywać przycisku wyłącznie dlatego, że NPC aktualnie nie ma itemu, jeśli UX ma pozwalać na naturalną odmowę; ważniejsze jest, aby resolver zawsze ponownie sprawdził stan przy akcji. Jeśli przyciski będą filtrowane po inventory, nie wolno traktować tego filtra jako autorytatywnej walidacji.

### 3. Resolver pomocy

Resolver powinien być synchroniczny i wywoływany wyłącznie po kliknięciu prośby.

Sugerowany wynik:

```text
success
reason: 'given' | 'no_item' | 'unwilling'
kind
line
```

Wszystkie warunki sprawdzać ponownie w resolverze, aby uniknąć stalego UI state.

Kolejność:

1. sprawdź aktualny player need;
2. znajdź odpowiedni carried consumable w `npc.inventory`;
3. oceń willingness;
4. dopiero po pozytywnej decyzji wykonaj atomowy transfer/consumption;
5. zwróć tekst odpowiedzi do istniejącego dialogu.

Nie zmniejszać inventory NPC przed potwierdzeniem willingness.

### 4. Wybór itemu

Nie hardcodować logiki `if tomato else bread else...` w UI.

Użyć `ITEM_CATALOG[kind].consumable` jako źródła prawdy. Resolver może mieć małą, scentralizowaną preferowaną kolejność itemów dla danego need, np. według relief, ale nie powinien duplikować danych relief z katalogu.

Przykładowo:

```text
food candidates = inventory kinds where ITEM_CATALOG[kind].consumable?.need === 'hunger'
water candidates = inventory kinds where ...need === 'thirst'
```

Jeśli iterowanie po wszystkich `ItemKind` jest niepożądane, można utrzymywać małą listę kategorii kandydatów, ale wartości relief nadal muszą pochodzić z catalogu.

### 5. Woda

Traktować `waterskin_full` zgodnie z catalogiem jako consumable z `resultKind: waterskin_empty`.

Nie wymyślać nowego pojemnika ani nie odejmować `Household.water`.

Przed implementacją potwierdzić dokładny istniejący player consume path dla `resultKind`. Jeśli obecny consume handler robi:

```text
remove(full)
add(empty)
drinkWater(...)
```

to pomoc powinna użyć tego samego mechanizmu lub wyodrębnić z niego małą wspólną funkcję domenową. Nie duplikować swapu w dwóch miejscach.

## Ważna decyzja UX/gameplay: transfer vs natychmiastowe spożycie

Plan miesza dwa sformułowania:

- „gracz otrzymuje zasób”;
- „przekazanie ... stosuje istniejący efekt nawodnienia”.

Przed implementacją należy przyjąć jedną semantykę.

Rekomendacja dla V1: **NPC przekazuje jeden consumable, a gracz natychmiast go używa**, ponieważ mechanika ma być bezpośrednią pomocą w głodzie/pragnieniu, a acceptance criteria wymagają zmiany `PlayerNeeds`. W takim wariancie:

- NPC inventory: `-1 consumable`;
- player inventory: brak trwałego +1 dla zwykłego food, ponieważ item został zużyty;
- player need: `+relief`;
- dla `waterskin_full`: zachować istniejący `full → empty` swap po stronie gracza tylko jeśli obecny consume path semantycznie go zachowuje.

Jeśli zamiast tego chcemy dosłownie „dać item do inventory gracza”, trzeba zmienić acceptance criteria tak, aby potrzeba nie rosła automatycznie. Nie implementować obu semantyk jednocześnie.

## Willingness / determinism

To jest najważniejsza korekta względem obecnego planu.

`computeReactionChance()` ma charakter probabilistyczny i jest używany do reakcji na gracza. Plan 144 wymaga decyzji wynikającej ze stanu NPC, ale jednocześnie mówi o deterministyczności.

Preferowany kierunek:

- rozszerzyć `src/ai/reactionChance.ts` o małą, czystą funkcję pomocniczą dla willingness, jeśli istniejące składniki są wystarczające;
- relation ma największą wagę;
- personality/openness + relevant traits + standing są modyfikatorami;
- własny głód/pragnienie NPC jest silnym ograniczeniem — NPC nie powinien oddawać ostatniego zasobu potrzebnego do własnego przetrwania;
- wynik powinien być stabilny dla tego samego stanu/zdarzenia, jeśli projekt wymaga deterministic simulation;
- nie wprowadzać LLM ani pełnego utility AI.

Jeżeli implementacja świadomie pozostanie probabilistyczna, trzeba zmienić wording planu z „deterministyczna” na „lokalna, nie-LLM, probabilistyczna decyzja”, aby dokumentacja nie była sprzeczna z kodem.

## NPC własne potrzeby

Plan słusznie wymienia `own needs`, ale powinno to mieć konkretne znaczenie.

Minimalna zasada V1:

- NPC nie oddaje itemu, jeżeli jest to jego jedyny bezpośrednio potrzebny carried resource i NPC jest w stanie wysokiej potrzeby;
- nie próbować symulować całego gospodarstwa ani przyszłego zaopatrzenia;
- `Household.stock` i `Household.water` nie są fallbackiem.

Ważne: najpierw sprawdzić, czy istniejący NPC `Needs` i inventory są faktycznie połączone z carried consumables. Nie dodawać nowego systemu „NPC survival inventory” tylko po to, żeby acceptance test miał pozytywny przypadek.

## Social state

`NpcAgent` już ma `PlayerSocialLookup`, więc resolver powinien otrzymać social state przez istniejący hook/lookup, zamiast importować `QuestManager` do logiki NPC.

Nie przechowywać relacji drugi raz w resolverze/UI.

`QuestManager.getPlayerStanding()` pozostaje źródłem globalnego standing.

## Persistence

Nie dodawać nowego save state.

Jednocześnie trzeba sprawdzić rzeczywisty status NPC inventory w persistence. `Inventory.toJSON()` istnieje, ale nie oznacza automatycznie, że NPC inventory jest obecnie zapisywane/odtwarzane jako część NPC save.

Jeśli NPC inventory jest runtime-only, przekazanie itemu powinno być traktowane jako runtime consequence zgodnie z istniejącą polityką NPC. Nie tworzyć osobnej persystencji dla planu 144.

## Testy

Najbardziej wartościowe są testy czystego resolvera/willingness, a nie testy UI.

Minimalny zestaw:

- food item present + willing → success;
- food absent → `no_item`;
- water item present + willing → success;
- water absent → `no_item`;
- unwilling → inventory unchanged;
- successful transfer → NPC inventory −1;
- successful consumption → player need increases zgodnie z `ITEM_CATALOG`;
- full waterskin zachowuje istniejącą semantykę container swap;
- NPC nie oddaje ostatniego krytycznego zasobu, jeśli implementacja włącza own-needs guard;
- resolver nie zmienia stanu przy nieudanej próbie.

## Browser verification

Weryfikacja manualna powinna użyć NPC, który **faktycznie ma** odpowiedni carried item. Jeśli zwykli NPC nie mają takich itemów w obecnym runtime, najpierw potrzebny jest istniejący debug/setup path do wyposażenia NPC — nie należy dodawać player-centric produkcyjnego źródła tylko dla testu.

Sprawdzić:

1. NPC z carried food + odpowiednią relacją → prośba → pomoc → potrzeba gracza rośnie i inventory NPC maleje.
2. NPC bez food → prośba → naturalna odmowa, bez zmiany inventory.
3. NPC z `waterskin_full` → prośba → istniejący water consume path, bez `Household.water`.
4. NPC z niską relacją / niechętny → odmowa, bez utraty itemu.
5. Ponowna prośba po zużyciu jedynego itemu → brak zasobu, bez podwójnego transferu.

## Suggested implementation order

1. Prześledzić realne źródła `NpcAgent.inventory` i potwierdzić, jakie consumables mogą faktycznie wystąpić.
2. Prześledzić istniejący player consume handler, szczególnie `resultKind` dla waterskin.
3. Wyodrębnić mały pure resolver/willingness bez zależności od UI.
4. Podłączyć resolver do istniejącego NPC dialogue v2.
5. Dodać dwa request topics w `NpcDialogueMenu.vue`.
6. Dodać testy resolvera.
7. Uruchomić `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test`.
8. Wykonać browser/manual verification z realnym carried itemem.

## Guardrails dla Claude

- Nie twórz `NpcHelpManager`.
- Nie twórz `PlayerAssistanceManager`.
- Nie twórz drugiego `Inventory`, `ReputationManager` ani `SocialBehaviour`.
- Nie importuj `QuestManager` do `NpcAgent`/resolvera tylko po to, aby pobrać relation.
- Nie pobieraj food/water z `Household` w V1.
- Nie teleportuj NPC do domu.
- Nie dodawaj per-frame scanów.
- Nie dodawaj LLM.
- Nie kopiuj relief values poza `ITEM_CATALOG`.
- Nie mutuj inventory przed zakończeniem walidacji decyzji.
- Nie dodawaj save state bez wykazania, że obecna polityka NPC inventory tego wymaga.
- Jeśli codebase nie zapewnia żadnego realnego źródła carried consumables dla NPC, nie obchodź tego przez magiczne dodawanie itemów w momencie prośby. Zatrzymaj się na faktycznym stanie systemu i zgłoś rozbieżność z planem.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
