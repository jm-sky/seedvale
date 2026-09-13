# Plan: Per-source opportunity defs and live gating

**Created:** 2026-09-13
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Model:** Composer, Grok
**Depends on:** quests-progression-030
**Domain:** `quests-progression`
**Subdomains:** `quests`
**Tags:** `world-driven` `emergent-quests` `dynamic-instances`
**Roadmap:** `quests-and-reputation.md`

## Goal

Szansa world-driven ma istnieć dla **każdej stabilnej tożsamości źródła** (np. każde household livestock), a oferowanie ma zależeć od **żywego** source snapshotu — bez `QuestFactory` i bez przebudowy `QuestManager` w środku sesji, o ile da się zmaterializować skończony zbiór defów przy composition root (wzorzec wolf-den).

## Why

`QuestManager` bierze `readonly QuestDef[]` przy konstrukcji. Wolf-den działa mid-session, bo def jest zawsze zbudowany, a `WorldQuestSourceLookup` odblokowuje offer gdy `pressure > 0`.

Lost-livestock materializuje **jednego** kandydata na osadę (`collectLostLivestockOpportunities`). Stray innego zwierzęcia w trakcie sesji nie ma defa, więc nie stanie się questem do reboot/save.

Recon: `docs/reviews/2026-09-13--quest-system-architecture-recon.md` (P5, Stage D).

## Non-goals

- `QuestManager.registerDef`.
- RPG matrix spawn w nieskończoność (limit 2 + unique matrix na osadę zostaje).
- Repair/shortage collectors (LOOSE-ENDS / settlements-npcs-017).
- Multiplayer actor ids.

## Current code

- `collectWolfDenPressureOpportunities` — zawsze emituje den id.
- `collectLostLivestockOpportunities` — jeden pick.
- `selectSettlementQuestOpportunities` — persisted ids zawsze; world-driven nie dropowane przez limit RPG.
- `lostLivestockQuestId(settlementId, animalId)` — już deterministyczne.
- `QuestManager.meetsAvailability` + `lostLivestockSource.getSnapshot`.

## Approach

1. Emitować opportunity/def **per** household livestock z persistent `animalId` (liczba zwierząt w osadzie jest mała).
2. `meetsAvailability` / offer: tylko gdy snapshot to `lost-alive` lub `corpse-uninspected` (po 030 quest nie startuje stray).
3. Quest log nadal ukrywa `not_offered` bez availability — bez spamu „zagubiona krowa” na spokojnym stadzie.
4. Nie ruszać capu RPG. World-driven per-animal nie przechodzi przez ten sam limit co macierze (już `take(..., ignoreLimit)` dla non-RPG).
5. Jeśli test wykaże zbyt wiele defów w `list()` przez bug availability — naprawić gating, nie kasować defów.
6. Nadal **nie** dodawać live factory. Player-built structures jako źródła = przyszły collector odświeżany przy boot/rebuild `WorldBundle` albo przy `listRepairProblems`; nie ten plan.

## Persistence

Nowe id w `quests.progress` pojawią się dopiero po ofercie/akceptacji. Rekonstrukcja defa z id (`parseLostLivestockQuestId`) już istnieje w `collectSettlementQuestOpportunities` dla persisted ids.

## Verification

- Dwie owce; tylko ta ze stray episode jest oferowalna.
- Mid-session natural stray (fauna-025) na drugiej owcy → jej quest staje się oferowalny **w tej samej sesji** (def był od bootu).
- Save z aktywnym `world:lost-livestock:…:animalB` odtwarza ten sam def.
- Brak regresji capu RPG (max jedna macierz danego typu / limit 2 na osadę).

## Risks

- Większa tablica `defs` (dziesiątki, nie tysiące). `onInteract` już iteruje wszystkie defy per NPC — mierzalne, ale przy home livestock OK.
- Marker `!` na farmerze gdy *którykolwiek* stray jest offerable — zamierzone; topics już obsługują wiele kontekstów.
