# Plan: Elder Daily Life and Settlement Care

**Created:** 2026-09-18
**Status:** `draft` 📝
**Type:** feature
**Priority:** medium · **Effort:** L
**Depends on:** settlements-npcs-045, settlements-npcs-022, npc-011
**Domain:** `npc`
**Subdomains:** `behavior` `work` `lifecycle`
**Tags:** `elder` `fishing` `cemetery` `rats`
**Roadmap:** `npc-professions-households-and-age.md`

## Goal

Nadać starszym mieszkańcom wiarygodne, użyteczne życie codzienne bez osobnego elder AI:

- mniej ciężkiej pracy,
- okazjonalne łowienie ryb,
- opieka nad cmentarzem,
- sprzątanie osady przez zakopywanie zwłok szczurów,
- spokojne lokalne aktywności wykorzystujące istniejący decision/schedule pipeline.

## Core rule

```text
age/life stage
+ personality
+ role
+ local world state
+ schedule opportunity
→ ordinary NPC decision
→ reusable action
→ real world consequence
```

Nie tworzyć `ElderNpcAgent`, `ElderSchedule`, elder task manager ani drugiego action FSM.

## Existing seams to reuse

- `lifeStageForAge()` — elder eligibility.
- existing NPC schedule + decision + `NpcPlannedAction` pipeline.
- `settlements-npcs-022` — age-based work participation / heavy-work semantics.
- `src/ai/npcProfessionWork.ts::planFishingWork()` korzysta z:
  - realnego docka,
  - `world/fishing.ts::fishingSpotId()`,
  - `rollFishingCatch()`,
  - normalnego inventory/deposit path.
- `npc-011` implements NPC burial/grave action infrastructure for deceased NPCs.
- fauna owns animal corpses, including rats; player burial already exists through survival actions.
- local player `caretaker` badge explicitly excludes NPC/automatic corpse cleanup, więc NPC rat burial must not award player deed progress.

## Design

### 1. Elder eligibility

Senior activity candidates mają korzystać z istniejących `elderly | veryElderly` stages.

Wiek jedynie zwiększa/otwiera określone opportunities; nie zastępuje traits, needs, weather, threats ani role.

### 2. Heavy work stays owned by age-work participation

Nie implementować drugi raz ograniczeń ciężkiej pracy.

Jeżeli `settlements-npcs-022` dostarcza shared work eligibility/intensity semantics, ten plan je konsumuje.

Elder powinien nadal móc być Farmerem, Fisherem, Guardem itd.; lżejsze aktywności są alternatywami, nie emerytalnym replacement role.

### 3. Fishing as leisure, not fake profession

Elder bez `Role = fisher` może okazjonalnie łowić ryby, jeśli istnieje prawidłowy settlement fishing target.

Należy wydzielić/reuse minimalny shared fishing action primitive z obecnego Fisher flow, tak aby:

```text
Fisher profession work
          \
           → same deterministic fishing attempt
          /
elder leisure
```

Nie wolno tymczasowo zmieniać `role` na `fisher`.

Leisure catch może trafić do household przez normalny inventory/deposit path, jeśli semantyka obecnego działania na to pozwala.

### 4. Cemetery care

Jeżeli osada ma przypisany cmentarz, elder może dostać spokojną lokalną activity opportunity związaną z cmentarzem.

V1 powinien preferować realne istniejące world targets i widoczne działania, np.:

- podejście do cmentarza/grobu,
- krótki maintenance/visit action,
- ewentualne uporządkowanie problemu, jeżeli istnieje realny cleanup target.

Nie tworzyć abstrakcyjnego persisted `cemeteryCleanliness` tylko dla animacji.

### 5. Rat corpse cleanup is the real settlement-cleaning action

"Sprzątanie osady" w tym planie oznacza konkretnie:

```text
dead rat corpse inside/local to settlement
→ eligible elder notices bounded local cleanup opportunity
→ claims/targets corpse safely
→ walks to corpse
→ buries/removes corpse using shared animal-corpse burial semantics
→ corpse is genuinely resolved
```

Nie implementować kosmetycznego zamiatania jako substytutu.

Nie skanować całego świata co NPC tick. Candidate lookup musi być bounded do lokalnej osady i istniejącego fauna/corpse query seam.

### 6. Reuse burial semantics, do not conflate human graves

Rat burial nie powinien tworzyć ludzkiego `NpcGrave` ani używać deceased-`NpcId` lifecycle z `npc-011`.

Należy współdzielić najniższy sensowny primitive animal corpse burial/removal z player action, zachowując fauna jako ownera animal corpse state.

NPC cleanup:

- nie wymaga player shovel interaction,
- nie przyznaje player badge `caretaker`,
- nie przyznaje player reputation,
- nie tworzy quest progress bez jawnego późniejszego call site.

### 7. Personality influences preference, not eligibility truth

Personality może wpływać na wagę activity:

- bardziej conscientious/orderly → częstszy cleanup/cemetery care,
- bardziej open/calm → fishing/leisure,
- sociable → mniej samotnych aktywności, jeśli istnieją konkurencyjne social opportunities.

Nie hardkodować tytułów typu "Stary" na podstawie tych samych wartości; presentation jest osobnym planem.

### 8. Priority and interruption

Needs, threat response, combat/flee, weather shelter i inne krytyczne pressures nadal wygrywają.

Elder activity musi korzystać z normalnego interrupt/cancel lifecycle.

## Scope

### In scope

- elder activity opportunity selection,
- fishing leisure reuse,
- cemetery visit/care slice,
- dead-rat cleanup through real corpse resolution,
- personality weighting,
- bounded lookup,
- tests and diagnostics.

### Out of scope

- teaching skills,
- books,
- titles/nicknames,
- generic litter/cleanliness simulation,
- funerals,
- graveyard profession,
- off-screen detailed walking simulation,
- changes to Kazimierz/Lost Treasure quest logic.

## Kazimierz guardrail

Lost Treasure Chronicles authored elder may naturally execute generic elder activities only if ordinary NPC integration reaches him safely.

Do not special-case him and do not change:

- authored family,
- story role,
- quest bindings,
- identity,
- schedule contract required by story content.

Story correctness wins over adding an ambient elder activity.

## Likely integration points

- `src/ai/NpcAgent.ts`
- `src/ai/npcDecision.ts`
- `src/ai/npcProfessionWork.ts`
- `src/world/fishing.ts`
- fauna corpse query/removal/burial seams discovered during implementation
- cemetery lookup already exposed by world/terrain integration
- existing NPC trace/debug.

Important new shared helpers should get JSDoc/`@domain npc`.

## Tests

At least:

- ordinary adult does not receive elder-only opportunity solely from role,
- elderly/veryElderly can receive activity,
- need/threat interrupts activity,
- non-Fisher elder can fish without role mutation,
- fishing uses same deterministic catch primitive,
- dead rat is actually resolved by cleanup,
- cleanup cannot remove a live rat,
- two NPCs cannot both resolve the same corpse,
- NPC rat burial does not award player caretaker progress,
- human NPC grave lifecycle remains unchanged,
- no global corpse scan is added,
- Lost Treasure elder tests remain green.

## Verification

Automated:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Manual/browser verification by User:

- observe an elder fishing,
- observe an elder visit/care for cemetery when applicable,
- leave dead rat(s) in settlement and observe a senior eventually bury/clean one,
- confirm player badge/reputation does not increase from NPC cleanup,
- confirm urgent needs/threats interrupt these activities.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
