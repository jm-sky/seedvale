# Plan: Profession staffing and settlement composition

**Created:** 2026-09-04
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** none
**Domain:** `settlements-npcs`
**Subdomains:** `household` `economy`
**Tags:** `professions` `generation` `population` `resources`
**Roadmap:** `npc-professions-households-and-age.md`

## Goal

Uporządkować generation-time skład profesji w osadach tak, aby role mieszkańców wynikały częściowo z:

- rozmiaru osady,
- faktycznej liczby mieszkańców zdolnych do pracy,
- lokalnego środowiska,
- dostępnych zasobów,
- podstawowych potrzeb funkcjonalnych osady,

zamiast być niemal całkowicie niezależnymi losowaniami per NPC.

Docelowy przepływ:

```text
settlement size
+ generated population capacity
+ terrain
+ food source
+ natural resources
+ reserved inhabitants
↓
profession staffing signals
↓
deterministic role composition
↓
families + NPC CharacterDef.role
```

Plan nie tworzy dynamicznego rynku pracy ani runtime profession demand.

Jest to generation-time composition model dla początkowej populacji osady.

Kluczowa granica ownership:

> Staffing decides initial profession composition at settlement creation, but does not own profession demand after creation.

Późniejsze runtime shortages, pressures, migration i profession lifecycle mogą korzystać z innych mechanizmów. Generation staffing nie staje się ich authoritative source.

## Current state

### Family generation already owns population composition

`src/settlement/families.ts` generuje:

- liczbę rodzin,
- relacje rodzinne,
- wiek,
- płeć,
- `CharacterDef`,
- `Role`.

`generateFamilies()` pozostaje authoritative generation seam dla składu rodzin i NPC.

Nie tworzyć równoległego:

```text
ProfessionGenerator
SettlementPopulationGenerator
WorkforceManager
```

jeżeli istniejący family-generation pipeline można rozszerzyć.

### Roles are currently mostly random

Procedural NPC dostaje `Role` przez `characterForSeed()`.

Obecny random pool obejmuje:

```text
woodcutter
farmer
guard
miner
fisher
hunter
blacksmith
```

W efekcie generation nie gwarantuje sensownej composition.

Możliwe są między innymi:

```text
large settlement
→ no Farmer

mountain settlement
→ several Fishers

small settlement
→ several Blacksmiths

settlement with no ore
→ several Miners
```

Losowość pozostaje wartościowa, ale powinna działać wewnątrz sensownych ograniczeń i preferencji świata.

### Trader is currently special

`trader` nie znajduje się w `RANDOM_ROLES`.

Home settlement posiada zarezerwowaną Kasię jako Trader.

Ten plan musi jawnie zdecydować, czy Trader pozostaje home-only legacy constraint, czy większe procedural settlements mogą otrzymać Traderów.

Nie należy przypadkiem włączyć `trader` do ogólnego random pool bez zmiany semantyki jego generation.

### Resource-driven profession already exists

`RESOURCE_ROLE` mapuje:

```text
iron / coal / gold / copper ore
→ Miner

fish
→ Fisher

fertile soil
→ Farmer
```

Znaczący `dominantResource` może obecnie utworzyć dodatkową rodzinę z wymuszoną rolą.

To jest dobry istniejący sygnał środowiskowy, ale obecny sposób wykorzystania może sztucznie zwiększać population ponad bazowy `familyCount`.

023 powinien sprawdzić, czy resource specialization może zostać włączona w wspólny staffing pass zamiast zawsze dopisywać dodatkową rodzinę.

Nie zakładać jednak z góry, że extra resource family można bezwarunkowo usunąć. Najpierw potwierdzić, czy nie pełni dodatkowej funkcji związanej z population/resource-settlement identity, której nie da się zachować inaczej.

### Settlement generation already exposes useful signals

Podczas generation dostępne są już:

```text
VillageSize
SettlementTerrain
dominantResource
foodSourceType
familyCount / generated families
VillagePlan
```

Nie ma potrzeby tworzenia drugiego environment classification.

### Runtime economy comes later

`Household` i `SettlementEconomy` są runtime state tworzonym po generation osady.

Dlatego generation-time staffing nie powinien zależeć bezpośrednio od:

```text
current Household.shortage
current SettlementEconomy shortage
runtime production history
live trade state
```

Takie sygnały należą do późniejszego lifecycle / dynamic staffing.

## Design principles

### 1. Staffing is composition, not a second profession system

`Role` pozostaje jedyną profession identity NPC.

Staffing decyduje wyłącznie:

```text
which Role should generated NPC receive?
```

Nie tworzyć:

```ts
ProfessionRequirement assignedProfession
ProfessionSlot currentJob
SettlementProfessionMember
```

jako drugiej warstwy identity.

Po generation rezultat nadal jest zwykłym:

```ts
CharacterDef.role
```

### 2. Use coverage and targets, not a rigid profession template

Nie tworzyć sztywnej tabeli:

```text
MD
= 2 Farmers
+ 1 Guard
+ 1 Woodcutter
+ 1 Fisher
```

Preferowane rozróżnienie:

```text
baseline coverage
→ podstawowa funkcja osady, którą staffing powinien silnie preferować

resource-driven target
→ lokalny zasób uzasadnia daną profesję

scale-driven target
→ rozmiar/populacja uzasadnia specjalistę

weighted remainder
→ pozostałe sloty zachowują deterministic variety
```

Unikać ogólnego `minimum`, jeżeli nie istnieje prawdziwy hard constraint.

Brak nawet istotnej profesji może być prawidłowym, choć mniej typowym stanem świata i w przyszłości prowadzić do problemów ekonomicznych.

Twarde wymuszenie pozostawić tylko tam, gdzie wynika z istniejącego kontraktu, np. reserved characters lub Resource Outpost.

### 3. Population capacity comes before profession composition

Nie zwiększać liczby rodzin automatycznie tylko dlatego, że staffing chce więcej profesji.

Preferowany przepływ:

```text
existing settlement size
↓
existing family generation
↓
actual adult workforce capacity
↓
profession composition within that capacity
```

Dopiero jeśli recon/automated distribution tests pokażą, że istniejące `familyCount` systematycznie uniemożliwia sensowną composition, przygotować osobny follow-up lub minimalną uzasadnioną korektę.

Nie zwiększać SM/MD populacji prewencyjnie.

Staffing nie może zmieniać liczby rodzin ani relacji rodzinnych w tej samej fazie, w której przydziela role.

Demography i profession composition pozostają osobnymi odpowiedzialnościami.

### 4. Use active adult workforce, not total NPC count

Dzieci nie powinny zaspokajać aktywnej profession coverage.

Dlatego staffing capacity nie może traktować:

```text
family.members.length
```

jako pełnej liczby dostępnych profession slots.

Przy composition należy co najmniej rozróżnić:

```text
adult / profession-capable member
vs
child
```

Jeżeli istniejący generator nadal przypisuje `Role` dzieciom jako future identity, zachować compatibility, ale nie liczyć child role jako aktywnej profession coverage.

023 nie wymaga API z planu 022 — korzysta z istniejącego `FamilyMember.age` i generation-time demographic data. Dlatego 022 nie jest techniczną zależnością tego planu.

### 5. Preserve reserved home inhabitants

Home settlement musi nadal zawierać:

```text
Anna  → Farmer
Piotr → Woodcutter
Kasia → Trader
Marek → Guard
```

Staffing pass powinien najpierw policzyć już istniejącą coverage z reserved characters, a dopiero potem obsadzać proceduralne role.

Nie nadpisywać reserved `CharacterDef.role`.

Nie zmieniać ich seedów, traits, names ani identities.

### 6. Preserve demographic seed stability

Zmiana staffing nie powinna niepotrzebnie przetasowywać pozostałych cech wygenerowanej populacji.

Preferowany model:

```text
generate families / members using existing demographic streams
↓
preserve names / gender / age / traits / personality / family structure
↓
deterministically resolve or adjust procedural Role composition
```

Staffing powinien w miarę możliwości działać jako deterministic role-allocation/post-processing step na istniejących generated characters.

Nie zmieniać seed streams odpowiedzialnych za:

- names,
- gender,
- age,
- traits,
- personality,
- family structure,

jeżeli nie jest to konieczne.

Jeżeli staffing potrzebuje losowości, użyć osobnego deterministic seed salt/stream, tak aby zmiana reguł profession composition nie reshufflowała demografii.

### 7. Environment should bias, not dictate everything

Reuse istniejących sygnałów.

Przykładowo:

```text
foodSourceType = field
→ strong Farmer preference

foodSourceType = fishing
→ strong Fisher preference

forest / foraging context
→ Woodcutter and possibly Hunter preference

significant ore resource
→ strong Miner preference

larger settlement
→ Guard / Blacksmith / Trader become more useful
```

Nie tworzyć nowego biome/resource classification wyłącznie dla professions.

### 8. Resource profession should join the common staffing model where possible

Obecny flow:

```text
normal families
+
significant dominantResource
↓
append extra resource family
```

powinien zostać oceniony w ramach 023.

Preferowany kierunek dla normalnych settlements:

```text
generate existing population
↓
identify adult workforce slots
↓
resolve profession coverage
↓
use an available procedural adult slot for resource specialization
```

zamiast automatycznie zwiększać population.

Usunięcie obecnego extra resource family jest celem tylko wtedy, gdy recon potwierdzi, że nie pełni ono dodatkowej funkcji population/resource-settlement identity, której nie da się zachować inaczej.

`OUTPOST` pozostaje specjalnym przypadkiem resource-driven settlement i powinien zachować istniejący forced-role model.

Nie psuć Resource Outposts.

### 9. Missing professions are allowed

Staffing nie powinien naprawiać każdego możliwego braku.

Przykłady dopuszczalne:

```text
small village without Blacksmith
small village without Trader
inland village without Fisher
village without Miner
village without Hunter
```

Brak lokalnej profesji jest wartościowym stanem świata.

Docelowo może prowadzić do:

```text
shortage
↓
trade / transport
↓
problem / pressure
↓
future profession selection
```

ale runtime consequences nie należą do 023.

### 10. Avoid nonsensical redundancy

Staffing powinien ograniczyć przypadkowe duplikaty szczególnie drogich/specjalistycznych profesji w małych populacjach.

Przykład:

```text
3 active adult NPCs
→ 2 Blacksmiths + 1 Miner
```

powinien być znacznie mniej prawdopodobny niż obecnie.

Nie oznacza to jednak globalnego:

```text
max 1 profession of each type
```

Większe settlements mogą mieć wielu Farmerów, Guards, Woodcutters itd.

Potrzebna jest size/population-aware redundancy policy, najlepiej wynikająca z tych samych staffing weights/targets zamiast osobnego systemu limitów.

### 11. Determinism must be preserved

Ten sam:

```text
world seed
+ settlement cell
+ settlement generation inputs
```

musi generować ten sam skład profesji.

Nie używać `Math.random()`.

Zmiany staffing rules mogą świadomie zmienić role proceduralnych NPC, ale nie powinny przy okazji zmieniać ich nazw, wieku, płci, traits, personality ani relacji rodzinnych.

### 12. Do not couple generation to runtime economy

023 nie powinien tworzyć:

```text
SettlementProfessionDemandSystem
JobMarket
EmploymentManager
ProfessionPressureManager
```

ani próbować odpalać `SettlementEconomy` podczas world generation.

Generation-time staffing korzysta wyłącznie ze stabilnych generation inputs.

## Staffing flow

Preferowany model:

```text
generated families
↓
identify active adult workforce slots
↓
preserve reserved / forced identities
↓
derive settlement staffing signals
↓
apply high-priority baseline coverage
↓
apply resource- and scale-driven targets
↓
fill remaining slots with weighted deterministic variety
↓
CharacterDef.role
```

Model może korzystać z małego pure contextu, np. koncepcyjnie:

```text
SettlementStaffingContext

size
terrain
foodSourceType
dominantResource
adultCapacity
existingRoleCoverage
↓
staffing signals / weighted targets
```

Nie przywiązywać implementacji do konkretnego publicznego typu, jeśli prostsze pure functions wystarczą.

Najważniejsze jest zachowanie jednego generation pass i jednego authoritative `CharacterDef.role`.

## Initial profession expectations

Dokładne weights/targets należy ustalić po baseline distribution tests, ale kierunek powinien być następujący.

### Farmer

Food production jest podstawowym local function.

Farmer powinien mieć najwyższą bazową coverage spośród production roles.

Nie każda pojedyncza `OUTPOST` wymaga Farmera.

Brak Farmera nie musi być technicznie niemożliwy, ale powinien być wyraźnie mniej typowy w zwykłej osadzie niż obecnie.

### Woodcutter

Preferowany tam, gdzie osada ma łatwy dostęp do forest/timber.

Nie musi występować w każdej małej osadzie.

### Fisher

Silnie powiązany z:

```text
foodSourceType = fishing
```

lub znaczącym `fish` resource.

Nie powinien być równie częstym random role w settlements bez sensownego dostępu do wody.

### Miner

Silnie powiązany z ore resources.

Generic Miner może pozostać możliwy poza `dominantResource`, ponieważ runtime mining może znajdować pobliskie deposits, ale environment/resource signal powinien mocno wpływać na jego prawdopodobieństwo.

### Hunter

Preferowany w forest / foraging-oriented settlements.

Nie jest basic mandatory role.

### Guard

Powinien zależeć przede wszystkim od skali/populacji.

Mała osada może nie mieć dedicated Guard.

Większa osada powinna mieć coraz silniejszy scale-driven target.

### Blacksmith

Specialist role uzasadniony większą population i local production demand.

Nie powinien być równie częsty w najmniejszej osadzie jak Farmer.

Brak Blacksmitha musi pozostać prawidłowym stanem świata.

### Trader

023 musi jawnie rozwiązać legacy constraint:

```text
RANDOM_ROLES excludes trader
```

Rekomendowany kierunek:

- zachować Kasię jako reserved home Trader,
- pozwolić dużym procedural settlements otrzymać Trader role przez staffing model,
- nie dodawać Trader do zwykłego uniform random pool,
- traktować Trader jako scale-gated specialist.

Trader powinien pojawiać się przez staffing rules, nie przypadkowy per-NPC roll.

## Scope

### In scope

- profession coverage calculation during settlement generation,
- generation-time staffing context/signals,
- size/population-aware role composition,
- environment/resource profession preferences,
- reuse `foodSourceType`,
- reuse `RESOURCE_ROLE`,
- active adult workforce capacity,
- reserved home role preservation,
- demographic seed stability,
- deterministic specialist allocation,
- reduction of nonsensical profession redundancy,
- evaluation/integration of significant-resource specialization with common staffing,
- procedural Trader staffing for sufficiently large settlements if supported by chosen rules,
- focused distribution/regression tests.

### Out of scope

- runtime profession changes,
- child reaching adulthood,
- profession inheritance,
- apprenticeship,
- profession XP,
- dynamic hiring/firing,
- profession vacancies,
- job contracts for normal settlement employment,
- live economy shortage-driven profession switching,
- runtime profession demand ownership,
- inter-settlement migration,
- settlement growth,
- changing profession because another NPC died,
- changing family count as part of role allocation,
- changing family relationships as part of role allocation,
- building construction based on profession coverage,
- removing unused profession buildings,
- full economic demand simulation,
- new professions,
- Herbalist/Shepherd/Textile Worker,
- profession-specific production changes.

Explicit non-goal:

> Generation staffing initializes `CharacterDef.role`; it does not become a persistent workforce manager or authoritative runtime profession-demand system.

## Implementation phases

### Phase 1 — Generation distribution baseline

Przed zmianą behaviour dodać lub rozszerzyć deterministic generation tests mierzące obecny family/population composition.

Sprawdzić representative seeds dla:

```text
SM
MD
LG
XL
OUTPOST
```

oraz różnych:

```text
terrain
foodSourceType
dominantResource
```

Baseline powinien potwierdzić:

- real adult workforce counts,
- role duplication,
- missing basic coverage,
- resource-family population inflation,
- reserved-home constraints.

Nie zmieniać `VILLAGE_SIZE_CONFIG.familyCount` w tej fazie.

### Phase 2 — Pure staffing signals

Dodać najmniejszy pure resolver:

```text
generation context
↓
baseline / resource / scale staffing signals
```

Powinien korzystać tylko z już istniejących generation inputs.

Nie tworzyć runtime managera.

### Phase 3 — Role allocation within generated population

Zastosować staffing signals do procedural adult members.

Preferowany flow:

```text
reserved / forced roles
↓
count existing active coverage
↓
apply high-priority baseline coverage
↓
apply resource- and scale-driven targets
↓
fill remaining procedural slots deterministically
```

Pozostałe role nadal powinny zachować seeded variety.

Staffing nie może sprawić, że wszystkie osady danego typu będą identyczne.

W miarę możliwości zmieniać tylko procedural `Role`, zachowując wszystkie pozostałe generated character/family properties.

### Phase 4 — Integrate resource specialization

Dla normalnych settlements preferować zaspokojenie significant-resource role wewnątrz istniejącej population capacity.

Przed usunięciem obecnego extra resource family potwierdzić jego wszystkie obowiązki i testy.

Jeżeli nie pełni dodatkowej niezbędnej funkcji, zastąpić jego role-allocation częścią wspólnego staffing flow.

Jeżeli pełni dodatkową funkcję, zachować ją lub rozdzielić tę funkcję od role staffing zamiast usuwać mechanicznie.

Zachować specjalne zachowanie `OUTPOST`.

Sprawdzić world-seed implications zmian generation composition.

### Phase 5 — Trader and specialist gating

Rozwiązać jawnie:

```text
Trader
Guard
Blacksmith
```

jako scale/population-aware specialist roles.

Nie wrzucać ich do jednego uniform random pool razem z basic/resource professions.

### Phase 6 — Distribution tests and diagnostics

Dodać testy potwierdzające, że rules poprawiają composition bez zamiany generatora w sztywny template.

## Tests

### Determinism and seed stability

- same seed/context produces identical family roles,
- staffing does not use nondeterministic randomness,
- staffing changes do not reshuffle names,
- staffing changes do not reshuffle gender,
- staffing changes do not reshuffle age,
- staffing changes do not reshuffle traits/personality,
- staffing changes do not reshape family relations,
- dedicated staffing seed does not perturb demographic seed streams.

### Reserved home

- Anna remains Farmer,
- Piotr remains Woodcutter,
- Kasia remains Trader,
- Marek remains Guard,
- staffing counts reserved adult coverage before assigning procedural roles.

### Population

- role allocation does not change family count,
- role allocation does not change family relationships,
- child members do not satisfy active profession coverage,
- no family-count increase is introduced merely to satisfy a staffing target,
- OUTPOST retains its intended population/forced-role semantics.

### Resource specialization

- rich fish strongly influences Fisher coverage when adult capacity exists,
- rich ore strongly influences Miner coverage,
- fertile soil strongly influences Farmer coverage,
- normal settlement resource specialization prefers existing adult capacity where compatible with existing generator responsibilities,
- OUTPOST keeps its forced resource role.

### Size and specialists

- smallest settlements are not required to contain every specialist,
- Blacksmith frequency/target grows with population rather than uniform random chance,
- Guard coverage becomes more likely/stronger with settlement scale,
- Trader remains reserved in home and may appear in sufficiently large procedural settlements only through staffing rules,
- larger settlements may contain redundant basic professions when justified.

### Variety

Across a representative deterministic seed sample:

- settlements of the same size do not all receive identical role arrays,
- missing optional professions remain possible,
- nonsensical specialist duplication in tiny settlements is strongly reduced,
- environment has observable influence on composition,
- weighted remainder preserves meaningful variation.

## Performance

Staffing runs only during deterministic settlement generation.

Nie dodawać:

- runtime update loop,
- per-frame profession checks,
- world-wide profession registry,
- settlement scans after generation,
- dynamic job-market polling.

Complexity powinna być ograniczona do liczby członków jednej generowanej osady.

Przy obecnych rozmiarach settlement population jest to mały bounded pass.

## Diagnostics

Jeżeli istniejący Village Inspector łatwo daje się rozszerzyć, warto pokazać tylko development/debug information:

```text
population
active adult workforce
role coverage
dominantResource
foodSourceType
```

Nie budować osobnego staffing UI.

Diagnostics nie są wymagane, jeśli automated distribution tests dają wystarczającą obserwowalność.

## Verification

### Automated

Uruchomić:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

oraz focused generation tests.

### Browser/manual

Manual verification przez gracza:

1. odwiedzić kilka SM settlements i potwierdzić, że nie mają identycznego składu,
2. znaleźć osadę przy fish resource/water i sprawdzić sensowną Fisher coverage,
3. znaleźć osadę z ore resource i sprawdzić Miner coverage,
4. znaleźć większą osadę i sprawdzić obecność scale-appropriate specialists,
5. znaleźć małą osadę bez Blacksmitha/Tradera i potwierdzić, że jest poprawna,
6. sprawdzić brak absurdalnej liczby identycznych specialist roles w małej populacji,
7. sprawdzić home settlement i reserved NPC identities,
8. sprawdzić Resource Outpost i zachowanie forced resource role,
9. potwierdzić, że profession behaviour nadal korzysta z istniejących `Role`/schedule/PlannedAction,
10. potwierdzić, że nazwy, wiek, traits i struktura rodzin nie zostały niepotrzebnie przetasowane przez staffing,
11. potwierdzić, że świat i NPC działają autonomicznie bez gracza.

## Success criteria

Po implementacji:

```text
world conditions
+ settlement scale
+ adult workforce capacity
↓
profession composition
```

powinno dawać osady, które są różne, ale ekonomicznie i środowiskowo wiarygodniejsze niż obecny uniform random roll.

Przykład:

```text
small forest settlement
→ strong Farmer/Woodcutter tendency
→ optional Hunter / Guard
→ no requirement for Trader or Blacksmith
```

```text
larger ore settlement
→ food-producing workforce tendency
→ Miner target
→ stronger Guard target
→ possible Blacksmith
→ possible Trader
→ remaining roles retain deterministic variety
```

Jednocześnie:

```text
missing optional profession
≠ generation bug
```

Braki mają pozostać możliwym stanem świata i podstawą przyszłych:

```text
shortages
trade
migration
profession selection
settlement pressures
```

Najważniejsze invariants:

```text
staffing changes Role composition
≠ changes family structure
≠ changes population to satisfy profession targets
≠ changes unrelated demographic identity
≠ owns runtime profession demand
```

## Follow-ups

### Profession lifecycle and adulthood selection

Następny plan powinien wykorzystać staffing/coverage jako jeden z sygnałów przy wejściu młodego NPC w dorosłość:

```text
parents / household experience
+ traits
+ settlement profession coverage
+ resources
↓
adult profession selection
```

Nie implementować tego w 023.

### Dynamic profession demand

W przyszłości runtime economy może tworzyć realną potrzebę:

```text
persistent shortage
+ missing local production/service
↓
profession pressure
↓
migration / retraining / adulthood selection
```

To jest późniejszy system.

023 tworzy tylko deterministic initial composition.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
