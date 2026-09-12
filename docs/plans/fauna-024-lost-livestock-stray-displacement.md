# Plan: Lost livestock stray displacement

**Created:** 2026-09-12
**Status:** `verification needed` 🔍 — implemented + technically verified. Browser/manual verification is owned by the user.
**Priority:** high · **Effort:** M
**Depends on:** quests-progression-016, fauna-020
**Domain:** `fauna`
**Type:** `feature`
**Subdomains:** `domestication` `behavior` `lifecycle`
**Tags:** `livestock` `stray` `quest` `persistence`
**Roadmap:** `quests-and-reputation.md`

## Cel

Dodać prosty, reużywalny mechanizm zagubionego zwierzęcia gospodarskiego oparty o realny persistent livestock `AnimalAgent`, bez tworzenia questowego zwierzęcia ani równoległego systemu symulacji.

V1 ma umożliwić flow:

```text
world-driven quest opportunity
→ wybór istniejącego household-owned livestock
→ rozpoczęcie stray/displacement episode
→ półlosowy, względnie bezpieczny kierunek/cel poza gospodarstwem
→ normalna fauna dalej symuluje zwierzę
→ gracz odnajduje je żywe lub martwe
→ światowy stan zwierzęcia rozstrzyga outcome
```

Quest może w V1 inicjować episode, ale po uruchomieniu nie może sterować życiem, śmiercią ani pozycją zwierzęcia przez quest-only flags.

## Scope V1

Plan obejmuje:

1. persisted stray/displacement state na istniejącym livestock,
2. wybór istniejącego household-owned `AnimalAgent` z zachowaniem `animalId`, ownera i origin provenance,
3. domenową operację rozpoczęcia stray episode,
4. wyznaczenie semi-random displacement target/path direction z ograniczonym unikaniem oczywistych predator hotspots,
5. lokalny survival assist aktywny wyłącznie dla konkretnego stray episode,
6. normalną możliwość ataku i śmierci zwierzęcia,
7. wydłużone utrzymanie corpse dla nierozstrzygniętego stray episode,
8. wykrycie powrotu żywego zwierzęcia do home area,
9. prosty player lead/follow seam dla household-owned strayed livestock, bez transferu ownership do gracza,
10. world-state lookup dla questa: lost / returned / dead-unconfirmed / dead-confirmed / unavailable,
11. integrację z istniejącym world-driven opportunity/materialization flow,
12. persistence/save-load i testy regresyjne.

## Non-goals V1

Nie obejmuje:

- pełnego household problem framework,
- autonomicznego wykrywania wszystkich naturalnie zagubionych zwierząt,
- fence damage / storms / theft jako triggerów,
- generic world event/history framework,
- rozbudowanej nawigacji powrotnej zwierzęcia do domu,
- gwarantowanego przeżycia,
- zwiększania HP tylko na potrzeby questa,
- tworzenia `QuestAnimal`, osobnego animal managera ani drugiego persistence path,
- przebudowy całego corpse lifecycle.

Te same domenowe mechanizmy mają jednak nadawać się później do triggerów: predator scare, storm, damaged fence, theft i ordinary roaming.

## 1. Authoritative stray state

Stan zagubienia należy do konkretnego `AnimalAgent` / fauna-domestication state, nie do `QuestManager`.

Minimalny semantyczny kontrakt V1:

```ts
type AnimalStrayState = {
  active: boolean
  originX: number
  originZ: number
  survivalAssist: boolean
  corpseInspected: boolean
}
```

Dokładny shape może zostać dopasowany do obecnego modułowego podziału `AnimalAgent`, ale wymagane są invariants:

- `animalId` nie zmienia się,
- `AnimalOwner` nie zmienia się przy zagubieniu,
- household-owned animal pozostaje household-owned,
- state jest persistowany razem z istniejącym `AnimalSaveState`,
- nie przechowywać quest state ani `questId` w `AnimalAgent`, jeśli nie jest potrzebny do domenowej semantyki,
- zakończenie episode czyści survival assist.

Preferować mały wydzielony helper/state module, jeżeli dzięki temu nie rozrośnie się ponownie `AnimalAgent`.

## 2. Wybór istniejącego livestock

V1 powinno wybierać realne livestock należące do konkretnego household.

Eligibility co najmniej:

- household owner zgadza się z source household,
- animal żyje,
- nie jest już w aktywnym stray episode,
- nie jest mounted,
- nie jest player-owned,
- gatunek jest wspierany przez scenariusz.

Pierwszy scenariusz może preferować `sheep`; mechanizm nie może być sheep-specific.

Selection powinien być deterministyczny dla tych samych materialization inputs albo zapisać wybrany `animalId` jako stable source input zgodnie z persistence contract world-driven questów.

Nie spawnować nowego zwierzęcia.

## 3. Start stray/displacement episode

Dodać jedną domenową operację semantycznie w rodzaju:

```text
startLivestockStray(animalId, context)
```

Operacja ma:

1. znaleźć istniejący persistent livestock,
2. zachować owner/origin identity,
3. zapisać origin/home anchor potrzebny do późniejszego return check,
4. wyznaczyć displacement destination,
5. uruchomić movement/trip lub wykonać domenowe przemieszczenie do poprawnego world point,
6. włączyć episode-local survival assist.

Quest/materializer nie może bezpośrednio mutować `mesh.position` ani parametrów combat AI.

## 4. Semi-safe displacement target

V1 nie potrzebuje pełnego planner/pathfindera.

Użyć istniejących terrain/roaming/probe helpers i bounded liczby candidate probes:

```text
home/origin
→ losowy kierunek + dystans poza livestock wander radius
→ kilka candidate points
→ odrzuć invalid terrain/water/collider points
→ preferuj punkt bez oczywistego pobliskiego predator pressure
→ wybierz najlepszy z ograniczonej próbki
```

"Semi-safe" nie oznacza bezpiecznego korytarza ani immunitetu. Po rozpoczęciu episode normalne predators mogą znaleźć i zaatakować zwierzę.

Nie zwiększać globalnego `wanderRadius` wszystkim livestock i nie wykonywać kosztownych globalnych scanów per tick.

## 5. Survival assist

Survival assist jest opcjonalnym modifierem konkretnego stray episode i nie może przechodzić na zwykłe animals.

V1 preferuje behavioural assist zamiast HP buff:

- wcześniejsze reagowanie na predator threat,
- niewielkie wzmocnienie flee commitment/speed albo stamina economy podczas aktywnej ucieczki,
- brak immunitetu,
- brak zmiany ownership,
- brak wpływu na zwierzę po zakończeniu episode.

Modifier powinien działać wyłącznie po jawnym gate:

```text
stray.active && stray.survivalAssist
```

Nie dodawać globalnego `survivalMode` do `AnimalDef` ani ogólnego behaviour priority dla wszystkich zwierząt.

## 6. Śmierć i corpse retention

Normalny combat pozostaje authoritative. Strayed livestock może umrzeć od predatorów lub innych istniejących zagrożeń.

Obecny naturalny corpse lifecycle usuwa nieharvestowane zwłoki po krótkim czasie, co jest za mało dla questa poszukiwawczego.

V1 ma rozszerzyć istniejący cleanup gate minimalnie:

```text
dead + active stray episode + corpse not inspected
→ nie usuwaj corpse przez normalny krótki TTL
```

Wymagania:

- corpse pozostaje tym samym dead `AnimalAgent`,
- zachowuje `animalId` i owner identity,
- retention musi przeżyć save/load,
- po inspekcji można zwolnić protection i pozwolić istniejącemu decay/removal lifecycle dokończyć pracę,
- należy mieć safety cap/fallback, aby permanentnie nieodnalezione corpse nie żyły bez końca w save; wartość dobrać do czasu świata, nie sekund realtime.

Nie tworzyć `LostLivestockCorpse` entity.

## 7. Inspekcja corpse

Reuse istniejący interaction target dla animal corpse i dodać wąską operację inspekcji strayed livestock.

Inspekcja ma zmienić domenowy state `corpseInspected`, a następnie quest odczytuje wynik przez world lookup.

Quest nie powinien sam ustawiać `deadConfirmed`.

## 8. Powrót żywego zwierzęcia

Ownership podczas całego episode pozostaje household.

Nie używać household → player → household transferu tylko po to, żeby wykorzystać player-owned Follow.

V1 może dodać mały generic temporary lead/follow seam dla live strayed livestock:

```text
player interacts with strayed animal
→ temporary lead target = player
→ istniejąca locomotion/threat/needs arbitration nadal działa
→ animal wchodzi w origin/home return radius
→ stray episode kończy się
```

Lead nie może być quest-specific; powinien nadawać się później do prowadzenia livestock w innych systemach.

Jeżeli recon przy implementacji pokaże już istniejący actor-follow seam możliwy do rozszerzenia bez ownership transferu, reuse go zamiast tworzyć drugi mechanizm.

## 9. Return detection

Return jest world predicate, nie quest action.

Minimalnie:

```text
alive
+ stray.active
+ distance to stored origin/home <= returnRadius
→ end stray episode
```

Po zakończeniu:

- wyłączyć survival assist,
- zakończyć temporary lead,
- pozostawić owner bez zmian,
- normalne livestock roaming/home semantics przejmują kontrolę.

Return radius powinien reuse'ować istniejące home/yard/wander constants, jeśli pasują semantycznie; nie dodawać arbitralnego duplicate radius bez sprawdzenia.

## 10. Quest source status

Rozszerzyć istniejący world-driven quest source contract zamiast tworzyć osobny quest manager.

Lost livestock potrzebuje bogatszego domenowego snapshotu niż obecne generic `present/resolved/absent`, semantycznie:

```text
lost-alive
returned
corpse-uninspected
corpse-inspected
unavailable
```

Może to być osobny narrow lookup używany przez materialized lost-livestock objective/outcome albo rozszerzenie istniejącego typed source contract, zależnie od aktualnego kształtu kodu.

Nie używać untyped flag bag.

Quest outcome powinien wynikać z lookup:

- `returned` → success/live return outcome,
- `corpse-inspected` → dead/confirmed outcome,
- `lost-alive` → nadal aktywny,
- `corpse-uninspected` → nadal aktywny z możliwością inspekcji,
- `unavailable` → bezpieczny terminal/failure/invalidation zgodny z istniejącą semantyką `QuestManager`.

## 11. World-driven opportunity integration

Reuse `quests-progression-016`:

```text
real selected livestock source
→ typed lost-livestock opportunity
→ selection/materialization
→ normal QuestDef
→ existing QuestManager
```

Dla V1 dopuszczalne jest, że wybranie/materializacja opportunity uruchamia `startLivestockStray()`. To jest świadome uproszczenie V1.

Guardrail:

- po starcie episode quest nie steruje symulacją,
- repeated materialization/restore nie może uruchamiać displacement drugi raz,
- stable quest/source identity musi wiązać się z konkretnym `settlementId`/`houseId`/`animalId` lub równoważnym trwałym zestawem refs.

## 12. Persistence i streaming

Rozszerzyć istniejący livestock persistence path; nie tworzyć osobnego registry dla lost animals.

Sprawdzić round-trip:

```text
stray alive + displaced position
stray alive + being led
stray dead + corpse retained
stray dead + corpse inspected
returned + stray cleared
```

Temporary runtime-only lead target może zostać odtworzony jako inactive po load; authoritative stray/dead/inspection state musi zostać zachowany.

Settlement stream-out/in nie może resetować position, stray state, corpse retention ani owner identity.

## 13. Reuse i architektura

Preferowane istniejące mechanizmy:

- `AnimalAgent` / `AnimalSaveState` — identity i per-animal state,
- `AnimalOwner` — ownership,
- `settlement/livestock.ts` + `LivestockRegistry` — persistence/provenance,
- `animalRoaming.ts` — destination/probe/trip helpers,
- existing threat/flee pipeline — survival assist,
- `animalCorpse.ts` — corpse lifecycle,
- `ownedAnimalControl.ts` / follow hysteresis — tylko jako reusable reference/seam, bez fałszywego player ownership,
- `src/quests/opportunities/*` — world-driven opportunity/materialization,
- existing narrow world lookups w `QuestManager`.

Dodać JSDoc z `@domain fauna` dla nowych ważnych publicznych state/operations, aby były łatwe do znalezienia przez preflight/code map.

## 14. Tests

Minimum automated coverage:

1. selection wybiera istniejące eligible household livestock i nigdy nie tworzy nowego ID,
2. start stray zachowuje `animalId` i `AnimalOwner`,
3. destination jest poza normalnym home area i respektuje invalid terrain guards,
4. bounded candidate selection preferuje mniej zagrożony candidate, ale nie wymaga braku predators,
5. survival assist działa tylko dla active flagged episode,
6. clear stray natychmiast wyłącza survival assist,
7. dead strayed animal nie jest usuwany przez zwykły krótki corpse TTL przed inspection,
8. corpse inspection ustawia authoritative inspected state,
9. alive animal wejście w return radius kończy episode,
10. persistence round-trip zachowuje stray/dead/inspection state,
11. repeated quest materialization/restore nie redisplace tego samego animal,
12. quest outcome jest odczytany z world state, nie lokalnych quest flags.

## 15. Manual verification

User wykonuje w przeglądarce:

1. uruchomić lost livestock opportunity dla owcy,
2. potwierdzić, że znika realna istniejąca owca z gospodarstwa, bez duplicate spawn,
3. znaleźć ją poza osadą i sprawdzić normalne hunger/thirst/roaming/threat reactions,
4. sprawdzić, że predator może ją zaatakować i zabić mimo survival assist,
5. wariant alive: poprowadzić ją do gospodarstwa i potwierdzić live return outcome,
6. wariant dead: odnaleźć corpse po czasie dłuższym niż zwykły corpse TTL, inspect i potwierdzić dead outcome,
7. save/load w trakcie alive-lost i dead-uninspected variants,
8. potwierdzić, że inne animals nie dostały survival assist.

## 16. Kolejność implementacji

1. Stray state + persistence.
2. Generic start/clear + return predicate.
3. Semi-safe destination selection.
4. Episode-local survival assist.
5. Corpse retention + inspection.
6. Temporary lead/follow dla household-owned strayed livestock.
7. Typed world lookup.
8. Opportunity/materialization + quest outcomes.
9. Tests i docs/state update.

## 17. Poza V1 / future reuse

Po V1 ten sam `startLivestockStray()` powinien móc zostać wywołany przez realne world causes:

```text
predator attack/scare
storm
broken fence
ordinary roaming
NPC mistake
theft/abduction (z inną kontrolą movement)
```

Dopiero wtedy warto rozważyć autonomiczny household lost-animal problem detector. V1 nie powinno budować go z wyprzedzeniem.

> **Zrób git commit i push do main, rebase jeżeli trzeba**