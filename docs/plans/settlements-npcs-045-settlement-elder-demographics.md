# Plan: Settlement Elder Demographics

**Created:** 2026-09-18
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** `settlements-npcs`
**Subdomains:** `household` `social`
**Tags:** `age` `elder` `demographics`
**Roadmap:** `npc-professions-households-and-age.md`
**Model:** Sonnet, Composer

## Goal

Zapewnić, aby każda normalna osada posiadała co najmniej jednego starszego mieszkańca wynikającego z normalnej demografii i istniejącego modelu rodzin, bez tworzenia osobnego typu `ElderNPC`.

Docelowo:

```text
generated + authored settlement families
→ normal FamilyMember.age
→ lifeStageForAge(age)
→ elderly / veryElderly resident
→ ordinary household / role / personality / NPC systems
```

Plan dotyczy wyłącznie generation-time demografii. Nie dodaje runtime aging ani elder-specific AI.

## Current state

- `FamilyMember.age` w `src/settlement/families.ts` jest authoritative demographic state.
- `src/settlement/npcPhysicalProfile.ts::lifeStageForAge()` ma już:
  - `mature` 50–64,
  - `elderly` 65–84,
  - `veryElderly` 85–100.
- `NPC_AGE_MAX = 100`.
- Procedural adults są dziś generowani jednostajnie w zakresie `18–70`.
- `familyAgeSeed()` jest oddzielnym deterministic RNG streamem, więc zmiany wieku nie muszą przetasować names/roles/traits.
- małżonkowie mają maksymalny age gap 15 lat,
- dziecko ma co najmniej 18 lat różnicy do młodszego rodzica.
- `generateFamilies()` tworzy generated/reserved families.
- authored residents są dopinani później w `settlementGenerator.ts::generateSettlementCore()` przez `appendAuthoredResidentFamilies()`, przed profession staffing i VillagePlan.
- `settlementPlanCache.ts` wstrzykuje Lost Treasure Chronicles eldera, archaeologist i specialist jako authored residents.
- Lost Treasure Chronicles ma authored `Kazimierz Nowak`, age 74, family id `family-story-lost-treasure-elder`.
- `SettlementDef` jest cache'owany w disposable IndexedDB worldgen cache; zmiana family-generation output wymaga bumpu `SETTLEMENT_DEFINITION_CACHE_VERSION`.

## Design decisions

### 1. Elder is derived from existing life stage

Nie dodawać:

```ts
isElder
elderType
elderAgeState
```

Jedyną semantyką elder w tym planie jest:

```ts
lifeStageForAge(age) === 'elderly'
|| lifeStageForAge(age) === 'veryElderly'
```

Jeżeli potrzebny będzie helper, ma delegować do `lifeStageForAge()`, a nie kopiować próg 65.

### 2. Guarantee applies after authored residents are appended

Invariant należy egzekwować w `generateSettlementCore()` **po**:

```text
generateFamilies()
→ appendAuthoredResidentFamilies()
```

i **przed**:

```text
resolveInitialProfessionStaffing()
→ applyProfessionFamilySurnames()
→ createVillagePlan()
```

Dzięki temu authored Kazimierz może już spełnić invariant swojej osady i nie powodujemy automatycznego drugiego seniora tylko dlatego, że został dopięty po `generateFamilies()`.

Dla `SM | MD | LG | XL` roster ma zawierać co najmniej jednego membera w `elderly | veryElderly`.

`OUTPOST` pozostaje poza gwarancją.

### 3. Normal age generation extends beyond 70

Proceduralny adult age roll powinien naturalnie dopuszczać:

- ordinary adults,
- `mature`,
- `elderly`,
- rzadszych `veryElderly`.

Nie używać uniform `18–100`.

Wprowadzić jawny deterministic weighted/banded adult-age resolver w `families.ts`. V1 target:

- większość dorosłych <65,
- sensowna mniejszość 65–84,
- `veryElderly` możliwe, ale rzadkie.

Nie uzależniać gwarancji 1+ wyłącznie od prawdopodobieństwa.

### 4. Guarantee promotes an existing generated adult; never adds/reorders members

Jeżeli po generated + authored composition nie ma eldera:

1. wybrać deterministycznie istniejącego **generated** adult membera,
2. podnieść jego age do elder range,
3. jeżeli należy do pary, skorygować spouse age tylko w zakresie potrzebnym do zachowania `MAX_SPOUSE_AGE_GAP`,
4. zachować child-parent plausibility,
5. nie zmieniać family/member ordering, names, roles, traits, gender, relation ani liczby mieszkańców.

Preferować kandydata z najwyższym już wygenerowanym wiekiem; tie-break przez istniejący stable family/member order. To minimalizuje korektę i nie wymaga kolejnego losowania.

Nie promować authored `family-story-*` ani innych authored residentów. Mogą spełnić invariant, ale nie wolno ich mutować.

### 5. Elder target age

Promotion ma użyć osobnego deterministic age-only inputu z istniejącego world/family seed, bez `Math.random()`.

Target musi być w zakresie obsługiwanym przez `lifeStageForAge()` i może obejmować zarówno `elderly`, jak i rzadziej `veryElderly`.

Nie wprowadzać nowego persisted state. Finalny `FamilyMember.age` jest jedynym wynikiem.

### 6. Preserve family plausibility

Po normalnym rollu oraz ewentualnej promotion zawsze muszą pozostać prawdziwe:

- adults `>= 18`,
- children `<= 17`,
- child younger than parents,
- minimum 18-year parent/child gap,
- spouse gap `<= 15`,
- every age inside `[0, 100]`.

Nie wolno "naprawiać" rodziny przez dokładanie/usuwanie członków.

### 7. Reserved home families are ordinary candidates, authored story families are not

`family-reserved-0/1` są częścią normalnego home rosteru i mogą być candidate do promotion, ponieważ ich ages już są generowane przez standardowy age stream.

Guardrail dotyczy authored `family-story-*` residentów. Ich wieku nie zmieniać.

### 8. Protect Lost Treasure Chronicles

Ten plan NIE może zmienić:

- `LOST_TREASURE_ELDER_FAMILY_ID`,
- `LOST_TREASURE_ELDER_GIVEN_NAME`,
- `LOST_TREASURE_ELDER_LAST_NAME`,
- `LOST_TREASURE_ELDER_AGE = 74`,
- authored family append order,
- Kazimierz's flattened `NpcId`,
- elder-host settlement selection,
- quest bindings w `lostTreasureChroniclesElder.ts`,
- semantics `isLostTreasureElderFamily()`.

Kazimierz w wieku 74 spełnia zwykły elder invariant swojej osady, ale pozostaje authored story residentem.

### 9. Stable NPC identity and profession composition

Zmiana może modyfikować tylko age values istniejących members.

Nie zmieniać:

- liczby rodzin,
- liczby members,
- family ids,
- flattened order,
- names,
- base role/personality/traits RNG stream.

Profession staffing nadal działa po elder guarantee. Ponieważ staffing używa adult workforce `age >= 18`, samo podniesienie wieku dorosłego nie może usuwać go z workforce.

### 10. Persistent worldgen cache must invalidate

Ponieważ identyczny seed/config zacznie generować inny `SettlementDef.families[*].members[*].age`, implementacja musi zwiększyć:

```ts
SETTLEMENT_DEFINITION_CACHE_VERSION
```

w `src/settlement/settlementWorldgenCache.ts`.

Nie migrować starych cache records; zgodnie z istniejącym kontraktem version mismatch ma być zwykłym cache miss.

## Suggested implementation shape

Preferowany mały podział odpowiedzialności:

```text
families.ts
  generateAdultAge(...)
  promote/ensure elder age on an existing generated roster
  family-age consistency helpers

settlementGenerator.ts
  generated families
  + authored residents
  → ensure settlement elder invariant
  → profession staffing
  → plan
```

Publiczny/shared helper powinien przyjmować whole family roster + settlement size/seed i zwracać nowy roster tylko wtedy, gdy korekta jest potrzebna.

Nie mutować input arrays in place, jeśli obecny generation pipeline łatwo pozwala zwrócić nowe `FamilyDef`/member copies.

## Scope

### In scope

- plausible procedural adult-age distribution extending past 70,
- `elderly | veryElderly` as elder definition,
- minimum one elder in every normal settlement,
- authored-resident-aware invariant placement,
- deterministic promotion of an existing generated adult,
- spouse/parent-child plausibility preservation,
- stable family/member identity/order,
- worldgen-cache version bump,
- focused tests.

### Out of scope

- dynamic aging/birthdays,
- old-age death,
- retirement,
- profession history,
- elder-specific work/schedules,
- teaching/knowledge,
- cemetery care,
- fishing leisure,
- rat cleanup,
- social titles,
- genealogy across households,
- adding/removing family members,
- changing Lost Treasure authored content.

## Relevant files / systems

- `src/settlement/families.ts`
  - `FamilyMember`,
  - `familyAgeSeed()`,
  - `generateAdultAge()`,
  - `generateSpouseAge()`,
  - `generateChildAge()`,
  - `generateFamily()`,
  - `generateFamilies()`.
- `src/settlement/npcPhysicalProfile.ts`
  - `LifeStage`,
  - `lifeStageForAge()`,
  - `NPC_AGE_MAX`.
- `src/settlement/settlementGenerator.ts`
  - `generateSettlementCore()`,
  - authored-family merge point,
  - profession staffing call site.
- `src/settlement/lostTreasureChroniclesElderResident.ts`
  - regression guard only.
- `src/settlement/settlementPlanCache.ts`
  - authored resident composition; no new elder-specific cache/selector.
- `src/settlement/settlementWorldgenCache.ts`
  - `SETTLEMENT_DEFINITION_CACHE_VERSION`.
- `src/settlement/families.test.ts`
- `src/settlement/lostTreasureChroniclesElderResident.test.ts`
- settlement generator/cache tests as needed.

Important new public/shared helpers should receive JSDoc with ownership and `@domain settlements-npcs`.

## Tests

### Age distribution

- generated adults can exceed age 70,
- `elderly` appears naturally across a broad deterministic seed sample,
- `veryElderly` is reachable but materially rarer than non-elder adults,
- no adult exceeds `NPC_AGE_MAX`,
- same seed produces the same ages.

Tests should validate broad invariants rather than pinning fragile exact population percentages.

### Settlement invariant

For representative seeds and each `SM | MD | LG | XL`:

- final roster after authored merge contains >=1 `elderly | veryElderly`,
- `OUTPOST` is not force-promoted,
- member/family counts are unchanged by guarantee,
- flattened member ids/order stay unchanged.

### Family plausibility

- spouse gap remains <=15,
- child remains <=17,
- parent-child difference remains >=18,
- promotion cannot invalidate spouse/child constraints.

### Home/reserved roster

- Anna/Piotr/Kasia/Marek remain present with unchanged names/ids/order,
- one of them may become elder only through age correction; no extra home resident is created.

### Lost Treasure regression

Keep and extend focused assertions that:

- Kazimierz stays exactly age 74,
- family id/name/gender/relation remain unchanged,
- exactly one authored elder family is injected into the selected host,
- authored family remains appended after generated families,
- Kazimierz's `NpcId` derivation stays unchanged,
- host settlement already satisfies elder invariant without mutation of Kazimierz,
- quest/materialization tests remain green.

### Cache

- cache version is bumped with this algorithm change,
- old-version settlement-definition entries are not reused.

## Performance

Generation-time only.

Do not add:

- runtime scans,
- per-frame age checks for this invariant,
- persistent elder registry,
- settlement elder manager,
- additional worldgen pass over other settlements.

The operation is O(number of family members in one settlement), bounded by current small village populations.

## Verification

Automated:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Focused tests should include at least:

```bash
pnpm vitest run src/settlement/families.test.ts
pnpm vitest run src/settlement/lostTreasureChroniclesElderResident.test.ts
```

Manual/browser verification is performed by the User:

1. inspect several SM/MD/LG/XL settlements,
2. confirm at least one senior in each normal settlement,
3. confirm OUTPOST remains unrestricted,
4. confirm ordinary adults still dominate population,
5. confirm some seeds can produce visibly older `veryElderly` residents,
6. verify household composition still looks plausible,
7. verify Lost Treasure Chronicles Kazimierz and his quests behave exactly as before.

## Success criteria

```text
normal settlement
→ final generated+authored roster has >= 1 elderly/veryElderly member

OUTPOST
→ unchanged demographic guarantee

elder
→ ordinary FamilyMember with normal Role/personality/household
→ no special NPC class/state

Kazimierz
→ unchanged authored identity/story binding
→ may satisfy the same settlement invariant naturally
```

> **Zrób git commit i push do main, rebase jeżeli trzeba**
