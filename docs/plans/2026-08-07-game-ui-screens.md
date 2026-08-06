# Plan: UI warstwa gry (ekrany / dialogi / modale)

**Status:** `planned`  
**Created:** 2026-08-07  
**Priority:** później (po v0.2 gameplay) — lil-gui zostaje na debug  

## Potrzeba

Obok debug panelu (`lil-gui`) przyda się **UI jak w grach**: pełnoekranowe / półekranowe warstwy do konfiguracji świata, notatek, questów, pauzy — nie tylko suwaki deweloperskie.

## Zakres (szkic)

| Ekran / modal | Cel |
|---------------|-----|
| **Pause / menu** | Esc → resume, settings, seed |
| **World config** | Przyjazna wersja parametrów terenu (resolution, seed, …) bez lil-gui |
| **Notes / journal** | Notatki o osadzie, fauna, questach (lore + debug tips) |
| **NPC / quest dialog** | Proste okna rozmowy (v0.4+) |
| **HUD** | Minimal: seed, wskazówka „kliknij = look”, potrzeby NPC, **godzina / pora dnia** (→ [day-night-clock](./2026-08-07-day-night-clock.md)) |

## Kierunek techniczny (do decyzji przy starcie)

- HTML/CSS overlay nad canvasem (Vanilla) — wystarczy na start  
- Albo lekki UI kit później  
- lil-gui: zostaje jako `?gui=1` debug; produkcyjny look = własne ekrany  

## Poza zakresem na razie

- Pełny inventory / RPG UI  
- React/Vue shell tylko dla UI  

## Trigger

Wziąć na warsztat po **v0.2** (osada widoczna) albo gdy debug GUI przestanie wystarczać do dema portfolio.
