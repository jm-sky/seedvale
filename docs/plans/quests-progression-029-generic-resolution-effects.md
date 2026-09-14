# Plan: Generic quest resolution effects

**Created:** 2026-09-13
**Status:** `verification needed` 🔍 — implemented and technically verified (`vue-tsc`/lint/targeted vitest); browser/gameplay verification is still open.
**Type:** refactor
**Priority:** high · **Effort:** M
**Model:** Composer, Sonnet
**Depends on:** none
**Domain:** `quests-progression`
**Subdomains:** `quests` `rewards`
**Tags:** `consequences` `persistence`
**Roadmap:** `quests-and-reputation.md`
**Implemented at:** 2026-09-14 06:20

## Goal

Rozdzielić **deklarację skutku** od **quest-id switcha w `createApp.ts`**. `QuestManager` ma dispatchować mały, jawny zestaw questowych efektów przez injected seams do systemów, które faktycznie posiadają mutowany stan: inventory, NPC inventory, fauna ownership, `LocationKnowledge` i carried containers.

Nie przenosić ownership świata do `QuestManager` i nie tworzyć drugiego outcome pipeline.

## Why

Lost hunter i treasure-map bear cave wymagają `if (questId === …)` w composition root. Kolejne plany (024–027) skopiują ten wzorzec. Stage `effects`, terminal `reward`/`consequences`, fizyczne `onResolve` i końcowy transfer konia są dziś równoległymi sposobami deklarowania skutków questa.

Recon: `docs/reviews/2026-09-13--quest-system-architecture-recon.md` (P6, P7, Stage B).

## Non-goals

- Nowa waluta, EXP, skill tree.
- Przepisanie wszystkich authored `reward`/`consequences` na nowy union w jednym PR — stare pola mają pozostać cukrem.
- Work-contract posting jako effect (brak drugiego konsumenta).
- Skill XP effect, dopóki nie ma drugiego call site (books już uczą skilli poza questami).
- Usuwanie `horseRewardAnimalId` jako lifecycle bindingu/rezerwacji konia.
- Przenoszenie inventory NPC, fauna state, container state lub innych world-owned danych do `QuestManager`.
- Ogólny transaction/effect framework.

## Current code

- `QuestReward` / `QuestConsequences` / `QuestStageEffect` w `src/quests/quests.ts`.
- `QuestManager.applyOutcome`, `selectStageDialogueAction`, injected `grantItem`, `transferAnimalOwnership`, `lifecycleHooks.revealLocation`.
- `QuestDef.horseRewardAnimalId` uczestniczy nie tylko w końcowym transferze ownership, ale również w availability/rezerwacji oraz failure po śmierci targetu.
- `src/app/createApp.ts` — `physicalOutcomeResolver.canResolve` / `onResolve` oraz `questLifecycleHooks.onStageAdvanced` dla lost hunter i bear cave.
- Dialogue action już ma `requireItemInstanceId`, `requireCarriedContainerId`, `requireCarriedUnopened`, `physicalOutcomeId`.

## Approach

1. Rozszerzyć istniejący mały effect union używany przez stage actions i terminal outcomes. Nie tworzyć osobnego `QuestEffectRunner`, chyba że wydzielenie pliku będzie potrzebne wyłącznie organizacyjnie.

2. Dodać wyłącznie warianty potrzebne przez istniejące migracje:
   - `reveal_location` — istniejący wariant,
   - transfer konkretnej `ItemInstance` z inventory gracza do wskazanego NPC/givera przez nowy injected seam,
   - `transfer_animal_ownership` — tylko końcowa mutacja ownership; nie zastępuje lifecycle metadata konia,
   - discard konkretnego carried container przez injected/container-owned seam,
   - grant itemów/monet przez istniejący `grantItem`.

3. Wprowadzić jawny seam dla transferu instancji itemu, np. `QuestItemInstanceTransfer`. `QuestManager` podaje `instanceId` i target NPC; implementacja w composition/world layer atomowo wykonuje usunięcie instancji z player inventory i dodanie tej samej instancji do `personalInventory` NPC. `QuestManager` nie importuje ani nie mutuje NPC inventory bezpośrednio.

4. `QuestDef.horseRewardAnimalId` **pozostaje** jako binding/lifecycle metadata wykorzystywane przez:
   - availability / `canReserveHorseReward`,
   - `isHorseRewardReserving`,
   - `onHorseRewardTargetDied`,
   - powiązanie targetu z konkretnym questem.

   Końcowy success może delegować sam transfer ownership przez ten sam effect dispatch. Nie usuwać ani nie neutralizować istniejących guardów lifecycle konia w tym planie.

5. `physicalOutcomeResolver.canResolve` pozostaje injected i read-only względem świata. Sprawdza preconditions, np.:
   - player posiada konkretną `ItemInstance`,
   - konkretny container jest aktualnie niesiony,
   - container jest otwarty/zamknięty zgodnie z wymaganiem.

   Predykat nie wykonuje mutacji.

6. Mutacje fizycznego outcome nie mogą być wykonywane w `createApp.ts` **przed** udanym terminal resolution. `tryResolvePhysicalOutcome` powinien po pozytywnym `canResolve` wejść w ten sam exact-once terminal path co pozostałe outcome, a terminal effects mają być częścią tego path.

7. Zachować kolejność i failure semantics obecnego `applyOutcome`:
   - preconditions są sprawdzane przed mutacją,
   - terminal outcome może zostać zastosowany tylko raz,
   - world mutation effect, który może zawieść, musi mieć jawny kontrakt (`boolean`/result) i nie może pozostawić częściowo zastosowanego outcome,
   - jeżeli istniejąca semantyka przewiduje fallback do failed outcome (np. brak konia przy transferze), zachować ją,
   - efekty czysto addytywne (`grantItem`, `reveal_location`, social consequences) nie są replayowane po restore terminalnego questa.

   Nie wprowadzać ogólnego rollback frameworku. Dla seamów obejmujących transfer ownership wymagających kilku operacji zapewnić atomowość **wewnątrz właściciela danego systemu/seama**.

8. Lost hunter:
   - `requireItemInstanceId` pozostaje precondition,
   - return bow deklaruje effect transferujący konkretny bow instance do givera,
   - keep bow nie wykonuje transferu i instancja zostaje u gracza,
   - usunąć quest-id-specific mutation z `createApp.ts`.

9. Treasure-map bear cave:
   - carried/unopened/opened pozostają world/container preconditions,
   - return deklaruje discard konkretnego carried container + payout,
   - payout nadal jest wyliczany poza `QuestManager` z authored/binding data i trafia do efektu jako gotowa wartość,
   - nie tworzyć generycznej mapy questowych world flags; użyć istniejącego container-owned API albo małego injected callbacku,
   - stage reveal location przenieść do authored stage `effects`, zamiast `stageIndex === 1` w `questLifecycleHooks`.

10. Po migracji `createApp.ts` nie zawiera `questId === lostHunterBinding.questId` ani `TREASURE_MAP_BEAR_CAVE_QUEST_ID` do wyboru mutation path. Bindingi nadal dostarczają **wartości** (`instanceId`, `containerId`, `locationId`, payout) do finalnego `QuestDef` przy materializacji — to jest właściwe miejsce.

11. Zachować `reward.items` + `consequences` jako istniejący sugar wywołujący te same wewnętrzne helpery/dispatch. Nie przepisywać istniejących quest definitions bez potrzeby.

## Ownership / architecture guardrails

- `QuestManager` posiada lifecycle/progress questa i decyzję **jaki efekt** wykonać.
- Player inventory pozostaje własnością `Inventory`.
- NPC inventory pozostaje własnością stanu NPC/settlement.
- Fauna ownership pozostaje własnością fauna systemu.
- Carried container/open state pozostaje własnością container/world systemu.
- Location knowledge/navigation pozostaje własnością odpowiednich world services.
- Effect payload przechowuje stabilne identyfikatory i authored wartości, nie runtime object references.
- Żaden effect nie może rozpoznawać questa po `questId` ani parsować quest-id prefixów.

## Persistence

Bez bumpa `CURRENT_SAVE_VERSION`, jeśli effecty są wyłącznie częścią runtime `QuestDef` i są aplikowane tylko przy pierwszym przejściu do terminal state.

Nie zapisywać `effectsApplied` osobno. `resolvedOutcomeId` + terminal state pozostają exact-once guardem. Restore completed/failed questa nie może ponownie uruchamiać terminal effects.

Bindingi dynamicznych wartości (`instanceId`, `containerId`, horse id) muszą nadal odbudowywać te same stabilne referencje zgodnie z istniejącymi zasadami danego questa; ten plan nie zmienia ich persistence ownership.

## Verification

- `QuestManager` regression: istniejące outcome/reward/consequences nadal przechodzą przez jeden `applyOutcome` path i nie duplikują efektów.
- Exact-once: ponowne resolve oraz restore completed/failed nie grantują ponownie itemów, nie transferują ponownie ownership i nie discardują drugi raz containerów.
- Lost hunter:
  - return bow → dokładnie ta sama `ItemInstance` znika z player inventory i trafia do `personalInventory` giversa,
  - keep bow → instancja zostaje u gracza,
  - brak bow przy resolve → brak mutation i brak terminal success,
  - brak `questId` branch w `createApp.ts`.
- Bear cave:
  - return unopened → wymagany właściwy carried container, discard dokładnie raz, payout dokładnie raz,
  - keep opened → nie discarduje/grantuje return payout,
  - niewłaściwy stan container → brak mutation i brak terminal success,
  - reveal location przez stage effect, bez index-specific lifecycle hooka,
  - brak `questId` branch w resolverze.
- Horse reward:
  - availability/rezerwacja działa jak przed refactorem,
  - śmierć reserved horse nadal prowadzi istniejącą ścieżką failure,
  - success transferuje ownership dokładnie raz,
  - failure transferu nie kończy się częściowo zastosowanym success outcome.
- Uruchomić odpowiednie unit/integration tests oraz build/typecheck zgodnie z repo; browser verification wykonuje User.

## Risks

- **Partial mutation przed terminalem** — największe ryzyko. Zakaz wykonywania physical mutation w `createApp.onResolve` przed exact-once outcome path.
- **Regresja horse lifecycle** — `horseRewardAnimalId` pozostaje lifecycle bindingiem; nie usuwać jego availability/reservation/death semantics.
- **QuestManager przejmuje world ownership** — wszystkie mutacje konkretnego systemu przechodzą przez injected seams.
- **Zbyt szeroki union „na przyszłość”** — tylko warianty użyte przez bieżącą migrację.
- **Nieatomowy transfer ItemInstance** — remove+add ma być jednym kontraktem seama, nie dwiema niezależnymi operacjami sterowanymi przez `QuestManager`.
- **Payout bear cave** — wyliczenie pozostaje w warstwie authored binding/world composition; `QuestManager` otrzymuje gotowy payload do grantu.
- **Quest-specific world flags** — nie generalizować ich w tym planie; preferować istniejący container state/API.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
