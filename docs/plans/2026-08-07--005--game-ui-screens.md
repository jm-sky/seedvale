# Plan: UI warstwa gry (ekrany / dialogi / modale)

**Status:** `done` (4/4 — patrz „Postęp” niżej). Wszystkie cztery ekrany istnieją; ostatnie dwa (World config, Notes/journal) domknięte 2026-08-10 razem z plan 052, jako Vue (nie vanilla DOM, jak ten plan pierwotnie zakładał) — patrz reconciliation note niżej i [plan 046](./2026-08-09--046--vue-tailwind-ui-stack.md).  
**Created:** 2026-08-07  
**Updated:** 2026-08-10  
**Priority:** było „później (po v0.2 gameplay)” — zrobione przy okazji sesji porządkującej zaległe plany  

**Reconciliation 2026-08-10:** sekcja „Kierunek techniczny” niżej opisuje **oryginalne** podejście (vanilla DOM overlay, `root.hidden`, ręczny Esc-priority przez kolejność `addEventListener`) — to był stan rzeczy do 2026-08-09. [Plan 046](./2026-08-09--046--vue-tailwind-ui-stack.md) świadomie odwrócił tę decyzję (jej własny nagłówek wprost to nazywa: „to jest świadome odwrócenie wcześniejszej decyzji [tego planu]”) i od tamtej pory **cały nowy/migrowany UI (w tym World config i Notes poniżej) idzie przez Vue 3 + Tailwind v4** (`src/ui-vue/`), nie przez ten wzorzec. `src/ui/create*.ts` pliki wymienione niżej (`createPauseMenu.ts`, `createQuestLog.ts`, `createNpcDialog.ts`) dziś są cienkimi fasadami nad `src/ui-vue/mount.ts`, nie samodzielną implementacją — sekcja „Kierunek techniczny” jest zachowana jako historia decyzji, nie jako aktualna instrukcja. Traktuj [plan 046](./2026-08-09--046--vue-tailwind-ui-stack.md) jako wiążący dla przyszłego UI, nie tę sekcję.

## Postęp

- [x] **Pause / menu** — pierwotnie `src/ui/createPauseMenu.ts` (vanilla), od plan 046 Faza 2 przepisany na `src/ui-vue/screens/PauseMenu.vue` (+ `PauseMenuEntriesMain/Actions/Settings.vue`); `createPauseMenu.ts` dziś jest fasadą. Esc toggluje overlay, zatrzymuje tick świata (dayNight/player/settlement/fauna/water) i pointer lock; przycisk „Toggle debug panel” pokazuje/ukrywa lil-gui (`createDebugGui` zwraca `toggle()`).
- [x] **Character panel** — sekcja w pause menu ustawień (input `Name`). `config.player.name` w `worldConfig.ts` (default „Ja”), persist w `persistConfig.ts`. `PlayerController.setName()` aktualizuje etykietę 3D na żywo (`input`); zapis do localStorage na `change`/blur (`onNameCommit`).
- [x] **NPC dialog** — flavor-text dialog dziś `src/ui-vue/screens/FlavorDialog.vue` (prompt „[E] …” + panel imię/linia + accept/decline offer dla questów), `createNpcDialog.ts` to fasada. Poszło dalej niż ten plan pierwotnie zakładał: obok tego doszły **Quest log** (`src/ui-vue/screens/QuestLogScreen.vue`, klawisz `L`, filtr all/active/complete, exp, relation per NPC), **Villagers screen** (`src/ui-vue/screens/VillagersScreen.vue`, przycisk w pause menu, lista `Settlement.npcs` z HP/traits/personality, paginacja) i **NPC dialogue menu v2** (`src/ui-vue/NpcDialogueMenu.vue`, plan 048 — wielotematyczne menu rozmowy, osobny ekran od flavor-dialogu) — żadne z nich nie było w oryginalnym zakresie tego planu. Patrz [npc-interactions.md](./2026-08-07--011--npc-interactions.md) i [npc-character-depth.md](./2026-08-07--022--npc-character-depth.md).
- [x] **World config screen** (2026-08-10) — `src/ui-vue/screens/WorldConfigScreen.vue`, otwierany z pause menu → Ustawienia → „Świat”. Patrz sekcja „World config screen” niżej dla implementation notes.
- [x] **Notes / journal** (2026-08-10) — `src/ui-vue/screens/NotesScreen.vue`, otwierany z pause menu → Ustawienia → „Notatki”. Patrz sekcja „Notes / journal” niżej.

## Potrzeba

Obok debug panelu (`lil-gui`) przyda się **UI jak w grach**: pełnoekranowe / półekranowe warstwy do konfiguracji świata, notatek, questów, pauzy — nie tylko suwaki deweloperskie.

## Zakres (szkic)

| Ekran / modal | Cel | Stan |
|---------------|-----|------|
| **Pause / menu** | Esc → resume, settings, seed | `done` |
| **NPC dialog** | Proste okna rozmowy | `done` (poszło dalej: + Quest log + Villagers) |
| **World config** | Przyjazna wersja parametrów terenu (resolution, seed, …) bez lil-gui | `done` (2026-08-10) — patrz implementation notes niżej |
| **Notes / journal** | Notatki o osadzie/faunie/questach (lore + tips) | `done` (2026-08-10) — patrz implementation notes niżej |
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

### Implementation notes (2026-08-10)

Zbudowane w Vue (nie vanilla DOM, jak reszta tego projektu zakładała — patrz reconciliation note na górze pliku), zgodnie z [planem 046](./2026-08-09--046--vue-tailwind-ui-stack.md)'s Faza 5 wskazówką „World config i Notes ... warto budować od razu w Vue".

- `src/ui-vue/screens/WorldConfigScreen.vue` — pola: Seed (number input + przycisk „Zastosuj” z `window.confirm(...)`, ten sam wzorzec co pause menu's „New Game”), Flat shading (checkbox, aplikuje się natychmiast po zmianie — bez confirm, tak jak dziś w debug GUI), Dzień/noc: `enabled`/`timeMultiplier`/`dayLengthSec` (bez `timeOfDay` — zgodnie ze specyfikacją wyżej). Dokładnie ten sam zbiór pól, co zaplanowano.
- **Zero duplikacji stanu, zgodnie z wymogiem wyżej.** `src/ui-vue/store.ts`'s `ui.worldConfigScreen.config`/`dayNight` to te same obiekty `WorldConfig`/`DayNightState`, które `createApp.ts` przekazuje też do `createDebugGui` — przypisane raz przez `configureWorldConfigScreen(config, dayNight, handlers)` (wołane obok `createDebugGui(...)` w `createApp.ts`), nie kopiowane. Vue's `reactive()` owija je leniwie przy pierwszym odczycie; `v-model` pisze przez proxy prosto do tego samego obiektu, który czyta `rebuildWorldBundle`/`gameLoop`/HUD.
- **Seed = pełny rebuild, potwierdzony.** Przycisk „Zastosuj” woła dokładnie ten sam handler co debug GUI's `onTerrainChange` (`() => { void rebuildWorld() }`, wydzielony do wspólnego `const onTerrainChange` w `createApp.ts` zamiast duplikowany) — jedna implementacja, nie druga ścieżka do tego samego efektu. Flat shading toggle woła ten sam handler natychmiast (`onFinishChange`-odpowiednik), bez confirm — plan explicite prosił o „Zastosuj + potwierdzenie" tylko dla seedu, nie dla flat shading.
- **Persystencja bez nowego kodu.** `rebuildWorld()` już woła `saveWorldConfig(config)` wewnętrznie (`syncSeedInUrl`/`saveWorldConfig` na początku funkcji) — nie trzeba dopisywać osobnego zapisu przy „Zastosuj", to by było duplikacją. `dayNight` pola nigdy nie były persystowane (tak jak w debug GUI) — bez zmian.
- **Brak osobnej fasady `src/ui/createWorldConfigScreen.ts`.** Zamiast tego wzorca zastosowano precedens `VillagersScreen`/`NpcDialogueMenu` (ekrany net-new do Vue, bez legacy vanilla-DOM kontraktu do zachowania) — `createApp.ts` woła `vueUi.configureWorldConfigScreen(...)` bezpośrednio, otwieranie idzie przez `PauseMenuEntriesSettings.vue`'s lokalną funkcję wołającą `openWorldConfigScreen()` (store) wprost, bez pośredniej `ui.pauseMenu.onWorldConfig` warstwy — nie było potrzeby, bo otwarcie nie wymaga żadnych danych z `bundle`, w przeciwieństwie do `openVillagers` (który dociąga `bundle.settlementsManager.getLoaded()`).
- **Gating.** Dopisane do `modalState.ts`'s `ActiveModal` (`'worldConfig'`), `gameLoop.ts`'s modal switch + world-tick-gate warunek, i do `createTouchControls`'s `onPauseToggle`/`onQuickActions` guardów w `createApp.ts` (żeby ☰/⚡ nie otwierały drugiego overlaya na wierzchu) — te same miejsca co dla `villagers`.

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

### Implementation notes (2026-08-10)

- `src/ui-vue/screens/NotesScreen.vue` — statyczna lista `NoteEntry[]` (dokładnie struktura ze szkicu wyżej), otwierany z pause menu → Ustawienia → „Notatki", bez własnego hotkeya, jak zaplanowano. Otwieranie **nie** idzie przez `PauseMenuHandlers.onNotes` (ten plan pierwotnie tak zakładał, pisany pod vanilla-DOM wzorzec) — `PauseMenuEntriesSettings.vue` woła store'ową `openNotes()` bezpośrednio, ten sam powód co przy World config wyżej (brak potrzeby danych z `createApp.ts`).
- **Treść — 3 wpisy skrócone z `docs/VISION.md`** (nie sekcje 1-3 dosłownie — VISION.md miało w międzyczasie inną numerację/treść niż zakładał ten plan; użyto realnych aktualnych sekcji, tematycznie najbliższych temu, co ten plan opisywał): §1 „What Seedvale is" → „Seedvale", §2 „The central idea" → „Zasiej ziarno. Patrz, jak świat rośnie.", §5 „The experience we want" → „Twoja historia w większej historii świata". Świadomie pominięto §3/§4 (AI-system/player's role — bardziej techniczne/meta, mniej „lore" w sensie, o który chodziło temu planowi).
- **+1 wpis „Sterowanie"** (poza szkicem NOTES tablicy, osobna stała `CONTROLS`) — skrót klawiszy zebrany w jednym miejscu (WASD/strzałki, Shift bieg, E/L/I/G/Q, Esc), desktop i touch-variant, tak jak plan sugerował („te same hinty co w HUD/pause menu, w jednym miejscu").
- **Nie** czerpie z `QuestManager` — brak duplikacji z Quest logiem, zgodnie z wymogiem wyżej.
- Read-only, bez edytowalności — zgodnie z v1 scope.
- Gating identyczne jak World config screen (patrz notatka tam) — `modalState.ts`, `gameLoop.ts`, `createTouchControls` guardy.

## Poza zakresem na razie

- Pełny inventory / RPG UI
- ~~React/Vue shell tylko dla UI~~ — nieaktualne, patrz reconciliation note na górze pliku: [plan 046](./2026-08-09--046--vue-tailwind-ui-stack.md) świadomie odwrócił tę decyzję 2026-08-09.
- `region`/`fbm`/`roadNetwork` w World config screen (zostają lil-gui-only, patrz wyżej) — nadal aktualne, niezmienione w implementacji.
- Dynamiczny journal/log zdarzeń (Notes zostaje statyczny lore w v1) — nadal aktualne.

## Trigger

Wziąć na warsztat po **v0.2** (osada widoczna) albo gdy debug GUI przestanie wystarczać do dema portfolio. Pause menu/NPC dialog/quest log/villagers już to spełniają — World config i Notes to dopięcie reszty pod ten sam wzorzec, nie nowy kierunek.

## Weryfikacja

Zielone na `tsc`/`vue-tsc`/`lint`/`build`/`test` (2026-08-10). **Nie zweryfikowane wizualnie w przeglądarce** — zgodnie z `CLAUDE.md`, wymaga ręcznego testu użytkownika. Konkretne kroki dla World config + Notes:

1. Pause menu → Ustawienia → „Świat" — sprawdź że pole Seed pokazuje aktualny seed, zmień wartość i kliknij „Zastosuj" → potwierdź w oknie dialogowym → świat powinien się przebudować (loading), pozycja gracza i ekwipunek zachowane.
2. Tam samo, „Low-poly (flat shading)" checkbox → przebudowa terenu natychmiast po zmianie, bez potwierdzenia.
3. „Cykl dnia/nocy włączony" checkbox, suwaki „Szybkość" i „Długość dnia" → zmiany widoczne na żywo (HUD-owy zegar, oświetlenie) bez przebudowy terenu.
4. Pause menu → Ustawienia → „Notatki" — sprawdź że 4 wpisy się wyświetlają (3 lore + Sterowanie), tekst czytelny, scroll działa przy małym viewporcie.
5. Esc zamyka oba ekrany; kliknięcie w tło też. `☰`/`Q` (touch) nie otwierają pause menu/quick actions, gdy jeden z tych ekranów jest otwarty.
6. Świat/gra nie tickuje (NPC/fauna/day-night) podczas gdy World config lub Notes są otwarte (jak Villagers) — z wyjątkiem samego day/night podczas edycji jego pól w World config, gdzie zmiana powinna być widoczna natychmiast mimo że reszta symulacji stoi.
7. Brak błędów w konsoli.
