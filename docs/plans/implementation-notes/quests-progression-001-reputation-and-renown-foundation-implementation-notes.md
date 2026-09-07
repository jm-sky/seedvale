# Implementation Notes: quests-progression-001 — Reputation & Renown Foundation

## Najważniejsze ustalenia z aktualnego codebase

- `QuestManager` jest app-level ownerem quest progress/EXP/player↔NPC relations i żyje poza `WorldBundle`; `WorldBundle` może być przebudowany w tej samej sesji. `ReputationManager` powinien mieć ten sam lifetime co `QuestManager` (tworzony w `createApp.ts`), a nie być polem `WorldBundle`. Dzięki temu nie trzeba dodawać kolejnego carry-state przez rebuild.
- Obecny `PlayerSocialLookup` w `src/ai/reactionChance.ts` ma postać `(npcName) => { relationLevel, standing }`. `standing` to `QuestManager.getPlayerStanding()` — średnia relations znormalizowana do `0..1`, nie realna reputation. Ten kontrakt jest przekazywany istniejącą ścieżką `createApp.ts` → `worldBundle.ts` → `SettlementsManager.ts` → `createSettlement.ts` → `NpcAgent` i tę ścieżkę należy zachować.
- `computeReactionChance()` ma dziś `reputationStanding?: number`, z limitem bonusu `0.10`; relation `trusted` daje `0.30`. Zamiana pseudo-standing na `renown / 100` może zachować dokładnie obecny balans bez nowego tuningu.
- `src/settlement/lodgingResolver.ts` używa tego samego `PlayerSocialLookup`, ale konsumuje wyłącznie `relationLevel`. Po zmianie kontraktu nie zmieniać reguł lodging; przekazywać settlement-aware context i ignorować reputation/renown.
- `QuestManager.completeQuest()` jest pojedynczym miejscem końcowego reward/effects: najpierw ustawia stan `complete`, potem stosuje `QuestDef.effects` (`relation`/`exp`) i item reward. To jest właściwe miejsce do dokładnie-jednorazowego wywołania `applySocialConsequence`.

## Istotna luka plan ↔ codebase: quest nie zna settlementu

`QuestDef` (`src/quests/quests.ts`) ma dziś `id`, `giverName`, stages, reward, availability i effects, ale **nie ma `settlementId`**. Jednocześnie plan wymaga, aby social consequence wskazywała konkretny settlement. Nie wolno tego rozwiązywać lookupem po `giverName`/nazwie NPC — te placeholderowe imiona mogą istnieć w wielu osadach.

Najmniejszy przyszłościowy wariant:

- nadać runtime `QuestDef` jawne `settlementId`,
- obecne statyczne questy z `QUESTS` związać w `createApp.ts` z `bundle.settlementsManager.getHomeDef().id` przed przekazaniem do `QuestManager`,
- social deltas mogą nadal być authored przy konkretnym questcie, ale callback dostaje już pełne `{ settlementId, reputation deltas, renown delta }`.

Nie hardcodować home-settlement id w `QuestManager` ani `ReputationManager`. To będzie potrzebne także dla późniejszych questów z innych osad i dla `quests-progression-002`.

## ReputationManager i persistence

Dodać `src/reputation/ReputationManager.ts` jako mały, event-driven registry keyed by `settlementId`. Warto zastosować ten sam sparse-state wzorzec co inne registry: read nie materializuje neutralnego wpisu; write tworzy wpis dopiero przy zmianie; `exportState()` zwraca plain data.

Typy runtime i save mogą być rozdzielone, ale nie duplikować logiki clamp/defaultów. `getReputation()` nie powinno zwracać mutowalnego wewnętrznego obiektu — zwrot readonly/copy zabezpiecza single ownership.

Persistence jest obecnie centralizowane w `src/persistence/saveData.ts` + `src/app/saveState.ts`; testy schematu/migracji są w `src/persistence/saveData.test.ts`. Dodać osobny top-level `reputation`, nie do `SaveQuests`. Starsza wersja save musi migrować do `{ settlements: {} }`; nie używać `getPlayerStanding()` ani badge counters jako migracyjnego źródła danych, bo nie reprezentują historycznej lokalnej wiedzy społecznej.

`New Game` resetuje app-level managery bez wymiany wszystkich referencji (`QuestManager.reset()` już działa w tym stylu), więc `ReputationManager.reset()` należy podpiąć do tego samego flow.

## PlayerSocialLookup / NPC reaction

Zmienić kontrakt w `src/ai/reactionChance.ts` na settlement-aware i przepchnąć typ przez już istniejące pliki:

- `src/app/createApp.ts`
- `src/app/worldBundle.ts`
- `src/settlement/SettlementsManager.ts`
- `src/settlement/createSettlement.ts`
- `src/ai/NpcAgent.ts`
- `src/settlement/lodgingResolver.ts` + testy
- `src/app/actions/actionContext.ts` / rest flow, gdzie typ jest re-exportowany/używany.

`createSettlement.ts` zna `def.id`, więc to tam należy domknąć context NPC jako `{ npcName, settlementId: def.id }`; `NpcAgent` nie powinien sam odkrywać swojej osady ani importować settlement managera.

W `ReactionChanceInput` zastąpić `reputationStanding` polem `renown` albo znormalizowanym `renown01`; preferowane jest przekazanie domenowego `renown: 0..100` i normalizacja wewnątrz `computeReactionChance()`, żeby caller nie posiadał reguły tuningu. Reputation dimensions nie powinny wejść do tej funkcji.

## Quest consequences

Nie dokładać social deltas do obecnego `QuestEffects` jako kolejnych opcjonalnych pól, jeżeli miałoby to mieszać relation/EXP z publicznym społecznym skutkiem. Planowany narrow callback `applySocialConsequence(consequence)` dobrze utrzymuje `QuestManager` niezależny od `ReputationManager` i przygotowuje seam pod `quests-progression-002` bez budowania effects engine.

Dla `grozny-wilk` i `wilcza-jama` authored consequence powinno być jawne per quest, bez defaultów. Wywołanie umieścić w `completeQuest()` obok końcowych effects/reward, po przejściu do `complete`, tak aby ponowne rozmowy z ukończonym giverem nie mogły naliczyć skutku drugi raz.

Testy `src/quests/QuestManager.test.ts` mają helpery wywołujące konstruktor pozycyjnie. Dodanie callbacku do konstruktora łatwo rozbije/cicho przesunie argumenty; dodawać parametr na końcu albo — lepiej, jeśli zmiana pozostaje mała — przejść dla nowych zależności na options/deps object zamiast dokładania kolejnego podobnego callbacku pozycyjnego.

## Badge/Character Screen cleanup

Obecny pseudo-standing jest używany również przez badge UI:

- `src/badges/badges.ts` — `communityOffensePenalty()`;
- `src/app/createApp.ts` oraz `src/app/actions/groundActions.ts` — `getPlayerStanding() - communityOffensePenalty()`;
- `src/ui/createHud.ts` → `src/ui-vue/store.ts#setCharacterBadges`;
- `src/ui-vue/screens/CharacterScreen.vue` — presentation-only label z pojedynczego `standing`.

Usunąć wyłącznie pseudo-standing/penalty coupling. `BadgeManager` nadal ma zachować `gravesDisturbed`, `hiddenFindsFound`, earned badges i ich persistence/testy.

Character Screen nie powinien dostawać stale zapamiętanego `currentSettlementId`. Przy otwarciu/refresh należy wyliczyć settlement context z aktualnego świata/pozycji gracza, a do Vue wpuścić gotowy view state: settlement name/id + pięć wartości + renown albo `null` dla braku lokalnego kontekstu. Badges są niezależne i pozostają widoczne poza osadą.

Uwaga: obecne `setCharacterBadges()` jest event-driven głównie przez Hidden Find. Po rozdzieleniu reputation od badges nie próbować aktualizować reputation UI przez ten stary badge-only hook. Wydzielić osobny setter/view state dla social standing i odświeżać przy otwarciu ekranu oraz po social consequence; nie robić pracy per frame.

## Testy, które warto oprzeć o istniejące miejsca

- nowy `src/reputation/ReputationManager.test.ts` — neutral/sparse/clamp/independent settlements/export+restore/reset;
- istniejące reaction tests dla `src/ai/reactionChance.ts` — `renown=0`, `renown=100 => +0.10`, relation nadal silniejsze;
- `src/quests/QuestManager.test.ts` — callback dokładnie raz i dokładne delty obu wolf questów;
- `src/persistence/saveData.test.ts` — schema + migracja starego save + odrzucenie malformed/out-of-range zgodnie z obecnym stylem validatora;
- `src/badges/badges.test.ts` — usunąć tylko test `communityOffensePenalty`, zachować progression/counters;
- lodging tests zaktualizować wyłącznie do nowego signature `PlayerSocialLookup`, bez zmiany zachowania.

## Kolejność implementacji

1. `ReputationManager` + unit tests.
2. SaveData/migration/saveState/reset.
3. Settlement identity w runtime quest definitions + `applySocialConsequence` i quest tests.
4. Settlement-aware `PlayerSocialLookup` i reaction tests.
5. Character Screen + usunięcie pseudo-standing/badge penalty.

Nie uruchamiać `pnpm docs:sync` ręcznie — synchronizacja dokumentacji działa w GitHub workflow.