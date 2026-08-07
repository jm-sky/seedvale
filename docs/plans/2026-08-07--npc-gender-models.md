# Plan: Modele NPC zsynchronizowane z płcią imienia

**Status:** `planned`  
**Created:** 2026-08-07  
**Scope:** Rozszerzenie systemu [npc-interactions.md](./2026-08-07--npc-interactions.md)

## Problem

NPC otrzymują imiona z puli `['Anna', 'Piotr', 'Kasia', 'Marek', 'Ola', 'Tomek', 'Zofia', 'Jacek']` (deterministycznie na podstawie indeksu), ale modele 3D są przypisywane **niezależnie** od płci imienia:

- Obecne modele: `Farmer`, `Worker`, `Casual_2`, `Casual_Hoodie` — wszystkie postacie **męskie** (Quaternius Modular Men)
- Brak modeli żeńskich → Kasia, Ola, Zofia, Anna (imiona żeńskie) wyglądają jak mężczyzni

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

- [ ] Quaternius żeńskie modele są w `public/models/characters/Female_*.glb`
- [ ] `NPC_GENDERS` lub mapowanie płci działa w `NpcAgent`
- [ ] `NPC_MODEL_URLS` jest rozszerzone na `{ male: [...], female: [...] }`
- [ ] `NpcAgent.create()` wybiera model na podstawie płci imienia
- [ ] Wizualnie: co najmniej 4+ NPC widoczne, mix płci (mężczyźni i kobiety)
- [ ] Console clean: `npx tsc --noEmit`, `npm run lint`, `npm run build`

## Następnie

- Opcjonalnie: rozszerzyć charakteryzację (imię + cechy backstory) — osobny plan (wspomniane w `npc-interactions.md` i `npc-labels.md` poza v1)
