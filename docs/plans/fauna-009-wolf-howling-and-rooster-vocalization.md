# Plan: Wolf Howling and Rooster Vocalization

**Created:** 2026-09-03  
**Status:** `verification needed` 🔍  
**Type:** feature  
**Priority:** medium · **Effort:** M  
**Depends on:** none  
**Domain:** `fauna`  
**Subdomains:** `domestication`  
**Tags:** `vocalization` `audio` `wolf` `rooster`

## Goal

Rozszerzyć istniejący system fauna/audio o dwa naturalne elementy świata:

1. **wycie wilków**, szczególnie nocą,
2. **pianie kogutów**, szczególnie o świcie.

W ramach tego feature'a dodać również koguta jako nowy rodzaj zwierzęcia.

Nie tworzyć nowego systemu audio ani równoległego systemu zachowań. Wykorzystać istniejące mechanizmy fauna, wokalizacji, czasu świata i spatial audio.

## Current state

Istniejący system już obsługuje spontaniczne wokalizacje zwierząt.

`AnimalAgent.update()`:
- obsługuje cooldown spontanicznej wokalizacji,
- korzysta z istniejącego `onVocalize`,
- ma dostęp do cyklu dnia/nocy,
- posiada stan ruchu i aktywnego zachowania,
- integruje animację przez istniejący `mixer`.

Istnieją również:
- `AnimalKind: chicken`,
- `chicken.glb`,
- istniejące audio fauna,
- `animal-wolf-01.ogg`,
- `animal-dog-01.ogg`.

Kogut nie jest obecnie osobnym rodzajem zwierzęcia.

Nowe źródła audio:

```text
public/sounds/fauna-rooster-crow-1.wav
public/sounds/fauna-wolf-howl-1.wav
```

`fauna-wolf-howl-1.wav` zostanie ręcznie skrócony przed konwersją.

## Scope

### 1. Wolf howl

Rozszerzyć istniejącą obsługę spontanicznych wokalizacji o howl wilka.

Howl powinien:

- występować przede wszystkim nocą,
- mieć możliwość wystąpienia w okresie zmierzchu/świtu,
- być ograniczony lub wyłączony w dzień,
- korzystać z istniejącego randomization i cooldown,
- nie kolidować z ważniejszym zachowaniem wilka,
- nie przerywać pościgu, ataku ani ucieczki,
- w przypadku braku dedykowanej animacji zatrzymać wilka na krótki czas,
- korzystać z istniejącego spatial audio,
- być słyszalny z większej odległości niż standardowa wokalizacja, jeżeli można to osiągnąć poprzez istniejące mechanizmy audio.

Howl nie powinien być realizowany jako zwykłe zwiększenie szansy istniejącego `wolf` vocalize. Powinien uwzględniać porę dnia i stan zachowania wilka.

Jeżeli brak animacji howl, krótki stop powinien być realizowany jako istniejący lub minimalny prezentacyjny override ruchu/animacji. Nie wprowadzać nowej strategii ani stanu decyzyjnego AI tylko na potrzeby wokalizacji.

Nie implementować w tym planie pełnej komunikacji watahy ani automatycznego odpowiadania wilków.

### 2. Rooster

Dodać koguta zgodnie z istniejącym modelem rodzajów zwierząt.

Recon potwierdził, że `chicken` już istnieje, ale nie należy z góry zakładać konkretnego modelu płci/architektury. Przed implementacją sprawdzić aktualne definicje `AnimalKind`/`AnimalDef` i wykorzystać istniejący mechanizm, bez tworzenia równoległego modelu zwierząt.

Zakres:
- integracja z istniejącą architekturą fauna,
- spawn/obecność w świecie,
- podstawowe zachowanie ruchu i idle,
- integracja z istniejącym systemem wokalizacji.

Kogut nie potrzebuje w tym planie:
- produkcji,
- rozmnażania,
- nowego systemu płci,
- rozbudowanej mechaniki hodowli.

### 3. Rooster asset

Przed implementacją sprawdzić `/_temp/` zgodnie z `docs/assets/LOCAL_ASSETS.md`.

Jeżeli odpowiedni model jest dostępny, można go wykorzystać.

Jeżeli nie ma gotowego modelu, użyć **placeholdera** zgodnego z istniejącym pipeline'em fauna. Brak docelowego modelu nie może blokować implementacji ani weryfikacji zachowania.

Docelowy model powinien dać się później podmienić bez zmiany logiki zachowania.

### 4. Rooster crow

Dodać pianie koguta do istniejącego mechanizmu spontanicznych wokalizacji.

Preferowane zachowanie:
- najwyższa częstotliwość w okolicy świtu,
- możliwość sporadycznego piania w ciągu dnia,
- brak lub bardzo niska częstotliwość poza aktywną porą,
- istniejący cooldown/randomization,
- brak nadmiernego spamowania przy wielu kogutach.

Zachowanie ma wynikać z istniejącego czasu świata, a nie z osobnego zegara koguta.

## Audio assets

Przygotować nowe audio w formacie używanym przez istniejący system fauna:

```text
public/sounds/fauna-rooster-crow-1.ogg
public/sounds/fauna-wolf-howl-1.ogg
```

### Wolf

`fauna-wolf-howl-1.wav`:
1. ręcznie skrócić,
2. następnie przekonwertować do OGG.

Automatyczne trimowanie nie jest częścią planu.

### Rooster

`fauna-rooster-crow-1.wav` przekonwertować do OGG.

Podłączyć oba pliki przez istniejący mechanizm mapowania/odtwarzania audio fauna.

## Reuse and constraints

Wykorzystać istniejące:
- `AnimalAgent`,
- `AnimalDef`,
- `AnimalKind`,
- spontaneous vocalization cooldown,
- `onVocalize`,
- istniejący system spatial audio,
- istniejący cykl dnia/nocy,
- istniejący spawn/lifecycle fauna,
- istniejący system animacji.

Nie tworzyć:
- nowego systemu audio,
- nowego managera wokalizacji,
- osobnego zegara zwierząt,
- równoległego mechanizmu cooldownów,
- player-only behavior.

Wokalizacje muszą działać również wtedy, gdy gracz nie znajduje się w pobliżu zwierzęcia.

Jeżeli istniejący system audio ogranicza odległość odtwarzania lub optymalizuje odległe źródła, rozszerzyć go zgodnie z istniejącą architekturą zamiast omijać go osobnym rozwiązaniem. Nie gwarantować globalnego odtwarzania dla odległych, nieaktywnych agentów.

## Non-goals

Poza zakresem:
- pies i jego zachowanie,
- szczekanie jako reakcja na wilka,
- komunikacja watahy,
- rozbudowane zachowania społeczne kur/kogutów,
- rozmnażanie chicken/rooster,
- nowy system audio,
- nowy system harmonogramów,
- dedykowana animacja howling, jeśli obecny asset jej nie posiada.

## Verification

### Wolf

Sprawdzić:
- howl występuje przede wszystkim nocą,
- zmierzch/świt mają odpowiednio mniejszą aktywność,
- wilk nie wyje podczas pościgu, ataku lub ucieczki,
- brak animacji howl nie powoduje błędów ani walki z ruchem,
- howl jest słyszalny z odpowiednio większej odległości bez omijania istniejących ograniczeń audio,
- wiele wilków nie generuje nadmiernego spamowania,
- howl działa niezależnie od obecności gracza.

### Rooster

Sprawdzić:
- kogut poprawnie pojawia się w świecie,
- działa podstawowy movement/idle,
- pianie występuje przede wszystkim o świcie,
- pianie może występować sporadycznie w ciągu dnia,
- wiele kogutów nie powoduje nadmiernego spamowania,
- placeholder może zostać później zastąpiony docelowym modelem bez zmiany logiki.

### Audio

Sprawdzić:
- oba WAV zostały poprawnie skonwertowane do OGG,
- wolf howl został skrócony przed konwersją,
- oba dźwięki są podłączone przez istniejący system audio,
- spatial audio działa poprawnie,
- nie powstał drugi system wokalizacji.

### Documentation

Dodać JSDoc dla nowych istotnych funkcji/klas architektonicznych, jeśli jest to potrzebne do discovery przez preflight. W razie potrzeby użyć `@domain fauna`.

**Zrób git commit i push do main, rebase jeżeli trzeba**
