# Seedvale

## Core idea

Seedvale is not a game about the player.

It is a game about a living world.

The player is not the center of the universe, but one of its inhabitants. The world exists, evolves, and creates stories independently.

The goal is not to follow a predefined storyline, but to create a place where stories naturally emerge from the interaction of systems.

---

## The main vision

> **Plant the seed. Watch the world grow.**

Seedvale starts as a small settlement in an empty world.

Over time:

- people arrive,
- relationships form,
- families grow,
- resources change,
- animals migrate,
- ecosystems evolve,
- conflicts appear,
- unexpected events happen.

The player does not write the story.

The player witnesses it.

---

## What makes Seedvale different

Many games simulate objects.

Seedvale should simulate life.

Not just:

- trees,
- resources,
- buildings,
- quests.

But:

- people,
- memories,
- relationships,
- needs,
- goals,
- fears,
- ambitions.

A villager should not feel like an NPC.

They should feel like a person living in the world.

---

## Emergent storytelling

The best stories should not come from scripted events.

They should emerge from systems.

Examples:

- A wolf population grows too large and starts hunting near the village.
- Hunters disappear, causing food shortages.
- A fisherman becomes important because the village depends on his work.
- Two families develop a conflict over resources.
- A young villager leaves to explore and returns years later.

The player should be able to say:

> "I cannot believe this happened in my world."

---

## Living simulation

The world should continue existing without the player.

When the player leaves:

- NPCs continue their daily routines.
- Animals hunt, flee, migrate, and reproduce.
- Resources are consumed and regenerated.
- The settlement changes over time.

The player returns to a world that has a history.

---

## NPC philosophy

NPCs are the heart of Seedvale.

Each character should have:

- identity,
- name,
- personality,
- abilities,
- relationships,
- memories,
- goals.

The long-term goal is that every inhabitant has their own story.

The player should remember people, not just objects.

---

## The role of AI

AI should not replace game design.

It should enhance simulation.

Use AI for:

- believable decisions,
- dynamic conversations,
- memories,
- personality expression,
- adapting behavior.

The goal is not infinite generated text.

The goal is believable life.

---

## Design principle

Avoid building a collection of features.

Build

---

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
- [docs/plans/archive/2026-08-07--001--v01-terrain-walking.md](docs/plans/archive/2026-08-07--001--v01-terrain-walking.md) — plan v0.1
- [docs/research/2026-08-06-threejs-terrain-ai-tech-research.md](docs/research/2026-08-06-threejs-terrain-ai-tech-research.md) — research tech
