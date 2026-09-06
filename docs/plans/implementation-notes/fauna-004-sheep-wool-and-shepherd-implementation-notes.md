# Implementation notes: fauna-004 — Sheep wool cycle and shepherd

Plan: `docs/plans/fauna-004-sheep-wool-and-shepherd.md`

## Review outcome — 2026-09-06

Plan pozostaje sensowny, ale jego pierwotna wersja była sprzed kilku ważnych zmian. Najważniejsze korekty implementacyjne:

1. **Nie budować shepherd-specific movement/herding.** `npc-006` dostarczył shared NPC/animal navigation, a `fauna-016` species-specific roaming + persistent trip target. Shepherd ma używać normalnego NPC navigation, a sheep zachowuje własne movement/roaming/flee ownership.
2. **Protection ma bazować na aktualnym threat state/perception.** `fauna-012` wprowadziła semantic threat/combat perception dla fauny. Nie rekonstruować zagrożenia tylko z dystansu i nie dodawać predator→shepherd callbacków. Potrzebny jest co najwyżej mały read-only bridge do NPC arbitration dla threat skierowanego na owned sheep.
3. **Routine shepherd work nie jest WorkContract.** Późniejsze `npc-015`/`npc-018` ustanowiły authoritative contract commitments dla jawnie zleconej pracy. Opieka nad własnym household livestock pozostaje zwykłą profession/schedule work. Nie tworzyć ukrytych kontraktów ani payment lifecycle.
4. **Wool najpierw trafia do realnego household inventory.** Po `settlements-npcs-014` istnieje fizyczny local goods circulation, ale tylko kwalifikujące się dobra uczestniczą w nim automatycznie. `wool` nie powinno dostać własnego `EconomicKind`/stocku. Minimalny authoritative flow to `carried → Household.items`; ewentualna dalsza circulation ma rozszerzyć wspólną klasyfikację goods.
5. **Shepherd assignment nadal wymaga livestock-aware seam.** Samo dodanie roli do random pool jest błędne.
6. **Shears nadal wymagają provisioning.** Capability bez rzeczywistego tool source w NPC loadout/work setup nie domyka autonomicznej pracy.

## Najważniejsze aktualne pliki / granice

### `src/fauna/AnimalAgent.ts`

To nadal główny runtime owner sheep behaviour. Po późniejszych fauna planach zawiera również deklaratywne species roaming/trip policy; test `src/fauna/animalRoamingTrips.test.ts` potwierdza m.in. `ANIMAL_DEFS.*.roaming`, `trips.water` i deterministyczne `tripDayBucket()`.

Implikacja dla fauna-004:

- nie resetować `home` ani active trip przy flock care,
- nie sterować sheep position z `NpcAgent`,
- nie omijać flee/combat arbitration,
- jeżeli flock-care potrzebuje wpływu na owcę, dostarczyć mały intent/stimulus do istniejącej fauna decision boundary zamiast drugiego FSM.

### `src/fauna/livestockProduction.ts`

Pozostaje wzorcem dla absolute-day production math. Wool potrzebuje **osobnego** anchor od istniejącego milk/egg `productionReadyAtDays`.

Reuse:

- absolute `elapsedDays`,
- readiness comparison,
- initial deterministic staggering convention.

Nie reuse jednego anchor dla milk i wool — oba procesy muszą działać równolegle.

### `src/settlement/livestock.ts`

Aktualny livestock creation/ownership jest źródłem `ownerHouseId` i household relation. Nie dodawać sheep-owner registry.

Shepherd candidate discovery powinno zaczynać się od household/settlement-owned livestock collection, nie globalnej fauna listy.

### Shared Navigation (`npc-006`)

Plan `npc-006-shared-npc-animal-pathfinding.md` został zaimplementowany i czeka na manual verification. Architektoniczny kontrakt:

- agent posiada decyzję/target,
- shared Navigation dostarcza path/waypoints,
- existing locomotion/collision wykonuje ruch,
- watchdog/repath nie zmienia targetu,
- path requests są request-based i bounded.

Shearing target jest moving target. Zachować identity wybranej sheep podczas podejścia; repath nie powinien automatycznie retargetować na inną sheep.

Nie dodawać shepherd `steer directly to sheep` fallback, który omija Navigation.

### Fauna threat/perception (`fauna-012`)

Aktualny model rozdziela:

```text
world/combat state or transient stimulus
→ perception/relevance
→ existing decision
→ flee/guard/combat/ignore
```

Combat system pozostaje właścicielem attacker/target state; perception konsumuje read-only information.

Dla shepherd protection potrzebny jest analogiczny kontrakt po stronie NPC:

```text
owned sheep + current/recent relevant threat
→ bounded shepherd relevance query
→ normal NPC arbitration/combat intent
```

Najpierw sprawdzić, czy obecny NPC threat hook może już przyjąć ten candidate. Jeżeli nie, rozszerzyć reusable threat candidate/query seam. Nie kopiować combat state do `NpcAgent` i nie tworzyć `ShepherdCombatAI`.

### Fauna habitats/roaming/trips (`fauna-016`)

`fauna-016` jest zaimplementowany technicznie i czeka na manual verification. Wprowadził deklaratywne species roaming ranges i persistent purposeful trips.

Pierwotny fauna-004 fragment `sheep too far → shepherd moves sheep back` jest zbyt silny. Aktualna interpretacja:

- shepherd może wykryć owned sheep poza sensownym local flock area,
- może podejść jako work action,
- nie może nadpisać aktywnego flee/trip,
- rzeczywiste skierowanie owcy z powrotem wymaga istniejącego fauna decision seam, nie bezpośredniej manipulacji movement state.

Nie tworzyć `Pasture` tylko dla tego przypadku.

### NPC work / Work Contracts

`NpcAgent` nadal posiada normalne profession work przez schedule/arbitration/`PlannedAction`.

Work Contracts (`src/world/workContract.ts`, `src/world/createWorkContracts.ts`) są authoritative dla jawnych contract commitments. Po shared-work zmianach contract może reprezentować tylko część pracy i posiada własny lifecycle/progress.

Fauna-004 nie powinien zapisywać shepherd routine jako `WorkContractRecord`. To byłoby zdublowanie zwykłego profession work i wymuszałoby niepotrzebne employer/payment semantics.

Jeżeli przyszły plan doda kontrakt `guard/shepherd`, powinien on wskazywać na te same reusable shepherd actions zamiast tworzyć drugi implementation path.

### Items / capabilities / loadout

`src/items/itemCatalog.ts` + `Inventory.hasCapability()` / `findWithCapability()` pozostają właściwym gate.

Dodać `shearing` capability i shears item. Następnie prześledzić aktualny NPC loadout/provisioning pipeline i zapewnić autonomicznemu shepherd realne narzędzie. Nie zakładać, że capability sama pojawi się w inventory.

`wool` ma być zwykłym stackowalnym itemem. Nie potrzebuje world model/entity ani durability.

### Household goods / local economy

Po `settlements-npcs-014` istnieje realny local goods flow z physical pickup/deposit i live claim/revalidation. Ważne ograniczenie: mechanizm celowo **nie traktuje każdego ItemKind jako circulating good**.

Fauna-004 powinien domknąć:

```text
shearing
→ carried wool
→ physical deposit
→ owner Household.items
```

Dopiero potem, jeżeli current goods classification ma właściwy generic production-resource seam, `wool` może zostać oznaczone jako circulating production good. W przeciwnym razie zostawić je w household inventory dla `settlements-npcs-006`, zamiast rozszerzać scope o nową settlement economy reprezentację.

Nie używać food-only acquisition/deposit path.

## Calendar — nadal największa globalna zmiana

Plan nadal wymaga migracji 7 → 12 dni/sezon. To ma szerszy blast radius niż sama wełna.

Przed implementacją wyszukać aktualne użycia:

- `DAYS_PER_SEASON`,
- `getSeason()`,
- `getSeasonProgress()`,
- hard-coded `7`, `28` związane z season/year semantics,
- fauna/weather/terrain tests zależne od długości sezonu.

Nie tworzyć `YEAR_DAYS` tylko dla sheep, jeżeli world calendar może go wyrazić z jednego canonical source.

## Shepherd assignment

W poprzednim recon `Role` i role-owned maps były exhaustive, a random role selection nie znał livestock composition. Ponownie potwierdzić aktualny staffing seam przed zmianą — w międzyczasie pojawiły się kolejne NPC/economy plany.

Invariant pozostaje:

```text
shepherd role
→ household with sheep / meaningful livestock responsibility
```

Nie dodawać shepherd bezwarunkowo do `RANDOM_ROLES`.

Jeżeli obecny settlement composition/staffing ma już etap widzący household resources/livestock, rozszerzyć właśnie jego. Nie tworzyć drugiego profession assignment systemu.

## Shearing transaction

Wymagany commit point:

1. Decision-time: owned + live + ready sheep, shearing capability, full carry capacity.
2. `PlannedAction` zachowuje target sheep identity.
3. Normal Navigation prowadzi NPC do interaction range.
4. Completion revalidation: live, ownership, readiness, capability, capacity.
5. Dopiero wtedy dodać dokładnie 4 `wool` i ustawić `woolReadyAtDays = nowDays + 24`.
6. Milk/egg production state pozostaje nietknięty.

Jeżeli capacity lub validation zawiedzie, nie przesuwać wool anchor.

## Off-screen / time skip

Absolute anchor rozwiązuje wool readiness bez replay:

```text
readyAtDays <= nowDays
```

Po długim time skip sheep ma jeden aktualny ready fleece. Nie naliczać automatycznie `floor(delta / 24) * 4`, bo produkcja wymaga rzeczywistej shearing action.

Nie dodawać wool-only persistence. Najpierw potwierdzić aktualny fauna persistence contract i zachować zgodność z istniejącym livestock runtime state.

## Performance constraints

Implementation preflight powinien pilnować szczególnie:

- brak globalnego sheep scan w `NpcAgent.update()`,
- brak threat scan co frame,
- brak path request co frame do moving sheep,
- brak flock-care override, który stale zmienia animal destination,
- deterministic stable target selection,
- decision/work cadence zamiast render cadence.

## Recommended implementation order

1. Recon aktualnego calendar usage i migracja 12-day seasons + tests.
2. `wool` + shears + `shearing` capability + real shepherd tool provisioning.
3. Independent wool anchor/helpers na sheep + staggering/time-skip tests.
4. Livestock-aware shepherd role assignment + exhaustive role/schedule updates.
5. Bounded owned-flock lookup.
6. Shearing `PlannedAction` przez shared Navigation + transactional completion.
7. Physical carried → `Household.items` deposit; tylko jeśli naturalne, podłączyć `wool` do generic local goods classification.
8. Minimalny owned-livestock threat bridge do normalnej NPC arbitration/combat.
9. Minimalne flock-care behaviour bez naruszania animal roaming/trip/flee ownership.
10. Regression tests i automated checks. Browser verification zostawić użytkownikowi.

## Important non-goals / traps

Nie wciągać przy okazji:

- wool quality/breeds/age/health/nutrition,
- visual fleece growth,
- `Pasture` entity,
- breeding,
- yarn/cloth processing,
- wool-specific `EconomicKind`/storage,
- fauna SaveData redesign,
- shepherd-specific pathfinder/herding FSM/combat AI,
- hidden Work Contracts dla routine profession work,
- wages/payroll,
- global sheep/threat scans.

Najważniejsza granica po późniejszych planach brzmi:

> **Shepherd wybiera i wykonuje pracę przez istniejące NPC work/navigation/combat seams; sheep pozostaje właścicielem swojego roaming/trip/flee behaviour; wool jest realnym itemem w istniejącym goods flow.**

> **Zrób git commit i push do main, rebase jeżeli trzeba**
