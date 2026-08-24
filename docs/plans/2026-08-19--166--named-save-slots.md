# Plan: Named Save Slots

**Created:** 2026-08-19
**Status:** `done` ✅
**Priority:** medium · **Effort:** M
**Depends on:** none
**domain:** `persistence`
**Tags:** `[ui-input]`

## Cel

Kilka nazwanych gier w tej samej przeglądarce (2–3 w praktyce, twardy limit 8). Autosave i **Zapisz** idą do aktywnego slotu. Ekran startowy i pauza pozwalają wybrać, utworzyć i usunąć zapis. Bez eksportu plików JSON i bez bumpa `SaveData`.

## Jest

Jeden zapis IndexedDB: baza `seedvale`, store `saves`, klucz `'current'` (`src/persistence/saveDb.ts`). Pauza → Zapisz, autosave co 60 s / `visibilitychange` / `pagehide` / `beforeunload`. Boot: vanilla `createStartScreen` (Kontynuuj / Nowa gra). **Nowa gra kasuje ten jedyny zapis.** Plan 007 świadomie odłożył multi-slot.

`SaveData` v19 się nie zmienia — envelope slotu żyje obok, nie w środku.

## Flow

```text
Start
  ├── Kontynuuj (ostatni slot)
  ├── lista nazwanych zapisów → load
  └── Nowa gra → nowy slot (stare zostają)
Pause
  ├── Zapisz → nadpisz aktywny slot
  ├── Zapisz jako → nowy slot + przełącz aktywny
  ├── Wczytaj → autosave bieżącego + reload wybranego
  └── Nowa gra → autosave bieżącego, nowy seed, nowy slot
Autosave → zawsze aktywny slot
```

Wczytanie innej gry w trakcie sesji = `saveNow()` + `location.reload()` (nie `rebuildWorld` z cudzym `SaveData`).

## Persistence

- [`src/persistence/saveSlots.ts`](../../src/persistence/saveSlots.ts) — czysta logika (id, nazwy, cap, migracja `current`, wybór aktywnego).
- [`src/persistence/saveDb.ts`](../../src/persistence/saveDb.ts) — IDB: `listSaves` / `readSave` / `writeSave` / `createSave` / `renameSave` / `deleteSave` / aktywny id.
- Wartość: `{ name, data: SaveData }`. Legacy goły `SaveData` pod `'current'` migruje przy pierwszym odczycie.
- Aktywny id: localStorage `seedvale:activeSaveId:v1`; fallback: najnowszy `savedAt`.
- Nazwa: trim, 1–40 znaków, unikalna case-insensitive. Domyślna `"Gra 1"` / `"Gra 2"`…
- `clearSave()` znika. Nowa gra **nie kasuje** innych slotów.
- `writeSave` bez id → aktywny slot; brak aktywnego → `createSave` (pending name albo `"Gra N"`).

## UI

- Start: vanilla [`createStartScreen.ts`](../../src/ui/createStartScreen.ts) (Vue jeszcze nie zamontowane). Lista + Kontynuuj + Nowa gra (pole nazwy, nie `prompt`) + Usuń. Nowa gra losuje seed.
- Pauza: Vue podekran zapisów. Zapisz dopisuje nazwę slotu. `?benchmark=` / `?perf=1` pomijają menu.

## Poza zakresem

Eksport/import JSON, chmura, sloty 1/2/3 zamiast nazw, wczytywanie bez reloadu, migracja ekranu startowego na Vue.

## Weryfikacja

- `npx tsc --noEmit` · `pnpm run lint:fix` · `pnpm run build` · `pnpm run test`
- Testy jednostkowe: `saveSlots.test.ts` (migracja `current`, unikalne nazwy, cap 8, aktywny id / fallback)
- Browser: lista na starcie, Zapisz / Zapisz jako / Wczytaj / Nowa gra nie kasuje innych slotów

## Implementation summary

Zaimplementowane 2026-08-19. `SaveData` bez v20 — envelope `{ name, data }` w IndexedDB. Legacy `'current'` migruje przy pierwszym `listSaves`/`readSave`. Pauza: Zapisz / Zapisz jako / Wczytaj (reload) / Nowa gra. Start: lista slotów. `clearSave()` usunięte.

Techniczna weryfikacja: `tsc --noEmit`, `lint:fix`, `build` (`vue-tsc` + vite), `test` (1169). Browser verified 2026-08-19.
