# Seedvale — napraw locomotion NPC przy dysku domu (plan 108)

**Status:** `verification needed`
**Created:** 2026-08-14
**Plan (wiążący):** [docs/plans/archive/2026-08-14--108--npc-stuck-at-house-locomotion.md](../plans/archive/2026-08-14--108--npc-stuck-at-house-locomotion.md)

## Cel

Zaimplementuj **plan 108, P0 + P1**. NPC przestają utykać w / przy domku przy drewnie i wodzie.

To jest **locomotion**, nie stamina. Watchdog (S8) już jest — nie pisz drugiego. Nie modeluj drzwi. Zostaw dysk domu. Zmień **gdzie leży cel** i **jak rescue próbkuje**.

## Przeczytaj najpierw

1. `CLAUDE.md`
2. `docs/STATE.md`
3. **Cały** `docs/plans/archive/2026-08-14--108--npc-stuck-at-house-locomotion.md` — findings F1–F7 i P0/P1 są kontraktem, nie tłem.
4. `docs/state/settlements.md` — S8 (już wskazuje 108).
5. Kod: `src/ai/NpcAgent.ts` (`isWalkable`, `steerTo`, `steerWithRescue`, `resolveSteerTarget`, `attemptRepath`, `attemptLocalEscape`, `abandonStuckAction`, `emergencyTeleport`, `beginNeed`, `goSleep`, `wanderNear`), `src/ai/npcMovementWatchdog.ts` + test, `src/world/collision.ts`, `src/settlement/createSettlement.ts` (rejestr colliderów domów).

## Stan, którego nie zgaduj

- `NpcAgent.home` = środek domu = środek collidera (`footprintRadius`, hut_d = 2.0 m). Pełny dysk, nie otwór drzwi.
- Łatka 097 (`isWalkable`: collider, w którym NPC **już jest**, nie blokuje kroku) zostaje — tylko *wyjście*.
- Watchdog `repath → escape → abandon → teleport` zostaje. Testy FSM zostają. Złe jest to, że `isWalkable` uznaje wnętrze domu za legalny punkt rescue, a `emergencyTeleport` wraca na `home`.
- `ARRIVE = 0.55`, `NPC_COLLIDER_CORE_FRACTION = 0.55` (rdzeń hut_d = 1.1 m). Nie powiększaj `ARRIVE`. Nie obniżaj `CORE_FRACTION`.
- `HOME_WATER_CHANCE = 0.45` i jedzenie 069 w domu celują w `this.home`. Drewno celuje w drzewo — objaw „stoi w domku, zajmuję się drewnem” to wyjście + zły rescue, nie zły dest.
- `steerTo` ustawia `moving = true` **przed** kolizją → moonwalk (Walk bez zmiany x/z).

## Zrób (P0 + P1)

Trzymaj się planu 108. Kolejność:

1. **P0 — cel na obręczy.** Czysta funkcja testowalna bez Three.js (np. `destinationOnColliderRim(pos, dest, colliders)` w `src/ai/` albo obok `collision.ts`): jeśli `dest` leży w colliderze, w którym NPC **nie** stoi, zwróć punkt na obręczy (`radius` + mały margines, od strony NPC). Użyj w `startAction`, `goSleep`, `wanderNear` (fallback na `anchor`), spójnie z `resolveSteerTarget`. Picie/jedzenie/sen „w domu” = przy ścianie od zewnątrz. NPC już w środku nadal wychodzi (łatka 097) do drzewa / studni / stosu.

2. **P1 — rescue na zewnątrz.** `attemptRepath` / `attemptLocalEscape`: punkt OK tylko gdy leży **poza każdym colliderem, w którym NPC obecnie stoi** (osobny probe bez wyjątku „już w środku”). Najpierw pierścień, który wychodzi (`> footprintRadius`), nie hop 1.5 m do środka. `emergencyTeleport`: **nie** `home`; kandydaci = obręcz studni / stosu / ogrodu, zwalidowane z zewnątrz. Log `[npc:rescue] emergency teleport` bez zmian. Po `abandon`: krótki cooldown albo remap, żeby `choose` nie wznawiał tej samej zablokowanej destination w tej samej klatce.

3. **P1 — animacja.** `moving = true` tylko gdy `x/z` faktycznie się zmieniły w tej klatce.

Opcjonalnie (plan 108 P1): strike watchdoga gdy netto brak postępu **ku celowi**, nawet przy mikroślizgu osi — tylko jeśli nie psuje istniejących testów FSM; w razie tarcia zostaw próg jak jest i opisz w notatce.

## Nie rób

- Drzwi w GLB, walkable interior, A* / navmesh, nowy collision system.
- Drugi watchdog, zmiana stawek staminy, przepisanie `Needs` / 069 / kolejki studni.
- Przeliczenie `footprintRadius` z AABB (issue 018 / katalog 074) — P2.
- `AnimalAgent`, chyba że ten sam helper rim jest trywialny do reuse bez zmiany zachowania.
- Headless Chrome / Playwright.
- Commit, chyba że użytkownik poprosi.

## Weryfikacja

Techniczna: `npx tsc --noEmit`, `npm run lint`, `npm run test` (watchdog + nowa funkcja rim).

Browser — **nie** odpalaj headless. Podaj kroki na już działający `npm run dev` (`localhost:5577`, `?debug=1`):

1. NPC w domu, `goTo · chop` / „zajmuję się drewnem”: w ≤ ~8 s wychodzi do drzewa **albo** `rescue escape`/`abandon` stawia go **poza** dyskiem (nie teleport na środek).
2. NPC przy ścianie, „idę po wodę”: dochodzi do studni / obręczy i `execute`, **albo** Idle + eskalacja rescue — **bez** moonwalku.
3. Konsola: `[npc:rescue] emergency teleport` rzadkie; gdy jest, `x,z` ≠ środek domu.
4. Sen o zmierzchu: z zewnątrz dochodzi do obręczy domu i śpi, nie tkwi w `goSleep` przy ścianie.

Po implementacji: status planu 108 → `verification needed`; krótka notatka w planie (co weszło z P0/P1). Zaktualizuj S8 w `docs/state/settlements.md` tak, żeby mówiło prawdę (watchdog + rim destination). Nie oznaczaj playtestu jako zrobionego.

## Definition of done

P0 + P1 w kodzie, testy czystej funkcji + watchdog zielone, S8 zgodne z kodem, playtest zostawiony użytkownikowi.
