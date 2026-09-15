# Plan: Player-owned animal Stay safety and recovery

**Created:** 2026-09-15
**Status:** `planned` 📋
**Type:** bug
**Priority:** high · **Effort:** M
**Depends on:** ~~fauna-020~~, ~~fauna-015~~, ~~fauna-029~~
**Domain:** `fauna`
**Subdomains:** `domestication` `behavior` `lifecycle`
**Tags:** `ownership` `horse` `stay` `water` `persistence`
**Roadmap:** `horse-and-riding.md`
**Model:** `Opus`, `Sonnet`

## Cel

Zapobiec sytuacji, w której kupione/player-owned zwierzę pozostawione komendą Stay znika z oczekiwanej okolicy bez czytelnego, trwałego powodu.

Stay ma nadal współpracować z fizjologią i wspólnym animal AI, ale musi tworzyć bezpieczny, przewidywalny anchor: zwierzę może lokalnie zaspokoić potrzeby, po czym wraca, zamiast rozpocząć daleki autonomous trip lub zniknąć w wyniku streamingu/lifecycle drift.

## Recon

- `fauna-020` jest zaimplementowane: ownership używa `AnimalOwner`, player-owned livestock jest odpinane od settlement collection i utrzymywane przez detached persistent collection w `SettlementsManager`/`settlement/livestock.ts`.
- `transferAnimalOwnership(...)` przenosi tę samą instancję do `detached`, zapisuje origin settlement i `registry.upsert(...)`.
- `restoreDetachedPlayerOwnedLivestock(...)` odtwarza player-owned records niezależnie od source settlement streamingu.
- `src/fauna/ownedAnimalControl.ts` persistuje `mode` i `stayAnchor`.
- `resolveOwnedControlMovement(...)` dla `stay` zwraca tylko `{ kind: 'stay' }`; sam anchor nie jest ruchem powrotnym.
- Implementation notes `fauna-020` celowo dopuszczają, że needs/threat mogą tymczasowo odsunąć zwierzę od anchoru.
- Animal physiology i water traversal pozostają wspólne dla owned/wild fauna. Drowning działa podczas faktycznego swimming przy wyczerpanej stamina; nie należy tworzyć horse-specific water rules.

## Invariants

1. Player-owned `Stay` oznacza lokalny anchor, nie permanentne zamrożenie.
2. Normalne potrzeby mogą chwilowo przejąć movement, ale Stay ogranicza zakres takich działań i wymaga powrotu do anchoru po zakończeniu potrzeby/threat.
3. Player-owned animal w Stay nie rozpoczyna periodic long-range water trip ani innego routine trip wykraczającego poza lokalny safe radius.
4. Threat/flee może wyprowadzić zwierzę dalej niż safe radius; po ustaniu zagrożenia zwierzę wraca do Stay anchoru.
5. Follow zachowuje obecną semantykę i nie dziedziczy ograniczeń Stay.
6. Mounted movement nadal używa obecnego mount pipeline.
7. Save/load, settlement unload/reload i WorldBundle rebuild nie mogą zgubić player-owned zwierzęcia ani jego Stay anchoru.
8. Śmierć player-owned zwierzęcia jest trwałym stanem lifecycle, nie cichym zniknięciem runtime entity.

## Zakres

- Rozszerzyć istniejący `ownedAnimalControl` o derived decyzję powrotu do Stay anchoru z hysteresis zamiast dodawać drugi behaviour manager.
- W normal-needs/roaming/trip seam zablokować routine long-range trip dla player-owned Stay.
- Zachować istniejący foraging/water-source selection; nie dodawać horse-only shoreline search.
- Zdefiniować bounded Stay excursion radius oparty o wspólną owned-control politykę.
- Po zakończeniu need action lub threat override normal fallback powinien preferować return-to-anchor przed zwykłym wander.
- Zweryfikować snapshot/hydrate `OwnedAnimalControlState`, detached origin map i `LivestockRegistry` dla player-owned death/removal.
- Dodać testy lifecycle dla merchant horse -> transfer -> Stay -> unload/save/load -> restore.
- Dodać test, że Stay animal z potrzebą może odejść lokalnie, ale nie przyjmuje periodic trip destination poza bounded radius i wraca do anchoru.

## Relevant files

- `src/fauna/ownedAnimalControl.ts`
- `src/fauna/AnimalAgent.ts`
- `src/fauna/animalForaging.ts`
- `src/fauna/animalRoaming.ts`
- `src/fauna/waterTraversal.ts`
- `src/settlement/livestock.ts`
- `src/settlement/SettlementsManager.ts`
- `src/fauna/AnimalAgent.test.ts`
- `docs/state/fauna.md`
- `docs/plans/implementation-notes/fauna-020-player-owned-animals-and-follow-stay-behaviour-implementation-notes.md`

## Non-goals

- `HorseManager` lub osobny player-pet simulation loop.
- Wyłączenie głodu/pragnienia dla player-owned animals.
- Uczynienie konia nieśmiertelnym lub niezdolnym do wejścia do wody.
- Teleportowanie zwierzęcia do anchoru w normalnym gameplay.
- Redesign całego fauna decision system.

## Verification

Automated:

- player-owned Stay state snapshot/hydrate,
- detached livestock survives settlement unload/reload,
- routine water trip nie uruchamia się dla Stay,
- local needs excursion + return-to-anchor,
- death/removal nie odtwarza deterministic merchant horse slotu jako duplikatu.

Manual browser verification wykonuje User:

- kupić konia, ustawić Stay w home settlement, odejść daleko i wrócić,
- save/load i ponowny powrót do osady,
- obserwować thirsty horse przy naturalnej wodzie/trough,
- potwierdzić, że po potrzebie wraca w okolice anchoru.

Przy nowych/zmienianych publicznych helperach dodać JSDoc z `@domain fauna`, jeśli poprawia to preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
