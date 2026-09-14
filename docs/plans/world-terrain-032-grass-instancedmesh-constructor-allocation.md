# Plan: Grass InstancedMesh constructor allocation optimization

**Created:** 2026-09-14
**Status:** `verification needed` 🔍 — implemented + technically verified (`vue-tsc --noEmit`, focused Vitest, `pnpm build` all green). Browser/manual verification (`?benchmark=stream`) not performed by the agent — see [implementation notes](./implementation-notes/world-terrain-032-grass-instancedmesh-constructor-allocation-implementation-notes.md).
**Type:** optimization
**Priority:** high · **Effort:** S
**Depends on:** none
**Domain:** `world-terrain`
**Subdomains:** `vegetation` `rendering` `chunks`
**Tags:** `performance` `grass` `streaming` `allocation`
**Roadmap:** -
**Model:** Sonnet, Composer

## Cel

Usunąć zbędny koszt main-thread grass finalization wynikający z konstrukcji `THREE.InstancedMesh` z pełnym `bucket.count`, gdy Seedvale już posiada gotowe macierze instancji wygenerowane w workerze.

To jest mała optymalizacja istniejącej ścieżki `buildGrassChunkMeshes()`. Nie zmieniamy placementu, density, LOD, worker pipeline, render quality ani ownership Three.js.

## Potwierdzony problem

Aktualny `src/terrain/grass.ts` wykonuje dla każdego bucketu:

```ts
const mesh = new THREE.InstancedMesh(geometryForTier('near'), material, bucket.count)
mesh.instanceMatrix = new THREE.InstancedBufferAttribute(bucket.matrices, 16)
```

Seedvale używa `three ^0.185.1`. Konstruktor `InstancedMesh` w Three.js r185:

1. alokuje własne `new Float32Array(count * 16)`,
2. tworzy z niego `instanceMatrix`,
3. wykonuje `setMatrixAt(i, identity)` dla każdego `i < count`.

Seedvale natychmiast odrzuca ten bufor i zastępuje go `bucket.matrices` z `GrassBucketData`.

Dla filler bucketu z ostatniego benchmarku do ~184k instancji oznacza to około **11.8 MB jednorazowego, niepotrzebnego Float32Array** dla jednego mesha plus ~184k wywołań `setMatrixAt()` zapisujących identity, zanim właściwy worker buffer zostanie podpięty.

Ostatni zweryfikowany benchmark po usunięciu `computeBoundingSphere()` pokazał:

- `buildGrassChunkMeshes()` avg **4.51 ms**, max **9.80 ms**,
- `allocation/setup` avg **4.43 ms**, max **9.60 ms**,
- bounds/finalize avg **0.03 ms**.

To wskazuje, że konstrukcja/setup jest obecnie prawie całym kosztem finalizacji.

## Zakres

### `src/terrain/grass.ts`

Zmienić tworzenie grass `InstancedMesh` tak, aby konstruktor Three.js **nie wykonywał pełnej tymczasowej alokacji i identity initialization dla `bucket.count`**, skoro właściwe `instanceMatrix` już istnieje.

Preferowana minimalna ścieżka do zweryfikowania w implementacji:

```text
utwórz InstancedMesh bez dużego constructor-owned instance buffer
→ przypnij istniejący InstancedBufferAttribute(bucket.matrices, 16)
→ ustaw finalny mesh.count = bucket.count
→ zachowaj istniejące bounds / LOD / layers / dispose semantics
```

Nie wprowadzać własnego renderera ani forka Three.js.

### `src/perf/grassFinalizationDiag.ts`

Reuse istniejącej diagnostyki. Nie budować nowego profilera. Dopuszczalne jest dodanie jednego małego licznika tylko jeśli jest potrzebny do potwierdzenia, że tymczasowa inicjalizacja została usunięta.

### Testy

Dodać lub rozszerzyć test skupiony na kontrakcie grass mesh:

- finalne `mesh.count` równe `bucket.count` (z wyjątkiem istniejącego filler `count = 0` po buildzie),
- `mesh.instanceMatrix.array === bucket.matrices`,
- LOD fraction nadal ustawia poprawny draw count,
- dispose i geometry LOD bez regresji.

Nie testować implementacji wewnętrznej Three.js przez mockowanie całej biblioteki, jeśli kontrakt można sprawdzić przez rezultat.

## Guardrails

- Worker pozostaje właścicielem data-only `GrassChunkData`; Three.js obiekty nadal powstają tylko na main thread.
- Nie kopiować `bucket.matrices`.
- Nie dodawać poolingu typed arrays ani `InstancedMesh`.
- Nie dodawać incremental finalization, nowego schedulera ani managera.
- Nie zmieniać liczby instancji, density, LOD, shaderów ani grass geometry.
- Nie zmieniać `GrassBucketData` bez potrzeby.
- Nie optymalizować przy okazji position/index clone, aPhase/colors/wind attributes ani geometry cache bez osobnego pomiaru.
- Zachować existing `boundingSphere` z worker bounds; nie wracać do `computeBoundingSphere()`.
- Dla ważnego nowego helpera/publicznego kontraktu dodać użyteczny JSDoc; jeśli pomaga preflightowi, użyć `@domain world-terrain`.

## Gate bezpieczeństwa

Jeżeli Three.js r185 lub bieżący renderer opiera poprawność WebGL grass na konstruktorowym `count` w sposób, którego nie da się zachować przez małą zmianę `grass.ts`, **nie budować workaroundu o większej architekturze**. Zakończyć implementację z opisem blokera.

## Verification

AI agent:

- `pnpm type-check`,
- odpowiednie testy Vitest,
- `pnpm build`,
- nie wykonuje browser verification.

Użytkownik:

- powtarza deterministyczny `?benchmark=stream`,
- porównuje przede wszystkim `Grass Finalization -> allocation/setup`, `build total`, callback max oraz `grass generation` hitches,
- sprawdza brak znikającej/popsutej trawy przy streamingu oraz zmianach LOD.

### Kryterium sukcesu

Optymalizacja jest warta utrzymania, jeśli wyraźnie obniża `allocation/setup` / grass hitch bez regresji wizualnej i bez wzrostu kosztu renderu.

Nie dokładamy drugiej optymalizacji w tej samej iteracji. Jeżeli zysk jest mały, zamykamy temat i wracamy do większych, zmierzonych bottlenecków.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
