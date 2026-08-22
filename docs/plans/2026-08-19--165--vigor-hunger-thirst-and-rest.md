# Plan: Vigor, Hunger, Thirst and Rest

**Created:** 2026-08-19  
**Status:** `verification needed` 🔍 — implemented 2026-08-20. Technical verification green (`tsc`/lint/build/test, 1299 tests). No browser/gameplay verification yet — see "Implementation summary" at the bottom of this file for deviations from the plan text (notably: starvation/dehydration duration is transient, not persisted).
**Priority:** medium · **Effort:** M  
**Depends on:** `none`

## Cel

Urealnić zachowanie Vigor, Hunger i Thirst oraz zapewnić poprawną aktualizację status bars podczas odpoczynku i snu.

Plan jest oparty na sprawdzeniu obecnej implementacji. Najpierw zachowujemy istniejące mechanizmy, które już spełniają założenia, a zmieniamy tylko te elementy, które powodują niepożądane zachowanie.

## Jest

### Vigor

- `VigorState` przechowuje `max` i `current`.
- Vigor jest obecnie drenowany w oparciu o czas symulacji.
- Przy obecnej konfiguracji tempo jest na tyle duże, że stojący bezczynnie PC/NPC traci Vigor co kilka sekund czasu rzeczywistego.
- Obecny model traktuje passive drain jako zużywanie Vigor w ciągu dnia aktywności.
- Istnieją osobne funkcje `drainVigor()` i `restoreVigor()` oraz próg collapse.

### Hunger

- `HungerState` przechowuje `max` i `current`.
- `current` oznacza poziom najedzenia/satiation i spada w kierunku `0`.
- Obecny licznik został zaprojektowany tak, aby opróżniać się w ciągu kilku dni gry.
- `HUNGER_STARVING_THRESHOLD` wynosi obecnie `0`.
- Po osiągnięciu `0` głód może bezpośrednio powodować damage HP.
- Nie istnieje osobny licznik czasu przebywania w stanie głodu.

### Thirst

- `ThirstState` ma analogiczny model `max/current`.
- `THIRST_DEHYDRATED_THRESHOLD` wynosi obecnie `0`.
- Po osiągnięciu `0` odwodnienie może bezpośrednio powodować damage HP.
- Nie istnieje osobny licznik czasu przebywania w stanie odwodnienia.

### Rest / Sleep

- Istnieje już mechanizm odpoczynku/obozowania oraz pełnego snu.
- Sen ma własną regenerację Vigor i Stamina.
- Nie należy tworzyć osobnego systemu regeneracji dla planu 165 — należy wykorzystać istniejące mechanizmy.

### Status bars

- HUD posiada paski HP, Stamina, Vigor, Hunger i Thirst.
- Wartości HUD są prezentacyjnym stanem UI i są synchronizowane z Player state.
- Podczas odpoczynku/snu należy zapewnić, aby zmiany Vigor/Stamina były również przekazywane do UI.

## Problem

1. Passive drain Vigor jest zbyt szybki dla postaci, która nic nie robi.
2. Hunger/Thirst przechodzą bezpośrednio z poziomu `0` do HP damage, bez okresu narastających konsekwencji.
3. Kara przy średnim poziomie Hunger nie powinna występować — konsekwencje mają pojawiać się dopiero przy znacznym głodzie.
4. Czas przebywania w stanie głodu/odwodnienia nie jest obecnie modelowany osobno.
5. Paski Vigor/Stamina muszą poprawnie odzwierciedlać regenerację podczas obozowania i snu.

## Będzie

### 1. Vigor

- Bezczynność / odpoczynek: **−1 punkt Vigor / 24 h**.
- Aktywność będzie zużywała Vigor szybciej niż bezczynność.
- Chodzenie będzie miało większy koszt niż samo stanie/odpoczynek.
- Cięższe aktywności mogą mieć jeszcze większy koszt, zgodnie z istniejącym systemem aktywności.
- Passive drain nie będzie zależny od częstotliwości aktualizacji UI ani od tego, że postać stoi bezczynnie przez kilka sekund czasu rzeczywistego.
- Istniejące `drainVigor()` / `restoreVigor()` oraz mechanizm collapse zostaną zachowane, o ile nie okaże się podczas implementacji, że wymagają zmiany.

### 2. Hunger

Zachować obecny `Hunger` jako bieżący poziom najedzenia, ale dodać osobny licznik długotrwałego głodu:

```text
Hunger
    ↓ osiąga niski poziom progowy
StarvationDuration
    ↓ rośnie w czasie
Vigor/Stamina penalty
    ↓ po długim czasie
powolny HP loss
```

Założenia:

- przy normalnym i umiarkowanym poziomie Hunger brak kary,
- kara zaczyna się dopiero przy znacznym głodzie,
- kara dla Vigor/Stamina narasta stopniowo,
- przez pierwsze około 3 dni główną konsekwencją ma być spadek wydolności, a nie HP,
- po dłuższym okresie głodu zaczyna się powolny damage HP,
- odpowiednie nakarmienie resetuje lub odpowiednio zmniejsza `StarvationDuration`.

Dokładne progi, tempo narastania penalty i tempo HP loss zostaną dobrane podczas implementacji na podstawie istniejącego systemu czasu i wartości potrzeb.

### 3. Thirst

Zastosować analogiczny model do Hunger:

```text
Thirst
    ↓ osiąga niski poziom progowy
DehydrationDuration
    ↓ rośnie w czasie
Vigor/Stamina penalty
    ↓ po dłuższym czasie
powolny HP loss
```

Założenia:

- brak istotnej kary przy umiarkowanym poziomie Thirst,
- kara zaczyna się dopiero przy znacznym odwodnieniu,
- kara dla Vigor/Stamina narasta stopniowo,
- HP loss następuje dopiero po dłuższym odwodnieniu,
- skala czasowa odwodnienia jest krótsza niż głodu,
- odpowiednie nawodnienie resetuje lub odpowiednio zmniejsza `DehydrationDuration`.

### 4. Rest / Sleep

- Wykorzystać istniejący mechanizm odpoczynku i snu.
- Obóz i sen mają nadal regenerować Vigor/Stamina zgodnie z istniejącymi zasadami.
- Nie tworzyć równoległego mechanizmu regeneracji.
- Regeneracja ma być widoczna również podczas trwania odpoczynku, a nie dopiero po zakończeniu akcji.

### 5. Status bars

- Paski Vigor i Stamina mają aktualizować się podczas odpoczynku.
- Dotyczy to w szczególności obozowania i snu.
- UI ma odzwierciedlać bieżący stan Player state w trakcie upływu czasu odpoczynku.

## Implementacja

1. Zweryfikować dokładny punkt, w którym wykonywany jest passive drain Vigor, oraz jego zależność od czasu symulacji.
2. Zmienić tylko bazowe tempo passive drain na `1 / 24 h` dla bezczynności.
3. Zidentyfikować istniejące koszty Vigor związane z ruchem i aktywnością i rozszerzyć je zamiast tworzyć równoległy mechanizm.
4. Zidentyfikować istniejącą logikę `tickPlayerNeeds` i HP damage dla Hunger/Thirst.
5. Dodać czasowe stany `StarvationDuration` i `DehydrationDuration` w miejscu będącym właścicielem potrzeb, zamiast duplikować je w UI lub PlayerController.
6. Przenieść konsekwencje głodu/odwodnienia z prostego `level == 0 → HP damage` na model zależny od czasu przebywania w stanie krytycznym.
7. Wykorzystać istniejące mechanizmy regeneracji Rest/Sleep.
8. Znaleźć miejsce synchronizacji Player state → HUD i zapewnić jego wykonywanie podczas time-skip/rest/sleep.
9. Nie tworzyć osobnych systemów dla PC i NPC, jeżeli istniejący model może być współdzielony.

## Parametry docelowe

```text
Vigor passive drain:
    -1 / 24 h podczas bezczynności / odpoczynku

Hunger:
    umiarkowany głód → brak istotnej kary
    znaczny głód → narastający Vigor/Stamina penalty
    długotrwały głód → powolny HP loss

Thirst:
    umiarkowane pragnienie → brak istotnej kary
    znaczne odwodnienie → narastający Vigor/Stamina penalty
    długotrwałe odwodnienie → powolny HP loss
```

Dokładne wartości progów i krzywych nie są częścią obecnego ustalenia i powinny zostać wyprowadzone z istniejącego modelu czasu oraz przetestowane po implementacji.

## Weryfikacja

### Vigor

- stojący bezczynnie PC nie traci około 1 punktu co kilka sekund,
- passive drain wynosi około `1 punkt / 24 h`,
- aktywność zużywa Vigor szybciej niż bezczynność,
- istniejące koszty ruchu/pracy/walki pozostają spójne z nowym passive drain.

### Hunger / Thirst

- umiarkowany głód/pragnienie nie powoduje istotnego penalty,
- penalty zaczyna się dopiero przy ustalonym niskim poziomie,
- penalty Vigor/Stamina narasta wraz z czasem,
- HP nie zaczyna spadać natychmiast po osiągnięciu `0`,
- długotrwały głód/odwodnienie powoduje powolny HP loss,
- nakarmienie/nawodnienie kończy odpowiedni stan długotrwały.

### Rest / UI

- obozowanie regeneruje Vigor/Stamina,
- sen regeneruje Vigor/Stamina zgodnie z istniejącymi zasadami,
- paski Vigor/Stamina zmieniają się wizualnie podczas odpoczynku i snu,
- po zakończeniu odpoczynku UI i Player state są zgodne.

### Techniczne

- istniejące testy przechodzą,
- build/lint przechodzą zgodnie z `CLAUDE.md`,
- brak równoległego systemu potrzeb/regeneracji,
- brak niepowiązanych refaktorów.

## Implementation summary (2026-08-20)

Implemented directly in `src/player/PlayerNeeds.ts` (owner, per the implementation notes) plus its two live consumers `src/player/playerDamage.ts` and `src/player/PlayerController.ts`, and the rest/time-skip integration in `src/app/gameLoop.ts`. No new needs/survival/regeneration system.

- **Vigor passive drain**: `VIGOR_IDLE_DRAIN_PER_SEC = 1/480` (≈ `-1 Vigor / 24 game hours` at the default `dayLengthSec=480`) replaces the old flat `100/480`/sec rate that applied unconditionally. That old rate is kept, but now only as an *extra* cost on top of idle while actually moving — `tickPlayerMovementVigor()`, called from `PlayerController.update()` only when `this.moving` — with a sprint variant 1.5× the walk rate. Idle/resting (including camp/sleep) now only pays the small baseline.
- **Hunger/Thirst duration model**: `PlayerNeeds` gained `starvationDuration`/`dehydrationDuration` (simulation-time counters, not persisted — see deviation below). `HUNGER_STARVING_THRESHOLD`/`THIRST_DEHYDRATED_THRESHOLD` (`shared/HungerState.ts`/`ThirstState.ts`) were repointed from `0` to `20` (20% of the pool) — "significant" hunger/thirst, not literal empty — and now gate duration accumulation instead of instant HP damage. `tickPlayerNeeds()` advances the duration only while the pool is at/below that threshold and resets it to `0` the instant the pool climbs back above it (via `eatFood`/`drinkWater`, or naturally on the next tick) — no extra reset logic needed in the consumer APIs. A `deprivationSeverity()` [0,1] ramp (duration ÷ a `*_SEVERE_DURATION_SEC` gate — 3 game days for hunger, 1.5 for thirst, thirst intentionally shorter) drives an additional Vigor/Stamina drain while critical (`DEPRIVATION_VIGOR_PENALTY_PER_SEC`/`DEPRIVATION_STAMINA_PENALTY_PER_SEC`) — capability loss, not a permanent max reduction, so eating/drinking restores normal capability immediately.
- **HP consequence**: `playerDamage.ts`'s live `tickPlayerStarvationDamage()` (the actual path wired into `gameLoop.ts` — the plan/notes' `PlayerNeeds.applyStarvationDamage` turned out to be dead code, never called, and was removed) now gates HP loss on `starvationDuration`/`dehydrationDuration` reaching their severe gate instead of the pool hitting `0`. `tickHealthRegen()`'s passive-HP-regen suppression (plan 153) was repointed from `isStarving`/`isDehydrated` to the same duration-gate check (`isTakingDeprivationDamage()`), since regen should only pause once damage is actually being applied, not merely once hunger/thirst is significant.
- **Rest/sleep progression bug fix**: `gameLoop.ts`'s time-skip catch-up previously froze player needs during the skip (`worldDt=0`) and applied a single lump `tickPlayerNeeds(needs, skip.hours * 3600)` on completion — a real pre-existing bug (treating game-hours as real-world hours at 3600 sec/hour instead of the correct `dayLengthSec/24 ≈ 20` sec/hour), which meant any sleep/wait skip applied ~180× too much hunger/thirst/vigor drain, unconditionally emptying both pools on every night's sleep regardless of duration. Fixed by no longer freezing: `worldDt = timeSkip.isActive() ? dt * dayNight.timeMultiplier : dt`, reusing the exact multiplier already driving the day/night clock during a skip. This both fixes the bug and satisfies §5/"Rest / Sleep" — Hunger/Thirst/Vigor (and the HUD bars already synced from them every frame) now progress continuously and correctly through the ~8-real-second sleep/wait animation instead of jumping once at the end. No second simulation loop was added — this is the same single `tickPlayerNeeds` call, just no longer artificially frozen.
- **Deviation — no persistence for `starvationDuration`/`dehydrationDuration`**: the implementation notes suggested persisting these if the save model already persists Hunger/Thirst/Vigor. `SaveData`'s migration chain (`src/persistence/saveData.ts`) is a large versioned chain (v1→v20); adding v21 for two numbers was judged disproportionate collateral risk/scope for this plan (it would also require rewriting ~15 existing `isSaveDataV20(...)` assertions in `saveData.test.ts`). Both counters are treated as transient, like Stamina — they reset to `0` on load. Consequence: a save/reload while critically hungry/dehydrated resets the "how long has this been critical" clock, delaying the Vigor/Stamina penalty and HP loss by a bit after reload. Not exploitable in normal play (would require compulsive save-scumming specifically to dodge starvation) and not covered by the plan's own verification checklist.
- **Tests**: new `src/player/PlayerNeeds.test.ts` — idle 24h-drain magnitude, drain independent of tick-size splitting, movement/sprint extra cost, duration accumulation/reset (including via `eatFood`/`drinkWater`), duration-gated Vigor/Stamina penalty and HP damage, HP-regen suppression, and that `restoreNeedsFromSleep` is unaffected by the plan 165 changes.
- Not changed: `restoreNeedsFromSleep()`'s contract (quality-capped Vigor floor + full Stamina restore), `campRest.ts` quality calculation, `VigorState`/`StaminaState` generic primitives, NPC needs (`ai/Needs.ts`, `ai/npcVigor.ts` — untouched, plan 165 is player-only per its own scope).

## Addendum (2026-08-22) — §"Deviation" superseded: now persisted (plan 200)

Plan `2026-08-22--200--arch--persistence-gaps-authoritative-state.md` added `starvationDuration`/`dehydrationDuration` to `SavePlayerNeeds` (save v27) and `restorePersistedNeeds`. The deviation above is historical only — both counters now round-trip through save/load like `hunger.current`/`thirst.current`; pre-v27 saves migrate with both defaulted to `0`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
