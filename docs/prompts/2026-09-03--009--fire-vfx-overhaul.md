# Seedvale — Fire VFX overhaul

Pracuj bezpośrednio na aktualnym `main`.

## Cel

Przebuduj wizualizację ognia w Seedvale:

- settlement campfire,
- village torches,
- player-built campfires,
- player torch.

Obecne modelowe/proceduralne płomienie zastąp wspólnym particle VFX.

Użytkownik przygotuje atlas PNG zawierający **3–6 wariantów płomienia** wybranych z istniejących assetów.

**Iskry nie używają PNG** — mają być prostymi jasnymi punktami.

---

## Najważniejsza architektura

Wykorzystaj istniejący system w:

`src/shared/getFireParticles.ts`

Nie twórz osobnych implementacji ognia dla campfire i torch.

Docelowo system powinien udostępniać koncepcyjnie:

```ts
createFlameParticles(options)
createFireSparks(options)
createEmberParticles(options)

createFireVisual(options)
```

`createFireVisual()` łączy:

```text
flame
+ sparks
+ embers
```

Ignite burst może pozostać osobnym one-shot efektem.

Nie twórz globalnego `FireManagera`.

---

## Performance

Obecnie na scenie mamy maksymalnie około 8 aktywnych źródeł ognia:

- 1× settlement campfire
- 4× village torches
- 2× player campfire
- 1× player torch

System powinien bez zmiany architektury obsłużyć około 2× więcej źródeł.

Docelowy budżet jednego FIRE:

- **10–12 flame particles**
- **6–8 ember particles**
- **6–8 spark particles**

Łącznie około **22–28 particles / FIRE**.

Przy 20 źródłach będzie około 440–560 particle.

To powinien być tani VFX.

### Wymagania

- wykorzystaj `THREE.Points`,
- wykorzystaj istniejący particle pool,
- nie twórz `THREE.Sprite` jako osobnych obiektów dla particle,
- nie twórz nowych obiektów/materialów/tekstur podczas `update()`,
- mutuj istniejące BufferAttributes in-place,
- nie twórz osobnego draw call/materialu dla każdego particle,
- nie zwiększaj liczby PointLightów,
- zachowaj istniejący `pointLightBudget`,
- nie dodawaj ciężkiej fizyki,
- nie dodawaj zewnętrznej biblioteki noise.

Jeżeli obecny particle pool daje jeden `THREE.Points` dla flame/sparks/embers danego FIRE, jest to akceptowalne przy obecnej skali. Nie wprowadzaj globalnego batchingu wyłącznie na zapas.

Najważniejsze jest unikanie niepotrzebnych obiektów, materiałów, draw calli i alokacji per-frame.

---

## `src/shared/getFireParticles.ts`

Istnieje już wspólny mechanizm:

- `createParticlePool()`
- `createSparks(scale)`
- `createEmbers(scale)`
- `createTorchSparks(scale)`
- `createIgniteBurst(scale)`

Particle są renderowane przez `THREE.Points` i `ShaderMaterial`.

Rozbuduj istniejący mechanizm zamiast tworzyć drugi particle system.

### Flame particles

Dodaj:

```ts
createFlameParticles(options)
```

Flame ma używać atlasu PNG przygotowanego przez użytkownika: `public/images/flame/fire_atlas.png` (1024 x 1024)

Atlas zawiera **4 warianty płomienia w układzie 2×2**:

- wariant 1 — wąski/pionowy (512 x 512),
- wariant 2 — wąski/pionowy (512 x 512),
- wariant 3 — szeroki/nieregularny (512 x 512),
- wariant 4 — szeroki/nieregularny (512 x 512).

Atlas jest zbiorem niezależnych wariantów wizualnych, **nie animacją klatkową**.

Kod powinien znać układ atlasu `2×2`, ale nie powinien być powiązany z konkretnymi nazwami plików ani tworzyć osobnych ścieżek dla poszczególnych wariantów.

Przy respawnie każdy flame particle losuje wariant z atlasu.

Losowanie powinno preferować wąskie/pionowe warianty, np. około **60–70% wariantów 1–2** oraz **30–40% wariantów 3–4**. Nie musi być to konfigurowane per particle.

Każdy particle powinien mieć niezależnie:

- scale,
- lifetime,
- spawn offset,
- velocity,
- fade,
- subtelny lateral drift,
- fazę animacji/flickeringu,
- rotation, jeśli obecny rendering pozwala na to bez istotnego dodatkowego kosztu.

Płomień powinien powstawać z **10–12 nakładających się particle**, a nie z pojedynczego sprite'a.

Particle nie powinny:
- startować dokładnie w tym samym miejscu,
- mieć identycznego scale,
- mieć identycznego lifetime,
- poruszać się synchronicznie,
- wszystkie używać tego samego wariantu.

Różnorodność ma wynikać z połączenia:
- 4 wariantów atlasu,
- różnych skal,
- pozycji,
- lifetime,
- velocity,
- flickeringu.

Warianty 1–2 powinny naturalnie budować pionowe języki płomienia, natomiast warianty 3–4 jego szerszą, nieregularną podstawę.

Nie dodawaj dodatkowego atlasu tylko po to, aby uzyskać większą różnorodność — **4 warianty są celowym limitem dla tego VFX**.

### Sparks

Dodaj/ujednolić:

```ts
createFireSparks(options)
```

Iskry mają być prostymi punktami:

- `THREE.Points`,
- mały jasny `gl_Point`,
- 6–8 domyślnie,
- krótkie lifetime,
- ruch głównie w górę,
- niewielki lateral drift,
- fade-out.

**Nie używaj PNG dla sparks.**

Jeżeli obecne `createSparks()` i `createTorchSparks()` można bezpiecznie zastąpić jednym parametryzowanym mechanizmem, zrób to.

### Embers

Dodaj/ujednolić:

```ts
createEmberParticles(options)
```

Domyślnie 6–8 particles.

Embry powinny być:

- małe,
- wolniejsze,
- skoncentrowane przy podstawie,
- subtelnie unoszące się,
- mniej widoczne niż flame.

Jeżeli istniejący system embers można po prostu dostroić i zachować, preferuj tę opcję.

---

## Parametryzacja

System musi być reusable dla różnych źródeł ognia.

Minimalny kierunek API:

```ts
type FireVisualOptions = {
  size?: number
  flameCount?: number
  emberCount?: number
  sparkCount?: number
}
```

`size` powinno wpływać na charakter/skalę efektu:

- flame width/height,
- flame spread,
- ember spread,
- spark spread,
- spark velocity.

Liczba particle pozostaje niezależnym parametrem.

Przykładowe zakresy:

```text
campfire       ~ 1.0–1.5
village torch  ~ 0.6–0.8
player torch   ~ 0.7–0.9
```

Dokładne wartości dobierz na podstawie istniejących skal i offsetów.

Nie zwiększaj automatycznie liczby particle wraz z `size`.

---

## API FIRE

Preferowany interfejs:

```ts
{
  object,
  update(dt),
  setSize(size),
  setIntensity(intensity),
  igniteBurst()
}
```

Jeżeli istniejące API `CampfireFlame` można zachować, preferuj kompatybilność zamiast niepotrzebnego refactoru.

---

## `src/settlement/campfireProps.ts`

Kluczowe funkcje:

```ts
createCampfireFlame(scale, flameMesh)
createLitCampfireVisual(kind, scale)
```

Aktualnie `createCampfireFlame()` łączy:

- `fire.glb` / procedural cone,
- PointLight,
- `createSparks()`,
- `createEmbers()`,
- `createIgniteBurst()`.

Zastąp modelowy/proceduralny flame:

```ts
createFireVisual(...)
```

Zachowaj:

- PointLight,
- `update(dt)`,
- `setSize()`,
- `setIntensity()`,
- `igniteBurst()`,
- ignition ramp,
- fuel integration.

Po migracji campfire nie powinien potrzebować `fire.glb`.

Usuń tylko elementy związane z flame GLB, które po zmianie rzeczywiście staną się nieużywane.

---

## `src/settlement/houseLighting.ts`

Kluczowa funkcja:

```ts
createVillageTorchLight(post)
```

Obecnie posiada osobną implementację:

```text
torch.glb Fire mesh
+
createTorchSparks()
+
PointLight
```

Usuń równoległy flame implementation.

Village torch powinien korzystać z:

```ts
createFireVisual(...)
```

z odpowiednim `size`.

Zachowaj:

- torch post,
- `setLit()`,
- `update()`,
- dusk/dawn behaviour,
- istniejące pozycjonowanie,
- PointLight.

---

## `src/world/standingTorchProp.ts`

Kluczowa funkcja:

```ts
createStandingTorchVisual()
```

Korzysta z:

```ts
createVillageTorchLight(post)
```

Nie twórz tutaj nowego VFX.

Zmiana `createVillageTorchLight()` powinna automatycznie objąć standing torches.

---

## `src/player/PlayerTorch.ts`

Obecnie istnieje legacy path związany z:

```text
FIRE_URL = '/models/fx/fire.glb'
fireTemplate
ensureTemplates()
makeFlameVisual()
SHOW_HAND_FLAME_VISUAL
```

oraz osobny path:

```ts
createSparks(0.4)
```

dla wooden torch.

Zastąp je wspólnym:

```ts
createFireVisual(...)
```

Usuń zależność od `fire.glb`, jeżeli po migracji nie będzie już potrzebna.

Zachowaj:

- branch visual,
- wooden torch visual,
- fuel,
- fuel restore,
- existing offsets,
- hand socket attachment,
- PointLight,
- `pointLightBudget`.

Szczególnie sprawdź:

```ts
alignLocalYToWorldUp()
```

Nowy fire visual musi zachować prawidłową orientację względem world up.

Nie zmieniaj bez potrzeby orientacji handheld visuals.

---

## `src/settlement/PlacedFires.ts`

Nie twórz tutaj nowej implementacji.

Istniejący:

```ts
createLitCampfireVisual(...)
```

powinien automatycznie otrzymać nowy VFX przez zmianę `createCampfireFlame()`.

Zachowaj:

- placement,
- fuel,
- persistence,
- despawn,
- grate,
- pointLightBudget.

---

## `src/settlement/props.ts`

Sprawdź użycia:

```ts
createLitCampfireVisual()
createVillageTorchLight()
preloadCampfireTemplates()
```

Usuń tylko niepotrzebne preloady związane z `fire.glb`.

Nie zmieniaj settlement placement.

---

## `fire.glb`

Po migracji wyszukaj wszystkie repozytoryjne referencje do:

```text
fire.glb
FIRE_URL
fireTemplate
SHOW_HAND_FLAME_VISUAL
```

Usuń runtime dependencies, które stały się zbędne.

Nie usuwaj samego assetu z repo bez sprawdzenia wszystkich pozostałych zastosowań.

---

## Atlas PNG

Użytkownik przygotuje atlas PNG zawierający 3–6 wariantów płomienia.

Nie twórz placeholdera.

Nie generuj nowego assetu.

Kod powinien używać istniejących konwencji ścieżek assetów.

Nie zakładaj konkretnej liczby wariantów.

Jeżeli atlas będzie regularną siatką, rozwiązanie powinno być parametryzowane liczbą kolumn/wierszy lub liczbą wariantów.

Nie traktuj atlasu jako animacji klatkowej.

---

## Flickering

Obecny flickering wykorzystuje prosty sinus, m.in.:

```ts
0.9 + (Math.sin(lightTime) * 0.5 + 0.5) * 0.2
```

Jest zbyt regularny.

Zastąp go tanim, deterministycznym efektem.

Flame powinien subtelnie zmieniać:

- wysokość,
- szerokość,
- lateral offset,
- intensywność.

PointLight powinien mieć własną subtelną fluktuację.

Nie używaj ciężkiego noise.

Nie generuj `Math.random()` ani nowych obiektów w każdej klatce.

Możesz wygenerować per-fire phase/seed podczas tworzenia VFX.

---

## Bloom

Najpierw sprawdź istniejący rendering/postprocessing pipeline.

Jeżeli bloom już istnieje:

- dostosuj fire material/output do istniejącego bloom.

Jeżeli bloom nie istnieje:

- nie dodawaj pełnego systemu bloom tylko dla tego zadania.

Nie zmieniaj globalnego postprocessingu bez potrzeby.

---

## Zakres

Nie zmieniaj:

- simulation,
- fuel system,
- persistence,
- settlement placement,
- torch placement,
- pointLightBudget,
- unrelated rendering.

Nie twórz:

- globalnego FireManagera,
- osobnych systemów flame dla różnych typów ognia,
- ciężkiej fizyki,
- nowych dużych dependencies,
- LOD/off-screen VFX.

---

## Verification

Uruchom:

```text
npx tsc --noEmit
npm run lint
npm run build
npm run test
```

Jeżeli któreś polecenie nie istnieje, odnotuj to zamiast wymyślać alternatywę.

Nie wykonuj manual browser verification — użytkownik zrobi ją sam.

Na końcu raportu podaj:

1. zmienione pliki,
2. konkretne funkcje dodane/zmienione,
3. usunięte legacy `fire.glb` paths,
4. finalny particle budget / FIRE,
5. liczbę `THREE.Points` / FIRE,
6. czy powstały nowe draw calls,
7. czy zmieniła się liczba PointLights,
8. wyniki tsc/lint/build/test,
9. rzeczy wymagające manualnego tuningu.

**Nie rób git commit ani git push.**
