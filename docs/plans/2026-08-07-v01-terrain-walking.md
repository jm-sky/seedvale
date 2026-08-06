# Plan: v0.1 — teren + chodzenie

**Status:** `done`  
**Created:** 2026-08-07  
**Scope:** [ROADMAP.md](../ROADMAP.md) v0.1  

## Cel

W przeglądarce: **proceduralny teren** (góry / doliny / woda jako niski poziom) + **gracz 3rd person**, który po nim chodzi. Styl: **stylized / low-poly**. Bez NPC, bez questów.

## Done when

- [x] `npm run dev` → scena Three.js
- [x] Seedowany teren (FBM) z widocznymi wzniesieniami i „wodą” (threshold wysokości)
- [x] Kamera za postacią, WASD / strzałki, postać trzyma się powierzchni terenu
- [x] Jedna mapa o skończonym rozmiarze (nie infinite streaming) — wystarczy na dolinę

## Spike’y (kolejność)

| # | Spike | Wynik |
|---|--------|--------|
| 1 | **Bootstrap** — Vite + TS + Three (WebGL2), canvas, resize, loop | ✅ |
| 2 | **Kamera 3rd person** — orbit za kapsułą, input ruchu na flat | ✅ |
| 3 | **Heightmap** — simplex/FBM + kolory (woda / piasek / trawa / skała) | ✅ |
| 4 | **Grounding** — sample height + clamp do mapy | ✅ |
| 5 | **Polish lite** — lights, fog, `?seed=`, flatShading | ✅ (wystarczy na v0.1) |

## Świadomie poza v0.1

Chunk streaming, Rapier, navmesh, trawa GPU, biomy z drzewami, osada, fauna.

## Stack (v0.1)

- Vite + TypeScript  
- `three`  
- `simplex-noise` (lub równoważne)  
- Vanilla (bez R3F)  

Fizyka: **raycast / sample height** — Rapier dopiero gdy będzie potrzebny (v0.2+).

## Szkic katalogów

```
src/
  main.ts
  app/createApp.ts
  render/createRenderer.ts
  scene/createScene.ts
  scene/createCamera.ts
  world/createLights.ts
  world/parseSeed.ts
  player/PlayerController.ts
  terrain/generateHeightmap.ts
  terrain/createTerrainMesh.ts
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
