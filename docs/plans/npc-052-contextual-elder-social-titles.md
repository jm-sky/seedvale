# Plan: Contextual Elder Social Titles

**Created:** 2026-09-18
**Status:** `planned` 📋
**Type:** polish
**Priority:** low · **Effort:** S
**Depends on:** settlements-npcs-045
**Domain:** `npc`
**Subdomains:** `dialogue` `relationships`
**Tags:** `elder` `names` `presentation`
**Roadmap:** `npc-professions-households-and-age.md`
**Model:** Composer, Sonnet

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
canonical first/full name
+ age/life stage
+ gender
+ personality/traits
+ player↔NPC relation level
→ contextual dialogue heading
```

V1 **nie zmienia** `NpcAgent.displayName`. Tytuł jest osobnym, derived presentation value liczonym przy otwarciu dialogu.

### 2. Only elders are candidates

Korzystać z istniejącego `lifeStageForAge()`.

Nie tworzyć kolejnego elder boolean/progu.

### 3. Context matters

Nie każdy senior dostaje ten sam prefiks.

V1 używa istniejącego `QuestManager.getRelationLevel(npc.id)` oraz istniejących danych `gender`, `personality` i `traits`.

Reguła ma być mała i deterministyczna:

1. non-elder → canonical `displayName`,
2. `stranger | acquainted` → formalne `Pan/Pani`,
3. `friendly | trusted`:
   - wysoka ugodowość i/lub `sociable` → `Dziadek/Babcia`,
   - niska ugodowość / wyraźnie szorstki profil → `Stary/Stara`,
   - fallback → `Pan/Pani`.

Format V1:

- `Pan/Pani` + canonical full `displayName`,
- `Dziadek/Babcia` + first `name`,
- `Stary/Stara` + first `name`.

Nie używać weighted random ani nowego personality taxonomy.

### 4. One resolver, narrow V1 consumer

Dodać jeden mały pure resolver, preferencyjnie `src/ai/npcSocialTitle.ts`.

Resolver przyjmuje jawnie co najmniej:

- first `name`,
- canonical `displayName`,
- `age`,
- `gender`,
- `personality`,
- `traits`,
- player↔NPC `RelationLevel`.

V1 consumerem jest **wyłącznie nagłówek `NpcDialogueMenu.vue`**.

Nie zmieniać:

- CSS2D/status label NPC,
- Villagers screen,
- inspector/debug labels,
- `aboutSelfLine(...)`,
- authored quest strings.

Dzięki temu relation-aware presentation nie wymaga reaktywnego przepinania globalnych labeli.

### 5. Deterministic and state-derived

Bez `Math.random()` przy renderowaniu.

Ta sama osoba i ten sam kontekst dają ten sam title.

### 6. Quest safety

Quest system coraz bardziej wiąże NPC przez `NpcId`; mimo to plan musi przetestować wszystkie miejsca, gdzie display name pojawia się w authored text/markers.

Lost Treasure Chronicles Kazimierz zachowuje canonical authored identity. Tytuł może być pokazany tylko przez wspólną presentation warstwę tam, gdzie jest to bezpieczne; nie przepisywać authored quest strings mechanicznie.

## Scope

### In scope

- pure derived elder-title resolver,
- mały polski zestaw `Pan/Pani`, `Dziadek/Babcia`, `Stary/Stara`,
- gender/personality/trait/relation-aware selection,
- presentation-only `npcHeading` (lub równoważne pole) w stanie dialogu,
- integracja wyłącznie z nagłówkiem `NpcDialogueMenu.vue`,
- recompute przy każdym `openNpcDialogueMenu()`,
- deterministic tests i quest-identity regression checks.

### Out of scope

- nicknames for all NPCs,
- noble titles,
- profession titles,
- renaming NPCs,
- persistence,
- genealogy-driven `grandfather of X`,
- changes to quest identity/bindings,
- localization framework rewrite,
- zmiana `NpcAgent.displayName`,
- CSS2D/world name labels,
- Villagers screen,
- authored quest/dialogue text.

## Integration points

- `src/ai/npcSocialTitle.ts` — nowy pure resolver (nazwa pliku może być równoważna),
- `src/settlement/npcPhysicalProfile.ts::lifeStageForAge()` — jedyne źródło elder classification,
- `src/ai/dialogue.ts::BigFivePersonality` — personality source,
- `src/ai/NpcAgent.ts` — tylko odczyt istniejących `name/displayName/age/gender/personality/traits/id`; **bez zmiany displayName**,
- `src/quests/QuestManager.ts::getRelationLevel()` — player↔NPC familiarity,
- `src/ui-vue/store.ts::openNpcDialogueMenu()` — composition point i wyliczenie heading,
- `src/ui-vue/NpcDialogueMenu.vue` — jedyny V1 consumer.

Important public resolver powinien mieć JSDoc i `@domain npc`.

## Tests

At least:

- non-elder keeps canonical display without elder prefix,
- elder title is deterministic,
- different personality/context may select different permitted titles,
- resolver never mutates canonical name,
- quest matching remains by `NpcId`,
- authored Lost Treasure quest still resolves Kazimierz correctly,
- ponowne otwarcie dialogu po zmianie relation recomputuje heading,
- repeated open/render nie duplikuje prefiksu,
- `NpcAgent.displayName` i CSS2D label pozostają canonical.

## Verification

Automated:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Manual/browser verification by User:

- otwórz dialog z kilkoma elderami o różnych personality/relation,
- potwierdź `Pan/Pani` dla obcych/znajomych i kontekstowe familiar/rough warianty dla bliższych relacji,
- potwierdź, że non-elders są bez zmian,
- potwierdź, że world/CSS2D labels i Villagers nadal pokazują canonical full name,
- potwierdź, że ponowne otwieranie dialogu nie stackuje prefiksu,
- verify Lost Treasure Chronicles naming/story remains intact.

## Success criteria

```text
non-elder dialogue
→ canonical displayName

elder dialogue
→ contextual title derived from existing state

quest/materialization/world labels
→ canonical identity/presentation unchanged

Kazimierz
→ ordinary generic resolver input
→ no production special-case
```

> **Zrób git commit i push do main, rebase jeżeli trzeba**
