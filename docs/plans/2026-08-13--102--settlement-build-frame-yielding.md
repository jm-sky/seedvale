# Plan: Rozbicie budowy osady na klatki (frame yielding)

**Status:** `verification needed` 🔍 — implemented, see [implementation notes](./2026-08-13--102--settlement-build-frame-yielding-implementation-notes.md)
**Created:** 2026-08-13
**Priority:** 🔴 high · **Effort:** S · **Depends on:** —
**Źródło:** [issue 027](../issues/2026-08-13--027--settlement-streaming-main-thread-freeze.md) — zmierzony w GUI Performance freeze `Simulate (ms)` ~89 ms (baseline 3-5 ms) w momencie, gdy gracz wchodzi w zasięg osady. Kontynuacja [review 005](../reviews/2026-08-12--005--performance-architecture-and-assets.md) (findings A4b/P4' — ten sam wzorzec „budżet klatki", zastosowany tu do streamingu osad zamiast chunków).

---

## 1. Diagnoza (potwierdzona w kodzie)

`SettlementsManager.ensureLoaded()` (`src/settlement/SettlementsManager.ts:259-295`) startuje `createSettlement()` → `buildSettlementProps()` (`src/settlement/props.ts:1779-2460`, ~680 linii) asynchronicznie, gdy gracz wchodzi w `loadRadius` danej komórki osady.

`buildSettlementProps` jest `async`, ale w praktyce wykonuje się jako **jeden nieprzerwany blok na głównym wątku**: każdy `await loadPropOrFallback(url, ...)` / `await loadGltf(url)` po pierwszym użyciu danego modelu rozwiązuje się z już-cache'owanego promise'a (`assets/loadGltf.ts`) przez mikrotask — a łańcuch mikrotasków w pełni się drenuje **zanim** przeglądarka odda sterowanie do renderu. Efekt: żadna klatka nie renderuje się przez cały czas budowy wioski, aż wszystko jest gotowe naraz.

Osady niebędące domową (`plantForest=false`, każda osada dociągana przez `ensureLoaded` podczas gry) budują — w kolejności — studnię, stodołę/stos drewna, 1+ ogród (+ `crops.glb`), opcjonalnie pole (`farm.glb`), stragan (skrzynia+beczka), lampiony domów, **pętlę po `clearings.houses`** (jeden dom = jeden `await loadPropOrFallback` + `Box3`/klon/tint/`houseLight`), beczki/siano przy stodole, opcjonalnie drugi stos drewna (LG/XL), palisadę (`plantEntrancePalisade` — pętla stron × segmentów, każdy `wall.clone(true)`), pochodnie placu/bramy. To jest realistycznie **20-60 osobnych klonowań/budowań propsów** w jednym ciągu — stąd 89 ms.

**Poza zakresem tego planu:** las osadowy (`plantForest` — pętle `plazaTreeCount`/`nearCenters`/`midCount`/`farCount`/`fillCount`, potencjalnie kilkaset propsów) dotyczy **wyłącznie** osady domowej, która buduje się przed startem pętli renderu (`createApp.ts`: `createSettlementsManager` kończy się przed pierwszym `requestAnimationFrame(tick)`, za ekranem ładowania) — nie jest źródłem zgłoszonego freeze'u w trakcie gry. Fix stosuje ten sam mechanizm tam też (za darmo, bez dodatkowego kodu), ale to nie jest cel.

## 2. Kierunek

**Nie** przepisywać `buildSettlementProps` na kolejkę stanową sterowaną z `update()` (jak `chunkManager.ts`'s `loadQueue`/`CHUNKS_STARTED_PER_FRAME`) — to duży refaktor 680-liniowej funkcji z rozgałęzioną kolejnością (RNG, `landmarks`, zależności między sekcjami) i realne ryzyko regresji w placementach.

Zamiast tego: funkcja **zostaje** jednym ciągłym `async` przepływem (kolejność, RNG, zależności między sekcjami bez zmian), ale co kilka propsów oddaje sterowanie przeglądarce przez prawdziwy yield (`requestAnimationFrame`), nie mikrotask. To rozbija jeden 89 ms blok na serię krótkich fragmentów przeplatanych klatkami renderu — identyczny efekt końcowy (ten sam layout, te same propsy), tylko rozłożony w czasie. Ten sam kierunek co already-implemented A4b (`ChunkManager.loadQueue`), inny mechanizm (yield zamiast poll z `update()`), bo pasuje do istniejącego kształtu kodu bez przepisywania go.

### Nowy moduł: `src/settlement/frameYield.ts`

```ts
function yieldToFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

export function createPropYieldGate(): () => Promise<void> {
  let count = 0
  return async () => {
    count++
    if (count % PROPS_PER_YIELD === 0) await yieldToFrame()
  }
}
```

`PROPS_PER_YIELD` (stała, wartość robocza `4`) — na tyle mało, że pojedynczy fragment zostaje wyraźnie pod budżetem klatki nawet dla najdroższego propa (GLB clone + tint), na tyle dużo, że duża osada (~40-60 propsów) kończy budowę w ~10-15 klatek (~170-250 ms) zamiast rozciągać się na sekundy.

### Zastosowanie w `buildSettlementProps` / `plantEntrancePalisade`

Jeden `const yieldProp = createPropYieldGate()` na wywołanie `buildSettlementProps` (świeży licznik per streamowana osada — niezależne osady budujące się równolegle nie dzielą budżetu). `await yieldProp()` po każdym `group.add(...)` dla propa budowanego w pętli lub warunkowo:

- pętla `clearings.houses` (domy — jedna instancja per dom),
- pętla `barrelSpots` (beczki przy stodole),
- pętla `hayCount` (siano),
- oba miejsca `placeTorchAt(...)` (plac + flanki bramy),
- opcjonalny drugi stos drewna (LG/XL),
- pętle `plantForest` (`plazaTreeCount`, oraz raz na wywołanie `plantTreeCluster` w `nearCenters`/`midCount`/`farCount`/`fillCount`) — poza zgłoszonym freeze'em, ale ten sam mechanizm i tak już tam jest po drodze.

`plantEntrancePalisade` dostaje własną, lokalną bramkę (osobna funkcja, osobny licznik) — `await` po każdym `segment` w pętli `side × segmentsPerSide`.

Pojedyncze propsy budowane raz (studnia, stodoła, ogrody w pętli `gardenCount` — zwykle 1, stragan, ognisko) nie potrzebują yieldu osobno — już wchodzą pod wspólny licznik przez wywołania `yieldProp()` w otaczających pętlach, a jeśli padają poza jakąkolwiek pętlą, zostają jak są (rzadkie, tanie, nie warto komplikować sygnatur).

## 3. Dlaczego to bezpieczne (zero regresji wizualnej)

- Kolejność budowy propsów, wywołania RNG (`coreRandom`, `random`, `houseYawRandom`) i wszystkie placementy **nie zmieniają się** — yield nie konsumuje RNG, nie zmienia gałęzi warunkowych, tylko wstawia `await` między już-istniejące kroki.
- `SettlementsManager.ensureLoaded()`'s wyjście-w-trakcie-budowy już jest obsłużone (`.then()` sprawdza `entries.get(def.id)` i disposuje, jeśli gracz wyszedł z zasięgu) — dłuższy czas budowy tylko poszerza (nieszkodliwie) okno, w którym ta gałąź może się uruchomić.
- Efekt uboczny (pozytywny): domy/propsy będą **pojawiać się stopniowo** przez kilka klatek zamiast wyskoczyć naraz — spójne z tym, jak już dziś działa terenowy streaming (chunki/trawa się dociągają), nie nowy język wizualny.

## 4. Weryfikacja

Techniczna: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test`.

Manualna (przeglądarka, do zrobienia przez użytkownika — CLAUDE.md): GUI Performance → `Simulate (ms)` przy wejściu w zasięg nowej osady powinien zostać w granicach kilku-kilkunastu ms per klatka (bez pojedynczego skoku do ~89 ms) przez kilka-kilkanaście klatek zamiast jednego skoku. Wizualny efekt końcowy (rozmieszczenie propsów) identyczny jak dziś.

## 5. Poza zakresem

- Pomiar/instrumentacja `buildSettlementProps` osobno w debug GUI (issue 027 punkt 1) — GUI Performance już pokazuje `Simulate (ms)` per klatka, co wystarcza do potwierdzenia efektu tego planu bez dodatkowego licznika.
- Skalowanie z rozmiarem osady (issue 027 punkt 3) — po tym planie przestaje mieć praktyczne znaczenie: nawet duża osada rozkłada się na klatki zamiast jednego bloku.
- Las osadowy / instancing propsów osady (`plan 087` explicite wyklucza domy/studnię/palisadę) — nie w zakresie.
