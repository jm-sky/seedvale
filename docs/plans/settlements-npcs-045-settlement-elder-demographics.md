# Plan: Settlement Elder Demographics

**Created:** 2026-09-18
**Status:** `draft` 📝
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** `settlements-npcs`
**Subdomains:** `household` `social`
**Tags:** `age` `elder` `demographics`
**Roadmap:** `npc-professions-households-and-age.md`

## Goal

Zapewnić, aby każda normalna osada posiadała co najmniej jednego starszego mieszkańca wynikającego z normalnej demografii i istniejącego modelu rodzin, bez tworzenia osobnego typu `ElderNPC`.

Docelowo:

```text
settlement family generation
→ normal FamilyMember.age
→ lifeStageForAge(age)
→ elderly / veryElderly resident
→ ordinary household / role / personality / NPC systems
```

## Current state

- `FamilyMember.age` jest authoritative demographic state.
- `src/settlement/npcPhysicalProfile.ts::lifeStageForAge()` ma już `elderly` i `veryElderly`.
- `NPC_AGE_MAX = 100`.
- Procedural adults w `src/settlement/families.ts` są dziś generowani w zakresie `18–70`, więc `veryElderly` praktycznie nie występuje proceduralnie.
- `generateFamilies()` jest deterministyczne i zachowuje oddzielny age RNG stream.
- OUTPOST jest specjalnym jednoosobowym przypadkiem.
- Lost Treasure Chronicles ma authored resident `Kazimierz Nowak`, age 74, w `lostTreasureChroniclesElderResident.ts`.

## Design

### 1. Elder is derived from existing life stage

Nie dodawać:

```ts
isElder
elderType
elderAgeState
```

Elder eligibility ma wynikać z istniejącego:

```ts
lifeStageForAge(age)
```

V1 może traktować jako elder:

- `elderly`,
- `veryElderly`.

Nie duplikować progu 65 w wielu modułach.

### 2. Normal settlements guarantee at least one elder

Dla `SM | MD | LG | XL` rodzinny roster po generacji ma spełniać:

```text
at least one living generated resident
whose life stage is elderly or veryElderly
```

Nie rozszerzać tej gwarancji automatycznie na `OUTPOST`.

Gwarancja ma być deterministyczna i oparta na już wygenerowanych rodzinach. Preferować dostosowanie wieku istniejącego dorosłego członka rodziny zamiast dokładania sztucznego dodatkowego household tylko po to, aby spełnić invariant.

### 3. Use a plausible age distribution, not uniform 18–100

Nie zmieniać `ADULT_AGE_RANGE` po prostu na `18–100` z rozkładem jednostajnym.

Proceduralny rozkład powinien nadal generować większość dorosłych w wieku produkcyjnym, ale pozwalać na naturalnych seniorów oraz sporadycznych `veryElderly`.

Dokładne wagi mają zostać skalibrowane w implementacji i przetestowane statystycznie/deterministycznie.

### 4. Preserve family plausibility

Zmiana wieku nie może łamać:

- spouse age-gap constraints,
- parent/child age plausibility,
- child age generation,
- reserved home families,
- deterministic names/roles/traits.

Jeżeli elder jest członkiem pary lub rodzicem, korekta wieku musi zachować spójność drugiego małżonka i dzieci.

### 5. Protect authored Lost Treasure elder

`src/settlement/lostTreasureChroniclesElderResident.ts` oraz jego quest bindings są authored story content.

Ten plan NIE może:

- usunąć authored Kazimierza,
- zastąpić go przypadkowym proceduralnym seniorem,
- zmienić jego family id,
- zmienić jego `NpcId` derivation/order,
- zmienić jego wiek/imię/rolę story baseline,
- przepiąć Lost Treasure Chronicles na ogólny elder selector.

Jeżeli Kazimierz znajduje się w osadzie, może naturalnie spełniać lokalny invariant demograficzny, ale mechanizm demografii nie może być zależny od jego story injection.

### 6. Stable NPC identity

Nie wolno zmienić kolejności rodzin lub liczby członków istniejących rodzin w sposób, który przetasuje obecne flattened `NpcId` bez wyraźnej migracji/uzasadnienia.

Preferować zmianę wyłącznie age values w istniejącym rosterze.

## Scope

### In scope

- procedural elder age distribution,
- minimum one elder in normal settlements,
- reuse `lifeStageForAge()`,
- family plausibility,
- deterministic generation,
- focused tests,
- diagnostics/test helpers only if needed.

### Out of scope

- aging over time,
- death from old age,
- retirement,
- elder-specific schedules,
- teaching/knowledge,
- cemetery care,
- fishing leisure,
- social titles,
- genealogy across households,
- changes to Lost Treasure Chronicles authored elder.

## Likely integration points

- `src/settlement/families.ts`
  - adult age generation,
  - spouse/child age constraints,
  - `generateFamilies()`.
- `src/settlement/npcPhysicalProfile.ts`
  - reuse only; do not create parallel life-stage rules.
- family generation tests.
- `src/settlement/lostTreasureChroniclesElderResident.ts`
  - regression guard only; no planned behavior change.

Important public helpers should receive JSDoc and `@domain settlements-npcs` where useful for preflight.

## Tests

Cover at least:

- every normal settlement size gets at least one elder,
- OUTPOST is not forced to contain an elder,
- same seed produces identical ages,
- elder can be `elderly` or `veryElderly`,
- population is not dominated by elders,
- spouse/child age constraints remain valid,
- reserved home families remain stable,
- flattened family/member ordering remains stable,
- Lost Treasure authored elder remains unchanged and quest binding tests continue to pass.

## Verification

Automated:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Manual/browser verification by User:

- inspect several SM/MD/LG/XL settlements,
- confirm at least one visibly old resident per normal settlement,
- confirm ordinary age variety remains plausible,
- confirm Lost Treasure Chronicles Kazimierz still exists and story works unchanged.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
