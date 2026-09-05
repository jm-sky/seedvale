# Plan: Ambient Soundscape Events and Lake Frogs

**Created:** 2026-09-05  
**Status:** `verification needed` 🔍  
**Implemented at:** 2026-09-05 20:40  
**Type:** feature  
**Priority:** medium · **Effort:** M  
**Depends on:** ~~world-006~~, ~~ui-input-006~~  
**Domain:** `world`  
**Subdomains:** `events` `places`  
**Tags:** `audio` `ambient` `soundscape` `lake` `frogs`  
**Roadmap:** -

## Implementation status (2026-09-05)

**Implemented + technically verified** (`tsc --noEmit`, `eslint`, `vitest run` — 3248 tests, `vite build` all clean): all sections.

- **§1/§2/§3 (categories + ambient event runtime + owl migration):** new `audio/ambientEvents.ts` — `AmbientEventDefinition` (data: sounds/volume/bus/offset/cooldown/recheckSec/chance/`isEligible` predicate) + `createAmbientEventRuntime()` (cooldown/recheck/chance/variant-selection/placement/playback, injectable `rng`). The owl hoot moved onto it unchanged (`OWL_EVENT` in `createAmbientAudio.ts`, same tuning constants/semantics/timing, still on the `sfx` bus like before — deliberately not switched to `ambient`, per the implementation notes' "avoid silently changing existing owl mix during migration" caution). Continuous layers (forest/meadow/wind/coast/birds/crickets) untouched.
- **§4/§7 (shared local-water context):** extracted the pure lake/ocean shoreline probe (`shoreProbeHits`/`nearestShoreProbePoint`, previously fauna-only) and the lake/river/ocean decision helper (`resolveWaterBodyKind`, previously in `app/interactables.ts`) into a new `terrain/waterBodyKind.ts` — the one shared water-body-kind primitive both `app/interactables.ts`'s shoreline resolver and ambient audio's frog gain now consume, instead of audio depending on `fauna/AnimalAgent.ts` or `app/interactables.ts`. Added `lakeProximityAt()`: a bounded radial probe (5 ring radii × 8 directions around the listener, one `oceanMixAt` check at the listener's own position) yielding a continuous `[0,1]` lake-shore proximity — ocean rejected outright, rivers rejected by construction (a river's own water surface can sit above `waterLevel`, so it never satisfies the same height-threshold probe lake/ocean shorelines do). `AmbientSamplers` gained `sampleHeight` (already present on the `WorldContext` passed in at the call site, so no call-site change was needed).
- **§5/§6/§8 (frogs):** new `audio/nightPhase.ts` (moved `nightPhase()` out of `createAmbientAudio.ts` so both crickets and frogs share one primitive without a circular import) + `audio/frogAmbience.ts` (`frogsTimeFactor()`, its own dusk/night/pre-dawn tuning independent of crickets). `weatherAmbientFactor()` extended with a `frogs` field. One lazy `WorldAudio.createLoop()` bed (`ambient-lake-frogs-loop-01.ogg`), gain = lake proximity × frog time factor × frog weather factor, sampled inside the existing 0.25s throttle alongside forest/coast/wind/meadow/birds — no new timer, no positional per-lake sources, no `AnimalAgent` dependency.
- **Asset:** the staged `frogs-night-1.ogg` (repo root, ~5.6 min field recording) was trimmed to its busiest ~26s chorus stretch, short fade in/out to avoid a loop-seam click, and converted to OGG Vorbis (ffmpeg's native encoder, run through a local PyAV venv — no `libvorbis` available in this environment, so the output bitrate is higher than the other loops' — ~238 kbps vs. their ~85-112 kbps; still a reasonable size for a lazily-loaded bed). Placed at `public/sounds/ambient-lake-frogs-loop-01.ogg`; `public/sounds/README.md` and `docs/assets/SOUNDS.md` updated. Provenance beyond the staged filename not recorded (same "TBD" status as the existing owl clip).
- **Tests:** `audio/ambientEvents.test.ts` (ineligible skips the roll without consuming `rng`, cooldown blocks re-firing, a failed chance roll uses the recheck interval, a successful roll's variant/placement/next-cooldown are all deterministic under an injected queued `rng`), `audio/frogAmbience.test.ts`, `terrain/waterBodyKind.test.ts` (moved `shoreProbeHits`/`nearestShoreProbePoint`/`resolveWaterBodyKind` coverage + new `lakeProximityAt` cases: no water nearby, at/inside the shore, approaching, ocean rejection).

**Browser/gameplay-verified:** not yet — per this session's instructions, left to the user (see "Weryfikacja" below for the manual checklist).

## Cel

Uporządkować ambient audio tak, aby ciągłe warstwy środowiskowe, losowe zdarzenia dźwiękowe i lokalne dźwięki związane z miejscem korzystały ze spójnego mechanizmu i wspólnego kontekstu środowiska.

Pierwszym zastosowaniem refactoru będzie:

1. przeniesienie istniejącej sowy z dedykowanej logiki do generycznego mechanizmu ambient events,
2. dodanie odgłosów żab związanych z jeziorami.

Nie tworzyć osobnego systemu audio dla żab ani kolejnych specjalnych timerów bezpośrednio w `createAmbientAudio.ts`.

## Motywacja

Obecny ambient ma już dobrą podstawę:

- `WorldAudio` odpowiada za odtwarzanie, gain i fade,
- `createAmbientAudio()` składa biom, pogodę i porę dnia,
- `ambientWeightsAt()` dostarcza wagi środowiska,
- ptaki, świerszcze, las, łąka, wybrzeże i wiatr korzystają z tego mechanizmu.

Problemem jest inna kategoria dźwięków. Istniejąca sowa ma własną logikę cooldownu, szansy, warunków, pory dnia, pozycji i playbacku. Jeżeli kolejne dźwięki będą dodawane w ten sam sposób, `createAmbientAudio.ts` zacznie gromadzić niezależne specjalne przypadki.

Dodatkowo obecne `ambientWeightsAt()` rozpoznaje głównie szerokie środowisko (`ocean`, `forest`, `mountain`), ale nie reprezentuje jeszcze lokalnego kontekstu typu „w pobliżu konkretnego jeziora”. Repozytorium ma już wspólne rozpoznawanie naturalnych zbiorników `lake | river | ocean`; należy je reuse'ować zamiast tworzyć detekcję tylko dla audio.

## Zakres

### 1. Rozdzielenie kategorii ambient audio

Zachować trzy wyraźne koncepty.

#### Continuous ambient layers

Długie loopy zależne od szerokiego środowiska, np.:

- forest,
- meadow,
- wind,
- coast,
- birds,
- crickets.

Ich architektura pozostaje oparta o:

```text
base volume
× environment weight
× time factor
× weather factor
```

Nie przenosić ich do systemu eventów.

#### Ambient events

Krótkie, sporadyczne dźwięki zależne od kontekstu świata, np.:

- sowa,
- przyszłe pojedyncze odgłosy ptaków,
- przyszły odległy wilk,
- inne podobne zdarzenia.

Powinny korzystać ze wspólnego runtime'u obsługującego:

- warunki,
- cooldown,
- probability/chance,
- wybór wariantu dźwięku,
- pozycję,
- playback.

#### Local environmental ambience

Dźwięki związane z konkretnym typem miejsca lub cechą świata, których intensywność zależy od odległości/proximity.

Pierwszy przypadek: żaby przy jeziorach.

Mechanizm powinien dać się później wykorzystać np. dla wodospadu, młyna, kuźni, bagna lub innych lokalnych źródeł ambientu bez tworzenia osobnego managera dla każdego przypadku.

### 2. Ambient event runtime

Wydzielić z `createAmbientAudio.ts` mały, współdzielony mechanizm odpowiedzialny za losowe zdarzenia ambientowe.

Konfiguracja zdarzenia powinna opisywać dane, a nie zawierać własny mini-runtime. Kierunek:

```ts
type AmbientEventDefinition = {
  id: string
  sounds: readonly string[]
  cooldown: { min: number; max: number }
  chance: number
  conditions?: {
    time?: unknown
    weather?: unknown
    environment?: unknown
  }
  spatial?: {
    minDistance: number
    maxDistance: number
  }
}
```

Dokładny model dopasować do istniejącego kodu.

Runtime powinien centralnie odpowiadać za:

```text
environment context
→ eligibility
→ cooldown
→ chance
→ sound selection
→ position
→ WorldAudio playback
```

Nie budować ogólnego rule engine ani rozbudowanego ECS audio.

### 3. Migracja sowy

Przenieść istniejącą sowę na nowy mechanizm.

Konfiguracja sowy powinna określać przede wszystkim:

- asset / warianty assetu,
- aktywność nocną,
- wymagane środowisko leśne,
- cooldown,
- chance,
- zakres odległości.

Usunąć z `createAmbientAudio.ts` dedykowany stan/timer i specjalną ścieżkę wykonania sowy.

Zachować obecne zachowanie gameplayowe możliwie bez zmian. Sowa jest regresyjnym przypadkiem testowym potwierdzającym, że nowy mechanizm zastępuje dotychczasową logikę bez tworzenia drugiego systemu.

### 4. Wspólny lokalny kontekst środowiska

Nie dodawać `isNearLakeForFrogs()` ani podobnego audio-only helpera.

Wykorzystać istniejące rozpoznawanie naturalnej wody:

```ts
WaterBodyKind = 'lake' | 'river' | 'ocean'
```

oraz istniejącą detekcję shoreline / terrain sampling.

Potrzebny jest współdzielony sygnał pozwalający ambientowi określić lokalną bliskość jeziora:

```text
environment sampling
→ lake proximity / freshwater weight
→ ambient soundscape
```

Preferować wartość ciągłą, np. `0..1`, zamiast wyłącznie boolean, aby gain mógł płynnie rosnąć i maleć.

Nie wykonywać kosztownego world-wide wyszukiwania jezior na każdej klatce. Wykorzystać istniejące dane terrain/chunk/water oraz obecny throttling ambientu.

### 5. Żaby przy jeziorach

Dodać ambient żab związany wyłącznie z lokalnym środowiskiem jeziora.

Żaby:

- nie są obecnie encjami fauny,
- nie mają populacji,
- nie wymagają agentów,
- nie wymagają spawn/despawn,
- nie tworzą osobnego ecosystem system.

Ich dźwięk reprezentuje lokalny ecosystem ambience.

Gain powinien wynikać z bliskości jeziora:

```text
daleko od jeziora → 0
zbliżanie się → płynny wzrost
brzeg jeziora → pełny lokalny ambient
oddalanie się → płynne wygaszanie
```

Żaby nie powinny pojawiać się:

- nad oceanem,
- automatycznie przy każdej rzece,
- tylko dlatego, że biom ma wysoką wilgotność.

Na tym etapie źródłem jest `lake`.

Profil dobowy:

```text
dzień        → brak / bardzo mało
zmierzch     → wzrost
noc          → aktywne
przed świtem → wygaszanie
świt         → 0
```

Wykorzystać istniejące profile czasu zamiast wprowadzać nowy zegar.

Pogoda może modyfikować intensywność przez istniejący `WeatherState`; wartości pozostają parametrami do strojenia.

### 6. Charakter przestrzenny żab

Żaby powinny brzmieć jak element jeziora, a nie globalny nocny loop niezależny od miejsca.

Nie tworzyć wielu stale działających `PositionalAudio` wokół każdego jeziora.

Preferować tani mechanizm oparty o:

- lokalny lake proximity weight,
- jeden aktywny loop / niewielką liczbę źródeł,
- obecny system fade/gain,
- aktualizację w istniejącym niskoczęstotliwościowym sampling interval.

Jeżeli obecne `WorldAudio.createLoop()` nie pozwala sensownie zakotwiczyć lokalnego loopa, dodać najmniejszą potrzebną abstrakcję dla local environmental ambience. Nie przebudowywać całego `WorldAudio`.

Dopuszczalne jest połączenie ciągłego lake frog ambience z opcjonalnymi sporadycznymi localized one-shotami, jeżeli daje to lepszy efekt przy małym koszcie.

Nie generować pozycji względem gracza jako długoterminowego źródła prawdy. Lokalność powinna wynikać z geografii świata.

### 7. Ambient context

Ograniczyć liczbę niezależnych obliczeń w `createAmbientAudio()`.

Rozważyć mały kontekst aktualizowany podczas istniejącego próbkowania:

```ts
type AmbientContext = {
  environment: unknown
  time: unknown
  weather: unknown
  position: unknown
}
```

Następnie continuous layers, ambient events i local ambience korzystają z tego samego snapshotu.

Nie duplikować:

- obliczania pory dnia,
- weather factors,
- terrain sampling,
- pozycji listenera/playera.

Nie tworzyć globalnego `AmbientManager` / God Object.

### 8. Wydajność

Ambient nie powinien wykonywać kosztownych operacji per-frame.

Zachować lub rozszerzyć obecny model throttled sampling.

W szczególności:

- nie skanować wszystkich jezior,
- nie tworzyć wielu WebAudio nodes co update,
- nie tworzyć loopów przy każdym wejściu/wyjściu z zasięgu,
- lazy-loadować assety, które nie są potrzebne,
- zachować istniejący buffer cache,
- używać płynnego gain/fade zamiast start/stop przy każdym przekroczeniu progu.

Nowy system ambient events powinien mieć koszt proporcjonalny do małej liczby definicji, nie do liczby encji świata.

## Relevant files / systems

Kluczowe istniejące miejsca:

```text
src/audio/createAmbientAudio.ts
src/audio/createWorldAudio.ts
src/audio/ambientWeights.ts
src/world/WaterSource.ts
src/app/interactables.ts
src/terrain/chunkManager.ts
src/world/dayNight.ts
```

Podczas implementacji ustalić na podstawie aktualnego kodu właściwe miejsce dla:

- ambient event runtime,
- lokalnego environment sampling,
- lake proximity.

Preferować małe moduły w `src/audio/` lub istniejących world/terrain abstractions zamiast dalszego rozrostu `createAmbientAudio.ts`.

Nie przenosić ogólnej geometrii/detekcji jezior do warstwy audio.

## Testy

Dodać testy dla czystych elementów mechanizmu.

### Ambient events

- event poza wymaganym środowiskiem nie jest eligible,
- event poza właściwą porą dnia nie jest eligible,
- cooldown blokuje ponowne odpalenie,
- po cooldownie event może zostać ponownie wybrany,
- probability/chance jest możliwe do deterministycznego przetestowania,
- migracja sowy zachowuje jej podstawowe warunki.

### Lake environment

- brak jeziora → lake weight 0,
- przybliżanie do jeziora zwiększa weight,
- przy brzegu weight osiąga docelowy zakres,
- ocean nie aktywuje lake frogs,
- rzeka nie aktywuje lake frogs.

### Frogs

- dzień → brak / docelowo minimalny gain,
- zmierzch → wzrost,
- noc + jezioro → aktywne,
- noc bez jeziora → 0,
- oddalenie od jeziora → płynne wygaszenie,
- weather factor poprawnie modyfikuje wynik.

Tam, gdzie występuje losowość, umożliwić testowanie przez istniejący deterministyczny mechanizm lub jawnie wstrzykiwany RNG zamiast testów zależnych od `Math.random()`.

## JSDoc / preflight

Dodać JSDoc do ważnych nowych publicznych/architektonicznych funkcji i typów, szczególnie:

- ambient event runtime,
- environment/local-water sampler,
- reusable local ambience abstraction, jeżeli powstanie.

Użyć `@domain world` tam, gdzie pomaga to późniejszemu preflightowi i nawigacji po kodzie.

## Poza zakresem

- dodawanie żab jako `AnimalAgent`,
- populacja/reprodukcja żab,
- drapieżnictwo żab,
- sezonowy lifecycle żab,
- osobny wetland biome,
- dźwięki żab przy wszystkich rodzajach wody,
- pełny system acoustic occlusion,
- propagation dźwięku przez teren/budynki,
- HRTF overhaul,
- duża przebudowa `WorldAudio`,
- audio worker,
- osobny world-wide registry źródeł audio,
- automatyczne pobieranie assetów,
- ogólny rule engine do wszystkich zdarzeń świata.

## Rezultat

Po wykonaniu planu architektura powinna wyglądać koncepcyjnie tak:

```text
                    time
                     │
weather ─────────────┼─────────────┐
                     │             │
terrain / water ─→ AmbientContext  │
                     │             │
          ┌──────────┼─────────────┤
          │          │             │
          ▼          ▼             ▼
   continuous     ambient       local
     layers        events      ambience
          │          │             │
          └──────────┴──────┬──────┘
                            ▼
                       WorldAudio
```

Przykłady:

```text
forest + day + clear
→ birds

forest + night
→ owl ambient event

lake proximity + dusk/night + weather
→ frogs

mountain
→ wind
```

Dodanie kolejnego podobnego ambientu powinno wymagać przede wszystkim konfiguracji i wykorzystania istniejącego kontekstu, a nie kolejnego dedykowanego timera i specjalnej ścieżki w `createAmbientAudio.ts`.

## Weryfikacja

### Techniczna — AI

Uruchomić testy, typecheck/lint i build zgodnie z `CLAUDE.md`.

Sprawdzić:

- brak regresji istniejących ambient loops,
- sowa korzysta z nowego mechanizmu,
- brak starej równoległej logiki sowy,
- brak osobnej detekcji jeziora tylko dla żab,
- brak niekontrolowanego tworzenia audio nodes/loopów,
- lake sampling nie wprowadza kosztownego per-frame skanowania.

AI nie wykonuje browser verification.

### Browser / gameplay — użytkownik

Ręcznie sprawdzić:

- obecne forest/meadow/coast/wind ambience nadal działa,
- ptaki i świerszcze zachowują profile czasu/pogody,
- sowa nadal występuje tylko w odpowiednich warunkach,
- nad jeziorem wieczorem/nocą pojawiają się żaby,
- odejście od jeziora płynnie je wycisza,
- rzeka i ocean nie uruchamiają żab,
- dźwięk nie przeskakuje gwałtownie podczas poruszania się,
- wejście/wyjście z zasięgu wielokrotnie nie tworzy nakładających się loopów,
- brak zauważalnego wpływu na płynność gry.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
