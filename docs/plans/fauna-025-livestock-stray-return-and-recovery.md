# Plan: Livestock stray return and recovery

**Created:** 2026-09-12
**Status:** `verification needed` 🔍 — implemented + technically verified. Browser/manual verification is owned by the user.
**Priority:** high · **Effort:** M
**Depends on:** fauna-024
**Domain:** `fauna`
**Type:** `feature`
**Subdomains:** `domestication` `behavior` `lifecycle`
**Tags:** `livestock` `stray` `return-home` `recovery` `quests`
**Roadmap:** -
**Model:** Sonnet, Composer

## Cel

Rozszerzyć mechanizm stray z `fauna-024` tak, aby zagubione household livestock pozostawało autonomicznym mieszkańcem świata i mogło samo wrócić do domu, bez psucia lost-livestock questa i bez questowego sterowania ruchem.

Naturalny flow:

```text
normal livestock
→ flee / displacement / other world pressure
→ sufficiently far/long outside home area
→ authoritative stray episode
→ calm + survival/needs arbitration
→ autonomous return-home pressure
→ travel toward home
→ returned
```

Quest jest tylko obserwatorem:

```text
stray persists long enough
→ sometimes world-driven quest opportunity
→ animal may still return by itself
→ world lookup reports returned
→ quest resolves from real world state
```

## Scope V1

1. naturalne wejście livestock w stray episode po realnym oddaleniu, nie tylko przez quest materialization,
2. odróżnienie chwilowego flee od faktycznego zagubienia,
3. autonomiczna presja powrotu po uspokojeniu,
4. committed return-home movement reuse'ujący istniejący trip/locomotion model,
5. needs/threat/scare mogą przerwać lub odroczyć powrót,
6. możliwość ponownego podjęcia próby powrotu,
7. zakończenie stray po wejściu do home return radius,
8. pełna kompatybilność z aktywnym lost-livestock questem z `fauna-024`,
9. persistence wymaganych authoritative fields,
10. bounded/off-screen-friendly semantics bez per-frame global scans.

## Non-goals V1

- gwarantowany powrót każdego zwierzęcia,
- teleport do domu,
- quest-only return path,
- transfer ownership do gracza,
- osobny `LostAnimalAI`,
- pełna symulacja płotów/bram,
- household NPC search parties,
- generowanie questa dla każdego stray,
- bezpośrednia zależność od burzy; thunder/scare z `world-026` jest jednym z możliwych źródeł flee/displacement.

## 1. Ownership i authoritative state

Reuse `fauna-024` authoritative stray state na istniejącym `AnimalAgent` / persisted animal state. Nie tworzyć drugiego `LostLivestockState`.

`AnimalOwner` pozostaje bez zmian przez cały lifecycle. Household-owned animal podczas stray i return nadal należy do household.

Jeżeli implementacja `fauna-024` ma już `originX/originZ`, return powinien używać tego samego home/origin contractu. Jeżeli aktualny kod daje stabilniejszy canonical `AnimalAgent.home`, zapisać tylko te dane, które są konieczne do poprawnego restore/stream-in; nie duplikować bez potrzeby obu źródeł prawdy.

## 2. Flee nie oznacza natychmiastowego stray

Krótka ucieczka od predatora, grzmotu lub innego bodźca nie może od razu tworzyć lost episode.

Dodać bounded classification opartą o realny stan zwierzęcia, semantycznie:

```text
household-owned + alive
+ outside normal home/wander area
+ displacement threshold and/or grace time exceeded
→ begin natural stray episode
```

Thresholdy mają reuse'ować istniejący `wanderRadius` / livestock home semantics, a nie arbitralny drugi zestaw metrów bez odniesienia do aktualnego modelu.

Grace ma zapobiegać sytuacji, w której jeden krótki flee tick natychmiast robi ze zwierzęcia lost livestock.

## 3. Natural stray start

`fauna-024` powinno dostarczyć jedną domenową operację startu stray episode. Ten plan ma ją reuse'ować także dla naturalnego displacement.

Źródło episode może być opcjonalną domenową informacją diagnostyczną (`quest-displacement`, `flee`, `roaming`, itp.) tylko jeśli jest przydatna do debug/history; nie może zmieniać podstawowych zasad return/ownership.

Burza nie woła `startLivestockStray()` bezpośrednio. Najpierw istniejący flee/movement rzeczywiście przemieszcza zwierzę, a fauna ocenia wynik przestrzenny.

## 4. Return-home pressure

Po ustaniu bezpośredniego threat/flee zwierzę będące stray powinno mieć rosnącą preferencję powrotu do home.

Nie tworzyć absolutnego highest-priority override. Return musi współistnieć z istniejącą arbitration:

- bezpośrednie threat/flee wygrywa,
- krytyczne hunger/thirst mogą odroczyć powrót,
- aktualny committed survival trip może zostać dokończony/przerwany zgodnie z istniejącymi zasadami,
- po uspokojeniu i zaspokojeniu pilniejszych potrzeb return staje się dominującym celem ruchu.

Preferować mały pure resolver/pressure helper zamiast dokładania kolejnych rozgałęzień do monolitycznej części `AnimalAgent.update()`.

## 5. Reuse existing trip/locomotion

`AnimalAgent` już posiada `home`, `wanderRadius`, zwykły wander oraz committed `AnimalTrip` z fazą `returning`. `animalRoaming.ts` ma wspólny bounded radial-probe primitive i trip semantics.

Nie tworzyć osobnego path/movement engine dla stray return.

Jeżeli aktualny `AnimalTrip` można bezpiecznie rozszerzyć o semantyczny kind `home-return` lub równoważny committed destination bez konfliktu z water/settlement trips, zrobić to. Jeśli agent ma już lepszy generic destination seam po implementacji `fauna-024`, reuse ten seam. Kluczowe jest jedno ownership locomotion.

Return destination powinien być poprawnym walkable pointem w/koło home, nie ślepym ustawieniem dokładnego `home.x/z`, jeżeli teren/collider semantics tego wymagają.

## 6. Return nie jest gwarantowany

Zwierzę ma **szansę i zdolność** wrócić, ale świat nadal może temu przeszkodzić.

Podczas return:

- predator może wymusić flee,
- kolejny scare może zmienić kierunek i ponownie oddalić zwierzę,
- hunger/thirst mogą spowodować forage/water detour,
- zwierzę może umrzeć,
- failed/unwalkable destination ma prowadzić do bounded retry, nie teleportu.

Po przerwaniu return attempt stray pozostaje active i może spróbować ponownie po cooldown/pressure gate.

## 7. Return detection

Reuse predicate z `fauna-024`:

```text
alive
+ stray.active
+ within canonical home return radius
→ clear stray episode
```

Po return:

- clear survival assist z `fauna-024`,
- clear runtime return commitment,
- zakończyć temporary lead, jeśli był aktywny i semantyka `fauna-024` tego wymaga,
- ownership pozostaje household,
- zwykły livestock wander/home behaviour odzyskuje kontrolę.

## 8. Quest safety

Najważniejszy invariant: quest nie może blokować naturalnego powrotu tylko dlatego, że gracz dostał zadanie.

`fauna-024` world lookup pozostaje authoritative. Jeżeli aktywny quest obserwuje zwierzę, które samo wróciło:

```text
animal enters home radius
→ stray cleared / returned world state
→ quest source lookup reports returned
→ existing quest outcome resolves success/live-return
```

Nie wymagamy, aby gracz był w pobliżu, prowadził zwierzę ani wykonał interaction.

Quest materialization nie może redisplace zwierzęcia, które już wróciło. Stable `animalId`/source identity i existing repeated-materialization guards z `fauna-024` pozostają obowiązkowe.

## 9. Quest opportunity jest opcjonalne

Naturalny stray episode nie oznacza automatycznego questa.

World-driven opportunity layer może dopiero po własnych warunkach zdecydować, czy sytuacja zasługuje na zadanie, np.:

- stray trwa wystarczająco długo,
- zwierzę nadal nie wróciło,
- household/source jest valid,
- opportunity selection/priority wybierze ten problem.

Ten plan nie dodaje osobnego `% quest` w `AnimalAgent`. Częstotliwość materializacji należy do istniejącego `quests-progression-016` opportunity flow.

## 10. Persistence i streaming

Authoritative stray state z `fauna-024` musi wystarczyć do odtworzenia zachowania po load/stream-in.

Runtime return attempt może być odtworzony z `stray.active + current position + home` zamiast persistowania całego movement FSM, jeżeli jest to zgodne z aktualnym `AnimalAgent` restore contract.

Round-trip musi zachować:

- active stray i pozycję,
- owner identity,
- dead/inspection semantics z `fauna-024`,
- returned/cleared state.

Save/load nie może automatycznie teleportować stray livestock do spawn/home anchor.

## 11. Off-screen / adaptive simulation

Mechanizm ma nadawać się do późniejszej agregacji/off-screen simulation.

Nie uzależniać semantyki powrotu od kamery/gracza. Decyzja o return wynika z animal/world state.

V1 może wykonywać szczegółowy movement tylko dla aktywnych `AnimalAgent`, ale authoritative state i return intent powinny być reprezentowalne jako proste dane, aby później remote simulation mogła rozstrzygać podróż w niższej częstotliwości.

## 12. Integracja z world-026

`world-026` może generować thunder scare stimulus. Fauna ocenia per-animal scare roll i korzysta z istniejącego flee.

Integracja ma wyglądać:

```text
thunder stimulus
→ probabilistic existing flee
→ actual displacement
→ natural stray classification (this plan)
→ autonomous return attempt
```

Brak bezpośredniego `storm → stray` i brak `storm → quest`.

`fauna-025` nie musi zależeć implementacyjnie od `world-026`: natural stray/return powinien działać dla każdego istniejącego źródła displacement, w tym predator flee i quest displacement.

## 13. Tests

Minimum automated coverage:

1. krótkie flee wewnątrz/tuż poza home area nie uruchamia stray,
2. household livestock wystarczająco oddalone po grace może wejść w naturalny stray episode,
3. natural start zachowuje `animalId` i `AnimalOwner`,
4. active threat ma priorytet nad return-home,
5. po uspokojeniu active stray podejmuje return attempt,
6. pilna potrzeba może odroczyć return bez clear stray,
7. przerwany return może zostać ponowiony,
8. wejście w home return radius kończy stray,
9. self-return podczas aktywnego lost-livestock questa daje world lookup `returned`,
10. self-return nie wymaga player proximity/lead/interaction,
11. quest restore/materialization nie redisplace returned animal,
12. save/load zachowuje active stray position i pozwala wznowić return semantics,
13. dead stray nigdy nie rozpoczyna return,
14. brak globalnego per-frame scan wszystkich livestock.

## 14. Manual verification

User wykonuje w przeglądarce:

1. wywołać flee household livestock i potwierdzić, że małe oddalenie nie tworzy stray,
2. doprowadzić do większego displacement i obserwować rozpoczęcie stray,
3. nie pomagać zwierzęciu i sprawdzić, że po uspokojeniu próbuje wrócić,
4. podczas return wywołać threat/scare i sprawdzić przerwanie oraz późniejszą ponowną próbę,
5. sprawdzić wariant hunger/thirst detour,
6. aktywować lost-livestock quest, nie prowadzić zwierzęcia i pozwolić mu wrócić samemu,
7. potwierdzić poprawne zakończenie questa z realnego `returned` state,
8. save/load podczas stray i podczas drogi powrotnej,
9. potwierdzić brak teleportu i zachowanie ownera.

## 15. Kolejność implementacji

1. Zweryfikować finalny contract `fauna-024` po jego implementacji.
2. Natural stray classification + grace/threshold.
3. Return-home pressure/resolver.
4. Reuse/extension committed locomotion/trip seam.
5. Interrupt/retry semantics.
6. Quest world-state compatibility tests.
7. Persistence/streaming regression tests.
8. Docs/state update.

Dla nowych ważnych publicznych return/classification functions dodać JSDoc z `@domain fauna`, aby preflight/code map mógł je odnaleźć.

> **Zrób git commit i push do main, rebase jeżeli trzeba**