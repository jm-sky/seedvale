# Implementation notes: Mobile Combat — Forgiving Target Acquisition & Auto-Facing

**Plan:** [142 — Mobile Combat](./2026-08-17--142--mobile-combat-target-acquisition.md)
**Created:** 2026-08-17
**Status:** `verification needed` 🔍

## Co zostało zaimplementowane

Zgodnie z planem: bez nowego `MobileCombatManager`, bez drugiego systemu targetów, bez auto-combat i bez lock-onu. Zmiana to jeden nowy parametr trybu celowania + jedna czysta funkcja pomocnicza.

### 1. `CombatAimMode` + szerszy cone dla touch (`src/app/interactables.ts`)

```ts
export type CombatAimMode = 'pointer' | 'touch'

export const COMBAT_TARGET_CONE_DOT: Record<CombatAimMode, number> = {
  pointer: Math.SQRT1_2, // 90° pełnego stożka — wartość z planu 124, bez zmian
  touch: 0.3,            // ~145° pełnego stożka
}
```

- `COMBAT_TARGET_CONE_DOT` było wcześniej pojedynczą stałą (`Math.SQRT1_2`); zostało zamienione na tablicę per-tryb, a nie zduplikowane w drugą stałą, żeby call site musiał świadomie wybrać tryb.
- `buildCombatTarget()` przyjmuje dodatkowy argument `aim: CombatAimMode` i przekazuje `COMBAT_TARGET_CONE_DOT[aim]` do istniejącego `pickCombatTarget()`. To jedyna różnica między trybami w tej funkcji.
- `COMBAT_TARGET_RANGE` (7) **nie** został zmieniony — plan dopuszczał drobne zwiększenie zasięgu jako opcję („ewentualnie”), ale 7 jest już wyraźnie większe niż `GAZE_RANGE` (5) i niż zasięg każdej broni (≤3.0), więc problemem na mobile jest kierunek, nie dystans.
- Ranking (dot → dystans → pamięć ostatnich celów) i cała reszta `pickCombatTarget()` bez zmian.

### 2. Auto-facing przez commit yaw ataku (`src/player/playerMelee.ts`, `src/app/gameLoop.ts`)

Nowa czysta funkcja:

```ts
export function yawToward(playerX, playerZ, targetX, targetZ): number | null
```

zwraca yaw w konwencji hit testu (`forward = (-sin(yaw), -cos(yaw))`), albo `null` gdy punkty się pokrywają.

W `gameLoop.ts`:

- `const aimMode: CombatAimMode = touchControls ? 'touch' : 'pointer'` — liczone raz przy tworzeniu pętli, nie per-frame (touch chrome jest montowane raz na sesję).
- Nowe `let attackYaw: number | null = null`. Ustawiane **tylko** dla `aimMode === 'touch'` w momencie udanego `requestAttack()`, po `gapClose()` (kolizja może zsunąć gracza z prostej do celu). Czyszczone po rozwiązaniu trafienia i przy modal/pause reset.
- `resolveMeleeHits(...)` dostaje `attackYaw ?? mouseLook.state.yaw`. Na desktopie `attackYaw` jest zawsze `null`, więc trafienie liczy się z żywego yaw kamery — dokładnie jak dotąd.

#### Dlaczego yaw ataku, a nie tylko `player.faceToward()`

`player.faceToward(target)` już istniało i było wołane przy każdym ataku (plan 124), ale obraca **mesh** postaci. Hit test (`resolveMeleeHits`) używa yaw **kamery/aim**, nie rotacji mesha. Bez zmiany yaw podawanego do hit testu szerszy cone akwizycji na mobile dawałby atak, który nie może trafić: cone akwizycji planu 124 (dot 0.707) jest węższy niż `arcDot` każdej broni (0.35–0.6), więc każde poszerzenie akwizycji poza 0.707 wchodzi poza łuk trafienia.

Dlatego auto-facing zaimplementowano jako *commit* yaw ataku do kierunku na cel. To jest odstępstwo od dosłownego brzmienia planu („wykorzystać istniejącą rotację/yaw `PlayerController`”), ale spełnia jego cel i wymagania:

- **hit detection nie zostało zmienione** — `resolveMeleeHits` ma tę samą logikę i te same stałe; zmienił się tylko yaw podawany na wejściu, i to tylko na touch;
- kamera i sterowanie ruchem nie są ruszane (nie piszemy do `mouseLook.state.yaw`), więc gracz nie traci kontroli w trakcie ataku;
- nie ma ciągłego lock-onu: yaw jest zamrażany raz, na start ataku, i konsumowany raz, w oknie trafienia.

Efekt uboczny (zamierzony): na touch cel, który odejdzie w bok podczas wind-upu, może zostać nietrafiony — bo yaw jest zamrożony, a nie śledzi celu. To jest zgodne z „nie auto-combat”.

### 3. Testy (`src/player/playerMelee.test.ts`)

Dodano `describe('mobile target acquisition & auto-facing (plan 142)')`, 7 testów:

- `pointer` zachowuje szerokość stożka z planu 124 i odrzuca cel 60° od osi;
- `touch` ten sam cel akwiruje;
- `touch` nadal odrzuca cel prostopadły i za plecami;
- ranking w szerszym stożku bez zmian (bardziej wycentrowany wygrywa, niezależnie od kolejności wejścia);
- `yawToward()` liczy poprawny kierunek w konwencji hit testu (w tym z pozycji gracza ≠ origin);
- `yawToward()` zwraca `null` gdy cel jest w punkcie gracza (brak zmiany kierunku);
- atak z auto-facing trafia cel, który przy yaw kamery byłby poza `arcDot` noża.

Nie tworzono nowego frameworka testowego — testy dopisane do istniejącego pliku.

## Weryfikacja

**Zaimplementowane** ✅
**Zweryfikowane technicznie** ✅ — `npx tsc --noEmit`, `npm run build`, `npm run test` (116 plików / 950 testów), `npx eslint` czysty na `src/`.
**Zweryfikowane w przeglądarce** ❌ — brak; wymaga sprawdzenia na mobile viewport / touch emulation wg listy w planie (§ Browser verification).

Uwaga: przy starcie pracy `npm run lint` miał 14 błędów odziedziczonych z `main` (`_temp/` — gitignored, oraz kolejność importów w `src/app/createApp.ts` i `src/persistence/saveData.ts`, czyli plikach CI-owych). Trzy błędy w `src/` naprawiono `eslint --fix` przy okazji, bo blokowały bramkę CI; `_temp/` nie jest w repo.

## Poza zakresem (nie zrobione, świadomie)

- Osobny przycisk ataku / hold-to-attack (plan: out of scope). Atak na touch nadal idzie przez przycisk interakcji (`[E]`) nad celem z promptem „Atakuj: X”.
- Zmiana `COMBAT_TARGET_RANGE` dla touch.
- Jakiekolwiek zmiany damage/staminy/cooldownów/timingów.
- Dosłowna wartość `0.3` dla stożka touch jest wstępna — dobrana tak, by objąć cały łuk trafienia najszerszej broni z zapasem, przy zachowaniu wyraźnej kierunkowości. Do dostrojenia po teście w przeglądarce.
