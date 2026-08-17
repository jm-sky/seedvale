---
domain: fauna
---

# Plan: Fauna — respawn siedliska w skali dnia świata

**Created:** 2026-08-17  
**Status:** `verification needed` 🔍  
**Priority:** medium · **Effort:** S  
**Depends on:** ~~125~~

## Cel

Timer cave/thicket (1 zwierzę / 8–12 s realnego czasu) jest arcade’owy i rozjeżdża się z time-skipem: fauna tyka `dt`, zegar świata leci `elapsedDays`. Respawn ma iść od dni świata, w tempie ~1–2 sztuki / dzień gry, z catch-up przy odpoczynku. `wolfDen` bez zmian (jednorazowa wataha).

### Efekt gameplay

- jaskinia/zagajnik są zasiedlone od znalezienia (nie puste przez dzień),
- po ubytku kolejne zwierzę wraca rzędu **dnia**, nie sekund,
- noc w namiocie / time-skip liczy się do odnowienia,
- polowanie nadal może wyczerpać punkt (próg `>50%` z planu 125 bez zmian).

## 1. Zegar

`updateSpawners()` dostaje `dayDelta` (`elapsedDays` między klatkami), nie `dt`. Pierwsza klatka po loadzie: `dayDelta = 0` (bez burstu z zapisanego `elapsedDays`). Duży skok (skip) może dołożyć kilka sztuk w jednej klatce, zawsze z capem `maxPreyCount`.

Gdy siedlisko jest pełne, timer nie bankuje — zwolnione miejsce startuje pełny interwał.

Puste siedlisko (`nearby === 0`) czeka `×2` (kolonizacja wolniejsza niż wymiana jednej sztuki).

## 2. Tempo

Jedno źródło: `SPAWNER_SPECS` w `createFauna.ts`. Jednostka: **dni gry**.

| Typ | Gatunek | Interwał | Cap |
|---|---|---|---|
| cave | deer | 1.0 | 3 |
| thicket | stag | 2.0 | 2 |
| wolfDen | wolf | `Infinity` | 2 (startowa wataha) |

Limit populacji i `RECOVERY_DAYS = 21` bez zmian.

## 3. Startowa populacja

Cave/thicket przy stawianiu od razu spawnują `maxPreyCount` z `spawnPointId` (jak wataha `wolfDen`, ale z księgowaniem zgonów). Respawn tylko uzupełnia ubytki.

## 4. Poza zakresem

- ring `SPAWNS` / livestock / naturalna reprodukcja,
- persystencja stanu spawn pointu (już w `LOOSE-ENDS.md`),
- zmiana `maxPreyCount` / recovery 21 dni / `wolfDen`,
- nowy menedżer populacji.

## Kryteria akceptacji

1. Jaskinia/zagajnik mają zwierzęta od razu po zbudowaniu świata.
2. Ubytek uzupełniany w skali dnia (jeleń ~1/dzień, stag ~1/2 dni), nie w sekundach.
3. Time-skip / `elapsedDays` dogania respawn; reload nie zrzuca paczki z zaległego czasu.
4. Pełne siedlisko nie spawnuje; `depleted`/`disabled`/`recovering`/`wolfDen` bez respawnu.
5. `tsc`, lint, testy, build.
6. Wymagana weryfikacja w przeglądarce.

## Weryfikacja

Techniczna:

- `npx tsc --noEmit`
- `npm run lint`
- `npm run test`
- `npm run build`

Browser/play:

- nowy świat: przy jaskini 3 jelenie, przy zagajniku 2 stagi,
- zabić 1, poczekać / skipnąć ~1 dzień, pojawi się 1 (nie paczka),
- pełne siedlisko nie dokłada kolejnych,
- `wolfDen` nadal jednorazowa wataha.

## Implementation summary (2026-08-17)

Extended `PreySpawner` / `updateSpawners` / `createFauna` — no new manager.

- **Day clock** — `respawnTime` (real seconds) → `respawnIntervalDays`. `updateSpawners(dayDelta)` accumulates `elapsedDays`; first `Fauna.update` after create/load uses `dayDelta = 0` so a restored clock does not dump a backlog. A large skip can spawn more than once, always capped at `maxPreyCount`. Full habitat zeroes the timer (a vacancy starts a full interval). Empty habitat (`nearby === 0`) waits `EMPTY_HABITAT_RESPAWN_MULTIPLIER = 2`.
- **Rates** — cave/deer `1` day, thicket/stag `2` days, `wolfDen` `Infinity` (unchanged one-shot pack, still untagged).
- **Initial pop** — cave/thicket spawn `maxPreyCount` at placement with `spawnPointId` so deaths still deplete.
- **Tests** — `AnimalSpawner.test.ts`: zero-delta, empty vs replacement interval, catch-up cap, no banking at cap, non-`active` / `Infinity` skip.

### Verification

- **Implemented** — all of the above.
- **Technically verified** — `npx tsc --noEmit` clean; `npm run test` 910/910; `npm run build` clean. `npm run lint` — 1 pre-existing `prefer-const` in `settlement/props.ts`, unrelated.
- **Browser/manual verified** — **not done**. Needs: new world shows 3 deer at the cave and 2 stags at the thicket; kill 1, wait or skip ~1 day, exactly one replacement (not a burst); full habitat adds none; `wolfDen` pack still one-shot.

