# Plan: Calm settlement wander gait

**Created:** 2026-09-17
**Status:** `verification needed` 🔍 (implemented 2026-09-17 — browser checks are User-owned)
**Type:** polish
**Priority:** medium · **Effort:** S
**Depends on:** none
**Domain:** `fauna`
**Subdomains:** `domestication` `behavior`
**Tags:** `horse` `livestock` `movement` `riding`
**Roadmap:** -
**Model:** Sonnet, Composer

## Cel

Rozdzielić spokojne poruszanie się konia luzem przy osadzie od normalnego ruchu zadaniowego i od jazdy pod siodłem.

Koń należący do gospodarstwa / gracza, który wykonuje zwykły lokalny wander i nie jest dosiadany, ma poruszać się wyraźnie spokojniejszym chodem. `mounted` zachowuje dokładnie dwa tryby ruchu sterowane przez gracza: walk oraz sprint/run.

Zmiana ma usuwać wrażenie, że konie bez celu szybko krążą po obejściu, bez obniżania ich prędkości w ucieczce, prowadzeniu, celowym przemieszczaniu ani pod siodłem.

## Recon

Aktualny kod ma już właściwe rozdzielenie mounted vs autonomous movement:

- `AnimalDef` ma bazowe `walkSpeed` / `sprintSpeed`,
- rideable species mają osobny `mount.walkSpeed` / `mount.sprintSpeed`,
- `AnimalAgent.update()` całkowicie omija autonomous AI, gdy `mounted === true`,
- `mountActions.update()` steruje wtedy `AnimalAgent.driveMounted()`,
- settlement livestock jest zwykłym `AnimalAgent` z lokalnym `LIVESTOCK_WANDER_RADIUS = [3, 6]`,
- zwykły `wander()` używa pełnego `walkSpeedNow()`, więc koń chodzi po obejściu z tym samym autonomous walk baseline, którego używa również bardziej celowy ruch.

Dla konia current data to:

```ts
walkSpeed: 2.6
sprintSpeed: 6.0
mount: {
  walkSpeed: 10.5,
  sprintSpeed: 17.5,
}
```

Problem nie leży więc w mounted gait ani w promieniu roamingu, tylko w braku osobnej prędkości dla spokojnego lokalnego wanderu.

## Decyzje

### 1. Dodać opcjonalny calm-wander speed do species data

Rozszerzyć `AnimalDef` o mały, opcjonalny parametr przeznaczony wyłącznie dla swobodnego lokalnego wanderu, np.:

```ts
calmWalkSpeed?: number
```

Nazwa może zostać lekko dopasowana podczas implementacji, ale semantyka ma pozostać konkretna: **spokojny autonomous wander**, a nie trzeci globalny gait.

Nie dodawać generic movement-state framework ani rozbudowanej hierarchii gaitów.

### 2. V1 skonfigurować dla konia

Horse dostaje niższy `calmWalkSpeed` niż `walkSpeed`.

Wartość ma być tuningiem gameplayowym, nie biologiczną tabelą. Punktem startowym powinien być zakres około 45–60% obecnego `walkSpeed` (`2.6`), czyli około `1.2–1.5 m/s`; finalna liczba po implementacji ma być zweryfikowana ręcznie w przeglądarce przez użytkownika.

Nie zmieniać:

- `horse.walkSpeed`,
- `horse.sprintSpeed`,
- `horse.mount.walkSpeed`,
- `horse.mount.sprintSpeed`.

### 3. Calm gait tylko dla ordinary local wander

Calm speed ma być używana wyłącznie tam, gdzie `AnimalAgent` wykonuje normalny, niepilny lokalny wander wokół `home`.

Nie stosować jej do:

- flee / threat / scare,
- chase / combat,
- lead/follow,
- committed trip,
- stray return,
- potrzeby jedzenia/wody, jeśli agent ma konkretny source target,
- player-owned Follow,
- mounted movement.

Nie trzeba dodawać osobnego geometrycznego testu „czy punkt leży wewnątrz granicy osady”. Settlement livestock już dostaje lokalne `home` + `LIVESTOCK_WANDER_RADIUS = [3, 6]`; ordinary wander jest właściwym semantycznym miejscem do zastosowania spokojnego gait.

### 4. Mounted pozostaje dwustanowe

Nie dodawać calm gait do mounted path.

Mounted nadal ma tylko:

```text
walk
sprint/run
```

Sterowanie pozostaje w `mountActions.update()` → `AnimalAgent.driveMounted()` i korzysta z `AnimalDef.mount.walkSpeed` / `mount.sprintSpeed` oraz istniejącego Riding multiplier.

### 5. Mechanizm przygotować do reuse przez inne zwierzęta, ale nie rozszerzać scope bez potrzeby

Ponieważ livestock i wild fauna współdzielą `AnimalAgent`, opcjonalne `calmWalkSpeed` jest tanim reusable seamem. Nie robić jednak masowego retuningu wszystkich gatunków w tym planie.

V1:

- **horse: tak**,
- donkey/cow/sheep/chicken/rooster/dog: bez zmian, chyba że podczas implementacji istniejący test/data contract wymaga jawnego fallbacku,
- wild fauna: bez zmian.

Fallback przy braku `calmWalkSpeed` ma być obecne `walkSpeedNow()`.

Dzięki temu później osioł lub inne livestock mogą dostać spokojniejszy wander samą zmianą danych, bez kolejnego mechanizmu.

### 6. NPC poza zakresem

Nie przenosić tego mechanizmu do `NpcAgent`.

NPC mają osobny model ruchu: action/FSM → destination → `steerTo()`. Wspólny gait abstraction między NPC i `AnimalAgent` wymagałby cross-domain refaktoru dwóch niezależnych movement executors, podczas gdy obecny problem dotyczy tylko swobodnego zachowania livestock.

ROI takiego refaktoru jest obecnie niskie. Jeżeli później pojawi się osobny problem „NPC spacerują zbyt szybko vs idą do pracy”, powinien dostać własny plan w domenie `npc`.

## Zakres implementacji

1. Dodać opcjonalny calm-wander speed do `AnimalDef`.
2. Ustawić wartość dla `horse`.
3. W `AnimalAgent` rozdzielić wybór prędkości ordinary wander od `walkSpeedNow()` używanego przez inne autonomous movement.
4. Zachować istniejące night/variant semantics tam, gdzie mają zastosowanie; calm speed nie może przypadkiem ominąć per-individual speed modifiers, jeśli current helper nakłada je na normalny walk.
5. Nie zmieniać mounted path.
6. Dodać focused test fallbacku oraz horse calm-wander selection.
7. Zaktualizować `docs/state/fauna.md`, jeżeli implementation zmieni publiczny species-data contract.

## Relevant files

- `src/fauna/animalDefs.ts`
  - `AnimalDef`
  - `ANIMAL_DEFS.horse`
- `src/fauna/AnimalAgent.ts`
  - `walkSpeedNow()`
  - ordinary `wander()` / jego movement call-site
  - `driveMounted()` tylko jako invariant / regression boundary
- `src/fauna/animalVariants.ts`
  - sprawdzić, jak speed multiplier komponuje się z species baseline
- `src/fauna/mountedSpeed.test.ts`
  - regression: mounted walk/sprint invariants pozostają bez zmian
- focused fauna movement test istniejący lub nowy, jeśli nie ma sensownego miejsca na ten kontrakt
- `src/settlement/livestock.ts`
  - tylko jako potwierdzenie `LIVESTOCK_WANDER_RADIUS`/home semantics; brak oczekiwanej zmiany
- `docs/state/fauna.md`

## Guardrails

- Bez `if (kind === 'horse')` w movement executorze — horse-specific tuning ma być w `AnimalDef`.
- Bez zmiany `LIVESTOCK_WANDER_RADIUS`.
- Bez nowego movement managera.
- Bez zmian w pathfinding/navigation/slope/water traversal.
- Bez zmian Riding skill i jego multiplierów.
- Bez trzeciego mounted gait.
- Bez zmian leczenia / Medicine.
- Bez NPC refaktoru.
- Calm speed ma wpływać na dystans pokonywany przez movement, nie tylko na animację.
- Nie opierać semantyki na kamerze/player proximity; world behaviour pozostaje niezależny od obserwacji gracza.

## Testy

### Data / speed selection

- horse ma `calmWalkSpeed < walkSpeed`,
- gatunek bez `calmWalkSpeed` zachowuje dotychczasowy ordinary wander speed,
- calm speed komponuje się poprawnie z istniejącym animal variant speed multiplierem albo jawnie zachowuje uzgodniony fallback contract.

### Behaviour boundaries

- ordinary unmounted horse wander wybiera calm speed,
- flee/chase/lead/purposeful movement nadal używa istniejących walk/sprint paths,
- mounted walk nadal bierze `mount.walkSpeed`,
- mounted sprint nadal bierze `mount.sprintSpeed`,
- mounted nie może wejść w calm wander path.

### Manual verification — użytkownik w przeglądarce

AI nie wykonuje browser verification.

Sprawdzić ręcznie:

1. koń luzem przy gospodarstwie chodzi wyraźnie spokojniej,
2. ruch nie wygląda jak slow-motion / nadmierny foot sliding,
3. koń prowadzony lub reagujący na zagrożenie nadal porusza się normalnie,
4. po dosiadzie walk jest wyraźnie szybszy od calm wander,
5. sprint/run pod siodłem nadal działa bez zmian.

## Dalsze rozszerzenie

Nie tworzyć teraz osobnego planu dla innych gatunków ani NPC.

Po implementacji ten sam data seam ma umożliwić bardzo tani tuning np. donkey/cow/sheep, jeżeli browser feedback pokaże ten sam problem. Osobny plan jest uzasadniony dopiero wtedy, gdy potrzebne będzie rozróżnienie większej liczby autonomous movement intents lub osobne leisure/work gait u NPC.

> **Zrób git commit i push do main, rebase jeżeli trzeba**