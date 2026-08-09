# Plan: Vue.js + Tailwind + ikony jako stack dla UI gry (dialogi/menu)

**Status:** `in progress` — **Faza 0 (setup + proof-of-concept) done 2026-08-10**, zielone na `tsc`/`vue-tsc`/`lint`/`build`/`test`. Ten sam dzień: **pierwszy realny ekran wylądował poza kolejnością Faz** — [plan 048 (NPC dialogues v2)](./2026-08-09--048--npc-dialogues-v2.md)'s `NpcDialogueMenu.vue` (net-new, nie migracja istniejącego ekranu, więc nie wymagał Fazy 1/2) zastąpił `createNpcDialog.ts` dla NPC. **Faza 1 (Villagers) done 2026-08-09** — `src/ui-vue/screens/VillagersScreen.vue` zastępuje `src/ui/createVillagersScreen.ts` (usunięty), fasada w `src/ui-vue/store.ts` (`openVillagers/closeVillagers/refreshVillagers/isVillagersOpen`) + `mount.ts`'s generyczny `FORWARDED_FNS` forwarder; generyczny `ui.openStack`/`useOverlayScreen` z Fazy 2 zbudowany teraz (Escape-priority dla asynchronicznie montowanych ekranów, jeden globalny listener w `App.vue`) zamiast per-ekran `isSuppressed` — `createPauseMenu.ts`'s callback zostaje jako jest, do zastąpienia gdy pause menu też się migruje. Zielone na `tsc`/`vue-tsc`/`lint`/`test`/`build`; brak jeszcze wizualnej weryfikacji w przeglądarce. Faza 2/3 nieruszone.
**Created:** 2026-08-09
**Priority:** ustalone z użytkownikiem 2026-08-10 — odblokowuje [plan 048 (NPC dialogues v2)](./2026-08-09--048--npc-dialogues-v2.md), którego nowe menu rozmowy ma być budowane w Vue

## Kontekst

Dzisiejsze UI gry (poza `lil-gui` debug panelem) to **13 modułów vanilla DOM** w `src/ui/` (1856 linii TS) budujących ekrany przez `innerHTML`/`createElement`, plus **~1050-liniowy `<style>` blok w `index.html`** ze wszystkimi klasami `.seedvale-*`. Wzorzec jest spójny (patrz [plan 005](./2026-08-07--005--game-ui-screens.md) „Kierunek techniczny"): `root.hidden` toggle, custom Esc-priority przez `stopImmediatePropagation` + kolejność rejestracji listenerów, click-outside-close, ręczny `enableTouchScroll`.

To działa, ale rośnie kosztem:
- [issue 006](../issues/2026-08-08--006--villagers-list-virtualization.md) — ekran Mieszkańcy renderuje całą listę naraz przez `innerHTML`, potrzebuje paginacji/virtual scroll zanim multi-settlements realnie namnoży NPC.
- [issue 005](../issues/2026-08-08--005--mobile-touch-ui-icon-library.md) — guziki dotykowe używają gołego tekstu/emoji zamiast ikon.
- Plan 005 ma jeszcze dwa niezaczęte ekrany (World config, Notes/journal) — każdy kolejny to więcej ręcznego DOM-templating i CSS w jednym, coraz większym pliku `index.html`.

**Ważne — to jest świadome odwrócenie wcześniejszej decyzji.** Plan 005, sekcja „Poza zakresem na razie", wprost wykluczał „React/Vue shell tylko dla UI". Ten plan istnieje, bo użytkownik teraz explicite tego chce — nie jest to przeoczenie poprzedniej decyzji, tylko jej rewizja.

**Silnik gry (Three.js scene, terrain workers, AI, fauna, input) zostaje w 100% vanilla TS — bez zmian.** Zakres tego planu to wyłącznie warstwa DOM-overlay nad canvasem (dialogi/menu/HUD-i), nie architektura gry.

## Decyzja: stack

Ustalone z użytkownikiem (patrz też przemyślenie niżej „czemu nie Vuetify"):

| Warstwa | Wybór | Czemu |
|---------|-------|-------|
| Framework UI | **Vue 3** (`<script setup>`, Composition API) + `@vitejs/plugin-vue` | Jedyny wymagany przez użytkownika framework |
| Styling | **Tailwind CSS v4** przez `@tailwindcss/vite` | CSS-first config (`@theme` w jednym pliku CSS zamiast `tailwind.config.js`), zero-runtime, zgodne z globalną preferencją użytkownika (`~/.claude/CLAUDE.md`) |
| Ikony | **`lucide-vue-next`** (SVG, tree-shakeable, per-ikona import) | Dokładnie to, co issue 005 już proponowało; renderuje się jako `<svg>` component, żadnego web-fonta/ikonowego sprite'a do ładowania |
| **Nie**: Vuetify (component framework) | — | Pełny Vuetify to Material Design (własny reset, `v-app`, theming provider) — koliduje wizualnie z istniejącym ciemnym/fantasy stylem gry (`.seedvale-pause__panel`, `.seedvale-quest-log__panel`, …) i wymagałby albo przepisania Vuetify theme pod grę, albo nadpisywania jego CSS w drugą stronę. Zamiast tego własne komponenty Tailwindem, dopasowane do istniejącego looku — zgodne też z globalną preferencją (`shadcn`-style: lekkie, nieopinionowane komponenty, nie ciężki framework). |

### Nowe zależności (`package.json`)

```
dependencies:
  vue                 ^3.5
  lucide-vue-next      latest

devDependencies:
  @vitejs/plugin-vue   latest
  @tailwindcss/vite    ^4
  tailwindcss          ^4
  eslint-plugin-vue     latest   # lint dla .vue
  vue-eslint-parser      latest
  vue-tsc               latest   # type-check .vue w `npm run build`
```

## Architektura integracji (hybryda, nie przepisanie)

**Zasada: Vue nie zastępuje `createApp.ts` ani pętli gry — mountuje się jako jeden dodatkowy overlay obok istniejącego `container` (canvas + `labelRenderer`), dokładnie tam, gdzie dziś mountują się `createPauseMenu`/`createQuestLog`/itd.**

```
container (div, dziś: canvas + labelRenderer.domElement + N× vanilla overlay div)
├── <canvas> (Three.js renderer)
├── labelRenderer.domElement (CSS2D — etykiety NPC/zwierząt/itemów)
├── #vue-ui (nowy, jeden mount point)
│     └── Vue app root: position:absolute; inset:0; pointer-events:none
│         └── <PauseMenu v-if="ui.pause.open" /> pointer-events:auto na panelu
│         └── <VillagersScreen v-if="ui.villagers.open" />
│         └── ... (kolejne ekrany, w miarę migracji)
└── (jeszcze niezmigrowane vanilla overlaye: HUD, minimap, toast, quick actions, ...)
```

- **Jeden `createApp(RootUi).mount('#vue-ui')`**, wołany raz w `src/app/createApp.ts` (tam gdzie dziś tworzone są pozostałe ekrany), analogicznie do dzisiejszego wzorca „stwórz raz, `dispose()` tylko na unmount całej apki".
- Root Vue ma `pointer-events: none`, żeby scena 3D pod spodem łapała klik/mouselook gdy żaden dialog nie jest otwarty — dokładnie ta sama sztuczka co dziś (`root.hidden` + panel wewnątrz łapie kliki, tło nie).
- **Stan UI = jeden mały reactive store**, nie Pinia. Skala apki (kilkanaście ekranów, brak nested routingu) nie uzasadnia dodatkowej zależności — `reactive()`/`ref()` singletony w `src/ui-vue/store.ts` wystarczą i są łatwe do wymiany na Pinia później, jeśli złożoność urośnie.
- **Fasada zachowuje dzisiejszy kontrakt.** Każdy zmigrowany ekran dalej eksportuje `createXScreen(container, handlers): { isOpen, open, close, toggle, refresh, dispose }` — `createApp.ts`'owa pętla `tick()` (dziś ok. linii 379-471, warunki typu `!menuPaused && !npcDialog.isOpen() && ...`) **nie musi się zmieniać w trakcie migracji**. Wewnątrz fasada tylko przełącza `ui.villagers.open = true/false` w store zamiast `root.hidden`. To pozwala migrować ekran-po-ekranie bez jednorazowego dużego refaktora `createApp.ts`.

### Esc-priority — okazja do poprawki, nie tylko port

Dzisiejszy mechanizm „tylko najbardziej wewnętrzny overlay łapie Esc" opiera się na **kolejności rejestracji `addEventListener('keydown', ...)`** — kruche (nowy ekran musi pamiętać, żeby zarejestrować się przed `createPauseMenu`). W Vue naturalnie zastąpić to **jawnym stosem otwartych overlayów** w store (`ui.openStack: string[]`) + **jednym** globalnym keydown handlerem, który zamyka tylko `ui.openStack.at(-1)`. To usuwa całą klasę bugów „zapomniałem kolejności rejestracji" — flagowane w Fazie 2 jako świadome ulepszenie, nie 1:1 port.

## Tailwind — współistnienie ze starym CSS

- Tailwind v4 dołączony przez `@tailwindcss/vite`, jeden plik `src/ui-vue/tailwind.css` z `@import "tailwindcss"` + `@theme { ... }` — tu przenieść **tokeny** (kolory paneli, radiusy, fonty) już powtarzające się w `index.html` (`.seedvale-pause__panel`, `.seedvale-quest-log__panel`, `.seedvale-villagers__panel` mają ten sam dark/translucent look) tak, żeby nowe komponenty Vue nie zgadywały kolorów na nowo.
- **Stary `<style>` blok w `index.html` zostaje nietknięty** dla ekranów jeszcze niezmigrowanych — brak big-bang CSS rewrite. Migrowany ekran = jego stare klasy `.seedvale-x__*` można usunąć z `index.html` dopiero gdy Vue-wersja zastąpi go w `createApp.ts`.
- Tailwind `preflight` (CSS reset) może kolidować z globalnym resetem już w `index.html` (`* { margin:0; padding:0; box-sizing:border-box }`) — zweryfikować po Fazie 0, że nie ma podwójnego efektu (raczej nieszkodliwe, oba resetują to samo, ale sprawdzić wizualnie).

## PWA — co się nie zmienia, na co uważać

Dzisiejsze „PWA" to **wyłącznie metadata instalowalności**: `manifest.href` (`public/icons/site.webmanifest`), `apple-mobile-web-app-*` meta tagi, `viewport-fit=cover`. **Nie ma dziś service workera ani offline cache** (brak `vite-plugin-pwa`/workbox w zależnościach) — więc nie ma nic do „migracji" po tej stronie, ale nowy stack nie może tego regresować:
- `index.html` `<head>` (manifest link, ikony, viewport, theme-color) zostaje bez zmian.
- Nowy JS (Vue + Tailwind runtime) **code-splitting**: mountować `#vue-ui` przez dynamiczny `import()` **po** starcie sceny (canvas + pierwszy chunk terenu), nie blokować first-paint gry dodatkowym frameworkiem — ekrany (pause/villagers/quest log) i tak nie są potrzebne w pierwszej sekundzie.
- Jeśli w przyszłości dojdzie realny service worker (osobna inicjatywa, **poza zakresem tego planu**) — Vue chunk musi być poprawnie cache'owany przez Workbox `globPatterns`, ale to temat na wtedy.

## Fazy

### Faza 0 — Setup i proof-of-concept — `done` (2026-08-10)

1. [x] Zależności dodane przez `pnpm add` (projekt deklaruje `pnpm` w `package.json`'s `packageManager`, użyty zamiast `npm` żeby `pnpm-lock.yaml` został aktualny): `vue`, `lucide-vue-next` (dependencies); `@vitejs/plugin-vue`, `@tailwindcss/vite`, `tailwindcss`, `eslint-plugin-vue`, `vue-eslint-parser`, `vue-tsc` (devDependencies). `lucide-vue-next@1.0.0` zainstalował się z ostrzeżeniem `deprecated — please use @lucide/vue instead` — pakiet nadal działa, ale przy realnym użyciu ikon (Faza 1+) warto zweryfikować, czy `@lucide/vue` nie jest już lepszym wyborem (nie zmienione teraz, żeby nie odbiegać od decyzji ustalonej z użytkownikiem bez pytania).
2. [x] `vite.config.ts`: `vue()` + `tailwindcss()` dodane do `plugins: [...]` — zero tarcia z `defineConfig` z `vitest/config` (worker `format:'es'` już tam był, plugin-model kompatybilny bez zmian).
3. [x] `tsconfig.json`: `"include"` rozszerzony o `"src/**/*.vue"`. `src/vite-env.d.ts` dostał `declare module '*.vue'` (ambient shim z `DefineComponent`) — dzięki niemu **zwykły `tsc --noEmit` też przechodzi czysto** (deklaruje typ dla importu `.vue`, nie wchodzi w środek SFC), a `vue-tsc --noEmit` dodatkowo realnie type-checkuje zawartość `.vue`. `npm run build` zmienione na `vue-tsc --noEmit && vite build` (zdecydowano: zamiast równoległego kroku — `vue-tsc` jest nadzbiorem `tsc`, jeden call wystarcza).
4. [x] `eslint.config.js`: `eslint-plugin-vue`'s `flat/recommended` dodany po `tseslint.configs.recommended`, plus override `files: ['**/*.vue']` ustawiający `languageOptions.parserOptions.parser: tseslint.parser` (żeby `<script setup lang="ts">` lintował się jak reszta repo, nie przez espree). `npm run lint` teraz obejmuje `.vue`.
5. [x] Proof-of-concept: `src/ui-vue/mount.ts` (`mountVueUi(container): { dispose() }`) tworzy `#vue-ui` div i **dynamicznie** (`import()`) ładuje `vue`/`App.vue`/`tailwind.css` — osobny chunk w buildzie (`vue.runtime.esm-bundler-*.js`, `runtime-core.esm-bundler-*.js`, `App-*.js`, `tailwind-*.css`, potwierdzone w `dist/`), nie blokuje first-paint. Wpięty w `createApp.ts` zaraz po `labelRenderer` (dispose dopisany do istniejącej listy w zwracanym `dispose()`, symetrycznie z resztą overlayów, mimo że dziś nic zewnętrznego tego dispose nie wywołuje — `main.ts` robi `void createApp(...)`). `src/ui-vue/App.vue` — trywialny root: `pointer-events-none fixed inset-0`, mały tekstowy tag w rogu (Tailwind klasy, potwierdza że stylowanie faktycznie działa).
   - `npx tsc --noEmit`, `npx vue-tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test` — wszystkie zielone.
   - `curl` dev servera (Vite) potwierdza że `/src/ui-vue/App.vue`, `mount.ts`, `tailwind.css` serwują się bez błędu (200) i że strona/`main.ts` nadal się ładują — **wizualne potwierdzenie w przeglądarce (czy tag faktycznie widać w rogu, czy canvas dalej łapie mouselook) zostaje do zrobienia przez użytkownika**, zgodnie z zasadą projektu.
6. [x] Gotowe do commita.

### Faza 1 — Ekran Mieszkańcy (`createVillagersScreen`) → Vue, rozwiązuje issue 006 — `done` (2026-08-09)

- Przepisać `src/ui/createVillagersScreen.ts` na Vue SFC (`src/ui-vue/screens/VillagersScreen.vue`) za fasadą zachowującą dzisiejszy `VillagersScreen` interface (`isOpen/open/close/toggle/refresh/dispose`) — `createApp.ts` się nie zmienia poza importem.
- **Realna paginacja** (issue 006, opcja „najmniej kodu, spójne z resztą UI" — filtr all/active/complete w quest logu to już jest precedens UI-wzorca): N wpisów na stronę + prev/next, reaktywnie po `lastEntries`. Virtual scroll zostaje jako eskalacja *tylko* jeśli paginacja okaże się niewystarczająca po realnym wzroście liczby NPC (multi-settlements) — nie budować z góry cięższego rozwiązania niż potrzeba teraz.
- Ikony `lucide-vue-next` zamiast unicode/emoji tam, gdzie dziś są (`♂`/`♀` gender, `🌾`/`🐟`/`🍄`/`🥕` food source) — nie wymagane przez issue 006, ale naturalny przyrost skoro i tak przepisujemy ten ekran i lucide jest już wpięte z Fazy 0.
- Zamknąć issue 006 (i częściowo issue 005, dla tego ekranu) po weryfikacji w przeglądarce.

### Faza 2 — Pause menu + Quest log + NPC dialog

- Te trzy dzielą najwięcej wspólnego zachowania (Esc-priority, click-outside, touch-scroll) — dobry moment na wydzielenie `useOverlayScreen` composable (`src/ui-vue/composables/useOverlayScreen.ts`): otwarty stan + rejestracja w `ui.openStack` (patrz „Esc-priority" wyżej) + click-outside-close, żeby nowe ekrany w Fazie 3+ dostawały to za darmo zamiast kopiować boilerplate.
- Wyższe ryzyko niż Faza 1: `createPauseMenu` jest najbardziej wpięty w `createApp.ts` (toggluje debug GUI, zatrzymuje tick świata, pointer lock) — migrować ostrożnie, jeden ekran na commit, weryfikować `tsc`/`lint`/`build` + ręczny test w przeglądarce po każdym.

### Faza 3 — Inventory screen, Quick actions, Time skip overlay

- Pozostałe modalne/overlay ekrany, ten sam wzorzec co Faza 2, niższe ryzyko (mniej wpięte w rdzeń pętli gry niż pause menu).

### Faza 4 — HUD / Minimap / Toast / przyciski dotykowe (do oceny, nie z góry przesądzone)

Te są **hot-path**: HUD aktualizuje się co klatkę/co sekundę (czas, exp), minimap przerysowuje się często, toast ma własną kolejkę. Reaktywność Vue prawdopodobnie sobie poradzi (Vue jest szybki na tej skali), ale **nie migrować automatycznie** — ocenić przy implementacji, czy zysk (spójność, mniej ręcznego DOM-mutation) przebija ryzyko regresji w hot-path kodzie, który dziś działa dobrze.

**Issue 005 (ikony na przyciskach dotykowych) nie wymaga czekania na tę fazę** — `lucide-vue-next` jest dostępne od Fazy 0, ale same przyciski (`src/input/createTouchControls.ts`) są dziś vanilla i renderowane bardzo prosto; można wstrzyknąć gotowe SVG stringi z lucide (lucide ma też pakiet czystych SVG, nie tylko komponenty Vue) bez czekania na pełną migrację tego modułu do Vue. Do decyzji przy implementacji: rozdzielić „dostań ikony" od „przepisz na Vue".

### Faza 5 — poza tym planem, ale naturalne miejsce na nowe ekrany

`World config screen` i `Notes/journal` z [planu 005](./2026-08-07--005--game-ui-screens.md) (dziś: `open`, projekt gotowy, zero kodu) — skoro to jeszcze niezaczęte ekrany, warto budować je **od razu w Vue** po Fazie 0/1, zamiast pisać je vanilla i migrować później. To osobna praca (inny plan), tu tylko odnotowane jako oczywista kolejność.

## Poza zakresem

- Przepisanie silnika gry (Three.js scene, `src/terrain/`, `src/ai/`, `src/fauna/`, `src/world/`, `src/settlement/`) na Vue/reactive — zostaje 100% vanilla TS.
- Vuetify, Pinia, vue-router — patrz uzasadnienie wyżej; brak potrzeby routingu (single page/overlay model).
- Realny service worker / offline cache (`vite-plugin-pwa`) — dzisiejsze „PWA" to tylko instalowalność, dodanie SW to osobna inicjatywa jeśli będzie potrzebna.
- `lil-gui` debug panel — narzędzie deweloperskie (`?gui=1`), nie player-facing UI, zostaje jak jest.
- Testy jednostkowe dla komponentów Vue (Vue Test Utils) — projekt dziś świadomie nie testuje THREE/DOM (`vitest` tylko czysta logika w `src/ai/`, `src/shared/`, `src/fauna/HealthState.ts`); nowe `.vue` ekrany idą do tej samej kategorii „weryfikacja w przeglądarce", nie do `vitest`.
- Redesign wizualny — nowe komponenty mają wyglądać jak dzisiejsze `.seedvale-*` panele (ciemne, półprzezroczyste), nie wprowadzać nowego stylu przy okazji frameworka.

## Ryzyka / otwarte pytania (do rozstrzygnięcia przy implementacji)

1. **`vite.config.ts` używa `defineConfig` z `vitest/config`, nie z `vite`** — sprawdzić, czy `@vitejs/plugin-vue`/`@tailwindcss/vite` plugins działają bez tarcia w tym setupie (worker `format: 'es'` już tam jest, więc plugin-model powinien być kompatybilny, ale zweryfikować przy Fazie 0).
2. **`npm run build` dziś = `tsc && vite build`** — dodanie `.vue` wymaga `vue-tsc` do type-checku SFC; zdecydować czy zastąpić `tsc` przez `vue-tsc`, czy uruchamiać oba (wolniejszy build, ale mniej ryzyka regresji istniejącego type-checku plików `.ts`).
3. **Esc-priority redesign (Faza 2)** dotyka `createApp.ts` (~500 linii orchestration) — największy pojedynczy punkt ryzyka w całym planie, robić na osobnym commicie z jawnym testem wszystkich overlayów (pause + villagers + quest log + npc dialog otwierane/zamykane w różnej kolejności).
4. **Touch/mobile regresje** — `enableTouchScroll`, `isTouchDevice()`, `pointer-events` (fix z [issue 004](../issues/2026-08-08--004--mobile-modals-untappable-pointer-events.md)) muszą być odtworzone w Vue-wersjach; to obszar, gdzie już raz był bug, więc wymaga jawnego ręcznego testu na urządzeniu dotykowym/emulacji po każdej migracji ekranu.
5. **Kolejność merge z równoległą pracą** — plan 005 (World config/Notes), issue 006, issue 005 wszystkie dotykają tych samych plików (`createApp.ts`, `index.html`) — jeśli coś z nich ruszy równolegle z tym planem, skoordynować kolejność żeby uniknąć konfliktów.

## Weryfikacja (każda faza)

Zgodnie z zasadami projektu (`CLAUDE.md`): `npx tsc --noEmit` (lub `vue-tsc --noEmit` po Fazie 0), `npm run lint`, `npm run build` po każdej fazie — **nie uruchamiać headless Chrome/Playwright**; po każdej fazie poprosić użytkownika o ręczny test na `localhost:5577` z konkretnymi krokami (co otworzyć, co kliknąć, na jakim viewport — desktop i touch/mobile osobno, bo to obszar z historią regresji).

## Referencje

- [issue 005 — ikony dla przycisków dotykowych](../issues/2026-08-08--005--mobile-touch-ui-icon-library.md)
- [issue 006 — paginacja/virtual scroll dla listy mieszkańców](../issues/2026-08-08--006--villagers-list-virtualization.md)
- [plan 005 — UI warstwa gry (wzorzec overlay, Esc-priority, World config/Notes projekt)](./2026-08-07--005--game-ui-screens.md)
- [plan 023 — mobile touch controls](./2026-08-07--023--mobile-touch-controls.md)
