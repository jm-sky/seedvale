# GLTF Boot Stall — Status analizy

**Data:** 2026-08-27
**Status:** `investigating` 🔎
**Domain:** `world`
**Problem:** losowy ~25 s stall podczas ładowania assetów GLB w czasie bootu.

## 1. Objaw

Podczas startu gry część assetów GLB okresowo otrzymuje czas ładowania około **25–26 s**, mimo że samo przetwarzanie assetu jest bardzo szybkie.

Przykład:

```text
manager:/models/fauna/fox.glb: 25063 ms
gltfParser:parse:51: 14 ms
loadAsync:postprocess-start:/models/fauna/fox.glb: 0 ms
```

W innych uruchomieniach ten sam model może ładować się normalnie.

Problem nie jest przypisany do konkretnego assetu — w różnych uruchomieniach stall występował m.in. dla `fox.glb`, `deer.glb` i innych assetów.

---

## 2. Co zostało wykluczone

### GLTF postprocessing

`prepareProp()` / `traverse()` / `patchFoliageWindOnObject()`:

```text
loadAsync:postprocess-start:...: 0 ms
```

Koszt jest pomijalny.

### GLTFParser

Przy stallującym `fox.glb`:

```text
manager:...fox.glb: 25063 ms
gltfParser:parse:51: 14 ms
```

Przy `wood_pile.glb`:

```text
manager:...wood_pile.glb: 25090 ms
gltfParser:parse:52: 1 ms
```

Parser nie wykonuje pracy przez 25 sekund.

### Meshopt

Dla normalnie działającego `deer.glb`:

```text
meshoptDecoder:decodeGltfBufferAsync:...: 1–2 ms
```

Dla stallującego `fox.glb` również dekodowanie było szybkie.

Meshopt nie jest obecnie podejrzanym o główny koszt CPU.

---

## 3. Ważne odkrycie: `manager:` nie oznacza tylko GLB

`THREE.DefaultLoadingManager` jest współdzielony przez różne loadery.

`AudioLoader` również używa tego managera, a `#decode` jest markerem generowanym przez Three.js podczas `decodeAudioData()`.

Dlatego:

```text
manager:/sounds/ambient-forest-loop-01.ogg#decode: 24817 ms
```

jest szczególnie interesujące.

Jednocześnie:

```text
gltfParser:parse: ...: 1–14 ms
meshoptDecoder: ...: 1–2 ms
```

To wskazuje, że ~25 s nie jest czasem faktycznej pracy parsera/dekodera.

---

## 4. Równoległe preloady

Analiza kodu wykazała dużą współbieżność podczas bootu.

### Item GLB

`preloadItemGlbModels()`:

* `Promise.all(...)`
* około **24 GLB**
* brak limitu współbieżności.

### Held tools

`preloadHeldToolModels()`:

* `Promise.all(...)`
* około **18 GLB**
* brak limitu współbieżności.

### Fauna

`loadFaunaTemplates()` ładuje modele fauna.

### Settlement

`buildSettlementProps()` ładuje dużą liczbę assetów settlementu.

### Audio

`createAmbientAudio()` uruchamia ładowanie ambient loop po zakończeniu critical path, kiedy background preloady już działają.

W efekcie w krótkim oknie startowym może być aktywnych **kilkadziesiąt operacji ładowania assetów**.

W kodzie nie znaleziono własnego limitera typu:

* semaphore,
* concurrency limiter,
* `p-limit`,
* kolejka requestów.

---

## 5. Charakterystyczny wzorzec ~25 s

Podczas stall'u wiele pozornie niezależnych operacji kończy się prawie jednocześnie:

```text
fox.glb                 ~25063 ms
wood_pile.glb           ~25090 ms
audio #decode            ~24817 ms
axe.glb                  ~25651 ms
short_sword.glb          ~25651 ms
pickaxe.glb              ~25653 ms
...
blob:                    ~25400–25500 ms
```

Jednocześnie właściwe:

```text
gltfParser:parse
meshoptDecoder
postprocess
```

są szybkie.

To sugeruje **wspólne opóźnienie przed wykonaniem callbacków / zakończeniem operacji**, a nie koszt konkretnego assetu.

---

## 6. Obecna hipoteza

### Najbardziej prawdopodobny mechanizm

Mamy dwa elementy:

**A. Bardzo wysoka współbieżność preloadów**

Dziesiątki GLB + audio są uruchamiane bez throttlingu.

**B. Dodatkowy mechanizm powodujący ~25 s wspólnego oczekiwania**

Nie jest jeszcze ustalone, co dokładnie powoduje to oczekiwanie.

Jedna z hipotez to `requestAnimationFrame` używany przez `yieldToFrame()` w `buildSettlementProps()`:

```text
yieldToFrame() → requestAnimationFrame()
```

Jeżeli karta zostanie ukryta / straci focus albo browser zacznie throttling, taki yield może zostać opóźniony.

**To jednak nadal jest hipoteza, nie potwierdzona przyczyna.**

---

## 7. Alternatywne hipotezy

### 1. Browser throttling / utrata focusu

Możliwe szczególnie podczas ręcznego przełączania między grą, DevTools, IDE i terminalem.

### 2. Długi synchroniczny task na main thread

Jakiś system wykonywany równolegle podczas bootu może blokować event loop.

### 3. Przeciążenie dev servera

Vite/Node może być zasypany dużą liczbą jednoczesnych requestów.

### 4. Ograniczenia browser/network

Wysoka liczba równoległych requestów może powodować dodatkowe kolejki.

Samo to jednak **nie wyjaśnia w pełni** opóźnienia `decodeAudioData`, ponieważ decode operuje już na pobranych danych.

---

## 8. Czego jeszcze nie wiemy

Nie mamy jeszcze dowodu:

* czy `document` traci focus/visibility podczas stall'u,
* czy main thread jest faktycznie zajęty przez ~25 s,
* czy main thread jest idle,
* czy `requestAnimationFrame` przestaje być wywoływany,
* czy Vite/dev server jest źródłem opóźnienia,
* który konkretnie task rozpoczyna ~25-sekundowy stall.

---

## 9. Najbliższy eksperyment

**Bez zmian w kodzie.**

### Test A — bez przełączania okien

Uruchomić grę i przez cały boot:

* nie przełączać okien,
* nie przełączać kart,
* pozostawić DevTools otwarte.

Sprawdzić, czy nadal występuje ~25 s stall.

### Test B — Performance

DevTools → **Performance**:

1. Start recording.
2. Reload strony.
3. Poczekać na zakończenie bootu.
4. Stop recording.

Sprawdzić okno ~25 s:

* **długi blok Main thread** → rzeczywista praca/blokowanie event loop,
* **Main thread idle** → browser throttling / oczekiwanie poza JS,
* **brak klatek** → mocny argument za problemem z `requestAnimationFrame` / visibility.

---

## 10. Stan diagnostyki

| Obszar                               | Status                    |
| ------------------------------------ | ------------------------- |
| GLTF postprocess                     | ✅ wykluczony              |
| GLTFParser                           | ✅ praktycznie wykluczony  |
| Meshopt                              | ✅ praktycznie wykluczony  |
| Konkretne modele                     | ✅ wykluczone              |
| Tekstury jako główna przyczyna fauna | ✅ wykluczone              |
| Wysoka współbieżność preloadów       | ✅ potwierdzona            |
| Wspólne opóźnienie wielu loaderów    | ✅ potwierdzone obserwacją |
| Browser/main-thread stall            | 🔎 niepotwierdzone        |
| `requestAnimationFrame` throttling   | 🔎 hipoteza               |
| Vite/dev-server jako przyczyna       | 🔎 hipoteza               |
| Ostateczna przyczyna                 | ⏳ nieustalona             |

## Zasada na dalszą pracę

**Nie wprowadzamy jeszcze limitera preloadów ani przebudowy pipeline'u.** Najpierw identyfikujemy mechanizm powodujący wspólne ~25 s oczekiwanie. Dopiero potem wybieramy minimalną poprawkę.
