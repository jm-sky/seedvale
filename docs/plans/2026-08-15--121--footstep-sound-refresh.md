---
domain: items-player
---

# Plan: lepsze dźwięki kroków (piasek nie brzmi jak podłoga)

**Created:** 2026-08-15  
**Status:** `verification needed` 🔍 — zaimplementowane, techniczna weryfikacja zielona; brak testu w przeglądarce  
**Priority:** medium · **Effort:** S  
**Depends on:** none

## Problem

Kroki gracza brzmią średnio. Najwyraźniejszy błąd: **chodzenie po piasku brzmi jak po twardej podłodze**.

Dwie przyczyny (obie w kodzie/assetach, nie w „braku dźwięku”):

1. **Złe klipy na `sand`/`stone`.** Wired zestaw to Fantozzi (`footstep-sand-01…06`, `footstep-stone-01…06`) — twarde, krótkie uderzenia, licencja niezweryfikowana. `dirt` (pustynia) pochodzi z pochodnej betonu (swuing) — też brzmi jak podłoga.
2. **Pustynia jest klasyfikowana jako `dirt`, nie `sand`.** `sampleFootstepSurface` oddaje `sand` tylko na wąskim pasie plaży (`height < waterLevel + sandBandAt`). Biome `desert > 0.4` (wizualnie piach/pył) gra klipy dirt/betonu.

## Rekomendacja (packi z `_temp/Sounds/footsteps/`)

| Pack | Werdykt | Dlaczego |
|------|---------|----------|
| **Anton Z's Footsteps Sound Pack** | **primary** — grass / sand / stone | 7 one-shotów Walk na powierzchnię, 0.2–0.8 s, wyraźny piasek (ziarno, niski peak — nie thud). Licencja itch: użytek w projekcie OK, bez odsprzedaży samych assetów. https://trade-a-chest.itch.io/footstep-sound-effects |
| **Free Footsteps Pack (Mayra)** | **alt A/B** — 1–2 klipy na powierzchnię | Piasek/trawa/żwir/śnieg brzmią OK, ale za mało wariantów (machine-gun). Commercial OK, credit opcjonalny. https://mayragandra.itch.io/free-footsteps-sound-effects |
| **BVKER-Footsteps** | **odrzucony** | To foley (zapalniczki, monety, ambient lasu, dmuchawa), nie one-shoty terenu. CC0, ale nie pod S01. |
| Bieżący Fantozzi + swuing grass/dirt | **legacy A/B** | Zostaje w `public/sounds/` jako `*-legacy-*`, nie wired. |

Droga (`road`) zostaje na Ali_6868 gravel (CC0) — Anton Z nie ma żwiru. Wood/water z Anton Z skonwertowane jako **niewire'owane** kandydaty (wnętrza / S02 wade).

## Zakres

1. Konwersja WAV → mono 48 kHz OGG Vorbis (peak-norm, bo Anton Z sand ma peak ~0.01).
2. Primary filenames: `footstep-{grass,sand,stone}-01…07.ogg`. `dirt` w packu `anton` wskazuje na te same klipy sand (brak folderu Dirt w zippie).
3. Legacy + Mayra alty w drzewie; przełącznik `?footsteps=anton\|legacy\|mayra` + lil-gui Audio, bez przebudowy świata.
4. Pustynia (`biome.desert > 0.4`) → `sand`, nie `dirt`.
5. Atrybucja w `public/sounds/README.md`; backlog S01 w `docs/assets/SOUNDS.md`.

Poza zakresem: warstwa Clothes, kroki NPC, śnieg/błoto jako osobna powierzchnia (Mayra snow zostaje alt, nie wired), wade w wodzie.

## Weryfikacja w przeglądarce (otwarte)

Dev server `:5577`. Domyślnie pack `anton`. Porównać `?footsteps=legacy` i `?footsteps=mayra` (albo lil-gui → Audio → Footstep pack).

1. **Plaża** — miękkie ziarno, nie thud podłogi.
2. **Pustynia** (cactus) — ten sam zestaw sand, nie beton.
3. **Łąka / las** — trawa/ściółka, nie kamień.
4. **Droga** — żwir jak dotychczas.
5. **Grzbiet / goła skała** — kamień Anton Z.
6. Sprint vs chód — głośniej, ten sam charakter.

Jeśli Mayra sand wygra na plaży, wystarczy przełączyć default pack (albo podmienić URL-e sand) — pliki już są.
