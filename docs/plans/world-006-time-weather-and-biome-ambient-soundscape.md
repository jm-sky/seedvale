# Plan: Time, Weather and Biome Ambient Soundscape

**Created:** 2026-08-29  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** S  
**Depends on:** none  
**Domain:** `world`

## Cel

Rozbudować istniejący ambient audio tak, aby soundscape zależał od:

- pory dnia,
- pogody,
- biomu / środowiska.

Świat powinien zmieniać charakter dźwiękowy naturalnie, bez nagłych przełączeń.

Nie tworzyć nowego systemu audio.

## Obecny stan

`createAmbientAudio()` obsługuje już m.in.:

- nocne świerszcze,
- las,
- łąkę,
- wybrzeże i fale,
- wiatr.

`ambientWeightsAt()` dostarcza istniejące wagi środowiskowe (`ocean`, `forest`, `mountain`).

`WorldAudio.createLoop()` i `setTargetGain()` zapewniają płynne przejścia.

Pora dnia jest dostępna przez istniejący `DayNightState` / `timeOfDay` / `dayFactor`.

## Zakres

### 1. Ptaki

Dodać ambient ptaków:

- **1 sample** na obecnym etapie,
- ładowany przez istniejący system loopów,
- asset dodany ręcznie przez użytkownika.

Profil dobowy:

```
noc → 0
świt → wzrost
dzień → aktywne
wieczór → wygaszanie
noc → 0
```

Profil powinien być płynny, bez sztywnych przełączeń.

### 2. Świerszcze

Rozszerzyć obecny profil, który wykorzystuje `dayFactor`.

Docelowo:

```
dzień → 0
zmierzch → wzrost
noc → aktywne
późna noc → stopniowe wyciszenie
przed świtem → 0
```

Ma istnieć okres względnej ciszy przed rozpoczęciem porannego soundscape'u.

### 3. Pogoda

Pogoda modyfikuje gain ambientów.

Orientacyjnie:

| Pogoda | Ptaki | Świerszcze |
|---|---:|---:|
| pogodnie | normalnie | normalnie |
| pochmurno | ↓ | ↓ |
| lekki deszcz | mocno ↓ | ↓ |
| ulewa | ~0 | 0 |
| śnieg | 0 | 0 |

Wartości pozostają parametrami do strojenia.

Nie wpływa to na populację ani symulowany stan zwierząt.

### 4. Biom

Wykorzystać istniejące `ambientWeightsAt()`.

Ambient powinien być zależny od środowiska, np.:

- las → silniejszy ambient ptaków,
- łąka → odpowiedni ambient środowiskowy,
- wybrzeże → fale / obecny ambient wybrzeża,
- góry → wiatr.

Nie tworzyć osobnego systemu rozpoznawania biomów.

### 5. Łączenie czynników

Gain ambientu powinien być wynikiem istniejącego kontekstu:

```
base volume
× biome weight
× time-of-day factor
× weather factor
```

Profile czasu i pogody powinny być niezależne, aby można je było łatwo dostroić.

## Architektura

Wykorzystać:

- `src/audio/createAmbientAudio.ts`,
- `src/audio/createWorldAudio.ts`,
- `src/audio/ambientWeights.ts`,
- `src/world/dayNight.ts`,
- istniejący system pogody.

Nie tworzyć osobnych managerów audio, biomów ani czasu.

`createAmbientAudio()` powinien jedynie złożyć istniejące informacje w końcowy gain, a `WorldAudio` nadal odpowiada za odtwarzanie i fade.

## Assety

Na tym etapie:

- 1 sample ptaków,
- istniejący sample świerszczy,
- brak automatycznego pobierania.

Po ręcznym dodaniu assetu uzupełnić dokumentację źródła/licencji.

Wiele kompatybilnych próbek i losowe crossfade'y pozostają na przyszłość.

## Poza zakresem

- wiele wariantów jednego ambientu,
- losowe crossfade'y między próbkami,
- nowe zachowania zwierząt,
- zmiana populacji pod wpływem pogody,
- voice acting NPC,
- przebudowa `WorldAudio`,
- nowe systemy pogody lub biomów.

## Weryfikacja

### Techniczna

- testy profili czasu i pogody,
- testy kombinacji biom + czas + pogoda,
- `npm run build`,
- lint/typecheck zgodnie z `CLAUDE.md`.

### Browser / gameplay

Zweryfikować:

- dzień → ptaki, brak świerszczy,
- świt → płynne pojawienie się ptaków,
- wieczór → ptaki zanikają, świerszcze pojawiają się,
- noc → brak ptaków, aktywne świerszcze,
- późna noc / przed świtem → stopniowe wyciszenie,
- deszcz i śnieg → odpowiednie ograniczenie ambientu,
- różne biomy → odpowiedni charakter dźwięku,
- brak nagłych zmian głośności i klików.

Sprawdzić również brak niekontrolowanego tworzenia loopów i brak zauważalnego wpływu na wydajność.

**Zrób git commit i push do main, rebase jeżeli trzeba**
