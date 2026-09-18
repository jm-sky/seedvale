# Plan: Contextual Elder Social Titles

**Created:** 2026-09-18
**Status:** `draft` 📝
**Type:** polish
**Priority:** low · **Effort:** S
**Depends on:** settlements-npcs-045
**Domain:** `npc`
**Subdomains:** `dialogue` `relationships`
**Tags:** `elder` `names` `presentation`
**Roadmap:** `npc-professions-households-and-age.md`

## Goal

Dodać kontekstowe, presentation-only określenia starszych NPC, np.:

- `Pan Kazimierz`,
- `Stary Jan`,
- `Dziadek Antoni`,

bez zmiany canonical identity, `NpcId`, quest bindingów ani zapisanych imion.

## Design

### 1. Canonical name remains unchanged

Nie modyfikować:

- `FamilyMember.name`,
- `CharacterDef.name`,
- surname,
- `NpcId`,
- quest giver identity.

Tytuł jest wyłącznie derived presentation.

Preferowany shape:

```text
NpcId / canonical name
+ age/life stage
+ personality
+ relation/social context
→ display label
```

### 2. Only elders are candidates

Korzystać z istniejącego `lifeStageForAge()`.

Nie tworzyć kolejnego elder boolean/progu.

### 3. Context matters

Nie każdy senior dostaje ten sam prefiks.

V1 może dobierać formę z małego deterministycznego zestawu na podstawie:

- personality traits,
- familiarity/relation context,
- ewentualnie płci/języka, jeżeli obecny localization/name layer tego wymaga.

Przykładowa semantyka:

- bardziej formalny/szanowany kontekst → `Pan/Pani`,
- swojski/znany lokalnie → `Dziadek/Babcia`,
- szorstki/nieformalny charakter → `Stary/Stara`.

Dokładnych mapowań nie hardkodować w wielu UI.

### 4. One resolver, many consumers

Dodać jeden mały resolver presentation label i używać go tylko tam, gdzie kontekst społeczny tego wymaga.

Nie zmieniać raw canonical name w danych.

UI wymagające stabilnej krótkiej identity może nadal używać zwykłego imienia, jeśli tytuł powodowałby regresję layoutu lub semantyki.

### 5. Deterministic and state-derived

Bez `Math.random()` przy renderowaniu.

Ta sama osoba i ten sam kontekst dają ten sam title.

### 6. Quest safety

Quest system coraz bardziej wiąże NPC przez `NpcId`; mimo to plan musi przetestować wszystkie miejsca, gdzie display name pojawia się w authored text/markers.

Lost Treasure Chronicles Kazimierz zachowuje canonical authored identity. Tytuł może być pokazany tylko przez wspólną presentation warstwę tam, gdzie jest to bezpieczne; nie przepisywać authored quest strings mechanicznie.

## Scope

### In scope

- derived elder title resolver,
- small Polish title vocabulary,
- personality/relation-aware selection,
- selected NPC labels/dialogue presentation,
- deterministic tests,
- layout regression checks.

### Out of scope

- nicknames for all NPCs,
- noble titles,
- profession titles,
- renaming NPCs,
- persistence,
- genealogy-driven `grandfather of X`,
- changes to quest identity/bindings,
- localization framework rewrite.

## Likely integration points

- existing name/display helpers in AI/UI discovered during implementation,
- `src/settlement/npcPhysicalProfile.ts::lifeStageForAge()`,
- personality source in `CharacterDef`,
- existing player↔NPC relation lookup where already available,
- dialogue/nameplate/interaction presentation.

Important public resolver should receive JSDoc and `@domain npc`.

## Tests

At least:

- non-elder keeps canonical display without elder prefix,
- elder title is deterministic,
- different personality/context may select different permitted titles,
- resolver never mutates canonical name,
- quest matching remains by `NpcId`,
- authored Lost Treasure quest still resolves Kazimierz correctly,
- UI labels do not duplicate title on repeated render/update.

## Verification

Automated:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Manual/browser verification by User:

- inspect several elders with different personalities,
- confirm titles feel varied but stable,
- confirm normal adults are unchanged,
- confirm quest markers/dialogue still point to correct NPCs,
- verify Lost Treasure Chronicles naming/story remains intact.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
