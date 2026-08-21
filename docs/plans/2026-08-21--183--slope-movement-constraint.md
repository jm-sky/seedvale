# Plan: Slope Movement Constraint

**Created:** 2026-08-21  
**Status:** `verification needed` 🔍  
**Priority:** medium · **Effort:** S  
**Depends on:** none

domain: items-player
tags: [world-terrain, fauna, settlements-npcs]

## 1. Cel

Ograniczyć ruch postaci (gracz, NPC, fauna) na stromym terenie: normalny teren nie wpływa na prędkość, strome zbocze ogranicza ruch **pod górę**, powyżej maksymalnego kąta ruch pod górę jest zablokowany. Ruch w poprzek zbocza i w dół nie jest tym limitem dotknięty.

## 2. Stan przed planem

- `PlayerController.update()`, `NpcAgent.steerTo()` i `AnimalAgent.steerToward()` to trzy **niezależne** implementacje ruchu (brak wspólnej klasy/funkcji ruchu) — każda liczy własny per-frame wektor przemieszczenia i osobno rozwiązuje kolizję (`world/collision.ts`'s `resolvePosition` dla gracza; własny inline `isWalkable()` dla NPC i fauny).
- Wszystkie trzy mają jednak wstrzyknięty ten sam `sampleHeight: HeightSampler` (`ChunkManager.sampleHeight`, apron-safe na granicach chunków) — to jedyny wspólny punkt.
- `HeightSampler` to tylko alias typu funkcji (`(x, z) => number`), zdefiniowany w `PlayerController.ts` i już importowany (tylko jako typ) przez `NpcAgent.ts`/`AnimalAgent.ts` — istniejący precedens cross-importu.
- Nie istniał żaden CPU-side normal/slope API ani mechanizm ograniczający ruch po nachyleniu. `player/verticalMotion.ts`'s `STEP_DOWN_MAX` to osobny, pionowy mechanizm "przyklejania" do zbocza (nie pozwala na fałszywe lądowanie), nie ogranicza prędkości poziomej.
- Istniejący precedens liczenia nachylenia z `sampleHeight` przez różnicę skończoną: `settlement/villagePlanner.ts`'s `localSlope()` (generation-time, zwraca tylko magnitude) i `fauna/createFauna.ts`'s `measureSlope()` (siting jaskiń, steepest-descent).
- `world/collision.ts` to celowo minimalny płaski (XZ) system kolizji kół — nie ma pojęcia wysokości/nachylenia i nie został tu zmieniony.

## 3. Rozwiązanie

Nowy, czysty (bez `THREE`) współdzielony moduł **`src/terrain/slopeConstraint.ts`**:

- `sampleSlope(x, z, sampleHeight, step)` — 4-punktowa różnica skończona (ten sam idiom co `localSlope`), zwraca kąt nachylenia (rad) + znormalizowany wektor "pod górę" w płaszczyźnie XZ.
- `constrainToSlope(wishX, wishZ, slope)` — rzutuje wektor ruchu na kierunek "pod górę"; tylko ta składowa jest skalowana w dół (smoothstep, ten sam wzorzec co `playerEncumbrance.ts`) między `SLOPE_FALLOFF_START_DEG` a `SLOPE_MAX_WALKABLE_DEG`, i całkowicie usuwana powyżej. Składowa w dół i w poprzek zbocza nigdy nie jest ruszana — stąd ruch po przekątnej (pod górę + w bok) naturalnie "ześlizguje się" wzdłuż zbocza zamiast zatrzymywać się w miejscu.
- `applySlopeMovementConstraint(...)` — wygodny wrapper `sampleSlope` + `constrainToSlope`, wywoływany raz na klatkę z każdego z trzech miejsc ruchu.

Parametry (jedno miejsce, moduł-level consts — zgodnie z istniejącą organizacją: `MOVE_SPEED`/`SPRINT_MULTIPLIER` w `PlayerController.ts`, `GRAVITY`/`STEP_DOWN_MAX` w `verticalMotion.ts` też nie są w `WorldConfig`, tylko stałymi modułu):

```ts
SLOPE_FALLOFF_START_DEG = 35  // poniżej: pełna prędkość
SLOPE_MAX_WALKABLE_DEG  = 55  // powyżej: ruch pod górę zablokowany
SLOPE_SAMPLE_STEP       = 1.2 // metry, sonda różnicy skończonej
```

`WorldConfig.player` nie został rozszerzony — żaden inny parametr ruchu (grawitacja, prędkość, skok) nie żyje w `WorldConfig`; trzymanie się tego wzorca było świadomą decyzją.

### Wpięcie (działa na wektor ruchu, nie na pozycję)

- **`PlayerController.update()`** — po `this.wish.normalize().multiplyScalar(speed * dt)`, przed policzeniem `candidateX/candidateZ` i `resolvePosition()`. Gdy zablokowany wektor spada do zera, `rotation.y` nie jest nadpisywana (uniknięcie snap-to-north).
- **`NpcAgent.steerTo()`** — na `stepX/stepZ` przed sprawdzeniem `isWalkable()`.
- **`AnimalAgent.steerToward()`** — analogicznie.

`gapClose()` (melee lunge w `PlayerController.ts`) i `world/collision.ts` celowo nie zostały dotknięte — poza zakresem (osobny, krótki mechanizm skoku, nie "chodzenie").

### Koszt / granice chunków

4 dodatkowe wywołania `sampleHeight` na klatkę, tylko gdy agent faktycznie się porusza (gate `if (this.moving)`/`if (dist >= ARRIVE)` już istniał). `readField()` (`terrain/chunkManager.ts`) to tani bilinear lookup w common case (chunk gracza zawsze załadowany); sonda 1.2 m mieści się w apron marginesie terenu (`chunkHeightmap.ts`), więc próbkowanie blisko granicy chunka pozostaje ciągłe bez dodatkowego kodu brzegowego.

## 4. Testy

`src/terrain/slopeConstraint.test.ts` (syntetyczne pochyłe pole wysokości, ten sam wzorzec co `verticalMotion.test.ts`):

- płaski teren → wektor bez zmian w dowolnym kierunku,
- ruch pod górę między progami → składowa zmniejszona, ale niezerowa,
- ruch w poprzek zbocza (nawet bardzo stromego) → bez zmian,
- ruch w dół (nawet bardzo stromego) → bez zmian,
- zbocze powyżej `SLOPE_MAX_WALKABLE_DEG`, czysty ruch pod górę → wektor zerowy,
- ruch po przekątnej powyżej max kąta → składowa pod górę usunięta, składowa w bok zachowana (ślizg wzdłuż zbocza).

## 5. Implementation summary

Zaimplementowane: `terrain/slopeConstraint.ts` + wpięcie w `PlayerController.update()`, `NpcAgent.steerTo()`, `AnimalAgent.steerToward()`. Jeden wspólny mechanizm dla gracza/NPC/fauny (żadna z trzech pętli ruchu nie została zrefaktoryzowana/scalona — pozostają niezależne, dzielą tylko czystą funkcję matematyczną).

Techniczna weryfikacja zielona: `tsc --noEmit`, `lint`, `build`, `test` (1393 testów). Bez testu w przeglądarce (patrz `CLAUDE.md` — nie uruchamiamy headless Chrome jako domyślny sposób weryfikacji wizualnej/gameplay).
