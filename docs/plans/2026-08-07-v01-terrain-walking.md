# Plan: v0.1 — teren + chodzenie

**Status:** `in progress`  
**Created:** 2026-08-07  
**Scope:** [ROADMAP.md](../ROADMAP.md) v0.1  

## Cel

W przeglądarce: **proceduralny teren** (góry / doliny / woda jako niski poziom) + **gracz 3rd person**, który po nim chodzi. Styl: **stylized / low-poly**. Bez NPC, bez questów.

## Done when

- [x] `npm run dev` → scena Three.js *(spike 1–2: flat + chodzenie)*
- [ ] Seedowany teren (FBM) z widocznymi wzniesieniami i „wodą” (threshold wysokości)
- [ ] Kamera za postacią, WASD / strzałki, postać trzyma się powierzchni terenu
- [ ] Jedna mapa o skończonym rozmiarze (nie infinite streaming) — wystarczy na dolinę

## Spike’y (kolejność)

| # | Spike | Wynik |
|---|--------|--------|
| 1 | **Bootstrap** — Vite + TS + Three (WebGL2), canvas, resize, loop | ✅ puste niebo + ziemia flat |
| 2 | **Kamera 3rd person** — orbit za kapsułą/kostką, input ruchu na flat | ✅ chodzenie po płaszczyźnie (WASD) |
| 3 | **Heightmap** — simplex/FBM → `PlaneGeometry` displacement (CPU), kolor po wysokości (trawa / skała / woda) | wygląda jak krajobraz |
| 4 | **Grounding** — raycast / sample height pod stopami + normal (opcjonalnie lekki slope limit) | chodzenie po górach |
| 5 | **Polish lite** — directional + ambient, fog, seed w URL (`?seed=`), prosty low-poly shading | portfolio-ready screenshot |

## Świadomie poza v0.1

Chunk streaming, Rapier, navmesh, trawa GPU, biomy z drzewami, osada, fauna.

## Stack (v0.1)

- Vite + TypeScript  
- `three`  
- `simplex-noise` (lub równoważne)  
- Vanilla (bez R3F)  

Fizyka: **raycast / sample height** — Rapier dopiero gdy będzie potrzebny (v0.2+).

## Szkic katalogów (po spike 1)

```
src/
  main.ts
  app/createApp.ts
  player/PlayerController.ts
  terrain/generateHeightmap.ts
  terrain/TerrainMesh.ts
  input/Keyboard.ts
```

## Ryzyka

| Ryzyko | Mitigacja |
|--------|-----------|
| „Woda” bez prawdziwej fizyki wygląda tanio | płaski próg + inny kolor/materiał; jezioro = poziom Y stały |
| Drift kamery na stromych zboczach | clamp pitch, snap Y do height+offset |
| Za duży mesh | start ~128² lub 256² vertex; LOD później |

## Następne po v0.1

v0.2 — osada + Utility/BT (drewno / woda / jedzenie). Osobny plan.
