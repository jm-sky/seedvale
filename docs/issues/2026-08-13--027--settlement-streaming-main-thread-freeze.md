# Osada streamuje się synchronicznie — wyczuwalny freeze przy pojawieniu się wioski

**Status:** `verification needed` — fix implemented, see [plan 102](../plans/archive/2026-08-13--102--settlement-build-frame-yielding.md)
**Created:** 2026-08-13
**Źródło:** zgłoszenie użytkownika podczas weryfikacji [planu 086](../plans/archive/2026-08-12--086--grass-generation-in-worker.md) (trawa w workerze) — `Simulate (ms)` skoczył do **~89 ms** (baseline 3-5 ms) w momencie, gdy wioska pojawiła się w polu widzenia. Baseline 3-5 ms potwierdza, że plan 086 sam w sobie działa poprawnie — ten freeze ma inne źródło.

## Podejrzana przyczyna (zweryfikowana w kodzie, nie zmierzona profilerem)

`SettlementsManager.ts:298` streamuje osady, gdy gracz wchodzi w promień komórki (`cellsWithinRadius(playerCell, cellRadius)`), i woła `createSettlement()` → `buildSettlementProps()` (`props.ts:1794-2439`, ~645 linii).

`buildSettlementProps` jest `async`, ale wewnątrz robi `await` na `loadPropOrFallback`/`loadGltf`/`loadPropTemplates` w pętlach (np. `props.ts:2006` — pętla po `clearings.houses`, `await loadPropOrFallback(entry.url, ...)` per dom). GLTF loader cache'uje po URL — więc po pierwszym domu danego modelu każdy kolejny `await` rozwiązuje się z już-cache'owanego promise'a przez mikrotask, **bez oddania sterowania do event loopa / renderu przeglądarki**. Efekt: całe wybudowanie wioski (domy, studnia, stragan, ogrody, beczki, siano, drzewa/krzaki placu, palisada, pochodnie) wykonuje się jako **jeden ciągły synchroniczny blok** na głównym wątku w momencie, gdy gracz wchodzi w zasięg — dokładnie to, co objawia się jako jednorazowy, zauważalny freeze.

To osobny problem od [planu 087](../plans/archive/2026-08-12--087--vegetation-and-prop-instancing.md) (instancing roślinności/propsów) — 087 explicite wyklucza domy/studnię/tabliczki/palisadę ze swojego zakresu (§2.5: „pojedyncze sztuki per osada, część z raycastem i tintem" → ❌). Instancing by nie pomógł tu wprost; problem to **kiedy** praca się wykonuje (jeden blok synchroniczny), nie ile draw calli.

## Do zrobienia (przy planowaniu, nie teraz)

1. Zmierzyć realny czas `buildSettlementProps` (np. `performance.now()` wokół wywołania w `SettlementsManager.ts`, albo w GUI Performance) — potwierdzić hipotezę i wskazać, która część (domy vs ogrody vs drzewa placu vs palisada) waży najwięcej.
2. Rozważyć rozbicie budowy wioski na kilka klatek (np. kolejka podobna do `CHUNKS_STARTED_PER_FRAME` w `chunkManager.ts`) zamiast jednego synchronicznego bloku — placementy (pozycje/rotacje/typy) już są danymi, więc podział "policz dane" vs "zbuduj mesh" może się dać zrobić bez przenoszenia do workera.
3. Sprawdzić, czy problem skaluje się z rozmiarem wioski (`VillageSize` S/M/L) — jeśli tak, może wystarczyć throttling tylko dla dużych osad.

## Poza zakresem teraz

Nie blokuje niczego — jednorazowy freeze przy pierwszym wejściu w zasięg osady, nie powtarzający się stutter. Warto zaplanować osobno, gdy będzie czas na profilowanie i decyzję o podejściu (frame-budowanie vs coś innego).
