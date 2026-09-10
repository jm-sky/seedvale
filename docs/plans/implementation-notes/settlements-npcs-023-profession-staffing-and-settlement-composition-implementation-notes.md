# Implementation Notes: Profession staffing and settlement composition

**Plan:** `docs/plans/settlements-npcs-023-profession-staffing-and-settlement-composition.md`  
**Reviewed:** 2026-09-10  
**Codebase:** `main`

## Review outcome

Plan 023 jest dobrym miejscem na ustanowienie jednego generation-time staffing seam przed dodaniem kolejnych profesji. Implementować go **przed**:

- `fauna-004-sheep-wool-and-shepherd.md` — Shepherd,
- `settlements-npcs-007-bandages-and-herbal-medicine.md` — Herbalist.

Oba późniejsze plany powinny rozszerzać staffing z 023, nie dodawać `shepherd` / `herbalist` do losowego poola ani tworzyć własnego assignment systemu.

Dwa punkty planu wymagają szczególnej uwagi podczas implementacji:

1. quest-critical NPC są częścią kontraktu generation, nie tylko „reserved role coverage”,
2. usunięcie obecnej dodatkowej resource family jest realną zmianą deterministic worldgen/population dla istniejących seedów i save'ów; nie można opisywać jej jako pełnej demographic stability względem wersji sprzed 023.

## Aktualny generation flow

Authoritative call chain jest dziś:

```text
settlementGenerator.ts
resolveSettlementContext()
→ chooseSettlementSite()
→ resolveVillageIdentity()
→ generateFamilies()
→ createVillagePlan()
```

`resolveVillageIdentity()` już wylicza wszystkie environment inputs potrzebne staffingowi:

- `VillageIdentity.size`,
- `VillageIdentity.terrain`,
- `VillageIdentity.foodSourceType`,
- `VillageIdentity.dominantResource`,
- `VillageIdentity.isHome`,
- `nameCulture`.

Nie odtwarzać tych sygnałów ponownie w `families.ts` i nie robić drugiego resource/biome lookup.

### Najważniejsze pliki / symbole

- `src/settlement/settlementGenerator.ts`
  - `resolveVillageIdentity()` — wylicza `terrain`, `dominantResource`, `foodSourceType`, `size`,
  - `generateSettlementCore()` — miejsce, które ma jednocześnie `VillageIdentity` i wygenerowane families; naturalny integration point dla staffing resolvera.
- `src/settlement/families.ts`
  - `generateFamily()` — generuje shape rodziny, nazwiska, names, ages i bazowy `CharacterDef`,
  - `generateFamilies()` — reserved home families, normal family count, OUTPOST i obecna dodatkowa resource family,
  - `VILLAGE_SIZE_CONFIG` — jedyne źródło family-count ranges.
- `src/ai/characters.ts`
  - `Role`,
  - `RANDOM_ROLES`,
  - `characterForSeed()`,
  - `RESERVED_CHARACTERS` / `RESERVED_SEEDS`.
- `src/terrain/naturalResources.ts`
  - `SIGNIFICANT_RICHNESS = 0.55`,
  - `RESOURCE_ROLE`,
  - `ResourceType`.

## Zalecany ownership staffing

Nie wciskać całego resolvera do `characterForSeed()` — ta funkcja nie widzi settlement context i jest też źródłem traits/personality.

Najczytelniejsza granica to jeden pure generation-time resolver, np. w `src/settlement/professionStaffing.ts`, wywołany z `generateSettlementCore()` po utworzeniu demografii i przed `createVillagePlan()`:

```text
generateFamilies()              // demographic / identity baseline
→ resolveInitialProfessionStaffing(families, context)
→ createVillagePlan(staffedFamilies)
```

To **nie jest drugi generator populacji**. Resolver może zmieniać wyłącznie `FamilyMember.character.role` dla proceduralnych adult slots i zwracać nowy roster z zachowanym family/member order.

Preferować immutable transform (`FamilyDef[]` → `FamilyDef[]`) zamiast mutowania wejściowych obiektów. Dzięki temu testy mogą wprost porównać demografię before/after staffing.

### Minimalny context

Context powinien korzystać wyłącznie z już policzonych danych:

```ts
size
terrain
foodSourceType
dominantResource
isHome
seed
```

`adultCapacity`, locked slots i coverage wyprowadzać z `families`, nie przekazywać jako drugie źródło prawdy.

Nie importować do staffing resolvera `SettlementEconomy`, `Household`, runtime `NpcAgent`, streamed props ani world managers.

## Demografia vs role

`generateFamily()` obecnie wywołuje `characterForSeed()`, które losuje także `role`. Nie trzeba rozbijać tej funkcji w 023 tylko po to, aby uzyskać staffing:

- bazowy role może nadal powstać razem z traits/personality,
- adult procedural role jest następnie zastępowany przez staffing,
- child role pozostaje bazowym generated role zgodnie z planem,
- reserved characters pozostają nietknięte.

Ważne: staffing RNG musi być osobnym streamem. Nie dodawać drawów do `familySeed`, `familyAgeSeed` ani RNG używanego przez `characterForSeed()`.

## Locked NPC i quest contract

Aktualne authored questy są w `src/quests/quests.ts`. Ich NPC references są wprawdzie runtime'owo stabilnymi `NpcId`, ale `src/quests/materializeAuthoredQuests.ts::materializeAuthoredQuestDefs()` nadal rozwiązuje authored names przeciwko deterministic home descriptors przy composition-root materialization.

`resolveAuthoredNpcId()` **rzuca błędem**, gdy nazwy brakuje albo jest niejednoznaczna.

Dlatego 023 musi zachować nie tylko role, ale pełny kontrakt:

```text
home settlement always contains exactly one resolvable:
Anna
Piotr
Kasia
Marek
```

oraz zachować ich existing flattened family/member order. Staffing nie może:

- usuwać reserved families,
- zamieniać reserved `CharacterDef`,
- zmieniać ich names/surnames,
- przestawiać families/members,
- generować proceduralnego NPC o reserved first name, jeśli spowodowałoby to ambiguous authored resolution.

Aktualny generator nazw nie jest częścią staffing; 023 nie powinien go zmieniać.

### Regression test wymagany przez zależność quests ↔ NPC

Po staffing dodać test integracyjny wykorzystujący realne mechanizmy:

```text
generated home families
→ SettlementDef / settlementNpcDescriptors()
→ materializeAuthoredQuestDefs(QUESTS, descriptors)
→ no AuthoredNpcResolutionError
```

Nie wystarcza tylko test `names contains Anna/Piotr/Kasia/Marek`.

`src/settlement/npcIdentity.ts` jest ważny, bo `NpcId` to `${settlementId}:npc:${memberIndex}` wyprowadzony ze spłaszczonego family/member order. Role mogą się zmieniać bez zmiany identity; reorder nie może.

## World-driven quests

`src/quests/opportunities/worldQuestMaterialization.ts` buduje `OpportunityNpc` z tych samych families i czyta `member.character.role`.

Dla `wolf-den-pressure` giver selection preferuje istniejącego `hunter`, potem bierze pierwszego adulta.

To oznacza, że 023 **może celowo zmienić** kto dostaje proceduralny quest, bo zmienia role composition. To jest prawidłowa emergent consequence, pod warunkiem że:

- quest zawsze ma adult fallback,
- staffing nie może spowodować braku adultów (nie zmienia demografii),
- quest selection nadal korzysta z `Role`, bez specjalnej integracji staffing → quests.

Nie dodawać quest-only Hunter ani „quest giver reservation” do staffing tylko po to, aby zachować dotychczasowego proceduralnego givera.

## Resource specialization i compatibility

Obecny `generateFamilies()` dla normalnego settlementu z significant mapped resource **dodaje nową family** po normalnym `targetCount`. OUTPOST jest osobną ścieżką i musi zostać.

Plan 023 chce dla normalnych osad usunąć tę inflację i przydzielić specialist role istniejącemu adultowi.

To ma ważny skutek:

```text
pre-023 normal resource settlement
= normal families + appended specialist family

post-023
= normal families, specialist assigned inside existing adult capacity
```

To jest zmiana liczby NPC dla tych samych istniejących seedów. `settlementNpcId()` jest indeksowe, więc wcześniejsze members zachowają swoje ids, ponieważ dedicated family była appendowana na końcu, ale końcowy specialist NPC zniknie. Jego ewentualny persisted `NpcStateSnapshot` nie będzie już miał odpowiadającego generated inhabitanta.

Implementation agent nie powinien tworzyć ukrytej migration tylko w 023. Należy:

- zachować scope planu: brak persistence migration,
- jawnie potraktować to jako deterministic worldgen compatibility change,
- nie twierdzić w testach/docs, że roster population jest identyczny z pre-023,
- zapewnić, że **po wejściu 023** staffing nie dodaje rodzin/NPC w celu uzyskania profession coverage.

Jeżeli podczas implementacji obecny persistence contract okaże się, że orphan `npcStates` powoduje błąd albo zanieczyszcza zapis, to jest realny blocker wymagający osobnej decyzji — nie maskować go staffing workaroundiem.

## OUTPOST

Nie przepisywać resource-outpost semantics do generic resolvera.

Aktualny kontrakt w `generateFamilies()` jest prosty i powinien zostać:

```text
size === OUTPOST
→ 1 family
→ 1 lone adult
→ forcedRole = RESOURCE_ROLE[dominantResource.type]
```

Staffing resolver może dla OUTPOST zwrócić roster bez zmian albo ominąć generic allocation całkowicie.

## Candidate policy / przyszłe profesje

023 powinien przygotować **rozszerzalny jeden staffing mechanism**, ale nie implementować jeszcze Shepherd/Herbalist.

Nie budować algorytmu jako wielu rozproszonych `if (role === ...)` w `generateFamilies()`.

Preferować jedną centralną role-policy strukturę / funkcję scoringową, która dla `Role` i context daje priority oraz duplicate policy. Musi pozostać exhaustive względem `Role`, żeby TypeScript wymusił aktualizację przy dodaniu profesji.

Po 023 późniejsze plany powinny móc dodać:

```text
Role += shepherd
→ staffing policy: livestock/sheep-aware

Role += herbalist
→ staffing policy: herbs / gathering / settlement context-aware
```

bez drugiego resolvera.

### Shepherd — kontrakt dla fauna-004

`fauna-004` nie może zwyczajnie dopisać `shepherd` do `RANDOM_ROLES`.

023 powinien zostawić seam pozwalający później wzbogacić staffing input o **generation-time settlement composition signals**, które są deterministyczne i niezależne od runtime/camera. Shepherd wymaga wiedzy, czy settlement/household faktycznie ma owce.

Nie implementować tego sygnału w 023, jeśli livestock composition jest dziś wyliczana później. Ważne jest jedynie, aby resolver/context dało się rozszerzyć bez tworzenia drugiego staffing systemu.

`src/settlement/livestock.ts` zachowuje `ensureSheep` dla home/quest guarantee. To jest quest/world-content guarantee i nie należy usuwać jej w 023 ani uzależniać od istnienia Shepherd. Późniejszy fauna-004 ma rozwiązać normalne sheep ↔ shepherd composition, podczas gdy `ensureSheep` pozostaje wyjątkiem potrzebnym authored questowi.

### Herbalist — kontrakt dla settlements-npcs-007

`herbs` istnieje już w `ResourceType`, ale celowo nie jest obecnie mapowane w `RESOURCE_ROLE`.

023 nie powinien tworzyć Herbalist ani mapować `herbs → herbalist`. Po dodaniu roli w 007 rozszerzyć ten sam staffing policy/context. Nie zakładać automatycznie hard forced role tylko dlatego, że `dominantResource.type === 'herbs'`; zgodnie z filozofią staffing powinien to być silny/normalny generation signal zależny także od capacity.

## Priority resolver

Planowe poziomy:

```text
strong > normal > weak > excluded
```

warto przełożyć na małą, jawną skalę wag w **jednym** miejscu. Nie rozsiewać magicznych wag per-role po switchach.

Allocation order powinien być jawny i testowalny:

```text
1. collect locked adult coverage
2. satisfy food-source target when possible
3. satisfy significant mapped resource target when possible
4. apply scale specialist preferences
5. fill remaining procedural adult slots through seeded weighted selection
```

Jedno przypisanie może zaspokoić więcej niż jeden target. Coverage liczy tylko `age >= 18`.

## Trader correction

`src/ai/characters.ts` ma stale `RANDOM_ROLES` bez `trader`, ale plan 023 świadomie dopuszcza proceduralnego Tradera w dużych osadach.

Nie trzeba przez to dodawać Tradera do `RANDOM_ROLES`. Wręcz przeciwnie: zostawić random baseline jako implementation detail generation, a procedural Trader powinien powstawać wyłącznie przez staffing policy. Dzięki temu scale gate (`adultCapacity >= 6`) nie może zostać przypadkiem ominięty przez `characterForSeed()`.

Istniejący test `home has exactly one trader; other settlements never roll trader` będzie wymagał zmiany semantyki: home nadal exactly one reserved Trader, ale sufficiently large non-home settlements mogą dostać jednego staffing-assigned Tradera.

## Tests do zmiany / dodania

Główny plik: `src/settlement/families.test.ts` obecnie pinował kilka zachowań, które 023 świadomie zmienia:

- test dedicated resource family oczekuje `without.length + 1` — po 023 ma zniknąć dla normal settlements,
- test „other settlements never roll trader” jest nieaktualny po dopuszczeniu procedural Trader,
- pinned role sequence dla seed 7 będzie nieaktualna, bo adult roles mają być wynikiem staffing; nie przepinać nowej pełnej sekwencji, jeśli celem testu jest izolacja age/name/trait RNG.

Zachować / rozszerzyć testy:

- `generateFamilies` deterministic demographic structure,
- reserved home roster,
- OUTPOST forced role,
- age/name/family shape stability.

Dla nowego resolvera preferować osobny `src/settlement/professionStaffing.test.ts` z jawnie budowanymi `FamilyDef` i contextami z planu. To pozwala testować matrix bez szukania seedów generujących odpowiednią demografię.

Dodatkowo:

- `src/quests/materializeAuthoredQuests.test.ts` — quest-critical reserved NPC materialization po staffed home generation,
- ewentualnie `src/quests/opportunities/worldQuestMaterialization.test.ts` — hunter preference nadal działa na post-staffing rosterze, ale fallback adult pozostaje poprawny.

Distribution tests powinny sprawdzać relacje (`fishing > generic` dla Fisher itd.), nie dokładne procenty.

## Suggested implementation order

1. Dodać pure staffing context/resolver + focused tests bez podłączania do generatora.
2. Podłączyć resolver w `generateSettlementCore()` między `generateFamilies()` a `createVillagePlan()`.
3. Zachować reserved/OUTPOST paths i potwierdzić quest materialization regression.
4. Usunąć normal-settlement appended resource family z `generateFamilies()` i zaktualizować testy compatibility semantics.
5. Włączyć Trader/Guard/Blacksmith gates i weighted remainder.
6. Dodać distribution/invariant tests.
7. Sprawdzić exhaustive `Role` consumers, ale nie refaktorować profession work/schedules bez potrzeby — 023 zmienia assignment, nie zachowanie profesji.

## Verification

Automated:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Szczególnie zweryfikować:

- same staffing inputs → same roles,
- staffing RNG nie zmienia name/age/relation/traits/personality,
- family/member order bez zmian,
- authored `QUESTS` materializują się bez missing/ambiguous NPC,
- normal significant resource nie dodaje już family po świadomym compatibility change,
- OUTPOST nadal ma dokładnie jednego forced specialist,
- home reserved roles/ids pozostają stabilne,
- world-driven quest może preferować Huntera, ale zawsze ma adult fallback,
- brak procedural Trader poniżej gate i max jeden procedural Trader,
- child role nie zaspokaja adult coverage.

Browser verification wykonuje użytkownik; agent nie uruchamia browser verification.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
