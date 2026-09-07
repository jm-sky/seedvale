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

Uporządkować generation-time skład profesji w osadach tak, aby `CharacterDef.role` wynikał z istniejących generation inputs:

```text
VillageSize
+ generated families
+ active adult workforce
+ SettlementTerrain
+ FoodSourceType
+ dominantResource
+ reserved/forced inhabitants
↓
deterministic staffing
↓
CharacterDef.role
```

Plan dotyczy wyłącznie początkowego składu profesji podczas generowania osady.

Nie tworzy runtime job market, dynamic profession demand, migration ani profession lifecycle.

> Staffing owns initial role composition only. Runtime demand remains a separate future concern.

## Recon findings

### Existing generation seam

`generateFamilies()` w `src/settlement/families.ts` jest obecnym authoritative seam dla:

- liczby rodzin,
- family relations,
- age,
- gender,
- `CharacterDef`,
- `Role`.

Nie tworzyć równoległego generatora populacji/profesji.

### Current roles

Aktualny `Role`:

```text
woodcutter
farmer
guard
trader
miner
fisher
hunter
blacksmith
```

Procedural `characterForSeed()` losuje obecnie równomiernie z:

```text
woodcutter
farmer
guard
miner
fisher
hunter
blacksmith
```

`trader` jest wykluczony z `RANDOM_ROLES`; reserved Kasia jest jedynym gwarantowanym Traderem.

### Current size/population model

`VILLAGE_SIZE_CONFIG.familyCount`:

| Size | Families |
|---|---:|
| OUTPOST | 1 |
| SM | 1–3 |
| MD | 3–5 |
| LG | 5–7 |
| XL | 7–9 |

Normal family shape:

```text
25% lone adult
75% couple
35% of couples also have a child
```

Dorosły ma `age >= 18`, child `age <= 17`.

Staffing capacity ma być liczona z rzeczywistej liczby dorosłych, nie z liczby NPC ani rodzin.

### Current environment/resource signals

Istniejące sygnały:

```text
SettlementTerrain =
  ocean | mountain | swamp | desert | forest

FoodSourceType =
  field | fishing | foraging | garden
```

`foodSourceTypeFor()` już koduje istniejącą interpretację świata:

```text
significant fish         → fishing
significant fertile_soil → field
forest                   → foraging
otherwise                → garden
```

`SIGNIFICANT_RICHNESS = 0.55`.

`RESOURCE_ROLE`:

```text
iron / coal / gold / copper_ore → miner
fish                            → fisher
fertile_soil                    → farmer
```

Normal settlement z significant mapped resource obecnie dostaje dodatkową rodzinę z jednym forced specialistem.

`OUTPOST` zachowuje osobny kontrakt: dokładnie jedna rodzina, jeden lone adult, forced resource role.

### Existing runtime/economy context

`SettlementEconomy` powstaje po generation i nie może być inputem staffing.

Nie używać jako generation inputs:

```text
live shortages
production history
runtime stock
trade state
Household shortages
```

### Existing workplace implications

Aktualne workplaces nie wymagają, aby każda profesja istniała:

- Farmer → garden
- Fisher → dock, fallback well
- Miner → stockpile
- Guard/Hunter → well anchor
- Trader → market
- Blacksmith → blacksmith workplace
- Woodcutter → settlement trees

Market i blacksmith workplace są dziś materializowane niezależnie od faktycznej coverage, więc 023 nie ma zmieniać building composition.

## Invariants

1. `Role` pozostaje jedyną profession identity.
2. Staffing nie zmienia liczby rodzin.
3. Staffing nie zmienia family relations.
4. Staffing nie zmienia name/gender/age/traits/personality.
5. Child role nie liczy się do active profession coverage.
6. Reserved home roles nigdy nie są nadpisywane.
7. `OUTPOST` zachowuje forced resource role.
8. Normal resource specialization korzysta w pierwszej kolejności z istniejącej adult capacity.
9. Brak opcjonalnej profesji jest prawidłowym stanem.
10. Same generation inputs muszą dawać ten sam role composition.
11. Staffing randomness musi używać osobnego deterministic stream/salt.
12. Staffing nie staje się runtime workforce managerem.

## Staffing model

### 1. Capacity

Najpierw wygenerować istniejącą demografię.

```text
adultSlots = members where age >= 18
childSlots = members where age < 18
```

Role dzieci pozostają kompatybilnym generated identity, ale staffing:

- nie używa child slotów do coverage,
- nie poprawia brakującej coverage przez zmianę child role,
- nie traktuje child specialist jako działającego specjalisty.

### 2. Locked coverage

Przed alokacją proceduralnych adult roles policzyć role, których staffing nie może zmienić:

- reserved home inhabitants,
- forced OUTPOST inhabitant,
- inne jawnie forced generation identities, jeśli takie pojawią się w aktualnym kodzie.

Home baseline już zawiera:

```text
Anna  → farmer
Piotr → woodcutter
Kasia → trader
Marek → guard
```

Nie dublować ich tylko dlatego, że generic rules chciałyby tę samą coverage.

### 3. Priority classes

Nie stosować jednej płaskiej tabeli procentów.

Każdy role candidate dostaje semantyczny priority level wynikający z aktualnych inputs:

```text
forced
strong
normal
weak
excluded
```

To są relacje, nie arbitralne procenty.

Weighted remainder może mapować te poziomy na proste stałe techniczne dopiero w implementacji, pod warunkiem że zachowuje poniższą kolejność preferencji.

### 4. Allocation order

```text
A. locked/forced roles
B. primary food-source coverage
C. significant RESOURCE_ROLE specialization
D. scale specialists
E. deterministic weighted remainder
```

Jeżeli ten sam role zaspokaja kilka sygnałów, jedno przypisanie może pokryć je jednocześnie.

Przykład:

```text
foodSourceType = field
+ dominantResource = significant fertile_soil
→ jeden Farmer zaspokaja oba sygnały
```

Nie tworzyć dwóch targetów tylko dlatego, że istnieją dwa źródła tego samego sygnału.

### 5. Baseline coverage

Normal settlement z co najmniej jednym proceduralnym adult slotem powinien silnie preferować jedną profesję odpowiadającą głównemu źródłu żywności:

| Food source | Primary role |
|---|---|
| `field` | Farmer |
| `fishing` | Fisher |
| `foraging` | Farmer lub Hunter, z Farmer jako ogólniej użytecznym food-production fallback |
| `garden` | Farmer |

To jest preference, nie hard minimum.

Wyjątki:

- `OUTPOST` — brak generic food baseline; forced resource role wygrywa.
- home — existing reserved roles już zapewniają Farmer coverage; nie przydzielać dodatkowego Farmera tylko z baseline.

### 6. Resource specialization

Significant mapped `dominantResource` (`richness >= 0.55`) daje `strong` preference dla `RESOURCE_ROLE`.

Normal settlements:

```text
resource role already covered by active adult
→ target satisfied

else free procedural adult exists
→ resource role should be selected before weighted remainder

else
→ do not add population
```

Obecna dodatkowa resource family nie ma innej authoritative odpowiedzialności poza zwiększeniem population i forced role; 023 ma ją zastąpić staffingiem wewnątrz istniejącej capacity dla normal settlements.

`OUTPOST` pozostaje bez zmian semantycznych.

Unmapped resources:

```text
clay / salt / resin / herbs
```

nie tworzą nowej profesji i nie dostają sztucznego mappingu.

### 7. Scale/population preferences

Skala wynika przede wszystkim z `adultCapacity`; `VillageSize` jest sygnałem pomocniczym i tie-breakerem.

Nie używać samego `size`, gdy faktyczna demografia daje mało dorosłych.

#### Guard

- 1–2 active adults: `weak`
- 3–5 active adults: `normal`
- 6+ active adults: `strong`
- drugi Guard dopiero gdy adult capacity jest wyraźnie duża i baseline/resource coverage jest już zabezpieczona

Reserved Marek liczy się do home Guard coverage.

#### Blacksmith

- 1–3 active adults: `excluded` z weighted remainder
- 4–5: `weak`
- 6+: `normal`
- 8+: może stać się `strong` tylko jako pierwszy Blacksmith

Duplikat Blacksmith:

```text
adultCapacity < 10 → excluded
adultCapacity >= 10 → weak
```

Powód: aktualny model osad ma małe populacje; specialist duplication nie powinno konkurować z podstawową coverage.

#### Trader

Decyzja:

- Kasia pozostaje reserved home Trader.
- Procedural Trader jest dozwolony.
- Trader nigdy nie trafia do generic `RANDOM_ROLES`.
- Pierwszy procedural Trader:
  - `excluded` dla SM i dla `adultCapacity < 6`
  - `weak` przy 6–7 adults
  - `normal` przy 8+ adults
- drugi Trader: `excluded` w zakresie obecnego generatora.

`LG/XL` market infrastructure już istnieje, ale samo istnienie market prop nie wymusza Tradera.

#### Multiple specialists

Dla obecnej skali osad:

- multiple Farmers — dozwolone,
- multiple Woodcutters — dozwolone,
- multiple Guards — dozwolone w większej workforce,
- multiple Miners/Fishers — dozwolone przy matching environment/resource,
- multiple Hunters — dozwolone w foraging/forest context,
- multiple Blacksmiths — wyjątkowe,
- multiple Traders — wykluczone.

## Profession matrix

| Role | Primary when | Weight increases | Rare / excluded when | Duplicate policy | Scale effect |
|---|---|---|---|---|---|
| Farmer | `field` / `garden`; general food baseline | fertile soil, larger workforce after first food slot | OUTPOST with non-farm forced resource | duplicates allowed; useful default remainder | increasingly reasonable as adults grow |
| Woodcutter | forest settlement support | `terrain=forest`, `foodSourceType=foraging` | desert/ocean without forest signal → weak, not hard excluded | duplicates allowed, especially larger villages | normal across sizes |
| Fisher | `foodSourceType=fishing` | significant fish, ocean context | inland non-fishing → weak | duplicates favored only with fishing/fish signal | stronger with workforce under matching signal |
| Miner | significant mapped ore | iron/coal/gold/copper dominant resource, mountain context | no ore signal → weak | duplicate only when ore signal and workforce leaves spare slots | stronger in larger ore settlements |
| Hunter | foraging-oriented settlement | forest + foraging | field/fishing settlements without forest context → weak | duplicates allowed only after food/resource coverage | modest scale growth |
| Guard | no primary environmental role | adultCapacity / LG / XL | tiny workforce → weak | second Guard only at larger capacity | strongly scale-driven |
| Blacksmith | specialist, never baseline | large adultCapacity; ore context may raise one step but never force | <=3 adults excluded | second nearly always excluded | specialist appears only once capacity supports it |
| Trader | reserved home; procedural large-settlement specialist | large adultCapacity, LG/XL | SM or <6 adults excluded | max one procedural Trader | scale-gated |

### Terrain interpretation

Nie tworzyć nowego biome classifier.

Dopuszczalne istniejące biases:

```text
forest
→ Woodcutter + Hunter up
→ Farmer remains food fallback

ocean
→ Fisher up only when fishing signal exists
→ no automatic Fisher purely because terrain=ocean if no usable fishing context

mountain
→ Miner up only modestly without ore
→ strong Miner only from mapped ore

swamp
→ no invented profession mapping
→ generic food baseline + remainder

desert
→ no invented profession mapping
→ generic food baseline + remainder
```

`FoodSourceType` i `dominantResource` są silniejszymi sygnałami niż sam terrain.

## Deterministic weighted remainder

Po zaspokojeniu higher-priority signals pozostałe adult slots zachowują variety.

Resolver buduje role candidates i ich relative priority:

```text
strong > normal > weak > excluded
```

Następnie wybór:

1. usuń `excluded`,
2. zastosuj duplicate penalty zależny od istniejącej coverage,
3. użyj osobnego seeded staffing RNG,
4. wybierz weighted role,
5. zaktualizuj coverage,
6. powtarzaj dla kolejnego slotu.

### Duplicate penalty rules

Nie tworzyć osobnego hard-limit managera.

Po każdym przypisaniu obniżyć preference kolejnego duplikatu:

```text
Farmer / Woodcutter
→ one level down after each copy, minimum weak

Fisher / Miner / Hunter
→ one level down unless matching strong environment/resource signal

Guard
→ second copy only if adultCapacity >= 6

Blacksmith
→ second excluded below 10 adults

Trader
→ second excluded
```

Dzięki temu duplikaty wynikają z tego samego resolvera.

### Slot order stability

Nie uzależniać wyniku od incidental iteration order typu `Array.sort()` bez stable tie-breaker.

Procedural adult slots mają być przetwarzane w istniejącym stable family/member order.

Jeżeli dwa role mają równą wagę, seeded roll rozstrzyga tie.

## Children with assigned Role

Decyzja:

- generator nadal może przypisywać dzieciom `Role`, ponieważ `CharacterDef.role` jest obecnie wymagane,
- 023 nie wprowadza `role: null`,
- staffing adult allocation nie modyfikuje child roles,
- child roles nie liczą się do coverage,
- child role nie może blokować przydzielenia dorosłego Farmera/Minera/etc.

To zachowuje compatibility i pozostawia adulthood profession selection na późniejszy plan.

## Settlement-size expectations

To są oczekiwania composition, nie templates.

Rzeczywisty driver: **active adult count**.

### OUTPOST — 1 adult

```text
exactly 1 active adult
forced mapped resource role
no generic food baseline
no Trader / Blacksmith / Guard target
```

### Tiny SM — 1–2 adults

Oczekiwanie:

```text
1 primary livelihood role
+ optional second complementary role
```

Przykłady sensowne:

```text
Farmer
Farmer + Woodcutter
Fisher + Woodcutter
Miner + Farmer
Hunter + Farmer
```

Nie oczekiwać Tradera ani Blacksmitha.

### Larger SM / small MD — 3–5 adults

Oczekiwanie:

```text
food/livelihood coverage
+ resource specialization if present
+ 1–2 complementary roles
+ Guard becomes plausible
```

Blacksmith pozostaje rzadki, Trader wykluczony poniżej 6 adults.

### MD / LG — 6–9 adults

Oczekiwanie:

```text
primary food role
resource specialist when justified
broader production mix
Guard likely
Blacksmith possible
Trader possible but not guaranteed
```

Duplikaty basic roles zaczynają być naturalne.

### Large LG / XL — 10+ adults

Oczekiwanie:

```text
multiple basic producers
environment specialization may duplicate
Guard duplication becomes plausible
one Blacksmith common enough to appear in many seeds, not guaranteed
one Trader plausible
second Blacksmith still rare
second Trader excluded
```

Nie wymuszać pełnego zestawu wszystkich 8 roles.

## Seed stability

### Required stability

Dla tego samego settlement generation input:

```text
seed
cell
size
terrain
foodSourceType
dominantResource
generated family structure
```

role composition ma być identyczna.

### Demographic stability

Staffing nie może zmieniać:

- family count,
- family IDs,
- member order,
- names,
- surnames,
- gender,
- age,
- relation,
- scale,
- traits,
- personality.

W szczególności nie wolno dodawać losowań staffingowych do istniejących `familySeed` / age/name streams.

Użyć osobnego salt/stream np. koncepcyjnie:

```text
staffingSeed = settlementSeed ^ STAFFING_SALT
```

Nazwa/konkret stałej jest implementacyjnym detalem; invariantem jest izolacja streamu.

### Expected role instability

Zmiana samego algorytmu staffing w przyszłości może zmienić procedural roles dla tego samego world seed.

To jest akceptowalne generation behaviour, o ile:

- nie reshuffluje demografii,
- nie narusza persisted authoritative runtime state w już istniejącym save lifecycle.

Migration/persistence changes są poza zakresem 023.

## Test and balance scenarios

Scenariusze mają być pure/deterministic i używać jawnie skonstruowanych staffing contexts, zamiast polegać wyłącznie na tym, czy konkretny world seed przypadkiem wygeneruje wymagany resource.

### Scenario A — tiny garden settlement

```text
size=SM
terrain=forest
foodSourceType=garden
dominantResource=null
adultCapacity=2
```

Expected:

- Farmer ma najwyższą livelihood preference.
- Trader excluded.
- Blacksmith excluded.
- drugi slot zachowuje deterministic variety.
- nie wolno otrzymać dwóch specialist roles typu Guard+Blacksmith bez food coverage.

### Scenario B — fishing settlement

```text
size=MD
terrain=ocean
foodSourceType=fishing
dominantResource=fish richness=0.9
adultCapacity=4
```

Expected:

- co najmniej jeden active Fisher target jest obsłużony przed remainder, o ile istnieje procedural adult slot,
- drugi Fisher jest dozwolony, ale nie gwarantowany,
- Trader excluded (<6 adults),
- Blacksmith nie jest preferred.

### Scenario C — fertile field

```text
size=MD
terrain=forest
foodSourceType=field
dominantResource=fertile_soil richness=0.9
adultCapacity=4
```

Expected:

- jeden Farmer zaspokaja jednocześnie food + resource signal,
- system nie tworzy dwóch osobnych forced Farmer targets,
- family count nie rośnie.

### Scenario D — small ore settlement

```text
size=SM
terrain=mountain
foodSourceType=garden
dominantResource=iron richness=0.9
adultCapacity=2
```

Expected:

- Miner strong,
- drugi adult powinien preferować food/basic support zamiast drugiego specialist,
- Blacksmith excluded,
- Trader excluded,
- brak extra resource family.

### Scenario E — medium ore settlement

```text
size=LG
terrain=mountain
foodSourceType=garden
dominantResource=iron richness=0.9
adultCapacity=7
```

Expected:

- Miner coverage,
- Farmer/basic food coverage,
- Guard strong/likely in distribution,
- Blacksmith possible,
- Trader weak/possible,
- drugi Miner możliwy,
- role array nadal różni się między staffing seeds.

### Scenario F — large generic settlement

```text
size=XL
terrain=swamp
foodSourceType=garden
dominantResource=null
adultCapacity=11
```

Expected:

- Farmer/basic coverage,
- Guard strong,
- Blacksmith normal,
- Trader normal,
- brak wymogu Miner/Fisher,
- nie wszystkie seeds mają identyczny roster,
- second Trader never appears.

### Scenario G — home settlement

Existing reserved adults:

```text
Farmer
Woodcutter
Trader
Guard
```

Expected:

- reserved roles unchanged,
- baseline sees Farmer as already covered,
- Trader gating nie dodaje drugiego Tradera,
- Guard target widzi existing Guard,
- procedural slots nadal mogą dostać inne role.

### Scenario H — child does not satisfy coverage

```text
adult: Woodcutter
child: Farmer
foodSourceType=garden
```

Expected:

- active Farmer coverage = 0,
- child role unchanged,
- available adult staffing must still treat food role as uncovered.

### Scenario I — OUTPOST

```text
size=OUTPOST
dominantResource=gold richness=0.9
adultCapacity=1
```

Expected:

- exactly one Miner,
- żadnego generic staffing remainder,
- family/member structure unchanged from existing outpost contract.

### Scenario J — unmapped resource

```text
dominantResource=herbs richness=0.9
foodSourceType=foraging
adultCapacity=4
```

Expected:

- brak invented Herbalist,
- brak forced mapped specialist,
- composition wynika z foraging + generic remainder.

### Distribution assertions

Na większej stałej próbce deterministic staffing seeds:

- fishing contexts mają wyższą Fisher frequency niż matching-capacity garden contexts,
- ore contexts mają wyższą Miner frequency niż non-ore contexts,
- larger adultCapacity daje wyższą Guard/Blacksmith/Trader frequency niż tiny capacity,
- tiny contexts nigdy nie generują Tradera/Blacksmitha zgodnie z gating,
- specialist duplicate rate w 1–3 adult settlements spada względem obecnego uniform pool,
- same-size contexts zachowują więcej niż jeden unikalny role roster.

Nie pinować procentów bez powodu.

Testować ordering/invariants i wyraźne relacje częstotliwości, nie arbitralne statystyczne targety.

## Scope

### In scope

- generation-time staffing context,
- adult workforce coverage,
- role preference matrix,
- resource/environment signals,
- scale/population specialist gating,
- deterministic weighted remainder,
- duplicate policy,
- normal resource-family integration into existing capacity,
- procedural Trader for sufficiently large settlements,
- child-role compatibility,
- seed-stream isolation,
- focused deterministic tests.

### Out of scope

- runtime job market,
- dynamic profession demand,
- profession migration,
- retraining,
- adulthood profession selection,
- profession inheritance,
- apprenticeships,
- vacancies,
- hiring/firing,
- economy-driven live role switching,
- settlement growth,
- persistence migration,
- new professions,
- profession-specific production redesign,
- building composition driven by staffing.

## Implementation phases

### Phase 1 — Preserve demographic generation

Keep current family generation and demographic streams.

Establish helper/test visibility for:

```text
adult members
locked roles
current coverage
```

### Phase 2 — Staffing resolver

Add the smallest pure generation-time resolver using:

```text
size
terrain
foodSourceType
dominantResource
adultCapacity
existingCoverage
```

Prefer JSDoc for the main architectural/public staffing function so preflight can discover it; use `@domain settlements-npcs` where useful.

### Phase 3 — Allocate adult roles

Apply:

```text
locked
→ food baseline
→ resource target
→ scale targets
→ weighted remainder
```

Only mutate/replace procedural `CharacterDef.role`.

### Phase 4 — Remove normal-settlement resource population inflation

For non-OUTPOST settlements, satisfy significant mapped resource specialization inside existing adult capacity.

Delete the automatic extra resource family behaviour after focused tests establish equivalent resource identity without population inflation.

Keep OUTPOST path intact.

### Phase 5 — Specialist gating

Apply resolved Guard / Blacksmith / Trader rules and duplicate penalties.

### Phase 6 — Tests/balance

Add deterministic scenario tests above plus distribution comparisons.

Do not change `VILLAGE_SIZE_CONFIG.familyCount` as part of 023.

## Verification

Automated:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Focused tests should cover:

- same-input determinism,
- demographic seed isolation,
- reserved home roles,
- child coverage exclusion,
- no family-count changes,
- resource specialization,
- OUTPOST contract,
- Trader gating,
- Blacksmith gating,
- Guard scale bias,
- duplicate suppression,
- environment-driven frequency differences,
- roster variety.

Browser verification należy do użytkownika.

## Success criteria

Po implementacji początkowy skład profesji wynika z:

```text
actual adult workforce
+ food source
+ significant resources
+ settlement scale
+ deterministic variation
```

bez tworzenia sztywnego profession template.

Przykład:

```text
tiny forest/garden village
→ Farmer likely
→ Woodcutter/Hunter plausible
→ Guard optional
→ no Trader
→ no Blacksmith
```

```text
large ore village
→ Farmer/basic food coverage
→ Miner specialization
→ Guard likely
→ Blacksmith possible
→ Trader possible
→ remaining roles varied
```

Najważniejsze invariants:

```text
staffing changes Role composition
≠ changes family structure
≠ grows population to satisfy staffing
≠ changes unrelated identity
≠ counts children as active workers
≠ owns runtime profession demand
```

> **Zrób git commit i push do main, rebase jeżeli trzeba**