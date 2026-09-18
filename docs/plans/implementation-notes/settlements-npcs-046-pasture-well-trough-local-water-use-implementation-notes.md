# Implementation notes: settlements-npcs-046 pasture well + trough local water use

## Najważniejsze ustalenia z reconu

Plan jest zgodny z kierunkiem istniejącej architektury w jednym kluczowym punkcie: nie należy dodawać osobnego storage dla generated pasture trough. `Household.water` pozostaje authoritative reserve, a player-built trough nadal ma własne `PlayerTroughRecord.waterLitres`.

Są jednak **dwie istotne rozbieżności między planem a aktualnym kodem**, które implementator musi uwzględnić zamiast zakładać, że obecny runtime już spełnia opisany kontrakt:

1. aktualny planner **celowo trzyma well i trough znacznie dalej niż 2 m**;
2. pasture trough **nie ma dziś jednego owning Household** — ten sam fizyczny anchor jest używany przez livestock z wielu gospodarstw, a każde zwierzę podpina go pod własne `Household.water`.

Drugi punkt jest prawdziwym ownership problemem dla player interaction i nie powinien zostać zamaskowany nearest-house heurystyką.

## Planner: obecny kontrakt trzeba świadomie zmienić

Plik: `src/settlement/villagePasture.ts`.

`layoutOnCandidate()` wylicza dziś anchory niezależnie:

- well: radius offset `radius * 0.28`, kąt `inward - 0.7`;
- trough: radius offset `radius * 0.42`, kąt `inward - 2.05`.

Następnie istnieje explicit rejection:

```ts
Math.hypot(wellPos.x - troughPos.x, wellPos.z - troughPos.z)
  < WELL_RADIUS + TROUGH_RADIUS + 0.6
```

Przy obecnych stałych:

```text
WELL_RADIUS = 2.4
TROUGH_RADIUS = 1.2
extra clearance = 0.6
minimum accepted center distance = 4.2 m
```

To jest bezpośrednio sprzeczne z docelowym `<= 2 m`.

`src/settlement/villagePasture.test.ts` dodatkowo utrwala stary kontrakt testem oczekującym dystansu `> 3`.

### Decyzja implementacyjna

Nie próbować "dociągać" trough do well po wygenerowaniu planu.

Zmiana musi pozostać w `layoutOnCandidate()` i traktować well+trough jako jedną parę. Ich wzajemny clearance nie może dalej używać starego `WELL_RADIUS + TROUGH_RADIUS + 0.6` jako hard rejection, bo wtedy kontrakt planu jest matematycznie niemożliwy.

Pozostałe checks nadal są obowiązujące:

- `wetOrRiver(...)`;
- `overlapsPlots(...)`;
- `pointHitsCorridor(...)`;
- `pathIsDry(...)`;
- fence validation przez `segmentClear()`;
- deterministic candidate ordering.

Preferowany kształt: wyznaczyć trough względem już policzonego well anchoru, z jednym canonical offsetem mieszczącym się w `PASTURE_WELL_TROUGH_BUCKET_REACH`, zamiast utrzymywać dwa niezależne radialne anchory.

Shared constant najlepiej trzymać przy ownerze mechaniki pasture, tj. w małym module settlementowym albo bezpośrednio w `villagePasture.ts`, jeśli runtime może go importować bez niepożądanego dependency cycle. Nie wkładać go do `villagePlan.ts` tylko dlatego, że tam żyją typy.

## Runtime presentation już zachowuje planowane anchory

Plik: `src/settlement/props.ts`.

`buildSettlementProps()` materializuje:

- pasture well jako wpis w `landmarks.wells`, z `pastureWellQueueId(settlementId)`;
- pasture trough jako `landmarks.pasture.trough`;
- `landmarks.pasture.position/radius`.

Nie ma runtime correction pozycji i nie trzeba jej dodawać.

Dla nowej interakcji potrzebny jest co najwyżej read-only runtime binding. Nie dodawać mutable water state do `SettlementLandmarks`.

## Krytyczna rozbieżność: pasture trough nie ma jednego Household ownera

Pliki:

- `src/settlement/livestock.ts`;
- `src/fauna/AnimalAgent.ts`;
- `src/fauna/animalForaging.ts`;
- `src/settlement/createSettlement.ts`.

Obecny flow jest taki:

```text
createSettlement()
→ przekazuje jedno landmarks.pasture.trough do livestock setup
→ livestock.ts tworzy każde zwierzę z jego własnym Household
   + z tym samym pastureTrough anchor
→ AnimalAgent buduje householdWaterAnchors = [pastureTrough]
→ findHouseholdTroughTarget()
   sprawdza / mutuje ctx.household.water
```

Komentarz w `livestock.ts` jest jednoznaczny: pasture trough jest water targetem dla **every household animal**. Tylko pasture roaming jest ograniczony do shepherd household.

W efekcie jeden fizyczny trough reprezentuje dziś wiele logicznych rezerw zależnie od tego, które zwierzę z niego korzysta.

### Konsekwencja dla tego planu

Opisany w planie kontrakt:

```text
pasture trough
→ owning Household
→ Household.water
```

**nie istnieje jeszcze w kodzie**.

Nie wolno rozwiązać tego przez:

- nearest household;
- pierwszy household w tablicy;
- family index 0;
- przypadkowy livestock owner;
- sam shepherdHouseIndex bez zmiany kontraktu fauna;
- osobny `pastureTrough.waterLitres`.

### Najmniejsza architektonicznie poprawna ścieżka

Przed dodaniem player fill action należy ustanowić **jawny canonical water binding dla pasture trough**.

Preferowany wariant, spójny z planem i bez nowego storage:

1. pasture trough dostaje runtime binding do jednego istniejącego `Household`;
2. ten sam binding jest używany zarówno przez player fill, jak i livestock pijące przy pasture trough;
3. yard trough nadal używa własnego household reserve;
4. nie powstaje drugi water owner ani persistence field.

Jeżeli jako canonical owner zostanie wybrany shepherd household, nie wystarczy zmienić tylko player interaction — obecny fauna flow nadal pozwoli zwierzęciu z innego household konsumować jego własną rezerwę przy tym samym pasture trough. Trzeba więc zmienić wyłącznie **binding source→reserve**, nie decision priority.

To może wymagać rozdzielenia obecnego `householdWaterAnchors: {x,z}[]` na mały typed source contract zawierający anchor + reserve/household authority. Nie rozszerzać tego na player-built trough; ten ma osobny `AnimalWaterSourceProvider`.

Jeżeli zespół nie chce teraz zmieniać tego ownership contractu, player fill część planu jest zablokowana — dodanie samego promptu dawałoby niespójny stan świata.

## WaterReserve owner/API

Plik: `src/settlement/household.ts`.

`WaterReserve` ma dziś:

- `current`;
- `capacity`;
- `has()`;
- `shortage()`;
- `shouldFetch()`;
- `add()`;
- `remove()`.

`add()` już clampuje do capacity, więc technicznie `add(capacity)` napełni reserve.

Mimo to dla tej mechaniki warto dodać semantyczny narrow helper:

```ts
fillToCapacity(): void
```

w samym `WaterReserve`, zamiast kopiować `capacity - current` lub `add(capacity)` w action code. To utrzymuje mutation przy ownerze stanu.

Nie reuse'ować `WATER_FETCH_AMOUNT`; ta stała opisuje logistyczny fetch NPC.

## Interactable: nie reuse'ować player-built trough kind

Pliki:

- `src/interaction/Interactable.ts`;
- `src/app/interactables.ts`.

Obecny `playerTrough` variant zawiera stable `id`, `complete`, `canFill` i jest powiązany z `PlayerTroughs`.

Generated pasture trough nie ma takiego recordu ani id w world collection, więc nie należy udawać `playerTrough`.

Dodać osobny, wąski variant, np. semantycznie:

```ts
{
  kind: 'pastureTrough'
  settlementId: string
  position: { x: number, z: number }
  promptLabel: string
}
```

Nie wkładać mutable `Household` bezpośrednio do per-frame `Interactable`. Interakcja powinna re-resolve runtime binding na start/completion.

`buildInteractables()` już iteruje po każdym loaded settlement i ma dostęp do `settlement.landmarks`, więc jest właściwym miejscem do wystawienia kandydata tylko dla `landmarks.pasture?.trough`.

Nie emitować nowego kind dla:

- household-yard trough;
- vendor paddock trough;
- player-built trough.

## Settlement runtime seam

`Settlement` w `src/settlement/createSettlement.ts` już wystawia:

- `households`;
- `landmarks`;
- settlement id;
- live livestock.

To jest lepszy seam niż rozszerzanie `props.ts` o ownership.

Po rozstrzygnięciu canonical pasture-water ownera, `Settlement` powinien wystawić mały read-only resolver/metodę, np. semantycznie:

```text
resolvePastureWaterUse()
→ {
    troughPosition,
    wellPosition,
    household
  } | null
```

albo równoważny minimalny contract.

Resolver powinien:

- bazować na tym samym planned pasture;
- zwracać dokładnie paired pasture well, nie nearest well;
- sprawdzać dystans against shared reach constant;
- nie persistować niczego;
- zwracać live `Household`, żeby action completion mogło ponownie sprawdzić current capacity.

Nie przenosić state ownership do app layer.

## Paired well resolution

Pasture well jest już materializowany w `landmarks.wells` i ma osobny `pastureWellQueueId(settlementId)`.

Nie wyszukiwać go przez nearest-distance.

Najczyściej zachować przy runtime pasture context także paired well position albo wystawić resolver bazujący bezpośrednio na `VillagePlan.pasture.well` / materialized pasture-well identity.

Jeśli obecny `SettlementLandmarks.pasture` nie niesie well position, rozszerzenie tego read-only presentation/runtime contextu o `well` jest bezpieczniejsze niż odtwarzanie relacji przez skan `landmarks.wells`.

## Action lifecycle

`src/app/busyAction.ts` już ma dokładnie potrzebną semantykę:

- `start(duration, label, onComplete)`;
- `cancel()` nie wywołuje `onComplete`;
- mutation może zostać odroczona do completion.

Dodać osobny mały action module pod `src/app/actions/`, zamiast dokładać generated-pasture semantics do `placementActions.ts`.

Flow:

```text
[E]
→ resolve + validate pasture binding
→ reject if reserve full / pair invalid
→ busy.start(short duration)
→ onComplete:
     resolve settlement again
     resolve pasture binding again
     re-check paired well/trough reach
     re-check reserve capacity
     household.water.fillToCapacity()
```

Nie mutować reserve na action start.

Cancellation, settlement stream-out albo brak bindingu na completion = zero mutation.

Nie tworzyć itemu bucket, waterskin ani transient inventory transfer.

## Existing generic well interaction pozostaje osobna

`src/app/interactables.ts` emituje wszystkie `settlement.landmarks.wells` jako generic `kind: 'well'`.

To obejmuje pasture well, więc gracz nadal może używać samej studni do zwykłego picia/fill waterskin przez istniejący `WaterSource`.

Nowa pasture-trough action jest dodatkowym affordance przy trough; nie należy zmieniać generic well branch ani `resolveInteraction()`.

## Tests: konieczne regresje

### Planner

Plik: `src/settlement/villagePasture.test.ts`.

Zastąpić stary assertion `distance > 3` nowym canonical contractem.

Testować:

- standardowy pasture: `distance <= PASTURE_WELL_TROUGH_BUCKET_REACH`;
- boundary `=== 2` jest eligible;
- deterministic same input → same anchors;
- well/trough nadal nie wpadają w water/river/plots/corridors;
- fence validation nadal działa.

Nie testować starego mutual-footprint separation, jeśli został celowo usunięty dla paired infrastructure.

### Water reserve

`src/settlement/household.test.ts` lub istniejący test ownera:

- `fillToCapacity()` ustawia current dokładnie na capacity;
- repeated fill jest idempotent;
- remove/add semantics bez regresji.

### Binding ownership

To jest najważniejszy nowy test.

Dla settlementu z co najmniej dwoma households i jednym pasture trough wykazać, że runtime ma **jedną canonical reserve authority** dla pasture trough i że player fill oraz livestock pasture drinking wskazują ten sam owner.

Bez tego testu łatwo pozostawić obecną sytuację "ten sam trough, różny reserve zależnie od zwierzęcia".

### Interactable

- tylko pasture trough emituje `pastureTrough`;
- yard trough nie;
- paddock trough nie;
- player-built trough nadal emituje `playerTrough`;
- full reserve daje odpowiedni disabled/no-fill state zgodnie z przyjętym UI contractem;
- inventory bez bucket/waterskin nie wpływa na eligibility.

### Action

- start nie mutuje;
- completion filluje do capacity;
- cancel nie mutuje;
- stream-out / missing settlement on completion nie mutuje;
- pair distance > reach nie mutuje;
- full reserve nie mutuje;
- brak inventory water/container nie blokuje.

## Persistence

Nie dodawać nowego save field.

Aktualny kod już persistuje household snapshots, w tym household water, przez istniejący household persistence path. Pasture plan jest deterministic worldgen data.

Nie persistować:

- pasture well↔trough pair;
- rope bucket;
- interaction progress;
- cooldown;
- trough litres;
- runtime household binding, jeśli da się go deterministycznie odtworzyć z settlement composition.

## Guardrails

- `Household.water` pozostaje jedynym settlement-household water ownerem.
- Nie dotykać `PlayerTroughRecord.waterLitres`.
- Nie zmieniać NPC `waterDuty` ani `WATER_FETCH_AMOUNT`.
- Nie dodawać nearest-house ani nearest-well heurystyk.
- Nie tworzyć `PastureWaterManager`.
- Nie dodawać save migration.
- Nie wiązać gameplay state z Three.js meshami.
- Nie zmieniać priorytetów fauna thirst; zmiana może dotyczyć wyłącznie source→reserve ownership, jeśli jest potrzebna do usunięcia obecnej wieloznaczności.
- Pozycje well/trough pozostają planowane deterministycznie, nie korygowane runtime.

## Suggested implementation order

1. Ustalić i zakodować canonical pasture-trough → Household water binding; dodać test z >1 household.
2. Dopiero potem zmienić planner well+trough do `<= 2 m` i poprawić testy starego `> 3 m` contractu.
3. Dodać `WaterReserve.fillToCapacity()`.
4. Wystawić minimalny runtime resolver paired pasture well/trough + household.
5. Dodać `pastureTrough` interactable.
6. Dodać mały busy action z completion revalidation.
7. Uruchomić targeted tests, typecheck i build. Browser verification wykonuje User.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
