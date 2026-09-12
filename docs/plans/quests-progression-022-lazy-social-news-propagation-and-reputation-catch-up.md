# Plan: Lazy Social News Propagation & Reputation Catch-Up

**Created:** 2026-09-12
**Status:** `verification needed` 🔍
**Priority:** high · **Effort:** L
**Depends on:** ~~quests-progression-019~~
**Domain:** `quests-progression`
**Type:** `optimization`
**Subdomains:** `relationships` `progression` `rewards`
**Tags:** `reputation` `renown` `social-news` `performance` `persistence`
**Roadmap:** `quests-and-reputation.md`
**Model:** Opus, Sonnet

## Cel

Usunąć synchroniczny hitch/freez przy player kill niebezpiecznego zwierzęcia i zastąpić obecny model:

```text
kill
→ przeskanuj do 3 km siatki osad
→ dla każdej komórki resolve/generate SettlementDef
→ od razu policz reputation wszystkich osad
```

modelem lazy social news:

```text
realne zdarzenie świata
→ zapisuje mały SocialNewsEvent
→ już aktywne osady mogą poznać zdarzenie od razu
→ osada, która poznała wydarzenie, staje się carrierem wieści
→ nowa/reaktywowana osada robi tani catch-up tylko względem pending events
→ ReputationManager dostaje wyłącznie już rozstrzygnięte SocialConsequence
→ stare wieści wygasają i są usuwane z bounded queue
```

Plan jest follow-upem do `quests-progression-019-dangerous-animal-deeds-local-reputation.md`. V1 obsługuje tylko istniejące dangerous-animal deeds, ale mechanizm ma mieć narrow, actor-neutral kształt pozwalający później użyć go dla innych prawdziwych społecznych zdarzeń bez tworzenia globalnego event busa.

## 1. Potwierdzony problem obecnej implementacji

`src/app/createApp.ts` w `onPlayerAnimalKill` wywołuje obecnie `settlementsWithinDistance(..., MAX_ANIMAL_DEED_INFLUENCE_DISTANCE)`.

Dla:

```text
MAX_ANIMAL_DEED_INFLUENCE_DISTANCE = 3000
SETTLEMENT_GRID_STEP = 280
```

`settlementsWithinDistance()` wyznacza:

```text
ceil(3000 / 280) + 1 = 12 cells radius
→ 25 × 25 = 625 candidate cells
```

i dla każdej wykonuje `SettlementsManager.peekDef(cell)`.

`peekDef()` nie jest read-only cache lookupiem w sensie kosztu. Prowadzi przez `settlementDefFor()`, a cache miss uruchamia `generateSettlementDef()` wraz z terrain/resource/site/layout work. Pierwszy wolf/bear kill w zimnym regionie może więc synchronicznie materializować setki settlement definitions na main thread.

To jest niezgodne z intencją performance z planu 019. Sam fakt, że lookup nie ładuje meshów, nie oznacza, że jest tani.

### Wymagany regression boundary

Po implementacji player animal kill nie może:

- wywoływać `settlementsWithinDistance()`;
- skanować settlement grid;
- wywoływać `SettlementsManager.peekDef()` dla nieznanych komórek;
- zwiększać `cachedSettlementDefCount()` tylko po to, aby znaleźć odbiorców reputacji;
- generować nowych `SettlementDef`.

## 2. Ownership

Zachować jasny podział:

```text
fauna / combat
→ potwierdza player kill + dangerSignificance

animalDeeds.ts
→ zamienia konkretny deed na bazowy social signal

SocialNewsLedger
→ owns pending social events + knowledge carriers
→ rozstrzyga lazy propagation do konkretnej osady
→ nie mutuje ReputationManager

composition root
→ aplikuje zwrócone SocialConsequence

ReputationManager
→ nadal jedyny owner reputation + renown
```

Nie przenosić pending news ani carrierów do `ReputationManager`. Jego obecny kontrakt — przyjęcie już rozstrzygniętego `SocialConsequence` — pozostaje prawidłowy.

## 3. Nie używać LocationKnowledge jako autorytetu społecznego

`src/world/locations/locationKnowledge.ts` przechowuje **wiedzę gracza** o lokacjach (`estimated → discovered → confirmed`).

Nie wolno używać:

```text
LocationKnowledge.has(settlementId)
```

jako warunku istnienia osady w społecznym świecie ani rozchodzenia się wieści. Inaczej reputacja zależałaby od tego, czy gracz odkrył marker/mapę, a nie od świata.

Player discovery może być dodatkowym, idempotentnym triggerem `catchUpSettlement()`, ale nie jest źródłem prawdy.

## 4. SocialNewsLedger

Dodać mały owner stanu, sugerowane miejsce:

```text
src/reputation/SocialNewsLedger.ts
```

Nie tworzyć `WorldEventBus`, `RumorManager`, NPC-by-NPC gossip simulation ani nowego globalnego managera świata.

Minimalny kontrakt powinien odpowiadać semantycznie:

```ts
type SocialNewsSignal = {
  reputation: Partial<Record<ReputationDimension, number>>
  renown: number
}

type SocialNewsCarrier = {
  settlementId: string
  x: number
  z: number
  renownSignal: number
}

type SocialNewsEvent = {
  id: string
  kind: 'dangerous_animal_deed'
  occurredAtDays: number
  expiresAtDays: number
  origin: { x: number; z: number }
  signal: SocialNewsSignal
  carriers: SocialNewsCarrier[]
}
```

Dokładna wewnętrzna reprezentacja może użyć `Map`/plain arrays, ale stan serializowany musi pozostać plain-data.

Ledger powinien posiadać co najmniej operacje semantyczne:

```ts
enqueue(...)
catchUpSettlement(...): SocialConsequence[]
catchUpSettlements(...): SocialConsequence[]
prune(nowDays)
serialize()
reset()
```

Każde publiczne/architektoniczne API dostać JSDoc z `@domain quests-progression` tam, gdzie poprawia preflight discovery.

## 5. Animal deed staje się źródłem signal, nie skanu osad

Zrefaktorować `src/reputation/animalDeeds.ts` tak, aby species baseline i `dangerSignificance` produkowały bazowy sygnał zdarzenia niezależnie od listy settlements.

Semantyczny kierunek:

```ts
resolveAnimalDeedSignal(
  kill: PlayerAnimalKillContext,
  options?: { socialOutcomeClaimed?: boolean },
): SocialNewsSignal | null
```

Zachować istniejące zasady:

- quest-owned social outcome → brak generic event;
- deer/livestock/harmless species → brak eventu;
- fox < wolf < alpha wolf < bear;
- `dangerSignificance` pozostaje fauna-owned;
- nie dodawać `alpha_wolf` do `AnimalKind`.

Istniejące `reputationFactor(distance)` i `renownFactor(distance)` pozostają canonical attenuation functions i są konsumowane przez propagation resolver zamiast przez grid scan.

## 6. Kill path — zero procedural settlement generation

W `src/app/createApp.ts` zmienić `onPlayerAnimalKill`:

```text
capture PlayerAnimalKillContext
→ resolveAnimalDeedSignal(...)
→ jeśli null: return
→ SocialNewsLedger.enqueue(event)
→ catch-up tylko dla bundle.settlementsManager.getLoaded()
→ applySocialConsequence dla wyników
→ jeden refresh Character Screen po batchu
```

`getLoaded()` jest dozwolone tutaj, ponieważ nie jest autorytetem całego świata — jest tylko tanią listą osad, które można rozstrzygnąć natychmiast. Pending event pozostaje w ledgerze dla pozostałych osad.

Usunąć animal-deed dependency na `settlementsWithinDistance()` z `createApp.ts`.

Nie zmieniać player-kill attribution w `gameLoop.ts`, jeżeli obecny kontrakt `onPlayerAnimalKill(kill, socialOutcomeClaimed)` wystarczy.

## 7. Pierwszy carrier i brak pobliskiej aktywnej osady

Nie wyszukiwać "najbliższej nieznanej osady" proceduralnie.

Origin samego eventu jest pierwszym knowledge source. Jeżeli żadna obecnie aktywna osada nie kwalifikuje się przy killu:

```text
SocialNewsEvent zostaje pending
carriers = []
```

Gdy później konkretna osada wejdzie do aktywnej symulacji, `catchUpSettlement()` sprawdza event origin bez generowania jakiejkolwiek innej osady. Jeżeli jest wystarczająco blisko i event nie wygasł, może dostać consequence i stać się pierwszym carrierem.

To zastępuje potrzebę "znajdź najbliższą wioskę" i zachowuje world independence od player map knowledge.

## 8. Lazy settlement catch-up

Dodać narrow callback przy lifecycle osady, zamiast skanu świata.

Preferowany seam:

```ts
createSettlementsManager(..., onSettlementAvailable?: (settlement: {
  id: string
  x: number
  z: number
}) => void)
```

Nazwa może zostać dopasowana do istniejącej konwencji, ale callback:

- nie zna reputacji ani SocialNewsLedger;
- przekazuje wyłącznie stable settlement identity + world position;
- może odpalać ponownie po stream-out/in — ledger ma być idempotentny;
- nie może czekać na żaden globalny scan.

Wywołać go z istniejącego `SettlementsManager.ensureLoaded()`/zaakceptowanego settlement lifecycle seam.

`createApp.ts` może użyć istniejącego late-bound closure pattern używanego już dla zależności, które są dostępne dopiero po konstrukcji `WorldBundle`.

Po podpięciu docelowego callbacku wykonać jednorazowy catch-up dla `getLoaded()`, aby home/eager neighbors zbudowane przed przypięciem closure nie zostały pominięte.

Player settlement discovery z `LocationProximityDiscovery` może opcjonalnie wywołać ten sam catch-up ponownie; dzięki idempotencji jest to tani no-op i nie stanowi source of truth.

## 9. Knowledge propagation

Oddzielić dwa pojęcia:

```text
czy osada usłyszała o wydarzeniu
!=
jak mocno wydarzenie zmienia lokalną reputację
```

### 9.1 Local reputation dimensions

`competence` / `courage` pozostają związane z lokalnością **oryginalnego czynu**.

Dla settlement consequence liczyć je zawsze względem:

```text
distance(event.origin, settlement.position)
```

przez istniejący `reputationFactor(distance)`.

Carrier nie może "zresetować" dystansu i sprawić, że odległy deed zacznie dawać pełne `competence/courage` w kolejnej osadzie. Poza istniejącym local reputation range dimensions pozostają `0` nawet jeśli sama wieść dotarła dalej.

### 9.2 Renown jako relayed knowledge

`renown` może przechodzić dalej przez settlement carriers.

Dla pierwszej osady:

```text
baseRenown × renownFactor(distance(origin, settlement))
```

Dla kolejnej osady wybierać najlepszy istniejący carrier w zasięgu i liczyć:

```text
carrier.renownSignal
× renownFactor(distance(carrier, settlement))
× SOCIAL_NEWS_RELAY_FACTOR
```

V1 starting tunable:

```ts
SOCIAL_NEWS_RELAY_FACTOR = 0.75
```

Dzięki temu sąsiednie osady nie przekazują nieskończenie pełnej renomy przy dystansach `<= 500`, gdzie `renownFactor()` wynosi `1`.

Nie sumować wielu dróg tego samego eventu. Jeden event może wpłynąć na jedną osadę najwyżej raz.

Jeżeli kilka carrierów kwalifikuje się, wybrać deterministycznie źródło dające największy niezaokrąglony `renownSignal`; tie-break po `settlementId`.

Carrier przechowuje niezaokrąglony `renownSignal`. Dopiero consequence do `ReputationManager` jest deterministycznie zaokrąglane. Jeżeli wynik zarówno reputation dimensions, jak i renown wynosi `0`, osada nie jest dodawana jako carrier — dalsze attenuation nie może już zwiększyć sygnału.

## 10. Brak dokładnej symulacji czasu podróży plotki w V1

Nie dodawać per-frame ticka, timer queue ani NPC courier simulation.

V1 traktuje rumor travel jako zagregowaną remote simulation:

```text
aktywny event + istniejący carrier + settlement catch-up
→ deterministyczne rozstrzygnięcie
```

Czas wpływa przez lifetime eventu, nie przez dokładne `arrivesAt` każdego hopu.

To jest świadome uproszczenie hybrid simulation. Jeżeli później gameplay będzie wymagał opóźnienia wieści, można rozszerzyć carrier o `heardAtDays` i wykorzystać istniejące world-time/off-screen travel helpers, ale nie jest to potrzebne do naprawy obecnego hitchu.

## 11. Lifetime i bounded queue

Animal-deed news nie może żyć bez końca.

V1:

```ts
ANIMAL_DEED_NEWS_TTL_DAYS = 7
MAX_PENDING_SOCIAL_NEWS_EVENTS = 256
```

`expiresAtDays` zapisać na evencie, zamiast inferować je później z aktualnych tunables.

`prune(nowDays)`:

1. usuwa eventy `nowDays > expiresAtDays`;
2. wykonuje się przy `enqueue()` i settlement catch-up, nie per-frame;
3. jeżeli po prune nadal przekroczono hard cap, usuwa najstarsze eventy deterministycznie (`occurredAtDays`, potem `id`).

V1 **nie agreguje kilku killów w jeden deed**. Distinct real events nadal mogą dać distinct consequences. Jeżeli telemetry/debug pokaże realny queue pressure, agregacja podobnych zdarzeń może być osobnym follow-upem zamiast zmiany semantyki od razu.

## 12. Idempotencja

Dla każdego `SocialNewsEvent` przechowywać settlement IDs, które już otrzymały jego efekt / zostały carrierem.

Wymagania:

- stream-out/in nie daje consequence ponownie;
- ponowne player discovery nie daje consequence ponownie;
- save/load nie daje consequence ponownie;
- `catchUpSettlement()` może być bezpiecznie wołane wiele razy;
- jeden kill tworzy dokładnie jeden event;
- quest-owned kill nie tworzy eventu.

Nie używać samego aktualnego `ReputationManager` value jako dedupe — kilka niezależnych eventów może legalnie zmieniać tę samą osadę.

## 13. Persistence

Pending news i carriers mają persistent consequences, więc ledger musi przetrwać save/load.

Dodać do `src/persistence/saveData.ts` opcjonalny, plain-data snapshot, np.:

```ts
type SaveSocialNews = {
  nextEventId: number
  events: SaveSocialNewsEvent[]
}

// SaveData
socialNews?: SaveSocialNews
```

Starszy save bez `socialNews` przywraca pusty ledger. To jest additive optional state, analogicznie do istniejącego optional `reputation`; nie wymaga zmiany znaczenia istniejących pól.

Zweryfikować aktualny `CURRENT_SAVE_VERSION`/validator policy podczas implementacji. Jeżeli obecne zasady wymagają migration/version bump dla nowego optional pola, użyć canonical migration pipeline; nie omijać go lokalnym special-case parserem.

`src/app/saveState.ts`:

```text
SocialNewsLedger.serialize()
→ SaveData.socialNews
```

`createApp.ts`:

```text
initialSave?.socialNews
→ SocialNewsLedger construction/restore
```

`New Game` wywołuje `ledger.reset()`.

Ledger powinien być app/session-owned, nie częścią `WorldBundle`, aby zwykły `WorldBundle` rebuild nie kasował pending news tego samego świata.

## 14. World rebuild i save identity

Zachować istniejący persistence lifecycle:

- ten sam świat + `WorldBundle` rebuild → ledger pozostaje;
- Load Save → ledger jest odtworzony ze slotu;
- New Game → ledger pusty;
- zmiana seed/world identity nie może przenosić rumorów ze starego świata.

Nie umieszczać queue w disposable settlement cache ani `LocationKnowledge`.

## 15. Performance contract

### Player kill

Koszt powinien być proporcjonalny do:

```text
1 event enqueue
+ obecnie loaded settlements
+ bounded prune
```

Nie do liczby grid cells w promieniu 3 km.

### Settlement activation

Koszt:

```text
active pending events
× istniejący carriers danego eventu
```

przy hard-bounded event queue i krótkim TTL.

Nie wykonywać:

- procedural settlement generation;
- globalnego settlement scan;
- `cellsWithinRadius(..., 12)` dla reputation;
- per-frame gossip update;
- Web Workera;
- nowego spatial index tylko dla tych eventów;
- NPC-by-NPC gossip polling.

Jeżeli później carrier count okaże się realnym bottleneckiem, optymalizować ledger na podstawie profilu zamiast od razu tworzyć dodatkowy globalny indeks.

## 16. Reuse istniejących mechanizmów

Plan ma wykorzystać, a nie dublować:

- `PlayerAnimalKillContext` + istniejący lethal player-kill seam;
- `QuestManager.hasSocialOutcomeClaim` / obecny social ownership flow;
- `ReputationManager` + `applySocialConsequence()`;
- `reputationFactor()` / `renownFactor()`;
- `SettlementsManager.getLoaded()` jako tani immediate-candidate set;
- settlement streaming lifecycle do lazy catch-up;
- `DayNightState.elapsedDays` jako simulation-time anchor;
- canonical save pipeline `SaveData` + `createSaveState()`.

`settlementsWithinDistance()` pozostaje dla innych obecnych konsumentów; ten plan usuwa tylko jego użycie z animal-deed reputation path.

## 17. Pliki i integration points

Najbardziej prawdopodobny zakres:

### Runtime

- `src/reputation/animalDeeds.ts`
  - species/significance → base `SocialNewsSignal`;
  - zachować canonical attenuation helpers.
- `src/reputation/SocialNewsLedger.ts` — nowy narrow owner pending news/carriers.
- `src/reputation/SocialNewsLedger.test.ts` — propagation, decay, TTL, idempotencja.
- `src/reputation/animalDeeds.test.ts` — species/significance/suppression po refactorze.
- `src/app/createApp.ts`
  - usunąć 3 km settlement scan z `onPlayerAnimalKill`;
  - ledger construction/restore/reset;
  - apply returned consequences;
  - late-bound settlement catch-up callback.
- `src/settlement/SettlementsManager.ts`
  - narrow settlement-available callback przy lifecycle;
  - bez importu reputation/social-news.
- `src/app/worldBundle.ts`
  - przepuścić callback do `createSettlementsManager`, jeśli wymaga tego obecna composition boundary.
- `src/app/saveState.ts`
  - serializacja ledger state.
- `src/persistence/saveData.ts`
  - optional save shape + validation/migration zgodna z bieżącą polityką.

### Dokumentacja po implementacji

- `docs/STATE.md` — reputation/social consequence flow;
- `docs/state/persistence.md` — pending social-news jako persisted authoritative state;
- ewentualnie właściwy state doc dla quests/social jeśli obecny podział tego wymaga.

Nie aktualizować `world-locations.md` tak, jakby `LocationKnowledge` przejęło social propagation — pozostaje player knowledge.

## 18. Testy

### Regression: freeze

- player wolf kill nie wykonuje `settlementsWithinDistance`/`peekDef` path;
- kill nie generuje settlement definitions;
- cold settlement cache pozostaje cold poza normalnymi streaming consumers;
- loaded settlement może dostać consequence bez żadnego grid lookup.

### Deed → event

- wolf/bear/fox tworzą event z poprawnym signal;
- deer/livestock nie tworzą eventu;
- alpha wolf używa `dangerSignificance` bez nowego kind;
- quest-owned social outcome nie tworzy generic eventu.

### Lazy catch-up

- brak pobliskiej loaded osady → event pozostaje pending z `carriers=[]`;
- później aktywowana pobliska osada dostaje consequence;
- ponowne catch-up tej samej osady jest no-op;
- wynik nie zależy od `LocationKnowledge`.

### Propagation

- pierwsza osada może zostać carrierem od origin;
- druga osada może dostać renown przez carrier bez globalnego scan;
- relay ma `0.75` decay nawet dla hopu `<=500`;
- kilka carrierów nie sumuje tego samego eventu;
- deterministic best-source selection;
- local reputation poza origin-local range pozostaje zero mimo relayed renown;
- po attenuation/rounding do zera relay się kończy.

### TTL / bounded state

- event działa przed `expiresAtDays` i nie działa po nim;
- prune usuwa expired events;
- cap 256 usuwa najstarsze deterministycznie;
- brak per-frame cleanup requirement.

### Persistence

- save/load zachowuje pending event;
- save/load zachowuje carriers/dedupe;
- consequence nie aplikuje się drugi raz po load;
- older save bez `socialNews` → empty ledger;
- New Game czyści ledger;
- same-world `WorldBundle` rebuild nie czyści ledger.

### Existing contracts

- `ReputationManager` clampy nadal obowiązują;
- Character Screen refresh następuje raz po batchu consequences;
- `settlementsWithinDistance()` nadal działa dla swoich innych konsumentów;
- player location discovery nie staje się warunkiem social propagation.

## 19. Manual verification

Browser verification wykonuje User, nie AI agent.

Sprawdzić ręcznie co najmniej:

1. Na cold world/cache zabić wilka i potwierdzić brak widocznego freeze.
2. Zabić wilka przy aktywnej osadzie → lokalne `competence/courage/renown` wzrastają.
3. Zabić wilka poza aktywnymi osadami → brak immediate reputacji; odwiedzić pobliską osadę w ciągu TTL → catch-up.
4. Odwiedzić kolejną pobliską osadę → możliwy słabszy relayed renown, bez sztucznego pełnego local reputation.
5. Save/load z pending eventem → późniejszy catch-up działa dokładnie raz.
6. Po > TTL nowo odwiedzona osada nie dostaje starego animal-deed news.

## 20. Non-goals

Ten plan nie dodaje:

- pełnego NPC gossip simulation;
- rozmów NPC przekazujących plotki;
- globalnej historii świata/event sourcing;
- generic world event bus;
- player-visible news log;
- map reveal przez rumor;
- rumor travel delays/couriers;
- diminishing returns/farming cooldown;
- agregowania kilku killów w jeden event;
- nowego settlement spatial index;
- workerów.

Mechanizm ma być małym, reusable social-consequence propagation seam, nie nowym monolitycznym systemem.

## 21. Kryteria ukończenia

Plan jest gotowy, gdy:

- dangerous-animal kill path nie generuje/scanuje nieznanych settlement defs;
- player kill nie powoduje cold-cache settlement-generation hitch;
- event może przeżyć brak aktywnej pobliskiej osady i zostać rozstrzygnięty lazy;
- settlements przekazują dalej słabnący renown bez resetowania local reputation distance;
- queue jest bounded, TTL-based i persisted;
- settlement catch-up jest idempotentny;
- `LocationKnowledge` pozostaje wyłącznie player knowledge;
- `ReputationManager` pozostaje jedynym ownerem finalnego standing;
- automated tests przechodzą;
- manual browser verification pozostaje do wykonania przez Usera.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
