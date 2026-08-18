---
domain: fauna
---

# Implementation notes: probabilistyczna percepcja zwierząt (plan 120)

## Zmienione pliki

- `src/fauna/playerAwareness.ts` — rozszerzony (nie zastąpiony): `effectiveNoticeRange` bez zmian; nowe `detectionProbability`, `detectionRoll`; `isPlayerNoticed` rozszerzony o pole `roll` w `NoticeParams`, teraz porównuje roll z `detectionProbability` zamiast progu dystans/facing.
- `src/fauna/playerAwareness.test.ts` — rozszerzony o testy `detectionProbability`/`detectionRoll` (21 testów łącznie, było 9).
- `src/fauna/AnimalAgent.ts` — `senseEnvironment()` przyjmuje teraz `dt`, dolicza cache'owany roll (`perceptionRollTimer`/`perceptionTick`/`cachedPerceptionRoll`) i przekazuje go do `isPlayerNoticed()`; nowa stała `PERCEPTION_ROLL_INTERVAL_SEC = 0.5`; drobna aktualizacja komentarza `AnimalDef.playerPanicRange`.

## Funkcja probability/falloff

```
detectionProbability(distance, facingDot, panicRange, noticeRange, dayFactor, forestFactor, minFacingDot)
  effectiveRange = effectiveNoticeRange(noticeRange, dayFactor, forestFactor)  // bez zmian
  jeśli distance >= effectiveRange → 0
  jeśli distance <= panicRange     → closeRangeProbability: 0.99 (dystans 0) → 0.9 (granica panicRange), facing ignorowany
  inaczej                          → farRangeProbability (0.9 × (1-t)^2.2, t = postęp panicRange→effectiveRange) × facingModifier(facingDot)
```

Wartości graniczne z testów: dystans 0 → ~99%; granica `panicRange` → ~90%; blisko granicy `effectiveRange` → ułamek procenta, ale nigdy dokładnie 0 dopóki `distance < effectiveRange`.

## Wpływ `facingDot`

`facingModifier(facingDot, minFacingDot)`: 1.0 wprost z przodu → 0.55 na starym progu binarnym (`minFacingDot`, domyślnie 0.3) → 0.03 wprost z tyłu (`facingDot = -1`), ciągła interpolacja liniowa w obu odcinkach. Nie zmienia sposobu liczenia `facingDot` w `AnimalAgent.senseEnvironment()`. W obrębie `panicRange` `facingDot` jest całkowicie ignorowany (zaskoczenie z bliska niezależnie od kierunku patrzenia) — zachowuje poprzednią semantykę `panicRange`.

## Determinizm

Brak `Math.random()`. `detectionRoll(animalId, tick)` = FNV-1a hash `animalId` (ten sam idiom co `settlement/household.ts`/`economy/initial.ts`) zmieszany z `tick` przez Wang-style `hash01` (ten sam idiom co `world/weather.ts`). `tick` to per-agentowy licznik w `AnimalAgent`, inkrementowany co `PERCEPTION_ROLL_INTERVAL_SEC` (0.5 s) — identyczna sekwencja `dt` (identyczny stan symulacji) zawsze daje identyczną sekwencję rolli. Różne `animalId` dają niezależny wzorzec (test `produces a different pattern per animal`).

## Wpływ na CPU/update frequency

`detectionProbability` liczony co klatkę tak jak wcześniej binarny check (bez nowych raycastów/spatial queries) — czysta arytmetyka. Sam „rzut kością" (`detectionRoll`, hash) jest throttlowany do raz na 0.5 s per zwierzę (nowy `perceptionRollTimer`, ten sam wzorzec co istniejący `humanDecisionTimer`/`HUMAN_DECISION_INTERVAL_SEC`), więc prawdopodobieństwo nie jest przerzucane 60×/s — unika to zarówno niepotrzebnego kosztu, jak i nierealistycznie szybkiej kumulacji szansy wykrycia przy staniu w miejscu. Żadnych nowych struktur śledzących wszystkie zwierzęta ani nowych zapytań przestrzennych.

## Wyniki testów/typecheck/lint/build

- `npx vitest run src/fauna/playerAwareness.test.ts` — 21/21 ✅
- `npm run test` (pełny zestaw) — 98 plików / 756 testów ✅ (bez regresji w pozostałych testach fauna: `herdCohesion`, `predatorHumanDecision`, itd.)
- `npx tsc --noEmit` — ✅ bez błędów
- `npx eslint src/fauna/playerAwareness.ts src/fauna/playerAwareness.test.ts src/fauna/AnimalAgent.ts` — ✅ bez błędów (pełny `npm run lint` ma 11 przedistniejących błędów w `_temp/asset-audit/inspect.mjs`, niezwiązanych z tą zmianą)
- `npm run build` — ✅ (`vue-tsc --noEmit && vite build` przechodzi; ostrzeżenie o rozmiarze chunka jest przedistniejące)

## Browser / gameplay verification

Accepted 2026-08-18 (playtest).

## Potwierdzenie zachowania istniejącego flee/react

`fleeFrom()`, `ALERT_HOLD_SEC`, `decideHumanResponse`/`predatorHumanDecision.ts`, `AnimalLife`, herd behaviour, unikanie ognia/wioski — nietknięte. Jedyna zmiana w `AnimalAgent.update()`/`senseEnvironment()` to sposób wyliczenia `noticed` (wejście do tej samej ścieżki `sense.playerActive` co wcześniej); reakcja po wykryciu identyczna jak przed planem.
