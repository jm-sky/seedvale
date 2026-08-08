# Roadmap

**Status:** `planned`
**Created:** 2026-08-06
**Updated:** 2026-08-08 (audyt statusów wszystkich planów, patrz [plans/README.md](./plans/README.md))

## Produkt (PR — szkic)

**Vibe:** życie wioski w proceduralnym krajobrazie (sandbox / demo / nauka + portfolio).
**Nie:** MMO, multiplayer, pełny survival.

| | Decyzja |
|---|--------|
| Nazwa | **Seedvale** |
| Cel | Nauka, portfolio, bajer |
| Gracz | 3rd person — obserwacja **i** udział |
| Świat | Losowy obszar: góry, doliny, woda + las (klastry) + wiele osad |
| AI v1 | Osady z potrzebami (drewno / woda / jedzenie) + fauna chase/flee + role/traits/Big Five/HP |
| Questy | Relay quest v1 + multi-stage v2 zaimplementowane; generator (opcjonalnie LLM / OpenRouter) nadal później |
| Świat | Docelowo **duży, ideałnie sferyczny** (unika hard edge / nieskończoności) — progresywna generacja obszarów przy zbliżaniu do krawędzi. Dziś: flat chunk grid ze streamingiem i ringiem, nie sfera — patrz [plans/world-streaming-persistence](./plans/2026-08-07--007--world-streaming-persistence.md) |
| Styl art | **stylized / low-poly** default (Quaternius, [research](./research/2026-08-07-3d-asset-sources.md)); teren: smooth shading default. Prawdziwe tekstury (triplanar) — dopuszczone jako **opcjonalny feature/toggle** później, nie trzymamy się low-poly na sztywno |
| Stack | WebGL2, Vanilla Three + Vite + TS |

Research: [2026-08-06-threejs-terrain-ai-tech-research.md](./research/2026-08-06-threejs-terrain-ai-tech-research.md)

## Wersje

| Wersja | Zakres | Status |
|--------|--------|--------|
| **v0.1** | Teren heightmap + chodzenie 3rd person + mysz | `done` |
| **v0.2** | Osada + 3–5 NPC (woda / drewno / jedzenie) + etykiety + spawn | `done` |
| **v0.3** | Fauna predators & prey (chase/flee) + GLB art | `done` |
| **v0.3 art** | Swap fauny na GLB z `public/models/fauna/` (wolf/fox/deer/stag) | `done` |
| **v0.4** | Questy: relay quest v1 (quest log/exp/relacje) + v2 (multi-stage + interakcje ze światem + itemy) | `verification needed` → [015](./plans/2026-08-07--015--quests-v1.md), [018](./plans/2026-08-07--018--quests-v2-world-interactions.md) |
| **v0.4** | NPC character depth: role/traits/Big Five/HP + ekran „Mieszkańcy” | `done` → [022](./plans/2026-08-07--022--npc-character-depth.md) |
| **v0.5** | Wiele wiosek: generator + streaming + rodziny (SM/MD/LG, husband/wife/child) + drogi/ścieżki + biomy | `verification needed` → [025](./plans/2026-08-07--025--multi-settlements.md), [031](./plans/2026-08-08--031--village-generation.md), [026](./plans/2026-08-07--026--roads-and-paths.md), [028](./plans/2026-08-07--028--biome-regions.md) |
| **duży świat** | Chunk streaming (load/unload radius, worker gen, duże regiony/oceany/góry) + save/persystencja (IndexedDB) | `done` → [plans/2026-08-07--007--world-streaming-persistence.md](./plans/2026-08-07--007--world-streaming-persistence.md) |
| **później** | Wizualny overhaul: rośliny (krzewy) + niebo done; chmury + góry w tle nadal open | `in progress` → [plans/2026-08-07--024--world-visual-overhaul.md](./plans/2026-08-07--024--world-visual-overhaul.md) |
| **później** | Game UI (ekrany/dialogi, nie tylko lil-gui) | `in progress` — pause menu + character panel + quest log + villagers screen done, World config/Notes `planned` → [plans/2026-08-07--005--game-ui-screens.md](./plans/2026-08-07--005--game-ui-screens.md) |
| **polish** | Dzień/noc + HUD + time multiplier | `done` |
| **polish** | Naturalne elementy świata (dekoracje + zbieralne: gałęzie/grzyby/kwiaty/szyszki) | `verification needed` → [plans/2026-08-07--030--world-elements-interactions.md](./plans/2026-08-07--030--world-elements-interactions.md) |
| **polish** | Ambient audio (dzień/noc gotowe; sampler obszaru ocean/las/góry `planned`) | `in progress` → [plans/2026-08-07--016--ambient-world-audio.md](./plans/2026-08-07--016--ambient-world-audio.md) |

Pełny, zawsze aktualny indeks wszystkich planów ze statusami: [plans/README.md](./plans/README.md).

## Poza zakresem v0.1–v0.3

- Multiplayer / netcode
- WebGPU-first
- Pełny RPG / inventory / combat deep

**Uwaga:** "Infinite / streaming world" był tu wcześniej jako poza zakresem — to się zmieniło (duży/sferyczny świat to teraz kierunek produktu, patrz tabela wyżej i [plans/2026-08-07--007--world-streaming-persistence.md](./plans/2026-08-07--007--world-streaming-persistence.md)). Chunk streaming (flat grid) już `done`; cube-sphere/pełna sfera nadal architektonicznie nierozstrzygnięte, patrz sekcja niżej.

## Wspomniane w planach, jeszcze niezaimplementowane

Zebrane z sekcji „Poza zakresem"/„Odłożone"/„Następnie" istniejących planów — realne kolejki pracy, nie tylko pomysły. Pogrupowane tematycznie; w nawiasie plan źródłowy.

### Świat / render

- **Chmury** i **góry w tle** — części 2-3 wizualnego overhaulu, projekt gotowy, kod jeszcze nie napisany ([024](./plans/2026-08-07--024--world-visual-overhaul.md))
- **Ambient audio: sampler obszaru** (ocean/las/góry) + runtime mixer — fundament i warstwa dzień/noc już działają, ale sampler i mixer mają gotowy projekt techniczny (2026-08-08 review) i zero kodu ([016](./plans/2026-08-07--016--ambient-world-audio.md))
- **Cube-sphere / pełny sferyczny świat** — nadal nierozstrzygnięte pytanie architektoniczne, obecny streaming to flat chunk grid z ringiem, nie sfera ([007](./plans/2026-08-07--007--world-streaming-persistence.md))
- **Biomy: savanna/tundra** (poza pustynią/bagnem/lasem), biome-linked fauna/ambient audio, `findSettlementSite` świadomy biomu — świadomie odłożone ([028](./plans/2026-08-07--028--biome-regions.md))
- Environment-density GUI knobs, GLB modele zamiast prymitywów dla dekoracji (głazy/pnie/ogniska), interakcja z ogniskiem — odłożone ([030](./plans/2026-08-07--030--world-elements-interactions.md))

### NPC / postacie

- **NPC Daily Routine**: `Schedule Template` per rola, `workplace: Place` per rola (wymaga nowego world contentu — farma/posterunek/stoisko), generyczny FSM `goTo(location) → execute(action)`, typy `Place` `food`/`social` — cały ten zakres zależy od tego, aż `role` zacznie mieć realne zachowanie ([020](./plans/2026-08-07--020--npc-2-daily-routine-and-place.md))
- **Animal Life v1**: hunger/thirst/energy → wander bias na `AnimalAgent` — projekt techniczny gotowy (2026-08-08), zero kodu napisane; memory/territory/population w save odłożone dalej ([021](./plans/2026-08-07--021--npc-3-animal-life.md))
- **Pełny model imion** (`firstName`/`lastName`/`nickname`, `displayName()`, dialogowe prośby o imię) — zaimplementowano tylko mniejszy zakres (kulturowe pule imion per wioska, `nameCultures.ts`) ([027](./plans/2026-08-07--027--npc-names.md))
- **Persystencja stanu NPC** (HP, quest progress) w save — `SaveData` dziś nie zapisuje stanu NPC, startuje od `maxHp`/domyślnych `needs` po Continue ([022](./plans/2026-08-07--022--npc-character-depth.md))
- Klikalne wiersze w ekranie „Mieszkańcy" (ping na minimapie / teleport kamery) — nice-to-have ([022](./plans/2026-08-07--022--npc-character-depth.md))
- Fauna→NPC combat (NPC przestaje być immunny) — wiring na istniejącym `takeDamage()`, świadomie nie zrobione ([022](./plans/2026-08-07--022--npc-character-depth.md))

### Wioski / świat społeczny

- **Questy międzywioskowe** i **dystrybucja zasobów per wioska** (fauna/item spawnery nadal zakotwiczone tylko o wioskę domową) — poza zakresem v1 ([025](./plans/2026-08-07--025--multi-settlements.md))
- Więcej rodzajów `MinorLocation`, podróże NPC między wioskami, mosty na drogach — odłożone ([026](./plans/2026-08-07--026--roads-and-paths.md))
- Model/skala dziecka, potrzeby/dialog świadome rodziny, wzrost/migracja wiosek w czasie — odłożone ([031](./plans/2026-08-08--031--village-generation.md))

### UI

- **World config screen** i **Notes/journal screen** — projekt gotowy (2026-08-08 review), pause menu/character panel/quest log/villagers screen już gotowe ([005](./plans/2026-08-07--005--game-ui-screens.md))

## Następne kroki (dla nowej sesji)

Priorytet sugerowany, do potwierdzenia z użytkownikiem — większość z tego wymaga tylko wizualnej weryfikacji w przeglądarce (kod już zaimplementowany, `verification needed`), reszta to nowa implementacja.

1. [ ] Wizualna weryfikacja w przeglądarce zaległych `verification needed`: [015](./plans/2026-08-07--015--quests-v1.md)/[018](./plans/2026-08-07--018--quests-v2-world-interactions.md) (questy), [017](./plans/2026-08-07--017--gaze-highlight-labels.md) (gaze highlight), [020](./plans/2026-08-07--020--npc-2-daily-routine-and-place.md) (Place/home), [025](./plans/2026-08-07--025--multi-settlements.md)/[031](./plans/2026-08-08--031--village-generation.md) (wioski/rodziny), [026](./plans/2026-08-07--026--roads-and-paths.md) (drogi), [028](./plans/2026-08-07--028--biome-regions.md) (biomy), [030](./plans/2026-08-07--030--world-elements-interactions.md) (elementy świata), [027](./plans/2026-08-07--027--npc-names.md) (kulturowe imiona)
2. [ ] Dokończyć wizualny overhaul: chmury + góry w tle → [024](./plans/2026-08-07--024--world-visual-overhaul.md)
3. [ ] Ambient audio: sampler obszaru + mixer (projekt gotowy) → [016](./plans/2026-08-07--016--ambient-world-audio.md)
4. [ ] Animal Life v1 (hunger/thirst/energy, projekt gotowy) → [021](./plans/2026-08-07--021--npc-3-animal-life.md)
5. [ ] Game UI: World config / Notes screen → [005](./plans/2026-08-07--005--game-ui-screens.md)
6. [ ] Persystencja stanu NPC (HP/quest progress) w save, gdy będzie realna potrzeba → [022](./plans/2026-08-07--022--npc-character-depth.md)
7. [ ] Questy międzywioskowe + dystrybucja zasobów per wioska → [025](./plans/2026-08-07--025--multi-settlements.md)
8. [ ] Cube-sphere / pełny sferyczny świat — decyzja architektoniczna nadal otwarta → [007](./plans/2026-08-07--007--world-streaming-persistence.md)

Historia poprzednich sesji / szczegółowy handoff: [CLAUDE.md](../CLAUDE.md).
