# Plan: Low-cost natural material response tuning

**Created:** 2026-09-16
**Status:** `planned` 📋
**Type:** polish
**Priority:** medium · **Effort:** S
**Model:** Composer, Grok
**Depends on:** none
**Domain:** `world-terrain`
**Subdomains:** `vegetation` `rendering`
**Tags:** `materials` `rocks` `bark` `roughness` `metalness` `performance`
**Roadmap:** -

## Cel

Poprawić czytelność materiałową najczęstszych naturalnych propów bez nowych tekstur, shaderów, render passów, draw calli ani per-instance materiałów.

Zakres obejmuje tylko dwa niskiego ryzyka profile:

1. skały / boulders — korekta `roughness` / `metalness`,
2. kora / drewno drzew i fallen logs — korekta `roughness` / `metalness`.

Zmiana ma zachować authored kolory, mapy, vertex colors, alpha, foliage wind i wszystkie istniejące mechanizmy renderingu.

## Stan obecny

- GLB-y są ładowane przez `src/assets/loadGltf.ts`; geometrie i materiały cache root są współdzielone między klonami i oznaczone `userData.sharedGpu`.
- `TREE_SPECS`, `ROCK_SPECS`, `ROCK_CLUSTER_SPECS` i `FALLEN_LOG_SPECS` są centralnie zdefiniowane w `src/settlement/propSpecs.ts` i używane przez streaming świata / settlement props.
- `src/world/foliageWind.ts` już rozróżnia foliage od `Wood` / `*Bark`; nie należy rozszerzać foliage policy ani ingerować w jego alpha/wind contract.
- Proceduralne propsy mają własne, zwykle już sensowne parametry materiałów i nie są częścią tego planu.
- Część nature GLB ma authored tekstury; tuning nie może usuwać ani zastępować ich map.

## Scope

### 1. Jawna klasyfikacja assetów

Wprowadzić mały, explicit material-profile mechanism dla **konkretnych assetów naturalnych**, bez globalnej heurystyki dla wszystkich GLB.

Minimum:

- `ROCK_SPECS` + `ROCK_CLUSTER_SPECS` → profil `rock`,
- living/dead `TREE_SPECS` oraz `FALLEN_LOG_SPECS` → profil `wood/bark` tylko dla faktycznych materiałów pnia/kory.

Nie klasyfikować materiałów settlement/NPC/fauna ani innych importów w tym planie.

### 2. Rock material policy

Dla zweryfikowanych materiałów skał:

- zachować istniejący `color`, mapy i pozostałe authored parametry,
- ograniczyć `metalness` do wartości niemal niemetalicznej,
- ustawić tylko konserwatywne minimum `roughness`, jeżeli materiał jest zbyt błyszczący,
- nie wymuszać jednej identycznej wartości na wszystkich wariantach.

Policy powinna być korektą/clampem, nie pełnym replacementem materiału.

### 3. Bark / wood material policy

Dla zweryfikowanych materiałów pni, kory i fallen logs:

- zachować mapy/kolory/alpha,
- `metalness` blisko 0,
- konserwatywne minimum `roughness`,
- nie dotykać materiałów foliage (`leaves`, `green`, `flowers`) ani ich `alphaTest`, `transparent`, `depthWrite`, wind shader patch.

### 4. Ownership i lifecycle

Tuning musi działać na **współdzielonym materiale assetu**, raz na asset/material, przed normalnym użyciem klonów.

Wymagania:

- brak `material.clone()` per rock/tree/log,
- brak osobnych materiałów per instancja,
- brak per-frame update,
- operacja idempotentna przy wielokrotnym ładowaniu / użyciu tego samego URL,
- nie naruszać `sharedGpu` / disposal contract z `loadGltf.ts`.

Preferować istniejący cache/material ownership zamiast drugiego cache lub globalnego managera.

## Non-goals

- nowe tekstury, normal maps, roughness maps lub atlasy,
- zmiany terrain shaderów,
- wetness/weather-aware materials,
- settlement-wide material normalization,
- NPC/fauna material tuning,
- zmiany światła, gradingu lub post-processingu,
- zmiany modeli/geometry/LOD/shadows.

## Guardrails performance

- Zero nowych texture samples.
- Zero nowych shader variants wymaganych przez policy.
- Zero nowych draw calli.
- Zero per-frame CPU work.
- Zero per-instance material clones.
- Nie tworzyć nowego material registry, jeśli wystarczy opt-in policy na istniejącym cached GLB ownership path.

## Implementation guidance

Relevant code:

- `src/assets/loadGltf.ts` — cache root, `sharedGpu`, clone/disposal ownership,
- `src/world/foliageWind.ts` — istniejące rozpoznanie foliage vs bark/wood,
- `src/settlement/propSpecs.ts` — jawne listy rock/tree/log assetów,
- `src/terrain/chunkManager.ts` — runtime template loading dla natury,
- `src/settlement/propUtils.ts` — shared template loading; nie używać `tintPropMaterials()` do tej pracy, bo ono celowo klonuje materiały.

Jeśli powstanie ważna publiczna/architektoniczna funkcja material-profile, dodać krótki JSDoc z `@domain world-terrain`.

## Verification

Automated:

- test policy na synthetic `MeshStandardMaterial`: zachowuje `map`/color i tylko clampuje oczekiwane scalar values,
- foliage material pozostaje nietknięty,
- wielokrotne zastosowanie jest idempotentne,
- shared material identity nie zmienia się przez klonowanie,
- typecheck/lint/build.

Browser — wykonuje User:

- rock/boulder w słońcu i cieniu: brak plastikowego/metalicznego połysku, bez utraty tekstury/koloru,
- żywe drzewo, dead tree i fallen log z bliska: kora czytelna, korona bez regresji alpha/wind,
- sprawdzić dzień + świt/zmierzch po późniejszym lighting planie,
- sanity performance: brak nowych draw calls/program explosion i brak widocznego hitcha przy streamingu.

## Kryteria akceptacji

- Skały i bark/wood mają bardziej wiarygodną odpowiedź PBR przy zachowaniu authored wyglądu.
- Foliage nie zmienia zachowania.
- Brak nowych render passów, tekstur, shaderów i per-instance materiałów.
- Zmiana jest jawnie ograniczona do naturalnych assetów tego planu i łatwa do wycofania/tuningu.

> **Zrób git commit i push do main, rebase jeżeli trzeba**