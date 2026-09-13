# Plan: Nonlinear stage objectives and transitions

**Created:** 2026-09-13
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** high · **Effort:** M
**Model:** Sonnet, Composer
**Depends on:** none
**Domain:** `quests-progression`
**Subdomains:** `quests`
**Tags:** `branching` `objectives` `transitions`
**Roadmap:** `quests-and-reputation.md`

## Implementation status

Implemented 2026-09-13. Automated tests cover legacy single-objective lifecycle (including `stageCount` save/restore), `any`/`all` completion, result-based forward stage/outcome transitions, per-slot save/load, independent counted/animal slots, validation and authored NPC slot materialization. Browser/gameplay verification remains user-owned.

## Goal

Rozszerzyć obecny liniowy `QuestStage[]` o mały, deterministyczny mechanizm nieliniowego flow. Stage ma móc mieć kilka objectives z semantyką `all` albo `any`, a wynik etapu może kierować do innego stage albo terminalnego outcome.

Istniejące questy z jednym `objective` i liniowym przejściem muszą działać bez migracji treści.

## Why

Obecny runtime ma dokładnie jedno `QuestObjective` na `QuestStage`, a `QuestManager.advanceStage()` przesuwa quest liniowo po `stageIndex`. To wymusza kodowanie rozwiązania problemu jako jednej ścieżki albo osobnych questów.

Seedvale potrzebuje prostego sposobu na opisanie problemu, który może zostać rozwiązany kilkoma poprawnymi metodami, bez budowy osobnego graph engine.

## Design

Minimalny model:

- stage może zachować obecne pojedyncze `objective` jako kompatybilny sugar albo być znormalizowany do listy objectives;
- stage z wieloma objectives deklaruje `mode: 'all' | 'any'`;
- zakończenie objective może zwrócić jawny stage result/resolution id, gdy jest potrzebny do branchingu;
- stage może mieć deklaratywne transitions z result/resolution do konkretnego kolejnego stage albo `QuestOutcome`;
- brak transition zachowuje obecne liniowe zachowanie;
- transitions są walidowane przy `validateQuestDefinitions()`.

Nie tworzyć ogólnego condition DSL. `QuestManager` pozostaje właścicielem progressu i resolution.

## Scope

1. Rozszerzyć `QuestStage` w `src/quests/quests.ts` o multi-objective stage z `all` / `any`.
2. Uogólnić objective matching/evaluation tak, aby event/poll mógł sprawdzać wszystkie aktywne objective slots aktualnego stage.
3. Rozszerzyć `QuestManager.advanceStage()` o:
   - kompatybilność z obecnym single-objective flow,
   - `any` kończące stage po pierwszym spełnionym objective,
   - `all` kończące stage po spełnieniu wszystkich wymaganych objectives,
   - transition do wskazanego stage albo terminalnego outcome.
4. Zachować exact-once outcome/reward/consequence semantics.
5. Rozszerzyć `validateQuestDefinitions()` o walidację objective sets, result ids i transitions.
6. Dodać JSDoc do nowych publicznych/architektonicznych typów i helperów; użyć `@domain quests-progression` tam, gdzie pomaga preflight discovery.

## Non-goals

- pełny quest graph/node engine;
- skryptowy DSL/Lua;
- optional/bonus objectives;
- deadlines/timeouts;
- runtime-generated quest definitions;
- zmiany w opportunity generation (`028`-`031`);
- Quest Log redesign (`ui-input-017`);
- przepisywanie istniejących questów tylko po to, aby korzystały z nowego modelu.

## Current code to reuse

- `src/quests/quests.ts`: `QuestStage`, `QuestObjective`, `QuestOutcome`, `QuestProgressEntry`, `validateQuestDefinitions()`;
- `src/quests/QuestManager.ts`: `advanceStage()`, objective ingress/polls, terminal resolution, `stageCount`;
- istniejące `talk_to_npc_choice` pokazuje już named resolution prowadzące do konkretnego outcome bez osobnego dialogue engine;
- persistence zapisuje quest progress, nie kopię domenowego world state — tę granicę zachować.

## Persistence

Dla stage `all` zapisać tylko minimalny stage-local progress potrzebny dla objectives, których completion nie da się bezpiecznie odtworzyć z authoritative world state.

Brak nowego pola w starym save ma oznaczać pusty progress aktualnego stage. Nie zmieniać semantyki `resolvedOutcomeId` i nie replayować terminal effects po restore.

## Verification

- wszystkie istniejące single-objective questy zachowują obecny lifecycle;
- `any`: dwa alternatywne objectives, wykonanie jednego kończy stage, późniejsze zdarzenie dla drugiego jest no-opem;
- `all`: objectives mogą być wykonane w dowolnej kolejności, stage kończy się dopiero po ostatnim;
- różne result ids mogą prowadzić do różnych stage;
- transition może zakończyć quest konkretnym istniejącym outcome;
- invalid stage/outcome references są odrzucane przez validation;
- save/load zachowuje częściowy progress `all` bez replay reward/effect;
- `ready_to_report` i hand-in semantics pozostają spójne z obecnym modelem.

## Risks

- Nie przekształcać tego w ogólny graph engine; to ma być rozszerzenie obecnego `QuestStage`.
- Wiele miejsc ingress zakłada jeden current objective; zamiast wyjątków per event potrzebny jest jeden wspólny sposób iterowania aktywnych objective slots.
- Nie każdy world-state objective wymaga persisted completion bitu; implementacja ma rozróżnić event-based progress od stanu odtwarzalnego z domeny.

> **Zrób git commit i push do main, rebase jeżeli trzeba**