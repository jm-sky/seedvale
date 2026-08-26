# Plan: Animal and NPC Social Audio

**Created:** 2026-08-26  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** S  
**Depends on:** ~~151~~  
**Domain:** `settlements-npcs`

## Cel

Dodać brakujące, naturalne dźwięki świata:

- spontaniczne odgłosy krów, owiec i kur,
- kontekstowe odgłosy zwierząt przy wybranych interakcjach,
- krótkie odgłosy rozmowy NPC podczas istniejącego `conversation` w Social Places.

Nie tworzyć nowego systemu audio ani równoległego systemu zachowań.

## Zakres

### 1. Zwierzęta

Rozszerzyć istniejący system `src/audio/animalSounds.ts`.

Wykorzystać istniejące `ANIMAL_SOUND_URLS` i `playAnimalSound()` zamiast tworzyć osobny mechanizm audio.

Dodać możliwość wywołania spontanicznego vocalization z symulacji zwierzęcia:

- `cow` — moo,
- `sheep` — baa,
- `chicken` — cluck.

Spontaniczne odgłosy powinny być **per-animal**, z cooldownem i probabilistycznym triggerem, zamiast globalnego `15% co 15 minut`.

Początkowe wartości do dostrojenia podczas implementacji:

- cooldown: około 20–40 minut czasu gry,
- bazowa szansa po zakończeniu cooldownu: około 10–15%,
- kura może mieć nieco krótszy cooldown,
- dodatkowe sytuacje mogą wywoływać dźwięk event-driven.

Dodać ograniczenie jednoczesnych odgłosów zwierząt, aby większe stada nie powodowały audio-spamu.

### 2. Kontekstowe odgłosy zwierząt

Istniejące dźwięki interakcji pozostają bez zmian.

Dodać tylko sensowne dodatkowe wywołania, np.:

- karmienie,
- bezpośrednia interakcja,
- wybrane przyszłe zachowania, jeśli istnieje już odpowiedni event.

Nie duplikować triggerów pomiędzy UI i symulacją.

### 3. NPC — friendly talk

Wykorzystać istniejącą akcję `conversation` z Social Places.

Nie dodawać losowego dźwięku dla NPC tylko dlatego, że znajduje się przy Social Place.

Audio ma być konsekwencją faktycznej rozmowy:

`conversation action → friendly talk SFX`

Dźwięk powinien być:

- krótki,
- nieartykułowany,
- losowany z kilku wariantów,
- opcjonalnie rozdzielony na pule męskie/żeńskie, jeśli dostępne assety na to pozwolą,
- odtwarzany przez `worldAudio.playAt()` z pozycji NPC.

Nie wprowadzać pełnego voice/dialogue systemu.

### 4. Assety

**Assetów nie wyszukuje ani nie pobiera agent.**

Brakujące pliki audio są dodawane ręcznie przez użytkownika do repozytorium.

Agent:

- korzysta wyłącznie z assetów obecnych w repozytorium,
- nie pobiera nowych plików z internetu,
- może wskazać brakujący asset oraz oczekiwany filename,
- może zaktualizować dokumentację assetów, gdy plik został już ręcznie dodany.

Po ręcznym dodaniu plików należy uzupełnić odpowiednią dokumentację źródeł/licencji zgodnie z istniejącymi zasadami audio.

### 5. Integracja

Preferowane istniejące mechanizmy:

- `createWorldAudio()` / `WorldAudio.playAt()` dla world one-shotów,
- istniejący system `animalSounds`,
- istniejące zdarzenia/interakcje zwierząt,
- istniejący `conversation` / Social Places dla NPC.

Nie tworzyć osobnego `AnimalAudioManager`, `NpcVoiceManager` ani równoległego systemu eventów.

### 6. Weryfikacja

#### Techniczna

- testy istniejących helperów audio,
- sprawdzenie cooldownów i limitu concurrent animal sounds,
- `npm run build`,
- lint/typecheck zgodnie z `CLAUDE.md`.

#### Browser / gameplay

- kilka krów → naturalne moo bez spamowania,
- kilka owiec → baa,
- kury → częstsze, ale nadal kontrolowane clucking,
- istniejące interakcje zwierząt nadal odtwarzają właściwe dźwięki,
- NPC przy Social Place faktycznie rozmawiają → słychać friendly talk,
- brak dźwięku rozmowy, gdy nie zachodzi `conversation`,
- odległość prawidłowo tłumi dźwięk,
- audio respektuje globalny SFX volume,
- brak zauważalnego wpływu na wydajność przy większej liczbie zwierząt/NPC.

## Poza zakresem

- nowe ambientowe loop'y,
- przebudowa `createWorldAudio`,
- pełne voice acting NPC,
- synchronizacja ust z mową,
- nowe zachowania zwierząt,
- nowe systemy social behaviour,
- automatyczne wyszukiwanie lub pobieranie assetów audio.

**Zrób git commit i push do main, rebase jeżeli trzeba**
