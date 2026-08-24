# Plan: Mountain Peaks & Mountain Massifs

**Created:** 2026-08-21
**Status:** `planned` 📋
**Priority:** medium · **Effort:** L
**Depends on:** 181
**domain:** `world-terrain`
**Tags:** [terrain, mountains, world-generation]

## Cel

Stworzyć system generowania górskich masywów i charakterystycznych szczytów, który kształtuje większe fragmenty krajobrazu — tworząc pasma, doliny, przełęcze i dominanty wysokościowe — zamiast generować pojedyncze niezależne wzniesienia.

Wykorzystać istniejący terrain/chunk generation oraz rozwiązania z planu 181. Nie tworzyć równoległego `MountainSystem` ani globalnego generatora gór.

## Zakres

### 1. Mountain Massifs

- grupowanie gór w większe masywy i pasma,
- płynne przejścia pomiędzy podnóżem, zboczami i szczytami,
- zróżnicowana wysokość i szerokość masywów,
- naturalne doliny i przełęcze pomiędzy górami,
- unikanie równomiernego, niezależnego noise'u tworzącego „kopce”.

Masyw ma być formą krajobrazu, a nie zbiorem niezależnych peaków.

### 2. Mountain Peaks

- wysokie, wyraźnie wyróżniające się szczyty,
- nieregularne profile zamiast prostych stożków/piramid,
- różne typy szczytów: ostre, skaliste, zaokrąglone i asymetryczne,
- kontrolowana nieregularność/noise w wyższych partiach,
- naturalne przejście pomiędzy szczytem, skalistym zboczem i niższym terenem,
- pojedyncze dominanty wysokościowe w obrębie większych masywów.

Szczyty mają wynikać z kształtu masywu, a nie być osobnym scatterem obiektów.

### 3. Landscape Composition

System powinien kontrolować rozmieszczenie gór jako większych struktur:

```text
mountain range / massif
        ↓
    valleys
   /      \
peaks    passes
```

- pasma/grupy gór powinny mieć czytelną strukturę,
- nie wszystkie szczyty powinny mieć podobną wysokość,
- pomiędzy dominującymi szczytami powinny występować niższe partie i przełęcze,
- krajobraz powinien mieć naturalną hierarchię wysokości.

### 4. Terrain Integration

Rozszerzyć istniejący terrain generator zamiast tworzyć nowy system.

Mountain features powinny współpracować z istniejącymi mechanizmami:

- terrain height,
- slope,
- biome/material placement,
- rock placement,
- chunk generation,
- worker pipeline.

Nie rozszerzać zakresu o nowe systemy geologiczne, hydrologiczne ani zasoby górskie.

### 5. Chunk Boundaries

Zadbać o ciągłość struktur górskich pomiędzy chunkami:

- brak widocznych uskoków,
- deterministyczne wyniki,
- mountain features niezależne od kolejności ładowania chunków,
- poprawne zachowanie podczas streamingu,
- większe struktury nie mogą być sztucznie przycinane do pojedynczego chunka.

### 6. Performance

Nie zwiększać znacząco kosztu istniejącego terrain generation.

Sprawdzić szczególnie:

- CPU generation time,
- chunk generation,
- mesh generation,
- triangle count,
- draw calls,
- memory/GC,
- streaming hitching.

Wykorzystać istniejące LOD, instancing, merged geometry i worker pipeline tam, gdzie mają zastosowanie.

## Poza zakresem

- nowy globalny mountain generator,
- osobny `MountainSystem`,
- realistyczna symulacja erozji,
- jaskinie,
- wspinaczka,
- nowe zasoby górskie,
- pełna przebudowa terrain generatora,
- pełna przebudowa hydrologii/rzek,
- niezwiązany cleanup/refactor.

## Kolejność implementacji

### Etap A — reconnaissance implementacyjny

Potwierdzić aktualny stan zmian z planu 181 oraz entry points dla mountain shaping, terrain height, rock/material placement, chunk boundaries i worker generation. Określić, które mechanizmy można rozszerzyć bez tworzenia równoległego generatora.

### Etap B — mountain composition

Wprowadzić większą skalę struktur górskich: pasma, masywy, doliny i przełęcze. Zachować deterministyczne generowanie i ciągłość na granicach chunków.

### Etap C — peaks

Dodać hierarchię wysokości i charakterystyczne, nieregularne szczyty. Najwyższe partie powinny tworzyć naturalne dominanty zamiast stożków, piramid lub równomiernego noise'u.

### Etap D — terrain/rock integration

Zintegrować szczyty i strome zbocza z istniejącym terrain/biome/rock pipeline. Nie tworzyć osobnego mountain-rock generatora, jeśli istniejący mechanizm może zostać rozszerzony.

### Etap E — performance and verification

Build/test/lint/tsc, browser/manual verification, kilka seedów, chunk boundaries oraz pomiary terrain/chunk generation i renderingu.

## Kryteria ukończenia

- [ ] Świat generuje większe, spójne masywy górskie.
- [ ] Masywy tworzą czytelne pasma, doliny i przełęcze.
- [ ] W obrębie masywów występują wyraźne dominanty wysokościowe.
- [ ] Szczyty są nieregularne i nie wyglądają jak proste stożki lub piramidy.
- [ ] Występują różne profile i skale szczytów.
- [ ] Najwyższe partie płynnie przechodzą w skaliste zbocza i niższy teren.
- [ ] Struktury górskie są ciągłe na granicach chunków.
- [ ] Generowanie jest deterministyczne i niezależne od kolejności ładowania chunków.
- [ ] Istniejące terrain/chunk generation mechanisms są ponownie wykorzystane zamiast duplikowane.
- [ ] Góry nie powodują istotnych streaming hitchów.
- [ ] Zweryfikowano kilka różnych seedów.
- [ ] Zweryfikowano wygląd gór w przeglądarce.
- [ ] Zweryfikowano wpływ na performance.

## Weryfikacja

### Techniczna

```text
pnpm tsc --noEmit
pnpm lint:fix
pnpm build
pnpm test
```

### Browser / gameplay

- wizualnie ocenić kilka seedów,
- sprawdzić duże masywy z różnych odległości,
- sprawdzić sylwetki szczytów z poziomu terenu,
- sprawdzić doliny i przełęcze,
- sprawdzić granice chunków podczas streamingu,
- potwierdzić deterministyczność wyników.

### Performance

Sprawdzić terrain/chunk generation time, draw calls, triangles, memory/GC jeśli wzrost geometrii jest istotny oraz streaming hitching.

Oddzielić w implementation notes: implemented, technically verified, browser/manual verified.

**Zrób git commit i push do main, rebase jeżeli trzeba**
