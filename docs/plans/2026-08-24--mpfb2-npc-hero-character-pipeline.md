# Plan: MPFB2 NPC / Hero Character Pipeline

**Created:** 2026-08-24  
**Status:** `planned` 📋  
**Priority:** high · **Effort:** L  
**Depends on:** none  
**Domain:** `npc`

> **Draft** — roadmap na wysokim poziomie. Szczegóły implementacyjne zostaną uzupełnione przed rozpoczęciem właściwej realizacji planu.

## Cel

Przygotowanie spójnego pipeline'u modeli **Hero i NPC dla Seedvale** opartego na MPFB2, Blenderze, Mixamo i GLB, z możliwością późniejszej automatyzacji przez Blender MCP.

Główna zasada:

**modularne assety + parametry postaci → wiele spójnych wariantów NPC zamiast osobnych modeli.**

## Roadmap

### 01 — Workflow & tooling

- skrypty pomocnicze Blender / MPFB2
- skanowanie zainstalowanych assetów
- diagnostyka modeli, ubrań, włosów i rigów
- dostępne komendy / API
- Blender MCP
- Seedvale-specific Blender helpers

### 02 — Hero POC

Jeden kompletny male hero:

- ~35 lat
- ~178 cm
- average build
- realistyczna twarz
- włosy + zarost
- prosty medieval outfit
- Mixamo rig / animacje
- LOD0 / LOD1 / LOD2
- GLB
- test w Three.js

**Cel:** potwierdzenie całego pipeline'u end-to-end.

### 03 — Modular character pipeline

- body / face
- hair
- beard / moustache
- headwear
- clothing
- equipment
- materiały i kolory
- parametry body / face
- wspólny skeleton
- LOD

### 04 — Profession outfits

Docelowe warianty dla:

- villager
- farmer
- hunter
- woodcutter
- blacksmith
- merchant
- guard
- warrior

Profesja powinna wpływać na outfit i charakterystyczne equipment.

### 05 — Female characters

- female base
- female face variants
- female hairstyles
- female clothing
- ta sama modularna architektura

### 06 — Seedvale NPC generation

- Seedvale character definitions
- appearance parameters
- deterministic randomization
- appearance seed
- asset selection
- profession → outfit / equipment
- generowanie spójnych wariantów NPC

### 07 — MCP automation

- Seedvale Blender helpers
- generowanie postaci
- konfiguracja MPFB2
- hair / beard / clothing / equipment
- walidacja
- optymalizacja
- LOD generation
- GLB export
- batch generation

## Docelowy pipeline

`Seedvale NPC definition`

→ `appearance parameters`

→ `Blender MCP`

→ `Seedvale Blender helpers`

→ `MPFB2`

→ `character + clothing + equipment`

→ `rig / animations`

→ `optimization`

→ `LOD0 / LOD1 / LOD2`

→ `GLB`

→ `Three.js / Seedvale`

## Asset Reference

Potrzebne assety MPFB2 są utrzymywane osobno w:

`docs/plans/references/mpfb2-npc-hero-assets-v1.json`

Plan nie zakłada osobnych modeli dla każdego NPC — różnorodność ma wynikać z modularnych assetów, parametrów MPFB2, materiałów/kolorów oraz deterministycznego wyboru wariantów.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
