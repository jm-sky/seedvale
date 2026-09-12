# Plan: Storms, thunder, animal scare and snow visuals

**Created:** 2026-09-12
**Status:** `verification needed` 🔍
**Priority:** high · **Effort:** M
**Depends on:** none
**Domain:** `world`
**Type:** `feature`
**Subdomains:** `weather` `events` `simulation`
**Tags:** `storm` `thunder` `lightning` `scare` `snow` `audio`
**Roadmap:** -

## Cel

Rozszerzyć istniejący deterministyczny system pogody o burze, zsynchronizowane lightning/thunder events i reużywalną presję strachu dla zwierząt oraz poprawić wizualny śnieg, który obecnie jest renderowany jako pełne kwadratowe point sprites.

Burza ma być stanem świata, nie questowym triggerem. Ten sam konkretny thunder event ma napędzać prezentację audio/visual i reakcję fauny:

```text
weather storm
→ deterministic lightning event
→ flash
→ delayed thunder sound
→ bounded animal scare stimulus
→ per-animal probability
→ optional flee through existing fauna movement
```

## Scope V1

1. nowy `storm` w canonical weather model,
2. sezonowe prawdopodobieństwo burzy i deterministyczna intensywność,
3. deterministyczne lightning events podczas aktywnej burzy,
4. flash + opóźniony thunder zależny od zasymulowanej odległości wyładowania,
5. storm ambience: mocny deszcz / wiatr oraz kilka wariantów thunder sound,
6. jeden world-level thunder/scare event seam konsumowany przez audio, visuals i faunę,
7. probabilistyczna reakcja livestock na konkretny thunder event,
8. poprawa proceduralnej maski płatków śniegu bez CPU particle simulation i bez wymagania tekstury.

## Non-goals V1

- tornado, grad, pożary od pioruna i damage od lightning,
- globalny event/history framework,
- quest generation,
- bezpośrednie ustawianie `stray` przez pogodę,
- nowy movement/FSM dla zwierząt,
- per-particle CPU update,
- fizyczna propagacja dźwięku.

## 1. Weather ownership

Rozszerzyć istniejący `src/world/weather.ts` i `WeatherType`; nie tworzyć równoległego `StormManager` z własnym kalendarzem.

`computeWeather(seed, elapsedDays, season)` pozostaje authoritative i pure. `storm` dostaje sezonowe wagi, temperaturę i intensity w tym samym modelu co pozostała pogoda. Największa częstość powinna przypadać na cieplejsze sezony; wartości dostroić tak, aby burza była wydarzeniem zauważalnym, ale nie codziennym.

Istniejące systemy traktujące rain exposure powinny podczas implementacji jawnie zdecydować, czy `storm` semantycznie liczy się jako deszcz. Preferowane: wspólny helper typu `isRainWeather(type)` używany tam, gdzie chodzi o opad/wetness, zamiast rozsypywania `rain || storm` po call-sites.

## 2. Deterministic lightning/thunder event

Dla aktywnego `storm` wyznaczać lightning events deterministycznie z istniejących danych świata:

```text
seed + weather cycle + bounded event slot
→ event occurrence
→ event strength
→ simulated distance
→ flash time
→ thunder delay
```

Nie przechowywać długiej historii piorunów i nie używać per-frame `Math.random()` do decyzji, czy właśnie uderzył piorun. Save/load i time progression dla tego samego czasu świata powinny dawać ten sam event schedule.

Wystawić mały typed event/snapshot seam z unikalną tożsamością eventu, aby konsumenci nie odpalali tego samego grzmotu wielokrotnie przy kolejnych tickach.

## 3. Visual storm

Reuse istniejące weather/cloud/lighting mechanisms. V1 potrzebuje:

- mocniejszego rain presentation dla `storm`,
- krótkiego lightning flash wpływającego na istniejącą prezentację światła/nieba bez trwałego mutowania bazowego day/night state,
- intensity wpływającego na siłę/frequency presentation.

Nie tworzyć drugiego systemu chmur ani osobnego storm scene graph, jeśli obecne weather/cloud hooks można rozszerzyć.

## 4. Storm sounds

Rozszerzyć `src/audio/weatherSounds.ts`, który już posiada jeden shared non-positional rain loop i intensity-driven gain.

V1:

- storm rain/wind ambience jako shared loops,
- kilka wariantów thunder one-shot, aby ograniczyć słyszalną powtarzalność,
- thunder odpalany dokładnie z tego samego lightning eventu co flash/scare,
- opóźnienie thunder po flash wynikające z simulated event distance,
- cave/interior attenuation reuse'uje istniejący `inCaveInterior` seam; nie tworzyć drugiego cave detectora,
- wszystkie handles poprawnie `dispose()`.

Asset paths dopisać do `docs/assets/SOUNDS.md`; jeżeli plików jeszcze nie ma, plan ma pozostawić jawny asset requirement zamiast udawać dostępność.

## 5. Snow visual polish

`src/world/weatherParticles.ts` już renderuje rain/snow przez GPU `THREE.Points`; zachować tę architekturę.

Obecnie snow omija maskę fragment shader i pozostaje pełnym kwadratem. Zmienić snow branch na tanią proceduralną alpha maskę opartą o `gl_PointCoord`, np. miękki nieregularny/circular flake z feathered edge.

Wymagania:

- brak kwadratowych rogów,
- zachować istniejące size variation, fall speed i drift,
- bez nowych per-frame buffer uploads,
- bez CPU particle loop,
- bez obowiązkowej tekstury płatka,
- zachować quality ceiling / LOD particle budget.

## 6. Generic scare stimulus

Thunder ma emitować bounded world-level stimulus, nie wywoływać `startLivestockStray()` i nie znać questów.

Minimalny kontrakt semantyczny:

```ts
type AnimalScareStimulus = {
  source: 'thunder'
  eventId: string
  strength: number
  x: number
  z: number
  radius: number
}
```

Dokładny shape dopasować do aktualnych fauna/world seams. Ważne invariants:

- event jest ephemeral, nie osobnym persistent entity,
- jeden event jest oceniany najwyżej raz przez dane zwierzę,
- caller przekazuje tylko bounded nearby animals; bez globalnego skanu całej fauny per frame,
- mechanizm powinien później przyjąć inne źródła strachu bez tworzenia `ThunderFleeAI`.

## 7. Livestock scare probability

Reakcja jest probabilistyczna per animal. Thunder nie oznacza automatycznego flee.

Szansa powinna wynikać co najmniej z:

- strength/intensity konkretnego thunder eventu,
- odległości zwierzęcia od eventu,
- odległości od jego `home`,
- obecności/bliskości household owner lub właściwego opiekuna, jeśli aktualny runtime daje tani i jednoznaczny lookup,
- herd/social context, jeśli istniejący bounded context jest dostępny bez nowego globalnego query,
- shelter/interior, jeśli istniejący world query pozwala to ustalić bez tworzenia nowego shelter systemu,
- species/animal fear baseline w reużywalnym animal definition/state, nie w weather module.

Brak owner/shelter/herd contextu nie może blokować V1: użyć tylko zweryfikowanych istniejących sygnałów, a pozostałe zostawić jako późniejsze multipliers zamiast tworzyć kosztowne równoległe lookup systems.

Losowanie musi być stabilne dla `(eventId, animalId)`, aby wynik nie zależał od FPS ani liczby ticków.

## 8. Flee integration

Jeżeli scare roll przejdzie, fauna ma użyć istniejącego locomotion/threat/flee ownership w `AnimalAgent`. Nie dodawać weather-specific movement managera.

Thunder scare jest krótką presją/impulsem. Po ustaniu zwierzę wraca do normalnej arbitration. Sam fakt flee może naturalnie wyprowadzić livestock poza home area; klasyfikacja jako stray i późniejszy powrót należą do `fauna-025`, nie do weather.

## 9. Performance

- schedule lightning jest O(1) / bounded per weather cycle,
- żadnych globalnych fauna scans per frame,
- snow nadal GPU-driven,
- audio używa shared loops + bounded one-shots,
- flash nie może wymuszać przebudowy terrain/chunks/materials.

## 10. Tests

Minimum automated coverage:

1. `storm` jest deterministycznie wybierany dla tych samych inputs,
2. seasonal weights nie pozwalają na niezamierzone stany,
3. storm liczy się jako rain exposure tam, gdzie semantyka dotyczy opadu,
4. lightning schedule/event identity jest deterministic i nie duplikuje eventu per tick,
5. thunder delay rośnie z simulated distance,
6. stable `(eventId, animalId)` scare roll daje ten sam wynik,
7. większa siła/bliskość zwiększa scare probability,
8. home/owner proximity obniża probability, gdy te sygnały są dostępne,
9. nieudany roll nie zmienia animal movement state,
10. successful roll korzysta z istniejącego flee seam,
11. snow shader/mask zachowuje GPU emitter contract i quality ceiling,
12. weather audio poprawnie przełącza rain/storm i dispose'uje handles.

## 11. Manual verification

User wykonuje w przeglądarce:

1. wymusić snow i sprawdzić brak widocznych kwadratowych płatków z różnych odległości,
2. wymusić storm i sprawdzić mocny deszcz/wiatr,
3. obserwować kilka lightning events: flash → opóźniony thunder,
4. potwierdzić warianty thunder sound i brak spamowania jednego eventu,
5. obserwować stado livestock: nie każdy grzmot i nie każde zwierzę powoduje flee,
6. porównać zwierzę blisko domu/opiekuna z oddalonym,
7. potwierdzić, że burza sama nie tworzy questa ani nie ustawia stray,
8. sprawdzić cave/interior attenuation.

## 12. Kolejność implementacji

1. `WeatherType` + storm semantics + rain-like helper/call-sites.
2. Deterministic lightning event schedule/identity.
3. Visual flash + storm rain presentation.
4. Weather audio + thunder variants/delay.
5. Snow fragment mask polish.
6. Generic scare stimulus + stable per-animal probability.
7. Existing flee integration + tests.
8. Docs/state/assets update.

Dla nowych ważnych publicznych weather/event/scare functions dodać JSDoc z `@domain world` lub `@domain fauna` zgodnie z ownership, aby preflight/code map mógł je odnaleźć.

> **Zrób git commit i push do main, rebase jeżeli trzeba**