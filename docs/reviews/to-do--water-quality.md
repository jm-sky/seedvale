# Review TODO: jakość wody (stylized)

**Status:** `todo`  
**Created:** 2026-08-07  
**Assignee:** Claude (osobna sesja)  
**Typ:** deep analysis / design spike → potem plan implementacji  

## Kontekst

Seedvale ma stylized wodę w `src/world/createWater.ts`:
- pełna płaszczyzna + FBM heightmap jako maska (`DataTexture` / discard na lądzie)
- proste fale w vertex shaderze + fresnel w fragmencie
- po fixie: mniej migania na lądzie, ale **wizualnie nadal nie „perfekcyjnie”**

Powiązane: v0.1 teren, polish sky, [research 3d-portfolio](../research/2026-08-07-3d-portfolio-library-audit.md) (Sky/Water z examples).

## Pytanie dla Claude

Jak poprawić wygląd i zachowanie wody pod **stylized / low-poly** Seedvale (nie fotoreal Ocean), przy obecnym stacku (Three WebGL2, bez WebGPU na start)?

## Zakres analizy

1. **Artefakty:** brzeg jeziora (schody heightmapy), z-fight, przezroczystość vs `depthWrite`, foam edge
2. **Opcje techniczne:**  
   - ulepszony shader (shore foam z gradiencie maski, soft edge)  
   - `three/addons/objects/Water.js` (czy pasuje do low-poly?)  
   - osobne mesh jezior (flood-fill basenów) zamiast jednej globalnej płaszczyzny  
   - refraction / screen-space (koszt vs efekt)
3. **Integracja z dniem/nocą** — kolor/opacity wody vs `dayNight`
4. **Rekomendacja:** 1–2 ścieżki (quick win vs „docelowa”), effort, ryzyka
5. **Out of scope na ten review:** chunk streaming wody (osobny plan)

## Wejścia (pliki)

- `src/world/createWater.ts`
- `src/terrain/generateHeightmap.ts` (waterLevel flatten)
- `src/world/dayNight.ts`
- Screenshoty użytkownika (jeśli dołączone w sesji)

## Oczekiwany output

Review file `YYYY-MM-DD-water-quality.md` ze statusem `done` / `verification needed`, Findings + konkretne next steps → issues/plan.
