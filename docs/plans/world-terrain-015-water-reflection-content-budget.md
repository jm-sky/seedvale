# Plan: Water Reflection Content Budget

**Created:** 2026-09-07
**Status:** `planned` 📋
**Type:** optimization
**Priority:** medium · **Effort:** S
**Depends on:** -
**Domain:** `world-terrain`
**Subdomains:** `rendering`
**Tags:** `water` `reflection` `performance`

## Cel

Zmniejszyć sustained render cost planar water reflection tylko tam, gdzie aktualny pipeline ma jeszcze tani, mierzalny koszt do usunięcia.

To jest celowo mały, measurement-gated follow-up. Nie maksymalizujemy jakości optymalizacji mirrora i nie budujemy nowej architektury dla potencjalnego ułamka milisekundy. Poprawnym wynikiem planu jest również **brak zmiany w reflection pipeline**, jeśli aktualny pomiar nie pokaże konkretnego winu o dobrym ROI.

## Kontekst

Water mirror jest już mocno zoptymalizowany:

- jeden współdzielony render target 128×128,
- cadence ograniczona do 30 Hz z dodatkową ochroną pod obciążeniem,
- water, NPC/fauna, grass i ground items są wyłączone z mirror pass,
- outer streaming ring terrain/vegetation/environment jest wyłączony przez istniejący reflection visibility budget,
- region vegetation batching już działa,
- shadow map nie jest aktualizowana podczas mirror pass.

Poprzedni outer-ring visibility budget obniżył mirror draw calls tylko umiarkowanie i nie dał wyraźnego zysku FPS/WATER w zmierzonym `current`. Dlatego nie zakładać, że dalszy distance culling albo reflection-specific LOD automatycznie mają sens.

## Zasada ROI

Praca ma przebiegać według:

```text
mały recon + aktualny pomiar
        ↓
czy istnieje tani, konkretny koszt do usunięcia?
        ↓
      nie → STOP
        ↓ tak
jedna najmniejsza optymalizacja
        ↓
benchmark / manual verification przez użytkownika
        ↓
brak sensownego zysku → nie rozwijać rozwiązania dalej
```

Nie wykonywać serii spekulacyjnych optymalizacji w jednej implementacji.

## 1. Bounded recon i pomiar

Najpierw ustalić, co **obecnie** pozostaje w mirror pass i co faktycznie kosztuje po istniejących optymalizacjach.

Wykorzystać istniejące benchmarki, scene census i instrumentation. **Nie budować nowego rozbudowanego profilera.** Jeśli brakuje jednej konkretnej informacji potrzebnej do decyzji, dodać tylko minimalny bounded measurement.

Sprawdzić przede wszystkim aktualny udział:

- settlement geometry/props,
- terrain,
- region-batched vegetation,
- environment props,
- particles/fire/torches i innych efektów,
- pozostałych obiektów renderowanych na warstwie widocznej dla mirror camera.

Interesują nas mirror draw calls, mirror triangles oraz koszt `WATER`/renderu, nie sama liczba obiektów w scenie.

### Gate 1 — czy implementować

Jeśli recon/pomiar nie pokaże konkretnej kategorii lub mechanizmu, który można tanio ograniczyć bez nowego subsystemu, **zakończyć plan bez zmian produkcyjnych w reflection pipeline**.

Nie traktować tego jako niepowodzenia — mirror może być już poniżej sensownego progu ROI.

## 2. Jedna najmniejsza optymalizacja

Jeśli Gate 1 przejdzie, wybrać **jeden** najlepiej rokujący, mały mechanizm.

Preferowana kolejność rozwiązań:

1. reuse istniejących `REFLECTION_SKIPPED_LAYER` / `REFLECTION_DISTANT_LAYER`,
2. reuse istniejącego chunk/region/settlement lifecycle do ustawienia reflection visibility poza hot path,
3. ograniczenie małych lub nieistotnych wizualnie kategorii potwierdzonych przez pomiar,
4. bardziej agresywny distance/content budget tylko wtedy, gdy pomiar wskazuje, że właśnie odległa geometria pozostaje istotnym kosztem.

Nie wpisywać z góry konkretnych settlement/environment props jako elementów do wycięcia. Najpierw pomiar musi potwierdzić koszt i brak znaczenia dla czytelności reflection.

Zmiana nie może wymagać per-frame traversal dużej części sceny ani masowego mutate/restore `visible`, `count` lub materiałów przed i po mirror renderze.

### Work budget

Jeśli najlepszy kandydat wymaga:

- nowego subsystemu visibility,
- osobnego streamingu,
- reflection-specific HLOD/proxy world,
- szerokiej zmiany ownership/lifecycle renderingu,
- dużego reflection-specific LOD systemu,

**zatrzymać implementację** i zapisać w implementation notes, co pomiar wykazał. Taka praca wymagałaby osobnej decyzji/planu i nie mieści się w ROI tego zadania.

## 3. Reflection-specific LOD

Reflection-specific LOD jest **out of scope w normalnym przebiegu tego planu**.

Można wykorzystać istniejący LOD wyłącznie wtedy, gdy recon pokaże bardzo małą, bezpieczną integrację bez nowego lifecycle i bez dużego per-frame mutate/restore.

W przeciwnym razie nie implementować go tutaj, nawet jeśli teoretycznie obniżyłby triangle count.

## 4. Benchmark gate

Po jednej wybranej zmianie nie dodawać kolejnej optymalizacji w tej samej iteracji. Najpierw użytkownik wykonuje browser benchmark/manual verification.

Najważniejsze scenariusze:

- `?benchmark=water`,
- `?benchmark=settlement`,
- `?benchmark=current`.

Porównać przed/po:

- mirror draw calls,
- mirror triangles,
- `WATER`,
- `RENDER`,
- FPS avg,
- frame p95.

Orientacyjny próg uzasadniający dalsze utrzymanie zmiany:

- około **15–20% mniej mirror draw calls/triangles**, lub
- około **0.5 ms lub więcej** poprawy `WATER`/`RENDER` w ciężkiej, reprezentatywnej scenie,
- bez zauważalnego pogorszenia reflection.

To nie jest wymóg, aby sztucznie osiągnąć liczbę. Jeśli zmiana nie daje sensownego zysku, nie komplikować jej i nie dokładać kolejnych mechanizmów tylko po to, żeby poprawić wynik.

## Testy i verification

AI agent:

- uruchamia istniejące unit/type/build checks odpowiednie dla zmienionych modułów,
- dodaje testy tylko dla nowej logiki, jeśli faktycznie powstaje,
- nie uruchamia browser verification.

Użytkownik po implementacji:

- wykonuje benchmarki wskazane wyżej,
- sprawdza wodę przy bliskim brzegu, lesie i zabudowie,
- sprawdza szybki obrót/ruch kamery pod kątem hard cutoff, pop/flicker i brakujących sylwetek w odbiciu.

## Implementation constraints

- Aktualny kod jest źródłem prawdy; nie odtwarzać mechanizmów opisanych w starych planach, jeśli już istnieją.
- Reuse istniejących render layers i lifecycle zamiast równoległego systemu visibility.
- Reflection jest efektem wtórnym i nie może wpływać na simulation/world state.
- Nie zwiększać kosztu main renderu, żeby obniżyć koszt mirrora.
- Nie dodawać per-frame alokacji lub traversal tylko dla reflection budget.
- Dla ważnych nowych publicznych/architektonicznych funkcji lub klas dodać użyteczny JSDoc; gdy pomaga preflightowi, użyć `@domain world-terrain`.

## Out of scope

- nowy system world visibility,
- osobny reflection streaming,
- reflection-specific HLOD/proxy world,
- szeroki reflection-specific LOD,
- globalny adaptive-quality system,
- dalsze obniżanie resolution/cadence jako domyślna pierwsza odpowiedź,
- niezwiązane zmiany shaderów/materialów wody,
- optymalizacje głównego vegetation batchingu niezależne od mirror pass,
- seria wielu optymalizacji wykonywanych bez pomiaru pomiędzy nimi.

## Rezultat

Oczekiwany rezultat to jedno z dwóch:

1. jedna mała, potwierdzona pomiarem optymalizacja reflection o dobrym ROI, gotowa do browser benchmarku użytkownika; albo
2. udokumentowany stop — obecny mirror nie ma już taniego winu uzasadniającego dalszą złożoność.

Oba wyniki są poprawne. Priorytetem jest **nie utonąć w niepotrzebnej pracy** dla małego efektu.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
