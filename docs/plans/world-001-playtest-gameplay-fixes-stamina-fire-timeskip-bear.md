# Plan: Playtest Gameplay Fixes — Stamina, Fire Time-Skip and Bear Behaviour

**Created:** 2026-08-26
**Status:** `verification needed` 🔍
**Priority:** high · **Effort:** M
**Depends on:** `192`
**domain:** `world`

## Cel

Naprawić trzy problemy wykryte podczas playtestu:

1. brak kosztu stamina podczas `Przygotuj teren`,
2. brak kosztu stamina podczas pracy nad studnią,
3. niepoprawne zużywanie paliwa ogniska podczas sleep/time-skip,
4. zbyt łatwe płoszenie niedźwiedzia.

Prey selection celowo poza zakresem — nie zmieniany.

## 1. Stamina dla długich akcji

`BusyAction` (`src/app/busyAction.ts`) rozszerzony o opcjonalny `staminaCostPerSec` w `BusyStartOptions`; `createBusyAction()` przyjmuje teraz opcjonalny `drainStamina(amount)` callback (domyślnie no-op), tak żeby moduł zostawał niezależny od `PlayerNeeds` (testy w `busyAction.test.ts` dalej działają bez zmian). `createApp.ts` wpina go jako `createBusyAction((amount) => drainStamina(player.needs.stamina, amount))`.

Nowa stała `BUSY_ACTION_STAMINA_COST_PER_SEC = 6` w `src/player/PlayerNeeds.ts` (obok innych stamina tuningów) — koszt drenowany ciągle w `tick(dt)`, proporcjonalnie do faktycznego czasu trwania, nigdy jako lump sum na starcie.

Podpięte w:
- `src/app/actions/groundActions.ts` — `startDigAt`, `startPickaxeDigAt`, `startLevelAt`, `startPickaxeLevelAt`, `startMoundAt` (`DIG_DURATION_SEC` = 2s → ~12 stamina/akcja).
- `src/app/actions/placementActions.ts` — `workOnWell` (bout `WELL_WORK_SESSION_SEC` = 8s → ~48 stamina/bout).

Chop/mine (`startTreeChop`, `startDepositMine`) świadomie pominięte — poza zakresem plan opisywał tylko "Przygotuj teren" + studnię.

`StaminaState.ts` niezmieniony; brak osobnego `ActionStaminaSystem`.

## 2. Ognisko podczas sleep/time-skip

Root cause: `bundle.placedFires.update(dt)` w `gameLoop.ts` używał surowego `dt`, nie `worldDt` (już istniejący, skalowany przez `dayNight.timeMultiplier` podczas time-skipu — używany przez `tickPlayerNeeds` itd.). Podczas 8h snu (`SECONDS_PER_SKIPPED_HOUR` = 1 realna sekunda/godzinę gry) ognisko traciło tylko ~8 sekund paliwa zamiast 8 godzin.

Ognisko settlement (`Settlement.fire`, aktualizowane wewnątrz `settlementsManager.update()`) w ogóle nie tykało podczas skipu, bo cały `update()` jest bramkowany `if (!timeSkip.isActive())` (plan 196 — zamrożenie NPC/fauny na czas skipu).

### Fix

- `createSettlement.ts`: wydzielony `tickFire(dt)` z `update()` (samo `fire?.update(dt)`), dodany do `Settlement` type.
- `gameLoop.ts`: `for (const s of loaded) s.tickFire(worldDt)` + `bundle.placedFires.update(worldDt)` — wywoływane bezwarunkowo, poza blokiem `if (!timeSkip.isActive())`, tym samym mechanizmem co `tickPlayerNeeds(player.needs, worldDt, ...)`.

Brak specjalnego `if (sleeping) fuel -= ...` — ogień płynie przez ten sam `worldDt` co reszta systemów player-needs; brak też osobnego "catch-up" przy `justFinished` (niepotrzebny, bo tick jest ciągły, nie zamrożony).

## 3. Niedźwiedź — zbyt łatwe flee

`src/fauna/predatorHumanDecision.ts` rozszerzony o:

- `ATTACK_BIAS.bear = -0.3` (mniej hunger-driven niż wolf),
- nowy `FLEE_BIAS` (tylko `bear: -0.55`) — obniża `fleeScore` wyłącznie dla niedźwiedzia, wolf/fox bez zmian,
- nowy `CALM_SCORE_THRESHOLD` (tylko `bear: 0.05`) — gdy zwycięski score spada poniżej progu, `decidePredatorHumanIntent` zwraca nowy trzeci wynik `'ignore'` zamiast wymuszać binarny attack/flee,
- `CLOSE_AGGRESSION_SPECIES` (`wolf`, `bear`) — uogólniony dawny `isWolf` gate, więc sprowokowany/bardzo bliski niedźwiedź korzysta z tego samego retaliation/close-attack roll co wilk zamiast osobnego mechanizmu.

`PredatorHumanIntent` = `'attack' | 'flee' | 'ignore'`. `AnimalAgent.ts` (`decideHumanResponse`/`decideNpcResponse` branch w `update()`) obsługuje `'ignore'` przez `setIntent('wander'); this.wander(dt)` — ten sam brak reakcji co przy braku wykrytej ofiary, żadnego nowego "idle" mechanizmu.

Rezultat: daleki, niegroźny człowiek → `ignore` (kontynuuje wander); zbliżenie w `playerPanicRange` → normalny flee/roll-based attack; obrażenia (`provoked`) → natychmiastowy retaliation roll, tak jak u wilka. `playerPanicRange`/`playerNoticeRange`/`detectRange` niedźwiedzia niezmienione.

Nowe testy w `predatorHumanDecision.test.ts` (`describe('bear playtest fixes ...')`) pokrywają ignore/close/retaliation/low-HP ścieżki; istniejące wolf/fox testy przechodzą bez zmian (bear-only entries, `CLOSE_AGGRESSION_SPECIES` zawiera oryginalny `wolf`).

## Pliki objęte zmianami

- `src/app/busyAction.ts`, `src/app/busyAction.test.ts` (bez zmian, zweryfikowano że nadal przechodzi)
- `src/app/createApp.ts`
- `src/app/actions/groundActions.ts`
- `src/app/actions/placementActions.ts`
- `src/player/PlayerNeeds.ts`
- `src/app/gameLoop.ts`
- `src/settlement/createSettlement.ts`
- `src/fauna/predatorHumanDecision.ts`, `src/fauna/predatorHumanDecision.test.ts`
- `src/fauna/AnimalAgent.ts`

**Prey selection nie zmieniony.**

## Verification

### Technical — done

```text
npx tsc --noEmit   ✅
pnpm run lint:fix  ✅
pnpm run build     ✅
pnpm run test      ✅ (1894/1894)
```

### Browser — needed

- Wykopać/wyrównać/usypać teren, obserwować spadek stamina proporcjonalny do czasu trwania akcji.
- Rozpocząć/przeprowadzić kilka bout'ów pracy nad studnią, sprawdzić spadek stamina i że przerwanie (Esc) nie liczy dodatkowego kosztu poza faktycznie przepracowanym czasem.
- Zapalić ognisko (60 min paliwa), przespać 8h — ognisko powinno zgasnąć; sprawdzić też ognisko osady (village fire).
- Zapalić ognisko z dużą ilością paliwa (10h), przespać 8h — powinno zostać ~2h.
- Podejść do niedźwiedzia z dużej odległości → brak reakcji; wejście w notice range → nadal spokojny; wejście w panic range → flee/occasional attack roll; uderzyć niedźwiedzia → natychmiastowa retaliation (attack/flee wg roll i HP).
