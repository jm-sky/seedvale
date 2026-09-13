# Plan: World-fact event fan-out

**Created:** 2026-09-13
**Status:** `planned` 📋
**Type:** fix
**Priority:** high · **Effort:** S
**Model:** Composer, Grok
**Depends on:** none
**Domain:** `quests-progression`
**Subdomains:** `quests`
**Tags:** `events` `parallel-quests`
**Roadmap:** `quests-and-reputation.md`

## Goal

Jedno zdarzenie świata (`animal_died`, `animal_found`, `interact_landmark`, `interact_well`, `wolf_den_cleared`, …) ma móc postąpić **0..N** aktywnych questów, tak jak już robią `onAnimalHarvested` / `onHabitatAnimalFed` / `onReadItem` / `poll*`.

## Why

`QuestManager.onInteractObjective` dziś znajduje pierwszy pasujący `QuestDef` w kolejności `defs`, woła `advanceStage` i **wraca**. Drugi aktywny quest z tym samym objective nie widzi faktu.

Dialog/markery już obsługują wiele questów na jednym NPC (quests-progression-018/020). Warstwa eventów interact/kill tego nie robi. To blokuje nakładające się cele (ten sam landmark, ten sam kill, ta sama studnia) zanim powstanie więcej treści.

Pełny recon: `docs/reviews/2026-09-13--quest-system-architecture-recon.md` (P1, Stage A).

## Non-goals

- Szyna eventów / pub-sub poza `QuestManager`.
- Nowe typy objective.
- Przepisanie `poll*` (już fan-out).
- Zmiana `hasSocialOutcomeClaim` na „pierwszy quest w defs” — ma pozostać „czy **jakikolwiek** aktywny kill-quest z social consequence trzyma to `animalId`”.
- UI quest-log redesign.

## Current code

- `QuestManager.onInteractObjective` (`src/quests/QuestManager.ts`) — first-match + return.
- Fan-out wzorzec: `onAnimalHarvested`, `onHabitatAnimalFed`, `onReadItem`.
- `objectiveMatchesRef` + `animalTargets`.
- Call sites: `src/interaction/resolveInteraction.ts`, `src/app/gameLoop.ts` (animal death / wolf den), `src/app/createApp.ts`.
- `hasSocialOutcomeClaim` — musi być wołany **przed** lethal hitem; czyta `animalTargets`, nie aktualny stage po advance.

## Approach

1. W `onInteractObjective` iterować **wszystkie** `active` defy.
2. Dla każdego matcha: `advanceStage` (lub `resolveFailedFind` dla śmierci `find_animal`).
3. Zwrócić jedną `QuestDialogOverride` prezentacyjną (pierwsza niepusta `progressLine` / fail line), nie przerywając pętli.
4. Dodać testy: dwa aktywne `interact_landmark` / `kill_target_animal` / `find_animal` na tym samym faktcie → oba się posuwają.
5. Test: dwa kill-questy na tym samym `animalId` — fan-out + `hasSocialOutcomeClaim` true jeśli którykolwiek ma social consequence.

Nie zmieniać sygnatury `ObjectiveRef`. Nie wprowadzać `notifyWorldFact` w tym planie, chyba że okaże się czystym aliasem bez nowych call sites.

## Persistence

Brak. Progress zapisuje się jak dziś (`stageIndex` / state).

## Verification

- `src/quests/QuestManager.test.ts` — nowe case'y fan-out + regresja istniejących first-quest testów (powinny dalej przechodzić, bo jeden quest nadal działa).
- `npx tsc --noEmit` na ruszonych plikach wystarczy; pełny `pnpm test` jeśli czas.

## Risks

- Toast/dialog pokaże jedną linię, gdy dwa questy się posuną — akceptowalne.
- Kolejność `defs` nadal decyduje, **która** linia wraca do UI, nie **czy** quest się posuwa.
