# Plan: Vegetation render budget v2

**Created:** 2026-09-17
**Status:** `planned` 📋
**Type:** optimization
**Priority:** high · **Effort:** M
**Depends on:** -
**Domain:** `world-terrain`
**Subdomains:** `vegetation` `rendering`
**Tags:** `lod` `batching` `performance`

## Cel

Zmniejszyć koszt renderowania vegetation po istniejącym 3×3 region batchingu, bez tworzenia drugiego batching systemu i bez globalnego vegetation megabatchu.

## Evidence / punkt startowy

`settlement-heavy`:

- `full`: ~46.5 ms,
- `hide-vegetation`: ~28.7 ms,
- census vegetation: ~214 draws / ~760.9k triangles.

`stream`:

- `full`: ~10.8 ms,
- `hide-vegetation`: ~6.8 ms.

Aktualny `src/terrain/vegetationRegionBatcher.ts` już:

- grupuje vegetation w stałe regiony 3×3 chunk,
- rebuilds on change,
- synchronizuje LOD konserwatywnie przez nearest-member-wins,
- zachowuje chunk ownership/streaming.

Plan nie może ponownie „wdrożyć batchingu”.

## Zakres

### 1. Bounded recon bieżącego kosztu

Dla `settlement-heavy` i `stream` rozdzielić aktualny vegetation cost na:

- draw submissions per kind,
- triangle count per kind / active LOD,
- instance counts,
- shadow participation,
- region visibility / active regions,
- rebuild frequency/cost podczas streamingu.

W pierwszej kolejności sprawdzić `tree-living`, bushes/cacti/reeds oraz environment kinds współdzielące region batcher.

### Gate A

Wybrać dominujący typ kosztu:

- geometry/triangle pressure,
- zbyt konserwatywny LOD,
- zbyt konserwatywna region visibility,
- shadow participation,
- rebuild cost podczas streamingu.

Nie implementować kilku niezależnych hipotez naraz.

### 2. Preferowane kierunki

W zależności od pomiaru, zastosować **jeden** najlepiej rokujący mechanizm:

1. bardziej agresywny istniejący geometry LOD dla dalekiej vegetation,
2. per-kind distance/fraction budget wykorzystujący obecny `syncLod`,
3. ograniczenie shadow participation małych/dalekich vegetation categories, jeśli nie zostało już rozwiązane przez plan shadow-budget,
4. zmniejszenie conservative overdraw/visibility regionu bez zmiany regionu w nową jednostkę streamingu,
5. ograniczenie rebuild work tylko jeśli `stream` potwierdzi, że to realny koszt CPU/hitch.

### 3. Kontrakt region batchera

Zachować:

- 3×3 rendering regions jako istniejący mechanizm,
- chunk jako jednostkę world ownership/streamingu,
- rebuild-on-change,
- brak globalnego world batchu,
- reflection layer semantics.

Jeśli potrzebna jest inna agregacja niż 3×3, musi ją najpierw uzasadnić pomiar; nie zmieniać rozmiaru regionu „na próbę” bez compare.

## Architektoniczne decyzje

- Nie tworzyć drugiego vegetation visibility systemu.
- Nie wykonywać per-frame iteracji po wszystkich vegetation instances.
- Preferować dane już dostępne w chunk/region lifecycle.
- Nie zwiększać main-thread finalization work kosztem niewielkiego GPU winu.
- G17 worker/data-only boundaries pozostają bez zmian, jeśli plan ich nie potrzebuje.
- Nowe ważne API batchera powinno mieć JSDoc i `@domain world-terrain`.

## Non-goals

- global vegetation batching,
- GPU-driven renderer,
- occlusion culling framework,
- HLOD całego świata,
- przebudowa chunk streamingu,
- optymalizacja grass filler — jego finalization jest już tani w 021/022.

## Verification

AI agent:

- unit tests dla LOD/region logic,
- type-check/lint/test/build,
- bez browser verification.

Użytkownik:

- `?benchmark=settlement-heavy`,
- `?benchmark=stream`,
- porównać vegetation draws/triangles, `RENDER`, FPS, p95,
- sprawdzić pop/flicker/LOD transitions podczas ruchu i obrotu kamery.

## Success gate

Utrzymać tylko zmianę, która daje wyraźny spadek render cost albo streaming work bez zauważalnego pogorszenia bliskiej vegetation. Jeśli pomiar nie wskaże konkretnego mechanizmu, zakończyć plan po reconie.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
