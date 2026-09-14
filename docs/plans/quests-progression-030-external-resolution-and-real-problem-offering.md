# Plan: External resolution and authored/world-driven problem offering

**Created:** 2026-09-13
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** high · **Effort:** M
**Model:** Composer, Grok
**Depends on:** ~~quests-progression-028~~, ~~quests-progression-029~~
**Domain:** `quests-progression`
**Subdomains:** `quests`
**Tags:** `world-driven` `emergent-quests` `fauna`
**Roadmap:** `quests-and-reputation.md`

## Goal

Rozróżnić dwa świadome tryby powstawania questów:

1. **Authored narrative incident** — authored quest może celowo uruchomić sytuację w świecie, jeśli jest ona częścią zaprojektowanej narracji. Przykładowo quest „zagubiona owca” może spowodować, że konkretna owca rzeczywiście się zgubi. Gracz nie musi czekać, aż symulacja losowo stworzy warunki wymagane przez authored content.
2. **World-driven recurrence** — kolejne / emergent wystąpienia tego samego typu sytuacji wynikają z normalnej symulacji świata i quest tylko je wykrywa/obserwuje.

Nie obowiązuje zasada „quest nigdy nie może stworzyć problemu”. **Authored narrative quest może wywołać efekt w świecie**, jeśli ten efekt jest częścią jego treści. Musi jednak zrobić to przez system, który posiada dany stan. Quest „zagubiona owca” nie ustawia więc własnego flagu `lost`; prosi faunę o rozpoczęcie prawdziwego stray episode konkretnego zwierzęcia.

Niezależnie od źródła inicjacji, **stan incydentu pozostaje własnością systemu domenowego**. Po uruchomieniu może rozwijać się, zmienić lub zakończyć niezależnie od questa.

Dodatkowo world-driven quest ma odzwierciedlać stan problemu i nie karać automatycznie gracza za to, że świat (fauna, NPC, czas) rozwiązał go bez niego.

## Design rule: authored narrative may cause real world events

Ta zasada jest celowa. Seedvale ma być żyjącym światem, ale nadal grą zawierającą authored narrative content i gwarantowane zaprojektowane doświadczenia.

```text
authored narrative quest
    ↓
explicit authored trigger
    ↓
domain API starts/changes a real world incident
    ↓
quest binds to and observes that incident

world-driven recurrence
    simulation starts the incident independently
        ↓
    opportunity layer detects it
        ↓
    generated/world-driven quest binds to it
```

Guardrails:

- authored quest może uruchomić **realny stan domenowy** przez istniejący API/seam (`fauna`, settlement itd.), jeśli wymaga tego narracja;
- trigger jest jawną częścią authored content, a nie ukrytym efektem każdego generic offer;
- po uruchomieniu incydent może rozwijać się i zakończyć niezależnie od questa;
- recurring/generated quest nie może wymuszać problemu tylko po to, żeby stworzyć sobie zadanie;
- jeżeli kompatybilny realny incydent już istnieje, authored flow powinien go wykorzystać zamiast tworzyć duplikat;
- jeśli authored i world-driven wariant dotyczą tego samego typu problemu, powinny używać tych samych snapshotów, outcome mappingów i domenowego ownershipu.

## Why

`QuestManager.pollWorldDrivenSources` przy `status === 'resolved'` na aktywnym queście bierze `uniqueOutcomeForState(def, 'failed')`. Wygenerowany wolf-den ma już osobne id `resolved_without_player`, ale ścieżka i tak wpycha „jedyne failed”.

`createApp.syncLostLivestockQuests` woła `animal.startLivestockStray()` gdy generated quest jest `offered`/`active`. Problemem nie jest sam fakt, że quest może uruchomić stray. Problemem jest to, że **generated/world-driven offer robi to bez authored intent**. Taki trigger powinien należeć wyłącznie do jawnego authored flow.

Lost-livestock **już** mapuje snapshoty świata na konkretne outcome ids (`live_return`, `dead_confirmed`, `unavailable`) — to wzorzec do powielenia, nie nowy silnik.

Recon: `docs/reviews/2026-09-13--quest-system-architecture-recon.md` (P3, P4, Stage C; P4 należy czytać z zasadą authored trigger opisaną wyżej).

## Non-goals

- NPC jako pełny quest participant / companion FSM.
- Opportunity factory w runtime (`registerDef`).
- Usuwanie authored `zagubiona-owca` (`find_animal`) tylko dlatego, że istnieje generated lost-livestock.
- Wymuszanie, aby authored quest czekał na losowe wystąpienie świata zamiast świadomie uruchomić wymagany incydent.
- Zakaz quest-driven world effects — authored questy mogą je wywoływać przez właściwy system domenowy.
- Nowe typy problemów (repair, shortage) — osobno, po tym planie.

## Current code

- `QuestManager.pollWorldDrivenSources`, `pollLostLivestockSources`.
- `materializeWolfDenPressureQuest` — outcomes `den_destroyed` + `resolved_without_player` (`failed`).
- `createApp.ts` `syncLostLivestockQuests`.
- `collectLostLivestockOpportunities` — preferuje aktywny stray.
- `isWolfDenPressureProblem` / `isWolfDenPermanentlyDestroyed` w `src/fauna/wolfDenScenario.ts`.
- Plan `quests-progression-029` centralizuje terminal effects / exact-once resolution; ten plan ma używać tego samego terminal path, nie tworzyć osobnego external-resolution pipeline.

## Approach

1. **Nie** używać `uniqueOutcomeForState(..., 'failed')` jako semantyki source `resolved`. Dodać jawną konwencję na defie albo mapowanie w materializerze: np. outcome id `resolved_without_player` jeśli istnieje, w przeciwnym razie obecne failed. Sam outcome nadal przechodzi przez ten sam `applyOutcome` / terminal path z planu `quests-progression-029`.
2. Jeśli aktywny quest **już** posunął `destroy_spawn_point` / analogiczny objective (gracz zniszczył siedlisko), `pollDestroySpawnPointObjectives` ma wygrać z „external failed”. Kolejność polli w `createApp` już niszczy spawn **przed** `pollWorldDrivenSources` — utrzymać i pokryć testem.
3. Rozdzielić livestock flow na authored narrative trigger i world-driven recurrence:
   - authored `zagubiona-owca` ma prawo przez jawny narrative trigger poprosić `animal.startLivestockStray()` o rozpoczęcie realnego stray episode konkretnego targetu;
   - jeśli target już ma kompatybilny stray episode, wykorzystać go zamiast zaczynać drugi;
   - generated `world:lost-livestock:*` może być oferowany tylko dla stray/corpse istniejącego już z symulacji i **nie może** sam wywoływać `startLivestockStray()`;
   - usunąć `startLivestockStray()` z generic/generated `syncLostLivestockQuests()` i przenieść/pozostawić trigger w jawnym authored flow;
   - nie inferować prawa do uruchomienia incydentu z samego stanu `offered`/`active`; authored intent ma wynikać z konkretnego authored bindingu/call-site.
4. Zamknąć przejściową lukę przed planem `031`: materializowany generated lost-livestock dla spokojnego/returned/unavailable zwierzęcia musi zwracać jawny **non-offerable snapshot/status**, a nie `untracked`. `untracked` pozostaje znaczeniem „ten lookup nie dotyczy tego questa”, nie „zwierzę jest spokojne”. Dzięki temu po usunięciu generic `startLivestockStray()` nie pojawi się quest o zwierzęciu, które wcale nie jest zagubione.
5. Authored wysokość nagrody za `resolved_without_player` ma być mniejsza niż za `den_destroyed` (już brak itemów — zostawić; nie dodawać hero reward).
6. Dokumentować per authored content, jaki realny world effect może on świadomie uruchomić. Brak takiego authored triggera oznacza obserwowanie istniejącego stanu świata.
7. Wilcza presja pozostaje world-driven (`shouldActivateWolfDenProblem` w faunie), chyba że konkretny authored quest świadomie potrzebuje gwarantowanego incydentu.

## Persistence

Bez nowej wersji save, o ile outcome ids się nie zmieniają i authored trigger jest powiązany z istniejącym quest progress / domenowym episode.

Nie dodawać równoległego quest-local flagu opisującego „owca jest zagubiona”. Stan stray/corpse/returned pozostaje własnością fauny. Jeżeli trzeba zapobiec ponownemu odpaleniu authored triggera po restore, użyć istniejącego lifecycle/progress questa lub trwałej tożsamości domenowego episode, zamiast tworzyć drugą kopię stanu problemu.

Istniejące save'y z `failed` + `resolved_without_player` zostają. Nie re-resolve.

Jeśli kiedykolwiek zmienimy `resolved_without_player` z `failed` na `complete`, to **jest** zmiana semantyki i wymaga świadomej decyzji + ewentualnej migracji. Domyślnie **zostawić `failed`** (gracz nie wykonał zadania) ale z result textem, że świat sobie poradził — można też świadomie authorować `complete` z mniejszym social; decyzja należy do konkretnego questa, nie do runtime.

## Verification

- Wolf den: gracz niszczy → `den_destroyed` / ready_to_report jak dziś.
- Aktywny quest, den znika bez `destroy_spawn_point` playera → `resolved_without_player`, bez item reward i przez ten sam terminal outcome path co pozostałe resolution.
- Offer niezaakceptowany, source gone → `not_offered`.
- Authored `zagubiona-owca`: rozpoczęcie właściwego authored flow powoduje realny fauna-owned stray episode targetu; quest ma więc faktycznie zagubioną owcę do odnalezienia.
- Authored `zagubiona-owca`: kompatybilny istniejący stray nie tworzy drugiego episode.
- Generated lost-livestock: spokojne/returned/unavailable zwierzę → `not_offered`, bez `startLivestockStray()`.
- Generated lost-livestock: naturalny późniejszy stray → opportunity bez rebootu po 031; generated quest nigdy nie uruchamia stray sam.
- Naturalny `returned` nadal mapuje się na `live_return` bez wymagania prowadzenia zwierzęcia.
- Save/load w trakcie authored i world-driven stray zachowuje poprawny domenowy stan i nie tworzy drugiego episode.

## Risks

- Bez jawnego rozróżnienia authored/world-driven łatwo ponownie podpiąć `startLivestockStray()` do każdego generated offer — test ma tego pilnować.
- Usunięcie generic `startLivestockStray()` bez dodania/utrzymania authored triggera zepsuje narracyjny sens `zagubiona-owca` — authored test musi sprawdzać realny stray state, nie tylko quest objective.
- `untracked` dla materializowanego generated lost-livestock może ominąć availability gate — spokojne zwierzę musi mieć jawny non-offerable snapshot/status.
- Authored trigger może kolidować z naturalnym incydentem, który wydarzył się wcześniej. Implementacja powinna wykryć istniejący kompatybilny problem i wykorzystać go zamiast tworzyć duplikat.
- External resolution nie może tworzyć alternatywnego pipeline obok `quests-progression-029`; wybiera outcome, ale jego skutki wykonuje wspólny terminal path.

> **Zrób git commit i push do main, rebase jeżeli trzeba**