# Plan: External resolution and real problem offering

**Created:** 2026-09-13
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** M
**Model:** Composer, Grok
**Depends on:** quests-progression-028
**Domain:** `quests-progression`
**Subdomains:** `quests`
**Tags:** `world-driven` `emergent-quests` `fauna`
**Roadmap:** `quests-and-reputation.md`

## Goal

Quest world-driven ma **odzwierciedlać** stan problemu, a nie karać gracza za to, że świat (fauna, NPC, czas) rozwiązał problem bez niego, ani **tworzyć** problemu (stray), żeby errand istniał.

## Why

`QuestManager.pollWorldDrivenSources` przy `status === 'resolved'` na aktywnym queście bierze `uniqueOutcomeForState(def, 'failed')`. Wygenerowany wolf-den ma już osobne id `resolved_without_player`, ale ścieżka i tak wpycha „jedyne failed”.

`createApp.syncLostLivestockQuests` woła `animal.startLivestockStray()` gdy quest jest `offered`/`active`. Fauna-025 uczyniła stray episode własnością fauny; quest wciąż może go wymusić.

Lost-livestock **już** mapuje snapshoty świata na konkretne outcome ids (`live_return`, `dead_confirmed`, `unavailable`) — to wzorzec do powielenia, nie nowy silnik.

Recon: `docs/reviews/2026-09-13--quest-system-architecture-recon.md` (P3, P4, Stage C).

## Non-goals

- NPC jako pełny quest participant / companion FSM.
- Opportunity factory w runtime (`registerDef`).
- Przepisanie authored `zagubiona-owca` (`find_animal`) — osobny content cleanup.
- Nowe typy problemów (repair, shortage) — osobno, po tym planie.

## Current code

- `QuestManager.pollWorldDrivenSources`, `pollLostLivestockSources`.
- `materializeWolfDenPressureQuest` — outcomes `den_destroyed` + `resolved_without_player` (`failed`).
- `createApp.ts` `syncLostLivestockQuests`.
- `collectLostLivestockOpportunities` — preferuje aktywny stray.
- `isWolfDenPressureProblem` / `isWolfDenPermanentlyDestroyed` w `src/fauna/wolfDenScenario.ts`.

## Approach

1. **Nie** używać `uniqueOutcomeForState(..., 'failed')` dla source `resolved`. Dodać jawną konwencję na defie albo mapowanie w materializerze: np. outcome id `resolved_without_player` jeśli istnieje, w przeciwnym razie obecne failed.
2. Jeśli aktywny quest **już** posunął `destroy_spawn_point` / analogiczny objective (gracz zniszczył siedlisko), `pollDestroySpawnPointObjectives` ma wygrać z „external failed”. Kolejność polli w `createApp` już niszczy spawn **przed** `pollWorldDrivenSources` — utrzymać i pokryć testem.
3. Usunąć `startLivestockStray` ze ścieżki questa. Offer/active tylko przy snapshotcie `lost-alive` | `corpse-uninspected` (już w `meetsAvailability` / poll). Naturalny `returned` nadal `live_return`.
4. Authored wysokość nagrody za `resolved_without_player` ma być mniejsza niż za `den_destroyed` (już brak itemów — zostawić; nie dodawać hero reward).
5. Dokument: quest nie aktywuje wilczej presji (`shouldActivateWolfDenProblem` zostaje w faunie).

## Persistence

Bez nowej wersji save, o ile outcome ids się nie zmieniają. Istniejące save'y z `failed` + `resolved_without_player` zostają. Nie re-resolve.

Jeśli kiedykolwiek zmienimy `resolved_without_player` z `failed` na `complete`, to **jest** zmiana semantyki i wymaga świadomej decyzji + ewentualnej migracji. Domyślnie **zostawić `failed`** (gracz nie wykonał zadania) ale z result textem, że świat sobie poradził — recon dopuszcza też `complete` z mniejszym social; wybrać jedno w implementacji i trzymać w tesie. Rekomendacja reconu: **zostaw `failed` bez pełnej nagrody**, nie udawaj sukcesu gracza.

## Verification

- Wolf den: gracz niszczy → `den_destroyed` / ready_to_report jak dziś.
- Aktywny quest, den znika bez `destroy_spawn_point` playera → `resolved_without_player`, bez item reward.
- Offer niezaakceptowany, source gone → `not_offered`.
- Lost livestock: brak `startLivestockStray` z questa; fauna-025 natural stray + quest complete `live_return` bez prowadzenia zwierzęcia.
- Save/load w trakcie stray bez questa-forcującego episode.

## Risks

- Gracze z aktywnym generated den-questem zobaczą fail, gdy presja spadnie z innej przyczyny — to jest zamierzone.
- Authored `zagubiona-owca` nadal binduje owcę resolverem — poza zakresem.
