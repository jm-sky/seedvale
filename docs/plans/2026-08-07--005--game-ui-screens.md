# Plan: UI warstwa gry (ekrany / dialogi / modale)

**Status:** `in progress`  
**Created:** 2026-08-07  
**Updated:** 2026-08-08  
**Priority:** później (po v0.2 gameplay) — lil-gui zostaje na debug  

## Postęp

- [x] **Pause / menu** — `src/ui/createPauseMenu.ts`, wpięty w `src/app/createApp.ts`. Esc toggluje overlay, zatrzymuje tick świata (dayNight/player/settlement/fauna/water) i pointer lock; przycisk „Toggle debug panel” pokazuje/ukrywa lil-gui (`createDebugGui` zwraca teraz `toggle()`).
- [x] **Character panel** — sekcja w pause menu (input `Name`). `config.player.name` w `worldConfig.ts` (default „Ja”), persist w `persistConfig.ts`. `PlayerController.setName()` aktualizuje etykietę 3D na żywo (`input`); zapis do localStorage na `change`/blur (`onNameCommit`).
- [x] **NPC dialog** — `src/ui/createNpcDialog.ts` (prompt „[E] …” + panel imię/linia + accept/decline offer dla questów), wpięty w `createApp.ts`. Poszło dalej niż ten plan pierwotnie zakładał: obok tego doszły **Quest log** (`src/ui/createQuestLog.ts`, klawisz `L`, filtr all/active/complete, exp, relation per NPC) i **Villagers screen** (`src/ui/createVillagersScreen.ts`, przycisk w pause menu, lista `Settlement.npcs` z HP/traits/personality) — oba nie były w oryginalnym zakresie tego planu, ale są tym samym „ekran/modal” wzorcem (`root.hidden` toggle, własny CSS, Esc swallow przez `stopImmediatePropagation` zarejestrowany przed pause menu, click-outside-close, `dispose()`). Patrz [npc-interactions.md](./2026-08-07--011--npc-interactions.md) i [npc-character-depth.md](./2026-08-07--022--npc-character-depth.md).
- [ ] World config screen, Notes/journal, rozszerzony HUD — patrz zakres niżej; sekcja „World config screen” i „Notes / journal” poniżej mają teraz konkretny projekt gotowy do implementacji (2026-08-08 review), oparty wprost na tym samym wzorcu co `createQuestLog.ts`/`createVillagersScreen.ts`.

## Potrzeba

Obok debug panelu (`lil-gui`) przyda się **UI jak w grach**: pełnoekranowe / półekranowe warstwy do konfiguracji świata, notatek, questów, pauzy — nie tylko suwaki deweloperskie.

## Zakres (szkic)

| Ekran / modal | Cel | Stan |
|---------------|-----|------|
| **Pause / menu** | Esc → resume, settings, seed | `done` |
| **NPC dialog** | Proste okna rozmowy | `done` (poszło dalej: + Quest log + Villagers) |
| **World config** | Przyjazna wersja parametrów terenu (resolution, seed, …) bez lil-gui | `open` — projekt niżej |
| **Notes / journal** | Notatki o osadzie/faunie/questach (lore + tips) | `open` — projekt niżej |
| **HUD** | Minimal: seed, wskazówka „kliknij = look”, **godzina / pora dnia** | `done` w praktyce — `createHud.ts` ma time/phase/seed/exp/inventory/hint; „potrzeby NPC” zrealizowane inaczej niż jako HUD-owy agregat: per-NPC etykieta 3D (need + kolor markera) + `createVillagersScreen.ts` (lista wszystkich NPC z potrzebą/HP) |

## Kierunek techniczny

Rozstrzygnięte przez to, co już działa (nie do decyzji na nowo): **HTML/CSS overlay nad canvasem (Vanilla)**, jeden spójny wzorzec dla każdego ekranu — patrz `src/ui/createQuestLog.ts` / `createVillagersScreen.ts` jako referencja:

- `root.hidden` toggle zamiast mount/unmount — panel tworzony raz w `createApp.ts`, `dispose()` tylko na unmount całej apki.
- Escape zamyka **tylko** najbardziej wewnętrzny otwarty overlay: nowy panel musi się rejestrować (kolejność `addEventListener('keydown', ...)` w `createApp.ts`) **przed** `createPauseMenu`, i w swoim handlerze wołać `event.stopImmediatePropagation()` gdy jest otwarty — inaczej Escape zamknie panel *i* otworzy pause menu w tej samej klatce (ten sam trik co `createNpcDialog`/`createQuestLog`/`createVillagersScreen`).
- Klik w tło (`event.target === root`) zamyka — jedyny sposób zamknięcia na dotyku, gdzie nie ma Escape.
- Otwierany z przycisku w pause menu (jak `data-quest-log`/`data-villagers`), **nie** z nowego binda w `Keyboard.ts` — `KEY_MAP` tam dziś ma tylko ruch + `KeyE`/`KeyL`/`KeyG`, i `villagersScreen` już pokazuje, że „tylko przycisk w menu, bez hotkeya” jest zaakceptowanym wzorcem (nie każdy overlay musi mieć własny klawisz).
- W pętli `tick()` (`createApp.ts`, dziś ok. linii 379-471) dopisać nową gałąź `else if (nowyEkran.isOpen()) { ... }` do istniejącego łańcucha (`menuPaused` → `npcDialog` → `questLog` → `villagersScreen` → world tick) — konsumuje edge-triggered klawisze (`consumeInteract`/`consumeQuestLog`/`consumeDrop`) i `setHighlight(null)`, żeby gaze/interakcja nie działały pod overlayem. Dopisać też do warunku na końcu (`!menuPaused && !npcDialog.isOpen() && !questLog.isOpen() && !villagersScreen.isOpen()`, linia ok. 471) tak, żeby świat (dayNight/NPC/fauna) też się zatrzymywał pod nowym overlayem — spójnie z resztą.
- lil-gui: zostaje jako `?gui=1` debug; produkcyjny look = własne ekrany.

## World config screen — projekt (2026-08-08, gotowy do implementacji)

Cel: przyjazna, in-game wersja **podzbioru** `WorldConfig` (`src/config/worldConfig.ts`) — nie całego drzewa (region/fbm/road-network to wciąż debug-only, zbyt techniczne dla „ekranu gry”), tylko tego, co gracz realnie chce dotknąć: seed (regeneracja świata), day/night (`dayNight.timeMultiplier`/`dayLengthSec`/`enabled`), ewentualnie `flatShading`. Wzorowany 1:1 na tym, co `createDebugGui.ts` już robi z tymi samymi polami — ten sam mutate-in-place + handler callback, inny (DOM zamiast lil-gui) frontend.

- **Nie duplikować stanu.** `createDebugGui(config, dayNight, handlers)` (`src/ui/createDebugGui.ts`) już mutuje `config`/`dayNight` in-place i woła `handlers.onTerrainChange`/`onDayNightChange` — nowy ekran powinien mutować te **same** obiekty (przekazane z `createApp.ts`, tam gdzie dziś trafiają do `createDebugGui`) i wołać te same handlery, nie trzymać własną kopię configu, która mogłaby się rozjechać z lil-gui/localStorage.
- **Seed = pełny rebuild, nie live-tweak.** `onTerrainChange` w `createApp.ts` (`gui = createDebugGui(...)`, ok. linii 296-303) woła `rebuildWorld()` — kosztowne (regeneruje chunki). UI powinien to komunikować (np. przycisk „Zastosuj” + potwierdzenie, nie live-update na każde naciśnięcie klawisza w polu seed), inaczej niż day/night (`onDayNightChange`), które jest tanie i może być live.
- Persystencja: `saveWorldConfig(config)` (już importowane w `createApp.ts`) po każdej commitowanej zmianie — ten sam wzorzec co `onNameCommit` w pause menu (`config.player.name = name; saveWorldConfig(config)`).
- Otwierany z przycisku w pause menu (nowy `data-world-config` obok `data-villagers`), `PauseMenuHandlers.onWorldConfig` (nowe pole, wzorzec `onVillagers`).
- **Nie pokazywać `region`/`fbm`/`roadNetwork` w v1** — to są dziesiątki pól tunowanych wizualnie w lil-gui (patrz `baseConfig()` w `worldConfig.ts`), nieprzyjazne bez podglądu na żywo; zostają debug-only. Jeśli kiedyś mają wylądować tutaj, to osobna iteracja, nie część v1.

## Notes / journal — projekt (2026-08-08, gotowy do implementacji)

Zawężony do **statycznej, read-only treści** w v1 — nie dynamicznego dziennika zdarzeń (to wymagałoby nowej infrastruktury logowania eventów, poza zakresem). Ten sam DOM-overlay wzorzec co wyżej, lista sekcji zamiast listy NPC/questów:

```ts
// src/ui/createNotesScreen.ts (nowy) — szkic struktury danych, treść do doprecyzowania
type NoteEntry = { title: string; body: string }
const NOTES: readonly NoteEntry[] = [
  { title: 'Seedvale', body: '…skrót z docs/VISION.md sekcja 1-3, 2-3 zdania…' },
  { title: 'Sterowanie', body: '…te same hinty co w HUD/pause menu, w jednym miejscu…' },
  // kolejne sekcje (fauna, questy) dopisywane bez zmian w kodzie — tylko nowy wpis w tablicy
]
```

- Treść źródłowa: [`docs/VISION.md`](../VISION.md) sekcje 1-3 („Czym jest Seedvale”, „Idea przewodnia”, „Jakie doświadczenie ma dostarczyć”) — już napisane, wystarczy skrócić pod UI zamiast pisać lore od zera.
- **Nie** czerpać z `QuestManager`/`quests.ts` w v1 — quest lore już ma dedykowany ekran (`createQuestLog.ts`); duplikowanie tej samej treści w dwóch miejscach to koszt bez wartości. Notes to *world lore*, quest log to *aktywne zadania*.
- Ten sam wzorzec otwierania jak World config: przycisk w pause menu (`data-notes`), `PauseMenuHandlers.onNotes`, żadnego nowego hotkeya.
- Edytowalność (dopisywanie notatek przez gracza) — poza zakresem v1, jak w oryginalnym szkicu tego planu nie było tego jasno rozstrzygnięte; teraz jawnie: read-only, jak `createVillagersScreen.ts`.

## Poza zakresem na razie

- Pełny inventory / RPG UI
- React/Vue shell tylko dla UI
- `region`/`fbm`/`roadNetwork` w World config screen (zostają lil-gui-only, patrz wyżej)
- Dynamiczny journal/log zdarzeń (Notes zostaje statyczny lore w v1)

## Trigger

Wziąć na warsztat po **v0.2** (osada widoczna) albo gdy debug GUI przestanie wystarczać do dema portfolio. Pause menu/NPC dialog/quest log/villagers już to spełniają — World config i Notes to dopięcie reszty pod ten sam wzorzec, nie nowy kierunek.
