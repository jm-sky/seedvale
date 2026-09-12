# Implementation Notes: quests-progression-022 — Lazy Social News Propagation & Reputation Catch-Up

**Reviewed:** 2026-09-12  
**Baseline:** `main` at `55d5a05bd5ad8abbea874c824dc40882e5c2697d`

## Review findings

- Potwierdzony hot path jest dokładnie taki jak w planie: `createApp.ts::onPlayerAnimalKill` → `settlementsWithinDistance()` → `SettlementsManager.peekDef()` → `settlementDefFor()`. Kill nie może po tej zmianie dotykać settlement grid/cache generation.
- `ReputationManager` jest już app-owned, persistent i ma właściwy shared seam `applySocialConsequence()`. `SocialNewsLedger` powinien być jego siblingiem w `createApp.ts`, nie częścią `WorldBundle` ani `SettlementsManager`.
- `LocationKnowledge` pozostaje wyłącznie wiedzą gracza. Nie używać go do ustalania carrierów ani istnienia osad.
- Zależność `quests-progression-019` jest zaimplementowana; zachować istniejący `PlayerAnimalKillContext`, pre-kill quest social-claim check w `gameLoop.ts`, `AnimalAgent.dangerSignificance` i obecne species baselines.

## Ledger i animal deed

Dodać `src/reputation/SocialNewsLedger.ts` jako mały plain-data owner. Konstrukcja obok:

```ts
const reputation = new ReputationManager(initialSave?.reputation)
const socialNews = createSocialNewsLedger(initialSave?.socialNews)
```

Nie wkładać ledgeru do `WorldBundle`: zwykły `rebuildWorldBundle()` ma zachować tę samą instancję. In-session **New Game** w `createApp.ts::rebuildWorld(true)` musi natomiast wykonać `socialNews.reset()` w tym samym miejscu co `reputation.reset()`.

W `animalDeeds.ts` zachować canonical `reputationFactor()` / `renownFactor()` i baselines, ale zamienić settlement-list resolver na `resolveAnimalDeedSignal()`. Jeżeli `SocialNewsSignal` jest zadeklarowany w ledgerze, `animalDeeds.ts` może użyć wyłącznie `import type`; ledger może wtedy runtime-importować attenuation helpers bez realnego cyklu modułów. Nie wyciągać dodatkowego abstraction layer tylko dla tych dwóch funkcji.

Ledger powinien trzymać osobno:

- event + origin + niezaokrąglony base signal;
- carriers z niezaokrąglonym `renownSignal`;
- dedupe/applied settlement IDs.

Nie używać carrier listy jako jedynego dedupe: semantycznie „otrzymała consequence” i „może dalej nieść renown” to dwa różne fakty.

Reputation dimensions zawsze liczyć od `event.origin`; carrier wpływa tylko na renown. Wybrać carrier dający najwyższy **niezaokrąglony** sygnał, tie-break po `settlementId`; `SocialConsequence` zaokrąglać dopiero na końcu. Event z zerowym finalnym efektem nie powinien materializować carriera.

`prune()` wywoływać wyłącznie na `enqueue`/catch-up. Zachować z planu granicę expiry `nowDays > expiresAtDays` oraz deterministic cap ordering. Snapshot powinien serializować zwykłe tablice/obiekty; warto sortować dedupe IDs/carriers przy serializacji, aby save/test diffy nie zależały od kolejności `Set`/`Map`.

## Settlement lifecycle — ważna korekta planu

Aktualny `SettlementsManager` ma **dwie** ścieżki materializacji:

1. home: bezpośredni `createSettlement(homeDef, ...).then(...)` w `homeReadyPromise`;
2. pozostałe: `ensureLoaded(def)` → async build → `cur.settlement = settlement`.

Samo dodanie callbacku w `ensureLoaded()` ominie home settlement. `onSettlementAvailable` musi zostać wywołany po udanym przypisaniu gotowego `Settlement` w obu continuations. Nie odpalać go przy `entries.set(...)`, gdy istnieje dopiero `SettlementDef`/pending build.

Payload ma pochodzić z authoritative `SettlementDef` (`id/x/z`), bez przekazywania live `Settlement`, NPCs ani managerów.

`createApp.ts` ma już `dayNight`, `ReputationManager` i stabilny wrapper `refreshCharacterReputation` **przed** `createWorldBundle()`, więc ledger i callback można utworzyć przed budową świata. Nie potrzeba nowego globalnego setter API. Hook trzeba jednak przewlec przez `createWorldBundle()` / `WorldSystemsSeed` / `buildSettlementsManager()` / `createSettlementsManager()`, aby działał także po `rebuildWorldBundle()`.

### Relay podczas catch-up

`getLoaded()` zwraca tylko faktycznie zbudowane settlements i jest właściwym bounded candidate setem. Jest jednak pułapka kolejności:

```text
A jest już loaded, ale nie zna eventu
B streamuje się później i staje się nowym carrierem
```

Jeżeli callback sprawdzi tylko `B`, `A` nie zostanie ponownie oceniona aż do kolejnego przypadkowego triggera. Dlatego `catchUpSettlements()` powinien obsłużyć przekazany loaded batch do stabilnego wyniku dla tego batcha (bounded fixpoint / ponowne przejście po dodaniu carriera), albo composition helper po utworzeniu nowego carriera powinien ponowić catch-up aktualnego `getLoaded()`. Nie wracać przy tym do grid scanów; koszt ma zależeć wyłącznie od `pendingEvents × loadedSettlements`.

Sortowanie batcha po settlement ID przed propagacją daje stabilny wynik niezależny od `Map` insertion order. Dedupe nadal gwarantuje maksymalnie jedną consequence na `(eventId, settlementId)`.

## Persistence

Plan pozostawia bump wersji warunkowy, ale aktualny kod rozstrzyga to jednoznacznie: `src/persistence/saveData.ts` ma `CURRENT_SAVE_VERSION = 39` i wymaga bumpu przy zmianie persisted representation/semantics.

Implementacja musi więc:

- bumpnąć `39 → 40`;
- dodać `migrateSaveV39ToV40` i `SAVE_MIGRATIONS[39]`;
- wybrać jeden canonical empty snapshot (`nextEventId` + `events: []`) i stosować go spójnie w migracji/restore;
- dodać walidację całego nested snapshotu: finite numbers, event kind, coordinates, reputation dimension keys/values, carriers i dedupe IDs;
- zapisywać ledger w `app/saveState.ts` obok `reputation.exportState()`;
- odtworzyć go z `initialSave?.socialNews` w `createApp.ts`.

Load Save robi pełny page reload, więc boot restore wystarczy. In-session world/config rebuild nie może serializować/odtwarzać ledgeru przez `WorldBundle`; ma zachować app-owned instancję.

## Integration shape

Preferowany minimalny flow:

```text
onPlayerAnimalKill
→ resolveAnimalDeedSignal
→ socialNews.enqueue(signal, origin, dayNight.elapsedDays)
→ socialNews.catchUpSettlements(bundle.settlementsManager.getLoaded(), nowDays)
→ applySocialConsequence(...) dla batcha
→ jeden refreshCharacterReputation()

onSettlementAvailable
→ social-news catch-up dla loaded batch / nowo dostępnej osady
→ applySocialConsequence(...)
→ refresh tylko gdy powstała consequence
```

Nie zmieniać `gameLoop.ts`, jeśli obecny `onPlayerAnimalKill(kill, socialOutcomeClaimed)` pozostaje wystarczający. Usunąć z tej ścieżki import/use `settlementsWithinDistance` i `MAX_ANIMAL_DEED_INFLUENCE_DISTANCE` tylko tam, gdzie po refactorze przestają być potrzebne; attenuation constants nadal należą do resolvera/ledgeru.

## Tests, które mają największą wartość

- `animalDeeds.test.ts`: obecne baselines/significance/quest suppression po zmianie resolvera na signal;
- nowy `SocialNewsLedger.test.ts`: origin attenuation, relayed renown, best-carrier/tie-break, no reputation distance reset, idempotence, expiry boundary, cap, save/restore;
- przypadek `A loaded → B staje się carrierem później` — A dostaje event bez unload/reload i bez grid lookup;
- settlement lifecycle: home oraz zwykły stream-in wywołują hook dopiero po udanym buildzie; powtórny stream-in nie duplikuje consequence;
- `saveData.test.ts`: v39→v40, malformed nested `socialNews`, round-trip;
- regression: player kill nie wywołuje `settlementsWithinDistance`/`peekDef` i nie zwiększa settlement-plan cache wyłącznie z powodu reputation propagation.

Nie dodawać per-frame ticka, NPC gossip/courierów, event busa ani nowych UI/debug surfaces w tym planie.