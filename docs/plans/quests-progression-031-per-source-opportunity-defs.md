# Plan: Per-source opportunity defs and live gating

**Created:** 2026-09-13
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** quests-progression-030
**Domain:** `quests-progression`
**Type:** `feature`
**Roadmap:** `quests-and-reputation.md`

## Goal

World-driven opportunities mają działać dla każdej stabilnej tożsamości źródła, której stan może zmienić się w trakcie sesji, bez restartu gry i bez nowego `QuestFactory`.

Plan dotyczy world-driven recurrence / live opportunities. Nie ogranicza authored questów opisanych w `docs/vision/quests.md`: authored content może istnieć niezależnie od symulacji albo świadomie zainicjować pierwszy realny incydent domenowy. Późniejsze world-driven wystąpienia tego samego typu problemu mają korzystać z live source state.

## Why

`QuestManager` bierze `readonly QuestDef[]` przy konstrukcji. Wolf-den działa mid-session, bo def dla stabilnego źródła istnieje od początku, a `WorldQuestSourceLookup` tylko przełącza jego dostępność zgodnie z żywym stanem problemu.

Lost-livestock materializuje obecnie jednego kandydata na osadę. Jeżeli inne zwierzę stanie się stray później w tej samej sesji, nie musi mieć odpowiadającego `QuestDef`, więc problem może nie stać się opportunity aż do rebuild/reload.

To jest luka w obsłudze world-driven opportunities, nie argument przeciw authored first occurrence.

## Design rules

- Authored quest może mieć własną zaprojektowaną dostępność i może świadomie zainicjować sytuację potrzebną narracji, jeśli używa właściwego systemu domenowego.
- World-driven opportunity musi wynikać z aktualnego snapshotu/faktu świata i nie może sama tworzyć problemu tylko po to, żeby stać się dostępna.
- Jeżeli źródło ma skończony, stabilny zbiór identities możliwych do poznania przy boot/rebuild, preferuj pre-materialized def per source + live gating.
- Nie zakładać, że wszystkie przyszłe dynamiczne opportunities da się obsłużyć w ten sposób. Źródła powstające naprawdę dynamicznie w runtime mogą wymagać osobnego mechanizmu później.

## Non-goals

- `QuestManager.registerDef()` / ogólny runtime `QuestFactory`.
- Zmuszanie authored questów do czekania na naturalną symulację.
- Zmiana zasady first occurrence authored / recurrence world-driven.
- Nieskończone generowanie RPG matrix quests.
- Repair/shortage collectors.
- Player-built lub inne runtime-created sources, których identities nie istnieją przy boot/rebuild.
- Multiplayer actor ids.
- Redesign Quest Log UI — osobny plan.

## Current code

- `collectWolfDenPressureOpportunities` — zawsze emituje znane den identity, a availability zależy od live source state.
- `collectLostLivestockOpportunities` — wybiera obecnie jeden livestock candidate.
- `selectSettlementQuestOpportunities` — persisted ids są zachowywane; world-driven opportunities nie powinny podlegać temu samemu limitowi co RPG matrices.
- `lostLivestockQuestId(settlementId, animalId)` — stabilne deterministyczne id już istnieje.
- `QuestManager.meetsAvailability` + `lostLivestockSource.getSnapshot` — istniejący live gating.
- Plan `quests-progression-030` rozdziela authored first occurrence od world-driven recurrence.

## Approach

1. Materializować opportunity/def per persistent household livestock `animalId`, zamiast jednego losowego kandydata na osadę.
2. Dla generated `world:lost-livestock:*` availability ma zależeć wyłącznie od live snapshotu problemu, np. `lost-alive` / `corpse-uninspected`.
3. Nie zmieniać authored `zagubiona-owca` w world-driven quest. Authored i generated flow mogą współistnieć.
4. Jeżeli authored first occurrence już zainicjował stray dla konkretnego zwierzęcia, generated recurrence nie powinien tworzyć równoległego opportunity dla tego samego aktywnego epizodu.
5. Quest log ma nadal ukrywać `not_offered`, gdy source nie jest aktualnie dostępny. Duża liczba pre-materialized defs nie może oznaczać dużej liczby widocznych pustych wpisów.
6. Nie ruszać capu RPG. World-driven per-source defs nie powinny być traktowane jak authored/random matrix slots.
7. Jeśli test pokaże niepożądane wpisy w `QuestManager.list()`, naprawić live gating / visibility zamiast redukować liczbę source defs.
8. Nie dodawać ogólnego runtime factory. Jeśli później pojawi się konkretny przypadek truly dynamic source identity, zrobić osobny plan oparty na realnym consumerze.

## Persistence

Definicje pozostają deterministycznie odbudowywane. Progress zapisuje stabilny quest id tak jak dziś.

Generated per-source id ma wynikać z world identity, np. `world:lost-livestock:${settlementId}:${animalId}`. Save/load musi odbudować ten sam def niezależnie od tego, czy source jest w danym momencie aktywnym problemem.

Nie dodawać quest-local flag opisujących stan źródła. Stan stray/corpse/returned pozostaje własnością fauny.

## Verification

- Dwa lub więcej livestock w jednym gospodarstwie: każde ma stabilny potential def, ale widoczne jest tylko zwierzę z aktywnym compatible world-driven problemem.
- Naturalny stray zaczynający się mid-session na wcześniej spokojnym zwierzęciu powoduje pojawienie się opportunity bez restartu/reloadu.
- Generated opportunity nigdy samo nie uruchamia `startLivestockStray()`.
- Authored first-occurrence flow nadal może zagwarantować swój incydent zgodnie z planem 030 i `docs/vision/quests.md`.
- Authored i generated flow nie pokazują dwóch questów dla tego samego aktywnego stray episode.
- Save z aktywnym `world:lost-livestock:...` odbudowuje ten sam def i live state po restore.
- Brak regresji limitu RPG matrices.
- `not_offered` pre-materialized defs nie zaśmiecają Quest Log.

## Risks

- Większa tablica `defs` (dziesiątki, nie tysiące). `onInteract` iteruje defs; koszt należy zachować mierzalny.
- Bez deduplikacji authored/generated może pojawić się podwójny quest dotyczący tego samego incydentu.
- Ten plan rozwiązuje tylko źródła o znanych/stabilnych identities. Nie powinien zostać później traktowany jako pełne rozwiązanie dla dowolnych runtime-created quest sources.
- Marker `!` na giverze przy wielu jednoczesnych world-driven opportunities może zwiększyć szum — presentation/Quest Log handling należy rozwiązać w osobnym planie UI.
