# Plan: Modele NPC zsynchronizowane z płcią imienia

**Status:** `done`  
**Created:** 2026-08-07  
**Scope:** Rozszerzenie systemu [npc-interactions.md](./2026-08-07--npc-interactions.md)

## Problem

NPC otrzymują imiona z puli `['Anna', 'Piotr', 'Kasia', 'Marek', 'Ola', 'Tomek', 'Zofia', 'Jacek']` (deterministycznie na podstawie indeksu), ale modele 3D są przypisywane **niezależnie** od płci imienia:

- Obecne modele: `Farmer`, `Worker`, `Casual_2`, `Casual_Hoodie` — wszystkie postacie **męskie** (Quaternius Modular Men)
- Brak modeli żeńskich → Kasia, Ola, Zofia, Anna (imiona żeńskie) wyglądają jak mężczyzni

**Poza zakresem tego planu:** dźwięki reakcji NPC (męski/żeński `Hmm`/`Tak?` przy `lookAtPlayer`) — wydzielone do osobnego planu, [npc-reaction-sounds.md](./2026-08-07--npc-reaction-sounds.md), bo to niezależny kawałek pracy (audio, nie modele).

## Rozwiązanie

1. **Pobierz modele żeńskie** z Quaternius Modular Women (analogiczny zestaw postaci)
2. **Mapa płci imienia** — tabela `imię → płeć` (można też pattern-match lub explicite mapować)
3. **Mapowanie model ← płeć** — rozszerzyć `NPC_MODEL_URLS` żeby miał zarówno męskie jak i żeńskie
4. **Logika przypisania** — zmienić `NpcAgent.create()`, żeby wybrał model na podstawie płci, nie tylko indeksu

## Zakres

1. **Dane**: `src/ai/NpcAgent.ts`
   - Dodaj `NPC_GENDERS: Record<NPC_NAME, 'male' | 'female'>` lub infer z `NPC_NAMES`
   - Rozszerz `NPC_MODEL_URLS` na strukturę `{ male: [...], female: [...] }`

2. **Assets**: `public/models/characters/`
   - Pobierz/konwertuj GLB modele żeńskie z Quaternius (analogicznie do istniejących)
   - Przykład: `Female_Farmer.glb`, `Female_Worker.glb`, `Female_Casual_Hoodie.glb`, `Female_Casual_2.glb`

3. **Logika**: `src/ai/NpcAgent.ts::create()`
   - Ustal płeć na podstawie imienia
   - Wybierz pool modeli (male/female)
   - Zwykle losuj z poolu (lub deterministycznie, jak obecnie, żeby było powtarzalne)

4. **Testy**: brak automatycznych testów UI (patrz CLAUDE.md), ale:
   - Wizualnie: kilka NPC powinna zawierać mix postaci mężczyzn i kobiet
   - Na każdy NPC kliknąć plik GLB i sprawdzić czy istnieje

## Done when

- [x] Quaternius żeńskie modele są w `public/models/characters/Female_*.glb` (`Female_Worker`, `Female_Casual`, `Female_Medieval`, `Female_Formal` — Ultimate Modular Women pack, konwersja `.gltf`→`.glb` przez `gltf-transform copy`, zamiast dokładnych nazw z planu bo pack ma inny zestaw strojów niż męski)
- [x] `NPC_GENDERS` lub mapowanie płci działa w `NpcAgent`
- [x] `NPC_MODEL_URLS` jest rozszerzone na `{ male: [...], female: [...] }`
- [x] `NpcAgent.create()` wybiera model na podstawie płci imienia
- [x] Wizualnie: co najmniej 4+ NPC widoczne, mix płci (mężczyźni i kobiety) — potwierdzone przez użytkownika w przeglądarce (2026-08-07)
- [x] Console clean: `npx tsc --noEmit`, `npm run lint`, `npm run build`

## Uwaga: możliwe nakładanie się z character DB

`NPC_NAMES` i `NPC_PERSONALITIES` w `NpcAgent.ts` to dziś dwie osobne tablice indeksowane tym samym `treeIndex`. Jeśli [npc-character-depth.md](./2026-08-07--npc-character-depth.md) (character DB: imię+płeć+osobowość+abilities w jednym miejscu) wyląduje **przed** tym planem, punkt 2 („Mapa płci imienia”) tutaj staje się zbędny — płeć będzie już polem w tamtej strukturze. Który plan implementować pierwszy, nie ma znaczenia dla działania gry — tylko dla tego, który dokument dostaje pole `gender` jako pierwszy.

## Następnie

- Rozszerzona charakteryzacja (osobowość/abilities/energia + przeglądarka NPC) → [npc-character-depth.md](./2026-08-07--npc-character-depth.md)
- Dźwięki reakcji NPC → [npc-reaction-sounds.md](./2026-08-07--npc-reaction-sounds.md)
