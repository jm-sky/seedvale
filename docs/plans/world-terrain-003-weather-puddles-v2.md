# Plan: Weather puddles V2 — stronger shader surface effect

**Created:** 2026-08-31  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** S  
**Depends on:** ~~133~~  
**Domain:** `world-terrain`

## Cel

Poprawić czytelność kałuż generowanych przez istniejący shader terenu.

Kałuża powinna być rozpoznawalna jako cienka warstwa wody na mokrym podłożu, a nie tylko jako ciemniejsza plama.

Nie tworzyć osobnej geometrii kałuż, decalów ani nowego systemu symulacji.

## Stan obecny

`src/terrain/buildChunkGeometry.ts` wykorzystuje:

- `uWetness` jako globalny parametr powierzchni,
- `vWorldPos` do proceduralnego noise,
- `vBareGround` do ograniczenia kałuż do bardziej odsłoniętych powierzchni,
- `vSlopeUp` do maskowania stromych powierzchni,
- `terrainValueNoise()` do generowania kształtu kałuż.

Aktualny efekt:

```text
puddleAmt
  → diffuseColor.rgb *= 1.0 - puddleAmt * 0.4
  → roughnessFactor -= puddleAmt * 0.28
```

Problem: wizualnie kałuża pozostaje przede wszystkim ciemniejszym fragmentem terenu.

## Zakres

### 1. Mocniejszy materiał kałuży

Zmienić istniejący fragment shader tak, aby środek kałuży miał wyraźniejszy charakter powierzchni wodnej:

- mocniejsze obniżenie roughness,
- wyraźniejszy specular response poprzez istniejący model `MeshStandardMaterial`,
- delikatne rozjaśnienie/zmianę koloru odbitego światła,
- zachować naturalny wygląd mokrej ziemi poza właściwą kałużą.

Nie dodawać reflection pass.

### 2. Czytelniejszy kształt

Udoskonalić istniejącą maskę `puddleAmt`:

```text
low-frequency shape
+ existing breakup
+ flatness
+ bare-ground
+ wetness
```

Kałuże powinny być większe i łatwiejsze do zauważenia z typowej odległości kamery, ale nadal nieregularne.

Nie dodawać nowej tekstury.

### 3. Wyraźniejsze przejście

Rozdzielić wizualnie:

```text
dry ground
→ wet ground
→ puddle edge
→ puddle center
```

Przejście nadal powinno być miękkie, bez wyglądu proceduralnego „decala”.

### 4. Zachować ograniczenia powierzchni

Kałuże nadal powinny być ograniczone przez:

- `aboveWater`,
- nachylenie terenu,
- `vBareGround`,
- `uWetness`.

Nie rozszerzać automatycznie kałuż na strome zbocza ani wodę.

### 5. Wydajność

Nie dodawać:

- nowych meshów,
- per-chunk materiałów,
- dodatkowych render passów,
- nowych per-frame CPU loops,
- nowych tekstur.

Preferować ponowne wykorzystanie istniejących `terrainValueNoise()` i obliczeń shaderowych.

## Poza zakresem

- rzeczywiste hydrologiczne zagłębienia terenu,
- lokalna symulacja spływu wody,
- trwałe kałuże zapisane w `WorldState`,
- osobne obiekty kałuż,
- odbicia sceny w każdej kałuży,
- nowe typy powierzchni (`road`, `mud`, `sand`, `desert`) — obecny `vBareGround` pozostaje bez zmian.

## Pliki

Główny:

- `src/terrain/buildChunkGeometry.ts`

Kontekst:

- `src/world/weather.ts`
- `src/terrain/chunkManager.ts`
- `docs/architecture/GRAPHICS.md`

Dokumentacja implementacji istniejącego mechanizmu:

- `docs/plans/archive/2026-08-16--133--weather-surface-effects-implementation-notes.md`

## Implementacja

1. Przejrzeć aktualne `WEATHER_SURFACE_COLOR_CHUNK` i `WEATHER_SURFACE_ROUGHNESS_CHUNK`.
2. Zmodyfikować `puddleAmt` tak, aby maska była czytelniejsza przy średnim i wysokim `uWetness`.
3. Rozdzielić wpływ `puddleAmt` na:
   - kolor mokrej ziemi,
   - edge,
   - centrum kałuży,
   - roughness.
4. Wykorzystać istniejący `MeshStandardMaterial` do uzyskania mocniejszego highlightu.
5. Zachować wspólne uniformy `uWetness` / `uSnowAmount`.
6. Nie zmieniać architektury `ChunkManager.setWeatherSurface()`.
7. Zaktualizować `customProgramCacheKey()` tylko jeżeli zmiana shader source wymaga bumpa.
8. Dodać/aktualizować testy czystej logiki, jeśli zostanie wydzielona funkcja maski.

## Verification

### Techniczna

- `npm run typecheck` / właściwy istniejący check projektu.
- `npm run build`.
- brak nowych materiałów per chunk,
- brak nowych render passów,
- brak per-frame CPU pracy związanej z kałużami.

### Browser

Sprawdzić przy:

1. lekkim deszczu,
2. mocnym deszczu,
3. bezpośrednio po deszczu,
4. wysychaniu terenu,
5. drodze,
6. płaskiej ziemi,
7. lekkim stoku,
8. stromym stoku,
9. z typowej wysokości kamery,
10. zbliżeniu kamery.

Kryterium sukcesu:

> Przy średnim/wysokim `wetness` kałuże są jednoznacznie widoczne jako cienka powierzchnia wody, ale nie wyglądają jak osobne płaskie tekstury ani lustrzane plamy.

### Performance

Porównać shader cost przed/po, jeżeli dostępny jest istniejący benchmark/diagnostyka GPU.

Cel: brak istotnego regresu render time.

## Ryzyko

Największe ryzyko to przesadzenie z połyskiem i uzyskanie efektu „mokrego plastiku”.

Preferowany kierunek:

**subtelna woda → czytelna z gameplay camera → bez lustra.**

> **Zrób git commit i push do main, rebase jeżeli trzeba**
