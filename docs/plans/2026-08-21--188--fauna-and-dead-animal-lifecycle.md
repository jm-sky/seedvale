# Plan: Fauna and Dead Animal Lifecycle

**Created:** 2026-08-21  
**Status:** `planned` 📋  
**Priority:** high · **Effort:** M  
**Depends on:** ~~138~~ ~~177~~ ~~179~~

domain: fauna
tags: [fauna, animals, lifecycle, corpses, bears, habitat, combat]

## 1. Cel

Rozszerzyć istniejący system fauny o wspólny lifecycle martwego zwierzęcia oraz dodać niedźwiedzia jako kolejny gatunek korzystający z istniejących mechanizmów fauny, habitatów, AI, combat i audio.

Docelowo:

```text
żywe zwierzę
    ↓ śmierć
martwe zwierzę
    ↓ corpse timer
gnijące zwierzę
    ↓ decay timer
kupka kości
    ↓ remains timer
usunięcie
```

Niedźwiedź:

```text
cave habitat
    ↓
spawn bear
    ↓
existing AnimalAgent / fauna AI
    ↓
existing predator/prey + combat
```

Nie tworzyć osobnego lifecycle, AI, habitat systemu ani combat pipeline dla niedźwiedzia.

## 2. Reconnaissance — ustalenia z istniejącego codebase

Aktualny lifecycle śmierci znajduje się w `src/fauna/AnimalAgent.ts`. Istnieje już stan martwego zwierzęcia, corpse linger oraz osobny mechanizm harvested remains. Obecny corpse timer to `CORPSE_LINGER_SECONDS = 60`; po harvest istnieje własny TTL `HARVESTED_REMAINS_LINGER_SECONDS = 90`. fileciteturn11file0

Istniejący system pozostałości znajduje się w `src/fauna/harvestedRemains.ts`. Korzysta z cache'owanych assetów `bones_pile.glb`, `large_bone.glb` i `animal_hide.glb`, ma fallback proceduralny oraz funkcję dispose. To jest istniejący punkt integracji dla końcowego etapu kości. fileciteturn13file0

Istnieją już testy lifecycle/pozostałości w `src/fauna/harvestedRemains.test.ts`. fileciteturn18file0

System habitatów jest już częścią `createFauna.ts`: istnieją `cave`, `thicket` i `wolfDen`, a komentarze i konfiguracja wskazują cave jako predator habitat. `SPAWNER_SPECS` definiuje obecnie cave → wolf oraz inne istniejące typy spawnerów. Nie tworzyć nowego systemu „bear cave”. fileciteturn16file0

Audio fauny jest obsługiwane przez istniejący system assetów/audio; lista dźwięków znajduje się w `docs/assets/SOUNDS.md`. fileciteturn9file0

W codebase nie znaleziono jeszcze `bear.glb` ani `bear-growl.ogg`; traktować podane przez zadanie ścieżki jako nowe assety do integracji, nie jako istniejący system. Nie zmieniać ścieżek bez uzasadnienia wynikającego z aktualnego codebase.

## 3. Gnicie martwych zwierząt

Rozszerzyć istniejący corpse lifecycle w `AnimalAgent`, zamiast tworzyć drugi system śmierci.

Wprowadzić jawny stan/fazę odpowiadającą gniciu, jeżeli aktualny model stanu na to pozwala. Jeżeli istniejący `dead`/`expired` lifecycle jest wystarczający, rozszerzyć go minimalnie o fazę decay.

Minimalny przepływ:

```text
alive
 ↓
dead/corpse
 ↓ decay threshold
rotting corpse
 ↓ decay duration
bones/remains
 ↓ remains duration
removed
```

Czasy powinny być stałymi/tuningiem w istniejącym module, a nie rozrzuconymi magic numbers.

### Efekt wizualny

Dla fazy rotting:

- zmienić wizualny stan corpse tak, aby był odróżnialny od świeżo martwego,
- dodać lekkie zielone latające particles,
- dodać subtelną chmurkę/opar,
- wykorzystać istniejące mechanizmy FX/renderingu, jeśli takie istnieją,
- nie tworzyć ciężkiego efektu per corpse, który pozostaje aktywny poza istotnym zasięgiem.

Efekty powinny być aktywowane przede wszystkim dla obserwowanych/nearby corpses. Dla off-screen/remote corpses symulować tylko stan i timery; nie utrzymywać kosztownych particle emitters.

Jeżeli nie istnieje odpowiedni reusable particle/fog helper, utworzyć mały, lokalny mechanizm dla tego efektu zamiast globalnego particle managera.

## 4. Negatywny wpływ gnicia

Gnijące zwierzę może oddziaływać na istoty znajdujące się w pobliżu.

V1:

```text
rotting corpse
    ↓ proximity
existing needs/health/status integration point
    ↓
temporary negative effect/debuff
```

Nie implementować pełnego systemu chorób, jeżeli nie istnieje.

Preferowany kierunek to mały, jawny efekt/proximity hook, który w przyszłości może zostać podłączony do disease systemu bez tworzenia go teraz.

Nie dodawać osobnego systemu zdrowia tylko dla gnijących zwierząt.

## 5. Kości

Po zakończeniu fazy gnicia wykorzystać istniejący system `harvestedRemains` / bones.

W szczególności:

- nie tworzyć nowego `bearBones`, `corpseBones` ani analogicznego systemu per gatunek,
- rozszerzyć `AnimalKind`/konfigurację tylko tam, gdzie obecny system wymaga nowego gatunku,
- użyć istniejącego `bones_pile.glb` i powiązanych templatek,
- zachować istniejący dispose lifecycle,
- po kolejnym timerze usunąć pozostałości ze świata.

Dla zwykłego, nieharvestowanego corpse końcowa faza ma prowadzić do kupki kości. Nie mieszać tego z istniejącym 90-sekundowym TTL harvested remains, który obsługuje inny przypadek gameplayowy. fileciteturn13file0

## 6. Off-screen / hybrid simulation

Lifecycle corpses musi działać niezależnie od renderowania.

Zasada:

```text
near / observed corpse
→ full visual state + FX

far / unloaded corpse
→ timers + lifecycle state only
```

Nie opierać przejścia corpse → rotting → bones na liczbie renderowanych klatek ani na obecności particle effects.

Jeżeli fauna jest już agregowana/off-screen w istniejącej architekturze, podłączyć lifecycle do tego samego zegara/symulacji zamiast tworzyć osobny timer loop.

## 7. Niedźwiedź — wspólny gatunek fauny

Dodać `bear` do istniejącego `AnimalKind`/definicji gatunków.

Konfiguracja powinna określać przede wszystkim:

- duży rozmiar,
- wysokie HP,
- wysokie obrażenia,
- odpowiednią prędkość/siłę zgodnie z istniejącym modelem statystyk,
- charakter drapieżnika/omnivora zgodnie z istniejącymi kategoriami systemu.

Nie tworzyć `BearAgent`, `BearAI`, `BearCombat` ani podobnych klas.

Wszystkie zachowania mają przechodzić przez `AnimalAgent` i istniejące systemy.

## 8. Model niedźwiedzia

Dodać asset:

```text
public/models/fauna/bear.glb
```

Podłączyć go przez istniejący mechanizm `FAUNA_URLS`/templatek lub jego aktualny odpowiednik po reconnaissance implementacyjnym.

Jeżeli asset wymaga tych samych przygotowań co pozostałe fauna GLB, zastosować istniejący pipeline (`loadGltfAsset`, `prepareProp`, cache templatek), bez osobnego loadera.

## 9. Habitat — jaskinie

Istniejący `cave` jest habitatem predatorów i jest już częścią `SPAWNER_SPECS`. fileciteturn16file0

Rozszerzyć istniejącą konfigurację tak, aby niedźwiedź mógł preferować/spawnować się w cave.

Preferowany kierunek:

```text
existing cave spawner
    ↓
existing spawn configuration
    ↓
AnimalKind = bear
```

Nie tworzyć:

```text
BearCaveSpawner
BearHabitatSystem
BearDenManager
```

Jeżeli jedna cave może obsługiwać tylko jeden gatunek, rozszerzyć istniejący model spawnera minimalnie, tak aby wspierał konfigurację gatunku/rotacji bez duplikowania systemu.

## 10. Fauna AI i combat

Niedźwiedź korzysta z istniejących:

- `AnimalAgent`,
- animal life/needs,
- predator/prey interactions,
- perception,
- combat/damage,
- human/NPC threat handling,
- lifecycle,
- spawn/recovery.

Nie dodawać warunków typu:

```ts
if (kind === 'bear') {
  // całe specjalne AI
}
```

Wyjątki gatunkowe są dopuszczalne tylko jako dane/parametry istniejących systemów.

## 11. Audio

Dodać asset:

```text
public/sounds/bear-growl.ogg
```

Podłączyć przez istniejący system audio zwierząt.

Nie tworzyć osobnego `BearAudioManager`.

Growl powinien być używany w istniejących sytuacjach audio fauny, np. agresja/atak/alert, zgodnie z tym jak obecnie wybierane są dźwięki innych zwierząt.

Zaktualizować dokumentację assetów, jeżeli aktualny workflow tego wymaga.

## 12. Testy

Dodać testy do istniejących modułów testowych.

### Corpse lifecycle

```text
fresh corpse
→ not rotting

rotting threshold reached
→ rotting

decay threshold reached
→ bones/remains

remains lifetime reached
→ removed
```

### Timing

Sprawdzić, że przejścia zależą od czasu symulacji, a nie render FPS.

### Effects

Sprawdzić przynajmniej stan aktywacji/dezaktywacji FX dla rotting corpse bez konieczności testowania wizualnej jakości Three.js w unit testach.

### Bear data

```text
bear
→ valid AnimalKind
→ valid animal definition
→ valid fauna model URL
→ valid combat/lifecycle configuration
```

### Habitat

```text
cave spawner
→ can produce bear
```

### Regression

Istniejące wolf/deer/stag/boar oraz harvested remains nadal działają bez zmiany obecnego kontraktu.

## 13. Browser / gameplay verification

Zweryfikować rzeczywisty gameplay:

1. Uruchomić świat.
2. Doprowadzić istniejące zwierzę do śmierci.
3. Potwierdzić świeży corpse.
4. Odczekać/przyspieszyć czas do fazy rotting.
5. Potwierdzić wizualne odróżnienie corpse.
6. Potwierdzić zielone particles i subtelną chmurkę/opar.
7. Potwierdzić proximity debuff/hook.
8. Potwierdzić przejście rotting → bones.
9. Potwierdzić wykorzystanie istniejącej kupki kości.
10. Potwierdzić usunięcie bones po kolejnym timerze.
11. Znaleźć/spawnować niedźwiedzia.
12. Potwierdzić preferencję jaskini/habitat.
13. Potwierdzić model `bear.glb`.
14. Potwierdzić growl.
15. Potwierdzić istniejące zachowanie combat.
16. Potwierdzić, że niedźwiedź nie wymaga specjalnego AI.
17. Oddalić kamerę/obserwatora i potwierdzić poprawny off-screen lifecycle bez kosztownych FX.

## 14. Performance

Nie dodawać:

- globalnego corpse update loop,
- particle emittera działającego bezwarunkowo dla każdego corpse,
- per-frame kosztownego skanowania wszystkich corpse,
- osobnego worker pipeline tylko dla tego feature.

Lifecycle ma korzystać z istniejącego tick/update fauny.

FX powinny być distance/visibility gated i możliwie współdzielone/reużywalne.

## 15. Zakres V1

### W zakresie

- wspólny corpse → rotting → bones → removal lifecycle,
- timing oparty o symulację,
- wizualne rozróżnienie rotting corpse,
- lekkie zielone particles,
- subtelny opar/chmurka,
- proximity negative effect / disease integration hook,
- wykorzystanie istniejącego bones/remains system,
- `bear` jako istniejący typ fauny,
- `bear.glb`,
- cave habitat/spawn integration,
- istniejące fauna AI/life/combat integration,
- `bear-growl.ogg`,
- testy,
- browser verification.

### Poza zakresem

- pełny system chorób,
- osobny bear AI,
- osobny bear combat,
- osobny bear habitat system,
- nowe globalne particle framework,
- nowe systemy multiplayer/networking,
- niezwiązane refaktory.

## 16. Acceptance criteria

```text
animal death
→ existing corpse lifecycle
→ rotting after configured time
→ visible rotting state + lightweight FX
→ nearby negative effect hook
→ existing bones/remains representation
→ removal after configured lifetime

bear
→ exists as AnimalKind
→ uses existing AnimalAgent
→ uses existing fauna AI/life/combat
→ spawns through existing cave habitat/spawner
→ uses bear.glb
→ uses existing animal audio pipeline + bear-growl.ogg
→ participates in existing ecosystem interactions

remote corpse
→ lifecycle continues without render-only dependency
→ no expensive particles off-screen

no parallel corpse/bear/habitat/combat systems
```

## 17. Verification

Sprawdzić:

- `src/fauna/AnimalAgent.ts`,
- `src/fauna/AnimalLife.ts`,
- `src/fauna/createFauna.ts`,
- `src/fauna/AnimalSpawner.ts`,
- `src/fauna/harvestedRemains.ts`,
- istniejące testy fauny/remains,
- istniejący audio pipeline,
- `docs/assets/MODELS.md`,
- `docs/assets/SOUNDS.md`,
- typecheck,
- lint,
- testy,
- build,
- browser/gameplay lifecycle,
- cave → bear spawn,
- bear combat/audio,
- off-screen/hybrid lifecycle.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
