# Plan: Elder Knowledge and Teaching

**Created:** 2026-09-18
**Status:** `draft` 📝
**Type:** feature
**Priority:** medium · **Effort:** L
**Depends on:** settlements-npcs-045, ~~items-player-016~~
**Domain:** `quests-progression`
**Subdomains:** `progression` `relationships`
**Tags:** `elder` `skills` `knowledge` `books`
**Roadmap:** `npc-professions-households-and-age.md`

## Goal

Pozwolić starszym NPC przekazywać graczowi wiedzę wynikającą z ich doświadczenia, relacji i historii, wykorzystując istniejący player skill progression zamiast tworzyć elder-only progression.

Przykładowe obszary:

- pułapki,
- skradanie się,
- tropienie/hunting-related knowledge,
- łowienie,
- inne istniejące skille, jeśli mają sens dla konkretnego NPC.

## Existing seams

- `PlayerSkills` jest authoritative ownerem player skill progression.
- `src/items/books.ts::readBook()` już podnosi istniejący skill przez publiczny skill mutation path.
- Books nie mają osobnego persistent learning state; trwałym skutkiem jest PlayerSkills.
- NPC mają persisted `personalInventory`.
- quest/dialogue system ma stable `NpcId`, relation prerequisites i explicit dialogue actions.
- istniejące quest consequences/effects nie powinny zostać rozszerzone o one-off skill effect, dopóki teaching nie daje drugiego realnego call site.

## Design

### 1. Teaching is a generic knowledge source

Nie tworzyć:

```text
ElderSkillTree
ElderXP
TeacherProgress
```

Docelowy model:

```text
knowledge source
  ├─ book
  └─ NPC teaching
        ↓
shared player skill mutation
        ↓
PlayerSkills
```

Jeżeli implementacja wymaga wydzielenia shared helpera spod `readBook()`, wydzielić minimalny actor/source-neutral mutation contract.

### 2. Eligibility comes from real NPC context

NPC może uczyć tylko wiedzy, którą da się uzasadnić przez istniejące dane, np.:

- current profession,
- authored role/story,
- skill-related possessions/books,
- przyszłe profession history, jeśli taki system już istnieje do czasu implementacji.

Nie tworzyć fikcyjnego "past profession" state tylko na potrzeby tego planu.

Elder age jest preferowanym kontekstem feature'u, ale mechanizm teaching powinien być wystarczająco generic, aby później mógł zostać użyty także przez mistrza kowala, łowcę itp.

### 3. Relationship gate

Nauka nie jest automatycznym sklepem z perkami.

Wykorzystać istniejące player↔NPC relation levels/prerequisites. V1 powinno wymagać co najmniej sensownej relacji albo konkretnego authored condition.

Nie tworzyć drugiego trust meter.

### 4. One-shot / bounded learning

Teaching outcome musi być idempotentny.

Jeżeli skill jest już na lub ponad poziomie oferowanym przez nauczyciela, ponowne wykonanie nie może farmić XP bez końca.

Semantyka powinna przypominać książki: nauczyciel może podnieść skill do określonego minimum/target albo przyznać bounded XP przez publiczne PlayerSkills API, zależnie od najlepszego istniejącego kontraktu.

### 5. Books as possessions

Senior może posiadać książkę w `personalInventory`, jeżeli istniejący item/inventory model na to pozwala.

Nie każdy nauczyciel musi mieć książkę, a książka nie jest wymaganym tokenem dla teaching.

Możliwe późniejsze zachowania:

- podarowanie książki,
- sprzedaż,
- quest hand-in,
- pozostawienie po śmierci.

Ten plan nie powinien tworzyć osobnego elder book storage.

### 6. Dialogue integration

Teaching musi być explicit player action w dialogu, nie side effect samego otwarcia rozmowy.

Preferowany flow:

```text
talk to NPC
→ teaching topic/action visible if eligible
→ explicit player selection
→ revalidate relation + skill + teacher capability
→ apply one idempotent skill effect
→ response reflects actual outcome
```

### 7. Initial content slice

V1 powinien objąć małą liczbę istniejących skills, najlepiej 2–3, dla których obecny gameplay ma już realny consumer.

Priorytet kandydatów:

- traps,
- stealth,
- fishing/hunting-related skill, jeśli aktualny `SkillId` to wspiera.

Nie dodawać nowych `SkillId` tylko dlatego, że brzmią dobrze narracyjnie.

### 8. Protect authored story NPCs

Nie zmieniać Lost Treasure Chronicles bindings ani dialogów przez automatyczne wstrzyknięcie teaching topic, jeśli kolidowałoby to z authored quest context.

Kazimierz może później być nauczycielem tylko przez bezpieczny generic topic albo jawnie authored extension.

## Scope

### In scope

- shared NPC teaching capability,
- relation/skill gating,
- reuse PlayerSkills,
- 2–3 existing-skill teaching cases,
- optional existing book ownership integration,
- explicit dialogue action,
- idempotency,
- tests.

### Out of scope

- new skill taxonomy,
- new past-profession/history system,
- apprenticeship,
- profession XP,
- skill decay,
- generic AI-generated lessons,
- LLM dialogue,
- inheritance of knowledge,
- changes to Lost Treasure story.

## Likely integration points

- `src/items/books.ts`
- PlayerSkills module/public mutation API
- NPC dialogue/action surface
- relation lookup already used by quests/dialogue
- `NpcAuthoritativeState.personalInventory`
- current skill catalog/item catalog.

Implementation must first verify exact current `SkillId` set and avoid inventing unavailable skills.

Important shared helpers should get JSDoc/`@domain quests-progression` or the actual owning domain if extracted lower.

## Tests

At least:

- teaching uses PlayerSkills public mutation path,
- ineligible relation hides/rejects teaching,
- eligible relation enables teaching,
- repeated teaching cannot farm progression,
- already-known/high-enough skill produces no duplicate gain,
- teacher capability derives from real data,
- no temporary NPC role mutation,
- book reading behavior remains unchanged,
- save/load preserves learned result through existing PlayerSkills persistence,
- authored quest dialogue remains reachable.

## Verification

Automated:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Manual/browser verification by User:

- build relation with an eligible elder,
- learn one supported skill,
- confirm Character/skill UI reflects the real skill change,
- repeat dialogue and confirm no infinite progression,
- verify normal book learning still works.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
