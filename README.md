# Seedvale

Sandbox Three.js: proceduralny teren + AI postaci w stylized / low-poly krajobrazie.  
Cel: nauka, portfolio, demo — nie MMO ani pełny survival.

**Aktualnie:** v0.1 w toku — teren + chodzenie 3rd person (spike 1–2: flat + WASD ✅; następny: heightmap FBM).

## Wymagania

- Node.js (LTS)
- npm

## Start

```bash
npm install
npm run dev
```

Build / preview:

```bash
npm run build
npm run preview
```

Sterowanie (spike 2): WASD / strzałki — chodzenie po płaszczyźnie.

## Stack

| | |
|---|---|
| Runtime | Vite + TypeScript |
| Render | Three.js (WebGL2), vanilla (bez R3F) |
| Teren | `simplex-noise` (FBM / heightmap) |

## Roadmap (skrót)

| Wersja | Zakres | Status |
|--------|--------|--------|
| **v0.1** | Proceduralny teren + chodzenie 3rd person | `in progress` |
| **v0.2** | Osada: NPC + potrzeby (drewno / woda / jedzenie) | `todo` |
| **v0.3** | Fauna: chase / flee | `todo` |
| **v0.4+** | Proste questy → później generator | później |

Szczegóły: [docs/ROADMAP.md](docs/ROADMAP.md).

## Dokumentacja

- [docs/](docs/README.md) — hub dokumentacji
- [docs/ROADMAP.md](docs/ROADMAP.md) — produkt i wersje
- [docs/plans/2026-08-07-v01-terrain-walking.md](docs/plans/2026-08-07-v01-terrain-walking.md) — plan v0.1
- [docs/research/2026-08-06-threejs-terrain-ai-tech-research.md](docs/research/2026-08-06-threejs-terrain-ai-tech-research.md) — research tech
