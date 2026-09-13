# Plan: External resolution and authored/world-driven problem offering

**Created:** 2026-09-13
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** M
**Model:** Composer, Grok
**Depends on:** ~~quests-progression-028~~
**Domain:** `quests-progression`
**Subdomains:** `quests`
**Tags:** `world-driven` `emergent-quests` `fauna`
**Roadmap:** `quests-and-reputation.md`

## Goal

Rozróżnić dwa świadome tryby powstawania questów:

1. **Authored first occurrence** — pierwsze wystąpienie danego typu sytuacji może być celowo uruchomione przez narrację/quest, aby zagwarantować graczowi zaprojektowane doświadczenie i nie zmuszać go do czekania na losową symulację.
2. **World-driven recurrence** — kolejne wystąpienia tego samego typu sytuacji wynikają już z normalnej symulacji świata i quest tylko je wykrywa/obserwuje.

Przykład: pierwsza zagubiona owca może zgubić się dlatego, że uruchamia się authored quest. Następne przypadki zagubionego bydła/owiec powinny wynikać z fauny i dopiero wtedy generować world-driven opportunities.

Niezależnie od źródła inicjacji, **stan incydentu pozostaje własnością systemu domenowego**. Quest może poprosić faunę o rozpoczęcie authored stray episode, ale nie może utrzymywać własnej kopii „zagubionej owcy” ani symulować jej poza fauną.

Dodatkowo world-driven quest ma odzwierciedlać stan problemu i nie karać automatycznie gracza za to, że świat (fauna, NPC, czas) rozwiązał go bez niego.

## Design rule: first occurrence authored, recurrence world-driven

Ta zasada jest celowa i nadrzędna wobec prostego „quest nigdy nie tworzy problemu”. Seedvale ma być żyjącym światem, ale nadal grą z zaprojektowaną narracją i gwarantowanymi doświadczeniami.

```text
first occurrence
    authored quest / narrative hook
        ↓
    domain API starts a real world incident
        ↓
    quest binds to and observes that incident

later occurrences
    simulation starts the incident independently
        ↓
    opportunity layer detects it
        ↓
    generated/world-driven quest binds to it
```

Guardrails:

- authored trigger uruchamia **realny stan domenowy** przez istniejący API/seam (`fauna`, settlement itd.);
- po uruchomieniu incydent może rozwijać się i zakończyć niezależnie od questa;
- recurring/generated quest nie może wymuszać problemu tylko po to, żeby stworzyć sobie zadanie;
- authored trigger powinien być ograniczony do konkretnego pierwszego/narracyjnego wystąpienia, nie stać się ukrytym generatorem wszystkich kolejnych questów;
- jeśli authored i world-driven wariant dotyczą tego samego typu problemu, powinny docelowo używać tych samych snapshotów, outcome mappingów i domenowego ownershipu.

## Why

`QuestManager.pollWorldDrivenSources` przy `status === 'resolved'` na aktywnym queście bierze `uniqueOutcomeForState(def, 'failed')`. Wygenerowany wolf-den ma już osobne id `resolved_without_player`, ale ścieżka i tak wpycha „jedyne failed”.

`createApp.syncLostLivestockQuests` woła `animal.startLivestockStray()` gdy quest jest `offered`/`active`. Sam fakt uruchomienia stray przez quest **nie jest błędem**, jeśli jest to świadomy authored first occurrence. Problemem jest brak rozróżnienia między takim narracyjnym triggerem a generated/world-driven lost-livestock, który powinien istnieć tylko wtedy, gdy fauna sama ma realny stray episode.

Lost-livestock **już** mapuje snapshoty świata na konkretne outcome ids (`live_return`, `dead_confirmed`, `unavailable`) — to wzorzec do powielenia, nie nowy silnik.

Recon: `docs/reviews/2026-09-13--quest-system-architecture-recon.md` (P3, P4, Stage C; P4 należy czytać z zasadą authored first occurrence opisaną wyżej).

## Non-goals

- NPC jako pełny quest participant / companion FSM.
- Opportunity factory w runtime (`registerDef`).
- Usuwanie authored `zagubiona-owca` (`find_animal`) tylko dlatego, że istnieje generated lost-livestock.
- Wymuszanie, aby każdy authored quest czekał na losowe wystąpienie świata.
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
3. Rozdzielić livestock flow na authored first occurrence i world-driven recurrence:
   - authored `zagubiona-owca` może przez jawny narrative trigger poprosić `animal.startLivestockStray()` o rozpoczęcie realnego stray episode;
   - generated `world:lost-livestock:*` może być oferowany tylko dla stray/corpse istniejącego już z symulacji i **nie może** sam wywoływać `startLivestockStray()`;
   - jeżeli obecny `syncLostLivestockQuests()` nie potrafi rozróżnić tych źródeł, dodać minimalny jawny binding/flag/punkt wywołania po stronie authored flow zamiast inferować po samym stanie `offered`.
4. Authored wysokość nagrody za `resolved_without_player` ma być mniejsza niż za `den_destroyed` (już brak itemów — zostawić; nie dodawać hero reward).
5. Dokumentować per-content, czy dany problem ma **authored first occurrence**. Brak takiej deklaracji oznacza world-driven only.
6. Wilcza presja pozostaje world-driven (`shouldActivateWolfDenProblem` w faunie), chyba że osobny authored quest świadomie potrzebuje gwarantowanego pierwszego incydentu.

## Persistence

Bez nowej wersji save, o ile outcome ids się nie zmieniają i authored-first marker można oprzeć na istniejącym quest progress / outcome. Jeżeli potrzebny będzie osobny znacznik „first occurrence already seeded”, powinien być deterministycznie wyprowadzalny z ukończenia/uruchomienia authored questa albo zapisany w istniejącym ownerze świata — nie jako równoległy quest flag bez właściciela.

Istniejące save'y z `failed` + `resolved_without_player` zostają. Nie re-resolve.

Jeśli kiedykolwiek zmienimy `resolved_without_player` z `failed` na `complete`, to **jest** zmiana semantyki i wymaga świadomej decyzji + ewentualnej migracji. Domyślnie **zostawić `failed`** (gracz nie wykonał zadania) ale z result textem, że świat sobie poradził — można też świadomie authorować `complete` z mniejszym social; decyzja należy do konkretnego questa, nie do runtime.

## Verification

- Wolf den: gracz niszczy → `den_destroyed` / ready_to_report jak dziś.
- Aktywny quest, den znika bez `destroy_spawn_point` playera → `resolved_without_player`, bez item reward.
- Offer niezaakceptowany, source gone → `not_offered`.
- Authored `zagubiona-owca`: quest może zagwarantować pierwszy stray przez fauna-owned episode; dalszy przebieg/return/death pozostaje własnością fauny.
- Generated lost-livestock: brak stray → brak opportunity; naturalny późniejszy stray → opportunity bez rebootu po 031; generated quest nigdy nie uruchamia stray sam.
- Naturalny `returned` nadal mapuje się na `live_return` bez wymagania prowadzenia zwierzęcia.
- Save/load w trakcie authored i world-driven stray zachowuje poprawny domenowy stan i nie tworzy drugiego episode.

## Risks

- Bez jawnego rozróżnienia authored/world-driven łatwo ponownie podpiąć `startLivestockStray()` do każdego generated offer — test ma tego pilnować.
- Authored first occurrence może kolidować z naturalnym incydentem, który wydarzył się wcześniej. Implementacja powinna wykryć istniejący kompatybilny problem i wykorzystać go zamiast tworzyć duplikat.
- Gracze z aktywnym generated den-questem zobaczą authored outcome, gdy presja spadnie z innej przyczyny — to jest świadoma semantyka konkretnego questa.

> **Zrób git commit i push do main, rebase jeżeli trzeba**