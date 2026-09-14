# Plan: Animal water route preference, remains transform, and corpse world-time

**Created:** 2026-09-14
**Status:** `verification needed` 🔍
**Type:** fix
**Priority:** high · **Effort:** L
**Depends on:** ~~fauna-015~~
**Domain:** `fauna`
**Subdomains:** `habitat` `lifecycle`
**Tags:** `water` `movement` `corpse` `persistence`
**Roadmap:** -
**Model:** Grok, Sonnet

## Cel

Naprawić trzy powiązane błędy po fauna-015 / corpse presentation:

1. Zwykłe zwierzęta lądowe wchodzą do głębokiej rzeki podczas wander/navigation i mogą się utopić, bo istnieje fizyczna zdolność pływania, ale nie ma route preference.
2. Naturalne kości stoją pionowo, bo dziedziczą `mesh.rotation.z = ±π/2` po tipped corpse root.
3. Lifecycle trupa używa krótkich timerów real-time (`20/40/60 s`) zależnych od ticka agenta zamiast czasu świata.

Rozdzielić na stałe:

```text
physical ability != autonomous preference
```

## Non-goals

- `kind === 'sheep'` / zakaz pływania livestock
- przywrócenie wody jako hard wall w `isWalkable()`
- osobny swimming/movement controller
- NPC swimming
- persystencja ordinary wild corpses przy stream-out
- drugi równoległy corpse timer

## 1. Water route preference

Zostawić `isWalkable()` / `classifyWaterTraversal()` jako **ability**. Preference dodać jako scoring/cost:

- `WaterRouteIntent`: `'preferDry'` | `'allowSwim'`
- land animal + `preferDry`: dry/wading tanie, swimming drogie (skończony mnożnik)
- `waterAdapted` (duck): swimming kosztuje jak dry
- `allowSwim` (flee/chase): fizyczny koszt 1, swimming dozwolone

`NavigationQuery` dostaje opcjonalne `cellCost`. NPC bez pola = bez zmian.

LOS fast-path i `simplifyPath` nie mogą przecinać komórek z `cellCost > 1`.

Wander nie wybiera swimming dest (chyba że adapted) ani dest, którego prosta przecina swimming. Wander/trip/needs idą przez `stepNavRescue` z `preferDry` i natychmiastowym repath, gdy LOS ma swimming — nie czekać na stuck (pływanie to postęp).

`driveMounted()` bez zmian (czyste ability).

## 2. Remains transform

Nie ruszać death clip / tip w `collapse()`. Tip jest pozą fresh/rotting.

`CorpseHost.settleRootForRemains()`:

- `rotation.z = 0`
- Y do terrain/water bed (`sampleHeight` / cave floor), nie live swim-float `snapY()`

Wołać przy attach natural bones i harvest remains.

## 3. Corpse world-time

Wzorzec NPC `deathAtDays`. Źródło: `dayNight.elapsedDays` (`nowDays`).

```text
fresh:   4 world-hours
rotting: 36 world-hours
bones:   72 world-hours
remove:  112 world-hours ≈ 4.667 days
```

Harvested linger: 2 world-hours od `harvestedAtDays` (osobna zasada, też world-time). Bury: natychmiast `readyToRemove` (bez hacka timera). `held` blokuje tylko dispose, nie pauzuje wieku. `resolveTimeSkip` nie dopisuje sekund do corpse.

Save **41 → 42**: `{ deathAtDays, meatHarvested, harvestedAtDays? }`. Migracja `deathAtDays = elapsedDays - realSecondsToGameDays(timeSinceDeath, 480)`.

Stray: usunąć kap 960 s; naturalny world-time linger wystarcza. Inspect zostaje flagą questa.

## Testy

Water preference, remains world-up, corpse phase/remove/time-skip/save/stream-in, migracja v41.

## Weryfikacja

`npx tsc --noEmit`, lint zmienionego zakresu, testy fauna/navigation/persistence, build. Browser verification: użytkownik.
